import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
import {installPrivateFacts} from './helpers/private-facts-world.mjs';
function setup(){
 const w=world('We met Tala Reed, a former scout who knows the road. According to Tala, Captain Dorian West commands the militia.',false);
 const target=w.add('Tala','JournalEntry',{worldProfile:{category:'contact',subtitle:'captain',body:'My handwritten private note',facts:[{label:'Role / profession',value:'captain',visibility:'gm'},{label:'Personal note',value:'Keep this unchanged',visibility:'players'},{label:'Faction / organization',value:'According to Tala, Captain Dorian West commands the militia.',visibility:'gm'}]}});
 installPrivateFacts(w);w.reload('campaign-source-fact-review.js');return {...w,target};
}
test('Old source facts are proposed with evidence; only checked corrections change and handwritten notes survive',async()=>{
 const w=setup(),before=structuredClone(w.target.flags.worldProfile),api=w.api.sourceFactReview;
 const plan=await api.plan({sourceUuid:w.session.uuid,targetUuid:w.target.uuid,text:'Tala Reed'});
 assert.deepEqual(w.target.flags.worldProfile,before);assert.equal(plan.rows.find(row=>row.key==='subtitle').after,'former scout');assert.ok(plan.evidence.some(text=>text.includes('former scout')));
 await api.apply(plan,['subtitle','fact:0','fact:2']);const profile=w.target.flags.worldProfile;
 assert.equal(profile.subtitle,'former scout');assert.equal(profile.facts[0].value,'former scout');assert.equal(profile.facts.length,2);assert.equal(profile.facts[1].value,'Keep this unchanged');assert.equal(profile.body,before.body);
 const history=w.api.campaignReviewLearning.decisionHistory();assert.equal(history[0].mode,'correction');await w.api.campaignReviewLearning.undoDecision(history[0].id);assert.deepEqual(w.target.flags.worldProfile,before);
});

test('New generated excerpts are explicitly source excerpts with provenance, not asserted faction/location facts',async()=>{
 const w=world('The group met Tala Reed, a local healer who works with the Copper Wardens. Tala spoke. Tala waited.',false);await w.resolve();
 const doc=w.game.journal.contents.find(doc=>doc.name==='Tala Reed'),facts=doc.flags.worldProfile.facts;
 assert.ok(facts.some(fact=>fact.label==='Role / profession'));
 assert.ok(facts.filter(fact=>fact.label!=='Role / profession').every(fact=>fact.label.endsWith('(source excerpt)')));
 assert.ok(facts.every(fact=>fact.provenance?.origin==='tome-analysis'&&fact.provenance.sourceUuid===w.session.uuid));
});
test('Changed source/profile blocks stale approval and players cannot inspect source corrections',async()=>{
 const w=setup(),api=w.api.sourceFactReview,input={sourceUuid:w.session.uuid,targetUuid:w.target.uuid,text:'Tala Reed'},plan=await api.plan(input);
 w.target.flags.worldProfile.body='Later GM edit';await assert.rejects(api.apply(plan,['subtitle']),/changed/);
 const fresh=await api.plan(input);w.page.text.content='The source changed.';await assert.rejects(api.apply(fresh,['subtitle']),/changed/);
 w.game.user.isGM=false;assert.equal(await api.plan(input),null);await assert.rejects(api.apply(plan,['subtitle']),/GM-only/);
});

test('Correction history protects later manual edits and a failed history save restores the original profile',async()=>{
 const w=setup(),api=w.api.sourceFactReview,input={sourceUuid:w.session.uuid,targetUuid:w.target.uuid,text:'Tala Reed'},plan=await api.plan(input);
 const set=w.game.settings.set;w.game.settings.set=async()=>{throw Error('History unavailable');};await assert.rejects(api.apply(plan,['subtitle']),/History unavailable/);w.game.settings.set=set;assert.deepEqual(w.target.flags.worldProfile,plan.profile);
 await api.apply(plan,['subtitle']);const row=w.api.campaignReviewLearning.decisionHistory()[0];w.target.flags.worldProfile.body='New handwritten note';await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/profile has changed/);assert.equal(w.target.flags.worldProfile.body,'New handwritten note');
});
test('English/Swedish roles retain their subject and uncertainty; name changes do not change the rules',()=>{
 for(const [text,names,expected] of [
  ['We met Rhea North, a former scout. According to Rhea, Captain Dorian West arrived.',['Rhea North','Rhea'],'former scout'],
  ['Vi mötte Sanna Lind, en tidigare spejare. Enligt Sanna, kapten Erik Holm anlände.',['Sanna Lind','Sanna'],'tidigare spejare'],
  ['We heard rumours about Rhea North, a captain.',['Rhea North'],''],
  ['Vi hörde rykten om Sanna Lind, en kapten.',['Sanna Lind'],'']]) {
   const w=world('',false),brief=w.api.campaignNewEntityDiscovery.briefingFor({text,names});assert.equal(brief.roles.join(' / '),expected);
  }
});
