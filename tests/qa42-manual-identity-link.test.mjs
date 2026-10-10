import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Handlebars from './helpers/vendor/handlebars-4.7.10.cjs';
import {world} from './helpers/tome-world.mjs';
import {reviewWorld} from './helpers/review-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
const footerStart=template.lastIndexOf('<footer class="at-guided-decision-footer">');
const footer=Handlebars.compile(template.slice(footerStart,template.indexOf('</footer>',footerStart)+9));
const learning=w=>w.api.campaignReviewLearning;
const candidate=(w,text='Vane')=>({text,sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,classification:{kind:'character',confidence:.95,signals:['person-role-apposition'],alternatives:[]},detection:{score:.99}});
const resolve=(w,text)=>w.api.campaignEntityCreation.resolveCandidates([candidate(w,text)]).then(rows=>rows[0]);
async function choose(w,target,text='Vane') {await learning(w).chooseForSource({text,sourceUuid:w.session.uuid,targetUuid:target.uuid});}

test('A saved source choice reaches every prose occurrence in Memory, even an ambiguous namesake',async()=>{
 const w=reviewWorld(1),chosen=w.add('Gunther','Actor');w.add('Gunther','JournalEntry',{worldProfile:{category:'contact'}});
 w.page.text.content='Gunther spoke. Gunther waited at Copper Watch.';
 await w.api.campaignEntityLinks.linkCanonical({sourceUuid:w.session.uuid,targetUuid:chosen.uuid});await choose(w,chosen,'Gunther');
 for(let pass=0;pass<2;pass++){
  if(pass)w.reload('campaign-review-learning.js');
  const ledger=await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});const rows=ledger.records.filter(row=>row.active&&row.mentionText==='Gunther');
  assert.ok(rows.length);assert.ok(rows.every(row=>row.outcome==='LINKED'&&row.targetUuid===chosen.uuid));assert.ok(rows.every(row=>row.identityChoice?.mode==='source'));
 }
});

for(const [short,full,kind] of [['Vane','Captain Edric Vane','Actor'],['Scout','Tala Reed','Actor'],['Harbour','Amber Port','JournalEntry'],['Relic','Moonstone Key','Item']])test(`Consistent historical GM choice resolves ${short} in a new source without a global alias`,async()=>{
 const w=world('',false),target=w.add(full,kind,kind==='JournalEntry'?{worldProfile:{category:'location'}}:{}),old=w.add('Earlier source','JournalEntry',{type:'session'});
 await learning(w).chooseForSource({text:short,sourceUuid:old.uuid,targetUuid:target.uuid});w.reload('campaign-review-learning.js');
 assert.equal(learning(w).decisionFor(short,{sourceUuid:w.session.uuid}),null);
 const row=await resolve(w,short);assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,target.uuid);assert.equal(row.identityChoice.mode,'historical');assert.ok(row.identityChoice.historySources.includes(old.uuid));
 assert.equal(Object.keys(learning(w).all().sourceChoices).length,1);
});

test('Historical shorthand resolves through real discovery, Memory, persistence and reanalysis',async()=>{
 const w=reviewWorld(1),target=w.add('Captain Edric Vane','Actor'),old=w.add('Earlier source','JournalEntry',{type:'session'});
 await learning(w).chooseForSource({text:'Vane',sourceUuid:old.uuid,targetUuid:target.uuid});w.page.text.content='Vane spoke. Vane left Copper Watch.';
 for(let pass=0;pass<2;pass++){const ledger=await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});const rows=ledger.records.filter(row=>row.active&&row.mentionText==='Vane');assert.ok(rows.length);assert.ok(rows.every(row=>row.outcome==='LINKED'&&row.targetUuid===target.uuid&&row.identityChoice.mode==='historical'));}
 const stored=w.api.campaignMentionEvidence.snapshot().records.filter(row=>row.active&&row.mentionText==='Vane');assert.ok(stored.every(row=>row.identityChoice.historySources.includes(old.uuid)));
});

test('Conflicting historical choices remain Review until this source receives an explicit decision',async()=>{
 const w=world('',false),a=w.add('Tala Reed','Actor'),b=w.add('Hale Moss','Actor');
 for(const target of [a,b]){const source=w.add('Previous chapter','JournalEntry',{type:'session'});await learning(w).chooseForSource({text:'Scout',sourceUuid:source.uuid,targetUuid:target.uuid});}
 let row=await resolve(w,'Scout');assert.equal(row.outcome,'REVIEW');assert.equal(row.identityAmbiguous,true);assert.equal(w.links.size,0);
 await choose(w,b,'Scout');row=await resolve(w,'Scout');assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,b.uuid);
});

test('An independent exact namesake blocks historical shorthand from becoming a global name merge',async()=>{
 const w=world('',false),target=w.add('Captain Edric Vane','Actor'),old=w.add('Previous chapter','JournalEntry',{type:'session'});await learning(w).chooseForSource({text:'Vane',sourceUuid:old.uuid,targetUuid:target.uuid});
 w.add('Vane','Actor');const count=w.docs.size;const row=await resolve(w,'Vane');assert.equal(row.outcome,'REVIEW');assert.equal(row.identityAmbiguous,true);assert.equal(w.docs.size,count);assert.equal(w.links.size,0);
});

test('A deleted historical target stays in Review and never creates a replacement identity',async()=>{
 const w=world('',false),target=w.add('Tala Reed','Actor'),old=w.add('Earlier chapter','JournalEntry',{type:'session'});await learning(w).chooseForSource({text:'Scout',sourceUuid:old.uuid,targetUuid:target.uuid});
 w.docs.delete(target.uuid);w.game.actors.contents=[];const count=w.docs.size;const row=await resolve(w,'Scout');assert.equal(row.outcome,'REVIEW');assert.equal(row.outcomeReason,'gm-selected-identity-deleted');assert.equal(w.docs.size,count);
});

test('An independent registered alias blocks historical shorthand as safely as an exact namesake',async()=>{
 const w=world('',false),target=w.add('Tala Reed','Actor'),old=w.add('Earlier source','JournalEntry',{type:'quest'});
 await learning(w).chooseForSource({text:'Scout',sourceUuid:old.uuid,targetUuid:target.uuid});
 w.add('Hale Moss','Actor',{actorProfile:{aliases:['Scout']}});const row=await resolve(w,'Scout');assert.equal(row.outcome,'REVIEW');assert.equal(row.identityAmbiguous,true);
});

test('Historical choices retain safety for future root document collections',async()=>{
 const w=world('',false),target=w.add('Tala Reed','Actor'),old=w.add('Earlier source','JournalEntry',{type:'session'});
 await learning(w).chooseForSource({text:'Scout',sourceUuid:old.uuid,targetUuid:target.uuid});
 const namesake=w.add('Scout','Adventure');w.game.journal.contents=w.game.journal.contents.filter(doc=>doc!==namesake);w.game.collections=new Map([['Adventure',{contents:[namesake]}]]);
 const row=await resolve(w,'Scout');assert.equal(row.outcome,'REVIEW');assert.equal(row.identityAmbiguous,true);
});

test('Player clients cannot read historical GM identity choices',async()=>{
 const w=world('',false),target=w.add('Tala Reed','Actor');await choose(w,target,'Scout');w.game.user.isGM=false;assert.equal(learning(w).historicalChoiceFor('Scout',{sourceUuid:'JournalEntry.other'}),null);
});
function briefFunctions(w) {
  w.context.normalizeImportName=text=>String(text||'').toLowerCase();
  w.context.getActorProfile=doc=>doc.getFlag('','actorProfile')||{};
  w.context.getWorldProfile=doc=>doc.getFlag('','worldProfile')||{};
  w.context.resolveWorldActor=()=>null;w.context.WORLD_CATEGORIES={};
  vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld(')),w.context);
}

for(const sameSource of [true,false])test(`Legacy Link existing survives reload in ${sameSource?'the same':'a later'} source`,async()=>{
 const w=world('',false),target=w.add('Captain Edric Vane','Actor');
 const sourceUuid=sameSource?w.session.uuid:w.add('Earlier chapter','JournalEntry',{type:'session'}).uuid;
 await learning(w).linkExisting({text:'Vane',sourceUuid,targetUuid:target.uuid});w.reload('campaign-review-learning.js');
 const row=await resolve(w,'Vane');assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,target.uuid);
 assert.equal(row.identityChoice.mode,sameSource?'source':'historical');
});
function actions(w) {
  briefFunctions(w);
  w.context.escapeHtml=text=>String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  vm.runInContext(`globalThis.DecisionActions=class {${main.slice(main.indexOf('  static async _onLinkExistingCampaignIdentity('),main.indexOf('  static async _onBrowseBackground('))} };`,w.context);
  const app={constructor:w.context.DecisionActions,render:async()=>{app.renders++;},renders:0};
  const button={disabled:false,dataset:{decisionText:'Vane',sourceUuid:w.session.uuid},closest:()=>({querySelector:()=>({value:'contact'})})};
  return {app,button,picker:()=>w.context.DecisionActions._onLinkExistingCampaignIdentity.call(app,null,button),
    link:target=>w.context.DecisionActions._onResolveCampaignDecision.call(app,null,{disabled:false,dataset:{...button.dataset,decisionMode:'choose',targetUuid:target.uuid,targetName:target.name}}),
    undo:()=>w.context.DecisionActions._onUndoCampaignDecision.call(app)};
}
for(const recommended of [false,true])test(`Review offers Link existing with recommended=${recommended}, including non-creatable candidates`,()=>{
  const html=footer({decisionText:'Vane',sourceUuid:'JournalEntry.source',canCreate:false,hasRecommendation:recommended});
  assert.match(html,/data-action="linkExistingCampaignIdentity"/);assert.match(html,/Keep unresolved/);assert.ok(!html.includes('Create new identity'));
});
for(const [kind,category,filter] of [['Actor',null,'person'],['JournalEntry','contact','person'],['JournalEntry','faction','faction'],['JournalEntry','location','location'],['Item',null,'item'],['JournalEntry','quest','quest'],['JournalEntry','session','session'],['JournalEntry','lore','lore']])test(`Search finds ${kind}/${category||filter} without an adapter`,()=>{
  const w=world('',false),doc=w.add('Copper North',kind,category?{worldProfile:{category}}:{});
  const rows=learning(w).linkTargets({query:'copper',kind:filter});assert.equal(rows.length,1);assert.equal(rows[0].uuid,doc.uuid);
});
test('Type hint can be changed or broadened across categories',()=>{
  const w=world('',false);const person=w.add('Copper North','Actor'),group=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  assert.deepEqual(Array.from(learning(w).linkTargets({query:'copper',kind:'contact'}),r=>r.uuid),[person.uuid]);
  assert.deepEqual(Array.from(learning(w).linkTargets({query:'copper',kind:'organization'}),r=>r.uuid),[group.uuid]);
  assert.equal(learning(w).linkTargets({query:'copper',kind:'all'}).length,2);
});
test('Search uses established aliases, profile facts and folder context without learning a link',()=>{
  const w=world('',false),doc=w.add('Rhea North','Actor',{actorProfile:{aliases:['Nightkeeper'],facts:[{label:'Location',value:'Greyfen'}]}});doc.folder={name:'Northern people'};
  for(const query of ['Nightkeeper','greyfen','northern people'])assert.equal(learning(w).linkTargets({query})[0].uuid,doc.uuid);
  assert.equal(Object.keys(learning(w).all().sourceChoices).length,0);assert.equal(w.links.size,0);
});
test('Picker catalog canonicalizes an Actor and its Tome projection into one result',()=>{
  const w=world('',false),actor=w.add('Rhea North','Actor');w.add('The keeper','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
  const rows=learning(w).linkTargets({query:'keeper'});assert.equal(rows.length,1);assert.equal(rows[0].uuid,actor.uuid);
});
test('Source decision stores projection authority UUID rather than its presentation UUID',async()=>{
  const w=world('',false),actor=w.add('Rhea North','Actor'),projection=w.add('The keeper','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
  await choose(w,projection);assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}).targetUuid,actor.uuid);
});
test('Future root collections remain selectable without a hardcoded entity registry',()=>{
  const w=world('',false),doc=w.add('Future target','Adventure');w.game.journal.contents=w.game.journal.contents.filter(d=>d!==doc);
  w.game.collections=new Map([['Adventure',{contents:[doc]}]]);assert.equal(learning(w).linkTargets({query:'future'})[0].uuid,doc.uuid);
});
test('Same-name people remain distinct and use the existing Identity Briefing context',()=>{
  const w=world('',false);const a=w.add('Gunther','Actor',{actorProfile:{title:'NPC',facts:[{label:'Location',value:'Blackbridge'}]}});
  const b=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',facts:[{label:'Location',value:'Greyfen'}]}});
  a.folder={name:'Northern people'};b.folder={name:'Southern contacts'};briefFunctions(w);
  const rows=learning(w).linkTargets({query:'Gunther'});assert.equal(rows.length,2);assert.notEqual(rows[0].uuid,rows[1].uuid);
  const cards=rows.map(row=>{w.context.row=row;return vm.runInContext('campaignDecisionCandidateMeta(row)',w.context);});
  assert.ok(cards.some(c=>c.briefItems.some(i=>i.value==='Blackbridge')));assert.ok(cards.some(c=>c.briefItems.some(i=>i.value==='Greyfen')));
});
for(const lifecycle of ['reload','reanalysis','rename','folder move'])test(`GM choice survives ${lifecycle}, with no new identity`,async()=>{
  const w=world('Vane spoke.',false),target=w.add('Captain Edric Vane','Actor');await choose(w,target);
  const count=w.docs.size;
  if(lifecycle==='reload')w.reload('campaign-review-learning.js');
  if(lifecycle==='rename')target.name='Renamed captain';
  if(lifecycle==='folder move')target.folder={id:'new',name:'New folder'};
  for(let i=0;i<2;i++){const row=await resolve(w,'Vane');assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,target.uuid);}
  assert.equal(w.docs.size,count);assert.equal(w.links.size,1);
});
test('Explicit UUID wins over a same-name recommendation and wrong discovery classification',async()=>{
  const w=world('',false),automatic=w.add('Vane','Actor'),chosen=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});await choose(w,chosen);
  const row=await resolve(w,'Vane');assert.equal(row.targetUuid,chosen.uuid);assert.equal(row.outcome,'LINKED');assert.notEqual(row.targetUuid,automatic.uuid);
});
test('Choice is source-scoped and never becomes a global surname alias',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor');await choose(w,target);
  assert.equal(learning(w).decisionFor('Vane'),null);assert.equal(learning(w).decisionFor('Vane',{sourceUuid:'JournalEntry.other'}),null);
});
test('Deleted selected target stays REVIEW despite a competing exact match or creation signals',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor');await choose(w,target);w.docs.delete(target.uuid);w.game.actors.contents=[];
  w.add('Vane','Actor');const count=w.docs.size;const row=await resolve(w,'Vane');assert.equal(row.outcome,'REVIEW');assert.equal(row.outcomeReason,'gm-selected-identity-deleted');assert.equal(w.docs.size,count);assert.equal(w.links.size,0);
});
test('A target deleted while picker is open causes no decision or link',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor'),a=actions(w);
  w.context.foundry.applications.api.DialogV2.wait=async()=>{w.docs.delete(target.uuid);return target.uuid;};await a.picker();
  assert.equal(w.links.size,0);assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}),null);
});
test('Known alias and complete name converge after fragment choice; no competing canonical person',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor',{actorProfile:{aliases:['Edric Vane']}});await choose(w,target);const count=w.docs.size;
  for(const text of ['Vane','Edric Vane','Captain Edric Vane']){const row=await resolve(w,text);assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,target.uuid);}
  assert.equal(w.docs.size,count);
});
test('A unique full name with an optional title links without creating or globally merging',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor');await choose(w,target);const count=w.docs.size;
  const row=await resolve(w,'Edric Vane');assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,target.uuid);assert.equal(w.docs.size,count);
  assert.equal(learning(w).decisionFor('Edric Vane',{sourceUuid:'JournalEntry.other'}),null);
});
test('A first-name fragment still requires Review despite an optional title',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor');await choose(w,target);const count=w.docs.size;
  const row=await resolve(w,'Edric');assert.equal(row.outcome,'REVIEW');assert.equal(w.docs.size,count);assert.equal(row.identityCandidates[0].match.safe,false);
});
test('Picker opens with type hint, explicit confirmation and cancellation without mutation',async()=>{
  const w=world('',false);w.add('Captain Edric Vane','Actor');const a=actions(w);let config;
  w.context.foundry.applications.api.DialogV2.wait=async options=>{config=options;return null;};await a.picker();
  assert.match(config.content,/value="contact" selected/);assert.match(config.content,/name="identitySearch"/);assert.equal(config.buttons[0].action,'confirm');assert.equal(config.buttons[1].action,'cancel');
  assert.equal(w.links.size,0);assert.equal(a.button.disabled,false);assert.equal(a.app.renders,0);
});
test('Picker selection executes the existing canonical choice action, then refreshes',async()=>{
  const w=world('Vane spoke.',false),target=w.add('Captain Edric Vane','Actor'),a=actions(w);
  w.context.foundry.applications.api.DialogV2.wait=async()=>target.uuid;await a.picker();
  assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}).targetUuid,target.uuid);assert.equal(a.app.renders,1);assert.equal(w.links.size,1);
});
test('Undo removes only new source decision/link, leaving original target intact',async()=>{
  const w=world('Vane spoke.',false),target=w.add('Captain Edric Vane','Actor'),a=actions(w);const before=JSON.stringify(target.flags);await a.link(target);await a.undo();
  assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}),null);assert.equal(w.links.size,0);assert.equal(w.docs.get(target.uuid),target);assert.equal(JSON.stringify(target.flags),before);
});
test('Undo preserves pre-existing source link and restores the earlier GM choice',async()=>{
  const w=world('Vane spoke.',false),previous=w.add('Captain Edric Vane','Actor'),target=w.add('Other Vane','Actor'),a=actions(w);await choose(w,previous);
  w.links.add(`${w.session.uuid}|${target.uuid}`);await a.link(target);await a.undo();
  assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}).targetUuid,previous.uuid);assert.ok(w.links.has(`${w.session.uuid}|${target.uuid}`));
});
test('Undo restores a prior source deferral',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor'),a=actions(w);await learning(w).ignoreOnce({text:'Vane',sourceUuid:w.session.uuid});await a.link(target);await a.undo();
  assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}).action,'source-ignored');
});
test('Failed decision persistence rolls back only the newly added canonical link',async()=>{
  const w=world('',false),target=w.add('Captain Edric Vane','Actor'),a=actions(w);w.game.settings.set=async()=>{throw Error('Write unavailable');};await a.link(target);
  assert.equal(w.links.size,0);assert.equal(a.app._lastCampaignDecision,undefined);assert.equal(w.docs.get(target.uuid),target);
});
test('Analysis counter and mention target refresh after manual selection and undo',async()=>{
  const w=world('They met Elira Vos, a quartermaster.',false),target=w.add('Elira Voss','Actor'),a=actions(w);a.button.dataset.decisionText='Elira Vos';
  vm.runInContext(main.slice(main.indexOf('function campaignMemoryRelationMeta('),main.indexOf('function campaignMemorySearchView(')),w.context);
  await w.api.campaignMentionEvidence.sync({rescan:true});
  const view=()=>{w.context.memoryRows=w.api.campaignMentionEvidence.snapshot().records.map(row=>({...row,...w.context.campaignMemoryRelationMeta(row),lifecycle:row.active===false?'historical':'active'}));return vm.runInContext('campaignAnalysisView({rows:memoryRows})',w.context);};
  assert.equal(view().attentionCount,1);await a.link(target);assert.equal(view().attentionCount,0);
  assert.ok(w.api.campaignMentionEvidence.recordsForTarget(target.uuid).some(row=>row.mentionText==='Elira Vos'));await a.undo();assert.equal(view().attentionCount,1);
});
test('Relationship evidence consumes selected endpoint without confirming an uncertain assertion',async()=>{
  const w=world('Vane may work for Copper Circle.',false),target=w.add('Captain Edric Vane','Actor'),group=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}}),a=actions(w);
  w.page.testUserPermission=()=>true;
  // Review actions consume the analysis that produced the review card.
  // The approved indexed flow reuses discovery instead of rescanning on choice.
  await w.api.campaignMentionEvidence.sync({rescan:true,silent:true});
  await a.link(target);
  const rows=w.api.campaignRelationshipEvidence.snapshot().evidence.filter(row=>row.active&&row.relationType==='WORKS_FOR');
  assert.equal(rows.length,1);assert.equal(rows[0].subjectUuid,target.uuid);assert.equal(rows[0].objectUuid,group.uuid);assert.equal(rows[0].certainty,'possible');
  assert.equal(w.api.campaignRelationshipEvidence.relationshipsFor(target.uuid)[0].state,'possible');
});
test('Player receives neither candidate catalog nor source decision metadata',async()=>{
  const w=world('',false),target=w.add('Private person','Actor');await choose(w,target);w.game.user.isGM=false;
  assert.equal(learning(w).linkTargets({query:'private'}).length,0);assert.equal(learning(w).decisionFor('Vane',{sourceUuid:w.session.uuid}),null);
  assert.equal(Object.keys(learning(w).all().sourceChoices).length,0);await assert.rejects(()=>learning(w).canonicalTarget(target.uuid),/GM-only/);await assert.rejects(()=>choose(w,target),/GM-only/);
});
test('Player action returns before constructing a dialog or querying candidates',async()=>{
  const w=world('',false),a=actions(w);w.game.user.isGM=false;w.context.foundry.applications.api.DialogV2.wait=async()=>{assert.fail('Player dialog');};await a.picker();assert.equal(w.links.size,0);
});
test('Candidate label is escaped before entering the picker HTML',async()=>{
  const w=world('',false),a=actions(w);a.button.dataset.decisionText='<img src=x onerror=alert(1)>';let content;
  w.context.foundry.applications.api.DialogV2.wait=async options=>{content=options.content;return null;};await a.picker();assert.ok(!content.includes('<img'));assert.ok(content.includes('&lt;img'));
});
test('Production implementation contains no campaign name or game-system resolution branch',()=>{
  const code=fs.readFileSync(path.join(root,'scripts/campaign-review-learning.js'),'utf8')+main.slice(main.indexOf('  static async _onLinkExistingCampaignIdentity('),main.indexOf('  static async _onResolveCampaignDecision('));
  assert.ok(!/Captain Edric Vane|Gunther|Pale Wardens|Blackbridge|Realm Guard|Genesys|Pathfinder|game\.system/.test(code));
});
for(const kind of ['Actor','Item','JournalEntry','Scene','Adventure'])test(`Actual Campaign Links API persists and undoes selected ${kind} authority and backlink`,async()=>{
  const w=world('',false),target=w.add('Generic target',kind,kind==='JournalEntry'?{worldProfile:{category:'location'}}:{});
  vm.runInContext(`{${fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8')} globalThis.actualLinks={link:atCelLinkCanonical,has:atCelHasCanonicalLink};}`,w.context);
  await w.context.actualLinks.link(w.session.uuid,target.uuid);
  assert.equal(w.context.actualLinks.has(w.session.uuid,target.uuid),true);assert.ok(target.flags.links.sessions.includes(w.session.id));
  await w.context.actualLinks.link(w.session.uuid,target.uuid,false);
  assert.equal(w.context.actualLinks.has(w.session.uuid,target.uuid),false);assert.ok(!target.flags.links.sessions.includes(w.session.id));assert.equal(w.docs.get(target.uuid),target);
});
test('Utility documents and unnamed roots cannot enter the identity picker',()=>{
  const w=world('',false);for(const kind of ['User','Folder','ChatMessage','Combat','Setting'])w.add('Utility',kind);w.add('','Adventure');
  assert.equal(learning(w).linkTargets({query:'Utility'}).length,0);assert.ok(learning(w).linkTargets().every(row=>row.name));
});
test('Transient catalog search uses the shared type/alias rules and exposes nothing to a player',()=>{
  const w=world('',false),target=w.add('Rhea North','Actor',{actorProfile:{aliases:['Nightkeeper']}}),catalog=learning(w).linkTargets();
  assert.equal(learning(w).searchTargets(catalog,{query:'nightkeeper',kind:'npc'})[0].uuid,target.uuid);
  assert.equal(Object.keys(learning(w).all().sourceChoices).length,0);w.game.user.isGM=false;assert.equal(learning(w).searchTargets(catalog).length,0);
});
