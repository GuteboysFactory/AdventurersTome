import { foundryPlatformInfo } from "./foundry-platform.js";

const ATUDR_SUPPORTED = Object.freeze([
  "Actor",
  "Item",
  "JournalEntry",
  "JournalEntryPage",
  "Scene",
  "Folder"
]);

const ATUDR_PARITY_FIELDS = Object.freeze([
  "uuid",
  "id",
  "documentName",
  "name",
  "folderUuid",
  "parentUuid",
  "ownershipDefault"
]);

const ATUDR_HOOKS = Object.freeze([
  "createActor", "updateActor", "deleteActor",
  "createItem", "updateItem", "deleteItem",
  "createJournalEntry", "updateJournalEntry", "deleteJournalEntry",
  "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage",
  "createScene", "updateScene", "deleteScene",
  "createFolder", "updateFolder", "deleteFolder"
]);

let atUdrRecords = new Map();
let atUdrDocuments = new Map();
let atUdrAudit = null;
let atUdrTimer = null;
let atUdrRevision = 0;
let atUdrPublicApi = null;
const atUdrLifecycleCounts = Object.fromEntries(ATUDR_HOOKS.map((hook) => [hook, 0]));
const atUdrLifecycleRecent = [];

function atUdrClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function atUdrFolderUuid(document) {
  const folder = document?.folder || null;
  if (!folder) return "";
  return String(folder.uuid || (folder.id ? `Folder.${folder.id}` : ""));
}

function atUdrParentUuid(document) {
  if (document?.documentName === "JournalEntryPage") return String(document.parent?.uuid || "");
  if (document?.documentName === "Folder") return atUdrFolderUuid(document);
  return "";
}

function atUdrRecord(document) {
  const documentName = String(document?.documentName || "");
  const uuid = String(document?.uuid || "");
  if (!uuid || !ATUDR_SUPPORTED.includes(documentName)) return null;

  return Object.freeze({
    uuid,
    id: String(document.id || ""),
    documentName,
    name: String(document.name || ""),
    folderUuid: atUdrFolderUuid(document),
    parentUuid: atUdrParentUuid(document),
    embedded: documentName === "JournalEntryPage",
    folderType: documentName === "Folder" ? String(document.type || "") : "",
    visible: Boolean(document.visible),
    owner: Boolean(document.isOwner),
    ownershipDefault: Number(document.ownership?.default ?? 0)
  });
}

function atUdrWorldDocuments() {
  const documents = [];
  const addCollection = (collection) => {
    for (const document of collection?.contents ?? []) documents.push(document);
  };

  addCollection(game.actors);
  addCollection(game.items);
  addCollection(game.journal);
  addCollection(game.scenes);
  addCollection(game.folders);

  for (const journal of game.journal?.contents ?? []) {
    for (const page of journal.pages?.contents ?? []) documents.push(page);
  }

  return documents;
}

function atUdrCompareRecord(record, document) {
  const live = atUdrRecord(document);
  if (!live) return [{ field: "document", expected: record?.documentName || "", actual: "unresolvable" }];
  const mismatches = [];
  for (const field of ATUDR_PARITY_FIELDS) {
    if (record?.[field] !== live?.[field]) {
      mismatches.push({ field, expected: record?.[field] ?? null, actual: live?.[field] ?? null });
    }
  }
  return mismatches;
}

function atUdrLifecycleSnapshot() {
  return {
    counts: { ...atUdrLifecycleCounts },
    recent: atUdrLifecycleRecent.map((entry) => ({ ...entry }))
  };
}

function atUdrBuildAudit(records, documents, duplicateUuids, invalidDocuments) {
  const byType = Object.fromEntries(ATUDR_SUPPORTED.map((type) => [type, 0]));
  const missingFolders = [];
  const badPageParents = [];
  const canonicalMismatches = [];

  for (const record of records.values()) {
    byType[record.documentName] = Number(byType[record.documentName] || 0) + 1;

    if (record.folderUuid && !records.has(record.folderUuid)) {
      missingFolders.push({ uuid: record.uuid, folderUuid: record.folderUuid });
    }

    if (record.documentName === "JournalEntryPage") {
      const parent = records.get(record.parentUuid);
      if (!parent || parent.documentName !== "JournalEntry") {
        badPageParents.push({ uuid: record.uuid, parentUuid: record.parentUuid });
      }
    }

    const document = documents.get(record.uuid);
    const mismatches = atUdrCompareRecord(record, document);
    if (mismatches.length) canonicalMismatches.push({ uuid: record.uuid, documentName: record.documentName, mismatches });
  }

  const platform = foundryPlatformInfo();
  return Object.freeze({
    schema: "adventurers-tome.universal-document-registry",
    schemaVersion: 2,
    mode: "shadow-read-only",
    revision: atUdrRevision,
    generatedAt: Date.now(),
    platform,
    supportedDocumentTypes: [...ATUDR_SUPPORTED],
    parityFields: [...ATUDR_PARITY_FIELDS],
    total: records.size,
    byType,
    duplicateUuids: [...duplicateUuids],
    invalidDocuments: [...invalidDocuments],
    missingFolders,
    badPageParents,
    canonicalMismatches,
    lifecycle: atUdrLifecycleSnapshot(),
    healthy: duplicateUuids.length === 0
      && invalidDocuments.length === 0
      && missingFolders.length === 0
      && badPageParents.length === 0
      && canonicalMismatches.length === 0
  });
}

function atUdrRebuild({ reason = "manual" } = {}) {
  const nextRecords = new Map();
  const nextDocuments = new Map();
  const duplicateUuids = [];
  const invalidDocuments = [];

  for (const document of atUdrWorldDocuments()) {
    const record = atUdrRecord(document);
    if (!record) {
      invalidDocuments.push({
        documentName: String(document?.documentName || "unknown"),
        id: String(document?.id || ""),
        name: String(document?.name || "")
      });
      continue;
    }
    if (nextRecords.has(record.uuid)) duplicateUuids.push(record.uuid);
    nextRecords.set(record.uuid, record);
    nextDocuments.set(record.uuid, document);
  }

  atUdrRevision += 1;
  atUdrRecords = nextRecords;
  atUdrDocuments = nextDocuments;
  atUdrAudit = atUdrBuildAudit(nextRecords, nextDocuments, duplicateUuids, invalidDocuments);

  Hooks.callAll("adventurersTomeUniversalRegistryRebuilt", {
    reason,
    revision: atUdrRevision,
    total: atUdrRecords.size,
    healthy: atUdrAudit.healthy,
    canonicalMismatches: atUdrAudit.canonicalMismatches.length
  });

  return atUdrAudit;
}

function atUdrSchedule(reason) {
  window.clearTimeout(atUdrTimer);
  atUdrTimer = window.setTimeout(() => {
    atUdrTimer = null;
    try { atUdrRebuild({ reason }); }
    catch (error) { console.error("Adventurer's Tome | Universal Document Registry rebuild failed", error); }
  }, 60);
}

function atUdrRecordLifecycle(hookName, document) {
  atUdrLifecycleCounts[hookName] = Number(atUdrLifecycleCounts[hookName] || 0) + 1;
  atUdrLifecycleRecent.unshift({
    hook: hookName,
    uuid: String(document?.uuid || ""),
    documentName: String(document?.documentName || ""),
    name: String(document?.name || ""),
    at: Date.now()
  });
  if (atUdrLifecycleRecent.length > 30) atUdrLifecycleRecent.length = 30;
}

function atUdrVerify(uuid) {
  const key = String(uuid || "");
  const record = atUdrRecords.get(key) || null;
  const document = atUdrDocuments.get(key) || null;
  if (!record || !document) {
    return {
      uuid: key,
      registered: Boolean(record),
      resolved: Boolean(document),
      exactResolve: false,
      mismatches: record ? [{ field: "document", expected: record.documentName, actual: "missing" }] : []
    };
  }
  const mismatches = atUdrCompareRecord(record, document);
  return {
    uuid: key,
    registered: true,
    resolved: true,
    exactResolve: atUdrDocuments.get(key) === document,
    documentName: record.documentName,
    name: record.name,
    mismatches,
    healthy: mismatches.length === 0
  };
}

function atUdrApi() {
  if (atUdrPublicApi) return atUdrPublicApi;
  atUdrPublicApi = Object.freeze({
    mode: "shadow-read-only",
    supportedTypes: [...ATUDR_SUPPORTED],
    parityFields: [...ATUDR_PARITY_FIELDS],
    rebuild: () => atUdrRebuild({ reason: "api" }),
    audit: () => atUdrClone(atUdrAudit || atUdrRebuild({ reason: "audit" })),
    verify: (uuid) => atUdrClone(atUdrVerify(uuid)),
    lifecycle: () => atUdrClone(atUdrLifecycleSnapshot()),
    get: (uuid) => atUdrClone(atUdrRecords.get(String(uuid || "")) || null),
    resolve: (uuid) => atUdrDocuments.get(String(uuid || "")) || null,
    has: (uuid) => atUdrRecords.has(String(uuid || "")),
    snapshot: () => [...atUdrRecords.values()].map((record) => atUdrClone(record)),
    byType: (documentName) => [...atUdrRecords.values()]
      .filter((record) => record.documentName === String(documentName || ""))
      .map((record) => atUdrClone(record))
  });
  return atUdrPublicApi;
}

export function universalDocumentRegistryApi() {
  return atUdrApi();
}

Hooks.once("ready", () => {
  const audit = atUdrRebuild({ reason: "ready" });
  console.info(
    `Adventurer's Tome | Universal Document Registry shadow parity ready: ${audit.total} documents, `
    + `${audit.healthy ? "healthy" : "audit findings present"}.`
  );
});

for (const hookName of ATUDR_HOOKS) {
  Hooks.on(hookName, (document) => {
    atUdrRecordLifecycle(hookName, document);
    atUdrSchedule(hookName);
  });
}
