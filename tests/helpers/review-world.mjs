import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {performance} from 'node:perf_hooks';import {profileWorld} from './startup-world.mjs';
const root=path.resolve(import.meta.dirname,'../..');
export function reviewWorld({sources=4,main=null}={}) {
 const w=profileWorld('The scouts travelled north. Vale remained behind.'),ready=[],originalHooks=w.context.Hooks;w.context.performance={now:()=>performance.now()};
 w.context.Hooks={...originalHooks,once:(event,fn)=>{if(event==='ready')ready.push(fn);}};
 w.context.document.addEventListener=()=>{};w.context.document.getElementById=()=>({});w.context.document.head={append(){}};w.context.document.querySelectorAll=()=>[];
 function load(file){vm.runInContext(`{${fs.readFileSync(path.join(root,'scripts',file),'utf8')}}`,w.context,{filename:file});}
 // Real canonical writes and semantic-source discovery, rather than link mocks.
 load('campaign-entity-links.js');load('campaign-link-semantic-discovery.js');
 if(fs.existsSync(path.join(root,'scripts/review-decision-performance.js')))load('review-decision-performance.js');
 for(const fn of ready)fn();w.context.Hooks=originalHooks;
 const scheduled=new Map();let timerId=0;w.context.window.setTimeout=callback=>{scheduled.set(++timerId,callback);return timerId;};w.context.window.clearTimeout=id=>scheduled.delete(id);w.scheduled=scheduled;
 w.drain=async()=>{for(let pass=0;pass<12;pass++){const callbacks=[...scheduled.values()];scheduled.clear();for(const callback of callbacks)callback();for(let tick=0;tick<8;tick++)await new Promise(resolve=>setImmediate(resolve));if(!scheduled.size)return;}throw Error('Scheduled work did not converge');};
 for(let i=1;i<sources;i++){const journal=w.add(`Source ${i}`,'JournalEntry',{type:'session'});const page={...w.page,id:`p${i}`,uuid:`${journal.uuid}.JournalEntryPage.p${i}`,parent:journal,text:{content:w.page.text.content}};journal.pages={contents:[page]};w.docs.set(page.uuid,page);}
 w.target=w.add('Copper Watch','JournalEntry',{worldProfile:{category:'location'}});
 w.errors=[];w.context.ui.notifications.error=message=>w.errors.push(message);
 w.api.folderQuickCreate={...w.api.folderQuickCreate,quickCreate:async(folder,options)=>{const doc=w.add(options.initialName,'JournalEntry',{worldProfile:{category:folder.id}});w.trackDocument(doc);w.context.Hooks.callAll('createJournalEntry',doc);return doc;}};
 w.counts={JournalEntry:0,JournalEntryPage:0,Actor:0,Item:0,hooks:0,renders:0,fullScans:0,sourceScans:0,analysisRuns:0,discoveryScans:0,compendiumScans:0};w.timings={};
 w.trackDocument=doc=>{if(!doc.update)return;const update=doc.update;doc.update=async(changes,options={})=>{w.counts[doc.documentName]=(w.counts[doc.documentName]||0)+1;await update(changes);w.context.Hooks.callAll(`update${doc.documentName}`,doc,changes,options);};};
 for(const doc of w.docs.values())w.trackDocument(doc);
 const discovery=w.api.discovery;w.api.discovery={...discovery,scan:async options=>{w.counts.discoveryScans++;if(options?.includeCompendiums)w.counts.compendiumScans++;return discovery.scan(options);}};
 const fire=w.context.Hooks.callAll;w.context.Hooks.callAll=(...args)=>{w.counts.hooks++;return fire(...args);};
 function wrap(api,name,phase){const base=w.api[api];w.api[api]={...base,[name]:async(...args)=>{const started=performance.now();const result=await base[name](...args);w.timings[phase]=(w.timings[phase]||0)+performance.now()-started;return result;}};}
 for(const [api,name,phase] of [['campaignEntityLinks','linkCanonical','canonical-write'],['campaignReviewLearning','chooseForSource','decision-save'],['campaignReviewLearning','ignoreOnce','decision-save'],['campaignReviewLearning','confirm','decision-save'],['campaignEntityCreation','apply','creation'],['campaignMentionEvidence','sync','memory-refresh'],['campaignRelationshipEvidence','sync','relationship-refresh']])wrap(api,name,phase);
 for(const api of ['campaignMentionDiscovery','campaignNewEntityDiscovery']){const base=w.api[api];w.api[api]={...base,scan:async(options={})=>{w.counts.analysisRuns++;w.counts[options.sourceUuid?'sourceScans':'fullScans']++;return base.scan(options);}};}
 const source=main||fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');w.context.normalizeImportName=x=>String(x||'').toLowerCase();w.context.getActorProfile=doc=>doc.getFlag('','actorProfile')||{};w.context.getWorldProfile=doc=>doc.getFlag('','worldProfile')||{};w.context.resolveWorldActor=()=>null;w.context.WORLD_CATEGORIES={};
 vm.runInContext(source.slice(source.indexOf('function campaignMemoryTargetMeta('),source.indexOf('function campaignMentionHistoryForWorld(')),w.context);
 const methods=source.slice(source.indexOf('  static async _onLinkExistingCampaignIdentity('),source.indexOf('  static async _onBrowseBackground('));
 vm.runInContext(`globalThis.DecisionActions=class {${methods}};`,w.context);
 w.app={constructor:w.context.DecisionActions,rendered:true,render:async()=>{w.counts.renders++;const started=performance.now();w.memory=w.context.campaignMemorySearchView();w.queue=w.context.campaignAnalysisView(w.memory);w.timings.context=(w.timings.context||0)+performance.now()-started;w.api.entityIntelligence.profile(w.target.uuid);}};w.api.app=()=>w.app;
 w.button=mode=>({disabled:false,dataset:{decisionMode:mode,decisionText:'Vale',sourceUuid:w.session.uuid,targetUuid:w.target.uuid,targetName:w.target.name},closest:()=>({querySelector:()=>({value:'location'})})});
 w.act=(mode,button=w.button(mode))=>w.context.DecisionActions._onResolveCampaignDecision.call(w.app,{timeStamp:performance.now()},button);
 w.undo=()=>w.context.DecisionActions._onUndoCampaignDecision.call(w.app);
 return w;
}
