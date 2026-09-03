const ATFM_MODULE_ID = "adventurers-tome";
const ATFM_ROOT = "#adventurers-tome-app";
const ATFM_SECTIONS = Object.freeze({
  world: { label: "World", page: ".at-world-page" },
  quests: { label: "Quests", page: ".at-quests-page" },
  sessions: { label: "Sessions", page: ".at-sessions-page" }
});
let atFmTimer = null;

function atFmEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atFmParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atFmAncestors(folder) {
  const result = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = game.folders?.get(atFmParentId(current)) || null;
  }
  return result;
}

function atFmPath(folder) {
  return atFmAncestors(folder).map((item) => item.name).join(" › ");
}

function atFmSectionPage() {
  const root = document.querySelector(ATFM_ROOT);
  if (!root) return null;
  for (const [section, config] of Object.entries(ATFM_SECTIONS)) {
    const page = root.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atFmStateKey(section, key) {
  return `adventurers-tome.campaign-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${key}`;
}

function atFmSelectedId(section) {
  try { return String(localStorage.getItem(atFmStateKey(section, "selected")) || ""); }
  catch (_err) { return ""; }
}

function atFmSetSelected(section, id) {
  try { localStorage.setItem(atFmStateKey(section, "selected"), String(id || "")); }
  catch (_err) {}
}

function atFmIsSectionRoot(folder, section) {
  if (!folder || folder.type !== "JournalEntry") return false;
  const label = ATFM_SECTIONS[section]?.label;
  if (folder.name !== label) return false;
  if (String(folder.getFlag?.(ATFM_MODULE_ID, "section") || "") === section) return true;
  return atFmAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
}

function atFmSectionRoots(section) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => atFmIsSectionRoot(folder, section))
    .sort((a, b) => atFmPath(a).localeCompare(atFmPath(b)));
}

function atFmSelectedFolder(section) {
  const id = atFmSelectedId(section);
  return id ? game.folders?.get(id) || null : null;
}

function atFmSchedule(delay = 40) {
  window.clearTimeout(atFmTimer);
  atFmTimer = window.setTimeout(() => {
    atFmTimer = null;
    atFmEnsureToolbar();
  }, delay);
}

function atFmEnsureToolbar() {
  if (!game.user?.isGM) return;
  const state = atFmSectionPage();
  if (!state) return;
  const explorer = state.page.querySelector(".at-cw-explorer");
  if (!explorer) return;

  let tools = explorer.querySelector(":scope > .at-fm-folder-tools");
  if (!tools) {
    tools = document.createElement("div");
    tools.className = "at-fm-folder-tools";
    tools.innerHTML = `<div class="at-fm-folder-tools-copy"><span>Folder tools</span><strong data-at-fm-folder-label>No folder selected</strong></div><div class="at-fm-folder-tools-actions"><button type="button" data-at-fm-new title="New subfolder"><i class="fa-solid fa-folder-plus"></i></button><button type="button" data-at-fm-rename title="Rename selected folder"><i class="fa-solid fa-pen"></i></button><button type="button" data-at-fm-delete title="Delete selected folder"><i class="fa-solid fa-trash"></i></button></div>`;
    const showAll = explorer.querySelector(":scope > [data-at-cw-show-all]");
    if (showAll) showAll.insertAdjacentElement("afterend", tools);
    else explorer.querySelector("header")?.insertAdjacentElement("afterend", tools);
  }

  atFmUpdateToolbar(state, tools);
}

function atFmUpdateToolbar(state, tools = null) {
  const explorer = state?.page?.querySelector(".at-cw-explorer");
  tools ||= explorer?.querySelector(":scope > .at-fm-folder-tools");
  if (!tools) return;

  const selected = atFmSelectedFolder(state.section);
  const roots = atFmSectionRoots(state.section);
  const impliedParent = selected || (roots.length === 1 ? roots[0] : null);
  const protectedRoot = selected ? atFmIsSectionRoot(selected, state.section) : false;

  const label = tools.querySelector("[data-at-fm-folder-label]");
  if (label) label.textContent = selected ? atFmPath(selected) : (roots.length === 1 ? `${roots[0].name} (root)` : "Select a folder");

  const newButton = tools.querySelector("[data-at-fm-new]");
  const renameButton = tools.querySelector("[data-at-fm-rename]");
  const deleteButton = tools.querySelector("[data-at-fm-delete]");
  if (newButton) newButton.disabled = !impliedParent;
  if (renameButton) renameButton.disabled = !selected || protectedRoot;
  if (deleteButton) deleteButton.disabled = !selected || protectedRoot;
}

function atFmModal({ kicker = "Campaign structure", title, body = "", inputValue = null, confirmLabel = "Save", confirmIcon = "fa-check", danger = false }) {
  return new Promise((resolve) => {
    const root = document.querySelector(ATFM_ROOT);
    if (!root) return resolve(null);
    const overlay = document.createElement("div");
    overlay.className = "at-cw-modal-overlay";
    overlay.innerHTML = `<form class="at-cw-modal at-fm-modal ${danger ? "is-danger" : ""}"><header><div><span class="at-kicker">${atFmEscape(kicker)}</span><h2>${atFmEscape(title)}</h2></div><button type="button" data-at-fm-close><i class="fa-solid fa-xmark"></i></button></header>${inputValue !== null ? `<label><span>Name</span><input name="name" required autocomplete="off" value="${atFmEscape(inputValue)}"></label>` : ""}${body ? `<div class="at-fm-modal-body">${body}</div>` : ""}<footer><button type="button" class="at-secondary" data-at-fm-close>Cancel</button><button type="submit" class="${danger ? "at-fm-danger" : "at-primary"}"><i class="fa-solid ${confirmIcon}"></i> ${atFmEscape(confirmLabel)}</button></footer></form>`;
    root.append(overlay);

    const finish = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-at-fm-close]")) finish(null);
    });
    overlay.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (inputValue !== null) finish(String(new FormData(event.currentTarget).get("name") || "").trim());
      else finish(true);
    });
    const input = overlay.querySelector("input");
    input?.focus();
    input?.select();
  });
}

async function atFmCreateFolder(section) {
  const selected = atFmSelectedFolder(section);
  const roots = atFmSectionRoots(section);
  const parent = selected || (roots.length === 1 ? roots[0] : null);
  if (!parent) return ui.notifications.warn("Adventurer's Tome: Select the source/folder where the new folder should be created.");

  const name = await atFmModal({
    title: "New Folder",
    body: `<p>Creates a real Foundry Journal folder inside <strong>${atFmEscape(atFmPath(parent))}</strong>.</p>`,
    inputValue: "",
    confirmLabel: "Create Folder",
    confirmIcon: "fa-folder-plus"
  });
  if (!name) return;

  try {
    const created = await Folder.create({ name, type: "JournalEntry", folder: parent.id });
    atFmSetSelected(section, created.id);
    ui.notifications.info(`Adventurer's Tome: Created folder ${created.name}.`);
    atFmSchedule(160);
  } catch (error) {
    console.error("Adventurer's Tome | Explorer folder creation failed", error);
    ui.notifications.error("Adventurer's Tome: Could not create that folder.");
  }
}

async function atFmRenameFolder(section) {
  const folder = atFmSelectedFolder(section);
  if (!folder) return;
  if (atFmIsSectionRoot(folder, section)) return ui.notifications.warn("Adventurer's Tome: Section root folders are protected.");

  const name = await atFmModal({
    title: "Rename Folder",
    body: `<p>Renames <strong>${atFmEscape(atFmPath(folder))}</strong> in Tome and Foundry.</p>`,
    inputValue: folder.name,
    confirmLabel: "Rename",
    confirmIcon: "fa-pen"
  });
  if (!name || name === folder.name) return;

  try {
    await folder.update({ name });
    ui.notifications.info(`Adventurer's Tome: Renamed folder to ${name}.`);
    atFmSchedule(160);
  } catch (error) {
    console.error("Adventurer's Tome | Explorer folder rename failed", error);
    ui.notifications.error("Adventurer's Tome: Could not rename that folder.");
  }
}

async function atFmDeleteFolder(section) {
  const folder = atFmSelectedFolder(section);
  if (!folder) return;
  if (atFmIsSectionRoot(folder, section)) return ui.notifications.warn("Adventurer's Tome: Section root folders are protected.");

  const childFolders = [...(game.folders?.contents ?? [])].filter((item) => item.type === "JournalEntry" && atFmParentId(item) === folder.id);
  const journals = [...(game.journal?.contents ?? [])].filter((journal) => String(journal.folder?.id ?? journal.folder ?? "") === folder.id);
  if (childFolders.length || journals.length) {
    return ui.notifications.warn(`Adventurer's Tome: ${folder.name} is not empty. Move its ${journals.length} entries and ${childFolders.length} subfolders before deleting it.`);
  }

  const confirmed = await atFmModal({
    title: "Delete Empty Folder",
    body: `<p>Delete <strong>${atFmEscape(atFmPath(folder))}</strong>?</p><p>This only removes the empty folder. Tome will never delete Journals or nested folders through this action.</p>`,
    confirmLabel: "Delete Folder",
    confirmIcon: "fa-trash",
    danger: true
  });
  if (!confirmed) return;

  const parentId = atFmParentId(folder);
  try {
    await folder.delete();
    atFmSetSelected(section, parentId);
    ui.notifications.info(`Adventurer's Tome: Deleted empty folder ${folder.name}.`);
    atFmSchedule(160);
  } catch (error) {
    console.error("Adventurer's Tome | Explorer folder delete failed", error);
    ui.notifications.error("Adventurer's Tome: Could not delete that folder.");
  }
}

function atFmInstallHandlers() {
  document.addEventListener("click", (event) => {
    const state = atFmSectionPage();
    if (!state) return;

    if (event.target.closest?.(`${ATFM_ROOT} .at-cw-explorer [data-at-cw-select-folder], ${ATFM_ROOT} .at-cw-explorer [data-at-cw-show-all]`)) {
      window.setTimeout(() => atFmEnsureToolbar(), 0);
      return;
    }

    const tools = event.target.closest?.(`${ATFM_ROOT} .at-fm-folder-tools`);
    if (!tools) return;

    if (event.target.closest?.("[data-at-fm-new]")) {
      event.preventDefault();
      event.stopPropagation();
      void atFmCreateFolder(state.section);
      return;
    }
    if (event.target.closest?.("[data-at-fm-rename]")) {
      event.preventDefault();
      event.stopPropagation();
      void atFmRenameFolder(state.section);
      return;
    }
    if (event.target.closest?.("[data-at-fm-delete]")) {
      event.preventDefault();
      event.stopPropagation();
      void atFmDeleteFolder(state.section);
    }
  }, true);
}

Hooks.once("ready", () => {
  atFmInstallHandlers();
  atFmSchedule(260);
  window.setTimeout(() => atFmEnsureToolbar(), 700);
});

for (const hookName of ["renderApplication", "renderApplicationV2", "createFolder", "updateFolder", "deleteFolder", "updateJournalEntry"]) {
  Hooks.on(hookName, () => atFmSchedule(180));
}
