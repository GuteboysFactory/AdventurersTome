const ATCSN_ID = "adventurers-tome";
let atcsnTimer = null;
let atcsnAttached = false;

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

function atcsnAttach() {
  if (atcsnAttached) return true;
  const module = atcsnModule();
  const registry = module?.api?.universalDocuments;
  const app = module?.api?.app?.();
  if (!registry?.permissionAwareRead || !app) return false;
  if (app.__atUniversalConsumerSearchNavigation) {
    atcsnAttached = true;
    return true;
  }

  const originalPrepareContext = app._prepareContext?.bind(app);
  const originalOpenRefKey = app._openRefKey?.bind(app);
  if (typeof originalPrepareContext !== "function" || typeof originalOpenRefKey !== "function") return false;

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

  app._openRefKey = async function(refKey, options = {}) {
    const uuid = atcsnUuidForRef(refKey);
    if (uuid) {
      const document = registry.resolve(uuid);
      if (!document) {
        atcsnStats.navigationBlocked += 1;
        return false;
      }
      atcsnStats.navigationAllowed += 1;
    }
    return originalOpenRefKey(refKey, options);
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

  atcsnAttached = true;
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
Hooks.on("renderApplicationV2", atcsnWatch);
