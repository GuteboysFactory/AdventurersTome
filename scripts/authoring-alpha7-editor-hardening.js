const ATA7_MODULE_ID = "adventurers-tome";
const ATA7_ROOT = "#adventurers-tome-app";
const ATA7_SOCKET = `module.${ATA7_MODULE_ID}`;
const ATA7_SECTION_EDITORS = "sectionEditors";
const ATA7_ENTRY_EDITORS = "entryEditors";
const ATA7_MANAGED_OWNERS = "managedEditorOwners";
const ATA7_WORLD_PROFILE = "worldProfile";
const ATA7_WORLD_SYNC_PAGE = "worldSyncPage";
const ATA7_FOLDER_MIME = "text/x-adventurers-tome-editor-folder";
const ATA7_SECTIONS = Object.freeze({
  world: { label: "World", page: ".at-world-page", open: "openWorldProfile", icon: "fa-earth-europe" },
  quests: { label: "Quests", page: ".at-quests-page", open: "openQuestDetail", icon: "fa-diamond" },
  sessions: { label: "Sessions", page: ".at-sessions-page", open: "selectSession", icon: "fa-book-open" }
});
const ATA7_WORLD_CATEGORIES = Object.freeze({ npc: "NPCs", location: "Locations", faction: "Factions", item: "Items", lore: "Lore" });
const ATA7_PENDING = new Map();
const ATA7_SYNCING = new Set();
let atA7EnhanceTimer = null;
let atA7SyncTimer = null;
let atA7FolderDrag = null;

function atA7Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA7HtmlFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function atA7ParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atA7Ancestors(folder) {
  const result = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = game.folders?.get(atA7ParentId(current)) || null;
  }
  return result;
}

function atA7Path(folder) {
  return atA7Ancestors(folder).map((item) => item.name).join(" › ");
}

function atA7RoleStoreRoot() {
  const candidates = [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === "JournalEntry" && /adventurer'?s tome/i.test(String(folder.name || "")));
  return candidates.find((folder) => {
    const raw = folder.getFlag?.(ATA7_MODULE_ID, ATA7_SECTION_EDITORS);
    return raw && typeof raw === "object" && !Array.isArray(raw);
  }) || candidates.find((folder) => /^adventurer'?s tome$/i.test(String(folder.name || "")) && !atA7ParentId(folder)) || candidates[0] || null;
}

function atA7RoleMap() {
  const raw = atA7RoleStoreRoot()?.getFlag?.(ATA7_MODULE_ID, ATA7_SECTION_EDITORS);
  const map = { world: [], quests: [], sessions: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const section of Object.keys(map)) map[section] = Array.isArray(raw[section]) ? [...new Set(raw[section].map(String))] : [];
  }
  return map;
}

function atA7EntryEditors(journal) {
  const raw = journal?.getFlag?.(ATA7_MODULE_ID, ATA7_ENTRY_EDITORS);
  return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
}

function atA7ManagedOwners(journal) {
  const raw = journal?.getFlag?.(ATA7_MODULE_ID, ATA7_MANAGED_OWNERS);
  return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
}

function atA7SectionRoots(section) {
  const label = ATA7_SECTIONS[section]?.label;
  if (!label) return [];
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => {
      if (folder.type !== "JournalEntry" || folder.name !== label) return false;
      if (String(folder.getFlag?.(ATA7_MODULE_ID, "section") || "") === section) return true;
      return atA7Ancestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
    })
    .sort((a, b) => atA7Path(a).localeCompare(atA7Path(b)));
}

function atA7DescendantFolderIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atA7ParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atA7FolderBelongs(section, folder) {
  if (!folder || folder.type !== "JournalEntry") return false;
  return atA7SectionRoots(section).some((root) => atA7DescendantFolderIds(root).has(folder.id));
}

function atA7IsSectionRoot(section, folder) {
  return atA7SectionRoots(section).some((root) => root.id === folder?.id);
}

function atA7SectionFromFolder(folder) {
  if (!folder) return "";
  for (const section of Object.keys(ATA7_SECTIONS)) if (atA7FolderBelongs(section, folder)) return section;
  return "";
}

function atA7SectionFromJournal(journal) {
  if (!journal) return "";
  const type = String(journal.getFlag?.(ATA7_MODULE_ID, "type") || "").toLowerCase();
  if (type === "world") return "world";
  if (type === "quests" || type === "quest") return "quests";
  if (type === "sessions" || type === "session") return "sessions";
  return atA7SectionFromFolder(journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? "")));
}

function atA7CanManageSection(section, userId = game.user?.id) {
  const user = game.users?.get(String(userId || ""));
  if (user?.isGM || (game.user?.isGM && String(userId) === String(game.user.id))) return true;
  return Boolean(ATA7_SECTIONS[section] && atA7RoleMap()[section]?.includes(String(userId || "")));
}

function atA7CanManageJournal(journal, userId = game.user?.id) {
  if (!journal || !userId) return false;
  const user = game.users?.get(String(userId || ""));
  if (user?.isGM || (game.user?.isGM && String(userId) === String(game.user.id))) return true;
  const section = atA7SectionFromJournal(journal);
  return Boolean((section && atA7CanManageSection(section, userId)) || atA7EntryEditors(journal).includes(String(userId)));
}

function atA7CanDeleteJournal(journal, userId = game.user?.id) {
  const section = atA7SectionFromJournal(journal);
  return Boolean(section && atA7CanManageSection(section, userId));
}

function atA7OwnerLevel() {
  return Number(CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
}

function atA7DesiredEditors(journal) {
  const section = atA7SectionFromJournal(journal);
  return new Set([...(section ? atA7RoleMap()[section] || [] : []), ...atA7EntryEditors(journal)].map(String));
}

async function atA7ReconcileJournal(journal) {
  if (!game.user?.isGM || !journal || ATA7_SYNCING.has(journal.id)) return;
  const section = atA7SectionFromJournal(journal);
  if (!section) return;
  ATA7_SYNCING.add(journal.id);
  try {
    const desired = atA7DesiredEditors(journal);
    const managed = new Set(atA7ManagedOwners(journal));
    const ownership = foundry.utils.deepClone(journal.ownership || { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 });
    let ownershipChanged = false;

    for (const userId of desired) {
      const current = Number(ownership[userId] ?? 0);
      if (current < atA7OwnerLevel()) {
        ownership[userId] = atA7OwnerLevel();
        managed.add(userId);
        ownershipChanged = true;
      }
    }

    for (const userId of [...managed]) {
      if (desired.has(userId)) continue;
      delete ownership[userId];
      managed.delete(userId);
      ownershipChanged = true;
    }

    const nextManaged = [...managed].sort();
    const oldManaged = atA7ManagedOwners(journal).sort();
    if (ownershipChanged) await journal.update({ ownership });
    if (JSON.stringify(nextManaged) !== JSON.stringify(oldManaged)) await journal.setFlag(ATA7_MODULE_ID, ATA7_MANAGED_OWNERS, nextManaged);
  } catch (error) {
    console.warn(`Adventurer's Tome | Could not reconcile delegated ownership for ${journal.name}`, error);
  } finally {
    window.setTimeout(() => ATA7_SYNCING.delete(journal.id), 80);
  }
}

function atA7ScheduleReconcileAll(delay = 160) {
  if (!game.user?.isGM) return;
  window.clearTimeout(atA7SyncTimer);
  atA7SyncTimer = window.setTimeout(async () => {
    atA7SyncTimer = null;
    for (const journal of game.journal?.contents ?? []) {
      if (atA7SectionFromJournal(journal)) await atA7ReconcileJournal(journal);
    }
  }, delay);
}

function atA7LeaderGM() {
  return [...(game.users?.contents ?? [])]
    .filter((user) => user.isGM && user.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function atA7Request(payload) {
  if (game.user?.isGM) return atA7Execute(payload, game.user.id);
  const gm = atA7LeaderGM();
  if (!gm) return Promise.reject(new Error("A GM must be online for delegated structure changes."));
  const requestId = foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ATA7_PENDING.delete(requestId);
      reject(new Error("The GM did not answer the Tome Editor request."));
    }, 12000);
    ATA7_PENDING.set(requestId, { resolve, reject, timer });
    game.socket.emit(ATA7_SOCKET, {
      channel: "alpha7",
      type: "request",
      requestId,
      requesterId: game.user.id,
      targetGmId: gm.id,
      payload
    });
  });
}

function atA7CleanName(value) {
  const name = String(value || "").trim();
  if (!name) throw new Error("A name is required.");
  if (name.length > 180) throw new Error("That name is too long.");
  return name;
}

function atA7CanonicalWorldCategory(folder) {
  let current = folder;
  while (current) {
    for (const [category, name] of Object.entries(ATA7_WORLD_CATEGORIES)) if (current.name === name) return category;
    current = game.folders?.get(atA7ParentId(current)) || null;
  }
  return null;
}

function atA7RootForFolder(section, folder) {
  return atA7SectionRoots(section).find((root) => atA7DescendantFolderIds(root).has(folder?.id)) || null;
}

async function atA7EnsureWorldCategoryFolder(root, category) {
  const name = ATA7_WORLD_CATEGORIES[category] || "Lore";
  const found = [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === name && atA7ParentId(folder) === root.id);
  return found || Folder.create({ name, type: "JournalEntry", folder: root.id });
}

async function atA7CreateEntryAsGM(payload, requesterId) {
  const section = String(payload.section || "");
  if (!atA7CanManageSection(section, requesterId)) throw new Error("You are not a Tome Editor for this section.");
  const parent = game.folders?.get(String(payload.parentId || ""));
  if (!parent || !atA7FolderBelongs(section, parent)) throw new Error("The selected folder is outside this Tome section.");

  let name = atA7CleanName(payload.name);
  let targetFolder = parent;
  const flags = {};
  if (section === "world") {
    const inferred = atA7CanonicalWorldCategory(parent);
    const category = inferred || (ATA7_WORLD_CATEGORIES[String(payload.category || "")] ? String(payload.category) : "lore");
    if (atA7IsSectionRoot(section, parent)) targetFolder = await atA7EnsureWorldCategoryFolder(parent, category);
    flags.type = "world";
    flags.worldProfile = { category, subtitle: "", summary: "", body: "", heroImage: "", facts: [], summaryJournalBacked: true };
  } else if (section === "quests") {
    flags.type = "quests";
    flags.status = ["active", "dormant", "completed", "failed"].includes(String(payload.status || "")) ? String(payload.status) : "active";
  } else if (section === "sessions") {
    flags.type = "sessions";
    const number = Number(payload.sessionNumber || 0);
    if (number > 0 && !new RegExp(`^session\\s+${number}\\b`, "i").test(name)) name = `Session ${number} — ${name}`;
  } else throw new Error("Unknown Tome section.");

  const sectionEditors = [...new Set((atA7RoleMap()[section] || []).map(String))];
  flags[ATA7_MANAGED_OWNERS] = [...sectionEditors];
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
  for (const userId of sectionEditors) ownership[userId] = atA7OwnerLevel();

  const journal = await JournalEntry.create({ name, folder: targetFolder.id, ownership, flags: { [ATA7_MODULE_ID]: flags } });
  const pageName = section === "sessions" ? "Chronicle" : "Overview";
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: pageName,
    type: "text",
    text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: atA7HtmlFormat() },
    sort: 100000
  }]);
  if (section === "world" && created?.[0]) await journal.setFlag(ATA7_MODULE_ID, ATA7_WORLD_SYNC_PAGE, created[0].id);
  return { id: journal.id, name: journal.name, kind: "entry" };
}

async function atA7Execute(payload, requesterId = "") {
  if (!game.user?.isGM) throw new Error("The Tome Editor broker must execute on a GM client.");
  const requester = game.users?.get(String(requesterId || ""));
  if (!requester) throw new Error("Unknown requesting user.");
  const action = String(payload?.action || "");
  const section = String(payload?.section || "");

  if (action === "createEntry") return atA7CreateEntryAsGM(payload, requester.id);

  if (["createFolder", "renameFolder", "deleteFolder", "moveFolder"].includes(action)) {
    if (!atA7CanManageSection(section, requester.id)) throw new Error("You are not a Tome Editor for this section.");
  }

  if (action === "createFolder") {
    const parent = game.folders?.get(String(payload.parentId || ""));
    if (!parent || !atA7FolderBelongs(section, parent)) throw new Error("The selected parent is outside this Tome section.");
    const folder = await Folder.create({ name: atA7CleanName(payload.name), type: "JournalEntry", folder: parent.id });
    return { id: folder.id, name: folder.name, parentId: parent.id };
  }

  if (action === "renameFolder") {
    const folder = game.folders?.get(String(payload.folderId || ""));
    if (!folder || !atA7FolderBelongs(section, folder)) throw new Error("That folder is outside this Tome section.");
    if (atA7IsSectionRoot(section, folder)) throw new Error("Section root folders are protected.");
    await folder.update({ name: atA7CleanName(payload.name) });
    return { id: folder.id, name: folder.name };
  }

  if (action === "deleteFolder") {
    const folder = game.folders?.get(String(payload.folderId || ""));
    if (!folder || !atA7FolderBelongs(section, folder)) throw new Error("That folder is outside this Tome section.");
    if (atA7IsSectionRoot(section, folder)) throw new Error("Section root folders are protected.");
    const childFolders = [...(game.folders?.contents ?? [])].filter((item) => item.type === "JournalEntry" && atA7ParentId(item) === folder.id);
    const journals = [...(game.journal?.contents ?? [])].filter((journal) => String(journal.folder?.id ?? journal.folder ?? "") === folder.id);
    if (childFolders.length || journals.length) throw new Error("Only empty folders can be deleted in Tome.");
    const parentId = atA7ParentId(folder);
    const name = folder.name;
    await folder.delete();
    return { id: folder.id, name, parentId };
  }

  if (action === "moveFolder") {
    const folder = game.folders?.get(String(payload.folderId || ""));
    const target = game.folders?.get(String(payload.targetFolderId || ""));
    if (!folder || !target || !atA7FolderBelongs(section, folder) || !atA7FolderBelongs(section, target)) throw new Error("Both folders must belong to this Tome section.");
    if (atA7IsSectionRoot(section, folder)) throw new Error("Section root folders cannot be moved.");
    if (folder.id === target.id || atA7DescendantFolderIds(folder).has(target.id)) throw new Error("A folder cannot be moved into itself or one of its children.");
    await folder.update({ folder: target.id });
    return { id: folder.id, name: folder.name, targetFolderId: target.id };
  }

  if (["renameEntry", "deleteEntry"].includes(action)) {
    const journal = game.journal?.get(String(payload.journalId || ""));
    if (!journal) throw new Error("That Tome entry no longer exists.");
    const journalSection = atA7SectionFromJournal(journal);
    if (!journalSection || (section && journalSection !== section)) throw new Error("That entry is outside the requested Tome section.");
    if (action === "renameEntry") {
      if (!atA7CanManageJournal(journal, requester.id)) throw new Error("You are not an Editor for that entry.");
      await journal.update({ name: atA7CleanName(payload.name) });
      return { id: journal.id, name: journal.name };
    }
    if (!atA7CanDeleteJournal(journal, requester.id)) throw new Error("Only a Section Editor or GM can delete a Tome entry.");
    const name = journal.name;
    await journal.delete();
    return { id: journal.id, name };
  }

  throw new Error("Unknown Tome Editor action.");
}

async function atA7HandleSocket(message) {
  if (!message || message.channel !== "alpha7") return;
  if (message.type === "request" && game.user?.isGM && String(message.targetGmId) === String(game.user.id)) {
    try {
      const result = await atA7Execute(message.payload || {}, String(message.requesterId || ""));
      game.socket.emit(ATA7_SOCKET, { channel: "alpha7", type: "response", requestId: message.requestId, requesterId: message.requesterId, ok: true, result });
    } catch (error) {
      console.error("Adventurer's Tome | Delegated Editor request failed", error);
      game.socket.emit(ATA7_SOCKET, { channel: "alpha7", type: "response", requestId: message.requestId, requesterId: message.requesterId, ok: false, error: error?.message || "Editor request failed" });
    }
    return;
  }
  if (message.type === "response" && String(message.requesterId) === String(game.user?.id)) {
    const pending = ATA7_PENDING.get(String(message.requestId || ""));
    if (!pending) return;
    window.clearTimeout(pending.timer);
    ATA7_PENDING.delete(String(message.requestId));
    if (message.ok) pending.resolve(message.result || {});
    else pending.reject(new Error(message.error || "Editor request failed"));
  }
}

function atA7StateKey(section, key) {
  return `adventurers-tome.campaign-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${key}`;
}

function atA7SelectedFolder(section) {
  try {
    const id = String(localStorage.getItem(atA7StateKey(section, "selected")) || "");
    return id ? game.folders?.get(id) || null : null;
  } catch (_err) { return null; }
}

function atA7SetSelectedFolder(section, folderId) {
  try { localStorage.setItem(atA7StateKey(section, "selected"), String(folderId || "")); } catch (_err) {}
}

function atA7SectionPage() {
  const root = document.querySelector(ATA7_ROOT);
  if (!root) return null;
  for (const [section, config] of Object.entries(ATA7_SECTIONS)) {
    const page = root.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atA7ImpliedParent(section) {
  const selected = atA7SelectedFolder(section);
  if (selected && atA7FolderBelongs(section, selected)) return selected;
  const roots = atA7SectionRoots(section);
  return roots.length === 1 ? roots[0] : null;
}

function atA7Prompt({ title, fields = "", body = "", confirmLabel = "Save", confirmIcon = "fa-check", danger = false }) {
  return new Promise((resolve) => {
    const root = document.querySelector(ATA7_ROOT);
    if (!root) return resolve(null);
    const overlay = document.createElement("div");
    overlay.className = "at-cw-modal-overlay at-a7-overlay";
    overlay.innerHTML = `<form class="at-cw-modal at-a7-modal ${danger ? "is-danger" : ""}"><header><div><span class="at-kicker">Delegated Tome Authoring</span><h2>${atA7Escape(title)}</h2></div><button type="button" data-at-a7-close><i class="fa-solid fa-xmark"></i></button></header>${fields}${body ? `<div class="at-a7-modal-body">${body}</div>` : ""}<footer><button type="button" class="at-secondary" data-at-a7-close>Cancel</button><button type="submit" class="${danger ? "at-a7-danger" : "at-primary"}"><i class="fa-solid ${confirmIcon}"></i> ${atA7Escape(confirmLabel)}</button></footer></form>`;
    root.append(overlay);
    const finish = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-at-a7-close]")) finish(null);
    });
    overlay.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      finish(new FormData(event.currentTarget));
    });
    const input = overlay.querySelector("input, select");
    input?.focus();
    if (input?.tagName === "INPUT") input.select?.();
  });
}

async function atA7CreateFolder(section) {
  const parent = atA7ImpliedParent(section);
  if (!parent) return ui.notifications.warn("Adventurer's Tome: Select a source/folder first.");
  const data = await atA7Prompt({
    title: "New Folder",
    fields: '<label><span>Name</span><input name="name" required autocomplete="off"></label>',
    body: `<p>Creates a real Foundry Journal folder inside <strong>${atA7Escape(atA7Path(parent))}</strong> through the GM broker.</p>`,
    confirmLabel: "Create Folder",
    confirmIcon: "fa-folder-plus"
  });
  if (!data) return;
  try {
    const result = await atA7Request({ action: "createFolder", section, parentId: parent.id, name: String(data.get("name") || "") });
    atA7SetSelectedFolder(section, result.id);
    ui.notifications.info(`Adventurer's Tome: Created folder ${result.name}.`);
    atA7ScheduleEnhance(180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create that folder."}`);
  }
}

async function atA7RenameFolder(section) {
  const folder = atA7SelectedFolder(section);
  if (!folder || !atA7FolderBelongs(section, folder) || atA7IsSectionRoot(section, folder)) return;
  const data = await atA7Prompt({
    title: "Rename Folder",
    fields: `<label><span>Name</span><input name="name" required autocomplete="off" value="${atA7Escape(folder.name)}"></label>`,
    body: `<p>Renames <strong>${atA7Escape(atA7Path(folder))}</strong>.</p>`,
    confirmLabel: "Rename",
    confirmIcon: "fa-pen"
  });
  if (!data) return;
  try {
    const result = await atA7Request({ action: "renameFolder", section, folderId: folder.id, name: String(data.get("name") || "") });
    ui.notifications.info(`Adventurer's Tome: Renamed folder to ${result.name}.`);
    atA7ScheduleEnhance(180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not rename that folder."}`);
  }
}

async function atA7DeleteFolder(section) {
  const folder = atA7SelectedFolder(section);
  if (!folder || !atA7FolderBelongs(section, folder) || atA7IsSectionRoot(section, folder)) return;
  const data = await atA7Prompt({
    title: "Delete Empty Folder",
    body: `<p>Delete <strong>${atA7Escape(atA7Path(folder))}</strong>?</p><p>The GM broker refuses this action if the folder contains Journals or subfolders.</p>`,
    confirmLabel: "Delete Folder",
    confirmIcon: "fa-trash",
    danger: true
  });
  if (!data) return;
  try {
    const result = await atA7Request({ action: "deleteFolder", section, folderId: folder.id });
    atA7SetSelectedFolder(section, result.parentId || "");
    ui.notifications.info(`Adventurer's Tome: Deleted empty folder ${result.name}.`);
    atA7ScheduleEnhance(180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not delete that folder."}`);
  }
}

async function atA7CreateEntry(section) {
  const parent = atA7ImpliedParent(section);
  if (!parent) return ui.notifications.warn("Adventurer's Tome: Select a source/folder first.");
  const inferred = section === "world" ? atA7CanonicalWorldCategory(parent) : null;
  const worldField = section === "world" && !inferred ? `<label><span>World type</span><select name="category">${Object.entries(ATA7_WORLD_CATEGORIES).map(([id, label]) => `<option value="${id}">${atA7Escape(label.replace(/s$/, ""))}</option>`).join("")}</select></label>` : "";
  const questField = section === "quests" ? '<label><span>Quest status</span><select name="status"><option value="active">Active</option><option value="dormant">Dormant</option><option value="completed">Completed</option><option value="failed">Failed</option></select></label>' : "";
  const sessionField = section === "sessions" ? '<label><span>Session number <small>optional</small></span><input name="sessionNumber" type="number" min="1" step="1"></label>' : "";
  const data = await atA7Prompt({
    title: `New ${section === "world" ? "World Entry" : section === "quests" ? "Quest" : "Session"}`,
    fields: `<label><span>Name</span><input name="name" required autocomplete="off"></label>${worldField}${questField}${sessionField}`,
    body: `<p>Creates real Journal data inside <strong>${atA7Escape(atA7Path(parent))}</strong>. The GM broker grants only the ownership Tome needs.</p>`,
    confirmLabel: "Create Entry",
    confirmIcon: "fa-file-circle-plus"
  });
  if (!data) return;
  try {
    const result = await atA7Request({
      action: "createEntry",
      section,
      parentId: parent.id,
      name: String(data.get("name") || ""),
      category: inferred || String(data.get("category") || "lore"),
      status: String(data.get("status") || "active"),
      sessionNumber: Number(data.get("sessionNumber") || 0)
    });
    ui.notifications.info(`Adventurer's Tome: Created ${result.name}.`);
    try { await game.modules.get(ATA7_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
    window.setTimeout(() => {
      document.querySelector(ATA7_ROOT)?.querySelector(`[data-action="${ATA7_SECTIONS[section].open}"][data-journal-id="${CSS.escape(result.id)}"]`)?.click();
      atA7ScheduleEnhance(80);
    }, 180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create that entry."}`);
  }
}

function atA7OpenInTome(section, journalId) {
  document.querySelector(ATA7_ROOT)?.querySelector(`[data-action="${ATA7_SECTIONS[section]?.open}"][data-journal-id="${CSS.escape(journalId)}"]`)?.click();
}

async function atA7DeleteEntry(journal) {
  const section = atA7SectionFromJournal(journal);
  if (!atA7CanDeleteJournal(journal)) return ui.notifications.warn("Adventurer's Tome: Only a Section Editor or GM can delete this entry.");
  const data = await atA7Prompt({
    title: "Delete Tome Entry",
    body: `<p>Delete <strong>${atA7Escape(journal.name)}</strong>?</p><p>This permanently deletes the real Foundry Journal Entry and all of its pages. Entry-only Editors cannot perform this action.</p>`,
    confirmLabel: "Delete Entry",
    confirmIcon: "fa-trash",
    danger: true
  });
  if (!data) return;
  try {
    const result = await atA7Request({ action: "deleteEntry", section, journalId: journal.id });
    ui.notifications.info(`Adventurer's Tome: Deleted ${result.name}.`);
    try { await game.modules.get(ATA7_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
    atA7ScheduleEnhance(180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not delete that entry."}`);
  }
}

async function atA7ManageEntry(journal) {
  if (!journal || !atA7CanManageJournal(journal)) return;
  const section = atA7SectionFromJournal(journal);
  const canDelete = atA7CanDeleteJournal(journal);
  const data = await atA7Prompt({
    title: journal.name,
    fields: `<label><span>Name</span><input name="name" required autocomplete="off" value="${atA7Escape(journal.name)}"></label>`,
    body: `<div class="at-a7-entry-meta"><span>${atA7CanManageSection(section) ? `${ATA7_SECTIONS[section]?.label || "Tome"} Section Editor` : "Entry Editor"}</span><strong>${atA7Escape(journal.folder ? atA7Path(journal.folder) : "Unfiled")}</strong></div><div class="at-a7-entry-actions"><button type="button" class="at-secondary" data-at-a7-open-tome="${atA7Escape(journal.id)}"><i class="fa-solid fa-book-open"></i> Open in Tome</button><button type="button" class="at-secondary" data-at-a7-open-source="${atA7Escape(journal.id)}"><i class="fa-solid fa-up-right-from-square"></i> Open Foundry Source</button>${canDelete ? `<button type="button" class="at-a7-danger" data-at-a7-delete-entry="${atA7Escape(journal.id)}"><i class="fa-solid fa-trash"></i> Delete Entry</button>` : ""}</div>`,
    confirmLabel: "Save Name",
    confirmIcon: "fa-floppy-disk"
  });
  if (!data) return;
  const name = String(data.get("name") || "").trim();
  if (!name || name === journal.name) return;
  try {
    const result = await atA7Request({ action: "renameEntry", section, journalId: journal.id, name });
    ui.notifications.info(`Adventurer's Tome: Renamed entry to ${result.name}.`);
    try { await game.modules.get(ATA7_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
    atA7ScheduleEnhance(180);
  } catch (error) {
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not rename that entry."}`);
  }
}

function atA7EnhanceEditorTools(state, explorer) {
  if (game.user?.isGM || !atA7CanManageSection(state.section)) return;
  let tools = explorer.querySelector(":scope > .at-a7-editor-tools");
  if (!tools) {
    tools = document.createElement("div");
    tools.className = "at-a7-editor-tools";
    tools.innerHTML = `<div class="at-a7-editor-tools-copy"><span><i class="fa-solid fa-user-pen"></i> Tome Editor</span><strong data-at-a7-folder-label>Select a folder</strong></div><div class="at-a7-editor-tools-actions"><button type="button" data-at-a7-new-entry title="New entry"><i class="fa-solid fa-file-circle-plus"></i></button><button type="button" data-at-a7-new-folder title="New subfolder"><i class="fa-solid fa-folder-plus"></i></button><button type="button" data-at-a7-rename-folder title="Rename selected folder"><i class="fa-solid fa-pen"></i></button><button type="button" data-at-a7-delete-folder title="Delete selected empty folder"><i class="fa-solid fa-trash"></i></button></div>`;
    const showAll = explorer.querySelector(":scope > [data-at-cw-show-all]");
    if (showAll) showAll.insertAdjacentElement("afterend", tools);
    else explorer.querySelector("header")?.insertAdjacentElement("afterend", tools);
  }
  const selected = atA7SelectedFolder(state.section);
  const parent = atA7ImpliedParent(state.section);
  const protectedRoot = selected ? atA7IsSectionRoot(state.section, selected) : false;
  const label = tools.querySelector("[data-at-a7-folder-label]");
  if (label) label.textContent = selected ? atA7Path(selected) : (parent ? `${parent.name} (root)` : "Select a source");
  tools.querySelector("[data-at-a7-new-entry]").disabled = !parent;
  tools.querySelector("[data-at-a7-new-folder]").disabled = !parent;
  tools.querySelector("[data-at-a7-rename-folder]").disabled = !selected || protectedRoot;
  tools.querySelector("[data-at-a7-delete-folder]").disabled = !selected || protectedRoot;
}

function atA7EnhanceFolderDrag(state, explorer) {
  if (game.user?.isGM || !atA7CanManageSection(state.section)) return;
  const rootIds = new Set(atA7SectionRoots(state.section).map((root) => root.id));
  for (const row of explorer.querySelectorAll(".at-cw-tree-folder-row[data-at-cw-drop-folder]")) {
    const folderId = String(row.dataset.atCwDropFolder || "");
    if (!folderId || rootIds.has(folderId) || row.querySelector("[data-at-a7-drag-folder]")) continue;
    const placeholder = row.querySelector(".at-cw-folder-drag.is-disabled");
    const handle = document.createElement("span");
    handle.className = "at-cw-folder-drag at-a7-folder-drag";
    handle.draggable = true;
    handle.dataset.atA7DragFolder = folderId;
    handle.title = "Drag folder (Tome Editor)";
    handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
    if (placeholder) placeholder.replaceWith(handle);
    else row.append(handle);
  }
}

function atA7EnhanceEntryActions(state, explorer) {
  if (game.user?.isGM) return;
  for (const entry of [...explorer.querySelectorAll(".at-cw-tree-entry[data-at-cw-journal-id]")]) {
    if (entry.closest(".at-em-entry-row, .at-a7-entry-row")) continue;
    const journalId = String(entry.dataset.atCwJournalId || "");
    const journal = game.journal?.get(journalId);
    if (!journal || !atA7CanManageJournal(journal)) continue;

    const row = document.createElement("div");
    row.className = "at-a7-entry-row";
    row.draggable = true;
    row.dataset.atCwJournalId = journalId;
    row.style.setProperty("--at-tree-depth", entry.style.getPropertyValue("--at-tree-depth") || "0");
    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "at-a7-entry-manage";
    manage.dataset.atA7ManageEntry = journalId;
    manage.title = atA7CanManageSection(state.section) ? "Manage entry as Section Editor" : "Manage entry as Entry Editor";
    manage.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    entry.before(row);
    row.append(entry, manage);
    entry.draggable = false;
    delete entry.dataset.atCwJournalId;
  }
}

function atA7EnhanceRoleBadge() {
  if (game.user?.isGM) return;
  const detail = document.querySelector(ATA7_ROOT)?.querySelector(".at-world-profile-page, .at-quest-detail-page, .at-session-detail");
  if (!detail || detail.querySelector(".at-a7-role-badge")) return;
  const source = detail.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]');
  const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
  if (!journal || !atA7CanManageJournal(journal)) return;
  const section = atA7SectionFromJournal(journal);
  const badge = document.createElement("span");
  badge.className = "at-a7-role-badge";
  badge.innerHTML = `<i class="fa-solid fa-user-pen"></i>${atA7CanManageSection(section) ? `${ATA7_SECTIONS[section]?.label || "Tome"} Editor` : "Entry Editor"}`;
  const host = detail.querySelector(".at-profile-toolbar-actions, .at-session-detail-head, .at-quest-detail-hero") || detail.firstElementChild;
  host?.append(badge);
}

function atA7Enhance() {
  const state = atA7SectionPage();
  if (state) {
    const explorer = state.page.querySelector(".at-cw-explorer");
    if (explorer) {
      atA7EnhanceEditorTools(state, explorer);
      atA7EnhanceFolderDrag(state, explorer);
      atA7EnhanceEntryActions(state, explorer);
    }
  }
  atA7EnhanceRoleBadge();
}

function atA7ScheduleEnhance(delay = 100) {
  window.clearTimeout(atA7EnhanceTimer);
  atA7EnhanceTimer = window.setTimeout(() => {
    atA7EnhanceTimer = null;
    atA7Enhance();
  }, delay);
}

function atA7ClearFolderDragUi() {
  document.querySelectorAll(`${ATA7_ROOT} .at-a7-folder-dragging`).forEach((node) => node.classList.remove("at-a7-folder-dragging"));
  document.querySelectorAll(`${ATA7_ROOT} .at-a7-folder-drop-target`).forEach((node) => node.classList.remove("at-a7-folder-drop-target"));
}

function atA7InstallHandlers() {
  document.addEventListener("click", (event) => {
    const state = atA7SectionPage();

    const openTome = event.target.closest?.(`${ATA7_ROOT} [data-at-a7-open-tome]`);
    if (openTome) {
      event.preventDefault();
      event.stopPropagation();
      const journal = game.journal?.get(String(openTome.dataset.atA7OpenTome || ""));
      document.querySelector(`${ATA7_ROOT} .at-a7-overlay`)?.remove();
      if (journal) atA7OpenInTome(atA7SectionFromJournal(journal), journal.id);
      return;
    }

    const openSource = event.target.closest?.(`${ATA7_ROOT} [data-at-a7-open-source]`);
    if (openSource) {
      event.preventDefault();
      event.stopPropagation();
      const journal = game.journal?.get(String(openSource.dataset.atA7OpenSource || ""));
      try { journal?.sheet?.render?.(true); } catch (_err) {}
      return;
    }

    const deleteEntry = event.target.closest?.(`${ATA7_ROOT} [data-at-a7-delete-entry]`);
    if (deleteEntry) {
      event.preventDefault();
      event.stopPropagation();
      const journal = game.journal?.get(String(deleteEntry.dataset.atA7DeleteEntry || ""));
      document.querySelector(`${ATA7_ROOT} .at-a7-overlay`)?.remove();
      if (journal) void atA7DeleteEntry(journal);
      return;
    }

    const manageEntry = event.target.closest?.(`${ATA7_ROOT} [data-at-a7-manage-entry]`);
    if (manageEntry) {
      event.preventDefault();
      event.stopPropagation();
      const journal = game.journal?.get(String(manageEntry.dataset.atA7ManageEntry || ""));
      if (journal) void atA7ManageEntry(journal);
      return;
    }

    if (!state) return;
    if (event.target.closest?.(`${ATA7_ROOT} .at-cw-explorer [data-at-cw-select-folder], ${ATA7_ROOT} .at-cw-explorer [data-at-cw-show-all]`)) {
      window.setTimeout(() => atA7Enhance(), 0);
      return;
    }
    if (event.target.closest?.("[data-at-a7-new-entry]")) { event.preventDefault(); event.stopPropagation(); void atA7CreateEntry(state.section); return; }
    if (event.target.closest?.("[data-at-a7-new-folder]")) { event.preventDefault(); event.stopPropagation(); void atA7CreateFolder(state.section); return; }
    if (event.target.closest?.("[data-at-a7-rename-folder]")) { event.preventDefault(); event.stopPropagation(); void atA7RenameFolder(state.section); return; }
    if (event.target.closest?.("[data-at-a7-delete-folder]")) { event.preventDefault(); event.stopPropagation(); void atA7DeleteFolder(state.section); }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const handle = event.target.closest?.(`${ATA7_ROOT} [data-at-a7-drag-folder][draggable='true']`);
    if (!handle) return;
    const state = atA7SectionPage();
    const folder = game.folders?.get(String(handle.dataset.atA7DragFolder || ""));
    if (!state || !folder || !atA7CanManageSection(state.section) || atA7IsSectionRoot(state.section, folder)) return;
    atA7FolderDrag = { section: state.section, folderId: folder.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(ATA7_FOLDER_MIME, folder.id);
    handle.closest(".at-cw-tree-folder-row")?.classList.add("at-a7-folder-dragging");
  }, true);

  document.addEventListener("dragover", (event) => {
    if (!atA7FolderDrag || !event.dataTransfer?.types?.includes?.(ATA7_FOLDER_MIME)) return;
    const target = event.target.closest?.(`${ATA7_ROOT} [data-at-cw-drop-folder]`);
    if (!target) return;
    const source = game.folders?.get(atA7FolderDrag.folderId);
    const destination = game.folders?.get(String(target.dataset.atCwDropFolder || ""));
    if (!source || !destination || !atA7FolderBelongs(atA7FolderDrag.section, destination) || source.id === destination.id || atA7DescendantFolderIds(source).has(destination.id)) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    target.classList.add("at-a7-folder-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const target = event.target.closest?.(`${ATA7_ROOT} [data-at-cw-drop-folder]`);
    if (target && !target.contains(event.relatedTarget)) target.classList.remove("at-a7-folder-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    if (!atA7FolderDrag || !event.dataTransfer?.types?.includes?.(ATA7_FOLDER_MIME)) return;
    const target = event.target.closest?.(`${ATA7_ROOT} [data-at-cw-drop-folder]`);
    if (!target) return;
    const destination = game.folders?.get(String(target.dataset.atCwDropFolder || ""));
    const source = game.folders?.get(atA7FolderDrag.folderId);
    if (!source || !destination || source.id === destination.id || atA7DescendantFolderIds(source).has(destination.id)) return;
    event.preventDefault();
    event.stopPropagation();
    const drag = { ...atA7FolderDrag };
    atA7FolderDrag = null;
    atA7ClearFolderDragUi();
    void atA7Request({ action: "moveFolder", section: drag.section, folderId: drag.folderId, targetFolderId: destination.id })
      .then(() => { ui.notifications.info(`Adventurer's Tome: Moved ${source.name} into ${destination.name}.`); atA7ScheduleEnhance(180); })
      .catch((error) => ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not move that folder."}`));
  }, true);

  document.addEventListener("dragend", () => {
    atA7FolderDrag = null;
    atA7ClearFolderDragUi();
  }, true);
}

globalThis.AdventurersTomeEditorBroker = Object.freeze({
  canManageSection: atA7CanManageSection,
  canManageJournal: atA7CanManageJournal,
  canDeleteJournal: atA7CanDeleteJournal,
  request: atA7Request
});

Hooks.once("ready", () => {
  game.socket.on(ATA7_SOCKET, atA7HandleSocket);
  atA7InstallHandlers();
  if (game.user?.isGM) atA7ScheduleReconcileAll(500);
  atA7ScheduleEnhance(360);
  window.setTimeout(() => atA7ScheduleEnhance(20), 950);
});

for (const hookName of ["renderApplication", "renderApplicationV2", "createFolder", "updateFolder", "deleteFolder", "createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, (document) => {
    atA7ScheduleEnhance(160);
    if (!game.user?.isGM) return;
    if (hookName === "updateFolder") atA7ScheduleReconcileAll(180);
    else if (document?.documentName === "JournalEntry" || document?.constructor?.metadata?.name === "JournalEntry") window.setTimeout(() => void atA7ReconcileJournal(document), 100);
  });
}
