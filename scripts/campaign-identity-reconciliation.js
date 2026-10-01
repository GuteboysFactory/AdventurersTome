const ATCIR_ID = "adventurers-tome";
const ATCIR_CONTRACT = "adventurers-tome-campaign-identity-reconciliation";
const ATCIR_VERSION = 1;

const ATCIR_STATS = {
  reconciliations:0,
  collapsedProjections:0,
  ambiguousNames:0,
  failures:0,
  lastError:""
};

function atCirClean(value) {
  return String(value ?? "").trim();
}

function atCirNormalize(value) {
  return atCirClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atCirClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atCirActorUuidFromJournal(journal) {
  if (!journal || journal.documentName !== "JournalEntry") return "";

  const projection = journal.getFlag?.(ATCIR_ID, "semanticProjection");
  const projectionUuid = atCirClean(projection?.linkedUuid);
  if (projection?.kind === "contact" && projectionUuid.startsWith("Actor.")) {
    return projectionUuid;
  }

  const profile = journal.getFlag?.(ATCIR_ID, "worldProfile");
  const sourceUuid = atCirClean(profile?.sourceUuid);
  if (sourceUuid.startsWith("Actor.")) return sourceUuid;

  const actorId = atCirClean(profile?.actorId);
  if (actorId && game.actors?.get(actorId)) return `Actor.${actorId}`;

  return "";
}

function atCirDocumentFromRef(ref = {}) {
  const canonicalUuid = atCirClean(ref?.canonicalUuid || ref?.uuid);

  if (canonicalUuid.startsWith("Actor.")) {
    return game.actors?.get(canonicalUuid.slice(6)) || null;
  }
  if (canonicalUuid.startsWith("JournalEntry.")) {
    return game.journal?.get(canonicalUuid.slice("JournalEntry.".length)) || null;
  }

  const kind = atCirClean(ref?.kind).toLowerCase();
  const id = atCirClean(ref?.id || ref?.journalId || ref?.actorId);

  if (["actor","character","npc","adventurer"].includes(kind)) {
    return game.actors?.get(id) || null;
  }
  if (["world","contact","location","faction","item","lore","journal","quest","session"].includes(kind)) {
    return game.journal?.get(id) || null;
  }

  return game.actors?.get(id) || game.journal?.get(id) || null;
}

function atCirIdentityFor(ref = {}) {
  try {
    const document = atCirDocumentFromRef(ref);
    const name = atCirClean(ref?.name || document?.name);
    const normalizedName = atCirNormalize(name);

    if (document?.documentName === "Actor") {
      return {
        identityKey:`actor:${document.uuid}`,
        authorityUuid:document.uuid,
        authorityDocumentName:"Actor",
        authorityId:document.id,
        name:document.name,
        normalizedName,
        projection:false,
        sourceDocumentName:"Actor",
        sourceUuid:document.uuid,
        sourceId:document.id
      };
    }

    if (document?.documentName === "JournalEntry") {
      const actorUuid = atCirActorUuidFromJournal(document);
      if (actorUuid) {
        const actor = game.actors?.get(actorUuid.slice(6)) || null;
        return {
          identityKey:`actor:${actorUuid}`,
          authorityUuid:actorUuid,
          authorityDocumentName:"Actor",
          authorityId:actor?.id || actorUuid.slice(6),
          name:actor?.name || document.name,
          normalizedName:atCirNormalize(actor?.name || document.name),
          projection:true,
          projectionKind:atCirClean(document.getFlag?.(ATCIR_ID, "semanticProjection")?.kind || "world"),
          sourceDocumentName:"JournalEntry",
          sourceUuid:document.uuid,
          sourceId:document.id
        };
      }

      return {
        identityKey:`journal:${document.uuid}`,
        authorityUuid:document.uuid,
        authorityDocumentName:"JournalEntry",
        authorityId:document.id,
        name:document.name,
        normalizedName,
        projection:false,
        sourceDocumentName:"JournalEntry",
        sourceUuid:document.uuid,
        sourceId:document.id
      };
    }

    const canonicalUuid = atCirClean(ref?.canonicalUuid || ref?.uuid);
    if (canonicalUuid) {
      return {
        identityKey:`uuid:${canonicalUuid}`,
        authorityUuid:canonicalUuid,
        authorityDocumentName:"",
        authorityId:"",
        name,
        normalizedName,
        projection:false,
        sourceDocumentName:"",
        sourceUuid:canonicalUuid,
        sourceId:""
      };
    }

    return {
      identityKey:`name:${normalizedName || atCirClean(ref?.id)}`,
      authorityUuid:"",
      authorityDocumentName:"",
      authorityId:"",
      name,
      normalizedName,
      projection:false,
      sourceDocumentName:"",
      sourceUuid:"",
      sourceId:atCirClean(ref?.id)
    };
  } catch (error) {
    ATCIR_STATS.failures += 1;
    ATCIR_STATS.lastError = String(error?.message || error);
    return null;
  }
}

function atCirKindSet(rows = []) {
  const kinds = new Set();
  for (const row of rows) {
    const kind = atCirClean(row?.kind || row?.suggestionKind).toLowerCase();
    if (kind) kinds.add(kind);
    if (row?.identity?.projection) kinds.add("contact");
    if (row?.identity?.authorityDocumentName === "Actor") kinds.add("character");
  }
  return [...kinds];
}

function atCirKindLabel(rows = []) {
  const kinds = new Set(atCirKindSet(rows));
  if (kinds.has("character") && kinds.has("contact")) return "Character / Contact";
  if (kinds.has("character") || kinds.has("actor") || kinds.has("npc") || kinds.has("adventurer")) return "Character / NPC";
  if (kinds.has("contact")) return "Contact";
  if (kinds.has("location")) return "Location";
  if (kinds.has("faction")) return "Faction";
  if (kinds.has("item")) return "Item";
  if (kinds.has("lore")) return "Lore";
  if (kinds.has("quest")) return "Quest";
  if (kinds.has("session")) return "Session";
  if (kinds.has("world")) return "World";
  return "Entity";
}

function atCirReconcile(rows = [], options = {}) {
  ATCIR_STATS.reconciliations += 1;

  const prepared = rows
    .map((row, index) => {
      const identity = atCirIdentityFor(row);
      return identity ? { ...row, identity, _index:index } : null;
    })
    .filter(Boolean);

  const byIdentity = new Map();
  for (const row of prepared) {
    const key = row.identity.identityKey;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(row);
  }

  const identities = [];
  for (const members of byIdentity.values()) {
    if (members.length > 1 && members.some((row) => row.identity.projection)) {
      ATCIR_STATS.collapsedProjections += members.length - 1;
    }

    const actorMember = members.find((row) => row.identity.authorityDocumentName === "Actor" && row.identity.sourceDocumentName === "Actor");
    const preferred = actorMember || members.find((row) => !row.identity.projection) || members[0];
    const authority = preferred.identity;
    const normalizedName = authority.normalizedName || atCirNormalize(preferred.name);

    identities.push({
      identityKey:authority.identityKey,
      authorityUuid:authority.authorityUuid,
      authorityDocumentName:authority.authorityDocumentName,
      authorityId:authority.authorityId,
      normalizedName,
      name:atCirClean(preferred.name || authority.name),
      kindLabel:atCirKindLabel(members),
      kinds:atCirKindSet(members),
      members,
      preferred
    });
  }

  const byName = new Map();
  for (const identity of identities) {
    const key = identity.normalizedName || atCirNormalize(identity.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(identity);
  }

  const out = [];
  for (const group of byName.values()) {
    const ambiguous = group.length > 1;
    if (ambiguous) ATCIR_STATS.ambiguousNames += 1;

    if (ambiguous && options.collapseAmbiguous !== false) {
      const preferredIdentity = group.find((entry) => entry.authorityDocumentName === "Actor") || group[0];
      const preferred = preferredIdentity.preferred;
      out.push({
        ...preferred,
        identity:preferredIdentity,
        identityKey:"",
        identityAuthorityUuid:"",
        identityKindLabel:preferredIdentity.kindLabel,
        identityProjectionCollapsed:false,
        identityProjectionCount:group.reduce((sum, entry) => sum + entry.members.filter((row) => row.identity.projection).length, 0),
        identityMemberCount:group.reduce((sum, entry) => sum + entry.members.length, 0),
        identityAmbiguous:true,
        identityCount:group.length,
        identityCandidates:group.map((entry) => ({
          identityKey:entry.identityKey,
          authorityUuid:entry.authorityUuid,
          authorityDocumentName:entry.authorityDocumentName,
          authorityId:entry.authorityId,
          name:entry.name,
          kindLabel:entry.kindLabel,
          memberCount:entry.members.length
        }))
      });
      continue;
    }

    for (const identity of group) {
      const preferred = identity.preferred;
      out.push({
        ...preferred,
        identity,
        identityKey:identity.identityKey,
        identityAuthorityUuid:identity.authorityUuid,
        identityKindLabel:identity.kindLabel,
        identityProjectionCollapsed:identity.members.length > 1,
        identityProjectionCount:identity.members.filter((row) => row.identity.projection).length,
        identityMemberCount:identity.members.length,
        identityAmbiguous:ambiguous,
        identityCount:group.length,
        identityCandidates:ambiguous ? group.map((entry) => ({
          identityKey:entry.identityKey,
          authorityUuid:entry.authorityUuid,
          authorityDocumentName:entry.authorityDocumentName,
          authorityId:entry.authorityId,
          name:entry.name,
          kindLabel:entry.kindLabel,
          memberCount:entry.members.length
        })) : []
      });
    }
  }

  return out
    .sort((a, b) => Number(a?._index ?? 0) - Number(b?._index ?? 0))
    .map((row) => {
      const cleanRow = { ...row };
      delete cleanRow._index;
      return cleanRow;
    });
}

function atCirAudit() {
  return {
    contract:ATCIR_CONTRACT,
    version:ATCIR_VERSION,
    healthy:ATCIR_STATS.failures === 0,
    readOnly:true,
    writesPerformed:false,
    stats:{ ...ATCIR_STATS }
  };
}

const ATCIR_API = Object.freeze({
  contract:ATCIR_CONTRACT,
  version:ATCIR_VERSION,
  readOnly:true,
  writesPerformed:false,
  identityFor:(ref) => atCirClone(atCirIdentityFor(ref)),
  reconcile:(rows, options = {}) => atCirClone(atCirReconcile(rows, options)),
  audit:atCirAudit
});

function atCirAttach() {
  const module = game.modules.get(ATCIR_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignIdentityReconciliation = ATCIR_API;
  return true;
}

Hooks.once("ready", () => {
  atCirAttach();
  console.info("Adventurer's Tome | Campaign Identity Reconciliation v1 ready (read-only).");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATCIR_ID)?.api?.campaignIdentityReconciliation !== ATCIR_API) atCirAttach();
});
