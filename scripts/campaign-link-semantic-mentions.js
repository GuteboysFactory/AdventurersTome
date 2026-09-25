const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-campaign-link-semantic-mentions";
const VERSION = 1;

const MENTION_KINDS = Object.freeze({
  CHARACTER:"character",
  NPC:"npc",
  LOCATION:"location",
  FACTION:"faction",
  ITEM:"item",
  LORE:"lore",
  QUEST:"quest",
  SESSION:"session",
  UNKNOWN:"unknown"
});

const RESOLUTION = Object.freeze({
  CANONICAL:"resolved-canonical",
  SEMANTIC:"resolved-semantic",
  EXTERNAL:"resolved-external",
  CORROBORATED:"resolved-corroborated",
  REVIEW:"review",
  AMBIGUOUS:"ambiguous",
  UNRESOLVED:"unresolved",
  UNAVAILABLE:"unavailable"
});

const REVIEW_DECISIONS = Object.freeze({
  CONFIRM:"confirm-link",
  KEEP_SEPARATE:"keep-separate",
  IGNORE:"ignore"
});

const MAX_CANDIDATES = 5;
const HIGH_CONTEXT_SIGNALS = 2;
const NAME_SIMILARITY_REVIEW = 0.82;

const stats = {
  resolves:0,
  canonical:0,
  semantic:0,
  external:0,
  corroborated:0,
  review:0,
  ambiguous:0,
  unresolved:0,
  unavailable:0,
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

function normalizeKind(value) {
  const raw = normalizeText(value).replaceAll(" ", "-");
  const aliases = {
    pc:"character",
    player:"character",
    player-character:"character",
    character:"character",
    npc:"npc",
    person:"npc",
    contact:"npc",
    location:"location",
    place:"location",
    region:"location",
    settlement:"location",
    faction:"faction",
    organization:"faction",
    organisation:"faction",
    item:"item",
    gear:"item",
    artifact:"item",
    artefact:"item",
    equipment:"item",
    lore:"lore",
    journal:"lore",
    quest:"quest",
    mission:"quest",
    session:"session"
  };
  return aliases[raw] || (Object.values(MENTION_KINDS).includes(raw) ? raw : MENTION_KINDS.UNKNOWN);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function normalizeExternalIdentity(value) {
  if (!value || typeof value !== "object") return null;
  const provider = clean(value.provider);
  const id = clean(value.id);
  if (!provider || !id) return null;
  return { provider, id };
}

function externalKey(value) {
  const identity = normalizeExternalIdentity(value);
  return identity ? `${identity.provider}:${identity.id}` : "";
}

function normalizedSource(raw = {}) {
  return {
    uuid:clean(raw.uuid || raw.sourceUuid),
    documentName:clean(raw.documentName),
    pageUuid:clean(raw.pageUuid),
    path:clean(raw.path || raw.sourcePath),
    start:Number.isFinite(Number(raw.start)) ? Number(raw.start) : null,
    end:Number.isFinite(Number(raw.end)) ? Number(raw.end) : null
  };
}

function createCandidate(raw = {}) {
  const text = clean(raw.text || raw.mention);
  const kindHint = normalizeKind(raw.kindHint || raw.kind);
  const source = normalizedSource(raw.source || raw);
  const explicit = raw.explicit && typeof raw.explicit === "object" ? raw.explicit : {};
  const context = raw.context && typeof raw.context === "object" ? raw.context : {};

  return Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    id:clean(raw.id),
    text,
    normalizedText:normalizeText(text),
    kindHint,
    source,
    explicit:{
      canonicalUuid:clean(explicit.canonicalUuid || raw.canonicalUuid),
      semanticKeys:uniqueStrings(explicit.semanticKeys || raw.semanticKeys),
      externalIdentities:array(explicit.externalIdentities || raw.externalIdentities)
        .map(normalizeExternalIdentity)
        .filter(Boolean)
    },
    context:{
      attributes:clone(context.attributes || {}),
      relatedUuids:uniqueStrings(context.relatedUuids),
      relatedEntityKeys:uniqueStrings(context.relatedEntityKeys)
    },
    provenance:clone(array(raw.provenance)),
    visibility:clean(raw.visibility || "source"),
    readOnly:true
  });
}

function discoveryApi() {
  return game.modules.get(MODULE_ID)?.api?.discovery || null;
}

function entityDocumentName(entity) {
  return clean(entity?.foundry?.documentName);
}

function entityFolderPath(entity) {
  return array(entity?.foundry?.folderPath).map(normalizeText).filter(Boolean);
}

function inferredJournalKind(entity) {
  const semantic = normalizeKind(entity?.kind);
  if ([MENTION_KINDS.LOCATION, MENTION_KINDS.FACTION, MENTION_KINDS.LORE, MENTION_KINDS.QUEST, MENTION_KINDS.SESSION].includes(semantic)) {
    return semantic;
  }

  const path = entityFolderPath(entity);
  if (path.includes("sessions")) return MENTION_KINDS.SESSION;
  if (path.includes("quests")) return MENTION_KINDS.QUEST;
  if (path.includes("locations")) return MENTION_KINDS.LOCATION;
  if (path.includes("factions")) return MENTION_KINDS.FACTION;
  if (path.includes("lore")) return MENTION_KINDS.LORE;
  return MENTION_KINDS.LORE;
}

function compatible(candidate, entity) {
  const kind = candidate.kindHint;
  if (kind === MENTION_KINDS.UNKNOWN) return true;

  const documentName = entityDocumentName(entity);
  const semantic = normalizeKind(entity?.kind);

  if (kind === MENTION_KINDS.CHARACTER || kind === MENTION_KINDS.NPC) {
    return documentName === "Actor" || ["character","npc"].includes(semantic);
  }
  if (kind === MENTION_KINDS.ITEM) {
    return documentName === "Item" || semantic === "item";
  }
  if (kind === MENTION_KINDS.LOCATION) {
    return documentName === "Scene"
      || (documentName === "JournalEntry" && inferredJournalKind(entity) === MENTION_KINDS.LOCATION)
      || semantic === "location";
  }
  if (kind === MENTION_KINDS.FACTION) {
    return (documentName === "JournalEntry" && inferredJournalKind(entity) === MENTION_KINDS.FACTION)
      || semantic === "faction";
  }
  if (kind === MENTION_KINDS.QUEST) {
    return documentName === "JournalEntry" && inferredJournalKind(entity) === MENTION_KINDS.QUEST;
  }
  if (kind === MENTION_KINDS.SESSION) {
    return documentName === "JournalEntry" && inferredJournalKind(entity) === MENTION_KINDS.SESSION;
  }
  if (kind === MENTION_KINDS.LORE) {
    return documentName === "JournalEntry" && inferredJournalKind(entity) === MENTION_KINDS.LORE;
  }
  return true;
}

function entitySemanticKeys(entity) {
  return uniqueStrings([
    entity?.key,
    ...array(entity?.semanticKeys)
  ]).filter((key) => !key.startsWith("foundry:") && !key.startsWith("compendium:"));
}

function entityExternalIdentities(entity) {
  const rows = [
    ...array(entity?.externalIdentities),
    ...array(entity?.attributes?.externalIdentities),
    entity?.externalIdentity,
    entity?.attributes?.externalIdentity,
    entity?.system?.externalIdentity
  ];
  return rows.map(normalizeExternalIdentity).filter(Boolean);
}

function tokenSimilarity(a, b) {
  const left = new Set(normalizeText(a).split(" ").filter(Boolean));
  const right = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function exactAttributeSignals(candidate, entity) {
  const source = candidate.context?.attributes || {};
  const target = entity?.attributes || {};
  const keys = ["location","faction","profession","role","culture","ancestry","type"];
  const signals = [];

  for (const key of keys) {
    const left = normalizeText(source?.[key]);
    const right = normalizeText(target?.[key]);
    if (!left || !right || left !== right) continue;
    signals.push({ type:`context:${key}`, detail:`matching ${key}`, weight:15 });
  }

  const relatedUuids = new Set(candidate.context?.relatedUuids || []);
  if (clean(entity?.canonicalUuid) && relatedUuids.has(clean(entity.canonicalUuid))) {
    signals.push({ type:"context:related-uuid", detail:"source context already references target UUID", weight:45 });
  }

  const relatedKeys = new Set(candidate.context?.relatedEntityKeys || []);
  if (entitySemanticKeys(entity).some((key) => relatedKeys.has(key))) {
    signals.push({ type:"context:related-semantic-key", detail:"source context already references target semantic identity", weight:40 });
  }

  return signals;
}

function publicEntity(entity) {
  return {
    key:clean(entity?.key),
    name:clean(entity?.name),
    kind:clean(entity?.kind),
    canonicalUuid:clean(entity?.canonicalUuid),
    state:clean(entity?.state),
    authority:clean(entity?.authority),
    visibility:clean(entity?.visibility),
    foundry:clone(entity?.foundry || null),
    semanticKeys:entitySemanticKeys(entity)
  };
}

function result(decision, options = {}) {
  return {
    contract:CONTRACT,
    version:VERSION,
    decision,
    confidence:Number(options.confidence || 0),
    selectedTarget:options.selectedTarget ? publicEntity(options.selectedTarget) : null,
    candidates:array(options.candidates).slice(0, MAX_CANDIDATES).map((row) => ({
      target:publicEntity(row.entity || row),
      score:Number(row.score || 0),
      reasons:clone(row.reasons || [])
    })),
    autoLinkEligible:Boolean(options.autoLinkEligible),
    requiresReview:Boolean(options.requiresReview),
    reason:clean(options.reason),
    readOnly:true,
    writesPerformed:false
  };
}

function exactIdentityMatches(candidate, entities) {
  const canonicalUuid = clean(candidate.explicit?.canonicalUuid);
  if (canonicalUuid) {
    const rows = entities.filter((entity) => clean(entity?.canonicalUuid) === canonicalUuid);
    if (rows.length === 1) return result(RESOLUTION.CANONICAL, {
      confidence:1,
      selectedTarget:rows[0],
      candidates:[{ entity:rows[0], score:100, reasons:[{ type:"canonical-uuid", detail:"explicit canonical UUID", weight:100 }] }],
      autoLinkEligible:true,
      reason:"explicit-canonical-uuid"
    });
    if (rows.length > 1) return result(RESOLUTION.AMBIGUOUS, {
      confidence:0,
      candidates:rows.map((entity) => ({ entity, score:100, reasons:[{ type:"canonical-uuid", detail:"duplicate canonical UUID candidate", weight:100 }] })),
      requiresReview:true,
      reason:"duplicate-canonical-uuid"
    });
  }

  const semantic = new Set(candidate.explicit?.semanticKeys || []);
  if (semantic.size) {
    const rows = entities.filter((entity) => entitySemanticKeys(entity).some((key) => semantic.has(key)));
    if (rows.length === 1) return result(RESOLUTION.SEMANTIC, {
      confidence:0.99,
      selectedTarget:rows[0],
      candidates:[{ entity:rows[0], score:99, reasons:[{ type:"semantic-identity", detail:"stable semantic identity", weight:99 }] }],
      autoLinkEligible:true,
      reason:"stable-semantic-identity"
    });
    if (rows.length > 1) return result(RESOLUTION.AMBIGUOUS, {
      confidence:0,
      candidates:rows.map((entity) => ({ entity, score:99, reasons:[{ type:"semantic-identity", detail:"semantic identity collision", weight:99 }] })),
      requiresReview:true,
      reason:"semantic-identity-collision"
    });
  }

  const external = new Set(array(candidate.explicit?.externalIdentities).map(externalKey).filter(Boolean));
  if (external.size) {
    const rows = entities.filter((entity) => entityExternalIdentities(entity).some((identity) => external.has(externalKey(identity))));
    if (rows.length === 1) return result(RESOLUTION.EXTERNAL, {
      confidence:0.98,
      selectedTarget:rows[0],
      candidates:[{ entity:rows[0], score:98, reasons:[{ type:"external-identity", detail:"stable external/import identity", weight:98 }] }],
      autoLinkEligible:true,
      reason:"stable-external-identity"
    });
    if (rows.length > 1) return result(RESOLUTION.AMBIGUOUS, {
      confidence:0,
      candidates:rows.map((entity) => ({ entity, score:98, reasons:[{ type:"external-identity", detail:"external identity collision", weight:98 }] })),
      requiresReview:true,
      reason:"external-identity-collision"
    });
  }

  return null;
}

function contextualMatches(candidate, entities) {
  const sourceName = candidate.normalizedText;
  if (!sourceName) return [];

  return entities.map((entity) => {
    const targetName = normalizeText(entity?.name);
    if (!targetName) return null;

    const exactName = sourceName === targetName;
    const similarity = exactName ? 1 : tokenSimilarity(sourceName, targetName);
    if (!exactName && similarity < NAME_SIMILARITY_REVIEW) return null;

    const contextSignals = exactAttributeSignals(candidate, entity);
    const score = (exactName ? 45 : Math.round(similarity * 30))
      + contextSignals.reduce((sum, signal) => sum + Number(signal.weight || 0), 0);

    const reasons = [
      {
        type:exactName ? "name-exact" : "name-similar",
        detail:exactName ? "exact normalized display name" : `name similarity ${similarity.toFixed(2)}`,
        weight:exactName ? 45 : Math.round(similarity * 30)
      },
      ...contextSignals
    ];

    return { entity, score, exactName, similarity, contextSignals, reasons };
  }).filter(Boolean).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return clean(a.entity?.canonicalUuid || a.entity?.key).localeCompare(clean(b.entity?.canonicalUuid || b.entity?.key));
  });
}

function resolve(rawCandidate = {}) {
  stats.resolves += 1;
  try {
    const candidate = rawCandidate?.contract === CONTRACT ? rawCandidate : createCandidate(rawCandidate);
    const discovery = discoveryApi();
    const snapshot = discovery?.snapshot?.() || null;

    if (!snapshot) {
      stats.unavailable += 1;
      return result(RESOLUTION.UNAVAILABLE, {
        reason:"viewer-scoped-discovery-snapshot-unavailable"
      });
    }

    const entities = array(snapshot.entities).filter((entity) => compatible(candidate, entity));
    const exact = exactIdentityMatches(candidate, entities);
    if (exact) {
      if (exact.decision === RESOLUTION.CANONICAL) stats.canonical += 1;
      else if (exact.decision === RESOLUTION.SEMANTIC) stats.semantic += 1;
      else if (exact.decision === RESOLUTION.EXTERNAL) stats.external += 1;
      else stats.ambiguous += 1;
      return exact;
    }

    const rows = contextualMatches(candidate, entities);
    if (!rows.length) {
      stats.unresolved += 1;
      return result(RESOLUTION.UNRESOLVED, {
        reason:"no-compatible-candidate"
      });
    }

    const top = rows[0];
    const sameTopName = rows.filter((row) => row.exactName && normalizeText(row.entity?.name) === candidate.normalizedText);
    const strongContext = top.contextSignals.length >= HIGH_CONTEXT_SIGNALS;

    if (strongContext) {
      const competingStrong = rows.filter((row) =>
        row !== top
        && row.contextSignals.length >= HIGH_CONTEXT_SIGNALS
        && Math.abs(top.score - row.score) <= 10
      );
      if (!competingStrong.length) {
        stats.corroborated += 1;
        return result(RESOLUTION.CORROBORATED, {
          confidence:Math.min(0.94, 0.72 + (top.contextSignals.length * 0.08)),
          selectedTarget:top.entity,
          candidates:rows,
          autoLinkEligible:true,
          reason:"unique-multi-signal-context"
        });
      }
    }

    if (sameTopName.length > 1) {
      stats.ambiguous += 1;
      return result(RESOLUTION.AMBIGUOUS, {
        confidence:0,
        candidates:rows,
        requiresReview:true,
        reason:"same-name-is-not-same-identity"
      });
    }

    stats.review += 1;
    return result(RESOLUTION.REVIEW, {
      confidence:top.exactName ? 0.55 : Math.min(0.5, top.similarity * 0.5),
      candidates:rows,
      requiresReview:true,
      reason:top.contextSignals.length ? "insufficient-corroboration" : "display-name-only"
    });
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Campaign mention resolution failed safely", error);
    return result(RESOLUTION.UNAVAILABLE, {
      reason:"resolver-failed-safely"
    });
  }
}

function audit() {
  const discovery = discoveryApi();
  const snapshot = discovery?.snapshot?.() || null;
  const entities = array(snapshot?.entities);
  const names = new Map();

  for (const entity of entities) {
    const name = normalizeText(entity?.name);
    if (!name) continue;
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(clean(entity?.canonicalUuid || entity?.key));
  }

  const duplicateDisplayNames = [...names.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, identities:ids }));

  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0,
    readOnly:true,
    textScanning:false,
    writesPerformed:false,
    policy:{
      canonicalUuidFirst:true,
      semanticIdentitySecond:true,
      externalIdentityThird:true,
      contextBeforeName:true,
      displayNameAloneAutoLinks:false,
      sameNameMerges:false,
      minimumCorroboratingContextSignalsForAutoLink:HIGH_CONTEXT_SIGNALS,
      reviewDecisions:Object.values(REVIEW_DECISIONS)
    },
    discoveryAvailable:Boolean(snapshot),
    visibleEntities:entities.length,
    duplicateDisplayNames,
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  textScanning:false,
  writesPerformed:false,
  mentionKinds:Object.freeze({ ...MENTION_KINDS }),
  resolution:Object.freeze({ ...RESOLUTION }),
  reviewDecisions:Object.freeze({ ...REVIEW_DECISIONS }),
  createCandidate,
  resolve,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignMentions = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | Campaign Link Semantic Mention Foundation v1 ready (read-only, scanning OFF).");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignMentions !== publicApi) attach();
});
