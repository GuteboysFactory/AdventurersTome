const ATEB_MODULE_ID = "adventurers-tome";
const ATEB_ROOT = "#adventurers-tome-app";
const ATEB_DELAY = 700;
const atEbEditors = new WeakMap();
let atEbQueued = false;

function atEbApp() {
  try { return game.modules.get(ATEB_MODULE_ID)?.api?.app?.(); } catch (_err) { return null; }
}

function atEbWorldJournal(root) {
  const source = root?.querySelector('.at-world-profile-page [data-action="openJournal"][data-journal-id]');
  return source ? game.journal?.get(String(source.dataset.journalId || "")) : null;
}

function atEbSyncPage(journal) {
  if (!journal) return null;
  const profile = journal.getFlag?.(ATEB_MODULE_ID, "worldProfile") || {};
  const preferred = String(journal.getFlag?.(ATEB_MODULE_ID, "worldSyncPage") || profile?.syncPageId || "");
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred) || pages.find((page) => String(page.type || "text").toLowerCase() === "text") || null;
}

function atEbPageForSurface(surface, root) {
  const journal = atEbWorldJournal(root);
  if (!journal) return null;
  const article = surface.closest(".at-world-journal-page[data-page-id]");
  if (article?.dataset?.pageId) return journal.pages?.get(String(article.dataset.pageId)) || null;
  return atEbSyncPage(journal);
}

async function atEbEnrich(page) {
  const raw = String(page?.text?.content ?? "");
  try {
    return await TextEditor.enrichHTML(raw, {
      async: true,
      documents: true,
      secrets: Boolean(game.user?.isGM),
      relativeTo: page
    });
  } catch (_err) {
    return raw;
  }
}

async function atEbUpdatePage(page, html) {
  const app = atEbApp();
  if (app) app._bulkUpdating = true;
  try {
    await page.update({
      "text.content": html,
      "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    });
  } finally {
    window.setTimeout(() => { if (app) app._bulkUpdating = false; }, 180);
  }
}

function atEbSetStatus(surface, state, text) {
  let status = surface.querySelector(".at-eb-autosave-state");
  if (!status) {
    status = document.createElement("span");
    status.className = "at-eb-autosave-state";
    surface.querySelector(".at-wie-rich-toolbar")?.append(status);
  }
  status.dataset.state = state;
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : state === "editing" ? "fa-pen" : "fa-check";
  status.innerHTML = `<i class="fa-solid ${icon}"></i> ${text || ({ editing: "Editing…", saving: "Saving…", saved: "Saved", error: "Save failed" })[state] || "Saved"}`;
}

async function atEbSave(surface, { close = false } = {}) {
  const state = atEbEditors.get(surface);
  if (!state || state.saving) return;
  if (state.timer) window.clearTimeout(state.timer);
  state.timer = null;
  const editor = surface.querySelector(".at-wie-rich-editor");
  if (!editor) return;
  const html = String(editor.innerHTML || "<p></p>");
  if (!state.dirty && !close) return;

  if (state.dirty) {
    state.saving = true;
    atEbSetStatus(surface, "saving");
    try {
      await atEbUpdatePage(state.page, html);
      state.dirty = false;
      state.saving = false;
      atEbSetStatus(surface, "saved");
    } catch (error) {
      state.saving = false;
      state.dirty = true;
      atEbSetStatus(surface, "error", "Save failed — click away to retry");
      console.error("Adventurer's Tome | Rich autosave bridge failed", error);
      return;
    }
  }

  if (close) {
    surface.dataset.atWieRichEditing = "false";
    surface.classList.remove("is-editing");
    surface.innerHTML = await atEbEnrich(state.page);
    atEbEditors.delete(surface);
  }
}

function atEbSchedule(surface) {
  const state = atEbEditors.get(surface);
  if (!state) return;
  state.dirty = true;
  atEbSetStatus(surface, "editing");
  if (state.timer) window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => { void atEbSave(surface); }, ATEB_DELAY);
}

function atEbTakeOver(surface, root) {
  if (!surface || atEbEditors.has(surface)) return;
  const editor = surface.querySelector(".at-wie-rich-editor");
  if (!editor) return;
  const page = atEbPageForSurface(surface, root);
  if (!page) return;

  surface.querySelector(".at-wie-rich-actions")?.remove();
  const state = { page, dirty: false, saving: false, timer: null, closing: false };
  atEbEditors.set(surface, state);
  atEbSetStatus(surface, "saved", "Autosave on");

  editor.addEventListener("input", () => atEbSchedule(surface));
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      editor.blur();
    }
  });

  surface.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const current = atEbEditors.get(surface);
      if (!current || current.closing || surface.contains(document.activeElement)) return;
      current.closing = true;
      void atEbSave(surface, { close: true });
    }, 0);
  });
}

function atEbEnhance() {
  const root = document.querySelector(ATEB_ROOT);
  if (!root) return;
  for (const editor of root.querySelectorAll(".at-wie-rich-editor")) {
    atEbTakeOver(editor.closest(".at-wie-rich-surface"), root);
  }
}

function atEbQueue() {
  if (atEbQueued) return;
  atEbQueued = true;
  window.requestAnimationFrame(() => {
    atEbQueued = false;
    atEbEnhance();
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(atEbQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atEbQueue();
});
