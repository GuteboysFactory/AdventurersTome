const ATII_ID = "adventurers-tome";
const ATII_ROOT = "#adventurers-tome-app";
const ATII_SOURCE_UUID = "quickImportSourceUuid";
const ATII_SOURCE_TYPE = "quickImportSourceType";
const ATII_SOURCE_FOLDER_UUID = "quickImportSourceFolderUuid";
const ATII_PROFILE = "worldProfile";
const ATII_INTERNAL_MIMES = new Set([
  "text/x-adventurers-tome-campaign-journal",
  "text/x-adventurers-tome-campaign-folder",
  "text/x-adventurers-tome-editor-folder"
]);

let atiiAttached = false;
let atiiTimer = null;
let atiiSequence = 0;
let atiiFolderLocks = 0;
const atiiRecent = [];

function atiiModule() {
  return game.modules.get(ATII_ID);
}

function atiiParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atiiAncestors(folder) {
  const result = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = game.folders?.get(atiiParentId(current)) || null;
  }
  return result;
}

function atiiIsWorldRoot(folder) {
  if (!folder || folder.type !== "JournalEntry" || folder.name !== "World") return false;
  if (String(folder.getFlag?.(ATII_ID, "section") || "") === "world") return true;
  return atiiAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
}

function atiiWorldRoots() {
  return [...(game.folders?.contents ?? [])].filter(atiiIsWorldRoot);
}

function atiiDescendantIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(String(root.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(String(folder.id))) continue;
      if (ids.has(atiiParentId(folder))) {
        ids.add(String(folder.id));
        changed = true;
      }
    }
  }
  return ids;
}

function atiiWorldRootFor(folder) {
  if (!folder) return null;
  const id = String(folder.id || "");
  return atiiWorldRoots().find((root) => atiiDescendantIds(root).has(id)) || null;
}

function atiiIsWorldJournal(journal) {
  if (journal?.documentName !== "JournalEntry") return false;
  const folder = journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? ""));
  return Boolean(folder && atiiWorldRootFor(folder));
}

function atiiProfile(journal) {
  const raw = journal?.getFlag?.(ATII_ID, ATII_PROFILE);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function atiiResolve(uuid) {
  const key = String(uuid || "").trim();
  if (!key) return null;
  const registry = atiiModule()?.api?.universalDocuments;
  return registry?.resolve?.(key) || null;
}

function atiiPushRecent(event) {
  atiiRecent.unshift({ id: ++atiiSequence, at: Date.now(), ...event });
  if (atiiRecent.length > 30) atiiRecent.length = 30;
}

function atiiDocumentRows() {
  const rows = [];
  for (const journal of game.journal?.contents ?? []) {
    if (!atiiIsWorldJournal(journal)) continue;
    const profile = atiiProfile(journal);
    const flagUuid = String(journal.getFlag?.(ATII_ID, ATII_SOURCE_UUID) || "").trim();
    const profileUuid = String(profile.sourceUuid || "").trim();
    const flagType = String(journal.getFlag?.(ATII_ID, ATII_SOURCE_TYPE) || "").trim();
    const profileType = String(profile.sourceDocumentType || "").trim();
    const sourceUuid = flagUuid || profileUuid;
    const sourceType = flagType || profileType;
    if (!sourceUuid && !sourceType) continue;
    const source = atiiResolve(sourceUuid);
    rows.push({
      journalUuid: String(journal.uuid || ""),
      journalName: String(journal.name || ""),
      sourceUuid,
      sourceType,
      sourceExists: Boolean(source),
      resolvedType: String(source?.documentName || ""),
      flagProfileUuidMatch: !flagUuid || !profileUuid || flagUuid === profileUuid,
      flagProfileTypeMatch: !flagType || !profileType || flagType === profileType,
      resolvedTypeMatch: !source || !sourceType || String(source.documentName || "") === sourceType,
      identityMode: "uuid-only"
    });
  }
  return rows;
}

function atiiFolderRows() {
  const rows = [];
  for (const folder of game.folders?.contents ?? []) {
    if (folder.type !== "JournalEntry" || !atiiWorldRootFor(folder)) continue;
    const sourceUuid = String(folder.getFlag?.(ATII_ID, ATII_SOURCE_FOLDER_UUID) || "").trim();
    if (!sourceUuid) continue;
    rows.push({
      folderUuid: String(folder.uuid || `Folder.${folder.id}`),
      folderName: String(folder.name || ""),
      sourceFolderUuid: sourceUuid,
      sourceExists: Boolean(atiiResolve(sourceUuid)),
      identityMode: "uuid-only"
    });
  }
  return rows;
}

function atiiDuplicateSourceUuids(rows) {
  const counts = new Map();
  for (const row of rows) {
    const uuid = String(row.sourceUuid || "");
    if (!uuid) continue;
    counts.set(uuid, Number(counts.get(uuid) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([uuid, count]) => ({ uuid, count }));
}

function atiiAudit() {
  const documents = atiiDocumentRows();
  const folders = atiiFolderRows();
  const uuidMismatches = documents.filter((row) => !row.flagProfileUuidMatch);
  const typeMismatches = documents.filter((row) => !row.flagProfileTypeMatch || !row.resolvedTypeMatch);
  const duplicateSourceUuids = atiiDuplicateSourceUuids(documents);
  const missingDocuments = documents.filter((row) => !row.sourceExists);
  const missingFolders = folders.filter((row) => !row.sourceExists);
  const healthy = uuidMismatches.length === 0 && typeMismatches.length === 0 && duplicateSourceUuids.length === 0;

  const summary = {
    mode: "canonical-uuid",
    phase: "imported-source-identity-hardening",
    attached: atiiAttached,
    userRole: game.user?.isGM ? "gm" : "player",
    identityPolicy: "uuid-only-after-link",
    documents: {
      total: documents.length,
      linked: documents.length - missingDocuments.length,
      missing: missingDocuments.length,
      byType: documents.reduce((acc, row) => {
        const key = row.sourceType || "Unknown";
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      }, {})
    },
    folders: {
      total: folders.length,
      linked: folders.length - missingFolders.length,
      missing: missingFolders.length,
      nameAdoptionsLocked: atiiFolderLocks
    },
    uuidMismatches: uuidMismatches.length,
    typeMismatches: typeMismatches.length,
    duplicateSourceUuids: duplicateSourceUuids.length,
    missingSources: missingDocuments.length + missingFolders.length,
    healthy,
    recent: atiiRecent.map((entry) => ({ ...entry }))
  };

  if (game.user?.isGM) {
    summary.details = {
      documents,
      folders,
      uuidMismatches,
      typeMismatches,
      duplicateSourceUuids,
      missingDocuments,
      missingFolders
    };
  }
  return summary;
}

function atiiFolderDragData(event) {
  const types = [...(event.dataTransfer?.types || [])];
  if (types.some((type) => ATII_INTERNAL_MIMES.has(type))) return null;

  let data = null;
  try {
    if (typeof TextEditor?.getDragEventData === "function") data = TextEditor.getDragEventData(event);
  } catch (_err) {}

  if (!data) {
    const raw = String(event.dataTransfer?.getData?.("text/plain") || "").trim();
    if (!raw) return null;
    try { data = JSON.parse(raw); } catch (_err) { return null; }
  }

  if (String(data?.type || data?.documentName || "").toLowerCase() !== "folder") return null;
  const id = String(data?.id || data?._id || "").trim();
  let uuid = String(data?.uuid || data?.documentUuid || "").trim();
  if (!uuid && id) uuid = `Folder.${id}`;
  return uuid ? { uuid, id } : null;
}

function atiiSourceChildren(sourceFolder) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => String(folder.type || "") === String(sourceFolder.type || "") && atiiParentId(folder) === String(sourceFolder.id || ""));
}

async function atiiResolveSourceFolder(uuid, id = "") {
  const canonicalUuid = String(uuid || "").trim() || (id ? `Folder.${String(id)}` : "");
  if (!canonicalUuid) return null;

  const resolver = atiiModule()?.api?.universalDocuments?.resolveCanonical;
  let source = null;
  if (typeof resolver === "function") {
    source = await resolver(canonicalUuid, { consumer: "import-identity-hardening" });
  } else {
    source = atiiResolve(canonicalUuid);
  }

  return source?.documentName === "Folder" ? source : null;
}

async function atiiLockMirrorTree(sourceFolder, targetParent) {
  if (!sourceFolder || !targetParent) return;
  const sourceUuid = String(sourceFolder.uuid || `Folder.${sourceFolder.id}`);
  const direct = [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === "JournalEntry" && atiiParentId(folder) === String(targetParent.id));

  let mirror = direct.find((folder) => String(folder.getFlag?.(ATII_ID, ATII_SOURCE_FOLDER_UUID) || "") === sourceUuid) || null;
  if (!mirror) {
    mirror = direct.find((folder) => String(folder.name || "") === String(sourceFolder.name || "")) || null;
    if (mirror && game.user?.isGM) {
      await mirror.setFlag(ATII_ID, ATII_SOURCE_FOLDER_UUID, sourceUuid);
      atiiFolderLocks += 1;
      atiiPushRecent({ action: "lock-folder-name-fallback", sourceUuid, mirrorUuid: String(mirror.uuid || "") });
    }
  }
  if (!mirror) return;

  for (const child of atiiSourceChildren(sourceFolder)) {
    await atiiLockMirrorTree(child, mirror);
  }
}

function atiiScheduleFolderLock(sourceUuid, sourceId, targetParentId) {
  const run = async () => {
    if (!game.user?.isGM) return;
    const source = await atiiResolveSourceFolder(sourceUuid, sourceId);
    const target = game.folders?.get(String(targetParentId || "")) || null;
    if (!source || !target || !atiiWorldRootFor(target)) return;
    await atiiLockMirrorTree(source, target);
  };

  for (const delay of [250, 700, 1600, 3200]) {
    window.setTimeout(() => void run().catch((error) => console.warn("Adventurer's Tome | Imported folder identity hardening failed safely", error)), delay);
  }
}

function atiiInstallFolderDropHardening() {
  document.addEventListener("drop", (event) => {
    if (!game.user?.isGM) return;
    const drag = atiiFolderDragData(event);
    if (!drag) return;
    const targetNode = event.target.closest?.(`${ATII_ROOT} .at-cw-explorer[data-at-cw-section="world"] [data-at-cw-drop-folder]`);
    if (!targetNode) return;
    const targetParentId = String(targetNode.dataset.atCwDropFolder || "");
    const target = game.folders?.get(targetParentId) || null;
    if (!target || !atiiWorldRootFor(target)) return;
    atiiScheduleFolderLock(drag.uuid, drag.id, targetParentId);
  }, true);
}

function atiiAttach() {
  if (atiiAttached) return true;
  const module = atiiModule();
  const registry = module?.api?.universalDocuments;
  if (!registry?.lifecycleHardening || typeof registry.lifecycleAudit !== "function") return false;

  module.api.universalDocuments = Object.freeze({
    ...registry,
    importIdentityHardening: true,
    importIdentityAudit: () => atiiAudit()
  });

  atiiAttached = true;
  if (atiiTimer) {
    window.clearInterval(atiiTimer);
    atiiTimer = null;
  }
  console.info("Adventurer's Tome | Imported source identity hardening attached.");
  return true;
}

function atiiWatch() {
  if (atiiAttach() || atiiTimer) return;
  atiiTimer = window.setInterval(atiiAttach, 100);
}

Hooks.once("ready", () => {
  atiiInstallFolderDropHardening();
  atiiWatch();
});
