import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
for(const text of ['Oskar Holm kom dit med en reparerad lykta. Oskar arbetar som smed.','Oskar Holm arrived with a repaired lantern. Oskar works as a smith.'])test(`Existing full name anchors local short name: ${text}`,async()=>{
 const w=world(text,false),person=w.add('Oskar Holm','JournalEntry',{worldProfile:{category:'contact'}});
 const result=await w.resolve(),short=result.find(r=>r.text==='Oskar');assert.ok(!short||short.outcome==='LINKED');
 const start=text.lastIndexOf('Oskar');
 const direct=await w.api.campaignEntityCreation.resolveCandidates([{text:'Oskar',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,mentions:[{context:text,start,end:start+5}]}],{allowCreate:false});
 assert.equal(direct[0].outcome,'LINKED');assert.equal(direct[0].targetUuid,person.uuid);
});
test('Competing first names remain a decision despite nearby full name',async()=>{
 const w=world('Oskar Holm arrived. Oskar works as a smith.',false);w.add('Oskar Holm','Actor');w.add('Oskar Lind','Actor');const short=(await w.resolve()).find(r=>r.text==='Oskar');assert.equal(short.outcome,'REVIEW');
});
test('A short name without a source anchor is not automatically linked',async()=>{
 const w=world('Oskar works as a smith.',false);w.add('Oskar Holm','Actor');const short=(await w.resolve()).find(r=>r.text==='Oskar');assert.equal(short.outcome,'REVIEW');
});

test('A future full name does not anchor an earlier short name',async()=>{
 const text='Oskar waited outside. Oskar Holm arrived later.',w=world(text,false);w.add('Oskar Holm','Actor');
 const result=await w.api.campaignEntityCreation.resolveCandidates([{text:'Oskar',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,mentions:[{context:text,start:0,end:5}]}],{allowCreate:false});
 assert.equal(result[0].outcome,'REVIEW');
});
