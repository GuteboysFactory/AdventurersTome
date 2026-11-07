globalThis.ATTestAI.assertEnabled();
import {globalLearning,sourceLearning} from './analysis-learning-scope.mjs';
import {createIndexDigestPool} from './index-digest-pool.mjs';
// GM-local derived index. Canonical documents and Review learning remain the
// authority; this database can be discarded and rebuilt without losing either.
const ID='adventurers-tome',REVISION='testai-automatic-language-1';
const ANALYSIS_REVISION='tome-integrated-evidence-1';
let state={revision:REVISION,cache:{},signatures:{},history:{},snapshots:{},paused:false};
let loaded=null,db=null,worker=null,serial=0,timer=null,running=false,again=false;
let lastYield=0,workerError='',storageError='',lastError='',current='',completed=0,total=0;
let hits=0,misses=0,ready=false,saveTail=Promise.resolve();
let decisionEpoch=0,queueToken=null;
let requestGeneration=0,forceInputCheck=false;
let checkpointDiagnostics={fallbacks:0,unverifiable:0,byType:{}};
const forcedReasons=new Set();let checkpointDecision={outcome:'not-checked'};
const documentKeyMemo=new Map(),documentKeyEvents=new WeakMap();
let pendingDocumentKeys={},pendingCheckpointParts={};
let batchStarted=null;
const RELATIONSHIP_REVISION='coordinated-relationships-1';
const relationshipSources=new Set(),relationshipDiagnostics={requests:0,runs:0,reuses:0,stale:0,total:0,completed:0};
let relationshipsAll=false,relationshipsInitial=false,settlingLibrary=false,phase='idle';
const queueDiagnostics={requests:0,reschedules:0,batches:0,cappedBatches:0,debounceMs:0,launchGateMs:0,supersededLaunches:0};
const background=()=>globalThis.AdventurersTomeBackground;
const measured=(phase,work)=>globalThis.AdventurersTomeStartup?.measure ? globalThis.AdventurersTomeStartup.measure(phase,work) : work();
function finishQueueTrace(){globalThis.AdventurersTomeStartup?.end(queueToken);queueToken=null;}

const pending=new Map();
let digestPool=null;
const clone=value=>structuredClone(value);
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api || {};
const analysisPolicy=()=>[ANALYSIS_REVISION,api().testAILanguage?.status?.()?.policyRevision||'no-language-policy',api().testAILanguage?.status?.()?.knowledgeRevision||'none',api().integratedInterpretation?.status?.()?.revision||'unavailable'].join(':');
const gm=()=>Boolean(game.user?.isGM);
const active=()=>gm() && (!game.users?.activeGM || game.users.activeGM.id===game.user.id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const blank=()=>({revision:REVISION,cache:{},signatures:{},history:{},snapshots:{},paused:false});
function encode(value) {return JSON.stringify(value,(_key,v)=>v instanceof Set ? [...v].sort() : v instanceof Map ? [...v.entries()] : v);}
async function digest(value,offload=true) {
  if(offload&&typeof Worker==='function'){
    const scope=()=>`${game.world?.id||''}:${game.user?.id||''}`,expected=scope();
    digestPool||=createIndexDigestPool({owner:scope,allowed:active});
    try{const result=await digestPool.digest(value,Boolean(globalThis.crypto?.subtle));background()?.noteAsyncYield?.();return result;}
    catch(error){if(!active()||scope()!==expected)throw error;workerError=String(error.message||error);}
  }
  const text=encode(value);
  // Foundry can run on a LAN HTTP origin without SubtleCrypto. Exact keys are
  // larger but collision-free, and remain inside the same bounded private DB.
  if(!globalThis.crypto?.subtle)return `exact:${text}`;
  const bytes=new TextEncoder().encode(text);
  const result=await crypto.subtle.digest('SHA-256',bytes);background()?.noteAsyncYield?.();
  return `sha256:${[...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
async function load() {
  if(!gm())throw Error('The campaign index is GM-only.');
  if(loaded)return loaded;
  loaded=(async()=>{
    const token=globalThis.AdventurersTomeStartup?.begin("index-storage-load");
    try {
      const world=game.world?.id;
      const user=game.user.id;
      if(!world || !globalThis.indexedDB)throw Error('Persistent browser storage is unavailable; this run uses memory only.');
      db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(`tome-testai-index:${world}:${game.user.id}`,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('index');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      const saved=await new Promise((resolve,reject)=>{
        const request=db.transaction('index').objectStore('index').get('state');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      if(!gm()||game.world?.id!==world||game.user.id!==user)throw Error('Index owner changed while loading.');
      if(saved?.revision===REVISION && ['cache','signatures','history','snapshots'].every(key=>saved[key]&&typeof saved[key]==='object'&&!Array.isArray(saved[key])))state=saved;
      else if(saved)state={...blank(),history:saved.history || {},paused:Boolean(saved.paused)};
    } catch(error) {storageError=String(error.message || error);}
    finally {globalThis.AdventurersTomeStartup?.end(token);}
    return state;
  })();return loaded;
}
function save() {
  if(!gm() || !db)return Promise.resolve();
  const payload=clone(state);
  saveTail=saveTail.catch(()=>{}).then(()=>measured('index-storage-save',()=>new Promise((resolve,reject)=>{
    const transaction=db.transaction('index','readwrite');
    transaction.objectStore('index').put(payload,'state');
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error || Error('Index save interrupted'));
  }))).catch(error=>{storageError=String(error.message || error);});
  return saveTail;
}
async function yieldControl() {
  if(background()){await background().checkpoint();return;}
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
  const key=await digest({revision:REVISION,analysisPolicy:analysisPolicy(),payload});
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
  if(globalThis.ATTestAI.flags(doc).getFlag?.(ID,'chronicleV1'))return '';
  const type=String(globalThis.ATTestAI.flags(doc).getFlag?.(ID,'type') || '').toLowerCase();
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
    policy:globalThis.ATTestAI.flags(doc).getFlag?.(ID,'campaignAutoLinkPolicyV1')};
}
function sourceFingerprint(doc,dep) {
  return {source:sourceData(doc),dep,learning:sourceLearning(learning(),doc.uuid),links:globalThis.ATTestAI.flags(doc).getFlag?.(ID,'campaignEntityLinksV1'),legacyLinks:globalThis.ATTestAI.flags(doc).getFlag?.(ID,'links')};
}
function documents() {
  return [...(game.actors?.contents || []),...(game.items?.contents || []),...(game.journal?.contents || []),...(game.scenes?.contents || [])].filter(doc=>!globalThis.ATTestAI.flags(doc).getFlag?.(ID,'chronicleV1'));
}
function learning() {const value=api().campaignReviewLearning?.all?.() || {};delete value.decisionHistory;return value;}
function identityFlags(doc){
  const flags=clone(doc.flags?.[ID]||{worldProfile:globalThis.ATTestAI.flags(doc).getFlag?.(ID,'worldProfile'),actorProfile:globalThis.ATTestAI.flags(doc).getFlag?.(ID,'actorProfile')});
  // These are products of matching, not new identity inputs. Keep all unknown
  // flags and all relationship/source references conservatively as inputs.
  for(const key of ['links','campaignEntityLinksV1','campaignAutoLinkEvidenceV1'])delete flags[key];
  if(flags.semanticProjection)delete flags.semanticProjection.lastSeenAt;
  return flags;
}
async function dependencies() {
  const identities=[];
  for(const doc of documents().filter(doc=>!sourceKind(doc))){await yieldControl();identities.push({uuid:doc.uuid,name:doc.name,ownership:doc.ownership,flags:identityFlags(doc)});}
  return {revision:REVISION,analysisPolicy:analysisPolicy(),language:game.i18n?.lang,testAILanguage:globalThis.ATTestAI.settings.get('adventurers-tome','languageMode'),learning:globalLearning(learning()),
    identities,interpretation:api().integratedInterpretation?.policyInputs?.()||null,
    discovered:(api().discovery?.identityCandidates?.() || api().discovery?.snapshot?.()?.entities || []).map(row=>({uuid:row.canonicalUuid,name:row.name,kind:row.kind,aliases:row.aliases}))};
}
// Compare persisted modification markers before opening the heavyweight
// discovery/analysis pipeline. Embedded/imported documents may legitimately
// lack timestamps: hash their saved source, never trust only the parent's date.
async function inputCheckpoint(){
  const markers=[],documentKeys={};let usable=true,keyBytes=0;
  const scope=encode([game.world?.id,game.user?.id]);
  const checkAccess=()=>{if(!active()||scope!==encode([game.world?.id,game.user?.id]))throw Object.assign(Error('Index owner changed during validation.'),{code:'TOME_INDEX_STALE'});};
  const diagnostics={fallbacks:0,unverifiable:0,byType:{},contentReads:0,contentReuses:0,timestampOnlyChanges:0,changedBodies:0};
  for(const doc of [...documents(),...(game.folders?.contents||[])]){
    const children=[doc,...(doc.pages?.contents||[]),...(doc.items?.contents||[])];
    for(const child of children){const modified=child._stats?.modifiedTime??child._source?._stats?.modifiedTime;
      checkAccess();
      if(!child.uuid){usable=false;diagnostics.unverifiable++;}
      else {
        const old=state.documentCheckpoint?.[child.uuid],memo=documentKeyMemo.get(child.uuid)||old;
        const event=documentKeyEvents.get(child)||0;let key,mode;
        if(Number.isFinite(modified)&&memo?.mode==='source'&&memo.modified===modified&&(memo.event||0)===event&&(!memo.document||memo.document===child)){
          key=memo.key;mode='source';diagnostics.contentReuses++;
        }else{
          let raw;try{raw=child._source||(typeof child.toObject==='function'?child.toObject():null);}catch{}
          if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length){
            const source={...raw};
            // Embedded pages/items have their own rows. Avoid hashing them
            // twice through their parent's snapshot.
            if(child.pages?.contents)delete source.pages;if(child.items?.contents)delete source.items;
            if(source._stats){source._stats={...source._stats};for(const field of ['modifiedTime','lastModifiedBy','modifiedBy'])delete source._stats[field];if(!Object.keys(source._stats).length)delete source._stats;}
            key=await digest(source);checkAccess();mode='source';diagnostics.contentReads++;
          }else if(Number.isFinite(modified)){key=modified;mode='timestamp';}
          else{usable=false;diagnostics.unverifiable++;}
        }
        if(mode){
          keyBytes+=String(key).length*2+child.uuid.length*2+64;
          if(keyBytes<=8*1024*1024){markers.push([child.uuid,mode,key]);documentKeys[child.uuid]={modified,key,mode};if(mode==='source')documentKeyMemo.set(child.uuid,{modified,key,mode,event,document:child});}
          else{usable=false;diagnostics.metadataLimit=true;}
          if(!Number.isFinite(modified)){diagnostics.fallbacks++;const kind=child.documentName||'Document';diagnostics.byType[kind]=(diagnostics.byType[kind]||0)+1;}
          if(old?.mode==='source'&&mode==='source'){if(old.key!==key)diagnostics.changedBodies++;else if(old.modified!==modified)diagnostics.timestampOnlyChanges++;}
        }
      }
      await yieldControl();}
  }
  const worldSettings=[];
  for(const [key,definition]of globalThis.ATTestAI.settings.settings||[]){
    if(definition.scope!=='world')continue;const dot=key.indexOf('.');if(dot<0)continue;
    worldSettings.push([key,globalThis.ATTestAI.settings.get(key.slice(0,dot),key.slice(dot+1))]);await yieldControl();
  }
  const modules=[...(game.modules?.values?.()||[])].filter(module=>module.active).map(module=>[module.id,module.version]).sort();
  checkpointDiagnostics=diagnostics;
  for(const uuid of documentKeyMemo.keys()){if(!Object.hasOwn(documentKeys,uuid))documentKeyMemo.delete(uuid);await yieldControl();checkAccess();}
  const parts={documents:markers.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),settings:worldSettings.sort(),modules,
    platform:[game.system?.id,game.system?.version,game.version,game.i18n?.lang],analysisPolicy:analysisPolicy(),learning:learning(),interpretation:api().integratedInterpretation?.policyInputs?.()||null,ledger:api().campaignMentionEvidence?.snapshot?.()?.records||[]};
  pendingDocumentKeys=documentKeys;pendingCheckpointParts={};
  for(const [name,value]of Object.entries(parts)){pendingCheckpointParts[name]=await digest(value,true);await yieldControl();checkAccess();}
  return usable?digest({schema:3,parts:pendingCheckpointParts}):null;
}
function restore() {
  if(state.snapshotPolicy!==analysisPolicy())return;
  api().campaignMentionDiscovery?.restoreSnapshot?.(state.snapshots.mentions);
  api().campaignNewEntityDiscovery?.restoreSnapshot?.(state.snapshots.candidates);
}
async function remember() {
  state.snapshotPolicy=analysisPolicy();
  state.snapshots={mentions:api().campaignMentionDiscovery?.snapshot?.(),candidates:api().campaignNewEntityDiscovery?.snapshot?.()};
  const live=new Set();
  const pausedMap=api().campaignReviewLearning?.matchingPreferences?.()?.pausedIdentities || {};
  const evidence=api().campaignMentionEvidence?.snapshot?.()?.records || [];
  const referencesByTarget=new Map();
  for(const row of evidence){const entries=referencesByTarget.get(row.targetUuid)||[];entries.push({sourceUuid:row.sourceUuid,sourceName:row.sourceName,mention:row.mentionText,snippet:row.snippet});referencesByTarget.set(row.targetUuid,entries);await yieldControl();}
  state.ledgerKey=encode(evidence);
  for(const doc of documents()) {
    await yieldControl();if(!active())throw Error('GM access changed.');
    live.add(doc.uuid);
    const old=state.history[doc.uuid];
    const authority=api().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:doc.uuid})?.authorityUuid || doc.uuid;
    const paused=Boolean(pausedMap[authority]);
    const references=referencesByTarget.get(authority)||[];
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
function contentCheckpointCovers(doc){
  if(!doc?.uuid||doc.pack)return false;
  if(typeof doc.toObject!=='function'&&(!doc._source||typeof doc._source!=='object'))return false;
  const root=doc.parent||doc;if(root.pack)return false;
  const collection={Actor:game.actors,Item:game.items,JournalEntry:game.journal,Scene:game.scenes,Folder:game.folders}[root.documentName];
  if(collection?.get?.(root.id)!==root)return false;
  if(root===doc)return true;
  const children=root.documentName==='Actor'?root.items?.contents:root.documentName==='JournalEntry'?root.pages?.contents:null;
  return Boolean(children?.some(child=>child===doc&&child.uuid===doc.uuid));
}
function request(reason='change',event={}) {
  if(!gm())return false;
  if(reason==='world-reference-changed'&&settlingLibrary)return true;
  // Outputs of this queue are not new source inputs.
  if(running && ['mention-discovery-updated','new-entity-discovery-updated','known-mentions-updated','campaign-link-changed','discovery-updated','deterministic-auto-link-completed'].includes(reason))return true;
  if(event.document&&typeof event.document==='object')documentKeyEvents.set(event.document,(documentKeyEvents.get(event.document)||0)+1);
  // Do not infer a change from an update notification alone when the complete
  // saved content of that exact live document participates in the checkpoint.
  // A changed body still changes the key. Unknown, pack, create/delete
  // and policy inputs retain the conservative forced validation path.
  const contentChecked=reason==='document-change'&&event.action==='update'&&contentCheckpointCovers(event.document);
  if(contentChecked)globalThis.AdventurersTomeStartup?.count('index-queue','contentChecksQueued');
  if(['document-change','gm-decision','setting-change','manual','rebuild','archive','user-change'].includes(reason)&&!contentChecked){forceInputCheck=true;forcedReasons.add(reason);globalThis.AdventurersTomeStartup?.count('index-queue','forced.'+reason);}
  again=true;
  if(!ready||running)return true;
  queueDiagnostics.requests++;
  const now=performance.now();if(batchStarted===null)batchStarted=now;
  if(timer)queueDiagnostics.reschedules++;
  if(timer)globalThis.AdventurersTomeStartup?.count('index-queue','coalescedCalls');
  if(!queueToken)queueToken=globalThis.AdventurersTomeStartup?.begin('index-queue');
  const generation=++requestGeneration;
  // Keep the quiet window, but never let a stream of updates reset it forever.
  // Changes during validation still set again and require a fresh pass.
  const delay=Math.max(0,Math.min(600,2000-(now-batchStarted)));
  clearTimeout(timer);timer=setTimeout(()=>{timer=null;finishQueueTrace();
    const elapsed=performance.now()-batchStarted;batchStarted=null;queueDiagnostics.batches++;queueDiagnostics.debounceMs+=elapsed;if(elapsed>=2000)queueDiagnostics.cappedBatches++;
    const gateStarted=performance.now();
    const launch=()=>{queueDiagnostics.launchGateMs+=performance.now()-gateStarted;if(generation===requestGeneration)void drain();else queueDiagnostics.supersededLaunches++;};
    if(background())void background().wait('index-launch').then(launch).catch(()=>{});else launch();
  },delay);
  return true;
}
function requestRelationships({sourceUuid='',initial=false}={}) {
  if(!gm()||!api().campaignRelationshipEvidence?.sync)return false;
  relationshipDiagnostics.requests++;
  if(initial)relationshipsInitial=true;
  else if(/^JournalEntry\.[^.]+$/.test(sourceUuid))relationshipSources.add(sourceUuid);
  else relationshipsAll=true;
  // Publications from the active matching pass are consumed at its end. They
  // must not launch a second worker or invalidate that pass's checkpoint.
  if(!running)request('relationship-change');
  return true;
}
async function flushRelationships(){
  const service=api().campaignRelationshipEvidence;if(!service?.sync){if(relationshipsInitial||relationshipsAll||relationshipSources.size)throw Error('Relationship analysis service is unavailable.');return;}
  if(relationshipsInitial){relationshipsInitial=false;if(state.relationshipRevision!==RELATIONSHIP_REVISION)relationshipsAll=true;else relationshipDiagnostics.reuses++;}
  if(!relationshipsAll&&!relationshipSources.size)return;
  const all=relationshipsAll,previouslyComplete=state.relationshipRevision===RELATIONSHIP_REVISION||state.relationshipBasis===RELATIONSHIP_REVISION,pending=new Set(relationshipSources);relationshipsAll=false;relationshipSources.clear();
  if(previouslyComplete)state.relationshipBasis=RELATIONSHIP_REVISION;
  state.relationshipRevision=null;
  if(all){
    state.relationshipRevision=null;
    for(const doc of game.journal?.contents||[])if(sourceKind(doc))pending.add(doc.uuid);
    for(const row of service.snapshot?.()?.evidence||[])if(/^JournalEntry\.[^.]+$/.test(row.sourceUuid))pending.add(row.sourceUuid);
  }
  const work=[...pending];let position=0;
  try {
    phase='relationships';relationshipDiagnostics.total=work.length;relationshipDiagnostics.completed=0;renderStatus();
    for(;position<work.length;position++){
      if(state.paused||!active())break;
      current=game.journal.get(work[position].split('.')[1])?.name || 'Removed source';renderStatus();
      await service.sync({sourceUuid:work[position],reason:'campaign-index'});
      // The committed result has checked the current inputs. Same-source
      // notifications received during that job are already covered by it.
      relationshipSources.delete(work[position]);relationshipDiagnostics.runs++;relationshipDiagnostics.completed++;renderStatus();
    }
    if(position===work.length&&(all||previouslyComplete)&&!relationshipSources.size&&!relationshipsAll&&!relationshipsInitial){state.relationshipRevision=RELATIONSHIP_REVISION;state.relationshipBasis=RELATIONSHIP_REVISION;}
  }catch(error){if(error.code==='TOME_INDEX_STALE')relationshipDiagnostics.stale++;throw error;}
  finally{if(gm()){for(const source of work.slice(position))relationshipSources.add(source);if(all&&position<work.length)relationshipsAll=true;}else{relationshipSources.clear();relationshipsAll=false;relationshipsInitial=false;}}
}
async function drain() {
  if(running || !active())return;
  finishQueueTrace();
  const startupToken=globalThis.AdventurersTomeStartup?.begin("index-drain");
  try {
  await load();if(running || state.paused || !active())return;
  if(ready && (!api().campaignMentionEvidence?.sync || !api().campaignNewEntityDiscovery?.scan || !api().campaignMentionDiscovery?.scan)) {request('waiting-for-services');return;}
  running=true;phase='checking';again=false;lastError='';completed=0;total=0;renderStatus();
  let stale=false;
  try {
    // Compare against the selected library's settled revision, never the
    // temporary empty revision while its local pack is still loading.
    settlingLibrary=true;
    try{do{await api().worldKnowledge?.ready?.();if(!active())return;}while(api().worldKnowledge?.status?.()?.loading===true);}
    finally{settlingLibrary=false;}
    restore();
    const force=forceInputCheck,reasons=[...forcedReasons];forceInputCheck=false;forcedReasons.clear();const checkpoint=await inputCheckpoint();
    checkpointDecision={usable:Boolean(checkpoint),saved:Boolean(state.inputCheckpoint),matches:Boolean(checkpoint&&checkpoint===state.inputCheckpoint),forcedReasons:reasons,
      changedParts:Object.keys(pendingCheckpointParts).filter(name=>state.inputCheckpointParts?.[name]!==pendingCheckpointParts[name]),queuedDuringCheck:again,outcome:'validate'};
    if(checkpoint&&checkpoint===state.inputCheckpoint&&!again&&!force){
      globalThis.AdventurersTomeStartup?.count('index-checkpoint','unchangedRestarts');
      checkpointDecision.outcome='reused';
      state.documentCheckpoint=pendingDocumentKeys;state.inputCheckpointParts=pendingCheckpointParts;
    }else{
    state.inputCheckpoint=null;
    const ledgerKey=encode(api().campaignMentionEvidence?.snapshot?.()?.records || []);
    if(state.ledgerKey!==undefined && state.ledgerKey!==ledgerKey)state.signatures={};
    await api().discovery?.scan?.({context:{reason:'campaign-index'}});
    const sources=(game.journal?.contents || []).filter(doc=>sourceKind(doc));
    const dep=await measured('index-fingerprint',async()=>digest(await dependencies(),true));
    const dirty=[];
    for(const doc of sources) {
      await yieldControl();
      const signature=await digest(sourceFingerprint(doc,dep));
      if(state.signatures[doc.uuid]!==signature)dirty.push({doc,signature});
    }
    const removed=Object.keys(state.signatures).filter(uuid=>!sources.some(doc=>doc.uuid===uuid));
    // Full pass removes deleted sources from live snapshots and the ledger.
    if(removed.length) {
      await api().campaignMentionEvidence.sync({rescan:true,allowCreate:false,reason:'index-source-removal',silent:true,assertCurrent:()=>{if(!active())throw Error('GM access changed.');}});
      for(const uuid of removed)delete state.signatures[uuid];
    }
    total=dirty.length;phase='matching';renderStatus();
    for(const {doc} of dirty) {
      if(state.paused||!active())break;
      current=doc.name;renderStatus();if(background())await background().wait();else await sleep(0);
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
      completed++;renderStatus();
    }
    await remember();state.ledgerKey=encode(api().campaignMentionEvidence?.snapshot?.()?.records || []);
    // Newly created identities or GM changes invalidate matching, but reuse the
    // pure text cache whenever its inputs still match.
    if(await digest(await dependencies(),true)!==dep)again=true;
    if(!again&&!state.paused&&completed===total){const checkpoint=await inputCheckpoint();if(!again&&!state.paused){state.inputCheckpoint=checkpoint;state.documentCheckpoint=pendingDocumentKeys;state.inputCheckpointParts=pendingCheckpointParts;}}
    }
    if(!again&&!state.paused&&active())await flushRelationships();
    if(relationshipSources.size||relationshipsAll||relationshipsInitial)again=true;
    await save();
  } catch(error) {stale=error.code==='TOME_INDEX_STALE';again ||= stale;lastError=stale?'':String(error.message || error);if(!stale)console.warn('Adventurer’s Tome | Index job stopped safely',error);}
  finally {running=false;phase='idle';current='';renderStatus();}
  if(completed && api().app?.()?.rendered && api().app().activeTab!=='campaignToolsIndex')void api().app().render({parts:['main']});
  if(again&&!state.paused&&(!lastError || stale))request('queued-changes');
  } finally {globalThis.AdventurersTomeStartup?.end(startupToken);}
}
async function pause(value) {await load();state.paused=Boolean(value);await save();renderStatus();if(!value)request('resume');}
async function rebuild() {await load();if(running)throw Error('Pause and wait for the current source before rebuilding.');state.cache={};state.signatures={};state.snapshots={};state.inputCheckpoint=null;await save();request('rebuild');}
async function archive(uuid,value) {
  if(!active())throw Error('Only the active GM can change matching preferences.');
  const fn=api().campaignReviewLearning?.setMatchingPolicy;
  if(!fn)throw Error('Matching preferences are unavailable.');
  await fn({targetUuid:uuid,mode:value?'pause':'resume'});await remember();await save();request('archive');renderStatus();
}
function status() {return gm()?{running,phase,queued:again,paused:state.paused,current,completed,total,hits,misses,lastError,workerError,storageError,checkpointReady:Boolean(state.inputCheckpoint),checkpointDiagnostics:clone(checkpointDiagnostics),checkpointDecision:clone(checkpointDecision),queueDiagnostics:clone(queueDiagnostics),relationships:{...relationshipDiagnostics,pendingSources:relationshipSources.size,all:relationshipsAll},background:background()?.status?.(),records:clone(Object.values(state.history))}:null;}

Hooks.once('shutdown',()=>{digestPool?.dispose();digestPool=null;});
Hooks.on('updateUser',()=>{if(!active()){digestPool?.dispose();digestPool=null;}});
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
    const label=state.paused?'Paused':lastError?'Needs attention':running?(phase==='checking'?'Checking for changes':phase==='relationships'?'Updating relationships in the background':'Analysing in the background'):!active()?'Waiting for the active GM':again?'Changes queued':'Up to date';
    host.innerHTML=`<h2><i class="fa-solid fa-database"></i> Campaign index</h2><p>Analysis is saved on this browser for this world and GM. Foundry documents and your decisions remain authoritative.</p>
      <div class="at-index-status ${lastError||workerError||storageError?'has-error':state.paused?'is-paused':running?'is-running':''}"><strong>${label}</strong><span>${escape(current)}</span><span>${phase==='relationships'?relationshipDiagnostics.completed:completed} / ${phase==='relationships'?relationshipDiagnostics.total:total} ${phase==='relationships'?'relationship sources':'sources'} · ${hits} reused pages · ${misses} analysed pages</span></div>
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
globalThis.AdventurersTomeIndex=Object.freeze({request,requestRelationships,analyzePage,yieldControl,status,pause,rebuild,archive,drain,historicalForName});
Hooks.once('ready',()=>{
  api().campaignIndex=globalThis.AdventurersTomeIndex;ready=true;
  if(gm())void (async()=>{if(background())await background().wait('index-ready');if(!gm())return;await load();if(!gm())return;restore();if(api().campaignRelationshipEvidence?.sync)relationshipsInitial=true;request('ready');})().catch(error=>{storageError=String(error.message||error);});
});
for(const kind of ['Actor','Item','JournalEntry','JournalEntryPage','Scene','Folder'])for(const action of ['create','update','delete'])Hooks.on(`${action}${kind}`,(doc)=>{globalThis.AdventurersTomeStartup?.count('index-queue',`invalidations.${action}${kind}`);if(!globalThis.ATTestAI.flags(doc)?.getFlag?.(ID,'chronicleV1')&&!globalThis.ATTestAI.flags(doc?.parent)?.getFlag?.(ID,'chronicleV1'))request('document-change',{document:doc,action});});
Hooks.on('adventurersTomeCampaignLearningUpdated',(event={})=>{if(!['created','campaign-linked'].includes(event.reason))decisionEpoch++;request('gm-decision');});
Hooks.on('updateSetting',setting=>{
  const key=setting?.key;
  if(!key)return;
  // Client presentation and private account settings cannot change campaign
  // matching. In particular, saving the observed window must not start a job.
  const localKeys=['windowState','windowMode','tomeTransparency','launcherPosition','favorites','recentItems','recentRefs','lastActiveTab','playerChronicleV1'];
  if(localKeys.some(name=>key===`${ID}.${name}`))return;
  const scope=globalThis.ATTestAI.settings.settings?.get(key)?.scope;
  if(scope==='client'||scope==='user')return;
  request('setting-change');
});
Hooks.on('renderApplicationV2',(_app,element)=>renderStatus(element?.[0] || element));
Hooks.on('updateUser',()=>{if(!gm()){failWorker('GM access changed.');state=blank();relationshipSources.clear();relationshipsAll=false;relationshipsInitial=false;documentKeyMemo.clear();pendingDocumentKeys={};pendingCheckpointParts={};db?.close();db=null;loaded=null;globalThis.indexedDB?.deleteDatabase(`tome-testai-index:${game.world?.id}:${game.user.id}`);}else{if(api().campaignRelationshipEvidence?.sync)relationshipsInitial=true;request('user-change');}});
