import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const name of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8'),ctx);
const source={systemId:'taf',systemVersion:'3.1.0'},target={id:'realm-guard',types:{Actor:['character','npc'],Item:['gear','role','trait','wise','talent']}};
const map=(documentType,sourceData,choice={tafTransfer:true,type:'character'})=>ctx.AdventurersTomeMigrationAdapters.map({documentType,name:sourceData.name,sourceData},source,target,choice);
const html='<h2>History</h2><p>First &amp; foremost.</p><p>Second paragraph.</p><ul><li>One</li><li>Two</li></ul>';
const readable=value=>{assert.equal(typeof value,'string');assert.doesNotMatch(value,/<\/?(?:h\d|p|ul|li|table|td|th|tr|br)\b|&amp;/i);};

test('world and embedded gear descriptions retain readable structure and zero-valued inventory context',()=>{
  const raw={_id:'gear',name:'Pack',type:'generic',system:{description:html,quantity:2,weight:0,equipped:false,group:'<b>Supplies</b>'}},before=JSON.stringify(raw);
  const world=map('Item',raw).data,actor=map('Actor',{type:'player',system:{content:''},items:[raw]}).data;
  for(const item of [world,actor.items[0]]){readable(item.system.description);assert.match(item.system.description,/History\n+First & foremost\./);assert.match(item.system.description,/Second paragraph/);assert.match(item.system.description,/• One\n+• Two/);assert.match(item.system.description,/Weight: 0 · Equipped: false · Group: Supplies/);assert.equal(item.system.quantity,2);}
  assert.equal(JSON.stringify(raw),before);
  readable(map('Item',raw,{tafTransfer:false}).data.system.description);
});

test('Talents, Traits, Wises and skills all carry plain descriptions without new generated HTML',()=>{
  const actor=map('Actor',{name:'PC',type:'player',system:{content:'<h2>Traits</h2><p>Tough (1)</p><h2>Wises</h2><p>Road-wise</p><h2>Talents</h2><p>Improvisational:<br>First line.<br>Second line.</p>'},items:[{_id:'skill',name:'Hunter',type:'attribute',system:{group:'Health Skills',value:2}}]}).data;
  for(const type of ['trait','wise','talent','role']){const item=actor.items.find(item=>item.type===type);assert.ok(item,type);readable(item.system.description);}
  const talent=actor.items.find(item=>item.type==='talent');assert.equal(talent.system.description,'First line.\nSecond line.');assert.equal(talent.system.effectMode,'manual');assert.equal(talent.system.diceBonus,0);
});

test('standalone attribute/base references use labelled lines and do not activate source Macro triggers',()=>{
  for(const type of ['attribute','base']){const item=map('Item',{name:'Reference',type,system:{description:html,value:0,group:'<b>Custom</b>',trigger:'Macro.neverRun'}}).data;
    readable(item.system.description);assert.match(item.system.description,/TAF reference.*\n\ndescription: History/s);assert.match(item.system.description,/value: 0\ngroup: Custom/);assert.doesNotMatch(item.system.description,/Macro.neverRun/);assert.equal(item.system.quantity,0);}
});

test('actual import keeps original rich item data archived while saving readable descriptions',async()=>{
  const raw={_id:'item',name:'Pack',type:'generic',system:{description:html,quantity:1}},saved=[];
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'new'}),system:()=>target,randomId:()=> 'newItem',create:async(type,data)=>{saved.push(data);return {uuid:`${type}.${data._id}`};}});
  const pkg={packageId:'description',manifest:{source:{...source,worldId:'old'}},documents:[{documentType:'Item',sourceUuid:'Item.item',name:'Pack',sourceData:raw}],identityMap:[],references:[],packs:[],assets:[]};
  await importer.execute(importer.approveReady(pkg,{'Item.item':{tafTransfer:true}}));
  readable(saved[0].system.description);assert.equal(saved[0].flags['adventurers-tome'].migrationV1.sourceData.system.description,html);assert.equal(raw.system.description,html);
});
