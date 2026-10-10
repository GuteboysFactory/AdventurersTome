import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {world} from './helpers/tome-world.mjs';
const source=fs.readFileSync(new URL('../scripts/campaign-index.js',import.meta.url),'utf8').replace('import.meta.url',JSON.stringify('http://localhost/scripts/campaign-index.js'));
function install(w) {
  Object.assign(w.context,{structuredClone,crypto:webcrypto,TextEncoder,performance,setTimeout,clearTimeout,URL});
  w.context.document.querySelectorAll=()=>[];
  vm.runInContext(`{${source}}`,w.context);
  return w.context.AdventurersTomeIndex;
}
const payload=()=>({text:'Mira works as a guide.',referenceText:'Mira works as a guide.',knownIndex:{names:new Set(),singleAliases:new Set(),entities:[]},journal:{uuid:'JournalEntry.source',name:'Test'},page:{uuid:'JournalEntry.source.JournalEntryPage.page',name:'Notes'},kind:'session'});

test('stale background cancellation retries without a sync failure; real errors still warn',async()=>{
  const w=world('Mira works as a guide.',false);let warnings=0;
  w.context.console={...w.context.console,warn:()=>warnings++};
  const stale=Object.assign(Error('Changed input'),{code:'TOME_INDEX_STALE'});
  await assert.rejects(w.api.campaignMentionEvidence.sync({rescan:true,assertCurrent:()=>{throw stale;}}),error=>error===stale);
  assert.equal(warnings,0);
  await w.api.campaignMentionEvidence.sync({rescan:true});
  assert.ok(w.api.campaignMentionEvidence.snapshot().records.length>0);
  await assert.rejects(w.api.campaignMentionEvidence.sync({rescan:true,assertCurrent:()=>{throw Error('Unexpected failure');}}),/Unexpected failure/);
  assert.equal(warnings,1);
});
test('unchanged page reused; changed text/identities invalidate; callers cannot mutate cache',async()=>{
  const w=world('',false),index=install(w);let calls=0;
  const compute=()=>({groups:[{name:'Mira'}],diagnostics:[],calls:++calls});
  const first=await index.analyzePage(payload(),compute);first.groups[0].name='changed';
  assert.equal((await index.analyzePage(payload(),compute)).groups[0].name,'Mira');assert.equal(calls,1);
  await index.analyzePage({...payload(),text:'Mira is a smith.'},compute);
  const changed=payload();changed.knownIndex.entities.push({name:'Mira North',canonicalUuid:'Actor.mira'});
  await index.analyzePage(changed,compute);assert.equal(calls,3);
});
test('settled queue skips unchanged sources; edits and GM policy changes rerun matching',async()=>{
  const w=world('Mira works as a guide.',false),index=install(w);let syncs=0;
  const real=w.api.campaignMentionEvidence;
  w.api.campaignMentionEvidence={...real,sync:async options=>{syncs++;return real.sync(options);}};
  await index.drain();await index.drain();const settled=syncs;
  await index.drain();assert.equal(syncs,settled);
  w.page.text.content='Mira now works as a courier.';await index.drain();assert.ok(syncs>settled);
  assert.equal(index.status().lastError,'');
});
test('pause prevents analysis; only active GM performs background writes; players cannot read index',async()=>{
  const w=world('',false),index=install(w);let runs=0;
  w.api.campaignMentionEvidence={sync:async()=>runs++};
  await index.pause(true);await index.drain();assert.equal(runs,0);
  await index.pause(false);w.game.users.activeGM.id='other';await index.drain();assert.equal(runs,0);
  w.game.user.isGM=false;assert.equal(index.status(),null);assert.equal(index.request(),false);
  await assert.rejects(index.analyzePage(payload(),()=>({})),/GM-only/);
});
test('source change while analysis awaits is rejected and not marked current',async()=>{
  const w=world('Mira is a guide.',false),index=install(w);let calls=0;
  w.api.campaignMentionEvidence={sync:async options=>{calls++;w.page.text.content+=' Changed.';options.assertCurrent();}};
  await index.drain();assert.equal(index.status().lastError,'');assert.equal(index.status().queued,true);
  await index.drain();assert.equal(calls,2);
});
test('deleted identity retains marker, same-name new identity is distinct; forget is not resurrection',async()=>{
  const w=world('',false),index=install(w),npc=w.add('Mira','Actor');
  await index.drain();
  w.game.actors.contents.splice(w.game.actors.contents.indexOf(npc),1);w.docs.delete(npc.uuid);
  await index.drain();assert.equal(index.historicalForName('Mira')[0].uuid,npc.uuid);
  const replacement=w.add('Mira','Actor');await index.drain();
  assert.notEqual(replacement.uuid,npc.uuid);
  assert.equal(index.status().records.find(row=>row.uuid===npc.uuid).status,'deleted');
  assert.equal(index.status().records.find(row=>row.uuid===replacement.uuid).status,'active');
});
test('archive/resume uses canonical GM policy without deleting identity',async()=>{
  const w=world('',false),index=install(w),npc=w.add('Mira','Actor');
  await index.archive(npc.uuid,true);assert.equal(w.api.campaignReviewLearning.isPaused(npc.uuid),true);
  assert.ok(w.docs.has(npc.uuid));assert.equal(index.status().records.find(row=>row.uuid===npc.uuid).status,'archived');
  await index.archive(npc.uuid,false);assert.equal(w.api.campaignReviewLearning.isPaused(npc.uuid),false);
});
test('LAN HTTP fallback reuses exact keys without SubtleCrypto',async()=>{
  const w=world('',false),index=install(w);w.context.crypto={};let calls=0;
  await index.analyzePage(payload(),()=>({count:++calls}));
  await index.analyzePage(payload(),()=>({count:++calls}));assert.equal(calls,1);
});
test('GM decision arriving during a background job prevents its commit',async()=>{
  const w=world('Mira is a guide.',false),index=install(w);
  w.api.campaignMentionEvidence={sync:async options=>{w.context.Hooks.callAll('adventurersTomeCampaignLearningUpdated',{reason:'source-identity-choice'});options.assertCurrent();}};
  await index.drain();assert.equal(index.status().lastError,'');assert.equal(index.status().queued,true);assert.equal(index.status().completed,0);
});
test('deleting a source retires its active evidence and removes it from discovery',async()=>{
  const w=world('Mira is a guide.',false),index=install(w);
  await index.drain();await index.drain();
  assert.ok(w.api.campaignMentionEvidence.snapshot().records.some(row=>row.active));
  w.game.journal.contents.splice(w.game.journal.contents.indexOf(w.session),1);w.docs.delete(w.session.uuid);
  await index.drain();
  assert.equal(w.api.campaignMentionEvidence.snapshot().records.filter(row=>row.sourceUuid===w.session.uuid&&row.active).length,0);
  assert.equal(w.api.campaignNewEntityDiscovery.snapshot().candidates.filter(row=>row.sourceJournalUuid===w.session.uuid).length,0);
});
