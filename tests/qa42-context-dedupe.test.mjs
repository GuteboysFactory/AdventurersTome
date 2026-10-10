import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Handlebars from './helpers/vendor/handlebars-4.7.10.cjs';
import {world} from './helpers/tome-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
const code=fs.readFileSync(path.join(root,'scripts/campaign-entity-intelligence.js'),'utf8');
const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
const partials=template.slice(0,template.indexOf('<div class="at-shell'));
const renderContext=Handlebars.compile(partials+'{{> entityContext this}}');
const renderAll=Handlebars.compile(partials+'{{> entityIntelligence this profileSurface=true}}');
const renderProfile=Handlebars.compile(template);
// Exercise the exact production grouping/presentation boundary with viewer-safe
// rows, including categories that a given fixture's source extractor may not use.
const project=vm.runInNewContext(code.slice(code.indexOf('const ATEI_CATEGORIES='),code.indexOf('function atEiDocument('))+
  code.slice(code.indexOf('function atEiGroups('),code.indexOf('function atEiProfile('))+'\natEiContext');
const row=(uuid,category='session',name='Shared title')=>({uuid,category,name});
const count=(html,uuid)=>html.split(`data-at-context-uuid="${uuid}"`).length-1;
const flatten=groups=>groups.flatMap(group=>group.entries);
function fixture() {
  const w=world('',false);w.page.testUserPermission=()=>true;w.session.name='Public session';
  const person=w.add('Rhea North','Actor'),target=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  w.session.flags.campaignEntityLinksV1={actorUuids:[person.uuid],entityUuids:[target.uuid]};
  const claim=(extra={})=>({subjectUuid:person.uuid,objectUuid:target.uuid,relationType:'MEMBER_OF',
    sourceUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceKind:'session',sourceExcerpt:'Source assertion',
    certainty:'asserted',polarity:'positive',temporalScope:'current',...extra});
  return {...w,person,target,claim,ei:w.api.entityIntelligence,re:w.api.campaignRelationshipEvidence};
}
test('Same canonical Session in appearances and links renders once with both causes intact',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const model=w.ei.profile(w.person.uuid),html=renderContext(model);
  assert.ok(flatten(model.appearanceGroups).some(r=>r.uuid===w.session.uuid));
  assert.ok(flatten(model.linkGroups).some(r=>r.uuid===w.session.uuid));
  const merged=model.context.rows.find(r=>r.uuid===w.session.uuid);
  assert.equal(merged.appearedIn,true);assert.equal(merged.campaignLinked,true);
  assert.deepEqual(Array.from(merged.reasons),['APPEARS_IN','CAMPAIGN_LINK']);
  assert.equal(count(html,w.session.uuid),1);assert.ok(flatten(model.context.appearanceGroups).some(r=>r.uuid===w.session.uuid));
  assert.ok(!flatten(model.context.linkGroups).some(r=>r.uuid===w.session.uuid));
});
test('Compact Context preserves every supporting cause in the model without per-chip diagnostics',()=>{
  const entity=row('JournalEntry.source'),context=project([entity],[entity],[entity]);
  const html=renderContext({available:true,hasContext:true,context});
  assert.equal(count(html,entity.uuid),1);assert.ok(!html.includes('Connection reasons'));
  assert.deepEqual(Array.from(context.rows[0].reasonLabels),['Appears in','Canonical relationship','Campaign link / Related']);
  assert.equal(context.rows[0].reasons.length,3);
});
for(const category of ['session','quest','person','location','organization','item','narrative','scene','other','future-category']) {
  test(`${category}: cross-group UUID dedupe is category-independent`,()=>{
    const entity=row(`Document.${category}`,category),context=project([entity],[entity],[entity]);
    assert.equal(context.count,1);assert.equal(context.rows[0].reasons.length,3);
    assert.equal(flatten(context.appearanceGroups).length,1);assert.equal(context.relatedGroups.length,0);assert.equal(context.linkGroups.length,0);
    assert.equal(count(renderContext({available:true,hasContext:true,context}),entity.uuid),1);
  });
}
test('Same title with different UUIDs and categories never merges',()=>{
  const a=row('JournalEntry.session','session','Same title'),b=row('JournalEntry.place','location','Same title');
  const context=project([], [a,b], [a]);assert.equal(context.count,2);
  const html=renderContext({available:true,hasContext:true,context});assert.equal(count(html,a.uuid),1);assert.equal(count(html,b.uuid),1);
});
test('Two same-name Sessions with different UUIDs both remain visible',()=>{
  const a=row('JournalEntry.one'),b=row('JournalEntry.two'),context=project([], [a,b], [a,b]);
  assert.equal(context.count,2);assert.equal(flatten(context.appearanceGroups).length,2);
});
test('Cross-category aliases of one already canonical UUID still get one presentation slot',()=>{
  const a=row('JournalEntry.shared','narrative'),b=row(a.uuid,'session'),context=project([], [b], [a]);
  assert.equal(context.count,1);assert.equal(context.rows[0].campaignLinked,true);assert.equal(context.rows[0].category,'narrative');
});
test('Related and Campaign Link overlap dedupes even without Appears in',()=>{
  const entity=row('Actor.related','person'),context=project([entity],[entity],[]);
  assert.equal(context.relatedGroups[0].entries.length,1);assert.equal(context.linkGroups.length,0);
  assert.deepEqual(Array.from(context.rows[0].reasons),['RELATIONSHIP','CAMPAIGN_LINK']);
});
test('Repeated inputs never duplicate rows, reason labels, or group counts',()=>{
  const entity=row('JournalEntry.repeat'),context=project([entity,entity],[entity,entity],[entity,entity]);
  assert.equal(context.count,1);assert.equal(context.rows[0].reasons.length,3);assert.equal(context.rows[0].reasonLabels.length,3);
});
test('Private-page aggregate link cannot add a cause or count to public evidence occurrence',()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';
  w.session.pages.contents.push({id:'private',uuid:`${w.session.uuid}.JournalEntryPage.private`,parent:w.session,
    text:{content:'Private'},testUserPermission:()=>false});w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.person.uuid),merged=model.context.rows.find(r=>r.uuid===w.session.uuid);
  assert.equal(merged.appearedIn,true);assert.equal(merged.campaignLinked,false);
  assert.deepEqual(Array.from(merged.reasons),['APPEARS_IN']);
  assert.equal(count(renderContext(model),w.session.uuid),1);assert.equal(model.context.count,2);
  assert.ok(!renderContext(model).includes('<p>Campaign link / Related</p>'));
});
test('Hidden occurrence evidence cannot add an appearance reason to an independent public link',()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';w.page.testUserPermission=()=>false;
  w.person.flags.campaignEntityLinksV1={entityUuids:[w.session.uuid]};w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.person.uuid),merged=model.context.rows.find(r=>r.uuid===w.session.uuid);
  assert.equal(merged.campaignLinked,true);assert.equal(merged.appearedIn,false);
  assert.deepEqual(Array.from(merged.reasons),['CAMPAIGN_LINK']);assert.equal(model.context.count,1);
  const html=renderContext(model);assert.equal(count(html,w.session.uuid),1);assert.ok(!html.includes('Appears in'));
  assert.equal(model.relationships.length,0);
});
test('Hidden source cannot influence another public Context row through merge metadata',()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';
  w.session.testUserPermission=()=>false;w.game.user={id:'player',isGM:false};
  const model=w.ei.profile(w.person.uuid);assert.equal(model.context.count,0);
  assert.ok(!JSON.stringify(model.context).includes(w.session.uuid));assert.ok(!renderContext(model).includes('Public session'));
});
test('Relationships and independent history/Why connected survive Context dedupe',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const html=renderAll(w.ei.profile(w.person.uuid));
  assert.match(html,/<h2>Relationships<\/h2>/);assert.match(html,/Why connected\?/);assert.match(html,/Relationship history \/ sources/);
  assert.match(html,/Current · 1 evidence/);assert.equal(count(html,w.session.uuid),1);
});
test('Mentioned In remains independent of the deduped Context source row',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const html=renderProfile({isGM:true,isWorldProfile:true,settings:{nav:{}},
    worldProfileView:{name:w.target.name,intelligence:w.ei.profile(w.target.uuid),hasMentionHistory:true,mentionCount:1,activeMentionCount:1}});
  assert.match(html,/<h2>Mentioned In<\/h2>/);assert.match(html,/<h2>Relationships<\/h2>/);assert.equal(count(html,w.session.uuid),1);
});
test('Deduped Context target retains canonical navigation and Back',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const html=renderContext(w.ei.profile(w.person.uuid));
  const uuid=html.match(/data-target-uuid="([^"]+)"/)[1];assert.equal(uuid,w.session.uuid);
  const app={state:{ref:'actor:start'},_navigationHistory:[],_captureNavigationState(){return {...this.state};},
    _pushNavigationState(){this._navigationHistory.push(this._captureNavigationState());},async _openRefKey(ref){this.state={ref};return true;}};
  assert.equal((await w.ei.open(uuid,app)).status,'opened');assert.equal(app.state.ref,`session:${w.session.id}`);
  app.state=app._navigationHistory.pop();assert.equal(app.state.ref,'actor:start');
});
test('Reload and repeated processing preserve deduped UI and both reasons without an adapter',async()=>{
  const w=fixture();assert.equal(w.api.systemAdapter,undefined);for(let i=0;i<3;i++)await w.re.ingest('generic',[w.claim()]);
  const before=renderContext(w.ei.profile(w.person.uuid));w.reload('campaign-entity-intelligence.js');w.ei=w.api.entityIntelligence;
  assert.equal(renderContext(w.ei.profile(w.person.uuid)),before);assert.equal(count(before,w.session.uuid),1);
  assert.equal(w.ei.profile(w.person.uuid).context.rows.find(r=>r.uuid===w.session.uuid).reasons.length,2);
});
test('Returned merged reasons are detached from the cached evidence and next projection',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const model=w.ei.profile(w.person.uuid);
  model.context.rows[0].reasons.push('PRIVATE_FAKE');model.context.appearanceGroups.length=0;
  const after=w.ei.profile(w.person.uuid);assert.ok(!JSON.stringify(after).includes('PRIVATE_FAKE'));assert.equal(after.context.appearanceGroups.length,1);
});
test('GM unlink manager uses the single source row outside Campaign Links and retains event delegation',()=>{
  const linksCode=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const body=linksCode.slice(linksCode.indexOf('function atCelManagerForActor('),linksCode.indexOf('function atCelMount('));
  const scope={dataset:{}},panel={dataset:{},closest:()=>scope,append:()=>{}},calls=[];
  const ctx=vm.createContext({game:{user:{isGM:true}},main:{querySelector:s=>s==='[data-at-ei-links]'?panel:null},actorContext:{actor:{id:'actor'}},
    document:{createElement:()=>({dataset:{}})},atCelJournalOptions:()=>'',atCelJournalLinksForActor:()=>({sessions:[{id:'s'}],quests:[{id:'q'}]}),
    atCelWrapManualJournalLink:(host,journal,kind)=>calls.push({host,id:journal.id,kind})});
  vm.runInContext(body+'\natCelManagerForActor(actorContext,main);',ctx);
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.host===scope));assert.equal(scope.dataset.atCelManager,'actor');assert.equal(scope.dataset.actorId,'actor');
});
test('Unlink remains GM-only when Context source rows move to Appears in',()=>{
  const linksCode=fs.readFileSync(path.join(root,'scripts/campaign-entity-links.js'),'utf8');
  const body=linksCode.slice(linksCode.indexOf('function atCelManagerForActor('),linksCode.indexOf('function atCelMount('));
  const scope={dataset:{}},panel={dataset:{},closest:()=>scope};
  const ctx=vm.createContext({game:{user:{isGM:false}},main:{querySelector:s=>s==='[data-at-ei-links]'?panel:null},actorContext:{actor:{id:'actor'}}});
  vm.runInContext(body+'\natCelManagerForActor(actorContext,main);',ctx);assert.equal(scope.dataset.atCelManager,undefined);
});
