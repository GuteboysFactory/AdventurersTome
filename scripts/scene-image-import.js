import {filePickerClass} from './foundry-platform.js';

const IMAGE_TYPES='image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/apng';
const EXTENSIONS=/\.(png|jpe?g|webp|avif|gif|bmp|apng)$/i;
let importing=false;

export function canImportScenes(){
  return game.user?.isGM===true&&game.user.can('FILES_UPLOAD');
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

async function imageDimensions(file){
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw Error('The file could not be read as an image.');
    return {width:image.naturalWidth,height:image.naturalHeight};
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

export async function importSceneImages(files,sceneCreationData){
  if(!canImportScenes())throw Error('Only the GM can create scenes from files.');
  if(importing)throw Error('Scene images are already being imported.');
  if(!files.length)return;
  const userId=game.user.id,worldId=game.world.id;
  const stillAllowed=()=>canImportScenes()&&game.user.id===userId&&game.world.id===worldId;
  const picker=filePickerClass();
  if(!picker?.upload)throw Error('Foundry file uploads are unavailable.');
  let directory,created=0;
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
        const dimensions=await imageDimensions(file);
        if(!stillAllowed())throw Error('Your world or permissions changed.');
        directory??=await uploadDirectory(picker,worldId);
        if(!stillAllowed())throw Error('Your world or permissions changed.');
        const extension=file.name.match(EXTENSIONS)[0];
        const name=file.name.slice(0,-extension.length).trim()||'New scene';
        const stored=new File([file],`${foundry.utils.randomID(24)}${extension.toLowerCase()}`,{type:file.type});
        const uploaded=await picker.upload('data',directory,stored,{}, {notify:false});
        if(!uploaded?.path)throw Error(uploaded?.message||'Foundry did not return an uploaded image path.');
        if(!stillAllowed())throw Error(`Image uploaded to ${uploaded.path}. Your world or permissions changed before scene creation.`);
        let scene;
        try{
          scene=await getDocumentClass('Scene').create({
            name,...sceneCreationData(dimensions),background:{src:uploaded.path},active:false,navigation:false,
            ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE}
          });
        }catch(error){throw Error(`${error.message} · Image saved as ${uploaded.path}.`);}
        if(!scene)throw Error(`Foundry did not create the scene. Image saved as ${uploaded.path}.`);
        created++;
      }catch(error){
        failures.push({name:file.name,message:error.message});
      }
    }
    if(created)ui.notifications.info(created===1?'Created 1 scene.':`Created ${created} scenes.`);
    for(const failure of failures)ui.notifications.warn(`${failure.name}: ${failure.message}`);
    return {created,failures};
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
