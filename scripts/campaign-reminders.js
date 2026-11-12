import {reminderDue,validateReminder,idleSessionReminderDue} from './reminders-core.mjs';
globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome',KEY='campaignRemindersV1',TEXT='campaignReminderTextV1';
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=()=>structuredClone(globalThis.ATTestAI.settings.get(ID,KEY)||{version:1,rows:[],preferences:{},lastActivityAt:0});
let tail=Promise.resolve(),createTail=Promise.resolve(),dialog,indicator,lastActivityWrite=0,clock,listEpoch=0;
const editors=new Set();
function change(fn){const owner=game.user.id,job=tail.catch(()=>{}).then(async()=>{if(game.user.id!==owner)throw Error('Reminder account changed.');const state=read();if(state.version!==1)throw Error('Unsupported reminder storage.');await fn(state);if(game.user.id!==owner)throw Error('Reminder account changed.');await globalThis.ATTestAI.settings.set(ID,KEY,state);updateIndicator();});tail=job;return job;}
const scenes=()=>game.scenes?.filter(s=>game.user.isGM||s.active||s.visible===true)||[];
const due=()=>read().rows.filter(row=>reminderDue(row,{sceneId:globalThis.canvas?.scene?.id||''}));
async function labels(){
  if(game.user.isGM){const vault=api()?.securePrivateVault;if(!vault?.unlocked())return {};try{return JSON.parse(vault.get(TEXT)||'{}');}catch{return {};}}
  return Object.fromEntries(read().rows.map(row=>[row.id,row.title||'My reminder']));
}
function create(input){const captured=structuredClone(input),job=createTail.catch(()=>{}).then(()=>createReminder(captured));createTail=job;return job;}
async function createReminder(input){
  const row=validateReminder(input,{sceneIds:scenes().map(s=>s.id)}),id=foundry.utils.randomID(16);
  let source=null;
  if(input.source?.kind==='chronicle'){
    if(!(await api().playerChronicle.privateRows()).some(n=>n.id===input.source.id))throw Error('Your Chronicle note is no longer available.');
    source={kind:'chronicle',id:input.source.id};
  }
  if(input.source?.kind==='vault'){
    if(!game.user.isGM||!api().privateVaultEntries().some(e=>e.uuid===input.source.uuid&&e.notes.some(n=>n.id===input.source.id)))throw Error('That private GM note is no longer available.');
    source={kind:'vault',uuid:input.source.uuid,id:input.source.id};
  }
  if(game.user.isGM){
    if(!await api().privateVaultUI.unlock())return null;
    const existing=await labels();await api().securePrivateVault.set(TEXT,JSON.stringify({...existing,[id]:row.title}));
    delete row.title;
  }
  const action=game.user.isGM&&input.action==='newSession'?'newSession':null;
  await change(state=>{if(state.rows.filter(r=>!r.doneAt).length>=200)throw Error('Keep at most 200 unfinished reminders.');state.rows.push({...row,id,source,action});});await tick();return id;
}
async function tick(){
  const state=read(),now=Date.now(),sceneId=globalThis.canvas?.scene?.id||'';
  const fire=state.rows.filter(r=>!r.firedAt&&reminderDue(r,{now,sceneId}));
  const idle=game.user.isGM&&idleSessionReminderDue(state,now);
  if(fire.length||idle)await change(s=>{
    for(const row of s.rows)if(fire.some(r=>r.id===row.id)&&reminderDue(row,{now,sceneId}))row.firedAt=now;
    if(idle&&idleSessionReminderDue(s,now))s.rows.push({id:foundry.utils.randomID(16),trigger:'time',at:now,createdAt:now,firedAt:now,action:'newSession',source:null});
  });
  updateIndicator();
}
async function complete(id){await change(s=>{const row=s.rows.find(r=>r.id===id);if(!row)throw Error('Reminder not found.');row.doneAt=Date.now();});}
async function snooze(id,minutes=15){if(![5,15,60,1440].includes(minutes))throw Error('Choose a supported snooze duration.');await change(s=>{const row=s.rows.find(r=>r.id===id&&!r.doneAt);if(!row)throw Error('Reminder not found.');row.snoozedUntil=Date.now()+minutes*60000;delete row.firedAt;});}
function position(){
  if(!indicator||indicator.hidden)return;const launcher=document.getElementById('adventurers-tome-launcher');if(!launcher)return;
  const updates=document.getElementById('at-player-updates'),rect=updates&&!updates.hidden?updates.getBoundingClientRect():launcher.getBoundingClientRect();
  const fits=rect.right+40<innerWidth;indicator.style.left=Math.max(4,Math.min(fits?rect.right+6:rect.right-28,innerWidth-32))+'px';indicator.style.top=Math.max(4,Math.min(fits?rect.top+(rect.height-28)/2:rect.bottom+5,innerHeight-32))+'px';
}
function updateIndicator(){
  if(!indicator){indicator=document.createElement('button');indicator.id='at-reminder-indicator';indicator.type='button';indicator.innerHTML='<i class="fa-solid fa-bell" aria-hidden="true"></i>';indicator.onclick=()=>safe(open);document.body.append(indicator);}
  const count=due().length;indicator.hidden=!count;indicator.title=`${count} due reminder${count===1?'':'s'}`;indicator.setAttribute('aria-label',indicator.title);position();
}
const safe=async fn=>{try{return await fn();}catch(error){console.error('Adventurer\'s Tome | Reminder failed',error);ui.notifications.warn(error.message);}};
const localValue=timestamp=>{const d=new Date(timestamp);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
async function editor(source=null){
  if(game.user.isGM&&!await api().privateVaultUI.unlock())return;
  const notes=await api().playerChronicle?.privateRows?.()||[],privateNotes=game.user.isGM?api().privateVaultEntries().flatMap(e=>e.notes.map(n=>({key:'vault:'+e.uuid+'|'+n.id,label:e.name+' · '+n.title,source:{kind:'vault',uuid:e.uuid,id:n.id}}))):[];
  const choices=[...notes.map(n=>({key:'chronicle:'+n.id,label:n.title||'Encrypted note',source:{kind:'chronicle',id:n.id}})),...privateNotes];
  const options=choices.map((n,i)=>`<option value="${i}" ${source?.id===n.source.id&&source?.kind===n.source.kind?'selected':''}>${esc(n.label)}</option>`).join('');
  const selected=source?choices.find(n=>n.source.id===source.id&&n.source.kind===source.kind):null;
  const d=new foundry.applications.api.DialogV2({window:{title:'New private reminder',resizable:true},position:{width:560},classes:['at-reminder-dialog'],form:{closeOnSubmit:false},content:`<section class="at-reminder-editor"><p>Only your account receives this reminder. Time reminders appear while Foundry is open, or at your next sign-in.</p><label>Reminder<input name="title" maxlength="300" required value="${esc(selected?.label||'')}"></label><label>Linked private note<select name="source"><option value="" ${source?'':'selected'}>No linked note</option>${options}</select></label><label>Remind me<select name="trigger"><option value="time">At a date and time</option><option value="scene">When I view a Scene</option></select></label><label data-time>Local date and time<input name="at" type="datetime-local" value="${localValue(Date.now()+3600000)}"></label><label data-scene hidden>Scene<select name="sceneId">${scenes().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>${game.user.isGM?'<label><input name="newSession" type="checkbox"> Open New session from this reminder</label>':''}<p data-error role="alert"></p></section>`,buttons:[{action:'cancel',label:'Cancel',callback:(_e,_b,app)=>app.close()},{action:'save',label:'Save reminder',default:true,callback:async(_e,_b,app)=>{
    const root=app.element,field=name=>root.querySelector(`[name="${name}"]`);try{const index=field('source').value;await create({title:field('title').value,trigger:field('trigger').value,at:new Date(field('at').value).getTime(),sceneId:field('sceneId').value,source:index===''?null:choices[Number(index)].source,action:field('newSession')?.checked?'newSession':null});await app.close();if(dialog?.rendered)await renderList();}catch(error){root.querySelector('[data-error]').textContent=error.message;}
  }}]});
  editors.add(d);d.addEventListener('close',()=>editors.delete(d),{once:true});
  d.addEventListener('render',()=>{const root=d.element;root.querySelector('[name="trigger"]').onchange=e=>{root.querySelector('[data-time]').hidden=e.target.value!=='time';root.querySelector('[data-scene]').hidden=e.target.value!=='scene';};});await d.render({force:true});return d;
}
async function openSource(row){
  if(row.action==='newSession'){
    const app=api().app();app.activeTab='sessions';await globalThis.AdventurersTomeWindowDock?.restore(app);await app.render({force:true});api().campaignAuthoringV2.openCreateDialog('sessions');return;
  }
  if(row.source?.kind==='vault'){
    const [type,id]=row.source.uuid.split('.'),doc=({Actor:game.actors,JournalEntry:game.journal,Item:game.items,Scene:game.scenes})[type]?.get(id);
    if(!doc)throw Error('The linked source is no longer available.');await api().openPrivateVault(doc);return;
  }
  if(row.source?.kind==='chronicle'){
    if(!(await api().playerChronicle.privateRows()).some(n=>n.id===row.source.id))throw Error('The linked Chronicle note was deleted.');
    const app=api().app();app.activeTab='myChronicle';await globalThis.AdventurersTomeWindowDock?.restore(app);await app.render({force:true});
    // Keep encrypted notes locked. The normal Chronicle controls handle unlock.
    app.element.querySelector(`[data-pc-id="${CSS.escape(row.source.id)}"]`)?.scrollIntoView({block:'center'});
  }
}
async function renderList(){
  if(!dialog?.rendered)return;const epoch=++listEpoch,state=read();let titles=await labels();if(epoch!==listEpoch||!dialog?.rendered)return;if(game.user.isGM&&!api().securePrivateVault?.unlocked())titles={};const now=Date.now(),root=dialog.element.querySelector('[data-reminder-list]');
  root.innerHTML=state.rows.filter(r=>!r.doneAt).sort((a,b)=>Number(reminderDue(b,{now,sceneId:canvas.scene?.id}))-Number(reminderDue(a,{now,sceneId:canvas.scene?.id}))||(a.at||Infinity)-(b.at||Infinity)).map(row=>{
    const title=titles[row.id]||(row.action==='newSession'?'Remember to start New session':game.user.isGM?'Private reminder · unlock Vault':'My reminder');
    const when=row.snoozedUntil&&row.snoozedUntil>now?new Date(row.snoozedUntil).toLocaleString():row.trigger==='scene'?'Scene: '+(game.scenes.get(row.sceneId)?.name||'Unavailable Scene'):new Date(row.at).toLocaleString();
    return `<article data-reminder-row="${esc(row.id)}"><strong>${esc(title)}</strong><small>${reminderDue(row,{now,sceneId:canvas.scene?.id})?'Due · ':''}${esc(when)}</small><div>${row.source||row.action?'<button type="button" data-open>Open</button>':''}<button type="button" data-done>Done</button><select data-snooze aria-label="Snooze"><option value="">Remind later…</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="60">1 hour</option><option value="1440">Tomorrow</option></select><button type="button" data-delete aria-label="Delete reminder">Delete</button></div></article>`;
  }).join('')||'<p>No pending reminders.</p>';
  root.onclick=e=>safe(async()=>{const button=e.target.closest('[data-open],[data-done],[data-delete]'),card=button?.closest('[data-reminder-row]');if(!card)return;const id=card.dataset.reminderRow,row=read().rows.find(r=>r.id===id);if(button.hasAttribute('data-open')){await openSource(row);await dialog.close();return;}if(button.hasAttribute('data-done'))await complete(id);if(button.hasAttribute('data-delete'))await change(s=>{s.rows=s.rows.filter(r=>r.id!==id);});await renderList();});
  root.onchange=e=>safe(async()=>{if(!e.target.matches('[data-snooze]')||!e.target.value)return;await snooze(e.target.closest('[data-reminder-row]').dataset.reminderRow,Number(e.target.value));await renderList();});
}
async function open(){
  if(dialog?.rendered){dialog.bringToFront();await renderList();return dialog;}
  const preference=read().preferences?.newSession||{};
  dialog=new foundry.applications.api.DialogV2({window:{title:game.user.isGM?'Campaign Tools · My reminders':'My Chronicle · Reminders',resizable:true},position:{width:680,height:640},classes:['at-reminder-dialog'],form:{closeOnSubmit:false},content:`<section class="at-reminder-manager"><p>Private to your account. Nothing pops up automatically.</p><button type="button" data-new-reminder>New reminder</button>${game.user.isGM?`<details><summary>New session reminder</summary><p>Use New reminder to choose a specific date/time or Scene, and select “Open New session”. The optional idle reminder uses your last activity in this world.</p><label><input data-idle-enabled type="checkbox" ${preference.enabled?'checked':''}> Remind me after inactivity</label><label>Hours without activity<input data-idle-hours type="number" min="1" max="720" value="${preference.hours||12}"></label><button type="button" data-save-idle>Save preference</button></details><button type="button" data-unlock-reminders>Unlock private reminder text</button>`:''}<div data-reminder-list></div></section>`,buttons:[{action:'close',label:'Close',callback:(_e,_b,app)=>app.close()}]});
  dialog.addEventListener('render',()=>{const root=dialog.element;root.querySelector('[data-new-reminder]').onclick=()=>safe(()=>editor());const unlock=root.querySelector('[data-unlock-reminders]');if(unlock)unlock.onclick=()=>safe(async()=>{await api().privateVaultUI.unlock();await renderList();});const save=root.querySelector('[data-save-idle]');if(save)save.onclick=()=>safe(async()=>{const hours=Number(root.querySelector('[data-idle-hours]').value);if(!Number.isFinite(hours)||hours<1||hours>720)throw Error('Choose 1–720 hours.');await change(s=>{s.preferences.newSession={enabled:root.querySelector('[data-idle-enabled]').checked,hours};});ui.notifications.info('New session reminder preference saved.');});void renderList();});
  await dialog.render({force:true});return dialog;
}
function mount(app){
  const root=app?.element||document.getElementById('adventurers-tome-app');if(!root)return;
  for(const nav of root.querySelectorAll('.at-campaign-tools-tabs'))if(game.user.isGM&&!nav.querySelector('[data-at-reminders]')){const b=document.createElement('button');b.type='button';b.dataset.atReminders='';b.innerHTML='<i class="fa-solid fa-bell"></i><span>Reminders</span>';b.onclick=()=>safe(open);nav.append(b);}
}
function activity(){const now=Date.now();if(now-lastActivityWrite<60000)return;lastActivityWrite=now;void change(s=>{s.lastActivityAt=now;}).catch(console.error);}
Hooks.once('init',()=>globalThis.ATTestAI.settings.register(ID,KEY,{scope:'user',config:false,type:Object,default:{version:1,rows:[],preferences:{},lastActivityAt:0}}));
Hooks.once('ready',()=>{
  api().reminders=Object.freeze({create,open,editor,tick,due,complete,snooze});
  void safe(async()=>{await tick();activity();});clock=setInterval(()=>void safe(tick),15000);
  window.addEventListener('pointerdown',activity,{passive:true});window.addEventListener('keydown',activity,{passive:true});window.addEventListener('resize',position);
});
Hooks.on('canvasReady',()=>{if(game.ready)void safe(tick);});
Hooks.on('adventurersTomeViewPrepared',mount);
Hooks.on('adventurersTomeLauncherReady',button=>{updateIndicator();new MutationObserver(position).observe(button,{attributes:true,attributeFilter:['style','class']});new ResizeObserver(position).observe(button);});
Hooks.on('updateSetting',setting=>{if(setting.key===ID+'.'+KEY){updateIndicator();if(dialog?.rendered)void renderList();}});
Hooks.on('updateUser',user=>{if(user.id===game.user.id)position();});
Hooks.on('adventurersTomeVaultLockChanged',({unlocked})=>{if(!unlocked){listEpoch++;for(const editor of editors){editor.element?.remove();void editor.close();}editors.clear();const list=dialog?.element?.querySelector('[data-reminder-list]');if(list)list.replaceChildren();}if(dialog?.rendered)void renderList();});
Hooks.on('closeGame',()=>clearInterval(clock));
