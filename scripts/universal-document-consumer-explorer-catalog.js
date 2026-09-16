const ATEC_ID = "adventurers-tome";
const ATEC_ROOT = "#adventurers-tome-app";

const ATEC_SECTIONS = Object.freeze({
  world: {
    page: ".at-world-page",
    catalog: '.at-world-card[data-journal-id]'
  },
  quests: {
    page: ".at-quests-page",
    catalog: '.at-quest-card[data-journal-id]'
  },
  sessions: {
    page: ".at-sessions-page",
    catalog: '.at-session-row[data-journal-id]'
  }
});

const ATEC_EXPLORER_ENTRY_SELECTOR = [
  '.at-em-entry-row[data-at-cw-journal-id]',
  '.at-cw-tree-entry[data-at-cw-journal-id]'
].join(', ');

let atecAttached = false;
let atecTimer = null;
let atecObserver = null;
let atecScheduled = false;
let atecRegistry = null;

const atecStats = {
  reconcileCalls: 0,
  catalogBefore: 0,
  catalogAfter: 0,
  catalogFiltered: 0,
  explorerBefore: 0,
  explorerAfter: 0,
  explorerFiltered: 0,
  foldersHidden: 0,
  lastSection: ""
};

function atecModule() {
  return game.modules.get(ATEC_ID);
}

function atecResolveJournal(id) {
  const key = String(id || "").trim();
  if (!key || !atecRegistry) return null;
  return atecRegistry.resolve(`JournalEntry.${key}`) || null;
}

function atecSection(root) {
  for (const [section, config] of Object.entries(ATEC_SECTIONS)) {
    const page = root.querySelector(config.page);
    if (page) return { section, config, page };
  }
  return null;
}

function atecSetCanonicalVisibility(node, visible) {
  node.hidden = !visible;
  node.classList.toggle("at-universal-registry-filtered", !visible);
  node.dataset.atUniversalRegistryVisible = visible ? "1" : "0";
}

function atecExplorerJournalId(node) {
  const direct = String(node?.dataset?.atCwJournalId || "").trim();
  if (direct) return direct;
  const nested = node?.querySelector?.('[data-at-cw-open-journal]');
  return String(nested?.dataset?.atCwOpenJournal || "").trim();
}

function atecExplorerNodes(page) {
  return [...page.querySelectorAll(ATEC_EXPLORER_ENTRY_SELECTOR)];
}

function atecReconcileFolders(page) {
  let hiddenCount = 0;
  const folders = [...page.querySelectorAll(".at-cw-tree-folder")].reverse();
  for (const folder of folders) {
    const children = folder.querySelector(":scope > .at-cw-tree-children");
    const directVisibleEntry = children
      ? [...children.querySelectorAll(":scope > .at-em-entry-row[data-at-cw-journal-id], :scope > .at-cw-tree-entry[data-at-cw-journal-id]")]
        .some((entry) => !entry.hidden)
      : false;
    const visibleChildFolder = children
      ? [...children.querySelectorAll(":scope > .at-cw-tree-folder")].some((child) => !child.hidden)
      : false;
    const visible = game.user?.isGM || directVisibleEntry || visibleChildFolder;
    folder.hidden = !visible;
    folder.classList.toggle("at-universal-registry-filtered", !visible);
    if (!visible) hiddenCount += 1;
  }
  return hiddenCount;
}

function atecReconcile() {
  if (!atecAttached || !atecRegistry) return;
  const root = document.querySelector(ATEC_ROOT);
  if (!root) return;
  const current = atecSection(root);
  if (!current) return;

  const { section, config, page } = current;
  atecStats.reconcileCalls += 1;
  atecStats.lastSection = section;

  const catalogNodes = [...page.querySelectorAll(config.catalog)];
  let catalogVisible = 0;
  for (const node of catalogNodes) {
    const visible = Boolean(atecResolveJournal(node.dataset.journalId));
    atecSetCanonicalVisibility(node, visible);
    if (visible) catalogVisible += 1;
  }

  const explorerNodes = atecExplorerNodes(page);
  let explorerVisible = 0;
  for (const node of explorerNodes) {
    const journalId = atecExplorerJournalId(node);
    const visible = Boolean(journalId && atecResolveJournal(journalId));
    atecSetCanonicalVisibility(node, visible);
    if (visible) explorerVisible += 1;
  }

  atecStats.catalogBefore = catalogNodes.length;
  atecStats.catalogAfter = catalogVisible;
  atecStats.catalogFiltered = Math.max(0, catalogNodes.length - catalogVisible);
  atecStats.explorerBefore = explorerNodes.length;
  atecStats.explorerAfter = explorerVisible;
  atecStats.explorerFiltered = Math.max(0, explorerNodes.length - explorerVisible);
  atecStats.foldersHidden = atecReconcileFolders(page);

  const explorer = page.querySelector(".at-cw-explorer");
  if (explorer) explorer.dataset.atUniversalRegistryConsumer = "explorer-catalog";
  const catalog = page.querySelector(".at-cw-catalog, .at-world-catalog, .at-quest-catalog, .at-session-workspace");
  if (catalog) catalog.dataset.atUniversalRegistryConsumer = "explorer-catalog";
}

function atecSchedule() {
  if (atecScheduled) return;
  atecScheduled = true;
  window.setTimeout(() => {
    atecScheduled = false;
    atecReconcile();
  }, 0);
}

function atecInstallObserver() {
  const root = document.querySelector(ATEC_ROOT);
  if (!root || root.__atUniversalExplorerCatalogObserver) return;

  atecObserver?.disconnect?.();
  atecObserver = new MutationObserver(() => atecSchedule());
  atecObserver.observe(root, { childList: true, subtree: true });

  Object.defineProperty(root, "__atUniversalExplorerCatalogObserver", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
  atecSchedule();
}

function atecAttach() {
  if (atecAttached) {
    atecInstallObserver();
    return true;
  }

  const module = atecModule();
  const registry = module?.api?.universalDocuments;
  if (!registry?.permissionAwareRead || typeof registry.consumerAudit !== "function") return false;

  const priorAudit = registry.consumerAudit.bind(registry);
  module.api.universalDocuments = Object.freeze({
    ...registry,
    consumerLayer: "search-navigation+explorer-catalog",
    consumerAudit: () => ({
      ...priorAudit(),
      consumerLayer: "search-navigation+explorer-catalog",
      explorerCatalog: { ...atecStats }
    }),
    explorerCatalogAudit: () => ({
      mode: "permission-aware-read",
      consumerLayer: "explorer-catalog",
      attached: true,
      userRole: game.user?.isGM ? "gm" : "player",
      ...atecStats
    })
  });

  atecRegistry = module.api.universalDocuments;
  atecAttached = true;
  if (atecTimer) {
    window.clearInterval(atecTimer);
    atecTimer = null;
  }

  atecInstallObserver();
  console.info("Adventurer's Tome | Universal Registry consumer layer attached: Explorer + Catalog.");
  return true;
}

function atecWatch() {
  if (atecAttach() || atecTimer) return;
  atecTimer = window.setInterval(atecAttach, 100);
}

Hooks.once("ready", atecWatch);
Hooks.on("renderApplicationV2", () => {
  atecWatch();
  if (atecAttached) {
    atecInstallObserver();
    atecSchedule();
  }
});
