import {interpretSource} from './interpretation-engine.js';
import {documentMap,structureFromMap,roleKey} from './source-document-map.js';
import {createLanguagePool} from './language-analysis-pool.js';
import {createFeedbackLedger} from './interpretation-feedback.js';
import {decisionRows,discoveryGroups,sameDecision,writeDisposition,INTEGRATED_REVISION} from './interpretation-contract.js';
const ID='adventurers-tome',api=()=>game.modules.get(ID)?.api;
const owner=()=>`${game.world?.id||''}:${game.user?.id||''}`;
const allowed=()=>game.user?.isGM===true&&!globalThis.ATTestAI?.conflict;
const active=()=>allowed()&&(!game.users?.activeGM||game.users.activeGM.id===game.user.id);
const cache=new Map();let pool,epoch=0,analyses=0,reuses=0,writes=0,lastError='',writeTail=Promise.resolve(),cacheOwner='';
const ledger=createFeedbackLedger({owner,allowed});
const deletionSlot=()=>`tome-interpretation-deletions:${owner()}`;
let deletionStorageFailed=false;
function deleted(){const value=JSON.parse(localStorage.getItem(deletionSlot())||'[]');if(!Array.isArray(value))throw Error('Invalid deletion history.');return value;}
function historical(text){
 const ref=api().worldKnowledge.lookup(text).references?.[0],names=[text,ref?.name,...(ref?.aliases||[])].filter(Boolean),keys=new Set(names.map(roleKey));
 return [...names.flatMap(name=>globalThis.AdventurersTomeIndex?.historicalForName?.(name)||[]),...deleted().filter(d=>keys.has(roleKey(d.name)))];
}
function recordDeletion(doc){if(!allowed()||doc.pack||doc.parent)return;
 try{const rows=deleted().filter(d=>d.uuid!==doc.uuid);rows.push({uuid:doc.uuid,name:doc.name,deleted:true});
  if(rows.length>2000)throw Error('Deletion history is full.');localStorage.setItem(deletionSlot(),JSON.stringify(rows));
 }catch(error){deletionStorageFailed=true;lastError=error.message;}invalidate();
}
function check(stamp){if(!allowed()||owner()!==stamp)throw Error('Interpretation owner changed.');}
function invalidate(){epoch++;if(cacheOwner!==owner()||!allowed()){cache.clear();pool?.dispose();pool=null;cacheOwner=owner();}if(pool?.status().closed){pool=null;}}
function inputs(){return JSON.stringify([owner(),api().testAILanguage.catalogSnapshot(),api().campaignReviewLearning?.all?.(),api().worldKnowledge.status().revision,ledger.all(),deleted()]);}
async function assessDocument(html,{sourceUuid,sourceName='',sourcePageUuid='',language}={}){
 if(String(html).length>500000)throw Error('This page exceeds the supported analysis size. Split it into smaller pages.');
 const stamp=owner();check(stamp);await api().worldKnowledge.ready();check(stamp);
 const mode=language||globalThis.ATTestAI.settings.get(ID,'languageMode')||'auto';
 if(!['auto','sv','en'].includes(mode))throw Error('Unknown analysis language.');
 const signature=inputs(),key=JSON.stringify([signature,sourceUuid,sourcePageUuid,sourceName,html,mode]);
 if(cache.has(key)){reuses++;const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
 const generation=epoch;
 pool||=createLanguagePool({owner,allowed,idleMs:45000});
 const work=interpretSource({html,sourceUuid,sourceName,catalog:api().testAILanguage.catalogSnapshot(),knowledge:api().worldKnowledge,
  choiceFor:text=>api().campaignReviewLearning?.decisionFor?.(text,{sourceUuid}),
  historyFor:historical,feedback:ledger.all(),language:{assistText:(text,options)=>pool.assistText(text,{...options,language:mode})}});
 cacheOwner=stamp;cache.set(key,work);while(cache.size>16)cache.delete(cache.keys().next().value);
 try{const result=await work;check(stamp);if(generation!==epoch&&signature!==inputs())throw Object.assign(Error('Interpretation inputs changed; retry the source.'),{code:'TOME_INDEX_STALE'});
  analyses++;return result;
 }catch(error){cache.delete(key);lastError=error.message;throw error;}
}
async function assistDocument(html,options){
 const result=await assessDocument(html,options),structure=structureFromMap(result.map);
 return {integrated:true,policyRevision:INTEGRATED_REVISION,structure,text:result.map.text,rows:decisionRows(result),
  tokens:result.tokens||[],worldReferences:[],filtered:result.diagnostics,metrics:[],result};
}
async function current(row){
 const source=await fromUuid(row.sourceJournalUuid),page=source?.pages?.contents?.find(p=>p.uuid===row.sourcePageUuid);
 let sourceKind=source&&api().testAILanguage.sourceKind(source);const seen=new Set();
 for(let folder=source?.folder;!sourceKind&&folder&&!seen.has(folder.id);folder=folder.folder){seen.add(folder.id);if(['sessions','quests'].includes(String(folder.name).toLowerCase()))sourceKind='campaign-source';}
 if(!source||source.pack||!page||!sourceKind||globalThis.ATTestAI.flags(source)?.getFlag('adventurers-tome','chronicleV1'))return null;
 if(!allowed()||page.type!=='text')return null;
 // Re-read exact content; cached plans never authorize a changed source.
 const html=page.text.content||'',result=await assessDocument(html,{sourceUuid:source.uuid,sourceName:source.name,sourcePageUuid:page.uuid});
 if(page.text.content!==html)throw Object.assign(Error('Source changed before commit.'),{code:'TOME_INDEX_STALE'});return result;
}
async function resolveNow(row,options={}){
 const stamp=owner();check(stamp);options.assertCurrent?.();
 const interpreted=await current(row),decision=interpreted&&sameDecision(interpreted,row),plan=writeDisposition(decision);
 const result={...row,outcome:plan.outcome==='CREATE'?'REVIEW':plan.outcome,outcomeReason:plan.reason,targetUuid:'',
  identityCandidates:(plan.candidates||[]).map(c=>({name:c.name,kind:c.kind,canonicalUuid:c.uuid})),identityAmbiguous:decision?.reason?.includes('conflict')||decision?.candidates?.length>1};
 if(!active())return {...result,outcome:'REVIEW',outcomeReason:'active-gm-required'};
 if(plan.outcome==='LINKED'){
  const target=await fromUuid(plan.targetUuid);check(stamp);options.assertCurrent?.();
  if(!target||target.parent||target.pack||!['Actor','Item','JournalEntry','Scene'].includes(target.documentName))return {...result,outcome:'REVIEW',outcomeReason:'target-no-longer-available'};
  const suppression=globalThis.ATTestAI.flags(await fromUuid(row.sourceJournalUuid))?.getFlag('adventurers-tome','campaignAutoLinkPolicyV1');
  if(suppression?.suppressedTargetUuids?.includes(target.uuid))return {...result,outcome:'UNVERIFIED',outcomeReason:'gm-unlink-suppression'};
  const fresh=await current(row),now=fresh&&sameDecision(fresh,row);check(stamp);options.assertCurrent?.();
  if(now?.action!=='link'||now.targetUuid!==target.uuid)return {...result,outcome:'REVIEW',outcomeReason:'decision-changed-before-link'};
  if(!api().campaignEntityLinks.hasCanonicalLink({sourceUuid:row.sourceJournalUuid,targetUuid:target.uuid})){
   await api().campaignEntityLinks.linkCanonical({sourceUuid:row.sourceJournalUuid,targetUuid:target.uuid});writes++;
  }
  return {...result,outcome:'LINKED',targetUuid:target.uuid};
 }
 if(plan.outcome==='CREATE'&&options.allowCreate!==false){
  if(deletionStorageFailed)return {...result,outcome:'REVIEW',outcomeReason:'deletion-history-storage-unavailable'};
  const folders=await api().folderQuickCreate.bootstrap();check(stamp);options.assertCurrent?.();
  const fresh=await current(row),now=fresh&&sameDecision(fresh,row);check(stamp);
  if(!active()||now?.action!=='create'||now.reference?.id!==plan.reference.id||now.reference?.packId!==plan.reference.packId)return {...result,outcome:'REVIEW',outcomeReason:'decision-changed-before-creation'};
  const ref=now.reference,folder=folders.folders[ref.kind];if(!folder)return {...result,outcome:'REVIEW',outcomeReason:'unsupported-library-type'};
  options.assertCurrent?.();
  const made=await api().folderQuickCreate.quickCreate(folder,{blank:true,name:ref.name,initialName:ref.name,campaignReference:ref,sourceUuid:row.sourceJournalUuid,openAfterCreate:false,awaitCreation:true});
  const uuid=made?.uuid||made?.document?.uuid||made?.journalUuid||made?.actorUuid;
  const target=uuid&&await fromUuid(uuid);check(stamp);options.assertCurrent?.();
  if(!target)throw Error('Library creation did not return a canonical identity.');
  writes++;await api().campaignEntityLinks.linkCanonical({sourceUuid:row.sourceJournalUuid,targetUuid:target.uuid});writes++;
  return {...result,outcome:'CREATED',targetUuid:target.uuid,outcomeReason:'verified-world-library'};
 }
 if(result.outcome==='REVIEW'){
  const suggestions=api().campaignEntityCreation?.existingMatches?.({text:row.text,kind:'unknown',sourceUuid:row.sourceJournalUuid})||[];
  const combined=[...result.identityCandidates,...suggestions],seen=new Set();
  result.identityCandidates=combined.filter(c=>{const uuid=c.canonicalUuid||c.uuid;if(!/^(Actor|Item|JournalEntry|Scene)\.[^.]+$/u.test(uuid)||seen.has(uuid))return false;seen.add(uuid);return true;}).map(c=>({...c,reviewOnly:true}));
 }
 return result;
}
function resolve(row,options={}){const work=writeTail.catch(()=>{}).then(()=>resolveNow(row,options));writeTail=work;return work;}
function attach(){api().integratedInterpretation=Object.freeze({assistDocument,assessDocument,resolve,discoveryGroups,
 policyInputs:()=>{check(owner());return {corrections:ledger.all(),deletions:deleted()};},
 prepareDocument:(html,options)=>structureFromMap(documentMap(html,options)),invalidate,
 status:()=>({revision:INTEGRATED_REVISION,automatic:true,analyses,reuses,writes,cacheEntries:cache.size,lastError,pool:pool?.status()}),
 saveCorrection(record){check(owner());ledger.save(record);invalidate();globalThis.AdventurersTomeIndex?.request('source-role-correction');return record;}});}
Hooks.once('ready',attach);
for(const event of ['createActor','updateActor','deleteActor','createItem','updateItem','deleteItem','createJournalEntry','updateJournalEntry','deleteJournalEntry','createJournalEntryPage','updateJournalEntryPage','deleteJournalEntryPage','updateUser','updateSetting','adventurersTomeCampaignLearningUpdated','adventurersTomeWorldLibraryReady'])Hooks.on(event,invalidate);
for(const event of ['deleteActor','deleteItem','deleteJournalEntry','deleteScene'])Hooks.on(event,recordDeletion);
Hooks.on('shutdown',()=>{pool?.dispose();pool=null;invalidate();});
