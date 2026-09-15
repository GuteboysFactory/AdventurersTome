import { universalDocumentRegistryApi } from "./universal-document-registry.js";

const ATUDB_ID = "adventurers-tome";

Hooks.once("ready", () => {
  const module = game.modules.get(ATUDB_ID);
  if (!module?.api || typeof module.api !== "object") {
    console.error("Adventurer's Tome | Universal Document API bridge could not find initialized Tome API.");
    return;
  }

  module.api.universalDocuments = universalDocumentRegistryApi();
  console.info("Adventurer's Tome | Universal Document Registry API bridge attached.");
});
