const ATQI_MODULE_ID = "adventurers-tome";
const ATQI_ROOT = "#adventurers-tome-app";
const ATQI_SOCKET = `module.${ATQI_MODULE_ID}`;
const ATQI_SOURCE_UUID = "quickImportSourceUuid";
const ATQI_SOURCE_TYPE = "quickImportSourceType";
const ATQI_PENDING = new Map();
const ATQI_SUPPORTED = new Set(["Actor", "Item", "Scene", "JournalEntry"]);
const ATQI_TYPE_CATEGORY = Object.freeze({ Actor: "npc", Item: "item", Scene: "location", JournalEntry: "lore" });
const ATQI_CATEGORY_FOLDER = Object.freeze({ npc: "NPCs", location: "Locations", faction: "Factions", item: "Items", lore: "Lore" });
const ATQI_INTERNAL_MIMES = new Set([
  "text/x-adventurers-tome-campaign-journal",
  "text/x-adventurers-tome-campaign-folder",
  "text/x-adventurers-tome-editor-folder"
]);
let atQiEnhanceTimer = null;

function atQiEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atQiParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atQiAncestors(folder) {
  const list = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    list.unshift(current);
    current = game.folders?.get(atQiParentId(current)) || null;
  }
  return list;
}

function atQiWorldRoots() {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => {
      if (folder.type !== "JournalEntry" || folder.name !== "World") return false;
      if (String(folder.getFlag?.(ATQI_MODULE_ID, "section") || "") === "world") return true;
      return atQiAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
    })
    .sort((a, b) => atQiAncestors(a).map((f) => f.name).join("/").localeCompare(atQiAncestors(b).map((f) => f.name).join("/")));
}

function atQiDescendantIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atQiParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atQiWorldRootFor(folder) {
  if (!folder) return null;
  return atQiWorldRoots().find((root) => atQiDescendantIds(root).has(folder.id)) || null;
}

function atQiFolderBelongs(folder) {
  return Boolean(atQiWorldRootFor(folder));
}

function atQiCanonicalCategory(folder) {
  let current = folder;
  while (current) {
    for (const [category, name] of Object.entries(ATQI_CATEGORY_FOLDER)) {
      if (current.name === name) return category;
    }
    current = game.folders?.get(atQiParentId(current)) || null;
  }
  return "";
}

function atQiCanImport(userId = game.user?.id) {
  const user = game.users?.get(String(userId || ""));
  if (user?.isGM || (game.user?.isGM && String(userId) === String(game.user.id))) return true;
  try {
    return globalThis.AdventurersTomeEditorBroker?.canManageSection?.("world", String(userId || "")) === true;
  } catch (_err) {
    return false;
  }
}

function atQiLeaderGM() {
  return [...(game.users?.contents ?? [])]
    .filter((user) => user.isGM && user.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function atQiNormalizeType(value) {
  const raw = String(value || "");
  if (ATQI_SUPPORTED.has(raw)) return raw;
  const lower = raw.toLowerCase();
  return [...ATQI_SUPPORTED].find((type) => type.toLowerCase() === lower) || "";
}

function atQiDragData(event) {
  const types = [...(event.dataTransfer?.types || [])];
  if (types.some((type) => ATQI_INTERNAL_MIMES.has(type))) return null;

  let data = null;
  try {
    if (typeof TextEditor?.getDragEventData === "function") data = TextEditor.getDragEventData(event);
  } catch (_err) {}

  if (!data) {
    const raw = String(event.dataTransfer?.getData?.("text/plain") || "").trim();
    if (!raw) return null;
    try { data = JSON.parse(raw); } catch (_err) { return null; }
  }

  const type = atQiNormalizeType(data?.type || data?.documentName);
  if (!type) return null;
  let uuid = String(data?.uuid || data?.documentUuid || "").trim();
  const id = String(data?.id || data?._id || "").trim();
  if (!uuid && id) uuid = `${type}.${id}`;
  if (!uuid) return null;
  return { type, uuid };
}

function atQiDefaultCategory(type) {
  return ATQI_TYPE_CATEGORY[type] || "lore";
}

function atQiCategoryFromNode(node) {
  if (!node) return "";
  const explicit = String(node.dataset.atQiCategory || "");
  if (ATQI_CATEGORY_FOLDER[explicit]) return explicit;
  const text = String(node.querySelector?.(".at-world-category-heading")?.textContent || node.textContent || "").toLowerCase();
  if (/npc/.test(text)) return "npc";
  if (/location|place/.test(text)) return "location";
  if (/faction/.test(text)) return "faction";
  if (/item|artifact/.test(text)) return "item";
  if (/lore/.test(text)) return "lore";
  return "";
}

function atQiSelectedFolder() {
  const explorer = document.querySelector(`${ATQI_ROOT} .at-cw-explorer[data-at-cw-section="world"]`);
  const id = String(explorer?.dataset?.atCwSelected || "");
  const folder = id ? game.folders?.get(id) : null;
  return folder && atQiFolderBelongs(folder) ? folder : null;
}

function atQiResolveTarget(event, drag) {
  const folderNode = event.target.closest?.(`${ATQI_ROOT} .at-cw-explorer[data-at-cw-section="world"] [data-at-cw-drop-folder]`);
  if (folderNode) {
    const folder = game.folders?.get(String(folderNode.dataset.atCwDropFolder || ""));
    if (folder && atQiFolderBelongs(folder)) {
      return {
        node: folderNode,
        parentId: folder.id,
        category: atQiCanonicalCategory(folder) || atQiDefaultCategory(drag.type),
        forceCanonical: false,
        label: folder.name,
        kind: "folder"
      };
    }
  }

  const categoryNode = event.target.closest?.(`${ATQI_ROOT} .at-world-category`);
  if (!categoryNode) return null;
  const category = atQiCategoryFromNode(categoryNode);
  if (!category) return null;
  const roots = atQiWorldRoots();
  const selected = atQiSelectedFolder();
  const root = selected ? atQiWorldRootFor(selected) : (roots.length === 1 ? roots[0] : null);
  if (!root) {
    return { node: categoryNode, blocked: true, label: "Select a World source in Explorer first", kind: "category" };
  }
  return {
    node: categoryNode,
    parentId: root.id,
    category,
    forceCanonical: true,
    label: ATQI_CATEGORY_FOLDER[category],
    kind: "category"
  };
}

function atQiClearDropUi() {
  document.querySelectorAll(`${ATQI_ROOT} .at-qi-drop-target, ${ATQI_ROOT} .at-qi-drop-blocked`).forEach((node) => {
    node.classList.remove("at-qi-drop-target", "at-qi-drop-blocked");
    delete node.dataset.atQiHint;
  });
}

function atQiTypeLabel(type) {
  return ({ Actor: "Actor", Item: "Item", Scene: "Scene", JournalEntry: "Journal" })[type] || type;
}

function atQiRequest(payload) {
  if (game.user?.isGM) return atQiExecute(payload, game.user.id);
  const gm = atQiLeaderGM();
  if (!gm) return Promise.reject(new Error("A GM must be online for Tome Quick Import."));
  const requestId = foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ATQI_PENDING.delete(requestId);
      reject(new Error("The GM did not answer the Quick Import request."));
    }, 12000);
    ATQI_PENDING.set(requestId, { resolve, reject, timer });
    game.socket.emit(ATQI_SOCKET, {
      channel: "quickImport",
      type: "request",
      requestId,
      requesterId: game.user.id,
      targetGmId: gm.id,
      payload
    });
  });
}

async function atQiEnsureCategoryFolder(root, category) {
  const name = ATQI_CATEGORY_FOLDER[category] || "Lore";
  const found = [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === name && atQiParentId(folder) === root.id);
  return found || Folder.create({ name, type: "JournalEntry", folder: root.id });
}

function atQiSourceImage(source) {
  if (!source) return "";
  if (source.documentName === "Actor" || source.documentName === "Item") return String(source.img || "");
  if (source.documentName === "Scene") {
    return String(source.thumbnail || source.thumb || source.background?.src || source.background?.src || "");
  }
  return "";
}

function atQiExistingBySource(uuid) {
  return [...(game.journal?.contents ?? [])].find((journal) => {
    if (!atQiWorldRootFor(journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? "")))) return false;
    const flagged = String(journal.getFlag?.(ATQI_MODULE_ID, ATQI_SOURCE_UUID) || "");
    const profile = journal.getFlag?.(ATQI_MODULE_ID, "worldProfile") || {};
    return flagged === uuid || String(profile?.sourceUuid || "") === uuid;
  }) || null;
}

function atQiWorldProfile(source, category, previous = {}) {
  const profile = previous && typeof previous === "object" && !Array.isArray(previous) ? foundry.utils.deepClone(previous) : {};
  profile.category = category;
  profile.subtitle = String(profile.subtitle || "");
  profile.summary = String(profile.summary || "");
  profile.body = String(profile.body || "");
  profile.heroImage = String(profile.heroImage || atQiSourceImage(source) || "");
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  profile.summaryJournalBacked = true;
  profile.sourceUuid = String(source?.uuid || profile.sourceUuid || "");
  profile.sourceDocumentType = String(source?.documentName || profile.sourceDocumentType || "");
  if (source?.documentName === "Actor" && !source.pack) profile.actorId = String(source.id || profile.actorId || "");
  return profile;
}

async function atQiEnsureOverview(journal) {
  if (!journal || (journal.pages?.size ?? 0) > 0) return;
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: "Overview",
    type: "text",
    text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
    sort: 100000
  }]);
  if (created?.[0]) await journal.setFlag(ATQI_MODULE_ID, "worldSyncPage", created[0].id);
}

function atQiOwnership(requesterId) {
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
  const requester = game.users?.get(String(requesterId || ""));
  if (requester && !requester.isGM) ownership[requester.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return ownership;
}

async function atQiCopyJournal(source, targetFolder, category, requesterId) {
  const pageData = [...(source.pages?.contents ?? [])].map((page) => {
    const data = foundry.utils.deepClone(page.toObject?.() || {});
    delete data._id;
    delete data._stats;
    return data;
  });
  const previous = source.getFlag?.(ATQI_MODULE_ID, "worldProfile") || {};
  const profile = atQiWorldProfile(source, category, previous);
  const flags = foundry.utils.deepClone(source.flags || {});
  flags[ATQI_MODULE_ID] = {
    ...(flags[ATQI_MODULE_ID] || {}),
    type: "world",
    worldProfile: profile,
    [ATQI_SOURCE_UUID]: source.uuid,
    [ATQI_SOURCE_TYPE]: source.documentName
  };
  const journal = await JournalEntry.create({
    name: source.name,
    folder: targetFolder.id,
    ownership: atQiOwnership(requesterId),
    flags,
    pages: pageData
  });
  await atQiEnsureOverview(journal);
  return journal;
}

async function atQiAdoptJournal(source, targetFolder, category) {
  const previous = source.getFlag?.(ATQI_MODULE_ID, "worldProfile") || {};
  const profile = atQiWorldProfile(source, category, previous);
  await source.update({
    folder: targetFolder.id,
    [`flags.${ATQI_MODULE_ID}.type`]: "world",
    [`flags.${ATQI_MODULE_ID}.worldProfile`]: profile,
    [`flags.${ATQI_MODULE_ID}.${ATQI_SOURCE_UUID}`]: source.uuid,
    [`flags.${ATQI_MODULE_ID}.${ATQI_SOURCE_TYPE}`]: source.documentName
  });
  await atQiEnsureOverview(source);
  return source;
}

async function atQiCreateLinkedEntry(source, targetFolder, category, requesterId) {
  const profile = atQiWorldProfile(source, category, {});
  const flags = {
    type: "world",
    worldProfile: profile,
    [ATQI_SOURCE_UUID]: source.uuid,
    [ATQI_SOURCE_TYPE]: source.documentName
  };
  const journal = await JournalEntry.create({
    name: source.name || source.documentName || "Imported World entry",
    folder: targetFolder.id,
    ownership: atQiOwnership(requesterId),
    flags: { [ATQI_MODULE_ID]: flags }
  });
  await atQiEnsureOverview(journal);
  return journal;
}

async function atQiExecute(payload, requesterId = "") {
  if (!game.user?.isGM) throw new Error("Quick Import must execute on a GM client.");
  const requester = game.users?.get(String(requesterId || ""));
  if (!requester || !atQiCanImport(requester.id)) throw new Error("You are not a World Editor.");

  const parent = game.folders?.get(String(payload?.parentId || ""));
  if (!parent || !atQiFolderBelongs(parent)) throw new Error("That drop target is outside Tome World.");

  const uuid = String(payload?.sourceUuid || "").trim();
  const requestedType = atQiNormalizeType(payload?.sourceType);
  if (!uuid || !requestedType) throw new Error("Unsupported Foundry drag payload.");

  const source = await fromUuid(uuid);
  if (!source) throw new Error("The dragged Foundry document could not be resolved.");
  const type = atQiNormalizeType(source.documentName || requestedType);
  if (!type) throw new Error(`${source.documentName || requestedType} is not supported by World Quick Import yet.`);

  const explicit = String(payload?.category || "");
  const inferred = atQiCanonicalCategory(parent);
  const category = ATQI_CATEGORY_FOLDER[explicit] ? explicit : (inferred || atQiDefaultCategory(type));
  const root = atQiWorldRootFor(parent);
  let targetFolder = parent;
  if (payload?.forceCanonical === true || root?.id === parent.id) targetFolder = await atQiEnsureCategoryFolder(root || parent, category);

  if (type !== "JournalEntry") {
    const existing = atQiExistingBySource(source.uuid);
    if (existing) {
      const profile = atQiWorldProfile(source, category, existing.getFlag?.(ATQI_MODULE_ID, "worldProfile") || {});
      await existing.update({
        folder: targetFolder.id,
        [`flags.${ATQI_MODULE_ID}.worldProfile`]: profile,
        [`flags.${ATQI_MODULE_ID}.${ATQI_SOURCE_UUID}`]: source.uuid,
        [`flags.${ATQI_MODULE_ID}.${ATQI_SOURCE_TYPE}`]: type
      });
      return { id: existing.id, name: existing.name, target: targetFolder.name, mode: "moved", sourceType: type };
    }
  }

  let journal = null;
  let mode = "created";
  if (type === "JournalEntry") {
    const worldJournal = game.journal?.get(String(source.id || ""));
    if (worldJournal === source && !source.pack) {
      journal = await atQiAdoptJournal(source, targetFolder, category);
      mode = "adopted";
    } else {
      journal = await atQiCopyJournal(source, targetFolder, category, requester.id);
      mode = "copied";
    }
  } else {
    journal = await atQiCreateLinkedEntry(source, targetFolder, category, requester.id);
  }

  return { id: journal.id, name: journal.name, target: targetFolder.name, mode, sourceType: type };
}

async function atQiHandleSocket(message) {
  if (!message || message.channel !== "quickImport") return;

  if (message.type === "response" && String(message.targetUserId || "") === String(game.user?.id || "")) {
    const pending = ATQI_PENDING.get(String(message.requestId || ""));
    if (!pending) return;
    window.clearTimeout(pending.timer);
    ATQI_PENDING.delete(String(message.requestId || ""));
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(String(message.error || "Quick Import failed.")));
    return;
  }

  if (message.type !== "request" || !game.user?.isGM || String(message.targetGmId || "") !== String(game.user.id)) return;
  const requestId = String(message.requestId || "");
  const requesterId = String(message.requesterId || "");
  try {
    const result = await atQiExecute(message.payload || {}, requesterId);
    game.socket.emit(ATQI_SOCKET, { channel: "quickImport", type: "response", requestId, targetUserId: requesterId, ok: true, result });
  } catch (error) {
    console.error("Adventurer's Tome | Quick Import broker failed", error);
    game.socket.emit(ATQI_SOCKET, { channel: "quickImport", type: "response", requestId, targetUserId: requesterId, ok: false, error: error?.message || "Quick Import failed." });
  }
}

function atQiScheduleEnhance(delay = 60) {
  window.clearTimeout(atQiEnhanceTimer);
  atQiEnhanceTimer = window.setTimeout(atQiEnhance, delay);
}

function atQiEnhance() {
  const root = document.querySelector(ATQI_ROOT);
  if (!root) return;
  for (const group of root.querySelectorAll(".at-world-category")) {
    const category = atQiCategoryFromNode(group);
    if (category) group.dataset.atQiCategory = category;
  }

  const detail = root.querySelector(".at-world-profile-page");
  if (!detail) return;
  const sourceButton = detail.querySelector('[data-action="openJournal"][data-journal-id]');
  const journal = game.journal?.get(String(sourceButton?.dataset?.journalId || ""));
  if (!journal) return;
  const profile = journal.getFlag?.(ATQI_MODULE_ID, "worldProfile") || {};
  const uuid = String(journal.getFlag?.(ATQI_MODULE_ID, ATQI_SOURCE_UUID) || profile?.sourceUuid || "");
  const type = atQiNormalizeType(journal.getFlag?.(ATQI_MODULE_ID, ATQI_SOURCE_TYPE) || profile?.sourceDocumentType);
  if (!uuid || !type || type === "JournalEntry") return;
  const toolbar = detail.querySelector(".at-profile-toolbar-actions");
  if (!toolbar || toolbar.querySelector("[data-at-qi-open-source]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-secondary at-qi-open-source";
  button.dataset.atQiOpenSource = uuid;
  button.dataset.atQiSourceType = type;
  button.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Open ${atQiEscape(type)}`;
  toolbar.insertBefore(button, toolbar.firstChild);
}

async function atQiOpenSource(button) {
  const uuid = String(button?.dataset?.atQiOpenSource || "");
  if (!uuid) return;
  try {
    const document = await fromUuid(uuid);
    if (!document) throw new Error("Source document no longer exists.");
    if (document.documentName === "Scene" && typeof document.view === "function") await document.view();
    else if (document.sheet?.render) document.sheet.render(true);
    else throw new Error("That source document has no openable sheet.");
  } catch (error) {
    ui.notifications.warn(`Adventurer's Tome: ${error?.message || "Could not open source document."}`);
  }
}

async function atQiDrop(event, drag, target) {
  if (!atQiCanImport()) return;
  if (target.blocked) {
    ui.notifications.warn("Adventurer's Tome: Select the World source tree you want to use, or drop directly on an Explorer folder.");
    return;
  }

  // Explorer v2 already owns external JournalEntry -> folder adoption. Avoid double-processing it.
  if (drag.type === "JournalEntry" && target.kind === "folder") return;

  ui.notifications.info(`Adventurer's Tome: Importing ${atQiTypeLabel(drag.type)}…`);
  try {
    const result = await atQiRequest({
      sourceUuid: drag.uuid,
      sourceType: drag.type,
      parentId: target.parentId,
      category: target.category,
      forceCanonical: target.forceCanonical === true
    });
    const verb = result?.mode === "moved" ? "Moved existing" : result?.mode === "adopted" ? "Added" : "Imported";
    ui.notifications.info(`Adventurer's Tome: ${verb} ${result?.name || atQiTypeLabel(drag.type)} → ${result?.target || target.label}.`);
    window.setTimeout(() => {
      try { game.modules.get(ATQI_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
      atQiScheduleEnhance(120);
    }, 120);
  } catch (error) {
    console.error("Adventurer's Tome | World Quick Import failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Quick Import failed."}`);
  }
}

Hooks.once("ready", () => {
  game.socket.on(ATQI_SOCKET, (message) => void atQiHandleSocket(message));

  document.addEventListener("dragover", (event) => {
    if (!atQiCanImport()) return;
    const drag = atQiDragData(event);
    if (!drag) return;
    const target = atQiResolveTarget(event, drag);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = target.blocked ? "none" : (drag.type === "JournalEntry" ? "move" : "copy");
    atQiClearDropUi();
    target.node.classList.add(target.blocked ? "at-qi-drop-blocked" : "at-qi-drop-target");
    target.node.dataset.atQiHint = target.blocked
      ? target.label
      : `+ Add ${atQiTypeLabel(drag.type)} to ${target.label}`;
  }, true);

  document.addEventListener("dragleave", (event) => {
    const node = event.target.closest?.(".at-qi-drop-target, .at-qi-drop-blocked");
    if (node && !node.contains(event.relatedTarget)) {
      node.classList.remove("at-qi-drop-target", "at-qi-drop-blocked");
      delete node.dataset.atQiHint;
    }
  }, true);

  document.addEventListener("drop", (event) => {
    if (!atQiCanImport()) return;
    const drag = atQiDragData(event);
    if (!drag) return;
    const target = atQiResolveTarget(event, drag);
    if (!target) return;
    if (drag.type === "JournalEntry" && target.kind === "folder") return;
    event.preventDefault();
    event.stopPropagation();
    atQiClearDropUi();
    void atQiDrop(event, drag, target);
  }, true);

  document.addEventListener("dragend", atQiClearDropUi, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-at-qi-open-source]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void atQiOpenSource(button);
  }, true);

  atQiScheduleEnhance(50);
});

for (const hookName of ["renderApplication", "renderApplicationV2", "createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atQiScheduleEnhance(80));
}
