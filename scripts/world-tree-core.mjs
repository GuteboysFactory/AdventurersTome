export const TREE_VERSION=1;
export const TYPES=['Actor','Item','JournalEntry'];
export const CATEGORIES={npc:'People',contact:'Contacts',location:'Places',faction:'Factions',item:'Items',lore:'Lore'};
export const TREE_VIEWS={original:'Original structure',content:'By content',custom:'Custom structure'};
export const copy=value=>structuredClone(value);
export const parentId=folder=>String(folder?.folder?.id??folder?.folder??'');
export function captureOriginalStructure(tree,rows,origin='import'){
 return {version:1,origin,folders:tree.folders.map(f=>({...copy(f),mode:'local',bindings:{}})),assignments:Object.fromEntries(rows.map(r=>[r.uuid,r.folder||'']))};
}
export function projectTreeView(tree,rows,mode='custom'){
 if(mode==='custom'||!Object.hasOwn(TREE_VIEWS,mode))return {folders:tree.folders,rows};
 if(mode==='original'){
  const saved=tree.originalStructure||captureOriginalStructure(tree,rows,'initial-tome'),folders=copy(saved.folders),ids=new Set(folders.map(f=>f.id));let added=false;
  const result=rows.map(row=>{const known=Object.hasOwn(saved.assignments,row.uuid),id=known?saved.assignments[row.uuid]:null;if(known&&(!id||ids.has(id)))return {...row,folder:id||''};added=true;return {...row,folder:'view:original:added'};});
  if(added)folders.push({id:'view:original:added',name:'Added later',parent:'',sort:1e9,category:'lore',mode:'local',bindings:{}});
  return {folders,rows:result,origin:saved.origin};
 }
 const labels={characters:'Characters',contact:'Contacts',location:'Locations',faction:'Factions',item:'Items',lore:'Lore',mixed:'Mixed',unclassified:'Uncategorized'},categories={characters:'npc',contact:'contact',location:'location',faction:'faction',item:'item',lore:'lore',mixed:'mixed',unclassified:'unclassified'},byId=new Map(tree.folders.map(f=>[f.id,f])),roots=new Map(),kinds=new Map();
 const bucketFor=kind=>['npc','pc','character','npc-group'].includes(kind)?'characters':Object.hasOwn(labels,kind)?kind:'unclassified';
 for(const folder of tree.folders){let root=folder;while(root.parent&&byId.has(root.parent))root=byId.get(root.parent);roots.set(folder.id,root.id);if(!kinds.has(root.id))kinds.set(root.id,new Set());}
 for(const row of rows){const root=roots.get(row.folder);if(root)kinds.get(root).add(bucketFor(row.kind));}
 const used=new Set(),buckets=new Map();for(const [root,set] of kinds){const bucket=set.size>1?'mixed':set.size?[...set][0]:'unclassified';buckets.set(root,bucket);used.add(bucket);}
 const result=rows.map(row=>{if(roots.has(row.folder))return {...row};const bucket=bucketFor(row.kind);used.add(bucket);return {...row,folder:'view:content:'+bucket};});
 const folders=tree.folders.map(folder=>{const bucket=buckets.get(roots.get(folder.id));return {...copy(folder),parent:folder.parent||'view:content:'+bucket,category:categories[bucket],mode:'local',bindings:{}};});
 Object.entries(labels).forEach(([bucket,name],sort)=>{if(used.has(bucket))folders.push({id:'view:content:'+bucket,name,parent:'',sort:sort*1000,category:categories[bucket],nodeKind:'category',mode:'local',bindings:{}});});
 return {folders,rows:result};
}
export function emptyTree(){return {version:TREE_VERSION,revision:0,setup:'pending',folders:Object.entries(CATEGORIES).map(([category,name],sort)=>({id:'category:'+category,name,parent:'',sort,category,mode:'local',bindings:{}})),assignments:{},localPlacements:{},cleanup:[]};}
export function validateTree(value){
 const s=copy(value);if(s.version!==TREE_VERSION||!Array.isArray(s.folders)||s.folders.length>10000)throw Error('Unsupported World tree.');
 if(!s.assignments||typeof s.assignments!=='object'||Array.isArray(s.assignments)||!Array.isArray(s.cleanup)||!['pending','tome','imported'].includes(s.setup))throw Error('Invalid World tree metadata.');s.localPlacements||={};
 const ids=new Set();for(const f of s.folders){if(!f.id||ids.has(f.id)||!String(f.name||'').trim()||!['local','mirror'].includes(f.mode))throw Error('Invalid or duplicate World folder.');ids.add(f.id);}
 const byId=new Map(s.folders.map(f=>[f.id,f]));
 for(const f of s.folders){if(f.parent&&!byId.has(f.parent))throw Error('The parent folder no longer exists.');const seen=new Set([f.id]);let p=f.parent;while(p){if(seen.has(p))throw Error('A folder cannot be moved inside itself.');seen.add(p);p=byId.get(p)?.parent;}if(seen.size>40)throw Error('The World tree is too deeply nested.');}
 for(const id of Object.values(s.assignments||{}))if(id&&!byId.has(id))throw Error('An entry points to a missing World folder.');
 return s;
}
export const children=(s,id)=>s.folders.filter(f=>f.parent===id).sort((a,b)=>a.sort-b.sort||a.name.localeCompare(b.name));
export function subtree(s,id){const found=new Set([id]);for(let changed=true;changed;){changed=false;for(const f of s.folders)if(found.has(f.parent)&&!found.has(f.id)){found.add(f.id);changed=true;}}return found;}
export function folderById(s,id){const f=s.folders.find(f=>f.id===id);if(!f)throw Error('This Tome folder no longer exists.');return f;}
export function insertFolder(s,{id,name,parent='',category='lore',mode='local',nodeKind='folder'}){
 if(parent)folderById(s,parent);const f={id,name:String(name||'').trim(),parent,category,mode:nodeKind==='category'?'local':mode,nodeKind:nodeKind==='category'?'category':'folder',sort:children(s,parent).length*1000,bindings:{}};s.folders.push(f);validateTree(s);return f;
}
// View-only filtering: retain ancestors and matching branches without changing saved structure.
export function visibleFolders(s,{query='',filter='all'}={}){
 const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(),q=normalize(query).trim(),byId=new Map(s.folders.map(f=>[f.id,f])),byParent=new Map();
 for(const f of s.folders){if(!byParent.has(f.parent))byParent.set(f.parent,[]);byParent.get(f.parent).push(f);}
 const textMatches=new Set(),includeBranch=id=>{if(textMatches.has(id))return;textMatches.add(id);for(const f of byParent.get(id)||[])includeBranch(f.id);};
 for(const f of s.folders)if(!q||normalize(f.name).includes(q))includeBranch(f.id);
 const visible=new Set();for(const f of s.folders){if(!textMatches.has(f.id)||!(filter==='all'||filter==='categories'&&f.nodeKind==='category'||f.category===filter))continue;for(let id=f.id;id&&!visible.has(id);id=byId.get(id)?.parent||'')visible.add(id);}
 return visible;
}
export function moveFolder(s,{id,parent='',before=''}){
 const f=folderById(s,id);if(parent)folderById(s,parent);if(before&&folderById(s,before).parent!==parent)throw Error('Choose a folder in the selected parent for the new order.');f.parent=parent;const siblings=children(s,parent).filter(r=>r.id!==id);const index=before?siblings.findIndex(r=>r.id===before):-1;siblings.splice(index<0?siblings.length:index,0,f);siblings.forEach((r,i)=>r.sort=i*1000);validateTree(s);return f;
}
export function assignEntry(s,uuid,folder=''){if(folder)folderById(s,folder);s.assignments[uuid]=folder;}
export function importStructure(current,folders,documents){
 const s=copy(current),source=folders.filter(f=>TYPES.includes(f.type)&&!f.pack),pending=[...source],maps=new Map();
 // Reuse bindings, not names alone: repeated import must preserve Tome-created folders.
 for(const f of s.folders)for(const [type,b] of Object.entries(f.bindings||{}))if(b?.id)maps.set(type+':'+b.id,f.id);
 for(let round=0;pending.length&&round<=source.length;round++){
  let progress=false;
  for(let i=pending.length-1;i>=0;i--){const src=pending[i],pid=parentId(src),parent=maps.get(src.type+':'+pid)||'';if(pid&&source.some(f=>f.type===src.type&&f.id===pid)&&!parent)continue;
   let f=s.folders.find(f=>f.id===maps.get(src.type+':'+src.id));
   if(!f&&current.setup==='pending')f=s.folders.find(f=>f.parent===parent&&f.name===src.name&&!f.bindings?.[src.type]);
   if(!f){f={id:'import:'+src.type+':'+src.id,name:src.name,parent,sort:Number(src.sort||0),category:src.type==='Actor'?'npc':src.type==='Item'?'item':'lore',mode:'local',bindings:{}};s.folders.push(f);}
   if(current.setup==='pending'&&f.id.startsWith('legacy:')){f.name=src.name;f.parent=parent;f.sort=Number(src.sort||0);}
   f.bindings||={};if(current.setup==='pending'||f.bindings[src.type]?.id!==src.id)f.bindings[src.type]={id:src.id,name:src.name,parent:pid,sort:Number(src.sort||0)};maps.set(src.type+':'+src.id,f.id);pending.splice(i,1);progress=true;
  }
  if(!progress&&pending.length)throw Error('The imported Foundry folders contain a cycle or invalid parent.');
 }
 for(const d of documents)if(!d.pack&&TYPES.includes(d.documentName)){
  // Import is explicit; a later repeat does not overwrite an intentional Tome placement.
  if(!Object.hasOwn(s.assignments,d.uuid))s.assignments[d.uuid]=maps.get(d.documentName+':'+parentId(d))||'';
 }
 s.setup='imported';return validateTree(s);
}
export function backendDifferences(s,folders){
 const byId=new Map(folders.filter(f=>!f.pack).map(f=>[f.id,f])),out=[];
 for(const f of s.folders)for(const [type,b] of Object.entries(f.bindings||{})){
  const actual=byId.get(b.id);if(!actual||actual.type!==type)out.push({folderId:f.id,type,sourceId:b.id,missing:true,name:f.name});
  else if(actual.name!==b.name||parentId(actual)!==b.parent||Number(actual.sort||0)!==Number(b.sort||0))out.push({folderId:f.id,type,sourceId:b.id,name:f.name,actualName:actual.name,actualParent:parentId(actual),actualSort:Number(actual.sort||0)});
 }
 return out;
}
