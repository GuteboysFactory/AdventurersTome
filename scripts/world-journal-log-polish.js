const ATWLP_ROOT = "#adventurers-tome-app";
let atWlpRafQueued = false;
let atWlpSweepTimer = null;

function atWlpJournalKey(shell) {
  return String(shell?.dataset?.journalId || "");
}

function atWlpDedupe(world) {
  const shells = [...world.querySelectorAll(".at-world-journal-parity")];
  const groups = new Map();
  for (const shell of shells) {
    const key = atWlpJournalKey(shell) || "__unknown__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shell);
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // world-journal-parity inserts new renders immediately after the same
    // profile-content anchor. Keep the first DOM instance, which is the newest
    // render, and remove every stale concurrent render for the same Journal.
    const keep = list[0];
    for (let index = 1; index < list.length; index += 1) list[index].remove();
    keep.dataset.atWlpDedupeOwner = "true";
  }
}

function atWlpActivate(shell, pageId) {
  if (!shell) return;
  const articles = [...shell.querySelectorAll(".at-world-journal-page[data-page-id]")];
  if (!articles.length) return;
  const target = articles.find((article) => String(article.dataset.pageId) === String(pageId)) || articles[0];
  for (const article of articles) article.classList.toggle("is-active", article === target);
  for (const button of shell.querySelectorAll("[data-at-wlp-page]")) {
    const active = String(button.dataset.atWlpPage) === String(target.dataset.pageId);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  shell.dataset.atWlpActivePage = String(target.dataset.pageId || "");
}

function atWlpPolishShell(shell) {
  if (!shell || shell.dataset.atWlpPolished === "true") return;
  const articles = [...shell.querySelectorAll(".at-world-journal-page[data-page-id]")];
  if (!articles.length) {
    shell.dataset.atWlpPolished = "true";
    return;
  }

  const heading = shell.querySelector(".at-world-journal-heading h2");
  if (heading) heading.textContent = "Journal Chapters";
  const subtitle = shell.querySelector(".at-world-journal-heading p");
  if (subtitle) subtitle.textContent = `${articles.length} additional ${articles.length === 1 ? "chapter" : "chapters"} · synced with Foundry`;

  const toc = shell.querySelector(".at-world-journal-toc");
  if (toc) {
    toc.classList.add("at-wlp-tabs");
    toc.setAttribute("role", "tablist");
    for (const button of toc.querySelectorAll("button[data-at-wj-scroll]")) {
      const targetId = String(button.dataset.atWjScroll || "");
      const target = shell.querySelector(`#${CSS.escape(targetId)}`);
      const pageId = String(target?.dataset?.pageId || "");
      if (!pageId) continue;
      button.dataset.atWlpPage = pageId;
      delete button.dataset.atWjScroll;
      button.removeAttribute("data-at-wj-scroll");
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
    }
  }

  shell.querySelector(".at-world-journal-document")?.classList.add("at-wlp-document");
  shell.classList.add("at-wlp-compact");
  shell.dataset.atWlpPolished = "true";
  atWlpActivate(shell, shell.dataset.atWlpActivePage || articles[0]?.dataset?.pageId || "");
}

function atWlpCleanToolbar(world) {
  const toolbar = world.querySelector(".at-profile-toolbar-actions");
  if (!toolbar) return;
  const pageButtons = [...toolbar.querySelectorAll('[data-at-wj-action="editPages"], [data-at-a2-page-manager]')];
  if (pageButtons.length <= 1) return;
  const preferred = pageButtons.find((button) => button.hasAttribute("data-at-a2-page-manager")) || pageButtons[0];
  for (const button of pageButtons) if (button !== preferred) button.remove();
}

function atWlpSweep() {
  const root = document.querySelector(ATWLP_ROOT);
  const world = root?.querySelector(".at-world-profile-page");
  if (!world) return;
  atWlpDedupe(world);
  atWlpCleanToolbar(world);
  for (const shell of world.querySelectorAll(".at-world-journal-parity")) atWlpPolishShell(shell);
}

function atWlpQueue() {
  if (!atWlpRafQueued) {
    atWlpRafQueued = true;
    window.requestAnimationFrame(() => {
      atWlpRafQueued = false;
      atWlpSweep();
    });
  }
  // Concurrent async Journal renders can finish on different frames. A short
  // trailing sweep guarantees stale blocks are removed after the burst ends.
  window.clearTimeout(atWlpSweepTimer);
  atWlpSweepTimer = window.setTimeout(atWlpSweep, 140);
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.("[data-at-wlp-page]");
    if (!tab) return;
    const shell = tab.closest(".at-world-journal-parity");
    if (!shell) return;
    event.preventDefault();
    event.stopPropagation();
    atWlpActivate(shell, String(tab.dataset.atWlpPage || ""));
  }, true);

  const observer = new MutationObserver(atWlpQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atWlpQueue();
});

for (const hookName of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => {
    window.setTimeout(atWlpSweep, 40);
    window.setTimeout(atWlpSweep, 180);
  });
}
