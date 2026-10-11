import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../scripts/player-chronicle.js',import.meta.url),'utf8');
function world(){
 const ctx=vm.createContext({structuredClone,TextEncoder,TextDecoder,btoa,atob,Uint8Array});vm.runInContext(source,ctx);
 const users=[{id:'a',name:'Alice',isGM:false},{id:'b',name:'Bob',isGM:false},{id:'gm',name:'GM',isGM:true}],docs=[],notices=[];let serial=0,now=1;
 const make=data=>{const doc={...data,id:String(++serial),uuid:`JournalEntry.${serial}`,documentName:'JournalEntry',getFlag:(_m,key)=>key.split('.').reduce((o,k)=>o?.[k],doc.flags),setFlag:async(_m,key,value)=>{const path=key.split('.');let obj=doc.flags;for(const part of path.slice(0,-1))obj=obj[part]??={};obj[path.at(-1)]=structuredClone(value);},testUserPermission:(user,level)=>user.isGM||Number(doc.ownership?.[user.id]||0)>=(level==='OWNER'?3:2)};doc.flags=data.flags?.['adventurers-tome']||{};docs.push(doc);return doc;};
 const target=make({name:'Lysa Marr',ownership:{a:2,b:2},flags:{}});
 const client=id=>ctx.createPlayerChronicle({user:()=>users.find(u=>u.id===id),users:()=>users,journals:()=>docs,worldId:()=> 'world',resolve:async uuid=>docs.find(d=>d.uuid===uuid),canView:(d,u)=>d.testUserPermission(u,'OBSERVER'),crypto:webcrypto,id:()=>`record${++serial}`,now:()=>now++,createJournal:async data=>make(data),notify:async data=>notices.push(data)});
 return {users,docs,target,client,notices};
}
test('Private is owner-only in Tome including GM; server ownership excludes player B',async()=>{
 const w=world(),gm=w.client('gm'),a=w.client('a'),b=w.client('b');await gm.provision();await a.save({title:'Private theory',text:'Secret'});
 assert.equal((await a.privateRows()).length,1);assert.equal((await b.privateRows()).length,0);assert.equal((await gm.sharedRows({gmOnly:true})).length,0);
 const book=w.docs.find(d=>d.flags.chronicleV1?.ownerId==='a'&&d.flags.chronicleV1.kind==='private');assert.equal(book.testUserPermission(w.users[1],'OBSERVER'),false);
 assert.equal((await w.client('a').privateRows())[0].text,'Secret');
});
test('Explicit GM share is durable, not a campaign fact; private edits do not update snapshot',async()=>{
 const w=world(),a=w.client('a'),gm=w.client('gm');await gm.provision();const note=await a.save({title:'Theory',text:'I suspect Vane',targetUuids:[w.target.uuid],signalType:'Suspicion'});
 await a.share(note.id,'gm',note.revision);assert.equal(w.notices.length,1);assert.equal((await gm.sharedRows({gmOnly:true}))[0].text,'I suspect Vane');assert.equal((await w.client('b').sharedRows()).length,0);
 await a.share(note.id,'gm',note.revision);assert.equal(w.notices.length,1);
 await a.save({text:'Changed privately'},{id:note.id,expectedRevision:note.revision});assert.equal((await gm.sharedRows({gmOnly:true}))[0].text,'I suspect Vane');
 await a.withdraw(note.id);assert.equal((await gm.sharedRows({gmOnly:true})).length,0);
});
test('Party links are intersected with recipient access; revocation removes visible UUIDs and counts',async()=>{
 const w=world(),a=w.client('a');await w.client('gm').provision();w.target.ownership.b=0;
 const note=await a.save({text:'A memory',targetUuids:[w.target.uuid]});await a.share(note.id,'party',note.revision);
 const rows=await w.client('b').sharedRows();assert.equal(rows.length,1);assert.equal(rows[0].linked.length,0);assert.equal(rows[0].targetUuids.length,0);
 w.target.ownership.a=0;assert.equal((await a.privateRows())[0].targetUuids.length,0);
});
test('Encryption survives a new client; wrong passphrase and record tampering fail closed',async()=>{
 const w=world(),a=w.client('a');await w.client('gm').provision();const note=await a.save({title:'Secret title',text:'Secret contents',targetUuids:[w.target.uuid]},{encrypt:true,phrase:'correct horse battery staple'});
 assert.ok(!JSON.stringify(w.docs).includes('Secret contents'));const next=w.client('a');assert.equal((await next.privateRows())[0].locked,true);
 await assert.rejects(()=>next.unlock(note.id,'wrong passphrase'),/Could not unlock/);await next.unlock(note.id,'correct horse battery staple');assert.equal((await next.privateRows())[0].text,'Secret contents');
 next.lock();assert.equal((await next.privateRows())[0].locked,true);await assert.rejects(()=>next.share(note.id,'gm',note.revision),/Unlock/);
});
test('Rename preserves UUID, stale edits are rejected, independent notes survive new clients',async()=>{
 const w=world(),a=w.client('a');await w.client('gm').provision();const first=await a.save({text:'One',targetUuids:[w.target.uuid],bookmark:true});w.target.name='Lysa Newname';assert.equal((await a.privateRows())[0].linked[0].name,'Lysa Newname');
 await w.client('a').save({text:'Two'});await a.save({text:'New one'},{id:first.id,expectedRevision:first.revision});await assert.rejects(()=>a.save({text:'Stale'},{id:first.id,expectedRevision:first.revision}),/another device/);assert.equal((await a.privateRows()).length,2);
});
test('Setup is GM-only and repeatable; no canonical duplicates are created',async()=>{
 const w=world();await assert.rejects(()=>w.client('a').provision(),/Only a GM/);await w.client('gm').provision();const count=w.docs.length;await w.client('gm').provision();assert.equal(w.docs.length,count);assert.equal(w.docs.filter(d=>d.name==='Lysa Marr').length,1);
});

test('Rumour stores a GM-only unconfirmed claim and provenance without creating an identity',async()=>{
 const w=world(),gm=w.client('gm');await gm.provision();const count=w.docs.length;
 const input={title:'Rumour',text:'A traveller claims Lysa smuggles goods',targetUuids:[w.target.uuid],rumour:{subjectUuid:w.target.uuid,sourceUuid:w.target.uuid,sourceText:'Unproven statement'}};
 await assert.rejects(()=>w.client('a').save(input),/Only a GM/);
 const saved=await gm.save(input),row=(await gm.privateRows())[0];assert.equal(row.rumour.certainty,'rumoured');assert.equal(row.rumour.sourceText,'Unproven statement');assert.equal(w.docs.length,count);
 assert.equal((await w.client('a').sharedRows()).length,0);await assert.rejects(()=>gm.share(saved.id,'party',saved.revision),/rumours stay/);
});
