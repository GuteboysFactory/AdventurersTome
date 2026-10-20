import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {world} from './helpers/tome-world.mjs';
const read=name=>fs.readFileSync(new URL(`../scripts/${name}`,import.meta.url),'utf8');

test('window and private settings never queue analysis; campaign and system rules still do',async()=>{
  const w=world('',false);
  Object.assign(w.context,{structuredClone,crypto:webcrypto,TextEncoder,performance,setTimeout,clearTimeout,URL});
  w.context.document.querySelectorAll=()=>[];
  w.game.settings.settings=new Map([['other-module.panel',{scope:'client'}],['adventurers-tome.gmPrivateVault',{scope:'user'}],['realm-guard.rulesProfile',{scope:'world'}]]);
  vm.runInContext(`{${read('campaign-index.js').replace('import.meta.url',JSON.stringify('http://localhost/scripts/campaign-index.js'))}}`,w.context);
  const index=w.context.AdventurersTomeIndex;
  await index.drain();
  for(const key of ['windowState','windowMode','tomeTransparency','launcherPosition','favorites','recentItems','recentRefs','lastActiveTab','playerChronicleV1','gmPrivateVault']) {
    w.context.Hooks.callAll('updateSetting',{key:`adventurers-tome.${key}`});
    assert.equal(index.status().queued,false,key);
  }
  w.context.Hooks.callAll('updateSetting',{key:'other-module.panel'});
  assert.equal(index.status().queued,false);
  w.context.Hooks.callAll('updateSetting',{key:'realm-guard.rulesProfile'});
  assert.equal(index.status().queued,true);
  await index.drain();
  w.context.Hooks.callAll('updateJournalEntry',w.session);
  assert.equal(index.status().queued,true);
});

test('adaptive window persists a changed position once; repeated renders do not write settings',async()=>{
  const storage=new Map(),writes=[];
  const context=vm.createContext({Hooks:{once(){},on(){}},window:{innerWidth:1920,innerHeight:1080},document:{documentElement:{}},game:{settings:{get:(_id,key)=>storage.get(key),set:async(_id,key,value)=>{writes.push(value);storage.set(key,value);}}}});
  vm.runInContext(read('adaptive-window.js')+'\nglobalThis.saveWindow=atAwSaveState;',context);
  const app={position:{width:1280,height:800,left:30,top:40}};
  await context.saveWindow(app);
  for(let i=0;i<30;i++)await context.saveWindow(app);
  assert.equal(writes.length,1);
  app.position.left=60;await context.saveWindow(app);assert.equal(writes.length,2);
  assert.deepEqual(JSON.parse(writes[1]),{width:1280,height:800,left:60,top:40,viewportWidth:1920,viewportHeight:1080});
  context.window.innerWidth=1440;await context.saveWindow(app);assert.equal(writes.length,3);
});

test('base window save also skips unchanged position when adaptive fitting is unavailable',async()=>{
  const source=read('adventurers-tome.js'),start=source.indexOf('  _scheduleWindowStateSave() {'),end=source.indexOf('  _syncResponsiveState() {',start);
  let saved='',writes=0,callback;
  const context=vm.createContext({MODULE_ID:'adventurers-tome',clearTimeout(){},setTimeout:fn=>{callback=fn;},game:{settings:{get:()=>saved,set:async(_id,_key,value)=>{saved=value;writes++;}}},console});
  vm.runInContext(`globalThis.app=new(class {${source.slice(start,end)}})();`,context);
  Object.assign(context.app,{rendered:true,position:{width:1280,height:800,left:30,top:40}});
  for(let i=0;i<30;i++){context.app._scheduleWindowStateSave();callback();}
  assert.equal(writes,1);
  context.app.position.top=80;context.app._scheduleWindowStateSave();callback();assert.equal(writes,2);
});
