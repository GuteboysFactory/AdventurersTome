import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {performance} from 'node:perf_hooks';
const code=fs.readFileSync(new URL('../scripts/universal-backend-folder-parity.js',import.meta.url),'utf8');
function fixture(){
 const hooks=new Map(),api={},counts={clones:0,flags:0,yields:0},journals=[];
 const collection=contents=>({contents,get:id=>contents.find(d=>d.id===id)}),game={user:{isGM:true},journal:collection(journals),actors:collection([]),items:collection([]),folders:collection([])};
 const ctx=vm.createContext({game,performance,console,Map,Set,Date,JSON,Promise,foundry:{utils:{deepClone:v=>{counts.clones++;return structuredClone(v)}}},ATTestAI:{assertEnabled(){},flags:d=>({getFlag:(ns,k)=>{counts.flags++;return d?.flags?.[ns]?.[k]}}),modules:{get:()=>({api})}},Hooks:{on:(e,f)=>hooks.set(e,f),once(){},callAll(){}},window:{setTimeout,clearTimeout},AdventurersTomeBackground:{async checkpoint(){counts.yields++;await new Promise(r=>setTimeout(r,0));}}});vm.runInContext(code,ctx);
 const journal=(id,profile={},projection=null)=>{const d={id,uuid:'JournalEntry.'+id,name:id,documentName:'JournalEntry',flags:{'adventurers-tome':{worldProfile:profile,...(projection?{backendProjectionV1:projection}:{})}}};journals.push(d);return d;};
 return {ctx,counts,journal,hooks,game,api,index:()=>({rows:new Map(),revision:-1})};
}
test('Profile reads neither clone nor mutate document data; profile writer still owns its copy',()=>{
 const w=fixture(),profile={category:'npc',facts:[{text:'User edited'}],custom:{keep:true}},j=w.journal('one',profile);
 assert.equal(w.ctx.atBfpWorldProfile(j),profile);assert.equal(w.ctx.atBfpCategoryFromWorld(j),'npc');assert.equal(w.counts.clones,0);
 const result=w.ctx.atBfpProjectionProfile({documentName:'Actor',id:'a',uuid:'Actor.a',type:'npc',name:'A',system:{}},'npc',profile);
 assert.notEqual(result,profile);assert.notEqual(result.facts,profile.facts);assert.equal(w.counts.clones,1);assert.equal(profile.sourceUuid,undefined);assert.equal(result.custom.keep,true);
});
test('Indexed matching equals the original predicate for manual, managed, fallback and malformed representations',async()=>{
 const w=fixture();w.journal('manual',{category:'NPC',sourceUuid:'Actor.a'});w.journal('managed',{}, {managed:true,category:'npc',sourceUuid:' Actor.a '});w.journal('fallback',{category:'location',sourceUuid:'JournalEntry.b'},{});w.journal('other',{category:'item',sourceUuid:'Item.a'});w.journal('empty');w.journal('legacy',{category:'npc',sourceUuid:'Actor.a'},{managed:false});
 const index=w.index();for(const category of ['npc','NPC','location','item',''])for(const uuid of ['Actor.a','JournalEntry.b','Item.a','']){
  const old=await w.ctx.atBfpEquivalentRepresentations(category,uuid),indexed=await w.ctx.atBfpEquivalentRepresentations(category,uuid,index);assert.deepEqual(Array.from(indexed,d=>d.id),Array.from(old,d=>d.id));
 }assert.equal(w.counts.clones,0);assert.equal(vm.runInContext('ATBFP_STATS.representationBuilds',w.ctx),1);
});
test('A thousand lookups read the thousand journals once rather than scanning a million pairs',async()=>{
 const w=fixture();for(let n=0;n<1000;n++)w.journal('j'+n,{category:'npc',sourceUuid:'Actor.'+n,body:'Private prose '.repeat(400)});
 const index=w.index();for(let n=0;n<1000;n++){const rows=await w.ctx.atBfpEquivalentRepresentations('npc','Actor.'+n,index);assert.equal(rows.length,1);}
 assert.equal(vm.runInContext('ATBFP_STATS.representationReads',w.ctx),1000);assert.equal(w.counts.clones,0);assert.ok(w.counts.flags<8000);assert.ok(w.counts.yields>0);
});
test('External updates invalidate the per-run lookup; later world runs never reuse old maps',async()=>{
 const w=fixture(),j=w.journal('one',{category:'npc',sourceUuid:'Actor.a'}),index=w.index();assert.equal((await w.ctx.atBfpEquivalentRepresentations('npc','Actor.a',index)).length,1);
 j.flags['adventurers-tome'].worldProfile.sourceUuid='Actor.b';w.hooks.get('updateJournalEntry')(j,{},{});
 assert.equal((await w.ctx.atBfpEquivalentRepresentations('npc','Actor.a',index)).length,0);assert.equal((await w.ctx.atBfpEquivalentRepresentations('npc','Actor.b',index)).length,1);
 w.game.journal.contents.splice(0);assert.equal((await w.ctx.atBfpEquivalentRepresentations('npc','Actor.b',w.index())).length,0);
});
test('External changes while the map yields trigger a fresh build',async()=>{
 const w=fixture();for(let i=0;i<1000;i++)w.journal('j'+i,{category:'npc',sourceUuid:'Actor.'+i});let injected=false;
 w.ctx.AdventurersTomeBackground.checkpoint=async()=>{if(!injected){injected=true;const d=w.journal('late',{category:'npc',sourceUuid:'Actor.late'});w.hooks.get('createJournalEntry')(d,{},{});}};
 vm.runInContext('atBfpSliceStarted=-Infinity',w.ctx);assert.equal((await w.ctx.atBfpEquivalentRepresentations('npc','Actor.late',w.index())).length,1);assert.ok(vm.runInContext('ATBFP_STATS.representationBuilds',w.ctx)>=2);
});
test('Successful own create/delete update the same lookup without invalidating the whole world',async()=>{
 const w=fixture(),index=w.index();await w.ctx.atBfpRefreshRepresentations(index);const d=w.journal('added',{category:'item',sourceUuid:'Item.a'});w.ctx.atBfpIndexRepresentation(index,d);
 assert.equal((await w.ctx.atBfpEquivalentRepresentations('item','Item.a',index))[0],d);w.ctx.atBfpForgetRepresentation(index,d);assert.equal((await w.ctx.atBfpEquivalentRepresentations('item','Item.a',index)).length,0);assert.equal(vm.runInContext('ATBFP_STATS.representationBuilds',w.ctx),1);
});
test('External changes during synchronization queue one follow-up; own writes and inventory events do not',()=>{
 const w=fixture();vm.runInContext('atBfpSyncing=true',w.ctx);const h=w.hooks.get('updateJournalEntry');h({}, {}, {});h({}, {}, {});assert.equal(vm.runInContext('atBfpPendingReason',w.ctx),'updateJournalEntry');
 vm.runInContext('atBfpPendingReason=""',w.ctx);h({}, {}, {adventurersTomeBackendParity:true});w.hooks.get('updateItem')({documentName:'Item',parent:{documentName:'Actor'}},{},{});assert.equal(vm.runInContext('atBfpPendingReason',w.ctx),'');
});
