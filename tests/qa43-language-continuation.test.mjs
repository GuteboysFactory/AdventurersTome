import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';

test('Swedish both introduces two names, never a location named Both Signe Berg',async()=>{
 const w=world('Både Signe Berg och Signe Dahl återvände till porten före kvällen.',false);
 w.add('Signe Berg','JournalEntry',{worldProfile:{category:'contact'}});
 w.add('Signe Dahl','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=(await w.scan()).candidates;
 assert.ok(!rows.some(row=>/^Både /u.test(row.text)));
 assert.ok(rows.some(row=>row.text==='Signe Berg'));
 assert.ok(rows.some(row=>row.text==='Signe Dahl'));
});

for (const [text, role, status] of [
 ['Nora har tidigare varit soldat.', 'soldat', 'historical'],
 ['Nora hade arbetat som smed.', 'smed', 'historical'],
 ['Nora brukade arbeta som läkare.', 'läkare', 'historical'],
 ['Nora used to work as a doctor.', 'doctor', 'historical'],
 ['Nora had served as a scout.', 'scout', 'historical'],
 ['Nora has previously been a soldier.', 'soldier', 'historical'],
 ['Nora arbetar för närvarande som kurir.', 'kurir', 'current'],
 ['Nora is currently working as a courier.', 'courier', 'current'],
 ['Nora brukade vara spejare.', 'spejare', 'historical'],
 ['Nora used to be a scout.', 'scout', 'historical'],
 ['Nora, som hade arbetat som smed, väntade.', 'smed', 'historical'],
 ['Nora, who had worked as a smith, waited.', 'smith', 'historical'],
]) test(`Temporal role: ${text}`,()=>{
 const rows=world('',false).context.AdventurersTomeLanguage.roleEvidence(text,['Nora']);
 assert.ok(rows.some(row=>row.role.endsWith(role)&&row.status===status),JSON.stringify(rows));
 assert.ok(!rows.some(row=>row.status!==status));
});

for(const text of [
 'Nora har aldrig varit soldat.', 'Nora hade inte arbetat som smed.',
 'Nora has never been a soldier.', "Nora wasn't a soldier.",
 'Nora is not currently working as a courier.',
 'Nora used to visit a doctor.', 'Nora brukade besöka en läkare.',
 'Nora has been a soldier.', 'Nora har varit soldat.',
 'Nora might have been a soldier.', 'Om Nora hade varit soldat skulle hon förstå.',
 'A rumour says that Nora used to be a scout.',
 'Ett rykte säger att Nora har tidigare varit soldat.',
 'Nora used to be a scout?', 'Nora hade varit soldat?',
 'Nora har tidigare varit hos en läkare.',
 'Nora had worked for a doctor.',
]) test(`No invented temporal role: ${text}`,()=>{
 assert.equal(world('',false).context.AdventurersTomeLanguage.roleEvidence(text,['Nora']).length,0);
});

for(const [text,current,historical] of [
 ['Nora arbetar som kurir men hade arbetat som smed.','kurir','smed'],
 ['Nora works as a courier but used to be a scout.','courier','scout'],
])test(`Coordinated roles retain their individual time: ${text}`,()=>{
 const rows=world('',false).context.AdventurersTomeLanguage.roleEvidence(text,['Nora']);
 assert.ok(rows.some(row=>row.role===current&&row.status==='current'));
 assert.ok(rows.some(row=>row.role.endsWith(historical)&&row.status==='historical'));
});

test('A new named subject cannot donate its former profession to the first person',()=>{
 const api=world('',false).context.AdventurersTomeLanguage;
 for(const text of ['Nora works as a courier but Elin used to be a scout.','Nora arbetar som kurir men Elin hade arbetat som smed.']){
  const rows=api.roleEvidence(text,['Nora','Elin']);
  assert.ok(rows.some(row=>row.subject==='Elin'&&row.status==='historical'));
  assert.ok(!rows.some(row=>row.subject==='Nora'&&row.status==='historical'));
 }
});

test('Historical pronoun role belongs to its unambiguous source subject',async()=>{
 const w=world('Nora Lind arbetar som kurir. Hon hade arbetat som smed.',false);
 const row=(await w.scan()).candidates.find(row=>row.text==='Nora Lind');
 assert.ok(row.identityBriefing.currentRoles.includes('kurir'));
 assert.ok(row.identityBriefing.historicalRoles.some(role=>role.endsWith('smed')));
});

for(const text of ['Vi stannade i Åsby över natten.','They stayed in Ashford overnight.'])test(`New place retains place classification: ${text}`,async()=>{
 const rows=(await world(text,false).scan()).candidates;
 assert.ok(rows.some(row=>row.classification.kind==='location'));
});
