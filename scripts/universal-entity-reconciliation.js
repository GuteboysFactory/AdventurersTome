globalThis.ATTestAI.assertEnabled();
const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-universal-entity-reconciliation";
const VERSION = 1;

const CLASSIFICATION = Object.freeze({
  EXACT:"exact",
  HIGH:"high-confidence",
  POSSIBLE:"possible",
  AMBIGUOUS:"ambiguous",
  NONE:"no-match"
});

const WORLD_FIRST_BONUS = 5;
const MAX_CANDIDATES = 5;
const POSSIBLE_SCORE = 55;
const HIGH_SCORE = 75;
const HIGH_MARGIN = 15;
const AMBIGUOUS_MARGIN = 8;

let lastSnapshot = null;
let analyzeTimer = null;
let analysisGeneration = 0;

const stats = {
  analyses:0,
  reconcilable:0,
  semanticOnly:0,
  unresolved:0,
  exact:0,
  highConfidence:0,
  possible:0,
  ambiguous:0,
  noMatch:0,
  failures:0,
  lastError:""
};

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function nameFeatures(value, cache) {
  const key = clean(value);
  if (cache?.has(key)) return cache.get(key);
  const normalized = normalizeText(key), grams = bigrams(normalized), counts = new Map();
  for (const gram of grams) counts.set(gram, (counts.get(gram) || 0) + 1);
  const features = {normalized, tokens:new Set(normalized ? normalized.split(" ") : []), grams, counts};
  cache?.set(key, features);
  return features;
}

function tokenSimilarity(a, b, cache) {
  const left = nameFeatures(a, cache).tokens;
  const right = nameFeatures(b, cache).tokens;
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function bigrams(value) {
  const normalized = normalizeText(value).replaceAll(" ", "");
  if (!normalized) return [];
  if (normalized.length === 1) return [normalized];
  const out = [];
  for (let i = 0; i < normalized.length - 1; i += 1) out.push(normalized.slice(i, i + 2));
  return out;
}

function diceSimilarity(a, b, cache) {
  const leftFeatures = nameFeatures(a, cache), rightFeatures = nameFeatures(b, cache);
  const left = leftFeatures.grams;
  const right = rightFeatures.grams;
  if (!left.length || !right.length) return 0;
  let overlap = 0;
  for (const [gram, count] of rightFeatures.counts) overlap += Math.min(count, leftFeatures.counts.get(gram) || 0);
  return (2 * overlap) / (left.length + right.length);
}

function discoveryApi() {
  return globalThis.ATTestAI.modules.get(MODULE_ID)?.api?.discovery || null;
}

function entityDocumentName(entity) {
  return clean(entity?.foundry?.documentName);
}

function candidateScope(entity) {
  if (entity?.state === "resolved") return "world";
  if (entity?.state === "compendium") return "compendium";
  return "";
}

function kindCompatible(unresolved, candidate) {
  const kind = normalizeText(unresolved?.kind);
  const documentName = entityDocumentName(candidate);
  if (!documentName) return false;

  if (["person","character","npc"].includes(kind)) return documentName === "Actor";
  if (["item","gear","artifact","equipment"].includes(kind)) return documentName === "Item";
  if (["location","place","region","settlement"].includes(kind)) {
    return documentName === "Scene" || documentName === "JournalEntry";
  }
  if (["journal","lore","quest","session","faction","organization","organisation"].includes(kind)) {
    return documentName === "JournalEntry";
  }

  // Conservative fallback: never compare against Folder/JournalEntryPage when the semantic kind is unknown.
  return ["Actor","Item","JournalEntry","Scene"].includes(documentName);
}

function comparableAttribute(value) {
  const normalized = normalizeText(value);
  return normalized.length >= 2 ? normalized : "";
}

function semanticEvidence(unresolved, candidate) {
  const source = unresolved?.attributes || {};
  const target = candidate?.attributes || {};
  const folderPath = Array.isArray(candidate?.foundry?.folderPath)
    ? candidate.foundry.folderPath.map(normalizeText).filter(Boolean)
    : [];

  const evidence = [];
  let score = 0;

  const compareExact = (key, points, label) => {
    const a = comparableAttribute(source?.[key]);
    const b = comparableAttribute(target?.[key]);
    if (!a || !b || a !== b) return;
    score += points;
    evidence.push({ type:key, weight:points, detail:label });
  };

  compareExact("profession", 10, "matching profession");
  compareExact("culture", 8, "matching culture");
  compareExact("location", 12, "matching location");

  const location = comparableAttribute(source?.location);
  if (location && folderPath.some((segment) => segment === location || segment.includes(location) || location.includes(segment))) {
    score += 10;
    evidence.push({ type:"folder-location", weight:10, detail:"location matches Foundry folder context" });
  }

  return { score, evidence };
}

function candidateScore(unresolved, candidate, cache) {
  if (!kindCompatible(unresolved, candidate)) return null;

  const unresolvedUuid = clean(unresolved?.canonicalUuid);
  const candidateUuid = clean(candidate?.canonicalUuid);
  if (unresolvedUuid && candidateUuid && unresolvedUuid === candidateUuid) {
    return {
      candidate,
      score:100,
      exactUuid:true,
      exactName:nameFeatures(unresolved.name, cache).normalized === nameFeatures(candidate.name, cache).normalized,
      corroborating:1,
      reasons:[{ type:"canonical-uuid", weight:100, detail:"explicit canonical UUID match" }]
    };
  }

  const sourceName = nameFeatures(unresolved?.name, cache).normalized;
  const targetName = nameFeatures(candidate?.name, cache).normalized;
  if (!sourceName || !targetName) return null;

  let score = candidateScope(candidate) === "world" ? WORLD_FIRST_BONUS : 0;
  const reasons = [];
  const exactName = sourceName === targetName;

  if (exactName) {
    score += 60;
    reasons.push({ type:"exact-name", weight:60, detail:"exact normalized name" });
  } else {
    const tokenScore = tokenSimilarity(sourceName, targetName, cache);
    const diceScore = diceSimilarity(sourceName, targetName, cache);
    const similarity = Math.max(tokenScore, diceScore);

    if (similarity >= 0.8) {
      score += 35;
      reasons.push({ type:"strong-name-similarity", weight:35, detail:`name similarity ${similarity.toFixed(2)}` });
    } else if (similarity >= 0.65) {
      score += 20;
      reasons.push({ type:"name-similarity", weight:20, detail:`name similarity ${similarity.toFixed(2)}` });
    } else {
      return null;
    }
  }

  const semantic = semanticEvidence(unresolved, candidate);
  score += semantic.score;
  reasons.push(...semantic.evidence);

  return {
    candidate,
    score,
    exactUuid:false,
    exactName,
    corroborating:semantic.evidence.length,
    reasons
  };
}

function publicCandidate(scored) {
  const candidate = scored.candidate;
  return {
    key:clean(candidate?.key),
    name:clean(candidate?.name),
    kind:clean(candidate?.kind),
    canonicalUuid:clean(candidate?.canonicalUuid),
    state:clean(candidate?.state),
    scope:candidateScope(candidate),
    score:Number(scored.score || 0),
    exactName:Boolean(scored.exactName),
    corroborating:Number(scored.corroborating || 0),
    reasons:clone(scored.reasons || []),
    foundry:clone(candidate?.foundry || null)
  };
}

function* classifySteps(unresolved, candidates, cache) {
  const scored = [];
  for (const candidate of candidates) {
    const score = candidateScore(unresolved, candidate, cache);
    if (score) scored.push(score);
    yield;
  }
  scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aWorld = candidateScope(a.candidate) === "world" ? 1 : 0;
      const bWorld = candidateScope(b.candidate) === "world" ? 1 : 0;
      if (aWorld !== bWorld) return bWorld - aWorld;
      return clean(a.candidate?.canonicalUuid).localeCompare(clean(b.candidate?.canonicalUuid));
    });

  const exactUuid = scored.find((row) => row.exactUuid);
  if (exactUuid) {
    return {
      classification:CLASSIFICATION.EXACT,
      confidence:1,
      selectedCandidate:publicCandidate(exactUuid),
      candidates:[publicCandidate(exactUuid)],
      reason:"explicit-canonical-uuid"
    };
  }

  const viable = scored.filter((row) => row.score >= POSSIBLE_SCORE);
  if (!viable.length) {
    return {
      classification:CLASSIFICATION.NONE,
      confidence:0,
      selectedCandidate:null,
      candidates:scored.slice(0, MAX_CANDIDATES).map(publicCandidate),
      reason:"no-candidate-reached-threshold"
    };
  }

  const top = viable[0];
  const second = viable[1] || null;
  const tiedOrClose = Boolean(second && (top.score - second.score) <= AMBIGUOUS_MARGIN);

  if (tiedOrClose) {
    return {
      classification:CLASSIFICATION.AMBIGUOUS,
      confidence:Math.min(0.74, top.score / 100),
      selectedCandidate:null,
      candidates:viable.slice(0, MAX_CANDIDATES).map(publicCandidate),
      reason:"multiple-close-candidates"
    };
  }

  if (top.score >= HIGH_SCORE && top.exactName && top.corroborating >= 1) {
    const margin = second ? top.score - second.score : top.score;
    if (!second || margin >= HIGH_MARGIN) {
      return {
        classification:CLASSIFICATION.HIGH,
        confidence:Math.min(0.95, top.score / 100),
        selectedCandidate:publicCandidate(top),
        candidates:viable.slice(0, MAX_CANDIDATES).map(publicCandidate),
        reason:"unique-corroborated-candidate"
      };
    }
  }

  return {
    classification:CLASSIFICATION.POSSIBLE,
    confidence:Math.min(0.74, top.score / 100),
    selectedCandidate:null,
    candidates:viable.slice(0, MAX_CANDIDATES).map(publicCandidate),
    reason:top.exactName ? "name-only-or-insufficient-corroboration" : "similar-name-candidate"
  };
}

function classify(unresolved, candidates, cache = new Map()) {
  const steps = classifySteps(unresolved, candidates, cache);let next;
  do { next = steps.next(); } while (!next.done);
  return next.value;
}

async function classifyCooperatively(unresolved, candidates, cache, checkpoint) {
  const steps = classifySteps(unresolved, candidates, cache);
  while (true) { const next = steps.next(); if (next.done) return next.value; await checkpoint(); }
}

function resetCounts() {
  stats.reconcilable = 0;
  stats.semanticOnly = 0;
  stats.unresolved = 0;
  stats.exact = 0;
  stats.highConfidence = 0;
  stats.possible = 0;
  stats.ambiguous = 0;
  stats.noMatch = 0;
}

async function analyze(options = {}) {
  const generation = ++analysisGeneration;
  const owner = () => `${game.world?.id || ''}:${game.user?.id || ''}`, expectedOwner = owner();
  let sliceStarted = globalThis.performance?.now?.() ?? Date.now();
  const checkpoint = async () => {
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - sliceStarted < 4) return;
    if (globalThis.AdventurersTomeBackground?.checkpoint) await globalThis.AdventurersTomeBackground.checkpoint();
    else await new Promise(resolve => window.setTimeout(resolve, 0));
    sliceStarted = globalThis.performance?.now?.() ?? Date.now();
  };
  stats.analyses += 1;
  resetCounts();

  const discovery = discoveryApi();
  if (!discovery) throw new Error("Universal Campaign Discovery API is unavailable.");

  let source = discovery.snapshot();
  if (!source || options?.rescan === true) source = await discovery.scan(options?.discovery || {});
  if (!source) throw new Error("Universal Campaign Discovery has no snapshot.");

  const semanticOnly = Array.isArray(source.semanticOnly) ? source.semanticOnly : [];
  const unresolved = Array.isArray(source.unresolved) ? source.unresolved : [];
  const reconcilable = [...semanticOnly, ...unresolved];
  const candidates = (Array.isArray(source.entities) ? source.entities : [])
    .filter((entity) => entity?.state === "resolved" || entity?.state === "compendium");

  const results = [], features = new Map();
  for (const entity of reconcilable) {
    const match = await classifyCooperatively(entity, candidates, features, checkpoint);
    if (owner() !== expectedOwner || generation !== analysisGeneration) return clone(lastSnapshot);
    results.push({
      entity:{
        key:clean(entity?.key),
        kind:clean(entity?.kind),
        name:clean(entity?.name),
        canonicalUuid:clean(entity?.canonicalUuid),
        state:clean(entity?.state),
        attributes:clone(entity?.attributes || {}),
        provenance:clone(entity?.provenance || [])
      },
      ...match,
      autoLinked:false,
      readOnly:true
    });
  }
  if (owner() !== expectedOwner || generation !== analysisGeneration) return clone(lastSnapshot);

  stats.reconcilable = results.length;
  stats.semanticOnly = semanticOnly.length;
  stats.unresolved = unresolved.length;
  for (const row of results) {
    if (row.classification === CLASSIFICATION.EXACT) stats.exact += 1;
    else if (row.classification === CLASSIFICATION.HIGH) stats.highConfidence += 1;
    else if (row.classification === CLASSIFICATION.POSSIBLE) stats.possible += 1;
    else if (row.classification === CLASSIFICATION.AMBIGUOUS) stats.ambiguous += 1;
    else stats.noMatch += 1;
  }

  lastSnapshot = Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    generatedAt:Date.now(),
    discoveryGeneratedAt:Number(source.generatedAt || 0),
    systemId:clean(source.systemId || game.system?.id),
    readOnly:true,
    autoLink:false,
    thresholds:{
      possible:POSSIBLE_SCORE,
      high:HIGH_SCORE,
      highMargin:HIGH_MARGIN,
      ambiguousMargin:AMBIGUOUS_MARGIN
    },
    results:clone(results),
    summary:{
      reconcilable:stats.reconcilable,
      semanticOnly:stats.semanticOnly,
      unresolved:stats.unresolved,
      exact:stats.exact,
      highConfidence:stats.highConfidence,
      possible:stats.possible,
      ambiguous:stats.ambiguous,
      noMatch:stats.noMatch
    }
  });

  Hooks.callAll("adventurersTomeEntityReconciliationUpdated", clone(lastSnapshot.summary));
  return clone(lastSnapshot);
}

function snapshot() {
  return clone(lastSnapshot);
}

function resultFor(key) {
  if (!lastSnapshot) return null;
  const wanted = clean(key);
  return clone(lastSnapshot.results.find((row) =>
    row.entity?.key === wanted || row.entity?.canonicalUuid === wanted
  ) || null);
}

function audit() {
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0,
    hasSnapshot:Boolean(lastSnapshot),
    readOnly:true,
    autoLink:false,
    summary:clone(lastSnapshot?.summary || {}),
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  autoLink:false,
  classifications:Object.freeze({ ...CLASSIFICATION }),
  analyze,
  snapshot,
  resultFor,
  audit
});

function attach() {
  const module = globalThis.ATTestAI.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.reconciliation = publicApi;
  return true;
}

function scheduleAnalyze(reason = "discovery-updated") {
  window.clearTimeout(analyzeTimer);
  analyzeTimer = window.setTimeout(() => {
    analyzeTimer = null;
    void analyze({ context:{ reason } }).catch((error) => {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Entity reconciliation failed safely", error);
    });
  }, 80);
}

Hooks.once("ready", () => {
  attach();
  scheduleAnalyze("ready");
  console.info("Adventurer's Tome | Universal Entity Reconciliation v1 ready (read-only, no auto-link).");
});

Hooks.on("adventurersTomeCampaignDiscoveryUpdated", () => scheduleAnalyze("discovery-updated"));

Hooks.on("renderApplicationV2", () => {
  if (globalThis.ATTestAI.modules.get(MODULE_ID)?.api?.reconciliation !== publicApi) attach();
});
