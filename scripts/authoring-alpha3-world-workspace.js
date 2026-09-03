const ATWW_MODULE_ID = "adventurers-tome";
const ATWW_ROOT = "#adventurers-tome-app";
const ATWW_SECTION = "world";
const ATWW_JOURNAL_MIME = "text/x-adventurers-tome-world-journal";
const ATWW_FOLDER_MIME = "text/x-adventurers-tome-world-folder";
const ATWW_CANONICAL = Object.freeze({
  NPCs: { category: "npc", icon: "fa-user-group" },
  Locations: { category: "location", icon: "fa-location-dot" },
  Factions: { category: "faction", icon: "fa-flag" },
  Items: { category: "item", icon: "fa-gem" },
  Lore: { category: "lore", icon: "fa-scroll" }
});
let atWwQueued = false;
let atWwTimer = null;

function atWwEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atWwApp() {
  try { return game.modules.get(ATWW_MODULE_ID)?.api?.app?.(); } catch (_err) { return null; }
}

function atWwParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atWwTomeRoot() {
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome" && !atWwParentId(folder)) ||
    [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome") || null;
}

function atWwWorldRoot() {
  const root = atWwTomeRoot();
  if (!root) return null;
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "World" && atWwParentId(folder) === root.id) || null;
}

function atWwDescendantIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atWwParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atWwVisibleIds(page) {
  return new Set([...page.querySelectorAll('.at-world-category [data-action="openWorldProfile"][data-journal-id], .at-a3-tree-content [data-action="openWorldProfile"][data-journal-id], .at-a3ww-source [data-action="openWorldProfile"][data-journal-id]')]
    .map((node) => String(node.dataset.journalId || ""))
    .filter(Boolean));
}

function atWwSourceMetadata(page) {
  const map = new Map();
  for (const card of page.querySelectorAll('.at-world-category [data-action="openWorldProfile"][data-journal-id], .at-a3ww-source [data-action="openWorldProfile"][data-journal-id]')) {
    const id = String(card.dataset.journalId || "");
    if (!id || map.has(id)) continue;
    map.set(id, {
      img: card.querySelector(".at-world-card-art img")?.getAttribute("src") || "",
      categoryLabel: card.querySelector(".at-world-card-copy em")?.textContent?.trim() || "World",
      subtitle: card.querySelector(".at-world-card-copy b")?.textContent?.trim() || "",
      summary: card.querySelector(".at-world-card-copy small")?.textContent?.trim() || ""
    });
  }
  return map;
}

function atWwProfile(journal) {
  const raw = journal?.getFlag?.(ATWW_MODULE_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
}

function atWwCategoryFromFolder(folder) {
  const worldRoot = atWwWorldRoot();
  let current = folder;
  while (current && worldRoot && current.id !== worldRoot.id) {
    const canonical = ATWW_CANONICAL[current.name];
    if (canonical) return canonical.category;
    current = game.folders?.get(atWwParentId(current));
  }
  return "lore";
}

function atWwFolderIcon(folder) {
  return ATWW_CANONICAL[folder?.name]?.icon || "fa-folder";
}

function atWwStateKey(kind) {
  return `adventurers-tome.world-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${kind}`;
}

function atWwSelectedFolderId() {
  try { return localStorage.getItem(atWwStateKey("selectedFolder")) || atWwWorldRoot()?.id || ""; } catch (_err) { return atWwWorldRoot()?.id || ""; }
}

function atWwSetSelectedFolderId(folderId) {
  try { localStorage.setItem(atWwStateKey("selectedFolder"), String(folderId || "")); } catch (_err) {}
}

function atWwCollapsed(folderId) {
  try { return localStorage.getItem(atWwStateKey(`collapsed.${folderId}`)) === "1"; } catch (_err) { return false; }
}

function atWwSetCollapsed(folderId, collapsed) {
  try { localStorage.setItem(atWwStateKey(`collapsed.${folderId}`), collapsed ? "1" : "0"); } catch (_err) {}
}

function atWwCanManage() {
  if (game.user?.isGM) return true;
  const root = atWwTomeRoot();
  const roles = root?.getFlag?.(ATWW_MODULE_ID, "sectionEditors") || {};
  return Array.isArray(roles.world) && roles.world.map(String).includes(String(game.user?.id || ""));
}

function atWwFolderHasVisibleContent(folder, visibleIds) {
  if (game.user?.isGM) return true;
  const ids = atWwDescendantIds(folder);
  return [...(game.journal?.contents ?? [])].some((journal) => visibleIds.has(journal.id) && ids.has(String(journal.folder?.id ?? journal.folder ?? "")));
}

function atWwChildFolders(folder, visibleIds) {
  return [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atWwParentId(child) === folder.id && atWwFolderHasVisibleContent(child, visibleIds))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atWwDirectJournals(folder, visibleIds) {
  return [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id) && String(journal.folder?.id ?? journal.folder ?? "") === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atWwCountContents(folder, visibleIds) {
  const ids = atWwDescendantIds(folder);
  const entries = [...(game.journal?.contents ?? [])].filter((journal) => visibleIds.has(journal.id) && ids.has(String(journal.folder?.id ?? journal.folder ?? ""))).length;
  const folders = Math.max(0, ids.size - 1);
  return { entries, folders };
}

function atWwTreeFolder(folder, selectedId, visibleIds, depth = 0) {
  const collapsed = atWwCollapsed(folder.id);
  const children = atWwChildFolders(folder, visibleIds);
  const journals = atWwDirectJournals(folder, visibleIds);
  const isSelected = folder.id === selectedId;
  return `<div class="at-a3ww-tree-folder ${collapsed ? "is-collapsed" : ""}" data-at-a3ww-folder="${atWwEscape(folder.id)}">
    <div class="at-a3ww-tree-folder-row ${isSelected ? "is-selected" : ""}" style="--at-tree-depth:${depth}" data-at-a3ww-drop-folder="${atWwEscape(folder.id)}">
      <button type="button" data-at-a3ww-toggle-folder="${atWwEscape(folder.id)}" title="${collapsed ? "Expand" : "Collapse"}"><i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i></button>
      <button type="button" class="at-a3ww-tree-folder-open" data-at-a3ww-select-folder="${atWwEscape(folder.id)}" ${game.user?.isGM && folder.id !== atWwWorldRoot()?.id ? 'draggable="true" data-at-a3ww-drag-folder="true"' : ""}><i class="fa-solid ${atWwFolderIcon(folder)}"></i><span>${atWwEscape(folder.name)}</span></button>
    </div>
    <div class="at-a3ww-tree-children">${journals.map((journal) => `<button type="button" class="at-a3ww-tree-entry" style="--at-tree-depth:${depth + 1}" data-at-a3ww-open-journal="${atWwEscape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atWwEscape(journal.name)}</span></button>`).join("")}${children.map((child) => atWwTreeFolder(child, selectedId, visibleIds, depth + 1)).join("")}</div>
  </div>`;
}

function atWwBreadcrumb(folder) {
  const worldRoot = atWwWorldRoot();
  const chain = [];
  let current = folder;
  while (current) {
    chain.unshift(current);
    if (worldRoot && current.id === worldRoot.id) break;
    current = game.folders?.get(atWwParentId(current));
  }
  return chain.map((item, index) => `<button type="button" data-at-a3ww-select-folder="${atWwEscape(item.id)}">${atWwEscape(item.name)}</button>${index < chain.length - 1 ? '<i class="fa-solid fa-chevron-right"></i>' : ""}`).join("");
}

function atWwFolderCard(folder, visibleIds) {
  const counts = atWwCountContents(folder, visibleIds);
  return `<article class="at-a3ww-folder-card" data-at-a3ww-drop-folder="${atWwEscape(folder.id)}" ${game.user?.isGM ? 'draggable="true" data-at-a3ww-drag-folder="true"' : ""}>
    <button type="button" class="at-a3ww-folder-card-open" data-at-a3ww-select-folder="${atWwEscape(folder.id)}"><span class="at-a3ww-folder-icon"><i class="fa-solid ${atWwFolderIcon(folder)}"></i></span><span><strong>${atWwEscape(folder.name)}</strong><small>${counts.entries} ${counts.entries === 1 ? "entry" : "entries"}${counts.folders ? ` · ${counts.folders} ${counts.folders === 1 ? "folder" : "folders"}` : ""}</small></span><i class="fa-solid fa-chevron-right"></i></button>
  </article>`;
}

function atWwEntryCard(journal, metadata) {
  const profile = atWwProfile(journal);
  const meta = metadata.get(journal.id) || {};
  const img = String(profile.heroImage || meta.img || "").trim();
  const summary = String(meta.summary || profile.summary || "").trim();
  const subtitle = String(meta.subtitle || profile.subtitle || "").trim();
  const category = String(meta.categoryLabel || profile.category || "World").trim();
  return `<article class="at-a3ww-entry-card" data-journal-id="${atWwEscape(journal.id)}" draggable="true">
    <button type="button" data-at-a3ww-open-journal="${atWwEscape(journal.id)}">${img ? `<span class="at-a3ww-entry-art"><img src="${atWwEscape(img)}" alt="${atWwEscape(journal.name)}"></span>` : '<span class="at-a3ww-entry-art at-no-image"><i class="fa-solid fa-book-open"></i></span>'}<span class="at-a3ww-entry-copy"><em>${atWwEscape(category)}</em><strong>${atWwEscape(journal.name)}</strong>${subtitle ? `<b>${atWwEscape(subtitle)}</b>` : ""}${summary ? `<small>${atWwEscape(summary)}</small>` : ""}</span><i class="fa-solid fa-chevron-right"></i></button>
  </article>`;
}

function atWwRenderWorkspace(page) {
  const worldRoot = atWwWorldRoot();
  if (!worldRoot) return;
  const visibleIds = atWwVisibleIds(page);
  const metadata = atWwSourceMetadata(page);
  let selected = game.folders?.get(atWwSelectedFolderId());
  const validFolders = atWwDescendantIds(worldRoot);
  if (!selected || !validFolders.has(selected.id)) {
    selected = worldRoot;
    atWwSetSelectedFolderId(worldRoot.id);
  }
  const childFolders = atWwChildFolders(selected, visibleIds);
  const journals = atWwDirectJournals(selected, visibleIds);
  const counts = atWwCountContents(selected, visibleIds);

  let workspace = page.querySelector(":scope > .at-a3ww-workspace");
  if (!workspace) {
    workspace = document.createElement("section");
    workspace.className = "at-a3ww-workspace";
    const heading = page.querySelector(":scope > .at-page-heading");
    heading?.insertAdjacentElement("afterend", workspace);
  }

  workspace.innerHTML = `<aside class="at-a3ww-explorer"><header><div><span class="at-kicker">Campaign Explorer</span><h2><i class="fa-solid fa-earth-europe"></i> World</h2></div>${atWwCanManage() ? '<button type="button" data-at-a3ww-new-folder title="New folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}</header><div class="at-a3ww-tree-scroll">${atWwTreeFolder(worldRoot, selected.id, visibleIds, 0)}</div></aside>
    <section class="at-a3ww-main" data-at-a3ww-current-folder="${atWwEscape(selected.id)}">
      <header class="at-a3ww-main-head"><div><nav class="at-a3ww-breadcrumbs">${atWwBreadcrumb(selected)}</nav><span class="at-kicker">World folder</span><h2>${atWwEscape(selected.name)}</h2><p>${counts.entries} ${counts.entries === 1 ? "entry" : "entries"}${counts.folders ? ` · ${counts.folders} nested ${counts.folders === 1 ? "folder" : "folders"}` : ""}</p></div>${atWwCanManage() ? '<div class="at-a3ww-main-actions"><button type="button" class="at-secondary" data-at-a3ww-new-folder><i class="fa-solid fa-folder-plus"></i> Folder</button></div>' : ""}</header>
      <div class="at-a3ww-root-drop" data-at-a3ww-drop-folder="${atWwEscape(selected.id)}"><i class="fa-solid fa-arrow-down"></i><span>Drop entries here to move them into ${atWwEscape(selected.name)}</span></div>
      ${childFolders.length ? `<section class="at-a3ww-folder-section"><div class="at-a3ww-section-title"><h3>Folders</h3><span>${childFolders.length}</span></div><div class="at-a3ww-folder-grid">${childFolders.map((folder) => atWwFolderCard(folder, visibleIds)).join("")}</div></section>` : ""}
      <section class="at-a3ww-entry-section"><div class="at-a3ww-section-title"><h3>Entries</h3><span>${journals.length}</span></div><div class="at-a3ww-entry-grid">${journals.map((journal) => atWwEntryCard(journal, metadata)).join("") || '<div class="at-empty at-wide">No entries in this folder yet. Drag an entry here, create one, or drop a Foundry Journal onto this folder.</div>'}</div></section>
    </section>`;
}

function atWwPreparePage(page) {
  if (!page) return;
  page.dataset.atA3TreeReady = "true";
  let source = page.querySelector(":scope > .at-a3ww-source");
  if (!source) {
    source = document.createElement("div");
    source.className = "at-a3ww-source";
    source.hidden = true;
    page.append(source);
  }

  const alphaLayout = page.querySelector(":scope > .at-a3-tree-layout");
  if (alphaLayout) {
    const content = alphaLayout.querySelector(":scope > .at-a3-tree-content");
    if (content) while (content.firstChild) source.append(content.firstChild);
    alphaLayout.remove();
  }
  for (const category of [...page.querySelectorAll(":scope > .at-world-category")]) source.append(category);
  for (const empty of [...page.querySelectorAll(":scope > .at-empty")]) source.append(empty);
  atWwRenderWorkspace(page);
}

function atWwQueue(delay = 80) {
  if (!atWwQueued) {
    atWwQueued = true;
    window.requestAnimationFrame(() => {
      atWwQueued = false;
      const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
      if (page) atWwPreparePage(page);
    });
  }
  window.clearTimeout(atWwTimer);
  atWwTimer = window.setTimeout(() => {
    const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
    if (page) atWwPreparePage(page);
  }, delay);
}

function atWwOpenJournal(journalId) {
  const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
  const sourceButton = page?.querySelector(`.at-a3ww-source [data-action="openWorldProfile"][data-journal-id="${CSS.escape(String(journalId))}"]`);
  if (sourceButton) return sourceButton.click();
  const fallback = document.querySelector(`${ATWW_ROOT} [data-action="openWorldProfile"][data-journal-id="${CSS.escape(String(journalId))}"]`);
  fallback?.click();
}

function atWwParseFoundryJournal(dataTransfer) {
  const plain = String(dataTransfer?.getData?.("text/plain") || "").trim();
  if (!plain) return null;
  try {
    const data = JSON.parse(plain);
    const type = String(data?.type || data?.documentName || "").toLowerCase();
    if (type && !type.includes("journal")) return null;
    const id = String(data?.id || data?.documentId || "").trim();
    if (id && game.journal?.get(id)) return game.journal.get(id);
    const uuid = String(data?.uuid || data?.documentUuid || "").trim();
    const match = uuid.match(/^JournalEntry\.([^.]+)$/i);
    if (match && game.journal?.get(match[1])) return game.journal.get(match[1]);
  } catch (_err) {}
  return null;
}

async function atWwEnsureWorldProfile(journal, targetFolder) {
  if (!journal) return;
  const profile = atWwProfile(journal);
  profile.category = profile.category || atWwCategoryFromFolder(targetFolder);
  profile.subtitle = profile.subtitle || "";
  profile.summary = profile.summary || "";
  profile.body = profile.body || "";
  profile.heroImage = profile.heroImage || "";
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  profile.summaryJournalBacked = true;
  await journal.setFlag(ATWW_MODULE_ID, "type", "world");
  await journal.setFlag(ATWW_MODULE_ID, "worldProfile", profile);
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  let textPage = pages.find((page) => String(page.type || "text").toLowerCase() === "text") || null;
  if (!textPage) {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Overview", type: "text", text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 }, sort: 100000 }]);
    textPage = created?.[0] || null;
  }
  if (textPage && !journal.getFlag?.(ATWW_MODULE_ID, "worldSyncPage")) await journal.setFlag(ATWW_MODULE_ID, "worldSyncPage", textPage.id);
}

async function atWwSyncCategoryFromFolder(journal, targetFolder) {
  const profile = atWwProfile(journal);
  if (!profile || typeof profile !== "object") return;
  const next = atWwCategoryFromFolder(targetFolder);
  if (!next || profile.category === next) return;
  profile.category = next;
  await journal.setFlag(ATWW_MODULE_ID, "worldProfile", profile);
}

async function atWwMoveOrAdoptJournal(journal, targetFolder) {
  if (!journal || !targetFolder) return;
  const worldRoot = atWwWorldRoot();
  if (!worldRoot || !atWwDescendantIds(worldRoot).has(targetFolder.id)) return;
  const isWorld = String(journal.getFlag?.(ATWW_MODULE_ID, "type") || "") === "world" || Boolean(journal.getFlag?.(ATWW_MODULE_ID, "worldProfile"));
  const canEdit = Boolean(game.user?.isGM || journal.isOwner || journal.testUserPermission?.(game.user, "OWNER"));
  if (!canEdit) return ui.notifications.warn("Adventurer's Tome: You do not have permission to move that Journal.");
  try {
    if (!isWorld) {
      if (!game.user?.isGM) return ui.notifications.warn("Adventurer's Tome: A GM must adopt an ordinary Foundry Journal into World the first time.");
      await atWwEnsureWorldProfile(journal, targetFolder);
    }
    await journal.update({ folder: targetFolder.id });
    await atWwSyncCategoryFromFolder(journal, targetFolder);
    ui.notifications.info(`Adventurer's Tome: ${isWorld ? "Moved" : "Added"} ${journal.name} to ${targetFolder.name}.`);
    await atWwApp()?.render?.({ parts: ["main"] });
  } catch (error) {
    console.error("Adventurer's Tome | World workspace Journal move/adopt failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that Journal into World.");
  }
}

async function atWwMoveFolder(folder, targetFolder) {
  if (!game.user?.isGM || !folder || !targetFolder) return;
  const worldRoot = atWwWorldRoot();
  if (!worldRoot || folder.id === worldRoot.id) return;
  const worldIds = atWwDescendantIds(worldRoot);
  if (!worldIds.has(folder.id) || !worldIds.has(targetFolder.id)) return;
  if (folder.id === targetFolder.id || atWwDescendantIds(folder).has(targetFolder.id)) return ui.notifications.warn("Adventurer's Tome: A folder cannot be moved into itself or one of its children.");
  try {
    await folder.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${folder.name} into ${targetFolder.name}.`);
    atWwQueue(120);
  } catch (error) {
    console.error("Adventurer's Tome | World workspace folder move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that folder.");
  }
}

function atWwNewFolder() {
  if (!atWwCanManage()) return;
  const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
  const parentId = String(page?.querySelector(".at-a3ww-main")?.dataset?.atA3wwCurrentFolder || atWwSelectedFolderId());
  const parent = game.folders?.get(parentId) || atWwWorldRoot();
  if (!parent) return;
  const overlay = document.createElement("div");
  overlay.className = "at-a3ww-modal-overlay";
  overlay.innerHTML = `<form class="at-a3ww-modal"><header><div><span class="at-kicker">World structure</span><h2>New Folder</h2></div><button type="button" data-at-a3ww-close><i class="fa-solid fa-xmark"></i></button></header><label><span>Name</span><input name="name" required autocomplete="off" placeholder="Greyhaven"></label><p>Creates a real Foundry Journal folder inside <strong>${atWwEscape(parent.name)}</strong>.</p><footer><button type="button" class="at-secondary" data-at-a3ww-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-folder-plus"></i> Create Folder</button></footer></form>`;
  document.querySelector(ATWW_ROOT)?.append(overlay);
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-at-a3ww-close]")) overlay.remove(); });
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) return;
    try {
      if (!game.user?.isGM) return ui.notifications.warn("Adventurer's Tome: Folder creation by delegated Editors requires an active GM and is handled by Tome Create.");
      const created = await Folder.create({ name, type: "JournalEntry", folder: parent.id });
      atWwSetSelectedFolderId(created.id);
      overlay.remove();
      atWwQueue(120);
    } catch (error) {
      console.error("Adventurer's Tome | World folder creation failed", error);
      ui.notifications.error("Adventurer's Tome: Could not create that folder.");
    }
  });
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const selectFolder = event.target.closest?.("[data-at-a3ww-select-folder]");
    if (selectFolder) {
      event.preventDefault();
      event.stopImmediatePropagation();
      atWwSetSelectedFolderId(String(selectFolder.dataset.atA3wwSelectFolder || ""));
      const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
      if (page) atWwRenderWorkspace(page);
      return;
    }
    const toggle = event.target.closest?.("[data-at-a3ww-toggle-folder]");
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const folderId = String(toggle.dataset.atA3wwToggleFolder || "");
      atWwSetCollapsed(folderId, !atWwCollapsed(folderId));
      const page = document.querySelector(`${ATWW_ROOT} .at-world-page`);
      if (page) atWwRenderWorkspace(page);
      return;
    }
    const open = event.target.closest?.("[data-at-a3ww-open-journal]");
    if (open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      atWwOpenJournal(String(open.dataset.atA3wwOpenJournal || ""));
      return;
    }
    if (event.target.closest?.("[data-at-a3ww-new-folder]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      atWwNewFolder();
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const entry = event.target.closest?.(".at-a3ww-entry-card[draggable='true'], .at-a3ww-tree-entry[draggable='true']");
    if (entry) {
      const id = String(entry.dataset.journalId || entry.dataset.atA3wwOpenJournal || "");
      if (!id) return;
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATWW_JOURNAL_MIME, id);
      entry.classList.add("is-dragging");
      return;
    }
    const folder = event.target.closest?.("[data-at-a3ww-drag-folder='true']");
    if (folder) {
      const folderId = String(folder.closest("[data-at-a3ww-folder]")?.dataset?.atA3wwFolder || folder.closest("[data-at-a3ww-drop-folder]")?.dataset?.atA3wwDropFolder || "");
      if (!folderId) return;
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATWW_FOLDER_MIME, folderId);
      folder.classList.add("is-dragging");
    }
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".is-dragging")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-a3ww-drop-target").forEach((node) => node.classList.remove("at-a3ww-drop-target"));
  }, true);

  document.addEventListener("dragover", (event) => {
    const target = event.target.closest?.("[data-at-a3ww-drop-folder]");
    if (!target) return;
    const types = [...(event.dataTransfer?.types || [])];
    if (!types.includes(ATWW_JOURNAL_MIME) && !types.includes(ATWW_FOLDER_MIME) && !types.includes("text/plain")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    target.classList.add("at-a3ww-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const target = event.target.closest?.("[data-at-a3ww-drop-folder]");
    if (target && !target.contains(event.relatedTarget)) target.classList.remove("at-a3ww-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const target = event.target.closest?.("[data-at-a3ww-drop-folder]");
    if (!target) return;
    const targetFolder = game.folders?.get(String(target.dataset.atA3wwDropFolder || ""));
    if (!targetFolder) return;
    const journalId = String(event.dataTransfer?.getData?.(ATWW_JOURNAL_MIME) || "");
    const folderId = String(event.dataTransfer?.getData?.(ATWW_FOLDER_MIME) || "");
    const external = !journalId && !folderId ? atWwParseFoundryJournal(event.dataTransfer) : null;
    if (!journalId && !folderId && !external) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.classList.remove("at-a3ww-drop-target");
    if (journalId) return void atWwMoveOrAdoptJournal(game.journal?.get(journalId), targetFolder);
    if (folderId) return void atWwMoveFolder(game.folders?.get(folderId), targetFolder);
    if (external) return void atWwMoveOrAdoptJournal(external, targetFolder);
  }, true);

  const observer = new MutationObserver(() => atWwQueue(100));
  observer.observe(document.body, { childList: true, subtree: true });
  atWwQueue(120);
});

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atWwQueue(140));
}
