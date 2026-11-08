const ID='adventurers-tome',api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const owner=()=>`${game.world?.id}|${game.user?.id}`,allowed=()=>game.user?.isGM===true;
let timer=null,closing=null,panel=null,active=null,pressed=false,lastPoint=null;
const metrics={scheduled:0,shown:0,reads:0,buildMs:[],dismissed:0};
function clear(){clearTimeout(timer);clearTimeout(closing);timer=closing=null;panel?.remove();panel=null;active=null;metrics.dismissed++;}
function dragging(){return pressed||Boolean(globalThis.canvas?.tokens?.preview?.children?.length);}
function position(){const point=lastPoint||{x:innerWidth/2,y:innerHeight/2},rect=panel.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(point.x+18,innerWidth-rect.width-12))+'px';panel.style.top=Math.max(12,Math.min(point.y+16,innerHeight-rect.height-12))+'px';}
function display(token,stamp){
 timer=null;if(!allowed()||owner()!==stamp||active!==token||dragging()||!globalThis.canvas?.ready)return;
 const actor=api().privateVault.canonical(token);if(!actor||token.visible===false||token.renderable===false)return;
 const start=performance.now();let notes;try{metrics.reads++;notes=api().privateVault.notes(actor);}catch{ return; }
 notes=notes.filter(n=>n.body?.trim()||n.title?.trim()&&n.title!=='GM Note');if(!notes.length)return;
 panel=document.createElement('aside');panel.className='at-vault-hover';panel.dataset.atVaultHover=actor.uuid;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',`Private GM notes · ${actor.name}`);
 const header=document.createElement('header'),title=document.createElement('div'),small=document.createElement('small'),heading=document.createElement('h3'),close=document.createElement('button');small.textContent='PRIVATE · YOUR GM ACCOUNT';heading.textContent=actor.name;title.append(small,heading);close.type='button';close.textContent='×';close.setAttribute('aria-label','Close private preview');close.onclick=clear;header.append(title,close);
 const body=document.createElement('div');body.dataset.vaultPreviewBody='';const sorted=[...notes].sort((a,b)=>Number(b.pinned)-Number(a.pinned));
 for(const n of sorted.slice(0,20)){const article=document.createElement('article'),h=document.createElement('h4'),p=document.createElement('p');h.textContent=n.title+(n.status==='resolved'?' · Resolved':'');p.textContent=n.body.slice(0,12000)+(n.body.length>12000?'\n… Open Private Vault for the full note.':'');article.append(h,p);if(n.attachments?.length){const image=document.createElement('button');image.type='button';image.textContent=n.attachments.length>1?`View first private image (${n.attachments.length} in Vault)`:'View private image';image.onclick=()=>{clear();void api().privateVaultMedia.enlarge(n.attachments[0]).catch(e=>ui.notifications.error(e.message));};article.append(image);}body.append(article);}
 if(notes.length>20){const more=document.createElement('p');more.textContent=`${notes.length-20} more notes in Private Vault.`;body.append(more);}
 const footer=document.createElement('footer'),open=document.createElement('button');open.type='button';open.textContent='Open Private Vault';open.onclick=()=>{clear();void api().privateVaultUI.open(actor).catch(e=>ui.notifications.error(e.message));};footer.append(open);panel.append(header,body,footer);document.body.append(panel);position();
 panel.addEventListener('pointerenter',()=>clearTimeout(closing));panel.addEventListener('pointerleave',()=>{closing=setTimeout(clear,120);});metrics.shown++;metrics.buildMs.push(performance.now()-start);if(metrics.buildMs.length>100)metrics.buildMs.shift();
}
Hooks.on('hoverToken',(token,hovered)=>{
 if(!allowed()){clear();return;}if(!hovered){clearTimeout(timer);if(active===token)closing=setTimeout(clear,120);return;}
 clear();if(dragging())return;active=token;metrics.scheduled++;const stamp=owner();timer=setTimeout(()=>display(token,stamp),350);
});
Hooks.on('renderTokenHUD',(hud,element)=>{
 if(!allowed())return;const root=element instanceof HTMLElement?element:element?.[0],token=hud.object;if(!root||!token)return;
 const old=root.querySelector('[data-at-token-private-vault]'),button=document.createElement('button');button.type='button';button.className='control-icon';button.dataset.atTokenPrivateVault='true';button.title='Open Private Vault · GM Notes';button.setAttribute('aria-label',button.title);button.innerHTML='<i class="fa-solid fa-lock"></i><span class="at-vault-hud-label">GM Notes</span>';button.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();clear();void api().privateVaultUI.open(token).catch(e=>ui.notifications.error(e.message));};if(old)old.replaceWith(button);else(root.querySelector('.col.left,.left')||root).append(button);
});
document.addEventListener('pointermove',e=>{lastPoint={x:e.clientX,y:e.clientY};},{passive:true});
document.addEventListener('pointerdown',e=>{if(panel?.contains(e.target))return;clear();if(e.target===document.getElementById('board'))pressed=true;},true);
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{pressed=false;},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')clear();});
for(const hook of ['canvasTearDown','canvasReady','deleteToken','deleteActor','updateUser','adventurersTomePrivateNotesChanged','adventurersTomeVaultLockChanged'])Hooks.on(hook,clear);
Hooks.on('updateSetting',setting=>{if(/\.gm(?:ContextualPrivateVaultV2|PrivateVault)$/.test(setting?.key||''))clear();});
Hooks.once('ready',()=>{api().privateVaultHover=Object.freeze({status:()=>structuredClone(metrics),hide:clear});});
