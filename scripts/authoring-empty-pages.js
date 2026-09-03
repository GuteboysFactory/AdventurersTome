const ATEP_ROOT = "#adventurers-tome-app";
let atEpQueued = false;

function atEpIsBlank(surface) {
  if (!surface) return false;
  const clone = surface.cloneNode(true);
  clone.querySelectorAll(".at-wie-rich-toolbar, .at-eb-autosave-state").forEach((node) => node.remove());
  const text = String(clone.textContent || "").replace(/\u00a0/g, " ").trim();
  if (text) return false;
  return !clone.querySelector("img, video, audio, iframe, table, ul, ol, blockquote");
}

function atEpPromoteLegacyPageButtons(root) {
  for (const button of root.querySelectorAll('[data-at-wj-action="editPages"][data-journal-id]')) {
    const journalId = String(button.dataset.journalId || "");
    if (!journalId) continue;
    button.dataset.atA2PageManager = journalId;
    delete button.dataset.atWjAction;
    button.removeAttribute("data-at-wj-action");
    button.innerHTML = '<i class="fa-solid fa-layer-group"></i> Page Manager';
    button.title = "Manage Journal pages in Tome";
  }
}

function atEpMarkBlankPages(root) {
  for (const surface of root.querySelectorAll(".at-world-journal-page[data-page-type='text'] .at-world-journal-text, .at-af-page[data-page-type='text'] .at-af-page-text")) {
    const blank = atEpIsBlank(surface);
    surface.classList.toggle("at-empty-authoring-page", blank);
    if (blank) {
      surface.dataset.atEmptyAuthoring = "true";
      surface.tabIndex = 0;
      surface.title = "Click here to start writing — autosaves";
    } else {
      delete surface.dataset.atEmptyAuthoring;
      if (surface.getAttribute("tabindex") === "0") surface.removeAttribute("tabindex");
    }
  }
}

function atEpEnhance() {
  const root = document.querySelector(ATEP_ROOT);
  if (!root) return;
  atEpPromoteLegacyPageButtons(root);
  atEpMarkBlankPages(root);
}

function atEpQueue() {
  if (atEpQueued) return;
  atEpQueued = true;
  window.requestAnimationFrame(() => {
    atEpQueued = false;
    atEpEnhance();
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(atEpQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atEpQueue();
});

for (const hookName of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => window.setTimeout(atEpQueue, 35));
}
