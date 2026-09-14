const AT_SPH_ID = "adventurers-tome";
const AT_SPH_PROFILE = "worldProfile";
let atSphRenderTimer = null;

function atSphProfile(journal) {
  const raw = journal?.getFlag?.(AT_SPH_ID, AT_SPH_PROFILE);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function atSphIsWorld(journal) {
  return journal?.documentName === "JournalEntry" && (
    String(journal.getFlag?.(AT_SPH_ID, "type") || "") === "world" ||
    Boolean(journal.getFlag?.(AT_SPH_ID, AT_SPH_PROFILE))
  );
}

function atSphActorUuid(journal) {
  const profile = atSphProfile(journal);
  const uuid = String(journal.getFlag?.(AT_SPH_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  if (uuid.startsWith("Actor.")) return uuid;
  const actorId = String(profile.actorId || "").trim();
  return actorId ? `Actor.${actorId}` : "";
}

function atSphActor(uuid) {
  const match = String(uuid || "").match(/^Actor\.([^\.]+)$/);
  return match ? game.actors?.get(match[1]) || null : null;
}

function atSphAudit() {
  const rows = [];
  for (const journal of game.journal?.contents ?? []) {
    if (!atSphIsWorld(journal)) continue;
    const profile = atSphProfile(journal);
    const uuid = atSphActorUuid(journal);
    const actor = atSphActor(uuid);
    const actorBacked = Boolean(uuid) || String(profile.sourceDocumentType || "") === "Actor";
    if (!actorBacked) continue;
    rows.push({
      journalId: journal.id,
      journalName: journal.name,
      sourceUuid: uuid || String(profile.sourceUuid || ""),
      sourceExists: Boolean(actor),
      sourceMissingFlag: profile.sourceMissing === true,
      sourceName: actor?.name || String(profile.sourceNameSnapshot || ""),
      nameMatches: actor ? String(actor.name) === String(journal.name) : null,
      actorIdMatches: actor ? String(profile.actorId || "") === String(actor.id) : null
    });
  }
  const summary = {
    total: rows.length,
    linked: rows.filter((row) => row.sourceExists).length,
    missing: rows.filter((row) => !row.sourceExists).length,
    staleName: rows.filter((row) => row.sourceExists && row.nameMatches === false).length,
    staleActorId: rows.filter((row) => row.sourceExists && row.actorIdMatches === false).length,
    rows
  };
  return summary;
}

function atSphRenderOpenTome(delay = 80) {
  clearTimeout(atSphRenderTimer);
  atSphRenderTimer = setTimeout(() => {
    try {
      const app = game.modules.get(AT_SPH_ID)?.api?.app?.();
      if (app?.rendered) app.render({ parts: ["main"] });
    } catch (_err) {}
  }, delay);
}

Hooks.once("ready", () => {
  const module = game.modules.get(AT_SPH_ID);
  if (module) {
    const api = module.api && typeof module.api === "object" ? module.api : {};
    module.api = { ...api, sourceParityAudit: atSphAudit };
  }
  if (game.user?.isGM) {
    const audit = atSphAudit();
    if (audit.staleName || audit.staleActorId) {
      console.warn("Adventurer's Tome | Source Parity audit found linked entries awaiting canonical normalization.", audit);
    } else {
      console.debug("Adventurer's Tome | Source Parity audit", audit);
    }
  }
});

Hooks.on("updateFolder", (folder) => {
  if (!["Actor", "JournalEntry"].includes(String(folder?.type || ""))) return;
  atSphRenderOpenTome();
});

Hooks.on("createFolder", (folder) => {
  if (!["Actor", "JournalEntry"].includes(String(folder?.type || ""))) return;
  atSphRenderOpenTome();
});

Hooks.on("deleteFolder", (folder) => {
  if (!["Actor", "JournalEntry"].includes(String(folder?.type || ""))) return;
  atSphRenderOpenTome();
});

Hooks.on("deleteJournalEntry", (journal) => {
  if (atSphIsWorld(journal)) atSphRenderOpenTome();
});
