const ATA3TS_MODULE_ID = "adventurers-tome";
const ATA3TS_ROOT = "#adventurers-tome-app";
const ATA3TS_JOURNAL_DRAG = "text/x-adventurers-tome-tree-journal";
const ATA3TS_FOLDER_DRAG = "text/x-adventurers-tome-tree-folder";
const ATA3TS_SECTIONS = Object.freeze({
  world: { label: "World", icon: "fa-earth-europe" },
  quests: { label: "Quests", icon: "fa-diamond" },
  sessions: { label: "Sessions", icon: "fa-book-open" }
});
let atA3TsQueued = false;
let atA3TsTimer = null;

function atA3TsEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA3TsParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atA3TsRootFolder() {
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome" && !atA3TsParentId(folder)) ||
    [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome") || null;
}

function atA3TsSectionFolder(section) {
  const root = atA3TsRootFolder();
  const label = ATA3TS_SECTIONS[section]?.label;
  if (!root || !label) return null;
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === label && atA3TsParentId(folder) === root.id) || null;
}

function atA3TsDescendantIds(rootFolder) {
  const ids = new Set();
  if (!rootFolder) return ids;
  ids.add(rootFolder.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atA3TsParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atA3TsCollapsedKey(section, folderId) {
  return `adventurers-tome.tree.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${folderId}`;
}

function atA3TsCollapsed(section, folderId) {
  try { return localStorage.getItem(atA3TsCollapsedKey(section, folderId)) === "1"; } catch (_err) { return false; }
}

function atA3TsVisibleJournalIds(section) {
  const root = document.querySelector(ATA3TS_ROOT);
  if (!root) return new Set();
  const page = section === "world" ? root.querySelector(".at-world-page") : section === "quests" ? root.querySelector(".at-quests-page") : root.querySelector(".at-sessions-page");
  if (!page) return new Set();
  const selector = section === "world"
    ? '[data-action="openWorldProfile"][data-journal-id]'
    : section === "quests"
      ? '[data-action="openQuestDetail"][data-journal-id]'
      : '[data-action="selectSession"][data-journal-id]';
  return new Set([...page.querySelectorAll(selector)].map((node) => String(node.dataset.journalId || "")).filter(Boolean));
}

function atA3TsFolderMarkup(folder, section, journalIds, depth = 0) {
  const collapsed = atA3TsCollapsed(section, folder.id);
  const childFolders = [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atA3TsParentId(child) === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const journals = [...(game.journal?.contents ?? [])]
    .filter((journal) => String(journal.folder?.id ?? journal.folder ?? "") === folder.id && journalIds.has(journal.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const children = [
    ...childFolders.map((child) => atA3TsFolderMarkup(child, section, journalIds, depth + 1)),
    ...journals.map((journal) => `<button type="button" class="at-a3-tree-entry" style="--at-tree-depth:${depth + 1}" data-at-a3-open-journal="${atA3TsEscape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atA3TsEscape(journal.name)}</span></button>`)
  ].join("");
  return `<div class="at-a3-tree-folder ${collapsed ? "is-collapsed" : ""}" data-at-a3-folder-id="${atA3TsEscape(folder.id)}"><button type="button" class="at-a3-tree-folder-row" style="--at-tree-depth:${depth}" data-at-a3-folder-toggle="${atA3TsEscape(folder.id)}" data-at-a3-folder-drop="${atA3TsEscape(folder.id)}" ${game.user?.isGM ? 'draggable="true"' : ""}><i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i><i class="fa-solid fa-folder"></i><span>${atA3TsEscape(folder.name)}</span></button><div class="at-a3-tree-children">${children}</div></div>`;
}

function atA3TsRefreshTree(tree) {
  if (!tree?.isConnected) return;
  const section = String(tree.dataset.section || "");
  if (!ATA3TS_SECTIONS[section]) return;
  const scroll = tree.querySelector(".at-a3-tree-scroll");
  if (!scroll) return;
  const rootFolder = atA3TsSectionFolder(section);
  const journalIds = atA3TsVisibleJournalIds(section);
  const descendantIds = atA3TsDescendantIds(rootFolder);
  const rootMarkup = rootFolder ? atA3TsFolderMarkup(rootFolder, section, journalIds, 0) : '<div class="at-empty">Tome folders have not been created yet.</div>';
  const unfiled = [...(game.journal?.contents ?? [])]
    .filter((journal) => journalIds.has(journal.id) && (!rootFolder || !descendantIds.has(String(journal.folder?.id ?? journal.folder ?? ""))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  scroll.innerHTML = `${rootMarkup}${unfiled.length ? `<div class="at-a3-tree-unfiled"><span>Unfiled</span>${unfiled.map((journal) => `<button type="button" class="at-a3-tree-entry" data-at-a3-open-journal="${atA3TsEscape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atA3TsEscape(journal.name)}</span></button>`).join("")}</div>` : ""}`;
}

function atA3TsRefreshAll() {
  const root = document.querySelector(ATA3TS_ROOT);
  if (!root) return;
  for (const tree of root.querySelectorAll(".at-a3-campaign-tree")) atA3TsRefreshTree(tree);
}

function atA3TsQueue(delay = 40) {
  if (!atA3TsQueued) {
    atA3TsQueued = true;
    window.requestAnimationFrame(() => {
      atA3TsQueued = false;
      atA3TsRefreshAll();
    });
  }
  window.clearTimeout(atA3TsTimer);
  atA3TsTimer = window.setTimeout(atA3TsRefreshAll, delay);
}

function atA3TsSectionForTreeTarget(target) {
  return String(target?.closest?.(".at-a3-campaign-tree")?.dataset?.section || "");
}

function atA3TsFolderBelongsToSection(folder, section) {
  const root = atA3TsSectionFolder(section);
  return Boolean(root && atA3TsDescendantIds(root).has(folder?.id));
}

function atA3TsFolderWouldCycle(folder, targetFolder) {
  if (!folder || !targetFolder) return true;
  if (folder.id === targetFolder.id) return true;
  return atA3TsDescendantIds(folder).has(targetFolder.id);
}

async function atA3TsMoveFolder(folder, targetFolder, section) {
  if (!game.user?.isGM) return;
  const sectionRoot = atA3TsSectionFolder(section);
  if (!folder || !targetFolder || !sectionRoot) return;
  if (folder.id === sectionRoot.id) return ui.notifications.warn("Adventurer's Tome: The section root cannot be moved.");
  if (!atA3TsFolderBelongsToSection(folder, section) || !atA3TsFolderBelongsToSection(targetFolder, section)) return;
  if (atA3TsFolderWouldCycle(folder, targetFolder)) return ui.notifications.warn("Adventurer's Tome: A folder cannot be moved inside itself or one of its children.");
  try {
    await folder.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${folder.name} into ${targetFolder.name}.`);
    atA3TsQueue(120);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer folder move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that folder.");
  }
}

function atA3TsJournalFromFoundryDrag(dataTransfer) {
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

async function atA3TsMoveExternalJournal(journal, targetFolder, section) {
  if (!journal || !targetFolder) return;
  const root = atA3TsSectionFolder(section);
  if (!root || !atA3TsDescendantIds(root).has(targetFolder.id)) return;
  const owner = Boolean(game.user?.isGM || journal.isOwner || journal.testUserPermission?.(game.user, "OWNER"));
  if (!owner) return ui.notifications.warn("Adventurer's Tome: You do not have permission to move that Journal.");
  try {
    await journal.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${journal.name} into ${targetFolder.name}.`);
    atA3TsQueue(140);
  } catch (error) {
    console.error("Adventurer's Tome | Foundry Journal drop failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that Journal.");
  }
}

Hooks.once("ready", () => {
  document.addEventListener("dragstart", (event) => {
    const folderRow = event.target.closest?.(".at-a3-tree-folder-row[draggable='true']");
    if (!folderRow || event.target.closest("input, select, button:not(.at-a3-tree-folder-row)")) return;
    const folderId = String(folderRow.dataset.atA3FolderToggle || folderRow.dataset.atA3FolderDrop || "");
    if (!folderId) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(ATA3TS_FOLDER_DRAG, folderId);
    folderRow.classList.add("is-dragging");
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".at-a3-tree-folder-row")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-a3-tree-folder-row.is-drop-target").forEach((row) => row.classList.remove("is-drop-target"));
  }, true);

  document.addEventListener("dragover", (event) => {
    const folderRow = event.target.closest?.("[data-at-a3-folder-drop]");
    if (!folderRow) return;
    const types = [...(event.dataTransfer?.types || [])];
    const internalJournal = types.includes(ATA3TS_JOURNAL_DRAG);
    const internalFolder = types.includes(ATA3TS_FOLDER_DRAG);
    const possibleFoundry = types.includes("text/plain");
    if (!internalJournal && !internalFolder && !possibleFoundry) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    folderRow.classList.add("is-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const folderRow = event.target.closest?.("[data-at-a3-folder-drop]");
    if (!folderRow) return;
    const section = atA3TsSectionForTreeTarget(folderRow);
    const targetFolder = game.folders?.get(String(folderRow.dataset.atA3FolderDrop || ""));
    if (!targetFolder || !section) return;

    const draggedFolderId = String(event.dataTransfer?.getData?.(ATA3TS_FOLDER_DRAG) || "");
    if (draggedFolderId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      folderRow.classList.remove("is-drop-target");
      const draggedFolder = game.folders?.get(draggedFolderId);
      void atA3TsMoveFolder(draggedFolder, targetFolder, section);
      return;
    }

    const internalJournalId = String(event.dataTransfer?.getData?.(ATA3TS_JOURNAL_DRAG) || "");
    if (internalJournalId) {
      // Alpha 3's own drop handler performs the actual move. This trailing
      // refresh fixes the stale Explorer tree after Foundry has accepted it.
      window.setTimeout(atA3TsRefreshAll, 80);
      window.setTimeout(atA3TsRefreshAll, 220);
      return;
    }

    const externalJournal = atA3TsJournalFromFoundryDrag(event.dataTransfer);
    if (externalJournal) {
      event.preventDefault();
      event.stopImmediatePropagation();
      folderRow.classList.remove("is-drop-target");
      void atA3TsMoveExternalJournal(externalJournal, targetFolder, section);
    }
  }, true);

  const observer = new MutationObserver(() => atA3TsQueue(90));
  observer.observe(document.body, { childList: true, subtree: true });
  atA3TsQueue(100);
});

Hooks.on("updateJournalEntry", (_journal, changes) => {
  if (Object.prototype.hasOwnProperty.call(changes || {}, "folder")) atA3TsQueue(120);
});
for (const hookName of ["createJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atA3TsQueue(140));
}
