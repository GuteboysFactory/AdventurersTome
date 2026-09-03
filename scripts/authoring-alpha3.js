const ATA3_MODULE_ID = "adventurers-tome";
const ATA3_ROOT = "#adventurers-tome-app";
const ATA3_SOCKET = `module.${ATA3_MODULE_ID}`;
const ATA3_SECTION_EDITORS = "sectionEditors";
const ATA3_ENTRY_EDITORS = "entryEditors";
const ATA3_MANAGED_OWNERS = "managedEditorOwners";
const ATA3_WORLD_PROFILE = "worldProfile";
const ATA3_WORLD_SYNC_PAGE = "worldSyncPage";
const ATA3_SECTIONS = Object.freeze({
  world: { label: "World", icon: "fa-earth-europe" },
  quests: { label: "Quests", icon: "fa-diamond" },
  sessions: { label: "Sessions", icon: "fa-book-open" }
});
const ATA3_WORLD_CATEGORIES = Object.freeze({ npc: "NPCs", location: "Locations", faction: "Factions", item: "Items", lore: "Lore" });
const ATA3_PENDING = new Map();
let atA3Queued = false;
let atA3LastAccessJournalId = "";

function atA3Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA3HtmlFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function atA3ParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atA3RootFolder() {
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome" && !atA3ParentId(folder)) ||
    [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome") || null;
}

function atA3SectionFolder(section) {
  const root = atA3RootFolder();
  if (!root) return null;
  const label = ATA3_SECTIONS[section]?.label;
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === label && atA3ParentId(folder) === root.id) || null;
}

async function atA3EnsureFolder(name, parent = null) {
  const parentId = String(parent?.id ?? parent ?? "");
  const existing = [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === name && atA3ParentId(folder) === parentId);
  if (existing) return existing;
  return Folder.create({ name, type: "JournalEntry", folder: parentId || null });
}

async function atA3EnsureSectionFolder(section) {
  let root = atA3RootFolder();
  if (!root) root = await atA3EnsureFolder("Adventurer's Tome");
  return atA3SectionFolder(section) || atA3EnsureFolder(ATA3_SECTIONS[section].label, root);
}

function atA3DescendantFolderIds(rootFolder) {
  if (!rootFolder) return new Set();
  const ids = new Set([rootFolder.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atA3ParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atA3SectionFromJournal(journal) {
  if (!journal) return "";
  const type = String(journal.getFlag?.(ATA3_MODULE_ID, "type") || "").toLowerCase();
  if (type === "world") return "world";
  if (type === "quests" || type === "quest") return "quests";
  if (type === "sessions" || type === "session") return "sessions";
  const folderId = String(journal.folder?.id ?? journal.folder ?? "");
  for (const section of Object.keys(ATA3_SECTIONS)) {
    const root = atA3SectionFolder(section);
    if (root && atA3DescendantFolderIds(root).has(folderId)) return section;
  }
  return "";
}

function atA3SectionJournals(section) {
  const root = atA3SectionFolder(section);
  const folderIds = atA3DescendantFolderIds(root);
  return [...(game.journal?.contents ?? [])].filter((journal) => atA3SectionFromJournal(journal) === section || folderIds.has(String(journal.folder?.id ?? journal.folder ?? "")));
}

function atA3RoleMap() {
  const root = atA3RootFolder();
  const raw = root?.getFlag?.(ATA3_MODULE_ID, ATA3_SECTION_EDITORS);
  const map = { world: [], quests: [], sessions: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const section of Object.keys(map)) map[section] = Array.isArray(raw[section]) ? [...new Set(raw[section].map(String))] : [];
  }
  return map;
}

function atA3IsSectionEditor(section, userId = game.user?.id) {
  if (game.user?.isGM && String(userId) === String(game.user.id)) return true;
  return atA3RoleMap()[section]?.includes(String(userId || "")) || false;
}

function atA3EntryEditors(journal) {
  const raw = journal?.getFlag?.(ATA3_MODULE_ID, ATA3_ENTRY_EDITORS);
  return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
}

function atA3ManagedOwners(journal) {
  const raw = journal?.getFlag?.(ATA3_MODULE_ID, ATA3_MANAGED_OWNERS);
  return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
}

function atA3ShouldBeEditor(journal, userId) {
  const section = atA3SectionFromJournal(journal);
  return atA3EntryEditors(journal).includes(String(userId)) || (section && atA3RoleMap()[section]?.includes(String(userId)));
}

function atA3OwnerLevel() {
  return Number(CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
}

async function atA3SyncJournalOwner(journal, userId) {
  if (!journal || !game.user?.isGM) return;
  const id = String(userId || "");
  if (!id) return;
  const shouldOwn = atA3ShouldBeEditor(journal, id);
  const ownership = foundry.utils.deepClone(journal.ownership || { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 });
  const managed = new Set(atA3ManagedOwners(journal));
  const current = Number(ownership[id] ?? 0);
  let ownershipChanged = false;

  if (shouldOwn && current < atA3OwnerLevel()) {
    ownership[id] = atA3OwnerLevel();
    managed.add(id);
    ownershipChanged = true;
  } else if (!shouldOwn && managed.has(id)) {
    delete ownership[id];
    managed.delete(id);
    ownershipChanged = true;
  }

  const nextManaged = [...managed];
  if (ownershipChanged) await journal.update({ ownership });
  if (JSON.stringify(nextManaged.sort()) !== JSON.stringify(atA3ManagedOwners(journal).sort())) {
    await journal.setFlag(ATA3_MODULE_ID, ATA3_MANAGED_OWNERS, nextManaged);
  }
}

async function atA3SetSectionEditor(section, userId, enabled) {
  if (!game.user?.isGM || !ATA3_SECTIONS[section]) return;
  const root = atA3RootFolder() || await atA3EnsureFolder("Adventurer's Tome");
  const map = atA3RoleMap();
  const ids = new Set(map[section] || []);
  if (enabled) ids.add(String(userId));
  else ids.delete(String(userId));
  map[section] = [...ids];
  await root.setFlag(ATA3_MODULE_ID, ATA3_SECTION_EDITORS, map);
  for (const journal of atA3SectionJournals(section)) await atA3SyncJournalOwner(journal, userId);
}

async function atA3SetEntryEditor(journal, userId, enabled) {
  if (!game.user?.isGM || !journal) return;
  const ids = new Set(atA3EntryEditors(journal));
  if (enabled) ids.add(String(userId));
  else ids.delete(String(userId));
  await journal.setFlag(ATA3_MODULE_ID, ATA3_ENTRY_EDITORS, [...ids]);
  await atA3SyncJournalOwner(journal, userId);
}

function atA3CanCreate(section) {
  return Boolean(game.user?.isGM || atA3IsSectionEditor(section));
}

function atA3SectionPage(root) {
  if (root?.querySelector(".at-world-page")) return { section: "world", page: root.querySelector(".at-world-page") };
  if (root?.querySelector(".at-quests-page")) return { section: "quests", page: root.querySelector(".at-quests-page") };
  if (root?.querySelector(".at-sessions-page")) return { section: "sessions", page: root.querySelector(".at-sessions-page") };
  return null;
}

function atA3JournalIdsOnPage(page, section) {
  const selector = section === "world"
    ? '[data-action="openWorldProfile"][data-journal-id]'
    : section === "quests"
      ? '[data-action="openQuestDetail"][data-journal-id]'
      : '[data-action="selectSession"][data-journal-id]';
  return new Set([...page.querySelectorAll(selector)].map((node) => String(node.dataset.journalId || "")).filter(Boolean));
}

function atA3CollapsedKey(section, folderId) {
  return `adventurers-tome.tree.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${folderId}`;
}

function atA3IsCollapsed(section, folderId) {
  try { return localStorage.getItem(atA3CollapsedKey(section, folderId)) === "1"; } catch (_err) { return false; }
}

function atA3SetCollapsed(section, folderId, collapsed) {
  try { localStorage.setItem(atA3CollapsedKey(section, folderId), collapsed ? "1" : "0"); } catch (_err) {}
}

function atA3TreeFolderMarkup(folder, section, journalIds, depth = 0) {
  const collapsed = atA3IsCollapsed(section, folder.id);
  const childFolders = [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atA3ParentId(child) === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const journals = [...(game.journal?.contents ?? [])]
    .filter((journal) => String(journal.folder?.id ?? journal.folder ?? "") === folder.id && journalIds.has(journal.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const children = [
    ...childFolders.map((child) => atA3TreeFolderMarkup(child, section, journalIds, depth + 1)),
    ...journals.map((journal) => `<button type="button" class="at-a3-tree-entry" style="--at-tree-depth:${depth + 1}" data-at-a3-open-journal="${atA3Escape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atA3Escape(journal.name)}</span></button>`)
  ].join("");
  return `<div class="at-a3-tree-folder ${collapsed ? "is-collapsed" : ""}" data-at-a3-folder-id="${atA3Escape(folder.id)}"><button type="button" class="at-a3-tree-folder-row" style="--at-tree-depth:${depth}" data-at-a3-folder-toggle="${atA3Escape(folder.id)}" data-at-a3-folder-drop="${atA3Escape(folder.id)}" ${game.user?.isGM ? 'draggable="true"' : ""}><i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i><i class="fa-solid fa-folder"></i><span>${atA3Escape(folder.name)}</span></button><div class="at-a3-tree-children">${children}</div></div>`;
}

function atA3BuildTree(section, page) {
  const sectionFolder = atA3SectionFolder(section);
  const journalIds = atA3JournalIdsOnPage(page, section);
  const tree = document.createElement("aside");
  tree.className = "at-a3-campaign-tree";
  tree.dataset.section = section;
  const title = ATA3_SECTIONS[section];
  const rootMarkup = sectionFolder ? atA3TreeFolderMarkup(sectionFolder, section, journalIds, 0) : '<div class="at-empty">Tome folders have not been created yet.</div>';
  const unfiled = [...(game.journal?.contents ?? [])]
    .filter((journal) => journalIds.has(journal.id) && (!sectionFolder || !atA3DescendantFolderIds(sectionFolder).has(String(journal.folder?.id ?? journal.folder ?? ""))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  tree.innerHTML = `<header><div><span class="at-kicker">Campaign Explorer</span><h2><i class="fa-solid ${title.icon}"></i> ${title.label}</h2></div><div class="at-a3-tree-actions">${game.user?.isGM ? '<button type="button" data-at-a3-editors title="Manage Tome Editors"><i class="fa-solid fa-user-pen"></i></button>' : ""}${atA3CanCreate(section) ? '<button type="button" data-at-a3-new-folder title="New folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}</div></header><div class="at-a3-tree-scroll">${rootMarkup}${unfiled.length ? `<div class="at-a3-tree-unfiled"><span>Unfiled</span>${unfiled.map((journal) => `<button type="button" class="at-a3-tree-entry" data-at-a3-open-journal="${atA3Escape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atA3Escape(journal.name)}</span></button>`).join("")}</div>` : ""}</div>`;
  return tree;
}

function atA3InstallTree(sectionPage) {
  const { section, page } = sectionPage;
  if (page.dataset.atA3TreeReady === "true") return;
  const heading = page.querySelector(":scope > .at-page-heading");
  if (!heading) return;
  const rest = [...page.children].filter((child) => child !== heading);
  if (!rest.length) return;
  const shell = document.createElement("section");
  shell.className = "at-a3-tree-layout";
  const content = document.createElement("div");
  content.className = "at-a3-tree-content";
  for (const child of rest) content.append(child);
  shell.append(atA3BuildTree(section, page), content);
  heading.insertAdjacentElement("afterend", shell);
  page.dataset.atA3TreeReady = "true";
}

function atA3AddCreateAndEditors(sectionPage) {
  const { section, page } = sectionPage;
  const host = section === "world" ? page.querySelector(".at-world-heading") : page.querySelector(".at-page-tools");
  if (!host) return;
  if (atA3CanCreate(section) && !host.querySelector(`[data-at-af-create="${section}"], [data-at-a3-create="${section}"]`)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "at-primary";
    button.dataset.atA3Create = section;
    button.innerHTML = '<i class="fa-solid fa-plus"></i> Create';
    host.append(button);
  }
  if (game.user?.isGM && !host.querySelector(`[data-at-a3-section-editors="${section}"]`)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "at-secondary";
    button.dataset.atA3SectionEditors = section;
    button.innerHTML = '<i class="fa-solid fa-user-pen"></i> Editors';
    host.append(button);
  }
}

function atA3Users() {
  return [...(game.users?.contents ?? [])].filter((user) => !user.isGM).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atA3EditorOverlay() {
  document.querySelector(ATA3_ROOT)?.querySelector(".at-a3-editor-overlay")?.remove();
  const root = document.querySelector(ATA3_ROOT);
  if (!root) return;
  const roles = atA3RoleMap();
  const overlay = document.createElement("div");
  overlay.className = "at-a3-editor-overlay";
  overlay.innerHTML = `<section class="at-a3-editor-dialog"><header><div><span class="at-kicker">Delegated authoring</span><h2>Tome Editors</h2><p>Editors can create and edit player-facing content in the selected Tome section. GM Notes and the private GM workspace remain invisible.</p></div><button type="button" data-at-a3-close><i class="fa-solid fa-xmark"></i></button></header><div class="at-a3-editor-table"><div class="at-a3-editor-table-head"><span>Player</span>${Object.entries(ATA3_SECTIONS).map(([id, def]) => `<span><i class="fa-solid ${def.icon}"></i>${def.label}</span>`).join("")}</div>${atA3Users().map((user) => `<div class="at-a3-editor-row"><strong>${atA3Escape(user.name)}</strong>${Object.keys(ATA3_SECTIONS).map((section) => `<label><input type="checkbox" data-at-a3-role-section="${section}" data-at-a3-role-user="${atA3Escape(user.id)}" ${roles[section]?.includes(user.id) ? "checked" : ""}><span>Editor</span></label>`).join("")}</div>`).join("") || '<div class="at-empty">No player users exist in this world yet.</div>'}</div><footer><span data-at-a3-editor-status><i class="fa-solid fa-shield-halved"></i> Foundry ownership is synchronized only where Tome needs edit access.</span><button type="button" class="at-primary" data-at-a3-close>Done</button></footer></section>`;
  root.append(overlay);
}

function atA3EntryPermissionCard(journal) {
  const roles = atA3RoleMap();
  const section = atA3SectionFromJournal(journal);
  const explicit = new Set(atA3EntryEditors(journal));
  const article = document.createElement("article");
  article.className = "at-settings-card at-a3-entry-editor-card";
  article.innerHTML = `<div class="at-section-title"><div><span class="at-kicker">Tome authoring</span><h2><i class="fa-solid fa-user-pen"></i> Editors</h2></div></div><p>Grant edit rights for this entry without exposing GM Notes. Section Editors already have access and are shown as inherited.</p><div class="at-a3-entry-editor-list">${atA3Users().map((user) => {
    const inherited = Boolean(section && roles[section]?.includes(user.id));
    const checked = inherited || explicit.has(user.id);
    return `<label class="at-a3-entry-editor-user ${inherited ? "is-inherited" : ""}"><span><strong>${atA3Escape(user.name)}</strong><small>${inherited ? `${ATA3_SECTIONS[section]?.label || "Section"} Editor` : "This entry only"}</small></span><input type="checkbox" data-at-a3-entry-editor-user="${atA3Escape(user.id)}" ${checked ? "checked" : ""} ${inherited ? "disabled" : ""}></label>`;
  }).join("") || '<div class="at-empty">No player users exist in this world yet.</div>'}</div><small class="at-a3-private-note"><i class="fa-solid fa-user-secret"></i> GM Notes remain in Tome's private GM vault and are never granted by Editor access.</small>`;
  article.dataset.journalId = journal.id;
  return article;
}

function atA3EnhanceAccessPage(root) {
  const access = root.querySelector(".at-access-page");
  if (!access || access.querySelector(".at-a3-entry-editor-card") || !atA3LastAccessJournalId) return;
  const journal = game.journal?.get(atA3LastAccessJournalId);
  if (!journal) return;
  const grid = access.querySelector(".at-access-grid");
  if (!grid) return;
  grid.prepend(atA3EntryPermissionCard(journal));
}

function atA3Modal(title, body, onSubmit) {
  document.querySelector(ATA3_ROOT)?.querySelector(".at-a3-create-overlay")?.remove();
  const root = document.querySelector(ATA3_ROOT);
  if (!root) return;
  const overlay = document.createElement("div");
  overlay.className = "at-a3-create-overlay";
  overlay.innerHTML = `<form class="at-a3-create-dialog"><header><div><span class="at-kicker">Journal-backed creation</span><h2>${atA3Escape(title)}</h2></div><button type="button" data-at-a3-create-close><i class="fa-solid fa-xmark"></i></button></header><div class="at-a3-create-body">${body}</div><footer><button type="button" class="at-secondary" data-at-a3-create-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-plus"></i> Create</button></footer></form>`;
  root.append(overlay);
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-at-a3-create-close]")) overlay.remove(); });
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await onSubmit(new FormData(event.currentTarget));
      overlay.remove();
    } catch (error) {
      console.error("Adventurer's Tome | Alpha 3 create failed", error);
      ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create content."}`);
      submit.disabled = false;
    }
  });
}

function atA3FolderOptions(section, selected = "") {
  const root = atA3SectionFolder(section);
  if (!root) return '<option value="">Section root</option>';
  const ids = atA3DescendantFolderIds(root);
  const folders = [...(game.folders?.contents ?? [])].filter((folder) => ids.has(folder.id));
  const depth = (folder) => {
    let count = 0;
    let current = folder;
    while (current && current.id !== root.id && count < 12) {
      count += 1;
      current = game.folders?.get(atA3ParentId(current));
    }
    return count;
  };
  return folders.sort((a, b) => depth(a) - depth(b) || String(a.name).localeCompare(String(b.name))).map((folder) => `<option value="${atA3Escape(folder.id)}" ${String(folder.id) === String(selected) ? "selected" : ""}>${"— ".repeat(depth(folder))}${atA3Escape(folder.name)}</option>`).join("");
}

function atA3OpenCreate(section, kind = "entry", defaultParent = "") {
  if (!atA3CanCreate(section)) return;
  const worldFields = section === "world" && kind === "entry" ? `<label><span>World type</span><select name="category">${Object.entries(ATA3_WORLD_CATEGORIES).map(([id, label]) => `<option value="${id}">${atA3Escape(label.replace(/s$/, ""))}</option>`).join("")}</select></label>` : "";
  const questFields = section === "quests" && kind === "entry" ? '<label><span>Quest status</span><select name="status"><option value="active">Active</option><option value="dormant">Dormant</option><option value="completed">Completed</option><option value="failed">Failed</option></select></label>' : "";
  const sessionFields = section === "sessions" && kind === "entry" ? '<label><span>Session number <small>optional</small></span><input name="sessionNumber" type="number" min="1" step="1"></label>' : "";
  const title = kind === "folder" ? `New ${ATA3_SECTIONS[section].label} folder` : `New ${section === "world" ? "World entry" : section === "quests" ? "Quest" : "Session"}`;
  const body = `<input type="hidden" name="kind" value="${kind}"><label><span>Name</span><input name="name" required autocomplete="off"></label><label><span>Parent folder</span><select name="parent">${atA3FolderOptions(section, defaultParent)}</select></label>${worldFields}${questFields}${sessionFields}<p class="at-a3-create-note"><i class="fa-solid fa-database"></i> This creates real Foundry Journal data. Tome remains the authoring interface.</p>`;
  atA3Modal(title, body, async (data) => {
    const payload = {
      action: "create",
      section,
      kind,
      name: String(data.get("name") || "").trim(),
      parent: String(data.get("parent") || ""),
      category: String(data.get("category") || "lore"),
      status: String(data.get("status") || "active"),
      sessionNumber: Number(data.get("sessionNumber") || 0)
    };
    if (!payload.name) throw new Error("Enter a name first.");
    const result = game.user?.isGM ? await atA3CreateAsGM(payload, game.user.id) : await atA3RequestGM(payload);
    ui.notifications.info(`Adventurer's Tome: Created ${result?.name || payload.name}.`);
    await atA3AppRender();
  });
}

function atA3OwnershipForSection(section) {
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
  for (const userId of atA3RoleMap()[section] || []) ownership[userId] = atA3OwnerLevel();
  return ownership;
}

async function atA3CreateAsGM(payload, requesterId = "") {
  if (!game.user?.isGM) throw new Error("GM broker is not available on this client.");
  const section = String(payload.section || "");
  if (!ATA3_SECTIONS[section]) throw new Error("Unknown Tome section.");
  if (requesterId && !game.users?.get(requesterId)?.isGM && !atA3RoleMap()[section]?.includes(String(requesterId))) throw new Error("This user is not a Tome Editor for that section.");
  const sectionRoot = await atA3EnsureSectionFolder(section);
  const requestedParent = game.folders?.get(String(payload.parent || ""));
  const validFolders = atA3DescendantFolderIds(sectionRoot);
  let parent = requestedParent && validFolders.has(requestedParent.id) ? requestedParent : sectionRoot;
  if (payload.kind === "folder") {
    const folder = await Folder.create({ name: payload.name, type: "JournalEntry", folder: parent.id });
    return { id: folder.id, name: folder.name, kind: "folder" };
  }

  const flags = {};
  let name = payload.name;
  if (section === "world") {
    const category = ATA3_WORLD_CATEGORIES[payload.category] ? payload.category : "lore";
    if (!payload.parent) parent = await atA3EnsureFolder(ATA3_WORLD_CATEGORIES[category], sectionRoot);
    flags.type = "world";
    flags.worldProfile = { category, subtitle: "", summary: "", body: "", heroImage: "", facts: [], summaryJournalBacked: true };
  } else if (section === "quests") {
    flags.type = "quests";
    flags.status = ["active", "dormant", "completed", "failed"].includes(payload.status) ? payload.status : "active";
  } else {
    flags.type = "sessions";
    if (payload.sessionNumber > 0 && !new RegExp(`^session\\s+${payload.sessionNumber}\\b`, "i").test(name)) name = `Session ${payload.sessionNumber} — ${name}`;
  }
  const managed = [...(atA3RoleMap()[section] || [])];
  flags[ATA3_MANAGED_OWNERS] = managed;
  const journal = await JournalEntry.create({ name, folder: parent.id, ownership: atA3OwnershipForSection(section), flags: { [ATA3_MODULE_ID]: flags } });
  const pageName = section === "sessions" ? "Chronicle" : "Overview";
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: pageName, type: "text", text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: atA3HtmlFormat() }, sort: 100000 }]);
  if (section === "world" && created?.[0]) await journal.setFlag(ATA3_MODULE_ID, ATA3_WORLD_SYNC_PAGE, created[0].id);
  return { id: journal.id, name: journal.name, kind: "entry" };
}

function atA3LeaderGM() {
  return [...(game.users?.contents ?? [])].filter((user) => user.isGM && user.active).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function atA3RequestGM(payload) {
  const gm = atA3LeaderGM();
  if (!gm) return Promise.reject(new Error("A GM must be online to create Foundry documents for a delegated Editor."));
  const requestId = foundry.utils.randomID?.() || `${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ATA3_PENDING.delete(requestId);
      reject(new Error("The GM did not answer the creation request."));
    }, 12000);
    ATA3_PENDING.set(requestId, { resolve, reject, timer });
    game.socket.emit(ATA3_SOCKET, { channel: "alpha3", type: "createRequest", requestId, requesterId: game.user.id, targetGmId: gm.id, payload });
  });
}

async function atA3HandleSocket(message) {
  if (!message || message.channel !== "alpha3") return;
  if (message.type === "createRequest" && game.user?.isGM && String(message.targetGmId) === String(game.user.id)) {
    try {
      const result = await atA3CreateAsGM(message.payload || {}, String(message.requesterId || ""));
      game.socket.emit(ATA3_SOCKET, { channel: "alpha3", type: "createResponse", requestId: message.requestId, requesterId: message.requesterId, ok: true, result });
    } catch (error) {
      game.socket.emit(ATA3_SOCKET, { channel: "alpha3", type: "createResponse", requestId: message.requestId, requesterId: message.requesterId, ok: false, error: error?.message || "Creation failed" });
    }
    return;
  }
  if (message.type === "createResponse" && String(message.requesterId) === String(game.user?.id)) {
    const pending = ATA3_PENDING.get(String(message.requestId || ""));
    if (!pending) return;
    window.clearTimeout(pending.timer);
    ATA3_PENDING.delete(String(message.requestId));
    if (message.ok) pending.resolve(message.result || {});
    else pending.reject(new Error(message.error || "Creation failed"));
  }
}

async function atA3AppRender() {
  try { await game.modules.get(ATA3_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
}

async function atA3MoveJournalToFolder(journalId, folderId) {
  const journal = game.journal?.get(String(journalId || ""));
  const folder = game.folders?.get(String(folderId || ""));
  if (!journal || !folder) return;
  const section = atA3SectionFromJournal(journal);
  const sectionRoot = atA3SectionFolder(section);
  if (!sectionRoot || !atA3DescendantFolderIds(sectionRoot).has(folder.id)) return;
  if (!game.user?.isGM && !atA3IsSectionEditor(section)) return;
  try {
    await journal.update({ folder: folder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${journal.name} to ${folder.name}.`);
    await atA3AppRender();
  } catch (error) {
    console.error("Adventurer's Tome | Tree move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that entry.");
  }
}

function atA3OpenJournalFromTree(section, journalId) {
  const root = document.querySelector(ATA3_ROOT);
  const selector = section === "world"
    ? `[data-action="openWorldProfile"][data-journal-id="${CSS.escape(journalId)}"]`
    : section === "quests"
      ? `[data-action="openQuestDetail"][data-journal-id="${CSS.escape(journalId)}"]`
      : `[data-action="selectSession"][data-journal-id="${CSS.escape(journalId)}"]`;
  root?.querySelector(selector)?.click();
}

function atA3Enhance() {
  const root = document.querySelector(ATA3_ROOT);
  if (!root) return;
  const sectionPage = atA3SectionPage(root);
  if (sectionPage) {
    atA3AddCreateAndEditors(sectionPage);
    atA3InstallTree(sectionPage);
  }
  atA3EnhanceAccessPage(root);
}

function atA3Queue() {
  if (atA3Queued) return;
  atA3Queued = true;
  window.requestAnimationFrame(() => {
    atA3Queued = false;
    atA3Enhance();
  });
}

Hooks.once("ready", () => {
  game.socket.on(ATA3_SOCKET, atA3HandleSocket);

  document.addEventListener("click", (event) => {
    const access = event.target.closest?.('[data-action="editAccess"][data-document-type="journal"][data-document-id]');
    if (access) atA3LastAccessJournalId = String(access.dataset.documentId || "");

    const editors = event.target.closest?.("[data-at-a3-editors], [data-at-a3-section-editors]");
    if (editors) {
      event.preventDefault();
      event.stopPropagation();
      if (game.user?.isGM) atA3EditorOverlay();
      return;
    }

    if (event.target.closest?.("[data-at-a3-close]")) {
      event.preventDefault();
      document.querySelector(ATA3_ROOT)?.querySelector(".at-a3-editor-overlay")?.remove();
      return;
    }

    const create = event.target.closest?.("[data-at-a3-create]");
    if (create) {
      event.preventDefault();
      atA3OpenCreate(String(create.dataset.atA3Create || ""), "entry");
      return;
    }

    const newFolder = event.target.closest?.("[data-at-a3-new-folder]");
    if (newFolder) {
      event.preventDefault();
      const tree = newFolder.closest(".at-a3-campaign-tree");
      atA3OpenCreate(String(tree?.dataset?.section || ""), "folder");
      return;
    }

    const toggle = event.target.closest?.("[data-at-a3-folder-toggle]");
    if (toggle) {
      event.preventDefault();
      const tree = toggle.closest(".at-a3-campaign-tree");
      const section = String(tree?.dataset?.section || "");
      const folderId = String(toggle.dataset.atA3FolderToggle || "");
      const folder = toggle.closest(".at-a3-tree-folder");
      const next = !folder?.classList.contains("is-collapsed");
      folder?.classList.toggle("is-collapsed", next);
      toggle.querySelector(".fa-chevron-right, .fa-chevron-down")?.classList.toggle("fa-chevron-right", next);
      toggle.querySelector(".fa-chevron-right, .fa-chevron-down")?.classList.toggle("fa-chevron-down", !next);
      atA3SetCollapsed(section, folderId, next);
      return;
    }

    const open = event.target.closest?.("[data-at-a3-open-journal]");
    if (open) {
      event.preventDefault();
      const section = String(open.closest(".at-a3-campaign-tree")?.dataset?.section || "");
      atA3OpenJournalFromTree(section, String(open.dataset.atA3OpenJournal || ""));
    }
  }, true);

  document.addEventListener("change", (event) => {
    const role = event.target.closest?.("[data-at-a3-role-section][data-at-a3-role-user]");
    if (role && game.user?.isGM) {
      const status = role.closest(".at-a3-editor-dialog")?.querySelector("[data-at-a3-editor-status]");
      if (status) status.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Synchronizing editor access…';
      role.disabled = true;
      void atA3SetSectionEditor(String(role.dataset.atA3RoleSection), String(role.dataset.atA3RoleUser), role.checked)
        .then(() => { if (status) status.innerHTML = '<i class="fa-solid fa-check"></i> Editor access saved.'; })
        .catch((error) => { console.error(error); role.checked = !role.checked; if (status) status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Could not save Editor access.'; })
        .finally(() => { role.disabled = false; atA3Queue(); });
      return;
    }

    const entry = event.target.closest?.("[data-at-a3-entry-editor-user]");
    if (entry && game.user?.isGM) {
      const card = entry.closest(".at-a3-entry-editor-card");
      const journal = game.journal?.get(String(card?.dataset?.journalId || ""));
      entry.disabled = true;
      void atA3SetEntryEditor(journal, String(entry.dataset.atA3EntryEditorUser), entry.checked)
        .then(() => ui.notifications.info("Adventurer's Tome: Entry Editor access updated."))
        .catch((error) => { console.error(error); entry.checked = !entry.checked; ui.notifications.error("Adventurer's Tome: Could not update Editor access."); })
        .finally(() => { entry.disabled = false; });
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const entry = event.target.closest?.(".at-a3-tree-entry[data-at-a3-open-journal]");
    if (entry) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/x-adventurers-tome-tree-journal", String(entry.dataset.atA3OpenJournal || ""));
      entry.classList.add("is-dragging");
    }
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".at-a3-tree-entry")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-a3-tree-folder-row.is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  }, true);

  document.addEventListener("dragover", (event) => {
    const folder = event.target.closest?.("[data-at-a3-folder-drop]");
    if (!folder || !event.dataTransfer?.types?.includes?.("text/x-adventurers-tome-tree-journal")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    folder.classList.add("is-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const folder = event.target.closest?.("[data-at-a3-folder-drop]");
    if (folder && !folder.contains(event.relatedTarget)) folder.classList.remove("is-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const folder = event.target.closest?.("[data-at-a3-folder-drop]");
    if (!folder) return;
    const journalId = String(event.dataTransfer?.getData?.("text/x-adventurers-tome-tree-journal") || "");
    if (!journalId) return;
    event.preventDefault();
    folder.classList.remove("is-drop-target");
    void atA3MoveJournalToFolder(journalId, String(folder.dataset.atA3FolderDrop || ""));
  }, true);

  const observer = new MutationObserver(atA3Queue);
  observer.observe(document.body, { childList: true, subtree: true });
  atA3Queue();
});

Hooks.on("createJournalEntry", (journal) => {
  if (!game.user?.isGM) return window.setTimeout(atA3Queue, 60);
  const section = atA3SectionFromJournal(journal);
  if (!section) return window.setTimeout(atA3Queue, 60);
  void (async () => {
    for (const userId of atA3RoleMap()[section] || []) await atA3SyncJournalOwner(journal, userId);
    atA3Queue();
  })();
});

for (const hookName of ["updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => window.setTimeout(atA3Queue, 60));
}
