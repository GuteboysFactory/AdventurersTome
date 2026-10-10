// Read-only, content-free startup telemetry. No document names, UUIDs or payloads.
const ATSP_ID = "adventurers-tome";
const atSpNow = () => globalThis.performance?.now?.() ?? Date.now();
let atSpStarted = atSpNow(), atSpLastWork = atSpStarted, atSpReady = false, atSpComplete = false, atSpPending = 0, atSpTimer;
const atSpStages = new Map(), atSpRuntime = new Map();
const atSpPhases = new Set(["source-identity-resolution","candidate-resolution","mention-discovery","new-entity-discovery","mention-sync","contact-projection","discovery-scan","discovery-compendiums","discovery-adapter","tome-ready","tome-render-context","private-vault","summary-repair","relationship-graph","relationship-extraction","relationship-sync","entity-intelligence","visible-document-pass","universal-registry","universal-bridge","universal-permission-read","universal-search-navigation","universal-explorer-catalog","universal-lifecycle","embedded-items-pass","universal-permission-pass","imported-source-identity","universal-takeover","universal-convergence-gate","universal-convergence-audit","universal-lifecycle-audit","imported-source-audit"]);
const atSpCounters = new Set(["coalescedCalls","calls","writes","documentsScanned","foldersScanned","recordsScanned","recordsRequiringMigration","recordsMigrated","vaultWrites","cleanupWrites","pagesScanned","pagesRequiringRepair","pagesRepaired","graphBuilds","sourcesExtracted","unchangedSyncs","indexBuilds","cacheHits","passes","fullWorldScans","registrations","actorsScanned","convergenceRuns","coreApiPublished"]);
const atSpSafeCounter = value => atSpCounters.has(value) || /^invalidations\.(?:api|adventurersTome(?:RelationshipEvidenceUpdated|CampaignMentionEvidenceUpdated|CampaignDiscoveryUpdated|CampaignEntityLinkChanged|CampaignLearningUpdated)|(?:create|update|delete)(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|Folder|User))$/.test(value) ? value : "other";
function atSpRow(name, runtime = atSpComplete) {
  const map = runtime ? atSpRuntime : atSpStages, key = atSpPhases.has(name) ? name : "other";
  if (!map.has(key)) map.set(key,{phase:key,calls:0,elapsedMs:0,counters:{}});
  return map.get(key);
}
function atSpFinish() {
  if (!atSpReady || atSpComplete || atSpPending) return;
  atSpComplete = true;
  atSpTotal = atSpLastWork - atSpStarted;
  if (game.user?.isGM) {
    console.info("Adventurer's Tome | Startup Profile (overlapping phases; elapsed client time)");
    console.table(atSpSnapshot().stages.map(row=>({phase:row.phase,calls:row.calls,ms:row.elapsedMs,...row.counters})));
    console.info(`Adventurer's Tome | Startup Profile TOTAL ${atSpTotal.toFixed(2)} ms`);
  }
}
let atSpTotal = 0;
function atSpSettle() {
  if (!atSpReady || atSpComplete) return;
  clearTimeout(atSpTimer);
  // Include deferred ready work and hook bursts without delaying Foundry startup.
  atSpTimer = setTimeout(atSpFinish,1000);
}
function atSpBegin(name) {
  const row=atSpRow(name);row.calls++;
  const token={row,started:atSpNow(),startup:!atSpComplete,ended:false,reviewToken:globalThis.AdventurersTomeReviewDecision?.beginPhase(name)};
  if (token.startup) atSpPending++;
  return token;
}
function atSpEnd(token) {
  if (!token || token.ended) return;
  token.ended=true;const elapsed=atSpNow()-token.started;token.row.elapsedMs+=elapsed;
  globalThis.AdventurersTomeReviewDecision?.endPhase(token.reviewToken);
  if(token.startup)atSpLastWork=atSpNow();
  if(token.startup)atSpPending--;
  atSpSettle();
}
function atSpCount(name,key,value=1) {
  const row=atSpRow(name),counter=atSpSafeCounter(String(key)),number=Number(value);
  if(Number.isFinite(number))row.counters[counter]=(row.counters[counter]||0)+number;
  globalThis.AdventurersTomeReviewDecision?.count(name,counter.startsWith("invalidations.")?"invalidations":counter,number);
  if(!atSpComplete)atSpLastWork=atSpNow();
  atSpSettle();
}
function atSpMeasure(name,work) {
  const token=atSpBegin(name);
  try {
    const result=work();
    if(result?.then)return Promise.resolve(result).finally(()=>atSpEnd(token));
    atSpEnd(token);return result;
  }catch(error){atSpEnd(token);throw error;}
}
function atSpSnapshot() {
  const rows=map=>[...map.values()].map(row=>({...row,elapsedMs:Number(row.elapsedMs.toFixed(2)),counters:{...row.counters}}));
  return {version:1,complete:atSpComplete,totalMs:Number((atSpComplete?atSpTotal:atSpNow()-atSpStarted).toFixed(2)),pending:atSpPending,stages:rows(atSpStages),runtime:rows(atSpRuntime)};
}
globalThis.AdventurersTomeStartup=Object.freeze({begin:atSpBegin,end:atSpEnd,count:atSpCount,measure:atSpMeasure,snapshot:atSpSnapshot});
Hooks.once("init",()=>{atSpStarted=atSpLastWork=atSpNow();});
Hooks.once("ready",()=>{
  const module=game.modules.get(ATSP_ID);if(module){module.api ||= {};module.api.startupPerformance=globalThis.AdventurersTomeStartup;}
  atSpReady=true;atSpLastWork=atSpNow();atSpSettle();
});
