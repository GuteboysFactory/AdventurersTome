const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-campaign-review-learning";
const VERSION = 3;
const SETTING_KEY = "campaignIntelligenceLearning";

const ACTIONS = Object.freeze({
  CONFIRMED:"confirmed",
  SUPPRESSED:"suppressed",
  LINKED:"linked",
  CREATED:"created",
  SOURCE_IGNORED:"source-ignored"
});

let writes = 0;
let failures = 0;
let lastError = "";

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function emptyState() {
  return {
    version:VERSION,
    decisions:{},
    sourceIgnores:{},
    sourceChoices:{},
    nameDefaults:{},
    pausedIdentities:{},
    decisionHistory:[]
  };
}

function parseState(raw) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      version:VERSION,
      decisions:parsed.decisions && typeof parsed.decisions === "object" ? parsed.decisions : {},
      sourceIgnores:parsed.sourceIgnores && typeof parsed.sourceIgnores === "object" ? parsed.sourceIgnores : {},
      sourceChoices:parsed.sourceChoices && typeof parsed.sourceChoices === "object" ? parsed.sourceChoices : {},
      nameDefaults:parsed.nameDefaults && typeof parsed.nameDefaults === 'object' ? parsed.nameDefaults : {},
      pausedIdentities:parsed.pausedIdentities && typeof parsed.pausedIdentities === 'object' ? parsed.pausedIdentities : {},
      decisionHistory:Array.isArray(parsed.decisionHistory) ? parsed.decisionHistory.slice(-10) : []
    };
  } catch (_error) {
    return emptyState();
  }
}

function readState() {
  if (!game.user?.isGM) return emptyState();
  try {
    return parseState(game.settings.get(MODULE_ID, SETTING_KEY));
  } catch (_error) {
    return emptyState();
  }
}

async function writeState(state, reason = "update") {
  if (!game.user?.isGM) throw new Error("Campaign Intelligence learning is GM-only.");
  try {
    const payload = {
      version:VERSION,
      decisions:state?.decisions || {},
      sourceIgnores:state?.sourceIgnores || {},
      sourceChoices:state?.sourceChoices || {},
      nameDefaults:state?.nameDefaults || {},
      pausedIdentities:state?.pausedIdentities || {},
      decisionHistory:state?.decisionHistory || []
    };
    await game.settings.set(MODULE_ID, SETTING_KEY, JSON.stringify(payload));
    writes += 1;
    globalThis.AdventurersTomeReviewDecision?.count("decision-save","writes");
    Hooks.callAll("adventurersTomeCampaignLearningUpdated", {
      reason,
      writes,
      summary:summary(payload)
    });
    return clone(payload);
  } catch (error) {
    failures += 1;
    lastError = String(error?.message || error);
    throw error;
  }
}

function decisionFor(text, { sourceUuid = "" } = {}) {
  const key = normalize(text);
  if (!key) return null;
  const state = readState();
  const sourceKey = clean(sourceUuid);
  const sourceDecision = sourceKey ? state.sourceIgnores?.[sourceKey]?.[key] || null : null;
  if (sourceDecision) return clone({ ...sourceDecision, action:ACTIONS.SOURCE_IGNORED });
  const sourceChoice = sourceKey ? state.sourceChoices?.[sourceKey]?.[key] : null;
  if (sourceChoice && !isSourceTargetRemoved(sourceKey,sourceChoice.targetUuid)) return clone({ ...sourceChoice, sourceChoice:true });
  const preferred=Object.hasOwn(state.nameDefaults,key) ? state.nameDefaults[key] : null;
  if(preferred && !isPaused(preferred.targetUuid) && !isSourceTargetRemoved(sourceKey,preferred.targetUuid))return clone({...preferred,action:ACTIONS.LINKED,campaignDefault:true,sourceUuid:sourceKey});
  const globalDecision = state.decisions?.[key] || null;
  if(globalDecision?.targetUuid && (isSourceTargetRemoved(sourceKey,globalDecision.targetUuid) || isSourceTargetRemoved(globalDecision.sourceUuid,globalDecision.targetUuid)))return null;
  return globalDecision ? clone(globalDecision) : null;
}

// Historical choices are evidence, not campaign-wide aliases. Leave the legacy
// decision API unchanged; only the resolver opts into this conservative lookup.
function historicalChoiceFor(text, { sourceUuid="" } = {}) {
  if(!game.user?.isGM)return null;
  const key=normalize(text),state=readState();
  if(!key)return null;
  const identity=game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation;
  const authorities=new Map();
  for(const [source,choices] of Object.entries(state.sourceChoices || {})) {
    const choice=choices?.[key];
    if(source===sourceUuid || !choice?.targetUuid || isPaused(choice.targetUuid) || isSourceTargetRemoved(source,choice.targetUuid))continue;
    const uuid=identity?.identityFor?.({canonicalUuid:choice.targetUuid})?.authorityUuid || choice.targetUuid;
    if(!authorities.has(uuid))authorities.set(uuid,{...choice,targetUuid:uuid,historicalChoice:true,historySources:[]});
    authorities.get(uuid).historySources.push(source);
  }
  const legacy=state.decisions?.[key];
  if(legacy?.action===ACTIONS.LINKED && legacy.targetUuid && !isPaused(legacy.targetUuid) && !isSourceTargetRemoved(legacy.sourceUuid,legacy.targetUuid)) {
    const uuid=identity?.identityFor?.({canonicalUuid:legacy.targetUuid})?.authorityUuid || legacy.targetUuid;
    if(!authorities.has(uuid))authorities.set(uuid,{...legacy,targetUuid:uuid,historicalChoice:true,legacyChoice:true,historySources:[]});
    if(legacy.sourceUuid && !authorities.get(uuid).historySources.includes(legacy.sourceUuid))authorities.get(uuid).historySources.push(legacy.sourceUuid);
  }
  if(!authorities.size)return null;
  const targets=[...authorities.values()];
  const selected=targets.length===1 ? targets[0] : null;
  // A new independent namesake makes previous usage insufficient evidence.
  const documents=new Map();
  if(selected)for(const collection of [game.actors,game.items,game.journal,game.scenes,...(game.collections?.values?.() || [])])for(const doc of collection?.contents || []) {
    if(doc?.uuid && !doc.parent && !["Folder","User","ChatMessage","Combat","Setting"].includes(doc.documentName))documents.set(doc.uuid,doc);
  }
  const collisions=[...documents.values()]
    .filter(doc=>{
      if(isPaused(doc.uuid))return false;
      const profile=doc.getFlag?.(MODULE_ID,doc.documentName==="Actor" ? "actorProfile" : "worldProfile") || {};
      const aliases=[doc.getFlag?.(MODULE_ID,"aliases"),profile.aliases].flatMap(value=>Array.isArray(value) ? value : typeof value==="string" ? value.split(/[,;\n]/) : []);
      return [doc.name,...aliases].some(name=>normalize(name)===key);
    })
    .filter(doc=>(identity?.identityFor?.({canonicalUuid:doc.uuid})?.authorityUuid || doc.uuid)!==selected.targetUuid);
  if(!selected || collisions.length)return clone({historicalAmbiguous:true,historySources:targets.flatMap(row=>row.historySources),targets:[...targets,...collisions.map(doc=>({targetUuid:doc.uuid,targetName:doc.name,targetKind:doc.documentName}))]});
  return clone(selected);
}

function summary(state = readState()) {
  const decisions = Object.values(state?.decisions || {});
  let sourceIgnoreCount = 0;
  for (const values of Object.values(state?.sourceIgnores || {})) {
    sourceIgnoreCount += Object.keys(values || {}).length;
  }
  return {
    confirmed:decisions.filter((row) => row?.action === ACTIONS.CONFIRMED).length,
    suppressed:decisions.filter((row) => row?.action === ACTIONS.SUPPRESSED).length,
    linked:decisions.filter((row) => row?.action === ACTIONS.LINKED).length,
    created:decisions.filter((row) => row?.action === ACTIONS.CREATED).length,
    campaignLinked:decisions.filter((row) => row?.campaignLinked === true).length,
    sourceIgnored:sourceIgnoreCount
  };
}

function gmStamp(extra = {}) {
  return {
    ...extra,
    updatedAt:Date.now(),
    updatedBy:clean(game.user?.id)
  };
}

async function confirm({ text, kind = "unknown", sourceUuid = "" } = {}) {
  const key = normalize(text);
  if (!key) throw new Error("A candidate name is required.");
  const state = readState();
  state.decisions[key] = gmStamp({
    action:ACTIONS.CONFIRMED,
    text:clean(text),
    kind:clean(kind || "unknown").toLowerCase(),
    sourceUuid:clean(sourceUuid)
  });
  if (sourceUuid && state.sourceIgnores?.[sourceUuid]?.[key]) {
    delete state.sourceIgnores[sourceUuid][key];
    if (!Object.keys(state.sourceIgnores[sourceUuid]).length) delete state.sourceIgnores[sourceUuid];
  }
  return writeState(state, "confirm");
}

async function suppress({ text } = {}) {
  const key = normalize(text);
  if (!key) throw new Error("A candidate name is required.");
  const state = readState();
  state.decisions[key] = gmStamp({
    action:ACTIONS.SUPPRESSED,
    text:clean(text)
  });
  return writeState(state, "suppress");
}

async function ignoreOnce({ text, sourceUuid } = {}) {
  const key = normalize(text);
  const sourceKey = clean(sourceUuid);
  if (!key || !sourceKey) throw new Error("Candidate name and source UUID are required.");
  const state = readState();
  if (!state.sourceIgnores[sourceKey] || typeof state.sourceIgnores[sourceKey] !== "object") {
    state.sourceIgnores[sourceKey] = {};
  }
  state.sourceIgnores[sourceKey][key] = gmStamp({
    action:ACTIONS.SOURCE_IGNORED,
    text:clean(text),
    sourceUuid:sourceKey
  });
  return writeState(state, "ignore-once");
}

function discoveryEntities() {
  const snapshot = game.modules.get(MODULE_ID)?.api?.discovery?.snapshot?.() || null;
  return (snapshot?.entities || [])
    .filter((entity) => clean(entity?.canonicalUuid) && clean(entity?.name))
    .map((entity) => ({
      uuid:clean(entity.canonicalUuid),
      name:clean(entity.name),
      kind:clean(entity.kind || "entity"),
      state:clean(entity.state),
      authority:clean(entity.authority)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang, { numeric:true }));
}

function typeFamily(kind) {
  const value = normalize(kind);
  if (/^(person|contact|character|actor|npc|adventurer)$/.test(value)) return "person";
  if (/^(faction|organization|organisation)$/.test(value)) return "faction";
  if (/^(location|place|scene)$/.test(value)) return "location";
  if (/^(lore|journal|journalentry)$/.test(value)) return "lore";
  return value;
}

function searchTargets(rows, { query = "", kind = "all" } = {}) {
  if (!game.user?.isGM) return [];
  const terms = normalize(query).split(" ").filter(Boolean);
  return clone(rows.filter(row=>(kind === "all" || typeFamily(row.kind) === typeFamily(kind)) && terms.every(term=>row.searchText.includes(term)))
    .sort((a,b)=>a.name.localeCompare(b.name,game.i18n?.lang,{numeric:true}) || a.uuid.localeCompare(b.uuid)));
}

// A transient view of existing world documents, never a second identity registry.
function linkTargets({ query = "", kind = "all" } = {}) {
  if (!game.user?.isGM) return [];
  const api = game.modules.get(MODULE_ID)?.api;
  const documents = new Map();
  const collections = [game.actors, game.items, game.journal, game.scenes, ...(game.collections?.values?.() || [])];
  for (const collection of collections) for (const doc of collection?.contents || []) {
    if (doc?.uuid && clean(doc.name) && !doc.parent && typeof doc.update === "function"
      && !["Folder","User","ChatMessage","Combat","Setting"].includes(doc.documentName)) documents.set(doc.uuid,doc);
  }
  const candidates = [...discoveryEntities(), ...[...documents.values()].map(doc=>({uuid:doc.uuid,name:doc.name,kind:doc.documentName}))];
  const rows = new Map();
  for (const candidate of candidates) {
    const uuid = api?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:candidate.uuid})?.authorityUuid || candidate.uuid;
    const doc = documents.get(uuid);
    if (!doc) continue;
    const profile = doc.getFlag?.(MODULE_ID,"worldProfile") || doc.getFlag?.(MODULE_ID,"actorProfile") || {};
    const category = doc.documentName === "Actor" ? "person" : doc.documentName === "Item" ? "item"
      : doc.documentName === "Scene" ? "location" : profile.category || doc.getFlag?.(MODULE_ID,"type") || candidate.kind;
    const aliases = [doc.getFlag?.(MODULE_ID,"aliases"),profile.aliases].flatMap(value=>Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : []);
    const metadata = [doc.folder?.name,profile.title,profile.subtitle,profile.summary,...(Array.isArray(profile.facts) ? profile.facts : []).map(fact=>`${fact.label || ""} ${fact.value || ""}`)];
    const row = rows.get(uuid) || {uuid,name:clean(doc.name),kind:clean(category),folder:clean(doc.folder?.name),aliases:[],searchText:""};
    row.aliases = [...new Set([...row.aliases,...aliases.map(clean),candidate.name].filter(Boolean))];
    row.searchText = normalize([row.name,...row.aliases,...metadata].join(" "));
    rows.set(uuid,row);
  }
  return searchTargets([...rows.values()],{query,kind});
}

async function canonicalTarget(targetUuid) {
  if (!game.user?.isGM) throw new Error("Campaign identity selection is GM-only.");
  const selected = await fromUuid(clean(targetUuid));
  if (!selected?.uuid) throw new Error("The selected identity no longer exists. Keep this mention in Review.");
  const uuid = game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:selected.uuid})?.authorityUuid || selected.uuid;
  const target = uuid === selected.uuid ? selected : await fromUuid(uuid);
  if (!target?.uuid) throw new Error("The canonical identity no longer exists. Keep this mention in Review.");
  return target;
}

async function linkExisting({ text, sourceUuid = "", targetUuid } = {}) {
  const key = normalize(text);
  const uuid = clean(targetUuid);
  if (!key || !uuid) throw new Error("Candidate name and target UUID are required.");

  const target = discoveryEntities().find((row) => row.uuid === uuid) || null;
  if (!target) throw new Error("The selected target is not present in the current viewer-scoped Campaign Discovery.");

  const state = readState();
  state.decisions[key] = gmStamp({
    action:ACTIONS.LINKED,
    text:clean(text),
    sourceUuid:clean(sourceUuid),
    targetUuid:target.uuid,
    targetName:target.name,
    targetKind:target.kind
  });
  if (sourceUuid && state.sourceIgnores?.[sourceUuid]?.[key]) {
    delete state.sourceIgnores[sourceUuid][key];
    if (!Object.keys(state.sourceIgnores[sourceUuid]).length) delete state.sourceIgnores[sourceUuid];
  }
  return writeState(state, "link-existing");
}

async function recordCreated({ text, sourceUuid = "", targetUuid, targetName = "", targetKind = "", semanticType = "" } = {}) {
  const key = normalize(text);
  const uuid = clean(targetUuid);
  if (!key || !uuid) throw new Error("Candidate name and created target UUID are required.");

  let document = null;
  try { document = await fromUuid(uuid); }
  catch (_error) { document = null; }
  if (!document?.uuid) throw new Error("Created target no longer resolves by canonical UUID.");

  const state = readState();
  state.decisions[key] = gmStamp({
    action:ACTIONS.CREATED,
    text:clean(text),
    sourceUuid:clean(sourceUuid),
    targetUuid:document.uuid,
    targetName:clean(targetName || document.name),
    targetKind:clean(targetKind || document.documentName),
    semanticType:clean(semanticType),
    created:true
  });

  if (sourceUuid && state.sourceIgnores?.[sourceUuid]?.[key]) {
    delete state.sourceIgnores[sourceUuid][key];
    if (!Object.keys(state.sourceIgnores[sourceUuid]).length) delete state.sourceIgnores[sourceUuid];
  }

  return writeState(state, "created");
}

async function chooseForSource({ text, sourceUuid, targetUuid } = {}) {
  const key = normalize(text);
  const source = clean(sourceUuid);
  const target = await canonicalTarget(targetUuid);
  if (!key || !source || !target?.uuid) throw new Error("Source, mention and canonical target are required.");
  const state = readState();
  if (!state.sourceChoices[source]) state.sourceChoices[source] = {};
  state.sourceChoices[source][key] = gmStamp({
    action:ACTIONS.LINKED, text:clean(text), sourceUuid:source,
    targetUuid:target.uuid, targetName:target.name, targetKind:target.documentName
  });
  if (state.sourceIgnores[source]?.[key]) delete state.sourceIgnores[source][key];
  return writeState(state,"source-identity-choice");
}

async function markCampaignLinked({ text, sourceUuid = "", targetUuid = "" } = {}) {
  const key = normalize(text);
  if (!key) throw new Error("Candidate name is required.");
  const state = readState();
  const current = state.decisions[key] || null;
  if (!current) throw new Error("No learned Campaign Intelligence decision exists for this candidate.");

  const expectedTarget = clean(current.targetUuid);
  const actualTarget = clean(targetUuid);
  if (expectedTarget && actualTarget && expectedTarget !== actualTarget) {
    throw new Error("Campaign Link target does not match the learned canonical target.");
  }

  state.decisions[key] = gmStamp({
    ...current,
    sourceUuid:clean(sourceUuid || current.sourceUuid),
    targetUuid:actualTarget || expectedTarget,
    campaignLinked:true,
    campaignLinkedAt:Date.now()
  });

  return writeState(state, "campaign-linked");
}

async function clear({ text, sourceUuid = "", scope = "global" } = {}) {
  const key = normalize(text);
  if (!key) throw new Error("A candidate name is required.");
  const state = readState();

  if (scope === "choice") {
    const sourceKey = clean(sourceUuid);
    if (state.sourceChoices[sourceKey]?.[key]) delete state.sourceChoices[sourceKey][key];
  } else if (scope === "source") {
    const sourceKey = clean(sourceUuid);
    if (sourceKey && state.sourceIgnores?.[sourceKey]?.[key]) {
      delete state.sourceIgnores[sourceKey][key];
      if (!Object.keys(state.sourceIgnores[sourceKey]).length) delete state.sourceIgnores[sourceKey];
    }
  } else {
    delete state.decisions[key];
  }
  return writeState(state, "clear");
}

function all() {
  return clone(readState());
}

function audit() {
  const state = readState();
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:failures === 0,
    gmOnlyWrites:true,
    storageScope:"world",
    explicitFeedbackOnly:true,
    autoLearning:false,
    entityCreation:true,
    controlledEntityCreation:true,
    campaignLinkWrites:false,
    actions:Object.values(ACTIONS),
    summary:summary(state),
    writes,
    failures,
    lastError
  };
}

function decisionSnapshot(text,sourceUuid,state=readState()) {
  const key=normalize(text);
  return clone({global:state.decisions[key] || null,choice:state.sourceChoices[sourceUuid]?.[key] || null,ignore:state.sourceIgnores[sourceUuid]?.[key] || null});
}
function matchingAuthority(uuid) {
  return game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:uuid})?.authorityUuid || uuid;
}
function isPaused(uuid) { return Boolean(readState().pausedIdentities[matchingAuthority(uuid)]); }
function matchingPreferences() { const state=readState();return clone({nameDefaults:state.nameDefaults,pausedIdentities:state.pausedIdentities}); }
function choiceCount(text,targetUuid) {
  const key=normalize(text),authority=matchingAuthority(targetUuid);
  return Object.entries(readState().sourceChoices).filter(([source,choices])=>choices[key]?.targetUuid
    && matchingAuthority(choices[key].targetUuid)===authority && !isSourceTargetRemoved(source,authority)).length;
}
async function setMatchingPolicy({mode,text='',targetUuid=''}={}) {
  if(!game.user?.isGM)throw Error('GM-only matching preferences.');
  if(!['default','clear-default','pause','resume'].includes(mode))throw Error('Unknown matching preference.');
  const state=readState(),uuid=matchingAuthority(targetUuid),key=normalize(text);
  const map=mode.includes('default')?'nameDefaults':'pausedIdentities',entryKey=map==='nameDefaults'?key:uuid;
  if(!entryKey)throw Error('A name or identity is required.');
  const doc=['default','pause'].includes(mode)?await fromUuid(uuid):null;
  if(['default','pause'].includes(mode) && (!doc || !/^(Actor|Item|JournalEntry)\.[^.]+$/.test(uuid)))throw Error('The identity is unavailable.');
  if(mode==='default' && isPaused(uuid))throw Error('Resume automatic matching for this identity first.');
  const beforePolicy=clone(Object.hasOwn(state[map],entryKey) ? state[map][entryKey] : null);
  if(['clear-default','resume'].includes(mode))delete state[map][entryKey];
  else state[map][entryKey]=gmStamp({text:clean(text),targetUuid:uuid,targetName:doc.name});
  const afterPolicy=clone(state[map][entryKey] || null);
  const label=({default:`Campaign default: ${text} → ${doc?.name}`,pause:`Automatic matching paused: ${doc?.name}`,
    resume:`Automatic matching resumed: ${beforePolicy?.targetName || uuid}`,'clear-default':`Campaign default removed: ${text}`})[mode];
  const row={id:foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`,mode:'matching-policy',text, targetUuid:uuid,
    policyMap:map,policyKey:entryKey,beforePolicy,afterPolicy,label,at:new Date().toISOString(),gmId:game.user.id,undone:false};
  state.decisionHistory=[...state.decisionHistory,row].slice(-10);
  await writeState(state,'matching-policy');return clone(row);
}
function isSourceTargetRemoved(sourceUuid,targetUuid) {
  const source=game.journal?.get(/^JournalEntry\.([^.]+)$/.exec(sourceUuid||'')?.[1]);
  const authority=game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:targetUuid})?.authorityUuid || targetUuid;
  return Boolean(source?.getFlag(MODULE_ID,'campaignAutoLinkPolicyV1')?.suppressedTargetUuids?.some(uuid=>uuid===targetUuid||uuid===authority));
}
async function removeHistoricalLink({sourceUuid,targetUuid}={}) {
  if(!game.user?.isGM)throw Error('GM-only link correction.');
  const api=game.modules.get(MODULE_ID)?.api;
  targetUuid=api?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:targetUuid})?.authorityUuid || targetUuid;
  const source=await fromUuid(sourceUuid),target=await fromUuid(targetUuid);
  if(source?.documentName!=='JournalEntry' || !target)throw Error('The source or identity is no longer available.');
  const links=api?.campaignEntityLinks,policy=api?.campaignDeterministicAutoLink;
  if(!links?.unlinkCanonical||!policy?.suppress||!policy?.unsuppress)throw Error('Link correction is unavailable.');
  if(isSourceTargetRemoved(sourceUuid,targetUuid))throw Error('This source association was already removed.');
  const hadLinkBefore=links.hasCanonicalLink({sourceUuid,targetUuid});
  try {
    await policy.suppress({sourceUuid,targetUuid});
    if(hadLinkBefore)await links.unlinkCanonical({sourceUuid,targetUuid});
    return await rememberDecision({mode:'unlink',text:target.name,sourceUuid,sourceName:source.name,targetUuid,hadLinkBefore,
      label:`Removed ${target.name} from ${source.name}`},decisionSnapshot(target.name,sourceUuid));
  }catch(error){
    if(hadLinkBefore)await links.linkCanonical({sourceUuid,targetUuid});
    await policy.unsuppress({sourceUuid,targetUuid});throw error;
  }
}
async function rememberDecision(decision,before) {
  if(!game.user?.isGM)throw Error('GM-only decision history.');
  const state=readState(),row={...clone(decision),id:foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`,at:new Date().toISOString(),gmId:game.user.id,
    before:clone(before),after:decisionSnapshot(decision.text,decision.sourceUuid,state),undone:false};
  state.decisionHistory=[...state.decisionHistory,row].slice(-10);
  // History alone does not invalidate analysis or trigger another document scan.
  await game.settings.set(MODULE_ID,SETTING_KEY,JSON.stringify(state));
  return clone(row);
}
function historyBlock(row,state) {
  if(row.undone)return 'Already undone';
  if(row.mode==='matching-policy')return JSON.stringify(state[row.policyMap]?.[row.policyKey] || null)!==JSON.stringify(row.afterPolicy)
    ? 'This matching preference has changed since the decision' : '';
  const newer=state.decisionHistory.slice(state.decisionHistory.indexOf(row)+1).filter(item=>!item.undone);
  if(newer.some(item=>(normalize(item.text)===normalize(row.text) && (item.sourceUuid===row.sourceUuid || item.mode==='create' || row.mode==='create')) ||
    (row.targetUuid && item.sourceUuid===row.sourceUuid && item.targetUuid===row.targetUuid)))return 'Undo the later dependent decision first';
  if(row.mode==='unlink') {
    const links=game.modules.get(MODULE_ID)?.api?.campaignEntityLinks;
    if(!isSourceTargetRemoved(row.sourceUuid,row.targetUuid) || links?.hasCanonicalLink?.({sourceUuid:row.sourceUuid,targetUuid:row.targetUuid}))return 'This source association has changed since removal';
  }
  if(row.mode==='correction') {
    if(row.correctionId)return game.modules.get(MODULE_ID)?.api?.sourceFactReview?.undoStatus?.(row) ||
      (game.modules.get(MODULE_ID)?.api?.sourceFactReview?.undoStatus ? '' : 'Correction review is unavailable');
    const id=/^JournalEntry\.([^.]+)$/.exec(row.targetUuid)?.[1],profile=game.journal.get(id)?.getFlag(MODULE_ID,'worldProfile');
    return JSON.stringify(profile)!==JSON.stringify(row.afterProfile)?'This profile has changed since the correction':'';
  }
  const live=decisionSnapshot(row.text,row.sourceUuid,state),fields=row.mode==='create'?['global','choice','ignore']:['choice','ignore'];
  if(fields.some(field=>JSON.stringify(live[field])!==JSON.stringify(row.after[field])))return 'This decision has changed since it was saved';
  return '';
}
function decisionHistory() {
  const state=readState();
  return clone([...state.decisionHistory].reverse().map(row=>({...row,blocked:historyBlock(row,state)})));
}
async function undoDecision(id) {
  if(!game.user?.isGM)throw Error('GM-only decision history.');
  const state=readState(),row=state.decisionHistory.find(item=>item.id===id);
  if(!row)throw Error('Decision is no longer in the recent history.');
  const blocked=historyBlock(row,state);if(blocked)throw Error(blocked);
  if(row.mode==='matching-policy') {
    if(row.beforePolicy)state[row.policyMap][row.policyKey]=clone(row.beforePolicy);else delete state[row.policyMap][row.policyKey];
    row.undone=true;row.undoneAt=new Date().toISOString();await writeState(state,'matching-policy-undo');return clone(row);
  }
  const key=normalize(row.text),source=row.sourceUuid,links=game.modules.get(MODULE_ID)?.api?.campaignEntityLinks;
  if(row.mode==='unlink') {
    const policy=game.modules.get(MODULE_ID)?.api?.campaignDeterministicAutoLink;
    if(!policy?.unsuppress || !policy?.suppress || !links?.linkCanonical)throw Error('Link correction is unavailable.');
    if(!await fromUuid(source) || !await fromUuid(row.targetUuid))throw Error('The source or identity is no longer available.');
    try {
      if(row.hadLinkBefore)await links.linkCanonical({sourceUuid:source,targetUuid:row.targetUuid});
      await policy.unsuppress({sourceUuid:source,targetUuid:row.targetUuid});
      row.undone=true;row.undoneAt=new Date().toISOString();await writeState(state,'historical-link-removal-undo');
    }catch(error){if(row.hadLinkBefore)await links.unlinkCanonical({sourceUuid:source,targetUuid:row.targetUuid});await policy.suppress({sourceUuid:source,targetUuid:row.targetUuid});throw error;}
    return clone(row);
  }
  if(row.mode==='correction') {
    if(row.correctionId) {
      const review=game.modules.get(MODULE_ID)?.api?.sourceFactReview;
      if(!review?.undo)throw Error('Correction review is unavailable.');
      row.undone=true;row.undoneAt=new Date().toISOString();
      await review.undo(row,()=>writeState(state,'source-correction-undo'));
      return clone(row);
    }
    const target=await fromUuid(row.targetUuid);
    await target.update({[`flags.${MODULE_ID}.worldProfile`]:clone(row.beforeProfile)});
    row.undone=true;row.undoneAt=new Date().toISOString();
    try{await writeState(state,'source-correction-undo');}
    catch(error){await target.update({[`flags.${MODULE_ID}.worldProfile`]:clone(row.afterProfile)});throw error;}
    return clone(row);
  }
  const removeLink=['choose','create'].includes(row.mode)&&row.targetUuid&&!row.hadLinkBefore;
  // Other current source choices may depend on a link even outside the ten rows.
  if(removeLink && Object.entries(state.sourceChoices[source]||{}).some(([other,choice])=>other!==key&&choice.targetUuid===row.targetUuid))throw Error('Another saved choice still uses this link.');
  if(removeLink)await links?.unlinkCanonical?.({sourceUuid:source,targetUuid:row.targetUuid});
  const restore=(map,field)=>{map[source]||={};if(row.before[field])map[source][key]=clone(row.before[field]);else delete map[source][key];};
  restore(state.sourceChoices,'choice');restore(state.sourceIgnores,'ignore');
  if(row.mode==='create') {
    if(row.before.global)state.decisions[key]=clone(row.before.global);else delete state.decisions[key];
    state.sourceIgnores[source][key]=gmStamp({text:row.text,sourceUuid:source,action:ACTIONS.SOURCE_IGNORED});
  }
  row.undone=true;row.undoneAt=new Date().toISOString();
  try{await writeState(state,'decision-history-undo');}
  catch(error){if(removeLink)await links?.linkCanonical?.({sourceUuid:source,targetUuid:row.targetUuid});throw error;}
  return clone(row);
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  actions:ACTIONS,
  decisionFor,
  decisionSnapshot,
  isPaused,
  matchingPreferences,
  setMatchingPolicy,
  choiceCount,
  isSourceTargetRemoved,
  removeHistoricalLink,
  rememberDecision,
  decisionHistory,
  undoDecision,
  historicalChoiceFor,
  confirm,
  suppress,
  ignoreOnce,
  linkExisting,
  chooseForSource,
  canonicalTarget,
  recordCreated,
  markCampaignLinked,
  clear,
  linkTargets,
  searchTargets,
  all,
  summary:() => summary(readState()),
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignReviewLearning = publicApi;
  return true;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    scope:"world",
    config:false,
    type:String,
    default:JSON.stringify(emptyState())
  });
});

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | Campaign Review & Learning v1 ready (GM-explicit, world-scoped).");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignReviewLearning !== publicApi) attach();
});
