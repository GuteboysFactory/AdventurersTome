import {knownActorUuid,knownPeoplePlan,basicPersonData,linkedPeople} from './known-people-core.mjs';
import './player-session-layout.js';
import {isErroneousPCBasicCard,retirePCBasicCardUpdate} from './player-character-core.mjs';
globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome',api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const flag=(doc,key)=>globalThis.ATTestAI.flags(doc)?.getFlag(ID,key);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let timer,tail=Promise.resolve();
const diagnostics={phase:'idle',runs:0};
const gm=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
function pageReferences(page){
  const html=new DOMParser().parseFromString(page.text?.content||'','text/html');html.querySelectorAll('.secret,[data-secret="true"]').forEach(n=>n.remove());
  return [...new Set([...(html.body.textContent||'').matchAll(/@UUID\[(Actor\.[A-Za-z0-9]+)\]/g)].map(m=>m[1]).concat([...html.querySelectorAll('[data-uuid]')].map(n=>n.dataset.uuid).filter(uuid=>/^Actor\.[^.]+$/.test(uuid))))];
}
function ownershipPatch(before,after){const out={};for(const id of new Set([...Object.keys(before||{}),...Object.keys(after)]))out[Object.hasOwn(after,id)?'ownership.'+id:'ownership.-='+id]=Object.hasOwn(after,id)?after[id]:null;return out;}
async function synchronize(){
  diagnostics.phase='starting';diagnostics.runs++;
  if(!gm()||!api()?.canView)return;
  const journals=game.journal.contents,users=game.users.contents;
  const erroneous=journals.filter(j=>isErroneousPCBasicCard(j,game.actors.contents,users)&&!flag(j,'knownPersonV1').retiredPC);
  if(erroneous.length){
    let folder=game.folders.find(f=>f.type==='JournalEntry'&&flag(f,'retiredPCCardsV1')===true);
    if(!folder)folder=await Folder.create({name:'Tome · Archived PC cards',type:'JournalEntry',flags:{[ID]:{retiredPCCardsV1:true}}},{adventurersTomeKnownPerson:true});
    for(const doc of erroneous){if(!gm())return;await doc.update(retirePCBasicCardUpdate(doc,{folderId:folder.id}),{adventurersTomeKnownPerson:true});}
  }
  const existing=journals.filter(j=>knownActorUuid(j)&&!flag(j,'knownPersonV1').retiredPC);
  const sessions=journals.filter(j=>['session','sessions'].includes(flag(j,'type')));
  diagnostics.phase='planning';
  const plan=knownPeoplePlan({sessions,actors:game.actors.contents,journals,users,canView:(doc,user)=>api().canView(doc,user),pageReferences});
  diagnostics.phase='planned '+plan.size;
  for(const [uuid,entry] of plan){
    if(!gm())return;
    const matches=existing.filter(j=>knownActorUuid(j)===uuid);if(matches.length>1){console.warn('Adventurer\'s Tome | Duplicate basic person cards; review before updating',uuid);continue;}
    const current=matches[0];
    if(!current){diagnostics.phase='creating '+entry.actor.id;await JournalEntry.create(basicPersonData(entry.actor,entry.ownership),{adventurersTomeKnownPerson:true});continue;}
    const portrait=entry.actor.img||'icons/svg/mystery-man.svg',patch={};if(current.name!==entry.actor.name)patch.name=entry.actor.name;if(current.img!==portrait)patch.img=portrait;if(flag(current,'worldProfile')?.heroImage!==portrait)patch[`flags.${ID}.worldProfile.heroImage`]=portrait;
    if(!flag(current,'knownPersonV1').permissionOverride&&JSON.stringify(current.ownership)!==JSON.stringify(entry.ownership))Object.assign(patch,ownershipPatch(current.ownership,entry.ownership));
    if(Object.keys(patch).length)await current.update(patch,{adventurersTomeKnownPerson:true});
  }
  // A revoked/removed Session must not leave its automatically shared cards open.
  for(const doc of existing)if(gm()&&!plan.has(knownActorUuid(doc))&&!flag(doc,'knownPersonV1').permissionOverride){
    if(Object.values(doc.ownership||{}).some(n=>n>0))await doc.update(ownershipPatch(doc.ownership,{default:0}),{adventurersTomeKnownPerson:true});
  }
  diagnostics.phase='idle';
}
function sync(){const job=tail.catch(()=>{}).then(synchronize);tail=job;return job;}
function schedule(){if(!gm())return;clearTimeout(timer);timer=setTimeout(()=>void sync().catch(error=>console.error('Adventurer\'s Tome | Basic people sync failed',error)),150);}
async function approve(journal,description){
  if(!game.user.isGM||!knownActorUuid(journal))throw Error('Only a GM can approve information on a basic person card.');
  const profile=flag(journal,'worldProfile')||{},content=String(description).split(/\n{2,}/).map(p=>'<p>'+esc(p).replaceAll('\n','<br>')+'</p>').join('');
  let page=journal.pages?.get(profile.syncPageId)||journal.pages?.find(p=>p.type==='text');
  if(page)await page.update({'text.content':content});else [page]=await journal.createEmbeddedDocuments('JournalEntryPage',[{name:'Known information',type:'text',text:{content,format:1}}]);
  if(!game.user.isGM)throw Error('GM permission changed.');
  await journal.update({[`flags.${ID}.worldProfile.body`]:'',[`flags.${ID}.worldProfile.syncPageId`]:page.id,[`flags.${ID}.knownPersonV1.approvedBy`]:game.user.id,[`flags.${ID}.knownPersonV1.approvedAt`]:Date.now()},{adventurersTomeKnownPerson:true});
}
async function release(journal){
  if(!game.user.isGM)throw Error('Only a GM can release more information.');
  const actor=game.actors.get(knownActorUuid(journal).slice(6));if(!actor)throw Error('The original Actor is no longer available.');
  const profile=api().getWorldProfile(journal)||{};
  const d=new foundry.applications.api.DialogV2({window:{title:'Player information · '+journal.name,resizable:true},position:{width:620},form:{closeOnSubmit:false},content:`<section class="at-known-release"><p>Players see the name and portrait by default. Only the description you approve here is added to their World card. The Actor sheet, statistics and private notes remain protected.</p><label>Approved player description<textarea name="description" rows="8">${esc(profile.body||'')}</textarea></label><p data-error role="alert"></p></section>`,buttons:[{action:'cancel',label:'Cancel',callback:(_e,_b,app)=>app.close()},{action:'save',label:'Approve player information',callback:async(_e,_b,app)=>{try{await approve(journal,app.element.querySelector('[name=description]').value);await app.close();const tome=api().app();if(tome.rendered)await tome.render({parts:['main']});}catch(error){app.element.querySelector('[data-error]').textContent=error.message;}}}]});await d.render({force:true});return d;
}
function mount(app){
  if(!game.user.isGM||!app?.element)return;const journal=game.journal.get(app.activeWorldId);if(!knownActorUuid(journal))return;
    const host=app.element.querySelector('.at-world-profile-page .at-detail-action-share:not([hidden]),.at-world-profile-page .at-profile-toolbar-actions:not([hidden])');if(!host||app.element.querySelector('[data-at-release-person]'))return;
  const button=document.createElement('button');button.type='button';button.dataset.atReleasePerson='';button.innerHTML='<i class="fa-solid fa-eye"></i> Release player information…';button.onclick=()=>void release(journal).catch(error=>ui.notifications.warn(error.message));host.append(button);
}
Hooks.once('ready',()=>{
  api().knownPeople=Object.freeze({sync,release,approve,linkedPeople,diagnostics:()=>({...diagnostics}),referencesForSession:(session,user=game.user)=>api().canView(session,user)?[...new Set([...linkedPeople(session,game.journal.contents),...(session.pages?.contents||[]).filter(p=>p.testUserPermission(user,'OBSERVER')&&api().canView(p,user)).flatMap(pageReferences)])]:[]});schedule();
  document.addEventListener('click',event=>{if(game.user.isGM)return;const link=event.target.closest?.('.at-sessions-page [data-uuid^="Actor."]');if(!link)return;const card=game.journal.find(j=>knownActorUuid(j)===link.dataset.uuid&&api().canView(j));if(!card)return;event.preventDefault();event.stopImmediatePropagation();void api().app()._openRefKey('world:'+card.id);},true);
});
Hooks.on('adventurersTomeCoreApiReady',schedule);
Hooks.on('adventurersTomeViewPrepared',mount);
Hooks.on('updateJournalEntry',(doc,patch,options)=>{const explicitPolicy=patch[`flags.${ID}.knownPersonV1.permissionOverride`]!==undefined||patch.flags?.[ID]?.knownPersonV1?.permissionOverride!==undefined;if(gm()&&knownActorUuid(doc)&&!options?.adventurersTomeKnownPerson&&!explicitPolicy&&Object.keys(patch).some(key=>key==='ownership'||key.startsWith('ownership.'))&&!flag(doc,'knownPersonV1').permissionOverride)void globalThis.ATTestAI.flags(doc).setFlag(ID,'knownPersonV1.permissionOverride',true);});
for(const hook of ['createJournalEntry','updateJournalEntry','deleteJournalEntry','createJournalEntryPage','updateJournalEntryPage','deleteJournalEntryPage','createActor','updateActor','deleteActor','createUser','updateUser','deleteUser'])Hooks.on(hook,(_doc,_patch,options)=>{if(options?.adventurersTomeKnownPerson)return;schedule();});
