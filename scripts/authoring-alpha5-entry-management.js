const ATEM_MODULE_ID = "adventurers-tome";
const ATEM_ROOT = "#adventurers-tome-app";
const ATEM_SUMMARY_ATTR = "data-at-tome-summary";
const ATEM_WORLD_CATEGORIES = Object.freeze({
  npc: "NPCs",
  location: "Locations",
  faction: "Factions",
  item: "Items",
  lore: "Lore"
});
const ATEM_SECTIONS = Object.freeze({
  world: { label: "World", page: ".at-world-page", open: "openWorldProfile" },
  quests: { label: "Quests", page: ".at-quests-page", open: "openQuestDetail" },
  sessions: { label: "Sessions", page: ".at-sessions-page", open: "selectSession" }
});
let atEmTimer = null;

function atEmEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atEmHtmlFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function atEmParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atEmAncestors(folder) {
  const result = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = game.folders?.get(atEmParentId(current)) || null;
  }
  return result;
}

function atEmPath(folder) {
  return atEmAncestors(folder).map((item) => item.name).join(" › ");
}

function atEmSectionPage() {
  const root = document.querySelector(ATEM_ROOT);
  if (!root) return null;
  for (const [section, config] of Object.entries(ATEM_SECTIONS)) {
    const page = root.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atEmStateKey(section, key) {
  return `adventurers-tome.campaign-workspace.${game.world?.id || "world"}.${game.user?.id || "user"}.${section}.${key}`;
}

function atEmSelectedId(section) {
  try { return String(localStorage.getItem(atEmStateKey(section, "selected")) || ""); }
  catch (_err) { return ""; }
}

function atEmIsSectionRoot(folder, section) {
  if (!folder || folder.type !== "JournalEntry") return false;
  if (folder.name !== ATEM_SECTIONS[section]?.label) return false;
  if (String(folder.getFlag?.(ATEM_MODULE_ID, "section") || "") === section) return true;
  return atEmAncestors(folder).some((ancestor) => ancestor.id !== folder.id && /adventurer'?s tome/i.test(String(ancestor.name || "")));
}

function atEmSectionRoots(section) {
  return [...(game.folders?.contents ?? [])]
    .filter((folder) => atEmIsSectionRoot(folder, section))
    .sort((a, b) => atEmPath(a).localeCompare(atEmPath(b)));
}

function atEmSelectedParent(section) {
  const id = atEmSelectedId(section);
  const selected = id ? game.folders?.get(id) || null : null;
  if (selected) return selected;
  const roots = atEmSectionRoots(section);
  return roots.length === 1 ? roots[0] : null;
}

function atEmCanonicalWorldCategory(folder) {
  let current = folder;
  while (current) {
    for (const [category, name] of Object.entries(ATEM_WORLD_CATEGORIES)) {
      if (current.name === name) return category;
    }
    current = game.folders?.get(atEmParentId(current)) || null;
  }
  return null;
}

function atEmSchedule(delay = 80) {
  window.clearTimeout(atEmTimer);
  atEmTimer = window.setTimeout(() => {
    atEmTimer = null;
    atEmEnhance();
  }, delay);
}

function atEmEnhanceEntries(explorer) {
  if (!game.user?.isGM || !explorer) return;
  for (const entry of [...explorer.querySelectorAll(".at-cw-tree-entry[data-at-cw-journal-id]")]) {
    if (entry.closest(".at-em-entry-row")) continue;
    const journalId = String(entry.dataset.atCwJournalId || "");
    if (!journalId || !game.journal?.get(journalId)) continue;

    const row = document.createElement("div");
    row.className = "at-em-entry-row";
    row.draggable = true;
    row.dataset.atCwJournalId = journalId;
    const depth = entry.style.getPropertyValue("--at-tree-depth") || "0";
    row.style.setProperty("--at-tree-depth", depth);

    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "at-em-entry-manage";
    manage.dataset.atEmManage = journalId;
    manage.title = "Manage entry";
    manage.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';

    entry.before(row);
    row.append(entry, manage);
    entry.draggable = false;
    delete entry.dataset.atCwJournalId;
  }
}

function atEmEnsureNewEntryButton(explorer, section) {
  if (!game.user?.isGM || !explorer) return;
  const actions = explorer.querySelector(".at-fm-folder-tools-actions");
  if (!actions) return;
  let button = actions.querySelector("[data-at-em-new-entry]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.atEmNewEntry = "true";
    button.title = "New entry in selected folder";
    button.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i>';
    actions.prepend(button);
  }
  button.disabled = !atEmSelectedParent(section);
}

function atEmEnhance() {
  if (!game.user?.isGM) return;
  const state = atEmSectionPage();
  if (!state) return;
  const explorer = state.page.querySelector(".at-cw-explorer");
  if (!explorer) return;
  atEmEnhanceEntries(explorer);
  atEmEnsureNewEntryButton(explorer, state.section);
}

function atEmPrompt({ title, body = "", fields = "", confirmLabel = "Save", confirmIcon = "fa-check", danger = false }) {
  return new Promise((resolve) => {
    const root = document.querySelector(ATEM_ROOT);
    if (!root) return resolve(null);
    const overlay = document.createElement("div");
    overlay.className = "at-cw-modal-overlay";
    overlay.innerHTML = `<form class="at-cw-modal at-em-modal ${danger ? "is-danger" : ""}"><header><div><span class="at-kicker">Tome Entry Management</span><h2>${atEmEscape(title)}</h2></div><button type="button" data-at-em-close><i class="fa-solid fa-xmark"></i></button></header>${fields}${body ? `<div class="at-em-modal-body">${body}</div>` : ""}<footer><button type="button" class="at-secondary" data-at-em-close>Cancel</button><button type="submit" class="${danger ? "at-em-danger" : "at-primary"}"><i class="fa-solid ${confirmIcon}"></i> ${atEmEscape(confirmLabel)}</button></footer></form>`;
    root.append(overlay);

    const finish = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-at-em-close]")) finish(null);
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

async function atEmEnsureWorldCategoryFolder(root, category) {
  const name = ATEM_WORLD_CATEGORIES[category] || "Lore";
  const found = [...(game.folders?.contents ?? [])].find((folder) => folder.type === "JournalEntry" && folder.name === name && atEmParentId(folder) === root.id);
  return found || Folder.create({ name, type: "JournalEntry", folder: root.id });
}

async function atEmCreateEntry(section) {
  const parent = atEmSelectedParent(section);
  if (!parent) return ui.notifications.warn("Adventurer's Tome: Select a folder/source in Explorer first.");

  const inferredCategory = section === "world" ? atEmCanonicalWorldCategory(parent) : null;
  const worldField = section === "world" && !inferredCategory
    ? `<label><span>World type</span><select name="category">${Object.entries(ATEM_WORLD_CATEGORIES).map(([id, label]) => `<option value="${id}">${atEmEscape(label.replace(/s$/, ""))}</option>`).join("")}</select></label>`
    : "";
  const questField = section === "quests" ? '<label><span>Quest status</span><select name="status"><option value="active">Active</option><option value="dormant">Dormant</option><option value="completed">Completed</option><option value="failed">Failed</option></select></label>' : "";
  const sessionField = section === "sessions" ? '<label><span>Session number <small>optional</small></span><input name="sessionNumber" type="number" min="1" step="1"></label>' : "";
  const fields = `<label><span>Name</span><input name="name" required autocomplete="off"></label>${worldField}${questField}${sessionField}`;
  const data = await atEmPrompt({
    title: `New ${section === "world" ? "World Entry" : section === "quests" ? "Quest" : "Session"}`,
    fields,
    body: `<p>Creates real Foundry Journal data inside <strong>${atEmEscape(atEmPath(parent))}</strong>.</p>${inferredCategory ? `<p>World type is inherited from this folder: <strong>${atEmEscape(ATEM_WORLD_CATEGORIES[inferredCategory].replace(/s$/, ""))}</strong>.</p>` : ""}`,
    confirmLabel: "Create Entry",
    confirmIcon: "fa-file-circle-plus"
  });
  if (!data) return;

  let name = String(data.get("name") || "").trim();
  if (!name) return;
  let targetFolder = parent;
  const flags = {};

  if (section === "world") {
    const category = inferredCategory || String(data.get("category") || "lore");
    if (atEmIsSectionRoot(parent, section)) targetFolder = await atEmEnsureWorldCategoryFolder(parent, category);
    flags.type = "world";
    flags.worldProfile = { category, subtitle: "", summary: "", body: "", heroImage: "", facts: [], summaryJournalBacked: true };
  } else if (section === "quests") {
    flags.type = "quests";
    flags.status = String(data.get("status") || "active");
  } else {
    flags.type = "sessions";
    const number = Number(data.get("sessionNumber") || 0);
    if (number > 0 && !new RegExp(`^session\\s+${number}\\b`, "i").test(name)) name = `Session ${number} — ${name}`;
  }

  try {
    const journal = await JournalEntry.create({
      name,
      folder: targetFolder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
      flags: { [ATEM_MODULE_ID]: flags }
    });
    const pageName = section === "sessions" ? "Chronicle" : "Overview";
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: pageName,
      type: "text",
      text: { content: `<p ${ATEM_SUMMARY_ATTR}="true"></p><p></p>`, format: atEmHtmlFormat() },
      sort: 100000
    }]);
    if (section === "world" && created?.[0]) await journal.setFlag(ATEM_MODULE_ID, "worldSyncPage", created[0].id);

    ui.notifications.info(`Adventurer's Tome: Created ${name}.`);
    const app = game.modules.get(ATEM_MODULE_ID)?.api?.app?.();
    await app?.render?.({ parts: ["main"] });
    window.setTimeout(() => {
      const root = document.querySelector(ATEM_ROOT);
      root?.querySelector(`[data-action="${ATEM_SECTIONS[section].open}"][data-journal-id="${CSS.escape(journal.id)}"]`)?.click();
      atEmSchedule(120);
    }, 160);
  } catch (error) {
    console.error("Adventurer's Tome | Explorer entry creation failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create that entry."}`);
  }
}

async function atEmDeleteEntry(journal) {
  const data = await atEmPrompt({
    title: "Delete Tome Entry",
    body: `<p>Delete <strong>${atEmEscape(journal.name)}</strong>?</p><p>This permanently deletes the real Foundry Journal Entry and all of its Journal pages. This cannot be undone by Tome.</p>`,
    confirmLabel: "Delete Entry",
    confirmIcon: "fa-trash",
    danger: true
  });
  if (!data) return;

  try {
    const name = journal.name;
    await journal.delete();
    ui.notifications.info(`Adventurer's Tome: Deleted ${name}.`);
    await game.modules.get(ATEM_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] });
    atEmSchedule(180);
  } catch (error) {
    console.error("Adventurer's Tome | Explorer entry delete failed", error);
    ui.notifications.error("Adventurer's Tome: Could not delete that entry.");
  }
}

function atEmOpenInTome(journalId) {
  const state = atEmSectionPage();
  if (!state) return;
  state.page.querySelector(`[data-at-cw-open-journal="${CSS.escape(journalId)}"]`)?.click();
}

async function atEmManageEntry(journalId) {
  const journal = game.journal?.get(String(journalId || ""));
  if (!journal || !game.user?.isGM) return;
  document.querySelector(`${ATEM_ROOT} .at-em-entry-menu-overlay`)?.remove();

  const root = document.querySelector(ATEM_ROOT);
  if (!root) return;
  const overlay = document.createElement("div");
  overlay.className = "at-cw-modal-overlay at-em-entry-menu-overlay";
  const folder = journal.folder || null;
  overlay.innerHTML = `<form class="at-cw-modal at-em-modal"><header><div><span class="at-kicker">Tome Entry Management</span><h2>${atEmEscape(journal.name)}</h2></div><button type="button" data-at-em-close><i class="fa-solid fa-xmark"></i></button></header><label><span>Name</span><input name="name" required autocomplete="off" value="${atEmEscape(journal.name)}"></label><div class="at-em-entry-meta"><span>Foundry Journal</span><strong>${atEmEscape(folder ? atEmPath(folder) : "Unfiled")}</strong></div><div class="at-em-entry-actions"><button type="button" class="at-secondary" data-at-em-open-tome><i class="fa-solid fa-book-open"></i> Open in Tome</button><button type="button" class="at-secondary" data-at-em-open-source><i class="fa-solid fa-up-right-from-square"></i> Open Foundry Source</button><button type="button" class="at-em-danger" data-at-em-delete-entry><i class="fa-solid fa-trash"></i> Delete Entry</button></div><footer><button type="button" class="at-secondary" data-at-em-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-floppy-disk"></i> Save Name</button></footer></form>`;
  root.append(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-at-em-close]")) { close(); return; }
    if (event.target.closest("[data-at-em-open-tome]")) { close(); atEmOpenInTome(journal.id); return; }
    if (event.target.closest("[data-at-em-open-source]")) {
      try { journal.sheet?.render?.(true); }
      catch (error) { console.warn("Adventurer's Tome | Could not open Foundry Journal sheet", error); }
      return;
    }
    if (event.target.closest("[data-at-em-delete-entry]")) { close(); void atEmDeleteEntry(journal); }
  });

  overlay.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name || name === journal.name) return close();
    try {
      await journal.update({ name });
      close();
      ui.notifications.info(`Adventurer's Tome: Renamed entry to ${name}.`);
      await game.modules.get(ATEM_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] });
      atEmSchedule(180);
    } catch (error) {
      console.error("Adventurer's Tome | Explorer entry rename failed", error);
      ui.notifications.error("Adventurer's Tome: Could not rename that entry.");
    }
  });
  const input = overlay.querySelector("input");
  input?.focus();
  input?.select();
}

function atEmInstallHandlers() {
  document.addEventListener("click", (event) => {
    const state = atEmSectionPage();
    if (!state) return;

    const manage = event.target.closest?.(`${ATEM_ROOT} [data-at-em-manage]`);
    if (manage) {
      event.preventDefault();
      event.stopPropagation();
      void atEmManageEntry(String(manage.dataset.atEmManage || ""));
      return;
    }

    const create = event.target.closest?.(`${ATEM_ROOT} [data-at-em-new-entry]`);
    if (create) {
      event.preventDefault();
      event.stopPropagation();
      void atEmCreateEntry(state.section);
      return;
    }

    if (event.target.closest?.(`${ATEM_ROOT} .at-cw-explorer [data-at-cw-select-folder], ${ATEM_ROOT} .at-cw-explorer [data-at-cw-show-all]`)) {
      window.setTimeout(() => atEmEnhance(), 0);
    }
  }, true);
}

Hooks.once("ready", () => {
  atEmInstallHandlers();
  atEmSchedule(320);
  window.setTimeout(() => atEmEnhance(), 850);
});

for (const hookName of ["renderApplication", "renderApplicationV2", "createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => atEmSchedule(220));
}
