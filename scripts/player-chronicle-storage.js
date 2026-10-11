// User settings persist all text. Chat contains delivery IDs only. Note text
// travels through addressed User.query calls, never a module broadcast.
const PCSTORE_ID='adventurers-tome',PCSTORE_KEY='playerChronicleV1';
const PC_RECEIVE=PCSTORE_ID+'.chronicleReceive',PC_VERIFY=PCSTORE_ID+'.chronicleVerify',PC_RETRY=PCSTORE_ID+'.chronicleRetry';
let pcStoreTail=Promise.resolve();
const pcRead=()=>structuredClone(game.settings.get(PCSTORE_ID,PCSTORE_KEY)||{version:1,books:{},inbox:{}});
function pcWrite(change) {
  const job=pcStoreTail.catch(()=>{}).then(async()=>{const state=pcRead();if(state.version!==1)throw Error('Unsupported Chronicle storage version.');state.books||={};state.inbox||={};await change(state);await game.settings.set(PCSTORE_ID,PCSTORE_KEY,state);});
  pcStoreTail=job;return job;
}
function pcVirtualBook(ownerId,kind,inbox=false) {
  const key=ownerId+':'+kind;
  return {uuid:'Chronicle.'+ownerId+'.'+kind,ownership:{[ownerId]:3},
    getFlag:(_scope,name)=>name==='chronicleV1'?{version:1,ownerId,kind}:name==='chronicleEntries'?(inbox?pcRead().inbox?.[key]:pcRead().books?.[kind])||{}:undefined,
    testUserPermission:(user,level)=>level==='OWNER'?user.id===ownerId:user.id===ownerId||kind==='party'||kind==='gm'&&user.isGM,
    setFlag:async(_scope,path,value)=>{
      if(inbox||ownerId!==game.user.id)throw Error('Cannot edit another player’s Chronicle.');
      const id=path.split('.')[1];if(!/^[a-zA-Z0-9]+$/.test(id))throw Error('Invalid Chronicle entry identifier.');
      await pcWrite(state=>{state.books[kind]||={};state.books[kind][id]=structuredClone(value);});
    }};
}
function pcStorageBooks() {
  const own=['private','gm','party'].map(kind=>pcVirtualBook(game.user.id,kind));
  for(const key of Object.keys(pcRead().inbox||{})){const [ownerId,kind]=key.split(':');if(['gm','party'].includes(kind))own.push(pcVirtualBook(ownerId,kind,true));}
  return own;
}
const pcPacket=message=>message?.getFlag?.(PCSTORE_ID,'chronicleDelivery');
const pcMessage=id=>game.messages?.get?.(id)||game.messages?.contents?.find(message=>message.id===id);
function pcPayload(record){return record?.deleted?{id:record.id,revision:record.revision,deleted:true}:{id:record?.id,revision:record?.revision,note:structuredClone(record?.note)};}
function pcValid(message) {
  const packet=pcPacket(message);
  return packet?.version===2&&['gm','party'].includes(packet.visibility)&&packet.ownerId===message.author?.id
    &&/^[a-zA-Z0-9]+$/.test(packet.noteId)&&/^[a-zA-Z0-9]+$/.test(packet.revision);
}
function pcCurrent(message) {
  if(!pcValid(message)||message.author.id!==game.user.id)return null;
  const packet=pcPacket(message),record=pcRead().books?.[packet.visibility]?.[packet.noteId];
  return record?.revision===packet.revision?pcPayload(record):null;
}
// V13 query handlers lack authenticated caller metadata. Never return text from
// a query. Verification returns a boolean; retries send only to the canonical
// ChatMessage's recipients, never to a recipient supplied by the caller.
function pcVerify({messageId,record,receiptToken}={}) {
  if(typeof receiptToken!=='string'||receiptToken!==pcRead().deliverySecrets?.[record?.revision])return false;
  const expected=pcCurrent(pcMessage(messageId));
  return Boolean(expected&&JSON.stringify(expected)===JSON.stringify(pcPayload(record)));
}
async function pcReceive({messageId,record,receiptToken}={}) {
  const message=pcMessage(messageId);if(!pcValid(message))return false;
  const packet=pcPacket(message),owner=message.author;
  if(!message.whisper?.includes(game.user.id)||packet.visibility==='gm'&&!game.user.isGM)return false;
  if(!record||record.id!==packet.noteId||record.revision!==packet.revision||Boolean(record.deleted)!==packet.deleted||JSON.stringify(record).length>50000)return false;
  if(!record.deleted&&(!record.note||typeof record.note.text!=='string'||typeof record.note.title!=='string'||!Array.isArray(record.note.targetUuids)||record.note.targetUuids.some(uuid=>typeof uuid!=='string')||record.note.rumour))return false;
  const stamp=Number(message.timestamp)||0,key=owner.id+':'+packet.visibility,id=record.id;
  const existing=pcRead().inbox?.[key]?.[id];if(existing?.deliveryStamp>=stamp)return true;
  if(!record.deleted&&(!owner.active||!await owner.query(PC_VERIFY,{messageId,record:pcPayload(record),receiptToken},{timeout:8000})))return false;
  await pcWrite(state=>{state.inbox[key]||={};if((state.inbox[key][id]?.deliveryStamp||0)>=stamp)return;state.inbox[key][id]={...pcPayload(record),deliveryStamp:stamp};});
  return true;
}
async function pcSend(message,{force=false}={}) {
  const record=pcCurrent(message);if(!record)return [];
  let receiptToken=pcRead().deliverySecrets?.[record.revision];
  if(!receiptToken) {
    // Available even on HTTP: unlike optional note encryption, random bytes do
    // not require SubtleCrypto. The token is never placed in a public flag.
    const bytes=crypto.getRandomValues(new Uint8Array(24));
    receiptToken=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
    await pcWrite(state=>{state.deliverySecrets||={};state.deliverySecrets[record.revision]||=receiptToken;});
    receiptToken=pcRead().deliverySecrets[record.revision];
  }
  const packet=pcPacket(message),pending=[];
  for(const id of message.whisper||[]) {
    if(id===game.user.id||!force&&pcRead().deliveryAcks?.[message.id]?.includes(id))continue;
    const user=game.users.get(id);
    if(!user||packet.visibility==='gm'&&!user.isGM)continue;
    if(!user.active){pending.push(id);continue;}
    try {
      const accepted=await user.query(PC_RECEIVE,{messageId:message.id,record,receiptToken},{timeout:8000});
      if(!accepted){pending.push(id);continue;}
      await pcWrite(state=>{state.deliveryAcks||={};state.deliveryAcks[message.id]=[...new Set([...(state.deliveryAcks[message.id]||[]),id])];});
    } catch {pending.push(id);}
  }
  return pending;
}
async function pcDeliver({id,ownerId,recipients,visibility,record}) {
  if(!recipients.length)throw Error('No recipients are available. The saved version remains in your Chronicle.');
  if(ownerId!==game.user.id)throw Error('A player can only share their own Chronicle.');
  let message=game.messages?.contents?.find(m=>m.author?.id===ownerId&&pcPacket(m)?.revision===record.revision&&pcPacket(m)?.noteId===id&&pcPacket(m)?.visibility===visibility);
  if(!message) {
    const escaped=String(game.user.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    message=await ChatMessage.create({content:'<p>Adventurer’s Tome — '+escaped+' '+(record.deleted?'withdrew a shared note':'shared a note')+'.</p><button type="button" data-pc-open-signals="'+id+'">Open '+(visibility==='gm'?'Player Signals':'My Chronicle')+'</button>',whisper:recipients,
      flags:{[PCSTORE_ID]:{chronicleDelivery:{version:2,ownerId,visibility,noteId:id,revision:record.revision,deleted:Boolean(record.deleted)}}}});
  }
  return {pendingRecipients:await pcSend(message)};
}
async function pcImportDeliveries() {
  for(const message of game.messages?.contents||[]) {
    if(!pcValid(message))continue;
    if(message.author.id===game.user.id){await pcSend(message);continue;}
    if(!message.whisper?.includes(game.user.id))continue;
    const packet=pcPacket(message),existing=pcRead().inbox?.[packet.ownerId+':'+packet.visibility]?.[packet.noteId];
    if(existing?.deliveryStamp>=Number(message.timestamp))continue;
    if(packet.deleted){await pcReceive({messageId:message.id,record:{id:packet.noteId,revision:packet.revision,deleted:true}});continue;}
    if(!message.author.active)continue;
    await message.author.query(PC_RETRY,{messageId:message.id},{timeout:12000}).catch(()=>{});
  }
}
Hooks.once('init',()=>{
  game.settings.register(PCSTORE_ID,PCSTORE_KEY,{scope:'user',config:false,type:Object,default:{version:1,books:{},inbox:{}}});
  CONFIG.queries[PC_RECEIVE]=pcReceive;
  CONFIG.queries[PC_VERIFY]=pcVerify;
  CONFIG.queries[PC_RETRY]=async({messageId}={})=>{const message=pcMessage(messageId);if(pcCurrent(message))await pcSend(message,{force:true});return true;};
});
Hooks.on('createChatMessage',message=>{if(pcValid(message))void pcImportDeliveries().catch(()=>{});});
Hooks.on('userConnected',()=>{void pcImportDeliveries().catch(()=>{});});
function pcPending(id,kind) {
  const state=pcRead(),record=state.books?.[kind]?.[id];
  const message=game.messages?.contents?.find(m=>m.author?.id===game.user.id&&pcPacket(m)?.noteId===id&&pcPacket(m)?.revision===record?.revision&&pcPacket(m)?.visibility===kind);
  return !message||(message.whisper||[]).some(userId=>game.users.get(userId)&&!state.deliveryAcks?.[message.id]?.includes(userId));
}
globalThis.AdventurersTomeChronicleStorage=Object.freeze({books:pcStorageBooks,deliver:pcDeliver,receive:pcReceive,importDeliveries:pcImportDeliveries,pending:pcPending});
