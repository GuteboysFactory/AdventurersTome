import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const target={id:'realm-guard',types:{Actor:['character','npc'],Item:['gear','role','wise','trait','talent']}};
const source={systemId:'taf',systemVersion:'3.1.0'};
const skill=(name,value,group='Will Skills',id=name)=>({_id:id,name,type:'attribute',system:{key:name,value,max:6,group,trigger:'Macro.neverRun'},effects:[{name:'Archived source effect'}]});
function map(content='',items=[],name='Ada'){
  const raw={_id:'sourcePC',name,type:'player',system:{content},items};
  const before=JSON.stringify(raw);
  const result=ctx.AdventurersTomeMigrationAdapters.map({documentType:'Actor',name,sourceData:raw},source,target,{type:'character',tafTransfer:true});
  assert.equal(JSON.stringify(raw),before);
  return result;
}

test('narrative Nature and Creed use target text fields independently of numerical Nature',()=>{
  const result=map('<h2>Nature</h2><p>Tradition, Family, Grief</p><hr><h2>Creed:</h2><p>The strong must stand.</p>',[skill('Nature',2,'Core Stats')]);
  assert.equal(result.data.system.natureDescriptors,'Tradition, Family, Grief');
  assert.equal(result.data.system.creed,'The strong must stand.');
  assert.equal(result.data.system.attributes.nature.value,2);
  assert.equal(result.data.system.attributes.nature.maximum,6);
  assert.equal(map('',[skill('Nature',2,'Core Stats')]).data.system.natureDescriptors,undefined);
  assert.equal(result.data.items.length,0);
});

test('explicit bold labels and labelled tables restore header fields with canonical station keys',()=>{
  const result=map('<p><strong>Concept:</strong> Border Ranger</p><p><b>Age</b>: 42</p><table><tr><td>Station / Rank</td><td>Veteran Ranger</td></tr><tr><td>Homeland</td><td>Rhudaur &amp; the North</td></tr></table>');
  assert.equal(result.data.system.concept,'Border Ranger');assert.equal(result.data.system.age,'42');
  assert.equal(result.data.system.rank,'veteran');assert.equal(result.data.system.homeland,'Rhudaur & the North');
  assert.equal(result.storyPreview.missingHeaderFields.length,0);
});

test('exact self row supplies explicit station and homeland without inventing age or concept',()=>{
  const table='<table><tr><th>Person</th><th>Vem är det?</th></tr><tr><td>Arantor</td><td>Din Dúnadan Veteran Ranger från Rhudaur / Cawerth Brin.</td></tr><tr><td>Other</td><td>Your Captain from Bree.</td></tr></table>';
  const result=map(table,[],'Arantor');
  assert.equal(result.data.system.rank,'veteran');assert.equal(result.data.system.homeland,'Rhudaur / Cawerth Brin');
  assert.equal(result.data.system.age,undefined);assert.equal(result.data.system.concept,undefined);
  assert.deepEqual(Array.from(result.storyPreview.missingHeaderFields),['concept','age']);
  assert.equal(result.storyPreview.contacts.length,0);
  assert.equal(map(table,[],'Someone else').data.system.homeland,undefined);
  const conflict=map('<p>Rank: Captain</p><p>Rank: Scout</p>'+table,[],'Arantor');
  assert.equal(conflict.data.system.rank,undefined);assert.match(conflict.notes.join(' '),/Conflicting rank/);
});

test('rated Will and Health skills become trained roles, retaining source identities and zero custom skills',()=>{
  const result=map('',[skill('Fighter',5,'Health Skills','fighter'),skill('Lore Master','2','Will Skills','lore'),skill('Custom Craft',0,'Skills','custom'),skill('Health',4,'Core Stats','health'),{name:'Porridge',type:'generic',system:{quantity:1}}]);
  const roles=result.data.items.filter(item=>item.type==='role');
  assert.deepEqual(Array.from(roles,item=>[item._id,item.name,item.system.rating]),[['fighter','Fighter',5],['lore','Lore Master',2],['custom','Custom Craft',0]]);
  for(const item of roles){assert.equal(item.system.trigger,undefined);assert.equal(item.system.beginnerAbility,'');assert.equal(item.effects.length,0);}
  assert.equal(result.data.system.attributes.health.value,4);
  assert.equal(result.data.items.filter(item=>item.type==='gear').length,1);
  assert.match(result.notes.join(' '),/2 trained, 1 untrained/);
});

test('invalid and conflicting skill ratings stay reference text; duplicate equal ratings collapse',()=>{
  const result=map('',[skill('Fighter',5),skill('Fighter',5),skill('Scout',2),skill('Scout',3),skill('Hunter',-1),skill('Baker',13),skill('Cook','two')]);
  assert.deepEqual(Array.from(result.data.items,item=>item.name),['Fighter']);
  assert.match(result.notes.join(' '),/conflicting skill rating.*Scout/);
  assert.match(result.data.system.notes,/Hunter/);assert.match(result.data.system.notes,/Value: two/);
});

test('imported skill UUID links remap to saved roles and retry creates no duplicate copies',async()=>{
  const raw={_id:'oldPC',name:'Ada',type:'player',system:{content:'<p>@UUID[Actor.oldPC.Item.fighter]{Fighter}</p>'},items:[skill('Fighter',5,'Health Skills','fighter')]};
  const saved=[];let serial=0;
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>target,randomId:()=>String(++serial).padStart(16,'0'),imported:()=>Object.fromEntries(saved.flatMap(row=>ctx.AdventurersTomeMigrationCore.identityPairs(row.flags['adventurers-tome'].migrationV1))),create:async(type,data)=>{saved.push(data);return {uuid:`${type}.${data._id}`};}});
  const pkg={packageId:'skills',manifest:{source:{worldId:'old',...source}},documents:[{name:'Ada',documentType:'Actor',sourceUuid:'Actor.oldPC',sourceData:raw}],identityMap:[],references:[{sourceUuid:'Actor.oldPC',targetUuid:'Actor.oldPC.Item.fighter',path:'system.content'}],assets:[],packs:[]};
  const before=JSON.stringify(pkg);
  const plan=importer.approveReady(pkg,{'Actor.oldPC':{type:'character',tafTransfer:true}});
  assert.equal(plan.rows[0].approved,true);
  await importer.execute(plan);
  assert.equal(saved.length,1);const actor=saved[0],role=actor.items[0];
  assert.equal(role.type,'role');assert.equal(role.system.rating,5);
  assert.ok(actor.system.biography.includes(`Actor.${actor._id}.Item.${role._id}`));
  assert.equal(actor.flags['adventurers-tome'].migrationV1.sourceData.items[0].system.trigger,'Macro.neverRun');
  await importer.execute(plan);assert.equal(saved.length,1);assert.equal(JSON.stringify(pkg),before);
});
