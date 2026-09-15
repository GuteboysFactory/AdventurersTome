import { universalDocumentRegistryApi } from "./universal-document-registry.js";

const ATUDB_ID = "adventurers-tome";
const ATUDB_TIMEOUT_MS = 30000;
const ATUDB_INTERVAL_MS = 100;
let atUdbAttached = false;
let atUdbTimer = null;

function atUdbAttach() {
  if (atUdbAttached) return true;
  const module = game.modules.get(ATUDB_ID);
  const api = module?.api;
  if (!api || typeof api !== "object") return false;

  try {
    api.universalDocuments = universalDocumentRegistryApi();
    if (!api.universalDocuments) return false;
    atUdbAttached = true;
    console.info("Adventurer's Tome | Universal Document Registry API bridge attached.");
    return true;
  } catch (error) {
    console.error("Adventurer's Tome | Universal Document Registry API bridge attach failed", error);
    return false;
  }
}

function atUdbWaitForApi() {
  if (atUdbAttach()) return;

  const startedAt = Date.now();
  window.clearInterval(atUdbTimer);
  atUdbTimer = window.setInterval(() => {
    if (atUdbAttach()) {
      window.clearInterval(atUdbTimer);
      atUdbTimer = null;
      return;
    }

    if ((Date.now() - startedAt) >= ATUDB_TIMEOUT_MS) {
      window.clearInterval(atUdbTimer);
      atUdbTimer = null;
      console.error("Adventurer's Tome | Universal Document Registry API was not available after waiting for Tome async ready initialization.");
    }
  }, ATUDB_INTERVAL_MS);
}

Hooks.once("ready", () => {
  // Adventurer's Tome's own ready hook performs awaited private-data migration
  // before assigning module.api. Foundry does not await async hook callbacks, so
  // a later ready hook may still run before that assignment. Wait for the actual
  // API object instead of assuming ready-hook registration order is sufficient.
  atUdbWaitForApi();
});

// Extra harmless convergence point if another module delays startup unusually.
Hooks.on("renderApplicationV2", () => {
  if (!atUdbAttached) atUdbAttach();
});
