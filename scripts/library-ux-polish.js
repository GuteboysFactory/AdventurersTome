const ATLUP_MODULE_ID = "adventurers-tome";
let atLupObserver = null;
let atLupTimer = null;
let atLupBusy = false;

function atLupRoot() {
  return document.querySelector("#adventurers-tome-app");
}

function atLupSchedule(delay = 25) {
  if (atLupTimer) window.clearTimeout(atLupTimer);
  atLupTimer = window.setTimeout(() => {
    atLupTimer = null;
    atLupPolish();
  }, delay);
}

function atLupParking(page) {
  let parking = page.querySelector(":scope > .at-lup-parking");
  if (!parking) {
    parking = document.createElement("div");
    parking.className = "at-lup-parking";
    page.append(parking);
  }
  return parking;
}

function atLupParkLibraryControls(page, scope) {
  const parking = atLupParking(page);
  let search = parking.querySelector(`[data-at-lup-original-search="${scope}"]`);
  if (!search) {
    search = page.querySelector(`.at-page-heading .at-local-search:has([data-at-local-search="${scope}"])`);
    if (search) {
      search.dataset.atLupOriginalSearch = scope;
      parking.append(search);
    }
  }

  let importer = parking.querySelector(`[data-at-lup-original-import="${scope}"]`);
  if (!importer) {
    const mode = scope === "sessions" ? "session" : scope === "quests" ? "quest" : "";
    if (mode) {
      importer = page.querySelector(`.at-page-heading button[data-action="openImporter"][data-import-mode="${mode}"]`);
      if (importer) {
        importer.dataset.atLupOriginalImport = scope;
        parking.append(importer);
      }
    }
  }

  return {
    searchWrap: search || null,
    searchInput: search?.querySelector?.(`[data-at-local-search="${scope}"]`) || null,
    importer: importer || null
  };
}

function atLupDispatchLocalSearch(input, value) {
  if (!input) return;
  input.value = String(value ?? "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function atLupVisibleRows(page, scope) {
  return [...page.querySelectorAll(`[data-at-local-search-row="${scope}"]`)]
    .filter((row) => !row.hidden && !row.classList.contains("at-cw-filtered-out"));
}

function atLupUpdateLibraryCounts(page, scope, bar) {
  const allRows = [...page.querySelectorAll(`[data-at-local-search-row="${scope}"]`)]
    .filter((row) => !row.classList.contains("at-cw-filtered-out"));
  const visible = atLupVisibleRows(page, scope);
  const query = String(page.querySelector(`[data-at-lup-search-proxy="${scope}"]`)?.value || "").trim();
  const count = bar?.querySelector(".at-cw-filter-count, .at-lup-count");
  if (count) {
    count.textContent = query
      ? `${visible.length} of ${allRows.length} ${allRows.length === 1 ? "entry" : "entries"}`
      : `${allRows.length} ${allRows.length === 1 ? "entry" : "entries"}`;
  }

  if (scope === "quests") {
    for (const group of page.querySelectorAll(".at-quest-group")) {
      const rows = [...group.querySelectorAll('[data-at-local-search-row="quests"]')]
        .filter((row) => !row.hidden && !row.classList.contains("at-cw-filtered-out"));
      group.classList.toggle("at-lup-empty-group", rows.length === 0);
      const badge = group.querySelector(":scope > header > span");
      if (badge) badge.textContent = String(rows.length);
    }
  }

  let empty = page.querySelector(`:scope .at-lup-empty[data-at-lup-empty="${scope}"]`);
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "at-empty at-wide at-lup-empty";
    empty.dataset.atLupEmpty = scope;
    empty.textContent = scope === "sessions" ? "No sessions match this search." : "No quests match this search.";
    const catalog = page.querySelector(".at-cw-catalog");
    catalog?.append(empty);
  }
  if (empty) empty.hidden = visible.length > 0 || !query;
}

function atLupSearchControl(scope, originalInput, page, bar) {
  const label = document.createElement("label");
  label.className = "at-lup-searchbox";
  label.innerHTML = `
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="search" data-at-lup-search-proxy="${scope}" placeholder="Search ${scope === "sessions" ? "Sessions" : "Quests"}…" autocomplete="off" spellcheck="false">
    <button type="button" data-at-lup-search-clear="${scope}" title="Clear search" hidden><i class="fa-solid fa-xmark"></i></button>
  `;
  const input = label.querySelector("input");
  const clear = label.querySelector("button");
  input.value = String(originalInput?.value || "");

  const apply = () => {
    atLupDispatchLocalSearch(originalInput, input.value);
    clear.hidden = !String(input.value || "").trim();
    window.setTimeout(() => atLupUpdateLibraryCounts(page, scope, bar), 0);
  };

  input.addEventListener("input", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    input.value = "";
    apply();
  });
  clear.addEventListener("click", (event) => {
    event.preventDefault();
    input.value = "";
    apply();
    input.focus();
  });

  return label;
}

function atLupPolishExplorerLibrary(page, scope) {
  const parked = atLupParkLibraryControls(page, scope);
  const bar = page.querySelector(".at-cw-catalog > .at-cw-filterbar");
  if (!bar || !parked.searchInput) return;

  let tools = bar.querySelector(":scope > .at-lup-library-tools");
  if (!tools) {
    tools = document.createElement("div");
    tools.className = "at-lup-library-tools";
    const count = bar.querySelector(":scope > .at-cw-filter-count");
    if (count) bar.insertBefore(tools, count);
    else bar.append(tools);
  }

  if (!tools.querySelector(`[data-at-lup-search-proxy="${scope}"]`)) {
    tools.prepend(atLupSearchControl(scope, parked.searchInput, page, bar));
  }

  if (parked.importer && !tools.querySelector(`[data-at-lup-import-proxy="${scope}"]`)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "at-secondary at-lup-import-button";
    button.dataset.atLupImportProxy = scope;
    button.innerHTML = `<i class="fa-solid fa-file-import"></i><span>${scope === "sessions" ? "Import Session" : "Import Quest Log"}</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      parked.importer.click();
    });
    tools.append(button);
  }

  window.setTimeout(() => atLupUpdateLibraryCounts(page, scope, bar), 0);
}

function atLupRuleOriginals(page) {
  const parking = atLupParking(page);

  let search = parking.querySelector('[data-at-lup-original-search="rules"]');
  if (!search) {
    search = page.querySelector('.at-page-heading .at-local-search:has([data-at-local-search="rules"])');
    if (search) {
      search.dataset.atLupOriginalSearch = "rules";
      parking.append(search);
    }
  }

  let tools = parking.querySelector(".at-rule-tools[data-at-lup-original-rule-tools]");
  if (!tools) {
    tools = page.querySelector(":scope > .at-rule-tools");
    if (tools) {
      tools.dataset.atLupOriginalRuleTools = "1";
      parking.append(tools);
    }
  }

  return {
    searchInput: search?.querySelector?.('[data-at-local-search="rules"]') || null,
    newName: tools?.querySelector('input[name="newRuleName"]') || null,
    createButton: tools?.querySelector('[data-action="createRule"]') || null,
    journalSelect: tools?.querySelector('select[name="existingRuleJournalId"]') || null,
    linkButton: tools?.querySelector('[data-action="linkRule"]') || null
  };
}

function atLupRuleCount(page, toolbar) {
  const rows = [...page.querySelectorAll('[data-at-local-search-row="rules"]')];
  const visible = rows.filter((row) => !row.hidden);
  const query = String(toolbar?.querySelector('[data-at-lup-rule-search]')?.value || "").trim();
  const count = toolbar?.querySelector(".at-lup-count");
  if (count) count.textContent = query
    ? `${visible.length} of ${rows.length} rules`
    : `${rows.length} ${rows.length === 1 ? "rule" : "rules"}`;
}

function atLupCloseRulePanels(toolbar, except = null) {
  for (const panel of toolbar?.querySelectorAll?.(".at-lup-rule-panel.is-open") || []) {
    if (panel === except) continue;
    panel.classList.remove("is-open");
  }
}

function atLupPolishRules(page) {
  const original = atLupRuleOriginals(page);
  if (!original.searchInput) return;

  let toolbar = page.querySelector(":scope > .at-lup-rule-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("section");
    toolbar.className = "at-lup-rule-toolbar";
    page.querySelector(":scope > .at-page-heading")?.insertAdjacentElement("afterend", toolbar);
  }

  if (!toolbar.querySelector("[data-at-lup-rule-search]")) {
    const search = document.createElement("label");
    search.className = "at-lup-searchbox at-lup-rule-searchbox";
    search.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><input type="search" data-at-lup-rule-search placeholder="Search Rules…" autocomplete="off" spellcheck="false"><button type="button" data-at-lup-rule-clear title="Clear search" hidden><i class="fa-solid fa-xmark"></i></button>';
    const input = search.querySelector("input");
    const clear = search.querySelector("button");
    input.value = String(original.searchInput.value || "");
    const apply = () => {
      atLupDispatchLocalSearch(original.searchInput, input.value);
      clear.hidden = !String(input.value || "").trim();
      window.setTimeout(() => atLupRuleCount(page, toolbar), 0);
    };
    input.addEventListener("input", apply);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      input.value = "";
      apply();
    });
    clear.addEventListener("click", (event) => {
      event.preventDefault();
      input.value = "";
      apply();
      input.focus();
    });
    toolbar.append(search);
  }

  if (original.createButton && !toolbar.querySelector('[data-at-lup-rule-action="create"]')) {
    const wrap = document.createElement("div");
    wrap.className = "at-lup-rule-action";
    wrap.innerHTML = `
      <button type="button" class="at-primary" data-at-lup-rule-action="create"><i class="fa-solid fa-plus"></i> New Rule</button>
      <div class="at-lup-rule-panel" data-at-lup-rule-panel="create">
        <label>Rule name<input type="text" data-at-lup-new-rule-name placeholder="Travel — Forced March"></label>
        <button type="button" class="at-primary" data-at-lup-create-rule-confirm><i class="fa-solid fa-file-circle-plus"></i> Create Rule</button>
      </div>
    `;
    const panel = wrap.querySelector(".at-lup-rule-panel");
    wrap.querySelector('[data-at-lup-rule-action="create"]').addEventListener("click", (event) => {
      event.preventDefault();
      const opening = !panel.classList.contains("is-open");
      atLupCloseRulePanels(toolbar, opening ? panel : null);
      panel.classList.toggle("is-open", opening);
      if (opening) panel.querySelector("input")?.focus();
    });
    wrap.querySelector("[data-at-lup-create-rule-confirm]").addEventListener("click", (event) => {
      event.preventDefault();
      const value = String(panel.querySelector("[data-at-lup-new-rule-name]")?.value || "").trim();
      if (!value) return;
      original.newName.value = value;
      original.newName.dispatchEvent(new Event("input", { bubbles:true }));
      original.createButton.click();
      panel.classList.remove("is-open");
    });
    toolbar.append(wrap);
  }

  if (original.linkButton && original.journalSelect && !toolbar.querySelector('[data-at-lup-rule-action="link"]')) {
    const wrap = document.createElement("div");
    wrap.className = "at-lup-rule-action";
    const options = [...original.journalSelect.options].map((option) =>
      `<option value="${String(option.value).replaceAll('"','&quot;')}">${String(option.textContent || "")}</option>`
    ).join("");
    wrap.innerHTML = `
      <button type="button" class="at-secondary" data-at-lup-rule-action="link"><i class="fa-solid fa-link"></i> Link Existing</button>
      <div class="at-lup-rule-panel" data-at-lup-rule-panel="link">
        <label>Existing Journal<select data-at-lup-rule-journal>${options}</select></label>
        <button type="button" class="at-primary" data-at-lup-link-rule-confirm><i class="fa-solid fa-link"></i> Link Journal</button>
      </div>
    `;
    const panel = wrap.querySelector(".at-lup-rule-panel");
    wrap.querySelector('[data-at-lup-rule-action="link"]').addEventListener("click", (event) => {
      event.preventDefault();
      const opening = !panel.classList.contains("is-open");
      atLupCloseRulePanels(toolbar, opening ? panel : null);
      panel.classList.toggle("is-open", opening);
    });
    wrap.querySelector("[data-at-lup-link-rule-confirm]").addEventListener("click", (event) => {
      event.preventDefault();
      const value = String(panel.querySelector("[data-at-lup-rule-journal]")?.value || "");
      if (!value) return;
      original.journalSelect.value = value;
      original.journalSelect.dispatchEvent(new Event("change", { bubbles:true }));
      original.linkButton.click();
      panel.classList.remove("is-open");
    });
    toolbar.append(wrap);
  }

  let count = toolbar.querySelector(".at-lup-count");
  if (!count) {
    count = document.createElement("span");
    count.className = "at-lup-count";
    toolbar.append(count);
  }
  window.setTimeout(() => atLupRuleCount(page, toolbar), 0);
}

function atLupPolishGlobalSearch(page) {
  const heading = page.querySelector(":scope > .at-search-heading");
  const toolbox = page.querySelector(":scope > .at-search-toolbox");
  if (!heading || !toolbox) return;
  if (heading.nextElementSibling !== toolbox) heading.insertAdjacentElement("afterend", toolbox);
  toolbox.classList.add("at-lup-search-primary");
}

function atLupPolish() {
  if (atLupBusy) return;
  const root = atLupRoot();
  if (!root) return;

  atLupBusy = true;
  try {
    const sessions = root.querySelector(".at-sessions-page");
    if (sessions) atLupPolishExplorerLibrary(sessions, "sessions");

    const quests = root.querySelector(".at-quests-page");
    if (quests) atLupPolishExplorerLibrary(quests, "quests");

    const rules = root.querySelector(".at-rules-page");
    if (rules) atLupPolishRules(rules);

    const search = root.querySelector(".at-search-page");
    if (search) atLupPolishGlobalSearch(search);
  } finally {
    atLupBusy = false;
  }
}

function atLupInstallObserver() {
  const root = atLupRoot();
  if (!root) return;
  atLupObserver?.disconnect?.();
  atLupObserver = new MutationObserver(() => {
    if (!atLupBusy) atLupSchedule(30);
  });
  atLupObserver.observe(root, { childList:true, subtree:true });
}

document.addEventListener("click", (event) => {
  const toolbar = event.target.closest?.("#adventurers-tome-app .at-lup-rule-toolbar");
  if (toolbar) return;
  const current = document.querySelector("#adventurers-tome-app .at-lup-rule-toolbar");
  if (current) atLupCloseRulePanels(current);
}, true);

Hooks.once("ready", () => {
  atLupSchedule(160);
  window.setTimeout(() => {
    atLupInstallObserver();
    atLupSchedule(20);
  }, 380);
});

for (const hookName of ["renderApplication", "renderApplicationV2"]) {
  Hooks.on(hookName, () => {
    atLupSchedule(50);
    window.setTimeout(() => atLupInstallObserver(), 100);
  });
}
