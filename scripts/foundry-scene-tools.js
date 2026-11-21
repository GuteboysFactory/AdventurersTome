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
  if(data.tokenVision===undefined)patch.tokenVision=defaults.tokenVision;
  if(data.environment?.globalLight?.enabled===undefined)patch['environment.globalLight.enabled']=defaults.globalLight;
  if(data.grid?.type===undefined)patch['grid.type']=defaults.gridType;
  if(data.grid?.size===undefined)patch['grid.size']=Math.max(50,Math.round(Number(defaults.gridSize)||100));
  return patch;
}

function sceneRows(){
  return game.scenes.contents.filter(scene=>game.user.isGM||scene.active||scene.isView||(scene.navigation&&scene.visible));
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
  if(compact){
    const chooser=document.createElement('select');chooser.setAttribute('aria-label','Open scene for me');
    const groups=new Map();
    for(const scene of sceneRows().sort((a,b)=>a.navOrder-b.navOrder||a.name.localeCompare(b.name))){
      const folder=scene.folder;
      const path=folder?[...folder.getParentFolders().reverse().map(parent=>parent.name),folder.name].join(' / '):'Unfiled';
      if(!groups.has(path))groups.set(path,[]);
      groups.get(path).push(scene);
    }
    chooser.innerHTML='<option value="">Open scene for me…</option>'+[...groups].map(([path,scenes])=>`<optgroup label="${esc(path)}">${scenes.map(scene=>`<option value="${esc(scene.id)}">${scene.active?'● ':scene.isView?'◦ ':''}${esc(scene.name)}${scene.active?' · Active':''}</option>`).join('')}</optgroup>`).join('');
    chooser.onchange=()=>{
      const scene=sceneRows().find(entry=>entry.id===chooser.value);chooser.value='';
      if(scene)void scene.view().catch(fail);
    };
    bar.append(chooser);
  }
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

Hooks.once('init',()=>{
  const setting=(key,name,scope,type,value,options={})=>game.settings.register(ID,key,{name,scope,config:true,type,default:value,...options});
  setting('mapPinStyle','Map pin appearance','world',String,'standard',{choices:{standard:styles.standard,borderless:styles.borderless},onChange:()=>canvas?.notes?.placeables.forEach(applyPinStyle)});
  setting('compactSceneNavigation','Compact scene navigation','client',Boolean,false,{onChange:()=>ui.nav?.render()});
  setting('sceneDefaultsEnabled','Apply defaults to new scenes','world',Boolean,false);
  setting('sceneDefaultTokenVision','New scenes: token vision','world',Boolean,true);
  setting('sceneDefaultGlobalLight','New scenes: global illumination','world',Boolean,false);
  setting('sceneDefaultGridType','New scenes: grid type','world',Number,1,{choices:{0:'Gridless',1:'Square',2:'Hex rows (odd)',3:'Hex rows (even)',4:'Hex columns (odd)',5:'Hex columns (even)'}});
  setting('sceneDefaultGridSize','New scenes: grid size (pixels)','world',Number,100,{range:{min:50,max:400,step:5}});
});
Hooks.on('preCreateScene',(scene,data,options)=>{
  if(!game.user.isGM||scene.pack||options?.fromCompendium||data?._id||!game.settings.get(ID,'sceneDefaultsEnabled'))return;
  scene.updateSource(sceneDefaults(data,{
    tokenVision:game.settings.get(ID,'sceneDefaultTokenVision'),globalLight:game.settings.get(ID,'sceneDefaultGlobalLight'),
    gridType:game.settings.get(ID,'sceneDefaultGridType'),gridSize:game.settings.get(ID,'sceneDefaultGridSize')}));
});
Hooks.on('drawNote',applyPinStyle);
Hooks.on('refreshNote',applyPinStyle);
Hooks.on('renderNoteConfig',pinField);
Hooks.on('renderSceneNavigation',renderSceneNav);
Hooks.on('getSceneContextOptions',(app,options)=>{
  if(!game.user.isGM||game.packs.get(app.collection?.collection)===app.collection)return;
  options.push({name:'Scene access…',icon:'<i class="fa-solid fa-user-shield"></i>',callback:row=>{
    const id=(row?.dataset?row:row?.[0])?.dataset?.entryId;
    void editSceneAccess(game.scenes.get(id)).catch(fail);
  }});
});
