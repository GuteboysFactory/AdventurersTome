globalThis.ATTestAI.assertEnabled();
import {readSessionFile, blocksHtml, escapeText, digest} from './session-document-reader.js';
const ID='adventurers-tome';
const previews=new WeakMap();
let saving=false;
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const flag=(doc,key)=>globalThis.ATTestAI.flags(doc)?.getFlag?.(ID,key);
const journals=()=>game.journal?.contents||[];
const gm=owner=>{if(!game.user?.isGM || (owner&&game.user.id!==owner))throw new Error('Only the GM who opened this preview can import it.');};
const quest=doc=>['quest','quests'].includes(String(flag(doc,'type')||'').toLowerCase());
const sectionNumber=doc=>Number(flag(doc,'session')?.number)||Number(doc.name?.match(/^session\s+(\d+)/i)?.[1])||0;
const typeOf=doc=>String(flag(doc,'type')||'');
const normalizeHtml=html=>new DOMParser().parseFromString(html,'text/html').body.innerHTML;
const withSummary=html=>'<p data-at-tome-summary="true"></p>'+html;
const textBody=value=>'<p data-at-tome-summary="true"></p>'+String(value).split(/\n{2,}/).map(p=>'<p>'+escapeText(p).replaceAll('\n','<br>')+'</p>').join('');

async function previewFile(file) {
  gm();const owner=game.user.id;
  const parsed=await readSessionFile(file);gm(owner);
  const model={name:parsed.name,format:parsed.format,title:parsed.title,number:parsed.number||api().campaignAuthoringV2.nextSessionNumber(),warnings:[...parsed.warnings],sections:parsed.sections.map(s=>({id:s.id,title:s.title,route:s.route,html:blocksHtml(s.blocks),text:s.blocks.map(b=>b.text).join('\n\n')})),quests:parsed.sections.flatMap(s=>s.questItems.map((body,i)=>({id:s.id+':'+i,sectionId:s.id,title:body.split(/\s+[—–]\s+|:\s/)[0],body})))};
  // Only previews issued here can be applied. Public objects are detached from the source.
  previews.set(model,{parsed,owner,questRows:structuredClone(model.quests)});
  return model;
}
function planFor(model,choices) {
  const state=previews.get(model);if(!state)throw new Error('Choose a file and create a new preview first.');gm(state.owner);
  const number=Number(choices.number), title=String(choices.title||'').trim(), date=String(choices.date||'').trim();
  if(!Number.isSafeInteger(number)||number<1||number>999999)throw new Error('Enter a whole Session number greater than zero.');
  if(!title||title.length>250)throw new Error('Enter a Session title, up to 250 characters.');
  if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Choose a valid date or leave it empty.');
  const routes=state.parsed.sections.map(s=>{
    const route=choices.routes?.[s.id]??s.route;
    if(!['chronicle','private','reminder','skip'].includes(route))throw new Error('Unknown section destination.');
    return {section:s,route};
  });
  if(!routes.some(row=>row.route==='chronicle'))throw new Error('Keep at least one section in the Chronicle.');
  const target=Number(choices.reminderTarget??number+1);
  if(routes.some(r=>r.route==='reminder')&&(!Number.isSafeInteger(target)||target<1))throw new Error('Enter a whole target Session number for the reminders.');
  const quests=[];
  for(const row of state.questRows){
    const selected=choices.quests?.[row.id]||{action:'skip'};
    if(selected.action==='skip')continue;
    if(routes.find(r=>r.section.id===row.sectionId)?.route!=='chronicle')throw new Error('Quest suggestions can only be imported from Chronicle sections.');
    if(selected.action==='create'){
      const name=String(selected.title||row.title).trim();if(!name||name.length>250)throw new Error('Enter a shorter title for the selected Quest.');
      quests.push({...row,action:'create',title:name});
    }else if(selected.action==='link'){
      const doc=journals().find(d=>d.uuid===selected.targetUuid);if(!quest(doc))throw new Error('A selected existing Quest is no longer available.');
      quests.push({...row,action:'link',targetUuid:doc.uuid});
    }else throw new Error('Unknown Quest choice.');
  }
  return {state,number,title,date,routes,target,quests,allowSameNumber:choices.allowSameNumber===true,html:`<h1>${escapeText(`Session ${number} — ${title}`)}</h1>`+routes.filter(r=>r.route==='chronicle').map(r=>blocksHtml(r.section.blocks)).join('')};
}
async function applyPreview(model,choices={}) {
  if(saving)throw new Error('A Session import is already being saved.');
  const plan=planFor(model,choices), owner=plan.state.owner, fileDigest=plan.state.parsed.digest;
  const current=()=>{gm(owner);};
  saving=true;
  try {
    const author=api()?.campaignAuthoringV2, vault=api()?.contextualPrivateVault;
    if(!author?.createSession||!api()?.campaignEntityLinks?.linkCanonical)throw new Error('Session authoring and campaign links must be ready before importing.');
    if(plan.routes.some(r=>['private','reminder'].includes(r.route))&&(!vault?.addNote||!vault?.getNotes||!vault?.syncNotebook))throw new Error('Private GM notes are not ready. Nothing has been imported.');
    const planHash=await digest(JSON.stringify({number:plan.number,title:plan.title,date:plan.date,routes:plan.routes.map(r=>[r.section.id,r.route]),target:plan.target,quests:plan.quests.map(q=>[q.id,q.action,q.title,q.targetUuid])}));current();
    const matches=journals().filter(d=>flag(d,'sessionUploadV1')?.digest===fileDigest&&flag(d,'sessionUploadV1')?.ownerId===owner);
    if(matches.length>1)throw new Error('More than one import receipt exists for this file. Review the Sessions before retrying.');
    let journal=matches[0], page;
    if(journal){
      const receipt=flag(journal,'sessionUploadV1');
      if(receipt.state==='complete')throw new Error(`This file was already imported as ${journal.name}. Open that Session instead.`);
      if(receipt.planHash!==planHash)throw new Error('An unfinished import exists with different choices. Retry with the original choices to avoid duplicates.');
      if(journal.ownership?.default!==0||flag(journal,'access')?.visibility!=='gm')throw new Error('This unfinished Session was shared or changed. Restore GM-only access before retrying.');
      page=journal.pages?.contents?.[0];
      if(page&&normalizeHtml(page.text?.content||'')!==normalizeHtml(withSummary(plan.html)))throw new Error('The unfinished Chronicle was edited. Review it before retrying; it will not be overwritten.');
      if(!page){current();[page]=await journal.createEmbeddedDocuments('JournalEntryPage',[{name:'Chronicle',type:'text',text:{content:withSummary(plan.html),format:CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML??1},sort:100000}]);}
    }else{
      if(!plan.allowSameNumber&&journals().some(d=>['sessions','session'].includes(typeOf(d))&&sectionNumber(d)===plan.number))throw new Error('This Session number already exists. Review it, or explicitly choose to create a separate Session.');
      ({journal,page}=await author.createSession({number:plan.number,title:plan.title,date:plan.date,body:plan.html,bodyFormat:'html',visibility:'gm',open:false,quiet:true,beforeCreate:current,uploadReceipt:{version:1,digest:fileDigest,ownerId:owner,planHash,state:'pending'}}));
    }
    if(!page)throw new Error('The Chronicle could not be created. Retry this file with the same choices.');
    for(const row of plan.routes){
      if(!['private','reminder'].includes(row.route))continue;current();
      const id='session-upload-'+(await digest(fileDigest+':'+row.section.id)).slice(0,24);current();
      if(!vault.getNotes(journal).some(note=>note.id===id))await vault.addNote(journal,{id,title:row.section.title,body:row.section.blocks.map(b=>b.text).join('\n\n'),type:row.route==='reminder'?'reminder':'prep',sessionTarget:row.route==='reminder'?plan.target:null,status:'open'});
    }
    if(plan.routes.some(r=>['private','reminder'].includes(r.route))){current();await vault.syncNotebook(journal);}
    for(const row of plan.quests){
      current();let target;
      if(row.action==='link')target=journals().find(d=>d.uuid===row.targetUuid);
      else {
        const same=journals().filter(d=>{const s=flag(d,'briefingSourceV1');return quest(d)&&s?.sourceUuid===journal.uuid&&s?.pageUuid===page.uuid&&s?.excerpt===row.body;});
        if(same.length>1)throw new Error('Multiple Quests have this import source. Review them before retrying.');
        target=same[0];
        const body=row.body.replaceAll('@','＠');
        if(!target){({journal:target}=await author.createQuest({title:row.title,status:'dormant',visibility:'gm',body,briefingSource:{sourceUuid:journal.uuid,pageUuid:page.uuid,excerpt:row.body},beforeCreate:current,open:false,quiet:true}));}
        else if(!target.pages?.contents?.length){
          await target.createEmbeddedDocuments('JournalEntryPage',[{name:'Overview',type:'text',text:{content:textBody(body)+`<p>Source: @UUID[${page.uuid}]{Session source}</p>`,format:CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML??1},sort:100000}]);
        }
      }
      current();if(!quest(target))throw new Error('A selected Quest is no longer available.');
      await api().campaignEntityLinks.linkCanonical({sourceUuid:journal.uuid,targetUuid:target.uuid});
    }
    current();await globalThis.ATTestAI.flags(journal).setFlag(ID,'sessionUploadV1',{...flag(journal,'sessionUploadV1'),state:'complete'});
    return {journal,page,privateNotes:plan.routes.filter(r=>r.route==='private').length,reminders:plan.routes.filter(r=>r.route==='reminder').length,quests:plan.quests.length};
  } finally {saving=false;}
}
function close(overlay){if(!saving)overlay.remove();}
function openDialog(){
  gm();const root=document.querySelector('#adventurers-tome-app');if(!root)return;
  if(document.querySelector('.at-su-overlay'))return;
  const overlay=document.createElement('div');overlay.className='at-cw-modal-overlay at-su-overlay';
  overlay.innerHTML=`<form class="at-cw-modal at-su-dialog"><header><div><span class="at-kicker">Local session document</span><h2>Import Session</h2></div><button type="button" data-su-close aria-label="Close">×</button></header><p>Choose a text file or Word document. Review the Chronicle, private GM notes and Quest suggestions before saving.</p><label>Session document (.txt or .docx)<input data-su-file type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label><small>Up to 10 MB. A Word document without a file extension is also supported. The file is read locally in your browser.</small><p data-su-message role="status" aria-live="polite"></p><div data-su-preview></div><footer><button type="button" data-su-close>Cancel</button><button type="submit" data-su-save disabled>Import as GM-only</button></footer></form>`;
  root.append(overlay);let model=null,loading=false;
  const message=overlay.querySelector('[data-su-message]'), save=overlay.querySelector('[data-su-save]');
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-su-close]'))close(overlay);});
  overlay.querySelector('[data-su-file]').addEventListener('change',async event=>{
    if(loading||saving)return;loading=true;save.disabled=true;model=null;const input=event.currentTarget;input.disabled=true;
    overlay.querySelector('[data-su-preview]').replaceChildren();message.textContent='Reading document…';
    try{model=await previewFile(input.files[0]);renderPreview(overlay,model);message.textContent='Review each section below. Nothing has been saved yet.';save.disabled=false;}
    catch(error){message.textContent=error.message;}finally{loading=false;input.disabled=false;}
  });
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(!model||saving||loading)return;
    const field=name=>overlay.querySelector(`[name="${name}"]`);
    const choices={number:Number(field('number').value),title:field('title').value,date:field('date').value,reminderTarget:Number(field('reminderTarget').value),allowSameNumber:field('allowSameNumber').checked,routes:{},quests:{}};
    for(const section of model.sections)choices.routes[section.id]=overlay.querySelector(`[data-su-route="${section.id}"]`).value;
    for(const row of model.quests){const selected=overlay.querySelector(`[data-su-quest="${row.id}"]`).value;choices.quests[row.id]=selected.startsWith('link:')?{action:'link',targetUuid:selected.slice(5)}:{action:selected,title:overlay.querySelector(`[data-su-quest-title="${row.id}"]`).value};}
    // Keep the preview and every choice stable during writes, including a partial failure.
    const fields=[...overlay.querySelectorAll('input,select,button')];fields.forEach(node=>node.disabled=true);message.textContent='Saving Session…';
    try{
      const result=await applyPreview(model,choices);
      overlay.remove();ui.notifications.info(`Imported ${result.journal.name}: ${result.privateNotes} private notes, ${result.reminders} reminders, ${result.quests} Quest links.`);
      await api().campaignAuthoringV2.openCreatedEntry('sessions',result.journal,result.page);
    }catch(error){message.textContent=error.message+' No existing text was overwritten. If saving started, retry with the same choices to continue.';fields.forEach(node=>node.disabled=false);}
  });
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(overlay);}
    if(event.key==='Tab'){
      const focusable=[...overlay.querySelectorAll('button,input,select,summary')].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  overlay.querySelector('[data-su-file]').focus();
}
function renderPreview(overlay,model){
  const host=overlay.querySelector('[data-su-preview]');
  const options=Object.entries({chronicle:'Chronicle text',private:'Private GM note',reminder:'Reminder for next session',skip:'Leave out'});
  host.innerHTML=`${model.warnings.map(w=>`<p class="at-su-warning">${escapeText(w)}</p>`).join('')}<div class="at-su-metadata"><label>Session number<input name="number" type="number" min="1" step="1" required></label><label>Title<input name="title" maxlength="250" required></label><label>Date (optional)<input name="date" type="date"></label><label>Reminders for Session<input name="reminderTarget" type="number" min="1" step="1" required></label></div><label class="at-su-check"><input name="allowSameNumber" type="checkbox">Create a separate Session if this number already exists</label><h3>Document sections</h3><p>Keep the story in Chronicle. GM notes and reminders are saved privately for your GM account. They are excluded from the Chronicle.</p>${model.sections.map(section=>`<section class="at-su-section"><div class="at-su-section-heading"><strong>${escapeText(section.title)}</strong><label>Destination<select data-su-route="${section.id}">${options.map(([v,t])=>`<option value="${v}"${v===section.route?' selected':''}>${t}</option>`).join('')}</select></label></div><details${section.route!=='chronicle'?' open':''}><summary>Read section</summary><div class="at-su-document">${section.html}</div></details></section>`).join('')}<h3>Quest suggestions</h3><p>Only explicit active Quest Log entries appear here. Choose which to create or link. New Quests start as dormant and GM-only.</p><div data-su-quests></div><div class="at-su-final-preview"><h3>Chronicle preview</h3><p>This is the text that will be saved in the Session. Review it before importing.</p><div class="at-su-document" data-su-chronicle></div></div>`;
  host.querySelector('[name="number"]').value=model.number;host.querySelector('[name="title"]').value=model.title;host.querySelector('[name="reminderTarget"]').value=model.number+1;
  const choices=host.querySelector('[data-su-quests]');
  if(!model.quests.length)choices.textContent='No explicit active Quest Log entries were found. You can create Quests later.';
  for(const row of model.quests){
    const card=document.createElement('section');card.className='at-su-section';
    card.innerHTML=`<label>Quest title<input data-su-quest-title="${row.id}" maxlength="250"></label><p>${escapeText(row.body)}</p><label>Import choice<select data-su-quest="${row.id}"><option value="skip">Leave out</option><option value="create">Create GM-only Quest</option></select></label>`;
    card.querySelector('input').value=row.title;
    for(const existing of journals().filter(quest)){const opt=document.createElement('option');opt.value='link:'+existing.uuid;opt.textContent='Link existing: '+existing.name;card.querySelector('select').append(opt);}
    choices.append(card);
  }
  const refresh=()=>{
    host.querySelector('[data-su-chronicle]').innerHTML=`<h1>${escapeText('Session '+host.querySelector('[name="number"]').value+' — '+host.querySelector('[name="title"]').value)}</h1>`+model.sections.filter(s=>host.querySelector(`[data-su-route="${s.id}"]`).value==='chronicle').map(s=>s.html).join('');
    for(const row of model.quests){const select=host.querySelector(`[data-su-quest="${row.id}"]`);select.disabled=host.querySelector(`[data-su-route="${row.sectionId}"]`).value!=='chronicle';if(select.disabled)select.value='skip';}
  };
  host.addEventListener('change',refresh);host.addEventListener('input',event=>{if(['number','title'].includes(event.target.name))refresh();});
  host.querySelector('[name="number"]').addEventListener('change',event=>host.querySelector('[name="reminderTarget"]').value=Number(event.target.value)+1);
  refresh();
}
function mount(){
  const root=document.querySelector('#adventurers-tome-app');if(!root)return;
  for(const button of root.querySelectorAll('[data-at-session-upload]'))if(!game.user?.isGM)button.remove();
  if(!game.user?.isGM)return;
  const page=root.querySelector('.at-sessions-page');const host=page?.querySelector('.at-page-tools')||page?.querySelector(':scope > .at-page-heading');
  if(!host||host.querySelector('[data-at-session-upload]'))return;
  const button=document.createElement('button');button.type='button';button.className='at-secondary';button.dataset.atSessionUpload='';button.innerHTML='<i class="fa-solid fa-file-arrow-up"></i> Import Session';button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openDialog();});host.append(button);
}
Hooks.once('ready',()=>{const module=globalThis.ATTestAI.modules.get(ID);if(!module)return;module.api||={};module.api.sessionUpload=Object.freeze({version:1,previewFile,applyPreview,openDialog});mount();});
Hooks.on('adventurersTomeViewPrepared',mount);
Hooks.on('adventurersTomePrepareView',mount);
