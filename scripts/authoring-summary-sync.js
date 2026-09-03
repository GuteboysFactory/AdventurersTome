const ATSS_MODULE_ID = "adventurers-tome";
const ATSS_ROOT = "#adventurers-tome-app";
const ATSS_ATTR = "data-at-tome-summary";
let atSsQueued = false;
let atSsRepairing = false;

function atSsNormalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function atSsTextFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function atSsRemovePrefixFromNode(node, prefix) {
  let remaining = String(prefix || "");
  if (!node || !remaining) return false;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const textNode of textNodes) {
    if (!remaining) break;
    const raw = String(textNode.nodeValue || "");
    if (!raw) continue;
    const take = Math.min(raw.length, remaining.length);
    if (raw.slice(0, take) !== remaining.slice(0, take)) return false;
    textNode.nodeValue = raw.slice(take);
    remaining = remaining.slice(take);
  }
  if (remaining) return false;
  const first = textNodes.find((textNode) => String(textNode.nodeValue || "").length);
  if (first) first.nodeValue = String(first.nodeValue || "").replace(/^\s+/, "");
  return true;
}

function atSsNormalizeHtml(html) {
  const source = String(html || "");
  const host = document.createElement("div");
  host.innerHTML = source;
  let marker = host.querySelector(`[${ATSS_ATTR}]`);
  if (!marker) return { html: source, changed: false, summary: "" };

  const summary = atSsNormalizeText(marker.textContent);
  let changed = false;
  if (marker.tagName !== "H2") {
    const heading = document.createElement("h2");
    heading.setAttribute(ATSS_ATTR, "true");
    heading.textContent = summary;
    marker.replaceWith(heading);
    marker = heading;
    changed = true;
  } else if (marker.getAttribute(ATSS_ATTR) !== "true") {
    marker.setAttribute(ATSS_ATTR, "true");
    changed = true;
  }

  if (summary) {
    let body = marker.nextElementSibling;
    while (body && !atSsNormalizeText(body.textContent)) body = body.nextElementSibling;
    if (body) {
      const bodyText = atSsNormalizeText(body.textContent);
      if (bodyText === summary) {
        body.remove();
        changed = true;
      } else if (bodyText.startsWith(summary)) {
        const rawPrefix = String(marker.textContent || "").trim();
        if (atSsRemovePrefixFromNode(body, rawPrefix)) {
          if (!atSsNormalizeText(body.textContent) && !body.querySelector("img,video,audio,iframe")) body.remove();
          changed = true;
        }
      }
    }
  }

  return { html: host.innerHTML, changed: changed || host.innerHTML !== source, summary };
}

function atSsPrimaryPage(journal, section) {
  if (!journal) return null;
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (section === "world") {
    const profile = journal.getFlag?.(ATSS_MODULE_ID, "worldProfile") || {};
    const preferred = String(journal.getFlag?.(ATSS_MODULE_ID, "worldSyncPage") || profile?.syncPageId || "");
    const found = preferred ? pages.find((page) => page.id === preferred && String(page.type || "text").toLowerCase() === "text") : null;
    if (found) return found;
  }
  return pages.find((page) => String(page.type || "text").toLowerCase() === "text") || null;
}

function atSsSummaryFromPage(page) {
  if (!page) return "";
  const host = document.createElement("div");
  host.innerHTML = String(page?.text?.content ?? "");
  return atSsNormalizeText(host.querySelector(`[${ATSS_ATTR}]`)?.textContent);
}

function atSsDetail(root) {
  const world = root?.querySelector(".at-world-profile-page");
  if (world) {
    const source = world.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "world", container: world, journal };
  }
  const quest = root?.querySelector(".at-quest-detail-page");
  if (quest) {
    const source = quest.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "quests", container: quest, journal };
  }
  const session = root?.querySelector(".at-session-detail");
  if (session) {
    const source = session.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "sessions", container: session, journal };
  }
  return null;
}

function atSsHeroSummaryNode(detail) {
  if (!detail) return null;
  if (detail.section === "world") {
    const intro = detail.container.querySelector(".at-profile-intro");
    return intro ? [...intro.children].find((child) => child.tagName === "P") || null : null;
  }
  if (detail.section === "quests") return detail.container.querySelector(".at-quest-detail-hero > div > p, .at-quest-detail-hero p");
  return detail.container.querySelector(".at-session-detail-summary");
}

function atSsApplyPresentation() {
  const root = document.querySelector(ATSS_ROOT);
  if (!root) return;
  const detail = atSsDetail(root);
  if (!detail) return;
  const page = atSsPrimaryPage(detail.journal, detail.section);
  const summary = atSsSummaryFromPage(page);
  const hero = atSsHeroSummaryNode(detail);
  if (summary && hero && hero.dataset.atSsEditing !== "true" && hero.dataset.atAfEditing !== "true") {
    hero.textContent = summary;
    hero.dataset.atSsJournalBacked = "true";
    hero.title = "Journal-backed summary — click to edit; autosaves";
  }
  root.querySelectorAll(`[${ATSS_ATTR}]`).forEach((node) => {
    if (!node.closest(".at-profile-intro, .at-quest-detail-hero, .at-session-detail-head")) node.classList.add("at-summary-source-heading");
  });
}

function atSsQueuePresentation() {
  if (atSsQueued) return;
  atSsQueued = true;
  window.requestAnimationFrame(() => {
    atSsQueued = false;
    atSsApplyPresentation();
  });
}

async function atSsRepairExistingPages() {
  if (!game.user?.isGM || atSsRepairing) return;
  atSsRepairing = true;
  let repaired = 0;
  try {
    for (const journal of game.journal?.contents ?? []) {
      for (const page of journal.pages?.contents ?? []) {
        if (String(page.type || "text").toLowerCase() !== "text") continue;
        const raw = String(page?.text?.content ?? "");
        if (!raw.includes(ATSS_ATTR)) continue;
        const normalized = atSsNormalizeHtml(raw);
        if (!normalized.changed) continue;
        await page.update({ "text.content": normalized.html, "text.format": atSsTextFormat() }, { adventurersTomeSummaryRepair: true });
        repaired += 1;
      }
    }
    if (repaired) {
      console.info(`Adventurer's Tome | Repaired ${repaired} Journal-backed summary ${repaired === 1 ? "page" : "pages"}.`);
      ui.notifications.info(`Adventurer's Tome: Repaired ${repaired} Journal summary ${repaired === 1 ? "page" : "pages"}.`);
    }
  } catch (error) {
    console.error("Adventurer's Tome | Journal summary repair failed", error);
  } finally {
    atSsRepairing = false;
  }
}

Hooks.on("preUpdateJournalEntryPage", (page, changes, options) => {
  if (options?.adventurersTomeSummaryRepair) return;
  const content = foundry.utils.getProperty(changes, "text.content");
  if (typeof content !== "string" || !content.includes(ATSS_ATTR)) return;
  const normalized = atSsNormalizeHtml(content);
  if (!normalized.changed) return;
  foundry.utils.setProperty(changes, "text.content", normalized.html);
  foundry.utils.setProperty(changes, "text.format", atSsTextFormat());
});

Hooks.once("ready", () => {
  const observer = new MutationObserver(atSsQueuePresentation);
  observer.observe(document.body, { childList: true, subtree: true, characterData: false });
  void atSsRepairExistingPages().then(atSsQueuePresentation);
  atSsQueuePresentation();
});

for (const hookName of ["updateJournalEntry", "updateJournalEntryPage", "createJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, () => window.setTimeout(atSsQueuePresentation, 30));
}
