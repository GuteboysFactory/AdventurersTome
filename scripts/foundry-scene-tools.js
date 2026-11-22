import {bindSceneImportInput,importSceneImages,installSceneDropTarget,sceneImportControls} from './scene-image-import.js';

const ID='adventurers-tome';
const PIN='notePinStyle';
const BOOK='icons/svg/book.svg';
const MAP_ART='modules/adventurers-tome/assets/';
const loadedPinIcons=new WeakSet();
const styles={inherit:'World default',standard:'Foundry default',borderless:'Borderless'};
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const dialog=()=>foundry.applications.api.DialogV2;
const fail=error=>ui.notifications.error(error.message);

function applyPinStyle(note){
  const icon=note.controlIcon;
  if(!icon?.bg)return;
  const style=note.document.flags?.[ID]?.[PIN];
  const src=note.document.texture?.src;
  const legacy=src===BOOK;
  const symbol=legacy||[MAP_ART+'map-location.svg',MAP_ART+'map-parchment.svg'].includes(src);
  const defaultStyle=symbol&&(legacy||!style)?'borderless':game.settings.get(ID,'mapPinStyle');
  icon.bg.visible=(style&&style!=='inherit'?style:defaultStyle)!=='borderless';
  if(!legacy||!icon.icon||loadedPinIcons.has(icon))return;
  const entry=note.document.entry;
  const profile=entry?.flags?.[ID]?.worldProfile || globalThis.ATTestAI?.modules.get(ID)?.api?.getWorldProfile?.(entry);
  const texturePath=MAP_ART+(profile?.category==='location'?'map-location.svg':'map-parchment.svg');
  loadedPinIcons.add(icon);
  return Promise.all([foundry.canvas.loadTexture(texturePath),foundry.canvas.loadTexture(BOOK)]).then(([texture])=>{
    if(texture&&!icon.destroyed&&note.controlIcon===icon&&note.document.texture?.src===BOOK){
      icon.texture=icon.icon.texture=texture;
      icon.icon.width=icon.icon.height=icon.size;
    }
  }).catch(()=>loadedPinIcons.delete(icon));
}

function pinField(app,html){
  if(!game.user.isGM||app.document?.documentName!=='Note')return;
  const root=html?.querySelector?html:html?.[0];
  const form=root?.matches('form')?root:root?.querySelector('form');
  if(!form||form.querySelector('[data-tome-pin-style]'))return;
  const label=document.createElement('label');label.dataset.tomePinStyle='';
  const style=app.document.flags?.[ID]?.[PIN]||'inherit';
  label.innerHTML=`Map pin appearance<select name="flags.${ID}.${PIN}">${Object.entries(styles).map(([key,text])=>`<option value="${key}" ${style===key?'selected':''}>${text}</option>`).join('')}</select>`;
  const footer=form.querySelector('footer');
  if(footer)footer.before(label);else form.append(label);
}

function sceneDefaults(data,defaults){
  const patch={};
  for(const dimension of ['width','height']){
    const value=Number(defaults[dimension]);
    if(data[dimension]===undefined&&Number.isSafeInteger(value)&&value>0)patch[dimension]=value;
  }
  const color=String(defaults.backgroundColor??'').trim();
  if(data.backgroundColor===undefined&&/^#[\da-f]{6}$/i.test(color))patch.backgroundColor=color;
  if(data.tokenVision===undefined)patch.tokenVision=defaults.tokenVision;
  if(data.environment?.globalLight?.enabled===undefined)patch['environment.globalLight.enabled']=defaults.globalLight;
  if(data.grid?.type===undefined)patch['grid.type']=defaults.gridType;
  if(data.grid?.size===undefined)patch['grid.size']=Math.max(50,Math.round(Number(defaults.gridSize)||100));
  return patch;
}

const GRID_TYPES={0:'Gridless',1:'Square',2:'Hex rows (odd)',3:'Hex rows (even)',4:'Hex columns (odd)',5:'Hex columns (even)'};
const SCENE_DEFAULT_FIELDS=[
  {key:'gridType',path:'grid.type',label:'Grid type',choices:GRID_TYPES},
  {key:'gridSize',path:'grid.size',label:'Grid size (px)',min:50,max:400},
  {key:'width',path:'width',label:'Width (px)',min:0},
  {key:'height',path:'height',label:'Height (px)',min:0},
  {key:'backgroundColor',path:'backgroundColor',label:'Background color',type:'text'},
  {key:'tokenVision',path:'tokenVision',label:'Token vision',type:'checkbox'},
  {key:'globalLight',path:'environment.globalLight.enabled',label:'Global illumination',type:'checkbox'}
];
const sceneDefaultKey=key=>'sceneDefault'+key[0].toUpperCase()+key.slice(1);

function readSceneDefaults(){
  return Object.fromEntries(SCENE_DEFAULT_FIELDS.map(({key})=>[key,game.settings.get(ID,sceneDefaultKey(key))]));
}

function configuredSceneDefaults(data){
  return game.settings.get(ID,'sceneDefaultsEnabled')?sceneDefaults(data,readSceneDefaults()):{};
}

function defaultFieldInput(field,value){
  const {key,choices,type,min,max}=field;
  if(choices)return `<select name="${key}">${Object.entries(choices).map(([id,label])=>
    `<option value="${id}" ${Number(id)===value?'selected':''}>${label}</option>`).join('')}</select>`;
  if(type==='checkbox')return `<input type="checkbox" name="${key}" ${value?'checked':''}>`;
  if(type==='text')return `<input name="${key}" value="${esc(value)}" placeholder="#000000" pattern="#[0-9a-fA-F]{6}">`;
  return `<input type="number" name="${key}" value="${esc(value)}" min="${min}" ${max?'max="'+max+'"':''} step="1" required>`;
}

function defaultsForm(form){
  const fields=form.elements;
  const values=Object.fromEntries(SCENE_DEFAULT_FIELDS.map(({key,type})=>[key,
    type==='checkbox'?fields[key].checked:type==='text'?fields[key].value.trim():Number(fields[key].value)]));
  const selected=SCENE_DEFAULT_FIELDS.filter(({key})=>fields['apply-'+key].checked).map(({path})=>path);
  return {values,selected,enabled:fields.enabled.checked};
}

async function applySceneDefaults({values,selected},stillGM){
  if(!selected.length){ui.notifications.warn('Select the settings you want to apply to existing scenes.');return;}
  const defaults=sceneDefaults({},values);
  if(!selected.every(path=>Object.hasOwn(defaults,path))){
    ui.notifications.warn('Enter an explicit size or color before applying that setting to existing scenes.');
    return;
  }
  const patch=Object.fromEntries(selected.map(path=>[path,defaults[path]]));
  const scenes=[...game.scenes.contents].sort((a,b)=>a.name.localeCompare(b.name));
  if(!scenes.length){ui.notifications.info('There are no scenes in this world.');return;}
  const result=await dialog().prompt({window:{title:'Apply settings to existing scenes',resizable:true},position:{width:560},
    classes:['at-scene-navigation-settings'],rejectClose:false,
    content:`<p>Settings to apply: <strong>${SCENE_DEFAULT_FIELDS.filter(({path})=>selected.includes(path)).map(({label})=>label).join(', ')}</strong></p>
      <label><input type="checkbox" name="allScenes"> All scenes in this world (${scenes.length})</label>
      <fieldset><legend>Or choose individual scenes</legend>
      <label>Find a scene<input type="search" data-scene-default-search></label>
      <div class="at-scene-default-targets">${scenes.map(scene=>
        `<label><input type="checkbox" name="sceneIds" value="${esc(scene.id)}"> <span>${esc([scene.folder?.name,scene.name].filter(Boolean).join(' / '))}</span></label>`).join('')}</div>
      </fieldset>`,
    render:(_event,app)=>{
      const form=app.element.querySelector('form');
      const search=form.querySelector('[data-scene-default-search]');
      const rows=[...form.querySelectorAll('.at-scene-default-targets label')];
      form.elements.allScenes.onchange=()=>{
        const all=form.elements.allScenes.checked;
        search.disabled=all;
        for(const row of rows)row.querySelector('input').disabled=all;
      };
      search.oninput=()=>{
        const query=search.value.trim().toLocaleLowerCase();
        for(const row of rows)row.hidden=!row.textContent.toLocaleLowerCase().includes(query);
      };
    },
    ok:{label:'Review changes',callback:(_event,button)=>{
      const form=button.form;
      return form.elements.allScenes.checked ? scenes.map(scene=>scene.id)
        : [...form.querySelectorAll('input[name="sceneIds"]:checked')].map(input=>input.value);
    }}});
  if(!result||!stillGM())return;
  const targets=scenes.filter(scene=>result.includes(scene.id));
  if(!targets.length){ui.notifications.warn('Choose at least one scene.');return;}
  const confirmed=await dialog().confirm({window:{title:`Update ${targets.length} scene${targets.length===1?'':'s'}?`},rejectClose:false,
    content:`<p>${SCENE_DEFAULT_FIELDS.filter(({path})=>selected.includes(path)).map(({path,label,choices})=>{
      const value=patch[path];
      return `${label}: <strong>${esc(choices?.[value]??(typeof value==='boolean'?(value?'On':'Off'):value))}</strong>`;
    }).join('<br>')}</p><p>${targets.slice(0,6).map(scene=>esc(scene.name)).join(', ')}${targets.length>6?` and ${targets.length-6} more`:''}</p>`});
  if(!confirmed||!stillGM())return;
  if(targets.some(scene=>game.scenes.get(scene.id)!==scene))throw Error('The scene list changed. Select the scenes again.');
  await game.scenes.documentClass.updateDocuments(targets.map(scene=>({_id:scene.id,...patch})));
  ui.notifications.info(`Updated scene settings on ${targets.length} scene${targets.length===1?'':'s'}.`);
}

async function editSceneDefaults(){
  if(!game.user.isGM)return;
  const owner=game.user.id,world=game.world.id;
  const stillGM=()=>game.user.isGM&&game.user.id===owner&&game.world.id===world;
  const saved=readSceneDefaults();
  const enabled=game.settings.get(ID,'sceneDefaultsEnabled');
  const result=await dialog().wait({window:{title:'Scene defaults',resizable:true},position:{width:600},
    classes:['at-scene-navigation-settings'],rejectClose:false,content:`
      <label><input type="checkbox" name="enabled" ${enabled?'checked':''}> Apply saved defaults to new scenes</label>
      <p>Use 0 for automatic dimensions. Leave the background color blank for the Foundry default.</p>
      <p>To update existing scenes, check the settings to apply. Save defaults separately for future scenes.</p>
      <div class="at-scene-default-fields">${SCENE_DEFAULT_FIELDS.map(field=>`
        <label>${field.label} ${defaultFieldInput(field,saved[field.key])}</label>
        <label><input type="checkbox" name="apply-${field.key}" aria-label="Apply ${field.label} to existing scenes"> Apply to existing</label>`).join('')}</div>`,
    buttons:[
      {action:'save',label:'Save defaults',callback:(_event,button)=>({save:true,...defaultsForm(button.form)})},
      {action:'apply',label:'Apply to existing scenes…',callback:(_event,button)=>defaultsForm(button.form)},
      {action:'close',label:'Cancel',callback:()=>null}
    ]});
  if(!result||!stillGM())return;
  if(!result.save)return applySceneDefaults(result,stillGM);
  for(const [key,value] of Object.entries(result.values)){
    if(!stillGM())return;
    if(value!==saved[key])await game.settings.set(ID,sceneDefaultKey(key),value);
  }
  if(stillGM()&&enabled!==result.enabled)await game.settings.set(ID,'sceneDefaultsEnabled',result.enabled);
}

function createScenesFromImages(files){
  return importSceneImages(files,({width,height})=>{
    const defaults=configuredSceneDefaults({});
    return {width:defaults.width??width,height:defaults.height??height};
  });
}

function sceneRows(){
  return game.scenes.contents.filter(scene=>game.user.isGM||scene.active||scene.isView||(scene.navigation&&scene.visible));
}

const FAVORITES='sceneNavigationFavorites';
const DOCK_PROVIDER='adventurers-tome-scenes';
const NAV_OPTIONS='sceneNavigationOptions';
const NAV_DEFAULTS=Object.freeze({
  folders:'everyone',previous:'everyone',repeatActive:true,gmRealNames:true,
  closeOnActivate:false,hideInCombat:false,clickToView:false,doubleClickActivate:false,
  directoryIndicators:false,quickNavigation:false,directoryArtwork:false,directoryDensity:'normal'
});
let scenePanel,viewedSceneId,previousSceneId;
let sceneDockHost;

function sceneName(scene,options=sceneOptions()){
  return game.user.isGM&&options.gmRealNames?scene.name:scene.navName||scene.name;
}

function sceneOptions(){
  return {...NAV_DEFAULTS,...game.settings.get(ID,NAV_OPTIONS)};
}

function includedForViewer(audience){
  return audience==='everyone'||(audience==='gm'&&game.user.isGM);
}

async function editSceneNavigationSettings(){
  if(!game.user.isGM)return;
  const options=sceneOptions();
  const check=(key,label)=>`<label><input type="checkbox" name="${key}" ${options[key]?'checked':''}> ${label}</label>`;
  const select=(key,label,choices)=>`<label>${label}<select name="${key}">${Object.entries(choices).map(([value,text])=>
    `<option value="${value}" ${options[key]===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
  const audience={everyone:'Everyone',gm:'GM only',none:'Hidden'};
  const owner=game.user.id,world=game.world.id;
  const next=await dialog().prompt({window:{title:'Scene settings',resizable:true},position:{width:500},
    classes:['at-scene-navigation-settings'],rejectClose:false,
    content:`<fieldset><legend>Scene defaults</legend>
      <button type="button" data-edit-scene-defaults>Set defaults or update existing scenes…</button>
      </fieldset><fieldset><legend>Scenes panel</legend>
      <label><input type="checkbox" name="compact" ${game.settings.get(ID,'compactSceneNavigation')?'checked':''}> Use the compact scene bar on this client</label>
      ${select('folders','Show folders',audience)}${select('previous','Show Previous scene',audience)}
      ${check('repeatActive','Keep the active scene in its folder')}${check('gmRealNames','Show original scene names to the GM')}
      ${check('closeOnActivate','Close after activating a scene')}${check('hideInCombat','Hide the scene list while combat is active')}
      ${check('doubleClickActivate','Double-click a scene to activate it as GM')}</fieldset>
      <fieldset><legend>Foundry Scenes sidebar · GM</legend>
      ${check('clickToView','Click a scene name to open it on the map')}
      ${check('directoryIndicators','Show active, navigation and player-access indicators')}
      ${check('quickNavigation','Show a shortcut to change navigation visibility')}
      ${check('directoryArtwork','Use scene artwork behind each row')}
      ${select('directoryDensity','Scene row size',{normal:'Foundry default',compact:'Compact',icon:'Small thumbnail at the side',text:'Text only'})}
      </fieldset>`,
    render:(_event,app)=>{
      const button=app.element.querySelector('[data-edit-scene-defaults]');
      button.onclick=async()=>{
        button.disabled=true;
        try{await editSceneDefaults();}catch(error){fail(error);}
        finally{button.disabled=false;}
      };
    },
    ok:{label:'Save navigation settings',callback:(_event,button)=>{
      const fields=button.form.elements;
      const values=Object.fromEntries(Object.entries(NAV_DEFAULTS).map(([key,initial])=>
        [key,typeof initial==='boolean'?fields[key].checked:fields[key].value]));
      return {values,compact:fields.compact.checked};
    }}});
  if(!next||!game.user.isGM||game.user.id!==owner||game.world.id!==world)return;
  await game.settings.set(ID,NAV_OPTIONS,next.values);
  await game.settings.set(ID,'compactSceneNavigation',next.compact);
}

function sceneFavorites(){
  return new Set(game.settings.get(ID,FAVORITES)||[]);
}

function scenePanelRow(scene,favorites,options){
  const favorite=favorites.has(scene.id);
  const name=esc(sceneName(scene,options));
  return `<div class="at-scene-panel-row" data-scene-row="${esc(scene.id)}">
    <button type="button" data-scene-command="favorite" aria-pressed="${favorite}" title="${favorite?'Remove favorite':'Add favorite'}" aria-label="${favorite?'Remove favorite':'Add favorite'}: ${name}"><i class="${favorite?'fa-solid':'fa-regular'} fa-star" aria-hidden="true"></i></button>
    <button type="button" data-scene-command="view" title="Open for me: ${name}"><span>${name}</span><small>Open for me</small></button>
    ${game.user.isGM?`<button type="button" data-scene-command="activate" ${scene.active?'disabled':''} aria-label="Activate for everyone: ${name}">Activate for everyone</button>
      <button type="button" data-scene-command="tools" title="Scene actions" aria-label="Scene actions: ${name}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>`:''}
  </div>`;
}

function sceneFolderTree(scenes){
  const root={scenes:[],children:new Map()};
  for(const scene of scenes){
    let node=root;
    const folder=scene.folder;
    for(const entry of folder?[...folder.getParentFolders()].reverse().concat(folder):[]){
      if(!node.children.has(entry.id))node.children.set(entry.id,{id:entry.id,name:entry.name,scenes:[],children:new Map()});
      node=node.children.get(entry.id);
    }
    node.scenes.push(scene);
  }
  return root;
}

async function runSceneCommand(command,id){
  const scene=sceneRows().find(entry=>entry.id===id);
  if(!scene)throw Error('That scene is no longer available.');
  if(command==='view')return scene.view();
  if(command==='activate'){
    if(!game.user.isGM)throw Error('Only the GM can activate a scene for everyone.');
    if(!scene.active){
      await scene.activate();
      if(sceneOptions().closeOnActivate)await scenePanel?.close();
    }
  }
  if(command==='favorite'){
    const favorites=sceneFavorites();
    if(!favorites.delete(id))favorites.add(id);
    await game.settings.set(ID,FAVORITES,[...favorites]);
  }
  if(command==='tools'&&game.user.isGM)return editSceneTools(scene);
}

async function editSceneTools(scene){
  if(!game.user.isGM)return;
  const owner=game.user.id,world=game.world.id;
  const pick=(action,label)=>({action,label,callback:()=>action});
  const buttons=[
    pick('configure','Configure scene'),pick('access','Player access…'),
    pick('navigation',scene.navigation?'Remove from navigation':'Show in navigation')
  ];
  if(scene.background?.src)buttons.push(pick('artwork','View background'));
  if(globalThis.canvas?.ready&&canvas.scene?.id===scene.id)buttons.push(pick('start','Save current view as start'));
  if(scene.active||scene.isView)buttons.push(pick('pull','Bring connected players here…'));
  buttons.push(pick('cancel','Close'));
  const choice=await dialog().wait({window:{title:scene.name+' · Scene actions',resizable:true},position:{width:530},
    classes:['at-scene-actions'],content:'',buttons,rejectClose:false});
  if(!choice||!game.user.isGM||game.user.id!==owner||game.world.id!==world||game.scenes.get(scene.id)!==scene)return;
  if(choice==='configure')return scene.sheet.render({force:true});
  if(choice==='access')return editSceneAccess(scene);
  if(choice==='navigation')return scene.update({navigation:!scene.navigation});
  if(choice==='artwork'&&scene.background?.src){
    return new (foundry.applications.apps.ImagePopout)({window:{title:scene.name},src:scene.background.src,uuid:scene.uuid}).render({force:true});
  }
  if(choice==='start'&&globalThis.canvas?.ready&&canvas.scene?.id===scene.id){
    const {x,y}=canvas.stage.pivot,scale=canvas.stage.scale.x;
    if([x,y,scale].every(Number.isFinite))return scene.update({initial:{x:Math.round(x),y:Math.round(y),scale}});
  }
  if(choice==='pull'&&(scene.active||scene.isView)){
    const confirmed=await dialog().confirm({window:{title:'Bring connected players here?'},content:`<p>Move connected players to ${esc(scene.name)}.</p>`});
    if(!confirmed||!game.user.isGM||game.user.id!==owner||game.world.id!==world||game.scenes.get(scene.id)!==scene||(!scene.active&&!scene.isView))return;
    const players=game.users.contents.filter(user=>user.active&&!user.isGM);
    if(players.length)return scene.pullUsers(players);
  }
}

function refreshScenePanel(){
  const root=scenePanel?.element?.querySelector('[data-tome-scene-panel]');
  if(!root)return;
  const search=root.querySelector('input[type="search"]');
  const list=root.querySelector('[data-scene-list]');
  const query=search.value.trim().toLocaleLowerCase();
  const openFolders=new Set([...list.querySelectorAll('details[open]')].map(element=>element.dataset.sceneFolder));
  const options=sceneOptions();
  const name=scene=>sceneName(scene,options);
  const scenes=sceneRows().sort((a,b)=>a.navOrder-b.navOrder||name(a).localeCompare(name(b)));
  const previous=scenes.find(scene=>scene.id===previousSceneId);
  const back=root.querySelector('[data-scene-back]');
  back.hidden=!includedForViewer(options.previous);
  back.disabled=!previous;
  const hidden=options.hideInCombat&&game.combats?.active?.started===true;
  root.querySelector('[data-scene-combat]').hidden=!hidden;
  list.hidden=hidden;
  root.querySelector('[data-scene-status]').textContent=[
    ['Active for everyone',scenes.find(scene=>scene.active)],['My view',scenes.find(scene=>scene.isView)]
  ].filter(([,scene])=>scene).map(([label,scene])=>`${label}: ${name(scene)}`).join(' · ');
  const favorites=sceneFavorites();
  const renderRows=rows=>rows.map(scene=>scenePanelRow(scene,favorites,options)).join('');
  const matching=scenes.filter(scene=>name(scene).toLocaleLowerCase().includes(query));
  const starred=matching.filter(scene=>favorites.has(scene.id));
  const renderFolders=node=>[...node.children.values()].map(folder=>`<details data-scene-folder="${esc(folder.id)}" ${query||openFolders.has(folder.id)?'open':''}><summary>${esc(folder.name)}</summary>${renderRows(folder.scenes)}${renderFolders(folder)}</details>`).join('');
  const useFolders=includedForViewer(options.folders);
  const active=useFolders&&!options.repeatActive?matching.find(scene=>scene.active):null;
  const tree=useFolders?sceneFolderTree(matching.filter(scene=>scene!==active)):null;
  const browse=tree?renderFolders(tree)+renderRows(tree.scenes):renderRows(matching);
  const top=list.scrollTop;
  list.innerHTML=matching.length?`${active?renderRows([active]):''}${starred.length?`<section><h3>Favorites</h3>${renderRows(starred)}</section>`:''}${browse}`:'<p>No matching scenes.</p>';
  list.scrollTop=top;
}

async function openScenePanel(){
  if(scenePanel){
    refreshScenePanel();
    scenePanel.bringToFront();
    scenePanel.element?.querySelector('input[type="search"]')?.focus();
    return;
  }
  const app=new (dialog())({window:{title:'Scenes',resizable:true},position:{width:540},classes:['at-scene-panel'],modal:false,
    content:`<section data-tome-scene-panel><div class="at-scene-panel-controls"><label>Find a scene<input type="search" placeholder="Scene name…"></label>
      <button type="button" data-scene-back>Previous scene</button>
      ${game.user.isGM?'<button type="button" data-scene-settings><i class="fa-solid fa-gear" aria-hidden="true"></i> Settings…</button>':''}</div>
      ${sceneImportControls()}<p data-scene-status></p><p data-scene-combat hidden>Scene list hidden during active combat.</p><div data-scene-list></div></section>`,
    buttons:[{action:'close',label:'Close'}]});
  scenePanel=app;
  let pendingView;
  app.addEventListener('render',()=>{
    const root=app.element.querySelector('[data-tome-scene-panel]');
    bindSceneImportInput(root,createScenesFromImages);
    let busy=false;
    root.querySelector('input[type="search"]').oninput=refreshScenePanel;
    const use=async(command,id)=>{
      if(busy)return;
      busy=true;
      try{
        if(command==='settings')await editSceneNavigationSettings();
        else await runSceneCommand(command,id);
        refreshScenePanel();
      }catch(error){fail(error);}
      finally{busy=false;}
    };
    root.onclick=event=>{
      const button=event.target.closest('button');
      if(!button)return;
      const command=button.dataset.sceneCommand||(button.hasAttribute('data-scene-back')?'view':
        button.hasAttribute('data-scene-settings')?'settings':null);
      if(!command||busy)return;
      const id=button.closest('[data-scene-row]')?.dataset.sceneRow||previousSceneId;
      clearTimeout(pendingView);
      if(button.dataset.sceneCommand==='view'&&event.detail&&game.user.isGM&&sceneOptions().doubleClickActivate){
        if(event.detail>1)void use('activate',id);
        else pendingView=setTimeout(()=>void use('view',id),350);
      }else void use(command,id);
    };
    refreshScenePanel();
    root.querySelector('input[type="search"]').focus();
  });
  app.addEventListener('close',()=>{
    clearTimeout(pendingView);
    if(scenePanel===app)scenePanel=null;
  });
  try{await app.render({force:true});}
  catch(error){if(scenePanel===app)scenePanel=null;throw error;}
}

function registerSceneDockProvider(){
  const host=globalThis.GuteboysFactory?.gmDockHost;
  if(!game.user?.isGM||host?.contract!=='gbf-gm-dock-host'||typeof host.registerProvider!=='function')return;
  if(sceneDockHost===host&&host.hasProvider?.(DOCK_PROVIDER)!==false)return;
  try{
    if(sceneDockHost!==host)sceneDockHost?.unregisterProvider?.(DOCK_PROVIDER);
    host.registerProvider({
      id:DOCK_PROVIDER,label:'Scenes',icon:'fa-solid fa-map',visible:()=>game.user?.isGM===true,
      menu:()=>({title:'Scenes',items:[{id:'open',label:'Open scene navigation',icon:'fa-solid fa-map',onClick:openScenePanel}]})
    });
    sceneDockHost=host;
  }catch(error){
    sceneDockHost=null;
    console.warn('Adventurer’s Tome | Could not add Scenes to the hosted GM Dock.',error);
  }
}

function sceneAccessMode(scene,id){
  const level=scene.ownership[id];
  if(id!=='default'&&(level===undefined||level<0))return 'inherit';
  return Number(level)>=1?'show':'hide';
}

function renderSceneNav(_app,html){
  const root=html?.querySelector?html:html?.[0];
  const nav=root?.id==='scene-navigation'?root:root?.querySelector('#scene-navigation');
  if(!nav)return;
  const compact=game.settings.get(ID,'compactSceneNavigation');
  nav.dataset.tomeScenes=compact?'compact':'standard';
  nav.querySelector('[data-tome-scene-nav]')?.remove();
  const bar=document.createElement('div');bar.dataset.tomeSceneNav='';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='ui-control';
  toggle.textContent=compact?'Standard scenes':'Compact scenes';
  toggle.onclick=()=>void game.settings.set(ID,'compactSceneNavigation',!compact).catch(fail);
  bar.append(toggle);
  const scenes=document.createElement('button');scenes.type='button';scenes.className='ui-control';scenes.textContent='Scenes';
  scenes.onclick=()=>void openScenePanel().catch(fail);
  bar.append(scenes);
  nav.append(bar);
}

async function editSceneAccess(scene){
  if(!scene||scene.pack||!game.user.isGM)return;
  const owner=game.user.id,world=game.world.id;
  const initial=JSON.stringify(scene.ownership);
  const players=game.users.contents.filter(user=>!user.isGM);
  const controls=[{id:'default',name:'All players'},...players].map(({id,name})=>{
    const mode=sceneAccessMode(scene,id);
    const options=[...(id==='default'?[]:[['inherit','Use default']]),['show','Allow viewing'],['hide','Hide']];
    return `<label>${esc(name)}<select data-player-scene-access="${esc(id)}">${options.map(([key,text])=>`<option value="${key}" ${mode===key?'selected':''}>${text}</option>`).join('')}</select></label>`;
  }).join('');
  const requested=await dialog().prompt({classes:['at-twt-ownership-dialog'],window:{title:`Scene access · ${scene.name}`},rejectClose:false,
    content:`<p>Enable Show in Navigation on this scene for players to open it themselves. Foundry shows the active scene to everyone.</p>${controls}`,
    ok:{label:'Save access',callback:(_e,_b,d)=>[...d.element.querySelectorAll('[data-player-scene-access]')].map(select=>[select.dataset.playerSceneAccess,select.value])}});
  if(!requested||!game.user.isGM||game.user.id!==owner||game.world.id!==world)return;
  if(game.scenes.get(scene.id)!==scene||JSON.stringify(scene.ownership)!==initial)throw Error('The scene permissions changed. Open the dialog again.');
  const live=new Set(game.users.contents.filter(user=>!user.isGM).map(user=>user.id));
  const patch={};
  for(const [id,mode] of requested){
    if(id!=='default'&&!live.has(id))continue;
    if(mode===sceneAccessMode(scene,id))continue;
    if(mode==='inherit'&&id!=='default')patch[`ownership.-=${id}`]=null;
    if(mode==='show'||mode==='hide')patch[`ownership.${id}`]=mode==='show'?CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  }
  if(Object.keys(patch).length)await scene.update(patch);
}

function renderSceneDirectory(app,html){
  if(!game.user.isGM||app.collection!==game.scenes)return;
  const root=html?.querySelector?html:html?.[0];
  if(!root)return;
  const options=sceneOptions();
  root.dataset.tomeSceneDensity=options.directoryDensity;
  root.classList.toggle('at-scene-directory-artwork',options.directoryArtwork);
  for(const row of root.querySelectorAll('.directory-item[data-entry-id]')){
    const scene=game.scenes.get(row.dataset.entryId);
    if(!scene)continue;
    const name=row.querySelector('.entry-name');
    if(options.clickToView&&name&&!name.dataset.tomeSceneClick){
      name.dataset.tomeSceneClick='';
      name.addEventListener('click',event=>{
        if(!game.user.isGM||!sceneOptions().clickToView)return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const current=game.scenes.get(row.dataset.entryId);
        if(current)void current.view().catch(fail);
      },true);
    }
    row.querySelector('[data-tome-scene-indicators]')?.remove();
    if(!options.directoryIndicators&&!options.quickNavigation)continue;
    const indicators=document.createElement('span');
    indicators.dataset.tomeSceneIndicators='';
    if(options.directoryIndicators){
      const players=game.users.contents.filter(user=>!user.isGM&&scene.testUserPermission(user,'LIMITED'));
      const label=scene.active?'Active for everyone':players.length?`Player access: ${players.map(user=>user.name).join(', ')}`:'GM only';
      indicators.innerHTML=`<i class="fa-solid ${scene.active?'fa-bullseye':players.length?'fa-users':'fa-lock'}" role="img" aria-label="${esc(label)}" title="${esc(label)}"></i>`;
    }
    if(options.quickNavigation){
      const button=document.createElement('button');
      button.type='button';
      button.title=scene.navigation?'Remove from navigation':'Show in navigation';
      button.setAttribute('aria-label',button.title);
      button.setAttribute('aria-pressed',String(scene.navigation));
      button.innerHTML='<i class="fa-solid fa-compass" aria-hidden="true"></i>';
      button.onclick=event=>{
        event.stopPropagation();
        if(game.user.isGM&&game.scenes.get(scene.id)===scene)void scene.update({navigation:!scene.navigation}).catch(fail);
      };
      indicators.append(button);
    }else if(options.directoryIndicators&&scene.navigation){
      indicators.insertAdjacentHTML('beforeend','<i class="fa-solid fa-compass" role="img" aria-label="Shown in navigation" title="Shown in navigation"></i>');
    }
    row.append(indicators);
  }
}

Hooks.once('init',()=>{
  const setting=(key,name,scope,type,value,options={})=>game.settings.register(ID,key,{name,scope,config:true,type,default:value,...options});
  setting('mapPinStyle','Map pin appearance','world',String,'standard',{choices:{standard:styles.standard,borderless:styles.borderless},onChange:()=>canvas?.notes?.placeables.forEach(applyPinStyle)});
  setting('compactSceneNavigation','Compact scene navigation','client',Boolean,false,{onChange:()=>ui.nav?.render()});
  game.settings.register(ID,FAVORITES,{scope:'user',config:false,type:Array,default:[]});
  game.settings.register(ID,NAV_OPTIONS,{scope:'world',config:false,type:Object,default:NAV_DEFAULTS,onChange:()=>{
    refreshScenePanel();
    if(game.user.isGM)ui.scenes?.render();
  }});
  setting('sceneDefaultsEnabled','Apply defaults to new scenes','world',Boolean,false);
  setting('sceneDefaultTokenVision','New scenes: token vision','world',Boolean,true);
  setting('sceneDefaultGlobalLight','New scenes: global illumination','world',Boolean,false);
  setting('sceneDefaultGridType','New scenes: grid type','world',Number,0,{choices:GRID_TYPES});
  setting('sceneDefaultGridSize','New scenes: grid size (pixels)','world',Number,100,{range:{min:50,max:400,step:5}});
  const dimensionHint='Enter a size in pixels. Use 0 for the Foundry default.';
  setting('sceneDefaultWidth','New scenes: width','world',Number,0,{hint:dimensionHint});
  setting('sceneDefaultHeight','New scenes: height','world',Number,0,{hint:dimensionHint});
  setting('sceneDefaultBackgroundColor','New scenes: background color','world',String,'#000000',{hint:'Use a hex color such as #000000 for black. Leave blank for the Foundry default.'});
});
Hooks.on('preCreateScene',(scene,data,options)=>{
  if(!game.user.isGM||scene.pack||options?.fromCompendium||data?._id||!game.settings.get(ID,'sceneDefaultsEnabled'))return;
  scene.updateSource(configuredSceneDefaults(data));
});
Hooks.on('drawNote',applyPinStyle);
Hooks.on('refreshNote',applyPinStyle);
Hooks.on('renderNoteConfig',pinField);
Hooks.on('renderSceneNavigation',renderSceneNav);
Hooks.on('renderSceneDirectory',renderSceneDirectory);
Hooks.once('ready',()=>{
  const tome=game.modules.get(ID)?.api;
  if(!tome)return;
  installSceneDropTarget(createScenesFromImages);
  tome.sceneNavigation=Object.freeze({open:openScenePanel});
  tome.gmDock?.registerAction('scene-navigation',{icon:'fa-map',title:'Scenes',detail:'Browse and activate Foundry scenes.',
    visible:()=>sceneDockHost!==globalThis.GuteboysFactory?.gmDockHost||!sceneDockHost,handler:()=>openScenePanel().catch(fail)});
  registerSceneDockProvider();
});
Hooks.on('guteboysFactoryGmDockHostReady',registerSceneDockProvider);
Hooks.on('canvasReady',current=>{
  const id=current.scene?.id;
  if(id&&id!==viewedSceneId){previousSceneId=viewedSceneId;viewedSceneId=id;}
  refreshScenePanel();
});
for(const hook of ['createScene','updateScene','deleteScene','updateFolder','combatStart','deleteCombat'])Hooks.on(hook,refreshScenePanel);
Hooks.on('updateCombat',(_combat,changes)=>{
  if(Object.hasOwn(changes,'active')||changes.round===0)refreshScenePanel();
});
Hooks.on('getSceneContextOptions',(app,options)=>{
  if(!game.user.isGM||game.packs.get(app.collection?.collection)===app.collection)return;
  options.push({name:'Scene access…',icon:'<i class="fa-solid fa-user-shield"></i>',callback:row=>{
    const id=(row?.dataset?row:row?.[0])?.dataset?.entryId;
    void editSceneAccess(game.scenes.get(id)).catch(fail);
  }});
});
