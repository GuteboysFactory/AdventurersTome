import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from './helpers/vendor/handlebars-4.7.10.cjs';
import {world} from './helpers/tome-world.mjs';

const root=path.resolve(import.meta.dirname,'..');
const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
const partials=template.slice(0,template.indexOf('<div class="at-shell'));
const render=Handlebars.compile(partials+'{{> entityIntelligence this profileSurface=true}}');
const renderProfile=Handlebars.compile(template);
const section=html=>html.match(/<section class="at-profile-panel at-structured-relationships">([\s\S]*?)<\/section>/)?.[1] || '';
function fixture() {
  const w=world('',false);w.page.testUserPermission=()=>true;
  w.session.name='Public source';
  const person=w.add('Rhea North','Actor');
  const target=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  w.session.flags.campaignEntityLinksV1={actorUuids:[person.uuid],entityUuids:[target.uuid]};
  const claim=(extra={})=>({subjectUuid:person.uuid,objectUuid:target.uuid,relationType:'MEMBER_OF',
    sourceUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceKind:'session',sourceExcerpt:'Original assertion',
    certainty:'asserted',polarity:'positive',temporalScope:'current',...extra});
  return {...w,person,target,claim,ei:w.api.entityIntelligence,re:w.api.campaignRelationshipEvidence};
}
const htmlFor=(w,uuid=w.target.uuid)=>render(w.ei.profile(uuid));
function nav() {
  return {state:{ref:'world:start'},_navigationHistory:[],
    _captureNavigationState(){return {...this.state};},_pushNavigationState(){this._navigationHistory.push(this._captureNavigationState());},
    _restoreNavigationState(state){this.state=state;},async _openRefKey(ref){this.state={ref};return true;},
    back(){this._restoreNavigationState(this._navigationHistory.pop());}};
}

test('Whole Tome template precompiles with independently composed Relationships and Context',()=>{
  assert.ok(Handlebars.precompile(template));
  assert.match(partials,/\{\{> entityRelationships this\}\}[\s\S]*\{\{> entityContext this\}\}/);
  assert.doesNotMatch(partials,/Relationships \/ Context/);
});
for(const [view,key] of [['isWorldProfile','worldProfileView'],['isProfile','profileView']]) {
  test(`${key}: Relationships is first-class after Facts and before Context`,async()=>{
    const w=fixture();await w.re.ingest('generic',[w.claim()]);
    const html=renderProfile({[view]:true,isGM:true,settings:{nav:{}},[key]:{name:w.target.name,facts:[],intelligence:w.ei.profile(w.target.uuid)}});
    assert.equal((html.match(/<h2>Relationships<\/h2>/g)||[]).length,1);
    assert.ok(html.indexOf('<h2>Facts</h2>')<html.indexOf('<h2>Relationships</h2>'));
    assert.ok(html.indexOf('<h2>Relationships</h2>')<html.indexOf('<h2>Entity Context</h2>'));
    assert.match(section(html),/Rhea North — Member/);
  });
}
for(const [state,input,label] of [
  ['current',{},'Current'],['historical',{temporalScope:'historical'},'Historical'],
  ['unknown',{temporalScope:'unknown'},'Unknown'],['possible',{certainty:'possible'},'Possible'],
  ['negative',{polarity:'negative'},'Denied / negated']]) {
  test(`Rendered ${state} relation stays visible without expanding Context`,async()=>{
    const w=fixture();await w.re.ingest('generic',[w.claim(input)]);
    const model=w.ei.profile(w.target.uuid),html=section(render(model));
    assert.equal(model.relationships[0].state,state);
    assert.match(html,new RegExp(label));assert.match(html,/1 evidence/);
    const row=html.indexOf('class="at-relationship-row"'),button=html.indexOf('data-target-uuid'),details=html.indexOf('<details>');
    assert.ok(row>=0 && button>row && details>button,'target/state are outside every collapsed details');
    if(state==='negative'){assert.match(html,/Rhea North — Not a member/);assert.equal(model.relationships[0].active,false);}
    if(state==='historical'||state==='unknown'||state==='possible')assert.equal(model.relationships[0].active,false);
  });
}
test('Why connected and Relationship history are siblings using the same source evidence',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const html=section(htmlFor(w));
  assert.match(html,/<summary>Why connected\?<\/summary>[\s\S]*<\/details>\s*<details><summary>Relationship history \/ sources<\/summary>/);
  assert.equal((html.match(/Original assertion/g)||[]).length,2);
  assert.match(html,/Relevant source: Public source/);assert.match(html,/generic/);
  assert.match(html,new RegExp(`data-page-uuid="${w.page.uuid}"`));
});
test('World Relationships, Context, Campaign Links and Mentioned In coexist',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);
  const html=renderProfile({isWorldProfile:true,isGM:true,settings:{nav:{}},worldProfileView:{name:w.target.name,
    intelligence:w.ei.profile(w.target.uuid),hasMentionHistory:true,mentionCount:1,activeMentionCount:1,
    recentMentionEvidence:[{sourceName:w.session.name,sourceExcerpt:'Mention evidence'}]}});
  for(const text of ['<h2>Relationships</h2>','<h2>Entity Context</h2>','Related','<h2>Mentioned In</h2>'])assert.ok(html.includes(text),text);
});
test('Context keeps category backlinks and deduplicates targets without collapsing predicates',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim(),w.claim({relationType:'INFORMANT_FOR',temporalScope:'historical'})]);
  const model=w.ei.profile(w.target.uuid);assert.equal(model.relationships.length,2);
  assert.equal(model.relatedGroups[0].entries.length,1);assert.equal(model.relatedGroups[0].entries[0].uuid,w.person.uuid);
  assert.deepEqual(model.connectionGroups.flatMap(g=>g.entries),model.relationships);
  assert.equal((section(render(model)).match(/class="at-relationship-row"/g)||[]).length,2);
});
test('Rendered target UUID opens the canonical entity and Back restores the profile',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);const html=section(htmlFor(w));
  const uuid=html.match(/data-target-uuid="([^"]+)"/)[1],app=nav();
  assert.equal(uuid,w.person.uuid);assert.equal((await w.ei.open(uuid,app)).status,'opened');
  assert.equal(app.state.ref,`actor:${w.person.id}`);app.back();assert.equal(app.state.ref,'world:start');
});
test('Inverse presentation uses canonical target and the same evidence identity',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim({relationType:'OWES_FAVOUR_TO'})]);
  const a=w.ei.profile(w.person.uuid).relationships[0],b=w.ei.profile(w.target.uuid).relationships[0];
  assert.equal(a.id,b.id);assert.equal(a.history[0].id,b.history[0].id);assert.notEqual(a.label,b.label);
  assert.match(section(htmlFor(w)),new RegExp(b.label));assert.equal(b.otherUuid,w.person.uuid);
});
for(const hidden of ['endpoint','source','page'])test(`Player rendering removes hidden ${hidden} from rows, Context and sources before counting`,()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';
  w.game.user={id:'player',isGM:false};
  assert.equal(w.ei.profile(w.person.uuid).relationships.length,1);
  (hidden==='endpoint'?w.target:hidden==='source'?w.session:w.page).testUserPermission=()=>false;w.ei.invalidate();
  const model=w.ei.profile(w.person.uuid),html=render(model);
  assert.equal(model.relationships.length,0);assert.equal(model.relationshipCount,0);assert.equal(model.connectionGroups.length,0);
  assert.equal(model.relatedGroups.length,0);
  if(hidden!=='endpoint'){assert.equal(model.appearanceGroups.length,0);assert.ok(!html.includes('Public source'));}
  for(const secret of [w.target.name,w.target.uuid,'Why connected?','Relationship history','1 evidence','Organizations / Factions'])assert.ok(!html.includes(secret),secret);
});
test('Player World render excludes the GM mention ledger while keeping public Relationships',()=>{
  const w=fixture();w.page.text.content='Rhea North currently serves Copper Circle.';w.game.user={id:'player',isGM:false};
  const html=renderProfile({isWorldProfile:true,isGM:false,settings:{nav:{}},worldProfileView:{intelligence:w.ei.profile(w.target.uuid),
    hasMentionHistory:true,recentMentionEvidence:[{sourceName:'PRIVATE_LEDGER',excerpt:'Secret'}]}});
  assert.match(section(html),/Rhea North/);assert.ok(!html.includes('PRIVATE_LEDGER'));assert.ok(!html.includes('<h2>Mentioned In</h2>'));
});
test('Reload and repeated analysis preserve one visible row and one evidence',async()=>{
  const w=fixture();for(let i=0;i<3;i++)await w.re.ingest('generic',[w.claim()]);
  const before=htmlFor(w);w.reload('campaign-entity-intelligence.js');w.ei=w.api.entityIntelligence;
  assert.equal(htmlFor(w),before);assert.equal((section(before).match(/class="at-relationship-row"/g)||[]).length,1);
  assert.equal(w.ei.profile(w.target.uuid).relationships[0].evidenceCount,1);
});
test('No adapter and optional enrichment both render the same Relationships',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim()]);assert.equal(w.api.systemAdapter,undefined);
  const before=section(htmlFor(w));assert.match(before,/Rhea North/);
  w.ei.registerEnricher(input=>{input.relationships.length=0;return {label:'Optional enrichment'};});
  assert.equal(section(htmlFor(w)),before);assert.match(htmlFor(w),/Optional enrichment/);
});
test('Evidence HTML is escaped and missing sources retain explicit GM history',async()=>{
  const w=fixture();await w.re.ingest('generic',[w.claim({sourceExcerpt:'<script>alert(1)</script>'})]);
  assert.ok(!htmlFor(w).includes('<script>'));assert.match(htmlFor(w),/&lt;script&gt;/);
  w.session.pages.contents=[];w.session.pages.get=()=>null;w.ei.invalidate();assert.match(section(htmlFor(w)),/Source or source page missing/);
});
test('Session and Quest remain clean and use the composed shared profile presentation',()=>{
  assert.doesNotMatch(template,/Chronicle excerpt/);
  for(const key of ['selectedSession.intelligence','questDetail.intelligence'])assert.ok(!template.includes(`{{> entityIntelligence ${key}`),key);
  assert.ok(template.includes('{{> entityIntelligence entityContext profileSurface=true}}'));
  assert.match(template,/Open Full Session/);
});
test('Unavailable identity cannot render empty sections, counts or navigation suggestions',()=>{
  const w=fixture(),model=w.ei.profile('Actor.missing');
  assert.equal(model.available,false);assert.equal(model.relationships.length,0);assert.equal(render(model).trim(),'');
});
