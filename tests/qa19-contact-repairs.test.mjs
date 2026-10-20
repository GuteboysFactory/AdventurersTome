import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const name of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8'),ctx);
const actor=(id,name,content='')=>({sourceUuid:`Actor.${id}`,documentType:'Actor',name,sourceData:{_id:id,name,type:'player',system:{content},items:[]}});
const key=(role,id)=>JSON.stringify([role,`Actor.${id}`]);
const create=()=>ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',types:{Actor:['character','npc'],Item:['gear','role']}})});
const fixture=()=>({packageId:'repair',manifest:{source:{systemId:'taf',systemVersion:'3.1.0',worldId:'old'}},documents:[actor('pc','PC','<h2>Contacts</h2><p>Friend: @UUID[Actor.shared] Senior Artisan: @UUID[Actor.shared] Mentor: @UUID[Actor.mentor]</p>'),actor('friend','Friend Person'),actor('artisan','Artisan Person'),actor('teacher','Mentor Person')],references:[{sourceUuid:'Actor.pc',targetUuid:'Actor.shared',path:'system.content'},{sourceUuid:'Actor.pc',targetUuid:'Actor.mentor',path:'system.content'}],identityMap:[],assets:[],packs:[]});
const choices=contactTargets=>Object.fromEntries(['pc','friend','artisan','teacher'].map(id=>[`Actor.${id}`,{type:id==='pc'?'character':'npc',tafTransfer:true,...(id==='pc'?{contactTargets}:{})}]));

test('shared stale ID can be corrected differently for each explicit role',()=>{
  const pkg=fixture(),before=JSON.stringify(pkg),targets={[key('Friend','shared')]:'Actor.friend',[key('Senior Artisan','shared')]:'Actor.artisan',[key('Mentor','mentor')]:'Actor.teacher'};
  const plan=create().approveReady(pkg,choices(targets)),pc=plan.rows[0];
  assert.equal(pc.approved,true);assert.equal(pc.data.system.friend,'Friend Person');assert.equal(pc.data.system.seniorArtisan,'Artisan Person');assert.equal(pc.data.system.mentor,'Mentor Person');
  assert.equal(pc.storyPreview.contacts.length,3);assert.equal(pc.contactRepairs.length,3);
  assert.match(pc.data.system.biography,/Friend: @UUID\[Actor.friend\] Senior Artisan: @UUID\[Actor.artisan\] Mentor: @UUID\[Actor.teacher\]/);
  assert.deepEqual(Array.from(plan.references,ref=>ref.targetUuid).sort(),['Actor.artisan','Actor.friend','Actor.teacher']);assert.equal(JSON.stringify(pkg),before);
});

test('partial repair does not silently clear other roles sharing the broken ID',()=>{
  const plan=create().approveReady(fixture(),choices({[key('Friend','shared')]:'Actor.friend',[key('Mentor','mentor')]:'Actor.teacher'}));
  assert.equal(plan.rows[0].approved,false);assert.ok(plan.references.some(ref=>ref.targetUuid==='Actor.shared'));
  assert.ok(plan.rows[0].storyPreview.contacts.some(contact=>contact.name==='Unresolved Senior Artisan'));
});

test('contact repairs reject outside-package, self and compendium targets before any writes',()=>{
  for(const destination of ['Actor.absent','Actor.pc','Compendium.some.Actor.a'])assert.throws(()=>create().prepare(fixture(),choices({[key('Friend','shared')]:destination})),/Choose a different world Actor/);
});

test('non-contact occurrences of a stale UUID remain genuine dependency exceptions',()=>{
  const pkg=fixture();pkg.documents[0].sourceData.system.content+='<p>Another use: @UUID[Actor.shared]</p>';
  const plan=create().approveReady(pkg,choices({[key('Friend','shared')]:'Actor.friend',[key('Senior Artisan','shared')]:'Actor.artisan',[key('Mentor','mentor')]:'Actor.teacher'}));
  assert.equal(plan.rows[0].approved,false);assert.ok(plan.references.some(ref=>ref.targetUuid==='Actor.shared'));
});

test('table contact repairs resolve a single identity without requiring an inline role label',()=>{
  const pkg=fixture();pkg.documents[0].sourceData.system.content='<h2>Contacts</h2><table><tr><th>Person</th><th>Details</th></tr><tr><td>@UUID[Actor.old]{Old name}</td><td>Friend</td></tr></table>';
  pkg.references=[{sourceUuid:'Actor.pc',targetUuid:'Actor.old',path:'system.content'}];
  const plan=create().approveReady(pkg,choices({[key('','old')]:'Actor.friend'}));
  assert.equal(plan.rows[0].approved,true);assert.equal(plan.rows[0].storyPreview.contacts[0].name,'Friend Person');assert.ok(plan.rows[0].data.system.biography.includes('@UUID[Actor.friend]'));
});

test('reviewed choices persist as array records, preserving dotted UUID values for native Foundry writes',async()=>{
  const pkg=fixture(),targets={[key('Friend','shared')]:'Actor.friend',[key('Senior Artisan','shared')]:'Actor.artisan',[key('Mentor','mentor')]:'Actor.teacher'},saved=[];let serial=0;
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',types:{Actor:['character','npc'],Item:['gear']}}),randomId:()=>String(++serial).padStart(16,'0'),create:async(type,data)=>{saved.push(data);return {uuid:`${type}.${data._id}`};}});
  await importer.execute(importer.approveReady(pkg,choices(targets)));
  const actor=saved.find(row=>row.name==='PC'),records=actor.flags['adventurers-tome'].migrationV1.contactTargets;
  assert.ok(Array.isArray(records));assert.equal(records.length,3);assert.deepEqual(Object.fromEntries(records.map(row=>[row.key,row.targetUuid])),targets);
  for(const row of records)assert.ok(Object.keys(row).every(key=>!key.includes('.')));
  assert.equal(actor.flags['adventurers-tome'].migrationV1.sourceData.system.content,pkg.documents[0].sourceData.system.content);
});
