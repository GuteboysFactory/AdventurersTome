import {filePickerClass,dialogV2Class} from './foundry-platform.js';
import {FRAME_EFFECT_GROUPS, MAX_FRAME_BAND_WIDTH, MAX_FRAME_DIAMETER, MIN_FRAME_BAND_WIDTH, MIN_FRAME_DIAMETER, TOKEN_PREVIEW_SIZE, TOKEN_SHAPES, TOKEN_ART_FLAG, TOKEN_ART_ROTATION_PATH, TOKEN_SIZE, actorArtworkUpdate, actorFullArtwork, actorHomeArtwork, actorPortraitArtwork, defaultTokenLockRotation, normalizeTokenArt, paintToken, placedTokenArtworkUpdates, recordToken, tokenArtState, tokenFrameScale, tokenGridSize} from './token-art.mjs';
import {FRAME_MATERIALS, FRAME_ORNAMENTS, FRAME_ORNAMENT_SLOTS, applyFrameMaterial, loadFrameArtwork} from './token-frame-materials.mjs';
import {FRAME_SILHOUETTES} from './token-frame-shapes.mjs';
import {FRAME_ANIMATION_DURATION} from './token-frame-effects.mjs';
import {MIN_EFFECT_STRENGTH,MAX_EFFECT_STRENGTH} from './token-art.mjs';
import {isPlayerCharacter} from './player-character-core.mjs';

const ID = 'adventurers-tome';
const DEFAULT_FRAME_SETTING = 'tokenBuilderDefaultFrame';
const editors = new Map();
const api = () => game.modules.get(ID)?.api;
const esc = value => foundry.utils.escapeHTML(String(value ?? ''));
const option = (key,label,selected) => `<option value="${key}"${key===selected?' selected':''}>${label}</option>`;

function materialOptions(selected) {
  const groups = Object.groupBy(Object.entries(FRAME_MATERIALS), ([,value]) => value.family);
  return Object.entries(groups).map(([family,entries])=>`<optgroup label="${esc(family)}">${entries.map(([key,value])=>option(key,value.label,selected)).join('')}</optgroup>`).join('');
}

function editActor(actor) {
  return actor?.isToken ? game.actors.get(actor.token?.actorId) : actor;
}

function canBuild(actor) {
  return Boolean(actor?.documentName === 'Actor' && actor.id && !actor.pack && !actor.isToken && actor.canUserModify(game.user,'update'));
}

function artworkDirectory(world,playerId) {
  const root=`worlds/${world}/adventurers-tome/token-art`;
  return playerId?`${root}/${playerId}`:root;
}

async function artDirectory(Picker,playerId) {
  const world=game.world.id;
  const base = `worlds/${world}/adventurers-tome`;
  const target = `${base}/token-art`;
  const destination=artworkDirectory(world,playerId);
  for (const folder of new Set([base,target,destination])) {
    try {
      const listing = await Picker.browse('data',folder);
      if (listing?.error || listing?.target !== folder) throw Error('Folder missing');
    } catch {
      try { await Picker.createDirectory('data',folder); }
      catch (error) {
        const listing = await Picker.browse('data',folder);
        if (listing?.error || listing?.target !== folder) throw error;
      }
    }
  }
  return destination;
}

function playerUploadRoles() {
  return [CONST.USER_ROLES.PLAYER, CONST.USER_ROLES.TRUSTED];
}

async function preparePlayerArtworkDirectory(user) {
  const Picker=filePickerClass();
  if(game.user.isGM&&game.users.activeGM?.id===game.user.id&&!user.isGM&&user.can('FILES_UPLOAD')&&Picker){
    await artDirectory(Picker,user.id);
  }
}

async function enablePlayerUploads(Picker, Dialog) {
  if (!game.user.isGM) return;
  const world=game.world.id;
  const confirmed=await Dialog.confirm({
    window:{title:'Enable player uploads?'},
    content:'<p>Grant Foundry’s Upload Files permission to the Player and Trusted Player roles in this world so character owners can save their own tokens.</p>',
    rejectClose:false
  });
  if (!confirmed || !game.user.isGM || game.world.id!==world) return;
  const users=game.users.contents.filter(user=>!user.isGM&&(playerUploadRoles().includes(user.role)||user.can('FILES_UPLOAD')));
  for(const user of users)await artDirectory(Picker,user.id);
  if (!game.user.isGM || game.world.id!==world) return;
  const permissions=game.settings.get('core','permissions');
  const uploadRoles=[...new Set([...(permissions.FILES_UPLOAD||[]),...playerUploadRoles()])].sort((a,b)=>a-b);
  await game.settings.set('core','permissions',{...permissions,FILES_UPLOAD:uploadRoles});
  ui.notifications.info('Player token uploads enabled.');
}

async function uploadArt(Picker, directory, file) {
  const uploaded = await Picker.upload('data',directory,file,{},{notify:false});
  const path = uploaded?.path || uploaded?.paths?.[0];
  if (!path) throw Error('Foundry did not return the uploaded image path.');
  return path;
}

function bitmap(src) {
  return new Promise((resolve,reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(Error('This image is empty.'));
    image.onerror = () => reject(Error('The image could not be loaded. Choose a Foundry image or a local file.'));
    image.src = src;
  });
}

function png(canvas) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not export this image as PNG.')), 'image/png'));
}

async function syncPlacedTokenArtwork(actor, state, output, lockRotation, owner, world, replaceCustom, poster, gridSize) {
  const failures=new Set();
  for (const scene of game.scenes.contents) {
    if (game.user.id!==owner || game.world.id!==world || game.actors.get(actor.id)!==actor || actor.prototypeToken?.texture?.src!==output) {
      throw Error('The Actor or token artwork changed before all scenes could be updated.');
    }
    const updates=placedTokenArtworkUpdates(scene.tokens.contents,actor.id,state.tokenTexture,output,lockRotation,{replaceCustom,poster,gridSize});
    if (!updates.length) continue;
    const permitted=scene.canUserModify(game.user,'update') ? updates : updates.filter(update=>scene.tokens.get(update._id)?.canUserModify(game.user,'update'));
    if (permitted.length!==updates.length) failures.add(scene.id);
    if (!permitted.length) continue;
    try {await scene.updateEmbeddedDocuments('Token',permitted);}
    catch {failures.add(scene.id);}
  }
  if (failures.size) ui.notifications.warn(`Actor and prototype saved. Some placed tokens could not be updated in ${failures.size} scene(s).`);
}

async function saveActorArtwork(actor,state,{full,output,poster},design,{portrait,lockRotation,replacePlaced,fullArtwork,owner,world,gridSize,resizePlaced}) {
  const sizeChanged=gridSize&&(gridSize.width!==state.gridSize.width||gridSize.height!==state.gridSize.height);
  const patch=actorArtworkUpdate({mode:portrait?'portrait':'token',source:full,output,poster,design,lockRotation,fullArtwork:fullArtwork||full,gridSize:sizeChanged?gridSize:undefined});
  const animated=!portrait&&/\.webm(?:$|[?#])/i.test(output);
  if (!portrait&&state.ringTexture) patch['prototypeToken.ring.subject.texture']=animated?poster:output;
  // Foundry's Dynamic Ring uses a separate image-only subject. The exported
  // animation already contains the Tome frame and plays through the token texture.
  if (animated&&state.ringEnabled) patch['prototypeToken.ring.enabled']=false;
  // Older Realm Guard builds restore the old portrait at login when its legacy mode is token.
  if (game.system.id==='realm-guard' && actor.flags?.['realm-guard']?.portraitMode==='token') patch['flags.realm-guard.portraitMode']='original';
  await actor.update(patch);
  if (portrait) return;
  if (actor.prototypeToken?.texture?.src!==output) throw Error('Foundry did not save the token image.');
  try { await syncPlacedTokenArtwork(actor,state,output,lockRotation,owner,world,replacePlaced,poster,resizePlaced?gridSize:undefined); }
  catch (error) {ui.notifications.warn(`Prototype saved. Placed tokens were not updated: ${error.message}`);}
}

function builderContent(state,portraitMode) {
  const {framing,frame} = state;
  const shapeGroups=Object.groupBy(Object.entries(FRAME_SILHOUETTES),([,shape])=>shape.group||'Illustrated frames');
  return `<div class="at-token-builder" data-token-builder>
    <div class="at-tb-stage"><div data-tb-preview ${portraitMode?'':'class="at-tb-frame-preview"'}></div>
      <div class="at-tb-source">${game.user.can('FILES_BROWSE')?'<button type="button" data-tb-browse>Browse images</button>':''}<label class="at-tb-file">Choose file<input type="file" data-tb-file></label></div>
      <small>Drop an image on the preview.</small>
      ${!portraitMode&&game.user.isGM?'<button type="button" data-tb-enable-player-uploads>Enable player uploads…</button>':''}
      <p data-tb-error role="status"></p>
    </div>
    <div class="at-tb-options">
      <label>Image fit<select name="fit">${option('whole','Whole image',framing.fit)}${option('cover','Fill / Crop',framing.fit)}${option('contain','Fit and adjust',framing.fit)}</select></label>
      <div class="at-tb-adjust" data-tb-adjust>
        <label>Zoom<input name="zoom" type="range" min=".25" max="5" step=".05" value="${framing.zoom}"></label>
        <div class="at-tb-pair"><label>Horizontal<input name="offsetX" type="number" min="-150" max="150" step=".1" value="${framing.offsetX}"></label>
        <label>Vertical<input name="offsetY" type="number" min="-150" max="150" step=".1" value="${framing.offsetY}"></label>
        <button type="button" data-tb-center>Center</button></div>
      </div>
      ${portraitMode?'':`<label>Shape<select name="shape">
        <optgroup label="Geometric shapes">${Object.entries(TOKEN_SHAPES).filter(([key])=>!Object.hasOwn(FRAME_SILHOUETTES,key)).map(([key,label])=>option(key,label,frame.shape)).join('')}</optgroup>
        ${Object.entries(shapeGroups).map(([label,entries])=>`<optgroup label="${esc(label)}">${entries.map(([key,shape])=>option(key,shape.label,frame.shape)).join('')}</optgroup>`).join('')}
      </select></label>
      <label data-tb-material>Frame appearance<select name="material"><option value="originalArtwork" hidden>Original artwork</option>${materialOptions(frame.material)}</select></label>
      <div class="at-tb-pair" data-tb-color-controls>
        <label>Frame color<input name="color" type="color" value="${frame.color}"></label>
        <button type="button" data-tb-reset-color hidden>Reset frame color</button>
      </div>
      <div data-tb-diameter><label>Frame diameter <span data-tb-diameter-value>${frame.diameter}%</span><input name="diameter" type="range" min="${MIN_FRAME_DIAMETER}" max="${MAX_FRAME_DIAMETER}" value="${frame.diameter}"></label><button type="button" data-tb-reset-diameter aria-label="Reset frame diameter to 100%">100%</button></div>
      <label class="at-tb-checkbox" data-tb-fit-edges><input type="checkbox" name="fitToEdges"${frame.fitToEdges?' checked':''}> Fit to token edges</label>
      <label data-tb-effects>Frame animation<select name="effect">
        ${option('none','None',frame.effect)}
        ${Object.entries(FRAME_EFFECT_GROUPS).map(([label,entries])=>`<optgroup label="${label}">${Object.entries(entries).map(([key,name])=>option(key,name,frame.effect)).join('')}</optgroup>`).join('')}
      </select></label>
      <label data-tb-effect-strength hidden>Animation strength <span data-tb-effect-strength-value>${frame.effectStrength}%</span>
        <input name="effectStrength" type="range" min="${MIN_EFFECT_STRENGTH}" max="${MAX_EFFECT_STRENGTH}" value="${frame.effectStrength}">
      </label>
      <details data-tb-frame-details><summary>Customize frame</summary><div class="at-tb-grid">
        <label>Detail<select name="style">${[['single','Single edge'],['double','Double edge'],['studs','Studs'],['runes','Runes'],['stitch','Stitching']].map(([key,label])=>option(key,label,frame.style)).join('')}</select></label>
        <label>Accent color<input name="accent" type="color" value="${frame.accent}"></label>
        <label>Frame width<input name="bandWidth" type="range" min="${MIN_FRAME_BAND_WIDTH}" max="${MAX_FRAME_BAND_WIDTH}" value="${frame.bandWidth}"></label>
      </div></details>
      <fieldset><legend>Token size on the map</legend><div class="at-tb-pair">
        <label>Width in grid squares<input name="tokenWidth" type="number" step="any" value="${state.gridSize.width}"></label>
        <label>Height in grid squares<input name="tokenHeight" type="number" step="any" value="${state.gridSize.height}"></label>
      </div><label class="at-tb-checkbox"><input name="resizePlaced" type="checkbox"> Resize placed tokens when saving</label></fieldset>
      <div class="at-tb-pair"><button type="button" data-tb-use-default>Use world default frame</button>${game.user.isGM?'<button type="button" data-tb-save-default>Save as default</button>':''}</div>
      <details data-tb-ornaments><summary>Ornaments</summary><div class="at-tb-grid">
        ${Object.entries(FRAME_ORNAMENT_SLOTS).map(([slot,label])=>`<label>${label}<select name="ornament-${slot}">${Object.entries(FRAME_ORNAMENTS)
          .map(([key,text])=>option(key,text,frame.ornaments[slot])).join('')}</select></label>`).join('')}
      </div></details>
      <label class="at-tb-checkbox"><input name="lockRotation" type="checkbox"${state.lockRotation?' checked':''}> Keep portrait upright</label>
      <label class="at-tb-checkbox"><input name="replacePlaced" type="checkbox" checked> Also replace custom images on this character’s placed tokens</label>`}
    </div>
  </div>`;
}

async function openTokenBuilder(input,{portrait=false,file}={}) {
  const actor = editActor(typeof input === 'string' ? await foundry.utils.fromUuid(input) : input);
  if (!canBuild(actor)) throw Error('You need permission to edit this world Actor.');
  const editorKey=`${actor.uuid}:${portrait?'portrait':'token'}`;
  const existing=editors.get(editorKey);
  if (existing) {
    existing.dialog.bringToFront();
    if (file) existing.loadFile(file);
    return existing.dialog;
  }

  const Picker=filePickerClass(), Dialog=dialogV2Class();
  if (!Picker?.upload || !Dialog) throw Error('Foundry image tools are unavailable.');
  const state=tokenArtState(actor), original=JSON.stringify(state);
  const fullArtwork=actorFullArtwork(actor,api()?.getActorProfile?.(actor)?.heroImage);
  const owner=game.user.id, world=game.world.id;
  const name=portrait?'portrait':'token';
  const portraitFrame=applyFrameMaterial({shape:'rectangle'},'none');
  const starting=portrait?{...state,framing:state.portraitFraming}:tokenArtState(actor,game.settings.get(ID,DEFAULT_FRAME_SETTING)||undefined);
  let frameOpeningWeight=starting.frame.weight;
  const initialSource=portrait&&state.portrait?state.portraitSource:fullArtwork;
  let source=initialSource, image, localFile, objectUrl, imageRequest=0, saving=false, closed=false, uiState, previewFrame;
  let pendingFile=file, acceptFile;
  let lastUpload, artwork;

  function authorize() {
    if (closed || game.user.id!==owner || game.world.id!==world || !canBuild(actor) || game.actors.get(actor.id)!==actor) throw Error('This Actor is no longer available to edit.');
    if (!game.user.can('FILES_UPLOAD')) throw Error('Ask your GM to enable Upload Files for your Foundry role before saving.');
    if (JSON.stringify(tokenArtState(actor))!==original) throw Error('The Actor artwork changed. Reopen Token Builder before saving.');
  }

  const dialog=new Dialog({
    window:{title:`${portrait?'Portrait Editor':'Token Builder'} · ${actor.name}`,resizable:true}, position:{width:730}, classes:['at-token-builder-dialog'], modal:false,
    form:{closeOnSubmit:false}, content:builderContent(starting,portrait),
    buttons:[{action:'cancel',label:'Cancel',callback:()=>{if(!saving)return dialog.close();}},
      {action:'save',label:`Save ${name}`,icon:'fa-solid fa-floppy-disk',default:true,callback:async()=>{
        if (saving || !image || !uiState || uiState.previewPending()) return;
        const {root,canvas,controls,error,read}=uiState;
        if (!game.user.can('FILES_UPLOAD')) {
          error.textContent='Ask your GM to enable Upload Files for your Foundry role before saving.';
          return;
        }
        const design=read(), lock=Boolean(controls.lockRotation?.checked), replacePlaced=controls.replacePlaced?.checked!==false;
        const gridSize=portrait?undefined:tokenGridSize({width:controls.tokenWidth.value,height:controls.tokenHeight.value},state.gridSize);
        if(gridSize&&[controls.tokenWidth,controls.tokenHeight].some(field=>!Number.isFinite(field.valueAsNumber)||field.valueAsNumber<=0)){
          error.textContent='Enter a width and height greater than zero.';
          return;
        }
        const uploadKey=JSON.stringify([imageRequest,design]);
        saving=true;root.inert=true;
        error.textContent=`Saving ${name}…`;
        try {
          authorize();
          if (lastUpload?.key!==uploadKey) {
            const animated=!portrait && design.frame.effect!=='none';
            const separatePoster=!portrait&&(animated||game.system.id==='realm-guard');
            const posterCanvas=animated?canvas.ownerDocument.createElement('canvas'):canvas;
            if(animated){
              posterCanvas.width=posterCanvas.height=TOKEN_SIZE;
              paintToken(posterCanvas,image,design.framing,design.frame,0,artwork);
            }
            const posterBlob=await png(posterCanvas);
            const outputBlob=animated?await recordToken(posterCanvas,image,design,{artwork}):posterBlob;
            const directory=game.user.isGM?await artDirectory(Picker):artworkDirectory(world,owner);
            const stamp=`${actor.id}-${foundry.utils.randomID()}`;
            const full=localFile ? await uploadArt(Picker,directory,new File([localFile],`${stamp}-source.${localFile.type.split('/')[1].replace('jpeg','jpg')}`,{type:localFile.type})) : source;
            const extension=animated?'webm':'png';
            const output=await uploadArt(Picker,directory,new File([outputBlob],`${stamp}-${name}.${extension}`,{type:outputBlob.type}));
            const poster=separatePoster?await uploadArt(Picker,directory,new File([posterBlob],`${stamp}-poster.png`,{type:'image/png'})):'';
            lastUpload={key:uploadKey,full,output,poster};
          }
          authorize();
          const savedFullArtwork=portrait&&(localFile||source!==initialSource)?lastUpload.full:fullArtwork;
          await saveActorArtwork(actor,state,lastUpload,design,{portrait,lockRotation:lock,replacePlaced,fullArtwork:savedFullArtwork,owner,world,gridSize,resizePlaced:controls.resizePlaced?.checked===true});
          ui.notifications.info(portrait?'Portrait saved.':'Token saved.');
          await dialog.close();
        } catch (failure) {error.textContent=failure.message;}
        finally {saving=false;root.inert=false;}
      }}]
  });

  dialog.addEventListener('render',()=>{
    const root=dialog.element.querySelector('[data-token-builder]');
    if (!root || uiState?.root===root) return;
    const preview=root.querySelector('[data-tb-preview]');
    const error=root.querySelector('[data-tb-error]');
    const save=dialog.element.querySelector('[data-action="save"]');
    if (save) save.disabled=true;
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=TOKEN_SIZE;
    canvas.setAttribute('aria-label',portrait?'Portrait preview':'Token preview');
    const context=canvas.getContext('2d');
    if (!preview || !context) {
      error.textContent='Token preview is unavailable in this browser.';
      return;
    }
    preview.replaceChildren(canvas);
    const controls=Object.fromEntries([...root.querySelectorAll('[name]')].map(field=>[field.name,field]));
    const isIllustrated=()=>Object.hasOwn(FRAME_SILHOUETTES,controls.shape?.value);
    let illustrated=isIllustrated(), illustratedTint=starting.frame.silhouetteTint||"";
    let illustratedWidth=starting.frame.illustratedBandWidth??frameOpeningWeight;
    let geometricColor=starting.frame.color, geometricWidth=starting.frame.bandWidth;
    let geometricMaterial=starting.frame.material;
    let artworkRequest=0, previewPending=true;
    const resetColor=root.querySelector('[data-tb-reset-color]');
    const originalAppearance=controls.material?.querySelector('[value="originalArtwork"]');
    const selectFrameControls=()=>{
      if(!controls.material)return;
      const next=isIllustrated();
      if(illustrated!==next){
        if(illustrated)illustratedWidth=Number(controls.bandWidth.value);
        else{
          geometricColor=controls.color.value;
          geometricWidth=Number(controls.bandWidth.value);
          geometricMaterial=controls.material.value;
        }
      }
      illustrated=next;
      originalAppearance.hidden=!illustrated;
      for(const group of controls.material.querySelectorAll('optgroup'))group.hidden=illustrated;
      controls.material.value=illustrated?'originalArtwork':geometricMaterial;
      controls.bandWidth.min=illustrated?frameOpeningWeight:MIN_FRAME_BAND_WIDTH;
      controls.bandWidth.value=illustrated?illustratedWidth:geometricWidth;
      controls.color.value=illustrated?illustratedTint||'#808080':geometricColor;
    };
    selectFrameControls();
    if(resetColor)resetColor.onclick=()=>{
      illustratedTint="";
      controls.color.value='#808080';
      refresh();
    };
    const read=()=>normalizeTokenArt(
      Object.fromEntries(['fit','zoom','offsetX','offsetY'].map(name=>[name,controls[name].value])),
      portrait?portraitFrame:{
        ...Object.fromEntries(['shape','material','style','effect','effectStrength','color','accent','bandWidth','diameter'].map(name=>[name,controls[name].value])),
        fitToEdges:controls.fitToEdges.checked,
        weight:frameOpeningWeight,
        ...(illustrated?{material:geometricMaterial,color:geometricColor,bandWidth:geometricWidth,silhouetteTint:illustratedTint,illustratedBandWidth:controls.bandWidth.value}:{}),
        ornaments:Object.fromEntries(Object.keys(FRAME_ORNAMENT_SLOTS).map(slot=>[slot,controls['ornament-'+slot].value]))
      }
    );
    const refresh=()=>{
      cancelAnimationFrame(previewFrame);
      root.querySelector('[data-tb-adjust]').hidden=controls.fit.value==='whole';
      if (!portrait) {
        const framed=illustrated||controls.material.value!=='none';
        const canFitEdges=framed&&controls.shape.value==='circle';
        root.querySelector('[data-tb-fit-edges]').hidden=!canFitEdges;
        root.querySelector('[data-tb-color-controls]').hidden=!framed;
        controls.diameter.disabled=canFitEdges&&controls.fitToEdges.checked;
        root.querySelector('[data-tb-reset-diameter]').disabled=controls.diameter.disabled;
        root.querySelector('[data-tb-diameter]').hidden=!framed;
        root.querySelector('[data-tb-diameter-value]').textContent=controls.diameter.value+'%';
        root.querySelector('[data-tb-frame-details]').hidden=!framed;
        resetColor.hidden=!illustrated||!illustratedTint;
        for(const section of root.querySelectorAll('[data-tb-effects], [data-tb-ornaments]')) section.hidden=!framed;
        root.querySelector('[data-tb-effect-strength]').hidden=!framed||controls.effect.value==='none';
        root.querySelector('[data-tb-effect-strength-value]').textContent=controls.effectStrength.value+'%';
      }
      if (!image||previewPending) return;
      const {framing,frame}=read();
      let lastDraw=-Infinity;
      const draw=now=>{
        if(!image || closed)return;
        if(now-lastDraw>=1000/30-1){
          paintToken(canvas,image,framing,frame,(now%FRAME_ANIMATION_DURATION)/FRAME_ANIMATION_DURATION,artwork);
          if(!portrait)canvas.style.width=`${Math.min(100,100*canvas.width/TOKEN_PREVIEW_SIZE)}%`;
          lastDraw=now;
        }
        if(frame.effect!=='none')previewFrame=requestAnimationFrame(draw);
      };
      draw(performance.now());
    };
    async function refreshArtwork() {
      if(!image){refresh();return;}
      const request=++artworkRequest;
      const portraitRequest=imageRequest;
      previewPending=true;
      if(save)save.disabled=true;
      if(!portrait)error.textContent='Loading frame…';
      refresh();
      try {
        const loaded=portrait?undefined:await loadFrameArtwork(controls.shape.value);
        if(closed||request!==artworkRequest||portraitRequest!==imageRequest)return;
        artwork=loaded;
        previewPending=false;
        error.textContent='';
        if(save)save.disabled=false;
        refresh();
      } catch(errorLoading) {
        if(request===artworkRequest&&portraitRequest===imageRequest)error.textContent='The frame could not load. Select it again or choose another frame.';
        console.warn("Adventurer's Tome | Token frame preview",errorLoading);
      }
    }
    async function load(path,file=null,url=null){
      const request=++imageRequest;
      image=null;
      context.clearRect(0,0,canvas.width,canvas.height);
      if (objectUrl&&objectUrl!==url) URL.revokeObjectURL(objectUrl);
      objectUrl=url;
      if (save) save.disabled=true;
      error.textContent=path?'Loading image…':'Choose an image to start.';
      if (!path) return;
      try {
        const loaded=await bitmap(path);
        if(closed||request!==imageRequest)return;
        image=loaded;source=path;localFile=file;
        await refreshArtwork();
      } catch (failure) {if(request===imageRequest)error.textContent=failure.message;}
    }
    const accept=file=>{
      if (!file || saving) return;
      if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type) || file.size>25*1024*1024) {error.textContent='Choose a PNG, JPG, WebP, GIF or AVIF image up to 25 MB.';return;}
      const url=URL.createObjectURL(file);
      void load(url,file,url);
    };
    acceptFile=accept;
    root.addEventListener('input',event=>{
      const field=event.target;
      if(field===controls.shape){selectFrameControls();void refreshArtwork();return;}
      if(field===controls.color&&illustrated)illustratedTint=field.value;
      if(field===controls.material&&!illustrated){
        geometricMaterial=field.value;
        const frame=applyFrameMaterial(read().frame,field.value);
        for(const key of ['style','color','accent'])controls[key].value=frame[key];
      }
      refresh();
    });
    if(!portrait){
      root.querySelector('[data-tb-reset-diameter]').onclick=()=>{controls.diameter.value=100;refresh();};
      const useDefault=root.querySelector('[data-tb-use-default]');
      useDefault.disabled=!game.settings.get(ID,DEFAULT_FRAME_SETTING);
      useDefault.onclick=()=>{
        const saved=game.settings.get(ID,DEFAULT_FRAME_SETTING);
        if(!saved)return;
        const {frame}=normalizeTokenArt({},saved);
        controls.fitToEdges.checked=Boolean(frame.fitToEdges);
        for(const key of ['shape','style','accent','effect','effectStrength','diameter'])controls[key].value=frame[key];
        for(const [slot,ornament] of Object.entries(frame.ornaments))controls['ornament-'+slot].value=ornament;
        frameOpeningWeight=frame.weight;
        illustrated=isIllustrated();
        illustratedTint=frame.silhouetteTint||'';
        illustratedWidth=frame.illustratedBandWidth??frame.weight;
        geometricColor=frame.color;
        geometricWidth=frame.bandWidth;
        geometricMaterial=frame.material;
        selectFrameControls();
        void refreshArtwork();
      };
      const saveDefault=root.querySelector('[data-tb-save-default]');
      if(saveDefault)saveDefault.onclick=async()=>{
        if(!game.user?.isGM||game.world.id!==world||game.user.id!==owner)return;
        saveDefault.disabled=true;
        try{
          await game.settings.set(ID,DEFAULT_FRAME_SETTING,read().frame);
          useDefault.disabled=false;
          ui.notifications.info('World default frame saved.');
        }catch(failure){ui.notifications.error(failure.message);}
        finally{saveDefault.disabled=false;}
      };
    }
    root.querySelector('[data-tb-center]').onclick=()=>{controls.offsetX.value=controls.offsetY.value=0;refresh();};
    root.querySelector('[data-tb-browse]')?.addEventListener('click',()=>{
      const picker=new Picker({type:'image',current:localFile?'':source,callback:path=>{if(!closed&&!saving)void load(path);}});
      picker.render({force:true});
    });
    const enableUploads=root.querySelector('[data-tb-enable-player-uploads]');
    enableUploads?.addEventListener('click',async()=>{
      enableUploads.disabled=true;
      try{
        await enablePlayerUploads(Picker,Dialog);
      }catch(failure){error.textContent=failure.message;}
      finally{enableUploads.disabled=false;}
    });
    const fileInput=root.querySelector('[data-tb-file]');
    fileInput.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
    fileInput.onchange=event=>{accept(event.target.files[0]);event.target.value='';};
    canvas.ondragover=event=>event.preventDefault();
    canvas.ondrop=event=>{event.preventDefault();accept(event.dataTransfer.files[0]);};
    let drag;
    canvas.onpointerdown=event=>{
      if (event.button!==0 || controls.fit.value==='whole'||!image) return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,ox:Number(controls.offsetX.value),oy:Number(controls.offsetY.value)};
      canvas.setPointerCapture(event.pointerId);
    };
    canvas.onpointermove=event=>{
      if(drag?.id!==event.pointerId)return;
      const scale=tokenFrameScale(read().frame);
      const size=canvas.getBoundingClientRect().width*TOKEN_SIZE*scale/canvas.width;
      for (const [axis,value] of [['offsetX',drag.ox+(event.clientX-drag.x)*100/size],['offsetY',drag.oy+(event.clientY-drag.y)*100/size]]) {
        controls[axis].value=Math.max(-150,Math.min(150,value)).toFixed(1);
      }
      refresh();
    };
    canvas.onlostpointercapture=()=>{drag=null;};
    uiState={root,canvas,controls,error,read,previewPending:()=>previewPending};
    refresh();
    if (pendingFile) {accept(pendingFile);pendingFile=null;}
    else void load(source,localFile,objectUrl);
  });
  dialog.addEventListener('close',()=>{closed=true;cancelAnimationFrame(previewFrame);editors.delete(editorKey);if(objectUrl)URL.revokeObjectURL(objectUrl);},{once:true});
  editors.set(editorKey,{dialog,loadFile:file=>{if(acceptFile)acceptFile(file);else pendingFile=file;}});
  try {await dialog.render({force:true});return dialog;}
  catch (error) {editors.delete(editorKey);throw error;}
}

const openSafely=(actor,options)=>void openTokenBuilder(actor,options).catch(error=>ui.notifications.error(error.message));

const sheets=new WeakMap();
const portraitPreferences=new Map();
function portraitPreference(actor,surface) {
  return `${ID}.portrait.${game.world.id}.${game.user.id}.${actor.uuid}.${surface}`;
}

function setPortraitPreference(actor,surface,mode) {
  const key=portraitPreference(actor,surface);
  portraitPreferences.set(key,mode);
  try {localStorage.setItem(key,mode);} catch { /* Keep the choice for this session. */ }
}

function portraitChoice(actor,surface) {
  const state=tokenArtState(actor);
  const key=portraitPreference(actor,surface);
  const full=actorFullArtwork(actor,api()?.getActorProfile?.(actor)?.heroImage);
  const paths={full,portrait:state.portrait,token:state.token};
  const defaultMode=state.portrait?'portrait':full?'full':'token';
  let selected=portraitPreferences.get(key);
  try {selected=portraitPreferences.get(key)||localStorage.getItem(key);} catch { /* Use the session choice. */ }
  const hasSelection=Object.hasOwn(paths,selected)&&Boolean(paths[selected]);
  const mode=hasSelection?selected:defaultMode;
  return {paths,mode,image:paths[mode]};
}

function showPortrait(image,path,{contain=true}={}) {
  if (!image||!path) return;
  const source=api()?.imageSource?.(path)||path;
  if(contain)image.classList.add('at-tb-display-art');
  if (image.getAttribute('src')!==source) image.src=source;
}

function refreshHomePortraits(root,changedActor) {
  for (const image of root?.querySelectorAll('[data-at-tb-home-actor]')||[]) {
    const id=image.dataset.atTbHomeActor;
    if (changedActor&&changedActor.id!==id) continue;
    const actor=changedActor||game.actors.get(id);
    if (actor&&api()?.canView(actor)){
      image.toggleAttribute('data-at-home-full',!actorPortraitArtwork(actor));
      showPortrait(image,actorHomeArtwork(actor,api()?.getActorProfile?.(actor)?.heroImage),{contain:false});
    }
  }
}

function refreshActorDirectoryArtwork(root,changedActor) {
  const rows=root.querySelectorAll('.directory-item[data-entry-id]');
  for(const row of rows){
    const id=row.dataset.entryId;
    if(changedActor&&id!==changedActor.id)continue;
    const actor=changedActor||game.actors.get(id);
    if(!actor)continue;
    let thumbnail=row.querySelector('.thumbnail');
    const isCharacter=isPlayerCharacter(actor,game.users?.contents||[]);
    const path=isCharacter?tokenArtState(actor).token:'';
    if(!path&&!thumbnail?.hasAttribute('data-at-tb-directory-token'))continue;
    const imagePath=path||actor.img;
    if(!imagePath)continue;
    const video=/\.(?:webm|mp4|m4v|ogv|mov)(?:[?#]|$)/i.test(imagePath);
    const tag=video?'VIDEO':'IMG';
    if(thumbnail?.tagName!==tag){
      const media=document.createElement(tag.toLowerCase());
      media.className='thumbnail';
      if(video){
        media.muted=true;
        media.playsInline=true;
        media.preload='auto';
        media.setAttribute('aria-label',actor.name);
      }else{
        media.alt=actor.name;
        media.loading='lazy';
      }
      if(thumbnail)thumbnail.replaceWith(media);
      else row.prepend(media);
      thumbnail=media;
    }
    thumbnail.toggleAttribute('data-at-tb-directory-token',Boolean(path));
    showPortrait(thumbnail,imagePath,{contain:false});
  }
}

function renderActorDirectory(_app,html) {
  const root=html?.querySelector?html:html?.[0];
  if(!root)return;
  root.dataset.atTbActorDirectory='';
  refreshActorDirectoryArtwork(root);
}

function revealPortraitControls(art) {
  if (art.classList.contains('at-tb-hover-portrait')) return;
  art.classList.add('at-tb-hover-portrait');
  art.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch' && !event.target.closest('.at-tb-portrait-controls') && !art.matches('.at-group-portrait')) {
      art.classList.toggle('at-tb-portrait-revealed');
    }
  });
}

function mountPortrait(actor,art,image,surface) {
  if (!art || !image) return;
  const choice=portraitChoice(actor,surface),{paths}=choice;
  let bar=art.querySelector('[data-at-tb-portrait]');
  if (!bar) {
    if (getComputedStyle(art).position==='static') art.classList.add('at-tb-art-host');
    bar=document.createElement('div');
    bar.className='at-tb-portrait-controls';
    bar.dataset.atTbPortrait='';
    art.append(bar);
  }
  const existingBuilder=art.querySelector('[data-action="tokenBuilder"]');
  const group=surface==='group';
  const mayBuild=!group && canBuild(editActor(actor));
  const hasModes=new Set(Object.values(paths).filter(Boolean)).size>1;
  showPortrait(image,choice.image);
  bar.hidden=!hasModes && !mayBuild;
  if (bar.hidden) return;
  bar.innerHTML=`${hasModes?`<select aria-label="Portrait image">${[['full','Full artwork'],['portrait','Portrait'],['token','Token image']].filter(([key])=>paths[key]).map(([key,label])=>option(key,label)).join('')}</select>`:''}
    ${mayBuild&&!existingBuilder?'<button type="button" data-at-tb-open title="Token Builder" aria-label="Open Token Builder"><i class="fa-solid fa-crop-simple" aria-hidden="true"></i></button>':''}
    ${mayBuild?'<button type="button" data-at-tb-portrait-edit title="Create portrait" aria-label="Create portrait"><i class="fa-solid fa-image" aria-hidden="true"></i></button>':''}`;
  const chooser=bar.querySelector('select');
  if (chooser) {
    chooser.value=choice.mode;
    chooser.addEventListener('change',()=>{
      setPortraitPreference(actor,surface,chooser.value);
      const path=paths[chooser.value];
      showPortrait(image,path);
    });
  }
  bar.querySelector('[data-at-tb-open]')?.addEventListener('click',event=>{
    event.stopPropagation();openSafely(actor);
  });
  bar.querySelector('[data-at-tb-portrait-edit]')?.addEventListener('click',event=>{
    event.stopPropagation();openSafely(actor,{portrait:true});
  });
}

function updateSheetPortrait(root, actor,skipArt) {
  const image=root.querySelector('[data-rg-portrait-image], .rg-npc-portrait, img[data-edit="img"]');
  if (!image) return false;
  const portrait=image.closest('.rg-portrait-wrap, .rg-npc-portrait-wrap') || image.parentElement;
  if (portrait===skipArt) return true;
  portrait.dataset.atTbSheetPortrait='';
  revealPortraitControls(portrait);
  const base=editActor(actor);
  const source=base&&api()?.canView?.(base)?base:actor;
  mountPortrait(source,portrait,image,'sheet');
  return true;
}

function nativeActorSheet(app,html) {
  const actor=app.actor || app.document || app.object;
  if (actor?.documentName!=='Actor') return;
  const root=html?.querySelector?html:html?.[0];
  if (!root) return;
  sheets.set(root,actor);
  root.dataset.atTbActorSheet='';
  if (updateSheetPortrait(root,actor)) return;
  const header=root.querySelector('.window-header') || root.closest('.window-app')?.querySelector('.window-header');
  if (!header || header.querySelector('[data-at-tb-header]') || !canBuild(editActor(actor))) return;
  const button=document.createElement('button');
  button.type='button';button.className='header-control icon fa-solid fa-crop-simple';button.dataset.atTbHeader='';
  button.title='Token Builder';button.setAttribute('aria-label',button.title);
  button.onclick=event=>{event.stopPropagation();openSafely(actor);};
  header.querySelector('.window-title')?.after(button);
}

function tomeActorProfile(app,root,changedActor,skipArt) {
  refreshHomePortraits(root,changedActor);
  for(const portrait of root?.querySelectorAll('[data-at-tb-group-actor]') || []) {
    if (portrait===skipArt) continue;
    const actor=game.actors.get(portrait.dataset.atTbGroupActor);
    if(!actor || !api()?.canView(actor)) continue;
    revealPortraitControls(portrait);
    mountPortrait(actor,portrait,portrait.querySelector('img'),'group');
  }
  const [kind,id] = (app._currentTomeRef?.() || '').split(':');
  if (!root || !id) return;
  let actor=kind==='actor'?game.actors.get(id):null;
  if (kind==='world') {
    const journal=game.journal.get(id);
    const profile=api()?.getWorldProfile(journal);
    const flags=journal?.flags?.[ID];
    const projection=flags?.semanticProjection;
    const source=flags?.knownPersonV1?.actorUuid || projection?.linkedUuid ||
      (profile?.actorId?`Actor.${profile.actorId}`:!projection?profile?.sourceUuid:'');
    const match=/^Actor\.([^.]+)$/.exec(source || '');
    actor=match?game.actors.get(match[1]):null;
  }
  if (!actor || !api()?.canView(actor)) return;
  const art=root.querySelector('.at-profile-page .at-profile-art, .at-world-profile-page .at-world-profile-art');
  if (art!==skipArt) mountPortrait(actor,art,art?.querySelector('img'),'tome');
}

function refreshActorArtwork(actor, changes) {
  if (!changes || actor?.documentName!=='Actor' || actor.isToken || actor.pack) return;
  const path=`flags.${ID}.${TOKEN_ART_FLAG}`;
  const keys=Object.keys(changes);
  const changed=['img','prototypeToken.texture.src',path,'flags.realm-guard.portraitSource','flags.realm-guard.tokenBuilderSourcePortrait','flags.realm-guard.tokenPortraitPath']
    .some(field=>foundry.utils.hasProperty(changes,field)||keys.some(key=>key===field||key.startsWith(field+'.')));
  if (!changed) return;
  for(const root of document.querySelectorAll('[data-at-tb-actor-directory]'))refreshActorDirectoryArtwork(root,actor);
  refreshActorPortraits(actor);
}

function refreshActorPortraits(actor,skipArt) {
  for (const root of document.querySelectorAll('[data-at-tb-actor-sheet]')) {
    const sheetActor=sheets.get(root);
    if (editActor(sheetActor)?.id===actor.id && (!sheetActor.isToken || api()?.canView(actor))) updateSheetPortrait(root,actor,skipArt);
  }
  if (!document.getElementById('adventurers-tome-app')) return;
  const app=api()?.app?.();
  if (!app?.rendered || !api()?.canView(actor)) return;
  tomeActorProfile(app,app.element,actor,skipArt);
}

function sheetPortraitActor(target) {
  return sheets.get(target.closest?.('[data-at-tb-actor-sheet]'));
}

function sheetArtworkAction(target) {
  const realmGuard=game.system.id==='realm-guard';
  const portrait=target.closest?.('img[data-edit="img"]')?.closest('[data-at-tb-sheet-portrait]') ||
    (realmGuard&&target.closest?.('[data-action="portraitSettings"], [data-action="chooseArt"]'));
  if (portrait) return {actor:sheetPortraitActor(portrait),portrait:true};
  if (!realmGuard) return null;
  const button=target.closest?.('[data-action="tokenBuilder"], [data-rg-inspect-action="token"][data-actor-id]');
  if (!button) return null;
  const actor=button.dataset.actorId?game.actors.get(button.dataset.actorId):sheetPortraitActor(button);
  return {actor,portrait:false};
}

Hooks.once('init',()=>{
  game.settings.register(ID,DEFAULT_FRAME_SETTING,{scope:'world',config:false,restricted:true,type:Object,default:null});
});

Hooks.once('ready',()=>{
  if(api())api().tokenBuilder=Object.freeze({open:openTokenBuilder});
  if(game.user.isGM)for(const user of game.users.contents)prepareArtworkDirectorySafely(user);
  document.addEventListener('click',event=>{
    const group=event.target.closest?.('#adventurers-tome-app .at-character-image')?.closest('[data-at-tb-group-actor]');
    if(event.pointerType==='touch' && group?.querySelector('[data-at-tb-portrait] select') && !group.classList.contains('at-tb-portrait-revealed')){
      event.preventDefault();event.stopImmediatePropagation();group.classList.add('at-tb-portrait-revealed');return;
    }
    const action=sheetArtworkAction(event.target);
    if(!canBuild(editActor(action?.actor)))return;
    event.preventDefault();event.stopImmediatePropagation();openSafely(action.actor,{portrait:action.portrait});
  },true);
  const droppedPortrait=(event)=>{
    const portrait=event.target.closest?.('[data-at-tb-sheet-portrait]');
    const actor=portrait&&sheetPortraitActor(portrait);
    return canBuild(editActor(actor))?actor:null;
  };
  document.addEventListener('dragover',event=>{
    if(event.dataTransfer?.types.includes('Files')&&droppedPortrait(event))event.preventDefault();
  },true);
  document.addEventListener('drop',event=>{
    const file=event.dataTransfer?.files[0], actor=file&&droppedPortrait(event);
    if(!actor||!file.type.startsWith('image/'))return;
    event.preventDefault();event.stopImmediatePropagation();openSafely(actor,{portrait:true,file});
  },true);
});
function prepareArtworkDirectorySafely(user) {
  void preparePlayerArtworkDirectory(user).catch(error=>console.warn("Adventurer's Tome | Could not prepare player token folder",error));
}
Hooks.on('createUser',prepareArtworkDirectorySafely);
Hooks.on('updateUser',(user,changes)=>{
  if(Object.hasOwn(changes,'role')||Object.hasOwn(changes,'permissions'))prepareArtworkDirectorySafely(user);
});
Hooks.on('renderApplicationV2',nativeActorSheet);
Hooks.on('renderApplication',nativeActorSheet);
Hooks.on('renderActorDirectory',renderActorDirectory);
Hooks.on('adventurersTomeViewPrepared',tomeActorProfile);
Hooks.on('updateActor',refreshActorArtwork);
Hooks.on('preCreateToken',(token,data,options)=>{
  // Foundry copies the native prototype's false value into ordinary actor drops.
  // Preserve existing documents being moved with their IDs, and honor actor overrides.
  if (options.keepId) return;
  const lockRotation=data.lockRotation===true||defaultTokenLockRotation(token.baseActor);
  if (token.lockRotation!==lockRotation) token.updateSource({lockRotation});
});
Hooks.on('preUpdateActor',(actor,changes)=>{
  if (actor.isToken||actor.pack) return;
  const lockRotation=changes.prototypeToken?.lockRotation;
  if (typeof lockRotation==='boolean' && lockRotation!==actor.prototypeToken?.lockRotation) {
    foundry.utils.setProperty(changes,TOKEN_ART_ROTATION_PATH,lockRotation);
  }
});
