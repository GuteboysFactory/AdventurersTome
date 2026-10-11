import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const storage=fs.readFileSync(new URL('../scripts/player-chronicle-storage.js',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../scripts/player-chronicle.js',import.meta.url),'utf8');
function setup(){
 const users=[{id:'a',name:'Alice',active:false},{id:'b',name:'Bob',active:false},{id:'gm',name:'GM',isGM:true,active:false}],states={},messages=[],clients={};let serial=0,fail=false;
 for(const user of users)user.query=async(name,data)=>{if(!user.active||!clients[user.id])throw Error('offline');return clients[user.id][name](structuredClone(data));};
 function client(id){
  const hooks={},user=users.find(u=>u.id===id),queries={};clients[id]=queries;user.active=true;
  const game={user,users:{get:id=>users.find(u=>u.id===id),contents:users},messages:{contents:messages},settings:{register:(_m,_k,s)=>{assert.equal(s.scope,'user');},get:()=>states[id],set:async(_m,_k,value)=>{states[id]=structuredClone(value);}}};
  const ctx=vm.createContext({game,crypto:webcrypto,CONFIG:{queries},structuredClone,TextEncoder,TextDecoder,btoa,atob,Uint8Array,Hooks:{once:(k,f)=>hooks[k]=f,on:()=>{}},ui:{notifications:{warn:()=>{}}},ChatMessage:{create:async data=>{if(fail)throw Error('offline');const m={...data,id:`message${++serial}`,author:user,timestamp:++serial,getFlag:(_m,k)=>data.flags['adventurers-tome'][k],delete:async()=>messages.splice(messages.indexOf(m),1)};messages.push(m);return m;}}});
  vm.runInContext(storage,ctx);hooks.init();vm.runInContext(model,ctx);const adapter=ctx.AdventurersTomeChronicleStorage;
  const api=ctx.createPlayerChronicle({user:()=>user,users:()=>users,journals:adapter.books,userScoped:true,worldId:()=> 'world',resolve:async()=>null,canView:()=>false,id:()=>`id${++serial}`,now:()=>++serial,notify:adapter.deliver,deliveryPending:adapter.pending});
  return {api,adapter};
 }
 return {client,states,messages,users,setFail:value=>fail=value};
}
test('Server user storage works without GM provisioning and survives a second browser',async()=>{
 const w=setup(),a=w.client('a');await a.api.save({title:'Private',text:'Never broadcast'});
 assert.equal(w.messages.length,0);assert.equal((await w.client('a').api.privateRows())[0].text,'Never broadcast');
 assert.equal((await w.client('b').api.privateRows()).length,0);assert.equal((await w.client('gm').api.sharedRows()).length,0);
});
test('Addressed offline delivery imports once and survives removal of chat notification',async()=>{
 const w=setup(),a=w.client('a'),note=await a.api.save({title:'Theory',text:'Explicitly shared'});await a.api.share(note.id,'gm',note.revision);
 assert.deepEqual(Array.from(w.messages[0].whisper),['gm']);
 assert.equal(w.messages[0].flags['adventurers-tome'].chronicleDelivery.snapshot.note.text,'Explicitly shared');
 assert.ok(!w.messages[0].content.includes('Explicitly shared'));
 const b=w.client('b');await b.adapter.importDeliveries();assert.equal((await b.api.sharedRows()).length,0);
 const gm=w.client('gm');await gm.adapter.importDeliveries();await gm.adapter.importDeliveries();assert.equal((await gm.api.sharedRows()).length,1);
 w.messages.length=0;assert.equal((await w.client('gm').api.sharedRows())[0].text,'Explicitly shared');
 await a.api.share(note.id,'gm',note.revision);assert.equal(w.messages.length,1);
});
test('Failed delivery is retryable without changing private text',async()=>{
 const w=setup(),a=w.client('a'),note=await a.api.save({text:'Retry'});w.setFail(true);
 assert.match((await a.api.share(note.id,'gm',note.revision)).notificationError,/offline/);w.setFail(false);
 await a.api.share(note.id,'gm',note.revision);assert.equal(w.messages.length,1);await a.api.share(note.id,'gm',note.revision);assert.equal(w.messages.length,1);
});
test('Withdrawal removes queued content and applies to durable recipient inbox',async()=>{
 const w=setup(),a=w.client('a'),gm=w.client('gm'),note=await a.api.save({text:'Withdraw me'});await a.api.share(note.id,'gm',note.revision);await gm.adapter.importDeliveries();
 await a.api.withdraw(note.id);assert.ok(JSON.stringify(w.messages).includes('Withdraw me'));assert.equal(w.messages.at(-1).flags['adventurers-tome'].chronicleDelivery.deleted,true);await gm.adapter.importDeliveries();assert.equal((await gm.api.sharedRows()).length,0);
});
test('Forged author and malformed payloads never enter recipient storage',async()=>{
 const w=setup(),a=w.client('a'),gm=w.client('gm'),note=await a.api.save({text:'Valid'});await a.api.share(note.id,'gm',note.revision);
 // Clear the legitimate receipt to exercise incoming validation independently.
 w.states.gm.inbox={};
 const message=w.messages[0],packet=message.getFlag('', 'chronicleDelivery'),record=structuredClone(w.states.a.books.gm[note.id]);packet.ownerId='b';
 assert.equal(await gm.adapter.receive({messageId:message.id,record}),false);assert.equal((await gm.api.sharedRows()).length,0);
 packet.ownerId='a';record.note.targetUuids={hidden:true};assert.equal(await gm.adapter.receive({messageId:message.id,record}),false);
 record.note.targetUuids=[];record.note.text='Forged text';assert.equal(await gm.adapter.receive({messageId:message.id,record}),false);assert.equal((await gm.api.sharedRows()).length,0);
});

test('A retry request cannot redirect note text to a non-recipient',async()=>{
 const w=setup(),a=w.client('a'),b=w.client('b'),note=await a.api.save({text:'GM only'});await a.api.share(note.id,'gm',note.revision);w.client('gm');
 const response=await w.users[0].query('adventurers-tome.chronicleRetry',{messageId:w.messages[0].id,recipientId:'b'});
 assert.equal(response,true);assert.equal((await b.api.sharedRows()).length,0);assert.ok(!w.messages[0].whisper.includes('b'));
 assert.equal(await w.users[0].query('adventurers-tome.chronicleVerify',{messageId:w.messages[0].id,record:w.states.a.books.gm[note.id]}),false);
});
