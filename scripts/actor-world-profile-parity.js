const ATAWP_ID = "adventurers-tome";
const ATAWP_KNOWN = "knownInformation";
const ATAWP_PROFILE = "profile";
const ATAWP_BACKUP = "actorWorldParityMigration";
const atAwpGuard = new Set();
let atAwpReadyTimer = null;

function atAwpClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function atAwpCleanHtml(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const host = document.createElement("div");
  host.innerHTML = raw;
  host.querySelectorAll("[data-at-tome-summary], .at-ep-status, .at-eb-autosave-state, .at-wie-rich-toolbar, .at-wie-rich-actions, .at-ki-toolbar, .at-sdki-toolbar").forEach((node) => node.remove());
  for (const wrapper of host.querySelectorAll("[data-at-ep-editor], .at-wie-rich-editor")) wrapper.replaceWith(...wrapper.childNodes);
  return host.innerHTML.trim();
}

function atAwpPlain(html) {
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atAwpHtmlFromPlain(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const escape = (part) => part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return text.split(/\n{2,}/).map((part) => `<p>${escape(part).replaceAll("\n", "<br>")}</p>`).join("");
}

function atAwpProfile(actor) {
  const raw = actor?.getFlag?.(ATAWP_ID, ATAWP_PROFILE);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? atAwpClone(raw) : {};
}

function atAwpKnown(actor) {
  const raw = actor?.getFlag?.(ATAWP_ID, ATAWP_KNOWN);
  if (typeof raw === "string") return { html: atAwpCleanHtml(raw), updatedAt: 0, sourceJournalUuid: "" };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      html: atAwpCleanHtml(raw.html || ""),
      updatedAt: Number(raw.updatedAt || 0),
      sourceJournalUuid: String(raw.sourceJournalUuid || "")
    };
  }
  return { html: "", updatedAt: 0, sourceJournalUuid: "" };
}

function atAwpWorldProfile(journal) {
  const raw = journal?.getFlag?.(ATAWP_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function atAwpIsWorld(journal) {
  return journal?.documentName === "JournalEntry" && (
    String(journal.getFlag?.(ATAWP_ID, "type") || "") === "world" ||
    Boolean(journal.getFlag?.(ATAWP_ID, "worldProfile"))
  );
}

function atAwpLinkedWorlds(actor) {
  if (actor?.documentName !== "Actor" || !actor.uuid) return [];
  return [...(game.journal?.contents ?? [])].filter((journal) => {
    if (!atAwpIsWorld(journal)) return false;
    const profile = atAwpWorldProfile(journal);
    const uuid = String(journal.getFlag?.(ATAWP_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    if (uuid) return uuid === actor.uuid;
    return String(profile.actorId || "") === String(actor.id || "");
  });
}

function atAwpGroupMember(actor) {
  if (actor?.documentName !== "Actor") return false;
  if (actor.getFlag?.(ATAWP_ID, "groupMember") === true) return true;
  const profile = atAwpProfile(actor);
  return Boolean(profile.title || profile.subtitle || profile.summary || profile.biography || profile.motto || profile.heroImage);
}

function atAwpIsCanonicalActor(actor) {
  return atAwpGroupMember(actor) && atAwpLinkedWorlds(actor).length > 0;
}

async function atAwpWriteKnown(actor, html, source = "group-profile") {
  const clean = atAwpCleanHtml(html);
  const current = atAwpKnown(actor);
  if (clean === current.html) return false;
  const linked = atAwpLinkedWorlds(actor);
  const payload = {
    html: clean,
    updatedAt: Date.now(),
    sourceJournalUuid: String(linked[0]?.uuid || current.sourceJournalUuid || ""),
    source
  };
  atAwpGuard.add(actor.uuid);
  try {
    await actor.update({ [`flags.${ATAWP_ID}.${ATAWP_KNOWN}`]: payload }, {
      render: false,
      adventurersTomeActorWorldParity: true
    });
  } finally {
    queueMicrotask(() => atAwpGuard.delete(actor.uuid));
  }
  return true;
}

async function atAwpWriteBiography(actor, plain, { backup = false } = {}) {
  const biography = String(plain || "").trim();
  const profile = atAwpProfile(actor);
  if (String(profile.biography || "").trim() === biography) return false;

  const changes = {};
  if (backup) {
    const old = String(profile.biography || "").trim();
    const existing = actor.getFlag?.(ATAWP_ID, ATAWP_BACKUP);
    if (old && (!existing || typeof existing !== "object")) {
      changes[`flags.${ATAWP_ID}.${ATAWP_BACKUP}`] = {
        previousBiography: old,
        canonicalizedAt: Date.now(),
        reason: "Actor-backed World Known Information became canonical in v1.2"
      };
    }
  }
  profile.biography = biography;
  changes[`flags.${ATAWP_ID}.${ATAWP_PROFILE}`] = profile;

  atAwpGuard.add(actor.uuid);
  try {
    await actor.update(changes, {
      render: false,
      adventurersTomeActorWorldParity: true,
      adventurersTomeKnownInformation: true
    });
  } finally {
    queueMicrotask(() => atAwpGuard.delete(actor.uuid));
  }
  return true;
}

async function atAwpReconcileActor(actor) {
  if (!atAwpIsCanonicalActor(actor)) return false;
  const known = atAwpKnown(actor);
  const knownPlain = atAwpPlain(known.html);
  const biography = String(atAwpProfile(actor).biography || "").trim();

  if (knownPlain) {
    if (knownPlain === biography) return false;
    await atAwpWriteBiography(actor, knownPlain, { backup: Boolean(biography) });
    return true;
  }

  if (biography) {
    await atAwpWriteKnown(actor, atAwpHtmlFromPlain(biography), "group-profile-migration");
    return true;
  }
  return false;
}

function atAwpScheduleTomeRefresh() {
  window.setTimeout(() => {
    try {
      const app = game.modules.get(ATAWP_ID)?.api?.app?.();
      if (app?.rendered && !app._bulkUpdating) app.render({ parts: ["main"] }).catch(() => {});
    } catch (_err) {}
  }, 100);
}

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  clearTimeout(atAwpReadyTimer);
  atAwpReadyTimer = setTimeout(async () => {
    let reconciled = 0;
    for (const actor of game.actors?.contents ?? []) {
      try { if (await atAwpReconcileActor(actor)) reconciled++; }
      catch (error) { console.warn(`Adventurer's Tome | Actor/World profile reconciliation failed safely for ${actor.name}`, error); }
    }
    if (reconciled) {
      console.info(`Adventurer's Tome | Unified ${reconciled} Group/World Actor profile(s) onto canonical Known Information.`);
      atAwpScheduleTomeRefresh();
    }
  }, 1200);
});

Hooks.on("updateActor", (actor, changes = {}, options = {}) => {
  if (atAwpGuard.has(actor.uuid) || options?.adventurersTomeActorWorldParity || !atAwpIsCanonicalActor(actor)) return;

  const profileTouched = foundry.utils.hasProperty(changes, `flags.${ATAWP_ID}.${ATAWP_PROFILE}`)
    || Boolean(changes?.flags?.[ATAWP_ID]?.[ATAWP_PROFILE]);
  const knownTouched = foundry.utils.hasProperty(changes, `flags.${ATAWP_ID}.${ATAWP_KNOWN}`)
    || Boolean(changes?.flags?.[ATAWP_ID]?.[ATAWP_KNOWN]);

  if (profileTouched && !knownTouched) {
    const biography = String(atAwpProfile(actor).biography || "").trim();
    void atAwpWriteKnown(actor, atAwpHtmlFromPlain(biography), "group-profile").then(() => atAwpScheduleTomeRefresh()).catch((error) => {
      console.warn("Adventurer's Tome | Group -> World canonical biography sync failed safely", error);
    });
    return;
  }

  if (knownTouched) {
    const plain = atAwpPlain(atAwpKnown(actor).html);
    void atAwpWriteBiography(actor, plain).then(() => atAwpScheduleTomeRefresh()).catch((error) => {
      console.warn("Adventurer's Tome | World -> Group canonical biography sync failed safely", error);
    });
  }
});
