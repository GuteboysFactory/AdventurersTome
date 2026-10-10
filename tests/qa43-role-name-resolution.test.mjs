import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
const briefing=(text,names)=>world('',false).api.campaignNewEntityDiscovery.briefingFor({text,names});

for(const [name,short,text,current,former] of [
 ['Orren Hale','Orren',"The group encountered Orren Hale, a former scout who once served under Captain Edric Vane. Orren left Vane's service two years ago and now works independently as a guide. According to Orren, Captain Edric Vane still commands the militia.",'guide','former scout'],
 ['Nora Ås','Nora','Vi mötte Nora Ås, en tidigare spejare. Nora arbetar nu självständigt som guide. Enligt Nora, kapten Erik Holm leder milisen.','guide','tidigare spejare'],
 ['Rhea North','Rhea','We met Rhea North, a retired healer. Rhea now works as a merchant.','merchant','retired healer']
])test(`Current and historical roles retain subject ownership: ${name}`,()=>{
 const b=briefing(text,[name,short]);assert.deepEqual(Array.from(b.currentRoles),[current]);assert.deepEqual(Array.from(b.historicalRoles),[former]);assert.deepEqual(Array.from(b.roles),[current]);
 assert.ok(b.briefItems.some(row=>row.label==='Historical role'&&row.value===former));assert.ok(!b.roles.some(role=>/captain|kapten/.test(role)));
 assert.ok(b.roleEvidence.every(row=>row.subject===name||row.subject===short));
});

for(const text of ['Rhea is not a captain.','Rhea was never a scout.','Rhea might be a captain.','We heard rumours about Rhea, a captain.','Rhea believes Dorian is a captain.','Enligt Rhea, kapten Erik Holm talade.','Rhea är inte kapten.','Vi hörde rykten om Rhea, en kapten.','Rhea arbetar kanske som guide.','Rhea is a guidance specialist.'])test(`No asserted role from denial, uncertainty, another subject or a partial word: ${text}`,()=>{
 assert.equal(briefing(text,['Rhea']).roles.length,0);
});

test('A later named subject and ambiguous pronoun do not donate their role',()=>{
 const b=briefing('Rhea met Dorian. Dorian works as a captain. He works as a guide.',['Rhea']);assert.equal(b.roles.length,0);
});

test('Existing short form is a ranked candidate, never a silent canonical merge',async()=>{
 const w=world('Nora spoke.',false),full=w.add('Nora Ås','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=await w.resolve(),row=rows.find(row=>row.text==='Nora');assert.equal(row.outcome,'REVIEW');
 const candidate=row.identityCandidates.find(row=>row.canonicalUuid===full.uuid);assert.ok(candidate);assert.equal(candidate.match.safe,false);assert.ok(candidate.match.rank>=50);
});

test('Competing full names stay in Review and no short identity is created',async()=>{
 const w=world('Nora spoke.',false);w.add('Nora Ås','Actor');w.add('Nora Lind','Actor');
 const rows=await w.resolve(),row=rows.find(row=>row.text==='Nora');assert.equal(row.outcome,'REVIEW');assert.equal(row.identityCandidates.length,2);assert.ok(!w.game.journal.contents.some(doc=>doc.name==='Nora'));
});

test('Fresh full name owns later short forms and stores current plus historical role',async()=>{
 const w=world('We met Rhea North, a former scout. Rhea now works as a guide. Rhea spoke. Rhea waited.',false);
 const rows=await w.resolve();assert.ok(!rows.some(row=>row.text==='Rhea'));
 const row=rows.find(row=>row.text==='Rhea North');assert.equal(row.outcome,'CREATED');
 const facts=w.docs.get(row.targetUuid).flags.worldProfile.facts;
 assert.ok(facts.some(fact=>fact.label==='Role / profession'&&fact.value==='guide'));
 assert.ok(facts.some(fact=>fact.label.startsWith('Historical role')&&fact.value==='former scout'));
});

test('Language provider remains evidence-only',()=>{
 const w=world('',false),before=w.docs.size,audit=w.context.AdventurersTomeLanguage.audit();
 w.context.AdventurersTomeLanguage.roleEvidence('Nora arbetar som guide.',['Nora']);
 assert.equal(audit.identityAuthority,false);assert.equal(audit.writeAuthority,false);assert.equal(w.docs.size,before);
});

test('Identical professions in one sentence retain separate subject evidence',()=>{
 const w=world('',false),rows=w.context.AdventurersTomeLanguage.roleEvidence('Rhea is a guide and Dorian is a guide.',['Rhea','Dorian']);
 assert.deepEqual(Array.from(rows,row=>row.subject).sort(),['Dorian','Rhea']);
});

test('Named title belongs to its bearer, not the reporting person, in both languages',()=>{
 for(const [text,names,role] of [['According to Rhea, Captain Dorian West arrived.',['Dorian West'],'captain'],['Enligt Nora, kapten Erik Holm anlände.',['Erik Holm'],'kapten']])assert.deepEqual(Array.from(briefing(text,names).roles),[role]);
});

test('Question and trailing rumour do not become asserted roles',()=>{
 for(const text of ['Rhea is a captain?','Rhea is a captain according to rumours.'])assert.equal(briefing(text,['Rhea']).roles.length,0);
});

test('Another established full-name person prevents silent short-form consolidation',async()=>{
 const w=world('We met Rhea North, a former scout. Rhea spoke. Rhea waited.',false);w.add('Rhea South','Actor');
 const scan=await w.scan(),short=scan.candidates.find(row=>row.text==='Rhea');assert.ok(short);assert.equal(short.ambiguousSourceReference,true);
 const rows=await w.api.campaignEntityCreation.resolveCandidates(scan.candidates);assert.equal(rows.find(row=>row.text==='Rhea').outcome,'REVIEW');assert.ok(!w.game.journal.contents.some(doc=>doc.name==='Rhea'));
});

test('Immediate coordinated role changes share their subject, but a new named subject does not',()=>{
 for(const [text,current,old] of [['Rhea was a scout and now works as a guide.','guide','former scout'],['Rhea var spejare men arbetar nu som guide.','guide','tidigare spejare'],['Rhea, a former scout, now works as a guide.','guide','former scout']]) {
  const b=briefing(text,['Rhea']);assert.deepEqual(Array.from(b.currentRoles),[current]);assert.deepEqual(Array.from(b.historicalRoles),[old]);
 }
 const b=briefing('Rhea was a scout and Dorian works as a guide.',['Rhea']);assert.equal(b.currentRoles.length,0);
});
