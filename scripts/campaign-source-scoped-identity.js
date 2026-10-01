const ATSSI_ID = "adventurers-tome";
const ATSSI_CONTRACT = "adventurers-tome-source-scoped-identity-resolution";
const ATSSI_VERSION = 1;

const ATSSI_STATS = {
  resolves:0,
  sourceCanonicalWins:0,
  inlineWins:0,
  worldScopedWins:0,
  reconciled:0,
  ambiguous:0,
  unresolved:0,
  compendiumFallbacks:0,
  failures:0,
  lastError:""
};

function atSsiClean(value) {
  return String(value ?? "").trim();
}

function atSsiNormalize(value) {
  return atSsiClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atSsiClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atSsiArray(value) {
  return Array.isArray(value) ? value : [];
}

function atSsiUnique(values) {
  return [...new Set(values.map(atSsiClean).filter(Boolean))];
}

function atSsiIdentityApi() {
  return game.modules.get(ATSSI_ID)?.api?.campaignIdentityReconciliation || null;
}

function atSsiDiscoveryApi() {
  return game.modules.get(ATSSI_ID)?.api?.discovery || null;
}

function atSsiSourceJournal(sourceUuid) {
  const value = atSsiClean(sourceUuid);
  const match = /^JournalEntry\.([^.]+)(?:\.|$)/.exec(value);
  if (match) return game.journal?.get(match[1]) || null;
  return game.journal?.get(value) || null;
}

function atSsiLegacyLinks(journal) {
  const raw = journal?.getFlag?.(ATSSI_ID, "links");
  const links = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    actors:atSsiArray(links.actors).map(String),
    world:atSsiArray(links.world).map(String),
    quests:atSsiArray(links.quests).map(String),
    sessions:atSsiArray(links.sessions).map(String)
  };
}

function atSsiCanonicalLinks(journal) {
  const raw = journal?.getFlag?.(ATSSI_ID, "campaignEntityLinksV1");
  const links = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    actorUuids:atSsiUnique(atSsiArray(links.actorUuids)),
    entityUuids:atSsiUnique(atSsiArray(links.entityUuids))
  };
}

function atSsiSourceLinkedUuids(journal) {
  if (!journal) return [];
  const canonical = atSsiCanonicalLinks(journal);
  const legacy = atSsiLegacyLinks(journal);
  return atSsiUnique([
    ...canonical.actorUuids,
    ...canonical.entityUuids,
    ...legacy.actors.map((id) => `Actor.${id}`),
    ...legacy.world.map((id) => `JournalEntry.${id}`),
    ...legacy.quests.map((id) => `JournalEntry.${id}`),
    ...legacy.sessions.map((id) => `JournalEntry.${id}`)
  ]);
}

function atSsiDocumentForUuid(uuid) {
  const value = atSsiClean(uuid);
  let match = /^Actor\.([^.]+)$/.exec(value);
  if (match) return game.actors?.get(match[1]) || null;
  match = /^JournalEntry\.([^.]+)$/.exec(value);
  if (match) return game.journal?.get(match[1]) || null;
  match = /^Item\.([^.]+)$/.exec(value);
  if (match) return game.items?.get(match[1]) || null;
  match = /^Scene\.([^.]+)$/.exec(value);
  if (match) return game.scenes?.get(match[1]) || null;
  return null;
}

function atSsiKindForDocument(document) {
  if (!document) return "unknown";
  if (document.documentName === "Actor") return "character";
  if (document.documentName === "Item") return "item";
  if (document.documentName === "Scene") return "location";
  if (document.documentName !== "JournalEntry") return "unknown";

  const flagged = atSsiClean(document.getFlag?.(ATSSI_ID, "type")).toLowerCase();
  if (flagged) {
    if (flagged === "sessions") return "session";
    if (flagged === "quests") return "quest";
    return flagged;
  }

  const names = [];
  let folder = document.folder || null;
  const seen = new Set();
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    names.push(atSsiNormalize(folder.name));
    const parentId = atSsiClean(folder.folder?.id ?? folder.folder);
    folder = parentId ? game.folders?.get(parentId) || null : null;
  }
  if (names.includes("locations")) return "location";
  if (names.includes("factions")) return "faction";
  if (names.includes("quests")) return "quest";
  if (names.includes("sessions")) return "session";
  if (names.includes("contacts")) return "contact";
  if (names.includes("items")) return "item";
  return "lore";
}

function atSsiCandidateFromDocument(document) {
  if (!document) return null;
  return {
    name:atSsiClean(document.name),
    kind:atSsiKindForDocument(document),
    canonicalUuid:atSsiClean(document.uuid),
    foundry:{
      documentName:atSsiClean(document.documentName),
      id:atSsiClean(document.id),
      folderPath:[]
    }
  };
}

function atSsiDiscoveryEntity(uuid) {
  const snapshot = atSsiDiscoveryApi()?.snapshot?.() || null;
  const wanted = atSsiClean(uuid);
  return snapshot?.entities?.find?.((entity) => atSsiClean(entity?.canonicalUuid) === wanted) || null;
}

function atSsiCandidateForUuid(uuid) {
  return atSsiClone(atSsiDiscoveryEntity(uuid) || atSsiCandidateFromDocument(atSsiDocumentForUuid(uuid)));
}

function atSsiPageFromUuid(journal, pageUuid) {
  if (!journal) return null;
  const value = atSsiClean(pageUuid);
  const match = /JournalEntryPage\.([^.]+)$/.exec(value);
  const id = match?.[1] || value;
  return journal.pages?.get?.(id) || null;
}

function atSsiInlineRefsFromHtml(html) {
  const source = String(html ?? "");
  const rows = [];
  const patterns = [
    { re:/@UUID\[([^\]]+)\](?:\{([^}]+)\})?/gi, type:"uuid" },
    { re:/@(Actor|Item|JournalEntry|Scene)\[([^\]]+)\](?:\{([^}]+)\})?/gi, type:"typed" }
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.re.exec(source)) !== null) {
      const typed = pattern.type === "typed";
      const uuid = typed
        ? `${atSsiClean(match[1])}.${atSsiClean(match[2])}`
        : atSsiClean(match[1]);
      const label = atSsiClean(typed ? match[3] : match[2]);
      if (!uuid) continue;
      rows.push({ uuid, label });
    }
  }
  return rows;
}

function atSsiSourceInlineRefs(journal, pageUuid = "") {
  if (!journal) return [];
  const pages = pageUuid
    ? [atSsiPageFromUuid(journal, pageUuid)].filter(Boolean)
    : [...(journal.pages?.contents || [])];

  const rows = [];
  for (const page of pages) {
    const html = page?.text?.content;
    if (html === undefined) continue;
    rows.push(...atSsiInlineRefsFromHtml(html));
  }
  return rows;
}

function atSsiCanonicalUuid(candidate) {
  return atSsiClean(candidate?.canonicalUuid || candidate?.uuid);
}

function atSsiIsCompendium(candidate) {
  const uuid = atSsiCanonicalUuid(candidate);
  return uuid.startsWith("Compendium.") || Boolean(candidate?.foundry?.compendium);
}

function atSsiDedupeCandidates(candidates) {
  const out = [];
  const seen = new Set();
  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const uuid = atSsiCanonicalUuid(candidate);
    const key = uuid || [atSsiNormalize(candidate.name), atSsiClean(candidate.kind)].join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(atSsiClone(candidate));
  }
  return out;
}

function atSsiAuthorityUuid(ref) {
  const identity = atSsiIdentityApi()?.identityFor?.(ref) || null;
  return atSsiClean(identity?.authorityUuid || atSsiCanonicalUuid(ref));
}

function atSsiIdentityKey(ref) {
  const identity = atSsiIdentityApi()?.identityFor?.(ref) || null;
  return atSsiClean(identity?.identityKey || atSsiAuthorityUuid(ref));
}

function atSsiReconcile(candidates) {
  const rows = atSsiDedupeCandidates(candidates);
  const identityApi = atSsiIdentityApi();
  if (!rows.length) return {
    rows:[],
    ambiguous:false,
    count:0,
    collapsed:false,
    selected:null,
    identityKey:"",
    authorityUuid:"",
    identityLabel:""
  };

  if (!identityApi?.reconcile) {
    return {
      rows,
      ambiguous:rows.length > 1,
      count:rows.length,
      collapsed:false,
      selected:rows[0],
      identityKey:rows.length === 1 ? atSsiIdentityKey(rows[0]) : "",
      authorityUuid:rows.length === 1 ? atSsiAuthorityUuid(rows[0]) : "",
      identityLabel:""
    };
  }

  const reconciled = identityApi.reconcile(rows) || [];
  const ambiguousRow = reconciled.find((row) => row?.identityAmbiguous === true) || null;
  const ambiguous = Boolean(ambiguousRow || reconciled.length > 1);
  const selected = ambiguous ? (ambiguousRow || reconciled[0] || null) : (reconciled[0] || null);
  const count = ambiguous
    ? Math.max(2, Number(ambiguousRow?.identityCount || reconciled.length || rows.length))
    : 1;

  return {
    rows:reconciled,
    ambiguous,
    count,
    collapsed:!ambiguous && Boolean(selected?.identityProjectionCollapsed),
    selected,
    identityKey:ambiguous ? "" : atSsiClean(selected?.identityKey),
    authorityUuid:ambiguous ? "" : atSsiClean(selected?.identityAuthorityUuid || selected?.canonicalUuid),
    identityLabel:ambiguous
      ? `${count} possible identities`
      : atSsiClean(selected?.identityKindLabel)
  };
}

function atSsiTargetFromReconciled(reconciled, fallback = null) {
  const selected = reconciled?.selected || null;
  if (!selected) return fallback ? atSsiClone(fallback) : null;
  const uuid = atSsiClean(selected.identityAuthorityUuid || selected.canonicalUuid);
  const entity = uuid ? atSsiCandidateForUuid(uuid) : null;
  return atSsiClone(entity || {
    name:atSsiClean(selected.name || fallback?.name),
    kind:atSsiClean(selected.kind || fallback?.kind || "unknown"),
    canonicalUuid:uuid,
    foundry:selected.foundry || fallback?.foundry || null
  });
}

function atSsiMatchingLocalCandidates(journal, pageUuid, mentionText) {
  const normalized = atSsiNormalize(mentionText);
  if (!journal || !normalized) return { canonical:[], inline:[] };

  const canonical = [];
  for (const uuid of atSsiSourceLinkedUuids(journal)) {
    const candidate = atSsiCandidateForUuid(uuid);
    if (!candidate) continue;
    if (atSsiNormalize(candidate.name) === normalized) canonical.push(candidate);
  }

  const inline = [];
  for (const ref of atSsiSourceInlineRefs(journal, pageUuid)) {
    const candidate = atSsiCandidateForUuid(ref.uuid);
    const labelMatches = ref.label && atSsiNormalize(ref.label) === normalized;
    const nameMatches = candidate && atSsiNormalize(candidate.name) === normalized;
    if (!labelMatches && !nameMatches) continue;
    if (candidate) inline.push(candidate);
  }

  return {
    canonical:atSsiDedupeCandidates(canonical),
    inline:atSsiDedupeCandidates(inline)
  };
}

function atSsiResolutionCandidates(resolution) {
  const selected = resolution?.selectedTarget || null;
  const candidates = atSsiArray(resolution?.candidates)
    .map((row) => row?.target || row)
    .filter(Boolean);
  return atSsiDedupeCandidates(selected ? [selected, ...candidates] : candidates);
}

function atSsiResult(decision, options = {}) {
  return {
    contract:ATSSI_CONTRACT,
    version:ATSSI_VERSION,
    decision,
    confidence:Number(options.confidence || 0),
    selectedTarget:atSsiClone(options.selectedTarget || null),
    candidates:atSsiClone(options.candidates || []),
    identityKey:atSsiClean(options.identityKey),
    authorityUuid:atSsiClean(options.authorityUuid),
    identityLabel:atSsiClean(options.identityLabel),
    identityAmbiguous:Boolean(options.identityAmbiguous),
    identityCount:Number(options.identityCount || 0),
    projectionCollapsed:Boolean(options.projectionCollapsed),
    sourceCanonical:Boolean(options.sourceCanonical),
    sourceInline:Boolean(options.sourceInline),
    sourceSignals:atSsiClone(options.sourceSignals || []),
    sourceUuid:atSsiClean(options.sourceUuid),
    sourcePageUuid:atSsiClean(options.sourcePageUuid),
    reason:atSsiClean(options.reason),
    readOnly:true,
    writesPerformed:false
  };
}

function atSsiResolveMention(input = {}) {
  ATSSI_STATS.resolves += 1;
  try {
    const sourceUuid = atSsiClean(input.sourceUuid || input.sourceJournalUuid);
    const sourcePageUuid = atSsiClean(input.sourcePageUuid || input.pageUuid);
    const text = atSsiClean(input.text || input.name);
    const normalized = atSsiNormalize(text);
    const journal = atSsiSourceJournal(sourceUuid);
    const local = atSsiMatchingLocalCandidates(journal, sourcePageUuid, text);

    const localCanonical = atSsiReconcile(local.canonical);
    if (local.canonical.length && !localCanonical.ambiguous) {
      ATSSI_STATS.sourceCanonicalWins += 1;
      if (localCanonical.collapsed) ATSSI_STATS.reconciled += 1;
      return atSsiResult("resolved-source-canonical", {
        confidence:1,
        selectedTarget:atSsiTargetFromReconciled(localCanonical, local.canonical[0]),
        candidates:local.canonical,
        identityKey:localCanonical.identityKey,
        authorityUuid:localCanonical.authorityUuid,
        identityLabel:localCanonical.identityLabel,
        identityCount:1,
        projectionCollapsed:localCanonical.collapsed,
        sourceCanonical:true,
        sourceSignals:["source-canonical-campaign-link","exact-source-name"],
        sourceUuid,
        sourcePageUuid,
        reason:"source-canonical-link-matches-mention"
      });
    }
    if (local.canonical.length && localCanonical.ambiguous) {
      ATSSI_STATS.ambiguous += 1;
      return atSsiResult("ambiguous", {
        confidence:0,
        candidates:local.canonical,
        identityAmbiguous:true,
        identityCount:localCanonical.count,
        identityLabel:localCanonical.identityLabel,
        sourceCanonical:true,
        sourceSignals:["source-canonical-campaign-link","same-name-source-collision"],
        sourceUuid,
        sourcePageUuid,
        reason:"multiple-source-linked-identities-share-mention"
      });
    }

    const inline = atSsiReconcile(local.inline);
    if (local.inline.length && !inline.ambiguous) {
      ATSSI_STATS.inlineWins += 1;
      if (inline.collapsed) ATSSI_STATS.reconciled += 1;
      return atSsiResult("resolved-source-inline", {
        confidence:1,
        selectedTarget:atSsiTargetFromReconciled(inline, local.inline[0]),
        candidates:local.inline,
        identityKey:inline.identityKey,
        authorityUuid:inline.authorityUuid,
        identityLabel:inline.identityLabel,
        identityCount:1,
        projectionCollapsed:inline.collapsed,
        sourceInline:true,
        sourceSignals:["source-inline-foundry-reference","exact-source-name"],
        sourceUuid,
        sourcePageUuid,
        reason:"source-inline-reference-matches-mention"
      });
    }
    if (local.inline.length && inline.ambiguous) {
      ATSSI_STATS.ambiguous += 1;
      return atSsiResult("ambiguous", {
        confidence:0,
        candidates:local.inline,
        identityAmbiguous:true,
        identityCount:inline.count,
        identityLabel:inline.identityLabel,
        sourceInline:true,
        sourceSignals:["source-inline-foundry-reference","same-name-source-collision"],
        sourceUuid,
        sourcePageUuid,
        reason:"multiple-inline-identities-share-mention"
      });
    }

    const supplied = atSsiDedupeCandidates([
      ...atSsiArray(input.candidates),
      ...atSsiResolutionCandidates(input.resolution)
    ]);

    const exact = supplied.filter((candidate) => atSsiNormalize(candidate?.name) === normalized);
    const exactWorld = exact.filter((candidate) => !atSsiIsCompendium(candidate));
    const world = supplied.filter((candidate) => !atSsiIsCompendium(candidate));

    let scoped = [];
    let reason = "";
    let usedCompendiumFallback = false;

    if (exactWorld.length) {
      scoped = exactWorld;
      reason = "exact-world-candidates";
    } else if (world.length) {
      scoped = world;
      reason = "world-candidates";
    } else if (exact.length) {
      scoped = exact;
      reason = "exact-compendium-fallback";
      usedCompendiumFallback = true;
    } else {
      scoped = supplied;
      reason = supplied.length ? "candidate-fallback" : "no-source-relevant-candidates";
      usedCompendiumFallback = supplied.some(atSsiIsCompendium);
    }

    if (usedCompendiumFallback) ATSSI_STATS.compendiumFallbacks += 1;
    if (!scoped.length) {
      ATSSI_STATS.unresolved += 1;
      return atSsiResult("unresolved", {
        confidence:0,
        sourceUuid,
        sourcePageUuid,
        sourceSignals:[],
        reason
      });
    }

    const reconciled = atSsiReconcile(scoped);
    if (reconciled.ambiguous) {
      ATSSI_STATS.ambiguous += 1;
      return atSsiResult("ambiguous", {
        confidence:0,
        candidates:scoped,
        identityAmbiguous:true,
        identityCount:reconciled.count,
        identityLabel:reconciled.identityLabel,
        sourceSignals:[reason],
        sourceUuid,
        sourcePageUuid,
        reason:"source-scoped-identities-remain-ambiguous"
      });
    }

    ATSSI_STATS.worldScopedWins += 1;
    if (reconciled.collapsed) ATSSI_STATS.reconciled += 1;

    const originalDecision = atSsiClean(input.resolution?.decision);
    const decision = reconciled.collapsed
      ? "reconciled"
      : ["resolved-canonical","resolved-semantic","resolved-external","resolved-corroborated"].includes(originalDecision)
        ? originalDecision
        : "review";
    const baseConfidence = Number(input.resolution?.confidence || input.identityConfidence || 0);
    const confidence = reconciled.collapsed
      ? Math.max(0.8, baseConfidence)
      : Math.max(reason === "exact-world-candidates" ? 0.55 : 0.4, baseConfidence);

    return atSsiResult(decision, {
      confidence,
      selectedTarget:atSsiTargetFromReconciled(reconciled, scoped[0]),
      candidates:scoped,
      identityKey:reconciled.identityKey,
      authorityUuid:reconciled.authorityUuid,
      identityLabel:reconciled.identityLabel,
      identityCount:1,
      projectionCollapsed:reconciled.collapsed,
      sourceSignals:[reason],
      sourceUuid,
      sourcePageUuid,
      reason:reconciled.collapsed ? "source-scoped-projection-convergence" : "source-scoped-single-identity"
    });
  } catch (error) {
    ATSSI_STATS.failures += 1;
    ATSSI_STATS.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Source-scoped identity resolution failed safely", error);
    return atSsiResult("unavailable", {
      sourceUuid:input?.sourceUuid || input?.sourceJournalUuid,
      sourcePageUuid:input?.sourcePageUuid || input?.pageUuid,
      reason:"source-scoped-resolution-failed-safely"
    });
  }
}

function atSsiAudit() {
  return {
    contract:ATSSI_CONTRACT,
    version:ATSSI_VERSION,
    healthy:ATSSI_STATS.failures === 0,
    readOnly:true,
    writesPerformed:false,
    policy:{
      sourceCanonicalBeforeGlobalCandidates:true,
      sourceInlineBeforeGlobalCandidates:true,
      worldBeforeCompendium:true,
      exactWorldNameBeforeBroadWorldCandidates:true,
      projectionReconciliationBeforeAmbiguity:true,
      sameNameOutsideSourceDoesNotOverrideSourceEvidence:true
    },
    stats:{ ...ATSSI_STATS }
  };
}

const ATSSI_API = Object.freeze({
  contract:ATSSI_CONTRACT,
  version:ATSSI_VERSION,
  readOnly:true,
  writesPerformed:false,
  resolveMention:(input = {}) => atSsiClone(atSsiResolveMention(input)),
  audit:atSsiAudit
});

function atSsiAttach() {
  const module = game.modules.get(ATSSI_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignSourceScopedIdentity = ATSSI_API;
  return true;
}

Hooks.once("ready", () => {
  atSsiAttach();
  console.info("Adventurer's Tome | Source-Scoped Identity Resolution v1 ready (read-only).");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATSSI_ID)?.api?.campaignSourceScopedIdentity !== ATSSI_API) atSsiAttach();
});
