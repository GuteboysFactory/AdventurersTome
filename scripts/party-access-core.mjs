const ID='adventurers-tome',flag=(doc,key)=>doc?.getFlag?.(ID,key);
export function partyMembers(actors,legacyIds=[]){const legacy=new Set(legacyIds);return actors.filter(a=>{const value=flag(a,'groupMember');return value===true||(value!==false&&legacy.has(a.id));});}
export function partyPlayers(members,users){return users.filter(u=>!u.isGM&&members.some(a=>(typeof u.character==='string'?u.character:u.character?.id)===a.id||Number(a.ownership?.[u.id]??a.ownership?.default??0)>=3));}
export function canReadPartyProfile(actor,user,{actors=[],users=[],legacyIds=[]}={}){
 if(actor?.documentName!=='Actor'||!user||user.isGM)return false;
 const members=partyMembers(actors,legacyIds);
 return members.some(a=>a.id===actor.id)&&partyPlayers(members,users).some(u=>u.id===user.id)&&actor.testUserPermission?.(user,1)===true;
}
export function partyAccessPlan(actors,{users=[],legacyIds=[]}={}){
 const members=partyMembers(actors,legacyIds),memberIds=new Set(members.map(a=>a.id)),players=partyPlayers(members,users);
 return actors.flatMap(actor=>{
  const old=flag(actor,'partyAccessV1')||{},managed={...old},patch={};
  const desired=new Set(memberIds.has(actor.id)?players.map(u=>u.id):[]),own=actor.ownership||{};
  for(const [id,record] of Object.entries(old))if(!desired.has(id)){
   if(Number(own[id])===1){if(record.before===null)patch['ownership.-='+id]=null;else patch['ownership.'+id]=record.before;}
   delete managed[id];
  }
  for(const id of desired){const effective=Number(own[id]??own.default??0);if(effective>=1)continue;
   managed[id]={before:Object.hasOwn(own,id)?own[id]:null};patch['ownership.'+id]=1;
  }
  if(JSON.stringify(old)!==JSON.stringify(managed))patch[`flags.${ID}.partyAccessV1`]=managed;
  return Object.keys(patch).length?[{actor,patch}]:[];
 });
}
