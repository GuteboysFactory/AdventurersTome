// Both fact stores retain their ownership. Full undo snapshots are user-private.
const ATSFR_ID='adventurers-tome',ATSFR_UNDO='sourceFactCorrectionUndo';
const atSfrClone=value=>foundry.utils.deepClone(value);
const atSfrEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const atSfrApi=()=>game.modules.get(ATSFR_ID)?.api;
function atSfrStore() {
  const store=atSfrApi()?.privateFactStore;
  if(!store?.read || !store?.write)throw Error('Private fact storage is unavailable. Reopen the review when Tome is ready.');
  return store;
}
function atSfrUndoRecords() {
  if(!game.user?.isGM)return {};
  try{return JSON.parse(game.settings.get(ATSFR_ID,ATSFR_UNDO)||'{}');}catch{return {};}
}
async function atSfrSaveUndo(records) {
  if(!game.user?.isGM)throw Error('GM-only source correction.');
  await game.settings.set(ATSFR_ID,ATSFR_UNDO,JSON.stringify(records));
}
async function atSfrPlan({targetUuid,sourceUuid,text}={}) {
  if(!game.user?.isGM)return null;
  const target=await fromUuid(targetUuid),source=await fromUuid(sourceUuid);
  if(!target || target.documentName!=='JournalEntry' || !source || source.documentName!=='JournalEntry')throw Error('Select an existing World journal and source.');
  const profile=target.getFlag(ATSFR_ID,'worldProfile');if(!profile)throw Error('This identity has no World profile.');
  const privateFacts=atSfrStore().read(target);
  const html=(source.pages?.contents||[]).filter(page=>page.testUserPermission?.(game.user,'OBSERVER')!==false).map(page=>page.text?.content||'').join('\n');
  const briefing=atSfrApi()?.campaignNewEntityDiscovery?.briefingFor?.({text:html,names:[target.name,text]});
  if(!briefing)throw Error('Fresh source analysis is unavailable.');
  const role=briefing.roles.join(' / '),rows=[];
  if(role && profile.subtitle && profile.subtitle!==role)rows.push({key:'subtitle',storage:'profile',label:'Known as',before:profile.subtitle,after:role});
  for(const [storage,facts,prefix] of [['profile',profile.facts||[],'fact'],['private',privateFacts,'privateFact']])for(const [index,fact] of facts.entries()) {
    const label=storage==='private'?`${fact.label} (private GM fact)`:fact.label;
    if(fact.label==='Role / profession' && role && fact.value!==role)rows.push({key:`${prefix}:${index}`,storage,label,before:fact.value,after:role});
    if(['Faction / organization','Location','Relations (source)'].includes(fact.label) && fact.value &&
      briefing.excerpts.some(excerpt=>excerpt.includes(String(fact.value)) || String(fact.value).includes(excerpt)))
      rows.push({key:`${prefix}:${index}`,storage,label,before:fact.value,after:'',removal:true});
  }
  return {targetUuid,sourceUuid,text,gmId:game.user.id,targetName:target.name,sourceName:source.name,profile:atSfrClone(profile),privateFacts:atSfrClone(privateFacts),rows,evidence:briefing.excerpts};
}
async function atSfrWrite(target,from,to) {
  const profileChanged=!atSfrEqual(from.profile,to.profile),privateChanged=!atSfrEqual(from.privateFacts,to.privateFacts);
  if(profileChanged)await target.update({[`flags.${ATSFR_ID}.worldProfile`]:atSfrClone(to.profile)});
  try{if(privateChanged)await atSfrStore().write(target,atSfrClone(to.privateFacts));}
  catch(error){if(profileChanged)await target.update({[`flags.${ATSFR_ID}.worldProfile`]:atSfrClone(from.profile)});throw error;}
}
function atSfrPayload(row) {
  if(!game.user?.isGM || row.gmId!==game.user.id)throw Error('Only the GM who made this correction can undo their private data.');
  const payload=atSfrUndoRecords()[row.correctionId];
  if(!payload || payload.targetUuid!==row.targetUuid)throw Error('The private correction snapshot is unavailable.');
  return payload;
}
function atSfrUndoStatus(row) {
  try {
    const payload=atSfrPayload(row),id=/^JournalEntry\.([^.]+)$/.exec(row.targetUuid)?.[1],target=game.journal.get(id);
    if(!target)return 'The corrected identity no longer exists';
    if(!atSfrEqual(payload.before.profile,payload.after.profile) && !atSfrEqual(target.getFlag(ATSFR_ID,'worldProfile'),payload.after.profile))return 'This profile has changed since the correction';
    if(!atSfrEqual(payload.before.privateFacts,payload.after.privateFacts) && !atSfrEqual(atSfrStore().read(target),payload.after.privateFacts))return 'Private facts have changed since the correction';
    return '';
  }catch(error){return error.message;}
}
async function atSfrUndo(row,commit) {
  const blocked=atSfrUndoStatus(row);if(blocked)throw Error(blocked);
  const payload=atSfrPayload(row),target=await fromUuid(row.targetUuid);
  await atSfrWrite(target,payload.after,payload.before);
  try{await commit();}catch(error){await atSfrWrite(target,payload.before,payload.after);throw error;}
}
async function atSfrApply(plan,keys=[]) {
  if(!game.user?.isGM || plan.gmId!==game.user.id)throw Error('GM-only source correction belongs to the reviewing GM.');
  const fresh=await atSfrPlan(plan),target=await fromUuid(plan.targetUuid);
  if(!atSfrEqual(fresh.profile,plan.profile) || !atSfrEqual(fresh.privateFacts,plan.privateFacts) || !atSfrEqual(fresh.rows,plan.rows) || !atSfrEqual(fresh.evidence,plan.evidence))throw Error('The source, profile or private facts changed. Reopen the correction review.');
  const selected=fresh.rows.filter(row=>keys.includes(row.key));if(!selected.length)return {changed:false};
  const learning=atSfrApi()?.campaignReviewLearning;
  if(!learning?.rememberDecision)throw Error('Decision history is unavailable; no fields changed.');
  const before={profile:atSfrClone(fresh.profile),privateFacts:atSfrClone(fresh.privateFacts)},after=atSfrClone(before),remove={profile:new Set(),private:new Set()};
  for(const row of selected) {
    if(row.key==='subtitle')after.profile.subtitle=row.after;
    else {
      const index=Number(row.key.split(':')[1]),facts=row.storage==='private'?after.privateFacts:after.profile.facts;
      if(row.removal)remove[row.storage].add(index);else facts[index]={...facts[index],value:row.after};
    }
  }
  if(remove.profile.size)after.profile.facts=after.profile.facts.filter((_row,index)=>!remove.profile.has(index));
  if(remove.private.size)after.privateFacts=after.privateFacts.filter((_row,index)=>!remove.private.has(index));
  const correctionId=foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`,oldRecords=atSfrUndoRecords();
  const keep=new Set((learning.decisionHistory?.()||[]).map(row=>row.correctionId));
  const records=Object.fromEntries(Object.entries(oldRecords).filter(([id])=>keep.has(id)));
  records[correctionId]={targetUuid:target.uuid,before,after};
  // Reserve the private snapshot before mutating either store. World history
  // receives an opaque reference, never the private facts or their before-state.
  await atSfrSaveUndo(records);
  try {
    await atSfrWrite(target,before,after);
    try {
      await learning.rememberDecision({mode:'correction',text:`Source correction: ${target.name}`,sourceUuid:plan.sourceUuid,
        sourceName:plan.sourceName,targetUuid:target.uuid,label:`Corrected source facts: ${target.name}`,correctionId},null);
    }catch(error){await atSfrWrite(target,after,before);throw error;}
  }catch(error){await atSfrSaveUndo(oldRecords);throw error;}
  return {changed:true};
}
Hooks.once('init',()=>game.settings.register(ATSFR_ID,ATSFR_UNDO,{scope:'user',config:false,type:String,default:'{}'}));
Hooks.once('ready',()=>{const module=game.modules.get(ATSFR_ID);module.api||={};module.api.sourceFactReview=Object.freeze({plan:atSfrPlan,apply:atSfrApply,undoStatus:atSfrUndoStatus,undo:atSfrUndo});});
