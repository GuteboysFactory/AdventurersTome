import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const fixture = fs.readFileSync(path.join(root,'tests/fixtures/shadows-at-blackbridge.txt'),'utf8');

function world(text = fixture, known = true) {
  const handlers = new Map();
  const storage = new Map();
  const docs = new Map();
  const links = new Set();
  const module = { api:{} };
  let serial = 0;
  const collection = () => ({ contents:[], get(id) { return this.contents.find(doc=>doc.id===id); } });
  const game = { user:{id:'gm',isGM:true}, users:{activeGM:{id:'gm'}}, modules:new Map([['adventurers-tome',module]]),
    journal:collection(), actors:collection(), items:collection(), folders:collection(), i18n:{lang:'en'},
    settings:{ get:(_module,key)=>storage.get(key), set:async(_module,key,value)=>{storage.set(key,value);},
      register:(_module,key,options)=>{if(!storage.has(key))storage.set(key,options.default);} } };
  function add(name, kind, flags = {}) {
    const doc = {id:`d${++serial}`,name,documentName:kind,flags,sort:0,
      getFlag:(_module,key)=>flags[key], update:async changes=>{
        for(const [key,value] of Object.entries(changes)) {
          const prefix='flags.adventurers-tome.';
          if(key.startsWith(prefix)) flags[key.slice(prefix.length)]=structuredClone(value);
        }
      }, testUserPermission:()=>true};
    doc.uuid=`${kind}.${doc.id}`;
    docs.set(doc.uuid,doc);
    (kind==='Actor'?game.actors:kind==='Item'?game.items:game.journal).contents.push(doc);
    return doc;
  }
  const session = add('Session 2 — Shadows at Blackbridge','JournalEntry',{type:'session'});
  const page = {id:'page',uuid:`${session.uuid}.JournalEntryPage.page`,name:'Notes',sort:0,text:{content:text},parent:session};
  session.pages = {contents:[page],get:id=>id===page.id?page:null};
  docs.set(page.uuid,page);
  if(known) {
    for(const name of ['Arne','Baran','Citronimus','Gunther']) add(name,'Actor');
    for(const [name,category] of [['Pale Wardens','faction'],['Ravenmoor Valley','location'],['Ember Seal','item']]) add(name,'JournalEntry',{worldProfile:{category}});
  }
  const context = vm.createContext({game,MODULE_ID:'adventurers-tome',foundry:{utils:{deepClone:structuredClone},applications:{api:{DialogV2:{wait:async()=>{throw Error('Unexpected dialog');}}}}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}},
    window:{clearTimeout(){},setTimeout(){return 1;}},
    console:{info(){},warn(){},error(){}},
    ui:{notifications:{warn(){},info(){},error(){}}},
    fromUuid:async uuid=>docs.get(uuid)||null,
    JournalEntry:{create:async input=>{const entry=add(input.name,'JournalEntry',input.flags?.['adventurers-tome']);entry.ownership=input.ownership;return entry;}},
    document:{createElement:()=>({innerHTML:'',get textContent(){return this.innerHTML.replace(/<[^>]+>/g,'');},querySelectorAll:()=>[]})},
    Hooks:{once:(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},on(){},callAll(){}}
  });
  function load(file) {
    vm.runInContext(`{\n${fs.readFileSync(path.join(root,'scripts',file),'utf8')}\n}`,context,{filename:file});
  }
  context.self=context;
  vm.runInContext(fs.readFileSync(path.join(root,'vendor/compromise-14.17.0.js'),'utf8'),context,{filename:'compromise-14.17.0.js'});
  for(const file of ['nlp-provider.js','campaign-identity-reconciliation.js','campaign-source-scoped-identity.js','campaign-deterministic-auto-link.js',
    'campaign-review-learning.js','campaign-new-entity-discovery.js','campaign-confirmed-entity-creation.js','campaign-mention-evidence.js']) load(file);
  for(const callback of handlers.get('init')||[])callback();
  for(const callback of handlers.get('ready')||[])callback();
  const entities = () => [...game.actors.contents,...game.items.contents,...game.journal.contents.filter(doc=>doc.getFlag('','worldProfile'))]
    .map(doc=>({name:doc.name,canonicalUuid:doc.uuid,kind:doc.getFlag('','worldProfile')?.category||'character'}));
  module.api.discovery={snapshot:()=>({entities:entities()}),scan:async()=>({entities:entities()})};
  module.api.campaignMentionDiscovery={snapshot:()=>({mentions:[]}),scan:async()=>({mentions:[]})};
  module.api.campaignEntityLinks={hasCanonicalLink:({sourceUuid,targetUuid})=>links.has(`${sourceUuid}|${targetUuid}`),
    linkCanonical:async({sourceUuid,targetUuid})=>{links.add(`${sourceUuid}|${targetUuid}`);},
    unlinkCanonical:async({sourceUuid,targetUuid})=>{links.delete(`${sourceUuid}|${targetUuid}`);} };
  // Exercise the real generic authoring path, with only folder bootstrap mocked.
  let genericCreate;
  vm.runInContext(`{\n${fs.readFileSync(path.join(root,'scripts/universal-folder-quick-create.js'),'utf8')}\n globalThis.genericCreate=atFqEditGenericEntry; }`,context);
  genericCreate=context.genericCreate;
  module.api.folderQuickCreate={bootstrap:async()=>({folders:Object.fromEntries(['contact','location','faction','item','lore','npc'].map(type=>[type,{id:type,type:'JournalEntry',name:type}]))}),
    quickCreate:async(folder,options)=>genericCreate(folder.id,{label:folder.name,profileCategory:folder.id},{id:'blank',facts:[]},folder,options)};
  return {api:module.api,game,storage,docs,links,session,page,add,context,
    scan:()=>module.api.campaignNewEntityDiscovery.scan(),
    resolve:async()=>module.api.campaignEntityCreation.resolveCandidates((await module.api.campaignNewEntityDiscovery.scan()).candidates)};
}

function realCampaignLinks(w) {
  vm.runInContext(`{\n${fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8')}\n globalThis.realLinks={linkCanonical:atCelLinkCanonical,hasCanonicalLink:atCelHasCanonicalLink}; }`,w.context);
  w.api.campaignEntityLinks={
    linkCanonical:input=>w.context.realLinks.linkCanonical(input.sourceUuid,input.targetUuid),
    unlinkCanonical:input=>w.context.realLinks.linkCanonical(input.sourceUuid,input.targetUuid,false),
    hasCanonicalLink:input=>w.context.realLinks.hasCanonicalLink(input.sourceUuid,input.targetUuid)
  };
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.FLAGS={LINKS:'links'};
  w.context.userCanObserveDocument=doc=>doc.testUserPermission(w.game.user,'OBSERVER');
  vm.runInContext(main.slice(main.indexOf('function campaignWorldProjectionIdForAuthorityUuid('),main.indexOf('function textMentionsName(')),w.context);
  w.context.source=w.session;
  return ()=>vm.runInContext('getTomeLinks(source)',w.context);
}

function narrativeDetails(w) {
  realCampaignLinks(w);
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.FLAGS.GROUP_MEMBER='groupMember';
  Object.assign(w.context,{
    safeJSONParse:(raw,fallback)=>raw?JSON.parse(raw):fallback,
    journalText:()=>fixture, extractMarkdownSection:()=>'', sessionListItems:()=>[],
    stripMarkup:text=>text, truncate:text=>text,
    explicitSessionsForTarget:()=>[], linkedSessionsForTarget:()=>[],
    suggestedQuestMentions:()=>[], suggestedWorldMentions:()=>[],
    suggestedActorMentions:(_raw,actors,explicit)=>actors.filter(row=>!explicit.some(item=>item.id===row.id)),
    reconcileSuggestedCollections:collections=>collections.flat()
  });
  vm.runInContext(main.slice(main.indexOf('function candidatesFromExplicit('),main.indexOf('function actorReferenceTerms(')),w.context);
  vm.runInContext(main.slice(main.indexOf('function getLegacyGroupActorIds('),main.indexOf('function getGroupActors(')),w.context);
  vm.runInContext(main.slice(main.indexOf('function campaignNarrativeLinks('),main.indexOf('/**\n * Normalize Tome-owned profile')),w.context);
  return (kind='session')=>{
    w.context.actorViews=w.game.actors.contents.filter(doc=>doc.testUserPermission()).map(doc=>({id:doc.id,name:doc.name,displayRole:'Adventurer'}));
    w.context.worldViews=w.game.journal.contents.filter(doc=>doc.getFlag('','worldProfile')&&doc.testUserPermission()).map(doc=>({id:doc.id,name:doc.name,categoryLabel:'NPC',icon:'fa-user'}));
    return vm.runInContext(`${kind}DetailView({id:source.id},[],worldViews,actorViews)`,w.context);
  };
}

test('Session and Quest place Gunther NPC in lore, keep party Characters, and survive reprocessing/reload',async()=>{
  const w=world();
  for(const actor of w.game.actors.contents) {
    actor.type='character'; // Some systems use one Actor type for PCs and NPCs.
    actor.flags.groupMember=actor.name!=='Gunther';
  }
  const gunther=w.game.actors.contents.find(doc=>doc.name==='Gunther');
  const projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'npc',actorId:gunther.id}});
  const otherWorld=Array.from({length:12},(_,i)=>w.add(`Linked location ${i}`,'JournalEntry',{worldProfile:{category:'location'}}));
  w.session.flags.links={actors:w.game.actors.contents.map(doc=>doc.id),world:[projection,...otherWorld].map(doc=>doc.id)};
  w.session.flags.campaignEntityLinksV1={actorUuids:w.game.actors.contents.map(doc=>doc.uuid),entityUuids:[projection,...otherWorld].map(doc=>doc.uuid)};
  const details=narrativeDetails(w);
  const check=()=>{
    for(const kind of ['session','quest']) {
      const view=details(kind);
      assert.deepEqual(Array.from(view.actorLinks,row=>row.name).sort(),['Arne','Baran','Citronimus']);
      assert.equal(view.worldLinks.filter(row=>row.name==='Gunther').length,1);
      assert.equal(view.worldLinks.find(row=>row.name==='Gunther').id,projection.id);
      assert.ok(view.worldLinks.length>=13,'canonical links must not be silently cut off by the old display limit');
      assert.ok(otherWorld.every(doc=>view.worldLinks.some(row=>row.id===doc.id)));
      assert.equal(view.suggestedActorLinks.some(row=>row.name==='Gunther'),false);
    }
  };
  check();
  for(let i=0;i<2;i++) {
    const outcome=(await w.resolve()).find(row=>row.text==='Gunther');
    assert.equal(outcome.outcome,'LINKED');assert.equal(outcome.targetUuid,gunther.uuid);
    await w.api.campaignMentionEvidence.sync();check();
  }
  for(const doc of w.game.journal.contents)for(const key of ['links','campaignEntityLinksV1'])if(doc.flags[key])doc.flags[key]=JSON.parse(JSON.stringify(doc.flags[key]));
  narrativeDetails(w);check();
  assert.equal(w.game.journal.contents.filter(doc=>doc.name==='Gunther').length,1);
});

test('non-party Actors without projections remain visible NPC links; membership is explicit and system-independent',()=>{
  const w=world('',false);
  const npc=w.add('Unprojected NPC','Actor',{groupMember:false});npc.type='character';
  const pc=w.add('Party member','Actor',{groupMember:true});pc.type='npc';
  const legacy=w.add('Legacy member','Actor');
  w.storage.set('groupActors',JSON.stringify([legacy.id,npc.id]));
  w.session.flags.links={actors:[npc.id,pc.id,legacy.id]};
  const details=narrativeDetails(w);
  for(const kind of ['session','quest']) {
    const view=details(kind);
    assert.deepEqual(Array.from(view.actorLinks,row=>row.name).sort(),['Legacy member','Party member']);
    assert.equal(view.worldLinks.length,1);
    assert.equal(view.worldLinks[0].actorOnly,true);assert.equal(view.worldLinks[0].actorId,npc.id);
    assert.equal(view.worldLinks[0].categoryLabel,'NPC');
  }
  const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
  assert.equal((template.match(/\{\{#if actorOnly\}\}data-action="openActor" data-actor-id="\{\{actorId\}\}"/g)||[]).length,2);
});

test('Session canonical person identity spans Character and NPC projection categories',async()=>{
  const w=world();
  const people=w.game.actors.contents.filter(doc=>['Gunther','Arne','Baran','Citronimus'].includes(doc.name));
  for(const actor of people) { actor.type='character'; actor.flags.actorProfile={title:'Adventurer'}; }
  const projections=people.map(actor=>w.add(actor.name,'JournalEntry',{worldProfile:{category:'npc',actorId:actor.id}}));
  // Persisted mixed legacy/canonical links reproduce the live Session bug.
  w.session.flags.links={actors:people.map(doc=>doc.id),world:projections.map(doc=>doc.id)};
  w.session.flags.campaignEntityLinksV1={actorUuids:people.map(doc=>doc.uuid),entityUuids:projections.map(doc=>doc.uuid)};
  const sessionLinks=realCampaignLinks(w);
  const displayed=sessionLinks();
  assert.equal(displayed.world.filter(id=>projections.some(doc=>doc.id===id)).length,0,'NPC projections must not duplicate Characters in Session');
  assert.equal(displayed.actors.length,4);
  const discovered=(await w.scan()).candidates;
  for(const row of discovered.filter(row=>people.some(doc=>doc.name===row.text))) {
    row.classification={kind:'npc',confidence:0.99,signals:['person-role-apposition'],alternatives:[]};
    row.detection={score:0.99};
  }
  const count=w.game.journal.contents.length;
  const resolved=await w.api.campaignEntityCreation.resolveCandidates(discovered);
  for(const actor of people) {
    const outcome=resolved.find(row=>row.text===actor.name);
    assert.equal(outcome.outcome,'LINKED');
    assert.equal(outcome.targetUuid,actor.uuid);
    assert.equal(w.game.journal.contents.filter(doc=>doc.name===actor.name).length,1,'existing projection retained, no parallel Contact created');
  }
  assert.ok(w.game.journal.contents.length>=count);
  await w.api.campaignMentionEvidence.sync();
  await w.api.campaignMentionEvidence.sync();
  assert.equal(sessionLinks().actors.length,4);
  assert.equal(sessionLinks().world.filter(id=>projections.some(doc=>doc.id===id)).length,0);
  // Re-read serialized flags as Foundry does on reload.
  for(const key of ['links','campaignEntityLinksV1'])w.session.flags[key]=JSON.parse(JSON.stringify(w.session.flags[key]));
  vm.runInContext(`{ ${fs.readFileSync(path.join(root,'scripts/campaign-identity-reconciliation.js'),'utf8')} atCirAttach(); }`,w.context);
  realCampaignLinks(w);
  assert.equal(sessionLinks().actors.length,4);
  assert.equal(sessionLinks().world.filter(id=>projections.some(doc=>doc.id===id)).length,0);
});

test('linking a person projection writes Actor authority and removes only proven alias references',async()=>{
  const w=world('Gunther spoke.',false);
  const actor=w.add('Gunther','Actor');
  const projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'npc',actorId:actor.id}});
  const unrelated=w.add('Gunther','JournalEntry',{worldProfile:{category:'npc'}});
  w.session.flags.links={world:[projection.id,unrelated.id]};
  w.session.flags.campaignEntityLinksV1={entityUuids:[projection.uuid,unrelated.uuid]};
  const readLinks=realCampaignLinks(w);
  await w.api.campaignEntityLinks.linkCanonical({sourceUuid:w.session.uuid,targetUuid:projection.uuid});
  assert.deepEqual(w.session.flags.campaignEntityLinksV1.actorUuids,[actor.uuid]);
  assert.deepEqual(w.session.flags.campaignEntityLinksV1.entityUuids,[unrelated.uuid]);
  assert.deepEqual(w.session.flags.links.world,[unrelated.id]);
  assert.deepEqual(w.session.flags.links.actors,[actor.id]);
  assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:projection.uuid}),true);
  assert.equal(readLinks().world[0],unrelated.id,'same-name unrelated identity must not be hidden');
  await w.api.campaignEntityLinks.unlinkCanonical({sourceUuid:w.session.uuid,targetUuid:projection.uuid});
  assert.equal(w.api.campaignEntityLinks.hasCanonicalLink({sourceUuid:w.session.uuid,targetUuid:actor.uuid}),false);
  assert.deepEqual(w.session.flags.links.world,[unrelated.id]);
  assert.ok(w.docs.has(projection.uuid),'preserve projection journal and campaign data');
});

test('same-name unproven Contact is REVIEW; source identity can safely select one namesake',async()=>{
  const w=world('Gunther spoke.',false);
  const actor=w.add('Gunther','Actor');
  const other=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact'},links:{actors:[actor.id]}});
  const readLinks=realCampaignLinks(w);
  assert.equal((await w.resolve())[0].outcome,'REVIEW','a generic relationship cross-link is not identity authority');
  w.session.flags.links={actors:[actor.id]};
  assert.equal((await w.resolve())[0].outcome,'LINKED');
  assert.equal((await w.resolve())[0].targetUuid,actor.uuid);
  assert.equal(readLinks().actors.length,1);
  assert.equal(w.api.campaignIdentityReconciliation.identityFor({canonicalUuid:other.uuid}).authorityUuid,other.uuid);
});

test('source UUID, semantic and backend projections normalize independently of names and categories',async()=>{
  const w=world('Gunther spoke.',false);
  const actor=w.add('Gunther','Actor');
  const projections=[
    w.add('Old contact title','JournalEntry',{worldProfile:{category:'contact',sourceUuid:actor.uuid}}),
    w.add('NPC display title','JournalEntry',{semanticProjection:{kind:'contact',linkedUuid:actor.uuid}}),
    w.add('Another display title','JournalEntry',{backendProjectionV1:{managed:true,category:'npc',sourceUuid:actor.uuid}})
  ];
  w.session.flags.links={world:projections.map(doc=>doc.id)};
  const readLinks=realCampaignLinks(w);
  assert.equal(readLinks().actors.length,1);
  assert.equal(readLinks().world.length,0);
  await w.api.campaignReviewLearning.chooseForSource({text:'Gunther',sourceUuid:w.session.uuid,targetUuid:projections[0].uuid});
  const row=(await w.resolve())[0];
  assert.equal(row.outcome,'LINKED');assert.equal(row.targetUuid,actor.uuid);
});

test('readable Contact presentation survives when its canonical Actor is private',()=>{
  const w=world('',false);
  const actor=w.add('Gunther','Actor');
  actor.testUserPermission=()=>false;
  const projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
  w.session.flags.links={world:[projection.id]};
  const readLinks=realCampaignLinks(w);
  w.game.user.isGM=false;
  assert.equal(readLinks().world[0],projection.id);
  assert.equal(readLinks().actors.length,0,'do not expose the private Actor authority');
});

test('clear Blackbridge militia still creates a Faction when no identity collision exists',async()=>{
  const w=world('They met the Blackbridge militia, a faction guarding the road.',false);
  const result=(await w.resolve()).find(row=>row.text==='Blackbridge militia');
  assert.equal(result.outcome,'CREATED');
  assert.equal(w.docs.get(result.targetUuid).getFlag('','worldProfile').category,'faction');
});

test('fixed Blackbridge regression: every candidate gets LINKED / CREATED / REVIEW',async()=>{
  const w=world();
  const discovered=await w.scan();
  const outcomes=await w.api.campaignEntityCreation.resolveCandidates(discovered.candidates);
  assert.equal(outcomes.length,discovered.candidates.length);
  assert.ok(outcomes.every(row=>['LINKED','CREATED','REVIEW'].includes(row.outcome)));
  const result=new Map(outcomes.map(row=>[row.text,row]));
  for(const name of ['Arne','Baran','Citronimus','Gunther','Pale Wardens','Ravenmoor Valley','Ember Seal']) assert.equal(result.get(name)?.outcome,'LINKED',name);
  for(const name of ['Elira Voss','Toren Vale','Captain Edric Vane','Ashen Hand','Blackbridge Watch','Greyfen Ruins']) assert.equal(result.get(name)?.outcome,'CREATED',name);
  for(const name of ['Blackbridge','Blackbridge militia']) assert.ok(result.has(name),name);
  const toren=result.get('Toren Vale');
  assert.ok(toren.identityBriefing.roles.includes('ferryman and occasional informant'));
  assert.ok(toren.identityBriefing.briefItems.some(row=>/not a member/.test(row.value)));
  assert.ok(toren.identityBriefing.briefItems.some(row=>/owed Baran a favour/.test(row.value)));
  for(const row of outcomes.filter(row=>row.outcome==='CREATED')) {
    const doc=w.docs.get(row.targetUuid);
    assert.equal(doc.ownership.default,0);
    assert.ok(doc.getFlag('','worldProfile').facts.every(fact=>fact.visibility==='gm'));
  }
  const count=w.game.journal.contents.length;
  await w.resolve();
  assert.equal(w.game.journal.contents.length,count,'rescan does not duplicate identities');
});

test('clear location, faction, item and person create; weak identity reviews',async()=>{
  const w=world('They reached Silverfall Keep. They saw the mark of the Dusk Hand, a faction. They carried the Ivory Seal, an artifact. They met Mira Soren, a quartermaster. Zorb appeared.',false);
  const result=new Map((await w.resolve()).map(row=>[row.text,row]));
  for(const name of ['Silverfall Keep','Dusk Hand','Ivory Seal','Mira Soren']) assert.equal(result.get(name)?.outcome,'CREATED',name);
  assert.equal(result.get('Zorb')?.outcome,'REVIEW');
});

test('ambiguous exact identities and possible duplicates review',async()=>{
  const w=world('Gunther spoke. They met Elira Vos, a quartermaster. They reached Blackbridge Watch.',false);
  w.add('Gunther','Actor');w.add('Gunther','Actor');w.add('Elira Voss','Actor');
  w.add('Blackbridge','JournalEntry',{worldProfile:{category:'location'}});
  const rows=await w.resolve();
  for(const name of ['Gunther','Elira Vos','Blackbridge Watch']) {
    const row=rows.find(row=>row.text===name);
    assert.equal(row?.outcome,'REVIEW',name);
    assert.ok(row.identityCandidates.length>=1,name);
  }
});

test('canonical projections collapse and source-scoped decision wins',async()=>{
  const w=world('Gunther spoke.',false);
  const actor=w.add('Gunther','Actor');
  w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
  assert.equal((await w.resolve())[0].outcome,'LINKED');
  w.add('Gunther','Actor');
  w.session.flags.campaignEntityLinksV1={actorUuids:[actor.uuid]};
  assert.equal((await w.resolve())[0].targetUuid,actor.uuid);
  assert.equal((await w.resolve())[0].outcome,'LINKED');
});

test('failed creation / link / cancelled creation falls back to review',async()=>{
  for(const failure of ['create','link','cancel']) {
    const w=world('They reached Silverfall Keep.',false);
    if(failure==='create')w.api.folderQuickCreate.quickCreate=async()=>{throw Error('creation failure');};
    if(failure==='link')w.api.campaignEntityLinks.linkCanonical=async()=>{throw Error('link failure');};
    if(failure==='cancel')w.api.folderQuickCreate.quickCreate=async()=>null;
    const rows=await w.resolve();
    assert.equal(rows.find(row=>row.text==='Silverfall Keep')?.outcome,'REVIEW');
  }
});

test('explicit GM dismissal and unlink suppression survive',async()=>{
  const w=world('Gunther spoke. They reached Silverfall Keep.',false);
  const actor=w.add('Gunther','Actor');
  w.session.flags.campaignAutoLinkPolicyV1={suppressedTargetUuids:[actor.uuid]};
  await w.api.campaignReviewLearning.ignoreOnce({text:'Silverfall Keep',sourceUuid:w.session.uuid});
  const rows=await w.resolve();
  assert.ok(rows.every(row=>row.outcome==='REVIEW'));
  assert.equal(w.links.size,0);
  assert.equal(w.game.journal.contents.length,1);
});

test('Memory persistence retains outcomes, briefing and old history on reload',async()=>{
  const w=world();
  const ledger=await w.api.campaignMentionEvidence.sync();
  const toren=ledger.records.find(row=>row.mentionText==='Toren Vale');
  assert.equal(toren.outcome,'CREATED');
  assert.ok(toren.identityBriefing.briefItems.length);
  assert.ok(w.api.campaignMentionEvidence.snapshot().records.find(row=>row.id===toren.id).identityBriefing);
  const persisted=w.storage.get('campaignMentionEvidenceV1');
  // A fresh runtime reloads the existing setting without a migration or wipe.
  const reload=world();
  reload.storage.set('campaignMentionEvidenceV1',persisted);
  assert.deepEqual(JSON.parse(JSON.stringify(reload.api.campaignMentionEvidence.snapshot().records.find(row=>row.id===toren.id).identityBriefing)),JSON.parse(JSON.stringify(toren.identityBriefing)));
  const before=w.game.journal.contents.length;
  await w.api.campaignMentionEvidence.sync();
  assert.equal(w.game.journal.contents.length,before);
  w.page.text.content='Nothing remains.';
  const after=await w.api.campaignMentionEvidence.sync();
  assert.equal(after.records.find(row=>row.id===toren.id).active,false);
  assert.equal(after.records.find(row=>row.id===toren.id).outcome,'CREATED');
});

test('short names and lowercase militia suffix reach explicit outcomes',async()=>{
  const w=world('Bo spoke. Li arrived. They saw Blackbridge militia.',false);
  w.add('Bo','Actor');
  const rows=await w.resolve();
  assert.equal(rows.find(row=>row.text==='Bo')?.outcome,'LINKED');
  assert.equal(rows.find(row=>row.text==='Li')?.outcome,'REVIEW');
  assert.ok(rows.find(row=>row.text==='Blackbridge militia')?.outcome);
});

test('semantic discovery and new discovery converge in the same Memory queue',async()=>{
  const w=world('Gunther spoke. They met Mira Soren, a quartermaster.',true);
  const gunther=w.game.actors.contents.find(doc=>doc.name==='Gunther');
  const mention={id:'known',text:'Gunther',sourceKind:'session',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,
    sourceName:w.session.name,pageName:w.page.name,source:{uuid:w.session.uuid,pageUuid:w.page.uuid,start:0,end:7},
    resolution:{decision:'resolved',selectedTarget:{name:'Gunther',kind:'character',canonicalUuid:gunther.uuid}}};
  w.api.campaignMentionDiscovery.snapshot=()=>({mentions:[mention]});
  const ledger=await w.api.campaignMentionEvidence.sync();
  assert.equal(ledger.records.filter(row=>row.mentionText==='Gunther'&&row.active).length,1);
  assert.equal(ledger.records.find(row=>row.mentionText==='Gunther').outcome,'LINKED');
  assert.equal(ledger.records.find(row=>row.mentionText==='Mira Soren').outcome,'CREATED');
});

test('later source links a previously created identity; missing resolver reviews',async()=>{
  const w=world('They met Mira Soren, a quartermaster.',false);
  const row=(await w.resolve())[0];
  assert.equal(row.outcome,'CREATED');
  const later=w.add('Session 3','JournalEntry',{type:'session'});
  const candidate={...row,sourceJournalUuid:later.uuid};
  assert.equal((await w.api.campaignEntityCreation.resolveCandidates([candidate]))[0].outcome,'LINKED');
  delete w.api.campaignDeterministicAutoLink;
  assert.equal((await w.api.campaignEntityCreation.resolveCandidates([candidate]))[0].outcome,'REVIEW');
});

test('players do not resolve or create and second GM does not auto-create',async()=>{
  const w=world('They met Mira Soren, a quartermaster.',false);
  const candidates=(await w.scan()).candidates;
  w.game.user.isGM=false;
  assert.equal((await w.api.campaignEntityCreation.resolveCandidates(candidates)).length,0);
  w.game.user.isGM=true;w.game.users.activeGM.id='other-gm';
  assert.equal((await w.api.campaignEntityCreation.resolveCandidates(candidates))[0].outcome,'REVIEW');
  assert.equal(w.game.journal.contents.length,1);
});

test('Analysis presents new candidate briefing, exact ambiguity and source focus',async()=>{
  const w=world('Gunther spoke. They met Elira Vos, a quartermaster.',false);
  w.add('Gunther','Actor');w.add('Gunther','Actor');
  w.add('Elira Voss','Actor');
  const ledger=await w.api.campaignMentionEvidence.sync();
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  const functions=main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld('));
  w.context.normalizeImportName=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  w.context.getActorProfile=actor=>actor.getFlag('','actorProfile')||{};
  w.context.getWorldProfile=entry=>entry.getFlag('','worldProfile')||{};
  w.context.resolveWorldActor=()=>null;
  w.context.WORLD_CATEGORIES={contact:{label:'Contact'}};
  vm.runInContext(functions,w.context);
  const rows=ledger.records.map(row=>({...row,lifecycle:'active',relationGroup:'unresolved',relationLabel:row.resolutionState==='ambiguous'?'Ambiguous':'Unresolved'}));
  w.context.memoryRows=rows;w.context.sourceUuid=w.session.uuid;
  const view=vm.runInContext('campaignAnalysisView({rows:memoryRows},sourceUuid)',w.context);
  assert.equal(view.attentionCount,2);
  assert.equal(view.ambiguousCount,1);
  assert.ok(view.attention.find(row=>row.decisionText==='Elira Vos').identityBriefItems.length);
  assert.ok(view.attention.find(row=>row.decisionText==='Elira Vos').canCreate);
  assert.equal(view.attention.find(row=>row.decisionText==='Gunther').candidates.length,2);
  assert.equal(vm.runInContext('campaignAnalysisView({rows:memoryRows},"JournalEntry.other")',w.context).attentionCount,0);
});

test('Contact fact priority and previous mentions are visible without More info',()=>{
  const w=world('',false);
  const entry=w.add('Toren Vale','JournalEntry',{worldProfile:{category:'contact',facts:[
    {label:'Misc 1',value:'A'},{label:'Misc 2',value:'B'},{label:'Misc 3',value:'C'},{label:'Misc 4',value:'D'},
    {label:'Role / profession',value:'Ferryman / Informant'},{label:'Faction',value:'Not a member of Pale Wardens'},
    {label:'Location',value:'Blackbridge'},{label:'Relations',value:'Knows Baran; owes Baran a favour'}]}});
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.getWorldProfile=doc=>doc.getFlag('','worldProfile');
  w.context.resolveWorldActor=()=>null;
  w.context.WORLD_CATEGORIES={contact:{label:'Contact'}};
  w.context.normalizeImportName=value=>String(value||'').toLowerCase();
  w.api.campaignMentionEvidence={recordsForTarget:()=>[{sourceName:'Session 1',pageName:'Notes'}]};
  vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignDecisionRawMention(')),w.context);
  w.context.target={canonicalUuid:entry.uuid,name:entry.name,kind:'contact'};
  const card=vm.runInContext('campaignDecisionCandidateMeta(target)',w.context);
  for(const label of ['Role / profession','Faction','Location','Relations','Previously seen']) assert.ok(card.briefItems.some(row=>row.label===label),label);
});

test('manual creation still requires confirmation; concurrent resolution is idempotent',async()=>{
  const w=world('They reached Silverfall Keep.',false);
  await assert.rejects(()=>w.api.campaignEntityCreation.apply({text:'Silverfall Keep',sourceUuid:w.session.uuid,semanticType:'location'}),/Confirmed/);
  const candidates=(await w.scan()).candidates;
  await Promise.all([w.api.campaignEntityCreation.resolveCandidates(candidates),w.api.campaignEntityCreation.resolveCandidates(candidates)]);
  assert.equal(w.game.journal.contents.filter(doc=>doc.name==='Silverfall Keep').length,1);
});

test('choosing a possible duplicate persists for this source and undo restores review',async()=>{
  const w=world('They met Elira Vos, a quartermaster.',false);
  const actor=w.add('Elira Voss','Actor');
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  const actions=main.slice(main.indexOf('  static async _onResolveCampaignDecision('),main.indexOf('  static async _onBrowseBackground('));
  vm.runInContext(`class DecisionActions { ${actions} static async render(){} }`,w.context);
  w.context.choiceTarget={disabled:false,dataset:{decisionMode:'choose',decisionText:'Elira Vos',sourceUuid:w.session.uuid,targetUuid:actor.uuid,targetName:actor.name}};
  await vm.runInContext('DecisionActions._onResolveCampaignDecision(null,choiceTarget)',w.context);
  assert.equal((await w.resolve())[0].outcome,'LINKED');
  const other=w.add('Session 3','JournalEntry',{type:'session'});
  const candidate={...(await w.scan()).candidates[0],sourceJournalUuid:other.uuid};
  assert.equal((await w.api.campaignEntityCreation.resolveCandidates([candidate]))[0].outcome,'REVIEW','choice must not become a global alias');
  await vm.runInContext('DecisionActions._onUndoCampaignDecision()',w.context);
  assert.equal((await w.resolve())[0].outcome,'REVIEW');
});

test('Session and Quest remain clean and review remains GM-only',()=>{
  const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
  const session=template.slice(template.indexOf('{{#if isSessions}}',1000),template.indexOf('{{#if isQuests}}',1000));
  const quest=template.slice(template.indexOf('{{#if isQuestDetail}}'),template.indexOf('{{#if isWorld}}'));
  for(const section of [session,quest]) {
    assert.ok(!section.includes('Tome noticed'));
    assert.match(section,/\{\{#if isGM\}\}<button[^>]+data-action="openSourceAnalysis"/);
    assert.ok(section.includes('GM review'));
  }
});
