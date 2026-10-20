import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const Core=ctx.AdventurersTomeMigrationCore;
const doc=(uuid,raw)=>({uuid,documentName:uuid.includes('.Item.')?'Item':'Actor',toObject:()=>structuredClone(raw)});
test('Export excludes Realm Guard starter libraries without reading them, but keeps active world NPCs and custom packs',async()=>{
  let libraryReads=0,customReads=0;
  const npc={_id:'active',type:'npc',name:'Active NPC',system:{},flags:{'realm-guard':{starterKey:'npc:original'}}};
  const packs=[{collection:'world.realm-guard-starter-npc-templates',documentName:'Actor',metadata:{name:'realm-guard-starter-npc-templates',packageType:'world',system:'realm-guard'},getDocuments:async()=>{libraryReads++;return []; }},{collection:'realm-guard.rules',documentName:'Item',metadata:{packageType:'system'},getDocuments:async()=>{libraryReads++;return [];}},{collection:'world.my-npcs',documentName:'Actor',metadata:{packageType:'world',system:'realm-guard'},getDocuments:async()=>{customReads++;return [doc('Compendium.world.my-npcs.Actor.custom',{...npc,_id:'custom'})];}}];
  const toolkit=Core.createMigrationToolkit({user:()=>({isGM:true}),world:()=>({id:'source'}),system:()=>({id:'realm-guard',version:'1'}),module:()=>({version:'1.9.0-qa.2.4'}),foundryVersion:()=> '13',collection:key=>key==='actors'?[doc('Actor.active',npc)]:[],packs:()=>packs,yield:async()=>{}});
  assert.equal(toolkit.inventory().packs.length,1);assert.equal(toolkit.inventory().excludedPacks.length,2);
  const snapshot=await toolkit.analyze({types:['Actor'],packs:packs.map(pack=>pack.collection)});assert.equal(libraryReads,0);assert.equal(customReads,1);assert.equal(snapshot.documents.length,2);assert.equal(snapshot.manifest.selectedPacks.length,1);assert.equal(snapshot.manifest.excludedEntries.length,2);
  const exported=await toolkit.exportPackage(snapshot);assert.equal(exported.manifest.totalDocuments,2);
});
test('An earlier wrongly migrated starter copy is excluded from re-export, without removing ordinary starter-based campaign NPCs',async()=>{
  const copied={_id:'copy',type:'npc',flags:{'adventurers-tome':{migrationV1:{sourceUuid:'Compendium.world.realm-guard-starter-npc-templates.Actor.x',sourceSystem:{systemId:'realm-guard'}}}}};
  const active={_id:'active',type:'npc',flags:{'realm-guard':{starterKey:'npc:original'}}};
  const toolkit=Core.createMigrationToolkit({user:()=>({isGM:true}),world:()=>({id:'source'}),system:()=>({id:'realm-guard'}),module:()=>({version:'qa'}),foundryVersion:()=> '13',collection:key=>key==='actors'?[doc('Actor.copy',copied),doc('Actor.active',active)]:[],packs:()=>[],yield:async()=>{}});
  assert.equal(toolkit.inventory().types[0].count,1);const snapshot=await toolkit.analyze({types:['Actor']});assert.equal(snapshot.documents.length,1);assert.equal(snapshot.documents[0].sourceUuid,'Actor.active');assert.equal(snapshot.manifest.excludedEntries.length,1);
});
function packageFixture(){return {packageId:'abc123',manifest:{source:{systemId:'realm-guard',systemVersion:'1'}},references:[],identityMap:[],packs:[{id:'world.my-npcs',metadata:{type:'Actor',label:'My NPCs'},folders:[{_id:'same',name:'Template folder',type:'Actor'}]}],documents:[{sourceUuid:'Folder.same',documentType:'Folder',name:'World folder',sourceData:{_id:'same',name:'World folder',type:'Actor'}},{sourceUuid:'Actor.pc',documentType:'Actor',name:'PC',sourceData:{_id:'pc',type:'character',folder:'same',system:{}}},{sourceUuid:'Compendium.world.my-npcs.Actor.npc',documentType:'Actor',name:'My NPC template',packId:'world.my-npcs',sourceData:{_id:'npc',type:'npc',folder:'same',system:{},items:[{_id:'gear',type:'gear',system:{}}]}},{sourceUuid:'JournalEntry.j',documentType:'JournalEntry',name:'Session',sourceData:{_id:'j',pages:[{_id:'page',text:{content:'@UUID[Compendium.world.my-npcs.Actor.npc]{Template}'}}]}}]};}
test('Old ZIP starter libraries are omitted by import while ordinary campaign Actors remain',()=>{
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['character','npc'],Item:['gear']}})}),pkg=packageFixture();
  pkg.packs.push({id:'world.realm-guard-starter-npc-templates',metadata:{type:'Actor'},folders:[]});pkg.documents.push({sourceUuid:'Compendium.world.realm-guard-starter-npc-templates.Actor.template',packId:'world.realm-guard-starter-npc-templates',documentType:'Actor',sourceData:{_id:'template',type:'npc',system:{}}});
  const plan=importer.approveReady(pkg);assert.equal(plan.excludedSystemEntries,1);assert.equal(plan.rows.some(row=>row.sourceUuid.endsWith('Actor.template')),false);assert.equal(plan.rows.find(row=>row.sourceUuid==='Actor.pc').data.type,'character');
});
test('Own compendium templates retain NPC type, pack folders, links and retry identity without entering world Actors',async()=>{
  let id=0;const copies=[],packs=[];const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['character','npc'],Item:['gear']}}),randomId:()=>`new${++id}`,ensurePack:async data=>{packs.push(data);return 'world.migrated';},imported:()=>Object.fromEntries(copies.flatMap(({data})=>Array.from(Core.identityPairs(data.flags['adventurers-tome'].migrationV1)))),create:async(type,data,context)=>{copies.push({type,data,context});return {uuid:context.pack?`Compendium.${context.pack}.${type}.${data._id}`:`${type}.${data._id}`};}});
  const pkg=packageFixture();const result=await importer.execute(importer.approveReady(pkg));assert.equal(result.created.length,5);assert.equal(packs.length,1);assert.equal(copies.filter(row=>row.type==='Actor'&&!row.context.pack).length,1);
  const npc=copies.find(row=>row.type==='Actor'&&row.context.pack),pc=copies.find(row=>row.type==='Actor'&&!row.context.pack);assert.equal(npc.data.type,'npc');assert.equal(pc.data.type,'character');assert.notEqual(npc.data.folder,pc.data.folder);
  const journal=copies.find(row=>row.type==='JournalEntry');assert.match(journal.data.pages[0].text.content,/Compendium.world.migrated.Actor.new/);
  assert.equal((await importer.execute(importer.approveReady(pkg))).created.length,0);assert.equal(copies.length,5);
});
test('If native pack creation is unavailable, templates are never silently copied into the world',async()=>{
  const writes=[];const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',version:'1',types:{Actor:['character','npc'],Item:['gear']}}),randomId:()=> 'new',create:async(...args)=>{writes.push(args);}});
  await assert.rejects(()=>importer.execute(importer.approveReady(packageFixture())),/Compendium import is unavailable/);assert.equal(writes.length,0);
});
