const ATME_ID = "adventurers-tome";
const ATME_CONTRACT = "adventurers-tome-campaign-mention-evidence";
const ATME_VERSION = 1;
const ATME_SETTING = "campaignMentionEvidenceV1";
const ATME_SCHEMA = "adventurers-tome.campaign-mention-evidence";
const ATME_STORAGE_VERSION = 1;

let atMeTimer = null;
let atMeSyncing = false;

const ATME_STATS = {
  syncs:0,
  created:0,
  updated:0,
  historical:0,
  records:0,
  resolvedTargets:0,
  unresolved:0,
  ambiguous:0,
  failures:0,
  lastError:""
};

function atMeClean(value) {
  return String(value ?? "").trim();
}

function atMeNormalize(value) {
  return atMeClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atMeClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atMeArray(value) {
  return Array.isArray(value) ? value : [];
}

function atMeHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function atMeLedger(raw = null) {
  const parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    schema:ATME_SCHEMA,
    version:ATME_STORAGE_VERSION,
    updatedAt:Number(parsed.updatedAt || 0),
    records:atMeArray(parsed.records).map((row) => atMeNormalizeRecord(row))
  };
}

function atMeNormalizeRecord(row = {}) {
  const now = Date.now();
  return {
    id:atMeClean(row.id),
    sourceUuid:atMeClean(row.sourceUuid),
    sourcePageUuid:atMeClean(row.sourcePageUuid),
    sourceKind:atMeClean(row.sourceKind || "source"),
    sourceName:atMeClean(row.sourceName),
    pageName:atMeClean(row.pageName),
    sourcePath:atMeClean(row.sourcePath),
    sourceSort:Number.isFinite(Number(row.sourceSort)) ? Number(row.sourceSort) : 0,
    sourceOrdinal:Number.isFinite(Number(row.sourceOrdinal)) ? Number(row.sourceOrdinal) : null,
    targetUuid:atMeClean(row.targetUuid),
    targetName:atMeClean(row.targetName),
    targetKind:atMeClean(row.targetKind || "unknown"),
    discoveryKind:atMeClean(row.discoveryKind),
    mentionText:atMeClean(row.mentionText),
    snippet:atMeClean(row.snippet),
    start:Number.isFinite(Number(row.start)) ? Number(row.start) : null,
    end:Number.isFinite(Number(row.end)) ? Number(row.end) : null,
    mentionType:atMeClean(row.mentionType || "mentioned"),
    resolutionState:atMeClean(row.resolutionState || "unresolved"),
    resolutionReason:atMeClean(row.resolutionReason),
    confidence:Number(row.confidence || 0),
    detectionConfidence:Number(row.detectionConfidence || 0),
    identityConfidence:Number(row.identityConfidence || 0),
    authority:atMeClean(row.authority || "derived"),
    relationState:atMeClean(row.relationState || "mentioned"),
    linkedAtSync:row.linkedAtSync === true,
    active:row.active !== false,
    visibility:atMeClean(row.visibility || "gm-private"),
    firstSeenAt:Number(row.firstSeenAt || now),
    lastSeenAt:Number(row.lastSeenAt || now),
    historicalAt:Number(row.historicalAt || 0) || null,
    provenance:atMeClone(atMeArray(row.provenance)),
    outcome:atMeClean(row.outcome),
    outcomeReason:atMeClean(row.outcomeReason),
    identityBriefing:atMeClone(row.identityBriefing || null),
    identityCandidates:atMeClone(atMeArray(row.identityCandidates))
  };
}

function atMeGetLedger() {
  if (!game.user?.isGM) return atMeLedger();
  try {
    const raw = game.settings.get(ATME_ID, ATME_SETTING);
    const parsed = raw ? JSON.parse(String(raw)) : {};
    return atMeLedger(parsed);
  } catch (_error) {
    return atMeLedger();
  }
}

async function atMeSetLedger(ledger) {
  if (!game.user?.isGM) return atMeLedger();
  const normalized = atMeLedger(ledger);
  normalized.updatedAt = Date.now();
  await game.settings.set(ATME_ID, ATME_SETTING, JSON.stringify(normalized));
  return normalized;
}

function atMeDiscoveryApi() {
  return game.modules.get(ATME_ID)?.api?.campaignMentionDiscovery || null;
}

function atMeSourceScopedApi() {
  return game.modules.get(ATME_ID)?.api?.campaignSourceScopedIdentity || null;
}

function atMeDeterministicApi() {
  return game.modules.get(ATME_ID)?.api?.campaignDeterministicAutoLink || null;
}

function atMeCampaignLinksApi() {
  return game.modules.get(ATME_ID)?.api?.campaignEntityLinks || null;
}

function atMeIdentityApi() {
  return game.modules.get(ATME_ID)?.api?.campaignIdentityReconciliation || null;
}

function atMeSourceJournal(uuid) {
  const value = atMeClean(uuid);
  const match = /^JournalEntry\.([^.]+)$/.exec(value);
  return match ? game.journal?.get(match[1]) || null : null;
}

function atMeSourcePage(uuid) {
  const value = atMeClean(uuid);
  const match = /^JournalEntry\.([^.]+)\.JournalEntryPage\.([^.]+)$/.exec(value);
  if (!match) return null;
  return game.journal?.get(match[1])?.pages?.get(match[2]) || null;
}

function atMePlainText(html) {
  const host = document.createElement("div");
  host.innerHTML = String(html ?? "");
  // qa.31 ledger is GM-private, so a GM's source snippet may retain secret text.
  // Player-safe/viewer-scoped persistence is intentionally deferred to a later layer.
  return atMeClean(host.textContent || host.innerText || "").replace(/\s+/g, " ");
}

function atMeSnippet(row) {
  const page = atMeSourcePage(row?.sourcePageUuid);
  const mention = atMeClean(row?.text);
  if (!page || !mention) return mention;

  const text = atMePlainText(page?.text?.content || "");
  if (!text) return mention;

  const needle = mention.toLocaleLowerCase();
  const haystack = text.toLocaleLowerCase();
  const approximate = Math.max(0, Number(row?.source?.start || 0));
  const occurrences = [];
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    occurrences.push(index);
    offset = index + Math.max(1, needle.length);
  }

  const index = occurrences.length
    ? occurrences.reduce((best, candidate) =>
        Math.abs(candidate - approximate) < Math.abs(best - approximate) ? candidate : best
      , occurrences[0])
    : -1;

  if (index < 0) return mention;
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + mention.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function atMeSourceOrdinal(journal, sourceKind) {
  if (sourceKind !== "session") return null;
  const flagged = Number(journal?.getFlag?.(ATME_ID, "sessionNumber"));
  if (Number.isFinite(flagged) && flagged > 0) return Math.floor(flagged);
  const name = atMeClean(journal?.name);
  const match = name.match(/\bsession\s*0*(\d+)\b/i) || name.match(/^\s*0*(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function atMeRecordGroupKey(row) {
  const sourceUuid = atMeClean(row?.sourceJournalUuid || row?.source?.uuid);
  const pageUuid = atMeClean(row?.sourcePageUuid || row?.source?.pageUuid);
  const mention = atMeNormalize(row?.text);
  const mentionType = row?.mentionType === "explicit-link" ? "explicit-reference" : "prose-mention";
  return [sourceUuid, pageUuid, mentionType, mention].join("|");
}

function atMeRecordId(row, occurrenceOrdinal = 1) {
  return `mention-${atMeHash([atMeRecordGroupKey(row), Number(occurrenceOrdinal || 1)].join("|"))}`;
}

function atMeScopedResolution(row) {
  const scoped = atMeSourceScopedApi();
  const deterministic = atMeDeterministicApi();
  const originalCandidates = atMeArray(row?.resolution?.candidates)
    .map((entry) => entry?.target)
    .filter(Boolean);

  let result = null;
  if (scoped?.resolveMention) {
    result = scoped.resolveMention({
      sourceUuid:row?.sourceJournalUuid || row?.source?.uuid,
      sourcePageUuid:row?.sourcePageUuid || row?.source?.pageUuid,
      text:row?.text,
      resolution:row?.resolution || null,
      candidates:originalCandidates,
      identityConfidence:Number(row?.resolution?.confidence || row?.assessment?.identity?.score || 0)
    }) || null;
  }

  if (!result) {
    result = {
      decision:atMeClean(row?.resolution?.decision || "unresolved"),
      confidence:Number(row?.resolution?.confidence || 0),
      authorityUuid:atMeClean(row?.resolution?.selectedTarget?.canonicalUuid),
      selectedTarget:atMeClone(row?.resolution?.selectedTarget || null),
      identityAmbiguous:atMeClean(row?.resolution?.decision) === "ambiguous",
      reason:atMeClean(row?.resolution?.reason)
    };
  }

  if (result?.sourceCanonical === true || result?.sourceInline === true) return result;
  if (result?.identityAmbiguous === true || result?.decision === "ambiguous") return result;

  const exact = deterministic?.resolveIdentity?.({
    row,
    sourceUuid:row?.sourceJournalUuid || row?.source?.uuid,
    text:row?.text
  }) || null;

  if (exact?.decision === "ambiguous") {
    return {
      ...result,
      decision:"ambiguous",
      confidence:0,
      authorityUuid:"",
      selectedTarget:null,
      identityAmbiguous:true,
      identityCount:Number(exact.identityCount || 2),
      reason:atMeClean(exact.reason || "multiple-unrelated-exact-identities")
    };
  }

  if (exact?.deterministic === true && exact?.targetUuid) {
    return {
      ...result,
      decision:"resolved-deterministic-existing",
      confidence:1,
      authorityUuid:atMeClean(exact.targetUuid),
      selectedTarget:{
        name:atMeClean(exact.targetName || row?.text),
        kind:atMeClean(exact.targetKind || row?.kindHint || "entity"),
        canonicalUuid:atMeClean(exact.targetUuid)
      },
      identityAmbiguous:false,
      identityCount:1,
      projectionCollapsed:exact.projectionCollapsed === true,
      sourceSignals:[...(result?.sourceSignals || []), "exact-existing-single-canonical-identity"],
      reason:atMeClean(exact.reason || "exact-name-single-canonical-identity-after-reconciliation"),
      deterministicExisting:true
    };
  }

  return result;
}

function atMeRelationState({ decision, targetUuid, linked }) {
  if (decision === "ambiguous") return "ambiguous";
  if (!targetUuid || ["unresolved","unavailable"].includes(decision)) return "unresolved";
  if (linked) return "linked-and-mentioned";
  if (["review"].includes(decision)) return "mentioned-review";
  return "mentioned";
}

function atMeFromDiscoveryRow(row, previous = null, recordId = "") {
  const scoped = atMeScopedResolution(row);
  const decision = atMeClean(scoped?.decision || row?.resolution?.decision || "unresolved");
  const ambiguous = scoped?.identityAmbiguous === true || decision === "ambiguous";
  const selected = scoped?.selectedTarget || row?.resolution?.selectedTarget || null;
  const targetUuid = ambiguous
    ? ""
    : atMeClean(scoped?.authorityUuid || selected?.canonicalUuid);
  const sourceUuid = atMeClean(row?.sourceJournalUuid || row?.source?.uuid);
  const sourcePageUuid = atMeClean(row?.sourcePageUuid || row?.source?.pageUuid);
  const sourceJournal = atMeSourceJournal(sourceUuid);
  const links = atMeCampaignLinksApi();
  let linked = false;
  if (targetUuid && links?.hasCanonicalLink) {
    try { linked = links.hasCanonicalLink({ sourceUuid, targetUuid }) === true; }
    catch (_error) { linked = false; }
  }

  const now = Date.now();
  const record = atMeNormalizeRecord({
    id:recordId || atMeRecordId(row, 1),
    sourceUuid,
    sourcePageUuid,
    sourceKind:atMeClean(row?.sourceKind || "source"),
    sourceName:atMeClean(row?.sourceName || sourceJournal?.name),
    pageName:atMeClean(row?.pageName),
    sourcePath:atMeClean(row?.source?.path),
    sourceSort:Number(sourceJournal?.sort || 0),
    sourceOrdinal:atMeSourceOrdinal(sourceJournal, row?.sourceKind),
    targetUuid,
    targetName:atMeClean(selected?.name || row?.text),
    targetKind:atMeClean(selected?.kind || row?.kindHint || "unknown"),
    mentionText:atMeClean(row?.text),
    snippet:atMeSnippet(row),
    start:row?.source?.start,
    end:row?.source?.end,
    mentionType:row?.mentionType === "explicit-link" ? "explicit-reference" : "prose-mention",
    resolutionState:decision,
    resolutionReason:atMeClean(scoped?.reason || row?.resolution?.reason),
    confidence:Number(scoped?.confidence || row?.resolution?.confidence || 0),
    detectionConfidence:Number(row?.assessment?.detection?.score || 0),
    identityConfidence:Number(scoped?.confidence || row?.assessment?.identity?.score || row?.resolution?.confidence || 0),
    authority:scoped?.sourceCanonical === true
      ? "source-canonical"
      : scoped?.sourceInline === true
        ? "source-inline"
        : scoped?.deterministicExisting === true
          ? "deterministic-existing-world"
          : targetUuid
            ? "resolved-identity"
            : "derived",
    relationState:atMeRelationState({ decision, targetUuid, linked }),
    outcome:linked ? "LINKED" : "REVIEW",
    outcomeReason:linked ? "canonical-campaign-link" : atMeClean(scoped?.reason || row?.resolution?.reason || "identity-needs-review"),
    linkedAtSync:linked,
    active:true,
    visibility:"gm-private",
    firstSeenAt:Number(previous?.firstSeenAt || now),
    lastSeenAt:now,
    historicalAt:null,
    provenance:[
      {
        provider:"campaign-mention-discovery",
        sourceUuid,
        sourcePageUuid,
        sourcePath:atMeClean(row?.source?.path),
        mentionId:atMeClean(row?.id)
      },
      ...(row.consolidation ? [{provider:"campaign-candidate-consolidation",...atMeClone(row.consolidation)}] : []),
      ...atMeArray(row?.provenance)
    ]
  });
  return record;
}

function atMeSortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return Number(b.active) - Number(a.active);
    const aOrdinal = Number.isFinite(Number(a.sourceOrdinal)) ? Number(a.sourceOrdinal) : null;
    const bOrdinal = Number.isFinite(Number(b.sourceOrdinal)) ? Number(b.sourceOrdinal) : null;
    if (aOrdinal != null && bOrdinal != null && aOrdinal !== bOrdinal) return bOrdinal - aOrdinal;
    if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
    if (Number(a.sourceSort || 0) !== Number(b.sourceSort || 0)) return Number(b.sourceSort || 0) - Number(a.sourceSort || 0);
    return Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0);
  });
}
function atMeChronologicalCompare(a, b) {
  const aOrdinal = Number.isFinite(Number(a?.sourceOrdinal)) ? Number(a.sourceOrdinal) : null;
  const bOrdinal = Number.isFinite(Number(b?.sourceOrdinal)) ? Number(b.sourceOrdinal) : null;
  if (aOrdinal != null && bOrdinal != null && aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  if (Number(a?.sourceSort || 0) !== Number(b?.sourceSort || 0)) return Number(a?.sourceSort || 0) - Number(b?.sourceSort || 0);
  return Number(a?.firstSeenAt || 0) - Number(b?.firstSeenAt || 0);
}

function atMeQuerySort(rows, mode = "newest") {
  const value = atMeClean(mode || "newest").toLowerCase();
  const copy = [...rows];

  if (value === "oldest" || value === "first") {
    return copy.sort((a, b) => {
      if (a.active !== b.active) return Number(b.active) - Number(a.active);
      return atMeChronologicalCompare(a, b);
    });
  }

  if (value === "first-seen") {
    return copy.sort((a, b) => Number(a.firstSeenAt || 0) - Number(b.firstSeenAt || 0));
  }

  if (value === "last-seen") {
    return copy.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
  }

  return atMeSortRows(copy);
}


async function atMeSync(options = {}) {
  if (!game.user?.isGM) return atMeSnapshot();
  if (atMeSyncing) return atMeSnapshot();
  atMeSyncing = true;
  ATME_STATS.syncs += 1;

  try {
    const discovery = atMeDiscoveryApi();
    let snapshot = discovery?.snapshot?.() || null;
    if ((!snapshot || options.rescan === true) && discovery?.scan) {
      snapshot = await discovery.scan({ rescanDiscovery:options.rescanDiscovery === true });
    }
    if (!snapshot) return atMeSnapshot();

    const current = atMeGetLedger();
    const previousById = new Map(current.records.map((row) => [row.id, row]));
    const seen = new Set();
    const next = [];

    let created = 0;
    let updated = 0;
    let resolvedTargets = 0;
    let unresolved = 0;
    let ambiguous = 0;

    const occurrenceCounts = new Map();
    const moduleApi = game.modules.get(ATME_ID)?.api;
    const newDiscovery = moduleApi?.campaignNewEntityDiscovery;
    const discovered = newDiscovery?.scan ? await newDiscovery.scan({}) : null;
    for (const rawRow of atMeArray(snapshot.mentions)) {
      const consolidated = newDiscovery?.candidateForMention?.(rawRow);
      let row = consolidated && atMeNormalize(consolidated.text) !== atMeNormalize(rawRow.text)
        ? { ...rawRow, text:consolidated.text, kindHint:consolidated.classification?.kind,
            resolution:null, consolidation:{rawText:rawRow.text,candidateId:consolidated.id} }
        : rawRow;
      // Legacy semantic suggestions also pass the same precision gate before
      // becoming active Memory evidence or a GM recommendation.
      const assess = moduleApi?.campaignEntityCreation?.assessExistingMatch;
      if (assess && row.mentionType !== "explicit-link" && row.resolution) {
        const eligible = (target) => target && assess({text:row.text,kind:row.kindHint,sourceUuid:row.sourceJournalUuid,target}).eligible;
        row={...row,resolution:{...row.resolution,
          candidates:atMeArray(row.resolution.candidates).filter((entry)=>eligible(entry.target || entry.entity || entry)),
          selectedTarget:eligible(row.resolution.selectedTarget) ? row.resolution.selectedTarget : null
        }};
        if (!row.resolution.selectedTarget && !row.resolution.candidates.length)row.resolution={...row.resolution,decision:"unresolved",confidence:0,reason:"no-safe-existing-match"};
      }
      const groupKey = atMeRecordGroupKey(row);
      const occurrenceOrdinal = Number(occurrenceCounts.get(groupKey) || 0) + 1;
      occurrenceCounts.set(groupKey, occurrenceOrdinal);
      const id = atMeRecordId(row, occurrenceOrdinal);
      const previous = previousById.get(id) || null;
      const record = atMeFromDiscoveryRow(row, previous, id);
      next.push(record);
      seen.add(id);
      if (previous) updated += 1;
      else created += 1;
      if (record.targetUuid) resolvedTargets += 1;
      if (record.relationState === "ambiguous") ambiguous += 1;
      else if (record.relationState === "unresolved") unresolved += 1;
    }

    // Feed new discovery into the existing Memory ledger/Analysis queue. The
    // discovery stage stays read-only; creation and linking belong to resolution.
    if (discovered && moduleApi?.campaignEntityCreation?.resolveCandidates) {
      const outcomes = await moduleApi.campaignEntityCreation.resolveCandidates(discovered.candidates || []);
      for (const candidate of outcomes) {
        const id = `identity:${candidate.id}`;
        const previous = previousById.get(id);
        const matches = next.filter((record) => record.sourceUuid === candidate.sourceJournalUuid
          && record.sourcePageUuid === candidate.sourcePageUuid
          && atMeNormalize(record.mentionText) === atMeNormalize(candidate.text));
        const document = candidate.targetUuid ? await fromUuid(candidate.targetUuid).catch(() => null) : null;
        const fields = {
          outcome:candidate.outcome,
          outcomeReason:candidate.outcomeReason,
          identityBriefing:candidate.identityBriefing,
          identityCandidates:candidate.identityCandidates,
          discoveryKind:candidate.classification?.kind,
          targetUuid:candidate.targetUuid,
          targetName:document?.name || candidate.text,
          targetKind:document?.documentName === "Actor" ? "character" : document?.documentName === "Item" ? "item"
            : document?.getFlag?.(ATME_ID,"worldProfile")?.category || candidate.resolutionKind || candidate.classification?.kind,
          resolutionState:candidate.outcome === "REVIEW" ? candidate.identityAmbiguous ? "ambiguous" : "review" : "resolved",
          resolutionReason:candidate.outcomeReason,
          relationState:candidate.outcome === "REVIEW" ? candidate.identityAmbiguous ? "ambiguous" : "mentioned-review" : "linked-and-mentioned",
          linkedAtSync:candidate.outcome !== "REVIEW"
        };
        if (matches.length) {
          for (const record of matches) Object.assign(record, fields);
        } else {
          const journal = atMeSourceJournal(candidate.sourceJournalUuid);
          next.push(atMeNormalizeRecord({
            ...fields, id,
            sourceUuid:candidate.sourceJournalUuid, sourcePageUuid:candidate.sourcePageUuid,
            sourceKind:candidate.sourceKind, sourceName:candidate.sourceName, pageName:candidate.pageName,
            sourceSort:journal?.sort, sourceOrdinal:atMeSourceOrdinal(journal,candidate.sourceKind),
            mentionText:candidate.text, snippet:candidate.mentions?.[0]?.context || candidate.text,
            start:candidate.mentions?.[0]?.start, end:candidate.mentions?.[0]?.end,
            detectionConfidence:candidate.detection?.score,
            firstSeenAt:previous?.firstSeenAt, active:true,
            provenance:[{ provider:"campaign-new-entity-discovery", candidateId:candidate.id }]
          }));
          seen.add(id);
        }
      }
    }

    let historical = 0;
    for (const previous of current.records) {
      if (seen.has(previous.id)) continue;
      if (previous.active === false) {
        next.push(previous);
        continue;
      }
      historical += 1;
      next.push(atMeNormalizeRecord({
        ...previous,
        active:false,
        relationState:previous.linkedAtSync ? "historical-linked-mention" : "historical-mention",
        historicalAt:Date.now()
      }));
    }

    const ledger = {
      schema:ATME_SCHEMA,
      version:ATME_STORAGE_VERSION,
      updatedAt:Date.now(),
      records:atMeSortRows(next)
    };

    const before = JSON.stringify(atMeSortRows(current.records));
    const after = JSON.stringify(ledger.records);
    if (before !== after) await atMeSetLedger(ledger);

    resolvedTargets = next.filter((row) => row.active && row.targetUuid).length;
    unresolved = next.filter((row) => row.active && !row.targetUuid).length;
    ambiguous = next.filter((row) => row.active && row.relationState === "ambiguous").length;
    const outcomes = Object.fromEntries(["LINKED","CREATED","REVIEW"].map((outcome) =>
      [outcome, next.filter((row) => row.active && row.outcome === outcome).length]));

    ATME_STATS.created += created;
    ATME_STATS.updated += updated;
    ATME_STATS.historical += historical;
    ATME_STATS.records = ledger.records.length;
    ATME_STATS.resolvedTargets = resolvedTargets;
    ATME_STATS.unresolved = unresolved;
    ATME_STATS.ambiguous = ambiguous;

    Hooks.callAll("adventurersTomeCampaignMentionEvidenceUpdated", {
      reason:atMeClean(options.reason || "sync"),
      created,
      updated,
      historical,
      records:ledger.records.length,
      resolvedTargets,
      unresolved,
      ambiguous,
      outcomes
    });

    const app = game.modules.get(ATME_ID)?.api?.app?.();
    if (app?.rendered) void app.render({ parts:["main"] });
    return atMeClone(ledger);
  } catch (error) {
    ATME_STATS.failures += 1;
    ATME_STATS.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Campaign Mention Evidence sync failed safely", error);
    return atMeSnapshot();
  } finally {
    atMeSyncing = false;
  }
}

function atMeSnapshot() {
  const ledger = atMeGetLedger();
  return {
    contract:ATME_CONTRACT,
    version:ATME_VERSION,
    schema:ATME_SCHEMA,
    storageVersion:ATME_STORAGE_VERSION,
    generatedAt:Date.now(),
    viewerUserId:atMeClean(game.user?.id),
    viewerIsGM:Boolean(game.user?.isGM),
    storageScope:"user",
    privacyScope:"gm-private-v1",
    records:atMeClone(game.user?.isGM ? ledger.records : []),
    summary:{
      total:game.user?.isGM ? ledger.records.length : 0,
      active:game.user?.isGM ? ledger.records.filter((row) => row.active).length : 0,
      historical:game.user?.isGM ? ledger.records.filter((row) => !row.active).length : 0,
      resolved:game.user?.isGM ? ledger.records.filter((row) => Boolean(row.targetUuid)).length : 0,
      unresolved:game.user?.isGM ? ledger.records.filter((row) => !row.targetUuid).length : 0
    }
  };
}

function atMeQuery(options = {}) {
  if (!game.user?.isGM) return [];
  const text = atMeNormalize(options.text);
  const targetUuid = atMeClean(options.targetUuid);
  const sourceUuid = atMeClean(options.sourceUuid);
  const sourceKind = atMeClean(options.sourceKind).toLowerCase();
  const targetKind = atMeClean(options.targetKind).toLowerCase();
  const mentionType = atMeClean(options.mentionType).toLowerCase();
  const relationState = atMeClean(options.relationState).toLowerCase();
  const lifecycle = atMeClean(options.lifecycle).toLowerCase();
  const includeHistorical = options.includeHistorical === true || lifecycle === "historical" || lifecycle === "all";

  let rows = atMeGetLedger().records.filter((row) => {
    if (!includeHistorical && !row.active) return false;
    if (lifecycle === "active" && row.active === false) return false;
    if (lifecycle === "historical" && row.active !== false) return false;
    if (targetUuid && row.targetUuid !== targetUuid) return false;
    if (sourceUuid && row.sourceUuid !== sourceUuid && row.sourcePageUuid !== sourceUuid) return false;
    if (sourceKind && row.sourceKind.toLowerCase() !== sourceKind) return false;
    if (targetKind && row.targetKind.toLowerCase() !== targetKind) return false;
    if (mentionType && row.mentionType.toLowerCase() !== mentionType) return false;
    if (relationState && row.relationState.toLowerCase() !== relationState) return false;
    if (text) {
      const haystack = atMeNormalize([
        row.sourceName,
        row.pageName,
        row.targetName,
        row.mentionText,
        row.snippet,
        row.mentionType,
        row.relationState,
        row.resolutionState
      ].join(" "));
      if (!haystack.includes(text)) return false;
    }
    return true;
  });

  rows = atMeQuerySort(rows, options.sort || "newest");
  const limit = Math.max(0, Number(options.limit || 0));
  return atMeClone(limit ? rows.slice(0, limit) : rows);
}

function atMeRecordsForTarget(targetUuid, options = {}) {
  return atMeQuery({ ...options, targetUuid });
}

function atMeRecordsForSource(sourceUuid, options = {}) {
  return atMeQuery({ ...options, sourceUuid });
}

function atMeSummaryForTarget(targetUuid, options = {}) {
  const includeHistorical = options.includeHistorical !== false;
  const rows = atMeRecordsForTarget(targetUuid, { includeHistorical, sort:"oldest" });
  const active = rows.filter((row) => row.active !== false);
  const historical = rows.filter((row) => row.active === false);
  const recentLimit = Math.max(1, Number(options.recentLimit || 5));
  const recent = atMeQuery({ targetUuid, includeHistorical:false, sort:"newest", limit:recentLimit });
  return atMeClone({
    targetUuid:atMeClean(targetUuid),
    total:rows.length,
    active:active.length,
    historical:historical.length,
    first:active[0] || null,
    last:active.length ? active[active.length - 1] : null,
    recent
  });
}

function atMeRecentForTarget(targetUuid, limit = 5) {
  return atMeQuery({
    targetUuid,
    includeHistorical:false,
    sort:"newest",
    limit:Math.max(1, Number(limit || 5))
  });
}

function atMeAuthorityUuid(ref) {
  const api = atMeIdentityApi();
  const identity = api?.identityFor?.(ref) || null;
  return atMeClean(identity?.authorityUuid || ref?.canonicalUuid || ref?.uuid);
}

function atMeAudit() {
  const snapshot = atMeSnapshot();
  return {
    contract:ATME_CONTRACT,
    version:ATME_VERSION,
    healthy:ATME_STATS.failures === 0,
    persistence:true,
    storageScope:"user",
    privacyScope:"gm-private-v1",
    sourceOfTruth:"Foundry Session/Quest source documents; ledger is derived evidence index",
    canonicalUuidAuthority:true,
    autoLinkWrites:false,
    autoEntityCreation:false,
    records:snapshot.summary,
    stats:{ ...ATME_STATS }
  };
}

async function atMeClear() {
  if (!game.user?.isGM) throw new Error("GM permission required.");
  await atMeSetLedger({ schema:ATME_SCHEMA, version:ATME_STORAGE_VERSION, records:[] });
  return atMeSnapshot();
}

const ATME_API = Object.freeze({
  contract:ATME_CONTRACT,
  version:ATME_VERSION,
  persistence:true,
  storageScope:"user",
  privacyScope:"gm-private-v1",
  autoLinkWrites:false,
  autoEntityCreation:false,
  sync:(options = {}) => atMeSync(options),
  snapshot:atMeSnapshot,
  query:atMeQuery,
  recordsForTarget:atMeRecordsForTarget,
  recordsForSource:atMeRecordsForSource,
  summaryForTarget:atMeSummaryForTarget,
  recentForTarget:atMeRecentForTarget,
  authorityUuid:atMeAuthorityUuid,
  audit:atMeAudit,
  clear:atMeClear
});

function atMeAttach() {
  const module = game.modules.get(ATME_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignMentionEvidence = ATME_API;
  return true;
}

function atMeSchedule(reason = "lifecycle") {
  if (!game.user?.isGM) return;
  window.clearTimeout(atMeTimer);
  atMeTimer = window.setTimeout(() => {
    atMeTimer = null;
    void atMeSync({ reason }).catch((error) => {
      ATME_STATS.failures += 1;
      ATME_STATS.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Campaign Mention Evidence scheduled sync failed safely", error);
    });
  }, 240);
}

Hooks.once("init", () => {
  game.settings.register(ATME_ID, ATME_SETTING, {
    scope:"user",
    config:false,
    type:String,
    default:JSON.stringify({ schema:ATME_SCHEMA, version:ATME_STORAGE_VERSION, updatedAt:0, records:[] })
  });
});

Hooks.once("ready", () => {
  atMeAttach();
  atMeSchedule("ready");
  console.info("Adventurer's Tome | Campaign Mention Evidence v1 ready (GM-private persistent foundation, auto-link OFF).");
});

Hooks.on("adventurersTomeSemanticMentionDiscoveryUpdated", () => atMeSchedule("mention-discovery-updated"));
Hooks.on("adventurersTomeNewEntityDiscoveryUpdated", () => {
  if (!atMeSyncing) atMeSchedule("new-entity-discovery-updated");
});
Hooks.on("adventurersTomeCampaignEntityLinkChanged", () => atMeSchedule("campaign-link-changed"));
Hooks.on("adventurersTomeDeterministicAutoLinkCompleted", () => atMeSchedule("deterministic-auto-link-completed"));
Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATME_ID)?.api?.campaignMentionEvidence !== ATME_API) atMeAttach();
});
