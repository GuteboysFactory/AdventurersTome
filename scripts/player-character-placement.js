globalThis.ATTestAI.assertEnabled();
const MODULE_ID='adventurers-tome',PLACEMENT_QUERY='adventurersTome.placeAssignedCharacter',REMOVAL_QUERY='adventurersTome.removeAssignedToken';
let menu=null,hostedButton=null,hostedOriginal=null,menuEpoch=0,rightPress=null,pending=null;
const board=()=>document.getElementById('board')||globalThis.canvas?.app?.canvas;
function character(user=game.user){const assigned=user?.character;return typeof assigned==='string'?game.actors?.get(assigned):assigned;}
function owns(actor,user){return typeof actor?.testUserPermission==='function'?actor.testUserPermission(user,'OWNER')===true:user===game.user&&actor?.isOwner===true;}
function unavailable(){
 if(!globalThis.canvas?.ready||!canvas.scene||typeof canvas.tokens?._onDropActorData!=='function')return 'Open a scene before placing your character.';
 const actor=character();if(!actor||actor.pack)return 'Choose your character in Player Configuration first.';
 if(!owns(actor,game.user))return 'You need ownership of your assigned character.';
 if(game.user?.can?.('TOKEN_CREATE')!==true){
  const gm=game.users?.activeGM;if(!gm?.active||typeof gm.query!=='function')return 'A GM needs to be connected for automatic character placement.';
  if(!(game.user.hasPermission?.('QUERY_USER')??game.user.can?.('QUERY_USER')))return 'Foundry user queries need to be enabled for your role.';
  if(!globalThis.CONFIG?.queries?.[PLACEMENT_QUERY])return 'Reload Foundry to enable automatic character placement.';
 }
 return '';
}
export async function placeCharacter(point,modifiers={}){
 if(pending)return pending;
 const reason=unavailable();if(reason)throw Error(reason);
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('Choose a point on the scene.');
 if(point.sceneId&&point.sceneId!==canvas.scene.id)throw Error('The scene changed. Right-click the map again.');
 if(!canvas.dimensions?.rect?.contains(point.x,point.y))throw Error('Choose a point inside the scene.');
 const actor=character(),sceneId=canvas.scene.id;
 // Use Foundry's Actor-drop pipeline itself: prototype, artwork, size, snapping and permissions stay native.
 const data={...(actor.toDragData?.()||{}),type:'Actor',uuid:actor.uuid,x:point.x,y:point.y};
 const event={shiftKey:Boolean(modifiers.shiftKey),altKey:Boolean(modifiers.altKey)};
 pending=Promise.resolve().then(async()=>{
  if(canvas.scene?.id!==sceneId)throw Error('The scene changed. Right-click the map again.');
  if(character()?.id!==actor.id)throw Error('Your assigned character changed. Right-click the map again.');
  if(game.user.can('TOKEN_CREATE'))return canvas.tokens._onDropActorData(event,data);
  const gm=game.users?.activeGM;if(!gm?.active)throw Error('A GM needs to be connected for automatic character placement.');
  const result=await gm.query(PLACEMENT_QUERY,{requestId:foundry.utils.randomID(),sceneId,actorId:actor.id,x:point.x,y:point.y,shiftKey:event.shiftKey},{timeout:15000});
  if(result?.sceneId===canvas.scene?.id)canvas.tokens.activate?.();return result;
 }).finally(()=>{pending=null;});
 return pending;
}
// Foundry v13 passes authenticated sender identity in the userQuery socket envelope,
// but not to CONFIG.queries handlers. Correlate the same received payload object;
// never authorize using a userId supplied inside request data.
const querySenders=new WeakMap(),placementRequests=new Map(),activePlacements=new Map();
function rememberQuerySender(userId,_queryId,name,data){if([PLACEMENT_QUERY,REMOVAL_QUERY].includes(name)&&data&&typeof data==='object')querySenders.set(data,userId);}
function validateDelegatedPlacement(data,senderId){
 if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id||globalThis.ATTestAI.modules.get(MODULE_ID)?.active!==true)throw Error('Automatic character placement needs the active GM client running Tome.');
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.requestId!=='string'||!/^[A-Za-z0-9]{16}$/.test(data.requestId))throw Error('Invalid character placement request.');
 const user=game.users.get(senderId),actor=character(user),scene=game.scenes?.get(data.sceneId);
 if(!user?.active||!actor||actor.pack||game.actors?.get(actor.id)!==actor||actor.id!==data.actorId||!owns(actor,user))throw Error('You can only place your assigned character with ownership.');
 if((user.hasPermission?.('QUERY_USER')??user.can?.('QUERY_USER'))!==true)throw Error('Character placement queries are not allowed for this user.');
 if(!scene||((!scene.active)&&scene.testUserPermission?.(user,'OBSERVER')!==true)||(user.viewedScene&&user.viewedScene!==scene.id))throw Error('Your viewed scene changed or is unavailable.');
 const dimensions=scene.getDimensions?.()||scene.dimensions;if(!Number.isFinite(data.x)||!Number.isFinite(data.y)||!dimensions?.rect?.contains(data.x,data.y))throw Error('Choose a point inside your scene.');
 return {user,actor,scene};
}
const placementSignature=data=>JSON.stringify([data.actorId,data.sceneId,data.x,data.y,Boolean(data.shiftKey)]);
function completedPlacement(scene,data,senderId){
 const token=scene.tokens?.get?.(data.requestId)||(scene.tokens?.contents||[]).find(t=>t.id===data.requestId);if(!token)return null;
 const marker=token.flags?.[MODULE_ID]?.characterPlacement;if(token.actorId!==data.actorId||marker?.senderId!==senderId||marker?.signature!==placementSignature(data))throw Error('This placement request has already been used.');
 return {sceneId:scene.id,tokenId:token.id,uuid:token.uuid};
}
async function createDelegatedToken(data,senderId){
 const {actor,scene}=validateDelegatedPlacement(data,senderId),completed=completedPlacement(scene,data,senderId);if(completed)return completed;
 const sort=Math.max(0,...(scene.tokens?.contents||[]).map(t=>Number(t.sort||0)))+1;
 const token=await actor.getTokenDocument({hidden:false,sort},{parent:scene});
 const position=CONFIG.Token.objectClass._getDropActorPosition(token,{x:data.x,y:data.y},{snap:!data.shiftKey});token.updateSource(position);
 const latest=validateDelegatedPlacement(data,senderId);if(latest.actor!==actor||latest.scene!==scene)throw Error('Your character or scene changed. Right-click again.');
 const raced=completedPlacement(scene,data,senderId);if(raced)return raced;
 const tokenData=token.toObject();tokenData._id=data.requestId;tokenData.actorId=actor.id;tokenData.hidden=false;tokenData.flags||={};tokenData.flags[MODULE_ID]={...(tokenData.flags[MODULE_ID]||{}),characterPlacement:{senderId,signature:placementSignature(data)}};
 let created;try{[created]=await scene.createEmbeddedDocuments('Token',[tokenData],{keepId:true,adventurersTomeCharacterPlacement:true});}catch(error){const done=completedPlacement(scene,data,senderId);if(done)return done;throw error;}if(!created)throw Error('Foundry did not create the character token.');
 return {sceneId:scene.id,tokenId:created.id,uuid:created.uuid};
}
async function handlePlacementQuery(data){
 // The native socket dispatcher invokes handlers before the remaining socket
 // listeners. One microtask lets the authenticated envelope listener run first.
 await Promise.resolve();const senderId=querySenders.get(data);querySenders.delete(data);if(!senderId)throw Error('The character placement sender could not be verified.');
 const {actor,scene}=validateDelegatedPlacement(data,senderId),key=senderId+':'+data.requestId,signature=placementSignature(data),old=placementRequests.get(key);
 if(old){if(old.signature!==signature)throw Error('This placement request has already been used.');return old.promise;}
 const activeKey=senderId+':'+scene.id+':'+actor.id,promise=activePlacements.get(activeKey)||createDelegatedToken(data,senderId);activePlacements.set(activeKey,promise);placementRequests.set(key,{signature,promise});
 const clear=()=>{if(activePlacements.get(activeKey)===promise)activePlacements.delete(activeKey);};promise.then(clear,()=>{clear();placementRequests.delete(key);});
 while(placementRequests.size>128)placementRequests.delete(placementRequests.keys().next().value);return promise;
}
const removalRequests=new Map();
function removalTarget(scene,tokenId,user){
 const actor=character(user),token=scene?.tokens?.get(tokenId);
 if(!user?.active||!actor||!owns(actor,user)||!token||token.hidden&&!user.isGM||token.actorId!==actor.id)throw Error('You can only remove a visible token of your assigned character.');
 if(user.viewedScene&&user.viewedScene!==scene.id)throw Error('Your viewed scene changed.');
 if(!scene.active&&scene.testUserPermission?.(user,'OBSERVER')!==true)throw Error('This scene is unavailable.');
 return token;
}
async function handleRemovalQuery(data){
 await Promise.resolve();const senderId=querySenders.get(data);querySenders.delete(data);
 if(!senderId||!game.user?.isGM||game.users?.activeGM?.id!==game.user.id||globalThis.ATTestAI.modules.get(MODULE_ID)?.active!==true)throw Error('The active GM could not verify this removal request.');
 const user=game.users.get(senderId);
 if(!user?.active||(user.hasPermission?.('QUERY_USER')??user.can?.('QUERY_USER'))!==true||typeof data?.requestId!=='string'||!/^[A-Za-z0-9]{16}$/.test(data.requestId))throw Error('Invalid token removal request.');
 const key=senderId+':'+data.requestId,signature=JSON.stringify([data.sceneId,data.tokenId]),old=removalRequests.get(key);
 if(old){if(old.signature!==signature)throw Error('This removal request has already been used.');return old.promise;}
 const scene=game.scenes.get(data.sceneId),token=removalTarget(scene,data.tokenId,user);
 const promise=Promise.resolve().then(()=>{removalTarget(scene,token.id,user);return scene.deleteEmbeddedDocuments('Token',[token.id],{adventurersTomeCharacterRemoval:true});}).then(()=>({sceneId:scene.id,tokenId:token.id}));
 removalRequests.set(key,{signature,promise});promise.catch(()=>removalRequests.delete(key));while(removalRequests.size>128)removalRequests.delete(removalRequests.keys().next().value);return promise;
}
export async function removeCharacterToken(token){
 if(!canvas?.scene||token?.parent?.id!==canvas.scene.id)throw Error('The scene changed. Right-click the token again.');
 removalTarget(canvas.scene,token.id,game.user);
 if(token.canUserModify?.(game.user,'delete')===true)return token.delete();
 const gm=game.users?.activeGM;if(!gm?.active||typeof gm.query!=='function')throw Error('A GM needs to be connected to remove your token.');
 if(!(game.user.hasPermission?.('QUERY_USER')??game.user.can?.('QUERY_USER')))throw Error('Foundry user queries need to be enabled for your role.');
 return gm.query(REMOVAL_QUERY,{requestId:foundry.utils.randomID(),sceneId:canvas.scene.id,tokenId:token.id},{timeout:15000});
}
export async function placePlayerCharacter(actorId,point,modifiers={}){
 if(!game.user?.isGM)throw Error('Only a GM can place another player character.');
 const actor=game.actors.get(actorId);
 if(!actor||!game.users.contents.some(u=>character(u)?.id===actor.id))throw Error('Choose a currently assigned player character.');
 return placeExistingCharacter(actorId,point,modifiers);
}
function placementCandidates(){
 const assigned=new Set(game.users.contents.map(u=>character(u)?.id).filter(Boolean));
 const npcTypes=String(game.settings?.get?.(MODULE_ID,'peopleNpcActorTypes')||'npc,creature,monster,adversary,minion,rival,nemesis').split(',').map(t=>t.trim());
 return [...game.actors.values()].filter(a=>!a.pack&&!a.parent).flatMap(actor=>{
  const category=actor.getFlag?.(MODULE_ID,'worldProfile')?.category;
  const explicitNpc=npcTypes.includes(actor.type)||['npc','contact'].includes(category);
  const pc=assigned.has(actor.id)||['pc','player','player-character'].includes(category)||!explicitNpc&&['character','pc','player','playerCharacter'].includes(actor.type);
  return pc||npcTypes.includes(actor.type)||['npc','contact'].includes(category)?[{actor,kind:pc?'PC':'NPC'}]:[];
 }).sort((a,b)=>String(a.actor.name||'').localeCompare(String(b.actor.name||'')));
}
export async function placeExistingCharacter(actorId,point,modifiers={}){
 if(!game.user?.isGM)throw Error('Only a GM can place an existing NPC or PC.');
 const actor=placementCandidates().find(row=>row.actor.id===actorId)?.actor;
 if(!actor)throw Error('Choose an existing world NPC or PC.');
 if(!canvas?.ready||!canvas.scene||point.sceneId!==canvas.scene.id||!canvas.dimensions?.rect?.contains(point.x,point.y))throw Error('Choose a point inside the current scene.');
 return canvas.tokens._onDropActorData({shiftKey:Boolean(modifiers.shiftKey),altKey:Boolean(modifiers.altKey)},{...actor.toDragData(),type:'Actor',uuid:actor.uuid,x:point.x,y:point.y});
}
Hooks.once('init',()=>{if(globalThis.CONFIG?.queries){CONFIG.queries[PLACEMENT_QUERY]=handlePlacementQuery;CONFIG.queries[REMOVAL_QUERY]=handleRemovalQuery;}});
export function closeMenu(){menuEpoch++;menu?.remove();menu=null;if(hostedButton?.isConnected&&hostedOriginal)hostedButton.replaceWith(hostedOriginal);else hostedButton?.remove();hostedButton=null;hostedOriginal=null;}
function gmMenu(event,point){
 const sceneId=canvas.scene.id,epoch=menuEpoch;
 // Let other canvas handlers finish first. If a system or module opened a menu,
 // contribute one action to that menu instead of drawing a competing overlay.
 // A new task (not a microtask) is necessary for real browser contextmenu events:
 // browsers may run microtasks between capture listeners, before the host opens.
 setTimeout(()=>{
  if(epoch!==menuEpoch||!game.user?.isGM||canvas.scene?.id!==sceneId)return;
  const characters=placementCandidates();
  const host=[...document.querySelectorAll('[role="menu"],#context-menu')].reverse().find(el=>el.isConnected&&el.getClientRects().length&&el.getAttribute('aria-hidden')!=='true');
  let root=host;
  if(!root){root=document.createElement('section');root.className='at-player-character-menu';root.setAttribute('role','menu');root.setAttribute('aria-label','Character token');document.body.append(root);menu=root;}
  const original=host?[...host.querySelectorAll('button,[role="menuitem"]')].find(b=>/^Place existing NPC(?:…|\.{3})?$/i.test(b.textContent.trim())):null;
  const button=original?original.cloneNode(false):document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent='Place existing NPC or PC…';button.dataset.atPlaceExisting='';button.disabled=!characters.length;
  button.onclick=async()=>{
   if(host){document.body.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));if(host.isConnected)host.remove();}closeMenu();
   try{
    const esc=value=>foundry.utils.escapeHTML(String(value));
    const id=await foundry.applications.api.DialogV2.prompt({window:{title:'Place existing NPC or PC',resizable:true},position:{width:560},content:`<label>Find character<input type="search" data-place-search placeholder="Name…"></label><label>Type<select data-place-kind><option value="all">NPCs &amp; PCs</option><option>NPC</option><option>PC</option></select></label><label>Character<select name="character">${characters.map(({actor,kind})=>`<option value="${esc(actor.id)}" data-kind="${kind}">${esc(actor.name)} · ${kind}</option>`).join('')}</select></label><p>Places a token at the clicked position. No new Actor is created.</p>`,render:(_e,d)=>{
     const root=d.element,select=root.querySelector('[name="character"]'),search=root.querySelector('[data-place-search]'),kind=root.querySelector('[data-place-kind]'),options=[...select.options].map(o=>({id:o.value,text:o.textContent,kind:o.dataset.kind}));
     const filter=()=>{const selected=select.value,rows=options.filter(o=>(kind.value==='all'||kind.value===o.kind)&&o.text.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));select.replaceChildren(...rows.map(o=>new Option(o.text,o.id)));if(rows.some(o=>o.id===selected))select.value=selected;root.querySelector('[data-action="ok"]').disabled=!rows.length;};search.oninput=filter;kind.onchange=filter;search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();select.focus();}};
    },ok:{label:'Place token here',callback:(_e,_b,d)=>d.element.querySelector('[name="character"]').value},rejectClose:false});
    if(id)await placeExistingCharacter(id,{...point,sceneId},{shiftKey:event.shiftKey});
   }catch(error){ui.notifications.warn(error.message);}
  };
  if(original){original.replaceWith(button);hostedOriginal=original;}else root.append(button);if(host)hostedButton=button;
  // Re-clamp after contributing an entry; respect the host's own menu styling.
  if(getComputedStyle(root).position==='fixed'||!host){root.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-root.offsetWidth-8))+'px';root.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-root.offsetHeight-8))+'px';}
  if(!host)button.focus({preventScroll:true});
 },0);
}
function occupied(point,event){
 for(const layer of [canvas.tokens,canvas.notes])for(const object of layer?.placeables||[])
  if(object.visible!==false&&object.bounds?.contains?.(point.x,point.y))return true;
 const hovered=canvas.activeLayer?.hover;if(hovered?.visible!==false&&hovered?.bounds?.contains?.(point.x,point.y))return true;
 for(const door of canvas.controls?.doors?.children||[])if(door.visible!==false&&door.getBounds?.().contains?.(event.clientX,event.clientY))return true;
 return Boolean(canvas.controls?.ruler?.active);
}
function openMenu(event){
 if(event.target!==board()||!globalThis.canvas?.ready||!canvas.scene||rightPress?.dragged||rightPress?.blocked)return;
 const point=canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!canvas.dimensions?.rect?.contains(point.x,point.y)||occupied(point,event))return;
 event.preventDefault();closeMenu();
 if(game.user?.isGM){gmMenu(event,point);return;}
 const actor=character(),actorId=actor?.id,reason=pending?'Placing your character…':unavailable(),sceneId=canvas.scene.id;
 menu=document.createElement('section');menu.className='at-player-character-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Character token');
 const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=Boolean(reason);
 const icon=document.createElement('i');icon.className='fa-solid fa-user-plus';icon.setAttribute('aria-hidden','true');button.append(icon,document.createTextNode(' Place token here'));
 const caption=document.createElement('small');caption.textContent=reason||actor.name;menu.append(button,caption);document.body.append(menu);
 menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8))+'px';
 button.addEventListener('click',()=>{closeMenu();if(character()?.id!==actorId){ui.notifications.warn('Your assigned character changed. Right-click the map again.');return;}
  void placeCharacter({...point,sceneId},{shiftKey:event.shiftKey,altKey:event.altKey}).catch(error=>ui.notifications.warn(String(error?.message||error||'Token placement failed.')));
 });
 if(!button.disabled)button.focus({preventScroll:true});
}
function install(){
 document.addEventListener('contextmenu',openMenu,true);
 document.addEventListener('pointerdown',event=>{
  if(menu&&!menu.contains(event.target))closeMenu();
  rightPress=event.button===2&&event.target===board()?{x:event.clientX,y:event.clientY,pointerId:event.pointerId,dragged:false,blocked:Boolean(globalThis.canvas?.controls?.ruler?.active)}:null;
 },true);
 document.addEventListener('pointermove',event=>{
  if(rightPress&&event.pointerId===rightPress.pointerId&&(event.buttons&2)&&Math.hypot(event.clientX-rightPress.x,event.clientY-rightPress.y)>8){rightPress.dragged=true;closeMenu();}
 },true);
 document.addEventListener('keydown',event=>{if(menu&&['Escape','Tab'].includes(event.key)){closeMenu();if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}}},true);
 for(const hook of ['canvasPan','canvasTearDown','canvasReady'])Hooks.on(hook,()=>{closeMenu();rightPress=null;});
}
Hooks.on('renderTokenHUD',(hud,element)=>{
 if(game.user?.isGM)return;const token=hud.object?.document;if(!token)return;try{removalTarget(token.parent,token.id,game.user);}catch{return;}
 const root=element instanceof HTMLElement?element:element?.[0];if(!root||root.querySelector('[data-at-remove-token]'))return;
 const button=document.createElement('button');button.type='button';button.dataset.atRemoveToken='';button.className='control-icon';button.title='Remove my token';button.setAttribute('aria-label','Remove my token');button.innerHTML='<i class="fa-solid fa-trash"></i>';
 button.onclick=async e=>{e.preventDefault();e.stopPropagation();button.disabled=true;try{await removeCharacterToken(token);hud.clear();}catch(error){ui.notifications.warn(error.message);button.disabled=false;}};
 (root.querySelector('.col.right')||root).append(button);
});
Hooks.once('ready',()=>{game.socket?.on?.('userQuery',rememberQuerySender);install();const module=globalThis.ATTestAI.modules.get(MODULE_ID);if(module){module.api||={};module.api.playerCharacterPlacement=Object.freeze({place:placeCharacter,placePlayerCharacter,placeExistingCharacter,remove:removeCharacterToken});}});
