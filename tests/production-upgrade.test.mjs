import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync(new URL('../scripts/production-bootstrap.js',import.meta.url),'utf8');
const ID='adventurers-tome',OLD='adventurers-tome-testai';
function fixture({user='gm',isGM=true,data=new Map(),local=new Map(),dual=false}={}){
 const hooks={},writes=[],configs=new Map();
 const token=(namespace,key,scope)=>`${scope}|${scope==='user'?user:''}|${namespace}.${key}`;
 const storage={getItem:key=>local.has(key)?local.get(key):null,setItem:(k,v)=>local.set(k,v),key:i=>[...local.keys()][i],get length(){return local.size;}};
 const world={getSetting:(key,who)=>{const scope=who?'user':'world',t=`${scope}|${who||''}|${key}`;return data.has(t)?{value:data.get(t)}:null;}};
 const settings={settings:configs,storage:new Map([['client',storage],['world',world],['user',world]]),register(ns,k,o){configs.set(ns+'.'+k,o);},get(ns,k){const o=configs.get(ns+'.'+k);if(!o)throw Error('Unregistered '+k);return structuredClone(o.scope==='client'?(local.has(ns+'.'+k)?JSON.parse(local.get(ns+'.'+k)):o.default):(data.has(token(ns,k,o.scope))?data.get(token(ns,k,o.scope)):o.default));},async set(ns,k,v){const o=configs.get(ns+'.'+k);writes.push([ns,k]);if(o.scope==='client')local.set(ns+'.'+k,JSON.stringify(v));else data.set(token(ns,k,o.scope),structuredClone(v));return v;}};
 const game={world:{id:'one'},userId:user,user:{id:user,isGM},users:{activeGM:{id:'gm'}},modules:new Map([[ID,{active:true}],[OLD,{active:dual}]]),settings,socket:{}};
 const ctx=vm.createContext({game,localStorage:storage,structuredClone,console,ui:{notifications:{error(){}}},Hooks:{once:(k,f)=>hooks[k]=f}});
 vm.runInContext(code,ctx);const api=ctx.ATTestAI;
 return {api,game,data,local,writes,register:(key,scope='world',value='default')=>api.settings.register(ID,key,{scope,type:String,default:value}),seed:(key,value,scope='world',ns=OLD)=>data.set(token(ns,key,scope),value)};
}
test('saved world, private decisions and browser settings transfer once and originals survive',async()=>{
 const f=fixture();f.seed('tree','test-tree');f.seed('learning','private-choice','user');f.seed('tree','old-production','world',ID);f.local.set(OLD+'.windowState',JSON.stringify('test-window'));
 f.register('tree');f.register('learning','user');f.register('windowState','client');
 assert.equal(f.api.settings.get(ID,'tree'),'test-tree');assert.equal(f.api.settings.get(ID,'learning'),'private-choice');
 assert.equal((await f.api.upgrade.run()).errors.length,0);assert.equal(f.game.settings.get(ID,'tree'),'test-tree');assert.equal(f.game.settings.get(ID,'learning'),'private-choice');
 await f.api.settings.set(ID,'tree','later-production');
 const next=fixture({data:f.data,local:f.local});next.register('tree');await next.api.upgrade.run();assert.equal(next.game.settings.get(ID,'tree'),'later-production');assert.equal(next.data.get('world||'+OLD+'.tree'),'test-tree');
});
test('ordinary world with no test settings retains all production values',async()=>{const f=fixture();f.seed('tree','original','world',ID);f.register('tree');assert.equal(f.api.settings.get(ID,'tree'),'original');await f.api.upgrade.run();assert.equal(f.writes.length,0);});
test('private settings are isolated and a player never migrates world settings',async()=>{const gm=fixture();gm.seed('private','gm secret','user');gm.seed('tree','shared');const p=fixture({user:'player',isGM:false,data:gm.data});p.register('private','user','empty');p.register('tree');await p.api.upgrade.run();assert.equal(p.api.settings.get(ID,'private'),'empty');assert.equal(p.writes.length,0);});
test('explicit current save supersedes pending test value',async()=>{const f=fixture();f.seed('tree','old test');f.register('tree');await f.api.settings.set(ID,'tree','new choice');await f.api.upgrade.run();assert.equal(f.api.settings.get(ID,'tree'),'new choice');});
test('local tree preference transfers once for the current world/user only',async()=>{const f=fixture();f.local.set(OLD+'.world-tree-view.one|gm','custom');f.local.set(OLD+'.world-tree-view.other|gm','original');await f.api.upgrade.run();assert.equal(f.local.get(ID+'.world-tree-view.one|gm'),'custom');assert.equal(f.local.get(ID+'.world-tree-view.other|gm'),undefined);});
test('simultaneous activation is refused before a second engine starts',()=>assert.throws(()=>fixture({dual:true}),/Deactivate/));
test('another connected GM follows the completed world transfer instead of retaining an old pending default',async()=>{
 const first=fixture();first.seed('tree','test-tree');first.register('tree');
 const second=fixture({user:'second-gm',data:first.data});second.register('tree');
 await first.api.upgrade.run();await first.api.settings.set(ID,'tree','updated-production');
 assert.equal(second.api.settings.get(ID,'tree'),'updated-production');
});
test('bundled test background uses the production asset, while campaign image paths are preserved',async()=>{
 const f=fixture();f.seed('background','modules/adventurers-tome-testai/assets/default-hero.webp');f.register('background');await f.api.upgrade.run();assert.equal(f.api.settings.get(ID,'background'),'modules/adventurers-tome/assets/default-hero.webp');
 const custom=fixture();custom.seed('background','worlds/my-campaign/background.webp');custom.register('background');await custom.api.upgrade.run();assert.equal(custom.api.settings.get(ID,'background'),'worlds/my-campaign/background.webp');
});
