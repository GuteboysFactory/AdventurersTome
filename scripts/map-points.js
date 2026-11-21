const ID='adventurers-tome';
const ART='modules/adventurers-tome/assets/';
const REALM_ART='systems/realm-guard/assets/ui/map-icons/';
const FLAG='mapMarkerVisible';
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const normalize=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const typeLabels={gear:'Gear / item',role:'Skill',trait:'Trait',wise:'Wise',condition:'Condition',tokenOfPower:'Token of Power',talent:'Talent'};
const nativeIcons=[['icons/svg/chest.svg','Chest / kista','Item'],['icons/svg/ruins.svg','Ruins / ruiner','Place'],
  ['icons/svg/village.svg','Village / by','Place'],['icons/svg/bridge.svg','Bridge / bro','Place']];
let catalogRequest;

async function catalog() {
  const defaults=[[ART+'map-location.svg','Location ring / plats','Place'],[ART+'map-parchment.svg','Parchment / pergament','Note']];
  if (game.system.id!=='realm-guard') return [...defaults,...nativeIcons];
  catalogRequest ??= import(foundry.utils.getRoute(REALM_ART+'catalog.mjs')).then(({MAP_ICONS,MAP_ICON_GROUPS})=>
    MAP_ICONS.map(([id,label,tags,category])=>[REALM_ART+id+'.svg',label,MAP_ICON_GROUPS[category],tags])).catch(()=>nativeIcons);
  return [...defaults,...await catalogRequest];
}

function markerScene(point, owner) {
  if (!game.user.isGM || game.user.id!==owner || !canvas.ready || canvas.scene?.id!==point.sceneId || !canvas.dimensions.rect.contains(point.x,point.y)) {
    throw Error('Choose a point inside the current scene as GM.');
  }
  return canvas.scene;
}

function fields(rows, {name='',icon='',size=48,visible=false}={}) {
  const groups=[...new Set(rows.map(row=>row[2]))];
  return `<label>Name<input name="markerName" value="${esc(name)}" required></label>
    <label>Marker size (px)<input name="iconSize" type="number" min="32" max="512" step="1" value="${size}" required></label>
    <label><input type="checkbox" name="visible" ${visible?'checked':''}> Show marker to players</label>
    <label>Find an icon<input type="search" data-map-icon-search></label>
    <label>Category<select data-map-icon-filter><option value="">All categories</option>${groups.map(group=>`<option>${esc(group)}</option>`).join('')}</select></label>
    <div class="at-map-icon-grid" aria-label="Marker icon">${rows.map(([src,label,group,tags=''])=>
      `<label data-map-icon-group="${esc(group)}" data-map-icon-tags="${esc(normalize(label+' '+tags))}"><input type="radio" name="symbol" value="${esc(src)}" ${src===icon?'checked':''}><img src="${esc(src)}" alt="" loading="lazy"><span>${esc(label)}</span></label>`).join('')}</div>`;
}

function bindFields(_event, dialog) {
  const root=dialog.element, search=root.querySelector('[data-map-icon-search]'), filter=root.querySelector('[data-map-icon-filter]');
  const rows=[...root.querySelectorAll('[data-map-icon-group]')];
  const update=()=>{
    const terms=normalize(search.value).trim().split(/\s+/);
    for (const row of rows) row.hidden=Boolean(filter.value&&filter.value!==row.dataset.mapIconGroup)||!terms.every(term=>row.dataset.mapIconTags.includes(term));
  };
  search.addEventListener('input',update);
  filter.addEventListener('change',update);
  const kind=root.querySelector('[name="kind"]');
  kind?.addEventListener('change',()=>{
    const isItem=kind.value==='item';
    root.querySelector('[data-map-item-type]').hidden=!isItem;
    const symbol=root.querySelector('[name="symbol"]:checked');
    if (isItem && symbol?.value===ART+'map-location.svg') {
      const itemIcon=[...root.querySelectorAll('[name="symbol"]')].find(input=>/chest|crate|barrel/i.test(input.value));
      if (itemIcon) itemIcon.checked=true;
    }
  });
}

function readForm(form) {
  const fields=form.elements;
  return {name:fields.markerName.value.trim().slice(0,100),icon:fields.symbol.value,size:fields.iconSize.valueAsNumber,visible:fields.visible.checked,
    kind:fields.kind?.value,itemType:fields.itemType?.value,description:fields.information?.value.trim().slice(0,12000)||''};
}

function valid(result, rows) {
  return Boolean(result?.name&&Number.isSafeInteger(result.size)&&result.size>=32&&result.size<=512&&rows.some(row=>row[0]===result.icon));
}

async function create(point) {
  const owner=game.user.id, scene=markerScene(point,owner);
  const rows=await catalog();
  const types=game.documentTypes?.Item || Object.keys(CONFIG.Item?.dataModels || {});
  const result=await foundry.applications.api.DialogV2.prompt({window:{title:'Create item / place on map',resizable:true},position:{width:650},
    classes:['at-map-point-dialog'],rejectClose:false,render:bindFields,content:`<label>Create<select name="kind"><option value="place">Place / landmark</option>${types.length?'<option value="item">Item</option>':''}</select></label>
    <label data-map-item-type hidden>Item type<select name="itemType">${types.map(type=>`<option value="${esc(type)}">${esc(typeLabels[type]||type)}</option>`).join('')}</select></label>
    ${fields(rows,{icon:rows[0][0]})}<label>Information<textarea name="information" rows="4"></textarea></label>`,
    ok:{label:'Create on map',callback:(_e,button)=>readForm(button.form)}});
  if (!result) return;
  markerScene(point,owner);
  if (!valid(result,rows) || (result.kind==='item'&&!types.includes(result.itemType))) throw Error('Choose a valid name, icon and marker size.');
  const {NONE,OBSERVER}=CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const ownership={default:result.visible?OBSERVER:NONE};
  const info=esc(result.description).replace(/\r?\n/g,'<br>');
  let item,journal;
  try {
    if (result.kind==='item') {
      const system=game.system.id==='realm-guard' ? {description:`<p>${info}</p>`} : {};
      item=await Item.create({name:result.name,type:result.itemType,img:result.icon,ownership,system});
      if (!item) return;
    }
    markerScene(point,owner);
    const link=item ? `<p>@UUID[${item.uuid}]</p>`:'';
    journal=await JournalEntry.create({name:result.name,ownership,
      flags:{[ID]:{type:'world',worldProfile:item?{category:'item',itemId:item.id,sourceUuid:item.uuid}:{category:'location'}}},
      pages:[{name:result.name,type:'text',text:{format:1,content:`<p>${info}</p>${link}`}}]});
    markerScene(point,owner);
    const [note]=await scene.createEmbeddedDocuments('Note',[{entryId:journal.id,x:Math.round(point.x),y:Math.round(point.y),
      text:result.name,texture:{src:result.icon},iconSize:result.size,flags:{[ID]:{notePinStyle:'borderless',[FLAG]:result.visible,mapWaypoint:true}}}]);
    if (!note) throw Error('Foundry did not create the map marker.');
    canvas.notes?.activate?.();
    return note;
  } catch (error) {
    await Promise.allSettled([journal?.delete(),item?.delete()]);
    throw error;
  }
}

async function edit(point, note) {
  const owner=game.user.id, scene=markerScene(point,owner), rows=await catalog();
  const current=note.texture?.src;
  if (current&&!rows.some(row=>row[0]===current)) rows.unshift([current,'Keep current icon','Current']);
  const original=JSON.stringify([note.text,current,note.iconSize,note.flags?.[ID]?.[FLAG]]);
  const initial={name:note.label||note.text||note.entry?.name,icon:current||rows[0][0],size:note.iconSize,
    visible:note.flags?.[ID]?.[FLAG]??note.flags?.['realm-guard']?.[FLAG]??(note.entry?.ownership?.default>=CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED)};
  const buttons=[{action:'save',label:'Save marker',default:true,callback:(_e,button)=>readForm(button.form)}];
  if (note.entry) buttons.push({action:'journal',label:'Open linked journal',callback:()=>({journal:true})});
  buttons.push({action:'cancel',label:'Cancel',callback:()=>null});
  const result=await foundry.applications.api.DialogV2.wait({window:{title:'Edit marker',resizable:true},position:{width:650},classes:['at-map-point-dialog'],
    rejectClose:false,content:fields(rows,initial),render:bindFields,buttons});
  if (!result) return;
  markerScene(point,owner);
  if (scene.notes.get(note.id)!==note || original!==JSON.stringify([note.text,note.texture?.src,note.iconSize,note.flags?.[ID]?.[FLAG]])) throw Error('This marker changed. Open it again.');
  if (result.journal) return note.entry?.sheet.render(true);
  if (!valid(result,rows)) throw Error('Choose a valid name, icon and marker size.');
  await note.update({text:result.name,iconSize:result.size,'texture.src':result.icon,[`flags.${ID}.${FLAG}`]:result.visible,
    ...(api()?.partyTravel?.isWaypoint(note)?{[`flags.${ID}.mapWaypoint`]:true}:{}),
    ...(typeof note.flags?.['realm-guard']?.[FLAG]==='boolean'?{[`flags.realm-guard.${FLAG}`]:result.visible}:{})});
  if (result.visible!==initial.visible) await api().travelPlanner?.sync();
}

function actions(point,note) {
  if (!game.user.isGM) return [];
  if (!note) return [{label:'Create item / place on map…',run:()=>create(point)}];
  return [{id:'edit-marker',label:'Edit marker…',run:()=>edit(point,note)}];
}

function applyVisibility(note) {
  const preference=note.document.flags?.[ID]?.[FLAG];
  if (game.user.isGM || typeof preference!=='boolean') return;
  const {x,y,global,iconSize}=note.document;
  const visible=preference&&(!canvas.visibility?.tokenVision||global||canvas.visibility.testVisibility({x,y},{tolerance:iconSize/4,object:note}));
  if (note.visible===visible) return;
  note.visible=visible;
  note.controlIcon?.refresh({visible});
}

Hooks.once('ready',()=>{api().mapPointTools=Object.freeze({actions});});
Hooks.on('refreshNote',applyVisibility);
