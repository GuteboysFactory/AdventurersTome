import {STORAGE_FLAG,STORAGE_KINDS,isInventoryItem,ownsInventory,storageKind,transferInventoryItem} from './inventory-transfer.mjs';

const ID='adventurers-tome';
const MIME='application/x-tome-inventory-item';
const inventorySelector='[data-at-actor-inventory], [data-rg-inventory-zone], [data-rg-inventory-container], [data-rg-inventory-unassigned], [data-rg-drop-type="gear"], .rg-workspace-gear-list, .inventory-list';
const sheets=new WeakMap();
const api=()=>game.modules.get(ID)?.api;
const dialogs=()=>foundry.applications.api.DialogV2;
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const warn=error=>ui.notifications.warn(error.message);
let storageDialog, selectedId;

function availableStorage(){
  return game.actors.contents.filter(actor=>storageKind(actor)&&actor.testUserPermission(game.user,'OBSERVER'))
    .sort((a,b)=>a.name.localeCompare(b.name));
}

function storageLabel(actor){
  return `${actor.name} · ${STORAGE_KINDS[storageKind(actor)][0]}`;
}

function storageActor(actor){
  const base=actor?.isToken?game.actors.get(actor.token?.actorId):actor;
  return storageKind(base)?base:null;
}

function renderStorage(){
  const root=storageDialog?.element?.querySelector('[data-at-storage]');
  if(!root)return;
  const actors=availableStorage();
  const actor=actors.find(row=>row.id===selectedId)||actors[0];
  selectedId=actor?.id;
  const select=root.querySelector('select');
  const options=actors.map(row=>`<option value="${esc(row.id)}">${esc(storageLabel(row))}</option>`).join('');
  const nextOptions=options||'<option value="">No storage available</option>';
  if(select.innerHTML!==nextOptions)select.innerHTML=nextOptions;
  if(actor)select.value=actor.id;
  select.disabled=!actor;
  const writable=ownsInventory(actor,game.user);
  const access=root.querySelector('[data-storage-ownership]');
  if(access)access.disabled=!actor;
  const list=root.querySelector('[data-at-storage-drop]');
  const rows=actor?.items.contents.filter(item=>isInventoryItem(item,game.system.id))||[];
  const contents=rows.map(item=>`<li><button type="button" draggable="${writable}" data-storage-item="${esc(item.id)}">
    <img src="${esc(api()?.imageSource?.(item.img)||foundry.utils.getRoute(item.img||'icons/svg/item-bag.svg'))}" alt="" draggable="false"><span>${esc(item.name)}</span>
    ${Number.isFinite(item.system?.quantity)?`<small>×${item.system.quantity}</small>`:''}</button></li>`).join('')
    ||`<li>${actor?'Empty':'No storage available'}</li>`;
  if(list.innerHTML!==contents)list.innerHTML=contents;
  root.querySelector('[data-storage-hint]').textContent=writable?'Drag items between this list and a character’s inventory.':
    actor?'You can view this inventory.':'';
}

function typeOptions(){
  return Object.entries(STORAGE_KINDS).map(([key,[name]])=>`<option value="${key}">${name}</option>`).join('');
}

async function createStorage(existing=false){
  if(!game.user.isGM)return;
  const owner=game.user.id,world=game.world.id;
  const choices=existing?game.actors.contents.filter(actor=>!storageKind(actor)):game.users.contents.filter(user=>!user.isGM);
  if(existing&&!choices.length)throw Error('There are no unassigned world Actors to use as storage.');
  const result=await dialogs().prompt({window:{title:existing?'Use an existing Actor':'New storage'},rejectClose:false,
    content:`${existing?`<label>Actor<select name="actor">${choices.map(actor=>`<option value="${esc(actor.id)}">${esc(actor.name)}</option>`).join('')}</select></label>`:
      '<label>Name<input name="storageName" required maxlength="100"></label>'}
      <label>Type<select name="kind">${typeOptions()}</select></label>
      ${!existing&&choices.length?`<fieldset><legend>Players who can move items</legend>${choices.map(user=>
        `<label><input name="owner" type="checkbox" value="${esc(user.id)}"> ${esc(user.name)}</label>`).join('')}</fieldset>`:''}`,
    ok:{label:existing?'Use actor':'Create storage',callback:(_event,button)=>{
      const form=button.form;
      if(!form.reportValidity())return;
      return {name:form.elements.storageName?.value.trim(),kind:form.elements.kind.value,actorId:form.elements.actor?.value,
        owners:new FormData(form).getAll('owner')};
    }}});
  if(!result||!game.user.isGM||game.user.id!==owner||game.world.id!==world)return;
  if(!Object.hasOwn(STORAGE_KINDS,result.kind))throw Error('Choose a storage type.');
  let actor;
  if(existing){
    actor=game.actors.get(result.actorId);
    if(!choices.includes(actor)||storageKind(actor))throw Error('This Actor is no longer available to use as storage.');
    await actor.setFlag(ID,STORAGE_FLAG,result.kind);
  }else{
    if(!result.name)throw Error('Enter a name for the storage.');
    const types=game.documentTypes.Actor||[];
    const type=['loot','npc'].find(key=>types.includes(key))||types[0];
    if(!type)throw Error('This game system has no Actor type for storage.');
    const {NONE,OWNER}=CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const ownership={default:NONE};
    for(const id of result.owners)if(game.users.get(id)&&!game.users.get(id).isGM)ownership[id]=OWNER;
    const img=STORAGE_KINDS[result.kind][1];
    actor=await getDocumentClass('Actor').create({name:result.name,type,img,ownership,
      prototypeToken:{name:result.name,actorLink:true,texture:{src:img}},flags:{[ID]:{[STORAGE_FLAG]:result.kind}}});
  }
  if(actor)selectedId=actor.id;
  renderStorage();
}

async function openStorage(actor){
  if(actor&&availableStorage().includes(actor))selectedId=actor.id;
  if(storageDialog){
    renderStorage();
    storageDialog.bringToFront();
    return;
  }
  const dialog=new (dialogs())({window:{title:'Party Storage',resizable:true},position:{width:460},classes:['at-storage-dialog'],modal:false,
    content:`<section data-at-storage><label>Storage<select></select></label><p data-storage-hint></p>
      <ul data-at-storage-drop aria-label="Stored items"></ul>
      ${game.user.isGM?'<div class="at-storage-tools"><button type="button" data-storage-new>New storage</button><button type="button" data-storage-actor>Use existing Actor</button><button type="button" data-storage-ownership>Configure access</button></div>':''}</section>`,
    buttons:[{action:'close',label:'Close',callback:()=>dialog.close()}]});
  storageDialog=dialog;
  dialog.addEventListener('render',()=>{
    const root=dialog.element.querySelector('[data-at-storage]');
    if(root.dataset.bound)return;
    root.dataset.bound='true';
    root.querySelector('select').addEventListener('change',event=>{selectedId=event.target.value;renderStorage();});
    root.querySelector('[data-storage-new]')?.addEventListener('click',()=>void createStorage().catch(warn));
    root.querySelector('[data-storage-actor]')?.addEventListener('click',()=>void createStorage(true).catch(warn));
    root.querySelector('[data-storage-ownership]')?.addEventListener('click',()=>{
      const document=game.actors.get(selectedId);
      if(game.user.isGM&&storageKind(document))new foundry.applications.apps.DocumentOwnershipConfig({document}).render({force:true});
    });
    root.querySelector('[data-at-storage-drop]').addEventListener('click',event=>{
      const id=event.target.closest('[data-storage-item]')?.dataset.storageItem;
      if(id)game.actors.get(selectedId)?.items.get(id)?.sheet.render(true);
    });
    renderStorage();
  });
  dialog.addEventListener('close',()=>{if(storageDialog===dialog)storageDialog=null;});
  try{await dialog.render({force:true});}
  catch(error){if(storageDialog===dialog)storageDialog=null;throw error;}
}

function actorSheet(_app,html){
  const actor=_app.actor||_app.document||_app.object;
  const root=html?.querySelector?html:html?.[0];
  if(actor?.documentName!=='Actor'||!root)return;
  sheets.set(root,actor);
  root.dataset.atInventoryActor='';
  const gearPage=root.querySelector('[data-rg-page="gear"]');
  const inventory=gearPage?null:root.querySelector(inventorySelector);
  const area=gearPage||inventory||(root.matches('.window-content')?root:root.querySelector('.window-content'));
  if(!area||root.querySelector('[data-at-sheet-storage]'))return;
  const tools=document.createElement('div');
  tools.dataset.atSheetStorage='';
  const button=document.createElement('button');
  button.type='button';
  button.textContent='Storage…';
  button.onclick=()=>void openStorage(storageActor(actor)).catch(warn);
  tools.append(button);
  if(ownsInventory(actor,game.user)){
    const drop=document.createElement('span');
    drop.dataset.atActorInventory='';
    drop.textContent='Drop item from storage here';
    if(game.system.id==='realm-guard'){
      drop.style.setProperty('color','#2b2115','important');
      drop.style.setProperty('-webkit-text-fill-color','currentColor','important');
    }
    tools.append(drop);
  }
  if(inventory)inventory.before(tools);
  else area.prepend(tools);
}

function sheetActor(element){
  const actor=sheets.get(element?.closest('[data-at-inventory-actor]'));
  return storageActor(actor)||actor;
}

function draggedItem(event){
  const row=event.target.closest('[data-storage-item], [data-item-id], [data-rg-gear-id]');
  if(!row)return;
  const {storageItem,itemId,rgGearId}=row.dataset;
  const actor=storageItem?game.actors.get(selectedId):sheetActor(row);
  if(ownsInventory(actor,game.user)){
    const item=actor.items.get(storageItem||itemId||rgGearId);
    if(isInventoryItem(item,game.system.id))return item;
  }
}

function dropTarget(element){
  if(element.closest('[data-at-storage-drop]'))return game.actors.get(selectedId);
  return element.closest(inventorySelector)?sheetActor(element):null;
}

function dropUuid(data){
  const own=data?.getData(MIME);
  if(own)return own;
  try{
    const drag=JSON.parse(data?.getData('text/plain')||'null');
    if(drag?.type==='Item'&&typeof drag.uuid==='string')return drag.uuid;
  }catch{ /* A native inventory sort or unrelated drop. */ }
}

async function moveFromDrop(uuid,target){
  const item=await fromUuid(uuid);
  if(!isInventoryItem(item,game.system.id))throw Error('Drag an item directly from a character or storage inventory.');
  if(await transferInventoryItem(item,target,{user:game.user,systemId:game.system.id})){
    renderStorage();
    ui.notifications.info(`Moved ${item.name} to ${target.name}.`);
  }
}

function initDrops(){
  document.addEventListener('dragstart',event=>{
    const item=draggedItem(event);
    if(item)event.dataTransfer?.setData(MIME,item.uuid);
  },true);
  document.addEventListener('dragover',event=>{
    const types=event.dataTransfer?.types||[];
    if((types.includes(MIME)||event.target.closest('[data-at-storage-drop]')&&types.includes('text/plain'))&&
      ownsInventory(dropTarget(event.target),game.user))event.preventDefault();
  },true);
  document.addEventListener('drop',event=>{
    const target=dropTarget(event.target);
    const storageList=event.target.closest('[data-at-storage-drop]');
    const own=event.dataTransfer?.getData(MIME);
    if(!target||(!own&&!storageList))return;
    const uuid=dropUuid(event.dataTransfer);
    if(!uuid)return;
    // Keep Realm Guard's native same-sheet slot arrangement in charge.
    if(!storageList&&uuid.startsWith(target.uuid+'.Item.'))return;
    if(!storageList&&!storageKind(target)&&!availableStorage().some(actor=>uuid.startsWith(actor.uuid+'.Item.')))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void moveFromDrop(uuid,target).catch(warn);
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-at-open-storage]'))void openStorage().catch(warn);
  });
}

Hooks.once('ready',()=>{
  const tome=api();
  if(tome)tome.inventoryStorage=Object.freeze({open:openStorage});
  initDrops();
});
Hooks.on('renderApplicationV2',actorSheet);
Hooks.on('renderApplication',actorSheet);
Hooks.on('renderTokenHUD',(hud,html)=>{
  const actor=storageActor(hud.object?.actor);
  const root=html?.querySelector?html:html?.[0];
  if(!actor||!actor.testUserPermission(game.user,'OBSERVER')||root?.querySelector('[data-at-token-storage]'))return;
  const column=root?.querySelector('.col.left,.left');
  if(!column)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='control-icon';
  button.dataset.atTokenStorage='';
  button.title='Open storage';
  button.setAttribute('aria-label','Open storage');
  button.innerHTML='<i class="fa-solid fa-box-open" aria-hidden="true"></i>';
  button.onclick=event=>{event.stopPropagation();void openStorage(actor).catch(warn);};
  column.append(button);
});
for(const hook of ['createActor','updateActor','deleteActor','createItem','updateItem','deleteItem'])Hooks.on(hook,renderStorage);
