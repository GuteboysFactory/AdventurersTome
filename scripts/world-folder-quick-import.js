const ATQF_MODULE_ID = "adventurers-tome";
const ATQF_ROOT = "#adventurers-tome-app";
const ATQF_SOCKET = `module.${ATQF_MODULE_ID}`;
const ATQF_CHANNEL = "folderQuickImport";
const ATQF_PENDING = new Map();
const ATQF_SUPPORTED = new Set(["Actor", "Item", "Scene", "JournalEntry"]);
const ATQF_CATEGORY = Object.freeze({ Actor: "npc", Item: "item", Scene: "location", JournalEntry: "lore" });
const ATQF_CATEGORY_FOLDER = Object.freeze({ npc: "NPCs", location: "Locations", faction: "Factions", item: "Items", lore: "Lore" });
const ATQF_SOURCE_UUID = "quickImportSourceUuid";
const ATQF_SOURCE_TYPE = "quickImportSourceType";
const ATQF_SOURCE_FOLDER_UUID = "quickImportSourceFolderUuid";
const ATQF_INTERNAL_MIMES = new Set([
  "text/x-adventurers-tome-campaign-journal",
  "text/x-adventurers-tome-campaign-folder",
  "text/x-adventurers-tome-editor-folder"
]);

function atQfParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atQfAncestors(folder) {
  const result = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = game.folders?.get(atQfParentId(current)) || null;
  }
  return result;
}

function atQfWorldRoots() {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => {
      if (folder.type !== "JournalEntry" || folder.name !== "World") return false;
      if (String(folder.getFlag?.(ATQF_MODULE_ID, "section") || "") === "world") return true;
      return atQfAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
    });
}

function atQfDescendantIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atQfParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atQfWorldRootFor(folder) {
  if (!folder) return null;
  return atQfWorldRoots().find((root) => atQfDescendantIds(root).has(folder.id)) || null;
}

function atQfTargetBelongs(folder) {
  return Boolean(atQfWorldRootFor(folder));
}

function atQfSourceIsTomeFolder(folder) {
  return atQfAncestors(folder).some((ancestor) => /adventurer'?s tome/i.test(String(ancestor.name || "")));
}

function atQfCanonicalCategory(folder) {
  let current = folder;
  while (current) {
    for (const [category, name] of Object.entries(ATQF_CATEGORY_FOLDER)) {
      if (current.name === name) return category;
    }
    current = game.folders?.get(atQfParentId(current)) || null;
  }
  return "";
}

function atQfCanImport(userId = game.user?.id) {
  const user = game.users?.get(String(userId || ""));
  if (user?.isGM || (game.user?.isGM && String(userId) === String(game.user.id))) return true;
  try {
    return globalThis.AdventurersTomeEditorBroker?.canManageSection?.("world", String(userId || "")) === true;
  } catch (_err) {
    return false;
  }
}

function atQfLeaderGM() {
  return [...(game.users?.contents ?? [])]
    .filter((user) => user.isGM && user.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function atQfFolderDragData(event) {
  const types = [...(event.dataTransfer?.types || [])];
  if (types.some((type) => ATQF_INTERNAL_MIMES.has(type))) return null;

  let data = null;
  try {
    if (typeof TextEditor?.getDragEventData === "function") data = TextEditor.getDragEventData(event);
  } catch (_err) {}

  if (!data) {
    const raw = String(event.dataTransfer?.getData?.("text/plain") || "").trim();
    if (!raw) return null;
    try { data = JSON.parse(raw); } catch (_err) { return null; }
  }

  const type = String(data?.type || data?.documentName || "").toLowerCase();
  if (type !== "folder") return null;
  const id = String(data?.id || data?._id || "").trim();
  let uuid = String(data?.uuid || data?.documentUuid || "").trim();
  if (!uuid && id) uuid = `Folder.${id}`;
  if (!uuid && !id) return null;
  return { uuid, id };
}

async function atQfResolveSourceFolder(payload) {
  const uuid = String(payload?.sourceFolderUuid || "").trim();
  const id = String(payload?.sourceFolderId || "").trim();
  let folder = null;
  if (uuid) {
    try { folder = await fromUuid(uuid); } catch (_err) {}
  }
  if (!folder && id) folder = game.folders?.get(id) || null;
  if (!folder || folder.documentName !== "Folder") throw new Error("The dragged Foundry folder could not be resolved.");
  return folder;
}

function atQfResolveTarget(event) {
  const node = event.target.closest?.(`${ATQF_ROOT} .at-cw-explorer[data-at-cw-section="world"] [data-at-cw-drop-folder]`);
  if (!node) return null;
  const folder = game.folders?.get(String(node.dataset.atCwDropFolder || ""));
  if (!folder || !atQfTargetBelongs(folder)) return null;
  return { node, folder };
}

function atQfClearUi() {
  document.querySelectorAll(`${ATQF_ROOT} .at-qf-drop-target, ${ATQF_ROOT} .at-qf-drop-blocked`).forEach((node) => {
    node.classList.remove("at-qf-drop-target", "at-qf-drop-blocked");
    delete node.dataset.atQfHint;
  });
}

function atQfRequest(payload) {
  if (game.user?.isGM) return atQfExecute(payload, game.user.id);
  const gm = atQfLeaderGM();
  if (!gm) return Promise.reject(new Error("A GM must be online for Folder Quick Import."));
  const requestId = foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ATQF_PENDING.delete(requestId);
      reject(new Error("The GM did not answer the Folder Quick Import request."));
    }, 30000);
    ATQF_PENDING.set(requestId, { resolve, reject, timer });
    game.socket.emit(ATQF_SOCKET, {
      channel: ATQF_CHANNEL,
      type: "request",
      requestId,
      requesterId: game.user.id,
      targetGmId: gm.id,
      payload
    });
  });
}

function atQfCollection(type) {
  if (type === "Actor") return game.actors?.contents ?? [];
  if (type === "Item") return game.items?.contents ?? [];
  if (type === "Scene") return game.scenes?.contents ?? [];
  if (type === "JournalEntry") return game.journal?.contents ?? [];
  return [];
}

function atQfDirectDocuments(sourceFolder) {
  return [...atQfCollection(sourceFolder.type)]
    .filter((document) => String(document.folder?.id ?? document.folder ?? "") === String(sourceFolder.id));
}

function atQfChildFolders(sourceFolder) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === sourceFolder.type && atQfParentId(folder) === String(sourceFolder.id))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function atQfSourceImage(source) {
  if (!source) return "";
  if (source.documentName === "Actor" || source.documentName === "Item") return String(source.img || "");
  if (source.documentName === "Scene") return String(source.thumbnail || source.thumb || source.background?.src || "");
  return "";
}

function atQfOwnership(requesterId) {
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
  const requester = game.users?.get(String(requesterId || ""));
  if (requester && !requester.isGM) ownership[requester.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return ownership;
}

function atQfProfile(source, category, previous = {}) {
  const profile = previous && typeof previous === "object" && !Array.isArray(previous)
    ? foundry.utils.deepClone(previous)
    : {};
  profile.category = category;
  profile.subtitle = String(profile.subtitle || "");
  profile.summary = String(profile.summary || "");
  profile.body = String(profile.body || "");
  profile.heroImage = String(profile.heroImage || atQfSourceImage(source) || "");
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  profile.summaryJournalBacked = true;
  profile.sourceUuid = String(source?.uuid || profile.sourceUuid || "");
  profile.sourceDocumentType = String(source?.documentName || profile.sourceDocumentType || "");
  if (source?.documentName === "Actor" && !source.pack) profile.actorId = String(source.id || profile.actorId || "");
  return profile;
}

async function atQfEnsureOverview(journal) {
  if (!journal || (journal.pages?.size ?? 0) > 0) return;
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: "Overview",
    type: "text",
    text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
    sort: 100000
  }]);
  if (created?.[0]) await journal.setFlag(ATQF_MODULE_ID, "worldSyncPage", created[0].id);
}

function atQfExistingEntry(sourceUuid) {
  return [...(game.journal?.contents ?? [])].find((journal) => {
    const folder = journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? ""));
    if (!atQfWorldRootFor(folder)) return false;
    const profile = journal.getFlag?.(ATQF_MODULE_ID, "worldProfile") || {};
    return String(journal.getFlag?.(ATQF_MODULE_ID, ATQF_SOURCE_UUID) || "") === sourceUuid
      || String(profile?.sourceUuid || "") === sourceUuid;
  }) || null;
}

async function atQfEnsureMirrorFolder(sourceFolder, targetParent) {
  const sourceUuid = String(sourceFolder.uuid || `Folder.${sourceFolder.id}`);
  const direct = [...(game.folders?.contents ?? [])].filter((folder) => folder.type === "JournalEntry" && atQfParentId(folder) === String(targetParent.id));
  const flagged = direct.find((folder) => String(folder.getFlag?.(ATQF_MODULE_ID, ATQF_SOURCE_FOLDER_UUID) || "") === sourceUuid);
  if (flagged) return flagged;
  const named = direct.find((folder) => String(folder.name || "") === String(sourceFolder.name || ""));
  if (named) return named;
  return Folder.create({
    name: sourceFolder.name || "Imported Folder",
    type: "JournalEntry",
    folder: targetParent.id,
    flags: { [ATQF_MODULE_ID]: { [ATQF_SOURCE_FOLDER_UUID]: sourceUuid } }
  });
}

async function atQfCreateLinkedEntry(source, targetFolder, category, requesterId) {
  const existing = atQfExistingEntry(String(source.uuid || ""));
  if (existing) {
    const profile = atQfProfile(source, category, existing.getFlag?.(ATQF_MODULE_ID, "worldProfile") || {});
    await existing.update({
      folder: targetFolder.id,
      [`flags.${ATQF_MODULE_ID}.type`]: "world",
      [`flags.${ATQF_MODULE_ID}.worldProfile`]: profile,
      [`flags.${ATQF_MODULE_ID}.${ATQF_SOURCE_UUID}`]: source.uuid,
      [`flags.${ATQF_MODULE_ID}.${ATQF_SOURCE_TYPE}`]: source.documentName
    });
    await atQfEnsureOverview(existing);
    return { journal: existing, mode: "moved" };
  }

  const profile = atQfProfile(source, category, {});
  const journal = await JournalEntry.create({
    name: source.name || source.documentName || "Imported World entry",
    folder: targetFolder.id,
    ownership: atQfOwnership(requesterId),
    flags: {
      [ATQF_MODULE_ID]: {
        type: "world",
        worldProfile: profile,
        [ATQF_SOURCE_UUID]: source.uuid,
        [ATQF_SOURCE_TYPE]: source.documentName
      }
    }
  });
  await atQfEnsureOverview(journal);
  return { journal, mode: "created" };
}

async function atQfCopyJournal(source, targetFolder, category, requesterId) {
  const pageData = [...(source.pages?.contents ?? [])].map((page) => {
    const data = foundry.utils.deepClone(page.toObject?.() || {});
    delete data._id;
    delete data._stats;
    return data;
  });
  const flags = foundry.utils.deepClone(source.flags || {});
  flags[ATQF_MODULE_ID] = {
    ...(flags[ATQF_MODULE_ID] || {}),
    type: "world",
    worldProfile: atQfProfile(source, category, source.getFlag?.(ATQF_MODULE_ID, "worldProfile") || {}),
    [ATQF_SOURCE_UUID]: source.uuid,
    [ATQF_SOURCE_TYPE]: source.documentName
  };
  const journal = await JournalEntry.create({
    name: source.name,
    folder: targetFolder.id,
    ownership: atQfOwnership(requesterId),
    flags,
    pages: pageData
  });
  await atQfEnsureOverview(journal);
  return journal;
}

async function atQfImportJournal(source, targetFolder, category, requesterId) {
  const tomeType = String(source.getFlag?.(ATQF_MODULE_ID, "type") || "").toLowerCase();
  if (tomeType && tomeType !== "world") {
    const existing = atQfExistingEntry(String(source.uuid || ""));
    if (existing) {
      await existing.update({ folder: targetFolder.id });
      return { journal: existing, mode: "moved" };
    }
    return { journal: await atQfCopyJournal(source, targetFolder, category, requesterId), mode: "copied" };
  }

  const profile = atQfProfile(source, category, source.getFlag?.(ATQF_MODULE_ID, "worldProfile") || {});
  await source.update({
    folder: targetFolder.id,
    [`flags.${ATQF_MODULE_ID}.type`]: "world",
    [`flags.${ATQF_MODULE_ID}.worldProfile`]: profile,
    [`flags.${ATQF_MODULE_ID}.${ATQF_SOURCE_UUID}`]: source.uuid,
    [`flags.${ATQF_MODULE_ID}.${ATQF_SOURCE_TYPE}`]: source.documentName
  });
  await atQfEnsureOverview(source);
  return { journal: source, mode: "adopted" };
}

async function atQfImportDocument(source, targetFolder, sourceType, requesterId) {
  const category = atQfCanonicalCategory(targetFolder) || ATQF_CATEGORY[sourceType] || "lore";
  if (sourceType === "JournalEntry") return atQfImportJournal(source, targetFolder, category, requesterId);
  return atQfCreateLinkedEntry(source, targetFolder, category, requesterId);
}

async function atQfImportFolderRecursive(sourceFolder, targetParent, requesterId, stats) {
  const mirror = await atQfEnsureMirrorFolder(sourceFolder, targetParent);
  stats.folders += 1;

  const documents = atQfDirectDocuments(sourceFolder);
  const children = atQfChildFolders(sourceFolder);

  for (const source of documents) {
    try {
      const result = await atQfImportDocument(source, mirror, sourceFolder.type, requesterId);
      stats.entries += 1;
      if (result.mode === "moved") stats.moved += 1;
      else if (result.mode === "adopted") stats.adopted += 1;
      else if (result.mode === "copied") stats.copied += 1;
      else stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      console.warn(`Adventurer's Tome | Folder Quick Import skipped ${source?.name || source?.id}`, error);
    }
  }

  for (const child of children) await atQfImportFolderRecursive(child, mirror, requesterId, stats);
  return mirror;
}

async function atQfExecute(payload, requesterId = "") {
  if (!game.user?.isGM) throw new Error("Folder Quick Import must execute on a GM client.");
  const requester = game.users?.get(String(requesterId || ""));
  if (!requester || !atQfCanImport(requester.id)) throw new Error("You are not a World Editor.");

  const target = game.folders?.get(String(payload?.targetFolderId || ""));
  if (!target || !atQfTargetBelongs(target)) throw new Error("That drop target is outside Tome World.");

  const sourceFolder = await atQfResolveSourceFolder(payload);
  if (atQfSourceIsTomeFolder(sourceFolder)) throw new Error("Tome folders should be reorganized inside Tome Explorer, not re-imported from Foundry Journals.");
  if (!ATQF_SUPPORTED.has(String(sourceFolder.type || ""))) {
    throw new Error(`${sourceFolder.type || "This folder type"} is not supported by World Folder Quick Import yet.`);
  }

  const stats = { folders: 0, entries: 0, created: 0, moved: 0, adopted: 0, copied: 0, failed: 0 };
  const mirror = await atQfImportFolderRecursive(sourceFolder, target, requester.id, stats);
  return { sourceName: sourceFolder.name, targetName: mirror.name, sourceType: sourceFolder.type, ...stats };
}

async function atQfHandleSocket(message) {
  if (!message || message.channel !== ATQF_CHANNEL) return;

  if (message.type === "response" && String(message.targetUserId || "") === String(game.user?.id || "")) {
    const pending = ATQF_PENDING.get(String(message.requestId || ""));
    if (!pending) return;
    window.clearTimeout(pending.timer);
    ATQF_PENDING.delete(String(message.requestId || ""));
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(String(message.error || "Folder Quick Import failed.")));
    return;
  }

  if (message.type !== "request" || !game.user?.isGM || String(message.targetGmId || "") !== String(game.user.id)) return;
  const requestId = String(message.requestId || "");
  const requesterId = String(message.requesterId || "");
  try {
    const result = await atQfExecute(message.payload || {}, requesterId);
    game.socket.emit(ATQF_SOCKET, { channel: ATQF_CHANNEL, type: "response", requestId, targetUserId: requesterId, ok: true, result });
  } catch (error) {
    console.error("Adventurer's Tome | Folder Quick Import broker failed", error);
    game.socket.emit(ATQF_SOCKET, { channel: ATQF_CHANNEL, type: "response", requestId, targetUserId: requesterId, ok: false, error: error?.message || "Folder Quick Import failed." });
  }
}

Hooks.once("ready", () => {
  game.socket.on(ATQF_SOCKET, (message) => void atQfHandleSocket(message));

  document.addEventListener("dragover", (event) => {
    if (!atQfCanImport()) return;
    const drag = atQfFolderDragData(event);
    if (!drag) return;
    const target = atQfResolveTarget(event);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    atQfClearUi();
    target.node.classList.add("at-qf-drop-target");
    target.node.dataset.atQfHint = "+ Import folder here (includes subfolders)";
  }, true);

  document.addEventListener("dragleave", (event) => {
    const node = event.target.closest?.(".at-qf-drop-target, .at-qf-drop-blocked");
    if (node && !node.contains(event.relatedTarget)) {
      node.classList.remove("at-qf-drop-target", "at-qf-drop-blocked");
      delete node.dataset.atQfHint;
    }
  }, true);

  document.addEventListener("drop", (event) => {
    if (!atQfCanImport()) return;
    const drag = atQfFolderDragData(event);
    if (!drag) return;
    const target = atQfResolveTarget(event);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    atQfClearUi();
    ui.notifications.info("Adventurer's Tome: Importing Foundry folder…");

    void atQfRequest({
      sourceFolderUuid: drag.uuid,
      sourceFolderId: drag.id,
      targetFolderId: target.folder.id
    }).then((result) => {
      const failed = Number(result?.failed || 0);
      const suffix = failed ? ` · ${failed} skipped` : "";
      ui.notifications.info(`Adventurer's Tome: Imported ${result?.folders || 0} folder(s) and ${result?.entries || 0} entr${Number(result?.entries || 0) === 1 ? "y" : "ies"}${suffix}.`);
      window.setTimeout(() => {
        try { game.modules.get(ATQF_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
      }, 120);
    }).catch((error) => {
      console.error("Adventurer's Tome | Folder Quick Import failed", error);
      ui.notifications.error(`Adventurer's Tome: ${error?.message || "Folder Quick Import failed."}`);
    });
  }, true);

  document.addEventListener("dragend", atQfClearUi, true);
});
