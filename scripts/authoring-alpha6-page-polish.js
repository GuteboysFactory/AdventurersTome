const ATA6_MODULE_ID = "adventurers-tome";
const ATA6_ROOT = "#adventurers-tome-app";
let atA6Timer = null;

function atA6Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA6TypeIcon(type) {
  return ({
    text: "fa-file-lines",
    image: "fa-image",
    video: "fa-film",
    pdf: "fa-file-pdf"
  })[String(type || "text").toLowerCase()] || "fa-file";
}

function atA6CanViewPage(page, journal) {
  if (game.user?.isGM) return true;
  try {
    if (page?.testUserPermission?.(game.user, "OBSERVER")) return true;
    if (journal?.testUserPermission?.(game.user, "OBSERVER")) return true;
  } catch (_err) {}
  return Boolean(page?.visible ?? journal?.visible ?? false);
}

function atA6CanEdit(journal) {
  if (!journal || !game.user) return false;
  if (game.user.isGM) return true;
  try {
    if (journal.isOwner || journal.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  const editors = journal.getFlag?.(ATA6_MODULE_ID, "worldEditors");
  return Array.isArray(editors) && editors.map(String).includes(String(game.user.id));
}

function atA6Detail() {
  const root = document.querySelector(ATA6_ROOT);
  if (!root) return null;

  const world = root.querySelector(".at-world-profile-page");
  if (world) {
    const source = world.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "world", container: world, journal };
  }

  const quest = root.querySelector(".at-quest-detail-page");
  if (quest) {
    const source = quest.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "quests", container: quest, journal };
  }

  const session = root.querySelector(".at-session-detail");
  if (session) {
    const source = session.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "sessions", container: session, journal };
  }

  return null;
}

function atA6PrimaryPageId(detail) {
  const pages = [...(detail.journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (!pages.length) return "";

  if (detail.section === "world") {
    const profile = detail.journal.getFlag?.(ATA6_MODULE_ID, "worldProfile") || {};
    const preferred = String(detail.journal.getFlag?.(ATA6_MODULE_ID, "worldSyncPage") || profile.syncPageId || "");
    if (preferred && pages.some((page) => page.id === preferred)) return preferred;
  }

  return pages.find((page) => String(page.type || "text").toLowerCase() === "text")?.id || pages[0]?.id || "";
}

function atA6Pages(detail) {
  return [...(detail.journal.pages?.contents ?? [])]
    .filter((page) => atA6CanViewPage(page, detail.journal))
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
}

function atA6NavigatorHost(detail) {
  if (detail.section === "sessions") return detail.container.querySelector(".at-session-detail-head") || detail.container.firstElementChild;
  return detail.container.querySelector(".at-profile-toolbar, .at-quest-detail-hero, .at-profile-intro") || detail.container.firstElementChild;
}

function atA6PageSurface(detail, pageId) {
  const escaped = CSS.escape(String(pageId || ""));
  return detail.container.querySelector(
    `.at-world-journal-page[data-page-id="${escaped}"], .at-af-page[data-page-id="${escaped}"], [data-page-id="${escaped}"]`
  );
}

function atA6ScrollToPage(detail, pageId) {
  const page = detail.journal.pages?.get(String(pageId || ""));
  if (!page) return;

  let target = atA6PageSurface(detail, page.id);
  const primaryId = atA6PrimaryPageId(detail);
  if (!target && page.id === primaryId) {
    target = detail.section === "sessions"
      ? detail.container.querySelector(".at-session-detail-summary, .at-session-detail-body")
      : detail.container.querySelector(".at-profile-intro, .at-quest-detail-hero, .at-profile-panel");
  }

  if (!target) {
    ui.notifications.info(`Adventurer's Tome: ${page.name} is managed in Page Manager but has no separate inline surface in this view.`);
    return;
  }

  target.scrollIntoView?.({ behavior: "smooth", block: "start" });
  target.classList.add("at-a6-page-focus");
  window.setTimeout(() => target.classList.remove("at-a6-page-focus"), 1500);
}

function atA6OpenManager(detail) {
  const button = detail.container.querySelector(`[data-at-a2-page-manager="${CSS.escape(detail.journal.id)}"], [data-at-wj-action="editPages"][data-journal-id="${CSS.escape(detail.journal.id)}"]`);
  if (button) button.click();
  else ui.notifications.warn("Adventurer's Tome: Page Manager is not available for this entry.");
}

function atA6NavigatorMarkup(detail) {
  const pages = atA6Pages(detail);
  const primaryId = atA6PrimaryPageId(detail);
  const canEdit = atA6CanEdit(detail.journal);
  const chips = pages.map((page, index) => {
    const type = String(page.type || "text").toLowerCase();
    const primary = page.id === primaryId;
    return `<button type="button" class="at-a6-page-chip ${primary ? "is-primary" : ""}" data-at-a6-page="${atA6Escape(page.id)}" title="Jump to ${atA6Escape(page.name || "Untitled page")}"><i class="fa-solid ${atA6TypeIcon(type)}"></i><span>${atA6Escape(page.name || `Page ${index + 1}`)}</span>${primary ? '<small>Primary</small>' : ""}</button>`;
  }).join("");

  return `<section class="at-a6-page-navigator" data-at-a6-journal="${atA6Escape(detail.journal.id)}">
    <div class="at-a6-page-nav-head"><div><span class="at-kicker">Journal Pages</span><strong>${pages.length} ${pages.length === 1 ? "page" : "pages"}</strong></div>${canEdit ? '<button type="button" class="at-secondary at-a6-manage-pages" data-at-a6-manage-pages><i class="fa-solid fa-layer-group"></i> Manage Pages</button>' : ""}</div>
    <div class="at-a6-page-chips">${chips || '<span class="at-a6-page-empty"><i class="fa-solid fa-file-circle-question"></i> No readable Journal pages yet.</span>'}</div>
  </section>`;
}

function atA6EnhanceDetail() {
  const detail = atA6Detail();
  if (!detail) return;

  const existing = detail.container.querySelector(":scope > .at-a6-page-navigator, .at-a6-page-navigator");
  const signature = atA6Pages(detail).map((page) => `${page.id}:${page.name}:${page.type}:${page.sort}:${page._stats?.modifiedTime || 0}`).join("|");
  if (existing?.dataset?.signature === signature) return;
  existing?.remove();

  const wrapper = document.createElement("div");
  wrapper.innerHTML = atA6NavigatorMarkup(detail);
  const navigator = wrapper.firstElementChild;
  navigator.dataset.signature = signature;

  const host = atA6NavigatorHost(detail);
  if (host) host.insertAdjacentElement("afterend", navigator);
  else detail.container.prepend(navigator);
}

function atA6EnhanceManager() {
  const root = document.querySelector(ATA6_ROOT);
  const overlay = root?.querySelector(".at-a2-page-manager-overlay[data-journal-id]");
  if (!overlay) return;
  const journal = game.journal?.get(String(overlay.dataset.journalId || ""));
  if (!journal) return;

  const manager = overlay.querySelector(".at-a2-page-manager");
  const rows = [...overlay.querySelectorAll(".at-a2-page-row[data-page-id]")];
  if (!manager) return;

  let summary = manager.querySelector(":scope > .at-a6-manager-summary");
  const types = rows.reduce((acc, row) => {
    const page = journal.pages?.get(String(row.dataset.pageId || ""));
    const type = String(page?.type || "text").toLowerCase();
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const typeText = Object.entries(types).map(([type, count]) => `${count} ${type}`).join(" · ") || "No pages yet";
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "at-a6-manager-summary";
    const hint = manager.querySelector(".at-a2-manager-hint");
    if (hint) hint.insertAdjacentElement("afterend", summary);
    else manager.querySelector(".at-a2-manager-add")?.insertAdjacentElement("afterend", summary);
  }
  summary.innerHTML = `<div><i class="fa-solid fa-layer-group"></i><strong>${rows.length} ${rows.length === 1 ? "Journal Page" : "Journal Pages"}</strong><span>${atA6Escape(typeText)}</span></div><span>Drag rows or use arrows to set reading order.</span>`;

  for (const row of rows) {
    if (row.querySelector("[data-at-a6-jump-manager-page]")) continue;
    const actions = row.querySelector(".at-a2-page-actions");
    if (!actions) continue;
    const jump = document.createElement("button");
    jump.type = "button";
    jump.dataset.atA6JumpManagerPage = String(row.dataset.pageId || "");
    jump.title = "Close Page Manager and jump to this page in Tome";
    jump.innerHTML = '<i class="fa-solid fa-arrow-turn-down"></i>';
    actions.prepend(jump);
  }

  const empty = overlay.querySelector(".at-a2-page-list > .at-empty");
  if (empty) {
    empty.classList.add("at-a6-manager-empty");
    empty.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i><strong>No Journal pages yet</strong><span>Add a Text, Image, Video or PDF page above. It will be written directly to this Foundry Journal.</span>';
  }
}

function atA6Schedule(delay = 80) {
  window.clearTimeout(atA6Timer);
  atA6Timer = window.setTimeout(() => {
    atA6Timer = null;
    atA6EnhanceDetail();
    atA6EnhanceManager();
  }, delay);
}

function atA6InstallHandlers() {
  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest?.(`${ATA6_ROOT} [data-at-a6-page]`);
    if (pageButton) {
      event.preventDefault();
      event.stopPropagation();
      const detail = atA6Detail();
      if (detail) atA6ScrollToPage(detail, String(pageButton.dataset.atA6Page || ""));
      return;
    }

    const manage = event.target.closest?.(`${ATA6_ROOT} [data-at-a6-manage-pages]`);
    if (manage) {
      event.preventDefault();
      event.stopPropagation();
      const detail = atA6Detail();
      if (detail) {
        atA6OpenManager(detail);
        window.setTimeout(() => atA6EnhanceManager(), 0);
        window.setTimeout(() => atA6EnhanceManager(), 80);
      }
      return;
    }

    const jump = event.target.closest?.(`${ATA6_ROOT} [data-at-a6-jump-manager-page]`);
    if (jump) {
      event.preventDefault();
      event.stopPropagation();
      const pageId = String(jump.dataset.atA6JumpManagerPage || "");
      document.querySelector(`${ATA6_ROOT} [data-at-a2-manager-close]`)?.click();
      window.setTimeout(() => {
        const detail = atA6Detail();
        if (detail) atA6ScrollToPage(detail, pageId);
      }, 80);
      return;
    }

    if (event.target.closest?.(`${ATA6_ROOT} [data-at-a2-page-manager], ${ATA6_ROOT} [data-at-wj-action="editPages"]`)) {
      window.setTimeout(() => atA6EnhanceManager(), 0);
      window.setTimeout(() => atA6EnhanceManager(), 80);
      return;
    }

    if (event.target.closest?.(`${ATA6_ROOT} [data-action="openWorldProfile"], ${ATA6_ROOT} [data-action="openQuestDetail"], ${ATA6_ROOT} [data-action="selectSession"], ${ATA6_ROOT} [data-action="navigate"]`)) {
      atA6Schedule(100);
      window.setTimeout(() => atA6Schedule(20), 220);
    }
  }, true);
}

Hooks.once("ready", () => {
  atA6InstallHandlers();
  atA6Schedule(350);
  window.setTimeout(() => atA6Schedule(20), 900);
});

for (const hookName of ["renderApplication", "renderApplicationV2", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => atA6Schedule(140));
}
