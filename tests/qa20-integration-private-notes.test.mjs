import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function world({gm=true}={}) {
  const hooks=new Map(),events=[];
  const Hooks={on(n,f){hooks.set(n,[...(hooks.get(n)||[]),f]);},once(n,f){Hooks.on(n,f);},callAll(n,...args){events.push({n,args});return Promise.all((hooks.get(n)||[]).map(f=>f(...args)));}};
  let serial=0,now=1000,writes=0,visible=true,lookups=0,accept=async()=>true,resolve=null;
  const reads=[],dialogs=[],settings=new Map(),definitions=new Map();
  const note=(owner,entry)=>({id:`${owner}${entry}`,title:`${owner} title`,body:`PRIVATE ${owner} ${entry}`,type:'secret',status:'open'});
  const record=(owner,entry)=>({uuid:`Actor.${entry}`,notes:[note(owner,entry)],facts:[{label:'FACT',value:`PRIVATE FACT ${owner}`}],relations:[{id:`PRIVATE RELATION ${owner}`} ]});
  for(const id of ['gmA','gmB'])settings.set(`${id}:gmContextualPrivateVaultV2`,JSON.stringify({schema:'adventurers-tome.private-vault',version:2,records:{'Actor.a':record(id,'a'),'Actor.b':record(id,'b')},migration:{legacyImportedAt:1}}));
  const sources=new Map(['a','b'].map(id=>[`Actor.${id}`,{uuid:`Actor.${id}`,id,name:`Target <${id}>`,documentName:'Actor'}]));
  const modules=new Map([['adventurers-tome',{active:true,api:{canView:()=>visible}}],['external-module',{active:true,title:'External <module>'}],['other-module',{active:true}]]);
  const game={modules,user:{id:'gmA',isGM:gm},system:{id:'generic'},actors:{get:id=>sources.get(`Actor.${id}`)},journal:{get(){}},settings:{register(_id,key,spec){definitions.set(key,spec);},get(_id,key){reads.push({user:game.user.id,key});return settings.get(`${game.user.id}:${key}`)||'{}';},async set(_id,key,value){writes++;settings.set(`${game.user.id}:${key}`,value);}}};
  const context=vm.createContext({Hooks,game,Date:{now:()=>now},console:{info(){},warn(){},error(){}},fromUuid:async uuid=>{lookups++;return resolve?resolve(uuid):sources.get(uuid);},foundry:{utils:{deepClone:structuredClone,randomID:()=>`token${++serial}`},applications:{api:{DialogV2:{confirm:async config=>{dialogs.push(config);return accept(config);}}}}}});
  for(const file of ['world-system-adapters','contextual-private-vault','integration-api'])vm.runInContext('{\n'+fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8')+'\n}',context,{filename:file});
  await Hooks.callAll('init');await Hooks.callAll('ready');await Hooks.callAll('adventurersTomeCoreApiReady');
  reads.length=0;events.length=0;writes=0;
  const api=modules.get('adventurers-tome').api,handle=api.integrations.register({moduleId:'external-module',apiVersion:1});
  return {api,handle,game,modules,events,reads,dialogs,sources,definitions,get writes(){return writes;},get lookups(){return lookups;},set accept(fn){accept=fn;},set visible(v){visible=v;},set resolve(fn){resolve=fn;},advance(){now+=60001;}};
}
const request=w=>w.handle.requestPrivateNotesAccess({targetUuid:'Actor.a',purpose:'Prepare a briefing for me.'});

test('native user-scoped vault is read only after approval; only chosen GM/target notes are returned',async()=>{
  const w=await world();assert.equal(w.definitions.get('gmContextualPrivateVaultV2').scope,'user');
  const grant=await request(w);assert.equal(w.reads.length,0);assert.equal(w.writes,0);assert.ok(Object.isFrozen(grant));
  const data=await w.handle.readPrivateNotes(grant.token);
  assert.equal(data.notes.length,1);assert.equal(data.notes[0].body,'PRIVATE gmA a');
  assert.deepEqual(Object.keys(data.notes[0]).sort(),['body','id','status','title','type']);
  assert.ok(Object.isFrozen(data));assert.ok(Object.isFrozen(data.notes));assert.ok(Object.isFrozen(data.notes[0]));
  assert.ok(w.reads.every(r=>r.user==='gmA'));assert.ok(!JSON.stringify(data).includes('FACT'));assert.ok(!JSON.stringify(data).includes('gmB'));
  assert.equal(w.writes,0);assert.ok(!JSON.stringify(w.events).includes('PRIVATE'));
  const reads=w.reads.length;await assert.rejects(()=>w.handle.readPrivateNotes(grant.token),/unavailable/);assert.equal(w.reads.length,reads);
});

for(const consent of [false,null,undefined])test(`denial/close (${consent}) never reads the private vault`,async()=>{
  const w=await world();w.accept=async()=>consent;assert.equal(await request(w),null);assert.equal(w.reads.length,0);assert.equal(w.writes,0);
});

test('player is denied before UUID lookup, dialog or vault access even with a forged GM field',async()=>{
  const w=await world({gm:false});
  await assert.rejects(()=>request(w),/approving GM/);
  await assert.rejects(()=>w.handle.readPrivateNotes('forged'),/approving GM/);
  await assert.rejects(()=>w.handle.requestPrivateNotesAccess({targetUuid:'Actor.a',purpose:'test',user:{isGM:true}}),/approving GM/);
  assert.equal(w.lookups,0);assert.equal(w.dialogs.length,0);assert.equal(w.reads.length,0);
});

test('purpose and source are validated; no user, scope, lifetime or private path override is accepted',async()=>{
  const w=await world();
  for(const extra of [{userId:'gmB'},{scope:'all-private'},{expiresAt:99999999},{path:'privateFacts'},{approved:true}])await assert.rejects(()=>w.handle.requestPrivateNotesAccess({targetUuid:'Actor.a',purpose:'test',...extra}),/Unsupported/);
  for(const targetUuid of ['Compendium.secret.Actor.a','Actor.a.Item.b','https://elsewhere'])await assert.rejects(()=>w.handle.requestPrivateNotesAccess({targetUuid,purpose:'test'}),/canonical/);
  for(const purpose of ['',null,'x'.repeat(241)])await assert.rejects(()=>w.handle.requestPrivateNotesAccess({targetUuid:'Actor.a',purpose}),/plain-text/);
  assert.equal(w.reads.length,0);assert.equal(w.lookups,0);
});

test('authorization explains exact scope and escapes module, source and purpose; deny is default',async()=>{
  const w=await world();w.accept=async()=>false;
  await w.handle.requestPrivateNotesAccess({targetUuid:'Actor.a',purpose:'<img src=x onerror=alert(1)>'});
  const dialog=w.dialogs[0];assert.ok(dialog.content.includes('External &lt;module&gt;'));assert.ok(dialog.content.includes('Target &lt;a&gt;'));assert.ok(!dialog.content.includes('<img'));assert.ok(dialog.content.includes('process or transmit'));assert.equal(dialog.no.default,true);assert.equal(w.reads.length,0);
});

test('grant cannot cross integration handles or GM users',async()=>{
  const w=await world();const grant=await request(w),other=w.api.integrations.register({moduleId:'other-module',apiVersion:1});
  await assert.rejects(()=>other.readPrivateNotes(grant.token),/unavailable/);assert.equal(other.revokePrivateNotesAccess(grant.token),false);
  w.game.user.id='gmB';await assert.rejects(()=>w.handle.readPrivateNotes(grant.token),/unavailable/);assert.equal(w.reads.length,0);
});

test('expiry, revocation, role loss, module deactivation and disposal block private reads',async()=>{
  for(const change of ['expiry','revoke','role','module','dispose']){
    const w=await world(),grant=await request(w);
    if(change==='expiry')w.advance();if(change==='revoke')assert.equal(w.handle.revokePrivateNotesAccess(grant.token),true);
    if(change==='role')w.game.user.isGM=false;if(change==='module')w.modules.get('external-module').active=false;if(change==='dispose')w.handle.dispose();
    await assert.rejects(()=>w.handle.readPrivateNotes(grant.token));assert.equal(w.reads.length,0);
  }
});

test('target visibility, identity and provider changes invalidate prior permission',async()=>{
  for(const change of ['visibility','identity','provider','method']){
    const w=await world(),grant=await request(w);
    if(change==='visibility')w.visible=false;if(change==='identity')w.sources.set('Actor.a',{...w.sources.get('Actor.a')});
    if(change==='provider')w.api.contextualPrivateVault={...w.api.contextualPrivateVault};if(change==='method')w.api.contextualPrivateVault.getNotes=()=>{throw Error('Must not call changed provider');};
    await assert.rejects(()=>w.handle.readPrivateNotes(grant.token));assert.equal(w.reads.length,0);
  }
});

test('approval cannot survive changed GM, source, provider or integration during the dialog',async()=>{
  for(const change of ['user','source','provider','dispose']){
    const w=await world();w.accept=async()=>{if(change==='user')w.game.user.id='gmB';if(change==='source')w.sources.set('Actor.a',{...w.sources.get('Actor.a')});if(change==='provider')w.api.contextualPrivateVault={...w.api.contextualPrivateVault};if(change==='dispose')w.handle.dispose();return true;};
    await assert.rejects(()=>request(w));assert.equal(w.reads.length,0);
  }
});

test('revoking while UUID resolution is pending prevents data access and duplicate reads',async()=>{
  const w=await world(),grant=await request(w);let release;
  w.resolve=()=>new Promise(resolve=>{release=resolve;});const reading=w.handle.readPrivateNotes(grant.token);
  await assert.rejects(()=>w.handle.readPrivateNotes(grant.token),/unavailable/);
  assert.equal(w.handle.revokePrivateNotesAccess(grant.token),true);release(w.sources.get('Actor.a'));
  await assert.rejects(()=>reading,/stale/);assert.equal(w.reads.length,0);
});

test('grant capacity is bounded and revoking releases a slot without reading notes',async()=>{
  const w=await world(),grants=[];for(let i=0;i<10;i++)grants.push(await request(w));
  await assert.rejects(()=>request(w),/outstanding/);assert.equal(w.handle.revokePrivateNotesAccess(grants[0].token),true);assert.ok((await request(w)).token);assert.equal(w.reads.length,0);
});

test('each GM can authorize only their own native vault notes',async()=>{
  const w=await world();w.game.user.id='gmB';const grant=await request(w);
  assert.equal((await w.handle.readPrivateNotes(grant.token)).notes[0].body,'PRIVATE gmB a');
  assert.ok(w.reads.every(r=>r.user==='gmB'));
});

test('overlapping permission requests do not produce stacked dialogs and denial releases the request',async()=>{
  const w=await world();let release;w.accept=()=>new Promise(resolve=>{release=resolve;});
  const first=request(w);await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>request(w),/current private-note permission request/);assert.equal(w.dialogs.length,1);
  release(false);assert.equal(await first,null);w.accept=async()=>false;assert.equal(await request(w),null);assert.equal(w.reads.length,0);
});
