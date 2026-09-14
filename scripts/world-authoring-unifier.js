const AT_WAU_ID = "adventurers-tome";
const AT_WAU_SUMMARY_ATTR = "data-at-tome-summary";
let atWauCleaning = false;
let atWauDomQueued = false;

function atWauIsWorldJournal(journal) {
  if (journal?.documentName !== "JournalEntry") return false;
  const profile = journal.getFlag?.(AT_WAU_ID, "worldProfile");
  return String(journal.getFlag?.(AT_WAU_ID, "type") || "") === "world" || Boolean(profile && typeof profile === "object");
}

function atWauPrimaryPage(journal) {
  if (!journal) return null;
  const profile = journal.getFlag?.(AT_WAU_ID, "worldProfile") || {};
  const preferred = String(journal.getFlag?.(AT_WAU_ID, "worldSyncPage") || profile.syncPageId || "");
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred && String(page.type || "text").toLowerCase() === "text")
    || pages.find((page) => String(page.type || "text").toLowerCase() === "text")
    || null;
}

function atWauStripLegacySummary(html) {
  const source = String(html || "");
  if (!source.includes(AT_WAU_SUMMARY_ATTR)) return { html: source, changed: false };
  const host = document.createElement("div");
  host.innerHTML = source;
  let changed = false;
  for (const node of host.querySelectorAll(`[${AT_WAU_SUMMARY_ATTR}]`)) {
    node.remove();
    changed = true;
  }
  return { html: host.innerHTML, changed };
}

async function atWauCleanJournal(journal) {
  if (!game.user?.isGM || !atWauIsWorldJournal(journal)) return false;
  const page = atWauPrimaryPage(journal);
  if (!page) return false;
  const cleaned = atWauStripLegacySummary(page.text?.content ?? "");
  if (!cleaned.changed) return false;
  await page.update({
    "text.content": cleaned.html,
    "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
  }, { adventurersTomeWorldAuthoringCleanup: true });
  return true;
}

async function atWauCleanAll() {
  if (!game.user?.isGM || atWauCleaning) return;
  atWauCleaning = true;
  let repaired = 0;
  try {
    for (const journal of game.journal?.contents ?? []) {
      try {
        if (await atWauCleanJournal(journal)) repaired += 1;
      } catch (error) {
        console.warn(`Adventurer's Tome | Could not clean legacy World summary marker in ${journal?.name || "Journal"}.`, error);
      }
    }
    if (repaired) {
      console.info(`Adventurer's Tome | Removed obsolete World summary markers from ${repaired} canonical Journal page(s).`);
      ui.notifications.info(`Adventurer's Tome: cleaned ${repaired} obsolete World summary ${repaired === 1 ? "marker" : "markers"}.`);
    }
  } finally {
    atWauCleaning = false;
  }
}

function atWauDisarmGenericWorldEditors() {
  const world = document.querySelector("#adventurers-tome-app .at-world-profile-page");
  if (!world) return;

  /*
   * World is owned by world-inline-editing.js + authoring-editor-bridge.js.
   * The older generic authoring foundation may still decorate the same DOM.
   * Strip only its ownership attributes so clicks cannot start two editors.
   */
  for (const node of world.querySelectorAll("[data-at-af-editable='true'], [data-at-af-section='world']")) {
    delete node.dataset.atAfEditable;
    delete node.dataset.atAfJournalId;
    delete node.dataset.atAfSection;
    delete node.dataset.atAfKind;
    delete node.dataset.atAfMode;
    delete node.dataset.atAfPageId;
    delete node.dataset.atAfEditing;
    node.classList.remove("at-authoring-editable");
  }
}

function atWauQueueDom() {
  if (atWauDomQueued) return;
  atWauDomQueued = true;
  queueMicrotask(() => {
    atWauDomQueued = false;
    try { atWauDisarmGenericWorldEditors(); }
    catch (error) { console.warn("Adventurer's Tome | World authoring ownership cleanup failed safely.", error); }
  });
}

Hooks.on("preCreateJournalEntryPage", (page, data) => {
  const journal = page?.parent;
  if (!atWauIsWorldJournal(journal)) return;
  const content = foundry.utils.getProperty(data, "text.content");
  if (typeof content !== "string") return;
  const cleaned = atWauStripLegacySummary(content);
  if (cleaned.changed) foundry.utils.setProperty(data, "text.content", cleaned.html);
});

Hooks.on("preUpdateJournalEntryPage", (page, changes, options) => {
  if (options?.adventurersTomeWorldAuthoringCleanup) return;
  if (!atWauIsWorldJournal(page?.parent)) return;
  const content = foundry.utils.getProperty(changes, "text.content");
  if (typeof content !== "string") return;
  const cleaned = atWauStripLegacySummary(content);
  if (cleaned.changed) foundry.utils.setProperty(changes, "text.content", cleaned.html);
});

Hooks.once("ready", () => {
  const observer = new MutationObserver(atWauQueueDom);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-at-af-editable", "data-at-af-section"] });
  atWauQueueDom();
  if (game.user?.isGM) window.setTimeout(() => void atWauCleanAll(), 500);
});

for (const hookName of ["renderApplicationV2", "updateJournalEntry", "updateJournalEntryPage", "createJournalEntryPage"]) {
  Hooks.on(hookName, () => atWauQueueDom());
}
