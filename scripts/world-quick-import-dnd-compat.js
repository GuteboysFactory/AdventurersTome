const ATQD_MODULE_ID = "adventurers-tome";
const ATQD_ROOT = "#adventurers-tome-app";
const ATQD_SOCKET = `module.${ATQD_MODULE_ID}`;
const ATQD_DOC_CHANNEL = "quickImport";
const ATQD_FOLDER_CHANNEL = "folderQuickImport";
const ATQD_DOCUMENT_TYPES = new Set(["Actor", "Item", "Scene"]);
const ATQD_CATEGORY = Object.freeze({ Actor: "npc", Item: "item", Scene: "location" });
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

function atQdRequest(channel, payload, timeout = 15000) {
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
