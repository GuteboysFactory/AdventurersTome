const PCID='adventurers-tome';
const pcApi=()=>game.modules.get(PCID)?.api;
const pcT=(key,fallback)=>{const value=game.i18n?.localize?.(key);return value&&value!==key?value:fallback;};
const pcEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pcEpochs=new WeakMap();
const pcDashboardEpochs=new WeakMap();
const pcViewState=new WeakMap();
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
    <label>${pcT('AT.Chronicle.MomentDate','Remembered moment date (optional)')}<input name="momentDate" type="date" value="${pcEscape(note.momentDate||'')}"></label>
    <label>Linked entity<select name="target" multiple size="5">${candidates.map(row=>`<option value="${pcEscape(row.uuid)}" ${note.targetUuids?.includes(row.uuid)?'selected':''}>${pcEscape(row.name)}</option>`).join('')}</select></label>
    <label>Signal type<select name="signalType">${['Interest','Suspicion','Goal','Question','Theory','Relationship','Fear','Unfinished business'].map(type=>`<option ${note.signalType===type?'selected':''}>${type}</option>`).join('')}</select></label>
    <label><input type="checkbox" name="bookmark" ${note.bookmark?'checked':''}> Bookmark this entity</label>
    <label><input type="checkbox" name="encrypt" ${note.encrypted?'checked disabled':''}> Encrypt this private note</label>
    <label>Chronicle passphrase (encrypted notes only)<input type="password" name="phrase" autocomplete="off"></label>
    <p>Private in Tome by default. Plain notes can be read through GM technical access. Encryption needs HTTPS and a passphrase of at least 12 characters. A forgotten passphrase cannot be recovered by Tome.</p>
    <p>Saving does not share or update a previously shared version.</p></div>`);
  if(!form)return;
  await c.save({title:form.title,text:form.text,momentDate:form.momentDate,targetUuids:form.targets||[],signalType:form.signalType,bookmark:form.bookmark==='on'},
    {id:note.id,expectedRevision:note.revision,encrypt:note.encrypted||form.encrypt==='on',phrase:form.phrase});
}
async function pcMoveChronicle(){
  const storage=globalThis.AdventurersTomeChronicleStorage;
  const receipts=await storage.receipts();
  const form=await pcDialog('Move my Chronicle',`<p>Export your own notes from the old world, then import this file on your mapped account in the new world. Encrypted notes stay encrypted and use the same passphrase. Saved shared versions are not sent again.</p><label>Action<select name="operation"><option value="export">Export my Chronicle</option><option value="import">Import my Chronicle</option></select></label><label>Chronicle file (import only)<input type="file" name="transfer" accept=".json"></label><label>Campaign migration (import only)<select name="packageId">${receipts.map(row=>`<option value="${pcEscape(row.packageId)}">${pcEscape(row.sourceWorldName||row.sourceWorldId)} · ${pcEscape(row.packageId.slice(0,8))}</option>`).join('')}</select></label>${receipts.length?'':'<p>No account mapping yet. Ask the GM to map your old account during campaign import.</p>'}`,'Continue');
  if(!form)return;
  if(form.operation==='export'){
    const blob=new Blob([JSON.stringify(storage.exportOwn(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`tome-chronicle-${game.user.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return;
  }
  if(!form.transfer?.size)throw Error('Choose your Chronicle export file.');
  if(form.transfer.size>64*1024*1024)throw Error('Chronicle file exceeds 64 MiB.');
  const result=await storage.importOwn(JSON.parse(await form.transfer.text()),form.packageId);
  ui.notifications.info(result.alreadyImported?'This Chronicle file has already been imported.':'Your Chronicle has been imported. Shared versions have not been sent again.');
}
function pcCard(row,own) {
  return `<article class="at-chronicle-card" data-pc-id="${pcEscape(row.id)}"><h3>${row.bookmark?'★ ':''}${pcEscape(row.title||'Untitled note')}</h3>
    ${row.shared?`<small>${pcEscape(game.users.get(row.ownerId)?.name||'Player')} · ${row.visibility==='gm'?'Shared with GM':'Party'} · ${pcEscape(row.signalType)}</small>`:`<small>${row.encrypted?'Encrypted private note':'Private in Tome'}</small>`}
    ${row.pending?'<p>Queued — waiting for recipient. Keep Tome connected; Refresh retries delivery.</p>':''}
    ${row.momentDate?`<small class="at-chronicle-moment">${pcT('AT.Chronicle.Remembered','Remembered')} ${pcEscape(new Date(`${row.momentDate}T12:00:00`).toLocaleDateString())}</small>`:''}
    ${Number.isFinite(row.updatedAt)?`<small>${row.shared?'Saved for sharing':'Updated'} ${pcEscape(new Date(row.updatedAt).toLocaleString())}</small>`:''}
    <p class="at-chronicle-text">${pcEscape(row.text)}</p>
    <div>${row.linked.map(link=>`<button type="button" data-pc-open="${pcEscape(link.uuid)}">${pcEscape(link.name)}</button>`).join('')}</div>
    ${own&&row.rumour?`<p><strong>Unconfirmed rumour</strong> · Anonymous source</p><blockquote>${pcEscape(row.rumour.sourceText)}</blockquote><button type="button" data-pc="delete">Delete…</button>`:own?`<div class="at-chronicle-actions">${row.locked?'<button type="button" data-pc="unlock">Unlock</button>':`<button type="button" data-pc="edit">Edit</button><button type="button" data-pc="gm">Share with GM…</button><button type="button" data-pc="party">Share with Party…</button>`}<button type="button" data-pc="withdraw">Withdraw shared versions</button><button type="button" data-pc="delete">Delete…</button></div>`:''}</article>`;
}
function pcUniqueNotes(ownRows,sharedRows) {
  const unique=new Map();
  for(const row of [...ownRows,...sharedRows]) {
    if(row.shared&&row.ownerId===game.user.id)continue;
    const key=`${row.ownerId||game.user.id}:${row.id}`;
    const old=unique.get(key);if(!old||Number(row.updatedAt||0)>Number(old.updatedAt||0))unique.set(key,row);
  }
  return [...unique.values()];
}
function pcNoteMatches(row,term) {
  if(!term)return true;
  const haystack=[row.title,row.text,row.signalType,row.momentDate,...(row.linked||[]).map(link=>link.name)].join(' ').toLocaleLowerCase();
  return haystack.includes(term);
}
function pcSignalGroups(rows) {
  const groups=new Map();
  for(const row of rows) {
    const owner=String(row.ownerId||''),name=game.users.get(row.ownerId)?.name||'Former player';
    if(!groups.has(owner))groups.set(owner,{owner,name,rows:[],latest:0});
    const group=groups.get(owner);group.rows.push(row);group.latest=Math.max(group.latest,Number(row.updatedAt)||0);
  }
  for(const group of groups.values())group.rows.sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)||String(a.id).localeCompare(String(b.id)));
  return [...groups.values()].sort((a,b)=>b.latest-a.latest||a.name.localeCompare(b.name));
}
function pcSignalBody(rows,state) {
  const term=state.search.trim().toLocaleLowerCase();
  const matches=rows.filter(row=>!term||pcNoteMatches(row,term)||(game.users.get(row.ownerId)?.name||'Former player').toLocaleLowerCase().includes(term));
  const heading=term?`${matches.length} matching signal${matches.length===1?'':'s'}`:'Shared notes';
  if(!matches.length)return `<h3>${heading}</h3><p>${term?'No shared signals match this search.':'No player signals have been shared with you yet. Players choose which notes to share from their Chronicle.'}</p>`;
  if(state.signalLayout==='latest')return `<h3>${heading} · latest first</h3>${[...matches].sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)||String(a.id).localeCompare(String(b.id))).map(row=>pcCard(row,false)).join('')}`;
  return `<h3>${heading} · by player</h3><div class="at-signal-players">${pcSignalGroups(matches).map(group=>`<details class="at-signal-player" data-pc-player="${pcEscape(group.owner)}" ${term||state.openSignalPlayers.has(group.owner)?'open':''}><summary><i class="fa-solid fa-user"></i><strong>${pcEscape(group.name)}</strong><span>${group.rows.length} signal${group.rows.length===1?'':'s'}</span><small>${group.latest?`Last shared ${pcEscape(new Date(group.latest).toLocaleString())}`:'Shared notes'}</small></summary><div class="at-signal-player-notes">${group.rows.map(row=>pcCard(row,false)).join('')}</div></details>`).join('')}</div>`;
}
async function pcRenderNextSessionSignals(host) {
  if(!game.user?.isGM)return;
  const epoch=(pcDashboardEpochs.get(host)||0)+1;pcDashboardEpochs.set(host,epoch);
  const c=pcApi()?.playerChronicle;if(!c){host.textContent='Player Signals are not ready yet.';return;}
  const groups=await c.nextSessionSignals();
  if(epoch!==pcDashboardEpochs.get(host)||!host.isConnected)return;
  host.innerHTML=groups.length?groups.map(group=>`<article class="at-player-signal-summary"><div><strong>${pcEscape(group.signalType)}</strong>${group.entity?` · <button type="button" data-pc-open="${pcEscape(group.entity.uuid)}">${pcEscape(group.entity.name)}</button>`:` · ${pcT('AT.Chronicle.Unlinked','Unlinked')}`}</div><small>${group.playerCount} ${pcT(group.playerCount===1?'AT.Chronicle.PlayerOne':'AT.Chronicle.PlayerMany',group.playerCount===1?'player':'players')} · ${group.entries.length} ${pcT(group.entries.length===1?'AT.Chronicle.SignalOne':'AT.Chronicle.SignalMany',group.entries.length===1?'signal':'signals')}</small><ul>${group.entries.slice(0,4).map(entry=>`<li><strong>${pcEscape(entry.playerName)}</strong> · ${pcEscape(entry.title)}<p>${pcEscape(entry.text)}</p></li>`).join('')}</ul></article>`).join(''):`<p>${pcT('AT.Chronicle.NextSessionEmpty','No player signals have been explicitly shared with the GM yet.')}</p>`;
  host.onclick=async event=>{const button=event.target.closest('[data-pc-open]');if(button){event.stopPropagation();await pcApi().entityIntelligence?.open(button.dataset.pcOpen,pcApi().app());}};
}
async function pcRender(root=document) {
  const c=pcApi()?.playerChronicle;if(!c||!root?.querySelectorAll)return;
  const hosts=[...root.querySelectorAll('[data-player-chronicle]')];
  const dashboardHosts=game.user?.isGM?[...root.querySelectorAll('[data-pc-next-session-signals]')]:[];
  if(hosts.some(host=>host.dataset.playerChronicle!=='rumours')||dashboardHosts.length)try{await globalThis.AdventurersTomeChronicleStorage.importDeliveries();}catch(error){ui.notifications.warn(`Chronicle shares could not refresh: ${error.message}`);}
  for(const host of dashboardHosts) {
    host.innerHTML=`<p>${pcT('AT.Chronicle.NextSessionLoading','Loading explicitly shared player signals…')}</p>`;
    try{await pcRenderNextSessionSignals(host);}catch(error){console.warn('Tome Player Signals dashboard:',error);host.textContent=pcT('AT.Chronicle.NextSessionFailed','Player Signals could not be loaded. Open Player Signals to retry.');}
  }
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
    const state=pcViewState.get(host)||{view:'notes',search:''};pcViewState.set(host,state);
    if(signals){state.signalLayout||='players';state.openSignalPlayers||=new Set();}
    host.innerHTML=`<header><span class="at-kicker">${signals?'Explicitly shared by players':rumours?'Unconfirmed claims — never canonical facts':'Your personal campaign book'}</span><h2>${signals?'Player Signals':rumours?'Saved Rumours':'My Chronicle'}</h2>
      <p>${signals?'Player thoughts and questions — not confirmed campaign facts.':'Your notes stay separate from campaign facts. Share only when you choose.'}</p></header>
      <div class="at-chronicle-actions">${signals||rumours?'':`<button type="button" data-pc-view="notes" aria-pressed="${state.view==='notes'}">${pcT('AT.Chronicle.MyNotes','My notes')}</button><button type="button" data-pc-view="moments" aria-pressed="${state.view==='moments'}">${pcT('AT.Chronicle.Moments','Remembered moments')}</button><button type="button" data-pc-view="known" aria-pressed="${state.view==='known'}">${pcT('AT.Chronicle.Known','Known to me')}</button><button type="button" data-pc="new" ${c.ready()?'':'disabled'}>New note</button><button type="button" data-pc="lock">Lock encrypted notes</button>${mode==='personal'?'<button type="button" data-pc="move">Import &amp; Export</button>':''}`}<button type="button" data-pc="refresh">Refresh</button></div>
      ${!signals&&!c.ready()?'<p>Chronicle storage is not ready. Reopen Tome and try again.</p>':''}
      ${signals?`<div class="at-signal-layout" aria-label="Player signals view"><button type="button" data-pc-signal-layout="players" aria-pressed="${state.signalLayout==='players'}"><i class="fa-solid fa-users"></i> By player</button><button type="button" data-pc-signal-layout="latest" aria-pressed="${state.signalLayout==='latest'}"><i class="fa-solid fa-clock"></i> All · latest first</button></div>`:''}
      <label>${signals?'Search shared player signals':pcT('AT.Chronicle.Search','Search your Chronicle')}<input type="search" data-pc-search placeholder="${pcEscape(pcT('AT.Chronicle.SearchPlaceholder','Notes, people, places or signal'))}"></label>
      <div data-pc-results></div>`;
    for(const [node,top] of scroll)node.scrollTop=top;
    const merged=pcUniqueNotes(ownRows,sharedRows),known=signals||rumours?[]:await c.knownEntities(),results=host.querySelector('[data-pc-results]');
    const renderBody=()=>{
      const term=state.search.trim().toLocaleLowerCase();
      if(signals){results.innerHTML=pcSignalBody(sharedRows,state);return;}
      if(term) {
        const matches=merged.filter(row=>pcNoteMatches(row,term));
        results.innerHTML=`<h3>${pcT('AT.Chronicle.SearchResults','Search results across your Chronicle')}</h3>${matches.map(row=>pcCard(row,!row.shared&&ownRows.some(own=>own.id===row.id))).join('')||`<p>${pcT('AT.Chronicle.NoMatches','No matching notes, people or places.')}</p>`}`;
      } else if(state.view==='known'&&!signals&&!rumours) {
        const rows=filter?known.filter(row=>row.uuid===filter):known;
        results.innerHTML=`<h3>${pcT('AT.Chronicle.KnownHeading','People, places and things in your notes')}</h3><p>${pcT('AT.Chronicle.KnownBoundary','These appear in your own or explicitly shared notes; they are not confirmed campaign knowledge.')}</p>${rows.map(entity=>`<article class="at-chronicle-card at-known-entity"><h3><button type="button" data-pc-open="${pcEscape(entity.uuid)}">${pcEscape(entity.name)}</button></h3><small>${pcEscape(entity.kind)} · ${entity.mentions.length} ${pcT(entity.mentions.length===1?'AT.Chronicle.NoteOne':'AT.Chronicle.NoteMany',entity.mentions.length===1?'note':'notes')}</small><ul>${entity.mentions.slice(0,8).map(mention=>`<li>${pcEscape(mention.title)} · ${pcEscape(mention.visibility==='private'?pcT('AT.Chronicle.Private','Private'):mention.visibility==='gm'?pcT('AT.Chronicle.SharedGM','Shared with GM'):pcT('AT.Chronicle.SharedParty','Shared with Party'))}${mention.momentDate?` · ${pcEscape(mention.momentDate)}`:''}</li>`).join('')}</ul></article>`).join('')||`<p>${pcT('AT.Chronicle.KnownEmpty','No linked people, places or things in your Chronicle yet.')}</p>`}`;
      } else {
        const timeline=state.view==='moments'&&!signals&&!rumours;
        const rows=timeline?merged.filter(row=>row.momentDate).sort((a,b)=>a.momentDate.localeCompare(b.momentDate)||Number(a.createdAt||a.updatedAt||0)-Number(b.createdAt||b.updatedAt||0)):ownRows.concat(sharedRows);
        results.innerHTML=`<h3>${timeline?pcT('AT.Chronicle.Moments','Remembered moments'):signals?'Shared notes':'My Notes & Bookmarks'}</h3>${timeline?`<p>${pcT('AT.Chronicle.MomentsRule','Only notes with a date you chose appear here.')}</p>`:''}${rows.map(row=>pcCard(row,!row.shared&&ownRows.some(own=>own.id===row.id))).join('')|| (timeline?`<p>${pcT('AT.Chronicle.MomentsEmpty','Add a remembered-moment date to a note to place it on this timeline.')}</p>`:'<p>No notes here yet.</p>')}`;
      }
    };
    renderBody();host.querySelector('[data-pc-search]').value=state.search;
    host.querySelector('[data-pc-search]').oninput=event=>{state.search=event.target.value;renderBody();};
    if(signals){
      host.querySelectorAll('[data-pc-signal-layout]').forEach(button=>button.onclick=event=>{event.stopPropagation();state.signalLayout=button.dataset.pcSignalLayout;renderBody();host.querySelectorAll('[data-pc-signal-layout]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));});
      results.addEventListener('toggle',event=>{const owner=event.target.dataset?.pcPlayer;if(owner===undefined||state.search.trim())return;if(event.target.open)state.openSignalPlayers.add(owner);else state.openSignalPlayers.delete(owner);},true);
    }
    host.querySelectorAll('[data-pc-view]').forEach(button=>button.onclick=event=>{event.stopPropagation();state.view=button.dataset.pcView;renderBody();host.querySelectorAll('[data-pc-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));});
    host.onclick=async event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      event.stopPropagation();button.disabled=true;
      try {
        if(button.dataset.pcOpen){await pcApi().entityIntelligence.open(button.dataset.pcOpen,pcApi().app());return;}
        const action=button.dataset.pc,id=button.closest('[data-pc-id]')?.dataset.pcId,row=own.find(value=>value.id===id);
        if(action==='refresh')await globalThis.AdventurersTomeChronicleStorage.importDeliveries();
        if(action==='move'){if(pcApi().transfer?.open)await pcApi().transfer.open();else await pcMoveChronicle();}
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
