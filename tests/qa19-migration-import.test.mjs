import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
function fixture({remember=false,validateCopy,targetVersion='1'}={}) {
  const raw={_id:'a',name:'Gunther',type:'player',system:{content:'<p>Health 4. Unknown lore.</p>',carryCapacity:20},items:[{_id:'health',type:'attribute',name:'Health',system:{key:'health',value:4,max:6}},{_id:'gear',type:'generic',name:'Lantern',system:{description:'Bright',quantity:2,weight:4,trigger:'Macro.x'}}],ownership:{default:3,oldUser:3},flags:{other:{secret:42}}};
  const doc={uuid:'Actor.a',toObject:()=>structuredClone(raw)};
  const source=ctx.AdventurersTomeMigrationCore.createMigrationToolkit({user:()=>({isGM:true}),world:()=>({id:'source'}),system:()=>({id:'taf',version:'3.2.0'}),module:()=>({version:'1.9.0-qa.2'}),foundryVersion:()=> '13.351',collection:key=>key==='actors'?[doc]:[],packs:()=>[],yield:async()=>{}});
  let gm=true,id=0,world='target';const created=[];
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({validateCopy,user:()=>({isGM:gm}),world:()=>({id:world}),system:()=>({id:'realm-guard',version:targetVersion,types:{Actor:['character','npc'],Item:['gear']}}),randomId:()=>`new${++id}`,hasPackage:key=>created.some(row=>row.flags['adventurers-tome'].migrationV1.packageId===key),imported:remember?key=>Object.fromEntries(created.filter(row=>row.flags['adventurers-tome'].migrationV1.packageId===key).flatMap(row=>Array.from(ctx.AdventurersTomeMigrationCore.identityPairs(row.flags['adventurers-tome'].migrationV1)))):undefined,create:async(type,data)=>{created.push(structuredClone(data));return {uuid:`${type}.${data._id}`};}});
  return {raw,source,importer,created,setGM:value=>gm=value,setWorld:value=>world=value};
}
async function packageFor(f) {const snapshot=await f.source.analyze({types:['Actor']});const result=await f.source.exportPackage(snapshot);return f.importer.readPackage(new Uint8Array(await result.blob.arrayBuffer()));}
function realmActor(id,type='npc') {return {sourceUuid:`Actor.${id}`,name:id,documentType:'Actor',sourceData:{_id:id,name:id,type,system:{attributes:{health:{value:4,max:6}}},items:[{_id:'bag',name:'Bag',type:'gear',system:{inventory:{containerId:null}}},{_id:'torch',name:'Torch',type:'gear',system:{inventory:{containerId:'bag'}}}],flags:{'realm-guard':{role:type},other:{secret:42}}}};}
test('Realm Guard version differences do not block 800 valid Characters and NPCs',async()=>{
  let validations=0;const f=fixture({targetVersion:'qa.29',validateCopy:(type,data)=>{validations++;data.system.validationMutation=true;return true;}}),pkg=await packageFor(f);
  pkg.manifest.source.systemId='realm-guard';pkg.manifest.source.systemVersion='qa.28';pkg.references=[];
  pkg.documents=Array.from({length:800},(_,i)=>realmActor(`actor${i}`,i%2?'character':'npc'));const before=JSON.stringify(pkg.documents);
  const plan=f.importer.approveReady(pkg);assert.equal(plan.rows.filter(row=>row.approved).length,800);assert.match(plan.warnings.join(' '),/Version differences alone/);
  const result=await f.importer.execute(plan);assert.equal(result.created.length,800);assert.ok(validations>=800);assert.equal(JSON.stringify(pkg.documents),before);
  for(const [i,actor] of f.created.entries()){assert.equal(actor.type,i%2?'character':'npc');assert.equal(actor.system.attributes.health.value,4);assert.equal(actor.system.validationMutation,undefined);assert.equal(actor.items[1].system.inventory.containerId,actor.items[0]._id);}
});
test('Only incompatible same-system data requires a decision',async()=>{
  const f=fixture({validateCopy:(type,data)=>{if(data.system.attributes.health.value<0)throw Error('Health cannot be negative');return true;}}),pkg=await packageFor(f);
  pkg.manifest.source.systemId='realm-guard';pkg.documents=[realmActor('good'),realmActor('bad')];pkg.references=[];pkg.documents[1].sourceData.system.attributes.health.value=-1;
  const plan=f.importer.approveReady(pkg);assert.equal(plan.rows[0].approved,true);assert.equal(plan.rows[1].status,'needs-review');assert.equal(plan.rows[1].included,false);assert.match(plan.rows[1].notes.join(' '),/Health cannot be negative/);
  assert.equal((await f.importer.execute(plan)).created.length,1);
});
test('Old package provenance is ignored while real missing links remain exceptions',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.manifest.source.systemId='realm-guard';pkg.documents=[realmActor('a'),{sourceUuid:'JournalEntry.contact',name:'Contact',documentType:'JournalEntry',sourceData:{_id:'contact',flags:{'adventurers-tome':{worldProfile:{category:'contact',actorId:'absent'}}}}}];
  pkg.references=['_stats.compendiumSource','flags.core.sourceId','flags.adventurers-tome.migrationV1.sourceData.system.biography'].map(path=>({sourceUuid:'Actor.a',targetUuid:'Actor.old',path}));
  const plan=f.importer.approveReady(pkg);assert.equal(plan.rows[0].approved,true);assert.equal(plan.rows[1].status,'needs-review');assert.ok(!plan.references.some(ref=>ref.targetUuid==='Actor.old'));
});
test('Same-system flags, bags and token delta patches survive with remapped base Item IDs',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.manifest.source.systemId='realm-guard';pkg.references=[];pkg.documents=[realmActor('a'),{sourceUuid:'Scene.s',name:'Scene',documentType:'Scene',sourceData:{_id:'s',tokens:[{_id:'t',actorId:'a',delta:{system:{attributes:{health:{value:2}}},items:[{_id:'torch',system:{inventory:{containerId:'bag'}}}]}}]}}];
  await f.importer.execute(f.importer.approveReady(pkg));const [actor,scene]=f.created;assert.equal(actor.flags['realm-guard'].role,'npc');assert.equal(actor.flags.other,undefined);assert.equal(actor.flags['adventurers-tome'].migrationV1.sourceData.flags.other.secret,42);
  assert.equal(scene.tokens[0].actorId,actor._id);assert.equal(scene.tokens[0].delta.system.attributes.health.value,2);assert.equal(scene.tokens[0].delta.items[0]._id,actor.items[1]._id);assert.equal(scene.tokens[0].delta.items[0].system.inventory.containerId,actor.items[0]._id);
});
test('Tome ZIP integrity checked before target preparation',async()=>{
  const f=fixture(),pkg=await packageFor(f);assert.equal(pkg.documents[0].sourceData.system.carryCapacity,20);
  const exported=await f.source.exportPackage(await f.source.analyze({types:['Actor']})),bytes=new Uint8Array(await exported.blob.arrayBuffer());
  const text=new TextDecoder().decode(bytes),position=text.indexOf('Bright');bytes[position]='X'.charCodeAt(0);
  await assert.rejects(()=>f.importer.readPackage(bytes),/checksum/);
  assert.equal(f.created.length,0);
});
test('Explicit Actor type and field mappings; original source remains intact',async()=>{
  const f=fixture(),before=JSON.stringify(f.raw),pkg=await packageFor(f);
  assert.equal(f.importer.prepare(pkg).rows[0].status,'unmapped');
  const plan=f.importer.prepare(pkg,{'Actor.a':{type:'npc',attributes:{health:'health'},approved:true}});
  assert.equal(plan.rows[0].suggestions[0].target,'health');assert.equal(plan.rows[0].data.system.attributes.health.value,4);
  const result=await f.importer.execute(plan);assert.equal(result.created.length,1);assert.equal(f.created[0].ownership.default,0);assert.deepEqual(Object.keys(f.created[0].ownership),['default']);
  assert.equal(f.created[0].items[0].type,'gear');assert.equal(f.created[0].items[0].system.quantity,2);assert.equal(f.created[0].items[0].system.trigger,undefined);
  assert.equal(f.created[0].flags.other,undefined);assert.equal(f.created[0].flags['adventurers-tome'].migrationV1.sourceData.flags.other.secret,42);
  assert.equal(JSON.stringify(f.raw),before);assert.ok(result.identityMap.find(row=>row.sourceUuid==='Actor.a.Item.gear').targetUuid);
  assert.equal(result.identityMap.find(row=>row.sourceUuid==='Actor.a.Item.health').targetUuid,null);
  await assert.rejects(()=>f.importer.execute(plan),/already/);
});
test('Field reuse never invents the Actor category of an unclassified source',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents.push(structuredClone(pkg.documents[0]));pkg.documents[1].sourceUuid='Actor.b';pkg.documents[1].sourceData.items[0]._id='different';
  const choices=f.importer.reuseMappings(pkg,{'Actor.a':{type:'npc',attributes:{health:'health'},approved:true}});
  assert.equal(choices['Actor.b'].type,undefined);assert.equal(choices['Actor.b'].attributes.different,'health');assert.notEqual(choices['Actor.b'].approved,true);
  const plan=f.importer.prepare(pkg,choices);assert.equal(plan.rows[1].status,'unmapped');const result=await f.importer.execute(plan);assert.ok(result.skipped.includes('Actor.b'));assert.equal(f.created.length,1);
});
test('GM permission, target world and per-row approval enforced before creation',async()=>{
  const f=fixture(),pkg=await packageFor(f),choices={'Actor.a':{type:'npc'}};
  await assert.rejects(()=>f.importer.execute(f.importer.prepare(pkg,choices)),/Approve/);
  choices['Actor.a'].approved=true;const plan=f.importer.prepare(pkg,choices);f.setWorld('different');await assert.rejects(()=>f.importer.execute(plan),/again/);
  f.setGM(false);assert.throws(()=>f.importer.prepare(pkg,choices),/GM/);assert.equal(f.created.length,0);
});
test('Unsupported system/version preserved without unsafe conversion',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.manifest.source.systemVersion='3.0.0';
  const plan=f.importer.prepare(pkg,{'Actor.a':{type:'npc',approved:true}});assert.equal(plan.rows[0].status,'unsupported');assert.equal(plan.rows[0].included,false);assert.equal(pkg.documents[0].sourceData.system.carryCapacity,20);
});
test('Same-system generic copies rewrite forward and embedded UUID links with new IDs',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents=[{sourceUuid:'JournalEntry.j',name:'History',documentType:'JournalEntry',sourceData:{_id:'j',pages:[{_id:'p',text:{content:'@UUID[JournalEntry.k.JournalEntryPage.q]{Next}'}}],ownership:{default:3},flags:{'adventurers-tome':{kind:'session'}}}},{sourceUuid:'JournalEntry.k',name:'Next',documentType:'JournalEntry',sourceData:{_id:'k',pages:[{_id:'q',text:{content:'Text'}}]}}];
  const plan=f.importer.prepare(pkg,{'JournalEntry.j':{approved:true},'JournalEntry.k':{approved:true}});await f.importer.execute(plan);
  assert.match(f.created[0].pages[0].text.content,/JournalEntry.new3.JournalEntryPage.new4/);assert.equal(f.created[0].flags['adventurers-tome'].kind,'session');assert.equal(f.created[0].pages[0].ownership.default,0);
});
test('Cancellation before import creates nothing; invalid mechanical values require review',async()=>{
  const f=fixture(),pkg=await packageFor(f),controller=new AbortController();controller.abort();
  await assert.rejects(()=>f.importer.execute(f.importer.prepare(pkg,{'Actor.a':{type:'npc',approved:true}}),{signal:controller.signal}),/cancelled/);
  pkg.documents[0].sourceData.items[0].system.value=-1;const invalid=f.importer.prepare(pkg,{'Actor.a':{type:'npc',attributes:{health:'health'}}});assert.equal(invalid.rows[0].status,'needs-review');assert.match(invalid.rows[0].notes.join(' '),/Invalid attribute/);assert.equal(invalid.rows[0].suggestions[0].id,'health');assert.equal(f.created.length,0);
  const recovered=f.importer.prepare(pkg,{'Actor.a':{type:'npc',attributes:{health:''}}});assert.equal(recovered.rows[0].status,'mapped');assert.equal(recovered.rows[0].sourceData.items[0].system.value,-1);
});
test('800 ready documents move under one approval; unsupported exceptions are skipped',async()=>{
  const f=fixture(),pkg=await packageFor(f);
  pkg.documents=Array.from({length:800},(_,i)=>({sourceUuid:`JournalEntry.j${i}`,name:`Place ${i}`,documentType:'JournalEntry',sourceData:{_id:`j${i}`,name:`Place ${i}`,ownership:{default:3},flags:{'adventurers-tome':{type:'world',worldProfile:{category:i%2?'contact':'location'}}},pages:[]}}));
  pkg.documents.push({sourceUuid:'Actor.unknown',name:'Unknown',documentType:'Actor',sourceData:{_id:'unknown',type:'alien',system:{secret:42}}});
  const plan=f.importer.approveReady(pkg);assert.equal(plan.rows.filter(row=>row.approved).length,800);assert.notEqual(plan.rows.at(-1).approved,true);
  const result=await f.importer.execute(plan);assert.equal(result.created.length,800);assert.deepEqual(Array.from(result.skipped),['Actor.unknown']);assert.equal(f.created[0].flags['adventurers-tome'].worldProfile.category,'location');assert.equal(f.created[1].flags['adventurers-tome'].worldProfile.category,'contact');
});
test('Known Character/NPC categories are preserved; field templates never change either role',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents[0].sourceData.flags={'adventurers-tome':{worldProfile:{category:'character'}}};pkg.documents[0].review=[];
  pkg.documents.push(structuredClone(pkg.documents[0]));pkg.documents[1].sourceUuid='Actor.b';pkg.documents[1].sourceData.flags['adventurers-tome'].worldProfile.category='npc';pkg.documents[1].sourceData.items[0]._id='otherHealth';pkg.documents[1].sourceData.items[0].system.value=2;
  const initial=f.importer.prepare(pkg);assert.equal(initial.rows[0].data.type,'character');assert.equal(initial.rows[1].data.type,'npc');
  const choices=f.importer.reuseMappings(pkg,{'Actor.a':{type:'character',approved:true,attributes:{health:'health'}}});
  assert.equal(choices['Actor.b'].type,'npc');assert.equal(choices['Actor.b'].approved,true);const plan=f.importer.prepare(pkg,choices);assert.equal(plan.rows[1].data.system.attributes.health.value,2);
  assert.throws(()=>f.importer.prepare(pkg,{'Actor.a':{type:'npc'}}),/Keep the source category/);
});
test('Bulk category choice touches only unknown Actors and preserves previously chosen roles',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents.push(structuredClone(pkg.documents[0]),structuredClone(pkg.documents[0]));pkg.documents[1].sourceUuid='Actor.b';pkg.documents[2].sourceUuid='Actor.c';pkg.documents[2].sourceData.flags={'adventurers-tome':{worldProfile:{category:'character'}}};
  const choices=f.importer.classifyUnknown(pkg,{'Actor.a':{type:'character'}},'npc');assert.equal(choices['Actor.a'].type,'character');assert.equal(choices['Actor.b'].type,'npc');assert.equal(choices['Actor.c'],undefined);
});
test('Actor-backed Contact remaps actorId and UUID links; category and original relation data survive',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents.push({sourceUuid:'JournalEntry.contact',name:'Gunther contact',documentType:'JournalEntry',sourceData:{_id:'contact',name:'Gunther contact',pages:[],flags:{'adventurers-tome':{type:'world',worldProfile:{category:'contact',actorId:'a',sourceUuid:'Actor.a',relations:[{targetUuid:'Actor.a',kind:'knows',certainty:'rumour'}]}}}}});
  const result=await f.importer.execute(f.importer.prepare(pkg,{'Actor.a':{type:'npc',approved:true},'JournalEntry.contact':{approved:true}}));
  const actor=f.created[0],contact=f.created[1],profile=contact.flags['adventurers-tome'].worldProfile;assert.equal(profile.category,'contact');assert.equal(profile.actorId,actor._id);assert.equal(profile.sourceUuid,result.created[0].targetUuid);assert.equal(profile.relations[0].targetUuid,result.created[0].targetUuid);assert.equal(profile.relations[0].certainty,'rumour');
  assert.equal(contact.flags['adventurers-tome'].migrationV1.sourceData.flags['adventurers-tome'].worldProfile.actorId,'a');
});
test('A missing Contact Actor becomes an exception, not a guessed match',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents=[{sourceUuid:'JournalEntry.contact',name:'Contact',documentType:'JournalEntry',sourceData:{_id:'contact',flags:{'adventurers-tome':{worldProfile:{category:'contact',actorId:'missing'}}}}}];
  const plan=f.importer.approveReady(pkg);assert.equal(plan.rows[0].status,'needs-review');assert.equal(plan.rows[0].included,false);
});
test('Ready copy dependencies do not promote an unapproved Actor into an automatic import',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents.push({sourceUuid:'JournalEntry.contact',name:'Contact',documentType:'JournalEntry',sourceData:{_id:'contact',flags:{'adventurers-tome':{worldProfile:{category:'contact',actorId:'a'}}}}});
  const plan=f.importer.approveReady(pkg,{'Actor.a':{type:'npc'}});assert.equal(plan.rows.filter(row=>row.included).length,0);
});
test('Resolve exceptions after moving ready copies without reimporting existing documents',async()=>{
  const f=fixture({remember:true}),pkg=await packageFor(f);pkg.documents.push({sourceUuid:'JournalEntry.history',name:'History',documentType:'JournalEntry',sourceData:{_id:'history',pages:[]}}, {sourceUuid:'JournalEntry.contact',name:'Contact',documentType:'JournalEntry',sourceData:{_id:'contact',flags:{'adventurers-tome':{worldProfile:{category:'contact',actorId:'a',sourceUuid:'Actor.a'}}},pages:[{_id:'page',text:{content:'@UUID[JournalEntry.history]{History}'}}]}});
  const first=await f.importer.execute(f.importer.approveReady(pkg));assert.equal(first.created.length,1);assert.equal(first.created[0].sourceUuid,'JournalEntry.history');
  const second=await f.importer.execute(f.importer.approveReady(pkg,{'Actor.a':{type:'npc',approved:true}}));assert.equal(second.created.length,2);assert.deepEqual(Array.from(second.alreadyImported),['JournalEntry.history']);assert.equal(f.created.length,3);assert.equal(f.created[2].flags['adventurers-tome'].worldProfile.actorId,f.created[1]._id);assert.match(f.created[2].pages[0].text.content,new RegExp(first.created[0].targetUuid));
});
test('Approved target plan is a private snapshot; caller edits cannot bypass review',async()=>{
  const f=fixture(),pkg=await packageFor(f),plan=f.importer.prepare(pkg,{'Actor.a':{type:'npc'}});
  plan.rows[0].approved=true;plan.rows[0].data.name='Mutated';await assert.rejects(()=>f.importer.execute(plan),/Approve/);assert.equal(f.created.length,0);
});
test('Folder cycles are rejected before writing; parent folders precede children',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents=[{sourceUuid:'Folder.child',name:'Child',documentType:'Folder',sourceData:{_id:'child',type:'JournalEntry',folder:'parent'}},{sourceUuid:'Folder.parent',name:'Parent',documentType:'Folder',sourceData:{_id:'parent',type:'JournalEntry',folder:null}}];
  const choices={'Folder.child':{approved:true},'Folder.parent':{approved:true}};await f.importer.execute(f.importer.prepare(pkg,choices));assert.equal(f.created[0].folder,null);assert.equal(f.created[1].folder,f.created[0]._id);
  const other=fixture();pkg.documents[1].sourceData.folder='child';await assert.rejects(()=>other.importer.execute(other.importer.prepare(pkg,choices)),/cycle/);assert.equal(other.created.length,0);
});
test('Chronicle payloads cannot be introduced through a forged nested source',async()=>{
  const f=fixture(),pkg=await packageFor(f);pkg.documents[0].sourceData.items[0].flags={'adventurers-tome':{chronicleEntries:{secret:'hidden'}}};
  assert.throws(()=>f.importer.prepare(pkg),/owner-aware/);assert.equal(f.created.length,0);
});
