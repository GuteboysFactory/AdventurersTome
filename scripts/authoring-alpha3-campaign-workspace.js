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
let atCwQueued = false;
let atCwTimer = null;

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
  let current = folder;
  const seen = new Set();
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
  for (const [section, config] of Object.entries(ATCW_SECTIONS)) {
    const page = root?.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atCwStateKey(section, key) {
  return `adventurers-tome.campaign-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${key}`;
}

function atCwGetState(section, key, fallback = "") {
  try { return localStorage.getItem(atCwStateKey(section, key)) ?? fallback; } catch (_err) { return fallback; }
}

function atCwSetState(section, key, value) {
  try { localStorage.setItem(atCwStateKey(section, key), String(value ?? "")); } catch (_err) {}
}

function atCwCanManage(section) {
  if (game.user?.isGM) return true;
  const roots = [...(game.folders?.contents ?? [])].filter((folder) => folder.type === "JournalEntry" && /adventurer'?s tome/i.test(folder.name));
  for (const root of roots) {
    const roles = root.getFlag?.(ATCW_MODULE_ID, "sectionEditors") || {};
    if (Array.isArray(roles?.[section]) && roles[section].map(String).includes(String(game.user?.id || ""))) return true;
  }
  return false;
}

function atCwCaptureMetadata(page, config) {
  const map = new Map();
  for (const node of page.querySelectorAll(config.entry)) {
    const id = String(node.dataset.journalId || "");
    if (!id || map.has(id)) continue;
    const card = node.closest("button, article, li, div") || node;
    const img = card.querySelector?.("img")?.getAttribute("src") || "";
    const strong = card.querySelector?.("strong")?.textContent?.trim() || "";
    const heading = card.querySelector?.("h1,h2,h3")?.textContent?.trim() || "";
    const smalls = [...(card.querySelectorAll?.("small") || [])].map((el) => el.textContent?.trim()).filter(Boolean);
    const status = card.querySelector?.(".at-quest-status")?.textContent?.trim() || "";
    const subtitle = card.querySelector?.("b,em")?.textContent?.trim() || "";
    map.set(id, { img, name: strong || heading || "", summary: smalls[0] || "", secondary: smalls[1] || "", status, subtitle });
  }
  return map;
}

function atCwVisibleIds(page, config) {
  return new Set([...page.querySelectorAll(config.entry)].map((node) => String(node.dataset.journalId || "")).filter(Boolean));
}

function atCwRootCandidate(folder, section, visibleIds) {
  if (!folder || folder.type !== "JournalEntry" || folder.name !== ATCW_SECTIONS[section].label) return false;
  const subtree = atCwDescendantFolderIds(folder);
  if ([...(game.journal?.contents ?? [])].some((journal) => visibleIds.has(journal.id) && subtree.has(String(journal.folder?.id ?? journal.folder ?? "")))) return true;
  if (String(folder.getFlag?.(ATCW_MODULE_ID, "section") || "") === section) return true;
  return atCwFolderAncestors(folder).some((ancestor) => /adventurer'?s tome/i.test(ancestor.name));
}

function atCwSectionRoots(section, visibleIds) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => atCwRootCandidate(folder, section, visibleIds))
    .sort((a, b) => atCwFolderPath(a).localeCompare(atCwFolderPath(b)));
}

function atCwFolderHasVisible(folder, visibleIds) {
  if (game.user?.isGM) return true;
  const ids = atCwDescendantFolderIds(folder);
  return [...(game.journal?.contents ?? [])].some((journal) => visibleIds.has(journal.id) && ids.has(String(journal.folder?.id ?? journal.folder ?? "")));
}

function atCwChildFolders(folder, visibleIds) {
  return [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atCwParentId(child) === folder.id && atCwFolderHasVisible(child, visibleIds))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atCwDirectJournals(folder, visibleIds) {
  return [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id) && String(journal.folder?.id ?? journal.folder ?? "") === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function atCwFolderCounts(folder, visibleIds) {
  const ids = atCwDescendantFolderIds(folder);
  return {
    entries: [...(game.journal?.contents ?? [])].filter((journal) => visibleIds.has(journal.id) && ids.has(String(journal.folder?.id ?? journal.folder ?? ""))).length,
    folders: Math.max(0, ids.size - 1)
  };
}

function atCwFolderIcon(section, folder) {
  if (section === "world" && ATCW_CANONICAL_WORLD[folder?.name]) return ATCW_CANONICAL_WORLD[folder.name].icon;
  if (section === "quests") return "fa-folder-tree";
  if (section === "sessions") return "fa-box-archive";
  return "fa-folder";
}

function atCwTreeFolder(section, folder, selectedId, visibleIds, depth = 0) {
  const collapsed = atCwGetState(section, `collapsed.${folder.id}`, "0") === "1";
  const children = atCwChildFolders(folder, visibleIds);
  const journals = atCwDirectJournals(folder, visibleIds);
  const selected = folder.id === selectedId;
  return `<div class="at-cw-tree-folder ${collapsed ? "is-collapsed" : ""}" data-at-cw-folder="${atCwEscape(folder.id)}">
    <div class="at-cw-tree-folder-row ${selected ? "is-selected" : ""}" style="--at-tree-depth:${depth}" data-at-cw-drop-folder="${atCwEscape(folder.id)}">
      <button type="button" class="at-cw-chevron" data-at-cw-toggle-folder="${atCwEscape(folder.id)}"><i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i></button>
      <button type="button" class="at-cw-folder-open" data-at-cw-select-folder="${atCwEscape(folder.id)}" ${game.user?.isGM ? 'draggable="true" data-at-cw-drag-folder="true"' : ""}><i class="fa-solid ${atCwFolderIcon(section, folder)}"></i><span>${atCwEscape(folder.name)}</span></button>
    </div>
    <div class="at-cw-tree-children">${journals.map((journal) => `<button type="button" class="at-cw-tree-entry" style="--at-tree-depth:${depth + 1}" data-at-cw-open-journal="${atCwEscape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atCwEscape(journal.name)}</span></button>`).join("")}${children.map((child) => atCwTreeFolder(section, child, selectedId, visibleIds, depth + 1)).join("")}</div>
  </div>`;
}

function atCwRootTree(section, rootFolder, selectedId, visibleIds) {
  const parent = game.folders?.get(atCwParentId(rootFolder));
  const sourceLabel = parent ? parent.name : "Foundry Journals";
  return `<section class="at-cw-source-tree"><span class="at-cw-source-label">${atCwEscape(sourceLabel)}</span>${atCwTreeFolder(section, rootFolder, selectedId, visibleIds, 0)}</section>`;
}

function atCwFolderCard(section, folder, visibleIds) {
  const counts = atCwFolderCounts(folder, visibleIds);
  return `<article class="at-cw-folder-card" data-at-cw-drop-folder="${atCwEscape(folder.id)}" ${game.user?.isGM ? 'draggable="true" data-at-cw-drag-folder="true"' : ""}><button type="button" data-at-cw-select-folder="${atCwEscape(folder.id)}"><span class="at-cw-folder-card-icon"><i class="fa-solid ${atCwFolderIcon(section, folder)}"></i></span><span><strong>${atCwEscape(folder.name)}</strong><small>${counts.entries} ${counts.entries === 1 ? "entry" : "entries"}${counts.folders ? ` · ${counts.folders} ${counts.folders === 1 ? "folder" : "folders"}` : ""}</small></span><i class="fa-solid fa-chevron-right"></i></button></article>`;
}

function atCwEntryCard(section, journal, metadata) {
  const meta = metadata.get(journal.id) || {};
  const profile = section === "world" ? (journal.getFlag?.(ATCW_MODULE_ID, "worldProfile") || {}) : {};
  const img = String(profile.heroImage || meta.img || "").trim();
  const subtitle = String(meta.status || meta.subtitle || profile.subtitle || "").trim();
  const summary = String(meta.summary || profile.summary || "").trim();
  const icon = section === "quests" ? "fa-diamond" : section === "sessions" ? "fa-book-open" : "fa-book-open";
  return `<article class="at-cw-entry-card" data-at-cw-journal-id="${atCwEscape(journal.id)}" draggable="true"><button type="button" data-at-cw-open-journal="${atCwEscape(journal.id)}">${img ? `<span class="at-cw-entry-art"><img src="${atCwEscape(img)}" alt="${atCwEscape(journal.name)}"></span>` : `<span class="at-cw-entry-art at-no-image"><i class="fa-solid ${icon}"></i></span>`}<span class="at-cw-entry-copy">${subtitle ? `<em>${atCwEscape(subtitle)}</em>` : ""}<strong>${atCwEscape(journal.name)}</strong>${summary ? `<small>${atCwEscape(summary)}</small>` : ""}</span><i class="fa-solid fa-chevron-right"></i></button></article>`;
}

function atCwBreadcrumb(selected, roots) {
  if (!selected) return '<span>All sources</span>';
  const rootIds = new Set(roots.map((root) => root.id));
  const chain = [];
  let current = selected;
  while (current) {
    chain.unshift(current);
    if (rootIds.has(current.id)) break;
    current = game.folders?.get(atCwParentId(current));
  }
  return chain.map((folder, index) => `<button type="button" data-at-cw-select-folder="${atCwEscape(folder.id)}">${atCwEscape(folder.name)}</button>${index < chain.length - 1 ? '<i class="fa-solid fa-chevron-right"></i>' : ""}`).join("");
}

function atCwPreparePage(sectionPage) {
  const { section, config, page } = sectionPage;
  page.dataset.atA3TreeReady = "true";
  let source = page.querySelector(":scope > .at-cw-source");
  if (!source) {
    source = document.createElement("div");
    source.className = "at-cw-source";
    source.hidden = true;
    page.append(source);
  }

  const oldWorldSource = page.querySelector(":scope > .at-a3ww-source");
  if (oldWorldSource) {
    while (oldWorldSource.firstChild) source.append(oldWorldSource.firstChild);
    oldWorldSource.remove();
  }
  page.querySelector(":scope > .at-a3ww-workspace")?.remove();

  const oldLayout = page.querySelector(":scope > .at-a3-tree-layout");
  if (oldLayout) {
    const content = oldLayout.querySelector(":scope > .at-a3-tree-content");
    if (content) while (content.firstChild) source.append(content.firstChild);
    oldLayout.remove();
  }

  const heading = page.querySelector(":scope > .at-page-heading");
  for (const child of [...page.children]) {
    if (child === heading || child === source || child.classList.contains("at-cw-workspace")) continue;
    source.append(child);
  }

  const visibleIds = atCwVisibleIds(source, config);
  const metadata = atCwCaptureMetadata(source, config);
  const roots = atCwSectionRoots(section, visibleIds);
  let selectedId = atCwGetState(section, "selected", roots.length === 1 ? roots[0]?.id || "" : "");
  const validIds = new Set(roots.flatMap((root) => [...atCwDescendantFolderIds(root)]));
  if (selectedId && !validIds.has(selectedId)) selectedId = roots.length === 1 ? roots[0]?.id || "" : "";
  const selected = selectedId ? game.folders?.get(selectedId) : null;
  if (selectedId) atCwSetState(section, "selected", selectedId);

  let workspace = page.querySelector(":scope > .at-cw-workspace");
  if (!workspace) {
    workspace = document.createElement("section");
    workspace.className = "at-cw-workspace";
    heading?.insertAdjacentElement("afterend", workspace);
  }

  const sourceCards = roots.map((root) => atCwFolderCard(section, root, visibleIds)).join("");
  const childFolders = selected ? atCwChildFolders(selected, visibleIds) : [];
  const directJournals = selected ? atCwDirectJournals(selected, visibleIds) : [];
  const counts = selected ? atCwFolderCounts(selected, visibleIds) : { entries: [...visibleIds].length, folders: roots.length };
  const mainTitle = selected ? selected.name : ATCW_SECTIONS[section].label;
  const sourceSubtitle = selected ? atCwFolderPath(selected) : `${roots.length} Foundry ${roots.length === 1 ? "source" : "sources"}`;

  workspace.innerHTML = `<aside class="at-cw-explorer"><header><div><span class="at-kicker">Campaign Explorer</span><h2><i class="fa-solid ${config.icon}"></i> ${atCwEscape(config.label)}</h2></div></header><div class="at-cw-tree-scroll">${roots.length ? roots.map((root) => atCwRootTree(section, root, selectedId, visibleIds)).join("") : '<div class="at-empty">No matching Foundry folder structure yet.</div>'}</div></aside>
    <section class="at-cw-main" data-at-cw-section="${section}" data-at-cw-selected-folder="${atCwEscape(selectedId)}"><header class="at-cw-main-head"><div><nav class="at-cw-breadcrumbs">${atCwBreadcrumb(selected, roots)}</nav><span class="at-kicker">${selected ? "Foundry Journal folder" : "Campaign structure"}</span><h2>${atCwEscape(mainTitle)}</h2><p>${atCwEscape(sourceSubtitle)} · ${counts.entries} ${counts.entries === 1 ? "entry" : "entries"}</p></div>${atCwCanManage(section) ? '<div class="at-cw-main-actions"><button type="button" class="at-secondary" data-at-cw-new-folder><i class="fa-solid fa-folder-plus"></i> Folder</button></div>' : ""}</header>
      ${selected ? `<div class="at-cw-root-drop" data-at-cw-drop-folder="${atCwEscape(selected.id)}"><i class="fa-solid fa-arrow-down"></i><span>Drop entries or folders here to move them into ${atCwEscape(selected.name)}</span></div>` : ""}
      <section class="at-cw-folder-section"><div class="at-cw-section-title"><h3>${selected ? "Folders" : "Foundry sources"}</h3><span>${selected ? childFolders.length : roots.length}</span></div><div class="at-cw-folder-grid">${selected ? childFolders.map((folder) => atCwFolderCard(section, folder, visibleIds)).join("") : sourceCards}</div></section>
      ${selected ? `<section class="at-cw-entry-section"><div class="at-cw-section-title"><h3>Entries</h3><span>${directJournals.length}</span></div><div class="at-cw-entry-grid">${directJournals.map((journal) => atCwEntryCard(section, journal, metadata)).join("") || '<div class="at-empty at-wide">No entries in this folder yet.</div>'}</div></section>` : ""}
    </section>`;
}

function atCwQueue(delay = 100) {
  if (!atCwQueued) {
    atCwQueued = true;
    window.requestAnimationFrame(() => {
      atCwQueued = false;
      const sectionPage = atCwSectionFromPage();
      if (sectionPage) atCwPreparePage(sectionPage);
    });
  }
  window.clearTimeout(atCwTimer);
  atCwTimer = window.setTimeout(() => {
    const sectionPage = atCwSectionFromPage();
    if (sectionPage) atCwPreparePage(sectionPage);
  }, delay);
}

function atCwOpenJournal(section, journalId) {
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;
  const sourceButton = sectionPage.page.querySelector(`.at-cw-source ${ATCW_SECTIONS[section].entry}[data-journal-id="${CSS.escape(String(journalId))}"]`);
  sourceButton?.click();
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

function atCwWorldCategory(folder) {
  let current = folder;
  while (current) {
    if (ATCW_CANONICAL_WORLD[current.name]) return ATCW_CANONICAL_WORLD[current.name].category;
    current = game.folders?.get(atCwParentId(current));
  }
  return "lore";
}

async function atCwAdoptJournal(section, journal, targetFolder) {
  if (!game.user?.isGM) throw new Error("A GM must adopt a regular Foundry Journal into Tome the first time.");
  if (section === "world") {
    const raw = journal.getFlag?.(ATCW_MODULE_ID, "worldProfile");
    const profile = raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
    profile.category = profile.category || atCwWorldCategory(targetFolder);
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
      const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Overview", type: "text", text: { content: '<h2 data-at-tome-summary="true"></h2><p></p>', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 }, sort: 100000 }]);
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

function atCwJournalBelongs(section, journal, visibleIds) {
  if (visibleIds.has(journal.id)) return true;
  const type = String(journal.getFlag?.(ATCW_MODULE_ID, "type") || "").toLowerCase();
  return (section === "world" && type === "world") || (section === "quests" && (type === "quests" || type === "quest")) || (section === "sessions" && (type === "sessions" || type === "session"));
}

async function atCwMoveJournal(section, journal, targetFolder) {
  if (!journal || !targetFolder) return;
  const sectionPage = atCwSectionFromPage();
  const visibleIds = sectionPage ? atCwVisibleIds(sectionPage.page.querySelector(":scope > .at-cw-source"), sectionPage.config) : new Set();
  const canEdit = Boolean(game.user?.isGM || journal.isOwner || journal.testUserPermission?.(game.user, "OWNER"));
  if (!canEdit) return ui.notifications.warn("Adventurer's Tome: You do not have permission to move that Journal.");
  try {
    const belongs = atCwJournalBelongs(section, journal, visibleIds);
    if (!belongs) await atCwAdoptJournal(section, journal, targetFolder);
    await journal.update({ folder: targetFolder.id });
    if (section === "world") {
      const raw = journal.getFlag?.(ATCW_MODULE_ID, "worldProfile");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const profile = foundry.utils.deepClone(raw);
        const category = atCwWorldCategory(targetFolder);
        if (profile.category !== category) { profile.category = category; await journal.setFlag(ATCW_MODULE_ID, "worldProfile", profile); }
      }
    }
    ui.notifications.info(`Adventurer's Tome: ${belongs ? "Moved" : "Added"} ${journal.name} to ${targetFolder.name}.`);
    await atCwApp()?.render?.({ parts: ["main"] });
  } catch (error) {
    console.error("Adventurer's Tome | Campaign workspace Journal move failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not move that Journal."}`);
  }
}

async function atCwMoveFolder(section, folder, targetFolder) {
  if (!game.user?.isGM || !folder || !targetFolder) return;
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;
  const visibleIds = atCwVisibleIds(sectionPage.page.querySelector(":scope > .at-cw-source"), sectionPage.config);
  const roots = atCwSectionRoots(section, visibleIds);
  const rootIds = new Set(roots.map((root) => root.id));
  if (rootIds.has(folder.id)) return ui.notifications.warn("Adventurer's Tome: A section source root cannot be moved inside itself.");
  if (folder.id === targetFolder.id || atCwDescendantFolderIds(folder).has(targetFolder.id)) return ui.notifications.warn("Adventurer's Tome: A folder cannot be moved into itself or one of its children.");
  try {
    await folder.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${folder.name} into ${targetFolder.name}.`);
    atCwQueue(140);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign workspace folder move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that folder.");
  }
}

function atCwNewFolder(section) {
  if (!atCwCanManage(section)) return;
  const sectionPage = atCwSectionFromPage();
  if (!sectionPage || sectionPage.section !== section) return;
  const selectedId = String(sectionPage.page.querySelector(".at-cw-main")?.dataset?.atCwSelectedFolder || "");
  const selected = game.folders?.get(selectedId);
  const visibleIds = atCwVisibleIds(sectionPage.page.querySelector(":scope > .at-cw-source"), sectionPage.config);
  const roots = atCwSectionRoots(section, visibleIds);
  const parent = selected || (roots.length === 1 ? roots[0] : null);
  if (!parent) return ui.notifications.warn(`Adventurer's Tome: Open the ${ATCW_SECTIONS[section].label} source where you want the new folder first.`);
  if (!game.user?.isGM) return document.querySelector(`${ATCW_ROOT} [data-at-a3-new-folder]`)?.click();
  const overlay = document.createElement("div");
  overlay.className = "at-cw-modal-overlay";
  overlay.innerHTML = `<form class="at-cw-modal"><header><div><span class="at-kicker">Campaign structure</span><h2>New Folder</h2></div><button type="button" data-at-cw-close><i class="fa-solid fa-xmark"></i></button></header><label><span>Name</span><input name="name" required autocomplete="off"></label><p>Create a real Foundry Journal folder inside <strong>${atCwEscape(atCwFolderPath(parent))}</strong>.</p><footer><button type="button" class="at-secondary" data-at-cw-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-folder-plus"></i> Create Folder</button></footer></form>`;
  document.querySelector(ATCW_ROOT)?.append(overlay);
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-at-cw-close]")) overlay.remove(); });
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) return;
    const created = await Folder.create({ name, type: "JournalEntry", folder: parent.id });
    atCwSetState(section, "selected", created.id);
    overlay.remove();
    atCwQueue(120);
  });
}

function atCwApp() {
  try { return game.modules.get(ATCW_MODULE_ID)?.api?.app?.(); } catch (_err) { return null; }
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const sectionPage = atCwSectionFromPage();
    if (!sectionPage) return;
    const { section, page } = sectionPage;
    const select = event.target.closest?.("[data-at-cw-select-folder]");
    if (select) {
      event.preventDefault(); event.stopImmediatePropagation();
      atCwSetState(section, "selected", String(select.dataset.atCwSelectFolder || ""));
      atCwPreparePage(sectionPage);
      return;
    }
    const toggle = event.target.closest?.("[data-at-cw-toggle-folder]");
    if (toggle) {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = String(toggle.dataset.atCwToggleFolder || "");
      const collapsed = atCwGetState(section, `collapsed.${id}`, "0") === "1";
      atCwSetState(section, `collapsed.${id}`, collapsed ? "0" : "1");
      atCwPreparePage(sectionPage);
      return;
    }
    const open = event.target.closest?.("[data-at-cw-open-journal]");
    if (open) {
      event.preventDefault(); event.stopImmediatePropagation();
      atCwOpenJournal(section, String(open.dataset.atCwOpenJournal || ""));
      return;
    }
    if (event.target.closest?.("[data-at-cw-new-folder]")) {
      event.preventDefault(); event.stopImmediatePropagation();
      atCwNewFolder(section);
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const entry = event.target.closest?.(".at-cw-entry-card[draggable='true'], .at-cw-tree-entry[draggable='true']");
    if (entry) {
      const id = String(entry.dataset.atCwJournalId || entry.dataset.atCwOpenJournal || "");
      if (!id) return;
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATCW_JOURNAL_MIME, id);
      entry.classList.add("is-dragging");
      return;
    }
    const folder = event.target.closest?.("[data-at-cw-drag-folder='true']");
    if (folder) {
      const folderId = String(folder.closest("[data-at-cw-folder]")?.dataset?.atCwFolder || folder.closest("[data-at-cw-drop-folder]")?.dataset?.atCwDropFolder || "");
      if (!folderId) return;
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATCW_FOLDER_MIME, folderId);
      folder.classList.add("is-dragging");
    }
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".is-dragging")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-cw-drop-target").forEach((node) => node.classList.remove("at-cw-drop-target"));
  }, true);

  document.addEventListener("dragover", (event) => {
    const target = event.target.closest?.("[data-at-cw-drop-folder]");
    if (!target) return;
    const types = [...(event.dataTransfer?.types || [])];
    if (!types.includes(ATCW_JOURNAL_MIME) && !types.includes(ATCW_FOLDER_MIME) && !types.includes("text/plain")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    target.classList.add("at-cw-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const target = event.target.closest?.("[data-at-cw-drop-folder]");
    if (target && !target.contains(event.relatedTarget)) target.classList.remove("at-cw-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const sectionPage = atCwSectionFromPage();
    const target = event.target.closest?.("[data-at-cw-drop-folder]");
    if (!sectionPage || !target) return;
    const { section } = sectionPage;
    const targetFolder = game.folders?.get(String(target.dataset.atCwDropFolder || ""));
    if (!targetFolder) return;
    const journalId = String(event.dataTransfer?.getData?.(ATCW_JOURNAL_MIME) || "");
    const folderId = String(event.dataTransfer?.getData?.(ATCW_FOLDER_MIME) || "");
    const external = !journalId && !folderId ? atCwParseFoundryJournal(event.dataTransfer) : null;
    if (!journalId && !folderId && !external) return;
    event.preventDefault(); event.stopImmediatePropagation();
    target.classList.remove("at-cw-drop-target");
    if (journalId) return void atCwMoveJournal(section, game.journal?.get(journalId), targetFolder);
    if (folderId) return void atCwMoveFolder(section, game.folders?.get(folderId), targetFolder);
    if (external) return void atCwMoveJournal(section, external, targetFolder);
  }, true);

  const observer = new MutationObserver(() => atCwQueue(100));
  observer.observe(document.body, { childList: true, subtree: true });
  atCwQueue(120);
});

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atCwQueue(140));
}
