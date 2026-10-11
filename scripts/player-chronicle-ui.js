const PCID='adventurers-tome';
const pcApi=()=>game.modules.get(PCID)?.api;
const pcEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pcEpochs=new WeakMap();
async function pcDialog(title,content,label='Save') {
  return foundry.applications.api.DialogV2.wait({window:{title},content,buttons:[{action:'save',label,default:true,callback:(_event,button)=>{const data=new FormData(button.form);return {...Object.fromEntries(data),targets:data.getAll("target")};}},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
}
async function pcEdit(note={}) {
  const c=pcApi().playerChronicle;
  const candidates=[];
  // Read canonical documents only after visibility checks. No GM index access.
  for(const doc of [...game.actors.contents,...game.journal.contents,...game.items.contents,...(game.scenes?.contents||[])]) {
    if(c.isChronicle(doc)||!pcApi().canView(doc))continue;
    candidates.push({uuid:doc.uuid,name:doc.name});
  }
  candidates.sort((a,b)=>a.name.localeCompare(b.name));
  const form=await pcDialog(note.id?'Edit my note':'New Chronicle note',`<div class="at-chronicle-editor">
    <label>Title<input name="title" maxlength="160" value="${pcEscape(note.title)}"></label>
    <label>My note<textarea name="text" rows="8" maxlength="20000">${pcEscape(note.text)}</textarea></label>
    <label>Linked entity<select name="target" multiple size="5">${candidates.map(row=>`<option value="${pcEscape(row.uuid)}" ${note.targetUuids?.includes(row.uuid)?'selected':''}>${pcEscape(row.name)}</option>`).join('')}</select></label>
    <label>Signal type<select name="signalType">${['Interest','Suspicion','Goal','Question','Theory','Relationship','Fear','Unfinished business'].map(type=>`<option ${note.signalType===type?'selected':''}>${type}</option>`).join('')}</select></label>
    <label><input type="checkbox" name="bookmark" ${note.bookmark?'checked':''}> Bookmark this entity</label>
    <label><input type="checkbox" name="encrypt" ${note.encrypted?'checked disabled':''}> Encrypt this private note</label>
    <label>Chronicle passphrase (encrypted notes only)<input type="password" name="phrase" autocomplete="off"></label>
    <p>Private in Tome by default. Plain notes can be read through GM technical access. Encryption needs HTTPS and a passphrase of at least 12 characters. A forgotten passphrase cannot be recovered by Tome.</p>
    <p>Saving does not share or update a previously shared version.</p></div>`);
  if(!form)return;
  await c.save({title:form.title,text:form.text,targetUuids:form.targets||[],signalType:form.signalType,bookmark:form.bookmark==='on'},
    {id:note.id,expectedRevision:note.revision,encrypt:note.encrypted||form.encrypt==='on',phrase:form.phrase});
}
function pcCard(row,own) {
  return `<article class="at-chronicle-card" data-pc-id="${pcEscape(row.id)}"><h3>${row.bookmark?'★ ':''}${pcEscape(row.title||'Untitled note')}</h3>
    ${row.shared?`<small>${pcEscape(game.users.get(row.ownerId)?.name||'Player')} · ${row.visibility==='gm'?'Shared with GM':'Party'} · ${pcEscape(row.signalType)}</small>`:`<small>${row.encrypted?'Encrypted private note':'Private in Tome'}</small>`}
    ${row.pending?'<p>Queued — waiting for recipient. Keep Tome connected; Refresh retries delivery.</p>':''}
    ${Number.isFinite(row.updatedAt)?`<small>${row.shared?'Saved for sharing':'Updated'} ${pcEscape(new Date(row.updatedAt).toLocaleString())}</small>`:''}
    <p class="at-chronicle-text">${pcEscape(row.text)}</p>
    <div>${row.linked.map(link=>`<button type="button" data-pc-open="${pcEscape(link.uuid)}">${pcEscape(link.name)}</button>`).join('')}</div>
    ${own&&row.rumour?`<p><strong>Unconfirmed rumour</strong> · Anonymous source</p><blockquote>${pcEscape(row.rumour.sourceText)}</blockquote><button type="button" data-pc="delete">Delete…</button>`:own?`<div class="at-chronicle-actions">${row.locked?'<button type="button" data-pc="unlock">Unlock</button>':`<button type="button" data-pc="edit">Edit</button><button type="button" data-pc="gm">Share with GM…</button><button type="button" data-pc="party">Share with Party…</button>`}<button type="button" data-pc="withdraw">Withdraw shared versions</button><button type="button" data-pc="delete">Delete…</button></div>`:''}</article>`;
}
async function pcRender(root=document) {
  const c=pcApi()?.playerChronicle;if(!c||!root?.querySelectorAll)return;
  const hosts=[...root.querySelectorAll('[data-player-chronicle]')];
  if(hosts.some(host=>host.dataset.playerChronicle!=='rumours'))try{await globalThis.AdventurersTomeChronicleStorage.importDeliveries();}catch(error){ui.notifications.warn(`Chronicle shares could not refresh: ${error.message}`);}
  for(const host of hosts) {
    const epoch=(pcEpochs.get(host)||0)+1;pcEpochs.set(host,epoch);
    const mode=host.dataset.playerChronicle,signals=mode==='signals',rumours=mode==='rumours';if((signals||rumours)&&!game.user.isGM)continue;
    const own=signals?[]:await c.privateRows();
    const shared=rumours?[]:await c.sharedRows({gmOnly:signals});
    if(epoch!==pcEpochs.get(host)||!host.isConnected)continue;
    const filter=host.dataset.targetUuid;
    const ownRows=rumours?own.filter(row=>row.rumour):filter?own.filter(row=>row.targetUuids.includes(filter)):own;
    const sharedRows=filter?shared.filter(row=>row.targetUuids.includes(filter)):shared;
    const scroll=[];for(let node=host;node;node=node.parentElement)scroll.push([node,node.scrollTop]);
    host.innerHTML=`<header><span class="at-kicker">${signals?'Explicitly shared by players':rumours?'Unconfirmed claims — never canonical facts':'Your personal campaign book'}</span><h2>${signals?'Player Signals':rumours?'Saved Rumours':'My Chronicle'}</h2>
      <p>${signals?'Player thoughts and questions — not confirmed campaign facts.':'Your notes stay separate from campaign facts. Share only when you choose.'}</p></header>
      <div class="at-chronicle-actions">${signals||rumours?'':`<button type="button" data-pc="new" ${c.ready()?'':'disabled'}>New note</button><button type="button" data-pc="lock">Lock encrypted notes</button>`}<button type="button" data-pc="refresh">Refresh</button></div>
      ${!signals&&!c.ready()?'<p>Chronicle storage is not ready. Reopen Tome and try again.</p>':''}
      <label>Search these notes<input type="search" data-pc-search placeholder="Title or text"></label>
      ${signals?'':'<h3>My Notes & Bookmarks</h3>'}<div data-pc-list>${ownRows.map(row=>pcCard(row,true)).join('')}${sharedRows.length&&!signals?'<h3>Shared versions</h3>':''}${sharedRows.map(row=>pcCard(row,false)).join('')||(!ownRows.length?'<p>No notes here yet.</p>':'')}</div>`;
    for(const [node,top] of scroll)node.scrollTop=top;
    host.querySelector('[data-pc-search]').oninput=event=>{const term=event.target.value.toLocaleLowerCase();for(const card of host.querySelectorAll('.at-chronicle-card'))card.hidden=!card.textContent.toLocaleLowerCase().includes(term);};
    host.onclick=async event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      event.stopPropagation();button.disabled=true;
      try {
        if(button.dataset.pcOpen){await pcApi().entityIntelligence.open(button.dataset.pcOpen,pcApi().app());return;}
        const action=button.dataset.pc,id=button.closest('[data-pc-id]')?.dataset.pcId,row=own.find(value=>value.id===id);
        if(action==='refresh')await globalThis.AdventurersTomeChronicleStorage.importDeliveries();
        if(action==='new')await pcEdit({targetUuids:filter?[filter]:[]});
        if(action==='edit')await pcEdit(row);
        if(action==='lock')c.lock();
        if(action==='unlock'){const result=await pcDialog('Unlock note','<div><label>Chronicle passphrase<input type="password" name="phrase" autocomplete="off"></label></div>','Unlock');if(result)await c.unlock(id,result.phrase);}
        if(action==='gm'||action==='party') {
          const confirm=await pcDialog(action==='gm'?'Share with GM':'Share with Party',`<div><p>${pcEscape(row.text)}</p><p>Send this saved version? ${action==='gm'?'The GM receives a private notification.':'All current users receive this version.'} Recipients may retain copies after withdrawal.</p></div>`,'Share this version');
          if(confirm){const result=await c.share(id,action,row.revision);if(result.notificationError)ui.notifications.warn(`Sharing delivery failed. Retry Share to send the saved version: ${result.notificationError}`);else if(result.pendingRecipients?.length)ui.notifications.info('Saved and queued. Delivery resumes when you and the recipients are connected. Refresh retries delivery.');}
        }
        if(action==='withdraw')await c.withdraw(id);
        if(action==='delete'&&await pcDialog('Delete note','<div><p>Delete this note and withdraw its shared versions?</p></div>','Delete'))await c.remove(id,row.revision);
        await pcRender(root);
      }catch(error){ui.notifications.warn(error.message);}finally{button.disabled=false;}
    };
  }
}
function pcAttach() {
  const api=pcApi();
  if(!api?.canView||!api?.app||api.playerChronicle)return;
  const storage=globalThis.AdventurersTomeChronicleStorage;
  api.playerChronicle=createPlayerChronicle({user:()=>game.user,users:()=>game.users.contents,journals:storage.books,userScoped:true,worldId:()=>game.world.id,
    resolve:uuid=>fromUuid(uuid),canView:(doc,user)=>api.canView(doc,user),crypto:globalThis.crypto,
    id:()=>foundry.utils.randomID(),now:()=>Date.now(),notify:storage.deliver,deliveryPending:storage.pending});
  void storage.importDeliveries().catch(error=>ui.notifications.warn(`Chronicle inbox: ${error.message}`));
}
Hooks.once('ready',pcAttach);
Hooks.on('adventurersTomeCoreApiReady',pcAttach);
Hooks.on('renderApplicationV2',(_app,element)=>{void pcRender(element?.[0]||element).catch(error=>console.warn('Tome Chronicle render:',error));});
Hooks.on('updateSetting',setting=>{
  if(setting.key!=='adventurers-tome.playerChronicleV1')return;
  // Do not replace an editor or steal focus when another device saves.
  for(const host of document.querySelectorAll('[data-player-chronicle]')){const button=host.querySelector('[data-pc="refresh"]');if(button)button.textContent='Updates available — Refresh';}
});
Hooks.on('renderChatMessageHTML',(_message,html)=>{
  const root=html?.[0]||html;root?.querySelectorAll?.('[data-pc-open-signals]').forEach(button=>button.addEventListener('click',()=>{
    const app=pcApi().app();app.activeTab=game.user.isGM?'campaignToolsSignals':'myChronicle';void app.render(true);
  }));
});
