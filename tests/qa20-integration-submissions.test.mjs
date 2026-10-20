import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real semantic planner and executor, not a stub write backend.
function world({gm=false,owner=true,visible=true,plain=false}={}) {
  const hooks=new Map();const Hooks={on(n,f){hooks.set(n,[...(hooks.get(n)||[]),f]);},once(n,f){Hooks.on(n,f);},callAll(n,...args){for(const f of [...(hooks.get(n)||[])])f(...args);}};
  let writes=0,reads=0,serial=0,now=1000;
  const flags=plain?{profile:{biography:'Original biography'}}:{knownInformation:{html:'<p>Original information</p>'}};
  const source={uuid:'Actor.target',name:'Target <name>',documentName:'Actor',type:'npc',getFlag(_id,key){if(key==='private')throw Error('Private store must never be read');return flags[key];},testUserPermission(_user,permission){return permission==='OWNER'?owner:visible;},async update(changes){writes++;for(const [path,value] of Object.entries(changes)){const parts=path.split('.').slice(2);let obj=flags;for(const key of parts.slice(0,-1))obj=obj[key]??={};obj[parts.at(-1)]=value;}}};
  const modules=new Map([['adventurers-tome',{active:true,api:{canView:()=>visible}}],['external-module',{active:true,title:'External <module>'}],['other-module',{active:true}]]);
  const dialogs=[];let accept=async()=>true;
  const context=vm.createContext({Hooks,console:{info(){},warn(){}},Date:{now:()=>now},game:{modules,system:{id:'generic'},user:{id:'current',isGM:gm}},fromUuid:async uuid=>{reads++;return uuid===source.uuid?source:null;},foundry:{utils:{deepClone:structuredClone,randomID:()=>`ticket${++serial}`},applications:{api:{DialogV2:{confirm:async config=>{dialogs.push(config);return accept(config);}}}}}});
  for(const name of ['world-system-adapters','semantic-catalog','universal-semantic-layer','integration-api']){
    let text=fs.readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8');
    text=text.replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\/semantic-catalog\.js";\s*/,'').replace(/^export /gm,'');
    vm.runInContext(text,context,{filename:name});
  }
  Hooks.callAll('ready');Hooks.callAll('adventurersTomeCoreApiReady');
  const api=modules.get('adventurers-tome').api;
  const handle=api.integrations.register({moduleId:'external-module',apiVersion:1});
  return {context,source,flags,dialogs,handle,api,modules,get writes(){return writes;},get reads(){return reads;},set accept(fn){accept=fn;},set owner(v){owner=v;},set visible(v){visible=v;},advance(){now+=300001;}};
}
const prepare=(w,text='Proposed addition')=>w.handle.prepareSubmission({targetUuid:w.source.uuid,text});

test('preparation is read-only; native review appends escaped text and preserves existing HTML',async()=>{
  const w=world();const draft=await prepare(w,'First line\n<script>alert(1)</script>');
  assert.equal(w.writes,0);assert.equal(w.dialogs.length,0);assert.ok(Object.isFrozen(draft));
  const result=await w.handle.reviewSubmission(draft.ticket);
  assert.equal(result.applied,true);assert.equal(w.writes,1);
  assert.equal(w.flags.knownInformation.html,'<p>Original information</p>\n<p>First line<br>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.ok(w.dialogs[0].content.includes('External &lt;module&gt;'));
  assert.ok(w.dialogs[0].content.includes('Target &lt;name&gt;'));
  assert.ok(!w.dialogs[0].content.includes('<script>'));assert.equal(w.dialogs[0].no.default,true);
  await assert.rejects(()=>w.handle.reviewSubmission(draft.ticket),/unavailable/);assert.equal(w.writes,1);
});

test('plain character biography receives readable plain text, never HTML markup',async()=>{
  const w=world({plain:true});const d=await prepare(w,'A new paragraph & a second line.');await w.handle.reviewSubmission(d.ticket);
  assert.equal(w.flags.profile.biography,'Original biography\n\nA new paragraph & a second line.');assert.equal(w.writes,1);
});

for(const accepted of [false,null,undefined])test(`cancel or close (${accepted}) writes nothing`,async()=>{
  const w=world();w.accept=async()=>accepted;const d=await prepare(w);const result=await w.handle.reviewSubmission(d.ticket);
  assert.equal(result.status,'cancelled');assert.equal(w.writes,0);
});

test('visible non-owner is denied by the real semantic layer; payload cannot impersonate GM',async()=>{
  const w=world({owner:false});await assert.rejects(()=>prepare(w),/cannot submit/);assert.equal(w.writes,0);
  const reads=w.reads;await assert.rejects(()=>w.handle.prepareSubmission({targetUuid:w.source.uuid,text:'test',user:{isGM:true}}),/Unsupported submission field/);
  assert.equal(w.reads,reads);assert.equal(w.dialogs.length,0);
});

test('invisible targets fail before semantic access and private APIs are never invoked',async()=>{
  const w=world({gm:true,visible:false});w.api.privateFactStore={read(){throw Error('Private store touched');}};
  await assert.rejects(()=>prepare(w),/unavailable/);assert.equal(w.writes,0);
});

test('semantic, field paths, HTML, callbacks and arbitrary sources cannot be supplied',async()=>{
  const w=world();
  for(const extra of [{semantic:'notes.gm'},{path:'flags.private'},{html:'<img>'},{onConfirm:()=>true}])await assert.rejects(()=>w.handle.prepareSubmission({targetUuid:w.source.uuid,text:'test',...extra}),/Unsupported submission field/);
  for(const uuid of ['Compendium.secret.Actor.id','Actor.target.Item.child','https://other','JournalEntry.bad.path'])await assert.rejects(()=>w.handle.prepareSubmission({targetUuid:uuid,text:'test'}),/canonical/);
  for(const text of ['',null,'x'.repeat(10001)])await assert.rejects(()=>prepare(w,text),/plain-text/);
  assert.equal(w.reads,0);assert.equal(w.writes,0);
});

test('changed content during review is rejected by native expected-value revalidation',async()=>{
  const w=world();const d=await prepare(w);w.accept=async()=>{w.flags.knownInformation.html='<p>Changed independently</p>';return true;};
  const result=await w.handle.reviewSubmission(d.ticket);assert.equal(result.status,'rejected');assert.equal(w.writes,0);
  assert.equal(w.flags.knownInformation.html,'<p>Changed independently</p>');
});

test('ownership revocation during review blocks writes',async()=>{
  const w=world();const d=await prepare(w);w.accept=async()=>{w.owner=false;return true;};
  assert.equal((await w.handle.reviewSubmission(d.ticket)).applied,false);assert.equal(w.writes,0);
});

test('Tome visibility revocation and user switching while reviewing block writes',async()=>{
  for(const change of ['visibility','user']){
    const w=world();const d=await prepare(w);w.accept=async()=>{if(change==='visibility')w.visible=false;else w.context.game.user.id='other';return true;};
    await assert.rejects(()=>w.handle.reviewSubmission(d.ticket));assert.equal(w.writes,0);
  }
});

test('module deactivation or disposal while reviewing cannot authorize an addition',async()=>{
  for(const dispose of [true,false]){
    const w=world();const d=await prepare(w);w.accept=async()=>{if(dispose)w.handle.dispose();else w.modules.get('external-module').active=false;return true;};
    try{assert.equal((await w.handle.reviewSubmission(d.ticket)).status,'cancelled');}catch(error){assert.match(error.message,/inactive/);}
    assert.equal(w.writes,0);
  }
});

test('tickets are scoped to owner handle, expire and can be cancelled explicitly',async()=>{
  const w=world();const d=await prepare(w),other=w.api.integrations.register({moduleId:'other-module',apiVersion:1});
  await assert.rejects(()=>other.reviewSubmission(d.ticket),/unavailable/);assert.equal(other.cancelSubmission(d.ticket),false);
  assert.equal(w.handle.cancelSubmission(d.ticket),true);await assert.rejects(()=>w.handle.reviewSubmission(d.ticket),/unavailable/);
  const expired=await prepare(w);w.advance();await assert.rejects(()=>w.handle.reviewSubmission(expired.ticket),/expired/);assert.equal(w.writes,0);
});

test('duplicate review calls cannot double-apply; cancellation while dialog is open is honored',async()=>{
  const w=world();const d=await prepare(w);let release;
  w.accept=()=>new Promise(resolve=>{release=resolve;});const review=w.handle.reviewSubmission(d.ticket);
  await new Promise(resolve=>setImmediate(resolve));await assert.rejects(()=>w.handle.reviewSubmission(d.ticket),/already being reviewed/);
  assert.equal(w.handle.cancelSubmission(d.ticket),true);release(true);assert.equal((await review).status,'cancelled');assert.equal(w.writes,0);
});

test('storage/provider changes and expiry while dialog is open reject stale approval',async()=>{
  for(const change of ['provider','path','expiry']){
    const w=world();const d=await prepare(w);w.accept=async()=>{if(change==='provider')w.api.semantic={...w.api.semantic};else if(change==='path'){delete w.flags.knownInformation;w.flags.profile={biography:'Different store'};}else w.advance();return true;};
    assert.equal((await w.handle.reviewSubmission(d.ticket)).status,'rejected');assert.equal(w.writes,0);
  }
});

test('pending quota is enforced and cancelling releases capacity',async()=>{
  const w=world(),drafts=[];for(let i=0;i<20;i++)drafts.push(await prepare(w));
  await assert.rejects(()=>prepare(w),/pending submissions/);w.handle.cancelSubmission(drafts[0].ticket);assert.ok((await prepare(w)).ticket);assert.equal(w.writes,0);
});

test('simultaneously approved drafts cannot overwrite each other on this client',async()=>{
  const w=world();const first=await prepare(w,'First'),second=await prepare(w,'Second');
  const results=await Promise.all([w.handle.reviewSubmission(first.ticket),w.handle.reviewSubmission(second.ticket)]);
  assert.equal(results.filter(r=>r.applied).length,1);assert.equal(w.writes,1);
});

test('storage changes between the two preparation plans reject before a ticket is issued',async()=>{
  const w=world();const real=w.api.semantic;let calls=0;
  w.api.semantic={...real,async planWrite(...args){const plan=await real.planWrite(...args);if(++calls===1){w.flags.profile={biography:plan.currentValue};}return plan;}};
  await assert.rejects(()=>prepare(w),/target changed/);assert.equal(w.writes,0);
});
