import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
import fs from 'node:fs';

test('Shared sentence boundaries preserve titles, initials, decimals and source offsets',()=>{
 const w=world('',false),api=w.context.AdventurersTomeLanguage;
 const text='Dr. Nora Lind met J. Smith. They paid 2.5 coins!\nNästa morgon reste de.';
 const rows=api.sentences(text);
 assert.equal(rows.length,3);assert.equal(rows[0][0],'Dr. Nora Lind met J. Smith.');
 for(const row of rows)assert.equal(text.slice(row.index,row.index+row[0].length),row[0]);
});

for(const [text,role] of [['Nora Lind arbetar fortfarande som smed.','smed'],['Nora Lind still works as a blacksmith.','blacksmith'],['Nora Lind, who works as a courier, waited.','courier'],['Nora Lind, en läkare, väntade.','läkare']])test(`Attached role: ${text}`,()=>{
 const api=world('',false).context.AdventurersTomeLanguage;
 assert.ok(api.roleEvidence(text,['Nora Lind']).some(row=>row.role===role&&row.status==='current'));
});

for(const text of ['Om Nora är smed får hon komma in.','If Nora is a smith, she can enter.','Nora vill arbeta som smed.','Nora plans to work as a smith.','Nora är läkare?','Nora is a doctor?','Ett rykte säger att Nora är kapten.','A rumour says that Nora is a captain.','Nora sade att Elin är läkare.','Nora said that Elin is a doctor.','”Nora är läkare”, stod det.','"Nora is a doctor", said Elin.','Nora är inte smed.','Nora was never a soldier.'])test(`No asserted role: ${text}`,()=>{
 const api=world('',false).context.AdventurersTomeLanguage;
 assert.equal(api.roleEvidence(text,['Nora','Elin']).length,0);
});

for(const [place,head] of [['Dalviks','vaktjournal'],['Lövåsens','expeditionsrapport'],['Ekebys','resebok'],["Ashford's",'ledger']])test(`Complete document compound: ${place} ${head}`,async()=>{
 const title=`${place} ${head}`,text=place.includes("'")?`We carried a document titled ${title}.`:`Vi bar ett dokument med titeln ${title}.`;
 const rows=(await world(text,false).scan()).candidates;
 assert.ok(rows.some(row=>row.text===title&&row.classification.kind==='item'),JSON.stringify(rows.map(row=>[row.text,row.classification.kind])));
 assert.ok(!rows.some(row=>row.text===place));
});

test('Narrative function words are not new identities; explicit existing names survive',async()=>{
 const w=world('Nästa morgon reste de. Journalen låg kvar. However, they waited. Next morning they left.',false);
 assert.equal((await w.scan()).candidates.length,0);
 const named=world('Next väntade.',false);named.add('Next','Actor');
 assert.ok((await named.scan()).candidates.some(row=>row.text==='Next'));
});

for(const title of ['Kapten','Captain','Doktor','Dr.'])test(`Title-qualified full name reuses unique person: ${title}`,async()=>{
 const w=world(`${title} Nora Lind väntade.`,false),person=w.add('Nora Lind','Actor');
 const matches=w.api.campaignEntityCreation.existingMatches({text:`${title} Nora Lind`,kind:'character',sourceUuid:w.session.uuid});
 assert.ok(matches.some(row=>row.match.safe&&row.match.authorityUuid===person.uuid));
});

test('Title matching preserves namesake ambiguity',async()=>{
 const w=world('Kapten Nora Lind väntade.',false);w.add('Nora Lind','Actor');w.add('Nora Lind','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=await w.resolve();assert.ok(rows.some(row=>row.outcome==='REVIEW'));assert.equal(w.links.size,0);
});

test('Unique pronoun role attribution and ambiguous pronoun abstention',async()=>{
 const single=world('Nora Lind, en spejare, väntade. Hon arbetar nu som läkare.',false);
 const row=(await single.scan()).candidates.find(row=>row.text==='Nora Lind');assert.ok(row.identityBriefing.currentRoles.includes('läkare'));
 const multi=world('Nora Lind mötte Elin Berg. Hon arbetar nu som läkare.',false);
 for(const row of (await multi.scan()).candidates)assert.ok(!row.identityBriefing.currentRoles.includes('läkare'));
});

test('References never cross paragraph boundaries and carry exact source anchors',()=>{
 const api=world('',false).context.AdventurersTomeLanguage;
 const text='Nora Lind waited. She works as a doctor.\n\nShe works as a smith.';
 const rows=api.references(text,['Nora Lind']);assert.equal(rows[0].resolved,'Nora Lind');assert.equal(rows[1].resolved,null);
 for(const row of rows)assert.equal(text.slice(row.start,row.end),row.text);
});

test('Reported, hypothetical and interrogative relationships are never asserted',async()=>{
 for(const text of ['Nora Lind knows Elin Berg?','Nora Lind känner Elin Berg?','Nora Lind said that Elin Berg works for Copper Circle.','Om Nora Lind arbetar för Copper Circle väntar vi.']) {
  const w=world(text,false);w.add('Nora Lind','Actor');w.add('Elin Berg','Actor');w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  const rows=(await w.api.campaignRelationshipEvidence.sync()).evidence;
  assert.ok(rows.every(row=>row.certainty!=='asserted'),text);
 }
});

test('Session 8 boundaries, title reuse and later genuine ambiguity',async()=>{
 const text=`Kapten Alva Lind mötte gruppen vid porten. Alva leder fortfarande Björkbackas stadsvakt.
 På vägen mot Åsby mötte gruppen Karin Berg, en före detta spejare. Karin arbetar nu som läkare.
 Karin presenterade sin vän Oskar Holm, som arbetar som smed. Oskar har aldrig varit soldat.
 Karin överlämnade ett dokument med titeln Åsbys vaktjournal. Journalen beskrev nattliga besök vid ortens norra port.
 Vid Åsbys norra port mötte gruppen Karin Lind, som arbetar som handlare. Karin Lind känner inte Karin Berg.
 Senare stod det att ”Karin väntade vid brunnen”, utan att ange vilken av dem som avsågs.
 Nästa morgon skulle de fråga Toren om besöken vid porten.`;
 const w=world(text,false);w.add('Alva Lind','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=(await w.scan()).candidates;
 for(const name of ['Nästa','Journalen','Åsbys'])assert.ok(!rows.some(row=>row.text===name),name);
 assert.ok(rows.some(row=>row.text==='Åsbys vaktjournal'&&row.classification.kind==='item'));
 assert.equal(rows.find(row=>row.text==='Karin')?.ambiguousSourceReference,true);
 assert.ok(rows.find(row=>row.text==='Karin Berg').identityBriefing.currentRoles.includes('läkare'));
 assert.ok(!rows.find(row=>row.text==='Oskar Holm').identityBriefing.historicalRoles.includes('soldat'));
 const resolved=await w.resolve();assert.ok(resolved.some(row=>row.text==='Kapten Alva Lind'&&row.outcome==='LINKED'));
});

test('Full Session 8 retains campaign choices, source and idempotence',async()=>{
 const text=fs.readFileSync(new URL('./fixtures/session8-brevet-fran-asby.txt',import.meta.url),'utf8');
 const w=world(text,true),gunther=w.game.actors.contents.find(row=>row.name==='Gunther');
 w.add('Gunther','JournalEntry',{worldProfile:{category:'contact'}});
 await w.api.campaignReviewLearning.setMatchingPolicy({mode:'default',text:'Gunther',targetUuid:gunther.uuid});
 for(const [name,category] of [['Alva Lind','contact'],['Signe Berg','contact'],['Signe Dahl','contact'],['Toren Vale','contact'],['Björkbacka','location'],['Björkbackas leveransbok','item'],['Björkbackas stadsvakt','faction']])w.add(name,'JournalEntry',{worldProfile:{category}});
 const rows=await w.resolve();
 assert.equal(rows.find(row=>row.text==='Gunther')?.targetUuid,gunther.uuid);
 for(const name of ['Nästa','Journalen','Åsbys'])assert.ok(!rows.some(row=>row.text===name),name);
 assert.ok(rows.some(row=>row.text==='Karin'&&row.outcome==='REVIEW'));
 assert.ok(rows.some(row=>row.text==='Åsbys vaktjournal'&&row.classification.kind==='item'));
 const count=w.docs.size;await w.resolve();assert.equal(w.docs.size,count);assert.equal(w.page.text.content,text);
});
