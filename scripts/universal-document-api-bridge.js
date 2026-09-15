import { universalDocumentRegistryApi } from "./universal-document-registry.js";

const ID = "adventurers-tome";
let timer = null;
let attached = false;

function attach() {
  if (attached) return true;
  const module = game.modules.get(ID);
  if (!module?.api || typeof module.api !== "object") return false;
  try {
    module.api.universalDocuments = universalDocumentRegistryApi();
    attached = Boolean(module.api.universalDocuments);
    if (attached && timer) {
      clearInterval(timer);
      timer = null;
    }
    if (attached) console.info("Adventurer's Tome | Universal Document Registry API bridge attached.");
    return attached;
  } catch (error) {
    console.error("Adventurer's Tome | Universal Document Registry API bridge attach failed", error);
    return false;
  }
}

function watch() {
  if (attach() || timer) return;
  timer = setInterval(attach, 100);
}

Hooks.once("ready", watch);
Hooks.on("renderApplicationV2", watch);
