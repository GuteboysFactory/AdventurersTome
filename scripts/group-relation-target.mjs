import {isPlayerCharacter} from './player-character-core.mjs';
export function readableRelationTarget(actor,{user,users=[],journals=[],canView}={}){
  if(!actor)return null;
  if(!user?.isGM&&!isPlayerCharacter(actor,users)){
    const cards=journals.filter(doc=>doc.getFlag?.('adventurers-tome','knownPersonV1')?.actorUuid===actor.uuid);
    if(cards.length){const card=cards.find(doc=>canView(doc,user));return card?{document:card,action:'openWorldProfile',actorId:'',journalId:card.id}:null;}
  }
  return canView(actor,user)?{document:actor,action:'openProfile',actorId:actor.id,journalId:''}:null;
}
