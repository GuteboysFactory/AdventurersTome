import {ownershipLevel,ownershipLevels} from './people-ownership.mjs';

const ID='adventurers-tome';
const types=['Actor','Item','JournalEntry','Scene','RollTable','Cards'];
const views=new Map(), mounted=new WeakSet();
const tome=()=>game.modules.get(ID)?.api;
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const dialog=()=>foundry.applications.api.DialogV2;
const fail=error=>ui.notifications.error(error.message);
const scope=()=>`${game.world.id}:${game.user.id}`;

function ownershipRows(entry){
  return game.users.contents.filter(user=>!user.isGM).map(user=>{
    const level=ownershipLevels[ownershipLevel(entry.ownership,user.id)]||'None';
    const inTome=tome()?.usesTomeAccess?.(entry)?` · ${tome().canView(entry,user)?'Visible':'Hidden'} in Tome`:'';
    return `<li><strong>${esc(user.name)}</strong> · ${level}${inTome}</li>`;
  }).join('') || '<li>No player accounts</li>';
}

function whoCanSee(documents){
  if(!game.user.isGM || !documents.length)return;
  return dialog().prompt({classes:['at-twt-ownership-dialog'],position:{width:480},rejectClose:false,
    window:{title:'Who can see?'},content:documents.map(entry=>`<h4>${esc(entry.name)}</h4><ul>${ownershipRows(entry)}</ul>`).join(''),
    ok:{label:'Close'}});
}

async function runBulk(action,collection,ids){
  if(!game.user.isGM)return;
  const stamp=scope();
  const selected=()=>[...ids].map(id=>collection.get(id)).filter(doc=>doc&&!doc.pack&&!doc.parent);
  const documents=selected();
  if(!documents.length)return;
  const type=documents[0].documentName;
  const list=documents.map(doc=>`<li>${esc(doc.name)}</li>`).join('');
  const reviewed=()=>{
    const live=selected();
    if(live.length!==documents.length||live.some((item,i)=>item!==documents[i]))throw Error('The selection changed. Review it again.');
    return live;
  };
  if(action==='who')return whoCanSee(documents);
  if(action==='ownership')return tome()?.peopleWorkspace?.configureWorld(documents);
  if(action==='export') {
    const data={format:'adventurers-tome-directory-export',version:1,type,documents:documents.map(doc=>doc.toObject())};
    return foundry.utils.saveDataToFile(JSON.stringify(data,null,2),'application/json',`tome-${type.toLowerCase()}-selection.json`);
  }
  if(action==='move') {
    const folders=game.folders.contents.filter(folder=>folder.type===type&&!folder.pack);
    const path=folder=>[...folder.getParentFolders().reverse().map(parent=>parent.name),folder.name].join(' / ');
    const options=folders.sort((a,b)=>path(a).localeCompare(path(b))).map(folder=>`<option value="${esc(folder.id)}">${esc(path(folder))}</option>`).join('');
    const destination=await dialog().prompt({classes:['at-twt-ownership-dialog'],rejectClose:false,window:{title:`Move ${documents.length} entries`},
      content:`<label>Destination<select name="folder"><option value="">Directory root</option>${options}</select></label><ul>${list}</ul>`,
      ok:{label:'Move',callback:(_e,_b,d)=>d.element.querySelector('[name="folder"]').value}});
    if(typeof destination!=='string'||!game.user.isGM||scope()!==stamp)return;
    const folder=destination&&game.folders.get(destination);
    if(destination&&(!folder||folder.type!==type||folder.pack))throw Error('The folder is no longer available.');
    await collection.documentClass.updateDocuments(reviewed().map(doc=>({_id:doc.id,folder:destination||null})));
  } else if(action==='delete') {
    const yes=await dialog().confirm({classes:['at-twt-ownership-dialog'],rejectClose:false,window:{title:`Delete ${documents.length} entries permanently?`},content:`<ul>${list}</ul>`,yes:{label:'Delete selected'}});
    if(!yes||!game.user.isGM||scope()!==stamp)return;
    await collection.documentClass.deleteDocuments(reviewed().map(doc=>doc.id));
    ids.clear();
  }
}

function decorate(app,html){
  if(!game.user?.isGM)return;
  const root=html?.querySelector?html:html?.[0];
  const collection=app.collection;
  const list=root?.querySelector('.directory-list');
  if(!list||!collection||!types.includes(app.documentName)||game.packs.get(collection.collection)===collection)return;
  const key=`${scope()}:${app.documentName}`;
  const state=views.get(key)||{ids:new Set(),selecting:false};views.set(key,state);
  for(const id of state.ids)if(!collection.get(id))state.ids.delete(id);
  let bar=root.querySelector('[data-tome-directory-tools]');
  if(!bar){bar=document.createElement('div');bar.dataset.tomeDirectoryTools='';list.before(bar);}
  function renderBar(){
    const selection=state.ids.size;
    bar.innerHTML=`<button type="button" data-tome-directory-action="toggle" aria-pressed="${state.selecting}">${state.selecting?'Close selection':'Select entries'}</button>${state.selecting?`
      <span role="status">${selection} selected</span><div class="at-directory-batch">
      ${[['who','Who can see?'],['ownership','Review access'],['move','Move'],['export','Export'],['delete','Delete']].map(([key,label])=>`<button type="button" data-tome-directory-action="${key}" ${selection?'':'disabled'}>${label}</button>`).join('')}
      </div>`:''}`;
    for(const input of list.querySelectorAll('[data-tome-directory-check]')){
      input.hidden=!state.selecting;input.checked=state.ids.has(input.dataset.tomeDirectoryCheck);
    }
  }
  for(const row of list.querySelectorAll('.directory-item[data-entry-id]')){
    const entry=collection.get(row.dataset.entryId);
    if(!entry||entry.pack)continue;
    if(!row.querySelector('[data-tome-directory-check]')){
      const box=document.createElement('input');box.type='checkbox';box.dataset.tomeDirectoryCheck=entry.id;
      box.setAttribute('aria-label',`Select ${entry.name}`);row.prepend(box);
    }
    let badge=row.querySelector('[data-tome-directory-who]');
    if(!badge){badge=document.createElement('button');badge.type='button';badge.dataset.tomeDirectoryWho=entry.id;row.append(badge);}
    const players=game.users.contents.filter(user=>!user.isGM);
    const permission=entry.documentName==='Scene'?'LIMITED':'OBSERVER';
    const count=players.filter(user=>(entry.documentName==='Scene'&&entry.active||entry.testUserPermission(user,permission))&&(!tome()?.usesTomeAccess?.(entry)||tome().canView(entry,user))).length;
    badge.title=`Who can see ${entry.name}?`;
    badge.setAttribute('aria-label',`${badge.title} ${count} of ${players.length} players`);
    badge.innerHTML=`<i class="fa-solid fa-eye" aria-hidden="true"></i> ${count}`;
  }
  renderBar();
  bar.onclick=event=>{
    const button=event.target.closest('[data-tome-directory-action]');
    if(!button)return;
    const action=button.dataset.tomeDirectoryAction;
    if(action==='toggle'){
      state.selecting=!state.selecting;
      if(!state.selecting)state.ids.clear();
      renderBar();bar.querySelector('[data-tome-directory-action="toggle"]').focus();
    }else void runBulk(action,collection,new Set(state.ids)).then(()=>{
      for(const id of state.ids)if(!collection.get(id))state.ids.delete(id);
      renderBar();
    }).catch(fail);
  };
  if(mounted.has(list))return;
  mounted.add(list);
  list.addEventListener('click',event=>{
    const badge=event.target.closest('[data-tome-directory-who]');
    const check=event.target.closest('[data-tome-directory-check]');
    if(!badge&&!check)return;
    event.stopPropagation();
    if(badge){const entry=collection.get(badge.dataset.tomeDirectoryWho);if(entry)void whoCanSee([entry]).catch(fail);}
  });
  list.addEventListener('change',event=>{
    const box=event.target.closest('[data-tome-directory-check]');
    if(!box||!state.selecting||!game.user.isGM)return;
    if(box.checked)state.ids.add(box.dataset.tomeDirectoryCheck);else state.ids.delete(box.dataset.tomeDirectoryCheck);
    renderBar();
  });
}

Hooks.on('renderDocumentDirectory',decorate);
