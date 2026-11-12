import {playerPresentationUpdate} from './player-visibility.mjs';
const ID='adventurers-tome',QUERY='adventurersTome.shareOwnedImport';
export function createImportSharing({game,flags=doc=>doc,socket,queries}) {
  const senders=new WeakMap();
  const read=(doc,key)=>flags(doc)?.getFlag(ID,key);
  const receiptKeys=['sessionUploadV1','questUploadV1'];
  function validate(data,senderId){
    if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)throw Error('An active GM is required to share this import.');
    if(!data||!receiptKeys.includes(data.key)||typeof data.journalId!=='string'||typeof data.planHash!=='string')throw Error('Invalid import sharing request.');
    const sender=game.users.get(senderId),doc=game.journal.get(data.journalId),receipt=read(doc,data.key);
    if(!sender?.active||sender.isGM||sender.role<2||(sender.hasPermission?.('QUERY_USER')??sender.can?.('QUERY_USER'))!==true)throw Error('Import sharing requires its active Trusted Player.');
    if(!doc||doc.pack||doc.parent||doc.documentName!=='JournalEntry'||doc.testUserPermission(sender,'OWNER')!==true||read(doc,'chronicleV1')||read(doc,'vaultInboxV1'))throw Error('Only your own imported Journal can be shared.');
    const expected=data.key==='sessionUploadV1'?['session','sessions']:['quest','quests'];
    if(!expected.includes(read(doc,'type'))||receipt?.ownerId!==senderId||receipt.planHash!==data.planHash||!['ready','complete'].includes(receipt.state))throw Error('Finish processing your own import before sharing it.');
    const audience=receipt.audience||'all';
    if(audience!=='all'&&audience!=='gm'&&audience!=='player:'+senderId)throw Error('A Trusted Player can create a personal Quest only for themselves.');
    if(data.key==='sessionUploadV1'&&audience!=='all')throw Error('Imported Sessions must use the shared audience.');
    return {doc,receipt,audience};
  }
  function patch(doc,key,receipt,audience){
    const update=audience==='gm'?{[`flags.${ID}.access.visibility`]:'gm',[`flags.${ID}.access.discovered`]:true}:playerPresentationUpdate(doc,game.users.contents,{audience:audience==='all'?null:[audience.slice(7)]});
    if(key==='questUploadV1')update[`flags.${ID}.questAudienceV1`]={mode:audience==='all'?'all':audience==='gm'?'gm':'personal',userIds:audience.startsWith('player:')?[audience.slice(7)]:[]};
    update[`flags.${ID}.${key}`]={...receipt,state:'complete',audience};return update;
  }
  async function handle(data){
    await Promise.resolve();const senderId=senders.get(data);senders.delete(data);if(!senderId)throw Error('The import sender could not be authenticated.');
    const {doc,receipt,audience}=validate(data,senderId);if(receipt.state==='complete')return {id:doc.id};
    validate(data,senderId);await doc.update(patch(doc,data.key,receipt,audience),{adventurersTomeOwnership:true});return {id:doc.id};
  }
  function install(){queries[QUERY]=handle;socket.on('userQuery',(userId,_queryId,name,data)=>{if(name===QUERY&&data&&typeof data==='object')senders.set(data,userId);});}
  async function complete(doc,key,audience='all',receiptOverride=null){
    if(!receiptKeys.includes(key))throw Error('Invalid import receipt.');
    const receipt=receiptOverride||read(doc,key);
    if(!receipt||receipt.ownerId!==game.user.id)throw Error('Only the importing account can finish this import.');
    if(game.user.isGM){await doc.update(patch(doc,key,receipt,audience),{adventurersTomeOwnership:true});return doc;}
    await flags(doc).setFlag(ID,key,{...receipt,state:'ready',audience});
    const gm=game.users.activeGM;
    if(!gm?.active||(game.user.hasPermission?.('QUERY_USER')??game.user.can?.('QUERY_USER'))!==true)throw Error('Import saved privately. An active GM with Tome and Foundry user queries is required to share it. Retry this file with the same choices.');
    await gm.query(QUERY,{journalId:doc.id,key,planHash:receipt.planHash},{timeout:15000});return doc;
  }
  return {install,complete};
}
