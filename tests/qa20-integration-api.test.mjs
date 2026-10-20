import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function world({player=false}={}) {
  const hooks=new Map(),events=[];
  const Hooks={on(name,fn){const row={fn,once:false};hooks.set(name,[...(hooks.get(name)||[]),row]);},once(name,fn){const row={fn,once:true};hooks.set(name,[...(hooks.get(name)||[]),row]);},callAll(name,...args){events.push({name,args});for(const row of [...(hooks.get(name)||[])]){if(row.once)hooks.set(name,hooks.get(name).filter(x=>x!==row));row.fn(...args);}}};
  const modules=new Map([['adventurers-tome',{active:true,api:{}}],['example-one',{active:true,title:'Example One'}],['example-two',{active:true,title:'Example Two'}],['inactive',{active:false}]]);
  let writes=0;
  const context=vm.createContext({Hooks,console:{warn(){},info(){}},game:{modules,user:{isGM:!player},system:{id:'unrelated-system'},settings:{set(){writes++;}},actors:{contents:[]},journal:{contents:[]}}});
  for(const file of ['world-system-adapters','integration-api'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
  const core=()=>Hooks.callAll('adventurersTomeCoreApiReady',modules.get('adventurers-tome').api);
  const ready=()=>{Hooks.callAll('ready');core();};
  return {Hooks,modules,events,ready,core,context,get api(){return modules.get('adventurers-tome').api;},get writes(){return writes;}};
}
const register=(w,id='example-one')=>w.api.integrations.register({moduleId:id,apiVersion:1});
const adapter=(id='skills',extra={})=>({id,enrich:()=>({summary:'Public adapter result',facts:[]}),...extra});

test('integration ready waits for async core publication and announces once with metadata only',()=>{
  const w=world();w.Hooks.callAll('ready');
  assert.equal(w.api.integrations.isReady(),false);
  assert.throws(()=>register(w),/not ready/);
  w.core();w.core();w.Hooks.callAll('renderApplicationV2');
  const events=w.events.filter(x=>x.name==='adventurersTomeIntegrationReady');
  assert.equal(events.length,1);assert.equal(events[0].args[0].ready,true);
  assert.deepEqual(Object.keys(events[0].args[0]).sort(),['adapterContract','adapterVersion','compatible','contract','ready','reason','version']);
  assert.ok(Object.isFrozen(events[0].args[0]));assert.equal(w.writes,0);
});

test('core publication before other ready listeners also announces once and preserves existing API',()=>{
  const w=world();w.api.existingFeature={preserved:true};w.core();
  assert.equal(w.api.integrations.isReady(),false);
  w.Hooks.callAll('ready');assert.equal(w.api.integrations.isReady(),true);
  assert.equal(w.api.existingFeature.preserved,true);
  assert.equal(w.events.filter(x=>x.name==='adventurersTomeIntegrationReady').length,1);
});

test('compatibility rejects missing, fractional, string and future versions',()=>{
  const w=world();w.ready();
  for(const apiVersion of [undefined,0,1.5,'1',2]){
    assert.equal(w.api.integrations.compatibility({apiVersion}).compatible,false);
    assert.throws(()=>w.api.integrations.register({moduleId:'example-one',apiVersion}),/Unsupported/);
  }
  assert.equal(w.api.integrations.compatibility({apiVersion:1}).reason,'ready');
});

test('registration requires active external module and rejects duplicates without side effects',()=>{
  const w=world();w.ready();
  for(const moduleId of ['missing','inactive','adventurers-tome','../example-one','example.one'])assert.throws(()=>register(w,moduleId));
  const h=register(w);assert.equal(h.moduleId,'example-one');assert.throws(()=>register(w),/already registered/);
  assert.equal(w.api.integrations.list().length,1);assert.ok(Object.isFrozen(h));
});

test('namespaces isolate two modules and a failed duplicate preserves its original adapter',async()=>{
  const w=world();w.ready();const one=register(w),two=register(w,'example-two');
  assert.equal(one.registerAdapter(adapter()),'example-one.skills');assert.equal(two.registerAdapter(adapter()),'example-two.skills');
  assert.throws(()=>one.registerAdapter(adapter()),/already owned/);
  assert.equal((await w.api.adapters.enrich({documentName:'Actor',type:'npc'})).summary,'Public adapter result');
  assert.equal(one.dispose(),true);assert.equal(w.api.adapters.get('example-one.skills'),null);
  assert.ok(w.api.adapters.get('example-two.skills'));assert.equal(two.listAdapters().length,1);
  assert.equal(one.dispose(),false);assert.equal(w.writes,0);
});

test('bad local ids, adapter versions and malformed capabilities cannot create registrations',()=>{
  const w=world();w.ready();const h=register(w);
  for(const id of ['','../escape','another.module','name with spaces'])assert.throws(()=>h.registerAdapter(adapter(id)));
  assert.throws(()=>h.registerAdapter(adapter('future',{apiVersion:2})),/Unsupported/);
  assert.throws(()=>h.registerAdapter({id:'empty'}),/capability/);
  assert.equal(h.listAdapters().length,0);assert.equal(w.api.adapters.list().length,0);
});

test('disposed handles cannot affect a new integration using the same module id',()=>{
  const w=world();w.ready();const old=register(w);old.registerAdapter(adapter());old.dispose();
  const current=register(w);current.registerAdapter(adapter());
  assert.throws(()=>old.registerAdapter(adapter('old')),/disposed/);assert.throws(()=>old.unregisterAdapter('skills'),/disposed/);
  assert.equal(old.dispose(),false);assert.equal(current.listAdapters().length,1);
});

test('inactive owners cannot register but can still clean up',()=>{
  const w=world();w.ready();const h=register(w);h.registerAdapter(adapter());w.modules.get('example-one').active=false;
  assert.throws(()=>h.registerAdapter(adapter('other')),/inactive/);assert.equal(w.api.integrations.list()[0].active,false);
  assert.equal(w.api.adapters.supports('enrich',{documentName:'Actor'}),false);
  assert.equal(h.dispose(),true);assert.equal(w.api.adapters.list().length,0);
});

test('legacy replacement survives disposal and is no longer reported as owned',()=>{
  const w=world();w.ready();const h=register(w);h.registerAdapter(adapter());
  w.api.adapters.register(adapter('example-one.skills'),undefined,{replace:true});
  assert.equal(h.listAdapters().length,0);assert.equal(h.unregisterAdapter('skills'),false);
  assert.ok(w.api.adapters.get('example-one.skills'));h.dispose();assert.ok(w.api.adapters.get('example-one.skills'));
});

test('replacement during a synchronous registration hook also survives cleanup',()=>{
  const w=world();w.ready();const h=register(w);
  w.Hooks.once('adventurersTomeAdapterRegistered',()=>w.api.adapters.register(adapter('example-one.skills'),undefined,{replace:true}));
  h.registerAdapter(adapter());assert.equal(h.listAdapters().length,0);h.dispose();assert.ok(w.api.adapters.get('example-one.skills'));
});

test('owner disposed during registration hook leaves no orphaned adapter',()=>{
  const w=world();w.ready();const h=register(w);
  w.Hooks.once('adventurersTomeAdapterRegistered',()=>h.dispose());
  assert.throws(()=>h.registerAdapter(adapter()),/disposed/);assert.equal(w.api.adapters.list().length,0);
});

test('legacy adapter string result, duplicate handling and exact registration receipts remain compatible',()=>{
  const w=world();w.ready();assert.equal(w.api.adapters.register(adapter('legacy')),'legacy');
  assert.throws(()=>w.api.adapters.register(adapter('legacy')),/already registered/);
  const receipt=w.api.adapters.registerHandle(adapter('temporary'));assert.equal(receipt.isCurrent(),true);
  assert.equal(receipt.unregister(),true);assert.equal(receipt.unregister(),false);
  assert.equal(w.api.adapters.unregister('legacy'),true);
});

test('discovery facade exposes no private stores or submission contents; descriptors are frozen',()=>{
  const w=world({player:true});w.ready();const h=register(w);h.registerAdapter(adapter());
  assert.deepEqual(Object.keys(w.api.integrations).sort(),['compatibility','contract','isReady','list','register','version']);
  const rows=w.api.integrations.list();assert.ok(Object.isFrozen(rows));assert.ok(Object.isFrozen(rows[0]));assert.ok(Object.isFrozen(rows[0].adapters));
  assert.equal(w.writes,0);
});

test('failed adapter is contained and the following external adapter still enriches',async()=>{
  const w=world();w.ready();register(w).registerAdapter(adapter('bad',{priority:1,enrich(){throw Error('Example failure');}}));
  register(w,'example-two').registerAdapter(adapter());
  assert.equal((await w.api.adapters.enrich({documentName:'Actor',type:'npc'})).summary,'Public adapter result');
  assert.equal(w.api.adapters.audit().stats.failures,1);
});

for(const coreFirst of [true,false])test(`real example module connects once, opt-in only; core-first=${coreFirst}`,async()=>{
  const w=world();
  const fixture=JSON.parse(fs.readFileSync(new URL('../examples/tome-example-integration/module.json',import.meta.url),'utf8'));
  w.modules.set(fixture.id,{active:true,title:fixture.title});
  vm.runInContext(fs.readFileSync(new URL('../examples/tome-example-integration/example.js',import.meta.url),'utf8'),w.context);
  if(coreFirst){w.core();w.Hooks.callAll('ready');}else w.ready();
  assert.equal(w.api.integrations.list().length,1);assert.equal(w.api.adapters.list().length,1);
  assert.equal((await w.api.adapters.displayFields({documentName:'Actor',getFlag:()=>false})).length,0);
  const fields=await w.api.adapters.displayFields({documentName:'Actor',getFlag:(scope,key)=>scope===fixture.id&&key==='enabled'});
  assert.equal(fields.length,1);assert.equal(fields[0].adapterId,`${fixture.id}.public-demo`);
  assert.equal((await w.api.adapters.displayFields({documentName:'JournalEntry',getFlag:()=>true})).length,0);
  assert.equal(w.writes,0);
});

test('snapshot mutation and missing adapter attachment do not grant readiness or affect registry',()=>{
  const w=world();w.ready();const h=register(w);h.registerAdapter(adapter());
  assert.throws(()=>w.api.integrations.list()[0].adapters.push('forged'));
  assert.throws(()=>{w.api.integrations.list()[0].moduleId='forged';});
  assert.equal(w.api.integrations.list()[0].moduleId,'example-one');
  delete w.api.adapters;
  assert.equal(w.api.integrations.isReady(),false);assert.throws(()=>h.registerAdapter(adapter('other')),/not ready/);
  assert.equal(h.dispose(),true);
});
