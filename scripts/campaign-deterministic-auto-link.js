const ATDAL_ID = "adventurers-tome";
const ATDAL_CONTRACT = "adventurers-tome-deterministic-auto-link";
const ATDAL_VERSION = 1;
const ATDAL_POLICY_FLAG = "campaignAutoLinkPolicyV1";
const ATDAL_PROVENANCE_FLAG = "campaignAutoLinkEvidenceV1";

let atDalTimer = null;
let atDalRunning = false;
let atDalInternalWrite = false;

const ATDAL_STATS = {
  scans:0,
  considered:0,
  resolved:0,
  linked:0,
  alreadyLinked:0,
  ambiguous:0,
  unresolved:0,
  suppressed:0,
  skippedUnsupported:0,
  failures:0,
  lastError:""
};

function atDalClean(value) {
  return String(value ?? "").trim();
}

function atDalNormalize(value) {
  return atDalClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atDalClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atDalArray(value) {
  return Array.isArray(value) ? value : [];
}

function atDalUnique(values) {
  return [...new Set(values.map(atDalClean).filter(Boolean))];
}

function atDalIdentityApi() {
  return game.modules.get(ATDAL_ID)?.api?.campaignIdentityReconciliation || null;
}

function atDalDiscoveryApi() {
  return game.modules.get(ATDAL_ID)?.api?.campaignMentionDiscovery || null;
}

function atDalLinksApi() {
  return game.modules.get(ATDAL_ID)?.api?.campaignEntityLinks || null;
}

function atDalEvidenceApi() {
  return game.modules.get(ATDAL_ID)?.api?.campaignMentionEvidence || null;
}

function atDalFolderNames(folder) {
  const names = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(atDalNormalize(current.name));
    const parentId = atDalClean(current.folder?.id ?? current.folder);
    current = parentId ? game.folders?.get(parentId) || null : null;
  }
  return names;
}

function atDalJournalKind(journal) {
  if (!journal || journal.documentName !== "JournalEntry") return "";
  const flagged = atDalClean(journal.getFlag?.(ATDAL_ID, "type")).toLowerCase();
  if (["session","sessions"].includes(flagged)) return "session";
  if (["quest","quests"].includes(flagged)) return "quest";
  if (["rule","rules"].includes(flagged)) return "rule";

  const folderNames = atDalFolderNames(journal.folder || game.folders?.get(atDalClean(journal.folder?.id ?? journal.folder)));
  if (folderNames.includes("sessions")) return "session";
  if (folderNames.includes("quests")) return "quest";
  if (folderNames.includes("rules")) return "rule";
  return "";
}

function atDalWorldJournal(journal) {
  if (!journal || journal.documentName !== "JournalEntry") return false;
  if (atDalJournalKind(journal)) return false;

  const backend = journal.getFlag?.(ATDAL_ID, "backendProjectionV1");
  if (backend?.managed === true) return true;

  const semantic = journal.getFlag?.(ATDAL_ID, "semanticProjection");
  if (semantic?.kind) return true;

  const profile = journal.getFlag?.(ATDAL_ID, "worldProfile");
  if (profile && typeof profile === "object") return true;

  const categories = new Set([
    "world","contacts","contact","factions","faction","locations","location",
    "places","place","items","item","lore","npcs","npc","npc groups","npc group"
  ]);
  return atDalFolderNames(journal.folder || game.folders?.get(atDalClean(journal.folder?.id ?? journal.folder)))
    .some((name) => categories.has(name));
}

function atDalKindForJournal(journal) {
  const backend = journal?.getFlag?.(ATDAL_ID, "backendProjectionV1");
  if (backend?.category) return atDalClean(backend.category).toLowerCase();
  const semantic = journal?.getFlag?.(ATDAL_ID, "semanticProjection");
  if (semantic?.kind) return atDalClean(semantic.kind).toLowerCase();
  const profile = journal?.getFlag?.(ATDAL_ID, "worldProfile");
  if (profile?.category) return atDalClean(profile.category).toLowerCase();

  const names = atDalFolderNames(journal?.folder || game.folders?.get(atDalClean(journal?.folder?.id ?? journal?.folder)));
  if (names.includes("factions")) return "faction";
  if (names.includes("locations") || names.includes("places")) return "location";
  if (names.includes("items")) return "item";
  if (names.includes("contacts")) return "contact";
  if (names.includes("lore")) return "lore";
  return "world";
}

function atDalCandidateFromActor(actor) {
  return {
    name:atDalClean(actor?.name),
    kind:"character",
    canonicalUuid:atDalClean(actor?.uuid),
    foundry:{ documentName:"Actor", id:atDalClean(actor?.id) }
  };
}

function atDalCandidateFromItem(item) {
  return {
    name:atDalClean(item?.name),
    kind:"item",
    canonicalUuid:atDalClean(item?.uuid),
    foundry:{ documentName:"Item", id:atDalClean(item?.id) }
  };
}

function atDalCandidateFromJournal(journal) {
  return {
    name:atDalClean(journal?.name),
    kind:atDalKindForJournal(journal),
    canonicalUuid:atDalClean(journal?.uuid),
    foundry:{ documentName:"JournalEntry", id:atDalClean(journal?.id) }
  };
}

function atDalCandidatePool() {
  const rows = [];
  for (const actor of game.actors?.contents || []) rows.push(atDalCandidateFromActor(actor));
  for (const item of game.items?.contents || []) rows.push(atDalCandidateFromItem(item));
  for (const journal of game.journal?.contents || []) {
    if (atDalWorldJournal(journal)) rows.push(atDalCandidateFromJournal(journal));
  }
  return rows.filter((row) => row.name && row.canonicalUuid);
}

function atDalAuthorityUuid(row) {
  return atDalClean(
    row?.identityAuthorityUuid
    || row?.identity?.authorityUuid
    || row?.canonicalUuid
    || row?.uuid
  );
}

function atDalResolveIdentity(input = {}) {
  const text = atDalClean(input.text || input.name || input.row?.text);
  const normalized = atDalNormalize(text);
  const sourceUuid = atDalClean(input.sourceUuid || input.row?.sourceJournalUuid || input.row?.source?.uuid);

  if (!normalized) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:"empty-mention",
      text,
      sourceUuid,
      candidates:[]
    };
  }

  const exact = atDalCandidatePool().filter((candidate) => atDalNormalize(candidate.name) === normalized);
  if (!exact.length) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:"no-exact-world-identity",
      text,
      sourceUuid,
      candidates:[]
    };
  }

  const identityApi = atDalIdentityApi();
  const reconciled = identityApi?.reconcile
    ? (identityApi.reconcile(exact) || [])
    : exact.map((candidate) => ({
        ...candidate,
        identityAuthorityUuid:candidate.canonicalUuid,
        identityAmbiguous:false,
        identityCount:1
      }));

  const ambiguousRow = reconciled.find((row) => row?.identityAmbiguous === true) || null;
  const distinctAuthorities = atDalUnique(reconciled.map(atDalAuthorityUuid));
  const identityCount = Math.max(
    Number(ambiguousRow?.identityCount || 0),
    distinctAuthorities.length,
    ambiguousRow ? 2 : 0
  );

  if (ambiguousRow || distinctAuthorities.length > 1 || reconciled.length > 1) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"ambiguous",
      deterministic:false,
      reason:"multiple-unrelated-exact-identities",
      text,
      sourceUuid,
      identityCount:Math.max(2, identityCount),
      candidates:atDalClone(exact),
      reconciled:atDalClone(reconciled)
    };
  }

  const selected = reconciled[0] || exact[0];
  const authorityUuid = atDalAuthorityUuid(selected);
  if (!authorityUuid || authorityUuid === sourceUuid) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:authorityUuid === sourceUuid ? "source-self-reference" : "missing-authority-uuid",
      text,
      sourceUuid,
      candidates:atDalClone(exact)
    };
  }

  const supported = /^(?:Actor|Item|JournalEntry)\.[^.]+$/.test(authorityUuid);
  if (!supported) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unsupported",
      deterministic:false,
      reason:"authority-type-not-linkable",
      text,
      sourceUuid,
      authorityUuid,
      candidates:atDalClone(exact)
    };
  }

  return {
    contract:ATDAL_CONTRACT,
    version:ATDAL_VERSION,
    decision:"deterministic",
    deterministic:true,
    reason:"exact-name-single-canonical-identity-after-reconciliation",
    text,
    sourceUuid,
    authorityUuid,
    targetUuid:authorityUuid,
    targetName:atDalClean(selected?.name || exact[0]?.name || text),
    targetKind:atDalClean(selected?.identityKindLabel || selected?.kind || exact[0]?.kind || "entity"),
    projectionCollapsed:selected?.identityProjectionCollapsed === true,
    identityCount:1,
    candidates:atDalClone(exact),
    reconciled:atDalClone(reconciled)
  };
}

function atDalPolicy(source) {
  const raw = source?.getFlag?.(ATDAL_ID, ATDAL_POLICY_FLAG);
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    suppressedTargetUuids:atDalUnique(atDalArray(value.suppressedTargetUuids)),
    updatedAt:Number(value.updatedAt || 0)
  };
}

function atDalProvenance(source) {
  const raw = source?.getFlag?.(ATDAL_ID, ATDAL_PROVENANCE_FLAG);
  const rows = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return foundry.utils.deepClone(rows);
}

async function atDalWritePolicy(source, policy) {
  if (!source?.update || !game.user?.isGM) return;
  await source.update({
    [`flags.${ATDAL_ID}.${ATDAL_POLICY_FLAG}`]:{
      suppressedTargetUuids:atDalUnique(policy?.suppressedTargetUuids || []),
      updatedAt:Date.now()
    }
  });
}

async function atDalWriteProvenance(source, targetUuid, row, resolution) {
  if (!source?.update || !game.user?.isGM) return;
  const current = atDalProvenance(source);
  current[targetUuid] = {
    mode:"deterministic-auto-link-v1",
    targetUuid,
    targetName:atDalClean(resolution?.targetName || row?.text),
    mentionText:atDalClean(row?.text),
    sourcePageUuid:atDalClean(row?.sourcePageUuid || row?.source?.pageUuid),
    reason:atDalClean(resolution?.reason),
    identityCount:Number(resolution?.identityCount || 1),
    projectionCollapsed:resolution?.projectionCollapsed === true,
    linkedAt:Date.now()
  };
  await source.update({
    [`flags.${ATDAL_ID}.${ATDAL_PROVENANCE_FLAG}`]:current
  });
}

function atDalSourceJournal(sourceUuid) {
  const value = atDalClean(sourceUuid);
  const match = /^JournalEntry\.([^.]+)/.exec(value);
  return match ? game.journal?.get(match[1]) || null : null;
}

function atDalWasAutoLinked(source, targetUuid) {
  const provenance = atDalProvenance(source);
  return Boolean(provenance?.[targetUuid]);
}

async function atDalMarkSuppressed(sourceUuid, targetUuid) {
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !targetUuid) return false;
  const policy = atDalPolicy(source);
  if (policy.suppressedTargetUuids.includes(targetUuid)) return true;
  policy.suppressedTargetUuids.push(targetUuid);
  await atDalWritePolicy(source, policy);
  return true;
}

async function atDalClearSuppressed(sourceUuid, targetUuid) {
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !targetUuid) return false;
  const policy = atDalPolicy(source);
  if (!policy.suppressedTargetUuids.includes(targetUuid)) return true;
  policy.suppressedTargetUuids = policy.suppressedTargetUuids.filter((uuid) => uuid !== targetUuid);
  await atDalWritePolicy(source, policy);
  return true;
}

async function atDalAutoLinkRow(row) {
  ATDAL_STATS.considered += 1;
  const sourceUuid = atDalClean(row?.sourceJournalUuid || row?.source?.uuid);
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !["session","quest"].includes(atDalJournalKind(source))) {
    return { linked:false, decision:"skip", reason:"source-not-session-or-quest" };
  }

  const consolidated = game.modules.get(ATDAL_ID)?.api?.campaignNewEntityDiscovery?.candidateForMention?.(row);
  if (consolidated?.ambiguousSourceReference) {
    ATDAL_STATS.ambiguous += 1;
    return {linked:false,decision:"ambiguous",reason:"ambiguous-source-first-name-reference",text:row.text,sourceUuid};
  }
  if (consolidated) row = {...row,text:consolidated.text};

  const resolution = atDalResolveIdentity({ row, sourceUuid, text:row?.text });
  if (resolution.decision === "ambiguous") {
    ATDAL_STATS.ambiguous += 1;
    return { linked:false, ...resolution };
  }
  if (resolution.decision === "unsupported") {
    ATDAL_STATS.skippedUnsupported += 1;
    return { linked:false, ...resolution };
  }
  if (!resolution.deterministic || !resolution.targetUuid) {
    ATDAL_STATS.unresolved += 1;
    return { linked:false, ...resolution };
  }

  ATDAL_STATS.resolved += 1;
  const policy = atDalPolicy(source);
  if (policy.suppressedTargetUuids.includes(resolution.targetUuid)) {
    ATDAL_STATS.suppressed += 1;
    return { linked:false, ...resolution, decision:"suppressed", reason:"gm-unlink-suppression" };
  }

  const links = atDalLinksApi();
  if (!links?.hasCanonicalLink || !links?.linkCanonical) {
    return { linked:false, ...resolution, decision:"unavailable", reason:"campaign-link-api-unavailable" };
  }

  if (links.hasCanonicalLink({ sourceUuid, targetUuid:resolution.targetUuid })) {
    ATDAL_STATS.alreadyLinked += 1;
    return { linked:false, alreadyLinked:true, ...resolution };
  }

  atDalInternalWrite = true;
  try {
    await links.linkCanonical({ sourceUuid, targetUuid:resolution.targetUuid });
    await atDalWriteProvenance(source, resolution.targetUuid, row, resolution);
    ATDAL_STATS.linked += 1;
    return { linked:true, ...resolution };
  } finally {
    atDalInternalWrite = false;
  }
}

async function atDalScan(options = {}) {
  if (!game.user?.isGM) return atDalAudit();
  if (atDalRunning) return atDalAudit();
  atDalRunning = true;
  ATDAL_STATS.scans += 1;

  try {
    const discovery = atDalDiscoveryApi();
    let snapshot = discovery?.snapshot?.() || null;
    if ((!snapshot || options.rescan === true) && discovery?.scan) {
      snapshot = await discovery.scan({ rescanDiscovery:options.rescanDiscovery === true });
    }
    if (!snapshot) return atDalAudit();

    await game.modules.get(ATDAL_ID)?.api?.campaignNewEntityDiscovery?.scan?.({});

    const results = [];
    for (const row of atDalArray(snapshot.mentions)) {
      try {
        results.push(await atDalAutoLinkRow(row));
      } catch (error) {
        ATDAL_STATS.failures += 1;
        ATDAL_STATS.lastError = String(error?.message || error);
        results.push({
          linked:false,
          decision:"error",
          text:atDalClean(row?.text),
          sourceUuid:atDalClean(row?.sourceJournalUuid || row?.source?.uuid),
          reason:String(error?.message || error)
        });
      }
    }

    if (results.some((row) => row.linked)) {
      try { await atDalEvidenceApi()?.sync?.({ reason:"deterministic-auto-link" }); }
      catch (_error) {}
      const app = game.modules.get(ATDAL_ID)?.api?.app?.();
      if (app?.rendered) void app.render({ parts:["main"] });
    }

    Hooks.callAll("adventurersTomeDeterministicAutoLinkCompleted", {
      reason:atDalClean(options.reason || "scan"),
      results:atDalClone(results)
    });

    return { ...atDalAudit(), results:atDalClone(results) };
  } catch (error) {
    ATDAL_STATS.failures += 1;
    ATDAL_STATS.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Deterministic Auto-Link failed safely", error);
    return atDalAudit();
  } finally {
    atDalRunning = false;
  }
}

function atDalAudit() {
  return {
    contract:ATDAL_CONTRACT,
    version:ATDAL_VERSION,
    healthy:ATDAL_STATS.failures === 0,
    gmOnly:true,
    autoLinkWrites:true,
    autoEntityCreation:false,
    ambiguousAutoLink:false,
    exactNameRequired:true,
    uniqueCanonicalIdentityRequired:true,
    gmUnlinkCreatesSuppression:true,
    supportedTargetTypes:["Actor","Item","JournalEntry"],
    stats:{ ...ATDAL_STATS }
  };
}

function atDalSchedule(reason = "lifecycle", delay = 320) {
  if (!game.user?.isGM) return;
  window.clearTimeout(atDalTimer);
  atDalTimer = window.setTimeout(() => {
    atDalTimer = null;
    void atDalScan({ reason }).catch((error) => {
      ATDAL_STATS.failures += 1;
      ATDAL_STATS.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Deterministic Auto-Link scheduled scan failed safely", error);
    });
  }, delay);
}

const ATDAL_API = Object.freeze({
  contract:ATDAL_CONTRACT,
  version:ATDAL_VERSION,
  autoLinkWrites:true,
  autoEntityCreation:false,
  resolveIdentity:(input = {}) => atDalClone(atDalResolveIdentity(input)),
  scan:(options = {}) => atDalScan(options),
  audit:atDalAudit,
  suppress:({ sourceUuid, targetUuid }) => atDalMarkSuppressed(sourceUuid, targetUuid),
  unsuppress:({ sourceUuid, targetUuid }) => atDalClearSuppressed(sourceUuid, targetUuid)
});

function atDalAttach() {
  const module = game.modules.get(ATDAL_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignDeterministicAutoLink = ATDAL_API;
  return true;
}

Hooks.once("ready", () => {
  atDalAttach();
  atDalSchedule("ready", 480);
  console.info("Adventurer's Tome | Deterministic Campaign Auto-Link v1 ready.");
});

Hooks.on("adventurersTomeSemanticMentionDiscoveryUpdated", () => atDalSchedule("mention-discovery-updated", 360));
Hooks.on("adventurersTomeCampaignEntityLinkChanged", (event = {}) => {
  if (!game.user?.isGM || atDalInternalWrite) return;
  const sourceUuid = atDalClean(event.sourceUuid);
  const targetUuid = atDalClean(event.targetUuid);
  if (!sourceUuid || !targetUuid) return;

  const source = atDalSourceJournal(sourceUuid);
  if (!source) return;

  if (event.linked === false && atDalWasAutoLinked(source, targetUuid)) {
    void atDalMarkSuppressed(sourceUuid, targetUuid);
    return;
  }

  if (event.linked === true) {
    void atDalClearSuppressed(sourceUuid, targetUuid);
  }
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATDAL_ID)?.api?.campaignDeterministicAutoLink !== ATDAL_API) atDalAttach();
});
