import {searchRows,calculate,captureTextTarget,keybindMatches} from './quick-search-core.mjs';
const ID='adventurers-tome',api=()=>game.modules.get(ID)?.api,types=['Actor','Item','JournalEntry','Scene','RollTable','Macro'];
const esc=v=>foundry.utils.escapeHTML(String(v??''));
let calcHistory=[],dialog=null,opening=null,rows=[],indexEpoch=0,indexed=false,refreshTimer;
const visible=doc=>Boolean(doc&&(game.user?.isGM||doc.visible!==false&&doc.testUserPermission?.(game.user,'LIMITED')===true));
function permitted(row){if(row.packId){const pack=game.packs.get(row.packId);return Boolean(pack&&(pack.visible||game.user.isGM));}return visible(fromUuidSync(row.documentUuid||row.uuid.split('#')[0]));}
function meta(doc,extra={}){return {uuid:doc.uuid,name:doc.name,type:doc.documentName,subtype:doc.type||'',img:doc.img,folderId:doc.folder?.id||'',folder:doc.folder?.name||'',source:'World',...extra};}
function worldRows(){const result=[];for(const type of types){const collection=CONFIG[type]?.collection?.instance;for(const doc of collection?.contents||[]){if(!visible(doc))continue;result.push(meta(doc));if(type==='JournalEntry')for(const page of doc.pages?.contents||[])if(visible(page)){
 result.push(meta(page,{folder:doc.folder?.name||'',folderId:doc.folder?.id||'',source:doc.name}));
 if(game.settings.get(ID,'quickSearchHeadings'))for(const heading of Object.values(page.toc||{}))if(heading.slug&&heading.text)result.push(meta(page,{uuid:page.uuid+'#'+heading.slug,name:heading.text,anchor:heading.slug,documentUuid:page.uuid,source:doc.name+' / '+page.name}));
 }} }
 const byUuid=new Map(result.map(r=>[r.uuid,r])),linked=new Set();for(const row of result){if(row.type!=='JournalEntry')continue;const doc=fromUuidSync(row.uuid),profile=doc?.getFlag(ID,'worldProfile'),projection=doc?.getFlag(ID,'semanticProjection');if(!['contact','npc'].includes(profile?.category)&&projection?.kind!=='contact')continue;const identity=doc?.getFlag(ID,'knownPersonV1')?.actorUuid||projection?.linkedUuid||profile?.sourceUuid||(profile?.actorId?'Actor.'+profile.actorId:''),actor=byUuid.get(identity);if(actor?.type!=='Actor')continue;(actor.related||=[]).push(row);(actor.aliases||=[]).push(row.name);linked.add(row.uuid);actor.source='World · Actor + linked entries';}return result.filter(r=>!linked.has(r.uuid));}
async function buildIndex(paint){
 const epoch=++indexEpoch;rows=worldRows();paint('Searching world · loading compendiums…');
 const excluded=new Set(String(game.settings.get(ID,'quickSearchExcludedPacks')||'').split(',').map(s=>s.trim()));
 for(const pack of game.packs.contents||[...game.packs.values()]){
  if(epoch!==indexEpoch||!dialog?.rendered)return;
  if(!types.includes(pack.documentName)||excluded.has(pack.collection)||(!pack.visible&&!game.user.isGM))continue;
  try{const index=await pack.getIndex({fields:['name','img','type','pages.name','pages.type']});if(epoch!==indexEpoch)return;
   for(const doc of index){const uuid=`Compendium.${pack.collection}.${doc._id}`;rows.push({uuid,name:doc.name,img:doc.img,type:pack.documentName,subtype:doc.type||'',packId:pack.collection,source:pack.title||pack.metadata.label});
    if(pack.documentName==='JournalEntry')for(const page of doc.pages||[])if(page._id)rows.push({uuid:uuid+'.JournalEntryPage.'+page._id,name:page.name,type:'JournalEntryPage',subtype:page.type,packId:pack.collection,source:(pack.title||pack.collection)+' / '+doc.name});
   }
  }catch(error){console.warn('Tome Quick Search: compendium could not be indexed',pack.collection,error);}
  paint('Loading compendiums…');await new Promise(r=>setTimeout(r,0));
 }
 if(epoch===indexEpoch){indexed=true;paint('Index ready');}
}
function proseTarget(view){const before=view.state.doc,selection=view.state.selection;return {label:'Insert link',text:before.textBetween(selection.from,selection.to,' '),insert(text){if(view.isDestroyed||!view.state.doc.eq(before))throw Error('The editor changed. Reopen Quick Search from the editor.');view.dispatch(view.state.tr.insertText(text,selection.from,selection.to));view.focus();}};}
const link=row=>`@UUID[${row.documentUuid||row.uuid}${row.anchor?'#'+row.anchor:''}]{${String(row.name).replace(/[{}\r\n]/g,'')}}`;
async function resolve(row){if(!permitted({...row,uuid:row.documentUuid||row.uuid.split('#')[0]}))throw Error('This document is no longer available to you.');const doc=await fromUuid(row.documentUuid||row.uuid.split('#')[0]);if(!visible(doc))throw Error('This document is no longer available to you.');return doc;}
async function copy(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw Error('Copy is unavailable. Select the link manually.');}
function actions(row,target){
 const result=[{id:'open',label:'Open'}];if(row.related?.length)result.push({id:'related',label:'Linked entries…'});if(target)result.unshift({id:'insert',label:target.label});
 if(game.user.isGM){
  if(['Actor','JournalEntry'].includes(row.type))result.push({id:'tome',label:'Open in Tome'});
  if(row.type==='Actor')result.push({id:'place',label:'Place token…'});
  if(row.type==='Scene')result.push({id:'view',label:'View scene'},{id:'activate',label:'Activate scene'});
  if(row.type==='Macro')result.push({id:'execute',label:'Execute macro'});
  if(row.type==='RollTable')result.push({id:'roll',label:'Draw result'},...(target?[{id:'rollInsert',label:'Roll and insert'}]:[]));
  if(!row.packId&&['Actor','JournalEntry'].includes(row.type))result.push({id:'ownership',label:'Configure ownership…'});
 }
 if(row.owned)result.push({id:'use',label:'Use / system action…'});
 result.push({id:'copy',label:'Copy link'});return result;
}
async function perform(row,action,target){
 const doc=await resolve(row);
 if(['place','view','activate','execute','roll','rollInsert','ownership'].includes(action)&&!game.user.isGM)throw Error('This action requires a GM.');
 if(action==='related'){const uuid=await foundry.applications.api.DialogV2.prompt({window:{title:'Linked entries'},content:`<label>Entry<select name="entry">${row.related.map(r=>`<option value="${esc(r.uuid)}">${esc(r.name)} · ${esc(r.type)} · ${esc(r.uuid)}</option>`).join('')}</select></label>`,ok:{label:target?'Insert entry link':'Open entry',callback:(_e,_b,d)=>d.element.querySelector('select').value},rejectClose:false});const related=row.related.find(r=>r.uuid===uuid);if(related){const entry=await resolve(related);if(target)target.insert(link(related));else await entry.sheet?.render(true);}}
 else if(action==='insert'){if(!target)throw Error('Open Quick Search from an editable field first.');target.insert(link(row));}
 else if(action==='copy')await copy(link(row));
 else if(action==='tome')await api().entityIntelligence.open(doc.uuid,api().app());
 else if(action==='ownership'){
  const people=api().peopleWorkspace.rows().find(p=>p.documents.some(d=>d.uuid===doc.uuid));
  if(people)await api().peopleWorkspace.configure(doc);else new foundry.applications.apps.DocumentOwnershipConfig({document:doc}).render({force:true});
 }
 else if(action==='view')await doc.view();else if(action==='activate')await doc.activate();else if(action==='execute')await doc.execute();else if(action==='roll')await doc.draw();
 else if(action==='rollInsert'){
  const result=await doc.roll(),texts=[];for(const r of result.results){const uuid=r.documentUuid;if(uuid)texts.push(`@UUID[${uuid}]`);else if(r.documentId){const collection=r.documentCollection;texts.push(`@UUID[${collection?.includes('.')?'Compendium.':''}${collection}.${r.documentId}]`);}else texts.push(r.text||r.description||'');}target.insert(texts.join(', '));
 }
 else if(action==='place'){
  if(!canvas?.ready||!canvas.scene)throw Error('Open a scene before placing a token.');const sceneId=canvas.scene.id,board=document.getElementById('board');ui.notifications.info('Click the scene to place '+doc.name+'. Escape cancels.');await dialog.close();
  await new Promise((resolvePromise,reject)=>{const cleanup=()=>{board.removeEventListener('pointerdown',place,true);document.removeEventListener('keydown',cancel,true);clearTimeout(timer);};const cancel=e=>{if(e.key==='Escape'){cleanup();resolvePromise();}};
   const place=async e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();cleanup();try{if(!game.user.isGM||canvas.scene?.id!==sceneId)throw Error('The scene or permissions changed.');await resolve(row);const p=canvas.canvasCoordinatesFromClient({x:e.clientX,y:e.clientY});if(!canvas.dimensions.rect.contains(p.x,p.y))throw Error('Choose a point inside the scene.');await canvas.tokens._onDropActorData(e,{...doc.toDragData(),type:'Actor',uuid:doc.uuid,x:p.x,y:p.y});resolvePromise();}catch(error){reject(error);}};
   const timer=setTimeout(()=>{cleanup();resolvePromise();},60000);board.addEventListener('pointerdown',place,true);document.addEventListener('keydown',cancel,true);
  });
 }
 else if(action==='use'){
  if(!doc.isOwner)throw Error('You need ownership to use this item.');const adapters=api().adapters,available=await adapters?.actions?.(doc,{context:{source:'quick-search'}})||[];
  if(available.length){const key=await foundry.applications.api.DialogV2.prompt({window:{title:'Choose system action'},content:`<label>Action<select name="action">${available.map(a=>`<option value="${esc(a.key)}">${esc(a.label)}</option>`).join('')}</select></label>`,ok:{label:'Run action',callback:(_e,_b,d)=>d.element.querySelector('select').value},rejectClose:false});if(key){if(!doc.isOwner)throw Error('Ownership changed.');await adapters.invokeAction(key,{source:doc,context:{source:'quick-search'}});}}
  else if(typeof doc.use==='function')await doc.use();else await doc.sheet?.render(true);
 }
 else if(row.anchor)await doc._onClickDocumentLink({currentTarget:{dataset:{hash:row.anchor},getAttribute:()=>row.anchor},target:{closest:()=>({ownerDocument:document})}});else await doc.sheet?.render(true);
}
export function openQuickSearch(options={}){
 if(opening)return opening;opening=createQuickSearch(options);return opening.finally(()=>{opening=null;});
}
async function createQuickSearch(options={}){
 if(!game.user?.isGM)throw Error('Tome Quick Search is currently a GM tool.');
 if(dialog){if(dialog.rendered&&!dialog.element?.classList.contains('minimizing')){dialog.bringToFront();return dialog;}await dialog.close({animate:false});}
 const target=options.target||captureTextTarget(document.activeElement),selectedText=target?.text||document.getSelection()?.toString()||'';
 const stamp=game.user.id,context=target;let results=[],selection=0,actionIndex=0,status='Index ready',query=options.query??selectedText,locked=false,limit=60;
 dialog=new foundry.applications.api.DialogV2({window:{title:'Tome Quick Search',resizable:true},position:{width:730,top:100},classes:['at-quick-search'],form:{closeOnSubmit:false},content:'<section class="at-qs"><label>Find campaign content<input type="search" data-query placeholder="Search · @ filters · ? help" autocomplete="off" autofocus></label><div class="at-qs-filters"><label>Type<select data-type><option value="">All types</option></select></label><label>Folder<select data-folder><option value="">All folders</option></select></label><label>Compendium<select data-pack><option value="">World &amp; compendiums</option></select></label><button type="button" data-reindex>Rebuild index</button></div><p data-status role="status"></p><div data-results role="listbox" aria-label="Search results"></div><div class="at-qs-footer"><span>↑ ↓ Select · Tab Action · Enter Use · Shift Keep open</span><button type="button" data-more>More results</button></div></section>',buttons:[{action:'close',label:'Close',callback:()=>dialog.close()}]});
 const app=dialog;
 const nativeClose=app.close.bind(app);app.close=options=>nativeClose({...options,animate:false});
 const availableActions=row=>row.mode==='audio'?[{id:'toggle',label:row.source==='Playing'?'Stop':'Play'},{id:'previous',label:'Previous'},{id:'next',label:'Next'}]:row.mode?[{id:'run',label:'Select'}]:options.onSubmit?[{id:'select',label:'Select'}]:actions(row,context);
 app.addEventListener('render',()=>{
  const root=app.element,input=root.querySelector('[data-query]'),list=root.querySelector('[data-results]'),type=root.querySelector('[data-type]'),folder=root.querySelector('[data-folder]'),pack=root.querySelector('[data-pack]');input.value=query;
  type.insertAdjacentHTML('beforeend',(options.restrictTypes||[...types,'JournalEntryPage','NPC','Contact','Private Vault']).map(t=>`<option>${t}</option>`).join(''));
  folder.insertAdjacentHTML('beforeend',game.folders.contents.map(f=>`<option value="${esc(f.id)}">${esc(f.name)} · ${esc(f.type)}</option>`).join(''));
  pack.insertAdjacentHTML('beforeend',[...game.packs.values()].filter(p=>p.visible||game.user.isGM).map(p=>`<option value="${esc(p.collection)}">${esc(p.title)}</option>`).join(''));
  const paint=(message=status)=>{
   status=message;if(!root.isConnected)return;if(!game.user.isGM||game.user.id!==stamp){void app.close();return;}
   const known=new Set([...type.options].map(o=>o.value));for(const row of rows){if(row.subtype&&!known.has(row.subtype)&&(!options.restrictTypes||options.restrictTypes.includes(row.type))){known.add(row.subtype);const option=document.createElement('option');option.value=row.subtype;option.textContent=row.type+' · '+row.subtype;type.append(option);}}
   const text=input.value.trim();let source=rows,term=text,mode='documents';
   if(type.value==='Private Vault'){
    mode='vault';const unlocked=api().securePrivateVault?.unlocked();
    const privateRows=unlocked?api().privateVaultEntries().flatMap(entry=>entry.notes.map(note=>({name:note.title||'GM Note',aliases:[note.body||''],source:entry.name,sourceUuid:entry.uuid,mode:'vault'}))):[];
    results=searchRows(privateRows,text,{max:limit});if(!unlocked)message='Unlock Private Vault to search your private notes';
   }
   else if(text.startsWith('?')){mode='help';results=[['@','Choose filters'],['!','Search items in selected characters'],['#','Control playlists'],['=','Calculate numbers'],['/','Run a chat command'],['>','Find a keyboard command']].map(([name,source])=>({name,source,mode:'help'}));}
   else if(text.startsWith('=')){mode='calculate';try{results=[{name:String(calculate(text.slice(1))),source:text.slice(1),mode:'calculate'}];}catch{results=text==='='?calcHistory:[];}}
   else if(text.startsWith('#')){mode='audio';results=game.playlists.contents.filter(visible).filter(p=>p.name.toLocaleLowerCase().includes(text.slice(1).trim().toLocaleLowerCase())).map(p=>({name:p.name,source:p.playing?'Playing':'Stopped',mode:'audio',id:p.id}));}
   else if(text.startsWith('>')){mode='command';results=[...game.keybindings.actions.entries()].filter(([,c])=>c.editable&&(!c.restricted||game.user.isGM)).map(([id,c])=>({id,name:game.i18n.localize(c.name),source:id,mode:'command',config:c})).filter(r=>r.name.toLocaleLowerCase().includes(text.slice(1).trim().toLocaleLowerCase())).slice(0,limit);}
   else if(text.startsWith('/')){mode='slash';results=[{name:text,source:'Send using Foundry chat',mode:'slash'}];}
   else if(text.startsWith('@')){mode='filter';results=[...type.options].filter(o=>o.value&&o.textContent.toLocaleLowerCase().includes(text.slice(1).trim().toLocaleLowerCase())).map(o=>({name:o.textContent,value:o.value,source:'Filter by type',mode:'filter'}));}
   else{
    if(text.startsWith('!')){term=text.slice(1);const actors=canvas?.tokens?.controlled?.length?canvas.tokens.controlled.map(t=>t.actor):[game.user.character];source=actors.filter(visible).flatMap(a=>(a.items?.contents||[]).filter(visible).map(d=>meta(d,{owned:true,source:a.name})));}
    const requested=type.value;if(requested==='Contact')source=source.flatMap(r=>r.related?.length?[r,...r.related]:[r]);results=searchRows(source,term,{type:['NPC','Contact'].includes(requested)?'':requested,folder:folder.value,pack:pack.value,max:limit,allow:r=>permitted(r)&&(!options.restrictTypes||options.restrictTypes.includes(r.type))&&(requested!=='NPC'||r.type==='Actor'&&(String(game.settings.get(ID,'peopleNpcActorTypes')).split(',').map(t=>t.trim()).includes(r.subtype)||fromUuidSync(r.uuid)?.getFlag(ID,'worldProfile')?.category==='npc'))&&(requested!=='Contact'||r.type==='JournalEntry'&&fromUuidSync(r.uuid)?.getFlag(ID,'worldProfile')?.category==='contact')});
   }
   selection=Math.min(selection,Math.max(0,results.length-1));root.querySelector('[data-status]').textContent=`${results.length} results · ${message}${context?' · Insert mode':''}`;
   list.innerHTML=results.map((row,i)=>{const available=availableActions(row);if(i===selection)actionIndex=Math.min(actionIndex,available.length-1);return `<article role="option" aria-selected="${i===selection}" data-row="${i}" class="${i===selection?'active':''}"><button type="button" draggable="${!row.mode}" data-pick="${i}"><strong>${esc(row.name)}</strong><small>${esc(row.type||'')} · ${esc(row.source)}${row.folder?' / '+esc(row.folder):''}</small></button><div class="at-qs-actions">${available.map((a,j)=>`<button type="button" data-do="${i}" data-action="${a.id}" class="${i===selection&&j===actionIndex?'chosen':''}">${esc(a.label)}</button>`).join('')}</div></article>`;}).join('')||'<p>No matching results.</p>';
   root.querySelector('[data-more]').hidden=!['documents','vault'].includes(mode)||results.length<limit;
  };
  const act=async(index,action,keep)=>{
   if(locked)return;const row=results[index];if(!row)return;locked=true;
   try{
    if(game.user.id!==stamp||!game.user.isGM)throw Error('Your GM permissions changed.');
    if(row.mode==='help'){input.value=row.name;paint();input.focus();return;}
    if(row.mode==='filter'){type.value=row.value||row.name;input.value='';paint();input.focus();return;}
    if(row.mode==='calculate'){calcHistory=[{...row},...calcHistory.filter(r=>r.source!==row.source)].slice(0,10);input.value='='+row.name;paint();return;}
    if(row.mode==='audio'){const p=game.playlists.get(row.id);if(!visible(p))throw Error('Playlist unavailable.');if(action==='previous'||action==='next')await p.playNext(undefined,{direction:action==='previous'?-1:1});else await(p.playing?p.stopAll():p.playAll());paint();return;}
    if(row.mode==='vault'){if(!api().securePrivateVault?.unlocked())throw Error('Unlock Private Vault before opening a private note.');api().app()._vaultSelectedUuid=row.sourceUuid;await api().privateVaultWorkspace.open();}
    else if(row.mode==='slash')await ui.chat.processMessage(row.name);
    else if(row.mode==='command'){const command=game.keybindings.actions.get(row.id);if(!command)throw Error('This command is no longer available.');await command.onDown?.({event:new KeyboardEvent('keydown'),isControl:false,isShift:false,isAlt:false});}
    else if(options.onSubmit){await resolve(row);await options.onSubmit(row);}
    else await perform(row,action,context);
    if(!keep&&app.rendered)await app.close();else if(app.rendered){paint();input.focus();}
   }catch(error){ui.notifications.error(error.message);}finally{locked=false;}
  };
  app._quickSearchPaint=paint;
  input.oninput=()=>{selection=0;actionIndex=0;limit=60;paint();};for(const el of [type,folder,pack])el.onchange=()=>{selection=0;paint();};
  input.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selection=(selection+(e.key==='ArrowDown'?1:-1)+results.length)%Math.max(1,results.length);actionIndex=0;paint();root.querySelector(`[data-row="${selection}"]`)?.scrollIntoView({block:'nearest'});}else if(e.key==='Tab'&&results.length){e.preventDefault();const row=results[selection];actionIndex=(actionIndex+1)%availableActions(row).length;paint();}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();const row=results[selection];void act(selection,row?availableActions(row)[actionIndex]?.id:undefined,e.shiftKey);}};
  list.onclick=e=>{const b=e.target.closest('[data-pick],[data-do]');if(!b)return;const i=Number(b.dataset.pick??b.dataset.do),row=results[i];void act(i,b.dataset.action||availableActions(row)[0]?.id,e.shiftKey);};
  list.ondragstart=e=>{const b=e.target.closest('[data-pick]'),row=results[Number(b?.dataset.pick)];if(!row||row.mode||!permitted(row))return e.preventDefault();e.dataTransfer.setData('text/plain',JSON.stringify({type:row.type,uuid:row.documentUuid||row.uuid}));};
  root.querySelector('[data-more]').onclick=()=>{limit+=60;paint();};root.querySelector('[data-reindex]').onclick=()=>{indexed=false;void buildIndex(paint);};
  if(indexed){rows=[...worldRows(),...rows.filter(r=>r.packId)];paint();}else void buildIndex(paint);input.focus();
 });
 app.addEventListener('close',()=>{if(dialog===app){dialog=null;indexEpoch++;if(!indexed)rows=[];}},{once:true});await app.render({force:true});return app;
}
Hooks.once('init',()=>{
 game.keybindings.register(ID,'quickSearch',{name:'Tome Quick Search',hint:'Find and use campaign content.',editable:[{key:'Space',modifiers:['Control','Shift']}],restricted:true,onDown:()=>{void openQuickSearch().catch(e=>ui.notifications.error(e.message));return true;}});
 game.settings.register(ID,'quickSearchExcludedPacks',{scope:'world',config:true,type:String,default:'',name:'Quick Search: excluded compendiums',hint:'Comma-separated compendium IDs. Rebuild the search index after changing this.'});
 game.settings.register(ID,'quickSearchHeadings',{scope:'client',config:true,type:Boolean,default:false,name:'Quick Search: journal headings',hint:'Include headings from journals in this world.'});
});
Hooks.on('createProseMirrorEditor',(_uuid,plugins)=>{if(!globalThis.ProseMirror?.Plugin)return;plugins.tomeQuickSearch=new ProseMirror.Plugin({props:{handleKeyDown(view,event){if(!game.user?.isGM||!keybindMatches(event,game.keybindings.bindings.get(ID+'.quickSearch')))return false;event.preventDefault();void openQuickSearch({target:proseTarget(view)}).catch(e=>ui.notifications.error(e.message));return true;}}});});
Hooks.once('ready',()=>{api().quickSearch=Object.freeze({open:openQuickSearch,rebuild:()=>{indexed=false;if(dialog?.rendered)return buildIndex(dialog._quickSearchPaint);}});api().gmDock?.registerAction('quick-search',{icon:'fa-magnifying-glass',title:'Quick Search',label:'Quick Search',handler:()=>openQuickSearch()});document.addEventListener('click',e=>{if(e.target.closest('[data-at-quick-search]')){e.preventDefault();void openQuickSearch().catch(error=>ui.notifications.error(error.message));}});});
for(const type of [...types,'JournalEntryPage'])for(const event of ['create','update','delete'])Hooks.on(event+type,()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{rows=[...worldRows(),...rows.filter(r=>r.packId)];dialog?._quickSearchPaint?.();},100);});
Hooks.on('updateCompendium',()=>{indexed=false;});
Hooks.on('updateUser',()=>{if(!game.user?.isGM)void dialog?.close();else dialog?._quickSearchPaint?.();});
Hooks.on('adventurersTomeVaultLockChanged',()=>dialog?._quickSearchPaint?.());
function sheetSearch(app,element){
 const actor=app.actor||app.document;if(!game.user?.isGM||actor?.documentName!=='Actor'||actor.pack||typeof app._onDrop!=='function')return;
 const root=element instanceof HTMLElement?element:element?.[0],header=root?.querySelector('.window-header');if(!header||header.querySelector('[data-at-quick-items]'))return;
 const button=document.createElement('button');button.type='button';button.dataset.atQuickItems='';button.className='header-control icon';button.setAttribute('aria-label','Find items with Tome');button.title='Find items with Tome';button.innerHTML='<i class="fa-solid fa-magnifying-glass"></i>';
 button.onclick=e=>{e.preventDefault();e.stopPropagation();void openQuickSearch({query:'',restrictTypes:['Item'],onSubmit:async row=>{
  if(!game.user?.isGM||!actor.isOwner||!app.rendered||fromUuidSync(actor.uuid)!==actor)throw Error('The character sheet or ownership changed. Reopen the search from the sheet.');
  const item=await resolve(row);if(item.documentName!=='Item')throw Error('Choose an Item for this character.');
  const transfer=new DataTransfer();transfer.setData('text/plain',JSON.stringify({type:'Item',uuid:item.uuid}));
  await app._onDrop({dataTransfer:transfer,target:root.querySelector('.window-content')||root,currentTarget:root,preventDefault(){},stopPropagation(){},shiftKey:false,altKey:false});
 }}).catch(error=>ui.notifications.error(error.message));};header.append(button);
}
Hooks.on('renderApplicationV2',sheetSearch);
Hooks.on('renderApplication',sheetSearch);
Hooks.once('ready',()=>document.addEventListener('keydown',event=>{
 if(event.repeat||!game.user?.isGM||!['INPUT','TEXTAREA'].includes(event.target?.tagName)||event.target.closest('.at-quick-search')||!keybindMatches(event,game.keybindings.bindings.get(ID+'.quickSearch')))return;
 const target=captureTextTarget(event.target);if(!target)return;event.preventDefault();event.stopPropagation();void openQuickSearch({target}).catch(error=>ui.notifications.error(error.message));
},true));
