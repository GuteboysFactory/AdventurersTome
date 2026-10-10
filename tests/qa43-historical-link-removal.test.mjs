import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {world} from './helpers/tome-world.mjs';
async function setup() {
 const w=world('Rhea spoke.',false);w.session.name='Session 4';
 w.target=w.add('Rhea','JournalEntry',{worldProfile:{category:'contact'}});w.other=w.add('Rhea','Actor');
 w.later=w.add('Session 5','JournalEntry',{type:'session'});w.later.pages={contents:[]};
 await w.api.campaignEntityLinks.linkCanonical({sourceUuid:w.session.uuid,targetUuid:w.target.uuid});
 await w.api.campaignReviewLearning.chooseForSource({text:'Rhea',sourceUuid:w.session.uuid,targetUuid:w.target.uuid});
 await w.api.campaignReviewLearning.chooseForSource({text:'Rhea',sourceUuid:w.later.uuid,targetUuid:w.other.uuid});
 return w;
}
const input=w=>({sourceUuid:w.session.uuid,targetUuid:w.target.uuid});

test('Remove just one historical source association, retain documents and other source choices, survive reload and undo',async()=>{
 const w=await setup(),api=w.api.campaignReviewLearning,count=w.docs.size;
 const row=await api.removeHistoricalLink(input(w));assert.equal(w.docs.size,count);
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),false);
 assert.equal(api.isSourceTargetRemoved(w.session.uuid,w.target.uuid),true);
 assert.equal(api.decisionFor('Rhea',{sourceUuid:w.session.uuid}),null);
 assert.equal(api.decisionFor('Rhea',{sourceUuid:w.later.uuid}).targetUuid,w.other.uuid);
 assert.ok(!api.historicalChoiceFor('Rhea',{sourceUuid:'JournalEntry.new'}).historySources?.includes(w.session.uuid));
 w.reload('campaign-review-learning.js');assert.equal(w.api.campaignReviewLearning.isSourceTargetRemoved(w.session.uuid,w.target.uuid),true);
 await w.api.campaignReviewLearning.undoDecision(row.id);
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),true);
 assert.equal(w.api.campaignReviewLearning.decisionFor('Rhea',{sourceUuid:w.session.uuid}).targetUuid,w.target.uuid);
 assert.equal(w.api.campaignReviewLearning.isSourceTargetRemoved(w.session.uuid,w.target.uuid),false);
});

test('Historical evidence without a live link can be revoked and Undo does not invent a link',async()=>{
 const w=await setup();await w.api.campaignEntityLinks.unlinkCanonical(input(w));
 const row=await w.api.campaignReviewLearning.removeHistoricalLink(input(w));assert.equal(row.hadLinkBefore,false);
 await w.api.campaignReviewLearning.undoDecision(row.id);assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),false);
});

test('Reanalysis cannot recreate the removed target link',async()=>{
 const w=await setup();await w.api.campaignReviewLearning.removeHistoricalLink(input(w));await w.resolve();
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),false);
 assert.equal(w.api.campaignReviewLearning.isSourceTargetRemoved(w.session.uuid,w.target.uuid),true);
});

test('Failed history save rolls back removal and failed Undo retains removal',async()=>{
 const w=await setup(),save=w.game.settings.set;w.game.settings.set=async()=>{throw Error('Storage failure');};
 await assert.rejects(w.api.campaignReviewLearning.removeHistoricalLink(input(w)),/Storage failure/);
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),true);assert.equal(w.api.campaignReviewLearning.isSourceTargetRemoved(w.session.uuid,w.target.uuid),false);
 w.game.settings.set=save;const row=await w.api.campaignReviewLearning.removeHistoricalLink(input(w));
 w.game.settings.set=async()=>{throw Error('Storage failure');};await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/Storage failure/);
 assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),false);assert.equal(w.api.campaignReviewLearning.isSourceTargetRemoved(w.session.uuid,w.target.uuid),true);
});

test('Players cannot remove links and later link changes block stale Undo',async()=>{
 const w=await setup();w.game.user.isGM=false;await assert.rejects(w.api.campaignReviewLearning.removeHistoricalLink(input(w)),/GM-only/);
 w.game.user.isGM=true;const row=await w.api.campaignReviewLearning.removeHistoricalLink(input(w));
 await w.api.campaignEntityLinks.linkCanonical(input(w));await assert.rejects(w.api.campaignReviewLearning.undoDecision(row.id),/changed/);
});

test('Cancelling the explicit source removal dialog makes no change',async()=>{
 const w=await setup(),source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  static async _onRemoveHistoricalLink('),source.indexOf('  static async _onUndoCampaignDecision('));
 vm.runInContext(`globalThis.Actions=class {${method}}`,w.context);
 let dialog;w.context.foundry.applications.api.DialogV2.wait=async options=>{dialog=options;return false;};
 const before=JSON.stringify([...w.storage]);await w.context.Actions._onRemoveHistoricalLink.call({}, {}, {dataset:{...input(w),sourceName:'Session 4',targetName:'Rhea'}});
 assert.match(dialog.content,/Session 4/);assert.equal(JSON.stringify([...w.storage]),before);assert.equal(w.api.campaignEntityLinks.hasCanonicalLink(input(w)),true);
});
