import {REVISION,POLICY_REVISION,normalize,chunks,alignTokens,assessText,resolveMention,prepareCatalog,documentStructure,excludedOccurrence} from './testai-language-core.js';
import {worldKnowledge} from './world-knowledge.js';
import {assessWorldReferences} from './world-knowledge-assessment.js';
import {decideReference,referenceKey,documentRole} from './tome-decision-policy.js';
import {NAME_POLICY_REVISION} from './candidate-evidence.js';
const ID='adventurers-tome',DATA='adventurers-tome';
const api=()=>game.modules.get(ID)?.api;
const issued=new WeakMap(),cache=new Map();let worker=null,workerLanguage='',pending=null,serial=0,idle=null,busy=false;
const models={sv:8134707,en:16368326};
let catalogMemo=null,catalogStamp='',catalogBuilds=0,catalogReuses=0;
let preparedMemo=null,preparedSource=null,preparedBuilds=0;
const resolutionMemo=new Map();let resolutionSource=null,resolutionLearning,resolutionKnowledge='';
const invalidateCatalog=()=>{catalogMemo=null;preparedMemo=null;preparedSource=null;resolutionSource=null;resolutionMemo.clear();};
function catalogIndex(entries){
 if(preparedSource!==entries){preparedMemo=prepareCatalog(entries);preparedSource=entries;preparedBuilds++;}
 return preparedMemo;
}
let languageTail=Promise.resolve(),database=null,databaseOwner='',lastFailure='',backoffUntil=0,analyses=0,reuses=0;

function gm(){if(!game.user?.isGM||globalThis.ATTestAI?.conflict)throw Error('Language Lab is available to the GM only.');}
function owner(){return `${game.world?.id||''}:${game.user?.id||''}`;}
function observe(doc){return !!doc&&(game.user?.isGM||doc.testUserPermission?.(game.user,'OBSERVER')===true);}
const flag=(doc,key)=>globalThis.ATTestAI.flags(doc)?.getFlag?.(DATA,key)??doc?.flags?.[DATA]?.[key];
export function sourceKind(doc){const value=String(flag(doc,'type')||'').toLowerCase();return ['session','sessions'].includes(value)?'session':['quest','quests'].includes(value)?'quest':'';}
export function sources(){gm();return (game.journal?.contents||[]).filter(doc=>sourceKind(doc)&&observe(doc));}
function sourceDocument(uuid){const doc=(game.journal?.contents||[]).find(d=>d.uuid===uuid);if(!doc||!sourceKind(doc)||!observe(doc))throw Error('Choose an available Session or Quest.');return doc;}
function sourceSnapshot(doc){return (doc.pages?.contents||[]).filter(p=>p.type==='text'&&observe(p)).sort((a,b)=>(a.sort||0)-(b.sort||0)).map(p=>({uuid:p.uuid,name:p.name,html:String(p.text?.content||'')}));}
function sourceText(pages){return pages.map(p=>globalThis.AdventurersTomeLanguage.plainText(p.html,{paragraphs:true})).join('\n\n');}
export function prepareDocument(html,options={}){return documentStructure(html,globalThis.AdventurersTomeLanguage.plainText,options);}
function catalog(){
 const stamp=JSON.stringify([owner(),Boolean(game.user?.isGM),game.actors?.contents?.length,game.items?.contents?.length,game.journal?.contents?.length,game.scenes?.contents?.length]);
 if(catalogMemo&&catalogStamp===stamp){catalogReuses++;return catalogMemo;}
 catalogBuilds++;
 const all=[...(game.actors?.contents||[]),...(game.items?.contents||[]),...(game.journal?.contents||[]),...(game.scenes?.contents||[])].filter(observe);const byUuid=new Map(all.map(d=>[d.uuid,d]));
 let group=[];try{const raw=globalThis.ATTestAI.settings.get(DATA,'groupActors');group=typeof raw==='string'?JSON.parse(raw):raw;}catch{}
 const groupSet=new Set(Array.isArray(group)?group:[]),identity=api()?.campaignIdentityReconciliation;
 const aliases=new Map();for(const row of (api()?.discovery?.identityCandidates?.()||api()?.discovery?.snapshot?.()?.entities||[])){const key=row.canonicalUuid;if(!byUuid.has(key))continue;aliases.set(key,[...(aliases.get(key)||[]),...(Array.isArray(row.aliases)?row.aliases:[]).filter(a=>typeof a==='string')]);}
 const rows=[];
 for(const doc of all){
  if(doc.documentName==='JournalEntry'&&sourceKind(doc))continue;
  if(doc.documentName==='JournalEntry'&&!flag(doc,'worldProfile')&&!flag(doc,'semanticProjection')&&!flag(doc,'backendProjectionV1')&&!['world','contacts','contact','locations','location','places','place','items','item','lore','factions','faction','npcs','npc'].includes(String(flag(doc,'type')||'').toLowerCase()))continue;
  const migration=flag(doc,'migrationV1'),profile=flag(doc,'actorProfile');
  const role=documentRole(doc);
  const excluded=role==='template'||flag(doc,'testaiIdentityRole')==='non-person'||profile?.kind==='inventory'||Boolean(migration&&/\[inventory\]\s*$/iu.test(doc.name||''));
  const member=doc.documentName==='Actor'&&(flag(doc,'groupMember')===true||flag(doc,'groupMember')!==false&&groupSet.has(doc.id));
  let canonical=doc;try{const authority=identity?.identityFor?.({canonicalUuid:doc.uuid})?.authorityUuid;if(authority&&byUuid.has(authority))canonical=byUuid.get(authority);}catch{}
  const kind=doc.documentName==='Actor'?'character':doc.documentName==='Item'?'item':doc.documentName==='Scene'?'location':String(flag(doc,'worldProfile')?.category||flag(doc,'semanticProjection')?.kind||flag(doc,'type')||'lore').replace(/s$/,'');
  const registered=[flag(doc,'aliases'),profile?.aliases,flag(doc,'worldProfile')?.aliases,flag(doc,'semanticProjection')?.aliases].flatMap(value=>Array.isArray(value)?value.filter(a=>typeof a==='string'):[]);
  const importedPerson=doc.documentName==='Actor'&&migration&&doc.name?.match(/^([^,]+\s+[^,]+),\s*[^,]+\([^()]+\)\s*$/u)?.[1];
  rows.push({uuid:canonical.uuid,name:canonical.name,aliases:[...(aliases.get(doc.uuid)||[]),...registered,...(importedPerson?[importedPerson]:[]),...(canonical.uuid!==doc.uuid?[doc.name]:[])],referenceKey:referenceKey(flag(doc,'worldProfile')?.libraryReference),kind,role,group:member,excluded,paused:api()?.campaignReviewLearning?.isPaused?.(canonical.uuid)===true});
 }
 // Reconcile projection aliases and Group membership without duplicating a person.
 const merged=new Map();for(const row of rows){const old=merged.get(row.uuid);if(old){old.aliases.push(row.name,...row.aliases);old.group ||= row.group;old.referenceKey ||= row.referenceKey;old.excluded &&= row.excluded;if(row.group)old.kind='character';}else merged.set(row.uuid,{...row,aliases:[...row.aliases]});}
 catalogStamp=stamp;catalogMemo=Object.freeze([...merged.values()].map(row=>Object.freeze({...row,aliases:Object.freeze([...row.aliases])})));return catalogMemo;
}
function release(reason='Language analysis stopped.'){
 clearTimeout(idle);idle=null;worker?.terminate();worker=null;workerLanguage='';
 if(pending){clearTimeout(pending.timeout);const job=pending;pending=null;job.reject(Error(reason));}
}
function background(lang,parts,onProgress){
 clearTimeout(idle);
 if(worker&&workerLanguage!==lang)release();
 if(!worker){worker=new Worker(new URL('./testai-udpipe-worker.js',import.meta.url),{type:'module',name:`Tome ${lang}`});workerLanguage=lang;
  worker.onerror=e=>release(e.message||'Language worker failed.');
  worker.onmessage=({data})=>{if(!pending||data.id!==pending.id)return;if(data.progress){pending.progress?.(data);return;}const job=pending;pending=null;clearTimeout(job.timeout);if(data.error){release();job.reject(Error(data.error));}else{job.resolve(data.result);idle=setTimeout(()=>release(),45000);}};
 }
 return new Promise((resolve,reject)=>{const id=++serial;pending={id,resolve,reject,progress:onProgress,timeout:setTimeout(()=>release('Language analysis exceeded its time limit. Try a shorter source.'),120000)};worker.postMessage({id,lang,parts});});
}
async function store(){
 const stamp=owner();if(database&&databaseOwner===stamp)return database;
 database?.close();database=null;databaseOwner=stamp;
 if(!globalThis.indexedDB)return null;
 database=await new Promise((resolve,reject)=>{const request=indexedDB.open(`tome-testai-language:${stamp}:${REVISION}`,1);request.onupgradeneeded=()=>request.result.createObjectStore('evidence');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).catch(()=>null);
 return database;
}
async function cacheKey(text,language){const body=JSON.stringify([REVISION,language,text]);if(!crypto.subtle)return body;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readCache(key){const db=await store();if(!db)return null;return new Promise(resolve=>{const request=db.transaction('evidence').objectStore('evidence').get(key);request.onsuccess=()=>resolve(request.result?.tokens||null);request.onerror=()=>resolve(null);});}
async function writeCache(key,tokens){const db=await store();if(!db)return;await new Promise(resolve=>{const tx=db.transaction('evidence','readwrite'),table=tx.objectStore('evidence');table.put({tokens,at:Date.now()},key);const count=table.count();count.onsuccess=()=>{if(count.result>128){const request=table.openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor)cursor.delete();};}};tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;});}
async function computeEvidence(text,language,onProgress){
 gm();const stamp=owner();const key=await cacheKey(text,language),memoryKey=stamp+key;
 let output=cache.get(memoryKey)||await readCache(key);gm();if(owner()!==stamp)throw Error('World or user changed.');
 if(output){cache.delete(memoryKey);cache.set(memoryKey,output);while(cache.size>16)cache.delete(cache.keys().next().value);reuses++;return {tokens:output,metrics:[],cached:true};}
 const parts=chunks(text,language,game.i18n?.lang),metrics=[];output=[];analyses++;
 for(const lang of ['sv','en']){const selected=parts.map((p,index)=>({...p,index})).filter(p=>p.language===lang);if(!selected.length)continue;
  const result=await background(lang,selected,onProgress);gm();if(owner()!==stamp)throw Error('The world or user changed during analysis.');metrics.push({language:lang,loadMs:result.loadMs,parseMs:result.parseMs,modelBytes:models[lang]});
  for(const entry of result.results){const part=parts[entry.index];output.push(...alignTokens(part.text,entry.tokens,part.start).map(t=>({...t,language:lang})));}
 }
 output.sort((a,b)=>a.start-b.start);cache.set(memoryKey,output);while(cache.size>16)cache.delete(cache.keys().next().value);await writeCache(key,output);return {tokens:output,metrics,cached:false};
}
export function evidenceFor(text,{language='auto',onProgress}={}){
 gm();text=String(text);if(text.length>100000)return Promise.reject(Error('Language input exceeds 100,000 characters.'));if(!['auto','sv','en'].includes(language))return Promise.reject(Error('Unknown text language.'));
 const run=languageTail.catch(()=>{}).then(()=>computeEvidence(text,language,onProgress));languageTail=run;return run;
}
export async function assistText(text,{sourceUuid='',language,structure}={}){
 gm();let output;const stamp=owner();const mode=language||globalThis.ATTestAI.settings.get(ID,'languageMode')||'auto';
 await worldKnowledge.ready();
 try{if(Date.now()<backoffUntil)throw Error(lastFailure||'Language assistance is temporarily unavailable.');output=await evidenceFor(text,{language:mode});lastFailure='';backoffUntil=0;}catch(error){lastFailure=error.message;backoffUntil=Date.now()+60000;console.warn('Tome language assistance unavailable; Tome catalogue matching continues.',error.message);output={tokens:[],metrics:[],cached:false,unavailable:true};}
 gm();if(owner()!==stamp)throw Error('World or user changed.');
 return {...output,...assessWithReferences(text,output.tokens,sourceUuid,structure)};
}
function assessWithReferences(text,tokens,sourceUuid,structure){const entries=catalog(),choice=word=>api()?.campaignReviewLearning?.decisionFor?.(word,{sourceUuid});return assessWorldReferences(text,assessText(text,tokens,entries,choice,structure),worldKnowledge,entries,choice,structure);}
export function resolveCatalogue(text,sourceUuid=''){
 gm();const entries=catalog(),knowledge=worldKnowledge.status().revision;
 const learning=globalThis.ATTestAI.settings.get(DATA,'campaignIntelligenceLearning');
 if(resolutionSource!==entries||resolutionLearning!==learning||resolutionKnowledge!==knowledge){resolutionMemo.clear();resolutionSource=entries;resolutionLearning=learning;resolutionKnowledge=knowledge;}
 const key=JSON.stringify([String(text??''),sourceUuid]);
 if(resolutionMemo.has(key))return structuredClone(resolutionMemo.get(key));
 const result=resolveCatalogueFresh(text,sourceUuid,entries);
 if(resolutionMemo.size>=512)resolutionMemo.delete(resolutionMemo.keys().next().value);
 resolutionMemo.set(key,structuredClone(result));return result;
}
function resolveCatalogueFresh(text,sourceUuid,entries){
 const choice=api()?.campaignReviewLearning?.decisionFor?.(text,{sourceUuid});const result=resolveMention(text,entries,choice,catalogIndex(entries));
 if(!choice){const reference=resolveReference(text,sourceUuid);if(reference.status==='ambiguous')return {status:'ambiguous',target:null,candidates:reference.candidates||[],reason:'library-entity-type-conflict'};if(reference.status==='existing'&&!['ignored'].includes(result.status)&&reference.target.uuid!==sourceUuid)return {status:'matched',target:reference.target,candidates:[reference.target],reason:reference.reason};}
 if(result.status!=='matched'||result.target.uuid===sourceUuid)return {...result,status:result.target?.uuid===sourceUuid?'unknown':result.status};
 return result;
}
export function resolveReference(text,sourceUuid=''){
 gm();const lookup=worldKnowledge.lookup(text),reference=lookup.references?.[0];
 const choice=api()?.campaignReviewLearning?.decisionFor?.(text,{sourceUuid})||(reference&&api()?.campaignReviewLearning?.decisionFor?.(reference.name,{sourceUuid}));
 return decideReference({lookup,catalog:lookup.status==='recognized'?catalog():[],choice});
}
export function excludedUuids(){gm();return catalog().filter(c=>c.excluded).map(c=>c.uuid);}
export async function analyzeSource(sourceUuid,{language='auto',onProgress}={}){
 gm();if(busy)throw Error('A diagnostic analysis is already running.');
 const stamp=owner(),source=sourceDocument(sourceUuid),pages=sourceSnapshot(source),structure=prepareDocument(pages.map(p=>p.html).join('\n'),{sourceName:source.name}),text=structure.text,fingerprint=JSON.stringify(pages);if(!text.trim())throw Error('The source has no readable text.');
 const snapshot=api()?.campaignAnalysisPreview?.snapshotForSource?.(sourceUuid)||{known:[],possibleNew:[]};const baseline={known:(snapshot.known||[]).map(r=>r.text),possibleNew:(snapshot.possibleNew||[]).map(r=>r.text)};busy=true;
 try{const began=performance.now();await worldKnowledge.ready();const interpreter=api()?.integratedInterpretation;const output=interpreter?await interpreter.assistDocument(pages.map(p=>p.html).join("\n"),{sourceUuid,sourceName:source.name,language}):await evidenceFor(text,{language,onProgress});gm();if(owner()!==stamp||JSON.stringify(sourceSnapshot(sourceDocument(sourceUuid)))!==fingerprint)throw Error('The source changed. Run it again.');
  const integrated=output.integrated?output:null;
  const assessed=integrated||assessWithReferences(text,output.tokens,sourceUuid,structure);const result={revision:REVISION,sourceUuid,sourceName:source.name,sourceKind:sourceKind(source),language,baseline,...assessed,...output,elapsedMs:performance.now()-began,readOnly:true};issued.set(result,{stamp,fingerprint,rows:structuredClone(result.rows),text});return result;
 }finally{busy=false;}
}
export async function applyMatch(result,rowIndex,targetUuid){
 gm();const state=issued.get(result);if(!state||state.stamp!==owner())throw Error('Create a current analysis before linking.');
 const source=sourceDocument(result.sourceUuid);if(JSON.stringify(sourceSnapshot(source))!==state.fingerprint)throw Error('The source changed. Run the analysis again.');
 const row=state.rows[rowIndex];if(!row||!row.candidates.some(c=>c.uuid===targetUuid))throw Error('Choose one of the reviewed candidates.');
 const fresh=catalog().find(c=>c.uuid===targetUuid&&!c.excluded);if(!fresh)throw Error('The target is no longer available.');
 const links=api()?.campaignEntityLinks,learning=api()?.campaignReviewLearning;
 if(!links?.linkCanonical||!learning?.chooseForSource)throw Error('Tome linking and source choices must be ready.');
 await links.linkCanonical({sourceUuid:source.uuid,targetUuid});gm();if(owner()!==state.stamp)throw Error('The user or world changed.');
 await learning.chooseForSource({text:row.text,sourceUuid:source.uuid,targetUuid});
 api()?.campaignNewEntityDiscovery?.scan?.({rescanDiscovery:false,rescanMentions:false}).catch(error=>console.warn('Tome language refresh',error));
 return {linked:true,sourceUuid:source.uuid,targetUuid};
}
export function stop(){release();}
export function status(){return {busy,modelLoaded:workerLanguage||null,cacheEntries:cache.size,localOnly:true,automaticAssistance:true,policyRevision:POLICY_REVISION,namePolicyRevision:NAME_POLICY_REVISION,languageEvidenceAvailable:!lastFailure,knowledgeRevision:worldKnowledge.status().revision,analyses,reuses,catalogBuilds,catalogReuses,preparedBuilds,lastFailure,modelWrites:false};}
function attach(){const module=game.modules.get(ID);if(!module)return;module.api||={};module.api.testAILanguage=Object.freeze({analyzeSource,applyMatch,stop,status,sourceKind,sources,evidenceFor,assistText,prepareDocument,excludedOccurrence,resolveCatalogue,resolveReference,excludedUuids,catalogSnapshot:()=>{gm();return structuredClone(catalog());},version:1});}
Hooks.once('ready',()=>{attach();});
Hooks.on('shutdown',()=>{stop();cache.clear();invalidateCatalog();});

Hooks.once('init',()=>globalThis.ATTestAI.settings.register(ID,'languageMode',{name:'Text analysis language',hint:'Automatic uses sentence-level language clues. Override for short or mixed campaign texts.',scope:'world',config:true,type:String,choices:{auto:'Automatic',sv:'Swedish',en:'English'},default:'auto',onChange:()=>globalThis.AdventurersTomeIndex?.request?.('language-mode-change')}));

Hooks.on('updateUser',()=>{if(!game.user?.isGM){stop();cache.clear();database?.close();database=null;}});

// Read projections are reused across mentions, but never across catalogue,
// permission, settings or confirmed-learning changes.
for(const event of ['createActor','updateActor','deleteActor','createItem','updateItem','deleteItem','createJournalEntry','updateJournalEntry','deleteJournalEntry','createScene','updateScene','deleteScene','createFolder','updateFolder','deleteFolder','updateUser','updateSetting','adventurersTomeCampaignDiscoveryUpdated','adventurersTomeCampaignLearningUpdated','adventurersTomeAdapterRegistered','adventurersTomeWorldLibraryReady'])Hooks.on(event,invalidateCatalog);


