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
    sourceChoices:{}
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
      sourceChoices:parsed.sourceChoices && typeof parsed.sourceChoices === "object" ? parsed.sourceChoices : {}
    };
  } catch (_error) {
    return emptyState();
  }
}

function readState() {
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
      sourceChoices:state?.sourceChoices || {}
    };
    await game.settings.set(MODULE_ID, SETTING_KEY, JSON.stringify(payload));
    writes += 1;
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
  if (sourceChoice) return clone({ ...sourceChoice, sourceChoice:true });
  const globalDecision = state.decisions?.[key] || null;
  return globalDecision ? clone(globalDecision) : null;
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

function linkTargets() {
  return clone(discoveryEntities());
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
  const target = await fromUuid(clean(targetUuid));
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

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  actions:ACTIONS,
  decisionFor,
  confirm,
  suppress,
  ignoreOnce,
  linkExisting,
  chooseForSource,
  recordCreated,
  markCampaignLinked,
  clear,
  linkTargets,
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
