import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-relationships','migration-portraits','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
function map(raw){return ctx.AdventurersTomeMigrationAdapters.map({documentType:'Actor',name:raw.name,sourceData:raw},{systemId:'taf',systemVersion:'3.1.0'},{id:'realm-guard',types:{Item:['gear','wise','trait','talent']}},{type:'character',tafTransfer:true});}
test('header values, current resources, lifetime spends and Conditions do not become inventory',()=>{
  const item=(name,quantity,group)=>({name,type:'generic',system:{quantity,group}});
  const raw={name:'Ada',type:'player',system:{content:'<h2>Rank/Station</h2><p>Veteran</p><h2>Homeland</h2><p>Rhudaur</p><p>Age: 42</p><p>Concept: Ranger</p>',attr:{Age:42,Concept:'Ranger'}},items:[item('Fate',1,'Hero Points'),item('Persona',1,'Hero Points'),item('Checks',0,'Hero Points'),item('Spent Fate',5,'XP'),item('Spent Persona',3,'XP'),item('Angry',1,'Conditions'),item('Injured',1,'Conditions'),item('Porridge',2,'Food')]};
  const before=JSON.stringify(raw),result=map(raw),s=result.data.system;
  assert.equal(s.rank,'veteran');assert.equal(s.homeland,'Rhudaur');
  assert.equal(s.age,'42');assert.equal(s.concept,'Ranger');
  assert.equal(s.resources.fate.value,1);assert.equal(s.resources.persona.value,1);assert.equal(s.resources.checks.value,0);
  assert.equal(s.progression.spentFate,5);assert.equal(s.progression.spentPersona,3);
  assert.deepEqual(Array.from(result.data.items,item=>item.name),['Porridge']);assert.equal(JSON.stringify(raw),before);
});
test('ambiguous counter values remain reference text and never turn into fake gear or guessed totals',()=>{
  const raw={type:'player',system:{content:''},items:[{name:'Fate',type:'generic',system:{quantity:1,group:'Hero Points'}},{name:'Fate',type:'attribute',system:{value:3,group:'Hero Points'}}]};
  const result=map(raw);assert.equal(result.data.system.resources,undefined);assert.equal(result.data.items.length,0);assert.match(result.notes.join(' '),/Conflicting or invalid fate/);assert.match(result.data.system.notes,/fate: 1, 3/);
});
test('contact restore reuses sheet cards, links only unique imported Actors and retries without duplication',async()=>{
  const people=[],actors=new Map();let serial=0,levelCalls=0;
  const owner={uuid:'Actor.newPC',flags:{'adventurers-tome':{migrationV1:{packageId:'p'}}},getFlag:()=>null,setFlag:async()=>{}};actors.set(owner.uuid,owner);
  const api={migrateActor:async()=>{},social:{people:()=>people,createContact:async(_actor,data)=>{const person={id:String(++serial),...data};people.push(person);return {person};},updatePerson:async(_actor,id,data)=>Object.assign(people.find(p=>p.id===id),data),linkActor:async(_actor,id,uuid)=>{people.find(p=>p.id===id).actorUuid=uuid;}}};
  const env={user:()=>({id:'gm',isGM:true}),systemId:()=> 'realm-guard',api:()=>api,actor:async uuid=>actors.get(uuid),progression:async(_actor,fate,persona)=>{levelCalls++;assert.equal(fate,5);assert.equal(persona,3);return {ok:true,level:2};}};
  const options={source:{systemId:'taf'},packageId:'p',identities:{'Actor.pc':'Actor.newPC','Actor.npc':'Actor.newNPC','Actor.a':'Actor.newA','Actor.b':'Actor.newB'},rows:[{sourceUuid:'Actor.pc',name:'Ada',type:'Actor',data:{type:'character',system:{progression:{spentFate:5,spentPersona:3}}},storyPreview:{contacts:[{name:'Baran',details:'Friend'},{name:'Duplicate',details:'Contact'}]}},{sourceUuid:'Actor.npc',type:'Actor',name:'Baran'},{sourceUuid:'Actor.a',type:'Actor',name:'Duplicate'},{sourceUuid:'Actor.b',type:'Actor',name:'Duplicate'}]};
  const run=()=>ctx.AdventurersTomeMigrationRelationships.restore(env,options);const result=await run();assert.equal(result.contacts,2);assert.equal(result.linked,1);assert.equal(result.unlinked,1);assert.equal(people[0].actorUuid,'Actor.newNPC');assert.equal(people[1].actorUuid,undefined);
  await run();assert.equal(people.length,2);assert.equal(serial,2);assert.equal(levelCalls,2);
  owner.flags['adventurers-tome'].migrationV1.packageId='other';await assert.rejects(run(),/only change this package/);
});
test('missing portraits borrow system art without importing templates or overwriting available originals',async()=>{
  const probes=[],rows=[{type:'Actor',sourceUuid:'Actor.pc',data:{type:'character',img:'gone.webp',prototypeToken:{texture:{src:'gone.webp'}},flags:{'adventurers-tome':{profile:{heroImage:'gone.webp'}}}}},{type:'Actor',sourceUuid:'Actor.npc',data:{type:'npc',img:'present.webp'}},{type:'Actor',data:{type:'npc',img:'included.webp'}},{type:'Actor',data:{type:'npc',img:'remote.webp'}},{type:'Scene',data:{tokens:[{actorId:'pc',texture:{src:'gone.webp'}}]}}];
  const env={systemId:()=> 'realm-guard',user:()=>({isGM:true}),available:async path=>{probes.push(path);return path==='gone.webp'?false:path==='remote.webp'?null:true;}};
  const result=await ctx.AdventurersTomeMigrationPortraits.restore(env,{rows,paths:{'included.webp':'worlds/new/restored.webp'}});
  assert.equal(rows[0].data.img,'systems/realm-guard/assets/actors/northern-ranger.webp');assert.equal(rows[0].data.prototypeToken.texture.src,rows[0].data.img);assert.equal(rows[0].data.flags['adventurers-tome'].profile.heroImage,rows[0].data.img);assert.equal(rows[4].data.tokens[0].texture.src,rows[0].data.img);
  assert.equal(rows[1].data.img,'present.webp');assert.equal(rows[2].data.img,'included.webp');assert.equal(rows[3].data.img,'remote.webp');assert.equal(probes.filter(path=>path==='gone.webp').length,1);assert.ok(!probes.includes('included.webp'));assert.equal(result.replaced,4);
});
test('failed sheet restoration leaves saved copies GM-only and retry resumes without duplicate Actors',async()=>{
  const saved={},writes=[];let fail=true;
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'new'}),system:()=>({id:'realm-guard',types:{Actor:['character']}}),imported:()=>({...saved}),randomId:()=> 'newPC',create:async(type,data)=>{writes.push(data);saved['Actor.pc']='Actor.newPC';return {uuid:'Actor.newPC'};},restoreRelationships:async()=>{if(fail)throw Error('Contact service temporarily unavailable');return {contacts:1};}});
  const pkg={packageId:'p',manifest:{source:{worldId:'old',systemId:'realm-guard'}},documents:[{name:'PC',documentType:'Actor',sourceUuid:'Actor.pc',sourceData:{_id:'pc',name:'PC',type:'character',system:{},items:[],ownership:{default:3}}}],identityMap:[],references:[],assets:[],packs:[]};
  await assert.rejects(importer.execute(importer.approveReady(pkg)),error=>{assert.equal(error.partialResult.relationshipsPending,true);assert.equal(error.partialResult.created.length,1);return true;});
  assert.equal(writes[0].ownership.default,0);fail=false;const result=await importer.execute(importer.approveReady(pkg));assert.equal(result.created.length,0);assert.equal(result.relationships.contacts,1);assert.equal(writes.length,1);
});
