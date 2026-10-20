import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const name of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-relationships','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8'),ctx);
const parse=html=>ctx.AdventurersTomeTafBiography.parse(html);
const target={id:'realm-guard',types:{Actor:['character','npc'],Item:['gear','role','trait','wise','talent']}};
const actor=(id,name,content)=>({sourceUuid:`Actor.${id}`,name,documentType:'Actor',sourceData:{_id:id,name,type:'player',system:{content},items:[]}});
const pkg=documents=>({packageId:'inline',manifest:{source:{systemId:'taf',systemVersion:'3.1.0',worldId:'old'}},documents,identityMap:[],references:[],packs:[],assets:[]});
const importer=()=>ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'new'}),system:()=>target});

test('multiline talent effects, annotated Wises and explicitly rated lv1 traits reach their lists',()=>{
  const result=parse('<h2>Talents</h2><p>Improvisational:<br>A bit of wire.<br>No test is required.</p><h2>Wises</h2><p>Horse-wise (kan användas som hjälp</p><h2>Traits</h2><p>Bodyguard, lv1 (+1D per session)</p>');
  assert.equal(result.items.find(item=>item.type==='talent').name,'Improvisational');
  assert.match(result.items.find(item=>item.type==='talent').system.description,/A bit of wire\.\nNo test is required\./);
  assert.equal(result.items.find(item=>item.type==='talent').system.effectMode,'manual');
  assert.equal(result.items.find(item=>item.type==='talent').system.diceBonus,0);
  assert.equal(result.items.find(item=>item.type==='wise').name,'Horse-wise');
  assert.equal(result.items.find(item=>item.type==='trait').name,'Bodyguard');
  assert.equal(result.items.find(item=>item.type==='trait').system.rating,1);
  assert.equal(parse('<h2>Talents</h2><p>Första skaffas på level 2</p>').items.length,0);
});

test('one-line Contacts separates linked roles and never makes the remaining line a mentor name',()=>{
  const result=parse('<h2>Contacts</h2><p>Mentor: @UUID[Actor.mentor] Mother: @UUID[Actor.mother] Enemy: @UUID[Actor.enemy]</p>');
  assert.equal(result.contacts.length,3);assert.equal(result.fields.mentor,undefined);
  assert.deepEqual(Array.from(result.contacts,contact=>[contact.sourceUuid,contact.role,contact.parentRole]),[['Actor.mentor','Mentor',''],['Actor.mother','Mother','mother'],['Actor.enemy','Enemy','']]);
});

test('TAF preparation resolves exact Actor identities, merges multi-role contacts and preserves source package',()=>{
  const data=pkg([actor('pc','PC','<h2>Contacts</h2><p>Friend: @UUID[Actor.friend] Senior Artisan: @UUID[Actor.friend] Mentor: @UUID[Actor.mentor]</p>'),actor('friend','Dael, Smed',''),actor('mentor','Gilhad, Alv','')]);
  const before=JSON.stringify(data),plan=importer().prepare(data,{'Actor.pc':{type:'character',tafTransfer:true},'Actor.friend':{type:'npc',tafTransfer:true},'Actor.mentor':{type:'npc',tafTransfer:true}}),pc=plan.rows[0];
  assert.equal(pc.data.system.friend,'Dael, Smed');assert.equal(pc.data.system.seniorArtisan,'Dael, Smed');assert.equal(pc.data.system.mentor,'Gilhad, Alv');
  assert.equal(pc.storyPreview.contacts.length,2);assert.match(pc.storyPreview.contacts[0].details,/Friend\nSenior Artisan/);assert.equal(pc.storyPreview.contacts[0].sourceUuid,'Actor.friend');
  assert.equal(JSON.stringify(data),before);
});

test('missing source identities keep separate unresolved cards without borrowing similar NPCs',()=>{
  const data=pkg([actor('pc','PC','<h2>Contacts</h2><p>Mentor: @UUID[Actor.deleted] Enemy: @UUID[Actor.gone]</p>'),actor('somebody','Mentor','')]);
  const row=importer().prepare(data,{'Actor.pc':{type:'character',tafTransfer:true}}).rows[0];
  assert.equal(row.data.system.mentor,undefined);assert.equal(row.storyPreview.contacts.length,2);
  assert.equal(row.storyPreview.contacts[0].name,'Unresolved Mentor');assert.match(row.storyPreview.contacts[0].details,/Actor.deleted/);
  assert.equal(row.storyPreview.contacts[1].name,'Unresolved Enemy');
});

test('split contacts restore to distinct people with exact target links and mother identity',async()=>{
  const data=pkg([actor('pc','PC','<h2>Contacts</h2><p>Mentor: @UUID[Actor.mentor] Mother: @UUID[Actor.mother] Enemy: @UUID[Actor.enemy]</p>'),actor('mentor','Hali, Healer',''),actor('mother','Lobelia',''),actor('enemy','Ori','')]);
  const rows=importer().prepare(data,{'Actor.pc':{type:'character',tafTransfer:true}}).rows,people=[],flags={},identities=Object.fromEntries(data.documents.map(row=>[row.sourceUuid,row.sourceUuid.replace('Actor.','Actor.new')]));
  const owner={flags:{'adventurers-tome':{migrationV1:{packageId:'inline'}}},getFlag:(_scope,key)=>flags[key],setFlag:async(_scope,key,value)=>{flags[key]=value;}};
  const api={migrateActor:async()=>{},social:{people:()=>people,createContact:async(_actor,data)=>{const person={id:String(people.length),...data};people.push(person);return {person};},updatePerson:async()=>{},linkActor:async(_actor,id,uuid)=>{people.find(person=>person.id===id).actorUuid=uuid;}}};
  const env={user:()=>({isGM:true,id:'gm'}),systemId:()=> 'realm-guard',actor:async()=>owner,api:()=>api};
  const options={rows,identities,source:{systemId:'taf'},packageId:'inline'};
  const result=await ctx.AdventurersTomeMigrationRelationships.restore(env,options);
  assert.equal(result.linked,3);assert.deepEqual(people.map(person=>[person.name,person.actorUuid]),[['Hali, Healer','Actor.newmentor'],['Lobelia','Actor.newmother'],['Ori','Actor.newenemy']]);
  assert.equal(flags.recruitmentMother,'Lobelia');await ctx.AdventurersTomeMigrationRelationships.restore(env,options);assert.equal(people.length,3);
});

test('target legacy cards for two roles can share only their explicit source Actor identity',async()=>{
  const people=[{id:'friend',name:'Dael'},{id:'artisan',name:'Dael'}],owner={flags:{'adventurers-tome':{migrationV1:{packageId:'multi'}}},getFlag:()=>null};
  const api={migrateActor:async()=>{},social:{people:()=>people,createContact:async()=>{throw Error('No duplicate person');},updatePerson:async(_actor,id,data)=>Object.assign(people.find(person=>person.id===id),data),linkActor:async(_actor,id,uuid)=>{people.find(person=>person.id===id).actorUuid=uuid;}}};
  const env={user:()=>({isGM:true}),systemId:()=> 'realm-guard',actor:async()=>owner,api:()=>api};
  const options={packageId:'multi',source:{systemId:'taf'},identities:{'Actor.pc':'Actor.newPC','Actor.dael':'Actor.newDael'},rows:[{type:'Actor',sourceUuid:'Actor.pc',name:'PC',data:{type:'character'},storyPreview:{contacts:[{name:'Dael',sourceUuid:'Actor.dael',details:'Friend\nSenior Artisan'}]}}]};
  const result=await ctx.AdventurersTomeMigrationRelationships.restore(env,options);assert.equal(result.linked,2);assert.ok(people.every(person=>person.actorUuid==='Actor.newDael'));
  for(const person of people)delete person.actorUuid;delete options.rows[0].storyPreview.contacts[0].sourceUuid;
  const ambiguous=await ctx.AdventurersTomeMigrationRelationships.restore(env,options);assert.equal(ambiguous.linked,0);assert.ok(people.every(person=>!person.actorUuid));
});
