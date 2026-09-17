const ATUTC_ID = "adventurers-tome";

let atutcAttached = false;
let atutcTimer = null;
const atutcStats = {
  registryHits: 0,
  compendiumFallbacks: 0,
  misses: 0,
  consumers: {}
};

function atutcModule() {
  return game.modules.get(ATUTC_ID);
}

function atutcCount(consumer, field) {
  const key = String(consumer || "unknown");
  if (!atutcStats.consumers[key]) {
    atutcStats.consumers[key] = { registryHits: 0, compendiumFallbacks: 0, misses: 0 };
  }
  atutcStats[field] = Number(atutcStats[field] || 0) + 1;
  atutcStats.consumers[key][field] = Number(atutcStats.consumers[key][field] || 0) + 1;
}

async function atutcResolve(uuid, { consumer = "unknown", allowCompendium = true } = {}) {
  const key = String(uuid || "").trim();
  if (!key) {
    atutcCount(consumer, "misses");
    return null;
  }

  if (key.startsWith("Compendium.")) {
    if (!allowCompendium) {
      atutcCount(consumer, "misses");
      return null;
    }
    let document = null;
    try { document = await fromUuid(key); } catch (_err) {}
    if (document) atutcCount(consumer, "compendiumFallbacks");
    else atutcCount(consumer, "misses");
    return document || null;
  }

  const registry = atutcModule()?.api?.universalDocuments;
  const document = registry?.resolve?.(key) || null;
  if (document) atutcCount(consumer, "registryHits");
  else atutcCount(consumer, "misses");
  return document;
}

function atutcAudit() {
  return {
    mode: "universal-registry-primary",
    phase: "universal-takeover-convergence-i",
    attached: atutcAttached,
    worldResolutionPolicy: "registry-only",
    compendiumResolutionPolicy: "foundry-fromUuid-fallback",
    registryHits: atutcStats.registryHits,
    compendiumFallbacks: atutcStats.compendiumFallbacks,
    misses: atutcStats.misses,
    consumers: foundry.utils.deepClone(atutcStats.consumers),
    healthy: atutcStats.misses === 0
  };
}

function atutcAttach() {
  if (atutcAttached) return true;
  const module = atutcModule();
  const registry = module?.api?.universalDocuments;
  if (!registry?.importIdentityHardening || typeof registry.importIdentityAudit !== "function") return false;

  module.api.universalDocuments = Object.freeze({
    ...registry,
    takeoverConvergence: true,
    resolveCanonical: (uuid, options = {}) => atutcResolve(uuid, options),
    takeoverAudit: () => atutcAudit()
  });

  atutcAttached = true;
  if (atutcTimer) {
    window.clearInterval(atutcTimer);
    atutcTimer = null;
  }
  console.info("Adventurer's Tome | Universal Document takeover resolver convergence attached.");
  return true;
}

function atutcWatch() {
  if (atutcAttach() || atutcTimer) return;
  atutcTimer = window.setInterval(atutcAttach, 100);
}

Hooks.once("ready", atutcWatch);
Hooks.on("renderApplicationV2", atutcWatch);
