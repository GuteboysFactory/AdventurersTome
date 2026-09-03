const ATA3V2_MODULE_ID = "adventurers-tome";
const ATA3V2_ROOT = "#adventurers-tome-app";
const ATA3V2_JOURNAL_MIME = "text/x-adventurers-tome-v2-journal";
const ATA3V2_FOLDER_MIME = "text/x-adventurers-tome-v2-folder";
const ATA3V2_SECTIONS = Object.freeze({
  world: { label: "World", icon: "fa-earth-europe" },
  quests: { label: "Quests", icon: "fa-diamond" },
  sessions: { label: "Sessions", icon: "fa-book-open" }
});
let atA3V2Queued = false;
let atA3V2Timer = null;

function atA3V2Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA3V2ParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atA3V2RootFolder() {
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome" && !atA3V2ParentId(folder)) ||
    [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === "Adventurer's Tome") || null;
}

function atA3V2SectionFolder(section) {
  const root = atA3V2RootFolder();
  const label = ATA3V2_SECTIONS[section]?.label;
  if (!root || !label) return null;
  return [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === label && atA3V2ParentId(folder) === root.id) || null;
}

function atA3V2DescendantFolderIds(rootFolder) {
  const ids = new Set();
  if (!rootFolder) return ids;
  ids.add(rootFolder.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of game.folders?.contents ?? []) {
      if (folder.type !== "JournalEntry" || ids.has(folder.id)) continue;
      if (ids.has(atA3V2ParentId(folder))) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function atA3V2SectionPage(root) {
  if (root?.querySelector(".at-world-page")) return { section: "world", page: root.querySelector(".at-world-page") };
  if (root?.querySelector(".at-quests-page")) return { section: "quests", page: root.querySelector(".at-quests-page") };
  if (root?.querySelector(".at-sessions-page")) return { section: "sessions", page: root.querySelector(".at-sessions-page") };
  return null;
}

function atA3V2VisibleJournalIds(page, section) {
  const selector = section === "world"
    ? '[data-action="openWorldProfile"][data-journal-id]'
    : section === "quests"
      ? '[data-action="openQuestDetail"][data-journal-id]'
      : '[data-action="selectSession"][data-journal-id]';
  return new Set([...page.querySelectorAll(selector)].map((node) => String(node.dataset.journalId || "")).filter(Boolean));
}

function atA3V2StateKey(section, kind, id) {
  return `adventurers-tome.tree-v2.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${kind}.${id}`;
}

function atA3V2Collapsed(section, kind, id, fallback = false) {
  try {
    const value = localStorage.getItem(atA3V2StateKey(section, kind, id));
    return value == null ? fallback : value === "1";
  } catch (_err) {
    return fallback;
  }
}

function atA3V2SetCollapsed(section, kind, id, collapsed) {
  try { localStorage.setItem(atA3V2StateKey(section, kind, id), collapsed ? "1" : "0"); } catch (_err) {}
}

function atA3V2CanManageFolder(section) {
  if (game.user?.isGM) return true;
  const root = atA3V2RootFolder();
  const roles = root?.getFlag?.(ATA3V2_MODULE_ID, "sectionEditors") || {};
  return Array.isArray(roles?.[section]) && roles[section].map(String).includes(String(game.user?.id || ""));
}

function atA3V2JournalMarkup(journal, depth = 0) {
  return `<button type="button" class="at-a3v2-entry" style="--at-tree-depth:${depth}" data-at-a3v2-open-journal="${atA3V2Escape(journal.id)}" draggable="true"><i class="fa-solid fa-file-lines"></i><span>${atA3V2Escape(journal.name)}</span></button>`;
}

function atA3V2FolderMarkup(folder, section, visibleIds, depth = 0) {
  const collapsed = atA3V2Collapsed(section, "folder", folder.id, false);
  const childFolders = [...(game.folders?.contents ?? [])]
    .filter((child) => child.type === "JournalEntry" && atA3V2ParentId(child) === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const journals = [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id) && String(journal.folder?.id ?? journal.folder ?? "") === folder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const children = [
    ...journals.map((journal) => atA3V2JournalMarkup(journal, depth + 1)),
    ...childFolders.map((child) => atA3V2FolderMarkup(child, section, visibleIds, depth + 1))
  ].join("");
  const count = journals.length + childFolders.length;
  return `<div class="at-a3v2-folder ${collapsed ? "is-collapsed" : ""}" data-at-a3v2-folder="${atA3V2Escape(folder.id)}">
    <button type="button" class="at-a3v2-folder-row" style="--at-tree-depth:${depth}" data-at-a3v2-toggle-folder="${atA3V2Escape(folder.id)}" data-at-a3v2-drop-folder="${atA3V2Escape(folder.id)}" ${game.user?.isGM ? 'draggable="true"' : ""}>
      <i class="fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-down"} at-a3v2-chevron"></i><i class="fa-solid fa-folder"></i><span>${atA3V2Escape(folder.name)}</span>${count ? `<small>${count}</small>` : ""}
    </button><div class="at-a3v2-children">${children}</div>
  </div>`;
}

function atA3V2BuildStamp(section, visibleIds) {
  const sectionFolder = atA3V2SectionFolder(section);
  const folderIds = atA3V2DescendantFolderIds(sectionFolder);
  const folders = [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === "JournalEntry" && folderIds.has(folder.id))
    .map((folder) => `${folder.id}:${atA3V2ParentId(folder)}:${folder.name}`)
    .sort();
  const journals = [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id))
    .map((journal) => `${journal.id}:${String(journal.folder?.id ?? journal.folder ?? "")}:${journal.name}`)
    .sort();
  return `${section}|${folders.join("|")}|${journals.join("|")}`;
}

function atA3V2TreeMarkup(section, page) {
  const def = ATA3V2_SECTIONS[section];
  const sectionFolder = atA3V2SectionFolder(section);
  const visibleIds = atA3V2VisibleJournalIds(page, section);
  const insideIds = atA3V2DescendantFolderIds(sectionFolder);
  const direct = sectionFolder ? [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id) && String(journal.folder?.id ?? journal.folder ?? "") === sectionFolder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
  const childFolders = sectionFolder ? [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === "JournalEntry" && atA3V2ParentId(folder) === sectionFolder.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
  const unsorted = [...(game.journal?.contents ?? [])]
    .filter((journal) => visibleIds.has(journal.id) && (!sectionFolder || !insideIds.has(String(journal.folder?.id ?? journal.folder ?? ""))))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const unsortedCollapsed = atA3V2Collapsed(section, "special", "unsorted", true);
  const main = sectionFolder
    ? [...direct.map((journal) => atA3V2JournalMarkup(journal, 0)), ...childFolders.map((folder) => atA3V2FolderMarkup(folder, section, visibleIds, 0))].join("") || '<div class="at-a3v2-empty">No entries are filed in this Tome section yet.</div>'
    : '<div class="at-a3v2-empty">The Foundry section folder is missing. Use Tome Create to initialize it.</div>';
  const unsortedBlock = unsorted.length ? `<div class="at-a3v2-unsorted ${unsortedCollapsed ? "is-collapsed" : ""}" data-at-a3v2-unsorted>
      <button type="button" class="at-a3v2-special-row" data-at-a3v2-toggle-unsorted><i class="fa-solid ${unsortedCollapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i><i class="fa-solid fa-box-archive"></i><span>Outside ${atA3V2Escape(def.label)} folders</span><small>${unsorted.length}</small></button>
      <div class="at-a3v2-unsorted-children">${unsorted.map((journal) => atA3V2JournalMarkup(journal, 1)).join("")}</div>
    </div>` : "";
  const stamp = atA3V2BuildStamp(section, visibleIds);
  return { stamp, html: `<aside class="at-a3-campaign-tree at-a3v2-tree" data-section="${section}" data-at-a3v2-stamp="${atA3V2Escape(stamp)}">
    <header><div><span class="at-kicker">Campaign Explorer</span><h2><i class="fa-solid ${def.icon}"></i> ${def.label}</h2></div><div class="at-a3-tree-actions">${game.user?.isGM ? '<button type="button" data-at-a3-editors title="Manage Tome Editors"><i class="fa-solid fa-user-pen"></i></button>' : ""}${atA3V2CanManageFolder(section) ? '<button type="button" data-at-a3-new-folder title="New folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}</div></header>
    <div class="at-a3v2-root-drop" ${sectionFolder ? `data-at-a3v2-drop-folder="${atA3V2Escape(sectionFolder.id)}"` : ""}><span><i class="fa-solid fa-arrow-turn-down"></i> Drop here to move to ${def.label} root</span></div>
    <div class="at-a3-tree-scroll at-a3v2-scroll">${main}${unsortedBlock}</div>
  </aside>` };
}

function atA3V2EnsureTree() {
  const root = document.querySelector(ATA3V2_ROOT);
  const sectionPage = atA3V2SectionPage(root);
  if (!root || !sectionPage) return;
  const { section, page } = sectionPage;
  const layout = page.querySelector(":scope > .at-a3-tree-layout");
  if (!layout) return;
  const current = layout.querySelector(":scope > .at-a3-campaign-tree");
  const built = atA3V2TreeMarkup(section, page);
  if (current?.classList.contains("at-a3v2-tree") && current.dataset.atA3v2Stamp === built.stamp) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = built.html;
  const next = wrapper.firstElementChild;
  if (current) current.replaceWith(next);
  else layout.prepend(next);
}

function atA3V2Queue(delay = 80) {
  if (!atA3V2Queued) {
    atA3V2Queued = true;
    window.requestAnimationFrame(() => {
      atA3V2Queued = false;
      atA3V2EnsureTree();
    });
  }
  window.clearTimeout(atA3V2Timer);
  atA3V2Timer = window.setTimeout(atA3V2EnsureTree, delay);
}

function atA3V2OpenJournal(section, journalId) {
  const root = document.querySelector(ATA3V2_ROOT);
  const selector = section === "world"
    ? `[data-action="openWorldProfile"][data-journal-id="${CSS.escape(journalId)}"]`
    : section === "quests"
      ? `[data-action="openQuestDetail"][data-journal-id="${CSS.escape(journalId)}"]`
      : `[data-action="selectSession"][data-journal-id="${CSS.escape(journalId)}"]`;
  root?.querySelector(selector)?.click();
}

function atA3V2SectionFromTree(target) {
  return String(target?.closest?.(".at-a3v2-tree")?.dataset?.section || "");
}

function atA3V2FolderInSection(folder, section) {
  const root = atA3V2SectionFolder(section);
  return Boolean(root && atA3V2DescendantFolderIds(root).has(folder?.id));
}

function atA3V2FolderCycle(folder, targetFolder) {
  if (!folder || !targetFolder) return true;
  if (folder.id === targetFolder.id) return true;
  return atA3V2DescendantFolderIds(folder).has(targetFolder.id);
}

async function atA3V2MoveJournal(journal, targetFolder, section) {
  if (!journal || !targetFolder || !atA3V2FolderInSection(targetFolder, section)) return;
  const canEdit = Boolean(game.user?.isGM || journal.isOwner || journal.testUserPermission?.(game.user, "OWNER"));
  if (!canEdit) return ui.notifications.warn("Adventurer's Tome: You do not have permission to move that entry.");
  try {
    await journal.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${journal.name} to ${targetFolder.name}.`);
    atA3V2Queue(120);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer entry move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that entry.");
  }
}

async function atA3V2MoveFolder(folder, targetFolder, section) {
  if (!game.user?.isGM) return;
  const sectionRoot = atA3V2SectionFolder(section);
  if (!folder || !targetFolder || !sectionRoot) return;
  if (folder.id === sectionRoot.id) return ui.notifications.warn("Adventurer's Tome: The section root cannot be moved.");
  if (!atA3V2FolderInSection(folder, section) || !atA3V2FolderInSection(targetFolder, section)) return;
  if (atA3V2FolderCycle(folder, targetFolder)) return ui.notifications.warn("Adventurer's Tome: A folder cannot be moved inside itself or one of its children.");
  try {
    await folder.update({ folder: targetFolder.id });
    ui.notifications.info(`Adventurer's Tome: Moved ${folder.name} into ${targetFolder.name}.`);
    atA3V2Queue(120);
  } catch (error) {
    console.error("Adventurer's Tome | Campaign Explorer folder move failed", error);
    ui.notifications.error("Adventurer's Tome: Could not move that folder.");
  }
}

function atA3V2FoundryJournalFromDrag(dataTransfer) {
  const plain = String(dataTransfer?.getData?.("text/plain") || "").trim();
  if (!plain) return null;
  try {
    const data = JSON.parse(plain);
    const id = String(data?.id || data?.documentId || "").trim();
    if (id && game.journal?.get(id)) return game.journal.get(id);
    const uuid = String(data?.uuid || data?.documentUuid || "").trim();
    const match = uuid.match(/^JournalEntry\.([^.]+)$/i);
    if (match && game.journal?.get(match[1])) return game.journal.get(match[1]);
  } catch (_err) {}
  return null;
}

function atA3V2CurrentVisibleIds(section) {
  const root = document.querySelector(ATA3V2_ROOT);
  const page = section === "world" ? root?.querySelector(".at-world-page") : section === "quests" ? root?.querySelector(".at-quests-page") : root?.querySelector(".at-sessions-page");
  return page ? atA3V2VisibleJournalIds(page, section) : new Set();
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const open = event.target.closest?.("[data-at-a3v2-open-journal]");
    if (open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      atA3V2OpenJournal(atA3V2SectionFromTree(open), String(open.dataset.atA3v2OpenJournal || ""));
      return;
    }

    const folderToggle = event.target.closest?.("[data-at-a3v2-toggle-folder]");
    if (folderToggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const section = atA3V2SectionFromTree(folderToggle);
      const folderId = String(folderToggle.dataset.atA3v2ToggleFolder || "");
      const folder = folderToggle.closest(".at-a3v2-folder");
      const collapsed = !folder?.classList.contains("is-collapsed");
      folder?.classList.toggle("is-collapsed", collapsed);
      const chevron = folderToggle.querySelector(".at-a3v2-chevron");
      chevron?.classList.toggle("fa-chevron-right", collapsed);
      chevron?.classList.toggle("fa-chevron-down", !collapsed);
      atA3V2SetCollapsed(section, "folder", folderId, collapsed);
      return;
    }

    const unsortedToggle = event.target.closest?.("[data-at-a3v2-toggle-unsorted]");
    if (unsortedToggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const section = atA3V2SectionFromTree(unsortedToggle);
      const block = unsortedToggle.closest(".at-a3v2-unsorted");
      const collapsed = !block?.classList.contains("is-collapsed");
      block?.classList.toggle("is-collapsed", collapsed);
      const icon = unsortedToggle.querySelector(".fa-chevron-right, .fa-chevron-down");
      icon?.classList.toggle("fa-chevron-right", collapsed);
      icon?.classList.toggle("fa-chevron-down", !collapsed);
      atA3V2SetCollapsed(section, "special", "unsorted", collapsed);
    }
  }, true);

  document.addEventListener("dragstart", (event) => {
    const entry = event.target.closest?.(".at-a3v2-entry[draggable='true']");
    if (entry) {
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATA3V2_JOURNAL_MIME, String(entry.dataset.atA3v2OpenJournal || ""));
      entry.classList.add("is-dragging");
      document.querySelector(ATA3V2_ROOT)?.classList.add("at-a3v2-dragging");
      return;
    }
    const folderRow = event.target.closest?.(".at-a3v2-folder-row[draggable='true']");
    if (folderRow) {
      event.stopImmediatePropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ATA3V2_FOLDER_MIME, String(folderRow.dataset.atA3v2ToggleFolder || ""));
      folderRow.classList.add("is-dragging");
      document.querySelector(ATA3V2_ROOT)?.classList.add("at-a3v2-dragging");
    }
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".at-a3v2-entry, .at-a3v2-folder-row")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-a3v2-drop-target").forEach((node) => node.classList.remove("at-a3v2-drop-target"));
    document.querySelector(ATA3V2_ROOT)?.classList.remove("at-a3v2-dragging");
  }, true);

  document.addEventListener("dragover", (event) => {
    const drop = event.target.closest?.("[data-at-a3v2-drop-folder]");
    if (!drop) return;
    const types = [...(event.dataTransfer?.types || [])];
    if (!types.includes(ATA3V2_JOURNAL_MIME) && !types.includes(ATA3V2_FOLDER_MIME) && !types.includes("text/plain")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    drop.classList.add("at-a3v2-drop-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const drop = event.target.closest?.("[data-at-a3v2-drop-folder]");
    if (drop && !drop.contains(event.relatedTarget)) drop.classList.remove("at-a3v2-drop-target");
  }, true);

  document.addEventListener("drop", (event) => {
    const drop = event.target.closest?.("[data-at-a3v2-drop-folder]");
    if (!drop) return;
    const section = atA3V2SectionFromTree(drop);
    const targetFolder = game.folders?.get(String(drop.dataset.atA3v2DropFolder || ""));
    if (!section || !targetFolder) return;
    const journalId = String(event.dataTransfer?.getData?.(ATA3V2_JOURNAL_MIME) || "");
    const folderId = String(event.dataTransfer?.getData?.(ATA3V2_FOLDER_MIME) || "");
    const external = !journalId && !folderId ? atA3V2FoundryJournalFromDrag(event.dataTransfer) : null;
    if (!journalId && !folderId && !external) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drop.classList.remove("at-a3v2-drop-target");

    if (journalId) {
      void atA3V2MoveJournal(game.journal?.get(journalId), targetFolder, section);
      return;
    }
    if (folderId) {
      void atA3V2MoveFolder(game.folders?.get(folderId), targetFolder, section);
      return;
    }
    if (external) {
      const visible = atA3V2CurrentVisibleIds(section);
      if (!visible.has(external.id)) {
        ui.notifications.warn("Adventurer's Tome: Import or link this Journal into Tome first, then move it in Campaign Explorer.");
        return;
      }
      void atA3V2MoveJournal(external, targetFolder, section);
    }
  }, true);

  const observer = new MutationObserver(() => atA3V2Queue(100));
  observer.observe(document.body, { childList: true, subtree: true });
  atA3V2Queue(120);
});

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atA3V2Queue(140));
}
