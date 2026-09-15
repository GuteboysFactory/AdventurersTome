const ATR_ID = "adventurers-tome";
let atrTimer = null;
let atrAttached = false;

function relationParent(document) {
  if (!document) return null;
  if (document.documentName === "JournalEntryPage") return document.parent || null;
  if (document.documentName === "Item" && document.parent?.documentName === "Actor") return document.parent;
  return document.folder || null;
}

function relationKind(document) {
  if (document?.documentName === "JournalEntryPage") return "journal-page";
  if (document?.documentName === "Item" && document.parent?.documentName === "Actor") return "actor-item";
  if (document?.folder) return "folder-child";
  return "";
}

function expectedParentType(document) {
  if (document?.documentName === "JournalEntryPage") return "JournalEntry";
  if (document?.documentName === "Item" && document.parent?.documentName === "Actor") return "Actor";
  if (document?.folder) return "Folder";
  return "";
}

function increment(map, key) {
  const type = String(key || "Unknown");
  map[type] = Number(map[type] || 0) + 1;
}

function attachRelationAudit() {
  if (atrAttached) return true;
  const module = game.modules.get(ATR_ID);
  const base = module?.api?.universalDocuments;
  if (!base?.embeddedItems) return false;
  if (base.relationAudit) {
    atrAttached = true;
    return true;
  }

  const audit = () => {
    const rows = new Map();
    for (const row of base.snapshot()) if (row?.uuid) rows.set(row.uuid, row);
    for (const row of base.embeddedItems()) if (row?.uuid) rows.set(row.uuid, row);

    const edgeCounts = { "actor-item": 0, "journal-page": 0, "folder-child": 0 };
    const missingParents = [];
    const parentTypeMismatches = [];
    const hiddenByType = {};
    const tomeHiddenByType = {};
    const permissionBoundaryEdges = { "actor-item": 0, "journal-page": 0, "folder-child": 0 };
    let foundryVisible = 0;
    let foundryHiddenPresent = 0;
    let tomeViewable = 0;
    let tomeHiddenPresent = 0;

    for (const row of rows.values()) {
      const document = base.resolve(row.uuid);
      if (!document) continue;
      const kind = relationKind(document);
      const parent = kind ? relationParent(document) : null;

      if (kind) {
        edgeCounts[kind] = Number(edgeCounts[kind] || 0) + 1;
        const parentUuid = String(parent?.uuid || "");
        if (!parentUuid || !base.has(parentUuid)) {
          missingParents.push({ childUuid: document.uuid, parentUuid, kind });
        } else {
          const expected = expectedParentType(document);
          if (expected && parent?.documentName !== expected) {
            parentTypeMismatches.push({ childUuid: document.uuid, parentUuid, expected, actual: parent?.documentName || "" });
          }
          if (!game.user?.isGM && document.visible !== false && parent?.visible === false) {
            permissionBoundaryEdges[kind] = Number(permissionBoundaryEdges[kind] || 0) + 1;
          }
        }
      }

      if (document.visible === false) {
        foundryHiddenPresent += 1;
        increment(hiddenByType, document.documentName);
      } else {
        foundryVisible += 1;
      }

      const tomeCanView = typeof module.api.canView === "function" ? Boolean(module.api.canView(document)) : document.visible !== false;
      if (tomeCanView) {
        tomeViewable += 1;
      } else {
        tomeHiddenPresent += 1;
        increment(tomeHiddenByType, document.documentName);
      }
    }

    const structuralHealthy = missingParents.length === 0 && parentTypeMismatches.length === 0;
    const permissionReadyForTakeover = game.user?.isGM
      ? true
      : foundryHiddenPresent === 0 && tomeHiddenPresent === 0;

    return {
      mode: "shadow-read-only",
      userRole: game.user?.isGM ? "gm" : "player",
      edgeCounts,
      totalEdges: Object.values(edgeCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      missingParents,
      parentTypeMismatches,
      permission: {
        registryDocuments: rows.size,
        foundryVisible,
        foundryHiddenPresent,
        tomeViewable,
        tomeHiddenPresent,
        hiddenByType,
        tomeHiddenByType,
        permissionBoundaryEdges,
        readyForActiveFiltering: permissionReadyForTakeover
      },
      structuralHealthy,
      healthy: structuralHealthy
    };
  };

  module.api.universalDocuments = Object.freeze({ ...base, relationAudit: audit });
  atrAttached = true;
  if (atrTimer) {
    window.clearInterval(atrTimer);
    atrTimer = null;
  }
  console.info("Adventurer's Tome | Universal relation/permission shadow audit attached.");
  return true;
}

function watchRelationAudit() {
  if (attachRelationAudit() || atrTimer) return;
  atrTimer = window.setInterval(attachRelationAudit, 100);
}

Hooks.once("ready", watchRelationAudit);
Hooks.on("renderApplicationV2", watchRelationAudit);
