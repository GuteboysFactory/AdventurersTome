const ATP_ID = "adventurers-tome";
const ATP_PROFILE = "worldProfile";
const ATP_UUID = "quickImportSourceUuid";
const ATP_TYPE = "quickImportSourceType";
const ATP_VAULT = "gmContextualPrivateVaultV2";
const ATP_LEGACY_VAULT = "gmPrivateVault";
const ATP_VERSION = 1;
const ATP_JOURNAL_GUARD = new Set();
const ATP_ACTOR_GUARD = new Set();
let atpVaultGuard = false;
let atpVaultTimer = null;
let atpRenderTimer = null;

function atpClone(v) { try { return foundry.utils.deepClone(v); } catch (_e) { return JSON.parse(JSON.stringify(v ?? null)); } }
function atpEsc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function atpParse(v, fallback) { try { return JSON.parse(String(v ?? "")) ?? fallback; } catch (_e) { return fallback; } }
function atpLeaderGM() {
  if (!game.user?.isGM) return false;
  const gms = [...(game.users?.contents ?? [])].filter(u => u.isGM && u.active).sort((a,b) => String(a.id).localeCompare(String(b.id)));
  return !gms.length || gms[0]?.id === game.user.id;
}
function atpProfile(j) { const p = j?.getFlag?.(ATP_ID, ATP_PROFILE); return p && typeof p === "object" && !Array.isArray(p) ? atpClone(p) : {}; }
function atpWorld(j) { return j?.documentName === "JournalEntry" && (String(j.getFlag?.(ATP_ID,"type")||"") === "world" || Boolean(j.getFlag?.(ATP_ID,ATP_PROFILE))); }
function atpSourceUuid(j,p=atpProfile(j)) { return String(j?.getFlag?.(ATP_ID,ATP_UUID) || p.sourceUuid || "").trim(); }
function atpSourceType(j,p=atpProfile(j)) { return String(j?.getFlag?.(ATP_ID,ATP_TYPE) || p.sourceDocumentType || "").trim(); }
function atpPermanent(j,p=atpProfile(j)) { const u=atpSourceUuid(j,p); return atpSourceType(j,p)==="Actor" || u.startsWith("Actor.") || Boolean(String(p.actorId||"").trim()); }
function atpActorByUuid(uuid) { const m=String(uuid||"").match(/^Actor\.([^\.]+)$/); return m ? game.actors?.get(m[1]) || null : null; }
function atpResolveActor(j,{allowName=true}={}) {
  const p=atpProfile(j), uuid=atpSourceUuid(j,p), type=atpSourceType(j,p);
  if (uuid && (type === "Actor" || uuid.startsWith("Actor."))) return {actor:atpActorByUuid(uuid),permanent:true};
  const id=String(p.actorId||"").trim();
  if (id) return {actor:game.actors?.get(id)||null,permanent:true};
  if (!allowName || String(p.category||"").toLowerCase() !== "npc") return {actor:null,permanent:false};
  const name=String(j?.name||"").trim().toLocaleLowerCase();
  const hits=[...(game.actors?.contents??[])].filter(a=>String(a.name||"").trim().toLocaleLowerCase()===name);
  return hits.length===1 ? {actor:hits[0],permanent:false} : {actor:null,permanent:false};
}
function atpImageMode(p,a) {
  const explicit=String(p.sourceImageMode||"").toLowerCase();
  if (["source","override"].includes(explicit)) return explicit;
  const hero=String(p.heroImage||""), img=String(a?.img||""), snap=String(p.sourceImageSnapshot||"");
  return !hero || hero===img || (snap && hero===snap) ? "source" : "override";
}
async function atpJournalUpdate(j,changes) { ATP_JOURNAL_GUARD.add(j.id); try { await j.update(changes); } finally { setTimeout(()=>ATP_JOURNAL_GUARD.delete(j.id),0); } }
async function atpActorUpdate(a,changes) { ATP_ACTOR_GUARD.add(a.id); try { await a.update(changes); } finally { setTimeout(()=>ATP_ACTOR_GUARD.delete(a.id),0); } }
async function atpNormalizeLink(j,a,{initial=false}={}) {
  if (!atpLeaderGM() || !j || !a) return false;
  const before=atpProfile(j), p=atpProfile(j), oldSnap=String(p.sourceImageSnapshot||""), hero=String(p.heroImage||""), img=String(a.img||"");
  const mode=atpImageMode(p,a), sourceManaged=mode==="source" || !hero || (oldSnap && hero===oldSnap);
  Object.assign(p,{actorId:a.id,sourceUuid:a.uuid,sourceDocumentType:"Actor",sourceNameSnapshot:String(a.name||""),sourceImageSnapshot:img,sourceImageMode:sourceManaged?"source":"override",sourceMissing:false,sourceMissingSince:null,sourceParityVersion:ATP_VERSION});
  if (sourceManaged && img && (!initial || !hero || hero===oldSnap || hero===img)) p.heroImage=img;
  const changes={};
  if (JSON.stringify(before)!==JSON.stringify(p)) changes[`flags.${ATP_ID}.${ATP_PROFILE}`]=p;
  if (String(j.getFlag?.(ATP_ID,ATP_UUID)||"")!==a.uuid) changes[`flags.${ATP_ID}.${ATP_UUID}`]=a.uuid;
  if (String(j.getFlag?.(ATP_ID,ATP_TYPE)||"")!=="Actor") changes[`flags.${ATP_ID}.${ATP_TYPE}`]="Actor";
  if (Number(j.getFlag?.(ATP_ID,"sourceParityVersion")||0)!==ATP_VERSION) changes[`flags.${ATP_ID}.sourceParityVersion`]=ATP_VERSION;
  if (j.name!==a.name) changes.name=a.name;
  if (!Object.keys(changes).length) return false;
  await atpJournalUpdate(j,changes); return true;
}
function atpLinked(a) { return [...(game.journal?.contents??[])].filter(j=>atpWorld(j) && (atpSourceUuid(j)===a.uuid || String(atpProfile(j).actorId||"")===String(a.id))); }
async function atpActorToTome(a) {
  if (!a || !atpLeaderGM() || ATP_ACTOR_GUARD.has(a.id)) return;
  for (const j of atpLinked(a)) await atpNormalizeLink(j,a);
  atpScheduleVaultSync(); atpScheduleRender();
}
async function atpMarkMissing(j,a=null) {
  if (!atpLeaderGM()) return;
  const p=atpProfile(j); if (p.sourceMissing && p.sourceMissingSince) return;
  p.sourceMissing=true; p.sourceMissingSince=Date.now(); p.sourceParityVersion=ATP_VERSION;
  if (a) { p.sourceNameSnapshot=String(a.name||p.sourceNameSnapshot||j.name||""); p.sourceImageSnapshot=String(a.img||p.sourceImageSnapshot||""); }
  await atpJournalUpdate(j,{[`flags.${ATP_ID}.${ATP_PROFILE}`]:p});
}
async function atpTomeToActor(j,changes={}) {
  if (!atpLeaderGM() || !atpWorld(j) || ATP_JOURNAL_GUARD.has(j.id)) return;
  const resolved=atpResolveActor(j,{allowName:!atpPermanent(j)}), a=resolved.actor;
  if (!a) { if (resolved.permanent) await atpMarkMissing(j); return; }
  if (Object.hasOwn(changes,"name") && String(j.name)!==String(a.name)) await atpActorUpdate(a,{name:j.name});
  const prefix=`flags.${ATP_ID}.${ATP_PROFILE}`;
  const profileTouched=Object.keys(changes||{}).some(k=>k===prefix || k.startsWith(`${prefix}.`)) || Boolean(changes?.flags?.[ATP_ID]?.[ATP_PROFILE]);
  if (profileTouched) {
    const p=atpProfile(j), hero=String(p.heroImage||""), img=String(a.img||""), desired=!hero||hero===img?"source":"override";
    if (String(p.sourceImageMode||"")!==desired) { p.sourceImageMode=desired; p.sourceImageSnapshot=img; p.sourceNameSnapshot=String(a.name||""); p.sourceParityVersion=ATP_VERSION; await atpJournalUpdate(j,{[prefix]:p}); }
  }
  await atpNormalizeLink(j,a); atpScheduleVaultSync(); atpScheduleRender();
}
async function atpMigrateLinks() {
  if (!atpLeaderGM()) return;
  let linked=0,missing=0;
  for (const j of game.journal?.contents??[]) {
    if (!atpWorld(j)) continue;
    const r=atpResolveActor(j,{allowName:!atpPermanent(j)});
    if (r.actor) { if (await atpNormalizeLink(j,r.actor,{initial:true})) linked++; }
    else if (r.permanent) { await atpMarkMissing(j); missing++; }
  }
  if (linked||missing) console.info(`Adventurer's Tome | Source Parity: ${linked} Actor link(s) normalized, ${missing} missing source(s) marked.`);
}
function atpScheduleRender() { clearTimeout(atpRenderTimer); atpRenderTimer=setTimeout(()=>{try{game.modules.get(ATP_ID)?.api?.app?.()?.render?.({parts:["main"]});}catch(_e){}},100); }

function atpVaultData() {
  if (!game.user?.isGM) return {schema:"adventurers-tome.private-vault",version:2,records:{},migration:{}};
  const p=atpParse(game.settings.get(ATP_ID,ATP_VAULT),{});
  return {schema:"adventurers-tome.private-vault",version:2,records:p?.records&&typeof p.records==="object"&&!Array.isArray(p.records)?atpClone(p.records):{},migration:p?.migration&&typeof p.migration==="object"?atpClone(p.migration):{}};
}
function atpNote(n={}) { const now=Date.now(); return {id:String(n.id||foundry.utils.randomID?.(12)||now),title:String(n.title||"GM Note").trim()||"GM Note",body:String(n.body||n.text||"").trim(),type:String(n.type||"reminder"),status:String(n.status||"open"),pinned:n.pinned===true,trigger:String(n.trigger||"").trim(),sessionTarget:Number(n.sessionTarget||0)>0?Math.floor(Number(n.sessionTarget)):null,createdAt:Number(n.createdAt||now)||now,updatedAt:Number(n.updatedAt||now)||now}; }
function atpRecord(doc,r={}) { const now=Date.now(); return {uuid:String(doc?.uuid||r.uuid||""),documentName:String(doc?.documentName||r.documentName||"Document"),documentId:String(doc?.id||r.documentId||""),nameSnapshot:String(doc?.name||r.nameSnapshot||"Untitled"),notes:Array.isArray(r.notes)?r.notes.map(atpNote):[],facts:Array.isArray(r.facts)?atpClone(r.facts):[],relations:Array.isArray(r.relations)?atpClone(r.relations):[],createdAt:Number(r.createdAt||now)||now,updatedAt:Number(r.updatedAt||now)||now}; }
function atpCanonical(doc) { if (doc?.documentName!=="JournalEntry") return doc; const r=atpResolveActor(doc,{allowName:false}); return r.actor||doc; }
function atpAliasJournal(actor) { return atpLinked(actor)[0]||null; }
function atpLegacyData(){const p=atpParse(game.settings.get(ATP_ID,ATP_LEGACY_VAULT),{});return p&&typeof p==="object"&&!Array.isArray(p)?atpClone(p):{};}
function atpLegacyKey(d){return d?.id?`${String(d.documentName||"document").toLowerCase()}:${d.id}`:"";}
function atpGetRecord(doc) {
  doc=atpCanonical(doc); const v=atpVaultData(); if(v.records[doc.uuid]) return atpRecord(doc,v.records[doc.uuid]);
  if(doc.documentName==="Actor"){const j=atpAliasJournal(doc); if(j&&v.records[j.uuid]) return atpRecord(doc,v.records[j.uuid]);}
  return atpRecord(doc,atpLegacyData()[atpLegacyKey(doc)]||{});
}
async function atpSetVault(v){atpVaultGuard=true;try{await game.settings.set(ATP_ID,ATP_VAULT,JSON.stringify(v));}finally{setTimeout(()=>atpVaultGuard=false,0);}}
async function atpSaveRecord(doc,notes){
  doc=atpCanonical(doc); const alias=doc.documentName==="Actor"?atpAliasJournal(doc):null, v=atpVaultData(), old=atpGetRecord(doc), next=atpRecord(doc,{...old,notes:notes.map(atpNote),createdAt:old.createdAt,updatedAt:Date.now()});
  const empty=!next.notes.length&&!next.facts.length&&!next.relations.length;
  if(empty) delete v.records[doc.uuid]; else v.records[doc.uuid]=next;
  if(alias){if(empty) delete v.records[alias.uuid]; else v.records[alias.uuid]=atpRecord(alias,next);}
  await atpSetVault(v);
  const legacy=atpLegacyData(), payload={notes:next.notes.map(atpNote),facts:atpClone(next.facts),relations:atpClone(next.relations)};
  for(const d of [doc,alias].filter(Boolean)){const k=atpLegacyKey(d);if(empty)delete legacy[k];else legacy[k]=atpClone(payload);} await game.settings.set(ATP_ID,ATP_LEGACY_VAULT,JSON.stringify(legacy));
  return next;
}
function atpMergeRecords(doc,a,b){if(!a)return b?atpRecord(doc,b):null;if(!b)return atpRecord(doc,a);const newest=Number(a.updatedAt||0)>=Number(b.updatedAt||0)?a:b, older=newest===a?b:a, ids=new Set(),notes=[];for(const n of [...(newest.notes||[]),...(older.notes||[])]){const x=atpNote(n);if(ids.has(x.id))continue;ids.add(x.id);notes.push(x);}return atpRecord(doc,{...older,...newest,notes,updatedAt:Math.max(Number(a.updatedAt||0),Number(b.updatedAt||0))});}
async function atpReconcileVault(){
  if(!game.user?.isGM||atpVaultGuard)return;const v=atpVaultData();let changed=false;
  for(const j of game.journal?.contents??[]){if(!atpWorld(j))continue;const a=atpResolveActor(j,{allowName:false}).actor;if(!a)continue;const merged=atpMergeRecords(a,v.records[a.uuid],v.records[j.uuid]);if(!merged)continue;const ar=atpRecord(a,merged),jr=atpRecord(j,merged);if(JSON.stringify(v.records[a.uuid]||null)!==JSON.stringify(ar)){v.records[a.uuid]=ar;changed=true;}if(JSON.stringify(v.records[j.uuid]||null)!==JSON.stringify(jr)){v.records[j.uuid]=jr;changed=true;}}
  if(changed)await atpSetVault(v);
}
function atpScheduleVaultSync(delay=80){if(!game.user?.isGM||atpVaultGuard)return;clearTimeout(atpVaultTimer);atpVaultTimer=setTimeout(()=>atpReconcileVault().catch(e=>console.warn("Adventurer's Tome | Vault alias reconciliation failed safely",e)),delay);}

function atpNoteRow(n){n=atpNote(n);const types=["prep","secret","reminder","clue","reveal","consequence","question","idea","scene"],opts=types.map(x=>`<option value="${x}"${x===n.type?" selected":""}>${x[0].toUpperCase()+x.slice(1)}</option>`).join("");return `<div class="atp-note" data-atp-note data-id="${atpEsc(n.id)}" data-created="${n.createdAt}"><div><input data-title value="${atpEsc(n.title)}"><select data-type>${opts}</select><select data-status><option value="open"${n.status==="open"?" selected":""}>Open</option><option value="resolved"${n.status==="resolved"?" selected":""}>Resolved</option></select><label><input type="checkbox" data-pin${n.pinned?" checked":""}> Pin</label><button type="button" data-remove title="Remove"><i class="fa-solid fa-trash"></i></button></div><textarea data-body rows="4">${atpEsc(n.body)}</textarea><div><input data-trigger value="${atpEsc(n.trigger)}" placeholder="Trigger / when it matters"><input data-session type="number" min="1" value="${n.sessionTarget||""}" placeholder="Session"></div></div>`;}
function atpCollect(root){return [...root.querySelectorAll("[data-atp-note]")].map(r=>atpNote({id:r.dataset.id,title:r.querySelector("[data-title]")?.value,body:r.querySelector("[data-body]")?.value,type:r.querySelector("[data-type]")?.value,status:r.querySelector("[data-status]")?.value,pinned:r.querySelector("[data-pin]")?.checked,trigger:r.querySelector("[data-trigger]")?.value,sessionTarget:r.querySelector("[data-session]")?.value,createdAt:Number(r.dataset.created||Date.now()),updatedAt:Date.now()})).filter(n=>n.body||n.title!=="GM Note");}
function atpOpenVault(doc){
  if(!game.user?.isGM)return;doc=atpCanonical(doc);const record=atpGetRecord(doc);const content=`<form class="atp-vault-form"><p class="atp-private"><i class="fa-solid fa-user-shield"></i> GM-private · UUID-backed · ${atpEsc(doc.documentName)}: <strong>${atpEsc(doc.name)}</strong></p><div data-list>${record.notes.map(atpNoteRow).join("")||'<p data-empty>No private context yet.</p>'}</div><button type="button" data-add><i class="fa-solid fa-plus"></i> Add Note</button></form>`;
  const dlg=new Dialog({title:`Private Vault · ${doc.name}`,content,buttons:{cancel:{label:"Close"},save:{label:"Save GM Context",icon:'<i class="fa-solid fa-floppy-disk"></i>',callback:async html=>{const root=html[0]||html;await atpSaveRecord(doc,atpCollect(root));ui.notifications.info(`Adventurer's Tome: Private GM context saved for ${doc.name}.`);}}},default:"save",render:html=>{const root=html[0]||html,wire=r=>r?.querySelector("[data-remove]")?.addEventListener("click",()=>r.remove());root.querySelectorAll("[data-atp-note]").forEach(wire);root.querySelector("[data-add]")?.addEventListener("click",()=>{const list=root.querySelector("[data-list]");list.querySelector("[data-empty]")?.remove();list.insertAdjacentHTML("afterbegin",atpNoteRow({}));wire(list.firstElementChild);});}});dlg.render(true);
}
function atpAppRoot(el){return el instanceof HTMLElement?el:el?.[0] instanceof HTMLElement?el[0]:null;}
function atpTomeApp(app){return app?.id==="adventurers-tome-app"||app?.options?.id==="adventurers-tome-app"||app?.constructor?.name==="AdventurersTomeApp";}
function atpCurrentWorld(app){if(!atpTomeApp(app)||typeof app._currentTomeRef!=="function")return null;const[t,id]=String(app._currentTomeRef()||"").split(":");return t==="world"&&id?game.journal?.get(id)||null:null;}
function atpInstallTomeUi(app,root){
  const j=atpCurrentWorld(app);if(!j||!root)return;const r=atpResolveActor(j,{allowName:false}),a=r.actor;
  if(a&&game.user?.isGM){let b=root.querySelector("[data-at-context-open], [data-atp-vault-open]");if(b){if(!b.hasAttribute("data-atp-vault-open")){const n=b.cloneNode(true);n.removeAttribute("data-at-context-open");n.setAttribute("data-atp-vault-open","");b.replaceWith(n);b=n;}root.querySelector("[data-at-context-vault]")?.remove();b.onclick=()=>atpOpenVault(a);const c=atpGetRecord(a).notes.length;b.title=c?`Private GM Context · ${c} note${c===1?"":"s"}`:"Private GM Context";const badge=b.querySelector(".at-context-badge");if(badge){badge.textContent=String(c);badge.hidden=!c;}}}
  if(!a&&r.permanent){const host=root.querySelector(".at-world-profile-header,.at-profile-toolbar,.at-page-heading,.at-world-editor-layout");if(host&&!root.querySelector("[data-atp-missing]")){const w=document.createElement("div");w.dataset.atpMissing="";w.className="atp-missing";w.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Linked Foundry Actor is missing. The source UUID is preserved and Tome will not establish a new permanent link by name.';host.parentElement?.insertBefore(w,host.nextSibling);}}
  const hero=root.querySelector('input[name="worldHeroImage"]');if(a&&game.user?.isGM&&hero&&!root.querySelector("[data-atp-source-image]")){const host=hero.closest(".at-profile-editor-image")||hero.parentElement;const box=document.createElement("div");box.dataset.atpSourceImage="";box.className="atp-source";box.innerHTML=`<strong><i class="fa-solid fa-link"></i> Foundry Actor source · ${atpEsc(a.name)}</strong><label>Canonical Actor image <span><input data-img value="${atpEsc(a.img||"")}"><button type="button" data-save-img>Save to Actor</button></span></label><button type="button" data-follow>Follow Actor image in Tome</button><small>The Profile image below remains an optional Tome-only presentation override.</small>`;host.insertBefore(box,host.firstChild);box.querySelector("[data-save-img]").onclick=async()=>{const img=String(box.querySelector("[data-img]").value||"").trim();await atpActorUpdate(a,{img});await atpNormalizeLink(j,a);if(atpImageMode(atpProfile(j),a)==="source")hero.value=img;ui.notifications.info(`Adventurer's Tome: Actor image updated for ${a.name}.`);};box.querySelector("[data-follow]").onclick=async()=>{const p=atpProfile(j);p.sourceImageMode="source";p.sourceImageSnapshot=String(a.img||"");p.heroImage=String(a.img||"");p.sourceParityVersion=ATP_VERSION;await atpJournalUpdate(j,{[`flags.${ATP_ID}.${ATP_PROFILE}`]:p});hero.value=String(a.img||"");ui.notifications.info(`Adventurer's Tome: ${a.name} now follows the Foundry Actor image.`);};}
}
function atpSheetDoc(app){const d=app?.document||app?.actor||app?.object;return ["Actor","JournalEntry"].includes(String(d?.documentName||""))?atpCanonical(d):null;}
function atpInstallSheetUi(app,root){if(!game.user?.isGM||!root||atpTomeApp(app)||root.querySelector("[data-atp-sheet-vault]"))return;const d=atpSheetDoc(app);if(!d?.uuid)return;const host=root.querySelector("header.window-header .window-controls,.window-header .window-controls,header.window-header,.window-header")||root.querySelector(".window-content");if(!host)return;const b=document.createElement("button");b.type="button";b.dataset.atpSheetVault="";b.className="atp-sheet-vault";b.innerHTML='<i class="fa-solid fa-lock"></i><span>Private Vault</span>';b.title="Private Vault";b.onclick=()=>atpOpenVault(d);host.prepend(b);}
function atpStyle(){if(document.getElementById("atp-style"))return;const s=document.createElement("style");s.id="atp-style";s.textContent=`.atp-source{display:grid;gap:.45rem;margin:0 0 .7rem;padding:.7rem;border:1px solid rgba(203,170,104,.4);border-radius:9px;background:rgba(18,21,25,.78)}.atp-source strong{color:#dcc07f}.atp-source label{display:grid;gap:.25rem}.atp-source label span{display:flex;gap:.3rem}.atp-source label input{min-width:0;flex:1}.atp-source small{color:#aaa08e}.atp-missing{margin:.6rem 1rem;padding:.6rem .75rem;border:1px solid rgba(201,129,72,.5);border-radius:8px;background:rgba(95,42,25,.25);color:#efc7a5}.atp-sheet-vault{display:inline-flex!important;align-items:center;gap:.3rem;min-width:auto!important;padding:.2rem .45rem!important;font-size:.75rem!important}.atp-vault-form{display:grid;gap:.6rem;max-height:65vh;overflow:auto}.atp-private{margin:0;padding:.5rem;border-radius:7px;background:rgba(90,72,36,.16)}.atp-note{display:grid;gap:.35rem;padding:.5rem;border:1px solid rgba(127,127,127,.3);border-radius:7px}.atp-note>div{display:grid;grid-template-columns:minmax(100px,1fr) auto auto auto auto;gap:.25rem}.atp-note>div:last-child{grid-template-columns:1fr 90px}.atp-note textarea{width:100%;min-height:70px}@media(max-width:700px){.atp-note>div{grid-template-columns:1fr 1fr}.atp-note>div input[data-title]{grid-column:1/-1}.atp-sheet-vault span{display:none}}`;document.head.appendChild(s);}

Hooks.once("ready",async()=>{atpStyle();if(!game.user?.isGM)return;try{await atpMigrateLinks();await atpReconcileVault();}catch(e){console.error("Adventurer's Tome | Source Parity initialization failed safely",e);}});
Hooks.on("updateActor",a=>atpActorToTome(a).catch(e=>console.error("Adventurer's Tome | Actor -> Tome parity failed safely",e)));
Hooks.on("createActor",()=>{if(atpLeaderGM())setTimeout(()=>atpMigrateLinks().catch(e=>console.warn("Adventurer's Tome | New Actor link normalization failed safely",e)),120);});
Hooks.on("deleteActor",a=>{if(atpLeaderGM())Promise.all(atpLinked(a).map(j=>atpMarkMissing(j,a))).finally(atpScheduleRender);});
Hooks.on("updateJournalEntry",(j,c)=>atpTomeToActor(j,c).catch(e=>console.error("Adventurer's Tome | Tome -> Actor parity failed safely",e)));
Hooks.on("createJournalEntry",j=>{if(atpLeaderGM()&&atpWorld(j))setTimeout(()=>atpTomeToActor(j,{}).catch(()=>{}),120);});
for(const h of ["createJournalEntryPage","updateJournalEntryPage","deleteJournalEntryPage"])Hooks.on(h,atpScheduleRender);
Hooks.on("updateSetting",s=>{const k=String(s?.key||s?.id||"");if(!atpVaultGuard&&k===`${ATP_ID}.${ATP_VAULT}`)atpScheduleVaultSync(50);});
Hooks.on("renderApplicationV2",(app,el)=>{try{const root=atpAppRoot(el);atpInstallTomeUi(app,root);atpInstallSheetUi(app,root);}catch(e){console.error("Adventurer's Tome | Source Parity UI failed safely",e);}});
