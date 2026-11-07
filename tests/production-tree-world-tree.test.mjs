import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import * as core from '../scripts/world-tree-core.mjs';
const root=process.env.TOME_TEST_ROOT||path.resolve(import.meta.dirname,'..');
export function fixture({realBootstrap=false}={}){
 const hooks=new Map(),values=new Map(),writes=[],api={},opened=[];let serial=0,failSave=false,failUpdate=false;
 const collection=()=>({contents:[],get(id){return this.contents.find(d=>d.id===id);}}),game={world:{id:'w'},user:{id:'gm',isGM:true,role:4},i18n:{lang:'en'},actors:collection(),items:collection(),journal:collection(),folders:collection()};
 const fire=(key,...args)=>{for(const fn of hooks.get(key)||[])fn(...args);};
 function add(type,name,{folder=null,flags={},...extra}={}){
  const coll=type==='Folder'?game.folders:type==='Actor'?game.actors:type==='Item'?game.items:game.journal;
  const d={id:'id'+(++serial),uuid:'',documentName:type,type:type==='Folder'?'JournalEntry':type==='Actor'?'npc':'',name,folder,flags:{'adventurers-tome':flags},sort:0,ownership:{default:0},testUserPermission:()=>true,...extra};d.uuid=type+'.'+d.id;
  d.getFlag=(_id,key)=>d.flags['adventurers-tome']?.[key];
  d.update=async(patch,options)=>{if(failUpdate)throw Error('Backend rejected update');writes.push({kind:'update',uuid:d.uuid,patch});Object.assign(d,patch);fire('update'+type,d,patch,options);return d;};
  d.delete=async options=>{if(d.failDelete)throw Error('Delete rejected');writes.push({kind:'delete',uuid:d.uuid});coll.contents.splice(coll.contents.indexOf(d),1);fire('delete'+type,d,options);};
  d.createEmbeddedDocuments=async()=>[];coll.contents.push(d);return d;
 }
 const c={console,structuredClone,...core,game,foundry:{utils:{randomID:()=> 'tree'+(++serial),deepClone:structuredClone}},
  Folder:{create:async(data,options)=>{writes.push({kind:'createFolder',data});const d=add('Folder',data.name,{...data,flags:data.flags?.['adventurers-tome']||{}});fire('createFolder',d,options);return d;}},
  JournalEntry:{create:async(data)=>{writes.push({kind:'createEntry',data});return add('JournalEntry',data.name,{...data,flags:data.flags?.['adventurers-tome']||{}});}},
  Hooks:{once:(key,fn)=>{if(!hooks.has(key))hooks.set(key,[]);hooks.get(key).push(fn);},on:(key,fn)=>{if(!hooks.has(key))hooks.set(key,[]);hooks.get(key).push(fn);},callAll:fire},
  ATTestAI:{assertEnabled(){},flags:d=>d,settings:{get:(_id,key)=>values.get(key)||'',register:(_id,key,o)=>{if(!values.has(key))values.set(key,o.default);},set:async(_id,key,value)=>{if(failSave)throw Error('Setting write rejected');values.set(key,value);fire('updateSetting',{key});}},modules:{get:()=>({api})}}};
 api.app=()=>({_openRefKey:async ref=>opened.push(ref)});api.folderQuickCreate={bootstrap:async()=>({folders:{item:{id:'items'},npc:{id:'npc'},lore:{id:'lore'},faction:{id:'factions'}}}),quickCreate:async(_folder,options)=>add('JournalEntry',options.name,{flags:{type:'world',worldProfile:{category:'lore'}}})};
 const context=vm.createContext(c),source=fs.readFileSync(path.join(root,'scripts/world-tree-service.mjs'),'utf8').replace(/^import .*;\r?\n/,'').replace(/^export /gm,'');
 if(realBootstrap){
  game.settings=c.ATTestAI.settings;game.modules=new Map([['adventurers-tome',{id:'adventurers-tome',active:true,api}]]);
  game.settings.storage=new Map([['world',{getSetting:()=>null}],['user',{getSetting:()=>null}],['client',{getItem:()=>null}]]);
  vm.runInContext('{'+fs.readFileSync(path.join(root,'scripts/production-bootstrap.js'),'utf8')+'}',context);
 }else Object.freeze(context.ATTestAI);
 vm.runInContext('"use strict";{'+source+';globalThis.service=worldTreeService;}',context);api.worldTree=context.service;fire('init');
 return {api,game,add,writes,values,opened,context,fire,service:context.service,failSave(v=true){failSave=v;},failUpdate(v=true){failUpdate=v;}};
}
test('Core import preserves arbitrary paths, root documents and type-isolated bindings; pack folders are excluded',()=>{
 const folders=[{id:'p',type:'Actor',name:'People'},{id:'c',type:'Actor',name:'Harbor',folder:'p'},{id:'i',type:'Item',name:'Relics'},{id:'pack',type:'Actor',name:'PACK',pack:'templates'}],docs=[{uuid:'Actor.a',documentName:'Actor',folder:'c'},{uuid:'Item.i',documentName:'Item'}];
 const s=core.importStructure(core.emptyTree(),folders,docs);assert.equal(s.assignments['Actor.a'],'import:Actor:c');assert.equal(s.assignments['Item.i'],'');assert.equal(s.folders.find(f=>f.id==='import:Actor:c').parent,'category:npc');assert.ok(!s.folders.find(f=>f.name==='PACK'));assert.equal(core.importStructure(s,folders,docs).folders.length,s.folders.length);
});
test('Core cycle and invalid parent checks reject a move before storage',()=>{
 const s=core.emptyTree();core.insertFolder(s,{id:'child',name:'Child',parent:'category:npc',mode:'local'});assert.throws(()=>core.moveFolder(s,{id:'category:npc',parent:'child'}),/inside itself/);
});
test('Existing-world import is opt-in and performs no backend writes',async()=>{
 const w=fixture(),p=w.add('Folder','North',{type:'Actor'}),c=w.add('Folder','Harbor',{type:'Actor',folder:p.id}),a=w.add('Actor','Keeper',{folder:c.id});
 assert.equal(w.service.view().state.setup,'pending');assert.equal(w.service.view().rows.length,0);assert.equal(w.writes.length,0);
 await w.service.change('setup',{copy:true});assert.equal(w.service.read().assignments[a.uuid],'import:Actor:'+c.id);assert.equal(w.service.view().rows.length,1);assert.equal(w.writes.length,0);
});
test('Declining import retains Tome control; it does not pull raw Actors into World',async()=>{
 const w=fixture();w.add('Actor','Native');await w.service.change('setup',{copy:false});assert.equal(w.service.read().setup,'tome');assert.equal(w.service.view().rows.length,0);
});
test('A Tome-only custom category has no Foundry folder, and moving an entry into it preserves its source placement',async()=>{
 const w=fixture(),source=w.add('Folder','Original',{type:'Actor'}),a=w.add('Actor','Keeper',{folder:source.id});await w.service.change('setup',{copy:true});
 const n=await w.service.change('createFolder',{name:'Dreams and prophecies',mode:'local',category:'lore'});const before=w.writes.length;await w.service.change('moveEntry',{uuid:a.uuid,folder:n.result});assert.equal(a.folder,source.id);assert.equal(w.writes.length,before);assert.equal(w.service.view().rows.find(r=>r.uuid===a.uuid).folder,n.result);
});
test('Permanent content deletion requires explicit confirmation and can retry a rejected backend deletion',async()=>{
 const w=fixture(),n=await w.service.change('createFolder',{name:'Remove',mode:'mirror',category:'npc'}),a=w.add('Actor','Keeper');await w.service.change('moveEntry',{uuid:a.uuid,folder:n.result});await assert.rejects(w.service.change('deleteFolder',{id:n.result,contents:'delete'}),/confirmation/);assert.ok(w.game.actors.get(a.id));
 a.failDelete=true;await w.service.change('deleteFolder',{id:n.result,contents:'delete',confirmed:true});assert.ok(w.service.read().cleanup.length>0);assert.ok(w.game.actors.get(a.id));a.failDelete=false;await w.service.change('retryCleanup');assert.equal(w.game.actors.get(a.id),undefined);assert.equal(w.service.read().cleanup.length,0);
});
test('Players cannot mutate the tree or see empty hidden categories',async()=>{
 const w=fixture();await w.service.change('createFolder',{name:'Secret plans',mode:'local',category:'lore'});w.game.user.isGM=false;assert.throws(()=>w.service.change('createFolder',{name:'No'}),/Only a GM/);assert.equal(w.service.view().state.folders.length,0);
});
test('Opening an unprojected item prepares a Tome profile instead of opening the Foundry sheet',async()=>{
 const w=fixture(),item=w.add('Item','Seal');await w.service.change('setup',{copy:true});await w.service.openEntry(item.uuid);assert.equal(w.opened.length,1);assert.match(w.opened[0],/^world:/);assert.equal(w.game.journal.contents[0].getFlag('','worldProfile').sourceUuid,item.uuid);
});
test('A new entry can be created directly into a selected Tome collection',async()=>{
 const w=fixture(),n=await w.service.change('createFolder',{name:'Stories',mode:'local',category:'lore'}),uuid=await w.service.createEntry({folder:n.result,kind:'lore',name:'A new story'});assert.equal(w.service.read().assignments[uuid],n.result);
});
test('Sessions cannot be accidentally moved into World through a drag payload',async()=>{
 const w=fixture(),doc=w.add('JournalEntry','Session',{flags:{type:'sessions'}});await assert.rejects(w.service.change('moveEntry',{uuid:doc.uuid,folder:'category:lore'}),/Only World entries/);assert.equal(doc.folder,null);
});
test('A shared legacy journal folder containing sessions stays local and its backend is preserved',async()=>{
 const w=fixture(),folder=w.add('Folder','Shared archive',{type:'JournalEntry'}),world=w.add('JournalEntry','Legend',{folder:folder.id,flags:{type:'world',worldProfile:{category:'lore'}}}),session=w.add('JournalEntry','Session',{folder:folder.id,flags:{type:'sessions'}});
 const node=w.service.read().folders.find(f=>f.name==='Shared archive');assert.equal(node.mode,'local');await w.service.change('renameFolder',{id:node.id,name:'My lore'});assert.equal(folder.name,'Shared archive');await w.service.change('deleteFolder',{id:node.id,contents:'keep'});assert.ok(w.game.folders.get(folder.id));assert.equal(session.folder,folder.id);assert.equal(world.folder,folder.id);assert.ok(w.service.view().rows.find(r=>r.uuid===world.uuid));
});
test('Folder search retains ancestor paths, expands name-matched branches and accepts accents',()=>{
 const s=core.emptyTree();core.insertFolder(s,{id:'region',name:'Northern lands',mode:'local'});core.insertFolder(s,{id:'city',name:'Bree',parent:'region',category:'location'});core.insertFolder(s,{id:'inn',name:'Prancing Pony',parent:'city',category:'location'});core.insertFolder(s,{id:'south',name:'Söder',mode:'local'});
 const before=JSON.stringify(s);assert.deepEqual([...core.visibleFolders(s,{query:'BREE'})],['city','region','inn']);assert.deepEqual([...core.visibleFolders(s,{query:'soder'})],['south']);assert.equal(core.visibleFolders(s,{query:'nothing'}).size,0);assert.equal(JSON.stringify(s),before);
});
test('Folder type filtering combines with search and retains required category parents',()=>{
 const s=core.emptyTree();core.insertFolder(s,{id:'group',name:'Campaign regions',nodeKind:'category'});core.insertFolder(s,{id:'city',name:'Bree',parent:'group',category:'location'});core.insertFolder(s,{id:'people',name:'Bree folk',parent:'group',category:'npc'});
 assert.deepEqual([...core.visibleFolders(s,{query:'bree',filter:'location'})],['city','group']);assert.deepEqual([...core.visibleFolders(s,{filter:'categories'})],['group']);
});
test('A new grouping category persists and accepts existing folders without creating a backend category',async()=>{
 const w=fixture(),source=w.add('Folder','Harbor',{type:'Actor'}),actor=w.add('Actor','Keeper',{folder:source.id});await w.service.change('setup',{copy:true});const before=w.writes.length,group=await w.service.change('createFolder',{name:'Campaign people',nodeKind:'category',mode:'mirror'});assert.equal(w.writes.length,before);const folder=core.folderById(w.service.read(),group.result);assert.equal(folder.mode,'local');assert.equal(folder.nodeKind,'category');await w.service.change('moveFolder',{id:'import:Actor:'+source.id,parent:group.result});assert.equal(actor.folder,source.id);assert.equal(core.folderById(w.service.read(),'import:Actor:'+source.id).parent,group.result);assert.equal(w.service.view().external.length,0);
});
test('By content groups entire branches by actual contents, preserves mixed folders and never changes identities',()=>{
 const tree=core.emptyTree();tree.folders=[];for(const f of [{id:'people',name:'A misleading name',category:'lore'},{id:'child',name:'Companions',parent:'people'},{id:'mixed',name:'A region'},{id:'empty',name:'An empty collection'}])core.insertFolder(tree,f);
 const rows=[{uuid:'Actor.a',name:'A',kind:'npc',folder:'child'},{uuid:'Actor.b',name:'B',kind:'pc',folder:'people'},{uuid:'JournalEntry.c',name:'C',kind:'contact',folder:'mixed'},{uuid:'JournalEntry.d',name:'D',kind:'location',folder:'mixed'},{uuid:'Item.e',name:'E',kind:'item',folder:''}],before=JSON.stringify({tree,rows}),view=core.projectTreeView(tree,rows,'content');
 assert.equal(view.folders.find(f=>f.id==='people').parent,'view:content:characters');assert.equal(view.folders.find(f=>f.id==='child').parent,'people');assert.equal(view.folders.find(f=>f.id==='mixed').parent,'view:content:mixed');assert.equal(view.folders.find(f=>f.id==='empty').parent,'view:content:unclassified');assert.equal(view.rows.find(r=>r.uuid==='Item.e').folder,'view:content:item');assert.equal(new Set(view.rows.map(r=>r.uuid)).size,rows.length);assert.equal(view.rows.find(r=>r.uuid==='Actor.b').kind,'pc');assert.equal(JSON.stringify({tree,rows}),before);
});
test('The imported original remains stable after custom renames, moves and repeated imports',async()=>{
 const w=fixture({realBootstrap:true}),folder=w.add('Folder','Imported people',{type:'Actor'}),actor=w.add('Actor','Keeper',{folder:folder.id});await w.service.change('setup',{copy:true});const original=JSON.stringify(w.service.read().originalStructure),id=w.service.read().folders.find(f=>f.bindings?.Actor?.id===folder.id).id,group=(await w.service.change('createFolder',{name:'My categories',nodeKind:'category'})).result;
 await w.service.change('renameFolder',{id,name:'My people'});await w.service.change('moveFolder',{id,parent:group});await w.service.change('setup',{copy:true});const view=w.service.view('original');assert.equal(view.state.folders.find(f=>f.id===id).name,'Imported people');assert.equal(view.state.folders.find(f=>f.id===id).parent,'');assert.equal(view.rows.find(r=>r.uuid===actor.uuid).folder,id);assert.equal(JSON.stringify(w.service.read().originalStructure),original);assert.equal(w.service.read().folders.find(f=>f.id===id).parent,group);
});
test('Switching service views preserves custom state and every backend placement',async()=>{
 const w=fixture(),folder=w.add('Folder','Imported',{type:'Actor'});w.add('Actor','Keeper',{folder:folder.id});await w.service.change('setup',{copy:true});const saved=w.values.get('worldTreeV1'),writes=w.writes.length;
 for(let i=0;i<6;i++)for(const mode of ['original','content','custom']){const view=w.service.view(mode);assert.equal(view.viewMode,mode);assert.equal(view.editable,mode==='custom');assert.equal(view.rows.length,1);}
 assert.equal(w.values.get('worldTreeV1'),saved);assert.equal(w.writes.length,writes);
});
test('New entries appear under Added later in Original; deleted entries do not become phantom cards',async()=>{
 const w=fixture(),old=w.add('Actor','Original');await w.service.change('setup',{copy:true});const added=w.add('Item','New seal');const view=w.service.view('original');assert.equal(view.rows.find(r=>r.uuid===added.uuid).folder,'view:original:added');await old.delete();assert.equal(w.service.view('original').rows.some(r=>r.uuid===old.uuid),false);assert.ok(w.service.read().originalStructure.assignments[old.uuid]!==undefined);
});
test('Older imports get a one-time current-Foundry reference without touching the custom layout or backend',async()=>{
 const w=fixture(),folder=w.add('Folder','Current Foundry name',{type:'Actor'});w.add('Actor','Keeper',{folder:folder.id});await w.service.change('setup',{copy:true});const legacy=w.service.read();delete legacy.originalStructure;w.values.set('worldTreeV1',JSON.stringify(legacy));const before=JSON.stringify(legacy.folders),writes=w.writes.length;assert.equal(await w.service.ensureOriginalStructure(),true);assert.equal(w.service.read().originalStructure.origin,'current-foundry');assert.equal(JSON.stringify(w.service.read().folders),before);assert.equal(w.writes.length,writes);const once=w.values.get('worldTreeV1');assert.equal(await w.service.ensureOriginalStructure(),false);assert.equal(w.values.get('worldTreeV1'),once);
});
test('All views enforce document visibility and hide private original metadata from players',async()=>{
 const w=fixture(),secret=w.add('Folder','Secret folder',{type:'Actor'}),publicFolder=w.add('Folder','Public people',{type:'Actor'}),hidden=w.add('Actor','Secret keeper',{folder:secret.id});hidden.testUserPermission=()=>false;w.add('Actor','Public keeper',{folder:publicFolder.id});await w.service.change('setup',{copy:true});w.game.user.isGM=false;
 for(const mode of ['original','content','custom']){const view=w.service.view(mode);assert.equal(view.rows.length,1);assert.equal(view.state.folders.some(f=>f.name==='Secret folder'),false);assert.equal(view.state.originalStructure,null);assert.equal(view.externalGroups.length,0);}
});
test('A first real import replaces a scratch-world reference, while a pending import is never automatic',async()=>{
 const w=fixture();await w.service.change('createFolder',{name:'Scratch',mode:'local'});assert.equal(w.service.read().originalStructure.origin,'initial-tome');w.add('Actor','Newly imported');await w.service.change('setup',{copy:true});assert.equal(w.service.read().originalStructure.origin,'import');assert.equal(w.service.view('original').rows[0].folder,'');const pending=fixture();pending.add('Actor','Not opted in');assert.equal(await pending.service.ensureOriginalStructure(),false);assert.equal(pending.service.view('original').rows.length,0);assert.equal(pending.values.get('worldTreeV1'),'');
});
