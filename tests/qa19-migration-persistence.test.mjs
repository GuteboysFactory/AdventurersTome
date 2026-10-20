import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const f of ['migration-core','migration-adapters','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${f}.js`,import.meta.url),'utf8'),ctx);
// Emulate Foundry's dotted-key expansion at the persistence boundary, rather than accepting arbitrary mock JSON.
function expand(value){if(Array.isArray(value))return value.map(expand);if(!value||typeof value!=='object')return value;const out={};for(const [key,child] of Object.entries(value)){const parts=key.split('.');let node=out;for(const part of parts.slice(0,-1)){if(part in node&&typeof node[part]!=='object')throw Error(`Cannot use 'in' operator to search for '${parts.at(-1)}' in ${node[part]}`);node=node[part]??={};}node[parts.at(-1)]=expand(child);}return out;}
const pkg={packageId:'fixture',manifest:{source:{systemId:'realm-guard',systemVersion:'1'}},references:[],identityMap:[],documents:[{sourceUuid:'Folder.f',documentType:'Folder',name:'Actors',sourceData:{_id:'f',name:'Actors',type:'Actor'}},{sourceUuid:'Actor.a',documentType:'Actor',name:'First character',sourceData:{_id:'a',name:'First character',type:'character',folder:'f',system:{},items:[{_id:'i',name:'Item',type:'gear',system:{}}]}},{sourceUuid:'JournalEntry.j',documentType:'JournalEntry',name:'Session',sourceData:{_id:'j',pages:[{_id:'p',text:{content:'@UUID[Actor.a]{Character}'}}]}}]};
test('UUID keyed legacy identities reproduce the native persistence collision; new Actor and Journal records expand safely',async()=>{
  assert.throws(()=>expand({identities:{'Actor.a':'Actor.target','Actor.a.Item.i':'Actor.target.Item.item'}}),/Cannot use 'in' operator/);
  let id=0;const copies=[];const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['character'],Item:['gear']}}),randomId:()=>`id${++id}`,create:async(type,data)=>{const saved=expand(data);copies.push(saved);return {uuid:`${type}.${saved._id}`};}});
  const reports=[];const result=await importer.execute(importer.approveReady(pkg),{progress:row=>reports.push({...row,saved:copies.length})});assert.equal(result.created.length,3);for(const saved of copies)assert.ok(Array.isArray(saved.flags['adventurers-tome'].migrationV1.identities));assert.equal(copies[1].items.length,1);assert.equal(copies[2].pages.length,1);
  assert.ok(reports.every(row=>row.total===3&&row.documents===row.saved));assert.equal(reports[0].documents,0);assert.equal(reports.at(-1).documents,3);
});
test('Legacy Folder identity maps are readable both before and after Foundry dotted-key expansion',()=>{
  const legacy={identities:{'Folder.old':'Folder.new'}};assert.deepEqual(JSON.parse(JSON.stringify(ctx.AdventurersTomeMigrationCore.identityPairs(legacy))),[['Folder.old','Folder.new']]);assert.deepEqual(JSON.parse(JSON.stringify(ctx.AdventurersTomeMigrationCore.identityPairs(expand(legacy)))),[['Folder.old','Folder.new']]);
});
test('Failure after Folder creation reports remaining work and retry uses the saved legacy Folder without duplication',async()=>{
  let id=0,fail=true;const copies=[];
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['character'],Item:['gear']}}),randomId:()=>`id${++id}`,imported:()=>Object.fromEntries(copies.flatMap(doc=>Array.from(ctx.AdventurersTomeMigrationCore.identityPairs(doc.flags['adventurers-tome'].migrationV1)))),create:async(type,data)=>{if(type==='Actor'&&fail)throw Error('Server rejected Actor');copies.push(expand(data));return {uuid:`${type}.${data._id}`};}});
  await assert.rejects(()=>importer.execute(importer.approveReady(pkg)),error=>{assert.match(error.message,/Actor “First character”/);assert.equal(error.partialResult.created.length,1);assert.equal(error.partialResult.remaining,2);assert.equal(error.partialResult.failed.sourceUuid,'Actor.a');return true;});
  copies[0].flags['adventurers-tome'].migrationV1.identities=expand({'Folder.f':`Folder.${copies[0]._id}`});fail=false;
  const result=await importer.execute(importer.approveReady(pkg));assert.equal(result.created.length,2);assert.equal(result.alreadyImported.length,1);assert.equal(copies.length,3);assert.equal(copies[1].folder,copies[0]._id);
});
test('Missing saved document response never reports a completed copy',async()=>{
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{}}),randomId:()=> 'id',create:async()=>undefined});
  await assert.rejects(()=>importer.execute(importer.approveReady({...pkg,documents:[pkg.documents[0]]})),error=>{assert.match(error.message,/did not return a saved document/);assert.equal(error.partialResult.created.length,0);assert.equal(error.partialResult.remaining,1);return true;});
});
