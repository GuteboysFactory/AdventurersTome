const ATCI_MODULE_ID = "adventurers-tome";
const ATCI_ROOT = "#adventurers-tome-app";
const ATCI_WORLD_CATEGORIES = Object.freeze({
  npc: "NPC",
  location: "Location",
  faction: "Faction",
  item: "Item",
  lore: "Lore"
});

function atCiEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atCiParentFolder(folder) {
  if (!folder) return null;
  if (folder.folder?.id) return folder.folder;
  if (typeof folder.folder === "string") return game.folders?.get(folder.folder) || null;
  return null;
}

function atCiFolderPath(folder) {
  if (!folder) return "Unsorted Journals";
  const names = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(String(current.name || "Folder"));
    current = atCiParentFolder(current);
  }
  return names.join(" › ");
}

function atCiType(journal) {
  return String(journal?.getFlag?.(ATCI_MODULE_ID, "type") || "").toLowerCase();
}

function atCiTypeLabel(type) {
  return ({ sessions: "Sessions", quests: "Quests", world: "World", rules: "Rules" })[type] || type || "";
}

function atCiPageCount(journal) {
  return Number(journal?.pages?.contents?.length || 0);
}

function atCiFirstTextPage(journal) {
  return [...(journal?.pages?.contents || [])]
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .find((page) => page?.text?.content !== undefined) || null;
}

function atCiSummary(journal) {
  const page = atCiFirstTextPage(journal);
  if (!page) return "";
  const host = document.createElement("div");
  host.innerHTML = String(page.text?.content || "");
  host.querySelectorAll(".secret, [data-secret='true']").forEach((node) => node.remove());
  return String(host.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function atCiInferWorldCategory(journal) {
  const flagged = String(journal?.getFlag?.(ATCI_MODULE_ID, "worldProfile")?.category || "").toLowerCase();
  if (ATCI_WORLD_CATEGORIES[flagged]) return flagged;
  const haystack = `${atCiFolderPath(journal?.folder)} ${journal?.name || ""}`.toLowerCase();
  if (/\b(npc|npcs|people|person|persons|character|characters)\b/.test(haystack)) return "npc";
  if (/\b(location|locations|place|places|region|regions|city|town|village|settlement|site|sites)\b/.test(haystack)) return "location";
  if (/\b(faction|factions|guild|guilds|order|orders|house|houses|clan|clans|company)\b/.test(haystack)) return "faction";
  if (/\b(item|items|artifact|artifacts|treasure|gear|relic|relics)\b/.test(haystack)) return "item";
  return "lore";
}

function atCiWorldCategoryOptions(selected) {
  return Object.entries(ATCI_WORLD_CATEGORIES)
    .map(([id, label]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${label}</option>`)
    .join("");
}

function atCiCandidateState(journal, destination) {
  const type = atCiType(journal);
  if (type === destination) return { disabled: true, state: "already", label: `Already in ${atCiTypeLabel(destination)}` };
  if (type && type !== destination) return { disabled: true, state: "used", label: `Used by Tome: ${atCiTypeLabel(type)}` };
  return { disabled: false, state: "available", label: "Available" };
}

function atCiAllJournals() {
  return [...(game.journal?.contents || [])]
    .sort((a, b) => {
      const folderCompare = atCiFolderPath(a.folder).localeCompare(atCiFolderPath(b.folder), game.i18n?.lang, { numeric: true });
      return folderCompare || String(a.name || "").localeCompare(String(b.name || ""), game.i18n?.lang, { numeric: true });
    });
}

function atCiFolderOptions() {
  const folders = [...new Set(atCiAllJournals().map((journal) => atCiFolderPath(journal.folder)))];
  return folders.map((folder) => `<option value="${atCiEscape(folder)}">${atCiEscape(folder)}</option>`).join("");
}

function atCiRenderRows(overlay) {
  const destination = String(overlay.dataset.destination || "rules");
  const query = String(overlay.querySelector("[data-at-ci-search]")?.value || "").trim().toLowerCase();
  const folderFilter = String(overlay.querySelector("[data-at-ci-folder]")?.value || "");
  const list = overlay.querySelector("[data-at-ci-list]");
  if (!list) return;

  const journals = atCiAllJournals().filter((journal) => {
    const folder = atCiFolderPath(journal.folder);
    if (folderFilter && folder !== folderFilter) return false;
    if (!query) return true;
    const pageNames = (journal.pages?.contents || []).map((page) => page.name || "").join(" ");
    return `${journal.name || ""} ${folder} ${pageNames}`.toLowerCase().includes(query);
  });

  list.innerHTML = journals.map((journal) => {
    const state = atCiCandidateState(journal, destination);
    const folder = atCiFolderPath(journal.folder);
    const pages = atCiPageCount(journal);
    const category = atCiInferWorldCategory(journal);
    return `
      <article class="at-ci-row is-${state.state}" data-at-ci-row data-journal-id="${atCiEscape(journal.id)}">
        <label class="at-ci-check"><input type="checkbox" data-at-ci-select ${state.disabled ? "disabled" : ""}><span></span></label>
        <div class="at-ci-journal-main">
          <strong>${atCiEscape(journal.name || "Untitled Journal")}</strong>
          <small><i class="fa-solid fa-folder-open"></i> ${atCiEscape(folder)} <span>·</span> ${pages} ${pages === 1 ? "page" : "pages"}</small>
        </div>
        ${destination === "world" && !state.disabled ? `<label class="at-ci-category"><span>World type</span><select data-at-ci-category>${atCiWorldCategoryOptions(category)}</select></label>` : ""}
        <span class="at-ci-state is-${state.state}">${atCiEscape(state.label)}</span>
      </article>`;
  }).join("") || '<div class="at-ci-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>No Journals match this filter.</strong><span>Try another search or folder.</span></div>';

  atCiUpdateCount(overlay);
}

function atCiUpdateCount(overlay) {
  const selected = overlay.querySelectorAll("[data-at-ci-select]:checked").length;
  const counter = overlay.querySelector("[data-at-ci-count]");
  const importButton = overlay.querySelector("[data-at-ci-import]");
  if (counter) counter.textContent = String(selected);
  if (importButton) importButton.disabled = selected === 0;
}

function atCiOpenImporter(destination) {
  if (!game.user?.isGM) return;
  const root = document.querySelector(ATCI_ROOT);
  if (!root) return;
  root.querySelector(".at-ci-overlay")?.remove();

  const destinationLabel = destination === "world" ? "World" : "Rules";
  const overlay = document.createElement("div");
  overlay.className = "at-ci-overlay";
  overlay.dataset.destination = destination;
  overlay.innerHTML = `
    <section class="at-ci-shell" role="dialog" aria-modal="true" aria-label="Import Existing Journals">
      <header class="at-ci-header">
        <div>
          <span class="at-kicker">Foundry → Adventurer's Tome</span>
          <h1>Import Existing Journals to ${destinationLabel}</h1>
          <p>Select existing Foundry Journals. Tome links to the originals — it does not duplicate or flatten them.</p>
        </div>
        <button type="button" class="at-icon-button" data-at-ci-close title="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="at-ci-safety"><i class="fa-solid fa-link"></i><div><strong>Journal-backed, Tome-rendered</strong><span>Your Foundry folder structure, Journal Pages, page order and rich text stay intact. Tome controls how the content is presented.</span></div></div>
      <section class="at-ci-controls">
        <label class="at-ci-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-at-ci-search placeholder="Search Journal name, folder or page…"></label>
        <label><span>Folder</span><select data-at-ci-folder><option value="">All Journal folders</option>${atCiFolderOptions()}</select></label>
        <button type="button" class="at-secondary" data-at-ci-select-visible><i class="fa-solid fa-check-double"></i> Select shown</button>
        <button type="button" class="at-secondary" data-at-ci-clear><i class="fa-solid fa-xmark"></i> Clear</button>
      </section>
      <div class="at-ci-list-head"><span>Foundry Journals</span><span>${destination === "world" ? "Choose the World type per Journal. Folder names are used as a smart default." : "A multi-page Journal remains one structured Rule reference."}</span></div>
      <section class="at-ci-list" data-at-ci-list></section>
      <footer class="at-ci-footer">
        <span><strong data-at-ci-count>0</strong> selected</span>
        <div><button type="button" class="at-secondary" data-at-ci-close>Cancel</button><button type="button" class="at-primary" data-at-ci-import disabled><i class="fa-solid fa-file-import"></i> Import / Link Selected</button></div>
      </footer>
    </section>`;
  root.append(overlay);
  atCiRenderRows(overlay);
  overlay.querySelector("[data-at-ci-search]")?.focus();
}

function atCiRefresh(destination) {
  window.setTimeout(() => {
    const root = document.querySelector(ATCI_ROOT);
    const nav = root?.querySelector(`[data-action="navigate"][data-tab="${destination}"]`);
    nav?.click();
  }, 30);
}

async function atCiImportSelected(overlay) {
  if (!game.user?.isGM) return;
  const destination = String(overlay.dataset.destination || "rules");
  const rows = [...overlay.querySelectorAll("[data-at-ci-row]")].filter((row) => row.querySelector("[data-at-ci-select]")?.checked);
  if (!rows.length) return;
  const button = overlay.querySelector("[data-at-ci-import]");
  if (button) button.disabled = true;

  let imported = 0;
  try {
    for (const row of rows) {
      const journal = game.journal?.get(String(row.dataset.journalId || ""));
      if (!journal) continue;
      const state = atCiCandidateState(journal, destination);
      if (state.disabled) continue;

      if (destination === "rules") {
        await journal.setFlag(ATCI_MODULE_ID, "type", "rules");
        await journal.setFlag(ATCI_MODULE_ID, "ruleLink", true);
      } else {
        const category = String(row.querySelector("[data-at-ci-category]")?.value || atCiInferWorldCategory(journal));
        const raw = journal.getFlag?.(ATCI_MODULE_ID, "worldProfile");
        const profile = raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
        const firstPage = atCiFirstTextPage(journal);
        const next = {
          ...profile,
          category: ATCI_WORLD_CATEGORIES[category] ? category : "lore",
          summary: String(profile.summary || atCiSummary(journal) || "").trim(),
          syncPageId: String(profile.syncPageId || firstPage?.id || "")
        };
        await journal.setFlag(ATCI_MODULE_ID, "type", "world");
        await journal.setFlag(ATCI_MODULE_ID, "worldProfile", next);
      }
      imported += 1;
    }

    overlay.remove();
    ui.notifications.info(`Adventurer's Tome: ${imported} existing ${imported === 1 ? "Journal" : "Journals"} linked to ${atCiTypeLabel(destination)}.`);
    atCiRefresh(destination);
  } catch (error) {
    console.error("Adventurer's Tome | Existing Journal import failed", error);
    ui.notifications.error("Adventurer's Tome: Existing Journals could not be imported. Check the console for details.");
    if (button) button.disabled = false;
  }
}

function atCiEnhanceRules(root) {
  const page = root.querySelector(".at-rules-page");
  if (!page) return;

  const tools = page.querySelector(".at-rule-tools");
  if (tools && !tools.dataset.atCiModernized) {
    tools.dataset.atCiModernized = "true";
    tools.classList.add("at-rule-tools-modern");
    const heading = tools.querySelector("h2");
    const intro = tools.querySelector("p");
    if (heading) heading.innerHTML = '<i class="fa-solid fa-book-open"></i> Rules Library';
    if (intro) intro.textContent = "Create a new Rule in Tome, or import/link one or many existing Foundry Journals.";

    const oldLabel = tools.querySelector('select[name="existingRuleJournalId"]')?.closest("label");
    const oldButton = tools.querySelector('[data-action="linkRule"]');
    if (oldLabel) oldLabel.hidden = true;
    if (oldButton) oldButton.hidden = true;

    const grid = tools.querySelector(".at-rule-tool-grid");
    if (grid && !grid.querySelector("[data-at-ci-open='rules']")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "at-primary at-ci-import-button";
      button.dataset.atCiOpen = "rules";
      button.innerHTML = '<i class="fa-solid fa-file-import"></i><span><strong>Import Existing Rules</strong><small>Browse Foundry Journals & folders</small></span>';
      grid.append(button);
    }
  }

  for (const card of page.querySelectorAll('[data-action="openRuleDetail"][data-journal-id]')) {
    if (card.dataset.atCiCardEnhanced) continue;
    card.dataset.atCiCardEnhanced = "true";
    card.classList.add("at-rule-library-card");
    const journal = game.journal?.get(String(card.dataset.journalId || ""));
    if (!journal) continue;
    const small = card.querySelector("small");
    if (small) {
      const pages = atCiPageCount(journal);
      small.textContent = `${pages} ${pages === 1 ? "page" : "pages"} · ${atCiFolderPath(journal.folder)} · Journal-backed`;
      small.title = small.textContent;
    }
  }
}

function atCiEnhanceWorld(root) {
  const page = root.querySelector(".at-world-page");
  if (!page) return;
  const heading = page.querySelector(".at-world-heading");
  if (!heading || heading.dataset.atCiModernized) return;
  heading.dataset.atCiModernized = "true";
  heading.querySelector(".at-world-hint")?.remove();
  const actions = document.createElement("div");
  actions.className = "at-world-import-actions";
  actions.innerHTML = `
    <div class="at-world-import-copy"><i class="fa-solid fa-link"></i><span><strong>Already have campaign Journals?</strong><small>Link them to World without moving or duplicating them.</small></span></div>
    <button type="button" class="at-primary" data-at-ci-open="world"><i class="fa-solid fa-file-import"></i> Import Existing Journals</button>`;
  heading.append(actions);
}

function atCiEnhance() {
  const root = document.querySelector(ATCI_ROOT);
  if (!root) return;
  atCiEnhanceRules(root);
  atCiEnhanceWorld(root);
}

function atCiHandleClick(event) {
  const root = event.target.closest(ATCI_ROOT);
  if (!root) return;

  const open = event.target.closest("[data-at-ci-open]");
  if (open) {
    event.preventDefault();
    event.stopPropagation();
    atCiOpenImporter(String(open.dataset.atCiOpen || "rules"));
    return;
  }

  const overlay = event.target.closest(".at-ci-overlay");
  if (!overlay) return;

  if (event.target.closest("[data-at-ci-close]")) {
    event.preventDefault();
    overlay.remove();
    return;
  }

  if (event.target.closest("[data-at-ci-select-visible]")) {
    event.preventDefault();
    overlay.querySelectorAll("[data-at-ci-select]:not(:disabled)").forEach((box) => { box.checked = true; });
    atCiUpdateCount(overlay);
    return;
  }

  if (event.target.closest("[data-at-ci-clear]")) {
    event.preventDefault();
    overlay.querySelectorAll("[data-at-ci-select]").forEach((box) => { box.checked = false; });
    atCiUpdateCount(overlay);
    return;
  }

  if (event.target.closest("[data-at-ci-import]")) {
    event.preventDefault();
    void atCiImportSelected(overlay);
  }
}

function atCiHandleInput(event) {
  const overlay = event.target.closest(".at-ci-overlay");
  if (!overlay) return;
  if (event.target.matches("[data-at-ci-search], [data-at-ci-folder]")) atCiRenderRows(overlay);
  else if (event.target.matches("[data-at-ci-select]")) atCiUpdateCount(overlay);
}

Hooks.once("ready", () => {
  document.addEventListener("click", atCiHandleClick, true);
  document.addEventListener("input", atCiHandleInput, true);
  document.addEventListener("change", atCiHandleInput, true);
  const observer = new MutationObserver(() => atCiEnhance());
  observer.observe(document.body, { childList: true, subtree: true });
  atCiEnhance();
});
