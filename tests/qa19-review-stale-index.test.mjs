import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){const warnings=[];const api={campaignMentionDiscovery:{snapshot:()=>({mentions:[{sourceJournalUuid:'JournalEntry.s'}]})}};const context=vm.createContext({game:{user:{isGM:true},modules:new Map([['adventurers-tome',{api}]])},Hooks:{once:()=>{},on:()=>{},callAll:()=>{}},console:{warn:(...args)=>warnings.push(args)},structuredClone,window:{setTimeout:()=>0,clearTimeout:()=>{}}});vm.runInContext(fs.readFileSync(new URL('../scripts/campaign-deterministic-auto-link.js',import.meta.url),'utf8'),context);vm.runInContext('atDalAttach();atDalAutoLinkRow=async()=>({linked:false,decision:"already-linked"});',context);return {api,context,warnings};}
const stale=()=>Object.assign(Error('Source changed during analysis; queued again.'),{code:'TOME_INDEX_STALE'});
test('A GM decision invalidates background work without an audit failure or warning, and the next scan can run',async()=>{
  const f=fixture();await assert.rejects(()=>f.api.campaignDeterministicAutoLink.scan({reuseDiscovery:true,assertCurrent:()=>{throw stale();}}),e=>e.code==='TOME_INDEX_STALE');assert.equal(f.warnings.length,0);assert.equal(f.api.campaignDeterministicAutoLink.audit().stats.failures,0);
  const result=await f.api.campaignDeterministicAutoLink.scan({reuseDiscovery:true,assertCurrent:()=>{}});assert.equal(result.results.length,1);assert.equal(result.healthy,true);
});
test('A stale signal from the row operation also reaches the index retry handler',async()=>{
  const f=fixture();f.context.staleError=stale();vm.runInContext('atDalAutoLinkRow=async()=>{throw staleError;};',f.context);await assert.rejects(()=>f.api.campaignDeterministicAutoLink.scan({reuseDiscovery:true}),e=>e.code==='TOME_INDEX_STALE');assert.equal(f.warnings.length,0);assert.equal(f.api.campaignDeterministicAutoLink.audit().healthy,true);
});
test('Real analysis errors remain visible and counted',async()=>{
  const f=fixture();const result=await f.api.campaignDeterministicAutoLink.scan({reuseDiscovery:true,assertCurrent:()=>{throw Error('Unexpected analysis error');}});assert.equal(result.healthy,false);assert.equal(result.stats.failures,1);assert.equal(f.warnings.length,1);
});
