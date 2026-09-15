const ATPR_ID = "adventurers-tome";
let atprTimer = null;
let atprAttached = false;

function atprModule() {
  return game.modules.get(ATPR_ID);
}

function atprCanRead(document, module, seen = new Set()) {
  if (!document) return false;
  if (game.user?.isGM) return true;

  const uuid = String(document.uuid || "");
  if (uuid && seen.has(uuid)) return true;
  if (uuid) seen.add(uuid);

  if (document.visible === false) return false;
  if (typeof module?.api?.canView === "function" && !module.api.canView(document)) return false;

  const parent = document.parent || null;
  if (document.documentName === "JournalEntryPage" && parent) return atprCanRead(parent, module, seen);
  if (document.documentName === "Item" && parent?.documentName === "Actor") return atprCanRead(parent, module, seen);
  return true;
}

function atprActiveRows(base, module) {
  const rows = new Map();
  for (const row of base.snapshot?.() ?? []) if (row?.uuid) rows.set(row.uuid, row);
  for (const row of base.embeddedItems?.() ?? []) if (row?.uuid) rows.set(row.uuid, { ...row, documentName: "Item", embedded: true });

  return [...rows.values()].filter((row) => {
    const document = base.resolve(row.uuid);
    return atprCanRead(document, module);
  });
}

function atprActiveSummary(base, module) {
  const rows = atprActiveRows(base, module);
  const byType = {};
  for (const row of rows) {
    const type = String(row.documentName || "Unknown");
    byType[type] = Number(byType[type] || 0) + 1;
  }
  return { total: rows.length, byType };
}

function atprSanitizedAudit(base, module) {
  const raw = base.audit();
  const active = atprActiveSummary(base, module);
  if (game.user?.isGM) {
    return {
      ...raw,
      mode: "permission-aware-read",
      activeRead: { total: active.total, byType: active.byType, filtered: Math.max(0, Number(raw.total || 0) - active.total) }
    };
  }

  return {
    schema: raw.schema,
    schemaVersion: raw.schemaVersion,
    mode: "permission-aware-read",
    platform: raw.platform,
    supportedDocumentTypes: raw.supportedDocumentTypes,
    healthy: Boolean(raw.healthy),
    shadowTotal: Number(raw.total || 0),
    shadowByType: { ...(raw.byType || {}) },
    activeVisibleTotal: active.total,
    activeByType: active.byType,
    filteredCount: Math.max(0, Number(raw.total || 0) - active.total)
  };
}

function atprSanitizedRelationAudit(base) {
  const raw = base.relationAudit?.();
  if (!raw || game.user?.isGM) return raw;
  return {
    mode: raw.mode,
    userRole: raw.userRole,
    edgeCounts: { ...(raw.edgeCounts || {}) },
    totalEdges: Number(raw.totalEdges || 0),
    missingParentCount: Number(raw.missingParents?.length || 0),
    parentTypeMismatchCount: Number(raw.parentTypeMismatches?.length || 0),
    permission: raw.permission ? { ...raw.permission } : {},
    structuralHealthy: Boolean(raw.structuralHealthy),
    healthy: Boolean(raw.healthy)
  };
}

function atprAttach() {
  if (atprAttached) return true;
  const module = atprModule();
  const base = module?.api?.universalDocuments;
  if (!base?.relationAudit || !base?.embeddedItems) return false;
  if (base.permissionAwareRead) {
    atprAttached = true;
    return true;
  }

  const rawResolve = base.resolve.bind(base);
  const rawGet = base.get.bind(base);
  const rawVerify = base.verify?.bind(base);
  const rawLifecycle = base.lifecycle?.bind(base);
  const rawRebuild = base.rebuild?.bind(base);

  const resolveVisible = (uuid) => {
    const document = rawResolve(String(uuid || ""));
    return atprCanRead(document, module) ? document : null;
  };

  const activeRows = () => atprActiveRows(base, module);

  module.api.universalDocuments = Object.freeze({
    ...base,
    mode: "permission-aware-read",
    permissionAwareRead: true,
    audit: () => atprSanitizedAudit(base, module),
    relationAudit: () => atprSanitizedRelationAudit(base),
    rebuild: () => {
      rawRebuild?.();
      return atprSanitizedAudit(base, module);
    },
    has: (uuid) => Boolean(resolveVisible(uuid)),
    get: (uuid) => resolveVisible(uuid) ? rawGet(String(uuid || "")) : null,
    resolve: (uuid) => resolveVisible(uuid),
    snapshot: () => activeRows(),
    byType: (documentName) => activeRows().filter((row) => row.documentName === String(documentName || "")),
    byParent: (parentUuid) => activeRows().filter((row) => String(row.parentUuid || "") === String(parentUuid || "")),
    embeddedItems: () => (base.embeddedItems?.() ?? []).filter((row) => Boolean(resolveVisible(row.uuid))),
    verify: (uuid) => {
      if (!resolveVisible(uuid)) return { registered: false, resolved: false, exactResolve: false, healthy: false };
      return rawVerify ? rawVerify(String(uuid || "")) : { registered: true, resolved: true, healthy: true };
    },
    lifecycle: () => {
      const raw = rawLifecycle?.() || { counts: {}, recent: [] };
      if (game.user?.isGM) return raw;
      const recent = (raw.recent || []).filter((entry) => Boolean(resolveVisible(entry.uuid)));
      const counts = {};
      for (const entry of recent) counts[entry.hook] = Number(counts[entry.hook] || 0) + 1;
      return { counts, recent };
    }
  });

  atprAttached = true;
  if (atprTimer) {
    window.clearInterval(atprTimer);
    atprTimer = null;
  }
  console.info("Adventurer's Tome | Permission-aware Universal Document read layer attached.");
  return true;
}

function atprWatch() {
  if (atprAttach() || atprTimer) return;
  atprTimer = window.setInterval(atprAttach, 100);
}

Hooks.once("ready", atprWatch);
Hooks.on("renderApplicationV2", atprWatch);
