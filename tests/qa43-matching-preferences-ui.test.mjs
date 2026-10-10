import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {world} from './helpers/tome-world.mjs';
function setup(){
 const w=world('',false);w.person=w.add('Nora & <North>','Actor');
 const code=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8');
 vm.runInContext(`globalThis.Actions=class {${code.slice(code.indexOf('  static async _onMatchingPreferences('),code.indexOf('  static async _onRemoveHistoricalLink('))}}`,w.context);
 w.app={render:async()=>{w.renders++;}};w.renders=0;w.api.campaignMentionEvidence={sync:async()=>{}};
 w.run=dataset=>w.context.Actions._onMatchingPreferences.call(w.app,{}, {dataset});return w;
}
test('Cancelling matching preferences does not save or refresh; labels are escaped',async()=>{
 const w=setup(),before=JSON.stringify([...w.storage]);let content;
 w.context.foundry.applications.api.DialogV2.wait=async options=>{content=options.content;return null;};
 await w.run({targetUuid:w.person.uuid,targetName:w.person.name,decisionText:'Nora'});
 assert.match(content,/Nora &amp; &lt;North&gt;/);assert.equal(JSON.stringify([...w.storage]),before);assert.equal(w.renders,0);
});
test('Candidate default button saves the policy and refreshes the queue',async()=>{
 const w=setup();w.context.foundry.applications.api.DialogV2.wait=async options=>options.buttons.find(button=>button.action==='default').callback();
 await w.run({targetUuid:w.person.uuid,targetName:w.person.name,decisionText:'Nora'});
 assert.equal(w.api.campaignReviewLearning.decisionFor('Nora').targetUuid,w.person.uuid);assert.equal(w.renders,1);assert.equal(w.app._campaignDecisionPending,false);
});
test('Global management can resume a paused identity after its review card disappeared',async()=>{
 const w=setup();await w.api.campaignReviewLearning.setMatchingPolicy({mode:'pause',targetUuid:w.person.uuid});
 w.context.foundry.applications.api.DialogV2.wait=async options=>options.buttons.find(button=>button.action==='apply').callback(null,null,{element:{querySelector:()=>({value:'0'})}});
 await w.run({});assert.equal(w.api.campaignReviewLearning.isPaused(w.person.uuid),false);assert.equal(w.renders,1);
});
