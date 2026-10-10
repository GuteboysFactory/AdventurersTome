// GM-local derived index. Canonical documents and Review learning remain the
// authority; this database can be discarded and rebuilt without losing either.
const ID='adventurers-tome',REVISION='qa43-index-language-3';
let state={revision:REVISION,cache:{},signatures:{},history:{},snapshots:{},paused:false};
let loaded=null,db=null,worker=null,serial=0,timer=null,running=false,again=false;
let lastYield=0,workerError='',storageError='',lastError='',current='',completed=0,total=0;
let hits=0,misses=0,ready=false,saveTail=Promise.resolve();
let decisionEpoch=0;
const pending=new Map();
const clone=value=>structuredClone(value);
const api=()=>game.modules.get(ID)?.api || {};
const gm=()=>Boolean(game.user?.isGM);
const active=()=>gm() && (!game.users?.activeGM || game.users.activeGM.id===game.user.id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const blank=()=>({revision:REVISION,cache:{},signatures:{},history:{},snapshots:{},paused:false});
function encode(value) {return JSON.stringify(value,(_key,v)=>v instanceof Set ? [...v].sort() : v instanceof Map ? [...v.entries()] : v);}
async function digest(value) {
  const text=encode(value);
  // Foundry can run on a LAN HTTP origin without SubtleCrypto. Exact keys are
  // larger but collision-free, and remain inside the same bounded private DB.
  if(!globalThis.crypto?.subtle)return `exact:${text}`;
  const bytes=new TextEncoder().encode(text);
  return `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
async function load() {
  if(!gm())throw Error('The campaign index is GM-only.');
  if(loaded)return loaded;
  loaded=(async()=>{
    try {
      const world=game.world?.id;
      if(!world || !globalThis.indexedDB)throw Error('Persistent browser storage is unavailable; this run uses memory only.');
      db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(`tome-index:${world}:${game.user.id}`,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('index');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      const saved=await new Promise((resolve,reject)=>{
        const request=db.transaction('index').objectStore('index').get('state');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      if(saved?.revision===REVISION && ['cache','signatures','history','snapshots'].every(key=>saved[key]&&typeof saved[key]==='object'&&!Array.isArray(saved[key])))state=saved;
      else if(saved)state={...blank(),history:saved.history || {},paused:Boolean(saved.paused)};
    } catch(error) {storageError=String(error.message || error);}
    return state;
  })();return loaded;
}
function save() {
  if(!gm() || !db)return Promise.resolve();
  const payload=clone(state);
  saveTail=saveTail.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
    const transaction=db.transaction('index','readwrite');
    transaction.objectStore('index').put(payload,'state');
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error || Error('Index save interrupted'));
  })).catch(error=>{storageError=String(error.message || error);});
  return saveTail;
}
async function yieldControl() {
  if(performance.now()-lastYield<8)return;
  await sleep(0);lastYield=performance.now();
}
function failWorker(error) {
  workerError=String(error?.message || error);worker?.terminate();worker=null;
  for(const job of pending.values()){clearTimeout(job.timeout);job.reject(Error(workerError));}pending.clear();
}
function workerAnalysis(payload) {
  if(!worker) {
    worker=new Worker(new URL('./campaign-analysis-worker.js',import.meta.url),{type:'module',name:'Tome text analysis'});
    worker.onerror=event=>failWorker(event.message || 'Background analysis failed');
    worker.onmessage=({data})=>{
      const job=pending.get(data.id);if(!job)return;
      clearTimeout(job.timeout);pending.delete(data.id);
      data.error ? job.reject(Error(data.error)) : job.resolve(data.result);
    };
  }
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timeout=setTimeout(()=>failWorker('Background analysis timed out. Retry from Index.'),60000);
    pending.set(id,{resolve,reject,timeout});worker.postMessage({id,payload});
  });
}
async function analyzePage(payload,fallback) {
  await load();
  const key=await digest({revision:REVISION,payload});
  if(state.cache[key]){hits++;state.cache[key].used=Date.now();return clone(state.cache[key].value);}
  misses++;await yieldControl();
  let value;
  if(typeof Worker==='function')value=await workerAnalysis(payload);
  else {workerError='Separate worker unavailable: page analysis runs locally with pauses between pages.';value=fallback();}
  if(!gm())throw Error('GM access changed during analysis.');
  state.cache[key]={pageUuid:payload.page.uuid,value:clone(value),used:Date.now()};
  // Bounded derived cache, with history stored independently from page text.
  const entries=Object.entries(state.cache).sort((a,b)=>b[1].used-a[1].used);
  let bytes=0;
  state.cache=Object.fromEntries(entries.filter((entry,index)=>{bytes+=encode(entry).length*2;return index<256&&bytes<16*1024*1024;}));
  return value;
}
function sourceKind(doc) {
  const type=String(doc.getFlag?.(ID,'type') || '').toLowerCase();
  if(['session','sessions','quest','quests'].includes(type))return type.startsWith('session')?'session':'quest';
  const seen=new Set();
  for(let folder=typeof doc.folder==='object'?doc.folder:game.folders?.get(doc.folder);folder&&!seen.has(folder.id);folder=typeof folder.folder==='object'?folder.folder:game.folders?.get(folder.folder)) {
    seen.add(folder.id);const name=String(folder.name).toLowerCase();
    if(name==='sessions'||name==='quests')return name==='sessions'?'session':'quest';
  }return '';
}
function sourceData(doc) {
  return {uuid:doc.uuid,name:doc.name,kind:sourceKind(doc),ownership:doc.ownership,
    pages:(doc.pages?.contents || []).map(page=>({uuid:page.uuid,name:page.name,sort:page.sort,text:page.text?.content,ownership:page.ownership})),
    policy:doc.getFlag?.(ID,'campaignAutoLinkPolicyV1')};
}
function sourceFingerprint(doc,dep) {
  return {source:sourceData(doc),dep,links:doc.getFlag?.(ID,'campaignEntityLinksV1'),legacyLinks:doc.getFlag?.(ID,'links')};
}
function documents() {
  return [...(game.actors?.contents || []),...(game.items?.contents || []),...(game.journal?.contents || []),...(game.scenes?.contents || [])];
}
function learning() {const value=api().campaignReviewLearning?.all?.() || {};delete value.decisionHistory;return value;}
function dependencies() {
  return {revision:REVISION,language:game.i18n?.lang,learning:learning(),
    identities:documents().filter(doc=>!sourceKind(doc)).map(doc=>({uuid:doc.uuid,name:doc.name,ownership:doc.ownership,
      flags:doc.flags?.[ID] || {worldProfile:doc.getFlag?.(ID,'worldProfile'),actorProfile:doc.getFlag?.(ID,'actorProfile')}})),
    discovered:(api().discovery?.identityCandidates?.() || api().discovery?.snapshot?.()?.entities || []).map(row=>({uuid:row.canonicalUuid,name:row.name,kind:row.kind,aliases:row.aliases}))};
}
function restore() {
  api().campaignMentionDiscovery?.restoreSnapshot?.(state.snapshots.mentions);
  api().campaignNewEntityDiscovery?.restoreSnapshot?.(state.snapshots.candidates);
}
function remember() {
  state.snapshots={mentions:api().campaignMentionDiscovery?.snapshot?.(),candidates:api().campaignNewEntityDiscovery?.snapshot?.()};
  const live=new Set();
  const pausedMap=api().campaignReviewLearning?.matchingPreferences?.()?.pausedIdentities || {};
  const evidence=api().campaignMentionEvidence?.snapshot?.()?.records || [];
  state.ledgerKey=encode(evidence);
  for(const doc of documents()) {
    live.add(doc.uuid);
    const old=state.history[doc.uuid];
    const authority=api().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:doc.uuid})?.authorityUuid || doc.uuid;
    const paused=Boolean(pausedMap[authority]);
    const references=evidence.filter(row=>row.targetUuid===authority).map(row=>({sourceUuid:row.sourceUuid,sourceName:row.sourceName,mention:row.mentionText,snippet:row.snippet}));
    state.history[doc.uuid]={uuid:doc.uuid,name:doc.name,kind:sourceKind(doc)||doc.documentName,status:paused?'archived':'active',firstSeen:old?.firstSeen || Date.now(),lastSeen:Date.now(),references:references.length?references:old?.references || []};
  }
  for(const row of Object.values(state.history))if(!live.has(row.uuid)){row.status='deleted';row.deletedAt ||= Date.now();}
  const pages=new Set((game.journal?.contents || []).flatMap(doc=>(doc.pages?.contents || []).map(page=>page.uuid)));
  for(const [key,entry] of Object.entries(state.cache))if(!pages.has(entry.pageUuid))delete state.cache[key];
}
function historicalForName(name) {
  if(!gm())return [];
  const normalize=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const live=new Set(documents().map(doc=>doc.uuid));
  return clone(Object.values(state.history).filter(row=>!live.has(row.uuid)&&normalize(row.name)===normalize(name)));
}
function request(reason='change') {
  if(!gm())return false;
  // Outputs of this queue are not new source inputs.
  if(running && ['mention-discovery-updated','new-entity-discovery-updated','known-mentions-updated','campaign-link-changed','discovery-updated','deterministic-auto-link-completed'].includes(reason))return true;
  again=true;
  if(!ready||running)return true;
  clearTimeout(timer);timer=setTimeout(()=>{timer=null;void drain();},600);
  return true;
}
async function drain() {
  if(running || !active())return;
  await load();if(running || state.paused || !active())return;
  if(ready && (!api().campaignMentionEvidence?.sync || !api().campaignNewEntityDiscovery?.scan || !api().campaignMentionDiscovery?.scan)) {request('waiting-for-services');return;}
  running=true;again=false;lastError='';completed=0;total=0;
  let stale=false;
  try {
    restore();
    const ledgerKey=encode(api().campaignMentionEvidence?.snapshot?.()?.records || []);
    if(state.ledgerKey!==undefined && state.ledgerKey!==ledgerKey)state.signatures={};
    await api().discovery?.scan?.({context:{reason:'campaign-index'}});
    const sources=(game.journal?.contents || []).filter(doc=>sourceKind(doc));
    const dep=await digest(dependencies());
    const dirty=[];
    for(const doc of sources) {
      const signature=await digest(sourceFingerprint(doc,dep));
      if(state.signatures[doc.uuid]!==signature)dirty.push({doc,signature});
    }
    const removed=Object.keys(state.signatures).filter(uuid=>!sources.some(doc=>doc.uuid===uuid));
    // Full pass removes deleted sources from live snapshots and the ledger.
    if(removed.length) {
      await api().campaignMentionEvidence.sync({rescan:true,allowCreate:false,reason:'index-source-removal',silent:true,assertCurrent:()=>{if(!active())throw Error('GM access changed.');}});
      for(const uuid of removed)delete state.signatures[uuid];
    }
    total=dirty.length;renderStatus();
    for(const {doc} of dirty) {
      if(state.paused||!active())break;
      current=doc.name;renderStatus();await sleep(0);
      const input=encode(sourceData(doc));
      const decisionsAtStart=decisionEpoch;
      const assertCurrent=()=>{
        if(!active() || !game.journal.get(doc.id) || encode(sourceData(doc))!==input || decisionsAtStart!==decisionEpoch) {
          const error=Error('Source changed during analysis; queued again.');error.code='TOME_INDEX_STALE';throw error;
        }
      };
      await api().campaignMentionEvidence.sync({sourceUuid:doc.uuid,rescan:true,allowCreate:true,silent:true,reason:'campaign-index',assertCurrent});
      const linked=await api().campaignDeterministicAutoLink?.scan?.({sourceUuid:doc.uuid,reuseDiscovery:true,reason:'campaign-index',assertCurrent});
      if(linked?.results?.some(row=>row.linked))await api().campaignMentionEvidence.sync({sourceUuid:doc.uuid,reuseDiscovery:true,silent:true,reason:'index-links-updated',assertCurrent});
      assertCurrent();
      state.signatures[doc.uuid]=await digest(sourceFingerprint(doc,dep));
      state.recent=[{name:doc.name,at:Date.now()},...(state.recent || [])].slice(0,10);
      completed++;remember();await save();renderStatus();
    }
    remember();state.ledgerKey=encode(api().campaignMentionEvidence?.snapshot?.()?.records || []);await save();
    // Newly created identities or GM changes invalidate matching, but reuse the
    // pure text cache whenever its inputs still match.
    if(await digest(dependencies())!==dep)again=true;
  } catch(error) {stale=error.code==='TOME_INDEX_STALE';again ||= stale;lastError=stale?'':String(error.message || error);if(!stale)console.warn('Adventurer’s Tome | Index job stopped safely',error);}
  finally {running=false;current='';renderStatus();}
  if(completed && api().app?.()?.rendered && api().app().activeTab!=='campaignToolsIndex')void api().app().render({parts:['main']});
  if(again&&!state.paused&&(!lastError || stale))request('queued-changes');
}
async function pause(value) {await load();state.paused=Boolean(value);await save();renderStatus();if(!value)request('resume');}
async function rebuild() {await load();if(running)throw Error('Pause and wait for the current source before rebuilding.');state.cache={};state.signatures={};state.snapshots={};await save();request('rebuild');}
async function archive(uuid,value) {
  if(!active())throw Error('Only the active GM can change matching preferences.');
  const fn=api().campaignReviewLearning?.setMatchingPolicy;
  if(!fn)throw Error('Matching preferences are unavailable.');
  await fn({targetUuid:uuid,mode:value?'pause':'resume'});remember();await save();request('archive');renderStatus();
}
function status() {return gm()?{running,queued:again,paused:state.paused,current,completed,total,hits,misses,lastError,workerError,storageError,records:clone(Object.values(state.history))}:null;}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderStatus(root) {
  if(!gm())return;
  const hosts=root?.querySelectorAll?.('[data-at-campaign-index]') || document.querySelectorAll('[data-at-campaign-index]');
  for(const host of hosts) {
    // This enhancer replaces its contents outside Foundry's render lifecycle.
    // Removing a long list temporarily clamps every scrolling ancestor to zero.
    const scroll=[];
    for(let node=host;node;node=node.parentElement)scroll.push([node,node.scrollTop,node.scrollLeft]);
    const filter=host.querySelector('input')?.value || '';
    const openDetails=new Set([...host.querySelectorAll('details[open][data-index-details]')].map(node=>node.dataset.indexDetails));
    const wasTyping=document.activeElement===host.querySelector('input');
    const caret=wasTyping?document.activeElement.selectionStart:null;
    const label=state.paused?'Paused':lastError?'Needs attention':running?'Analysing in the background':!active()?'Waiting for the active GM':again?'Changes queued':'Up to date';
    host.innerHTML=`<h2><i class="fa-solid fa-database"></i> Campaign index</h2><p>Analysis is saved on this browser for this world and GM. Foundry documents and your decisions remain authoritative.</p>
      <div class="at-index-status"><strong>${label}</strong><span>${escape(current)}</span><span>${completed} / ${total} sources · ${hits} reused pages · ${misses} analysed pages</span></div>
      <div class="at-index-controls"><button data-index-action="pause">${state.paused?'Continue':'Pause'}</button><button data-index-action="check">Check changes</button><button data-index-action="rebuild" ${running?'disabled':''}>Rebuild analysis index</button></div>
      ${[lastError,workerError,storageError].filter(Boolean).map(error=>`<p role="alert">${escape(error)}</p>`).join('')}
      <p>Archiving pauses automatic matching; existing links and history remain. Deleted documents are historical markers, never usable links. Restore the original Foundry document to keep its identity.</p>
      <details data-index-details="recent"><summary>Recently analysed sources</summary>${(state.recent || []).map(row=>`<p>${escape(row.name)} · ${escape(new Date(row.at).toLocaleString())}</p>`).join('') || '<p>No sources analysed yet.</p>'}</details>
      <label>Search index <input type="search" value="${escape(filter)}" placeholder="Name or status"></label><div class="at-index-records"></div>`;
    const list=host.querySelector('.at-index-records');
    const draw=()=>{
      const term=host.querySelector('input').value.toLowerCase();
      list.innerHTML=Object.values(state.history).filter(row=>`${row.name} ${row.status}`.toLowerCase().includes(term)).sort((a,b)=>a.name.localeCompare(b.name)).map(row=>`<article><span><strong>${escape(row.name)}</strong><small>${row.kind==='Actor'&&row.status==='deleted'?'Historical contact · NPC removed':`${escape(row.kind)} · ${escape(row.status)}`}</small>
        ${row.references?.length?`<details data-index-details="${escape(row.uuid)}"><summary>Last known source references (${row.references.length})</summary>${row.references.map(ref=>`<p><strong>${escape(ref.sourceName)}</strong><br>${escape(ref.snippet || ref.mention)}</p>`).join('')}</details>`:''}</span>
        ${row.status==='deleted'?`<button data-index-forget="${escape(row.uuid)}">Forget index marker</button>`:!['session','quest','Scene'].includes(row.kind)?`<button data-index-archive="${escape(row.uuid)}" data-value="${row.status!=='archived'}">${row.status==='archived'?'Reactivate':'Archive'}</button>`:''}</article>`).join('') || '<p>No matching records.</p>';
    };draw();host.querySelector('input').oninput=draw;
    for(const node of host.querySelectorAll('details[data-index-details]'))node.open=openDetails.has(node.dataset.indexDetails);
    if(wasTyping){const input=host.querySelector('input');input.focus({preventScroll:true});input.setSelectionRange(caret,caret);}
    for(const [node,top,left] of scroll){node.scrollTop=top;node.scrollLeft=left;}
    host.onclick=async event=>{
      const button=event.target.closest('button');if(!button)return;
      try {
        if(button.dataset.indexAction==='pause')await pause(!state.paused);
        if(button.dataset.indexAction==='check')request('manual');
        if(button.dataset.indexAction==='rebuild')await rebuild();
        if(button.dataset.indexArchive)await archive(button.dataset.indexArchive,button.dataset.value==='true');
        if(button.dataset.indexForget){delete state.history[button.dataset.indexForget];await save();renderStatus();}
      }catch(error){ui.notifications.warn(error.message);}
    };
  }
}
globalThis.AdventurersTomeIndex=Object.freeze({request,analyzePage,yieldControl,status,pause,rebuild,archive,drain,historicalForName});
Hooks.once('ready',()=>{
  api().campaignIndex=globalThis.AdventurersTomeIndex;ready=true;
  if(gm())void load().then(()=>{restore();request('ready');});
});
for(const kind of ['Actor','Item','JournalEntry','JournalEntryPage','Scene','Folder'])for(const action of ['create','update','delete'])Hooks.on(`${action}${kind}`,()=>request('document-change'));
Hooks.on('adventurersTomeCampaignLearningUpdated',(event={})=>{if(!['created','campaign-linked'].includes(event.reason))decisionEpoch++;request('gm-decision');});
Hooks.on('updateSetting',()=>request('setting-change'));
Hooks.on('renderApplicationV2',(_app,element)=>renderStatus(element?.[0] || element));
Hooks.on('updateUser',()=>{if(!gm()){failWorker('GM access changed.');state=blank();db?.close();db=null;loaded=null;globalThis.indexedDB?.deleteDatabase(`tome-index:${game.world?.id}:${game.user.id}`);}else request('user-change');});
