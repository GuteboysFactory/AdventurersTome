// Explicit GM claims. No Contact creation, canonical fact write or inference.
const pcEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function atRumourSave(button) {
  if(!game.user.isGM)throw Error('Only a GM can save rumours.');
  const api=game.modules.get('adventurers-tome').api,c=api.playerChronicle;
  const sourceUuid=button.dataset.sourceUuid,source=await fromUuid(sourceUuid);
  if(!source||!api.canView(source))throw Error('The source is unavailable.');
  if(!c.ready())await c.provision();
  const candidates=[];
  for(const doc of [...game.actors.contents,...game.journal.contents,...game.items.contents])if(!c.isChronicle(doc)&&api.canView(doc)&&doc.uuid!==sourceUuid)candidates.push(doc);
  const excerpt=button.closest('.at-guided-decision-card')?.querySelector('.at-guided-decision-header p')?.textContent||'';
  const result=await foundry.applications.api.DialogV2.wait({window:{title:'Save as rumour'},content:`<div class="at-chronicle-editor"><p>Store an unconfirmed claim. No anonymous Contact will be created.</p><label>Subject<select name="subject" required>${candidates.map(doc=>`<option value="${pcEscape(doc.uuid)}">${pcEscape(doc.name)}</option>`).join('')}</select></label><label>Claim<textarea name="claim" required rows="4"></textarea></label><label>Original source excerpt<textarea name="excerpt" rows="4">${pcEscape(excerpt)}</textarea></label><p>Source: ${pcEscape(source.name)}. Certainty: rumoured. Source identity: anonymous / unspecified.</p></div>`,buttons:[{action:'save',label:'Save unconfirmed claim',callback:(_event,b)=>Object.fromEntries(new FormData(b.form))},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
  if(!result)return;
  if(!String(result.claim||'').trim())throw Error('Enter the claim first.');
  const subject=await fromUuid(result.subject);if(!subject||!api.canView(subject))throw Error('The subject is unavailable.');
  const saved=await c.save({title:`Rumour: ${subject.name}`,text:result.claim,targetUuids:[subject.uuid,sourceUuid],rumour:{subjectUuid:subject.uuid,sourceUuid,sourceText:result.excerpt}});
  // Use the existing explicit source dismissal and its Undo, after persistence.
  try {await api.app().constructor._onResolveCampaignDecision.call(api.app(),null,{disabled:false,dataset:{decisionMode:'mention-only',decisionText:button.dataset.decisionText,sourceUuid}});}
  catch(error){ui.notifications.warn(`Rumour saved; source review remains open: ${error.message}`);}
  ui.notifications.info('Saved as an unconfirmed rumour. Find it under Analysis → Saved Rumours.');
  return saved;
}
Hooks.on('renderApplicationV2',(_app,element)=>{
  if(!game.user.isGM)return;
  const root=element?.[0]||element;
  root?.querySelectorAll?.('[data-save-rumour]').forEach(button=>{button.onclick=async event=>{event.stopPropagation();if(button.disabled)return;button.disabled=true;try{await atRumourSave(button);}catch(error){ui.notifications.warn(error.message);}finally{button.disabled=false;}};});
});
