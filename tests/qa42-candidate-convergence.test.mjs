import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {world} from './helpers/tome-world.mjs';
const fixture=fs.readFileSync(new URL('./fixtures/echoes-of-greyfen.txt',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8');
function campaign(text=fixture){
 const w=world(text,false);w.session.flags.sessionNumber=5;
 for(const name of ['Arne','Baran','Citronimus','Gunther'])w.add(name,'Actor');
 for(const name of ['Lysa Marr','Elira Voss','Captain Edric Vane','Toren Vale','Mara Venn'])w.add(name,'JournalEntry',{worldProfile:{category:'contact'}});
 for(const name of ['Greyfen Ruins','Greyfen Chapel','Blackbridge Watch','Stonecross Watch','Fox and Lantern Inn'])w.add(name,'JournalEntry',{worldProfile:{category:'location'}});
 for(const name of ['Pale Wardens','Blackbridge militia','Ashen Hand','Order of the Silver Lantern'])w.add(name,'JournalEntry',{worldProfile:{category:'faction'}});
 w.add('Ashen Ledger','JournalEntry',{worldProfile:{category:'lore'}});return w;
}
function analysis(w,rows){
 w.context.normalizeImportName=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 w.context.getActorProfile=doc=>doc.getFlag('','actorProfile')||{};w.context.getWorldProfile=doc=>doc.getFlag('','worldProfile')||{};
 w.context.resolveWorldActor=entry=>w.game.actors.contents.find(doc=>doc.name===entry.name)||null;w.context.WORLD_CATEGORIES={};
 vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld(')),w.context);
 w.context.rows=rows;return vm.runInContext('campaignAnalysisView({rows})',w.context);
}
const reviewRow=(text,targets,kind='unknown')=>({mentionText:text,targetName:text,sourceUuid:'JournalEntry.source',lifecycle:'active',relationGroup:'review',relationLabel:'Needs review',targetKind:kind,identityCandidates:targets});

test('Source briefing never assigns the following named captain role to the reporting person',async()=>{
 for(const text of ['According to Orren, Captain Edric Vane still commands the militia. Orren spoke.', 'Enligt Sanna, kapten Erik Holm leder milisen. Sanna talade.']) {
  const w=world(text,false),scan=await w.scan(),person=scan.candidates.find(row=>['Orren','Sanna'].includes(row.text));
  assert.ok(person);assert.ok(!person.identityBriefing.roles.some(role=>/captain|kapten/iu.test(role)));
 }
 const w=world('We met Tala Reed, a former scout who knows the road.',false),scan=await w.scan();
 assert.ok(scan.candidates.find(row=>row.text==='Tala Reed').identityBriefing.roles.includes('former scout'));
});

test('Stale candidate display names cannot disguise an unrelated live identity',()=>{
 const w=world('',false),target=w.add('Toren Vale','JournalEntry',{worldProfile:{category:'contact'}});
 const stale={canonicalUuid:target.uuid,name:'Oren',kind:'contact'};
 const match=w.api.campaignEntityCreation.assessExistingMatch({text:'Oren',kind:'person',target:stale});
 assert.equal(match.eligible,false);
 const view=analysis(w,[{...reviewRow('Oren',[stale],'person'),targetUuid:target.uuid}]);
 assert.equal(view.attention[0].candidates.length,0);
 const valid=w.api.campaignEntityCreation.assessExistingMatch({text:'Toren',kind:'person',target:stale});
 assert.equal(valid.eligible,true);assert.equal(valid.safe,false);
 const explicit=w.api.campaignEntityCreation.assessExistingMatch({text:'Oren',kind:'person',target:stale,explicitUuid:target.uuid});
 assert.equal(explicit.safe,true);
});

test('Session 5 keeps full new person name, source mentions and a document type without grammar noise',async()=>{
 const w=campaign(),scan=await w.scan(),names=scan.candidates.map(row=>row.text);
 assert.ok(names.includes('Orren Hale'));assert.ok(!names.includes('Orren'));
 for(const word of ['Inside','Several','Further'])assert.ok(!names.includes(word));
 const person=scan.candidates.find(row=>row.text==='Orren Hale');assert.equal(person.classification.kind,'character');assert.ok(person.mentions.some(row=>row.text==='Orren'));
 const record=scan.candidates.find(row=>row.text==='Greyfen Register');assert.equal(record.classification.kind,'item');
 const resolved=await w.api.campaignEntityCreation.resolveCandidates(scan.candidates);assert.equal(resolved.find(row=>row.text==='Orren Hale').outcome,'CREATED');assert.ok(!w.game.journal.contents.some(doc=>doc.name==='Orren'));
});

for(const [short,full] of [['Lysa','Lysa Marr'],['Toren','Toren Vale']])test(`Existing personal fragment ${short} offers ${full} but never auto-links`,async()=>{
 const w=campaign(`${short} spoke.`),rows=await w.resolve(),row=rows.find(row=>row.text===short);
 assert.equal(row.outcome,'REVIEW');assert.ok(row.identityCandidates.some(candidate=>candidate.name===full&&candidate.match.safe===false));
 const view=analysis(w,[reviewRow(short,row.identityCandidates)]);assert.ok(view.attention[0].candidates.some(candidate=>candidate.name===full));assert.equal(view.attention[0].hasRecommendation,false);
});

test('A proven Actor projection presents one canonical candidate, while an independent namesake remains separate',()=>{
 const w=world('',false),actor=w.add('Gunther','Actor'),projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
 const targets=[{name:actor.name,canonicalUuid:actor.uuid,kind:'npc'},{name:projection.name,canonicalUuid:projection.uuid,kind:'contact'}];
 const view=analysis(w,[reviewRow('Gunther',targets,'person')]);assert.equal(view.attention[0].candidates.length,1);assert.equal(view.attention[0].candidates[0].uuid,actor.uuid);
 const independent=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact'}});const separate=analysis(w,[reviewRow('Gunther',[...targets,{name:independent.name,canonicalUuid:independent.uuid,kind:'contact'}],'person')]);assert.equal(separate.attention[0].candidates.length,2);
 const card=separate.attention[0].candidates.find(row=>row.uuid===independent.uuid);assert.ok(!card.briefItems.some(row=>row.label==='Linked person'&&row.value==='Gunther'));
});

test('Document classification reaches the new identity dropdown',async()=>{
 const w=campaign(),rows=await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});
 const record=rows.records.find(row=>row.active&&row.mentionText==='Greyfen Register');assert.ok(record);assert.equal(record.discoveryKind,'item');
 const view=analysis(w,[{...record,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review'}]);assert.equal(view.attention[0].creationTypeOptions.find(row=>row.selected).value,'item');
});

for(const role of ['former scout','retired guide','local healer'])test(`Generic ${role} full name owns later first-name mentions without a parallel identity`,async()=>{
 const w=world(`The group met Tala Reed, a ${role} who knows the road. Tala spoke. Tala waited. Tala left.`,false);
 const rows=await w.resolve();assert.equal(rows.filter(row=>row.text==='Tala Reed').length,1);assert.ok(!rows.some(row=>row.text==='Tala'));assert.equal(rows.find(row=>row.text==='Tala Reed').outcome,'CREATED');
 assert.equal(w.game.journal.contents.filter(doc=>doc.name==='Tala Reed').length,1);assert.equal(w.game.journal.contents.filter(doc=>doc.name==='Tala').length,0);
});

test('A following named captain is not an appositive profession of the previous speaker',async()=>{
 const w=world('According to Tala, Captain Dorian West arrived. Tala spoke. Tala waited.',false);const scan=await w.scan();
 assert.ok(!scan.candidates.find(row=>row.text==='Tala').classification.signals.includes('person-role-apposition'));
 const rows=await w.resolve();assert.equal(rows.find(row=>row.text==='Tala').outcome,'REVIEW');assert.ok(!w.game.journal.contents.some(doc=>doc.name==='Tala'));
});

test('Grammar singleton and leading modifiers retain diagnostic coverage without becoming identities',async()=>{
 const w=world('Inside was a case. Several travellers left. Further reports arrived. Further Amber Ruins were mapped.',false);const scan=await w.scan();
 for(const word of ['Inside','Several','Further'])assert.ok(!scan.candidates.some(row=>row.text===word));
 assert.ok(scan.candidates.some(row=>row.text==='Amber Ruins'));assert.ok(!scan.candidates.some(row=>row.text==='Further Amber Ruins'));
 assert.ok(scan.diagnostics.some(row=>row.text==='Inside'&&row.status==='COMMON_GRAMMAR_TOKEN'));
});

test('Two first-name people and an old erroneous fragment cannot be auto-merged or create a parallel full name',async()=>{
 const w=world('Tala spoke. We met Orren Hale, a former scout.',false);w.add('Tala Reed','Actor');w.add('Tala Moss','Actor');w.add('Orren','JournalEntry',{worldProfile:{category:'contact'}});
 const count=w.docs.size,rows=await w.resolve(),fragment=rows.find(row=>row.text==='Tala');assert.equal(fragment.outcome,'REVIEW');assert.equal(fragment.identityCandidates.length,2);
 assert.equal(rows.find(row=>row.text==='Orren Hale').outcome,'REVIEW');assert.equal(w.docs.size,count);
});

test('A generic explicitly titled document overrides nearby person/location context and keeps its Item type',async()=>{
 const w=world('Tala Reed carried a damaged document titled The Crimson Archive from Amber Ruins. The Crimson Archive was sealed.',false);
 const rows=await w.resolve(),doc=rows.find(row=>row.text==='Crimson Archive');assert.equal(doc.classification.kind,'item');assert.equal(doc.outcome,'CREATED');assert.equal(w.docs.get(doc.targetUuid).flags.worldProfile.category,'item');
});

test('Review prioritizes exact identity evidence over a shared place prefix and never recommends the prefix alone',()=>{
 const w=world('',false),exact=w.add('Stonecross','JournalEntry',{worldProfile:{category:'location'}}),watch=w.add('Stonecross Watch','JournalEntry',{worldProfile:{category:'location',summary:'Stonecross road northern captain watch militia'}});
 const targets=[{canonicalUuid:watch.uuid,name:watch.name,kind:'location',score:1000},{canonicalUuid:exact.uuid,name:exact.name,kind:'location',score:1}];
 const view=analysis(w,[{...reviewRow('Stonecross',targets,'location'),snippet:'Stonecross road northern captain watch militia'}]);assert.equal(view.attention[0].candidates[0].uuid,exact.uuid);
 const uncertain=analysis(w,[reviewRow('Stonecross',[targets[0]],'location')]);assert.equal(uncertain.attention[0].hasRecommendation,false);assert.equal(uncertain.attention[0].candidates[0].safeExistingMatch,false);
});

test('Session 5 reanalysis and runtime reload retain one full-name person and canonical document identity',async()=>{
 const w=campaign();await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});w.reload('campaign-new-entity-discovery.js');w.reload('campaign-review-learning.js');
 await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});const records=w.api.campaignMentionEvidence.snapshot().records.filter(row=>row.active);
 assert.ok(!records.some(row=>['Inside','Several','Further','Orren'].includes(row.mentionText)));
 for(const name of ['Orren Hale','Greyfen Register']){const docs=w.game.journal.contents.filter(doc=>doc.name===name);assert.equal(docs.length,1);assert.ok(records.some(row=>row.mentionText===name&&row.targetUuid===docs[0].uuid&&['CREATED','LINKED'].includes(row.outcome)&&row.outcomeReason==='single-canonical-identity'));}
});
