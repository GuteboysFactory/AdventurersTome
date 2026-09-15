import { getActorEmbeddedItems } from "./embedded-item-registry-helper.js";

const MODULE_ID = "adventurers-tome";

function attachEmbeddedItemExtension() {
  const module = game.modules.get(MODULE_ID);
  const base = module?.api?.universalDocuments;
  if (!base || base.embeddedItems) return Boolean(base);

  const resolveEmbedded = (uuid) => getActorEmbeddedItems().find((item) => item.uuid === String(uuid || "")) || null;
  const originalAudit = base.audit.bind(base);
  const originalHas = base.has.bind(base);
  const originalGet = base.get.bind(base);
  const originalResolve = base.resolve.bind(base);

  module.api.universalDocuments = Object.freeze({
    ...base,
    audit: () => {
      const audit = originalAudit();
      const embeddedItems = getActorEmbeddedItems();
      const badItemParents = embeddedItems
        .filter((item) => !originalHas(item.parent?.uuid))
        .map((item) => ({ uuid: item.uuid, parentUuid: item.parent?.uuid || "" }));
      return {
        ...audit,
        schemaVersion: 3,
        total: audit.total + embeddedItems.length,
        byType: { ...audit.byType, Item: Number(audit.byType?.Item || 0) + embeddedItems.length },
        embeddedByType: { Item: embeddedItems.length, JournalEntryPage: Number(audit.byType?.JournalEntryPage || 0) },
        badItemParents,
        healthy: Boolean(audit.healthy) && badItemParents.length === 0
      };
    },
    has: (uuid) => originalHas(uuid) || Boolean(resolveEmbedded(uuid)),
    get: (uuid) => {
      const row = originalGet(uuid);
      if (row) return row;
      const item = resolveEmbedded(uuid);
      if (!item) return null;
      return {
        uuid: item.uuid,
        id: item.id,
        documentName: "Item",
        name: item.name,
        parentUuid: item.parent?.uuid || "",
        embedded: true
      };
    },
    resolve: (uuid) => originalResolve(uuid) || resolveEmbedded(uuid),
    embeddedItems: () => getActorEmbeddedItems().map((item) => ({
      uuid: item.uuid,
      name: item.name,
      parentUuid: item.parent?.uuid || ""
    }))
  });

  console.info("Adventurer's Tome | Embedded Item registry extension attached.");
  return true;
}

Hooks.once("ready", () => {
  const timer = setInterval(() => {
    if (attachEmbeddedItemExtension()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 30000);
});
