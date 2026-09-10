const ATQD_MODULE_ID = "adventurers-tome";
const ATQD_ROOT = "#adventurers-tome-app";
const ATQD_SOCKET = `module.${ATQD_MODULE_ID}`;
const ATQD_DOC_CHANNEL = "quickImport";
const ATQD_FOLDER_CHANNEL = "folderQuickImport";
const ATQD_SOURCE_UUID = "quickImportSourceUuid";
const ATQD_SOURCE_TYPE = "quickImportSourceType";
const ATQD_SOURCE_FOLDER_UUID = "quickImportSourceFolderUuid";
const ATQD_DOCUMENT_TYPES = new Set(["Actor", "Item", "Scene"]);
const ATQD_FOLDER_TYPES = new Set(["Actor", "Item", "Scene", "JournalEntry"]);
const ATQD_CATEGORY = Object.freeze({ Actor: "npc", Item: "item", Scene: "location", JournalEntry: "lore" });
const ATQD_CATEGORY_FOLDER = Object.freeze({ npc: "NPCs", location: "Locations", faction: "Factions", item: "Items", lore: "Lore" });
const ATQD_INTERNAL_MIMES = new Set([
  "text/x-adventurers-tome-campaign-journal",
  "text/x-adventurers-tome-campaign-folder",
  "text/x-adventurers-tome-editor-folder"
]);
const ATQD_PENDING = new Map();

function atQdParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atQdAncestors(folder) {
  const list = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    list.unshift(current);
    current = game.folders?.get(atQdParentId(current)) || null;
  }
  return list;
}

function atQdWorldRoots() {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => {
      if (folder.type !== "JournalEntry" || folder.name !== "World") return false;
      if (String(folder.getFlag?.(ATQD_MODULE_ID, "section") || "") === "world") return true;
      return atQdAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
    })
    .sort((a, b) => atQdAncestors(a).map((f) => f.name).join("/").localeCompare(atQdAncestors(b).map((f) => f.name).join("/")));
}

function atQdDescendantIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atQdParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atQdWorldRootFor(folder) {
  if (!folder) return null;
  return atQdWorldRoots().find((root) => atQdDescendantIds(root).has(folder.id)) || null;
}

function atQdCanonicalCategory(folder) {
  let current = folder;
  while (current) {
    for (const [category, name] of Object.entries(ATQD_CATEGORY_FOLDER)) {
      if (current.name === name) return category;
    }
    current = game.folders?.get(atQdParentId(current)) || null;
  }
  return "";
}

function atQdCanImport(userId = game.user?.id) {
  const user = game.users?.get(String(userId || ""));
  if (user?.isGM) return true;
  try {
    return globalThis.AdventurersTomeEditorBroker?.canManageSection?.("world", String(userId || "")) === true;
  } catch (_err) {
    return false;
  }
}

function atQdLeaderGM() {
  return [...(game.users?.contents ?? [])]
    .filter((user) => user.isGM && user.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function atQdModernTextEditor() {
  return globalThis.foundry?.applications?.ux?.TextEditor?.implementation
    || globalThis.CONFIG?.ux?.TextEditor
    || globalThis.foundry?.applications?.ux?.TextEditor
    || null;
}

function atQdHasData(data) {
  return Boolean(data && typeof data === "object" && Object.keys(data).length);
}

function atQdRawTransferData(event) {
  for (const mime of ["application/json", "text/plain", "text"]) {
    let raw = "";
    try { raw = String(event.dataTransfer?.getData?.(mime) || "").trim(); } catch (_err) { raw = ""; }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (atQdHasData(parsed)) return parsed;
    } catch (_err) {
      const uuidMatch = raw.match(/^(Actor|Item|Scene|Folder)\.([A-Za-z0-9._-]+)$/);
      if (uuidMatch) return { type: uuidMatch[1], uuid: raw, id: uuidMatch[2] };
    }
  }
  return null;
}

function atQdDragData(event) {
  const transferTypes = [...(event.dataTransfer?.types || [])];
  if (transferTypes.some((type) => ATQD_INTERNAL_MIMES.has(type))) return null;

  let data = null;
  const textEditor = atQdModernTextEditor();
  try {
    if (typeof textEditor?.getDragEventData === "function") data = textEditor.getDragEventData(event);
  } catch (_err) {
    data = null;
  }
  if (!atQdHasData(data)) data = atQdRawTransferData(event);
  if (!atQdHasData(data)) return null;

  let type = String(data.type || data.documentName || "").trim();
  let uuid = String(data.uuid || data.documentUuid || data.data?.uuid || "").trim();
  const id = String(data.id || data._id || data.data?._id || data.data?.id || "").trim();
  const pack = String(data.pack || data.packId || "").trim();

  if (!type && uuid) type = String(uuid.split(".")[0] || "");
  if (type === "folder") type = "Folder";
  if (type === "actor") type = "Actor";
  if (type === "item") type = "Item";
  if (type === "scene") type = "Scene";

  if (![...ATQD_DOCUMENT_TYPES, "Folder"].includes(type)) return null;
  if (!uuid && pack && id) uuid = `Compendium.${pack}.${id}`;
  if (!uuid && id) uuid = `${type}.${id}`;
  if (!uuid && !id) return null;

  return { type, uuid, id };
}

function atQdSelectedFolder() {
  const explorer = document.querySelector(`${ATQD_ROOT} .at-cw-explorer[data-at-cw-section="world"]`);
  const id = String(explorer?.dataset?.atCwSelected || "");
  const folder = id ? game.folders?.get(id) : null;
  return folder && atQdWorldRootFor(folder) ? folder : null;
}

function atQdCategoryFromNode(node) {
  if (!node) return "";
  const explicit = String(node.dataset.atQiCategory || node.dataset.atQdCategory || "");
  if (ATQD_CATEGORY_FOLDER[explicit]) return explicit;
  const text = String(node.querySelector?.(".at-world-category-heading")?.textContent || node.textContent || "").toLowerCase();
  if (/npc/.test(text)) return "npc";
  if (/location|place/.test(text)) return "location";
  if (/faction/.test(text)) return "faction";
  if (/item|artifact/.test(text)) return "item";
  if (/lore/.test(text)) return "lore";
  return "";
}

function atQdResolveTarget(event, drag) {
  const folderNode = event.target.closest?.(`${ATQD_ROOT} .at-cw-explorer[data-at-cw-section="world"] [data-at-cw-drop-folder]`);
  if (folderNode) {
    const folder = game.folders?.get(String(folderNode.dataset.atCwDropFolder || ""));
    if (folder && atQdWorldRootFor(folder)) {
      return {
        node: folderNode,
        folder,
        parentId: folder.id,
        category: atQdCanonicalCategory(folder) || ATQD_CATEGORY[drag.type] || "lore",
        forceCanonical: false,
        label: folder.name,
        kind: "folder"
      };
    }
  }

  if (drag.type === "Folder") return null;
  const categoryNode = event.target.closest?.(`${ATQD_ROOT} .at-world-category`);
  if (!categoryNode) return null;
  const category = atQdCategoryFromNode(categoryNode);
  if (!category) return null;
  const roots = atQdWorldRoots();
  const selected = atQdSelectedFolder();
  const root = selected ? atQdWorldRootFor(selected) : (roots.length === 1 ? roots[0] : null);
  if (!root) return { node: categoryNode, blocked: true, label: "Select a World source in Explorer first", kind: "category" };
  return {
    node: categoryNode,
    folder: root,
    parentId: root.id,
    category,
    forceCanonical: true,
    label: ATQD_CATEGORY_FOLDER[category],
    kind: "category"
  };
}

function atQdClearUi() {
  document.querySelectorAll(`${ATQD_ROOT} .at-qi-drop-target, ${ATQD_ROOT} .at-qi-drop-blocked, ${ATQD_ROOT} .at-qf-drop-target`).forEach((node) => {
    node.classList.remove("at-qi-drop-target", "at-qi-drop-blocked", "at-qf-drop-target");
    delete node.dataset.atQiHint;
    delete node.dataset.atQfHint;
  });
}

function atQdTypeLabel(type) {
  return ({ Actor: "Actor", Item: "Item", Scene: "Scene", Folder: "Folder" })[type] || type;
}

function atQdSourceImage(source) {
  if (!source) return "";
  if (source.documentName === "Actor" || source.documentName === "Item") return String(source.img || "");
  if (source.documentName === "Scene") return String(source.thumbnail || source.thumb || source.background?.src || "");
  return "";
}

function atQdOwnership(requesterId) {
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
  const requester = game.users?.get(String(requesterId || ""));
  if (requester && !requester.isGM) ownership[requester.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return ownership;
}

function atQdProfile(source, category, previous = {}) {
  const profile = previous && typeof previous === "object" && !Array.isArray(previous)
    ? foundry.utils.deepClone(previous)
    : {};
  profile.category = category;
  profile.subtitle = String(profile.subtitle || "");
  profile.summary = String(profile.summary || "");
  profile.body = String(profile.body || "");
  profile.heroImage = String(profile.heroImage || atQdSourceImage(source) || "");
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  profile.summaryJournalBacked = true;
  profile.sourceUuid = String(source?.uuid || profile.sourceUuid || "");
  profile.sourceDocumentType = String(source?.documentName || profile.sourceDocumentType || "");
  if (source?.documentName === "Actor" && !source.pack) profile.actorId = String(source.id || profile.actorId || "");
  return profile;
}

async function atQdEnsureOverview(journal) {
  if (!journal || (journal.pages?.size ?? 0) > 0) return;
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: "Overview",
    type: "text",
    text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
    sort: 100000
  }]);
  if (created?.[0]) await journal.setFlag(ATQD_MODULE_ID, "worldSyncPage", created[0].id);
}

function atQdExistingEntry(sourceUuid) {
  return [...(game.journal?.contents ?? [])].find((journal) => {
    const folder = journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? ""));
    if (!atQdWorldRootFor(folder)) return false;
    const profile = journal.getFlag?.(ATQD_MODULE_ID, "worldProfile") || {};
    return String(journal.getFlag?.(ATQD_MODULE_ID, ATQD_SOURCE_UUID) || "") === sourceUuid
      || String(profile?.sourceUuid || "") === sourceUuid;
  }) || null;
}

async function atQdEnsureCategoryFolder(root, category) {
  const name = ATQD_CATEGORY_FOLDER[category] || "Lore";
  const existing = [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === name && atQdParentId(folder) === root.id);
  return existing || Folder.create({ name, type: "JournalEntry", folder: root.id });
}

async function atQdCreateOrMoveLinkedEntry(source, targetFolder, category, requesterId) {
  const existing = atQdExistingEntry(String(source.uuid || ""));
  if (existing) {
    const profile = atQdProfile(source, category, existing.getFlag?.(ATQD_MODULE_ID, "worldProfile") || {});
    await existing.update({
      folder: targetFolder.id,
      [`flags.${ATQD_MODULE_ID}.type`]: "world",
      [`flags.${ATQD_MODULE_ID}.worldProfile`]: profile,
      [`flags.${ATQD_MODULE_ID}.${ATQD_SOURCE_UUID}`]: source.uuid,
      [`flags.${ATQD_MODULE_ID}.${ATQD_SOURCE_TYPE}`]: source.documentName
    });
    await atQdEnsureOverview(existing);
    return { journal: existing, mode: "moved" };
  }

  const profile = atQdProfile(source, category, {});
  const journal = await JournalEntry.create({
    name: source.name || source.documentName || "Imported World entry",
    folder: targetFolder.id,
    ownership: atQdOwnership(requesterId),
    flags: {
      [ATQD_MODULE_ID]: {
        type: "world",
        worldProfile: profile,
        [ATQD_SOURCE_UUID]: source.uuid,
        [ATQD_SOURCE_TYPE]: source.documentName
      }
    }
  });
  await atQdEnsureOverview(journal);
  return { journal, mode: "created" };
}

async function atQdCopyJournal(source, targetFolder, category, requesterId) {
  const pageData = [...(source.pages?.contents ?? [])].map((page) => {
    const data = foundry.utils.deepClone(page.toObject?.() || {});
    delete data._id;
    delete data._stats;
    return data;
  });
  const flags = foundry.utils.deepClone(source.flags || {});
  flags[ATQD_MODULE_ID] = {
    ...(flags[ATQD_MODULE_ID] || {}),
    type: "world",
    worldProfile: atQdProfile(source, category, source.getFlag?.(ATQD_MODULE_ID, "worldProfile") || {}),
    [ATQD_SOURCE_UUID]: source.uuid,
    [ATQD_SOURCE_TYPE]: source.documentName
  };
  const journal = await JournalEntry.create({
    name: source.name,
    folder: targetFolder.id,
    ownership: atQdOwnership(requesterId),
    flags,
    pages: pageData
  });
  await atQdEnsureOverview(journal);
  return journal;
}

async function atQdImportJournalLocal(source, targetFolder, category, requesterId) {
  const tomeType = String(source.getFlag?.(ATQD_MODULE_ID, "type") || "").toLowerCase();
  if (tomeType && tomeType !== "world") {
    const existing = atQdExistingEntry(String(source.uuid || ""));
    if (existing) {
      await existing.update({ folder: targetFolder.id });
      return { journal: existing, mode: "moved" };
    }
    return { journal: await atQdCopyJournal(source, targetFolder, category, requesterId), mode: "copied" };
  }

  const profile = atQdProfile(source, category, source.getFlag?.(ATQD_MODULE_ID, "worldProfile") || {});
  await source.update({
    folder: targetFolder.id,
    [`flags.${ATQD_MODULE_ID}.type`]: "world",
    [`flags.${ATQD_MODULE_ID}.worldProfile`]: profile,
    [`flags.${ATQD_MODULE_ID}.${ATQD_SOURCE_UUID}`]: source.uuid,
    [`flags.${ATQD_MODULE_ID}.${ATQD_SOURCE_TYPE}`]: source.documentName
  });
  await atQdEnsureOverview(source);
  return { journal: source, mode: "adopted" };
}

async function atQdLocalDocumentImport(payload, requesterId = game.user?.id) {
  if (!game.user?.isGM) throw new Error("Local Quick Import requires a GM client.");
  if (!atQdCanImport(requesterId)) throw new Error("You are not a World Editor.");

  const parent = game.folders?.get(String(payload?.parentId || ""));
  if (!parent || !atQdWorldRootFor(parent)) throw new Error("That drop target is outside Tome World.");

  const uuid = String(payload?.sourceUuid || "").trim();
  if (!uuid) throw new Error("The dragged Foundry document has no UUID.");
  const source = await fromUuid(uuid);
  if (!source || !ATQD_DOCUMENT_TYPES.has(String(source.documentName || ""))) throw new Error("The dragged Foundry document could not be resolved as an Actor, Item, or Scene.");

  const type = String(source.documentName);
  const explicit = String(payload?.category || "");
  const inferred = atQdCanonicalCategory(parent);
  const category = ATQD_CATEGORY_FOLDER[explicit] ? explicit : (inferred || ATQD_CATEGORY[type] || "lore");
  const root = atQdWorldRootFor(parent);
  let targetFolder = parent;
  if (payload?.forceCanonical === true || root?.id === parent.id) targetFolder = await atQdEnsureCategoryFolder(root || parent, category);

  const result = await atQdCreateOrMoveLinkedEntry(source, targetFolder, category, requesterId);
  return { id: result.journal.id, name: result.journal.name, target: targetFolder.name, mode: result.mode, sourceType: type };
}

function atQdSourceIsTomeFolder(folder) {
  return atQdAncestors(folder).some((ancestor) => /adventurer'?s tome/i.test(String(ancestor.name || "")));
}

async function atQdResolveSourceFolder(payload) {
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

function atQdCollection(type) {
  if (type === "Actor") return game.actors?.contents ?? [];
  if (type === "Item") return game.items?.contents ?? [];
  if (type === "Scene") return game.scenes?.contents ?? [];
  if (type === "JournalEntry") return game.journal?.contents ?? [];
  return [];
}

function atQdDirectDocuments(sourceFolder) {
  return [...atQdCollection(sourceFolder.type)]
    .filter((document) => String(document.folder?.id ?? document.folder ?? "") === String(sourceFolder.id));
}

function atQdChildFolders(sourceFolder) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === sourceFolder.type && atQdParentId(folder) === String(sourceFolder.id))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function atQdEnsureMirrorFolder(sourceFolder, targetParent) {
  const sourceUuid = String(sourceFolder.uuid || `Folder.${sourceFolder.id}`);
  const direct = [...(game.folders?.contents ?? [])].filter((folder) => folder.type === "JournalEntry" && atQdParentId(folder) === String(targetParent.id));
  const flagged = direct.find((folder) => String(folder.getFlag?.(ATQD_MODULE_ID, ATQD_SOURCE_FOLDER_UUID) || "") === sourceUuid);
  if (flagged) return flagged;
  const named = direct.find((folder) => String(folder.name || "") === String(sourceFolder.name || ""));
  if (named) return named;
  return Folder.create({
    name: sourceFolder.name || "Imported Folder",
    type: "JournalEntry",
    folder: targetParent.id,
    flags: { [ATQD_MODULE_ID]: { [ATQD_SOURCE_FOLDER_UUID]: sourceUuid } }
  });
}

async function atQdImportFolderDocumentLocal(source, targetFolder, sourceType, requesterId) {
  const category = atQdCanonicalCategory(targetFolder) || ATQD_CATEGORY[sourceType] || "lore";
  if (sourceType === "JournalEntry") return atQdImportJournalLocal(source, targetFolder, category, requesterId);
  return atQdCreateOrMoveLinkedEntry(source, targetFolder, category, requesterId);
}

async function atQdImportFolderRecursiveLocal(sourceFolder, targetParent, requesterId, stats) {
  const mirror = await atQdEnsureMirrorFolder(sourceFolder, targetParent);
  stats.folders += 1;

  for (const source of atQdDirectDocuments(sourceFolder)) {
    try {
      const result = await atQdImportFolderDocumentLocal(source, mirror, sourceFolder.type, requesterId);
      stats.entries += 1;
      if (result.mode === "moved") stats.moved += 1;
      else if (result.mode === "adopted") stats.adopted += 1;
      else if (result.mode === "copied") stats.copied += 1;
      else stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      console.warn(`Adventurer's Tome | Local Folder Quick Import skipped ${source?.name || source?.id}`, error);
    }
  }

  for (const child of atQdChildFolders(sourceFolder)) {
    await atQdImportFolderRecursiveLocal(child, mirror, requesterId, stats);
  }
  return mirror;
}

async function atQdLocalFolderImport(payload, requesterId = game.user?.id) {
  if (!game.user?.isGM) throw new Error("Local Folder Quick Import requires a GM client.");
  if (!atQdCanImport(requesterId)) throw new Error("You are not a World Editor.");

  const target = game.folders?.get(String(payload?.targetFolderId || ""));
  if (!target || !atQdWorldRootFor(target)) throw new Error("That drop target is outside Tome World.");

  const sourceFolder = await atQdResolveSourceFolder(payload);
  if (atQdSourceIsTomeFolder(sourceFolder)) throw new Error("Tome folders should be reorganized inside Tome Explorer, not re-imported from Foundry Journals.");
  if (!ATQD_FOLDER_TYPES.has(String(sourceFolder.type || ""))) throw new Error(`${sourceFolder.type || "This folder type"} is not supported by World Folder Quick Import yet.`);

  const stats = { folders: 0, entries: 0, created: 0, moved: 0, adopted: 0, copied: 0, failed: 0 };
  const mirror = await atQdImportFolderRecursiveLocal(sourceFolder, target, requesterId, stats);
  return { sourceName: sourceFolder.name, targetName: mirror.name, sourceType: sourceFolder.type, ...stats };
}

function atQdRequest(channel, payload, timeout = 15000) {
  // Socket.IO does not echo a module socket request back to the sending client.
  // A GM therefore must execute locally instead of sending a request to itself.
  if (game.user?.isGM) {
    if (channel === ATQD_DOC_CHANNEL) return atQdLocalDocumentImport(payload, game.user.id);
    if (channel === ATQD_FOLDER_CHANNEL) return atQdLocalFolderImport(payload, game.user.id);
    return Promise.reject(new Error("Unsupported local Quick Import channel."));
  }

  const gm = atQdLeaderGM();
  if (!gm) return Promise.reject(new Error("A GM must be online for Tome Quick Import."));
  const requestId = foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ATQD_PENDING.delete(requestId);
      reject(new Error("The GM did not answer the Quick Import request."));
    }, timeout);
    ATQD_PENDING.set(requestId, { resolve, reject, timer, channel });
    game.socket.emit(ATQD_SOCKET, {
      channel,
      type: "request",
      requestId,
      requesterId: game.user.id,
      targetGmId: gm.id,
      payload
    });
  });
}

function atQdHandleSocket(message) {
  if (!message || message.type !== "response") return;
  if (![ATQD_DOC_CHANNEL, ATQD_FOLDER_CHANNEL].includes(message.channel)) return;
  if (String(message.targetUserId || "") !== String(game.user?.id || "")) return;
  const requestId = String(message.requestId || "");
  const pending = ATQD_PENDING.get(requestId);
  if (!pending || pending.channel !== message.channel) return;
  window.clearTimeout(pending.timer);
  ATQD_PENDING.delete(requestId);
  if (message.ok) pending.resolve(message.result);
  else pending.reject(new Error(String(message.error || "Quick Import failed.")));
}

async function atQdImport(drag, target) {
  if (target.blocked) {
    ui.notifications.warn("Adventurer's Tome: Select the World source tree you want to use, or drop directly on an Explorer folder.");
    return;
  }

  if (drag.type === "Folder") {
    ui.notifications.info("Adventurer's Tome: Importing Foundry folder…");
    const result = await atQdRequest(ATQD_FOLDER_CHANNEL, {
      sourceFolderUuid: drag.uuid,
      sourceFolderId: drag.id,
      targetFolderId: target.parentId
    }, 30000);
    const failed = Number(result?.failed || 0);
    const suffix = failed ? ` · ${failed} skipped` : "";
    ui.notifications.info(`Adventurer's Tome: Imported ${result?.folders || 0} folder(s) and ${result?.entries || 0} entr${Number(result?.entries || 0) === 1 ? "y" : "ies"}${suffix}.`);
  } else {
    ui.notifications.info(`Adventurer's Tome: Importing ${atQdTypeLabel(drag.type)}…`);
    const result = await atQdRequest(ATQD_DOC_CHANNEL, {
      sourceUuid: drag.uuid,
      sourceType: drag.type,
      parentId: target.parentId,
      category: target.category,
      forceCanonical: target.forceCanonical === true
    });
    const verb = result?.mode === "moved" ? "Moved existing" : result?.mode === "adopted" ? "Added" : "Imported";
    ui.notifications.info(`Adventurer's Tome: ${verb} ${result?.name || atQdTypeLabel(drag.type)} → ${result?.target || target.label}.`);
  }

  window.setTimeout(() => {
    try { game.modules.get(ATQD_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
  }, 120);
}

Hooks.once("ready", () => {
  game.socket.on(ATQD_SOCKET, atQdHandleSocket);

  document.addEventListener("dragover", (event) => {
    if (!atQdCanImport()) return;
    const drag = atQdDragData(event);
    if (!drag) return;
    const target = atQdResolveTarget(event, drag);
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = target.blocked ? "none" : "copy";
    atQdClearUi();
    target.node.classList.add(target.blocked ? "at-qi-drop-blocked" : (drag.type === "Folder" ? "at-qf-drop-target" : "at-qi-drop-target"));
    if (drag.type === "Folder") target.node.dataset.atQfHint = "+ Import folder here (includes subfolders)";
    else target.node.dataset.atQiHint = target.blocked ? target.label : `+ Add ${atQdTypeLabel(drag.type)} to ${target.label}`;
  }, true);

  document.addEventListener("dragleave", (event) => {
    const node = event.target.closest?.(".at-qi-drop-target, .at-qi-drop-blocked, .at-qf-drop-target");
    if (node && !node.contains(event.relatedTarget)) atQdClearUi();
  }, true);

  document.addEventListener("drop", (event) => {
    if (!atQdCanImport()) return;
    const drag = atQdDragData(event);
    if (!drag) return;
    const target = atQdResolveTarget(event, drag);
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    atQdClearUi();
    void atQdImport(drag, target).catch((error) => {
      console.error("Adventurer's Tome | DnD Quick Import compatibility layer failed", error);
      ui.notifications.error(`Adventurer's Tome: ${error?.message || "Quick Import failed."}`);
    });
  }, true);

  document.addEventListener("dragend", atQdClearUi, true);
});
