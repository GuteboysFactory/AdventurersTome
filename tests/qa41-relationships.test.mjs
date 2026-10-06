import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {world} from './helpers/tome-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
function setup(text,number=1) {
  const w=world(text,false);
  w.session.name=`Session ${number}`;w.session.flags.sessionNumber=number;
  w.page.testUserPermission=()=>true;
  const elira=w.add('Elira Voss','Actor');const gunther=w.add('Gunther','Actor');
  const faction=w.add('Pale Wardens','JournalEntry',{worldProfile:{category:'faction'}});
  const place=w.add('Blackbridge Watch','JournalEntry',{worldProfile:{category:'location'}});
  w.session.flags.campaignEntityLinksV1={actorUuids:[elira.uuid,gunther.uuid],entityUuids:[faction.uuid,place.uuid]};
  return {...w,elira,gunther,faction,place,relations:w.api.campaignRelationshipEvidence};
}
function source(w,text,number=null,kind='session') {
  const doc=w.add(number ? `Session ${number}` : 'Unordered source','JournalEntry',{type:kind,...(number ? {sessionNumber:number}: {})});
  doc.flags.campaignEntityLinksV1=structuredClone(w.session.flags.campaignEntityLinksV1 || {});
  const page={id:`p${doc.id}`,uuid:`${doc.uuid}.JournalEntryPage.p${doc.id}`,name:'Chronicle',text:{content:text},testUserPermission:()=>true,parent:doc};
  doc.pages={contents:[page]};w.docs.set(page.uuid,page);return doc;
}
const relation=(w,type)=>w.relations.relationshipsFor(w.elira.uuid).find(row=>row.relationType===type);
test('Assertion-local formerly and now bind separately to service and command',async()=>{
  const w=genericWorld();w.page.text.content='Rhea North formerly served Copper Circle but now commands Copper Circle.';await w.relations.sync();
  const rows=w.relations.snapshot().evidence;assert.equal(rows.find(row=>row.relationType==='SERVES').temporalScope,'historical');
  assert.equal(rows.find(row=>row.relationType==='COMMANDER_OF').temporalScope,'current');
});
test('Past knowledge and continuing work with a safely bound object pronoun retain independent times',async()=>{
  const w=genericWorld();const person=w.add('Dorian West','Actor');w.page.text.content='Rhea North knew Dorian West years ago and still works for him.';
  await w.relations.sync();const rows=w.relations.snapshot().evidence;
  assert.equal(rows.find(row=>row.relationType==='KNOWS').temporalScope,'historical');
  const work=rows.find(row=>row.relationType==='WORKS_FOR');assert.equal(work.objectUuid,person.uuid);assert.equal(work.temporalScope,'current');
});
test('Past information supply and current work use different assertion spans and inverse states',async()=>{
  const w=genericWorld();w.page.text.content='Rhea North supplied Copper Circle information in the past and now works for Copper Circle.';await w.relations.sync();
  const rows=w.relations.snapshot().evidence;const past=rows.find(row=>row.relationType==='INFORMATION_PROVIDER');const current=rows.find(row=>row.relationType==='WORKS_FOR');
  assert.equal(past.temporalScope,'historical');assert.equal(current.temporalScope,'current');
  assert.ok(!past.sourceSpan.text.includes('now works'));assert.ok(!current.sourceSpan.text.includes('in the past'));
  const inverse=w.relations.relationshipsFor(w.group.uuid);assert.equal(inverse.find(row=>row.relationType==='INFORMATION_PROVIDER').state,'historical');assert.equal(inverse.find(row=>row.relationType==='WORKS_FOR').state,'current');
});
test('An earlier encounter event does not make a continuing favour debt historical',async()=>{
  const w=genericWorld();w.add('Dorian West','Actor');w.page.text.content='Rhea North met Dorian West during an earlier journey and still owed him a favour.';await w.relations.sync();
  const rows=w.relations.snapshot().evidence;assert.equal(rows.find(row=>row.relationType==='MET').temporalScope,'historical');
  assert.equal(rows.find(row=>row.relationType==='OWES_FAVOUR_TO').temporalScope,'current');
});
test('Former work and continuing communication stay separate, and a current hedge is never hard fact',async()=>{
  const w=genericWorld();w.page.text.content='Rhea North used to work for Copper Circle but still speaks with Copper Circle regularly.';await w.relations.sync();
  const rows=w.relations.snapshot().evidence;assert.equal(rows.find(row=>row.relationType==='WORKS_FOR').temporalScope,'historical');assert.equal(rows.find(row=>row.relationType==='SPEAKS_WITH').temporalScope,'current');
  w.page.text.content='Rhea North may currently work for Copper Circle.';await w.relations.sync();
  const active=w.relations.snapshot().evidence.find(row=>row.active && row.relationType==='WORKS_FOR');assert.equal(active.certainty,'possible');assert.equal(active.temporalScope,'current');
  assert.equal(w.relations.relationshipsFor(w.person.uuid).find(row=>row.relationType==='WORKS_FOR').state,'possible');
});
test('Recognition supplies historical encounter provenance without claiming the knowledge has ended',async()=>{
  const w=genericWorld();w.add('Dorian West','Actor');w.page.text.content='Rhea North recognized Dorian West from an earlier journey and claimed that he still owed Dorian West a favour.';
  await w.relations.sync();const rows=w.relations.snapshot().evidence;const knows=rows.find(row=>row.relationType==='KNOWS');
  assert.equal(knows.temporalScope,'unknown');assert.equal(knows.eventTemporalScope,'historical');assert.equal(rows.find(row=>row.relationType==='OWES_FAVOUR_TO').temporalScope,'current');
});
test('Conjunctions inside canonical entity names do not segment the assertion',async()=>{
  const w=genericWorld();const group=w.add('Copper and Silver Circle','JournalEntry',{worldProfile:{category:'faction'}});
  w.page.text.content='Rhea North is a member of Copper and Silver Circle but now works for Copper Circle.';await w.relations.sync();
  const member=w.relations.snapshot().evidence.find(row=>row.relationType==='MEMBER_OF');assert.equal(member.objectUuid,group.uuid);assert.match(member.sourceSpan.text,/Copper and Silver Circle/);
});
test('Assertion-specific source spans survive reanalysis, reload and direct provider ingestion',async()=>{
  const w=genericWorld();w.page.text.content='Rhea North formerly served Copper Circle but now commands Copper Circle.';await w.relations.sync();await w.relations.sync();
  const reload=genericWorld();reload.page.text.content=w.page.text.content;for(const [key,value] of w.storage)reload.storage.set(key,structuredClone(value));await reload.relations.sync();
  assert.equal(reload.relations.snapshot().evidence.length,2);assert.ok(reload.relations.snapshot().evidence.every(row=>row.sourceSpan.text));
  const span={start:12,end:19,text:'adapter'};await w.relations.ingest('non-English',[assertion(w,{sourceSpan:span,temporalScope:'historical'})]);
  assert.deepEqual(structuredClone(w.relations.snapshot().evidence.find(row=>row.origin==='provider').sourceSpan),span);
});
test('Temporal vocabulary in canonical names is not a temporal cue; span offsets match plain source including blank lines',async()=>{
  const w=genericWorld();const person=w.add('Still North','Actor');w.page.text.content='Introductory text.\n\nStill North formerly served Copper Circle but now commands Copper Circle.';await w.relations.sync();
  const rows=w.relations.snapshot().evidence.filter(row=>row.subjectUuid===person.uuid);assert.equal(rows.find(row=>row.relationType==='SERVES').temporalScope,'historical');
  for(const row of rows)assert.equal(w.page.text.content.slice(row.sourceSpan.start,row.sourceSpan.end),row.sourceSpan.text);
});
test('Two same-predicate propositions in one sentence preserve independent evidence and times',async()=>{
  const w=genericWorld();w.page.text.content='Rhea North previously worked for Copper Circle but now works for Copper Circle.';await w.relations.sync();await w.relations.sync();
  const rows=w.relations.snapshot().evidence;assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.id)).size,2);
  assert.deepEqual(Array.from(rows,row=>row.temporalScope),['historical','current']);assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,'current');
});
test('Direct providers keep two distinct source spans while repeated ingestion stays idempotent',async()=>{
  const w=genericWorld();const claims=[assertion(w,{sourceSpan:{start:0,end:4,text:'first'}}),assertion(w,{sourceSpan:{start:10,end:15,text:'other'}})];
  await w.relations.ingest('span-provider',claims);await w.relations.ingest('span-provider',claims);assert.equal(w.relations.snapshot().evidence.length,2);
});
test('Previously persisted provider IDs with spans retain their decisions on re-ingestion',async()=>{
  const w=genericWorld();const claim=assertion(w,{certainty:'possible',sourceSpan:{start:0,end:5,text:'claim'}});
  const row=w.relations.normalize(claim);const key=['adapter','',row.identityKey,row.sourceUuid,row.sourcePageUuid,row.sourceExcerpt,row.polarity,row.certainty,row.temporalScope,''].join('|');
  let hash=2166136261;for(const char of key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}const id=`provider-${(hash>>>0).toString(36)}`;
  w.storage.set('campaignRelationshipEvidenceV1',JSON.stringify({version:2,evidence:[{...row,id,origin:'provider',providerId:'adapter',active:true}],decisions:[{evidenceId:id,action:'confirm'}]}));
  const saved=await w.relations.ingest('adapter',[claim]);assert.equal(saved[0].id,id);assert.equal(w.relations.snapshot().evidence.length,1);assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,'current');
});
function genericWorld() {
  const w=world('',false);w.page.testUserPermission=()=>true;
  const person=w.add('Rhea North','Actor');const group=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
  w.session.flags.sessionNumber=1;
  return {...w,person,group,relations:w.api.campaignRelationshipEvidence};
}
function assertion(w,overrides={}) {
  return {subjectUuid:w.person.uuid,predicate:'MEMBER_OF',objectUuid:w.group.uuid,polarity:'positive',certainty:'asserted',temporalScope:'current',
    sourceUuid:w.session.uuid,sourcePageUuid:w.page.uuid,sourceKind:'session',sourceExcerpt:'Structured adapter evidence',chronology:{sessionNumber:1},
    provenance:[{adapter:'system-independent'}],confidence:1,visibility:'source-bounded',...overrides};
}
test('Language-independent provider ingestion produces current state and canonical forward/inverse presentation',async()=>{
  const w=genericWorld();await w.relations.ingest('structured-adapter',[assertion(w)]);
  const row=w.relations.relationshipsFor(w.person.uuid)[0];assert.equal(row.state,'current');assert.equal(row.label,'Member');
  assert.equal(w.relations.relationshipsFor(w.group.uuid)[0].state,row.state);assert.equal(row.history[0].certainty,'asserted');
});
test('Provider negative membership is Not a member / Denied on both endpoints, never former',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w,{polarity:'negative'})]);
  for(const uuid of [w.person.uuid,w.group.uuid]) {
    const row=w.relations.relationshipsFor(uuid)[0];assert.equal(row.label,'Not a member');assert.equal(row.stateLabel,'Denied / negated');assert.equal(row.changeSemantics,null);
  }
});
test('Provider historical-only support and unknown scope cannot become current',async()=>{
  for(const [temporalScope,state] of [['historical','historical'],['unknown','unknown']]) {
    const w=genericWorld();await w.relations.ingest('adapter',[assertion(w,{temporalScope})]);assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,state);
  }
});
test('Historical plus later current evidence preserves both and derives current',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w,{temporalScope:'historical'}),assertion(w,{sourceExcerpt:'Later explicit present claim',chronology:{sessionNumber:2}})]);
  const row=w.relations.relationshipsFor(w.person.uuid)[0];assert.equal(row.state,'current');assert.equal(row.history.length,2);
});
test('Later no_longer and former have distinct change semantics with retained evidence',async()=>{
  for(const [changeSemantics,polarity,state] of [['no_longer','negative','negative'],['former','positive','historical']]) {
    const w=genericWorld();await w.relations.ingest('adapter',[assertion(w),assertion(w,{changeSemantics,polarity,temporalScope:'historical',sourceExcerpt:'Explicit later change',chronology:{sessionNumber:2}})]);
    const row=w.relations.relationshipsFor(w.person.uuid)[0];assert.equal(row.state,state);assert.equal(row.changeSemantics,changeSemantics);assert.equal(row.history.length,2);
  }
});
test('Unknown order and simultaneous provider contradiction stay conflicting on both endpoints',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w),assertion(w,{polarity:'negative',sourceExcerpt:'Contradictory claim'})]);
  for(const uuid of [w.person.uuid,w.group.uuid])assert.equal(w.relations.relationshipsFor(uuid)[0].state,'conflicting');
});
test('Provider certainty review and GM confirmation use normalized semantics without inventing temporal scope',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w,{certainty:'possible',temporalScope:'historical'})]);
  assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,'possible');await w.relations.decide(w.relations.review()[0].id,'confirm');
  assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,'historical');assert.equal(w.relations.snapshot().evidence[0].certainty,'possible');
});
test('Unknown temporal contrary evidence stays uncertain rather than silently preserving current',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w),assertion(w,{temporalScope:'unknown',polarity:'negative',sourceExcerpt:'Undated denial'})]);
  assert.equal(w.relations.relationshipsFor(w.person.uuid)[0].state,'conflicting');
});
test('Deleted provider source retires current evidence while preserving its history',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w)]);
  w.game.journal.contents=w.game.journal.contents.filter(row=>row.uuid!==w.session.uuid);await w.relations.sync();
  const row=w.relations.relationshipsFor(w.person.uuid)[0];assert.equal(row.state,'historical');assert.equal(row.history.length,1);assert.equal(row.history[0].active,false);
});
test('Retired negative evidence keeps its negative predicate in historical profiles and evidence rows',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w,{polarity:'negative'})]);
  w.game.journal.contents=w.game.journal.contents.filter(row=>row.uuid!==w.session.uuid);await w.relations.sync();
  const row=w.relations.relationshipsFor(w.person.uuid)[0];assert.equal(row.state,'historical');assert.equal(row.label,'Not a member');assert.equal(row.history[0].label,'Not a member');
});
test('Provider idempotence survives reload, repeated ingestion and English reanalysis',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w)]);await w.relations.ingest('adapter',[assertion(w)]);await w.relations.sync();
  assert.equal(w.relations.snapshot().evidence.length,1);
  const reload=genericWorld();for(const [key,value] of w.storage)reload.storage.set(key,structuredClone(value));
  await reload.relations.ingest('adapter',[assertion(reload)]);assert.equal(reload.relations.snapshot().evidence.length,1);assert.equal(reload.relations.relationshipsFor(reload.person.uuid)[0].state,'current');
});
test('Direct UUID assertion respects same-name isolation and GM canonical selection',async()=>{
  const w=genericWorld();const other=w.add('Rhea North','Actor');await w.relations.ingest('adapter',[assertion(w,{subjectUuid:other.uuid,certainty:'possible'})]);
  await w.relations.decide(w.relations.review()[0].id,'confirm');assert.equal(w.relations.relationshipsFor(w.person.uuid).length,0);assert.equal(w.relations.relationshipsFor(other.uuid)[0].state,'current');
});
test('Provider private evidence and GM conclusions never enter player ledger or fresh derivation',async()=>{
  const w=genericWorld();await w.relations.ingest('adapter',[assertion(w)]);w.session.testUserPermission=()=>false;w.game.user={id:'player',isGM:false};
  assert.equal(w.relations.relationshipsFor(w.person.uuid).length,0);assert.equal(w.relations.snapshot().evidence.length,0);await assert.rejects(()=>w.relations.ingest('adapter',[]),/GM permission/);
});
test('Legacy evidence normalizes conservatively without rewriting persisted history',async()=>{
  const w=genericWorld();const old={id:'legacy',subjectUuid:w.person.uuid,objectUuid:w.group.uuid,relationType:'MEMBER_OF',sourceUuid:w.session.uuid,sourceExcerpt:'Old evidence',status:'negated',active:true};
  w.storage.set('campaignRelationshipEvidenceV1',JSON.stringify({version:1,evidence:[old],decisions:[]}));
  const before=w.storage.get('campaignRelationshipEvidenceV1');const normalized=w.relations.normalize(old);
  assert.equal(normalized.polarity,'negative');assert.equal(normalized.temporalScope,'unknown');assert.equal(normalized.changeSemantics,null);
  w.relations.snapshot();assert.equal(w.storage.get('campaignRelationshipEvidenceV1'),before);
});
test('Generic English provider separates present, historical, negation, former, and hedge',async()=>{
  for(const [text,state,polarity] of [
    ['Rhea North is a member of Copper Circle.','current','positive'],
    ['Rhea North is not a member of Copper Circle.','negative','negative'],
    ['Rhea North was a member of Copper Circle.','historical','positive'],
    ['Rhea North used to work for Copper Circle.','historical','positive'],
    ['Rhea North is an informant for Copper Circle.','current','positive'],
    ['Rhea North supplied information to Copper Circle in the past.','historical','positive'],
    ['Rhea North may be working for Copper Circle.','possible','positive'],
    ['Rhea North is a former member of Copper Circle.','historical','positive']
  ]) {
    const w=genericWorld();w.page.text.content=text;await w.relations.sync();const row=w.relations.relationshipsFor(w.person.uuid)[0];
    assert.ok(row,text);assert.equal(row.state,state,text);assert.equal(row.polarity,polarity,text);
  }
});
test('Production relationship logic contains no QA campaign identities or fixture sentence switches',()=>{
  const code=fs.readFileSync(path.join(root,'scripts/campaign-relationship-evidence.js'),'utf8');
  assert.doesNotMatch(code,/\b(?:Toren|Pale Wardens|Gunther|Mara|Elira|Blackbridge|Stonecross)\b/i);
});

test('Explicit friend evidence saves canonical endpoints, excerpt, provenance, confidence, privacy and source chronology',async()=>{
  const w=setup('Elira Voss is an old friend of Gunther.');const result=await w.relations.sync();
  assert.equal(result.evidence.length,1);const row=result.evidence[0];
  assert.equal(row.subjectUuid,w.elira.uuid);assert.equal(row.objectUuid,w.gunther.uuid);assert.equal(row.relationType,'FRIEND_OF');
  assert.equal(row.sourceUuid,w.session.uuid);assert.equal(row.sourceKind,'session');assert.equal(row.chronology.sessionNumber,1);
  assert.match(row.sourceExcerpt,/old friend/);assert.equal(row.visibility,'source-bounded');assert.equal(row.confidence,0.95);
  assert.equal(row.provenance[0].rule,'FRIEND_OF');assert.equal(relation(w,'FRIEND_OF').state,'current');assert.equal(w.relations.review().length,0);
});
test('Explicit member and role relations remain distinct structured types',async()=>{
  const w=setup('Elira Voss is a quartermaster of the Pale Wardens. Elira Voss is a member of the Pale Wardens.');
  await w.relations.sync();assert.equal(relation(w,'QUARTERMASTER_OF').state,'current');assert.equal(relation(w,'MEMBER_OF').state,'current');
});
test('Explicit location relationship and reverse canonical backlink use the same evidence',async()=>{
  const w=setup('Elira Voss normally operates from Blackbridge Watch.');await w.relations.sync();
  const forward=relation(w,'OPERATES_FROM');assert.equal(forward.otherUuid,w.place.uuid);
  const back=w.relations.relationshipsFor(w.place.uuid)[0];assert.equal(back.otherUuid,w.elira.uuid);assert.equal(back.reverse,true);
  assert.equal(back.history[0].id,forward.history[0].id);assert.equal(back.label,'Base for');
});
test('Friend reverse backlink does not copy entities or evidence',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');const count=w.docs.size;await w.relations.sync();
  const back=w.relations.relationshipsFor(w.gunther.uuid)[0];assert.equal(back.label,'Friend');assert.equal(back.name,'Elira Voss');
  assert.equal(w.docs.size,count);assert.equal(w.relations.snapshot().evidence.length,1);
});
test('Multiple sources contribute evidence to one relationship, and repeat scans do not duplicate it',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');source(w,'Elira Voss is an old friend of Gunther.',2);
  await w.relations.sync();assert.equal(relation(w,'FRIEND_OF').evidenceCount,2);
  await w.relations.sync();assert.equal(relation(w,'FRIEND_OF').evidenceCount,2);assert.equal(w.relations.snapshot().evidence.length,2);
});
test('Later no-longer relationship changes current state but preserves earlier evidence',async()=>{
  const w=setup('Elira Voss trusts Gunther.');source(w,'Elira Voss no longer trusts Gunther.',2);await w.relations.sync();
  const row=relation(w,'TRUSTS');assert.equal(row.state,'negative');assert.equal(row.history.length,2);
  assert.deepEqual(Array.from(row.history,item=>item.status),['asserted','ended']);
});
test('Changed source excerpts retain retired evidence rather than overwriting history',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');await w.relations.sync();
  w.page.text.content='Elira Voss no longer trusts Gunther.';await w.relations.sync();
  assert.equal(relation(w,'FRIEND_OF').state,'historical');assert.equal(relation(w,'FRIEND_OF').history[0].active,false);
  assert.equal(w.relations.snapshot().evidence.length,2);
});
test('Hedged working-for relation is possible evidence about Seren, never membership or hard fact',async()=>{
  const w=setup('Mara Venn suspects Seren Holt may be working for the Ashen Hand.');
  const mara=w.add('Mara Venn','Actor');const seren=w.add('Seren Holt','Actor');
  const ashen=w.add('Ashen Hand','JournalEntry',{worldProfile:{category:'faction'}});
  await w.relations.sync();const row=w.relations.snapshot().evidence[0];
  assert.ok(row);assert.equal(row.subjectUuid,seren.uuid);assert.notEqual(row.subjectUuid,mara.uuid);assert.equal(row.objectUuid,ashen.uuid);
  assert.equal(row.status,'possible');assert.equal(row.relationType,'WORKS_FOR');assert.equal(w.relations.review().length,1);
  assert.equal(w.relations.relationshipsFor(seren.uuid)[0].state,'possible');
});
test('Negated membership is stored as negative evidence and never derives positive membership',async()=>{
  const w=setup('Elira Voss is not a member of the Pale Wardens.');await w.relations.sync();
  const row=relation(w,'MEMBER_OF');assert.equal(row.state,'negative');assert.equal(row.history[0].polarity,'negative');
});
test('Conflicting evidence without existing narrative chronology remains conflicting',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');w.session.flags.type='quest';
  source(w,'Elira Voss is not a friend of Gunther.',null,'quest');await w.relations.sync();
  assert.equal(relation(w,'FRIEND_OF').state,'conflicting');assert.equal(relation(w,'FRIEND_OF').history.length,2);
});
test('Contradictory same-session evidence remains conflicting rather than using extraction order',async()=>{
  const w=setup('Elira Voss is a friend of Gunther. Elira Voss is not a friend of Gunther.');await w.relations.sync();
  assert.equal(relation(w,'FRIEND_OF').state,'conflicting');
});
test('Ledger and decisions survive serialization and runtime reload',async()=>{
  const w=setup('Elira Voss may be a friend of Gunther.');await w.relations.sync();
  await w.relations.decide(w.relations.review()[0].id,'confirm');
  const reload=setup('Elira Voss may be a friend of Gunther.');
  for(const [key,value] of w.storage)reload.storage.set(key,JSON.parse(JSON.stringify(value)));
  assert.equal(relation(reload,'FRIEND_OF').state,'current');assert.equal(reload.relations.snapshot().decisions.length,1);
  await reload.relations.sync();assert.equal(reload.relations.snapshot().evidence.length,1);assert.equal(reload.relations.review().length,0);
});
test('Same-name independent identities remain unresolved unless source canonical choice proves an endpoint',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');const other=w.add('Gunther','Actor');
  const result=await w.relations.sync();assert.equal(result.evidence.length,0);assert.match(result.diagnostics[0].reason,/canonical/);
  w.api.campaignMentionEvidence={...w.api.campaignMentionEvidence,recordsForSource:()=>[{mentionText:'Gunther',targetUuid:other.uuid,outcome:'LINKED',active:true}]};
  await w.relations.sync();assert.equal(relation(w,'FRIEND_OF').otherUuid,other.uuid);assert.equal(w.relations.relationshipsFor(w.gunther.uuid).length,0);
});
test('Proven Contact projection shares Actor relationship identity while unrelated same-name Contact remains distinct',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');const projection=w.add('Gunther','JournalEntry',{worldProfile:{category:'contact',actorId:w.gunther.id}});
  await w.relations.sync();assert.equal(w.relations.relationshipsFor(projection.uuid)[0].otherUuid,w.elira.uuid);
});
test('GM-private sources do not leak relationships, evidence or review to players',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');await w.relations.sync();w.session.testUserPermission=()=>false;
  w.game.user={id:'player',isGM:false};let reads=0;const get=w.game.settings.get;w.game.settings.get=(...args)=>{reads++;return get(...args);};
  assert.equal(w.relations.snapshot().evidence.length,0);assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
  assert.equal(w.relations.review().length,0);assert.equal(reads,0,'player must never access GM ledger');
  await assert.rejects(()=>w.relations.decide('any','confirm'),/GM permission/);
});
test('Public explicit evidence is visible only with observable source page and both canonical endpoints',async()=>{
  const w=setup('Elira Voss is a friend of Gunther.');w.game.user={id:'player',isGM:false};
  assert.equal(relation(w,'FRIEND_OF').state,'current');
  w.gunther.testUserPermission=()=>false;assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
  w.gunther.testUserPermission=()=>true;w.page.testUserPermission=()=>false;assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
});
test('Public negative evidence prevents old positive relationship from appearing current to players',()=>{
  const w=setup('Elira Voss trusts Gunther.');source(w,'Elira Voss no longer trusts Gunther.',2);w.game.user={id:'player',isGM:false};
  assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
});
test('GM confirmation of a rumour remains private and never manufactures player-visible fact',async()=>{
  const w=setup('Elira Voss may be a friend of Gunther.');await w.relations.sync();await w.relations.decide(w.relations.review()[0].id,'confirm');
  assert.equal(relation(w,'FRIEND_OF').state,'current');w.game.user={id:'player',isGM:false};assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
});
test('Review confirms, retains possible, rejects or leaves unresolved without deleting evidence',async()=>{
  for(const [action,state,pending] of [['confirm','current',0],['possible','possible',0],['reject','rejected',0],['unresolved','possible',1]]) {
    const w=setup('Elira Voss may be a friend of Gunther.');await w.relations.sync();const row=w.relations.review()[0];
    await w.relations.decide(row.id,action);assert.equal(relation(w,'FRIEND_OF').state,state);assert.equal(w.relations.review().length,pending);
    assert.equal(w.relations.snapshot().evidence.length,1);assert.equal(w.relations.snapshot().evidence[0].status,'possible');
  }
});
test('Exact Blackbridge and Stonecross fixtures produce explicit role evidence on canonical identities',async()=>{
  const fixture=fs.readFileSync(path.join(root,'tests/fixtures/shadows-at-blackbridge.txt'),'utf8');
  const stonecross=fs.readFileSync(path.join(root,'tests/fixtures/the-bell-at-stonecross.txt'),'utf8');
  const w=world(fixture,true);w.add('Blackbridge militia','JournalEntry',{worldProfile:{category:'faction'}});
  await w.api.campaignMentionEvidence.sync();await w.api.campaignRelationshipEvidence.sync();
  const labels=new Set(w.api.campaignRelationshipEvidence.snapshot().evidence.map(row=>row.relationType));
  for(const type of ['QUARTERMASTER_OF','FRIEND_OF','OPERATES_FROM','INFORMANT_FOR','KNOWS','OWES_FAVOUR_TO','COMMANDER_OF'])assert.ok(labels.has(type),type);
  assert.equal(w.api.campaignRelationshipEvidence.snapshot().evidence.find(row=>row.relationType==='COMMANDER_OF').status,'asserted','warning not to trust Edric does not negate his commander role');
  source(w,stonecross,3);await w.api.campaignMentionEvidence.sync();await w.api.campaignRelationshipEvidence.sync();
  const rows=w.api.campaignRelationshipEvidence.snapshot().evidence;
  assert.ok(rows.some(row=>row.relationType==='KEEPER_OF' && /Mara/.test(row.sourceExcerpt)));
  assert.ok(rows.some(row=>row.relationType==='ACQUAINTANCE_OF' && /Mara/.test(row.sourceExcerpt)));
  assert.ok(!rows.some(row=>row.relationType==='MEMBER_OF' && /Toren/.test(row.sourceExcerpt) && row.status==='asserted'));
  const denial=rows.find(row=>row.relationType==='MEMBER_OF' && /Toren/.test(row.sourceExcerpt));
  assert.equal(denial.temporalScope,'current');assert.equal(denial.changeSemantics,null);
  const past=rows.find(row=>row.relationType==='INFORMANT_FOR' && /in the past/.test(row.sourceExcerpt));
  assert.equal(past.temporalScope,'historical');
  const debt=rows.find(row=>row.relationType==='OWES_FAVOUR_TO' && /Toren|Baran/.test(row.sourceExcerpt));
  assert.equal(debt.temporalScope,'current');assert.ok(!debt.sourceSpan.text.includes('earlier journey'));
  const profile=w.api.campaignRelationshipEvidence.relationshipsFor(past.objectUuid).find(row=>row.relationType==='INFORMANT_FOR' && row.otherUuid===past.subjectUuid);
  assert.equal(profile.state,'historical');assert.equal(profile.stateLabel,'Historical');
});
test('Session-only excerpt removal retains list preview, full data, Quest and clean GM review UX',()=>{
  const template=fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8');
  assert.ok(!template.includes('Chronicle excerpt'));assert.ok(!template.includes('{{selectedSession.bodyPreview}}'));
  assert.match(template,/\{\{listSummary\}\}/);assert.match(template,/Open Full Session/);
  assert.match(template,/data-action="openSourceAnalysis"/);assert.match(template,/data-action="decideRelationship"/);
  assert.match(template,/profileView.structuredRelationships/);assert.match(template,/worldProfileView.structuredRelationships/);
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  assert.match(main,/bodyPreview = truncate\(/);assert.match(main,/decideRelationship: this\._onDecideRelationship/);
});

test('Symmetric friend statements share a relationship while preserving both attributed evidences',async()=>{
  const w=setup('Elira Voss is a friend of Gunther. Gunther is an old friend of Elira Voss.');await w.relations.sync();
  assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,1);assert.equal(relation(w,'FRIEND_OF').history.length,2);
  assert.equal(w.relations.relationshipsFor(w.gunther.uuid).length,1);
});
test('Unrelated informant vocabulary cannot turn a separate person into an informant',async()=>{
  for(const name of ['Mara Venn','NotElira Voss']) {
    const w=setup(`${name}, an informant, arrived. Elira Voss is not a member of the Pale Wardens, but he has supplied them with information in the past.`);
    w.add(name,'Actor');await w.relations.sync();assert.equal(relation(w,'INFORMANT_FOR'),undefined);
    assert.equal(relation(w,'MEMBER_OF').state,'negative');
  }
});
test('Concurrent sync and decisions preserve the append-only decision history',async()=>{
  const w=setup('Elira Voss may be a friend of Gunther. Elira Voss might be a member of Pale Wardens.');await w.relations.sync();
  const [a,b]=w.relations.review();assert.ok(a && b);
  await Promise.all([w.relations.decide(a.id,'confirm'),w.relations.decide(b.id,'possible'),w.relations.sync()]);
  assert.equal(w.relations.snapshot().decisions.length,2);assert.equal(w.relations.snapshot().evidence.length,2);
  assert.equal(w.relations.review().length,0);
});
test('Second GM does not auto-write, source deletion preserves history, and unresolved endpoints are diagnosed',async()=>{
  const w=setup('Elira Voss is a friend of Gunther. Elira Voss knows Unknown Contact.');
  w.game.users.activeGM.id='other';await w.relations.sync();assert.equal(w.relations.snapshot().evidence.length,0);
  w.game.users.activeGM.id='gm';const result=await w.relations.sync();assert.ok(result.diagnostics.some(row=>row.reason==='object-not-resolved-or-unsupported-reference'));
  w.game.journal.contents=w.game.journal.contents.filter(row=>row.uuid!==w.session.uuid);await w.relations.sync();
  assert.equal(relation(w,'FRIEND_OF').state,'historical');assert.equal(w.relations.snapshot().evidence.length,1);
});
test('Analysis relationship actions call the existing GM-only evidence API and preserve canonical navigation',async()=>{
  const w=setup('Elira Voss may be a friend of Gunther.');await w.relations.sync();const item=w.relations.review()[0];
  const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
  const handler=main.slice(main.indexOf('  static async _onDecideRelationship('),main.indexOf('  static async _onResolveCampaignDecision('));
  vm.runInContext(`class RelationshipActions {${handler} static async render(){} }`,w.context);
  w.context.reviewButton={disabled:false,dataset:{evidenceId:item.id,relationshipDecision:'possible'}};
  await vm.runInContext('RelationshipActions._onDecideRelationship(null,reviewButton)',w.context);
  assert.equal(w.relations.review().length,0);assert.equal(w.context.reviewButton.disabled,false);
  assert.equal(relation(w,'FRIEND_OF').state,'possible');
});

test('Tome GM-only, undiscovered and permission-aware source/endpoint gates prevent derived fact leaks',()=>{
  const w=setup('Elira Voss is a friend of Gunther.');w.game.user={id:'player',isGM:false};
  w.session.flags.access={visibility:'gm'};assert.equal(w.relations.snapshot().evidence.length,0);
  w.session.flags.access={discovered:false};assert.equal(w.relations.snapshot().evidence.length,0);
  w.session.flags.access={discovered:true};w.gunther.flags.access={visibility:'gm'};assert.equal(w.relations.snapshot().evidence.length,0);
  w.gunther.flags.access={visibility:'inherit'};w.api.canView=doc=>doc.uuid!==w.session.uuid;
  assert.equal(w.relations.snapshot().evidence.length,0);
});

test('Following pronoun with two people never invents its canonical subject',async()=>{
  const w=setup('Elira Voss is a friend of Gunther. She works for the Pale Wardens.');await w.relations.sync();
  assert.equal(relation(w,'FRIEND_OF').state,'current');assert.equal(relation(w,'WORKS_FOR'),undefined);
});
test('Following pronoun with a unique grammatical person retains an explicit role',async()=>{
  const w=setup('Elira Voss is a quartermaster of Pale Wardens. She operates from Blackbridge Watch.');await w.relations.sync();
  assert.equal(relation(w,'OPERATES_FROM').otherUuid,w.place.uuid);
});

test('A visible namesake cannot replace the hidden canonical endpoint selected by a public source',()=>{
  const w=setup('Elira Voss is a friend of Gunther.');w.gunther.testUserPermission=()=>false;
  w.add('Gunther','Actor');w.game.user={id:'player',isGM:false};
  assert.equal(w.relations.snapshot().evidence.length,0);assert.equal(w.relations.relationshipsFor(w.elira.uuid).length,0);
});

test('Recognition only derives person knowledge when the source explicitly names an earlier shared journey',async()=>{
  const w=setup('Elira Voss recognized Gunther. Elira Voss recognised Blackbridge Watch from an earlier journey.');await w.relations.sync();
  assert.equal(relation(w,'KNOWS'),undefined);
  w.page.text.content='Elira Voss recognized Gunther from an earlier journey.';await w.relations.sync();
  assert.equal(relation(w,'KNOWS').otherUuid,w.gunther.uuid);
});
