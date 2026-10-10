import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewWorld} from './helpers/review-world.mjs';
async function prepare(){const w=reviewWorld();await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});w.scheduled.clear();return w;}
test('Ten recent choices persist through reload and can undo an independent older choice',async()=>{
 const w=await prepare();
 for(let index=0;index<12;index++){
  const target=w.add(`Place ${index}`,'JournalEntry',{worldProfile:{category:'location'}}),button=w.button('choose');button.dataset.decisionText=`Choice ${index}`;button.dataset.targetUuid=target.uuid;await w.act('choose',button);
 }
 let rows=w.api.campaignReviewLearning.decisionHistory();assert.equal(rows.length,10);assert.equal(rows.at(-1).text,'Choice 2');
 w.reload('campaign-review-learning.js');rows=w.api.campaignReviewLearning.decisionHistory();assert.equal(rows.length,10);
 const older=rows[5],later=rows[0];await w.api.campaignReviewLearning.undoDecision(older.id);
 assert.equal(w.api.campaignReviewLearning.decisionFor(older.text,{sourceUuid:w.session.uuid}),null);
 assert.equal(w.api.campaignReviewLearning.decisionFor(later.text,{sourceUuid:w.session.uuid}).targetUuid,later.targetUuid);
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:older.targetUuid}),false);
});
test('Dependent decisions must undo newest first and restore original choice snapshots',async()=>{
 const w=await prepare();await w.act('choose');const first=w.api.campaignReviewLearning.decisionHistory()[0];
 const secondTarget=w.add('Other place','JournalEntry',{worldProfile:{category:'location'}}),button=w.button('choose');button.dataset.targetUuid=secondTarget.uuid;await w.act('choose',button);
 const second=w.api.campaignReviewLearning.decisionHistory()[0];assert.ok(w.api.campaignReviewLearning.decisionHistory()[1].blocked);
 await assert.rejects(w.api.campaignReviewLearning.undoDecision(first.id),/later dependent/);
 await w.api.campaignReviewLearning.undoDecision(second.id);assert.equal(w.api.campaignReviewLearning.decisionFor('Vale',{sourceUuid:w.session.uuid}).targetUuid,w.target.uuid);
 assert.equal(w.api.campaignReviewLearning.decisionHistory().find(row=>row.id===first.id).blocked,'');await w.api.campaignReviewLearning.undoDecision(first.id);
});
test('Opening Undo and cancelling performs no writes',async()=>{
 const w=await prepare();await w.act('choose');const before=JSON.stringify([...w.storage]);let dialog;
 w.context.foundry.applications.api.DialogV2.wait=async options=>{dialog=options;return null;};
 await w.context.DecisionActions._onUndoCampaignDecision.call(w.app,{},{});
 assert.match(dialog.content,/Copper Watch/);assert.equal(JSON.stringify([...w.storage]),before);
});
test('Players cannot read history or undo; external changes block stale undo',async()=>{
 const w=await prepare();await w.act('choose');const row=w.api.campaignReviewLearning.decisionHistory()[0];
 await w.api.campaignReviewLearning.ignoreOnce({text:'Vale',sourceUuid:w.session.uuid});await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/changed/);
 w.game.user.isGM=false;assert.equal(w.api.campaignReviewLearning.decisionHistory().length,0);await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/GM-only/);
});
test('Shared link dependencies and failed history writes do not remove authoritative links',async()=>{
 const w=await prepare();await w.act('choose');const first=w.api.campaignReviewLearning.decisionHistory()[0],button=w.button('choose');button.dataset.decisionText='Alias';await w.act('choose',button);
 await assert.rejects(w.api.campaignReviewLearning.undoDecision(first.id),/dependent/);
 const second=w.api.campaignReviewLearning.decisionHistory()[0];await w.api.campaignReviewLearning.undoDecision(second.id);
 const set=w.game.settings.set;w.game.settings.set=async()=>{throw Error('Storage unavailable');};await assert.rejects(w.api.campaignReviewLearning.undoDecision(first.id),/Storage unavailable/);w.game.settings.set=set;
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:w.target.uuid}),true);
 assert.equal(w.api.campaignReviewLearning.decisionHistory().find(row=>row.id===first.id).undone,false);
});

test('An authoritative Undo survives failed derived refresh and performs one final render',async()=>{
 const w=await prepare();await w.act('choose');w.counts.renders=0;
 w.api.campaignRelationshipEvidence={...w.api.campaignRelationshipEvidence,sync:async()=>{throw Error('Derived failure');}};
 await w.undo();assert.equal(w.api.campaignReviewLearning.decisionHistory()[0].undone,true);assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:w.target.uuid}),false);
 assert.equal(w.counts.renders,1);assert.deepEqual(w.errors,[]);assert.equal(w.app._campaignDecisionPending,false);
});
