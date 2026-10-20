import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync(new URL('../scripts/transfer-content.js',import.meta.url),'utf8'),ctx);
const T=ctx.AdventurersTomeTransferContent;
function fixture(){let isGM=true,revision=1;const calls=[],api={previewImport:options=>{calls.push(['preview',options]);return {entries:[{key:'new',name:'New',defaultAction:'create',canUpdate:false},{key:'old',name:'Old',defaultAction:'update',canUpdate:true}],links:[{key:'yes',resolved:true,defaultApply:true},{key:'no',resolved:false}]};},applyImport:async(...args)=>{calls.push(['apply',...args]);return {created:1,updated:1};},getImportHistory:()=>[{id:'h'}],undoLastImport:async()=>({deleted:1}),exportPortable:options=>{calls.push(['export',options]);return {schema:'adventurers-tome.import',sessions:[]};},exportBackup:()=>({schema:'adventurers-tome.backup'})};
 return {transfer:T.create({user:()=>({isGM}),api:()=>api,revision:()=>revision}),calls,setGM:value=>isGM=value,change:()=>revision++};}
test('File routing recognizes Chronicle/archives and preserves old text, Markdown and Tome JSON paths',()=>{
 assert.equal(T.detect('# Session 9\n\nA memory'),'content');assert.equal(T.detect('{"schema":"adventurers-tome.import","version":1}'),'content');assert.equal(T.detect('{"format":"tome-chronicle-transfer"}'),'chronicle');assert.equal(T.detect('{"schema":"adventurers-tome.backup"}'),'archive');assert.throws(()=>T.detect('{bad JSON'),/invalid/);
 const f=fixture();assert.throws(()=>f.transfer.preview('{"format":"tome-chronicle-transfer"}'),/mapped player/);assert.throws(()=>f.transfer.preview('{"schema":"adventurers-tome.backup"}'),/reference/);assert.equal(f.calls.length,0);f.transfer.preview('# Quest Log','quests.md','quest');assert.equal(f.calls[0][1].mode,'quest');
});
test('Existing import engine receives reviewed choices/links; mutated previews and duplicate applies cannot alter transactions',async()=>{
 const f=fixture(),plan=f.transfer.preview('# Session 2');plan.entries[0].name='Forged';const signal={aborted:false};await f.transfer.apply(plan,{new:'create',old:'update'},{yes:'apply',no:'skip'},{signal});const call=f.calls.find(row=>row[0]==='apply');assert.equal(call[1].entries[0].name,'New');assert.equal(call[2].old,'update');assert.equal(call[3].yes,'apply');assert.equal(call[4].signal,signal);await assert.rejects(()=>f.transfer.apply(plan),/Preview/);
});
test('Stale targets, invalid Update and unresolved links are rejected before writes',async()=>{
 const f=fixture(),plan=f.transfer.preview('Text');await assert.rejects(()=>f.transfer.apply(plan,{new:'update'}),/Invalid content/);await assert.rejects(()=>f.transfer.apply(plan,{}, {no:'apply'}),/Invalid link/);f.change();await assert.rejects(()=>f.transfer.apply(plan),/changed after preview/);assert.equal(f.calls.filter(row=>row[0]==='apply').length,0);
});
test('Player-safe, portable, backup and Undo use existing guarded APIs; players cannot call campaign transfer',async()=>{
 const f=fixture();f.transfer.exportContent('portable');f.transfer.exportContent('player-safe');assert.deepEqual(f.calls.filter(row=>row[0]==='export').map(row=>row[1].playerSafe),[false,true]);assert.equal(f.transfer.exportContent('backup').schema,'adventurers-tome.backup');assert.equal((await f.transfer.undo()).deleted,1);assert.equal(f.transfer.history().length,1);
 f.setGM(false);for(const call of [()=>f.transfer.preview('text'),()=>f.transfer.exportContent('backup'),()=>f.transfer.history(),()=>f.transfer.undo()])assert.throws(call,/Only a GM/);await assert.rejects(()=>f.transfer.apply({}),/Only a GM/);
});
test('Native content engine stops between documents and persists actual partial work for Undo',async()=>{
 const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8'),start=source.indexOf('async function applyImportPreview('),end=source.indexOf('async function undoLastImport(',start),settings={},history=[],controller=new AbortController();let folderCalls=0;
 const scope=vm.createContext({DOMException,console:{error:()=>{}},MODULE_ID:'adventurers-tome',PRIVATE_IMPORT_UNDO_SETTING:'undo',game:{user:{isGM:true},journal:{get:()=>null},actors:{get:()=>null},settings:{set:async(_scope,key,value)=>settings[key]=value}},foundry:{utils:{randomID:()=> 'transaction'}},ensureImportFolders:async()=>{folderCalls++;return {sessions:'folder'};},createImportedEntry:async()=>{controller.abort();return {id:'saved'};},addImportHistory:async row=>history.push(row)});
 vm.runInContext(source.slice(start,end),scope);const preview={entries:[{key:'a',name:'A',kind:'session',defaultAction:'create'},{key:'b',name:'B',kind:'session',defaultAction:'create'}],links:[]};
 const result=await scope.applyImportPreview(preview,{}, {},{signal:controller.signal});assert.equal(result.created,1);assert.equal(result.cancelled,true);assert.deepEqual(JSON.parse(settings.undo).createdJournalIds,['saved']);assert.equal(history.length,1);
 await assert.rejects(()=>scope.applyImportPreview(preview,{}, {},{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(folderCalls,1);
});
test('Native parser retains older Tome package versions and Markdown session/quest detection',()=>{
 const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8'),start=source.indexOf('const IMPORT_SCHEMA = '),end=source.indexOf('function getImportHistory(',start);
 const docs={sessions:[{id:'existing',name:'Session 9 — Earlier title'}],quests:[],world:[]};
 const scope=vm.createContext({console,MAX_IMPORT_CHARS:1000000,game:{i18n:{lang:'en'},actors:{contents:[]}},sectionEntries:kind=>docs[kind]||[],worldEntryView:doc=>doc,stripMarkup:text=>String(text).replace(/<[^>]*>/g,''),truncate:(text,n)=>String(text).slice(0,n),displayQuestStatus:value=>value,normalizeWorldCategory:value=>value,WORLD_CATEGORIES:{lore:{label:'Lore',icon:'book'},npc:{label:'NPC',icon:'user'},location:{label:'Location',icon:'map'}}});
 vm.runInContext(source.slice(start,end),scope);
 const session=scope.buildImportPreview({text:'# Session 9 — New title\n\n## Summary\nThe party returned.',sourceName:'session.md'});assert.equal(session.mode,'session');assert.equal(session.entries[0].existingId,'existing');assert.equal(session.entries[0].defaultAction,'update');
 const quest=scope.buildImportPreview({text:'# Quest Log\n\n## Active\n### Find the keeper\nWe follow the trail.',sourceName:'quest.md'});assert.equal(quest.mode,'quest');assert.equal(quest.entries[0].kind,'quest');
 for(const version of [1,2]){const pkg=scope.buildImportPreview({text:JSON.stringify({schema:'adventurers-tome.import',version,session:{number:10,title:'The gate',summary:'Original text'},world:{npcs:[{name:'The keeper',summary:'Keeps the gate'}]}}),sourceName:'tome.json'});assert.equal(pkg.packageVersion,version);assert.ok(pkg.entries.some(row=>row.kind==='session'));assert.ok(pkg.entries.some(row=>row.kind==='world'&&row.name==='The keeper'));}
});
test('Native content import reuses canonical Tome folders; standalone fallback remains available',async()=>{
 const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8'),start=source.indexOf('async function ensureImportFolders('),end=source.indexOf('function importMetaFor(',start),canonical={root:{id:'root'},sessions:{id:'sessions'},quests:{id:'quests'},world:{id:'world'},folders:{npc:{id:'npc'},contact:{id:'contact'}}};let writes=0;
 const game={modules:{get:()=>({api:{folderQuickCreate:{bootstrap:async()=>canonical}}})}},scope=vm.createContext({MODULE_ID:'adventurers-tome',game,createJournalFolder:async name=>{writes++;return {id:name};}});vm.runInContext(source.slice(start,end),scope);
 const result=await scope.ensureImportFolders();assert.equal(writes,0);assert.equal(result.worldCategories.contact.id,'contact');game.modules={get:()=>({api:{}})};assert.equal((await scope.ensureImportFolders()).sessions.id,'Sessions');assert.equal(writes,9);
});
