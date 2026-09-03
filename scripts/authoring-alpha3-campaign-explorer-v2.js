const ATCW_MODULE_ID = "adventurers-tome";
const ATCW_ROOT = "#adventurers-tome-app";
const ATCW_JOURNAL_MIME = "text/x-adventurers-tome-campaign-journal";
const ATCW_FOLDER_MIME = "text/x-adventurers-tome-campaign-folder";

const ATCW_SECTIONS = Object.freeze({
  world: { label: "World", icon: "fa-earth-europe", page: ".at-world-page", entry: '[data-action="openWorldProfile"][data-journal-id]' },
  quests: { label: "Quests", icon: "fa-diamond", page: ".at-quests-page", entry: '[data-action="openQuestDetail"][data-journal-id]' },
  sessions: { label: "Sessions", icon: "fa-book-open", page: ".at-sessions-page", entry: '[data-action="selectSession"][data-journal-id]' }
});

const ATCW_CANONICAL_WORLD = Object.freeze({
  NPCs: { category: "npc", icon: "fa-user-group" },
  Locations: { category: "location", icon: "fa-location-dot" },
  Factions: { category: "faction", icon: "fa-flag" },
  Items: { category: "item", icon: "fa-gem" },
  Lore: { category: "lore", icon: "fa-scroll" }
});

let atCwRefreshTimer = null;
let atCwMountTimer = null;
let atCwActiveDrag = null;
let atCwRefreshPending = false;

function atCwEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atCwParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atCwFolderAncestors(folder) {
  const chain = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = game.folders?.get(atCwParentId(current)) || null;
  }
  return chain;
}

function atCwFolderPath(folder) {
  return atCwFolderAncestors(folder).map((item) => item.name).join(" › ");
}

function atCwDescendantFolderIds(root) {
  const ids = new Set();
  if (!root) return ids;
  ids.add(root.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atCwParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atCwSectionFromPage() {
  const root = document.querySelector(ATCW_ROOT);
  if (!root) return null;
  for (const [section, config] of Object.entries(ATCW_SECTIONS)) {
    const page = root.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atCwStateKey(section, key) {
  return `adventurers-tome.campaign-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${key}`;
}

function atCwGetState(section, key, fallback = "") {
  try {
    return localStorage.getItem(atCwStateKey(section, key)) ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

function atCwSetState(section, key, value) {
  try {
    localStorage.setItem(atCwStateKey(section, key), String(value ?? ""));
  } catch (_err) {}
}

function atCwAllEntryIds(catalog, config) {
  return new Set(
    [...catalog.querySelectorAll(config.entry)]
      .map((node) => String(node.dataset.journalId || ""))
      .filter(Boolean)
  );
}

function atCwRootCandidate(folder, section, entryIds) {
  if (!folder || folder.type !== "JournalEntry" || folder.name !== ATCW_SECTIONS[section].label) return false;
  const subtree = atCwDescendantFolderIds(folder);
  if ([...(game.journal?.contents ?? [])].some((journal) => entryIds.has(journal.id) && subtree.has(String(journal.folder?.id ?? journal.folder ?? "")))) return true;
  if (String(folder.getFlag?.(ATCW_MODULE_ID, "section") || "") === section) return true;
  return atCwFolderAncestors(folder).some((ancestor) => /adventurer'?s tome/i.test(ancestor.name));
}

function atCwSectionRoots(section, entryIds) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => atCwRootCandidate(folder, section, entryIds))
    .sort((a, b) => atCwFolderPath(a).localeCompare(atCwFolderPath(b)));
}

function atCwFolderHasVisible(folder, entryIds) {
  if (game.user?.isGM) return true;
  const ids = atCwDescendantFolderIds(folder);
  return [...(game.journal?.contents ?? [])].some((journal) => entryIds.has(journal.id) && ids.has(String(journal.folder?.id ?? journal.folder ?? "")));
}

function atCwChildFolders(folder, entryIds) {
  return [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atCwParentId(child) === folder.id && atCwFolderHasVisible(child, entryIds))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atCwDirectJournals(folder, entryIds) {
  return [...(game.journal?.contents ?? [])]
    .filter((journal) => entryIds.has(journal.id) && String(journal.folder?.id ?? journal.folder ?? "") === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atCwFolderIcon(section, folder) {
  if (section === "world" && ATCW_CANONICAL_WORLD[folder?.name]) return ATCW_CANONICAL_WORLD[folder.name].icon;
  if (section === "quests") return "fa-folder-tree";
  if (section === "sessions") return "fa-box-archive";
  return "fa-folder";
}

function atCwTreeFolder(section, folder, selectedId, entryIds, rootIds, depth = 0) {
  const collapsed = atCwGetState(section, `collapsed.${folder.id}`, "0") === "1";
  const children = atCwChildFolders(folder, entryIds);
  const journals = atCwDirectJournals(folder, entryIds);
  const selected = folder.id === selectedId;
  const isSourceRoot = rootIds.has(folder.id);
  const dragHandle = game.user?.isGM && !isSourceRoot
    ? `<span class="at-cw-folder-drag" draggable="true" data-at-cw-drag-folder="${atCwEscape(folder.id)}" title="Drag folder"><i class="fa-solid fa-grip-vertical"></i></span>`
    : '<span class="at-cw-folder-drag is-disabled"></span>';

  return `<div class="at-cw-tree-folder ${collapsed ? "is-collapsed" : ""}" data-at-cw-folder="${atCwEscape(folder.id)}">
    <div class="at-cw-tree-folder-row ${selected ? "is-selected" : ""}" style="--at-tree-depth:${depth}" data-at-cw-drop-folder="${atCwEscape(folder.id)}">
      <button type="button" class="at-cw-chevron" data-at-cw-toggle-folder="${atCwEscape(folder.id)}" title="${collapsed ? "Expand" : "Collapse"}"><i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i></button>
      <button type="button" class="at-cw-folder-open" data-at-cw-select-folder="${atCwEscape(folder.id)}"><i class="fa-solid ${atCwFolderIcon(section, folder)}"></i><span>${atCwEscape(folder.name)}</span></button>
      ${dragHandle}
    </div>
    <div class="at-cw-tree-children">
      ${journals.map((journal) => `<button type="button" class="at-cw-tree-entry" style="--at-tree-depth:${depth + 1}" data-at-cw-open-journal="${atCwEscape(journal.id)}" data-at-cw-journal-id="${atCwEscape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atCwEscape(journal.name)}</span></button>`).join("")}
      ${children.map((child) => atCwTreeFolder(section, child, selectedId, entryIds, rootIds, depth + 1)).join("")}
    </div>
  </div>`;
}

function atCwExplorerMarkup(section, roots, selectedId, entryIds) {
  const config = ATCW_SECTIONS[section];
  const rootIds = new Set(roots.map((root) => root.id));
  const trees = roots.map((root) => {
    const parent = game.folders?.get(atCwParentId(root));
    const sourceLabel = parent ? parent.name : "Foundry Journals";
    return `<section class="at-cw-source-tree"><span class="at-cw-source-label">${atCwEscape(sourceLabel)}</span>${atCwTreeFolder(section, root, selectedId, entryIds, rootIds, 0)}</section>`;
  }).join("");

  return `<aside class="at-cw-explorer" data-at-cw-section="${atCwEscape(section)}">
    <header>
      <div><span class="at-kicker">Campaign Explorer</span><h2><i class="fa-solid ${config.icon}"></i> ${atCwEscape(config.label)}</h2></div>
      ${game.user?.isGM ? '<button type="button" class="at-cw-new-folder" data-at-cw-new-folder title="New folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}
    </header>
    <button type="button" class="at-cw-show-all ${selectedId ? "" : "is-selected"}" data-at-cw-show-all><i class="fa-solid fa-layer-group"></i><span>Show all</span></button>
    <div class="at-cw-tree-scroll">${trees || '<div class="at-empty">No matching Foundry folder structure yet.</div>'}</div>
  </aside>`;
}

function atCwAllowedIds(selectedFolder, allEntryIds) {
  if (!selectedFolder) return new Set(allEntryIds);
  const folderIds = atCwDescendantFolderIds(selectedFolder);
  return new Set(
    [...(game.journal?.contents ?? [])]
      .filter((journal) => allEntryIds.has(journal.id) && folderIds.has(String(journal.folder?.id ?? journal.folder ?? "")))
      .map((journal) => journal.id)
  );
}

function atCwUpdateCount(container, selector, count) {
  const counter = container.querySelector(selector);
  if (counter) counter.textContent = String(count);
}

function atCwFilterWorld(catalog, allowed) {
  for (const card of catalog.querySelectorAll('.at-world-card[data-journal-id]')) {
    const visible = allowed.has(String(card.dataset.journalId || ""));
    card.classList.toggle("at-cw-filtered-out", !visible);
    card.draggable = visible;
    if (visible) card.dataset.atCwJournalId = String(card.dataset.journalId || "");
  }
  for (const group of catalog.querySelectorAll(".at-world-category")) {
    const visibleCards = [...group.querySelectorAll(".at-world-card[data-journal-id]")].filter((card) => !card.classList.contains("at-cw-filtered-out"));
    group.classList.toggle("at-cw-filtered-out", visibleCards.length === 0);
    atCwUpdateCount(group, ".at-world-category-heading > span", visibleCards.length);
  }
}

function atCwFilterQuests(catalog, allowed) {
  for (const card of catalog.querySelectorAll('.at-quest-card[data-journal-id]')) {
    const visible = allowed.has(String(card.dataset.journalId || ""));
    card.classList.toggle("at-cw-filtered-out", !visible);
    card.draggable = visible;
    if (visible) card.dataset.atCwJournalId = String(card.dataset.journalId || "");
  }
  for (const group of catalog.querySelectorAll(".at-quest-group")) {
    const visibleCards = [...group.querySelectorAll(".at-quest-card[data-journal-id]")].filter((card) => !card.classList.contains("at-cw-filtered-out"));
    group.classList.toggle("at-cw-filtered-out", visibleCards.length === 0);
    atCwUpdateCount(group, ":scope > header > span", visibleCards.length);
  }
}

function atCwFilterSessions(catalog, allowed) {
  let visibleCount = 0;
  for (const row of catalog.querySelectorAll('.at-session-row[data-journal-id]')) {
    const visible = allowed.has(String(row.dataset.journalId || ""));
    row.classList.toggle("at-cw-filtered-out", !visible);
    row.draggable = visible;
    if (visible) {
      visibleCount += 1;
      row.dataset.atCwJournalId = String(row.dataset.journalId || "");
    }
  }

  let empty = catalog.querySelector(".at-cw-session-filter-empty");
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "at-empty at-cw-session-filter-empty";
    empty.textContent = "No sessions in this folder branch.";
    catalog.querySelector(".at-session-chronicle")?.append(empty);
  }
  empty.hidden = visibleCount > 0;
}

function atCwBreadcrumb(selected, roots) {
  if (!selected) return '<strong>All Tome entries</strong><span>Catalog view</span>';
  const rootIds = new Set(roots.map((root) => root.id));
  const chain = [];
  let current = selected;
  while (current) {
    chain.unshift(current);
    if (rootIds.has(current.id)) break;
    current = game.folders?.get(atCwParentId(current));
  }
  return `<strong>${chain.map((folder) => atCwEscape(folder.name)).join(" › ")}</strong><span>Showing this folder and all nested folders</span>`;
}

function atCwApplyFilter(section, catalog, selectedFolder, roots, allEntryIds) {
  const allowed = atCwAllowedIds(selectedFolder, allEntryIds);
  if (section === "world") atCwFilterWorld(catalog, allowed);
  else if (section === "quests") atCwFilterQuests(catalog, allowed);
  else atCwFilterSessions(catalog, allowed);

  let bar = catalog.querySelector(":scope > .at-cw-filterbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "at-cw-filterbar";
    catalog.prepend(bar);
  }
  bar.innerHTML = `<div>${atCwBreadcrumb(selectedFolder, roots)}</div><span class="at-cw-filter-count">${allowed.size} ${allowed.size === 1 ? "entry" : "entries"}</span>`;
  return allowed;
}

function atCwRestoreLegacyContent(page, catalog) {
  const oldWorldSource = page.querySelector(":scope > .at-a3ww-source");
  if (oldWorldSource) {
    while (oldWorldSource.firstChild) catalog.append(oldWorldSource.firstChild);
    oldWorldSource.remove();
  }

  const oldSource = page.querySelector(":scope > .at-cw-source");
  if (oldSource) {
    while (oldSource.firstChild) catalog.append(oldSource.firstChild);
    oldSource.remove();
  }

  const oldWorkspace = page.querySelector(":scope > .at-cw-workspace");
  if (oldWorkspace) {
    const main = oldWorkspace.querySelector(":scope > .at-cw-main");
    if (main) while (main.firstChild) catalog.append(main.firstChild);
    oldWorkspace.remove();
  }

  page.querySelector(":scope > .at-a3ww-workspace")?.remove();

  const oldLayout = page.querySelector(":scope > .at-a3-tree-layout");
  if (oldLayout) {
    const content = oldLayout.querySelector(":scope > .at-a3-tree-content");
    if (content) while (content.firstChild) catalog.append(content.firstChild);
    oldLayout.remove();
  }
}

function atCwBuildExplorer(section, roots, selectedId, allEntryIds) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = atCwExplorerMarkup(section, roots, selectedId, allEntryIds);
  return wrapper.firstElementChild;
}

function atCwEnsureLayout(sectionPage, { rebuildExplorer = false } = {}) {
  const { section, config, page } = sectionPage;
  page.dataset.atA3TreeReady = "true";

  let layout = page.querySelector(":scope > .at-cw-catalog-layout");
  let catalog = layout?.querySelector(":scope > .at-cw-catalog") || null;

  if (!layout || !catalog) {
    layout?.remove();
    layout = document.createElement("section");
    layout.className = "at-cw-catalog-layout";
    catalog = document.createElement("div");
    catalog.className = "at-cw-catalog";

    atCwRestoreLegacyContent(page, catalog);

    const heading = page.querySelector(":scope > .at-page-heading");
    const movable = [...page.children].filter((child) => child !== heading && child !== layout && !child.classList.contains("at-cw-catalog-layout"));
    for (const child of movable) catalog.append(child);

    layout.append(catalog);
    if (heading) heading.insertAdjacentElement("afterend", layout);
    else page.prepend(layout);
  }

  const allEntryIds = atCwAllEntryIds(catalog, config);
  const roots = atCwSectionRoots(section, allEntryIds);
  const validFolderIds = new Set(roots.flatMap((root) => [...atCwDescendantFolderIds(root)]));

  let selectedId = atCwGetState(section, "selected", "");
  if (selectedId && !validFolderIds.has(selectedId)) {
    selectedId = "";
    atCwSetState(section, "selected", "");
  }
  const selectedFolder = selectedId ? game.folders?.get(selectedId) : null;

  let explorer = layout.querySelector(":scope > .at-cw-explorer");
  if (!explorer) {
    explorer = atCwBuildExplorer(section, roots, selectedId, allEntryIds);
    layout.prepend(explorer);
  } else if (rebuildExplorer && !atCwActiveDrag) {
    const scrollTop = explorer.querySelector(".at-cw-tree-scroll")?.scrollTop || 0;
    const replacement = atCwBuildExplorer(section, roots, selectedId, allEntryIds);
    explorer.replaceWith(replacement);
    explorer = replacement;
    const scroll = explorer.querySelector(".at-cw-tree-scroll");
    if (scroll) scroll.scrollTop = scrollTop;
  }

  atCwUpdateSelectionUi(explorer, selectedId);
  atCwApplyFilter(section, catalog, selectedFolder, roots, allEntryIds);

  return { section, config, page, layout, catalog, explorer, roots, selectedFolder, allEntryIds };
}

function atCwUpdateSelectionUi(explorer, selectedId) {
  if (!explorer) return;
  explorer.dataset.atCwSelected = String(selectedId || "");
  explorer.querySelector("[data-at-cw-show-all]")?.classList.toggle("is-selected", !selectedId);
  for (const row of explorer.querySelectorAll(".at-cw-tree-folder-row")) {
    const id = String(row.dataset.atCwDropFolder || "");
    row.classList.toggle("is-selected", Boolean(selectedId) && id === String(selectedId));
  }
}

function atCwSelectFolder(sectionPage, folderId) {
  const state = atCwEnsureLayout(sectionPage);
  const selectedId = String(folderId || "");
  const validFolderIds = new Set(state.roots.flatMap((root) => [...atCwDescendantFolderIds(root)]));
  const nextId = selectedId && validFolderIds.has(selectedId) ? selectedId : "";
  const selectedFolder = nextId ? game.folders?.get(nextId) : null;

  atCwSetState(sectionPage.section, "selected", nextId);
  atCwUpdateSelectionUi(state.explorer, nextId);
  atCwApplyFilter(sectionPage.section, state.catalog, selectedFolder, state.roots, state.allEntryIds);
}

function atCwToggleFolder(section, toggle) {
  const id = String(toggle?.dataset?.atCwToggleFolder || "");
  if (!id) return;
  const treeFolder = toggle.closest(".at-cw-tree-folder");
  if (!treeFolder) return;

  const collapsed = treeFolder.classList.toggle("is-collapsed");
  atCwSetState(section, `collapsed.${id}`, collapsed ? "1" : "0");

  const icon = toggle.querySelector("i");
  if (icon) {
    icon.classList.toggle("fa-chevron-right", collapsed);
    icon.classList.toggle("fa-chevron-down", !collapsed);
  }
  toggle.title = collapsed ? "Expand" : "Collapse";
}

function atCwMountActive({ rebuildExplorer = false } = {}) {
  if (atCwActiveDrag) {
    if (rebuildExplorer) atCwRefreshPending = true;
    return null;
  }
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage) return null;
  return atCwEnsureLayout(sectionPage, { rebuildExplorer });
}

function atCwScheduleMount(delay = 60, { rebuildExplorer = false } = {}) {
  window.clearTimeout(atCwMountTimer);
  atCwMountTimer = window.setTimeout(() => {
    atCwMountTimer = null;
    atCwMountActive({ rebuildExplorer });
  }, delay);
}

function atCwRequestStructuralRefresh(delay = 120) {
  if (atCwActiveDrag) {
    atCwRefreshPending = true;
    return;
  }
  window.clearTimeout(atCwRefreshTimer);
  atCwRefreshTimer = window.setTimeout(() => {
    atCwRefreshTimer = null;
    atCwMountActive({ rebuildExplorer: true });
  }, delay);
}

function atCwFlushPendingRefresh() {
  if (!atCwRefreshPending || atCwActiveDrag) return;
  atCwRefreshPending = false;
  atCwRequestStructuralRefresh(40);
}

function atCwOpenJournal(section, journalId) {
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;
  const node = [...sectionPage.page.querySelectorAll(ATCW_SECTIONS[section].entry)]
    .find((item) => String(item.dataset.journalId || "") === String(journalId));
  node?.click();
}

function atCwParseFoundryJournal(dataTransfer) {
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

function atCwCanonicalWorldCategory(folder) {
  let current = folder;
  while (current) {
    if (ATCW_CANONICAL_WORLD[current.name]) return ATCW_CANONICAL_WORLD[current.name].category;
    current = game.folders?.get(atCwParentId(current));
  }
  return null;
}

async function atCwAdoptJournal(section, journal, targetFolder) {
  if (!game.user?.isGM) throw new Error("A GM must adopt a regular Foundry Journal into Tome the first time.");

  if (section === "world") {
    const raw = journal.getFlag?.(ATCW_MODULE_ID, "worldProfile");
    const profile = raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
    profile.category = profile.category || atCwCanonicalWorldCategory(targetFolder) || "lore";
    profile.subtitle = profile.subtitle || "";
    profile.summary = profile.summary || "";
    profile.body = profile.body || "";
    profile.heroImage = profile.heroImage || "";
    profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
    profile.summaryJournalBacked = true;

    await journal.setFlag(ATCW_MODULE_ID, "type", "world");
    await journal.setFlag(ATCW_MODULE_ID, "worldProfile", profile);

    const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
    let page = pages.find((item) => String(item.type || "text").toLowerCase() === "text") || null;
    if (!page) {
      const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name: "Overview",
        type: "text",
        text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
        sort: 100000
      }]);
      page = created?.[0] || null;
    }
    if (page && !journal.getFlag?.(ATCW_MODULE_ID, "worldSyncPage")) await journal.setFlag(ATCW_MODULE_ID, "worldSyncPage", page.id);
  } else if (section === "quests") {
    await journal.setFlag(ATCW_MODULE_ID, "type", "quests");
    if (!journal.getFlag?.(ATCW_MODULE_ID, "status")) await journal.setFlag(ATCW_MODULE_ID, "status", "active");
  } else if (section === "sessions") {
    await journal.setFlag(ATCW_MODULE_ID, "type", "sessions");
  }
}

function atCwJournalBelongs(section, journal, knownIds) {
  if (knownIds.has(journal.id)) return true;
  const type = String(journal.getFlag?.(ATCW_MODULE_ID, "type") || "").toLowerCase();
  return (section === "world" && type === "world")
    || (section === "quests" && (type === "quests" || type === "quest"))
    || (section === "sessions" && (type === "sessions" || type === "session"));
}

async function atCwMoveJournal(section, journal, targetFolder) {
  if (!journal || !targetFolder) return;
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;

  const state = atCwEnsureLayout(sectionPage);
  const knownIds = state.allEntryIds;
  const canEdit = Boolean(game.user?.isGM || journal.isOwner || journal.testUserPermission?.(game.user, "OWNER"));
  if (!canEdit) return ui.notifications.warn("Adventurer's Tome: You do not have permission to move that Journal.");

  try {
    const belongs = atCwJournalBelongs(section, journal, knownIds);
    if (!belongs) await atCwAdoptJournal(section, journal, targetFolder);

    let categoryChanged = false;
    await journal.update({ folder: targetFolder.id });

    if (section === "world") {
      const raw = journal.getFlag?.(ATCW_MODULE_ID, "worldProfile");
      const canonicalCategory = atCwCanonicalWorldCategory(targetFolder);
      if (canonicalCategory && raw && typeof raw === "object" && !Array.isArray(raw)) {
        const profile = foundry.utils.deepClone(raw);
        if (profile.category !== canonicalCategory) {
          profile.category = canonicalCategory;
          await journal.setFlag(ATCW_MODULE_ID, "worldProfile", profile);
          categoryChanged = true;
        }
      }
    }

    ui.notifications.info(`Adventurer's Tome: ${belongs ? "Moved" : "Added"} ${journal.name} to ${targetFolder.name}.`);

    if (categoryChanged) {
      const app = game.modules.get(ATCW_MODULE_ID)?.api?.app?.();
      await app?.render?.({ parts: ["main"] });
      atCwScheduleMount(80, { rebuildExplorer: true });
    } else {
      atCwRequestStructuralRefresh(80);
    }
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer Journal move failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not move that Journal."}`);
  }
}

async function atCwMoveFolder(section, folder, targetFolder) {
  if (!game.user?.isGM || !folder || !targetFolder) return;
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;

  const state = atCwEnsureLayout(sectionPage);
  const rootIds = new Set(state.roots.map((root) => root.id));
  if (rootIds.has(folder.id)) return ui.notifications.warn("Adventurer's Tome: A section source root cannot be moved.");
  if (folder.id === targetFolder.id || atCwDescendantFolderIds(folder).has(targetFolder.id)) {
    return ui.notifications.warn("Adventurer's Tome: A folder cannot be moved into itself or one of its children.");
  }

  try {
    await folder.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${folder.name} into ${targetFolder.name}.`);
    atCwRequestStructuralRefresh(80);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer folder move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that folder.");
  }
}

async function atCwCreateFolder(section) {
  if (!game.user?.isGM) return ui.notifications.warn("Adventurer's Tome: Folder creation for delegated Editors will use the GM broker in a later alpha.3 pass.");
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;

  const state = atCwEnsureLayout(sectionPage);
  const parent = state.selectedFolder || (state.roots.length === 1 ? state.roots[0] : null);
  if (!parent) return ui.notifications.warn(`Adventurer's Tome: Select the ${ATCW_SECTIONS[section].label} source where the new folder should be created.`);

  const name = String(await new Promise((resolve) => {
    const root = document.querySelector(ATCW_ROOT);
    const overlay = document.createElement("div");
    overlay.className = "at-cw-modal-overlay";
    overlay.innerHTML = `<form class="at-cw-modal">
      <header><div><span class="at-kicker">Campaign structure</span><h2>New Folder</h2></div><button type="button" data-at-cw-close><i class="fa-solid fa-xmark"></i></button></header>
      <label><span>Name</span><input name="name" required autocomplete="off"></label>
      <p>Creates a real Foundry Journal folder inside <strong>${atCwEscape(atCwFolderPath(parent))}</strong>.</p>
      <footer><button type="button" class="at-secondary" data-at-cw-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-folder-plus"></i> Create Folder</button></footer>
    </form>`;
    root?.append(overlay);

    const close = (value = "") => {
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-at-cw-close]")) close("");
    });
    overlay.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      close(String(new FormData(event.currentTarget).get("name") || "").trim());
    });
    overlay.querySelector("input")?.focus();
  })).trim();

  if (!name) return;

  try {
    const created = await Folder.create({ name, type: "JournalEntry", folder: parent.id });
    atCwSetState(section, "selected", created.id);
    atCwRequestStructuralRefresh(80);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer folder creation failed", error);
    ui.notifications.error("Adventurer's Tome: Could not create that folder.");
  }
}

function atCwDragTargetFolder(event) {
  const target = event.target.closest?.("[data-at-cw-drop-folder]");
  if (!target) return null;
  const folder = game.folders?.get(String(target.dataset.atCwDropFolder || ""));
  if (!folder) return null;
  return { target, folder };
}

function atCwFolderDropIsValid(folder, targetFolder) {
  if (!folder || !targetFolder) return false;
  if (folder.id === targetFolder.id) return false;
  if (atCwDescendantFolderIds(folder).has(targetFolder.id)) return false;
  return true;
}

function atCwClearDragUi() {
  document.querySelectorAll(`${ATCW_ROOT} .is-dragging`).forEach((node) => node.classList.remove("is-dragging"));
  document.querySelectorAll(`${ATCW_ROOT} .at-cw-drop-target`).forEach((node) => node.classList.remove("at-cw-drop-target"));
}

function atCwInstallInteractionHandlers() {
  document.addEventListener("click", (event) => {
    const explorer = event.target.closest?.(`${ATCW_ROOT} .at-cw-explorer`);
    if (!explorer) {
      const nav = event.target.closest?.(`${ATCW_ROOT} [data-action="navigate"]`);
      const tab = String(nav?.dataset?.tab || "");
      if (tab && ATCW_SECTIONS[tab]) {
        atCwScheduleMount(40);
        window.setTimeout(() => atCwMountActive(), 160);
      }
      return;
    }

    const sectionPage = atCwSectionFromPage();
    if (!sectionPage) return;
    const section = sectionPage.section;

    const showAll = event.target.closest?.("[data-at-cw-show-all]");
    if (showAll) {
      event.preventDefault();
      event.stopPropagation();
      atCwSelectFolder(sectionPage, "");
      return;
    }

    const toggle = event.target.closest?.("[data-at-cw-toggle-folder]");
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      atCwToggleFolder(section, toggle);
      return;
    }

    const select = event.target.closest?.("[data-at-cw-select-folder]");
    if (select) {
      event.preventDefault();
      event.stopPropagation();
      atCwSelectFolder(sectionPage, String(select.dataset.atCwSelectFolder || ""));
      return;
    }

    const open = event.target.closest?.("[data-at-cw-open-journal]");
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      atCwOpenJournal(section, String(open.dataset.atCwOpenJournal || ""));
      return;
    }

    if (event.target.closest?.("[data-at-cw-new-folder]")) {
      event.preventDefault();
      event.stopPropagation();
      void atCwCreateFolder(section);
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const root = event.target.closest?.(ATCW_ROOT);
    if (!root) return;
    const sectionPage = atCwSectionFromPage();
    if (!sectionPage) return;

    const handle = event.target.closest?.("[data-at-cw-drag-folder][draggable='true']");
    if (handle) {
      const id = String(handle.dataset.atCwDragFolder || "");
      const folder = game.folders?.get(id);
      if (!folder) return;

      event.stopPropagation();
      atCwActiveDrag = { kind: "folder", id, section: sectionPage.section };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATCW_FOLDER_MIME, id);
      handle.closest(".at-cw-tree-folder-row")?.classList.add("is-dragging");
      return;
    }

    const entry = event.target.closest?.("[data-at-cw-journal-id][draggable='true']");
    if (entry) {
      const id = String(entry.dataset.atCwJournalId || "");
      const journal = game.journal?.get(id);
      if (!journal) return;

      event.stopPropagation();
      atCwActiveDrag = { kind: "journal", id, section: sectionPage.section };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATCW_JOURNAL_MIME, id);
      entry.classList.add("is-dragging");
    }
  }, true);

  document.addEventListener("dragover", (event) => {
    const resolved = atCwDragTargetFolder(event);
    if (!resolved) return;
    const { target, folder: targetFolder } = resolved;

    const sectionPage = atCwSectionFromPage();
    if (!sectionPage) return;

    if (atCwActiveDrag?.kind === "folder") {
      const sourceFolder = game.folders?.get(atCwActiveDrag.id);
      if (!atCwFolderDropIsValid(sourceFolder, targetFolder)) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        target.classList.remove("at-cw-drop-target");
        return;
      }
    }

    const types = [...(event.dataTransfer?.types || [])];
    const internal = atCwActiveDrag && atCwActiveDrag.section === sectionPage.section;
    const externalJournal = !atCwActiveDrag && types.includes("text/plain");
    if (!internal && !externalJournal) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    target.classList.add("at-cw-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const target = event.target.closest?.("[data-at-cw-drop-folder]");
    if (target && !target.contains(event.relatedTarget)) target.classList.remove("at-cw-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const resolved = atCwDragTargetFolder(event);
    const sectionPage = atCwSectionFromPage();
    if (!resolved || !sectionPage) return;

    const { target, folder: targetFolder } = resolved;
    const journalId = String(event.dataTransfer?.getData?.(ATCW_JOURNAL_MIME) || (atCwActiveDrag?.kind === "journal" ? atCwActiveDrag.id : ""));
    const folderId = String(event.dataTransfer?.getData?.(ATCW_FOLDER_MIME) || (atCwActiveDrag?.kind === "folder" ? atCwActiveDrag.id : ""));
    const external = !journalId && !folderId ? atCwParseFoundryJournal(event.dataTransfer) : null;

    if (!journalId && !folderId && !external) return;

    if (folderId) {
      const sourceFolder = game.folders?.get(folderId);
      if (!atCwFolderDropIsValid(sourceFolder, targetFolder)) return;
    }

    event.preventDefault();
    event.stopPropagation();
    target.classList.remove("at-cw-drop-target");

    if (journalId) void atCwMoveJournal(sectionPage.section, game.journal?.get(journalId), targetFolder);
    else if (folderId) void atCwMoveFolder(sectionPage.section, game.folders?.get(folderId), targetFolder);
    else if (external) void atCwMoveJournal(sectionPage.section, external, targetFolder);
  }, true);

  document.addEventListener("dragend", () => {
    atCwActiveDrag = null;
    atCwClearDragUi();
    atCwFlushPendingRefresh();
  }, true);
}

Hooks.once("ready", () => {
  atCwInstallInteractionHandlers();
  atCwScheduleMount(180);
  window.setTimeout(() => atCwMountActive(), 600);
});

for (const hookName of ["renderApplication", "renderApplicationV2"]) {
  Hooks.on(hookName, () => atCwScheduleMount(50));
}

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atCwRequestStructuralRefresh(120));
}
