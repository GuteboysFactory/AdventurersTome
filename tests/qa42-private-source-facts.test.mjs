import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
import {installPrivateFacts} from './helpers/private-facts-world.mjs';
async function setup(language='en') {
 const name=language==='sv'?'Nora Ås':'Rhea North',role=language==='sv'?'tidigare spejare':'former scout';
 const text=language==='sv'?`Gruppen mötte ${name}, en ${role} som känner vägen.`:`The group met ${name}, a ${role} who knows the road.`;
 const w=world(text,false),scopes=installPrivateFacts(w);w.reload('campaign-source-fact-review.js');
 const target=w.add(name,'JournalEntry',{worldProfile:{category:'contact',subtitle:'captain',facts:[{label:'Public note',value:'Visible note',visibility:'players'}]}});
 // Same storage layout as after Tome's private-data migration: the GM role and
 // source excerpt live in the user vault rather than the document profile.
 const overlay={facts:[{label:'Role / profession',value:'captain',visibility:'gm'},
  {label:'Location',value:text,visibility:'gm'},{label:'Personal note',value:'SECRET-ONLY-THIS-GM',visibility:'gm'}],
  notes:[{id:'note',body:'PRIVATE-HANDWRITTEN-NOTE'}],relations:[{actorId:'private-ally',label:'Private relationship'}]};
 const vaultKey=`journalentry:${target.id}`;
 await w.game.settings.set('adventurers-tome','gmPrivateVault',JSON.stringify({[vaultKey]:overlay}));
 const input={targetUuid:target.uuid,sourceUuid:w.session.uuid,text:name};
 const vault=()=>JSON.parse(w.game.settings.get('adventurers-tome','gmPrivateVault')||'{}')[vaultKey];
 return {...w,target,scopes,role,input,overlay,vault};
}
for(const language of ['en','sv'])test(`Migrated private and shared facts can be reviewed, selected and undone together (${language})`,async()=>{
 const w=await setup(language),api=w.api.sourceFactReview,profile=structuredClone(w.target.flags.worldProfile),plan=await api.plan(w.input);
 assert.ok(plan.rows.some(row=>row.key==='subtitle'));assert.equal(plan.rows.find(row=>row.key==='privateFact:0').after,w.role);
 assert.match(plan.rows.find(row=>row.key==='privateFact:0').label,/private GM fact/);
 await api.apply(plan,['subtitle','privateFact:0','privateFact:1']);
 assert.equal(w.target.flags.worldProfile.subtitle,w.role);assert.deepEqual(w.target.flags.worldProfile.facts,profile.facts);
 assert.equal(w.vault().facts[0].value,w.role);assert.equal(w.vault().facts.length,2);assert.equal(w.vault().facts[1].value,'SECRET-ONLY-THIS-GM');
 assert.deepEqual(w.vault().notes,w.overlay.notes);assert.deepEqual(w.vault().relations,w.overlay.relations);
 const shared=w.storage.get('campaignIntelligenceLearning');for(const secret of ['SECRET-ONLY-THIS-GM','PRIVATE-HANDWRITTEN-NOTE','beforeProfile','privateFacts'])assert.ok(!shared.includes(secret));
 assert.equal(w.scopes.get('sourceFactCorrectionUndo'),'user');
 w.reload('campaign-source-fact-review.js');w.reload('campaign-review-learning.js');
 await w.api.campaignReviewLearning.undoDecision(w.api.campaignReviewLearning.decisionHistory()[0].id);
 assert.deepEqual(w.target.flags.worldProfile,profile);assert.deepEqual(w.vault(),w.overlay);
});
test('Private-only correction never writes the shared document; later private notes survive undo',async()=>{
 const w=await setup(),profile=structuredClone(w.target.flags.worldProfile);let writes=0;const update=w.target.update;w.target.update=async(...args)=>{writes++;return update(...args);};
 await w.api.sourceFactReview.apply(await w.api.sourceFactReview.plan(w.input),['privateFact:0']);
 assert.equal(writes,0);assert.deepEqual(w.target.flags.worldProfile,profile);
 const vault=JSON.parse(w.game.settings.get('adventurers-tome','gmPrivateVault'));vault[`journalentry:${w.target.id}`].notes.push({id:'later',body:'Later handwritten note'});
 await w.game.settings.set('adventurers-tome','gmPrivateVault',JSON.stringify(vault));
 await w.api.campaignReviewLearning.undoDecision(w.api.campaignReviewLearning.decisionHistory()[0].id);
 assert.equal(writes,0);assert.equal(w.vault().facts[0].value,'captain');assert.equal(w.vault().notes.at(-1).body,'Later handwritten note');
});
test('Private snapshot and undo are isolated between GMs and inaccessible to players',async()=>{
 const w=await setup();await w.api.sourceFactReview.apply(await w.api.sourceFactReview.plan(w.input),['privateFact:0']);
 const row=w.api.campaignReviewLearning.decisionHistory()[0];w.game.user.id='different-gm';
 assert.equal(w.api.privateFactStore.read(w.target).length,0);assert.equal(w.game.settings.get('adventurers-tome','sourceFactCorrectionUndo'),undefined);
 await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/Only the GM/);
 const plan=await w.api.sourceFactReview.plan(w.input);assert.equal(plan.rows.filter(row=>row.storage==='private').length,0);
 w.game.user.isGM=false;assert.equal(await w.api.sourceFactReview.plan(w.input),null);assert.equal(w.api.privateFactStore.read(w.target).length,0);
 await assert.rejects(w.api.privateFactStore.write(w.target,[]),/Only a GM/);
});
test('Private edits invalidate an open correction and prevent stale undo',async()=>{
 const w=await setup(),api=w.api.sourceFactReview,plan=await api.plan(w.input);
 await w.api.privateFactStore.write(w.target,[...w.overlay.facts,{label:'Later fact',value:'Preserve me'}]);
 await assert.rejects(api.apply(plan,['subtitle','privateFact:0']),/changed/);
 const fresh=await api.plan(w.input);await api.apply(fresh,['privateFact:0']);const row=w.api.campaignReviewLearning.decisionHistory()[0];
 const facts=w.api.privateFactStore.read(w.target);facts[0].value='Manually corrected role';await w.api.privateFactStore.write(w.target,facts);
 await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/Private facts have changed/);assert.equal(w.api.privateFactStore.read(w.target)[0].value,'Manually corrected role');
});
test('Failures in private storage and history roll back both fact stores',async()=>{
 for(const failingKey of ['sourceFactCorrectionUndo','gmPrivateVault','campaignIntelligenceLearning']) {
  const w=await setup(),plan=await w.api.sourceFactReview.plan(w.input),profile=structuredClone(w.target.flags.worldProfile),set=w.game.settings.set;let failed=false;
  w.game.settings.set=async(module,key,value)=>{if(key===failingKey&&!failed){failed=true;throw Error('Injected write failure');}return set(module,key,value);};
  await assert.rejects(w.api.sourceFactReview.apply(plan,['subtitle','privateFact:0']),/Injected write failure/);
  assert.deepEqual(w.target.flags.worldProfile,profile);assert.deepEqual(w.vault(),w.overlay);assert.equal(w.api.campaignReviewLearning.decisionHistory().length,0);
 }
});
test('Failed Undo history commit restores both corrected stores and leaves the decision active',async()=>{
 const w=await setup();await w.api.sourceFactReview.apply(await w.api.sourceFactReview.plan(w.input),['subtitle','privateFact:0']);
 const profile=structuredClone(w.target.flags.worldProfile),overlay=w.vault(),row=w.api.campaignReviewLearning.decisionHistory()[0],set=w.game.settings.set;let failed=false;
 w.game.settings.set=async(module,key,value)=>{if(key==='campaignIntelligenceLearning'&&!failed){failed=true;throw Error('History failure');}return set(module,key,value);};
 await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/History failure/);
 assert.deepEqual(w.target.flags.worldProfile,profile);assert.deepEqual(w.vault(),overlay);assert.equal(w.api.campaignReviewLearning.decisionHistory()[0].undone,false);
});
