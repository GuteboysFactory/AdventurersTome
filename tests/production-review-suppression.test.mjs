import assert from 'node:assert/strict';
import {test} from 'node:test';
import {interpretSource} from '../scripts/interpretation-engine.js';
import {reviewWorld} from './helpers/review-world.mjs';

test('Foundry content links do not produce review names or suggested entities',async()=>{
  const prior=globalThis.DOMParser;
  globalThis.DOMParser=class {
    parseFromString(text) {
      const body={tagName:'BODY',textContent:text,children:[],querySelectorAll:()=>[],closest:()=>null,cloneNode(){return this;}};
      return {body,querySelectorAll:()=>[]};
    }
  };
  try {
    const html='Pallando varnade dem. Source: @UUID[JournalEntry.source.JournalEntryPage.page]{Chronicle}.';
    const catalog=['Pallando','UUID','JournalEntry','JournalEntryPage','Chronicle'].map((name,index)=>({
      name,kind:'npc',uuid:'Actor.'+index
    }));
    const result=await interpretSource({html,sourceUuid:'JournalEntry.quest',catalog,tokens:[]});
    assert.deepEqual(result.decisions.map(decision=>decision.text),['Pallando']);
    const linkSpan=result.map.spans.find(span=>span.reason==='foundry-inline-reference');
    assert.equal(result.map.text.slice(linkSpan.start,linkSpan.end),'@UUID[JournalEntry.source.JournalEntryPage.page]{Chronicle}');
    assert.equal(result.map.text,html);
  }finally{globalThis.DOMParser=prior;}
});

test('a GM can ignore a phrase across sources with a reason and restore it from Memory after reload',async()=>{
  const w=reviewWorld();
  const learning=w.api.campaignReviewLearning;
  const text='Vale';
  await learning.confirm({text,sourceUuid:w.session.uuid});
  const before=learning.decisionFor(text);
  w.context.foundry.utils.escapeHTML=String;
  w.context.foundry.applications.api.DialogV2.prompt=async()=>null;
  await w.act('never-ask');
  assert.equal(learning.neverAskRules().length,0);
  w.context.foundry.applications.api.DialogV2.prompt=async()=> 'Name from an editorial note';
  await w.act('never-ask');
  assert.deepEqual(w.errors,[]);
  assert.equal(learning.decisionFor('vale',{sourceUuid:'JournalEntry.other'}).action,'suppressed');
  assert.equal(learning.decisionFor('Vale and Pallando',{sourceUuid:'JournalEntry.other'}),null);
  w.reload('campaign-review-learning.js');
  const reopened=w.api.campaignReviewLearning;
  const [rule]=reopened.neverAskRules();
  assert.equal(rule.reason,'Name from an editorial note');
  assert.equal(rule.sourceName,w.session.name);
  await assert.rejects(reopened.restoreNeverAsk({text,id:'stale'}),/changed/);
  const restore=w.context.DecisionActions._onRestoreNeverAsk;
  await restore.call(w.app,{}, {disabled:false,dataset:{decisionText:text,neverAskId:rule.id}});
  assert.equal(reopened.neverAskRules().length,0);
  assert.equal(JSON.stringify(reopened.decisionFor(text)),JSON.stringify(before));
  assert.deepEqual(w.errors,[]);
});

test('suppression requires a reason and stays inaccessible to players',async()=>{
  const w=reviewWorld();
  const learning=w.api.campaignReviewLearning;
  const data={text:'Vale',sourceUuid:w.session.uuid,reason:'',sourceName:w.session.name};
  await assert.rejects(learning.neverAsk(data),/reason/);
  const saved=await learning.neverAsk({...data,reason:'An editorial term'});
  w.game.user.isGM=false;
  assert.equal(learning.neverAskRules().length,0);
  assert.equal(learning.decisionFor('Vale'),null);
  await assert.rejects(learning.restoreNeverAsk({text:'Vale',id:saved.neverAskId}),/GM-only/);
});
