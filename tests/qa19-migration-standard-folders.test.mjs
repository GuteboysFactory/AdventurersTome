import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const Core=ctx.AdventurersTomeMigrationCore;
const folder=(id,name,parent,flags={})=>({sourceUuid:`Folder.${id}`,documentType:'Folder',type:'Folder',name,sourceData:{_id:id,name,type:'JournalEntry',folder:parent,flags:{'adventurers-tome':flags}}});
const folders=[folder('r',"Adventurer's Tome",null),folder('w','World','r',{section:'world'}),folder('n','NPC','w',{standardFolder:'npc'}),folder('c','Custom notes','w'),folder('other','World',null)];
const bootstrap={root:{id:'targetRoot'},world:{id:'targetWorld'},folders:{npc:{id:'targetNpc'}}};
test('Only the standard Tome hierarchy is reused; unrelated World/custom/pack folders remain independent',()=>{
  const rows=[...folders,{...folders[0],packId:'world.custom',sourceUuid:'Compendium.world.custom.Folder.r'}];const aliases=Core.standardFolderAliases(rows,bootstrap);
  assert.deepEqual(JSON.parse(JSON.stringify(aliases)),{'Folder.r':'Folder.targetRoot','Folder.w':'Folder.targetWorld','Folder.n':'Folder.targetNpc'});
});
test('Import reuses standard folders, preserves custom folders/pages and remaps managed projection IDs while sync is paused',async()=>{
  let id=0,paused=false;const writes=[],aliases={};
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['npc'],Item:[]}}),randomId:()=>`new${++id}`,beginImport:()=>{paused=true;},endImport:()=>{paused=false;},reuseStandardFolders:async rows=>{Object.assign(aliases,Core.standardFolderAliases(rows,bootstrap));return {...aliases};},imported:()=>({...aliases,...Object.fromEntries(writes.flatMap(({data})=>Array.from(Core.identityPairs(data.flags['adventurers-tome'].migrationV1))))}),create:async(type,data)=>{assert.equal(paused,true);writes.push({type,data});return {uuid:`${type}.${data._id}`};}});
  const pkg={packageId:'test',manifest:{source:{systemId:'realm-guard',systemVersion:'1'}},references:[],identityMap:[],documents:[...folders.slice(0,4),{sourceUuid:'Actor.a',documentType:'Actor',name:'NPC',sourceData:{_id:'a',type:'npc',system:{}}},{sourceUuid:'JournalEntry.j',documentType:'JournalEntry',name:'NPC details',sourceData:{_id:'j',folder:'n',pages:[{_id:'p',text:{content:'Original edited prose'}}],flags:{'adventurers-tome':{backendProjectionV1:{managed:true,sourceDocumentName:'Actor',sourceId:'a',sourceUuid:'Actor.a',sourceFolderId:'n',sourceRootId:'w'}}}}}]};
  const result=await importer.execute(importer.approveReady(pkg));assert.equal(result.created.length,3);assert.equal(result.alreadyImported.length,3);assert.equal(paused,false);assert.equal(writes.filter(row=>row.type==='Folder').length,1);
  const custom=writes.find(row=>row.type==='Folder');assert.equal(custom.data.folder,'targetWorld');const journal=writes.find(row=>row.type==='JournalEntry');assert.equal(journal.data.folder,'targetNpc');assert.equal(journal.data.pages[0].text.content,'Original edited prose');assert.equal(journal.data.flags['adventurers-tome'].backendProjectionV1.sourceRootId,'targetWorld');assert.equal(journal.data.flags['adventurers-tome'].backendProjectionV1.sourceId,writes.find(row=>row.type==='Actor').data._id);
  assert.equal((await importer.execute(importer.approveReady(pkg))).created.length,0);assert.equal(writes.length,3);
});
test('Import lifecycle is released even when preflight fails',async()=>{
  let paused=false;const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard'}),beginImport:()=>{paused=true;},endImport:()=>{paused=false;}});await assert.rejects(()=>importer.execute({}),/Prepare/);assert.equal(paused,false);
});
test('Backend synchronization API suppresses queued/manual projections during migration and resumes afterward',async()=>{
  let scheduled=0;const api={};const runtime=vm.createContext({game:{user:{isGM:true},modules:new Map([['adventurers-tome',{api}]])},foundry:{utils:{deepClone:structuredClone}},Hooks:{on:()=>{},once:()=>{}},window:{clearTimeout:()=>{},setTimeout:()=>++scheduled},console});
  vm.runInContext(fs.readFileSync(new URL('../scripts/universal-backend-folder-parity.js',import.meta.url),'utf8'),runtime);vm.runInContext('atBfpAttach()',runtime);
  await api.backendFolderParity.pauseForMigration();api.backendFolderParity.schedule();await api.backendFolderParity.sync();assert.equal(scheduled,0);api.backendFolderParity.resumeAfterMigration();assert.equal(scheduled,1);
});
