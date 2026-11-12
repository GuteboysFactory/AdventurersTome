import {emptyTree,validateTree,copy,parentId,folderById,insertFolder,moveFolder,assignEntry,subtree,importStructure,captureOriginalStructure,projectTreeView,TREE_VIEWS} from './world-tree-core.mjs';
import {isWorldPlayerCharacter} from './player-character-core.mjs';
const ID='adventurers-tome',KEY='worldTreeV1',OPTIONS={render:false,adventurersTomeWorldTree:true};
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const flag=(d,k)=>globalThis.ATTestAI.flags(d)?.getFlag?.(ID,k);
const rootDoc=uuid=>{const [type,id,...extra]=String(uuid).split('.');if(extra.length)return null;return (type==='Actor'?game.actors:type==='Item'?game.items:type==='JournalEntry'?game.journal:null)?.get(id);};
const snapshot=f=>({id:f.id,name:f.name,parent:parentId(f),sort:Number(f.sort||0)});
const nativeFolders=()=>game.folders?.contents||[];

function gm(){if(!game.user?.isGM)throw Error('Only a GM can organize the World tree.');}
export function canView(d){
 if(!d||d.pack||flag(d,'chronicleV1'))return false;if(api()?.canView)return api().canView(d,game.user)===true;if(game.user?.isGM)return true;
 const access=flag(d,'access')||{};if(access.visibility==='gm'||access.discovered===false)return false;try{return d.testUserPermission?.(game.user,'OBSERVER')===true;}catch{return false;}
}
export function sourceUuid(d){const p=flag(d,'worldProfile')||{},raw=String(flag(d,'backendProjectionV1')?.sourceUuid||flag(d,'semanticProjection')?.linkedUuid||flag(d,'quickImportSourceUuid')||p.sourceUuid||(p.actorId?'Actor.'+p.actorId:''));
 if(raw.startsWith('Actor.')&&!['npc','pc','character','contact','npc-group'].includes(p.category))return '';
 if(raw.startsWith('Item.')&&p.category!=='item')return '';return raw;}
function raw(){try{return String(globalThis.ATTestAI.settings.get(ID,KEY)||'');}catch{return '';}}
let authorityText=null,authorityIndex=null;
export function ownsBackendDocument(doc){
 if(!doc||doc.pack)return false;const text=raw();if(!text)return false;
 if(authorityText!==text){authorityText=text;try{const state=JSON.parse(text);authorityIndex={folders:new Set(state.folders.flatMap(f=>[...Object.values(f.bindings||{}).map(b=>b.id),...(f.id.startsWith('legacy:')?[f.id.slice(7)]:[])])),entries:new Set(Object.keys(state.assignments||{})),imported:state.setup==='imported'};}catch{authorityIndex=null;}}
 if(doc.documentName==='JournalEntry'&&(flag(doc,'worldProfile')||flag(doc,'type')==='world'))return true;
 // Malformed saved structure must not give an older background writer permission to rearrange it.
 if(!authorityIndex)return doc.documentName==='Folder';
 if(doc.documentName==='Folder')return authorityIndex.folders.has(doc.id);
 return authorityIndex.entries.has(doc.uuid)||authorityIndex.folders.has(parentId(doc))||(authorityIndex.imported&&['Actor','Item'].includes(doc.documentName));
}
function seed(){
 const s=emptyTree(),world=(game.journal?.contents||[]).filter(d=>!d.pack&&!flag(d,'chronicleV1')&&!String(flag(d,'quickImportSourceUuid')||'').startsWith('Compendium.')&&(flag(d,'worldProfile')||flag(d,'type')==='world'));
 const worldIds=new Set(world.map(d=>d.id));
 const selected=new Map(),categories=new Map();
 for(const doc of world){let f=game.folders?.get(parentId(doc));const seen=new Set();while(f&&!seen.has(f.id)&&f.type==='JournalEntry'){
  seen.add(f.id);if(String(f.name).toLowerCase()==='world'||flag(f,'section')==='world')break;selected.set(f.id,f);if(!categories.has(f.id))categories.set(f.id,flag(doc,'worldProfile')?.category||'lore');f=game.folders?.get(parentId(f));
 }}
 if(selected.size){s.folders=[];for(const f of selected.values()){
  const mirror=flag(f,'backendFolderProjectionV1'),source=mirror?.sourceFolderId?game.folders.get(mirror.sourceFolderId):null;
  const binding=source||f,hasForeignJournal=!source&&(game.journal?.contents||[]).some(d=>{if(worldIds.has(d.id))return false;let current=game.folders.get(parentId(d));const seen=new Set();while(current&&!seen.has(current.id)){if(current.id===f.id)return true;seen.add(current.id);current=game.folders.get(parentId(current));}return false;});
  s.folders.push({id:'legacy:'+f.id,name:f.name,parent:selected.has(parentId(f))?'legacy:'+parentId(f):'',sort:Number(f.sort||0),category:mirror?.category||flag(f,'standardFolder')||categories.get(f.id)||'lore',mode:hasForeignJournal?'local':'mirror',bindings:hasForeignJournal?{}:{[binding.type]:snapshot(binding)}});
 }for(const doc of world)if(!sourceUuid(doc)&&selected.has(parentId(doc)))s.assignments[doc.uuid]='legacy:'+parentId(doc);}
 if(!s.folders.length)s.folders=emptyTree().folders;
 return validateTree(s);
}
// Folder bindings are import provenance, never instructions to rearrange Foundry.
function independentTree(s,{capture=false}={}){
 if(s.organization==='tome'&&!capture)return s;
 for(const row of rowsForTree(s))if(!Object.hasOwn(s.assignments,row.uuid))assignEntry(s,row.uuid,row.folder||'');
 for(const node of s.folders)node.mode='local';
 s.localPlacements=Object.fromEntries(Object.keys(s.assignments).map(uuid=>[uuid,true]));
 s.folderMoveScopes=[];
 // Old deferred folder cleanup belongs to the retired mirroring model.
 // Explicitly confirmed document deletions remain retryable.
 s.cleanup=s.cleanup.filter(job=>job.type==='document');
 s.organization='tome';return validateTree(s);
}
export function readTree(){const text=raw();if(!text)return independentTree(seed());try{return independentTree(validateTree(JSON.parse(text)));}catch(error){throw new Error('The saved World tree cannot be read: '+error.message);}}
export function rowsForTree(s=readTree()){
 const isPC=doc=>isWorldPlayerCharacter(doc,game.actors?.contents||[],game.users?.contents||[]);
 const rows=[],native=[...(game.actors?.contents||[]),...(game.items?.contents||[])].filter(d=>!isPC(d)),nativeMap=new Map(native.map(d=>[d.uuid,d])),representations=new Map();
 const journals=(game.journal?.contents||[]).filter(d=>!isPC(d)&&canView(d)&&(flag(d,'worldProfile')||flag(d,'type')==='world')&&!String(flag(d,'quickImportSourceUuid')||flag(d,'worldProfile')?.sourceUuid||'').startsWith('Compendium.'));
 const basicActors=new Set(game.user?.isGM?[]:journals.map(j=>flag(j,'knownPersonV1')?.actorUuid).filter(Boolean));
 for(const j of journals){const ref=(game.user?.isGM&&flag(j,'knownPersonV1')?.actorUuid)||sourceUuid(j);if(basicActors.has(ref))continue;if(nativeMap.has(ref)){if(canView(nativeMap.get(ref))&&(!representations.has(ref)||flag(j,'knownPersonV1')||!flag(representations.get(ref),'knownPersonV1')))representations.set(ref,j);continue;}const p=flag(j,'worldProfile')||{};rows.push({uuid:j.uuid,id:j.id,name:j.name,kind:p.category||'lore',img:p.heroImage||j.img||'',summary:p.summary||'',subtitle:p.subtitle||'',journalId:j.id});}
 for(const doc of native){if(!canView(doc)||basicActors.has(doc.uuid))continue;const j=representations.get(doc.uuid),p=j?flag(j,'worldProfile')||{}:flag(doc,'actorProfile')||{};
  const owned=s.folders.some(f=>f.bindings?.[doc.documentName]?.id===parentId(doc));
  if(s.setup!=='imported'&&!j&&!owned&&!Object.hasOwn(s.assignments,doc.uuid))continue;
  rows.push({uuid:doc.uuid,id:doc.id,name:doc.name,kind:doc.documentName==='Item'?'item':p.category|| (doc.type==='character'?'pc':'npc'),img:p.heroImage||doc.img||'',summary:p.summary||'',subtitle:p.subtitle||p.title||'',journalId:j?.id||''});
 }
 for(const row of rows){if(Object.hasOwn(s.assignments,row.uuid)){row.folder=s.assignments[row.uuid];continue;}const doc=rootDoc(row.uuid),presentation=row.journalId?game.journal.get(row.journalId):null;
  const source= s.folders.find(f=>f.bindings?.[doc?.documentName]?.id===parentId(doc));
  const legacy= presentation&&s.folders.find(f=>f.id==='legacy:'+parentId(presentation));
  row.folder=source?.id||legacy?.id||(s.setup==='imported'&&['Actor','Item'].includes(doc?.documentName)?'':s.folders.find(f=>f.category===row.kind)?.id)||'';
 }
 return rows;
}
function originalFromSources(state,origin){
 if(state.setup!=='imported')return captureOriginalStructure(state,rowsForTree(state),'initial-tome');
 const source=importStructure(seed(),nativeFolders().filter(f=>!f.pack&&['Actor','Item'].includes(f.type)),[...(game.actors?.contents||[]),...(game.items?.contents||[])]);return captureOriginalStructure(source,rowsForTree(source),origin);
}
export function treeView(layout='custom'){
 const mode=Object.hasOwn(TREE_VIEWS,layout)?layout:'custom',saved=readTree(),projected=projectTreeView(saved,rowsForTree(saved),mode),state={...saved,folders:projected.folders},rows=projected.rows,visible=new Set(),byId=new Map(state.folders.map(f=>[f.id,f]));
 for(const row of rows)for(let id=row.folder;id&&!visible.has(id);id=byId.get(id)?.parent||'')visible.add(id);
 return {viewMode:mode,editable:mode==='custom',originalOrigin:projected.origin||saved.originalStructure?.origin||'',state:{...state,folders:game.user?.isGM?state.folders:state.folders.filter(f=>visible.has(f.id)),assignments:{},localPlacements:{},folderMoveScopes:[],originalStructure:null,cleanup:game.user?.isGM?state.cleanup:[]},rows,external:[],externalGroups:[],hasFoundryStructure:nativeFolders().some(f=>!f.pack&&['Actor','Item'].includes(f.type))||[...(game.actors?.contents||[]),...(game.items?.contents||[])].some(d=>!d.pack)};
}
export function ensureOriginalStructure(){
 if(!game.user?.isGM||!raw())return Promise.resolve(false);
 const needsMigration=()=>JSON.parse(raw()).organization!=='tome';
 const current=readTree();if(!needsMigration()&&(current.setup==='pending'||current.originalStructure))return Promise.resolve(false);
 return operation(async()=>{
  const expected=raw(),state=readTree();
  if(!needsMigration()&&(state.originalStructure||state.setup==='pending'))return false;
  if(!state.originalStructure&&state.setup!=='pending')state.originalStructure=originalFromSources(state,'current-foundry');
  await save(state,expected);return true;
 });
}

let queue=Promise.resolve(),pending=0;
async function save(s,expected){gm();if(raw()!==expected)throw Error('Another change updated the World tree. Reload and try again.');s.revision++;await globalThis.ATTestAI.settings.set(ID,KEY,JSON.stringify(validateTree(s)));}
function operation(work){pending++;Hooks.callAll('adventurersTomeWorldTreeWorking');const task=queue.then(work).finally(()=>{pending--;Hooks.callAll('adventurersTomeWorldTreeWorking');Hooks.callAll('adventurersTomeWorldTreeUpdated');});queue=task.catch(()=>{});return task;}
async function place(s,uuid,id){
 let doc=rootDoc(uuid);const canonical=doc?.documentName==='JournalEntry'?rootDoc(sourceUuid(doc)):null;if(canonical){doc=canonical;uuid=doc.uuid;}
 if(!doc||!canView(doc))throw Error('The selected World entry is unavailable.');
 if(doc.documentName==='JournalEntry'&&!flag(doc,'worldProfile')&&flag(doc,'type')!=='world')throw Error('Only World entries can be moved here. Sessions and other journals keep their own sections.');
 assignEntry(s,uuid,id);s.localPlacements[uuid]=true;
}
async function cleanup(s){
 const remaining=[];for(const job of s.cleanup||[]){try{
  if(job.type!=='document')continue;
  const doc=rootDoc(job.uuid);if(doc)await doc.delete(OPTIONS);
 }catch(error){remaining.push({...job,error:String(error.message)});}}
 s.cleanup=remaining;
}
export function changeTree(action,input={}){gm();return operation(async()=>{
 gm();const expected=raw(),s=readTree();let result;
 if(s.setup==='pending'&&action!=='setup'&&!nativeFolders().some(f=>!f.pack&&['Actor','Item'].includes(f.type))&&![...(game.actors?.contents||[]),...(game.items?.contents||[])].some(d=>!d.pack))s.setup='tome';
 if(action!=='setup'&&s.setup!=='pending'&&!s.originalStructure)s.originalStructure=originalFromSources(s,'current-foundry');
 // Freeze current document placements before changing their Tome folder hierarchy.
 independentTree(s,{capture:true});
 if(action==='setup'){
  if(input.copy){Object.assign(s,importStructure(s,nativeFolders().filter(f=>!f.pack&&['Actor','Item'].includes(f.type)),[...(game.actors?.contents||[]),...(game.items?.contents||[])]));}
  else s.setup='tome';
  if(!s.originalStructure||(input.copy&&s.originalStructure.origin==='initial-tome'))s.originalStructure=originalFromSources(s,input.copy?'import':'initial-tome');
 }else if(action==='createFolder'){
  result=insertFolder(s,{...input,id:foundry.utils.randomID(),mode:'local'}).id;
 }else if(action==='renameFolder'){
  const node=folderById(s,input.id),name=String(input.name||'').trim();if(!name)throw Error('Enter a folder name.');node.name=name;
 }else if(action==='configureFolder'){
  const node=folderById(s,input.id);node.mode='local';node.category=String(input.category||node.category||'lore');
 }else if(action==='moveFolder')moveFolder(s,input);
 else if(action==='moveEntry')await place(s,input.uuid,input.folder||'');
 else if(action==='deleteFolder'){
  const node=folderById(s,input.id);if(!['keep','delete'].includes(input.contents))throw Error('Choose what happens to the contents.');
  if(input.contents==='delete'&&input.confirmed!==true)throw Error('Permanent deletion needs explicit confirmation.');
  const deleted=input.contents==='delete'?subtree(s,node.id):new Set([node.id]),rows=rowsForTree(s).filter(r=>deleted.has(r.folder));
  if(input.contents==='keep'){
   for(const child of s.folders.filter(f=>f.parent===node.id))child.parent=node.parent;
   for(const row of rows)await place(s,row.uuid,node.parent);
  }else for(const row of rows){s.cleanup.push({type:'document',uuid:row.uuid});delete s.assignments[row.uuid];delete s.localPlacements[row.uuid];}
  s.folders=s.folders.filter(f=>!deleted.has(f.id));for(const [uuid,id] of Object.entries(s.assignments))if(deleted.has(id))s.assignments[uuid]=node.parent;
 }else if(action!=='retryCleanup')throw Error('Unknown World tree operation.');
 independentTree(s,{capture:action==='setup'});await save(s,expected);
 if(s.cleanup.length&&(action==='retryCleanup'||action==='deleteFolder'&&input.contents==='delete')){const jobs=new Set(s.cleanup.map(j=>j.uuid));await cleanup(s);const latest=raw(),merged=readTree();merged.cleanup=[...(merged.cleanup||[]).filter(j=>!jobs.has(j.uuid)),...s.cleanup];await save(merged,latest);}
 return {result,tree:treeView()};
});}
export async function createEntry({folder='',kind='lore',name=''}){
 gm();const s=readTree();if(folder)folderById(s,folder);const quick=api()?.folderQuickCreate;if(!quick)throw Error('Tome creation tools are unavailable.');const bootstrap=await quick.bootstrap(),destination=bootstrap?.folders?.[kind]||bootstrap?.folders?.lore;if(!destination)throw Error('No creation folder is available.');
 const result=await quick.quickCreate(destination,{blank:true,name,initialName:name,openAfterCreate:false,awaitCreation:true,closeAfterCreate:true});if(!result)return null;
 const uuid=result.uuid||result.actor?.uuid||result.document?.uuid||result.actorUuid||result.journalUuid||result.targetUuid||result.result?.uuid;if(!uuid)throw Error('The entry was created, but the creator did not return a document identity.');
 await changeTree('moveEntry',{uuid,folder});return uuid;
}
export async function openEntry(uuid){
 const doc=rootDoc(uuid);if(!doc||!canView(doc))throw Error('This entry is not available.');const row=rowsForTree().find(r=>r.uuid===uuid),app=api()?.app?.();
 if(row?.journalId)return app?._openRefKey?.('world:'+row.journalId);
 if(doc.documentName==='Actor')return app?._openRefKey?.('actor:'+doc.id);
 if(doc.documentName==='JournalEntry')return app?._openRefKey?.('world:'+doc.id);
 if(!game.user?.isGM)throw Error('Ask your GM to prepare this item’s Tome profile.');
 // Create a presentation only when opened; the Item remains the canonical backend.
 const folders=await api().folderQuickCreate.bootstrap();const journal=await JournalEntry.create({name:doc.name,img:doc.img,folder:folders.folders.item.id,ownership:copy(doc.ownership||{}),flags:{[ID]:{type:'world',quickImportSourceUuid:doc.uuid,worldProfile:{category:'item',sourceUuid:doc.uuid,sourceDocumentType:'Item',itemId:doc.id,summary:row?.summary||'',body:'',facts:[]}}}});
 if(!journal)return;await journal.createEmbeddedDocuments?.('JournalEntryPage',[{name:'Overview',type:'text',text:{content:'',format:1}}]);return app?._openRefKey?.('world:'+journal.id);
}
Hooks.once('init',()=>globalThis.ATTestAI.settings.register(ID,KEY,{scope:'world',config:false,restricted:true,type:String,default:''}));
export const worldTreeService=Object.freeze({read:()=>game.user?.isGM?readTree():treeView().state,view:treeView,change:changeTree,createEntry,openEntry,ownsBackendDocument,ensureOriginalStructure,get busy(){return pending>0;}});
