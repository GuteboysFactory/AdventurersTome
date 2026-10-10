import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Handlebars from './helpers/vendor/handlebars-4.7.10.cjs';
import {world} from './helpers/tome-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
const partials=template.slice(0,template.indexOf('<div class="at-shell'));
const render=Handlebars.compile(template);
const renderContext=Handlebars.compile(partials+'{{> entityContext this}}');
const renderProfile=Handlebars.compile(partials+'{{> entityIntelligence this profileSurface=true}}');
const renderDefault=Handlebars.compile(partials+'{{> entityIntelligence this}}');
const code=fs.readFileSync(path.join(root,'scripts/campaign-entity-intelligence.js'),'utf8');
const project=vm.runInNewContext(code.slice(code.indexOf('const ATEI_CATEGORIES='),code.indexOf('function atEiDocument('))+
  code.slice(code.indexOf('function atEiGroups('),code.indexOf('function atEiProfile('))+'\natEiContext');
const row=(uuid,category,name=category)=>({uuid,category,name});
function model(category='organization') {
  const source=row('JournalEntry.source','session','Public Session'),person=row('Actor.person','person','Public person');
  const history={sourceUuid:source.uuid,sourcePageUuid:`${source.uuid}.JournalEntryPage.page`,sourceName:source.name,sourceExcerpt:'Public assertion',label:'Member',stateLabel:'Current',provenanceLabel:'Generic provider'};
  return {available:true,entity:{uuid:'JournalEntry.profile',name:'Profile',category},hasContext:true,
    relationships:[{name:person.name,otherUuid:person.uuid,label:'Member',stateLabel:'Current',evidenceCount:1,latest:history,history:[history]}],
    context:project([person],[source,person],[source])};
}
function fixture() {
  const w=world('',false);w.page.testUserPermission=()=>true;
  const person=w.add('Rhea North','Actor'),target=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  w.session.flags.campaignEntityLinksV1={actorUuids:[person.uuid],entityUuids:[target.uuid]};
  const claim={subjectUuid:person.uuid,objectUuid:target.uuid,relationType:'MEMBER_OF',sourceUuid:w.session.uuid,
    sourcePageUuid:w.page.uuid,sourceKind:'session',sourceExcerpt:'Source assertion',certainty:'asserted',polarity:'positive',temporalScope:'current'};
  return {...w,person,target,claim,ei:w.api.entityIntelligence,re:w.api.campaignRelationshipEvidence};
}
function session(intelligence) {
  return {id:'source',displayTitle:'Session title',summary:'Chronicle summary',intelligence,
    questLinks:[{id:'quest',name:'Quest target'}],worldLinks:[{id:'world',name:'World target'}],actorLinks:[{id:'actor',name:'Actor target'}],
    hasQuestLinks:true,hasWorldLinks:true,hasActorLinks:true,gmReviewCount:2,gmReviewSourceUuid:'JournalEntry.source'};
}
test('Shared composition requires explicit profile surface opt-in',()=>{
  assert.equal(renderDefault(model()).trim(),'');assert.match(renderProfile(model()),/<h2>Relationships<\/h2>/);
  assert.match(template,/\{\{#if profileSurface\}\}/);
});
for(const category of ['person','organization','location','item','narrative','scene','future-category'])test(`${category} generic profile opts in without adapter-specific type checks`,()=>{
  const html=renderProfile(model(category));assert.match(html,/<h2>Relationships<\/h2>/);assert.match(html,/<h2>Entity Context<\/h2>/);
});
test('Relationship Why connected and history remain independent and unchanged in composition',()=>{
  const html=renderProfile(model());assert.match(html,/Why connected\?/);assert.match(html,/Relationship history \/ sources/);
  assert.match(html,/Public person — Member/);assert.match(html,/Current · 1 evidence/);assert.match(html,/Generic provider/);
});
test('Context has compact Appears in Sessions and Related People chip groups',()=>{
  const html=renderContext(model());
  for(const label of ['Appears in','Sessions','Related','People / Characters / Contacts'])assert.ok(html.includes(label),label);
  assert.equal((html.match(/class="at-context-chip"/g)||[]).length,2);assert.ok(!html.includes('<details>'));
  assert.ok(!html.includes('Connection reasons'));assert.ok(!html.includes('Campaign links / Related'));
});
test('Duplicate sources still have one chip and multiple internal reasons',()=>{
  const m=model(),html=renderContext(m),source=m.context.rows.find(r=>r.uuid==='JournalEntry.source');
  assert.equal(html.split('data-at-context-uuid="JournalEntry.source"').length-1,1);
  assert.deepEqual(Array.from(source.reasons),['APPEARS_IN','CAMPAIGN_LINK']);assert.equal(source.reasonLabels.length,2);
});
test('Related merges relationship targets and remaining links into one category heading',()=>{
  const a=row('Actor.a','person','A'),b=row('Actor.b','person','B');
  const context=project([a],[b],[]),html=renderContext({available:true,context});
  assert.equal(context.navigationGroups.length,1);assert.equal(context.navigationGroups[0].entries.length,2);
  assert.equal((html.match(/People \/ Characters \/ Contacts/g)||[]).length,1);assert.equal((html.match(/at-context-chip/g)||[]).length,2);
});
test('Empty categories and empty diagnostic placeholders never render',()=>{
  const html=renderContext(model());for(const text of ['Organizations / Factions','Locations','Items','Quests','Scenes','No additional visible Campaign Links','No visible campaign context'])assert.ok(!html.includes(text),text);
});
test('Empty Context omits the entire panel while preserving Relationships',()=>{
  const m=model();m.context=project([],[],[]);const html=renderProfile(m);
  assert.match(html,/<h2>Relationships<\/h2>/);assert.ok(!html.includes('<h2>Entity Context</h2>'));assert.ok(!html.includes('Related'));
});
for(const isGM of [false,true])test(`Session detail stays clean even with a populated intelligence model (${isGM?'GM':'Player'})`,()=>{
  const html=render({isSessions:true,isGM,canGoBack:true,settings:{nav:{}},sessions:[],selectedSession:session(model())});
  assert.ok(!html.includes('<h2>Relationships</h2>'));assert.ok(!html.includes('<h2>Entity Context</h2>'));
  assert.ok(!html.includes('at-structured-relationships'));assert.ok(!html.includes('at-entity-intelligence'));
  for(const text of ['Quest links','World links','Character links','People, places & lore','Characters','Chronicle summary','Open Full Session','data-action="goBack"'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('Chronicle excerpt'));if(isGM)assert.ok(html.includes('GM review'));
});
for(const isGM of [false,true])test(`Quest keeps lightweight record/link UX without intelligence panels (${isGM?'GM':'Player'})`,()=>{
  const detail={...session(model()),name:'Quest title',bodyPreview:'Quest record',sessionLinks:[{id:'s',name:'Public Session'}],
    hasSessionLinks:true,hasObjectives:true,objectives:['Objective'],hasUpdates:true,updates:['Update'],linkedCount:3};
  const html=render({isQuestDetail:true,isGM,settings:{nav:{}},questDetail:detail});
  assert.ok(!html.includes('at-structured-relationships'));assert.ok(!html.includes('at-entity-intelligence'));
  for(const text of ['Quest Record','Campaign Links','Public Session','Objective','Update','Open Quest Journal','data-action="goBack"'])assert.ok(html.includes(text),text);
});
test('World profile retains Mentioned In alongside approved Relationships and compact Context',()=>{
  const html=render({isWorldProfile:true,isGM:true,settings:{nav:{}},worldProfileView:{name:'Profile',intelligence:model(),hasMentionHistory:true,activeMentionCount:1}});
  for(const text of ['Known Information','Facts','<h2>Relationships</h2>','<h2>Entity Context</h2>','<h2>Mentioned In</h2>'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('Connection reasons'));
});
test('Generic Item/Scene profile surface opts in and keeps Back',()=>{
  const html=render({settings:{nav:{}},entityContext:model('item')});assert.match(html,/<h2>Relationships<\/h2>/);
  assert.match(html,/<h2>Entity Context<\/h2>/);assert.match(html,/data-action="goBack"/);
});
test('Visible model and empty categories remain viewer-scoped after permission revocation',()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';w.game.user={id:'player',isGM:false};
  assert.equal(w.ei.profile(w.person.uuid).relationships.length,1);
  w.target.testUserPermission=()=>false;w.ei.invalidate();const m=w.ei.profile(w.person.uuid),html=renderProfile(m);
  assert.ok(!html.includes(w.target.name));assert.ok(!html.includes(w.target.uuid));assert.ok(!html.includes('Organizations / Factions'));
  assert.ok(!JSON.stringify(m.context).includes(w.target.uuid));
  w.session.testUserPermission=()=>false;w.ei.invalidate();assert.ok(!renderProfile(w.ei.profile(w.person.uuid)).includes('<h2>Entity Context</h2>'));
});
test('Profile simplification keeps canonical navigation, Back and exact Open Source',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim]);
  const app={state:{ref:'actor:start'},_navigationHistory:[],_captureNavigationState(){return {...this.state};},
    _pushNavigationState(){this._navigationHistory.push(this._captureNavigationState());},async _openRefKey(ref){this.state={ref};return true;}};
  assert.equal((await w.ei.open(w.target.uuid,app)).status,'opened');app.state=app._navigationHistory.pop();assert.equal(app.state.ref,'actor:start');
  let pageId;w.session.sheet={render:(_force,options)=>{pageId=options.pageId;}};
  assert.equal((await w.ei.open(w.session.uuid,app,{pageUuid:w.page.uuid})).status,'opened');assert.equal(pageId,w.page.id);
});
test('Reload/reanalysis and optional adapter preserve compact navigation and reason metadata',async()=>{
  const w=fixture();assert.equal(w.api.systemAdapter,undefined);for(let i=0;i<3;i++)await w.re.ingest('generic',[w.claim]);
  const before=renderContext(w.ei.profile(w.person.uuid));w.reload('campaign-entity-intelligence.js');w.ei=w.api.entityIntelligence;
  assert.equal(renderContext(w.ei.profile(w.person.uuid)),before);
  w.ei.registerEnricher(()=>({label:'Optional enrichment'}));assert.match(renderContext(w.ei.profile(w.person.uuid)),/Optional enrichment/);
  assert.equal(w.ei.profile(w.person.uuid).context.rows.find(r=>r.uuid===w.session.uuid).reasons.length,2);
});
test('Compact style is scoped to Context and uses readable category titles without CSS hiding',()=>{
  const css=fs.readFileSync(path.join(root,'styles/adventurers-tome.css'),'utf8');
  assert.match(css,/\.at-entity-intelligence \.at-context-group-title[^}]*font-size:12px/);
  assert.match(css,/\.at-entity-intelligence \.at-link-chip-list \.at-context-chip[^}]*overflow-wrap:anywhere/);
  const scoped=css.split('\n').filter(line=>line.includes('.at-entity-intelligence')).join('\n');assert.doesNotMatch(scoped,/display:\s*none|visibility:\s*hidden/);
});
test('GM link editing stays collapsed when Context contains only appearances',()=>{
  const linksCode=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const body=linksCode.slice(linksCode.indexOf('function atCelManagerForActor('),linksCode.indexOf('function atCelMount('));
  const appended=[],types=[],panel={dataset:{},append:n=>appended.push(n)};
  const ctx=vm.createContext({game:{user:{isGM:true}},main:{querySelector:s=>s==='.at-entity-intelligence'?panel:null},actorContext:{actor:{id:'actor'}},
    document:{createElement:type=>{types.push(type);return {dataset:{}};}},atCelJournalOptions:()=>'',atCelJournalLinksForActor:()=>({sessions:[],quests:[]})});
  vm.runInContext(body+'\natCelManagerForActor(actorContext,main);',ctx);assert.deepEqual(types,['details']);
  assert.match(appended[0].innerHTML,/<summary>Manage links<\/summary>/);assert.ok(!appended[0].open);
});
test('Player empty profile cannot acquire a synthetic empty Campaign Links panel',()=>{
  const linksCode=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const body=linksCode.slice(linksCode.indexOf('function atCelManagerForActor('),linksCode.indexOf('function atCelMount('));
  const ctx=vm.createContext({game:{user:{isGM:false}},main:{querySelector:()=>null},actorContext:{actor:{id:'actor'}}});
  assert.equal(vm.runInContext(body+'\natCelManagerForActor(actorContext,main);',ctx),null);
});
