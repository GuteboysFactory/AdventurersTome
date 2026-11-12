import {presentationAuthorityUuid} from './player-visibility.mjs';
import {isPlayerCharacter} from './player-character-core.mjs';
const ID='adventurers-tome';
export const knownActorUuid=doc=>String(doc?.getFlag?.(ID,'knownPersonV1')?.actorUuid||'');
export function linkedPeople(session,journals=[]) {
  const flag=key=>session.getFlag?.(ID,key)||{},links=flag('links'),canonical=flag('campaignEntityLinksV1');
  const refs=new Set([...(links.actors||[]).map(id=>'Actor.'+id),...(canonical.actorUuids||[])]);
  for(const ref of [...(links.world||[]).map(id=>'JournalEntry.'+id),...(canonical.entityUuids||[])]){
    if(/^Actor\.[^.]+$/.test(ref)){refs.add(ref);continue;}
    const doc=journals.find(j=>j.uuid===ref);if(doc)refs.add(knownActorUuid(doc)||presentationAuthorityUuid(doc));
  }
  return [...refs].filter(uuid=>/^Actor\.[^.]+$/.test(uuid));
}
export function knownPeoplePlan({sessions,actors,journals,users,canView,pageReferences=()=>[]}={}){
  const players=users.filter(u=>!u.isGM);
  const plan=new Map();
  for(const session of sessions){
    const receipt=session.getFlag?.(ID,'sessionUploadV1');if(receipt&&receipt.state!=='complete')continue;
    const explicit=linkedPeople(session,journals);
    for(const user of players){
      if(!canView(session,user))continue;
      const refs=new Set(explicit);
      for(const page of session.pages?.contents||[])if(page.testUserPermission?.(user,'OBSERVER')===true&&canView(page,user))for(const uuid of pageReferences(page))refs.add(uuid);
      for(const uuid of refs){const actor=actors.find(a=>a.uuid===uuid);if(!actor||actor.pack||isPlayerCharacter(actor,users))continue;
        if(!plan.has(uuid))plan.set(uuid,{actor,ownership:{default:0}});plan.get(uuid).ownership[user.id]=2;
      }
    }
  }
  return plan;
}
export function basicPersonData(actor,ownership){
  if(isPlayerCharacter(actor))throw Error('Player characters cannot receive NPC basic cards.');
  return {name:actor.name,img:actor.img||'icons/svg/mystery-man.svg',ownership,
    flags:{[ID]:{type:'world',access:{visibility:'inherit',discovered:true},knownPersonV1:{version:1,actorUuid:actor.uuid,permissionOverride:false},worldProfile:{category:'npc',heroImage:actor.img||'',summary:'',body:'',facts:[]}}}};
}
