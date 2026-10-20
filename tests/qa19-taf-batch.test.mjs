import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const file of ['migration-core','migration-adapters','migration-taf-realm-guard','migration-import','migration-accounts'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
function fixture(){
  const actor=(id,folder)=>({sourceUuid:`Actor.${id}`,documentType:'Actor',name:id,sourceData:{_id:id,name:id,type:'player',folder,system:{content:'<p>Ada knows Bo.</p>',attr:{custom:5}},prototypeToken:{texture:{src:'avatar.webp'},bar1:{attribute:'attr.health'}},items:[{_id:'h',name:'Health',type:'attribute',system:{key:'health',value:4}},{_id:'n',name:'Nature',type:'attribute',system:{key:'nature',value:12,max:12}}],flags:{ffs:{inventory:{text:{text:'Ada is a friend of Bo.'}}},'gm-notes':{notes:'GM SECRET'}}}});
  const pkg={packageId:'package',manifest:{source:{worldId:'old',systemId:'taf',systemVersion:'3.1.0'}},documents:[{sourceUuid:'Folder.pc',name:'PC Team',documentType:'Folder',sourceData:{_id:'pc',name:'PC Team',type:'Actor'}},{sourceUuid:'Folder.npc',name:'NPC',documentType:'Folder',sourceData:{_id:'npc',name:'NPC',type:'Actor'}},actor('Ada','pc'),actor('Bo','npc'),actor('C','other')],packs:[],identityMap:[],references:[]};let id=0;const created=[];
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>({isGM:true}),world:()=>({id:'target'}),system:()=>({id:'realm-guard',types:{Actor:['npc','character'],Item:['gear']}}),randomId:()=>`new${++id}`,create:async(type,data)=>{created.push(structuredClone(data));return {uuid:`${type}.${data._id}`};}});
  return {pkg,created,importer};
}
test('TAF 3.1 folder suggestions require confirmation; one group conversion preserves reference information and privacy',async()=>{
  const f=fixture(),before=JSON.stringify(f.pkg),groups=f.importer.tafGroups(f.pkg);assert.equal(f.importer.prepare(f.pkg).rows[2].status,'unmapped');
  assert.equal(groups.find(g=>g.name==='PC Team').suggested,'character');assert.equal(groups.find(g=>g.name==='NPC').suggested,'npc');
  const selected=Object.fromEntries(groups.map(g=>[g.id,g.suggested]));const plan=f.importer.prepareTaf(f.pkg,{},selected,'npc');
  assert.equal(plan.rows[2].data.type,'character');assert.equal(plan.rows[3].data.type,'npc');assert.equal(plan.rows[4].data.type,'npc');
  assert.equal(plan.rows[2].data.system.attributes.health.value,4);assert.equal(plan.rows[2].data.system.attributes.nature,undefined);assert.match(plan.rows[2].data.system.notes,/Value: 12/);assert.match(plan.rows[2].data.system.notes,/Ada is a friend of Bo/);assert.match(plan.rows[2].data.system.notes,/custom/);
  assert.equal(plan.rows[2].data.prototypeToken.texture.src,'avatar.webp');assert.equal(plan.rows[2].data.prototypeToken.bar1.attribute,null);
  const choices=Object.fromEntries(plan.rows.map(row=>[row.sourceUuid,row.choice])),ready=f.importer.approveReady(f.pkg,choices);assert.equal(ready.rows.filter(r=>r.approved).length,5);
  await f.importer.execute(ready);assert.ok(!JSON.stringify(f.created).includes('GM SECRET'));assert.ok(JSON.stringify(f.pkg).includes('GM SECRET'));assert.equal(JSON.stringify(f.pkg),before);
});
test('Correcting a group changes earlier batch choices, but never confirmed source roles',()=>{
  const f=fixture(),group=f.importer.tafGroups(f.pkg).find(g=>g.name==='PC Team'),first=f.importer.prepareTaf(f.pkg,{}, {[group.id]:'npc'},'npc'),choices=Object.fromEntries(first.rows.map(r=>[r.sourceUuid,r.choice]));
  assert.equal(f.importer.prepareTaf(f.pkg,choices,{[group.id]:'character'},'npc').rows[2].data.type,'character');
  f.pkg.documents[2].sourceData.flags['adventurers-tome']={worldProfile:{category:'npc'}};assert.equal(f.importer.prepareTaf(f.pkg,choices,{[group.id]:'character'},'npc').rows[2].data.type,'npc');
});
test('Fresh group conversion includes formerly unmapped rows; later deliberate exclusions remain excluded',()=>{
  const f=fixture(),initial=f.importer.prepare(f.pkg),choices=Object.fromEntries(initial.rows.map(row=>[row.sourceUuid,{...row.choice,include:row.included,approved:row.approved}]));
  const converted=f.importer.prepareTaf(f.pkg,choices,{},'npc');assert.equal(converted.rows[2].included,true);
  choices['Actor.Ada']={...converted.rows[2].choice,include:false};assert.equal(f.importer.prepareTaf(f.pkg,choices,{},'npc').rows[2].included,false);
});
test('TAF standalone fields become reference Items; Scene override policy remains explicit',()=>{
  const f=fixture();f.pkg.documents.push({sourceUuid:'Item.x',documentType:'Item',sourceData:{_id:'x',type:'attribute',system:{value:4,trigger:'Macro.secret'},effects:[{_id:'e'}]}},{sourceUuid:'Scene.x',documentType:'Scene',sourceData:{_id:'x',tokens:[{_id:'t',delta:{system:{attr:{health:2}}}}]}});
  const initial=f.importer.prepareTaf(f.pkg,{}, {},'npc');assert.equal(initial.rows.at(-2).data.type,'gear');assert.equal(initial.rows.at(-2).data.system.quantity,0);assert.equal(initial.rows.at(-2).data.effects.length,0);assert.ok(!initial.rows.at(-2).data.system.description.includes('Macro.secret'));assert.equal(initial.rows.at(-1).status,'needs-review');
  assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc',true).rows.at(-1).status,'ready');
});
test('TAF schema and version checks and genuine missing links stay exceptions',()=>{
  const f=fixture();f.pkg.manifest.source.systemVersion='3.0.0';assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc').rows[2].status,'unsupported');f.pkg.manifest.source.systemVersion='3.1.0';
  f.pkg.references=[{sourceUuid:'Actor.Ada',targetUuid:'Actor.missing',path:'system.content'}];assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc').rows[2].status,'needs-review');
  f.pkg.documents[3].sourceData.system.content={unexpected:true};assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc').rows[3].status,'unsupported');
});
test('Explicit Player account creation is role-safe, preflighted and retryable without duplicates',async()=>{
  const accounts=[{id:'gm',isGM:true}],data={gmOwnerId:'oldgm',users:[{id:'oldgm',name:'GM'},{id:'oldp',name:'Per'}]},mapping={oldgm:'gm',oldp:'new-player'};let writes=0;
  const env={user:()=>accounts[0],users:()=>accounts,playerRole:1,create:async raw=>{writes++;const user={...raw,id:'p',isGM:false};accounts.push(user);return user;}};
  const result=await ctx.AdventurersTomeMigrationAccounts.resolve(env,data,mapping,{worldId:'old'});assert.equal(result.oldp,'p');assert.equal(accounts[1].role,1);assert.equal(writes,1);
  assert.equal((await ctx.AdventurersTomeMigrationAccounts.resolve(env,data,mapping,{worldId:'old'})).oldp,'p');assert.equal(writes,1);
  await assert.rejects(()=>ctx.AdventurersTomeMigrationAccounts.resolve(env,data,{oldp:'new-player'},{worldId:'old'}),/Choose/);assert.equal(writes,1);
  await assert.rejects(()=>ctx.AdventurersTomeMigrationAccounts.resolve({...env,user:()=>({isGM:false})},data,mapping,{worldId:'old'}),/GM/);assert.equal(writes,1);
});
test('Archived module automation does not block copies, but transferred Freeform text and same-system live flags retain link checks',()=>{
  const f=fixture();f.pkg.references=[{sourceUuid:'Actor.Ada',targetUuid:'Item.missing',path:'flags.ffs.inventory.text.text'}];assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc').rows[2].status,'needs-review');
  f.pkg.references=[{sourceUuid:'Actor.Ada',targetUuid:'Actor.missing',path:'flags.inactive.link'}];assert.equal(f.importer.prepareTaf(f.pkg,{}, {},'npc').rows[2].status,'ready');
  f.pkg.documents[2].sourceData.type='npc';f.pkg.manifest.source.systemId='realm-guard';f.pkg.references=[{sourceUuid:'Actor.Ada',targetUuid:'Actor.missing',path:'flags.realm-guard.link'}];assert.equal(f.importer.prepare(f.pkg).rows[2].status,'needs-review');
});
test('Initial TAF proposal prepares all compatible copies without a conversion activation click or any writes',()=>{
 const f=fixture(),before=JSON.stringify(f.pkg),plan=f.importer.proposeTaf(f.pkg);
 assert.equal(plan.rows.filter(row=>row.approved).length,5);assert.equal(plan.rows[2].data.type,'character');assert.equal(plan.rows[3].data.type,'npc');assert.equal(plan.rows[4].data.type,'npc');assert.equal(f.created.length,0);assert.equal(JSON.stringify(f.pkg),before);
});
test('Automatic proposals recompute fallback and Scene policy while keeping deliberate per-document overrides',()=>{
 const f=fixture();f.pkg.documents.push({sourceUuid:'Scene.s',documentType:'Scene',sourceData:{_id:'s',tokens:[{_id:'t',delta:{system:{custom:1}}}]}});
 const initial=f.importer.proposeTaf(f.pkg),choices=Object.fromEntries(initial.rows.map(row=>[row.sourceUuid,row.choice]));assert.equal(initial.rows.at(-1).approved,true);
 const changed=f.importer.proposeTaf(f.pkg,choices,{fallback:'',sceneBase:false});assert.equal(changed.rows[4].status,'unmapped');assert.equal(changed.rows.at(-1).status,'needs-review');assert.equal(changed.rows.at(-1).approved,false);
 choices['Actor.C']={...choices['Actor.C'],tafProposed:false,type:'character'};assert.equal(f.importer.proposeTaf(f.pkg,choices).rows[4].data.type,'character');
});
test('Account proposals are read-only, role-safe, explicit at Import, and retain saved private choices',()=>{
 const users=[{id:'gm',name:'GM',isGM:true},{id:'player',name:'Per',isGM:false},{id:'admin',name:'Other',isGM:true}],data={gmOwnerId:'oldgm',users:[{id:'oldgm',name:'GM',isGM:true},{id:'oldp',name:'Per',isGM:false},{id:'newp',name:'Other',isGM:false},{id:'othergm',name:'Other GM',isGM:true},{id:'private',name:'Keep private',isGM:false}]};
 const result=ctx.AdventurersTomeMigrationAccounts.propose({user:()=>users[0],users:()=>users},data,{private:null});
 assert.equal(result.oldgm,'gm');assert.equal(result.oldp,'player');assert.equal(result.newp,'new-player');assert.equal(result.othergm,null);assert.equal(result.private,null);assert.equal(users.length,3);
});
test('Changing an automatic role proposal also rechecks formerly ready dependent Journals',()=>{
 const f=fixture();f.pkg.documents.push({sourceUuid:'JournalEntry.j',documentType:'JournalEntry',sourceData:{_id:'j',name:'Linked story'}});f.pkg.references.push({sourceUuid:'JournalEntry.j',targetUuid:'Actor.C',path:'pages.0.text.content'});
 const initial=f.importer.proposeTaf(f.pkg);assert.equal(initial.rows.at(-1).approved,true);const choices=Object.fromEntries(initial.rows.map(row=>[row.sourceUuid,row.choice]));
 const changed=f.importer.proposeTaf(f.pkg,choices,{fallback:''});assert.equal(changed.rows[4].status,'unmapped');assert.equal(changed.rows.at(-1).approved,false);assert.equal(changed.rows.at(-1).included,false);
});
test('Two old GM accounts can share the importing GM while six new Players resolve separately and reuse accounts on retry',async()=>{
 const accounts=[{id:'gm',name:'New GM',isGM:true}],users=[{id:'oldgm',name:'Old GM',isGM:true},{id:'oldalias',name:'GM alias',isGM:true},...Array.from({length:6},(_,i)=>({id:`old${i}`,name:`Player ${i}`,isGM:false}))],data={gmOwnerId:'oldgm',users},mapping={oldgm:'gm',oldalias:'gm',...Object.fromEntries(users.slice(2).map(user=>[user.id,'new-player']))};let writes=0;
 const env={user:()=>accounts[0],users:()=>accounts,playerRole:1,create:async raw=>{const user={...raw,id:`p${++writes}`,isGM:false};accounts.push(user);return user;}};
 const result=await ctx.AdventurersTomeMigrationAccounts.resolve(env,data,mapping,{worldId:'oldworld'});assert.equal(result.oldgm,'gm');assert.equal(result.oldalias,'gm');assert.equal(new Set(users.slice(2).map(user=>result[user.id])).size,6);assert.equal(writes,6);
 const repeated=await ctx.AdventurersTomeMigrationAccounts.resolve(env,data,mapping,{worldId:'oldworld'});assert.equal(JSON.stringify(repeated),JSON.stringify(result));assert.equal(writes,6);
});
test('Automatic proposals reserve uniquely named Player accounts instead of mapping repeated source names to one target',()=>{
 const accounts=[{id:'gm',name:'GM',isGM:true},{id:'p',name:'Per',isGM:false}],data={gmOwnerId:'g',users:[{id:'g',name:'GM',isGM:true},{id:'a',name:'Per',isGM:false},{id:'b',name:'PER',isGM:false}]};
 const result=ctx.AdventurersTomeMigrationAccounts.propose({user:()=>accounts[0],users:()=>accounts},data);assert.equal(result.a,'p');assert.equal(result.b,'new-player');
});
test('A Player-to-GM or shared Player collision names the conflicting accounts and rejects before creating accounts',async()=>{
 let creates=0;const accounts=[{id:'gm',name:'New GM',isGM:true},{id:'p',name:'Target Player',isGM:false}],data={gmOwnerId:'g',users:[{id:'g',name:'Source GM',isGM:true},{id:'a',name:'Source A',isGM:false},{id:'b',name:'Source B',isGM:false},{id:'fresh',name:'New Player',isGM:false}]},env={user:()=>accounts[0],users:()=>accounts,playerRole:1,create:async()=>{creates++;}};
 for(const mapping of [{g:'gm',a:'gm',b:'p',fresh:'new-player'},{g:'gm',a:'p',b:'p',fresh:'new-player'}])await assert.rejects(()=>ctx.AdventurersTomeMigrationAccounts.resolve(env,data,mapping,{worldId:'old'}),error=>error.code==='TOME_ACCOUNT_MAPPING'&&/Source A/.test(error.message));
 assert.equal(creates,0);
});
