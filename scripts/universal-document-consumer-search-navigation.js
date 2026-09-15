const ATCSN_ID = "adventurers-tome";
let atcsnTimer = null;
let atcsnAttached = false;
let atcsnApp = null;
let atcsnRegistry = null;
let atcsnInitialRefreshQueued = false;

const atcsnStats = {
  prepareCalls: 0,
  searchBefore: 0,
  searchAfter: 0,
  searchFiltered: 0,
  navigationAllowed: 0,
  navigationBlocked: 0
};

function atcsnModule() {
  return game.modules.get(ATCSN_ID);
}

function atcsnRefKey(entry = {}) {
  const explicit = String(entry?.refKey || "").trim();
  if (explicit) return explicit;
  const type = String(entry?.refType || entry?.type || "").trim().toLowerCase();
  const id = String(entry?.id || "").trim();
  if (!type || !id) return "";
  if (!["session", "quest", "world", "rule", "actor"].includes(type)) return "";
  return `${type}:${id}`;
}

function atcsnUuidForRef(refKey = "") {
  const match = String(refKey || "").trim().match(/^(session|quest|world|rule|actor):(.+)$/i);
  if (!match) return "";
  const type = match[1].toLowerCase();
  const id = String(match[2] || "").trim();
  if (!id) return "";
  return type === "actor" ? `Actor.${id}` : `JournalEntry.${id}`;
}

function atcsnResolveRef(registry, refKey = "") {
  const uuid = atcsnUuidForRef(refKey);
  if (!uuid) return null;
  return registry.resolve(uuid) || null;
}

function atcsnInstallNavigationGuard(app, registry) {
  const root = app?.element;
  if (!root || root.__atUniversalRegistryNavGuard) return;

  const handler = (event) => {
    const target = event.target?.closest?.("[data-ref-key]");
    if (!target || !root.contains(target)) return;
    const refKey = String(target.dataset.refKey || "").trim();
    if (!refKey) return;

    if (!atcsnResolveRef(registry, refKey)) {
      atcsnStats.navigationBlocked += 1;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    atcsnStats.navigationAllowed += 1;
  };

  root.addEventListener("click", handler, true);
  Object.defineProperty(root, "__atUniversalRegistryNavGuard", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

function atcsnAttach() {
  if (atcsnAttached) return true;
  const module = atcsnModule();
  const registry = module?.api?.universalDocuments;
  const app = module?.api?.app?.();
  if (!registry?.permissionAwareRead || !app) return false;
  if (app.__atUniversalConsumerSearchNavigation) {
    atcsnAttached = true;
    atcsnApp = app;
    atcsnRegistry = registry;
    atcsnInstallNavigationGuard(app, registry);
    return true;
  }

  const originalPrepareContext = app._prepareContext?.bind(app);
  if (typeof originalPrepareContext !== "function") return false;

  app._prepareContext = async function(options) {
    const context = await originalPrepareContext(options);
    atcsnStats.prepareCalls += 1;

    if (Array.isArray(context?.searchEntries)) {
      const before = context.searchEntries.length;
      context.searchEntries = context.searchEntries.filter((entry) => {
        const refKey = atcsnRefKey(entry);
        if (!refKey) return true;
        return Boolean(atcsnResolveRef(registry, refKey));
      });
      const after = context.searchEntries.length;
      atcsnStats.searchBefore = before;
      atcsnStats.searchAfter = after;
      atcsnStats.searchFiltered = Math.max(0, before - after);
      if (context.searchState && typeof context.searchState === "object") {
        context.searchState.canonicalSource = "universal-document-registry";
        context.searchState.permissionAware = true;
      }
    }

    return context;
  };

  Object.defineProperty(app, "__atUniversalConsumerSearchNavigation", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  module.api.universalDocuments = Object.freeze({
    ...registry,
    consumerLayer: "search-navigation",
    consumerAudit: () => ({
      mode: "permission-aware-read",
      consumerLayer: "search-navigation",
      attached: true,
      userRole: game.user?.isGM ? "gm" : "player",
      ...atcsnStats
    })
  });

  atcsnApp = app;
  atcsnRegistry = module.api.universalDocuments;
  atcsnAttached = true;
  atcsnInstallNavigationGuard(app, atcsnRegistry);

  // The consumer can attach after an already-open Tome has completed its first
  // render. Force one settled main render so Search is immediately rebuilt from
  // the canonical registry instead of waiting for unrelated navigation.
  if (app.rendered && !atcsnInitialRefreshQueued) {
    atcsnInitialRefreshQueued = true;
    window.setTimeout(() => {
      app.render({ parts: ["main"] }).catch((error) => console.error("Adventurer's Tome | Universal consumer initial refresh failed", error));
    }, 0);
  }

  if (atcsnTimer) {
    window.clearInterval(atcsnTimer);
    atcsnTimer = null;
  }
  console.info("Adventurer's Tome | Universal Registry consumer layer attached: Search + Navigation.");
  return true;
}

function atcsnWatch() {
  if (atcsnAttach() || atcsnTimer) return;
  atcsnTimer = window.setInterval(atcsnAttach, 100);
}

Hooks.once("ready", atcsnWatch);
Hooks.on("renderApplicationV2", (renderedApp) => {
  atcsnWatch();
  if (atcsnAttached && renderedApp === atcsnApp && atcsnRegistry) {
    atcsnInstallNavigationGuard(atcsnApp, atcsnRegistry);
  }
});
