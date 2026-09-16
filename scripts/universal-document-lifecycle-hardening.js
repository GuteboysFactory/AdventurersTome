const ATLH_ID = "adventurers-tome";

const ATLH_TYPES = Object.freeze([
  "Actor",
  "Item",
  "JournalEntry",
  "JournalEntryPage",
  "Scene",
  "Folder"
]);

const ATLH_HOOKS = Object.freeze([
  ["createActor", "create"], ["updateActor", "update"], ["deleteActor", "delete"],
  ["createItem", "create"], ["updateItem", "update"], ["deleteItem", "delete"],
  ["createJournalEntry", "create"], ["updateJournalEntry", "update"], ["deleteJournalEntry", "delete"],
  ["createJournalEntryPage", "create"], ["updateJournalEntryPage", "update"], ["deleteJournalEntryPage", "delete"],
  ["createScene", "create"], ["updateScene", "update"], ["deleteScene", "delete"],
  ["createFolder", "create"], ["updateFolder", "update"], ["deleteFolder", "delete"]
]);

let atlhAttached = false;
let atlhTimer = null;
let atlhSequence = 0;
let atlhBootAudit = null;
const atlhPending = new Map();
const atlhFailures = [];
const atlhRecent = [];
const atlhCounts = { create: 0, update: 0, rename: 0, move: 0, delete: 0, verified: 0, failed: 0 };
const atlhCoverage = Object.fromEntries(ATLH_TYPES.map((type) => [type, {
  create: 0,
  update: 0,
  rename: 0,
  move: 0,
  delete: 0,
  verified: 0,
  failed: 0
}]));

function atlhModule() {
  return game.modules.get(ATLH_ID);
}

function atlhRegistry() {
  return atlhModule()?.api?.universalDocuments || null;
}

function atlhFolderUuid(document) {
  const folder = document?.folder || null;
  if (!folder) return "";
  return String(folder.uuid || (folder.id ? `Folder.${folder.id}` : ""));
}

function atlhParentUuid(document) {
  const parent = document?.parent || null;
  return String(parent?.uuid || "");
}

function atlhAction(kind, changes = {}) {
  if (kind !== "update") return kind;
  if (Object.prototype.hasOwnProperty.call(changes || {}, "name")) return "rename";
  if (Object.prototype.hasOwnProperty.call(changes || {}, "folder")) return "move";
  return "update";
}

function atlhExpected(document, hook, kind, changes = {}) {
  const action = atlhAction(kind, changes);
  return {
    id: ++atlhSequence,
    hook,
    action,
    uuid: String(document?.uuid || ""),
    documentName: String(document?.documentName || ""),
    name: String(document?.name || ""),
    folderUuid: atlhFolderUuid(document),
    parentUuid: atlhParentUuid(document),
    changes: Object.keys(changes || {}),
    startedAt: Date.now(),
    attempts: 0
  };
}

function atlhPublicEvent(event) {
  if (game.user?.isGM) return { ...event };
  return {
    hook: event.hook,
    action: event.action,
    documentName: event.documentName,
    ok: event.ok,
    reason: event.reason || "",
    attempts: event.attempts,
    elapsedMs: event.elapsedMs
  };
}

function atlhPushRecent(event) {
  atlhRecent.unshift(event);
  if (atlhRecent.length > 40) atlhRecent.length = 40;
}

function atlhFail(expected, reason, details = {}) {
  atlhPending.delete(expected.id);
  const failure = {
    ...expected,
    ok: false,
    reason,
    details,
    elapsedMs: Date.now() - expected.startedAt
  };
  atlhFailures.unshift(failure);
  if (atlhFailures.length > 30) atlhFailures.length = 30;
  atlhCounts.failed += 1;
  if (atlhCoverage[expected.documentName]) atlhCoverage[expected.documentName].failed += 1;
  atlhPushRecent(failure);
}

function atlhPass(expected) {
  atlhPending.delete(expected.id);
  const result = {
    ...expected,
    ok: true,
    elapsedMs: Date.now() - expected.startedAt
  };
  atlhCounts.verified += 1;
  if (atlhCoverage[expected.documentName]) atlhCoverage[expected.documentName].verified += 1;
  atlhPushRecent(result);
}

function atlhVerify(expected) {
  const registry = atlhRegistry();
  if (!registry) return false;
  expected.attempts += 1;

  const resolved = registry.resolve(expected.uuid);
  const row = registry.get(expected.uuid);

  if (expected.action === "delete") {
    if (!resolved && !row && !registry.has(expected.uuid)) {
      atlhPass(expected);
      return true;
    }
    return false;
  }

  if (!resolved || !row || !registry.has(expected.uuid)) return false;
  if (resolved !== null && String(resolved.uuid || "") !== expected.uuid) return false;
  if (String(row.uuid || "") !== expected.uuid) return false;
  if (String(row.documentName || resolved.documentName || "") !== expected.documentName) return false;
  if (String(row.name ?? resolved.name ?? "") !== String(resolved.name || "")) return false;

  if (expected.documentName === "Item" && expected.parentUuid) {
    if (String(row.parentUuid || "") !== String(resolved.parent?.uuid || expected.parentUuid)) return false;
  }

  if (expected.action === "move" || expected.documentName === "Folder") {
    const liveFolderUuid = atlhFolderUuid(resolved);
    if (Object.prototype.hasOwnProperty.call(row, "folderUuid") && String(row.folderUuid || "") !== liveFolderUuid) return false;
  }

  atlhPass(expected);
  return true;
}

function atlhScheduleVerify(expected) {
  atlhPending.set(expected.id, expected);
  const delays = [120, 260, 520, 900];
  for (const delay of delays) {
    window.setTimeout(() => {
      if (!atlhPending.has(expected.id)) return;
      if (atlhVerify(expected)) return;
      if (delay === delays[delays.length - 1]) {
        const registry = atlhRegistry();
        atlhFail(expected, "registry-did-not-converge", {
          has: Boolean(registry?.has?.(expected.uuid)),
          resolved: Boolean(registry?.resolve?.(expected.uuid)),
          row: Boolean(registry?.get?.(expected.uuid))
        });
      }
    }, delay);
  }
}

function atlhRecord(hook, kind, document, changes = {}) {
  if (!game.user?.isGM) return;
  const type = String(document?.documentName || "");
  if (!ATLH_TYPES.includes(type)) return;
  const expected = atlhExpected(document, hook, kind, changes);
  atlhCounts[expected.action] = Number(atlhCounts[expected.action] || 0) + 1;
  atlhCoverage[type][expected.action] = Number(atlhCoverage[type][expected.action] || 0) + 1;
  atlhScheduleVerify(expected);
}

function atlhCoverageSnapshot() {
  return Object.fromEntries(Object.entries(atlhCoverage).map(([type, values]) => [type, { ...values }]));
}

function atlhAudit() {
  const registry = atlhRegistry();
  const registryAudit = registry?.audit?.() || null;
  const pending = [...atlhPending.values()].map((event) => atlhPublicEvent({
    ...event,
    ok: null,
    elapsedMs: Date.now() - event.startedAt
  }));
  const failures = atlhFailures.map(atlhPublicEvent);
  const recent = atlhRecent.map(atlhPublicEvent);
  const registryHealthy = Boolean(registryAudit?.healthy);

  return {
    mode: registry?.mode || "permission-aware-read",
    phase: "universal-lifecycle-hardening",
    attached: atlhAttached,
    userRole: game.user?.isGM ? "gm" : "player",
    supportedDocumentTypes: [...ATLH_TYPES],
    boot: atlhBootAudit ? { ...atlhBootAudit } : null,
    counts: { ...atlhCounts },
    coverage: atlhCoverageSnapshot(),
    pending,
    failures,
    recent,
    registryHealthy,
    healthy: registryHealthy && pending.length === 0 && failures.length === 0
  };
}

function atlhAttach() {
  if (atlhAttached) return true;
  const module = atlhModule();
  const registry = module?.api?.universalDocuments;
  if (!registry?.permissionAwareRead || typeof registry.explorerCatalogAudit !== "function") return false;

  const initial = registry.audit?.() || null;
  atlhBootAudit = {
    at: Date.now(),
    healthy: Boolean(initial?.healthy),
    total: Number(initial?.total ?? initial?.activeVisibleTotal ?? 0),
    mode: String(registry.mode || "")
  };

  module.api.universalDocuments = Object.freeze({
    ...registry,
    lifecycleHardening: true,
    lifecycleAudit: () => atlhAudit()
  });

  atlhAttached = true;
  if (atlhTimer) {
    window.clearInterval(atlhTimer);
    atlhTimer = null;
  }
  console.info("Adventurer's Tome | Universal Document lifecycle hardening audit attached.");
  return true;
}

function atlhWatch() {
  if (atlhAttach() || atlhTimer) return;
  atlhTimer = window.setInterval(atlhAttach, 100);
}

Hooks.once("ready", atlhWatch);

for (const [hook, kind] of ATLH_HOOKS) {
  Hooks.on(hook, (document, changes = {}) => atlhRecord(hook, kind, document, changes));
}
