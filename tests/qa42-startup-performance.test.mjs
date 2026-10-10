import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
import {profileWorld,migrationWorld,universalWorld} from './helpers/startup-world.mjs';
import {reviewWorld} from './helpers/review-world.mjs';
const root=path.resolve(import.meta.dirname,'..');
const stage=(w,name)=>w.profiler.snapshot().stages.find(row=>row.phase===name);

test('Source identity resolution uses individual Discovery lookups across repeated linked mentions',()=>{
 const w=profileWorld(),people=Array.from({length:28},(_,i)=>w.add(`Known person ${i}`,'Actor'));
 w.session.flags.campaignEntityLinksV1={actorUuids:people.map(p=>p.uuid),entityUuids:[]};
 const rows=[...Array.from({length:1419},(_,i)=>({name:`Other ${i}`,canonicalUuid:`Actor.other${i}`})),...people.map(p=>({name:p.name,canonicalUuid:p.uuid,kind:'character'}))];
 let snapshots=0,gets=0;w.api.discovery={snapshot:()=>{snapshots++;return structuredClone({entities:rows});},get:uuid=>{gets++;return structuredClone(rows.find(row=>row.canonicalUuid===uuid)||null);}};
 for(let i=0;i<120;i++){const result=w.api.campaignSourceScopedIdentity.resolveMention({text:people[i%28].name,sourceUuid:w.session.uuid});assert.equal(result.authorityUuid,people[i%28].uuid);assert.equal(result.sourceCanonical,true);}
 assert.equal(snapshots,0);assert.ok(gets>=28*120);assert.equal(stage(w,'source-identity-resolution').calls,120);
});

test('Targeted source lookup keeps same-name collisions ambiguous and projection identity reconciled',()=>{
 const w=profileWorld(),second=w.add(w.person.name,'Actor'),projection=w.add(w.person.name,'JournalEntry',{worldProfile:{category:'contact',sourceUuid:w.person.uuid},semanticProjection:{linkedUuid:w.person.uuid,kind:'contact'}});
 const rows=()=>[w.person,second,projection].map(p=>({name:p.name,canonicalUuid:p.uuid,kind:p.documentName==='Actor'?'character':'contact'}));
 w.api.discovery={get:uuid=>structuredClone(rows().find(row=>row.canonicalUuid===uuid)||null),snapshot:()=>{throw Error('Unexpected full snapshot');}};
 w.session.flags.campaignEntityLinksV1={actorUuids:[w.person.uuid,second.uuid],entityUuids:[]};
 assert.equal(w.api.campaignSourceScopedIdentity.resolveMention({text:w.person.name,sourceUuid:w.session.uuid}).identityAmbiguous,true);
 w.session.flags.campaignEntityLinksV1={actorUuids:[w.person.uuid],entityUuids:[projection.uuid]};
 const result=w.api.campaignSourceScopedIdentity.resolveMention({text:w.person.name,sourceUuid:w.session.uuid});assert.equal(result.authorityUuid,w.person.uuid);assert.equal(result.identityAmbiguous,false);
});

test('Source lookup observes replacement snapshots and falls back to live documents when a target disappears',()=>{
 const w=profileWorld();let entity={name:w.person.name,canonicalUuid:w.person.uuid,kind:'character'};
 w.api.discovery={get:uuid=>uuid===w.person.uuid?structuredClone(entity):null};
 const resolve=text=>w.api.campaignSourceScopedIdentity.resolveMention({text,sourceUuid:w.session.uuid});
 assert.equal(resolve(w.person.name).authorityUuid,w.person.uuid);
 w.person.name='Renamed person';entity={...entity,name:w.person.name};assert.equal(resolve(w.person.name).authorityUuid,w.person.uuid);assert.equal(resolve('Rhea North').authorityUuid,'');
 entity=null;assert.equal(resolve(w.person.name).authorityUuid,w.person.uuid);
 w.game.actors.contents=w.game.actors.contents.filter(p=>p!==w.person);assert.equal(resolve(w.person.name).authorityUuid,'');
});

test('Source lookup retains compatibility with snapshot-only Discovery providers',()=>{
 const w=profileWorld();w.api.discovery={snapshot:()=>({entities:[{name:'Alias from adapter',canonicalUuid:w.person.uuid,kind:'character'}]})};
 const result=w.api.campaignSourceScopedIdentity.resolveMention({text:'Alias from adapter',sourceUuid:w.session.uuid});assert.equal(result.authorityUuid,w.person.uuid);assert.equal(result.sourceCanonical,true);
});
test('First migration copies 18 private records before deleting only the legacy fields',async()=>{
 const w=migrationWorld();assert.equal((await w.migrate()).migrated,18);assert.equal(Object.keys(w.vault()).length,18);
 for(const doc of w.game.actors.contents.filter(doc=>doc.name.startsWith('Private record'))){assert.equal(Object.hasOwn(doc.flags.access,'gmNotes'),false);assert.equal(doc.flags.access.visibility,'gm');assert.equal(doc.flags.access.discovered,false);}
 assert.equal(w.writes.settings,1);assert.equal(w.writes.documents,18);assert.equal(stage(w,'private-vault').counters.recordsMigrated,18);
});
test('Immediate migration reload performs zero migration/writes and preserves exact stored vault',async()=>{
 const w=migrationWorld();await w.migrate();const saved=w.storage.get('gmPrivateVault');w.writes.settings=w.writes.documents=0;
 assert.equal((await w.migrate()).migrated,0);assert.equal(w.writes.settings,0);assert.equal(w.writes.documents,0);assert.equal(w.storage.get('gmPrivateVault'),saved);
});
test('Migration preserves every private note, fact and relation and all public profile content',async()=>{
 const w=migrationWorld(0),doc=w.person;Object.assign(doc.flags,{access:{notes:[{body:'Note retained'}]},actorProfile:{title:'Public role',facts:[{value:'Secret fact',visibility:'gm'},{value:'Public fact'}],relations:[{actorId:'other',visibility:'gm'},{actorId:'public'}]}});
 doc.update=changes=>w.writeAccess(doc,changes);
 // Reuse the Foundry-style deletion/merge writer from a migration fixture.
 doc.setFlag=async(_m,key,value)=>{if(key==='access'){delete doc.flags.access.notes;doc.flags.access.visibility=value.visibility;doc.flags.access.discovered=value.discovered;}else doc.flags[key]=structuredClone(value);};
 assert.equal((await w.migrate()).migrated,3);const saved=w.vault()[`actor:${doc.id}`];assert.equal(saved.notes[0].body,'Note retained');assert.equal(saved.facts[0].value,'Secret fact');assert.equal(saved.relations[0].actorId,'other');
 assert.equal(doc.flags.actorProfile.title,'Public role');assert.equal(doc.flags.actorProfile.facts[0].value,'Public fact');assert.equal(doc.flags.actorProfile.relations[0].actorId,'public');assert.equal((await w.migrate()).migrated,0);
});
test('Failed vault write does not delete any source data',async()=>{
 const w=migrationWorld(1),doc=w.game.actors.contents.at(-1);w.game.settings.set=async()=>{throw Error('Write failed');};await assert.rejects(()=>w.migrate());assert.ok(doc.flags.access.gmNotes);assert.equal(w.writes.documents,0);
});
test('Retry after failed cleanup does not duplicate notes or rewrite identical private data',async()=>{
 const w=migrationWorld(1),doc=w.game.actors.contents.at(-1);doc.flags.access={notes:[{body:'Original note without id or dates'}]};const save=doc.setFlag;doc.setFlag=async()=>{throw Error('Cleanup failed');};doc.update=async()=>{throw Error('Cleanup failed');};
 await assert.rejects(()=>w.migrate());const saved=w.storage.get('gmPrivateVault');assert.equal(w.vault()[`actor:${doc.id}`].notes.length,1);doc.setFlag=save;doc.update=changes=>w.writeAccess(doc,changes);w.writes.settings=0;
 assert.equal((await w.migrate()).migrated,0);assert.equal(w.vault()[`actor:${doc.id}`].notes.length,1);assert.equal(w.storage.get('gmPrivateVault'),saved);assert.equal(w.writes.settings,0);
});
test('New legacy records imported after successful migration are still discovered',async()=>{
 const w=migrationWorld(1);await w.migrate();w.game.actors.contents.at(-1).flags.access.gmNotes='Later private record';assert.equal((await w.migrate()).migrated,1);assert.equal(w.vault()[`actor:${w.game.actors.contents.at(-1).id}`].notes.length,2);
});
test('A player cannot migrate or read a GM vault',async()=>{
 const w=migrationWorld();w.game.user.isGM=false;assert.equal((await w.migrate()).migrated,0);assert.equal(w.writes.settings,0);assert.equal(w.writes.documents,0);assert.deepEqual(w.vault(),{});
});
test('Stable startup with duplicate sync signal builds graph and intelligence once',async()=>{
 const w=profileWorld();await w.api.campaignRelationshipEvidence.sync();w.api.entityIntelligence.profile(w.person.uuid);await w.api.campaignRelationshipEvidence.sync();w.api.entityIntelligence.profile(w.person.uuid);
 assert.equal(stage(w,'relationship-graph').counters.graphBuilds,1);assert.equal(stage(w,'entity-intelligence').counters.indexBuilds,1);assert.equal(stage(w,'visible-document-pass').counters.passes,1);assert.equal(stage(w,'entity-intelligence').counters.cacheHits,1);
});
test('Reload retains one build and performs zero relation writes or invalidation storm',async()=>{
 const first=profileWorld();await first.api.campaignRelationshipEvidence.sync();const w=profileWorld();for(const [k,v]of first.storage)w.storage.set(k,v);
 await w.api.campaignRelationshipEvidence.sync();w.api.entityIntelligence.profile(w.person.uuid);await w.api.campaignRelationshipEvidence.sync();w.api.entityIntelligence.profile(w.person.uuid);
 assert.equal(stage(w,'relationship-sync').counters.writes||0,0);assert.equal(w.api.entityIntelligence.diagnostics().builds,1);assert.equal(w.api.entityIntelligence.diagnostics().revision,0);
});
test('Legitimate page changes still rebuild relation evidence and intelligence',async()=>{
 const w=profileWorld();await w.api.campaignRelationshipEvidence.sync();w.api.entityIntelligence.profile(w.person.uuid);w.page.text.content='Rhea North no longer works for Copper Circle.';w.context.Hooks.callAll('updateJournalEntryPage',w.page);
 await w.api.campaignRelationshipEvidence.sync();const profile=w.api.entityIntelligence.profile(w.person.uuid);assert.equal(profile.relationships[0].polarity,'negative');assert.equal(w.api.entityIntelligence.diagnostics().builds,2);
});
test('Unchanged relation sync never emits another evidence-update/render trigger',async()=>{
 const w=profileWorld();let signals=0;w.context.Hooks.on('adventurersTomeRelationshipEvidenceUpdated',()=>signals++);await w.api.campaignRelationshipEvidence.sync();const stored=w.storage.get('campaignRelationshipEvidenceV1');
 for(let i=0;i<4;i++)await w.api.campaignRelationshipEvidence.sync();assert.equal(signals,1);assert.equal(w.storage.get('campaignRelationshipEvidenceV1'),stored);assert.equal(stage(w,'relationship-sync').counters.writes,1);
});
test('Entity Intelligence remains lazy: attaching API creates zero indexes until profile access',()=>{
 const w=profileWorld();assert.equal(w.api.entityIntelligence.diagnostics().builds,0);w.api.entityIntelligence.profile(w.person.uuid);assert.equal(w.api.entityIntelligence.diagnostics().builds,1);
});
test('Permission changes invalidate a previously built viewer projection',()=>{
 const w=profileWorld();w.api.entityIntelligence.profile(w.person.uuid);w.game.user.isGM=false;w.group.testUserPermission=()=>false;w.context.Hooks.callAll('updateUser',w.game.user);assert.equal(w.api.entityIntelligence.profile(w.group.uuid).available,false);
 assert.equal(JSON.stringify(w.profiler.snapshot()).includes('Copper Circle'),false);
});
test('Universal setup registers each layer once without a duplicate world scan',()=>{
 const w=universalWorld(profileWorld());w.setupUniversal();assert.equal(stage(w,'universal-registry').counters.fullWorldScans,1);
 for(const name of ['universal-permission-read','universal-search-navigation','universal-explorer-catalog','universal-lifecycle','imported-source-identity','universal-takeover','universal-convergence-gate'])assert.equal(stage(w,name).counters.registrations,1,name);
});
test('Universal convergence exposes measured permission and imported source passes',()=>{
 const w=universalWorld(profileWorld());w.api.universalDocuments.convergenceAudit();assert.equal(stage(w,'universal-convergence-audit').counters.convergenceRuns,1);assert.ok(stage(w,'universal-permission-pass').counters.documentsScanned>0);assert.equal(stage(w,'imported-source-audit').counters.documentsScanned,2);
});
test('Profiling emits only counts/timing/phase identifiers, never private contents, names or UUIDs',async()=>{
 const w=migrationWorld();await w.migrate();w.profiler.count('SecretPerson','SecretCounter');const text=JSON.stringify(w.profiler.snapshot());for(const secret of ['PRIVATE PAYLOAD','Private record','Copper Circle','Rhea North',w.session.uuid,w.person.uuid,'SecretPerson','SecretCounter'])assert.ok(!text.includes(secret),secret);
});
test('Profiler records synchronous/asynchronous failures without swallowing them or leaving pending tasks',async()=>{
 const w=profileWorld();assert.throws(()=>w.profiler.measure('failure',()=>{throw Error('Expected');}));await assert.rejects(()=>w.profiler.measure('async-failure',async()=>{throw Error('Expected');}));assert.equal(w.profiler.snapshot().pending,0);
});
test('Finished startup metrics remain frozen while runtime changes are counted separately',()=>{
 const w=profileWorld();w.profiler.count('startup','writes',0);w.finish();const before=JSON.stringify(w.profiler.snapshot().stages);w.profiler.measure('runtime-test',()=>w.profiler.count('runtime-test','writes'));assert.equal(JSON.stringify(w.profiler.snapshot().stages),before);assert.equal(w.profiler.snapshot().runtime[0].counters.writes,1);
});
test('Manifest loads telemetry before consumers with the stable 1.7.0 version',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'module.json'),'utf8'));assert.equal(manifest.version,'1.7.0');assert.equal(manifest.esmodules[0],'scripts/startup-performance.js');assert.equal(new Set(manifest.esmodules).size,manifest.esmodules.length);
});
test('Summary normalization no longer treats DOM serialization alone as repair',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/authoring-summary-sync.js'),'utf8');assert.ok(source.includes('html: changed ? host.innerHTML : source, changed'));assert.ok(!source.includes('changed || host.innerHTML !== source'));
 // Actual DOM normalization, cold/reload repair and content preservation are
 // also exercised in the headless browser startup fixture, not a mock parser.
});

test('Persisted access cleanup bypasses a setter that pre-merges deletion keys',async()=>{
 const w=migrationWorld(1),doc=w.game.actors.contents.at(-1);let persisted=structuredClone(doc.flags.access),setterCalls=0;
 doc.flags.access.extraPublicField='Keep';persisted.extraPublicField='Keep';
 // Model a flag setter consuming deletion keys locally before building its payload.
 doc.setFlag=async(_m,_key,value)=>{setterCalls++;for(const [key,v]of Object.entries(value)){if(key.startsWith('-='))delete doc.flags.access[key.slice(2)];else doc.flags.access[key]=v;}persisted={...persisted,...doc.flags.access};};
 doc.update=async changes=>{await w.writeAccess(doc,changes);persisted=structuredClone(doc.flags.access);};
 assert.equal((await w.migrate()).migrated,1);assert.equal(setterCalls,0);assert.equal(persisted.gmNotes,undefined);assert.equal(persisted.extraPublicField,'Keep');
 doc.flags.access=structuredClone(persisted);w.writes.documents=0;await w.migrate();assert.equal(w.writes.documents,0);
});
test('Already-copied legacy notes are removed once without another private-vault write',async()=>{
 const w=migrationWorld(1),doc=w.game.actors.contents.at(-1);const legacy=structuredClone(doc.flags.access);await w.migrate();doc.flags.access=legacy;w.writes.settings=w.writes.documents=0;
 assert.equal((await w.migrate()).migrated,0);assert.equal(w.writes.settings,0);assert.equal(w.writes.documents,1);
 await w.migrate();assert.equal(w.writes.documents,1);
});
test('Failed effective deletion is reported and the saved private copy remains retryable',async()=>{
 const w=migrationWorld(1),doc=w.game.actors.contents.at(-1);doc.update=async()=>{};
 await assert.rejects(()=>w.migrate(),/not removed/);assert.ok(doc.flags.access.gmNotes);assert.equal(w.vault()[`actor:${doc.id}`].notes.length,1);
 doc.update=changes=>w.writeAccess(doc,changes);assert.equal((await w.migrate()).migrated,0);assert.equal(doc.flags.access.gmNotes,undefined);
});
test('Concurrent startup relationship signals perform one extraction pass',async()=>{
 const w=profileWorld();await Promise.all(Array.from({length:7},()=>w.api.campaignRelationshipEvidence.sync()));
 assert.equal(stage(w,'relationship-extraction').calls,1);assert.equal(stage(w,'relationship-sync').counters.writes,1);
});
test('Concurrent global Memory signals perform one sync',async()=>{
 const w=profileWorld();const before=w.api.campaignMentionEvidence.audit().stats.syncs;
 await Promise.all(Array.from({length:7},()=>w.api.campaignMentionEvidence.sync({rescan:true})));
 assert.equal(w.api.campaignMentionEvidence.audit().stats.syncs-before,1);
});
test('A scoped relationship refresh waiting for startup work is not discarded',async()=>{
 const w=profileWorld();await Promise.all([w.api.campaignRelationshipEvidence.sync(),w.api.campaignRelationshipEvidence.sync({sourceUuid:w.session.uuid})]);
 assert.equal(stage(w,'relationship-extraction').calls,2);
});
test('A scoped Memory refresh waiting for global work is not discarded and later global sync remains available',async()=>{
 const w=profileWorld();const before=w.api.campaignMentionEvidence.audit().stats.syncs;
 await Promise.all([w.api.campaignMentionEvidence.sync(),w.api.campaignMentionEvidence.sync({sourceUuid:w.session.uuid})]);
 assert.equal(w.api.campaignMentionEvidence.audit().stats.syncs-before,2);
 await w.api.campaignMentionEvidence.sync();assert.equal(w.api.campaignMentionEvidence.audit().stats.syncs-before,3);
});

function contactProjection(w) {
 const source=fs.readFileSync(path.join(root,'scripts/semantic-contact-projection.js'),'utf8');
 vm.runInContext('{const GENERATED_FACT_SOURCE="semantic-contact-projection";const clean=v=>String(v||"").trim();const clone=v=>JSON.parse(JSON.stringify(v));const titleCase=v=>String(v||"");'+source.slice(source.indexOf('function generatedFacts('),source.indexOf('async function ensureOverview('))+'globalThis.testContactProjection=projectionProfile;}',w.context);
 return (group,profile={})=>w.context.testContactProjection(group,profile,{}).profile;
}
test('Contact projection does not regenerate GM-only UUID facts but retains canonical metadata',()=>{
 const w=migrationWorld(0),project=contactProjection(w),group={linkedUuid:w.person.uuid,target:{attributes:{profession:'Guide'}},relationships:[]};
 const profile=project(group);assert.equal(profile.sourceUuid,w.person.uuid);assert.equal(profile.actorId,w.person.id);assert.equal(profile.sourceDocumentType,'Actor');
 assert.equal(profile.facts.length,1);assert.equal(profile.facts[0].label,'Profession');assert.ok(!profile.facts.some(row=>row.visibility==='gm'||row.label==='Foundry Link'));
});
test('Contact regeneration and migration converge across three reloads after legacy link cleanup',async()=>{
 const w=migrationWorld(0),project=contactProjection(w),doc=w.group;const group={linkedUuid:w.person.uuid,target:{attributes:{profession:'Guide'}},relationships:[]};
 doc.flags.worldProfile=project(group);doc.flags.worldProfile.facts.push({label:'Foundry Link',value:w.person.uuid,visibility:'gm',source:'semantic-contact-projection'});
 doc.setFlag=async(_m,key,value)=>{w.writes.documents++;doc.flags[key]=structuredClone(value);};
 assert.equal((await w.migrate()).migrated,1);const saved=w.storage.get('gmPrivateVault');
 for(let reload=0;reload<3;reload++){
  const before=JSON.stringify(doc.flags.worldProfile);doc.flags.worldProfile=project(group,doc.flags.worldProfile);assert.equal(JSON.stringify(doc.flags.worldProfile),before);
  w.writes.settings=w.writes.documents=0;assert.equal((await w.migrate()).migrated,0);assert.equal(w.writes.settings,0);assert.equal(w.writes.documents,0);assert.equal(w.storage.get('gmPrivateVault'),saved);
 }
 assert.equal(w.vault()[`journalentry:${doc.id}`].facts.length,1);assert.equal(doc.flags.worldProfile.sourceUuid,w.person.uuid);
});
test('Projection preserves authored facts and removes only its own prior generated facts',()=>{
 const w=migrationWorld(0),project=contactProjection(w),custom={label:'GM authored connection',value:'Retain privately',visibility:'gm'};
 const profile=project({linkedUuid:w.person.uuid,target:{attributes:{location:'Valley'}},relationships:[]},{facts:[custom,{label:'Foundry Link',value:w.person.uuid,visibility:'gm',source:'semantic-contact-projection'}]});
 assert.equal(profile.facts.length,2);assert.deepEqual(JSON.parse(JSON.stringify(profile.facts[0])),custom);assert.equal(profile.facts[1].label,'Location');
});
test('A later Contact canonical link change updates identity metadata without private-fact churn',()=>{
 const w=migrationWorld(0),project=contactProjection(w);const first=project({linkedUuid:w.person.uuid,relationships:[]});
 const second=project({linkedUuid:'Actor.other',relationships:[]},first);assert.equal(second.sourceUuid,'Actor.other');assert.equal(second.actorId,'other');assert.equal(second.facts.length,0);
});

function discoveryRuntimeWorld(){
 const w=universalWorld(profileWorld()),timers=new Map();let serial=0;w.context.window.setTimeout=fn=>{timers.set(++serial,fn);return serial;};w.context.window.clearTimeout=id=>timers.delete(id);
 const hooks=w.context.Hooks,ready=[];w.context.Hooks={...hooks,once:(name,fn)=>{if(name==='ready')ready.push(fn);}};
 const source=fs.readFileSync(path.join(root,'scripts/universal-campaign-discovery.js'),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext('{'+source+'}',w.context);w.context.Hooks=hooks;for(const fn of ready)fn();timers.clear();
 w.tick=()=>{const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();};w.timers=timers;return w;
}

test('Unchanged registry scans do not restart downstream analysis but same-size changes do',async()=>{
 const w=discoveryRuntimeWorld();let updates=0;w.context.Hooks.on('adventurersTomeCampaignDiscoveryUpdated',()=>updates++);
 await w.api.discovery.scan();await w.api.discovery.scan();assert.equal(updates,1);
 w.person.name='New known name';w.context.universalDocumentRegistryApi().rebuild();await w.api.discovery.scan();assert.equal(updates,2);
 w.game.user.isGM=false;w.person.testUserPermission=()=>false;w.person.visible=false;await w.api.discovery.scan();assert.equal(updates,3);
});

test('Discovery identity projection returns fresh detached alias fields without full profiles',async()=>{
 const w=discoveryRuntimeWorld();await w.api.discovery.scan();const rows=w.api.discovery.identityCandidates();
 assert.ok(rows.length);assert.ok(rows.every(row=>Object.keys(row).every(key=>['name','canonicalUuid','kind','aliases'].includes(key))));
 rows[0].name='Mutated outside';assert.notEqual(w.api.discovery.identityCandidates()[0].name,'Mutated outside');
 w.person.name='Updated inside';w.context.universalDocumentRegistryApi().rebuild();await w.api.discovery.scan();assert.equal(w.api.discovery.identityCandidates().find(row=>row.canonicalUuid===w.person.uuid).name,w.person.name);
});

test('Candidate resolver consumes identity fields without copying full Discovery snapshots',async()=>{
 const w=profileWorld();let snapshots=0,projections=0;
 w.api.discovery={get:()=>null,snapshot:()=>{snapshots++;throw Error('Full Discovery clone forbidden');},identityCandidates:()=>{projections++;return [{name:'External alias',canonicalUuid:w.person.uuid,kind:'character',aliases:['Recognized alias']}];}};
 const result=await w.api.campaignEntityCreation.resolveCandidates([{text:'External alias',sourceJournalUuid:w.session.uuid,classification:{kind:'character'}}],{allowCreate:false});
 assert.equal(result[0].outcome,'LINKED');assert.equal(result[0].targetUuid,w.person.uuid);assert.equal(snapshots,0);assert.ok(projections>0);
});

test('Bounded fuzzy name matching preserves the exact previous acceptance thresholds',()=>{
 const w=profileWorld(),source=fs.readFileSync(path.join(root,'scripts/campaign-confirmed-entity-creation.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function nameSimilarity('),source.indexOf('function assessExistingMatch(')),w.context);
 const exact=(left,right)=>{let previous=Array.from({length:right.length+1},(_,i)=>i);for(let i=1;i<=left.length;i++){const current=[i];for(let j=1;j<=right.length;j++)current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));previous=current;}return 1-previous[right.length]/Math.max(left.length,right.length);};
 const names=['Toren Vale','Toren Valen','Toran Vale','Elira Voss','Elira Vos','Rhea North','Captain Edric Vane','Captain Edric Van','Blackbridge','Stonecross','Baran','Arne','Citronimus','Entity 1000'];
 for(const left of names)for(const right of names)for(const threshold of [.85,.7])assert.equal(w.context.nameSimilarity(left,right,threshold)>=threshold,exact(left,right)>=threshold,`${left} / ${right} @ ${threshold}`);
});

test('Repeated mention and candidate scans notify once; edited evidence with the same names notifies again',async()=>{
 const w=reviewWorld(1);let mentions=0,candidates=0;w.context.Hooks.on('adventurersTomeSemanticMentionDiscoveryUpdated',()=>mentions++);w.context.Hooks.on('adventurersTomeNewEntityDiscoveryUpdated',()=>candidates++);
 await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();
 await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();assert.equal(mentions,1);assert.equal(candidates,1);
 w.page.text.content='Rhea North left Copper Watch at midnight. Vale remained behind.';
 await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();assert.equal(mentions,2);assert.equal(candidates,2);
});

test('Silent discovery refresh does not swallow the next non-silent update',async()=>{
 const w=reviewWorld(1);let mentions=0,candidates=0;w.context.Hooks.on('adventurersTomeSemanticMentionDiscoveryUpdated',()=>mentions++);w.context.Hooks.on('adventurersTomeNewEntityDiscoveryUpdated',()=>candidates++);
 await w.api.campaignMentionDiscovery.scan({silent:true});await w.api.campaignNewEntityDiscovery.scan({silent:true});assert.equal(mentions,0);assert.equal(candidates,0);
 await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();assert.equal(mentions,1);assert.equal(candidates,1);
});

test('Analysis signals converge and unchanged reprocessing does not enqueue another Memory cycle',async()=>{
 const w=reviewWorld(1);await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();await w.drain();
 const before=w.api.campaignMentionEvidence.audit().stats.syncs;
 await w.api.campaignMentionDiscovery.scan();await w.api.campaignNewEntityDiscovery.scan();await w.drain();assert.equal(w.api.campaignMentionEvidence.audit().stats.syncs,before);
 w.page.text.content+=' Toren Vale entered Copper Watch.';w.context.Hooks.callAll('updateJournalEntryPage',w.page,{text:{content:w.page.text.content}},{});await w.drain();assert.ok(w.api.campaignMentionEvidence.audit().stats.syncs>before);
});
test('Eight overlapping Discovery callers share one compendium and adapter scan',async()=>{
 const w=discoveryRuntimeWorld();let release,reads=0,adapters=0;const gate=new Promise(r=>release=r);
 w.game.packs=[{getIndex:async()=>{reads++;await gate;return [];}}];w.api.adapters={capabilities:['entityDiscovery'],execute:async()=>{adapters++;return [];}};
 const jobs=Array.from({length:8},()=>w.api.discovery.scan());await new Promise(r=>setImmediate(r));assert.equal(reads,1);release();await Promise.all(jobs);
 assert.equal(w.api.discovery.audit().stats.scans,1);assert.equal(adapters,w.game.actors.contents.length);assert.equal(stage(w,'discovery-scan').counters.coalescedCalls,7);
 assert.equal(stage(w,'discovery-compendiums').calls,1);assert.equal(stage(w,'discovery-adapter').calls,w.game.actors.contents.length);
});
test('A real registry change during Discovery produces one fresh trailing pass',async()=>{
 const w=discoveryRuntimeWorld();let release,reads=0;const gate=new Promise(r=>release=r);w.game.packs=[{getIndex:async()=>{reads++;if(reads===1)await gate;return [];}}];
 w.context.Hooks.callAll('adventurersTomeUniversalRegistryRebuilt',{});w.tick();await new Promise(r=>setImmediate(r));
 for(let i=0;i<7;i++)w.context.Hooks.callAll('adventurersTomeUniversalRegistryRebuilt',{});assert.equal(w.timers.size,0);
 release();await new Promise(r=>setImmediate(r));assert.equal(w.timers.size,1);w.tick();await new Promise(r=>setImmediate(r));assert.equal(reads,2);assert.equal(w.timers.size,0);
});
test('Completed Discovery remains rescannable and caller options are retained',async()=>{
 const w=discoveryRuntimeWorld();let reads=0;w.game.packs=[{getIndex:async()=>{reads++;return [];}}];await w.api.discovery.scan({includeCompendiums:false});assert.equal(reads,0);await w.api.discovery.scan();await w.api.discovery.scan();assert.equal(reads,2);
});
test('Discovery does not coalesce different viewers or custom adapter contexts',async()=>{
 const w=discoveryRuntimeWorld();await Promise.all([w.api.discovery.scan({user:{id:'one',isGM:true}}),w.api.discovery.scan({user:{id:'two',isGM:false}})]);assert.equal(w.api.discovery.audit().stats.scans,2);
 await Promise.all([w.api.discovery.scan({context:{feature:'one'}}),w.api.discovery.scan({context:{feature:'two'}})]);assert.equal(w.api.discovery.audit().stats.scans,4);
});
test('Embedded Item lookup resolves by Actor and Item without a global item pass',()=>{
 const w=universalWorld(profileWorld());const item={id:'i1',uuid:w.person.uuid+'.Item.i1',parent:w.person,documentName:'Item'};w.person.items={contents:[item],get:id=>id==='i1'?item:null};
 const before=stage(w,'embedded-items-pass')?.calls||0;assert.equal(w.api.universalDocuments.resolve(item.uuid),item);assert.equal(w.api.universalDocuments.has(item.uuid),true);assert.equal(w.api.universalDocuments.get(item.uuid).uuid,item.uuid);
 assert.equal(w.api.universalDocuments.resolve('Actor.missing.Item.i1'),null);assert.equal(w.api.universalDocuments.resolve('JournalEntry.missing'),null);assert.equal(stage(w,'embedded-items-pass')?.calls||0,before);
});
test('Embedded Item resolution rechecks current permission and returns fresh replacement/removal',()=>{
 const w=universalWorld(profileWorld());const item={id:'i1',uuid:w.person.uuid+'.Item.i1',parent:w.person,documentName:'Item',testUserPermission:()=>true};w.person.items={contents:[item],get:()=>w.person.items.contents[0]};
 assert.equal(w.api.universalDocuments.resolve(item.uuid),item);w.person.items.contents=[];assert.equal(w.api.universalDocuments.resolve(item.uuid),null);
 w.person.items.contents=[{...item,testUserPermission:()=>false,visible:false}];w.game.user.isGM=false;assert.equal(w.api.universalDocuments.resolve(item.uuid),null);
});
