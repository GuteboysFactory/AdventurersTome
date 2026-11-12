import {presentationAuthorityUuid} from './player-visibility.mjs';
const ID='adventurers-tome',flag=(doc,key)=>doc?.getFlag?.(ID,key)??doc?.flags?.[ID]?.[key];
const pcKinds=new Set(['pc','character','player','playercharacter']);
const pcKind=value=>pcKinds.has(String(value||'').toLowerCase().replace(/[\s_-]/g,''));
export function isPlayerCharacter(actor,users=[]) {
  if(!actor||actor.documentName!=='Actor')return false;
  if(users.some(user=>(typeof user.character==='string'?user.character:user.character?.id)===actor.id))return true;
  return pcKind(actor.type)||pcKind(flag(actor,'actorProfile')?.category)||pcKind(flag(actor,'worldProfile')?.category)||pcKind(flag(actor,'type'));
}
export function presentationActorUuid(document){
  if(document?.documentName==='Actor')return document.uuid;
  return String(flag(document,'knownPersonV1')?.actorUuid||presentationAuthorityUuid(document)||(flag(document,'semanticProjection')?.kind!=='contact'?flag(document,'quickImportSourceUuid'):'')||'');
}
export function isWorldPlayerCharacter(document,actors=[],users=[]){
  if(flag(document,'knownPersonV1')?.retiredPC===true)return true;
  if(document?.documentName==='Actor')return isPlayerCharacter(document,users);
  if(pcKind(flag(document,'worldProfile')?.category)||pcKind(flag(document,'type')))return true;
  const uuid=presentationActorUuid(document);
  return /^Actor\.[^.]+$/.test(uuid)&&isPlayerCharacter(actors.find(actor=>actor.uuid===uuid),users);
}
export function isErroneousPCBasicCard(document,actors=[],users=[]){
  const marker=flag(document,'knownPersonV1');
  return document?.documentName==='JournalEntry'&&marker?.version===1&&/^Actor\.[^.]+$/.test(marker.actorUuid||'')&&isPlayerCharacter(actors.find(actor=>actor.uuid===marker.actorUuid),users);
}
export function retirePCBasicCardUpdate(document,{folderId,now=Date.now()}={}){
  const patch={folder:folderId,'ownership.default':0,[`flags.${ID}.type`]:'retired-pc-presentation',
    [`flags.${ID}.access.visibility`]:'gm',[`flags.${ID}.access.discovered`]:false,
    [`flags.${ID}.knownPersonV1.retiredPC`]:true,[`flags.${ID}.knownPersonV1.retiredAt`]:now};
  for(const id of Object.keys(document.ownership||{}))if(id!=='default')patch['ownership.-='+id]=null;
  return patch;
}
