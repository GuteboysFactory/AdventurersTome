import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';

const session=`Arne, Baran och Citronimus lämnade Stonecross och följde vägen mot Björkbacka. Orren Hale följde med dem. Orren arbetar nu som guide. Han tjänstgjorde tidigare under kapten Edric Vane, men lämnade hans tjänst för två år sedan.
Vid Björkbackas södra port mötte gruppen Signe Berg, en före detta soldat. Signe arbetar nu som smed. Hon presenterade dem för kapten Alva Lind, som leder Björkbackas stadsvakt. Signe har aldrig tjänstgjort under Alva.
Alva berättade att hon känner Lysa Marr. Lysa och Alva är vänner. Alva samarbetar ibland med Pale Wardens, men är inte medlem i organisationen.
Signe överlämnade ett dokument med titeln Björkbackas leveransbok. Boken innehöll uppgifter om leveranser mellan Björkbacka och Stonecross. En anteckning nämnde Fox and Lantern Inn, men angav inte vem som hade tagit emot varorna.
Vid brunnen träffade gruppen också Signe Dahl, som arbetar som kurir. Signe Dahl känner inte Signe Berg sedan tidigare. Senare stod det i gruppens anteckningar att ”Signe väntade vid porten”, utan att ange vilken av dem som avsågs.
Alva hade hört ett rykte om att Toren Vale hjälpte smugglare. Hon hade inga bevis. Baran påpekade att ryktet inte visade att Toren hade gjort något fel.
Citronimus föreslog att de skulle fråga Gunther om leveranserna. Arne ville fortsätta samma kväll, men gruppen bestämde sig för att stanna i Björkbacka över natten och behålla leveransboken tills de hade undersökt uppgifterna.`;

test('Session 7 Swedish boundaries, types and genuine ambiguous short form',async()=>{
 const w=world(session,false),scan=await w.scan(),rows=scan.candidates;
 for(const name of ['Vid','Boken','Björkbackas','Vid Björkbackas','Lysa och Alva','Baran och Citronimus','Björkbacka och Stonecross','Stonecross och'])assert.ok(!rows.some(row=>row.text===name),name);
 for(const [name,kind] of [['Signe Berg','character'],['Signe Dahl','character'],['Alva Lind','character'],['Björkbacka','location'],['Björkbackas leveransbok','item'],['Björkbackas stadsvakt','faction'],['Fox and Lantern Inn','location']])assert.equal(rows.find(row=>row.text===name)?.classification.kind,kind,name);
 assert.equal(rows.find(row=>row.text==='Signe')?.ambiguousSourceReference,true);
 assert.ok(rows.find(row=>row.text==='Signe Berg').identityBriefing.historicalRoles.includes('före detta soldat'));
 assert.ok(rows.find(row=>row.text==='Signe Berg').identityBriefing.currentRoles.includes('smed'));
 assert.ok(rows.find(row=>row.text==='Signe Dahl').identityBriefing.currentRoles.includes('kurir'));
});

test('Later ambiguous short-name roles cannot leak into either full-name profile',async()=>{
 const rows=(await world('Vi mötte Nora Berg, en soldat. Nora arbetar nu som smed. Vi mötte Nora Lind, en kurir. Nora arbetar nu som kapten.',false).scan()).candidates;
 assert.ok(rows.find(row=>row.text==='Nora Berg').identityBriefing.currentRoles.includes('smed'));
 for(const name of ['Nora Berg','Nora Lind'])assert.ok(!rows.find(row=>row.text===name).identityBriefing.currentRoles.includes('kapten'));
 assert.equal(rows.find(row=>row.text==='Nora').ambiguousSourceReference,true);
});

for(const [name,job,old] of [['Nora Berg','smed','soldat'],['Åsa Lind','kurir','helare'],['Elin Sjö','bibliotekarie','spejare']])test(`Subject-bound professions outweigh surname geography: ${name}`,async()=>{
 const short=name.split(' ')[0],w=world(`Vid hamnen mötte vi ${name}, en före detta ${old}. ${short} arbetar nu som ${job}. ${short} väntade.`,false),rows=(await w.scan()).candidates;
 const row=rows.find(row=>row.text===name);assert.equal(row.classification.kind,'character');
 assert.deepEqual(Array.from(row.identityBriefing.currentRoles),[job]);assert.deepEqual(Array.from(row.identityBriefing.historicalRoles),[`före detta ${old}`]);
 assert.ok(!rows.some(row=>row.text===short));
 assert.ok(!row.identityBriefing.briefItems.some(item=>item.label==='Location'));
});

test('Coordination splits people and places but retains establishments and particles',async()=>{
 const rows=(await world('Nora och Elin gick mot Åsby. Åsby och Dalvik ligger nära varandra. De besökte Räv och Lykta Värdshus och Fox and Lantern Inn. De mötte Erik von Aln.',false).scan()).candidates;
 for(const name of ['Nora','Elin','Åsby','Dalvik','Räv och Lykta Värdshus','Fox and Lantern Inn','Erik von Aln'])assert.ok(rows.some(row=>row.text===name),name);
 assert.ok(!rows.some(row=>/och$/.test(row.text)));
});

test('Possessive normalization needs an attested base and location context',async()=>{
 const rows=(await world('Vi reste mot Åsby. Vid Åsbys norra port väntade Jonas och Vis. Jonas talade. Vis väntade.',false).scan()).candidates;
 assert.ok(rows.some(row=>row.text==='Åsby'&&row.mentionCount===2));assert.ok(!rows.some(row=>row.text==='Åsbys'));
 for(const name of ['Jonas','Vis'])assert.ok(rows.some(row=>row.text===name));
});

for(const text of ['Nora är inte smed.','Nora var aldrig soldat.','Nora arbetar kanske som kurir.','Ett rykte säger att Nora är kapten.','Nora är smed?','Nora tror att Elin är smed.'])test(`Do not assert Swedish denied/uncertain/other-subject role: ${text}`,()=>{
 const w=world('',false);assert.equal(w.context.AdventurersTomeLanguage.roleEvidence(text,['Nora']).length,0);
});

test('Singular Swedish rumour is uncertain, cooperation is not membership',async()=>{
 const w=world('Nora Lind samarbetar ibland med Kopparorden, men är inte medlem i organisationen. Nora Lind ryktas arbeta för Kopparorden.',false);
 w.add('Nora Lind','Actor');w.add('Kopparorden','JournalEntry',{worldProfile:{category:'faction'}});
 const rows=(await w.api.campaignRelationshipEvidence.sync()).evidence;
 assert.ok(rows.some(row=>row.relationType==='WORKS_WITH'&&row.polarity==='positive'));
 assert.ok(rows.some(row=>row.relationType==='MEMBER_OF'&&row.polarity==='negative'));
 assert.ok(rows.some(row=>row.relationType==='WORKS_FOR'&&row.certainty==='rumoured'));
});

for(const [predicate,polarity,time] of [['är vänner','positive','current'],['är inte vänner','negative','current'],['var vänner','positive','historical']])test(`Coordinated Swedish friendship: ${predicate}`,async()=>{
 const w=world(`Nora Lind och Elin Berg ${predicate}.`,false);w.add('Nora Lind','Actor');w.add('Elin Berg','Actor');
 const rows=(await w.api.campaignRelationshipEvidence.sync()).evidence.filter(row=>row.relationType==='FRIEND_OF');
 assert.equal(rows.length,1);assert.equal(rows[0].polarity,polarity);assert.equal(rows[0].temporalScope,time);
});

test('An existing person with a geographical surname is reused; later short form is source-bound',async()=>{
 const w=world('Ett rykte nämnde Nora Vale. Nora väntade.',false),person=w.add('Nora Vale','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=await w.resolve();assert.equal(rows.length,1);assert.equal(rows[0].outcome,'LINKED');assert.equal(rows[0].targetUuid,person.uuid);
 assert.equal(person.flags.worldProfile.category,'contact');
});

test('Old wrong type is offered for correction without duplicate creation or silent retyping',async()=>{
 const w=world('Vi mötte Nora Berg, en före detta soldat. Nora arbetar nu som smed.',false),old=w.add('Nora Berg','JournalEntry',{worldProfile:{category:'location'}}),count=w.docs.size;
 const row=(await w.resolve()).find(row=>row.text==='Nora Berg');assert.equal(row.outcome,'REVIEW');assert.equal(w.docs.size,count);
 assert.equal(old.flags.worldProfile.category,'location');assert.ok(row.identityCandidates.some(candidate=>candidate.canonicalUuid===old.uuid&&candidate.match.reason==='source-type-conflict'));
});

test('Reanalysis retires old grammar noise while retaining its audit history',async()=>{
 const w=world('Vid brunnen mötte vi Nora Lind, en kurir.',false),real=w.api.campaignNewEntityDiscovery;
 const old={id:'old-vid',text:'Vid',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceKind:'session',sourceName:w.session.name,
  classification:{kind:'unknown',confidence:0,signals:[]},detection:{score:0.5},mentions:[{start:0,end:3,context:'Vid brunnen'}]};
 w.api.campaignNewEntityDiscovery={...real,scan:async()=>({candidates:[old]})};
 await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});
 assert.ok(w.api.campaignMentionEvidence.snapshot().records.some(row=>row.active&&row.mentionText==='Vid'));
 w.api.campaignNewEntityDiscovery=real;
 await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});
 const rows=w.api.campaignMentionEvidence.snapshot().records;
 assert.ok(rows.some(row=>row.active===false&&row.mentionText==='Vid'));
 assert.ok(!rows.some(row=>row.active&&row.mentionText==='Vid'));
});

test('Session 7 repeated analysis creates no duplicate identities and preserves text',async()=>{
 const w=world(session,true);await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});const count=w.docs.size;
 w.reload('campaign-new-entity-discovery.js');await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});
 assert.equal(w.docs.size,count);assert.equal(w.page.text.content,session);
 assert.equal(w.game.journal.contents.filter(doc=>doc.name==='Signe Berg').length,1);
 assert.ok(!w.game.journal.contents.some(doc=>doc.name==='Signe'));
});
