const MODULE_ID = "adventurers-tome";
const DOCK_ID = "adventurers-tome-gm-dock";
const POSITION_SETTING = "gmDockPosition";
const PIN_SETTING = "gmDockPinnedContext";

let dock = null;
let panel = "";
let lastFoundryUuid = "";
let refreshTimer = null;
let hostedProviderRegistered = false;
let hostedProviderHostId = "";
const extraActions = new Map();

const api = () => game.modules.get(MODULE_ID)?.api || {};
const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const parse = (v, fallback=null) => { try { return JSON.parse(String(v || "")); } catch (_e) { return fallback; } };
const clamp = (n,min,max) => Math.min(Math.max(Number(n)||0,min),Math.max(min,max));

function resolveUuid(uuid) {
  const key = String(uuid || "").trim();
  if (!key) return null;
  const fromRegistry = api().universalDocuments?.resolve?.(key);
  if (fromRegistry) return fromRegistry;
  try { return typeof fromUuidSync === "function" ? fromUuidSync(key) : null; }
  catch (_e) { return null; }
}

function refContext(document, source="foundry") {
  if (!document?.uuid) return null;
  return {
    uuid: String(document.uuid),
    refKey: String(api().refForDocument?.(document) || ""),
    name: String(document.name || document.parent?.name || "Untitled"),
    documentName: String(document.documentName || "Document"),
    source,
    document
  };
}

function currentContext() {
  const pinnedUuid = String(game.settings.get(MODULE_ID, PIN_SETTING) || "");
  const pinned = resolveUuid(pinnedUuid);
  if (pinned) return refContext(pinned, "pinned");

  const tome = api().currentContext?.();
  if (tome?.uuid) {
    const document = resolveUuid(tome.uuid);
    if (document) return refContext(document, "tome");
  }

  const foundryDocument = resolveUuid(lastFoundryUuid);
  if (foundryDocument) return refContext(foundryDocument, "foundry");

  const scene = canvas?.scene || game.scenes?.current;
  if (scene) return refContext(scene, "scene");

  return { uuid:"", refKey:"", name:String(game.world?.title || "Campaign"), documentName:"Campaign", source:"campaign", document:null };
}

function iconFor(type) {
  return ({Actor:"fa-user",Item:"fa-sack",JournalEntry:"fa-book-open",JournalEntryPage:"fa-file-lines",Scene:"fa-map",Folder:"fa-folder"})[type] || "fa-earth-europe";
}

function labelFor(type) {
  return ({Actor:"Actor",Item:"Item",JournalEntry:"Journal",JournalEntryPage:"Journal Page",Scene:"Scene",Folder:"Folder",Campaign:"Campaign"})[type] || "Context";
}

function queueCount() {
  try { return Number(api().getRevealQueue?.()?.queuedCount || 0); } catch (_e) { return 0; }
}

function nextSession() {
  try { return Number(api().getGmNotebook?.()?.nextSession || 0); } catch (_e) { return 0; }
}

function vaultCount(ctx) {
  if (!ctx.document || !ctx.refKey) return 0;
  try { return Number(api().contextualPrivateVault?.getSummary?.(ctx.document)?.noteCount || 0); } catch (_e) { return 0; }
}

function recentRows() {
  const refs = Array.isArray(api().getRecentItems?.()) ? api().getRecentItems() : [];
  return refs.slice(0,8).map((ref) => api().getRefMeta?.(ref)).filter(Boolean);
}

function activeDockHost() {
  const host = globalThis.GuteboysFactory?.gmDockHost;
  if (!host || host.id === MODULE_ID) return null;
  if (host.contract !== "gbf-gm-dock-host" || Number(host.version || 0) < 1) return null;
  if (typeof host.registerProvider !== "function") return null;
  return host;
}

function removeStandaloneDock() {
  document.getElementById(DOCK_ID)?.remove();
  dock = null;
  panel = "";
}

function hostedMenu() {
  const ctx = currentContext();
  const pinned = Boolean(ctx.uuid && String(game.settings.get(MODULE_ID,PIN_SETTING)||"") === ctx.uuid);
  const recents = recentRows().slice(0,5);
  const items = [
    {
      id:"context",
      label:ctx.name || "Current Context",
      detail:ctx.refKey ? `${labelFor(ctx.documentName)} · Open current Tome context` : `${labelFor(ctx.documentName)} · Foundry context`,
      icon:`fa-solid ${iconFor(ctx.documentName)}`,
      disabled:!ctx.refKey && !ctx.document,
      onClick:()=>handleAction("context")
    },
    {
      id:"pin",
      label:pinned ? "Unpin Context" : "Pin Context",
      detail:pinned ? "Return Dock context to normal navigation." : "Keep this context active while you work elsewhere.",
      icon:"fa-solid fa-thumbtack",
      disabled:!ctx.uuid,
      onClick:()=>handleAction("pin")
    },
    { separator:true, label:"Campaign tools" },
    {
      id:"vault",
      label:"Private Vault",
      detail:ctx.refKey ? `Private GM context for ${ctx.name}` : "Open a Tome-linked context first.",
      icon:"fa-solid fa-lock",
      badge:vaultCount(ctx),
      disabled:!ctx.refKey,
      onClick:()=>handleAction("vault")
    },
    {
      id:"capture",
      label:"Quick Capture",
      detail:"Capture a private GM note without creating a parallel data model.",
      icon:"fa-solid fa-bolt",
      onClick:()=>api().openQuickCapture?.()
    },
    {
      id:"reveal",
      label:"Reveal Queue",
      detail:"Review queued campaign reveals and Show to Players.",
      icon:"fa-solid fa-eye",
      badge:queueCount(),
      onClick:()=>handleAction("reveal")
    },
    {
      id:"next",
      label:`Next Session${nextSession() ? ` · ${nextSession()}` : ""}`,
      detail:"Open the existing Tome GM Dashboard and session-prep workflow.",
      icon:"fa-solid fa-calendar-day",
      onClick:()=>handleAction("next")
    },
    { separator:true, label:"Recent Tome context" },
    ...recents.map((row,index)=>({
      id:`recent-${index}`,
      label:row.name,
      detail:row.category || row.type || "Tome",
      icon:`fa-solid ${row.icon || "fa-book"}`,
      onClick:()=>api().openRef?.(row.refKey)
    })),
    { separator:true, label:"Workspace" },
    {
      id:"open-tome",
      label:"Open Adventurer's Tome",
      detail:"Open the full campaign workspace.",
      icon:"fa-solid fa-book-open",
      onClick:()=>handleAction("tome")
    }
  ];
  return {
    title:"Adventurer's Tome",
    subtitle:"Campaign workspace",
    context:ctx?.name ? `Current: ${ctx.name}` : "",
    items
  };
}

function registerWithDockHost() {
  if (!game.user?.isGM) return false;
  const host = activeDockHost();
  if (!host) {
    hostedProviderRegistered = false;
    hostedProviderHostId = "";
    return false;
  }

  if (!host.hasProvider?.(MODULE_ID) || hostedProviderHostId !== host.id) {
    host.registerProvider({
      id:MODULE_ID,
      label:"Adventurer's Tome",
      icon:"fa-solid fa-book-open",
      tooltip:"Adventurer's Tome · Campaign Workspace",
      order:50,
      visible:()=>game.user?.isGM === true,
      badge:()=>queueCount(),
      menu:()=>hostedMenu()
    });
  }

  hostedProviderRegistered = true;
  hostedProviderHostId = String(host.id || "");
  removeStandaloneDock();
  return true;
}

function badge(n) {
  const value = Number(n || 0);
  return `<span class="at-gmd-badge"${value > 0 ? "" : " hidden"}>${value > 0 ? value : ""}</span>`;
}

function action(id, icon, title, count=0, disabled=false) {
  return `<button type="button" class="at-gmd-action" data-gmd-action="${esc(id)}" title="${esc(title)}"${disabled ? " disabled" : ""}><i class="fa-solid ${esc(icon)}"></i>${badge(count)}</button>`;
}

function barHtml(ctx) {
  const pinned = Boolean(ctx.uuid && String(game.settings.get(MODULE_ID,PIN_SETTING)||"") === ctx.uuid);
  const custom = [...extraActions.values()].map((x) => {
    let visible = true;
    try { visible = typeof x.visible === "function" ? x.visible(ctx) !== false : true; } catch (_e) {}
    return visible ? action(x.id, x.icon || "fa-wand-magic-sparkles", x.title || x.id) : "";
  }).join("");

  return `<div class="at-gmd-bar">
    <button type="button" class="at-gmd-grip" data-gmd-drag title="Drag GM Dock. Right-click to reset."><i class="fa-solid fa-grip-lines"></i></button>
    <button type="button" class="at-gmd-context" data-gmd-action="context" title="${esc(labelFor(ctx.documentName) + ": " + ctx.name)}">
      <i class="fa-solid ${iconFor(ctx.documentName)}"></i>
      <span><small>${esc(labelFor(ctx.documentName))}</small><strong>${esc(ctx.name)}</strong></span>
    </button>
    <button type="button" class="at-gmd-pin ${pinned ? "is-pinned" : ""}" data-gmd-action="pin" title="${pinned ? "Unpin context" : "Pin context"}"${ctx.uuid ? "" : " disabled"}><i class="fa-solid fa-thumbtack"></i></button>
    <i class="at-gmd-divider"></i>
    ${action("vault","fa-lock","Contextual Private Vault",vaultCount(ctx),!ctx.refKey)}
    ${action("capture","fa-bolt","Quick Capture")}
    ${action("reveal","fa-eye","Reveal Queue",queueCount())}
    ${action("next","fa-calendar-day","Next Session",nextSession())}
    ${action("recent","fa-clock-rotate-left","Recent GM navigation",recentRows().length)}
    ${custom}
    <i class="at-gmd-spacer"></i>
    ${action("tome","fa-book-open","Open Adventurer's Tome")}
  </div><div class="at-gmd-panel-host" data-gmd-panel-host></div>`;
}

function quickCaptureHtml(ctx) {
  const contextOption = ctx.refKey ? `<option value="context">Current context - ${esc(ctx.name)}</option>` : "";
  return `<section class="at-gmd-panel">
    <header><div><small>GM WORKFLOW</small><h3>Quick Capture</h3></div><button type="button" data-gmd-close><i class="fa-solid fa-xmark"></i></button></header>
    <form data-gmd-capture>
      <label>Title<input name="title" type="text" placeholder="Reminder, clue, idea..."></label>
      <label>Private note<textarea name="body" rows="4" placeholder="Capture it now; sort it later."></textarea></label>
      <div class="at-gmd-row">
        <label>Type<select name="type"><option value="reminder">Reminder</option><option value="prep">Prep</option><option value="secret">Secret</option><option value="clue">Clue</option><option value="reveal">Reveal</option><option value="consequence">Consequence</option><option value="question">Question</option><option value="idea">Idea</option><option value="scene">Scene</option></select></label>
        <label>Save to<select name="target">${contextOption}<option value="inbox">GM Quick Capture Inbox</option></select></label>
      </div>
      <label class="at-gmd-check"><input type="checkbox" name="pinned"> Pin note</label>
      <footer><button type="button" class="at-gmd-secondary" data-gmd-close>Cancel</button><button type="submit" class="at-gmd-primary"><i class="fa-solid fa-floppy-disk"></i> Save Capture</button></footer>
    </form>
  </section>`;
}

function recentHtml() {
  const rows = recentRows();
  return `<section class="at-gmd-panel">
    <header><div><small>GM NAVIGATION</small><h3>Recent Tome Context</h3></div><button type="button" data-gmd-close><i class="fa-solid fa-xmark"></i></button></header>
    <div class="at-gmd-recents">${rows.length ? rows.map((r) => `<button type="button" data-gmd-recent="${esc(r.refKey)}"><i class="fa-solid ${esc(r.icon || "fa-book")}"></i><span><strong>${esc(r.name)}</strong><small>${esc(r.category || r.type || "Tome")}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join("") : '<div class="at-gmd-empty"><i class="fa-regular fa-clock"></i>No recent Tome entries yet.</div>'}</div>
  </section>`;
}

function defaultPosition() {
  return { left: Math.max(8, Math.round((window.innerWidth - 650) / 2)), top: Math.max(8, window.innerHeight - 112) };
}

function savedPosition() {
  const value = parse(game.settings.get(MODULE_ID,POSITION_SETTING),null);
  return value && Number.isFinite(Number(value.left)) && Number.isFinite(Number(value.top)) ? value : defaultPosition();
}

function positionDock(pos=savedPosition()) {
  if (!dock) return;
  const rect = dock.getBoundingClientRect();
  const next = {
    left: clamp(pos.left,8,window.innerWidth-Math.max(rect.width,320)-8),
    top: clamp(pos.top,8,window.innerHeight-Math.max(rect.height,42)-8)
  };
  dock.style.left = `${Math.round(next.left)}px`;
  dock.style.top = `${Math.round(next.top)}px`;
  dock.dataset.left = next.left;
  dock.dataset.top = next.top;
  return next;
}

function renderPanel(ctx=currentContext()) {
  const host = dock?.querySelector("[data-gmd-panel-host]");
  if (!host) return;
  host.innerHTML = panel === "capture" ? quickCaptureHtml(ctx) : panel === "recent" ? recentHtml() : "";
  dock.classList.toggle("has-panel",Boolean(panel));
  host.querySelectorAll("[data-gmd-close]").forEach((b) => b.addEventListener("click",()=>{ panel=""; renderPanel(ctx); }));

  host.querySelector("[data-gmd-capture]")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title")||"").trim();
    const body = String(data.get("body")||"").trim();
    if (!title && !body) return ui.notifications.warn("Adventurer's Tome: Add a title or note before saving.");
    const latest = currentContext();
    try {
      const result = await api().quickCapture?.({
        refKey: String(data.get("target")) === "context" ? latest.refKey : "",
        title, body,
        type:String(data.get("type")||"reminder"),
        pinned:data.get("pinned")==="on"
      });
      ui.notifications.info(`Adventurer's Tome: Captured to ${result?.documentName || "GM Quick Capture Inbox"}.`);
      panel="";
      scheduleRefresh();
    } catch(error) {
      console.error("Adventurer's Tome | GM Dock Quick Capture failed",error);
      ui.notifications.error("Adventurer's Tome: Quick Capture failed. See console.");
    }
  });

  host.querySelectorAll("[data-gmd-recent]").forEach((b)=>b.addEventListener("click",async()=>{
    panel="";
    await api().openRef?.(String(b.dataset.gmdRecent||""));
    scheduleRefresh();
  }));
}

async function handleAction(id) {
  const ctx = currentContext();
  if (id === "context") {
    if (ctx.refKey) await api().openRef?.(ctx.refKey);
    else ctx.document?.sheet?.render?.(true);
  } else if (id === "pin") {
    await game.settings.set(MODULE_ID,PIN_SETTING,String(game.settings.get(MODULE_ID,PIN_SETTING)||"")===ctx.uuid ? "" : ctx.uuid);
  } else if (id === "vault") {
    if (!ctx.refKey) return ui.notifications.info("Adventurer's Tome: Private Vault needs a Tome-linked context.");
    await api().contextualPrivateVault?.open?.(ctx.document || ctx.uuid);
  } else if (id === "capture" || id === "recent") {
    panel = panel === id ? "" : id;
    return renderPanel(ctx);
  } else if (id === "reveal") {
    panel=""; await api().openRevealQueue?.();
  } else if (id === "next") {
    panel=""; await api().openGmDashboard?.();
  } else if (id === "tome") {
    panel=""; await api().open?.();
  } else {
    const custom = extraActions.get(id);
    if (custom?.handler) await custom.handler({context:ctx,api:api(),dock:gmDockApi()});
  }
  scheduleRefresh();
}

function bindGrip() {
  const grip = dock?.querySelector("[data-gmd-drag]");
  if (!grip) return;
  let drag = null;
  grip.addEventListener("pointerdown",(event)=>{
    if (event.button !== 0) return;
    const rect = dock.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
    grip.setPointerCapture?.(event.pointerId);
    dock.classList.add("is-dragging");
  });
  grip.addEventListener("pointermove",(event)=>{
    if (!drag || drag.id !== event.pointerId) return;
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    if (!drag.moved && Math.hypot(dx,dy)<3) return;
    drag.moved=true;
    event.preventDefault();
    positionDock({left:drag.left+dx,top:drag.top+dy});
  });
  const finish=async(event)=>{
    if (!drag || drag.id !== event.pointerId) return;
    const moved=drag.moved; drag=null; dock.classList.remove("is-dragging");
    if (moved) await game.settings.set(MODULE_ID,POSITION_SETTING,JSON.stringify(positionDock({left:Number(dock.dataset.left),top:Number(dock.dataset.top)})));
  };
  grip.addEventListener("pointerup",finish);
  grip.addEventListener("pointercancel",finish);
  grip.addEventListener("contextmenu",async(event)=>{event.preventDefault();await game.settings.set(MODULE_ID,POSITION_SETTING,"");positionDock(defaultPosition());});
}

function refreshDock() {
  if (!game.user?.isGM) {
    removeStandaloneDock();
    return;
  }

  if (registerWithDockHost()) {
    activeDockHost()?.refresh?.();
    return;
  }

  dock = document.getElementById(DOCK_ID);
  if (!dock) {
    dock=document.createElement("aside");
    dock.id=DOCK_ID;
    dock.className="at-gm-dock";
    dock.setAttribute("aria-label","Adventurer's Tome GM Dock");
    document.body.appendChild(dock);
    dock.addEventListener("click",(event)=>{
      const button=event.target.closest("[data-gmd-action]");
      if (!button || button.disabled) return;
      event.preventDefault();
      handleAction(String(button.dataset.gmdAction||"")).catch((error)=>console.error("Adventurer's Tome | GM Dock action failed",error));
    });
  }
  const ctx=currentContext();
  dock.innerHTML=barHtml(ctx);
  bindGrip();
  positionDock(savedPosition());
  renderPanel(ctx);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{refreshTimer=null;refreshDock();},70);
}

function captureFoundryContext(app) {
  if (!game.user?.isGM) return;
  const document=[app?.document,app?.object,app?.actor,app?.item,app?.scene].find((d)=>d?.uuid);
  if (!document || document.documentName === "User") return;
  lastFoundryUuid=String(document.uuid);
  scheduleRefresh();
}

function gmDockApi() {
  return Object.freeze({
    version:2,
    hostContract:"gbf-gm-dock-host",
    refresh:refreshDock,
    mode:()=>activeDockHost() ? "hosted-provider" : "standalone-fallback",
    host:()=>activeDockHost() ? { id:String(activeDockHost().id || ""), label:String(activeDockHost().label || "") } : null,
    context:()=>{
      const c=currentContext();
      return {uuid:c.uuid,refKey:c.refKey,name:c.name,documentName:c.documentName,source:c.source,pinned:String(game.settings.get(MODULE_ID,PIN_SETTING)||"")===c.uuid};
    },
    registerAction(id,config={}){
      const key=String(id||"").trim();
      if (!key) throw new Error("GM Dock action id is required.");
      if (extraActions.has(key)) throw new Error(`GM Dock action already registered: ${key}`);
      extraActions.set(key,{...config,id:key});
      scheduleRefresh();
      return key;
    },
    unregisterAction(id){ const removed=extraActions.delete(String(id||"")); if(removed)scheduleRefresh(); return removed; }
  });
}

Hooks.once("init",()=>{
  game.settings.register(MODULE_ID,POSITION_SETTING,{scope:"user",config:false,type:String,default:""});
  game.settings.register(MODULE_ID,PIN_SETTING,{scope:"user",config:false,type:String,default:""});
});

Hooks.once("ready",()=>{
  if (!game.user?.isGM) return;
  const module=game.modules.get(MODULE_ID);
  if (module) {
    if (!module.api || typeof module.api !== "object") module.api = {};
    module.api.gmDock = gmDockApi();
  }
  refreshDock();
  window.addEventListener("resize",()=>{
    if (activeDockHost()) return activeDockHost()?.refresh?.();
    positionDock({left:Number(dock?.dataset.left||savedPosition().left),top:Number(dock?.dataset.top||savedPosition().top)});
  });
  console.info(`Adventurer's Tome | v1.4 GM Dock ready in ${activeDockHost() ? "hosted provider" : "standalone fallback"} mode.`);
});

Hooks.on("guteboysFactoryGmDockHostReady",()=>{
  if (!game.user?.isGM) return;
  hostedProviderRegistered=false;
  hostedProviderHostId="";
  refreshDock();
});

Hooks.on("renderApplicationV2",(app)=>captureFoundryContext(app));
Hooks.on("renderActorSheet",(app)=>captureFoundryContext(app));
Hooks.on("renderItemSheet",(app)=>captureFoundryContext(app));
Hooks.on("renderJournalSheet",(app)=>captureFoundryContext(app));
Hooks.on("canvasReady",scheduleRefresh);
Hooks.on("adventurersTomeUniversalRegistryRebuilt",scheduleRefresh);
Hooks.on("adventurersTomeQuickCaptureSaved",scheduleRefresh);
for (const hook of ["createActor","updateActor","deleteActor","createItem","updateItem","deleteItem","createJournalEntry","updateJournalEntry","deleteJournalEntry","createJournalEntryPage","updateJournalEntryPage","deleteJournalEntryPage","createScene","updateScene","deleteScene","createFolder","updateFolder","deleteFolder"]) Hooks.on(hook,scheduleRefresh);
