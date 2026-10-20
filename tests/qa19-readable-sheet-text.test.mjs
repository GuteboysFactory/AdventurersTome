import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const text=value=>ctx.AdventurersTomeTafBiography.toText(value);

test('plain sheet text retains heading/body boundaries, list items and readable table rows',()=>{
  const result=text('<h2>Nature</h2><p>Tradition, Family, Grief</p><hr/><h2>Belief</h2><p>Stand &amp; protect.</p><p>Another paragraph.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>Skill</th><th>Rating</th></tr><tr><td>Hunter</td><td>6</td></tr><tr><td>Healer</td><td>3</td></tr></table>');
  assert.match(result,/Nature\n+Tradition, Family, Grief\n\nBelief\n+Stand & protect\./);
  assert.match(result,/Another paragraph\.\n+• One\n+• Two/);
  assert.match(result,/Skill \| Rating\n+Hunter \| 6\n+Healer \| 3/);
  assert.doesNotMatch(result,/<\/?(?:h2|p|li|table|tr|td|th)\b|&amp;/);
});

test('source links and inline images retain their identity/path while scripts cannot become text',()=>{
  const result=text('<script>secretScript()</script><style>body{display:none}</style><p>Mentor: <a data-uuid="Actor.mentor">Daeron</a></p><p><a href="https://example.test/lore">Lore</a></p><img src="portraits/person.webp" alt="Portrait">');
  assert.match(result,/Mentor: @UUID\[Actor.mentor\]\{Daeron\}/);
  assert.match(result,/Lore \(https:\/\/example.test\/lore\)/);
  assert.match(result,/Image: Portrait — portraits\/person.webp/);
  assert.doesNotMatch(result,/secretScript|display:none|<img|<a\b/);
  assert.equal(text('Already plain\n\nTwo paragraphs & a promise.'),'Already plain\n\nTwo paragraphs & a promise.');
});

test('PC and NPC notes use labelled source rows with readable zero values and annotations',()=>{
  for(const type of ['character','npc']){
    const html='<h2>Background</h2><p>A traveller.</p>',raw={name:'Person',type:'player',system:{content:html,carryCapacity:0,attr:{Custom:'<p>Some detail</p>'}},items:[{_id:'hunter',type:'attribute',name:'Hunter',system:{group:'Health Skills',value:6,max:6}},{_id:'zero',type:'attribute',name:'Healer',system:{group:'Will Skills',value:0,max:6}}],flags:{ffs:{inventory:{annotation:{text:'<h3>Reminder</h3><p>Keep this.</p>'}}}}};
    const before=JSON.stringify(raw),result=ctx.AdventurersTomeMigrationAdapters.map({name:raw.name,documentType:'Actor',sourceData:raw},{systemId:'taf',systemVersion:'3.1.0'},{id:'realm-guard',types:{Item:['role','gear']}},{type,tafTransfer:true});
    assert.equal(result.data.system.biography,'Background\n\nA traveller.');
    assert.match(result.data.system.notes,/Carry capacity: 0/);
    assert.match(result.data.system.notes,/Hunter\nGroup: Health Skills · Value: 6 · Maximum: 6\n\nHealer\nGroup: Will Skills · Value: 0 · Maximum: 6/);
    assert.match(result.data.system.notes,/Reminder\n+Keep this\./);assert.match(result.data.system.notes,/Custom: Some detail/);
    assert.doesNotMatch(result.data.system.notes,/<\/?(?:p|h2|h3|table|tr|th|td)\b/);assert.equal(JSON.stringify(raw),before);
  }
});

test('migration archives original HTML and remaps Foundry links in readable biography',async()=>{
  const html='<h2>Background</h2><p>Uses @UUID[Actor.pc.Item.hunter]{Hunter}.</p>';
  const raw={_id:'pc',name:'PC',type:'player',system:{content:html},items:[{_id:'hunter',name:'Hunter',type:'attribute',system:{group:'Health Skills',value:6,max:6}}]};
  const pkg={packageId:'readable',manifest:{source:{systemId:'taf',systemVersion:'3.1.0',worldId:'old'}},documents:[{name:'PC',documentType:'Actor',sourceUuid:'Actor.pc',sourceData:raw}],identityMap:[],references:[],assets:[],packs:[]},saved=[];let serial=0;
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',types:{Actor:['character'],Item:['role','gear']}}),randomId:()=>String(++serial).padStart(16,'0'),create:async(type,data)=>{saved.push(data);return {uuid:`${type}.${data._id}`};}});
  await importer.execute(importer.approveReady(pkg,{'Actor.pc':{type:'character',tafTransfer:true}}));
  const actor=saved[0];assert.equal(actor.flags['adventurers-tome'].migrationV1.sourceData.system.content,html);
  assert.match(actor.system.biography,/^Background\n\nUses /);assert.ok(actor.system.biography.includes(`Actor.${actor._id}.Item.${actor.items[0]._id}`));
});


test('Tome projection preserves converted TAF paragraphs without widening unrelated notes fallback',()=>{
  const code=fs.readFileSync(new URL('../scripts/universal-backend-folder-parity.js',import.meta.url),'utf8');
  const context=vm.createContext({game:{system:{id:"realm-guard"}}});
  vm.runInContext('const ATBFP_ID="adventurers-tome";'+code.slice(code.indexOf('function atBfpMigrationBody('),code.indexOf('function atBfpProjectionProfile(')),context);
  const actor={documentName:'Actor',flags:{'adventurers-tome':{migrationV1:{sourceSystem:{systemId:'taf'}}}},system:{biography:'Background\n\nA traveller.',notes:'TAF source reference\n\nHunter\nValue: 6'}};
  assert.equal(context.atBfpMigrationBody(actor,'summary'),actor.system.biography);
  actor.system.biography='';assert.equal(context.atBfpMigrationBody(actor,'summary'),actor.system.notes);
  actor.system.notes='Private tactical notes';assert.equal(context.atBfpMigrationBody(actor,'summary'),'summary');
  delete actor.flags['adventurers-tome'].migrationV1;assert.equal(context.atBfpMigrationBody(actor,'summary'),'summary');
});
