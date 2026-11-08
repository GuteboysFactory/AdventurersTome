import './private-whisper.js';
import {imageDimensions} from './private-vault-image-header.mjs';
import './private-vault-inbox.js';
import './private-vault-media-transfer.mjs';
// Private media never uses a plaintext FilePicker upload or a document flag.
const api=()=>game.modules.get('adventurers-tome')?.api;
const secure=()=>api().securePrivateVault;
const builtins=['prep','secret','reminder','clue','reveal','consequence','question','idea','scene'];
const allowedTags=new Set(['P','BR','STRONG','EM','U','H2','H3','UL','OL','LI','BLOCKQUOTE','A']);
export function safeRichText(value,doc=globalThis.document){
 const template=doc.createElement('template');template.innerHTML=String(value||'').slice(0,200000);
 const output=doc.createElement('div');
 function copy(source,target,depth=0){if(depth>40)return;for(const node of source.childNodes){
  if(node.nodeType===3){target.append(doc.createTextNode(node.textContent));continue;}
  if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','TEMPLATE'].includes(node.tagName))continue;
  if(!allowedTags.has(node.tagName)){copy(node,target,depth+1);continue;}
  const clean=doc.createElement(node.tagName.toLowerCase());
  if(node.tagName==='A'){try{const url=new URL(node.getAttribute('href'));if(['https:','http:'].includes(url.protocol)){clean.href=url.href;clean.target='_blank';clean.rel='noopener noreferrer';}}catch{}}
  copy(node,clean,depth+1);target.append(clean);
 }}copy(template.content,output);return output.innerHTML;
}
export function plainRichText(value,doc=globalThis.document){const host=doc.createElement('div');host.innerHTML=safeRichText(value,doc);for(const e of host.querySelectorAll('p,h2,h3,li,blockquote,br'))e.append(doc.createTextNode('\n'));return host.textContent.trim();}
const urls=new Map(),viewers=new Set();let generation=0;
const check=()=>{if(!game.user?.isGM||!secure()?.unlocked())throw Error('Unlock Private Vault before using private images.');};
function path(id){if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id)||!/^[a-zA-Z0-9_-]+$/.test(game.world.id))throw Error('Invalid private image path.');return `worlds/${game.world.id}/tome-private-vault/${id}.json`;}
function clear(){generation++;for(const viewer of viewers){viewer.element?.remove();void viewer.close();}viewers.clear();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
async function normalizeImage(file){
 check();if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8388608)throw Error('Choose a PNG, JPEG or WebP image up to 8 MB.');
 const input=await file.arrayBuffer();if(input.byteLength>8388608)throw Error('Choose an image up to 8 MB.');imageDimensions(input);
 const bitmap=await createImageBitmap(file);try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('Choose an image smaller than 40 megapixels.');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));if(!blob||blob.size>2097152)throw Error('The prepared image exceeds 2 MB. Choose a smaller image.');return blob;
 }finally{bitmap.close();}
}
async function upload(file){
 check();const stamp=generation,blob=await normalizeImage(file),id=crypto.randomUUID(),data=await secure().sealAttachment(id,await blob.arrayBuffer());check();if(stamp!==generation)throw Error('Vault locked before upload.');
 const picker=foundry.applications.apps.FilePicker.implementation,directory=path(id).replace(/\/[^/]+$/,'');
 try{await picker.browse('data',directory);}catch{await picker.createDirectory('data',directory);}
 const result=await picker.upload('data',directory,new File([JSON.stringify(data)],id+'.json',{type:'application/json'}),{},{notify:false});
 if(!result?.path||result.path!==path(id))throw Error('Private image could not be stored. Your note is unchanged.');check();if(stamp!==generation)throw Error('Vault locked during upload.');return {id,mime:'image/webp',caption:'',bytes:blob.size};
}
async function imageURL(ref){
 check();if(urls.has(ref.id))return urls.get(ref.id);const stamp=generation;
 const response=await fetch(path(ref.id),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('Private image is unavailable.');
 if(Number(response.headers.get('content-length'))>3000000)throw Error('Private image is too large.');
 const text=await response.text();if(text.length>3000000)throw Error('Private image is too large.');
 const bytes=await secure().openAttachment(ref.id,JSON.parse(text));check();if(stamp!==generation)throw Error('Vault locked during image loading.');
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));urls.set(ref.id,url);while(urls.size>12){const first=urls.keys().next().value;URL.revokeObjectURL(urls.get(first));urls.delete(first);}return url;
}
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function shareImage(ref,whisper=false){
 check();const stamp=generation;let recipients=[];
 if(whisper){const users=game.users.contents.filter(u=>u.id!==game.user.id);recipients=await foundry.applications.api.DialogV2.prompt({window:{title:'Whisper this image'},content:`<p>Only the selected image and its caption will be sent.</p><label>Recipients<select multiple name="recipients" size="6">${users.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></label>`,ok:{label:'Whisper image',callback:(_e,_b,d)=>[...d.element.querySelector('select').selectedOptions].map(o=>o.value)},rejectClose:false});if(!recipients?.length)return;}
 else if(!await foundry.applications.api.DialogV2.confirm({window:{title:'Share this image publicly?'},content:'<p>This sends only this image and its caption to public chat. The rest of the private note stays in your Vault.</p>'}))return;
 check();if(stamp!==generation)throw Error('Vault changed before sharing.');const blob=await fetch(await imageURL(ref)).then(r=>r.blob());const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});check();if(stamp!==generation)throw Error('Vault locked before sharing.');
 if(recipients.some(id=>!game.users.get(id)))throw Error('A selected recipient is no longer available.');
 if(whisper)return api().privateWhisper.send({version:1,kind:'image',title:String(ref.caption||'Shared image').slice(0,500),dataURL:data},recipients,{guard:()=>{check();if(stamp!==generation)throw Error('Vault changed before sharing.');}});
 return ChatMessage.create({content:`<figure><img src="${data}" alt="${esc(ref.caption||'Shared image')}"><figcaption>${esc(ref.caption)}</figcaption></figure>`,...(whisper?{whisper:recipients}:{})});
}
async function enlarge(ref){
 check();const stamp=generation,url=await imageURL(ref);check();if(stamp!==generation)return;
 const d=new foundry.applications.api.DialogV2({window:{title:'Private image',resizable:true},position:{width:850,top:50,height:Math.min(760,innerHeight-90)},classes:['at-vault-dialog'],content:`<figure><img class="at-vault-enlarged-image" src="${url}" alt="${esc(ref.caption||'Private image')}"><figcaption>${esc(ref.caption)}</figcaption></figure>`,buttons:[{action:'public',label:'Send image to public chat',callback:()=>shareImage(ref,false)},{action:'whisper',label:'Whisper image…',callback:()=>shareImage(ref,true)},{action:'close',label:'Close',callback:(_e,_b,dialog)=>dialog.close()}],form:{closeOnSubmit:false}});viewers.add(d);d.addEventListener('close',()=>viewers.delete(d),{once:true});await d.render({force:true});return d;
}
function categories(){check();const custom=JSON.parse(secure().get('vaultCategoriesV1')||'{}').categories||[];return [...builtins.map(id=>({id,label:id[0].toUpperCase()+id.slice(1),builtin:true})),...custom.filter(c=>typeof c.id==='string'&&typeof c.label==='string')];}
async function saveCategory(label,id){check();label=String(label||'').trim();if(!label||label.length>60)throw Error('Use a category name between 1 and 60 characters.');const all=categories();if(all.some(c=>c.label.toLowerCase()===label.toLowerCase()&&c.id!==id))throw Error('That category already exists.');if(id&&all.find(c=>c.id===id)?.builtin)throw Error('Built-in categories cannot be renamed.');const custom=all.filter(c=>!c.builtin);if(id){const c=custom.find(c=>c.id===id);if(!c)throw Error('Category no longer exists.');c.label=label;}else{if(custom.length>=100)throw Error('Use at most 100 custom categories.');custom.push({id:crypto.randomUUID(),label});}await secure().set('vaultCategoriesV1',JSON.stringify({version:1,categories:custom}));Hooks.callAll('adventurersTomePrivateNotesChanged',{});return custom.at(-1);}
async function manageCategories(){
 check();const initial=secure().get('vaultCategoriesV1'),custom=categories().filter(c=>!c.builtin);let resolve;const done=new Promise(r=>resolve=r);
 const d=new foundry.applications.api.DialogV2({window:{title:'Private note categories',resizable:true},position:{width:620,top:70,height:Math.min(640,innerHeight-120)},classes:['at-vault-dialog'],form:{closeOnSubmit:false},content:`<section class="at-vault-editor" data-at-vault-category-manager><p>Rename your categories here. Existing notes keep their category and history.</p><p data-category-error role="alert" hidden></p>${custom.length?custom.map(c=>`<label>Category name<input data-category-id="${esc(c.id)}" value="${esc(c.label)}" maxlength="60"></label>`).join(''):'<p>No custom categories yet. Use New category in the note editor to add one.</p>'}<small>Built-in categories: ${categories().filter(c=>c.builtin).map(c=>esc(c.label)).join(', ')}.</small></section>`,buttons:[{action:'cancel',label:'Close',callback:(_e,_b,dialog)=>dialog.close()},{action:'save',label:'Save category names',callback:async(_e,_b,dialog)=>{const error=dialog.element.querySelector('[data-category-error]');try{check();await secure().refresh();if(secure().get('vaultCategoriesV1')!==initial)throw Error('Categories changed elsewhere. Reopen this window before saving.');const names=new Set(categories().filter(c=>c.builtin).map(c=>c.label.toLowerCase())),updated=[...dialog.element.querySelectorAll('[data-category-id]')].map(input=>{const prior=custom.find(c=>c.id===input.dataset.categoryId),label=input.value.trim();if(!prior||!label||label.length>60||names.has(label.toLowerCase()))throw Error('Use a unique category name between 1 and 60 characters.');names.add(label.toLowerCase());return {...prior,label};});await secure().set('vaultCategoriesV1',JSON.stringify({version:1,categories:updated}));Hooks.callAll('adventurersTomePrivateNotesChanged',{});await dialog.close();}catch(e){error.textContent=e.message;error.hidden=false;}}}]});viewers.add(d);d.addEventListener('close',()=>{viewers.delete(d);resolve();},{once:true});await d.render({force:true});return done;
}
Hooks.once('ready',()=>{api().privateVaultMedia=Object.freeze({upload,imageURL,enlarge,shareImage,clear,categories,saveCategory,manageCategories,safeRichText,plainRichText});});
Hooks.on('adventurersTomeVaultLockChanged',({unlocked})=>{if(!unlocked)clear();});
Hooks.on('updateUser',user=>{if(!user?.id||user.id===game.user?.id)clear();});Hooks.on('closeGame',clear);
