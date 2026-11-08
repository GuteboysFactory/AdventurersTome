import './private-vault-inbox-ui.js';
import {createInboxKey,sealInbox,openInbox,decodeBytes,signInbox,verifySender} from './private-vault-inbox-codec.mjs';
import {senderKey} from './private-vault-inbox-device.mjs';
import {sha256} from './local-sha256.mjs';
const ID='adventurers-tome',PUBLIC='vaultInboxPublicKeyV1',KEYS='vaultInboxKeysV1',PACKET='vaultInboxV1',DONE='vaultInboxDecisionV1';
const api=()=>game.modules.get(ID)?.api,secure=()=>api()?.securePrivateVault;
let preparing=null;const accepting=new Set();
const stamp=()=>`${game.world.id}|${game.user.id}`;
function gm(){if(!game.user?.isGM||!secure()?.unlocked())throw Error('Unlock your Private Vault to review incoming GM notes.');}
function recipients(){return game.users.contents.filter(u=>u.isGM).sort((a,b)=>Number(b.role)-Number(a.role)||a.name.localeCompare(b.name)).map(u=>({id:u.id,name:u.name,role:u.role,ready:u.getFlag(ID,PUBLIC)?.worldId===game.world.id}));}
function selectedRecipient(id){const user=game.users.get(id),key=user?.getFlag(ID,PUBLIC);if(!user?.isGM||key?.version!==1||key.worldId!==game.world.id)throw Error('The selected GM must open Private Vault once to prepare their secure inbox. Your preview is kept; no private text has been uploaded.');decodeBytes(key.publicKey,32);return {user,key};}
async function prepare(){
 if(!game.user?.isGM||!secure()?.unlocked())return;if(preparing)return preparing;const owner=stamp();
 preparing=(async()=>{let record=JSON.parse(secure().get(KEYS)||'{}');if(!record.active||!record.keys?.[record.active]){const key=await createInboxKey();gm();if(stamp()!==owner)throw Error('Vault owner changed.');record={version:1,active:key.id,keys:{[key.id]:key}};await secure().set(KEYS,JSON.stringify(record));}
 gm();if(stamp()!==owner)throw Error('Vault owner changed.');const key=record.keys[record.active],publication={version:1,worldId:game.world.id,id:key.id,publicKey:key.publicKey};if(JSON.stringify(game.user.getFlag(ID,PUBLIC))!==JSON.stringify(publication))await game.user.setFlag(ID,PUBLIC,publication);
 })();try{return await preparing;}finally{preparing=null;}
}
async function send({recipientId,source,notes,fileDigest}){
 if(!(game.user?.isGM||Number(game.user?.role)>=(CONST.USER_ROLES.TRUSTED??2)))throw Error('Only Trusted Players and GMs can submit GM notes.');if(!source?.uuid||!notes.length)return null;
 const owner=stamp(),{key}=selectedRecipient(recipientId),receipt=await sha256(JSON.stringify([game.world.id,game.user.id,recipientId,source.uuid,fileDigest,notes.map(n=>n.id)]));
 const existing=game.journal.contents.find(m=>m.getFlag(ID,PACKET)?.senderId===game.user.id&&m.getFlag(ID,PACKET)?.receipt===receipt);if(existing)return existing.uuid;
 const signing=await senderKey(owner);if(stamp()!==owner)throw Error('Importing user changed.');if(game.user.getFlag(ID,'vaultInboxSenderKeysV1')?.[signing.id]!==signing.publicKey)await game.user.update({[`flags.${ID}.vaultInboxSenderKeysV1.${signing.id}`]:signing.publicKey});
 const packet=signInbox({...await sealInbox({version:1,worldId:game.world.id,senderId:game.user.id,recipientId,sourceUuid:source.uuid,sourceTitle:source.name,notes},key),receipt},signing);
 if(stamp()!==owner||selectedRecipient(recipientId).key.id!==key.id)throw Error('The GM inbox or importing user changed. Retry this preview.');
 const message=await JournalEntry.create({name:'Private Vault inbox',ownership:{default:0,[game.user.id]:3,[recipientId]:3},flags:{[ID]:{type:'private-vault-inbox',[PACKET]:{...packet,receipt}}}});return message.uuid;
}
function pending(){if(!game.user?.isGM)return [];return game.journal.contents.filter(m=>m.getFlag(ID,PACKET)?.recipientId===game.user.id&&!m.getFlag(ID,DONE)?.[game.user.id]);}
async function read(message){gm();const owner=stamp(),packet=message?.getFlag(ID,PACKET),published=game.users.get(packet?.senderId)?.getFlag(ID,'vaultInboxSenderKeysV1')?.[packet?.signerId];if(!published)throw Error('The sender verification key is unavailable. The encrypted record has been kept.');await verifySender(packet,published);gm();if(stamp()!==owner)throw Error('Vault owner changed.');const record=JSON.parse(secure().get(KEYS)||'{}'),key=record.keys?.[packet.keyId];if(!key)throw Error('The private key for this incoming note is unavailable. The encrypted record has been kept.');return openInbox(packet,key,{worldId:game.world.id,senderId:packet.senderId,recipientId:game.user.id});}
async function decide(messageId,accept,{expectedPacket}={}){
 gm();const owner=stamp(),message=game.journal.get(messageId);if(!pending().includes(message))throw Error('This incoming note has already been reviewed or is unavailable.');if(accepting.has(messageId))throw Error('This incoming note is already being saved.');const original=JSON.stringify(message.getFlag(ID,PACKET));if(accept&&original!==expectedPacket)throw Error('The incoming note changed. Review the current content before accepting.');accepting.add(messageId);
 try{const payload=await read(message);if(accept){const source=await fromUuid(payload.sourceUuid);gm();if(stamp()!==owner||!source||JSON.stringify(message.getFlag(ID,PACKET))!==original)throw Error('The source or incoming note changed; the incoming note has been kept.');const packet=message.getFlag(ID,PACKET),notes=payload.notes.map(n=>({...n,id:`inbox-${packet.receipt}-${n.id}`,createdAt:Date.now(),updatedAt:Date.now(),status:'open',receivedFrom:payload.senderId}));await api().privateVault.saveNotes(source,current=>{const ids=new Set(current.map(n=>n.id));return [...current,...notes.filter(n=>!ids.has(n.id))];});}
 gm();if(stamp()!==owner||JSON.stringify(message.getFlag(ID,PACKET))!==original)throw Error('The incoming note changed before completion. The reviewed copy has been kept safely.');await message.setFlag(ID,DONE,{...(message.getFlag(ID,DONE)||{}),[game.user.id]:{accepted:accept===true,at:Date.now()}});Hooks.callAll('adventurersTomePrivateNotesChanged',{});return {accepted:accept===true};
 }finally{accepting.delete(messageId);}
}
Hooks.once('ready',()=>{api().gmInbox=Object.freeze({prepare,recipients,preflight:selectedRecipient,send,pending,read,decide});void prepare().catch(e=>console.warn('Tome | GM inbox setup deferred:',e.message));});
Hooks.on('adventurersTomeVaultLockChanged',({unlocked})=>{if(unlocked)void prepare().catch(e=>console.warn('Tome | GM inbox setup deferred:',e.message));});
for(const hook of ['createJournalEntry','updateJournalEntry','deleteJournalEntry'])Hooks.on(hook,message=>{if(message.getFlag(ID,PACKET)?.recipientId===game.user?.id)Hooks.callAll('adventurersTomePrivateNotesChanged',{});});
