const ATCG_ID = "adventurers-tome";
let atcgAttached = false;
let atcgTimer = null;

const ATCG_TAKEOVER_CONSUMERS = Object.freeze([
  "quick-import",
  "folder-quick-import",
  "world-source-actions",
  "import-identity-hardening"
]);

function atcgModule() {
  return game.modules.get(ATCG_ID);
}

function atcgSafe(fn) {
  try { return typeof fn === "function" ? fn() : null; }
  catch (error) {
    return { healthy: false, error: error?.message || String(error) };
  }
}

function atcgConsumerEvidence(takeover = {}) {
  const consumers = takeover?.consumers && typeof takeover.consumers === "object"
    ? takeover.consumers
    : {};

  const rows = ATCG_TAKEOVER_CONSUMERS.map((consumer) => {
    const stats = consumers[consumer] || {};
    const registryHits = Number(stats.registryHits || 0);
    const compendiumFallbacks = Number(stats.compendiumFallbacks || 0);
    const misses = Number(stats.misses || 0);
    return {
      consumer,
      registryHits,
      compendiumFallbacks,
      misses,
      observed: registryHits + compendiumFallbacks + misses > 0,
      healthy: misses === 0
    };
  });

  return {
    required: [...ATCG_TAKEOVER_CONSUMERS],
    observed: rows.filter((row) => row.observed).map((row) => row.consumer),
    unobserved: rows.filter((row) => !row.observed).map((row) => row.consumer),
    rows,
    allObserved: rows.every((row) => row.observed),
    allObservedHealthy: rows.filter((row) => row.observed).every((row) => row.healthy)
  };
}

function atcgAudit() {
  const registry = atcgModule()?.api?.universalDocuments;
  if (!registry) {
    return {
      phase: "v1.3-universal-convergence-gate",
      attached: atcgAttached,
      healthy: false,
      error: "Universal Document Registry API is unavailable."
    };
  }

  const base = atcgSafe(registry.audit?.bind(registry));
  const relations = atcgSafe(registry.relationAudit?.bind(registry));
  const searchNavigation = atcgSafe(registry.consumerAudit?.bind(registry));
  const explorerCatalog = atcgSafe(registry.explorerCatalogAudit?.bind(registry));
  const lifecycle = atcgSafe(registry.lifecycleAudit?.bind(registry));
  const importIdentity = atcgSafe(registry.importIdentityAudit?.bind(registry));
  const takeover = atcgSafe(registry.takeoverAudit?.bind(registry));
  const evidence = atcgConsumerEvidence(takeover || {});

  const checks = {
    registry: Boolean(base?.healthy),
    relations: Boolean(relations?.healthy ?? relations?.structuralHealthy),
    permissionAwareRead: registry.permissionAwareRead === true,
    searchNavigationAttached: Boolean(searchNavigation?.attached),
    explorerCatalogAttached: Boolean(explorerCatalog?.attached),
    lifecycle: Boolean(lifecycle?.healthy),
    importIdentity: Boolean(importIdentity?.healthy),
    takeoverAttached: Boolean(takeover?.attached),
    takeoverMissesZero: Number(takeover?.misses || 0) === 0,
    takeoverObservedConsumersHealthy: evidence.allObservedHealthy
  };

  const structuralHealthy = Object.values(checks).every(Boolean);
  const qaComplete = structuralHealthy && evidence.allObserved;

  return {
    phase: "v1.3-universal-convergence-gate",
    mode: "foundry-document-backed-tome-rendered",
    attached: atcgAttached,
    platform: base?.platform || null,
    checks,
    structuralHealthy,
    qaComplete,
    healthy: structuralHealthy,
    consumerEvidence: evidence,
    registry: base ? {
      healthy: Boolean(base.healthy),
      total: Number(base.total ?? base.activeVisibleTotal ?? 0),
      mode: base.mode || registry.mode || ""
    } : null,
    relations: relations ? {
      healthy: Boolean(relations.healthy ?? relations.structuralHealthy),
      totalEdges: Number(relations.totalEdges || 0),
      missingParentCount: Array.isArray(relations.missingParents)
        ? relations.missingParents.length
        : Number(relations.missingParentCount || 0),
      parentTypeMismatchCount: Array.isArray(relations.parentTypeMismatches)
        ? relations.parentTypeMismatches.length
        : Number(relations.parentTypeMismatchCount || 0)
    } : null,
    consumers: {
      searchNavigation,
      explorerCatalog
    },
    lifecycle: lifecycle ? {
      healthy: Boolean(lifecycle.healthy),
      pending: Array.isArray(lifecycle.pending) ? lifecycle.pending.length : 0,
      failures: Array.isArray(lifecycle.failures) ? lifecycle.failures.length : 0
    } : null,
    importIdentity: importIdentity ? {
      healthy: Boolean(importIdentity.healthy),
      uuidMismatches: Number(importIdentity.uuidMismatches || 0),
      typeMismatches: Number(importIdentity.typeMismatches || 0),
      duplicateSourceUuids: Number(importIdentity.duplicateSourceUuids || 0),
      missingSources: Number(importIdentity.missingSources || 0)
    } : null,
    takeover: takeover ? {
      attached: Boolean(takeover.attached),
      registryHits: Number(takeover.registryHits || 0),
      compendiumFallbacks: Number(takeover.compendiumFallbacks || 0),
      misses: Number(takeover.misses || 0),
      consumers: foundry.utils.deepClone(takeover.consumers || {})
    } : null
  };
}

function atcgAttach() {
  if (atcgAttached) return true;
  const module = atcgModule();
  const registry = module?.api?.universalDocuments;
  if (!registry?.takeoverConvergence || typeof registry.takeoverAudit !== "function") return false;
  if (typeof registry.lifecycleAudit !== "function" || typeof registry.importIdentityAudit !== "function") return false;

  module.api.universalDocuments = Object.freeze({
    ...registry,
    convergenceGate: true,
    convergenceAudit: () => atcgAudit()
  });

  atcgAttached = true;
  if (atcgTimer) {
    window.clearInterval(atcgTimer);
    atcgTimer = null;
  }
  console.info("Adventurer's Tome | v1.3 Universal convergence gate attached.");
  return true;
}

function atcgWatch() {
  if (atcgAttach() || atcgTimer) return;
  atcgTimer = window.setInterval(atcgAttach, 100);
}

Hooks.once("ready", atcgWatch);
Hooks.on("renderApplicationV2", atcgWatch);
