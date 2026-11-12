// Native document ownership planning. No Actor system data or page text is written.
import {isPlayerCharacter,isWorldPlayerCharacter} from './player-character-core.mjs';
const ID='adventurers-tome';
export const ownershipLevels=['None','Limited','Observer','Owner'];
export const defaultNpcTypes=['npc','creature','monster','adversary','minion','rival','nemesis'];
const copy=value=>structuredClone(value);
const stable=value=>JSON.stringify(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)));
const roles=users=>stable(Object.fromEntries(users.map(u=>[u.id,Boolean(u.isGM)])));
export function ownershipLevel(ownership,userId){const value=ownership?.[userId];return Number.isInteger(value)&&value>=0?value:Math.max(0,Number(ownership?.default)||0);}
export function accessGroup(documents,users){
 const defaults=documents.map(d=>ownershipLevel(d.ownership,'default'));
 const players=users.filter(u=>!u.isGM),levels=documents.flatMap(d=>players.map(u=>ownershipLevel(d.ownership,u.id)));
 // Also account for the default given to future players when the world has no users yet.
 if([...defaults,...levels].every(n=>n===0))return 'hidden';
 const n=defaults[0];return n>0&&defaults.every(v=>v===n)&&levels.every(v=>v===n)?'shared':'custom';
}
export function matchesEntryType(row,type){return type==='all'||(row.types||[row.kind]).includes(type);}
export function collectPeople({actors=[],journals=[],items=[],users=[],npcTypes=defaultNpcTypes}){
 const assigned=new Set(users.map(u=>typeof u.character==='string'?u.character:u.character?.id).filter(Boolean));
 const groups=new Map(),byActor=new Map(),byItem=new Map();
 const flags=d=>d.getFlag?.(ID,'worldProfile')||d.flags?.[ID]?.worldProfile||{};
 for(const actor of actors){
  const category=flags(actor).category;
  if(actor.pack||isPlayerCharacter(actor,users))continue;
  if(!npcTypes.includes(actor.type)&&!['npc','contact'].includes(category))continue;
  const row={id:actor.uuid,name:actor.name,types:category==='contact'?['NPC','Contact']:['NPC'],documents:[actor],folder:actor.folder?.name||'Unfiled'};groups.set(row.id,row);byActor.set(actor.uuid,row);
 }
 for(const item of items){
  if(item.pack||item.parent||item.isEmbedded)continue;
  const row={id:item.uuid,name:item.name,types:['Item'],documents:[item],folder:item.folder?.name||'Unfiled'};groups.set(row.id,row);byItem.set(item.uuid,row);
 }
 for(const journal of journals){
  if(journal.pack||isWorldPlayerCharacter(journal,actors,users))continue;const profile=flags(journal),projection=journal.getFlag?.(ID,'semanticProjection')||journal.flags?.[ID]?.semanticProjection;
  if(!['contact','npc','item'].includes(profile.category)&&projection?.kind!=='contact')continue;
  const type=projection?.kind==='contact'?'Contact':({npc:'NPC',contact:'Contact',item:'Item'}[profile.category]);
  const identity=journal.getFlag?.(ID,'knownPersonV1')?.actorUuid||projection?.linkedUuid||profile.sourceUuid||(profile.actorId?'Actor.'+profile.actorId:profile.itemId?'Item.'+profile.itemId:'');
  // Never connect a Contact to the relationship owner's sourceUuid.
  const linked=type==='Item'?byItem.get(identity):byActor.get(identity);
  if(linked){linked.documents.push(journal);if(!linked.types.includes(type))linked.types.push(type);continue;}
  const row={id:journal.uuid,name:journal.name,types:[type],documents:[journal],folder:journal.folder?.name||'Unfiled'};groups.set(row.id,row);
 }
 return [...groups.values()].map(row=>({...row,kind:row.types.join(' + '),subtypes:[...new Set(row.documents.filter(d=>['Actor','Item'].includes(d.documentName)&&d.type).map(d=>d.documentName+':'+d.type))],group:accessGroup(row.documents,users)})).sort((a,b)=>a.name.localeCompare(b.name));
}
function snapshot(doc){return {ownership:copy(doc.ownership||{}),projection:copy(doc.getFlag?.(ID,'semanticProjection')||doc.flags?.[ID]?.semanticProjection||null),known:copy(doc.getFlag?.(ID,'knownPersonV1')||doc.flags?.[ID]?.knownPersonV1||null)};}
function signature(s){return stable(s.ownership)+'|'+stable(s.projection)+'|'+stable(s.known||null);}
function updateFor(current,desired){
 const update={};for(const key of new Set([...Object.keys(current.ownership),...Object.keys(desired.ownership)])){
  if(Object.hasOwn(desired.ownership,key))update['ownership.'+key]=desired.ownership[key];
  else update['ownership.-='+key]=null;
 }
 if(desired.projection){
  for(const key of ['permissionOverride','ownershipManaged']){
   const path=`flags.${ID}.semanticProjection.`;
   if(Object.hasOwn(desired.projection,key))update[path+key]=desired.projection[key];
   else if(current.projection&&Object.hasOwn(current.projection,key))update[path+'-='+key]=null;
  }
 }
 if(desired.known){const path=`flags.${ID}.knownPersonV1.`;if(Object.hasOwn(desired.known,'permissionOverride'))update[path+'permissionOverride']=desired.known.permissionOverride;else if(current.known&&Object.hasOwn(current.known,'permissionOverride'))update[path+'-=permissionOverride']=null;}
 return update;
}
export function planOwnership(rows,changes,users){
 for(const [id,value]of Object.entries(changes)){
  if(id!=='default'&&!users.some(u=>u.id===id&&!u.isGM))throw Error('Choose a current non-GM player.');
  if(value!=='keep'&&value!==-1&&(!Number.isInteger(value)||value<0||value>3))throw Error('Invalid ownership level.');
  if(id==='default'&&value===-1)throw Error('All Players cannot inherit itself.');
 }
 const documents=new Map(rows.flatMap(row=>row.documents).map(d=>[d.uuid,d]));
 return [...documents.values()].map(doc=>{
  const before=snapshot(doc),after=copy(before);
  for(const [key,value]of Object.entries(changes)){
   if(value==='keep')continue;if(value===-1)delete after.ownership[key];else after.ownership[key]=value;
  }
  if(after.projection?.kind==='contact'&&Object.values(changes).some(v=>v!=='keep')){after.projection.permissionOverride=true;after.projection.ownershipManaged=false;}
  if(after.known&&Object.values(changes).some(v=>v!=='keep'))after.known.permissionOverride=true;
  return {uuid:doc.uuid,name:doc.name,before,after,roles:roles(users)};
 }).filter(p=>signature(p.before)!==signature(p.after));
}
export function hideChanges(users){return Object.fromEntries([['default',0],...users.filter(u=>!u.isGM).map(u=>[u.id,-1])]);}
// Preflight the entire selection before writing, then check each live document again.
// A failure retains successful receipts so partial batches can be explicitly undone.
export async function applyOwnership(plan,{resolve,user,users,undo=false}={}){
 const initial=user();if(!initial?.isGM)throw Error('Only a GM can change campaign ownership.');const owner=initial.id;
 const authorize=()=>{if(!user()?.isGM||user().id!==owner)throw Error('GM account or permission changed.');};
 const validate=entry=>{authorize();if(users&&entry.roles!==roles(users()))throw Error('The player list or roles changed. Refresh and review the selection again.');const doc=resolve(entry.uuid);if(!doc||doc.pack||doc.parent||doc.isEmbedded||!['Actor','JournalEntry','Item'].includes(doc.documentName))throw Error('A selected document is no longer available.');if(signature(snapshot(doc))!==signature(undo?entry.after:entry.before))throw Error(`${entry.name} changed. Refresh and review the selection again.`);return doc;};
 plan.forEach(validate);const completed=[];
 try{for(const entry of plan){const doc=validate(entry),desired=undo?entry.before:entry.after;await doc.update(updateFor(snapshot(doc),desired),{adventurersTomeOwnership:true});const actual=snapshot(doc);completed.push({...entry,after:undo?entry.after:actual});authorize();if(signature(actual)!==signature(desired))throw Error(`${entry.name} changed during saving. Review the current ownership.`);}}
 catch(error){error.completed=completed;throw error;}
 return completed;
}
