import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
function setup(){const w=world('Nora spoke.',false);w.a=w.add('Nora','Actor');w.b=w.add('Nora','JournalEntry',{worldProfile:{category:'contact'}});w.learning=w.api.campaignReviewLearning;return w;}
test('Campaign default resolves namesakes, persists across reload and leaves identities intact',async()=>{
 const w=setup(),count=w.docs.size;await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});
 w.reload('campaign-review-learning.js');const row=(await w.resolve())[0];assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,w.a.uuid);assert.equal(w.docs.size,count);
});
test('Explicit session choice overrides campaign default, even when that identity is paused',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});
 await w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.b.uuid});
 await w.learning.chooseForSource({text:'Nora',sourceUuid:w.session.uuid,targetUuid:w.b.uuid});
 const row=(await w.resolve())[0];assert.equal(row.targetUuid,w.b.uuid);assert.equal(row.outcome,'LINKED');
});
test('Pause excludes a namesake from automatic matching but keeps it in manual identity lookup',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.b.uuid});
 const row=(await w.resolve())[0];assert.equal(row.targetUuid,w.a.uuid);assert.equal(row.outcome,'LINKED');
 assert.ok(w.docs.has(w.b.uuid));assert.ok(w.learning.linkTargets().some(row=>row.uuid===w.b.uuid));
});
test('Resume restores namesake ambiguity in a new source; no default is inferred',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.b.uuid});await w.learning.setMatchingPolicy({mode:'resume',targetUuid:w.b.uuid});
 assert.equal((await w.resolve())[0].outcome,'REVIEW');
});
test('Six choices recommend but never silently create a campaign default',async()=>{
 const w=setup();for(let i=0;i<6;i++){const source=w.add(`Session ${i}`,'JournalEntry',{type:'session'});source.pages={contents:[]};await w.learning.chooseForSource({text:'Nora',sourceUuid:source.uuid,targetUuid:w.a.uuid});}
 assert.equal(w.learning.choiceCount('Nora',w.a.uuid),6);assert.deepEqual(Object.keys(w.learning.matchingPreferences().nameDefaults),[]);
 assert.equal((await w.resolve())[0].outcome,'REVIEW');
});
test('Default overcomes conflicting historical choices for a fresh source',async()=>{
 const w=setup();for(const target of [w.a,w.b]){const source=w.add('Past','JournalEntry',{type:'session'});source.pages={contents:[]};await w.learning.chooseForSource({text:'Nora',sourceUuid:source.uuid,targetUuid:target.uuid});}
 await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});assert.equal((await w.resolve())[0].targetUuid,w.a.uuid);
});
test('Policy Undo restores only the preference and preserves existing links',async()=>{
 const w=setup();await w.api.campaignEntityLinks.linkCanonical({sourceUuid:w.session.uuid,targetUuid:w.b.uuid});
 const row=await w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.b.uuid});await w.learning.undoDecision(row.id);
 assert.equal(w.learning.isPaused(w.b.uuid),false);assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:w.b.uuid}),true);
 const preferred=await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});await w.learning.undoDecision(preferred.id);assert.equal(w.learning.decisionFor('Nora'),null);
});
test('Later matching policy blocks stale Undo and failed write does not change preference',async()=>{
 const w=setup(),old=await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.b.uuid});
 await assert.rejects(w.learning.undoDecision(old.id),/changed/);const before=JSON.stringify(w.learning.matchingPreferences());w.game.settings.set=async()=>{throw Error('storage');};
 await assert.rejects(w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.a.uuid}),/storage/);assert.equal(JSON.stringify(w.learning.matchingPreferences()),before);
});
test('Players cannot read or mutate GM matching preferences',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'pause',targetUuid:w.b.uuid});w.game.user.isGM=false;
 assert.equal(w.learning.isPaused(w.b.uuid),false);assert.equal(Object.keys(w.learning.matchingPreferences().pausedIdentities).length,0);
 await assert.rejects(w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid}),/GM-only/);
});
test('All paused matches do not create a duplicate; deleted default does not pick a namesake',async()=>{
 const w=setup();for(const doc of [w.a,w.b])await w.learning.setMatchingPolicy({mode:'pause',targetUuid:doc.uuid});
 const count=w.docs.size;assert.equal((await w.resolve())[0].outcome,'REVIEW');assert.equal(w.docs.size,count);
 await w.learning.setMatchingPolicy({mode:'resume',targetUuid:w.a.uuid});await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});w.docs.delete(w.a.uuid);
 assert.equal((await w.resolve())[0].outcomeReason,'campaign-default-identity-deleted');
});
test('Clearing a campaign default restores normal ambiguity for a fresh source',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});
 const row=await w.learning.setMatchingPolicy({mode:'clear-default',text:'Nora'});assert.equal((await w.resolve())[0].outcome,'REVIEW');
 await w.learning.undoDecision(row.id);assert.equal((await w.resolve())[0].targetUuid,w.a.uuid);
});
test('A source unlink suppression still overrides a campaign default',async()=>{
 const w=setup();await w.learning.setMatchingPolicy({mode:'default',text:'Nora',targetUuid:w.a.uuid});
 await w.api.campaignDeterministicAutoLink.suppress({sourceUuid:w.session.uuid,targetUuid:w.a.uuid});
 assert.equal((await w.resolve())[0].outcome,'REVIEW');assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:w.a.uuid}),false);
});
