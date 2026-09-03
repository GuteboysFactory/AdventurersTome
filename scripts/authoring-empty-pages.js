const ATEP_ROOT = "#adventurers-tome-app";
const ATEP_DELAY = 650;
let atEpQueued = false;
const atEpTimers = new Map();

function atEpApp() {
  try { return game.modules.get("adventurers-tome")?.api?.app?.(); } catch (_err) { return null; }
}

function atEpCanEdit(journal) {
  if (!journal || !game.user) return false;
  if (game.user.isGM) return true;
  try {
    return journal.isOwner === true || journal.testUserPermission?.(game.user, "OWNER") === true;
  } catch (_err) {
    return false;
  }
}

function atEpIsBlank(surface) {
  if (!surface) return false;
  const clone = surface.cloneNode(true);
  clone.querySelectorAll(".at-wie-rich-toolbar, .at-eb-autosave-state, .at-ep-status").forEach((node) => node.remove());
  const text = String(clone.textContent || "").replace(/\u00a0/g, " ").trim();
  if (text && text !== "This text page is empty.") return false;
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

function atEpPageContext(surface) {
  const article = surface?.closest?.("[data-page-id]");
  const shell = surface?.closest?.("[data-journal-id]");
  const journal = game.journal?.get(String(shell?.dataset?.journalId || ""));
  const page = journal?.pages?.get(String(article?.dataset?.pageId || ""));
  return { journal, page };
}

function atEpSetStatus(surface, state) {
  let status = surface.querySelector(":scope > .at-ep-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "at-ep-status";
    surface.prepend(status);
  }
  const label = state === "saving" ? "Saving…" : state === "error" ? "Save failed" : state === "editing" ? "Editing…" : "Saved";
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : state === "editing" ? "fa-pen" : "fa-check";
  status.innerHTML = `<i class="fa-solid ${icon}"></i>${label}`;
}

async function atEpSave(surface, { close = false } = {}) {
  const { journal, page } = atEpPageContext(surface);
  if (!journal || !page || !atEpCanEdit(journal)) return;
  const editor = surface.querySelector("[data-at-ep-editor]");
  if (!editor) return;
  const key = `${journal.id}:${page.id}`;
  window.clearTimeout(atEpTimers.get(key));
  atEpTimers.delete(key);
  const html = String(editor.innerHTML || "<p></p>");
  atEpSetStatus(surface, "saving");
  const app = atEpApp();
  if (app) app._bulkUpdating = true;
  try {
    await page.update({
      "text.content": html,
      "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    });
    atEpSetStatus(surface, "saved");
    if (close) {
      surface.classList.remove("is-direct-editing");
      surface.dataset.atEpEditing = "false";
      let rendered = html;
      try {
        rendered = await TextEditor.enrichHTML(html, { async: true, documents: true, secrets: Boolean(game.user?.isGM), relativeTo: page });
      } catch (_err) {}
      surface.innerHTML = rendered || '<p class="at-empty">This text page is empty.</p>';
      window.setTimeout(atEpQueue, 20);
    }
  } catch (error) {
    console.error("Adventurer's Tome | Blank page autosave failed", error);
    atEpSetStatus(surface, "error");
  } finally {
    window.setTimeout(() => { if (app) app._bulkUpdating = false; }, 180);
  }
}

function atEpScheduleSave(surface) {
  const { journal, page } = atEpPageContext(surface);
  if (!journal || !page) return;
  const key = `${journal.id}:${page.id}`;
  window.clearTimeout(atEpTimers.get(key));
  atEpSetStatus(surface, "editing");
  atEpTimers.set(key, window.setTimeout(() => { void atEpSave(surface); }, ATEP_DELAY));
}

function atEpStartEditing(surface, event) {
  if (!surface || surface.dataset.atEpEditing === "true") return;
  const { journal, page } = atEpPageContext(surface);
  if (!journal || !page || !atEpCanEdit(journal)) return;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  surface.dataset.atEpEditing = "true";
  surface.classList.add("is-direct-editing");
  const raw = String(page?.text?.content || "<p></p>");
  surface.innerHTML = `<span class="at-ep-status"><i class="fa-solid fa-check"></i>Autosave on</span><div data-at-ep-editor contenteditable="true" spellcheck="true">${raw || "<p></p>"}</div>`;
  const editor = surface.querySelector("[data-at-ep-editor]");
  editor?.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = globalThis.getSelection?.();
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);
  } catch (_err) {}
}

function atEpMarkBlankPages(root) {
  for (const surface of root.querySelectorAll(".at-world-journal-page[data-page-type='text'] .at-world-journal-text, .at-af-page[data-page-type='text'] .at-af-page-text")) {
    if (surface.dataset.atEpEditing === "true") continue;
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
  document.addEventListener("click", (event) => {
    const surface = event.target.closest?.("[data-at-empty-authoring='true']");
    if (!surface || event.target.closest("a, button, input, select, textarea")) return;
    atEpStartEditing(surface, event);
  }, true);

  document.addEventListener("input", (event) => {
    const editor = event.target.closest?.("[data-at-ep-editor]");
    const surface = editor?.closest?.("[data-at-ep-editing='true']");
    if (surface) atEpScheduleSave(surface);
  }, true);

  document.addEventListener("focusout", (event) => {
    const editor = event.target.closest?.("[data-at-ep-editor]");
    const surface = editor?.closest?.("[data-at-ep-editing='true']");
    if (!surface) return;
    window.setTimeout(() => {
      if (!surface.contains(document.activeElement)) void atEpSave(surface, { close: true });
    }, 0);
  }, true);

  const observer = new MutationObserver(atEpQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atEpQueue();
});

for (const hookName of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => window.setTimeout(atEpQueue, 35));
}
