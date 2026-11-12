const ID='adventurers-tome';
const flag=(doc,key)=>doc?.getFlag?.(ID,key);
export function partyRelationPlan(actors,{legacyIds=[],users=[]}={}){
  const legacy=new Set(legacyIds);
  const members=actors.filter(a=>{const explicit=flag(a,'groupMember');return explicit===true||(explicit!==false&&legacy.has(a.id));});
  const memberIds=new Set(members.map(a=>a.id));
  return actors.flatMap(actor=>{
    const profile=flag(actor,'profile')||{},old=Array.isArray(profile.relations)?profile.relations:[];
    // Only rows still bearing our marker are managed; authored relationships survive.
    const relations=old.filter(r=>!r.autoPartyMember||(memberIds.has(actor.id)&&memberIds.has(r.actorId)&&r.actorId!==actor.id));
    if(memberIds.has(actor.id))for(const target of members){
      if(target.id===actor.id||relations.some(r=>r.actorId===target.id&&r.visibility!=='gm'))continue;
      // Membership proves companionship, not a historical meeting date.
      relations.push({actorId:target.id,label:'Party Member',note:'',visibility:'players',autoPartyMember:true});
    }
    return JSON.stringify(old)===JSON.stringify(relations)?[]:[{actor,profile:{...profile,relations}}];
  });
}
