import {dialogV2Class,filePickerClass} from './foundry-platform.js';

const ID='adventurers-tome';
const IMPORT_SETTINGS='sceneImageImportOptions';
const IMPORT_DEFAULTS={directory:'',sidebarDrop:true,navigation:false,playerAccess:false,activate:false,duplicates:'copy'};
const DUPLICATE_OPTIONS={
  copy:'Create a new scene with a unique image file',
  skip:'Skip an existing image or scene',
  reuse:'Use the existing image and update the matching scene',
  replace:'Replace an existing image and update the matching scene'
};
const IMAGE_TYPES='image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/apng';
const EXTENSIONS=/\.(png|jpe?g|webp|avif|gif|bmp|apng)$/i;
let importing=false;

export function canImportScenes(){
  return game.user?.isGM===true&&game.user.can('FILES_UPLOAD');
}

export function registerSceneImportSettings(){
  game.settings.register(ID,IMPORT_SETTINGS,{scope:'world',config:false,type:Object,default:IMPORT_DEFAULTS,
    onChange:()=>{if(game.user.isGM&&ui.scenes?.rendered)void ui.scenes.render();}});
}

function sceneImportOptions(){
  return {...IMPORT_DEFAULTS,...game.settings.get(ID,IMPORT_SETTINGS)};
}

function normalizeDirectory(value){
  const path=value.trim().replaceAll('\\','/').replace(/\/+$/,'');
  if(path&&(path.split('/').some(part=>!part||part==='.'||part==='..')||/[%:?#<>|*"\x00-\x1f]/u.test(path))){
    throw Error('Enter a folder relative to Foundry’s User Data directory, such as assets/maps.');
  }
  return path;
}

export async function editSceneImportSettings(){
  if(!game.user.isGM)return;
  const userId=game.user.id,worldId=game.world.id;
  const options=sceneImportOptions();
  const checked=key=>options[key]?'checked':'';
  const safe=foundry.utils.escapeHTML(options.directory);
  const result=await dialogV2Class().prompt({
    window:{title:'Scene image import settings',resizable:true},position:{width:480},
    classes:['at-scene-navigation-settings'],rejectClose:false,
    content:`<label>Image upload folder<input name="directory" value="${safe}" placeholder="World scene-images folder"></label>
      <p>Use an existing folder relative to Foundry’s User Data directory, for example <code>assets/maps</code>. Leave empty to use the world’s Tome folder.</p>
      <label><input type="checkbox" name="sidebarDrop" ${checked('sidebarDrop')}> Show the drop area in Foundry’s Scenes tab</label>
      <label><input type="checkbox" name="navigation" ${checked('navigation')}> Show new scenes in navigation</label>
      <label><input type="checkbox" name="playerAccess" ${checked('playerAccess')}> Give all players access to new scenes</label>
      <label><input type="checkbox" name="activate" ${checked('activate')}> Activate the last imported scene for everyone</label>
      <label>Existing image or scene<select name="duplicates">${Object.entries(DUPLICATE_OPTIONS).map(([value,label])=>
        `<option value="${value}" ${options.duplicates===value?'selected':''}>${label}</option>`).join('')}</select></label>`,
    ok:{label:'Save import settings',callback:(_event,button)=>{
      const fields=button.form.elements;
      return {directory:normalizeDirectory(fields.directory.value),sidebarDrop:fields.sidebarDrop.checked,navigation:fields.navigation.checked,
        playerAccess:fields.playerAccess.checked,activate:fields.activate.checked,duplicates:fields.duplicates.value};
    }}
  });
  if(!result||!game.user.isGM||game.user.id!==userId||game.world.id!==worldId)return;
  if(result.directory)await filePickerClass().browse('data',result.directory);
  if(game.user.isGM&&game.user.id===userId&&game.world.id===worldId)await game.settings.set(ID,IMPORT_SETTINGS,result);
}

export function sceneImageFilename(file){
  return EXTENSIONS.test(file?.name||'')&&(!file.type||file.type.startsWith('image/'));
}

function imageDrag(transfer){
  if(!transfer)return false;
  if(transfer.files?.length)return Array.from(transfer.files).some(sceneImageFilename);
  const items=Array.from(transfer.items||[]).filter(item=>item.kind==='file');
  if(items.length)return items.some(item=>!item.type||IMAGE_TYPES.split(',').includes(item.type));
  return Array.from(transfer.types||[]).includes('Files');
}

async function readImageDimensions(source){
  const image=new Image();
  image.src=source;
  await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw Error('The file could not be read as an image.');
  return {width:image.naturalWidth,height:image.naturalHeight};
}

async function imageDimensions(file){
  const url=URL.createObjectURL(file);
  try {
    return await readImageDimensions(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadDirectory(picker,worldId){
  let directory=`worlds/${worldId}`;
  for(const folder of ['adventurers-tome','scene-images']){
    directory+=`/${folder}`;
    try{await picker.createDirectory('data',directory);}
    catch{await picker.browse('data',directory);}
  }
  return directory;
}

function browserFilename(path){
  const name=path.split('/').at(-1);
  try{return decodeURIComponent(name);}
  catch{return name;}
}

async function confirmSceneImageReplacement(path){
  return dialogV2Class().confirm({window:{title:'Replace existing scene image?'},rejectClose:false,
    content:`<p>Replace <strong>${foundry.utils.escapeHTML(path)}</strong>? Other scenes using this image will also show the replacement.</p>`,
    yes:{label:'Replace image'},no:{label:'Skip image'}});
}

export async function importSceneImages(files,sceneCreationData,options){
  if(!canImportScenes())throw Error('Only the GM can create scenes from files.');
  if(importing)throw Error('Scene images are already being imported.');
  if(!files.length)return;
  options??=sceneImportOptions();
  const userId=game.user.id,worldId=game.world.id;
  const stillAllowed=()=>canImportScenes()&&game.user.id===userId&&game.world.id===worldId;
  const picker=filePickerClass();
  if(!picker?.upload)throw Error('Foundry file uploads are unavailable.');
  const mode=Object.hasOwn(DUPLICATE_OPTIONS,options.duplicates)?options.duplicates:'copy';
  let directory,created=0,updated=0,skipped=0,lastScene;
  const failures=[];
  importing=true;
  try{
    for(const file of files){
      if(!stillAllowed()){
        failures.push({name:'Scene import',message:'Your world or permissions changed. The remaining images were skipped.'});
        break;
      }
      try{
        if(!sceneImageFilename(file))throw Error('Choose a PNG, JPEG, WebP, AVIF, GIF, APNG or BMP image.');
        directory??=(options.directory?normalizeDirectory(options.directory):await uploadDirectory(picker,worldId));
        const extension=file.name.match(EXTENSIONS)[0];
        const name=file.name.slice(0,-extension.length).trim()||'New scene';
        const matches=mode==='copy'?[]:game.scenes.contents.filter(scene=>scene.name.toLowerCase()===name.toLowerCase());
        let path;
        if(mode!=='copy'){
          const listing=await picker.browse('data',directory);
          path=listing.files.find(entry=>browserFilename(entry).toLowerCase()===file.name.toLowerCase());
        }
        if(!stillAllowed())throw Error('Your world or permissions changed.');
        if(mode==='skip'&&(path||matches.length)){
          skipped++;
          continue;
        }
        if(matches.length>1)throw Error('Multiple scenes have this name. Rename one of the scenes or choose a new scene in import settings.');
        const dimensions=mode==='reuse'&&path?await readImageDimensions(path):await imageDimensions(file);
        const replacing=Boolean(path&&mode==='replace');
        if(replacing&&!await confirmSceneImageReplacement(path)){
          skipped++;
          continue;
        }
        if(!stillAllowed())throw Error('Your world or permissions changed.');
        const existing=matches[0];
        if(!path||mode==='replace'){
          const filename=mode==='copy'?`${foundry.utils.randomID(24)}${extension.toLowerCase()}`:path?browserFilename(path):file.name;
          const stored=new File([file],filename,{type:file.type});
          const uploaded=await picker.upload('data',directory,stored,{}, {notify:false});
          if(!uploaded?.path)throw Error(uploaded?.message||'Foundry did not return an uploaded image path.');
          path=uploaded.path;
        }
        if(!stillAllowed())throw Error(`Image available at ${path}. Your world or permissions changed before scene creation.`);
        let scene;
        try{
          if(existing){
            const patch={...dimensions,'background.src':path};
            if(globalThis.canvas?.ready&&(replacing||existing.background.src!==path)){
              try{
                // An overwritten path can still be cached by Foundry's texture loader.
                const img=replacing?`${path}?tome=${foundry.utils.randomID()}`:path;
                const {thumb}=await existing.createThumbnail({img});
                if(thumb)patch.thumb=thumb;
              }catch(error){
                ui.notifications.warn(`${existing.name}: Could not refresh the scene thumbnail. ${error.message}`);
              }
            }
            if(!stillAllowed())throw Error('Your world or permissions changed.');
            if(game.scenes.get(existing.id)!==existing||existing.name.toLowerCase()!==name.toLowerCase()){
              throw Error('The matching scene changed. Import the image again.');
            }
            await existing.update(patch);
            scene=existing;
            updated++;
          }else{
            const access=CONST.DOCUMENT_OWNERSHIP_LEVELS;
            scene=await getDocumentClass('Scene').create({
              name,...sceneCreationData(dimensions),background:{src:path},active:false,navigation:options.navigation===true,
              ownership:{default:options.playerAccess?access.LIMITED:access.NONE}
            });
            if(!scene)throw Error('Foundry did not create the scene.');
            created++;
          }
        }catch(error){throw Error(`${error.message} · Image available at ${path}.`);}
        lastScene=scene;
      }catch(error){
        failures.push({name:file.name,message:error.message});
      }
    }
    if(options.activate&&lastScene&&stillAllowed()){
      try{await lastScene.activate();}
      catch(error){failures.push({name:lastScene.name,message:error.message});}
    }
    if(created)ui.notifications.info(created===1?'Created 1 scene.':`Created ${created} scenes.`);
    if(updated)ui.notifications.info(updated===1?'Updated 1 scene.':`Updated ${updated} scenes.`);
    if(skipped)ui.notifications.info(skipped===1?'Skipped 1 image.':`Skipped ${skipped} images.`);
    for(const failure of failures)ui.notifications.warn(`${failure.name}: ${failure.message}`);
    return {created,updated,skipped,failures};
  }finally{importing=false;}
}

export function sceneImportControls(){
  if(!canImportScenes())return '';
  return `<div class="at-scene-import"><button type="button" data-scene-pick-images><i class="fa-solid fa-file-image" aria-hidden="true"></i> Create scenes from images…</button>
    <input type="file" data-scene-image-files hidden></div>`;
}

export function bindSceneImportInput(root,create){
  const picker=root.querySelector('[data-scene-image-files]');
  if(!picker)return;
  // DialogV2 sanitizes file input attributes before mounting the form.
  picker.multiple=true;
  picker.accept=IMAGE_TYPES;
  root.querySelector('[data-scene-pick-images]').onclick=()=>picker.click();
  picker.onchange=()=>{
    const files=Array.from(picker.files||[]);
    picker.value='';
    if(files.length)void create(files).catch(error=>ui.notifications.error(error.message));
  };
}

export function mountSceneDirectoryImport(root,create){
  const mounted=root.querySelector('[data-scene-directory-import]');
  if(!canImportScenes()||!sceneImportOptions().sidebarDrop){
    mounted?.remove();
    return;
  }
  if(mounted)return;
  const zone=document.createElement('div');
  zone.className='at-scene-directory-import';
  zone.dataset.sceneDirectoryImport='';
  zone.innerHTML=`<button type="button" data-scene-pick-images><i class="fa-solid fa-map" aria-hidden="true"></i> Drop scene images here or browse…</button>
    <input type="file" data-scene-image-files hidden>`;
  bindSceneImportInput(zone,create);
  zone.addEventListener('dragover',event=>{
    if(!canImportScenes()||!imageDrag(event.dataTransfer))return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect='copy';
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave',event=>{
    if(!zone.contains(event.relatedTarget))zone.classList.remove('is-over');
  });
  zone.addEventListener('drop',event=>{
    zone.classList.remove('is-over');
    if(!canImportScenes()||!event.dataTransfer?.files?.length)return;
    event.preventDefault();
    event.stopPropagation();
    void create(Array.from(event.dataTransfer.files)).catch(error=>ui.notifications.error(error.message));
  });
  (root.querySelector('.directory-footer')??root).append(zone);
}

export function installSceneDropTarget(create){
  if(!canImportScenes())return;
  let target,timer;
  function hide(){
    clearTimeout(timer);
    target?.remove();
    target=null;
  }
  document.addEventListener('dragover',event=>{
    const board=globalThis.canvas?.app?.canvas??globalThis.canvas?.app?.view;
    const overTarget=target?.contains(event.target);
    if(!canImportScenes()||!globalThis.canvas?.ready||!imageDrag(event.dataTransfer)){
      hide();
      return;
    }
    if(event.target!==board&&!overTarget)return;
    if(!target){
      target=document.createElement('div');
      target.className='at-scene-image-drop';
      target.innerHTML='<i class="fa-solid fa-map" aria-hidden="true"></i><strong>Create scene here</strong>';
      document.body.append(target);
    }
    target.classList.toggle('is-over',Boolean(overTarget));
    if(overTarget){
      event.preventDefault();
      event.stopImmediatePropagation();
      event.dataTransfer.dropEffect='copy';
    }
    clearTimeout(timer);
    timer=setTimeout(hide,1000);
  },true);
  document.addEventListener('drop',event=>{
    const overTarget=target?.contains(event.target);
    hide();
    if(!overTarget||!canImportScenes()||!event.dataTransfer?.files?.length)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void create(Array.from(event.dataTransfer.files)).catch(error=>ui.notifications.error(error.message));
  },true);
  document.addEventListener('dragend',hide,true);
  window.addEventListener('blur',hide);
}
