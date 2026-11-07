import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {digestIndexValue,encodeIndexValue} from '../scripts/index-digest-core.mjs';import {createIndexDigestPool} from '../scripts/index-digest-pool.mjs';
const encode=value=>JSON.stringify(value,(_key,v)=>v instanceof Set?[...v].sort():v instanceof Map?[...v.entries()]:v);
test('Worker fingerprints preserve original bytes and SHA-256, including sets, maps and non-secure fallback',async()=>{
 const fixtures=[null,undefined,{},['Bree','Fornost'],{unicode:'ÅÄÖ Dúnedain 🧙',none:undefined,num:NaN,set:new Set(['z','a']),map:new Map([['b',2],['a',1]]),date:new Date('2026-11-06T00:00:00Z')},Array.from({length:14000},(_,i)=>['Item.'+i,{key:'sha256:'+i,mode:'source'}])];
 for(const value of fixtures){assert.equal(encodeIndexValue(value),encode(value));const expected='sha256:'+createHash('sha256').update(new TextEncoder().encode(encode(value))).digest('hex');assert.equal(await digestIndexValue(value,true),expected);assert.equal(await digestIndexValue(value,false),'exact:'+encode(value));}
});
function fixture(){let scope='world:gm',allowed=true,created=0,last;
 const pool=createIndexDigestPool({owner:()=>scope,allowed:()=>allowed,idleMs:100000,makeWorker:()=>{created++;last={postMessage(data){this.data=data},terminate(){this.terminated=true}};return last}});
 return {pool,worker:()=>last,created:()=>created,owner:s=>scope=s,deny:()=>allowed=false};
}
test('Worker replies are correlated and an owner change cannot return old-world data',async()=>{
 const w=fixture(),first=w.pool.digest({x:1},true),second=w.pool.digest({x:2},true),worker=w.worker();worker.onmessage({data:{id:2,result:'second'}});worker.onmessage({data:{id:1,result:'first'}});assert.equal(await first,'first');assert.equal(await second,'second');assert.equal(w.created(),1);
 const stale=w.pool.digest({private:'input'},true),id=worker.data.id;w.owner('other:gm');worker.onmessage({data:{id,result:'private-key'}});await assert.rejects(stale,/owner changed/);w.pool.dispose();
});
test('Worker failure rejects pending work and shutdown prevents future requests',async()=>{
 const w=fixture(),job=w.pool.digest({x:1},true);w.worker().onerror({message:'crashed'});await assert.rejects(job,/crashed/);assert.equal(w.pool.status().pending,0);w.pool.dispose();await assert.rejects(w.pool.digest({},true),/unavailable/);
});
test('A player cannot enqueue authorized fingerprint inputs',async()=>{const w=fixture();w.deny();await assert.rejects(w.pool.digest({},true),/unavailable/);assert.equal(w.created(),0);w.pool.dispose();});
