import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const fixture = fs.readFileSync(path.join(root,'tests/fixtures/shadows-at-blackbridge.txt'),'utf8');
const stonecross = fs.readFileSync(path.join(root,'tests/fixtures/the-bell-at-stonecross.txt'),'utf8');

function analysisFor(w, rows) {
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.normalizeImportName=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  w.context.getActorProfile=actor=>actor.getFlag('','actorProfile')||{};
  w.context.getWorldProfile=entry=>entry.getFlag('','worldProfile')||{};
  w.context.resolveWorldActor=()=>null;w.context.WORLD_CATEGORIES={};
  vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld(')),w.context);
  w.context.memoryRows=rows;
  return vm.runInContext('campaignAnalysisView({rows:memoryRows})',w.context);
}

test('Actual Stonecross source keeps Blackbridge and Stonecross as Location through discovery, Review and reload',async()=>{
  const w=world(stonecross,true);
  w.add('Blackbridge Watch','JournalEntry',{worldProfile:{category:'location'}});
  w.add('Stonecross Watch','JournalEntry',{worldProfile:{category:'location'}});
  const scan=await w.scan();
  for(const name of ['Blackbridge','Stonecross'])assert.equal(scan.candidates.find(row=>row.text===name).classification.kind,'location');
  const ledger=await w.api.campaignMentionEvidence.sync();
  const rows=ledger.records.filter(row=>['Blackbridge','Stonecross'].includes(row.mentionText));
  assert.equal(rows.length,2);
  for(const row of rows) {
    assert.equal(row.discoveryKind,'location');assert.equal(row.outcome,'REVIEW');
    assert.equal(row.targetUuid,'','a place prefix must not auto-link its Watch');
  }
  const view=analysisFor(w,rows.map(row=>({...row,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review'})));
  for(const row of view.attention)assert.equal(row.creationTypeOptions.find(option=>option.selected).value,'location');
  const reloaded=world(stonecross,true);
  for(const [key,value] of w.storage)reloaded.storage.set(key,JSON.parse(JSON.stringify(value)));
  for(const row of reloaded.api.campaignMentionEvidence.snapshot().records.filter(row=>['Blackbridge','Stonecross'].includes(row.mentionText)))assert.equal(row.discoveryKind,'location');
  const again=await w.api.campaignMentionEvidence.sync();
  for(const row of again.records.filter(row=>['Blackbridge','Stonecross'].includes(row.mentionText)))assert.equal(row.discoveryKind,'location');
});

test('Place source roles do not reclassify nearby people, faction names or items',async()=>{
  const w=world('They left Gunther alone. They walked toward Mara Venn, a keeper. They walked toward Order of the Silver Lantern. They walked toward Blackglass Key. They travelled toward Stonecross. Stonecross heard about the Order of the Silver Lantern.',false);
  const rows=(await w.scan()).candidates;
  assert.notEqual(rows.find(row=>row.text==='Gunther').classification.kind,'location');
  assert.equal(rows.find(row=>row.text==='Mara Venn').classification.kind,'character');
  assert.equal(rows.find(row=>row.text==='Order of the Silver Lantern').classification.kind,'faction');
  assert.equal(rows.find(row=>row.text==='Blackglass Key').classification.kind,'item');
  assert.equal(rows.find(row=>row.text==='Stonecross').classification.kind,'location');
});

test('Review creation type follows discovery independently of identity-match kind and keeps every manual option',()=>{
  const w=world('',false);
  const examples=[['Blackbridge','location','location'],['Stonecross','location','location'],['Mara','person','contact'],
    ['Gunther','character','contact'],['Wardens','organization','faction'],['Order','faction','faction'],['Key','item','item']];
  const rows=examples.map(([mentionText,discoveryKind])=>({mentionText,discoveryKind,targetKind:'unknown',sourceUuid:w.session.uuid,
    sourcePageUuid:w.page.uuid,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review'}));
  const view=analysisFor(w,rows);
  for(const [name,,expected] of examples) {
    const options=view.attention.find(row=>row.mentionText===name).creationTypeOptions;
    assert.equal(options.filter(option=>option.selected).length,1);
    assert.equal(options.find(option=>option.selected).value,expected);
    assert.deepEqual(Array.from(options,option=>option.value),['contact','location','faction','item','lore']);
  }
  const legacy=analysisFor(w,[{...rows[0],discoveryKind:undefined,targetKind:'location'}]);
  assert.equal(legacy.attention[0].creationTypeOptions.find(option=>option.selected).value,'location');
  const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
  assert.match(template,/class="at-review-create-type">\{\{#each creationTypeOptions\}\}/);
  assert.match(template,/\{\{#if selected\}\}selected\{\{\/if\}\}/);
});

test('Review discovery type survives Memory serialization, reload and reprocessing without changing resolution',async()=>{
  const w=world('They reached Old Bell Tower.',false);
  w.add('Old Bell Tower','JournalEntry',{worldProfile:{category:'location'}});
  w.add('Old Bell Tower','JournalEntry',{worldProfile:{category:'location'}});
  await w.api.campaignMentionEvidence.sync();
  const ledger=w.api.campaignMentionEvidence.snapshot();
  const row=ledger.records.find(row=>row.mentionText==='Old Bell Tower');
  assert.equal(row.discoveryKind,'location');assert.equal(row.outcome,'REVIEW');
  const reloaded=world('They reached Old Bell Tower.',false);
  for(const [key,value] of w.storage)reloaded.storage.set(key,JSON.parse(JSON.stringify(value)));
  const stored=reloaded.api.campaignMentionEvidence.snapshot().records.find(row=>row.mentionText==='Old Bell Tower');
  assert.equal(stored.discoveryKind,'location');
  assert.equal(analysisFor(reloaded,[{...stored,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review'}])
    .attention[0].creationTypeOptions.find(option=>option.selected).value,'location');
  const again=await w.api.campaignMentionEvidence.sync();
  assert.equal(again.records.find(row=>row.mentionText==='Old Bell Tower').discoveryKind,'location');
});

test('Review fallback and suggestions dedupe a proven Gunther projection by canonical UUID while preserving independent namesakes',()=>{
  const w=world('',false);const actor=w.add('Gunther','Actor');
  const projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',actorId:actor.id}});
  const base={mentionText:'Gunther',targetName:'Gunther',targetUuid:projection.uuid,targetKind:'contact',sourceUuid:w.session.uuid,
    lifecycle:'active',relationGroup:'review',relationLabel:'Needs review',identityCandidates:[{name:'Gunther',canonicalUuid:actor.uuid,kind:'character'}]};
  const view=analysisFor(w,[base]);
  assert.equal(view.attention[0].candidates.length,1);assert.equal(view.attention[0].candidates[0].uuid,actor.uuid);
  const independent=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact'}});
  const distinct=analysisFor(w,[{...base,identityCandidates:[...base.identityCandidates,{name:'Gunther',canonicalUuid:independent.uuid,kind:'contact'}]}]);
  assert.equal(distinct.attention[0].candidates.length,2);assert.equal(distinct.attention[0].hasRecommendation,false);
});

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
  for(const file of ['nlp-provider.js','campaign-link-semantic-mentions.js','campaign-identity-reconciliation.js','campaign-source-scoped-identity.js','campaign-deterministic-auto-link.js',
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

test('Stonecross complete identities win over source fragments and first-name references',async()=>{
  const w=world(stonecross);
  const snapshot=await w.scan();
  const names=snapshot.candidates.map(row=>row.text);
  for(const name of ['Arne','Baran','Citronimus','Gunther','Mara Venn','Hadrik Sol','Seren Holt','Pale Wardens','Order of the Silver Lantern','Stonecross Watch','Blackbridge','Stonecross','Fox and Lantern Inn','Old Bell Tower','Blackglass Key'])assert.ok(names.includes(name),name);
  for(const fragment of ['Mara','Hadrik','Seren','Fox','Lantern Inn','Silver Lantern','Lantern'])assert.ok(!names.includes(fragment),fragment);
  for(const name of ['Mara Venn','Hadrik Sol','Seren Holt'])assert.equal(snapshot.candidates.find(row=>row.text===name).classification.kind,'character');
  assert.ok(snapshot.candidates.find(row=>row.text==='Mara Venn').mentions.some(row=>row.text==='Mara'));
});

for(const [short,full,role] of [['Mara','Mara Venn','keeper'],['Seren','Seren Holt','merchant'],['Hadrik','Hadrik Sol','captain']]) {
  test(`Stonecross first-name ${short} resolves to one ${full} candidate`,async()=>{
    const w=world(`They met ${full}, a ${role}. ${short} spoke. ${short} left.`,false);
    const rows=(await w.scan()).candidates;
    assert.ok(!rows.some(row=>row.text===short));
    assert.equal(rows.filter(row=>row.text===full).length,1);
    assert.equal(rows.find(row=>row.text===full).mentions.length,3);
    const outcomes=await w.resolve();assert.equal(outcomes.find(row=>row.text===full).outcome,'CREATED');
  });
}

test('Stonecross overlapping spans consolidate, but an independent location/name fragment is retained',()=>{
  const w=world('',false);
  const raw=(text,start,context='They stayed at the Fox and Lantern Inn.')=>({text,normalized:text.toLowerCase(),start,end:start+text.length,tokenCount:text.split(' ').length,context,sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid});
  const grouped=w.api.campaignNewEntityDiscovery.consolidate([raw('Fox and Lantern Inn',0),raw('Fox',0),raw('Lantern Inn',8),raw('Fox',55,'Fox spoke.')]);
  assert.equal(grouped.length,2);
  assert.equal(grouped.find(row=>row.text==='Fox and Lantern Inn').occurrences.length,3);
  assert.equal(grouped.find(row=>row.text==='Fox').occurrences[0].start,55);
  assert.equal(grouped.find(row=>row.text==='Fox and Lantern Inn').occurrences.filter(row=>row.consolidationReason==='SUBSUMED_BY_STRONGER_MENTION').length,2);
});

test('Stonecross ambiguous first names remain REVIEW, and known independent short-name identities are preserved',async()=>{
  const w=world('They met Mara Venn, a keeper. They met Mara Holt, a merchant. Mara spoke.',false);
  const rows=await w.resolve();
  assert.equal(rows.find(row=>row.text==='Mara').outcome,'REVIEW');
  assert.ok(rows.some(row=>row.text==='Mara Venn'));assert.ok(rows.some(row=>row.text==='Mara Holt'));
  const other=world('They met Mara Venn, a keeper. Mara spoke.',false);other.add('Mara','Actor');
  assert.ok((await other.scan()).candidates.some(row=>row.text==='Mara'));
});

test('Stonecross source references are not merged across pages/sources or before the full name',async()=>{
  const w=world('Mara spoke. They met Mara Venn, a keeper.',false);
  assert.ok((await w.scan()).candidates.some(row=>row.text==='Mara'));
  const raw=[{text:'Mara Venn',normalized:'mara venn',start:0,end:9,tokenCount:2,context:'They met Mara Venn, a keeper.',sourceJournalUuid:'JournalEntry.a',sourcePageUuid:'page.a'},
    {text:'Mara',normalized:'mara',start:50,end:54,tokenCount:1,context:'Mara spoke.',sourceJournalUuid:'JournalEntry.b',sourcePageUuid:'page.b'}];
  assert.equal(w.api.campaignNewEntityDiscovery.consolidate(raw).length,2);
});

for(const [text,kind,name,targetKind] of [
  ['Order of the Silver Lantern','faction','Silver Key','item'],
  ['Lantern Inn','location','Lantern','item'],
  ['Old Bell Tower','location','Session 3 — The Bell at Stonecross','lore'],
  ['Seren Holt','character','Seren Hills','location']
])test(`Stonecross rejects unsafe existing match ${text} / ${name}`,()=>{
  const w=world('',false);
  const doc=w.add(name,targetKind==='item'?'Item':'JournalEntry',{worldProfile:{category:targetKind},...(name.startsWith('Session')?{type:'session'}:{})});
  const target={name,kind:targetKind,canonicalUuid:doc.uuid};
  const match=w.api.campaignEntityCreation.assessExistingMatch({text,kind,sourceUuid:w.session.uuid,target});
  assert.equal(match.eligible,false);assert.equal(match.safe,false);
});

test('Stonecross exact normalized full name and explicit known alias still LINK to existing identity',async()=>{
  const w=world('Mara Venn spoke. The Nightkeeper arrived.',false);
  const actor=w.add('Mára Venn','Actor',{actorProfile:{facts:[{label:'Known as',value:'The Nightkeeper'}]}});
  const exact=w.api.campaignEntityCreation.assessExistingMatch({text:'MARA VENN',kind:'contact',target:{name:actor.name,canonicalUuid:actor.uuid,kind:'character'}});
  assert.equal(exact.safe,true);
  const outcomes=await w.resolve();
  for(const name of ['Mara Venn','Nightkeeper'])assert.equal(outcomes.find(row=>row.text===name)?.targetUuid,actor.uuid,name);
});

test('Stonecross exact duplicate and distinctive Blackbridge ambiguity remain REVIEW',async()=>{
  const w=world('Mara Venn spoke. Blackbridge fell silent.',false);
  w.add('Mara Venn','Actor');w.add('Mara Venn','Actor');
  w.add('Blackbridge Watch','JournalEntry',{worldProfile:{category:'location'}});
  w.add('Blackbridge Crossing','JournalEntry',{worldProfile:{category:'location'}});
  const outcomes=await w.resolve();
  for(const name of ['Mara Venn','Blackbridge'])assert.equal(outcomes.find(row=>row.text===name).outcome,'REVIEW');
  assert.equal(outcomes.find(row=>row.text==='Blackbridge').identityCandidates.length,2);
});

test('Stonecross semantic resolver rejects weak token overlap even with contextual boosts',()=>{
  const w=world('',false);
  const item=w.add('Silver Key','Item');
  const lantern=w.add('Lantern','JournalEntry',{worldProfile:{category:'location'}});
  for(const [text,kind] of [['Order of the Silver Lantern','faction'],['Lantern Inn','location']]) {
    const resolution=w.api.campaignMentions.resolve({text,kindHint:kind,context:{relatedUuids:[item.uuid,lantern.uuid],attributes:{location:'Stonecross',faction:'Wardens'}}});
    assert.equal(resolution.selectedTarget,null);assert.equal(resolution.candidates.length,0);
  }
});

test('Stonecross no valid consolidated candidate disappears and Seren intent remains uncertain',async()=>{
  const w=world(stonecross);
  w.add('Silver Key','Item');w.add('Lantern','JournalEntry',{worldProfile:{category:'location'}});
  const discovered=(await w.scan()).candidates;
  const outcomes=await w.api.campaignEntityCreation.resolveCandidates(discovered);
  assert.equal(outcomes.length,discovered.length);
  assert.ok(outcomes.every(row=>['LINKED','CREATED','REVIEW'].includes(row.outcome)));
  for(const name of ['Mara Venn','Hadrik Sol','Seren Holt','Fox and Lantern Inn','Order of the Silver Lantern','Old Bell Tower','Blackglass Key'])assert.equal(outcomes.find(row=>row.text===name)?.outcome,'CREATED',name);
  const seren=w.game.journal.contents.find(doc=>doc.name==='Seren Holt');
  assert.equal(seren.getFlag('','worldProfile').category,'contact');
  assert.ok(!(seren.getFlag('','worldProfile').facts||[]).some(fact=>/^(enemy|hostile|intention)$/i.test(fact.label)));
});

test('Stonecross Memory consolidates semantic fragments, keeps raw diagnostics and does not resurrect reviews after reload',async()=>{
  const w=world(stonecross);
  const fox=w.add('Fox','Actor');const lantern=w.add('Lantern','Item');
  const sourceText=stonecross.replace(/\s+/g,' ').trim();
  const phraseStart=sourceText.indexOf('Fox and Lantern Inn');
  const mentions=[['Fox',phraseStart,fox],['Lantern',phraseStart+8,lantern],['Mara',sourceText.indexOf('Mara is'),null],['Seren',sourceText.indexOf('Seren was'),null]].map(([text,start,doc])=>({
    text,sourceKind:'session',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceName:w.session.name,pageName:w.page.name,
    source:{uuid:w.session.uuid,pageUuid:w.page.uuid,start,end:start+text.length},
    resolution:{decision:'review',selectedTarget:doc?{name:doc.name,canonicalUuid:doc.uuid,kind:doc.documentName==='Item'?'item':'character'}:null,candidates:[]}
  }));
  w.api.campaignMentionDiscovery.snapshot=()=>({mentions});
  const check=(ledger)=>{
    const active=ledger.records.filter(row=>row.active);
    for(const fragment of ['Fox','Lantern','Mara','Seren'])assert.ok(!active.some(row=>row.mentionText===fragment),fragment);
    assert.ok(active.some(row=>row.mentionText==='Fox and Lantern Inn'&&row.outcome==='CREATED'));
    assert.ok(active.some(row=>row.provenance.some(origin=>origin.provider==='campaign-candidate-consolidation'&&origin.rawText==='Fox')));
    assert.ok(w.api.campaignNewEntityDiscovery.snapshot().diagnostics.some(row=>row.text==='Mara'&&row.status==='UNIQUE_SOURCE_FIRST_NAME_REFERENCE'));
  };
  check(await w.api.campaignMentionEvidence.sync());
  const count=w.game.journal.contents.length;
  check(await w.api.campaignMentionEvidence.sync());assert.equal(w.game.journal.contents.length,count);
  const persisted=w.storage.get('campaignMentionEvidenceV1');
  vm.runInContext(`{ ${fs.readFileSync(path.join(root,'scripts/campaign-mention-evidence.js'),'utf8')} atMeAttach(); }`,w.context);
  w.storage.set('campaignMentionEvidenceV1',persisted);
  check(await w.api.campaignMentionEvidence.sync());assert.equal(w.game.journal.contents.length,count);
});

test('Stonecross Session and Quest share consolidated resolution and preserve canonical party/NPC presentation',async()=>{
  for(const kind of ['session','quest']) {
    const w=world(stonecross);
    w.session.flags.type=kind;w.session.name='QA Session 3 — The Bell at Stonecross';
    for(const actor of w.game.actors.contents)actor.flags.groupMember=actor.name!=='Gunther';
    const gunther=w.game.actors.contents.find(doc=>doc.name==='Gunther');
    w.add('Gunther','JournalEntry',{worldProfile:{category:'npc',actorId:gunther.id}});
    const details=narrativeDetails(w);
    const outcomes=await w.resolve();
    for(const name of ['Arne','Baran','Citronimus','Gunther'])assert.equal(outcomes.find(row=>row.text===name).outcome,'LINKED',`${kind}: ${name}`);
    assert.ok(!outcomes.some(row=>['Mara','Seren','Fox','Lantern Inn'].includes(row.text)));
    const view=details(kind);
    assert.deepEqual(Array.from(view.actorLinks,row=>row.name).sort(),['Arne','Baran','Citronimus']);
    assert.equal(view.worldLinks.filter(row=>row.name==='Gunther').length,1);
    const count=w.game.journal.contents.length;
    await w.api.campaignMentionEvidence.sync();await w.resolve();
    assert.equal(w.game.journal.contents.length,count);
  }
});

test('Stonecross Analysis rejects legacy weak recommendations and displays no-safe-match fallback',()=>{
  const w=world('',false);
  const item=w.add('Silver Key','Item');
  const target={name:item.name,canonicalUuid:item.uuid,kind:'item'};
  const rawMention={text:'Order of the Silver Lantern',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,
    resolution:{selectedTarget:target,candidates:[{target,score:100}]}};
  w.api.campaignMentionDiscovery.snapshot=()=>({mentions:[rawMention]});
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.normalizeImportName=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  w.context.getActorProfile=()=>({});w.context.getWorldProfile=()=>({});w.context.resolveWorldActor=()=>null;w.context.WORLD_CATEGORIES={};
  vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld(')),w.context);
  w.context.memoryRows=[{mentionText:rawMention.text,targetName:item.name,targetKind:'faction',targetUuid:item.uuid,
    sourceUuid:w.session.uuid,sourcePageUuid:w.page.uuid,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review',snippet:rawMention.text}];
  const view=vm.runInContext('campaignAnalysisView({rows:memoryRows})',w.context);
  assert.equal(view.attention.length,1);assert.equal(view.attention[0].candidates.length,0);
  assert.equal(view.attention[0].hasRecommendation,false);assert.match(view.attention[0].recommendationText,/no safe existing match/);
  assert.equal(view.attention[0].canCreate,true,'a discarded stale match must not block explicit GM creation');
});

test('Stonecross explicit canonical references and conflicting contained identities are never subsumed',()=>{
  const w=world('',false);
  const location={text:'Fox and Lantern Inn',normalized:'fox and lantern inn',start:0,end:19,tokenCount:4,context:'They stayed at Fox and Lantern Inn.',canonicalUuid:'JournalEntry.inn'};
  const person={text:'Fox',normalized:'fox',start:0,end:3,tokenCount:1,context:location.context,canonicalUuid:'Actor.fox'};
  assert.equal(w.api.campaignNewEntityDiscovery.consolidate([location,person]).length,2);
  assert.equal(w.api.campaignNewEntityDiscovery.candidateForMention({mentionType:'explicit-link',text:'Fox'}),null);
});

test('Stonecross competing explicit aliases remain REVIEW rather than merging people',async()=>{
  const w=world('Nightkeeper spoke.',false);
  for(const name of ['Mara Venn','Seren Holt'])w.add(name,'Actor',{actorProfile:{facts:[{label:'Alias',value:'Nightkeeper'}]}});
  const row=(await w.resolve()).find(row=>row.text==='Nightkeeper');
  assert.equal(row.outcome,'REVIEW');assert.equal(row.identityCandidates.length,2);assert.equal(row.identityAmbiguous,true);
});

test('Stonecross existing-match diagnostics do not expose GM-only identities to players',()=>{
  const w=world('',false);w.add('Private Person','Actor');
  assert.equal(w.api.campaignEntityCreation.existingMatches({text:'Private Person',kind:'person'}).length,1);
  w.game.user.isGM=false;
  assert.equal(w.api.campaignEntityCreation.existingMatches({text:'Private Person',kind:'person'}).length,0);
});

test('Stonecross explicit UUID evidence and canonical authority take precedence over labels/categories',()=>{
  const w=world('',false);
  const actor=w.add('Mara Venn','Actor');
  const projection=w.add('The keeper','JournalEntry',{worldProfile:{category:'lore',actorId:actor.id}});
  const match=w.api.campaignEntityCreation.assessExistingMatch({text:'Nightkeeper',kind:'contact',target:{name:projection.name,canonicalUuid:projection.uuid,kind:'lore'},explicitUuid:actor.uuid});
  assert.equal(match.safe,true);assert.equal(match.authorityUuid,actor.uuid);
  const renamed=w.api.campaignEntityCreation.assessExistingMatch({text:'The keeper',kind:'contact',target:{name:projection.name,canonicalUuid:projection.uuid,kind:'lore'}});
  assert.equal(renamed.safe,true,'presentation category must not override proven Actor authority');
});

test('Stonecross Analysis preserves an explicit source-scoped GM identity choice',async()=>{
  const w=world('',false);const actor=w.add('Mara Venn','Actor');
  await w.api.campaignReviewLearning.chooseForSource({text:'Mara',sourceUuid:w.session.uuid,targetUuid:actor.uuid});
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  w.context.normalizeImportName=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  w.context.getActorProfile=()=>({});w.context.getWorldProfile=()=>({});w.context.resolveWorldActor=()=>null;w.context.WORLD_CATEGORIES={};
  vm.runInContext(main.slice(main.indexOf('function campaignDecisionCandidateMeta('),main.indexOf('function campaignMentionHistoryForWorld(')),w.context);
  w.context.memoryRows=[{mentionText:'Mara',targetName:actor.name,targetKind:'character',targetUuid:actor.uuid,sourceUuid:w.session.uuid,
    sourcePageUuid:w.page.uuid,lifecycle:'active',relationGroup:'review',relationLabel:'Needs review',snippet:'Mara spoke.'}];
  const view=vm.runInContext('campaignAnalysisView({rows:memoryRows})',w.context);
  assert.equal(view.attention[0].candidates.length,1);assert.equal(view.attention[0].recommended.uuid,actor.uuid);
});

test('Stonecross conflicting source first names stay REVIEW even when one existing person owns the short alias',async()=>{
  const w=world('They met Mara Venn, a keeper. They met Mara Holt, a merchant. Mara spoke.',false);
  const actor=w.add('Mara Venn','Actor',{actorProfile:{facts:[{label:'Alias',value:'Mara'}]}});
  const row=(await w.resolve()).find(row=>row.text==='Mara');
  assert.equal(row.ambiguousSourceReference,true);assert.equal(row.identityAmbiguous,true);assert.equal(row.outcome,'REVIEW');
  await w.api.campaignReviewLearning.chooseForSource({text:'Mara',sourceUuid:w.session.uuid,targetUuid:actor.uuid});
  assert.equal((await w.resolve()).find(row=>row.text==='Mara').outcome,'LINKED','an explicit source choice can resolve the ambiguity');
});

test('Stonecross automatic link scan consumes complete candidates instead of linking raw Fox/Lantern fragments',async()=>{
  const text='They stayed at the Fox and Lantern Inn.';
  const w=world(text,false);const fox=w.add('Fox','Actor');const lantern=w.add('Lantern','Item');
  const inn=w.add('Fox and Lantern Inn','JournalEntry',{worldProfile:{category:'location'}});
  const readLinks=realCampaignLinks(w);
  const mentions=[['Fox',fox],['Lantern',lantern]].map(([name,doc])=>({text:name,sourceKind:'session',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,
    source:{uuid:w.session.uuid,pageUuid:w.page.uuid,start:text.indexOf(name),end:text.indexOf(name)+name.length},
    resolution:{selectedTarget:{name,canonicalUuid:doc.uuid,kind:doc.documentName==='Actor'?'character':'item'}}}));
  w.api.campaignMentionDiscovery.snapshot=()=>({mentions});
  const result=await w.api.campaignDeterministicAutoLink.scan();
  assert.ok(result.results.every(row=>row.targetUuid===inn.uuid));
  assert.equal(readLinks().actors.length,0);assert.deepEqual(Array.from(readLinks().world),[inn.id]);
});

test('Stonecross automatic link scan preserves ambiguity of a short reference between two source people',async()=>{
  const text='They met Mara Venn, a keeper. They met Mara Holt, a merchant. Mara spoke.';
  const w=world(text,false);const actor=w.add('Mara','Actor');
  const start=text.lastIndexOf('Mara');
  w.api.campaignMentionDiscovery.snapshot=()=>({mentions:[{text:'Mara',sourceJournalUuid:w.session.uuid,sourcePageUuid:w.page.uuid,
    source:{uuid:w.session.uuid,pageUuid:w.page.uuid,start,end:start+4},resolution:{selectedTarget:{name:'Mara',canonicalUuid:actor.uuid,kind:'character'}}}]});
  const result=await w.api.campaignDeterministicAutoLink.scan();
  assert.equal(result.results[0].decision,'ambiguous');assert.equal(w.links.size,0);
});
