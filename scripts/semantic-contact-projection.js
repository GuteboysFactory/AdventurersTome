const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-semantic-contact-projection";
const VERSION = 1;
const PROJECTION_FLAG = "semanticProjection";
const WORLD_PROFILE_FLAG = "worldProfile";
const CONTACT_FOLDER = "Contacts";
const GENERATED_FACT_SOURCE = "semantic-contact-projection";

let syncTimer = null;
let syncing = false;
let lastSnapshot = null;

const stats = {
  syncs:0,
  contactsSeen:0,
  created:0,
  updated:0,
  unchanged:0,
  markedInactive:0,
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

function titleCase(value) {
  return clean(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parentId(folder) {
  return clean(folder?.folder?.id ?? folder?.folder);
}

function findFolder(name, parent = null) {
  const parentKey = clean(parent?.id ?? parent);
  return [...(game.folders?.contents ?? [])].find((folder) =>
    folder.type === "JournalEntry"
    && folder.name === name
    && parentId(folder) === parentKey
  ) || null;
}

async function ensureFolder(name, parent = null, flags = null) {
  const existing = findFolder(name, parent);
  if (existing) return existing;
  const data = {
    name,
    type:"JournalEntry",
    folder:clean(parent?.id ?? parent) || null
  };
  if (flags) data.flags = { [MODULE_ID]:flags };
  return Folder.create(data);
}

async function ensureContactFolder() {
  let root = [...(game.folders?.contents ?? [])].find((folder) =>
    folder.type === "JournalEntry"
    && folder.name === "Adventurer's Tome"
    && !parentId(folder)
  ) || [...(game.folders?.contents ?? [])].find((folder) =>
    folder.type === "JournalEntry" && folder.name === "Adventurer's Tome"
  ) || null;

  if (!root) root = await ensureFolder("Adventurer's Tome");

  let world = findFolder("World", root);
  if (!world) world = await ensureFolder("World", root, { section:"world" });

  let contacts = findFolder(CONTACT_FOLDER, world);
  if (!contacts) contacts = await ensureFolder(CONTACT_FOLDER, world, { worldCategory:"contact" });

  return { root, world, contacts };
}

function discoveryApi() {
  return game.modules.get(MODULE_ID)?.api?.discovery || null;
}

function projectionOf(journal) {
  const raw = journal?.getFlag?.(MODULE_ID, PROJECTION_FLAG);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

function existingProjectionMap() {
  const map = new Map();
  for (const journal of game.journal?.contents ?? []) {
    const projection = projectionOf(journal);
    const key = clean(projection?.key);
    if (!key || projection?.kind !== "contact") continue;
    if (!map.has(key)) map.set(key, journal);
  }
  return map;
}

function canObserve(document, user = game.user) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  try {
    if (typeof document.testUserPermission === "function") {
      return document.testUserPermission(user, "OBSERVER") === true;
    }
  } catch (_error) {}
  return Boolean(document.visible);
}

function actorFromUuidSync(uuid) {
  const value = clean(uuid);
  if (!value.startsWith("Actor.")) return null;
  return game.actors?.get(value.slice(6)) || null;
}

function projectionEvidenceVisible(journal, projection, user = game.user) {
  if (!projection || projection.kind !== "contact") return true;
  if (!user || user.isGM) return true;

  // ownershipManaged controls only whether the projection synchronizer may
  // rewrite Journal ownership. It is never a visibility bypass. Derived data
  // must remain bounded by the live evidence that supports it.
  const evidenceUuids = Array.from(new Set([
    clean(projection.sourceUuid),
    clean(projection.linkedUuid),
    ...(Array.isArray(projection.permissionSourceUuids) ? projection.permissionSourceUuids.map(clean) : [])
  ].filter(Boolean)));

  if (!evidenceUuids.length) return false;

  for (const uuid of evidenceUuids) {
    if (!uuid.startsWith("Actor.")) continue;
    const actor = actorFromUuidSync(uuid);
    if (!actor || !canObserve(actor, user)) return false;
  }

  return true;
}

function ownershipDefault(ownership) {
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
  const value = Number(ownership?.default ?? none);
  return Number.isFinite(value) && value >= none ? value : none;
}

function ownershipLevel(ownership, userId) {
  const fallback = ownershipDefault(ownership);
  const key = String(userId || "");
  if (!key || !Object.hasOwn(ownership || {}, key)) return fallback;

  const value = Number(ownership[key]);
  // Foundry may represent inheritance with a negative level. Resolve that to
  // the document default before computing a conservative intersection.
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function intersectOwnership(documents = []) {
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
  const sources = documents.filter(Boolean);
  if (!sources.length) return { default:none };

  const ownershipSets = sources.map((document) => clone(document.ownership || { default:none }));
  const defaultLevel = Math.min(...ownershipSets.map(ownershipDefault));
  const ownership = { default:defaultLevel };

  for (const user of game.users?.contents ?? []) {
    if (!user?.id || user.isGM) continue;
    const level = Math.min(...ownershipSets.map((entry) => ownershipLevel(entry, user.id)));
    if (level !== defaultLevel) ownership[user.id] = level;
  }

  return ownership;
}

async function actorFromUuid(uuid) {
  const value = clean(uuid);
  if (!value) return null;

  if (value.startsWith("Actor.")) {
    const local = game.actors?.get(value.slice(6)) || null;
    if (local) return local;
  }

  const document = await fromUuid(value).catch(() => null);
  return document?.documentName === "Actor" ? document : null;
}

async function managedProjectionOwnership(group) {
  const sourceActor = await actorFromUuid(group?.sourceUuid);
  const targetActor = await actorFromUuid(group?.linkedUuid);
  const documents = [];

  if (sourceActor) documents.push(sourceActor);
  if (targetActor && targetActor.uuid !== sourceActor?.uuid) documents.push(targetActor);

  return {
    ownership:intersectOwnership(documents),
    sourceUuids:documents.map((document) => clean(document.uuid)).filter(Boolean),
    policy:targetActor ? "source-and-target-intersection" : "semantic-source"
  };
}

function ownershipSignature(ownership) {
  const entries = Object.entries(ownership || {})
    .map(([key, value]) => [String(key), Number(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function applyExactOwnershipUpdate(update, currentOwnership = {}, desiredOwnership = {}) {
  const desired = desiredOwnership && typeof desiredOwnership === "object"
    ? desiredOwnership
    : {};
  const current = currentOwnership && typeof currentOwnership === "object"
    ? currentOwnership
    : {};

  const desiredKeys = new Set(Object.keys(desired));

  // Foundry document updates merge nested ownership objects. Writing only the
  // desired object therefore leaves stale per-user keys behind. Use flattened
  // ownership paths plus Foundry's -= deletion syntax so the stored ownership
  // converges exactly to the desired state.
  for (const [key, value] of Object.entries(desired)) {
    update[`ownership.${key}`] = Number(value);
  }

  for (const key of Object.keys(current)) {
    if (desiredKeys.has(key)) continue;
    update[`ownership.-=${key}`] = null;
  }

  return update;
}

function relationLabel(edge, sourceEntity) {
  const role = titleCase(edge?.role || "Contact");
  const sourceName = clean(sourceEntity?.name);
  return sourceName ? `${role} of ${sourceName}` : role;
}

function buildProjectionGroups(snapshot) {
  const entities = new Map((snapshot?.entities || []).map((entity) => [clean(entity?.key), entity]));
  const groups = new Map();

  for (const edge of snapshot?.relationships || []) {
    if (edge?.kind !== "relationship" || edge?.origin === "foundry-structure") continue;

    const semanticKey = clean(edge?.to?.semanticKey);
    if (!semanticKey) continue;

    const target = entities.get(clean(edge?.to?.key)) || null;
    if (!target || clean(target.kind) !== "person") continue;

    const source = entities.get(clean(edge?.from?.key)) || null;
    const provider = clean(edge?.provenance?.[0]?.provider || target?.provenance?.[0]?.provider);
    const sourceUuid = clean(edge?.provenance?.[0]?.sourceUuid || target?.system?.sourceActorUuid || edge?.from?.canonicalUuid);
    const linkedUuid = clean(target?.canonicalUuid || edge?.to?.canonicalUuid);

    const current = groups.get(semanticKey) || {
      key:semanticKey,
      name:clean(target.name),
      target,
      provider,
      sourceUuid,
      linkedUuid,
      relationships:[]
    };

    current.relationships.push({
      key:clean(edge.key),
      role:clean(edge.role),
      status:clean(edge.status),
      origin:clean(edge.origin),
      label:relationLabel(edge, source),
      sourceName:clean(source?.name),
      sourceUuid:clean(edge?.from?.canonicalUuid || source?.canonicalUuid),
      history:clone(edge?.attributes?.history || [])
    });

    if (!current.linkedUuid && linkedUuid) current.linkedUuid = linkedUuid;
    groups.set(semanticKey, current);
  }

  return [...groups.values()];
}

function generatedFacts(group) {
  const facts = [];
  const add = (label, value, visibility = "shared") => {
    const text = clean(value);
    if (!text) return;
    facts.push({ label, value:text, visibility, source:GENERATED_FACT_SOURCE });
  };

  const attrs = group?.target?.attributes || {};
  add("Profession", attrs.profession);
  add("Culture", attrs.culture);
  add("Location", attrs.location);

  for (const relation of group.relationships || []) {
    add("Relationship", relation.label);
    add("Status", relation.status ? titleCase(relation.status) : "");
    add("Origin", relation.origin ? titleCase(relation.origin) : "");
  }

  // Canonical UUIDs are implementation metadata, not player-facing campaign
  // knowledge. Keep them GM-only even when the Contact itself is visible.
  if (group.linkedUuid) add("Foundry Link", group.linkedUuid, "gm");
  return facts;
}

function generatedSummary(group) {
  const relation = group.relationships?.[0] || null;
  const parts = [];
  if (relation?.label) parts.push(relation.label);
  if (relation?.status) parts.push(titleCase(relation.status));
  const location = clean(group?.target?.attributes?.location);
  if (location) parts.push(location);
  return parts.join(" · ");
}

function mergeFacts(current = [], generated = []) {
  const preserved = (Array.isArray(current) ? current : []).filter((fact) => fact?.source !== GENERATED_FACT_SOURCE);
  return [...preserved, ...generated];
}

function actorIdFromUuid(uuid) {
  const value = clean(uuid);
  return value.startsWith("Actor.") ? value.slice(6) : "";
}

function projectionProfile(group, current = {}, previousProjection = {}) {
  const profile = current && typeof current === "object" && !Array.isArray(current) ? clone(current) : {};
  const nextSummary = generatedSummary(group);
  const previousGeneratedSummary = clean(previousProjection.generatedSummary);
  const currentSummary = clean(profile.summary);

  profile.category = "contact";
  profile.subtitle = clean(profile.subtitle) || "Contact";
  if (!currentSummary || currentSummary === previousGeneratedSummary) profile.summary = nextSummary;
  else profile.summary = currentSummary;
  profile.body = clean(profile.body);
  profile.heroImage = clean(profile.heroImage);
  profile.facts = mergeFacts(profile.facts, generatedFacts(group));
  profile.summaryJournalBacked = true;

  if (group.linkedUuid) {
    profile.sourceUuid = group.linkedUuid;
    profile.sourceDocumentType = "Actor";
    profile.actorId = actorIdFromUuid(group.linkedUuid);
  } else {
    profile.sourceUuid = "";
    profile.sourceDocumentType = "";
    profile.actorId = "";
  }

  return { profile, generatedSummary:nextSummary };
}

async function ensureOverview(journal, summary) {
  if (!journal || (journal.pages?.size ?? 0) > 0) return;
  const esc = foundry.utils.escapeHTML;
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name:"Overview",
    type:"text",
    text:{
      content:`<p data-at-tome-summary="true">${esc(summary || "")}</p><p></p>`,
      format:CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    },
    sort:100000
  }]);
  if (created?.[0]) await journal.setFlag(MODULE_ID, "worldSyncPage", created[0].id);
}

async function createProjection(group, folder) {
  const permissions = await managedProjectionOwnership(group);
  const ownership = permissions.ownership;
  const profileData = projectionProfile(group, {}, {});
  const projection = {
    key:group.key,
    kind:"contact",
    active:true,
    provider:group.provider,
    semanticKey:group.key,
    sourceUuid:group.sourceUuid,
    linkedUuid:group.linkedUuid,
    relationshipKeys:group.relationships.map((row) => row.key),
    generatedSummary:profileData.generatedSummary,
    ownershipManaged:true,
    lastManagedOwnership:ownershipSignature(ownership),
    permissionSourceUuids:permissions.sourceUuids,
    permissionPolicy:permissions.policy,
    lastSeenAt:Date.now()
  };

  const journal = await JournalEntry.create({
    name:group.name || "Unnamed Contact",
    folder:folder.id,
    ownership,
    flags:{
      [MODULE_ID]:{
        type:"world",
        [WORLD_PROFILE_FLAG]:profileData.profile,
        [PROJECTION_FLAG]:projection
      }
    }
  });

  await ensureOverview(journal, profileData.generatedSummary);
  return journal;
}

async function updateProjection(journal, group, folder) {
  const previousProjection = projectionOf(journal) || {};
  const currentProfile = journal.getFlag?.(MODULE_ID, WORLD_PROFILE_FLAG) || {};
  const profileData = projectionProfile(group, currentProfile, previousProjection);
  const permissions = await managedProjectionOwnership(group);
  const desiredOwnership = permissions.ownership;

  const update = {
    name:group.name || journal.name,
    folder:folder.id,
    [`flags.${MODULE_ID}.${WORLD_PROFILE_FLAG}`]:profileData.profile,
    [`flags.${MODULE_ID}.${PROJECTION_FLAG}`]:{
      ...clone(previousProjection),
      key:group.key,
      kind:"contact",
      active:true,
      provider:group.provider,
      semanticKey:group.key,
      sourceUuid:group.sourceUuid,
      linkedUuid:group.linkedUuid,
      relationshipKeys:group.relationships.map((row) => row.key),
      generatedSummary:profileData.generatedSummary,
      permissionSourceUuids:permissions.sourceUuids,
      permissionPolicy:permissions.policy
    }
  };

  // Generated Contact permissions are evidence-managed. Older builds inferred
  // a "manual override" from any ownership signature mismatch, which could
  // permanently freeze stale broad permissions after ordinary Foundry changes.
  // qa.15 removes that heuristic. Only an explicit permissionOverride flag may
  // stop ownership synchronization.
  const explicitPermissionOverride = previousProjection.permissionOverride === true;
  if (!explicitPermissionOverride) {
    applyExactOwnershipUpdate(update, journal.ownership, desiredOwnership);
    update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`].ownershipManaged = true;
    update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`].lastManagedOwnership = ownershipSignature(desiredOwnership);
  } else {
    update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`].ownershipManaged = false;
    update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`].lastManagedOwnership = clean(previousProjection.lastManagedOwnership);
  }

  const before = JSON.stringify({
    name:journal.name,
    folder:clean(journal.folder?.id ?? journal.folder),
    ownership:ownershipSignature(journal.ownership),
    profile:currentProfile,
    projection:previousProjection
  });
  const after = JSON.stringify({
    name:update.name,
    folder:update.folder,
    ownership:ownershipSignature(explicitPermissionOverride ? journal.ownership : desiredOwnership),
    profile:profileData.profile,
    projection:update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`]
  });

  if (before === after) return false;
  update[`flags.${MODULE_ID}.${PROJECTION_FLAG}`].lastSeenAt = Date.now();
  await journal.update(update, { adventurersTomeSemanticProjection:true });
  await ensureOverview(journal, profileData.generatedSummary);
  return true;
}

async function markInactive(journal) {
  const projection = projectionOf(journal);
  if (!projection?.active) return false;
  await journal.update({
    [`flags.${MODULE_ID}.${PROJECTION_FLAG}.active`]:false,
    [`flags.${MODULE_ID}.${PROJECTION_FLAG}.lastMissingAt`]:Date.now()
  }, { adventurersTomeSemanticProjection:true });
  return true;
}

async function sync(options = {}) {
  if (!game.user?.isGM) return {
    contract:CONTRACT,
    version:VERSION,
    skipped:true,
    reason:"gm-only"
  };
  if (syncing) return {
    contract:CONTRACT,
    version:VERSION,
    skipped:true,
    reason:"already-syncing"
  };

  syncing = true;
  stats.syncs += 1;
  stats.contactsSeen = 0;
  stats.created = 0;
  stats.updated = 0;
  stats.unchanged = 0;
  stats.markedInactive = 0;

  try {
    const discovery = discoveryApi();
    if (!discovery) throw new Error("Universal Campaign Discovery API is unavailable.");

    let snapshot = discovery.snapshot();
    if (!snapshot || options.rescan === true) snapshot = await discovery.scan();
    if (!snapshot) throw new Error("Campaign Discovery has no snapshot.");

    const groups = buildProjectionGroups(snapshot);
    stats.contactsSeen = groups.length;

    const { contacts } = await ensureContactFolder();
    const existing = existingProjectionMap();
    const seen = new Set();

    for (const group of groups) {
      seen.add(group.key);
      const journal = existing.get(group.key);
      if (!journal) {
        await createProjection(group, contacts);
        stats.created += 1;
      } else if (await updateProjection(journal, group, contacts)) {
        stats.updated += 1;
      } else {
        stats.unchanged += 1;
      }
    }

    for (const [key, journal] of existing.entries()) {
      if (seen.has(key)) continue;
      if (await markInactive(journal)) stats.markedInactive += 1;
    }

    lastSnapshot = Object.freeze({
      contract:CONTRACT,
      version:VERSION,
      generatedAt:Date.now(),
      contactsSeen:stats.contactsSeen,
      created:stats.created,
      updated:stats.updated,
      unchanged:stats.unchanged,
      markedInactive:stats.markedInactive,
      folderUuid:String(contacts.uuid || ""),
      projectionKeys:[...seen]
    });

    Hooks.callAll("adventurersTomeContactProjectionUpdated", clone(lastSnapshot));
    return clone(lastSnapshot);
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Semantic Contact projection failed safely", error);
    throw error;
  } finally {
    syncing = false;
  }
}

function snapshot() {
  return clone(lastSnapshot);
}

function list() {
  return [...(game.journal?.contents ?? [])]
    .map((journal) => ({ journal, projection:projectionOf(journal) }))
    .filter((row) => row.projection?.kind === "contact")
    .filter((row) => canObserve(row.journal, game.user))
    .filter((row) => projectionEvidenceVisible(row.journal, row.projection, game.user))
    .map((row) => ({
      journalId:String(row.journal.id || ""),
      journalUuid:String(row.journal.uuid || ""),
      name:String(row.journal.name || ""),
      folderUuid:String(row.journal.folder?.uuid || ""),
      ...clone(row.projection)
    }));
}

function permissionAudit() {
  if (!game.user?.isGM) {
    return {
      contract:CONTRACT,
      version:VERSION,
      skipped:true,
      reason:"gm-only"
    };
  }

  const violations = [];
  const users = (game.users?.contents || []).filter((user) => !user?.isGM);

  for (const journal of game.journal?.contents ?? []) {
    const projection = projectionOf(journal);
    if (projection?.kind !== "contact" || projection.active === false) continue;

    for (const user of users) {
      const journalVisible = canObserve(journal, user);
      const evidenceVisible = projectionEvidenceVisible(journal, projection, user);
      if (!journalVisible || evidenceVisible) continue;

      violations.push({
        journalId:String(journal.id || ""),
        name:String(journal.name || ""),
        userId:String(user.id || ""),
        userName:String(user.name || ""),
        sourceUuid:clean(projection.sourceUuid),
        linkedUuid:clean(projection.linkedUuid),
        permissionPolicy:clean(projection.permissionPolicy)
      });
    }
  }

  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:violations.length === 0,
    violations
  };
}

function audit() {
  const contacts = list();
  const duplicateKeys = [];
  const seen = new Set();
  for (const contact of contacts) {
    if (seen.has(contact.key)) duplicateKeys.push(contact.key);
    seen.add(contact.key);
  }
  const permissions = permissionAudit();
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0
      && duplicateKeys.length === 0
      && (permissions.skipped === true || permissions.healthy === true),
    gm: Boolean(game.user?.isGM),
    contacts:contacts.length,
    active:contacts.filter((row) => row.active !== false).length,
    inactive:contacts.filter((row) => row.active === false).length,
    duplicateKeys,
    permissions,
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  category:"contact",
  folder:CONTACT_FOLDER,
  sync,
  snapshot,
  list,
  audit,
  permissionAudit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.contactProjections = publicApi;
  return true;
}

function scheduleSync(reason = "discovery-updated", delay = 180, { rescan = false } = {}) {
  if (!game.user?.isGM) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void sync({ reason, rescan }).catch(() => {});
  }, delay);
}

Hooks.once("ready", () => {
  attach();
  scheduleSync("ready", 450);
  console.info("Adventurer's Tome | Semantic Contact projection v1 ready.");
});

Hooks.on("adventurersTomeCampaignDiscoveryUpdated", () => scheduleSync("discovery-updated", 220));

// Ownership changes on either the relationship source Actor or a linked target
// Actor must tighten managed Contact Journal ownership without waiting for a
// later campaign-content edit. The runtime viewer gate above still protects
// players while this asynchronous persistence refresh completes.
Hooks.on("updateActor", () => scheduleSync("actor-updated", 160));

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.contactProjections !== publicApi) attach();
});
