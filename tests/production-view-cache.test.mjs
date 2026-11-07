import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('Window presentation settings retain cached rows, while permissions, document changes and unknown settings invalidate them',()=>{
 const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8'),hooks=new Map(),context=vm.createContext({Hooks:{on:(name,fn)=>hooks.set(name,fn)}}),begin=source.indexOf('let tomeViewGeneration ='),end=source.indexOf('function tomeViewRows(',begin),registration=source.slice(source.lastIndexOf('for (const event of ['));
 vm.runInContext(source.slice(begin,end)+registration,context);
 for(const scope of ['adventurers-tome','adventurers-tome'])for(const key of ['windowState','windowMode','tomeTransparency','favorites','recentItems'])hooks.get('updateSetting')({key:scope+'.'+key});
 assert.equal(vm.runInContext('tomeViewGeneration',context),0);
 hooks.get('updateUser')({});hooks.get('updateJournalEntry')({});hooks.get('updateSetting')({key:'adventurers-tome.defaultTomeVisibility'});hooks.get('updateSetting')({key:'other-module.private-data'});assert.equal(vm.runInContext('tomeViewGeneration',context),4);
});
