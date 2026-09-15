const ATR_ID = "adventurers-tome";

function atRelationParent(document) {
  if (!document) return null;
  if (document.documentName === "JournalEntryPage") return document.parent || null;
  if (document.documentName === "Item" && document.parent?.documentName === "Actor") return document.parent;
  return document.folder || null;
}

function atRelationKind(document) {
  if (document?.documentName === "JournalEntryPage") return "journal-page";
  if (document?.documentName === "Item" && document.parent?.documentName === "Actor") return "actor-item";
  if (document?.folder) return "folder-child";
  return "";
}

function atExpectedParentType(document) {
  if (document?.documentName === "JournalEntryPage") return "JournalEntry";
  if (document?.documentName === "Item" && document.parent) return "Actor";
  if (document?.folder) return "Folder";
  return "";
}

function attachRelationAudit() {
  const module = game.modules.get(ATR_ID);
  const base = module?.api?.universalDocuments;
  if (!base || !base.embeddedItems || base.relationAudit) return Boolean(base?.relationAudit);

  const audit = () => {
    const rows = new Map();
    for (const row of base.snapshot()) if (row?.uuid) rows.set(row.uuid, row);
    for (const row of base.embeddedItems()) if (row?.uuid) rows.set(row.uuid, row);

    const edgeCounts = { "actor-item": 0, "journal-page": 0, "folder-child": 0 };
    const missingParents = [];
    const parentTypeMismatches = [];
    const visibilityMismatches = [];

    for (const row of rows.values()) {
      const document = base.resolve(row.uuid);
      if (!document) continue;
      const kind = atRelationKind(document);
      if (kind) {
        edgeCounts[kind] = Number(edgeCounts[kind] || 0) + 1;
        const parent = atRelationParent(document);
        const parentUuid = String(parent?.uuid || "");
        if (!parentUuid || !base.has(parentUuid)) {
          missingParents.push({ childUuid: document.uuid, parentUuid, kind });
        } else {
          const expected = atExpectedParentType(document);
          if (expected && parent?.documentName !== expected) {
            parentTypeMismatches.push({ childUuid: document.uuid, parentUuid, expected, actual: parent?.documentName || "" });
          }
        }
      }

      if (!game.user?.isGM && document.visible === false) {
        visibilityMismatches.push({ uuid: document.uuid, documentName: document.documentName });
      }
    }

    return {
      mode: "shadow-read-only",
      edgeCounts,
      totalEdges: Object.values(edgeCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      missingParents,
      parentTypeMismatches,
      visibilityMismatches,
      healthy: missingParents.length === 0 && parentTypeMismatches.length === 0 && visibilityMismatches.length === 0
    };
  };

  module.api.universalDocuments = Object.freeze({
    ...base,
    relationAudit: () => audit()
  });
  console.info("Adventurer's Tome | Universal relation/visibility shadow audit attached.");
  return true;
}

Hooks.once("ready", () => {
  const timer = window.setInterval(() => {
    if (attachRelationAudit()) window.clearInterval(timer);
  }, 100);
  window.setTimeout(() => window.clearInterval(timer), 30000);
});
