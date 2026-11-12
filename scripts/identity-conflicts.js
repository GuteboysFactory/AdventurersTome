globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome',KEY='identityDistinctions';
const clean=v=>String(v??'').trim();
const norm=v=>clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const esc=v=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const flags=d=>d?.getFlag?globalThis.ATTestAI.flags(d):{getFlag:(_id,key)=>(d?.flags?.['adventurers-tome']||d?.flags?.[ID]||{})[key]};
const person=k=>['npc','contact','character','pc','person','npc-group'].includes(k);
function kind(d,type=d?.documentName){
 if(type==='Actor')return d?.type==='character'?'pc':'npc';
 if(type==='Item')return 'item';
 return clean(flags(d).getFlag(ID,'worldProfile')?.category||flags(d).getFlag(ID,'type')).toLowerCase();
}
const compatible=(a,b)=>a===b||person(a)&&person(b);
function similar(a,b){
 a=norm(a);b=norm(b);if(!a||!b)return false;if(a===b)return true;
 const x=a.split(' '),y=b.split(' ');
 // A shared short word is not a name conflict; a complete personal name may be abbreviated.
 if(Math.min(a.length,b.length)>=4&&(a.startsWith(b+' ')||b.startsWith(a+' ')))return true;
 if(a.length<5||Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;
}
function worldRows(){
 const docs=[game.actors,game.items,game.journal].flatMap(c=>c?.contents||[]).filter(d=>!d.pack&&kind(d)&&!['sessions','quests','rules'].includes(kind(d))&&!String(flags(d).getFlag(ID,'quickImportSourceUuid')||flags(d).getFlag(ID,'worldProfile')?.sourceUuid||'').startsWith('Compendium.'));
 const byUuid=new Map(docs.map(d=>[d.uuid,d]));
 return docs.filter(d=>{if(d.documentName!=='JournalEntry')return true;const f=flags(d),p=f.getFlag(ID,'worldProfile')||{},uuid=f.getFlag(ID,'knownPersonV1')?.actorUuid||f.getFlag(ID,'backendProjectionV1')?.sourceUuid||f.getFlag(ID,'semanticProjection')?.linkedUuid||p.sourceUuid||(p.actorId?'Actor.'+p.actorId:'');const authority=byUuid.get(uuid);return !authority||!compatible(kind(d),kind(authority));});
}
function conflicts(data,type,{excludeUuid=''}={}){
 if(!game.user?.isGM)return [];
 const authority=excludeUuid?globalThis.ATTestAI.modules.get(ID)?.api?.campaignIdentityReconciliation?.identityFor?.({uuid:excludeUuid})?.authorityUuid:'';
 return worldRows().filter(d=>d.uuid!==excludeUuid&&d.uuid!==authority&&similar(data.name,d.name)).map(d=>({uuid:d.uuid,name:d.name,kind:kind(d),documentName:d.documentName,compatible:compatible(kind(data,type),kind(d))}));
}
function read(){try{return JSON.parse(globalThis.ATTestAI.settings.get(ID,KEY)||'{}');}catch{return {};}}
const pair=(a,b)=>[a,b].sort().join('|');
function distinction(a,b){if(!game.user?.isGM)return null;return read()[pair(a,b)]||null;}
function distinctionsFor(uuid){if(!game.user?.isGM)return [];return Object.values(read()).filter(r=>r.uuids?.includes(uuid));}
async function remember(doc,rows,reason){
 if(!game.user?.isGM)throw Error('GM access required.');
 const records=read();for(const row of rows)records[pair(doc.uuid,row.uuid)]={uuids:[doc.uuid,row.uuid],names:[doc.name,row.name],kinds:[kind(doc),row.kind],reason:clean(reason),at:Date.now()};
 await globalThis.ATTestAI.settings.set(ID,KEY,JSON.stringify(records));
 Hooks.callAll('adventurersTomeIdentityDistinctionsUpdated');
}
async function ask(data,type,rows){
 return foundry.applications.api.DialogV2.wait({window:{title:'Identity with a similar name',resizable:true},position:{width:650},
  content:`<form><p>You are creating <strong>${esc(data.name)}</strong> (${esc(kind(data,type))}). These identities already exist:</p><ul>${rows.map(r=>`<li>${esc(r.name)} · ${esc(r.kind)}${r.compatible?'':' — different entity type'}</li>`).join('')}</ul><p>A shared name does not make these the same identity.</p><label>Use an existing identity<select name="existing">${rows.map(r=>`<option value="${esc(r.uuid)}">${esc(r.name)} · ${esc(r.kind)}</option>`).join('')}</select></label><label>For a separate identity: what is the difference?<textarea name="difference" rows="4" required placeholder="For example: a people/faction versus an individual; different role, origin or place."></textarea></label><p>The explanation is saved privately for your GM user and used to keep the identities apart.</p></form>`,
  buttons:[{action:'existing',label:'Use existing — cancel this creation',callback:(_event,button,dialog)=>({action:'existing',uuid:(button.form||dialog.element?.querySelector('form'))?.elements.existing.value})},
   {action:'separate',label:'Create separate identity',callback:(_event,button,dialog)=>{const form=button.form||dialog.element?.querySelector('form');const reason=clean(form?.elements.difference.value);if(!reason){ui.notifications.warn('Describe the difference before creating a separate identity.');return null;}return {action:'separate',reason};}},
   {action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
}
function managed(data,options,type){
 if(options.pack||options.adventurersTomeBackendParity||options.adventurersTomeIdentityChecked)return true;
 if(type==='JournalEntry'&&!['npc','contact','character','pc','location','faction','item','lore','npc-group'].includes(kind(data,type)))return true;
 const f=flags(data),p=f.getFlag(ID,'worldProfile')||{},backend=f.getFlag(ID,'backendProjectionV1'),semantic=f.getFlag(ID,'semanticProjection');
 const known=String(f.getFlag(ID,'knownPersonV1')?.actorUuid||'');
 // A minimal player card is a deliberate presentation of this exact Actor,
 // not a proposed second identity requiring an interactive naming decision.
 if(type==='JournalEntry'&&/^Actor\.[^.]+$/.test(known)&&game.actors?.get(known.slice(6)))return true;
 return Boolean(backend?.managed&&backend.sourceUuid||semantic?.kind==='contact'&&semantic.linkedUuid||p.sourceUuid&&compatible(kind(data,type),p.sourceUuid.startsWith('Actor.')?'npc':p.sourceUuid.startsWith('Item.')?'item':kind(data,type)));
}
let pending=Promise.resolve();
function install(type){
 const cls=globalThis.CONFIG?.[type]?.documentClass||globalThis[type];if(!cls?.createDocuments||Object.hasOwn(cls,'_tomeIdentityCreationGuard'))return;
 const original=cls.createDocuments;
 Object.defineProperty(cls,'_tomeIdentityCreationGuard',{value:true});
 cls.createDocuments=async function(data=[],options={}){
  // Inventories, token actors and other embedded documents are not world identities.
  // They may be created inside a parent Actor transaction: never queue them behind it.
  if(options.parent)return original.call(this,data,options);
  if(type==='JournalEntry'&&!options.pack&&data.some(d=>String(flags(d).getFlag(ID,'quickImportSourceUuid')||flags(d).getFlag(ID,'worldProfile')?.sourceUuid||'').startsWith('Compendium.')))throw new Error('Import the document into the Foundry world Actors or Items first. Compendium presentations are not imported into Tome World.');
  if(!game.user?.isGM||options.pack||data.every(d=>managed(d,options,type)))return original.call(this,data,options);
  const owner=this;
  const work=async()=>{
   // Check at execution time, after a previous interactive creation has settled.
   const groups=data.map(d=>({data:d,rows:managed(d,options,type)?[]:conflicts(d,type)}));
   const internal=data.some((d,i)=>data.slice(0,i).some(other=>similar(d.name,other.name)));
   if(!internal&&groups.every(g=>!g.rows.length))return original.call(owner,data,options);
   const result=[];
   for(const item of data){
    const rows=managed(item,options,type)?[]:conflicts(item,type);
   if(rows.length&&options.adventurersTomeAutomaticIdentity){const error=new Error('Similar campaign identities require GM review before automatic creation.');error.code='TOME_IDENTITY_CONFLICT';throw error;}
   const choice=rows.length?await ask(item,type,rows):{action:'create'};
    if(!choice||!['create','existing','separate'].includes(choice.action))continue;
    if(choice.action==='existing'){const doc=worldRows().find(d=>d.uuid===choice.uuid);doc?.sheet?.render?.(true);continue;}
    if(!game.user?.isGM)throw Error('GM access changed; creation cancelled.');
    if(choice.action==='separate'&&!clean(choice.reason))continue;
    const made=await original.call(owner,[item],options);result.push(...made);
    if(choice.action==='separate')for(const doc of made)await remember(doc,rows,choice.reason);
   }
   return result;
  };
  const task=pending.then(work);pending=task.catch(()=>{});return task;
 };
}
Hooks.once('init',()=>globalThis.ATTestAI.settings.register(ID,KEY,{scope:'user',config:false,type:String,default:'{}'}));
Hooks.once('ready',()=>{
 const module=globalThis.ATTestAI.modules.get(ID);if(module){module.api||={};module.api.identityConflicts=Object.freeze({conflicts,distinction,distinctionsFor,compatible,kind,similar});}
 for(const type of ['Actor','Item','JournalEntry'])install(type);
});
function mountReview(){
 if(!game.user?.isGM)return;
 const page=document.querySelector('#adventurers-tome-app .at-world-profile-page, #adventurers-tome-app .at-profile-page');if(!page||page.querySelector('[data-at-identity-review]'))return;
 const journalId=page.querySelector('[data-action="openJournal"][data-journal-id]')?.dataset.journalId,actorId=page.querySelector('[data-action="openActor"][data-actor-id]')?.dataset.actorId,doc=journalId?game.journal?.get(journalId):game.actors?.get(actorId);if(!doc)return;
 const rows=conflicts(doc,doc.documentName,{excludeUuid:doc.uuid});if(!rows.length)return;
 const saved=rows.map(r=>distinction(doc.uuid,r.uuid)).filter(Boolean),panel=document.createElement('section');panel.dataset.atIdentityReview='';panel.className='at-profile-panel';
 panel.innerHTML=`<h2>Similar names · distinct identities</h2><p>${rows.map(r=>`${esc(r.name)} (${esc(r.kind)})`).join(', ')}</p>${saved.length?'<ul>'+saved.map(r=>`<li>${esc(r.reason)}</li>`).join('')+'</ul>':'<p>A matching name does not establish an identity link. Review the difference before linking.</p>'}<button type="button" class="at-secondary" data-at-identity-distinguish>Explain the difference</button>`;
 page.querySelector('.at-profile-toolbar')?.after(panel);if(!panel.isConnected)page.append(panel);
 panel.querySelector('button').onclick=async()=>{const choice=await foundry.applications.api.DialogV2.wait({window:{title:'Keep these identities separate'},content:'<form><label>What is the difference?<textarea name="reason" rows="4" required></textarea></label></form>',buttons:[{action:'save',label:'Save distinction',callback:(_event,button,dialog)=>({reason:clean((button.form||dialog.element?.querySelector('form'))?.elements.reason.value)})},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});if(!choice?.reason)return;await remember(doc,rows,choice.reason);panel.remove();mountReview();};
}
Hooks.on('adventurersTomeViewPrepared',mountReview);
