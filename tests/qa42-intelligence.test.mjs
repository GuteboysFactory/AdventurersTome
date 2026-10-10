import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {world} from './helpers/tome-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
function setup() {
  const w=world('',false);w.page.testUserPermission=()=>true;
  const a=w.add('Rhea North','Actor'),b=w.add('Dorian West','Actor');
  const location=w.add('North Observatory','JournalEntry',{worldProfile:{category:'location'}});
  const organization=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  const item=w.add('Silver Compass','Item'),quest=w.add('Find the Observatory','JournalEntry',{type:'quest'});
  const ei=w.api.entityIntelligence,re=w.api.campaignRelationshipEvidence;
  const assertion=(subject=a,object=b,extra={})=>({subjectUuid:subject.uuid,objectUuid:object.uuid,relationType:'KNOWS',
    sourceUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceKind:'session',sourceExcerpt:'Source assertion',certainty:'asserted',polarity:'positive',temporalScope:'current',...extra});
  return {...w,a,b,location,organization,item,quest,ei,re,assertion};
}
const entries=model=>model.connectionGroups.flatMap(group=>group.entries);
const linked=model=>model.linkGroups.flatMap(group=>group.entries);
function publicSource(w) {w.session.flags.campaignEntityLinksV1={actorUuids:[w.a.uuid],entityUuids:[w.organization.uuid]};}
function app(start={activeTab:'profile',activeActorId:'first'}) {
  return {state:structuredClone(start),_navigationHistory:[],renders:0,
    _captureNavigationState(){return structuredClone(this.state);},
    _pushNavigationState(){this._navigationHistory.push(this._captureNavigationState());},
    _restoreNavigationState(state){this.state=state;},
    async _openRefKey(ref){this.state={ref};return true;},async render(){this.renders++;},
    back(){this._restoreNavigationState(this._navigationHistory.pop());}};
}
test('Canonical relationship projects forward and inverse backlinks',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion(w.a,w.organization,{relationType:'SERVES'})]);
  assert.equal(entries(w.ei.profile(w.a.uuid))[0].otherUuid,w.organization.uuid);
  const reverse=entries(w.ei.profile(w.organization.uuid))[0];assert.equal(reverse.otherUuid,w.a.uuid);assert.equal(reverse.reverse,true);assert.equal(reverse.state,'current');
});
for(const [input,state,bucket] of [
  [{},'current','current'],[{temporalScope:'historical'},'historical','historical'],
  [{certainty:'possible'},'possible','uncertain'],[{polarity:'negative'},'negative','negated'],
  [{temporalScope:'unknown'},'unknown','uncertain'],[{certainty:'disputed'},'conflicting','uncertain']]) {
  test(`Intelligence preserves ${state} state and grouping`,async()=>{
    const w=setup();await w.re.ingest('generic',[w.assertion(w.a,w.b,input)]);
    const model=w.ei.profile(w.a.uuid),row=entries(model)[0];assert.equal(row.state,state);assert.equal(model.connectionGroups[0].key,bucket);
    assert.equal(row.active,state==='current');assert.ok(row.stateLabel);
    assert.equal(entries(w.ei.profile(w.b.uuid))[0].state,state);
  });
}
test('Conflicting positive and negative evidence never becomes active',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion(),w.assertion(w.a,w.b,{polarity:'negative',sourceExcerpt:'Denied assertion'})]);
  const row=entries(w.ei.profile(w.a.uuid))[0];assert.equal(row.state,'conflicting');assert.equal(row.active,false);assert.equal(row.evidenceCount,2);
});
test('Why connected retains excerpts, provenance, source UUID and assertion spans',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion(w.a,w.b,{sourceSpan:{start:4,end:20,text:'Source assertion'},chronology:{sessionNumber:2}})]);
  const row=entries(w.ei.profile(w.a.uuid))[0];assert.equal(row.latest.sourceUuid,w.session.uuid);assert.equal(row.history[0].sourceExcerpt,'Source assertion');
  assert.equal(row.history[0].sourceSpan.start,4);assert.equal(row.history[0].provenanceLabel,'generic');assert.equal(row.evidenceCount,1);
});
test('Open Source opens the exact canonical page',async()=>{
  const w=setup();let options;w.session.sheet={render:(_force,opts)=>{options=opts;}};
  const result=await w.ei.open(w.session.uuid,app(),{pageUuid:w.page.uuid});assert.equal(result.uuid,w.page.uuid);assert.equal(options.pageId,w.page.id);
});
test('Source without a page opens the correct Session in Tome',async()=>{
  const w=setup(),tome=app();assert.equal((await w.ei.open(w.session.uuid,tome)).status,'opened');assert.equal(tome.state.ref,`session:${w.session.id}`);
});
test('Deleted page is explicit and does not silently fall back to another page',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);w.session.pages.contents=[];w.session.pages.get=()=>null;w.ei.invalidate();
  assert.equal(entries(w.ei.profile(w.a.uuid))[0].history[0].sourceMissing,true);
  assert.equal((await w.ei.open(w.session.uuid,app(),{pageUuid:w.page.uuid})).status,'missing');
});
test('Deleted source retains GM provenance and exposes a missing status',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);w.game.journal.contents=w.game.journal.contents.filter(doc=>doc!==w.session);w.ei.invalidate();
  assert.equal(entries(w.ei.profile(w.a.uuid))[0].history[0].sourceMissing,true);assert.equal(entries(w.ei.profile(w.a.uuid))[0].state,'historical');assert.equal(w.ei.resolve(w.session.uuid).status,'missing');
});
for(const category of ['session','quest','location','organization','item'])test(`${category} canonical campaign backlinks`,()=>{
  const w=setup(),target=category==='session'?w.session:w[category];
  w.a.flags.campaignEntityLinksV1={entityUuids:[target.uuid]};
  assert.ok(linked(w.ei.profile(w.a.uuid)).some(row=>row.uuid===target.uuid));
  assert.ok(linked(w.ei.profile(target.uuid)).some(row=>row.uuid===w.a.uuid));
});
for(const [left,right] of [['a','b'],['a','location'],['a','organization'],['item','session'],['quest','location']])test(`${left} ↔ ${right} works with generic Foundry entities`,async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion(w[left],w[right])]);
  assert.equal(entries(w.ei.profile(w[left].uuid))[0].otherUuid,w[right].uuid);
  assert.equal(entries(w.ei.profile(w[right].uuid))[0].otherUuid,w[left].uuid);
});
test('No-adapter mode provides relationships, appearances and navigation',async()=>{
  const w=setup();assert.equal(w.api.systemAdapter,undefined);await w.re.ingest('generic',[w.assertion(w.a,w.location)]);
  const model=w.ei.profile(w.a.uuid);assert.equal(model.relationshipCount,1);assert.equal(model.appearanceGroups[0].entries[0].uuid,w.session.uuid);
  assert.equal((await w.ei.open(w.location.uuid,app())).status,'opened');
});
for(const system of ['realm-guard','genesys','generic-mock'])test(`${system} optional presentation leaves graph unchanged`,async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);const before=w.ei.profile(w.a.uuid);
  w.ei.registerEnricher(({entity})=>({label:`${system} rank for ${entity.name}`}));const after=w.ei.profile(w.a.uuid);
  assert.deepEqual(after.connectionGroups,before.connectionGroups);assert.match(after.enrichment.label,new RegExp(system));
});
test('Throwing or asynchronous adapter fails safely',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);
  for(const provider of [()=>{throw Error('Adapter failure');},()=>Promise.reject(Error('Adapter failure'))]){
    w.ei.registerEnricher(provider);const model=w.ei.profile(w.a.uuid);assert.equal(model.relationshipCount,1);assert.equal(model.enrichment,null);
  }
});
test('Enrichment cannot mutate graph evidence or identity',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);w.ei.registerEnricher(model=>{model.entity.uuid='wrong';model.relationships[0].state='current';model.relationships.length=0;return {label:'Rank'};});
  assert.equal(w.ei.profile(w.a.uuid).relationshipCount,1);assert.equal(w.ei.profile(w.a.uuid).entity.uuid,w.a.uuid);assert.equal(w.re.snapshot().evidence.length,1);
});
test('Rename and folder move keep UUID identity and update displayed name',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);w.ei.profile(w.a.uuid);w.b.name='Renamed person';w.b.folder={id:'new-folder'};w.context.Hooks.callAll('updateActor',w.b);
  const row=entries(w.ei.profile(w.a.uuid))[0];assert.equal(row.name,'Renamed person');assert.equal(row.otherUuid,w.b.uuid);
});
test('Same-name entities are never merged by intelligence',async()=>{
  const w=setup(),other=w.add(w.b.name,'Actor');await w.re.ingest('generic',[w.assertion(),w.assertion(w.a,other)]);
  assert.equal(entries(w.ei.profile(w.a.uuid)).length,2);assert.equal(new Set(entries(w.ei.profile(w.a.uuid)).map(row=>row.otherUuid)).size,2);
});
test('Reload rebuilds the projection from persisted qa.41 evidence',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);const before=w.ei.profile(w.a.uuid);
  w.reload('campaign-entity-intelligence.js');assert.deepEqual(w.api.entityIntelligence.profile(w.a.uuid),before);
});
test('Reanalysis and repeated projection do not duplicate evidence or backlinks',async()=>{
  const w=setup();for(let i=0;i<3;i++){await w.re.ingest('generic',[w.assertion()]);assert.equal(w.ei.profile(w.a.uuid).relationshipCount,1);}
  assert.equal(w.re.snapshot().evidence.length,1);assert.equal(linked(w.ei.profile(w.session.uuid)).length,2);
});
test('Player derives only from visible prose and never reads GM ledger',async()=>{
  const w=setup();publicSource(w);w.page.text.content='Rhea North currently serves Copper Circle.';
  w.game.user={id:'player',isGM:false};w.game.settings.get=()=>{throw Error('Private ledger read');};w.ei.invalidate();
  const rows=entries(w.ei.profile(w.a.uuid));assert.equal(rows.length,1);assert.equal(rows[0].otherUuid,w.organization.uuid);
});
test('GM-private source cannot leak counts, groups, names or suggestions',async()=>{
  const w=setup();w.page.text.content='Rhea North currently serves Copper Circle.';w.session.testUserPermission=()=>false;
  w.session.flags.campaignEntityLinksV1={actorUuids:[w.a.uuid],entityUuids:[w.organization.uuid]};w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.a.uuid);assert.equal(model.relationshipCount,0);assert.equal(model.connectionGroups.length,0);assert.equal(model.appearanceGroups.length,0);assert.equal(model.linkGroups.length,0);
  assert.ok(!JSON.stringify(model).includes('Copper Circle'));
});
test('Private endpoint and page evidence are excluded before graph projection',()=>{
  const w=setup();publicSource(w);w.page.text.content='Rhea North currently serves Copper Circle.';w.organization.testUserPermission=()=>false;w.game.user={id:'player',isGM:false};
  assert.equal(w.ei.profile(w.a.uuid).relationshipCount,0);w.organization.testUserPermission=()=>true;w.page.testUserPermission=()=>false;w.ei.invalidate();
  assert.equal(w.ei.profile(w.a.uuid).relationshipCount,0);assert.equal(w.ei.resolve(w.page.uuid).status,'unavailable');
});
test('Permission revocation invalidates a warm cache',async()=>{
  const w=setup();publicSource(w);w.page.text.content='Rhea North currently serves Copper Circle.';w.game.user={id:'player',isGM:false};assert.equal(w.ei.profile(w.a.uuid).relationshipCount,1);
  w.session.flags.access={visibility:'gm'};w.context.Hooks.callAll('updateJournalEntry',w.session);assert.equal(w.ei.profile(w.a.uuid).relationshipCount,0);
});
test('Back restores the previous Tome profile through reverse graph navigation',async()=>{
  const w=setup(),tome=app({ref:`actor:${w.a.id}`});await w.ei.open(w.organization.uuid,tome);assert.equal(tome.state.ref,`world:${w.organization.id}`);
  await w.ei.open(w.a.uuid,tome);tome.back();assert.equal(tome.state.ref,`world:${w.organization.id}`);tome.back();assert.equal(tome.state.ref,`actor:${w.a.id}`);
});
test('Items and Scenes use generic Tome context and preserve Back state',async()=>{
  const w=setup(),tome=app();await w.ei.open(w.item.uuid,tome);assert.equal(tome.activeTab,'entityContext');assert.equal(tome.activeContextUuid,w.item.uuid);assert.equal(tome.renders,1);assert.equal(tome._navigationHistory.length,1);
  const scene={id:'scene',uuid:'Scene.scene',name:'Generic scene',documentName:'Scene',testUserPermission:()=>true};w.game.scenes={contents:[scene],get:id=>id===scene.id?scene:null};
  assert.equal(w.ei.profile(scene.uuid).entity.category,'scene');assert.equal((await w.ei.open(scene.uuid,tome)).status,'opened');
});
test('Large campaign builds once, uses adjacency and never triggers render loops',async()=>{
  const w=setup(),assertions=[];for(let i=0;i<220;i++){const doc=w.add(`Generic entity ${i}`,'Actor');assertions.push(w.assertion(w.a,doc));}
  await w.re.ingest('generic',assertions);let graphCalls=0;const graph=w.re.graph;w.api.campaignRelationshipEvidence={...w.re,graph:()=>{graphCalls++;return graph();}};
  for(let i=0;i<50;i++)assert.equal(w.ei.profile(w.a.uuid).relationshipCount,220);
  assert.equal(graphCalls,1);assert.equal(w.ei.diagnostics().builds,1);w.ei.invalidate();w.ei.profile(w.a.uuid);assert.equal(graphCalls,2);
});
test('Future semantic category works without a system or Actor type',()=>{
  const w=setup();w.item.flags.entityCategory='artifact';w.a.flags.campaignEntityLinksV1={entityUuids:[w.item.uuid]};assert.equal(linked(w.ei.profile(w.a.uuid))[0].category,'artifact');
});
test('Production intelligence contains no campaign or system dependency',()=>{
  const code=fs.readFileSync(path.join(root,'scripts/campaign-entity-intelligence.js'),'utf8');
  assert.doesNotMatch(code,/\b(?:Gunther|Elira|Mara|Toren|Pale Wardens|Blackbridge|Stonecross|realm-guard|genesys)\b/i);
  assert.doesNotMatch(code,/game\.system|settings\.set|JournalEntry\.create|Actor\.create/);
});
test('Context navigation UI preserves Chronicle cleanup and progressive disclosure',()=>{
  const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');assert.doesNotMatch(template,/Chronicle excerpt|\{\{selectedSession.bodyPreview\}\}/);
  for(const label of ['Why connected?','Relationship history / sources','Related','Appears in'])assert.ok(template.includes(label));
  assert.match(template,/data-action="openContextEntity" data-target-uuid/);assert.match(template,/Source or source page missing/);
});
test('Plural production flags and World category route canonically without an adapter',async()=>{
  const w=setup();w.session.flags.type='sessions';w.quest.flags.type='quests';w.organization.flags.type='world';
  const tome=app();await w.ei.open(w.session.uuid,tome);assert.equal(tome.state.ref,`session:${w.session.id}`);
  await w.ei.open(w.quest.uuid,tome);assert.equal(tome.state.ref,`quest:${w.quest.id}`);
  assert.equal(w.ei.profile(w.organization.uuid).entity.category,'organization');
});
test('Folder-classified Session retains canonical source navigation',async()=>{
  const w=setup();delete w.session.flags.type;w.session.folder={id:'sessions',name:'Sessions'};const tome=app();
  await w.ei.open(w.session.uuid,tome);assert.equal(tome.state.ref,`session:${w.session.id}`);
});
test('Proven Contact projection and Actor share one profile and backlink identity',async()=>{
  const w=setup(),projection=w.add('Presented person','JournalEntry',{worldProfile:{category:'contact',actorId:w.a.id}});
  w.session.flags.campaignEntityLinksV1={actorUuids:[w.a.uuid],entityUuids:[projection.uuid]};
  await w.re.ingest('generic',[w.assertion(w.a,w.b)]);
  assert.equal(w.ei.profile(projection.uuid).entity.uuid,w.a.uuid);assert.equal(w.ei.profile(projection.uuid).relationshipCount,1);
  assert.equal(linked(w.ei.profile(w.session.uuid)).filter(row=>row.uuid===w.a.uuid).length,1);
  const tome=app();await w.ei.open(projection.uuid,tome);assert.equal(tome.state.ref,`actor:${w.a.id}`);
});
test('Canonical link changes rebuild a warm cache through the real hook',()=>{
  const w=setup();assert.equal(linked(w.ei.profile(w.a.uuid)).length,0);w.session.flags.campaignEntityLinksV1={actorUuids:[w.a.uuid]};
  w.context.Hooks.callAll('adventurersTomeCampaignEntityLinkChanged');assert.equal(linked(w.ei.profile(w.a.uuid))[0].uuid,w.session.uuid);
});
test('Returned models are detached and cannot contaminate subsequent projection',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);const model=w.ei.profile(w.a.uuid);entries(model)[0].state='fabricated';entries(model)[0].history.length=0;
  assert.equal(entries(w.ei.profile(w.a.uuid))[0].state,'current');assert.equal(entries(w.ei.profile(w.a.uuid))[0].history.length,1);
});
test('Malformed legacy links fail safely without breaking generic intelligence',()=>{
  const w=setup();w.a.flags.links={actors:'not-an-array',world:{bad:true}};w.a.flags.campaignEntityLinksV1={entityUuids:'invalid'};assert.equal(w.ei.profile(w.a.uuid).available,true);
});
test('Inverse Why connected history preserves inverse predicate and negative state',async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion(w.a,w.b,{relationType:'OWES_FAVOUR_TO',polarity:'negative'})]);
  const forward=entries(w.ei.profile(w.a.uuid))[0],reverse=entries(w.ei.profile(w.b.uuid))[0];
  assert.notEqual(forward.history[0].label,reverse.history[0].label);assert.equal(reverse.history[0].stateLabel,'Denied / negated');
});
test('Future Foundry document category participates without adapter-specific resolution',async()=>{
  const w=setup();const future={id:'table',uuid:'RollTable.table',name:'Generic narrative table',documentName:'RollTable',
    getFlag:(_id,key)=>key==='entityCategory'?'narrative':key==='campaignEntityLinksV1'?{entityUuids:[w.location.uuid]}:undefined,testUserPermission:()=>true};
  w.docs.set(future.uuid,future);w.context.fromUuidSync=uuid=>w.docs.get(uuid)||null;w.game.collections=new Map([['RollTable',{contents:[future]}]]);
  await w.re.ingest('generic',[w.assertion(w.a,future)]);
  assert.equal(entries(w.ei.profile(w.a.uuid))[0].otherUuid,future.uuid);assert.equal(entries(w.ei.profile(future.uuid))[0].otherUuid,w.a.uuid);
  assert.ok(linked(w.ei.profile(w.location.uuid)).some(row=>row.uuid===future.uuid));assert.equal((await w.ei.open(future.uuid,app())).status,'opened');
});
test('Mixed private-page Journal flags cannot leak private associations through public counts',()=>{
  const w=setup();publicSource(w);w.page.testUserPermission=()=>false;w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.a.uuid);assert.equal(model.relationshipCount,0);assert.equal(model.linkGroups.length,0);assert.equal(model.appearanceGroups.length,0);
});
test('Mixed pages retain only independently visible relationship evidence',()=>{
  const w=setup();publicSource(w);w.page.text.content='Rhea North currently serves Copper Circle.';
  const privatePage={id:'hidden',uuid:`${w.session.uuid}.JournalEntryPage.hidden`,parent:w.session,text:{content:'Private association'},testUserPermission:()=>false};
  w.session.pages.contents.push(privatePage);w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.a.uuid);assert.equal(model.relationshipCount,1);assert.equal(entries(model)[0].otherUuid,w.organization.uuid);assert.equal(model.linkGroups.length,0);
});
for(const [text,state] of [
  ['Rhea North recognized Dorian West from an earlier journey.','unknown'],['Rhea North formerly served Copper Circle.','historical'],
  ['Rhea North may currently serve Copper Circle.','possible'],['Rhea North is not a member of Copper Circle.','negative']])test(`Player-visible ${state} evidence retains its semantics`,()=>{
  const w=setup();publicSource(w);w.session.flags.campaignEntityLinksV1.actorUuids.push(w.b.uuid);w.page.text.content=text;w.game.user={id:'player',isGM:false};
  const row=entries(w.ei.profile(w.a.uuid))[0];assert.ok(row);assert.equal(row.state,state);assert.equal(row.active,false);
});
test('Navigation/render failure is explicit and rolls back Tome history',async()=>{
  const w=setup(),tome=app({ref:'actor:previous'});tome._openRefKey=async()=>{tome.state={ref:'broken'};throw Error('Render failed');};
  assert.equal((await w.ei.open(w.a.uuid,tome)).status,'unavailable');assert.equal(tome.state.ref,'actor:previous');assert.equal(tome._navigationHistory.length,0);
  w.session.sheet={render:async()=>{throw Error('Sheet failed');}};
  assert.equal((await w.ei.open(w.session.uuid,tome,{pageUuid:w.page.uuid})).status,'unavailable');
});
test('Embedded Item UUID resolves to the Item, never to its parent Actor',async()=>{
  const w=setup(),item={id:'inventory',uuid:`${w.a.uuid}.Item.inventory`,name:'Owned compass',documentName:'Item',parent:w.a,testUserPermission:()=>true};
  w.docs.set(item.uuid,item);w.context.fromUuidSync=uuid=>w.docs.get(uuid)||null;
  const resolved=w.ei.resolve(item.uuid);assert.equal(resolved.uuid,item.uuid);assert.equal(resolved.document,item);
  await w.re.ingest('generic',[w.assertion(w.b,item)]);assert.equal(entries(w.ei.profile(w.b.uuid))[0].otherUuid,item.uuid);
});
test('Existing GM link editor mounts in derived context without creating a duplicate panel',()=>{
  const code=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const functionBody=code.slice(code.indexOf('function atCelManagerForActor('),code.indexOf('function atCelMount('));
  for(const isGM of [false,true]) {
    const appended=[],panel={dataset:{},append:entry=>appended.push(entry)};
    const main={querySelector:selector=>selector==='[data-at-ei-links]'?panel:null};
    const context=vm.createContext({game:{user:{isGM}},main,ctx:{actor:{id:'a'}},
      document:{createElement:()=>({dataset:{}})},atCelJournalLinksForActor:()=>({sessions:[],quests:[]}),atCelJournalOptions:()=>'',atCelWrapManualJournalLink:()=>{throw Error('No existing links');}});
    const result=vm.runInContext(functionBody+'\natCelManagerForActor(ctx,main);',context);
    assert.equal(result,panel);assert.equal(panel.dataset.atCelManager,'actor');assert.equal(appended.length,isGM?1:0);
  }
});
test('GM unlink control wraps the canonical UUID button in the grouped Campaign Links',()=>{
  const code=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const body=code.slice(code.indexOf('function atCelWrapManualJournalLink('),code.indexOf('function atCelManagerForActor('));
  const nodes=[],button={dataset:{targetUuid:'JournalEntry.s'},closest:()=>null,before:node=>nodes.push(node)};
  const panel={querySelectorAll:selector=>selector.includes('openContextEntity')?[button]:[]};
  const context=vm.createContext({panel,journal:{id:'s',uuid:'JournalEntry.s',name:'Session'},document:{createElement:()=>({dataset:{},children:[],append(child){this.children.push(child);}})}});
  assert.equal(vm.runInContext(body+'\natCelWrapManualJournalLink(panel,journal,"session");',context),true);
  assert.equal(nodes[0].children[0],button);assert.equal(nodes[0].children[1].dataset.atCelUnlinkJournal,'session:s');
});
for(const [system,file,id] of [
  ['realm-guard','world-system-adapter-realm-guard-semantic.js','realm-guard-semantic-reference'],
  ['genesys-vtt','world-system-adapter-genesys-registry.js','genesys-vtt-runtime-registry']])test(`Real ${system} adapter registration leaves Core graph and navigation independent`,async()=>{
  const w=setup();await w.re.ingest('generic',[w.assertion()]);const before=w.ei.profile(w.a.uuid);
  w.game.system={id:system};w.a.type='system-specific-actor-type';
  for(const script of ['world-system-adapters.js',file])vm.runInContext('{\n'+fs.readFileSync(path.join(root,'scripts',script),'utf8')+'\n}',w.context,{filename:script});
  w.api.adapters=w.context.AdventurersTomeSystemAdapters;
  assert.ok(w.api.adapters.list().includes(id));assert.deepEqual(w.ei.profile(w.a.uuid),before);
  assert.equal((await w.ei.open(w.b.uuid,app())).status,'opened');
});
test('Navigation preferences keep the cache warm; evidence settings invalidate it',()=>{
  const w=setup();w.ei.profile(w.a.uuid);const first=w.ei.diagnostics().builds;
  for(const key of ['windowState','recentRefs','lastActiveTab']){w.context.Hooks.callAll('updateSetting',{key:`adventurers-tome.${key}`});w.ei.profile(w.b.uuid);}
  assert.equal(w.ei.diagnostics().builds,first);
  w.context.Hooks.callAll('updateSetting',{key:'adventurers-tome.campaignRelationshipEvidenceV1'});w.ei.profile(w.a.uuid);assert.equal(w.ei.diagnostics().builds,first+1);
});
