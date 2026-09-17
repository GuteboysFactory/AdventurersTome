const ATCEL_ID = "adventurers-tome";
const ATCEL_FLAG = "campaignEntityLinksV1";
const ATCEL_LEGACY_FLAG = "links";
const ATCEL_GROUP_FLAG = "groupMember";
let atCelQueued = false;

function atCelEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atCelApp() {
  try { return game.modules.get(ATCEL_ID)?.api?.app?.() || null; }
  catch (_err) { return null; }
}

function atCelCanView(document) {
  if (!document) return false;
  if (game.user?.isGM) return true;
  try {
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    return typeof document.testUserPermission !== "function" || document.testUserPermission(game.user, observer);
  } catch (_err) {
    return document.visible !== false;
  }
}

function atCelNormalizeUuids(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((uuid) => String(uuid || "").trim()).filter(Boolean))]
    : [];
}

function atCelCanonical(journal) {
  const raw = journal?.getFlag?.(ATCEL_ID, ATCEL_FLAG);
  const links = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { actorUuids: atCelNormalizeUuids(links.actorUuids) };
}

function atCelLegacy(journal) {
  const raw = journal?.getFlag?.(ATCEL_ID, ATCEL_LEGACY_FLAG);
  const links = raw && typeof raw === "object" && !Array.isArray(raw)
    ? foundry.utils.deepClone(raw)
    : {};
  links.sessions = Array.isArray(links.sessions) ? links.sessions : [];
  links.quests = Array.isArray(links.quests) ? links.quests : [];
  links.world = Array.isArray(links.world) ? links.world : [];
  links.actors = Array.isArray(links.actors) ? links.actors : [];
  return links;
}

function atCelActorFromUuid(uuid) {
  const value = String(uuid || "").trim();
  const match = /^Actor\.([^.]+)$/.exec(value);
  return match ? game.actors?.get(match[1]) || null : null;
}

function atCelLinkedActors(journal) {
  if (!journal) return [];
  const canonical = atCelCanonical(journal);
  const legacy = atCelLegacy(journal);
  const actors = [];
  const seen = new Set();

  for (const uuid of canonical.actorUuids) {
    const actor = atCelActorFromUuid(uuid);
    if (!actor || !atCelCanView(actor) || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push({ actor, canonical: true, uuid: actor.uuid });
  }

  for (const id of legacy.actors) {
    const actor = game.actors?.get(String(id || "")) || null;
    if (!actor || !atCelCanView(actor) || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push({ actor, canonical: false, uuid: actor.uuid });
  }

  return actors.sort((a, b) => a.actor.name.localeCompare(b.actor.name, game.i18n?.lang, { numeric: true }));
}

async function atCelSetActorLink(journal, actor, linked) {
  if (!game.user?.isGM) throw new Error("GM permission required.");
  if (!journal || journal.documentName !== "JournalEntry") throw new Error("Session or Quest Journal not found.");
  if (!actor || actor.documentName !== "Actor") throw new Error("Actor not found.");

  const canonical = atCelCanonical(journal);
  const legacy = atCelLegacy(journal);
  const uuids = new Set(canonical.actorUuids);
  const actorIds = new Set(legacy.actors.map((id) => String(id || "")).filter(Boolean));

  if (linked) {
    uuids.add(actor.uuid);
    actorIds.add(actor.id);
  } else {
    uuids.delete(actor.uuid);
    actorIds.delete(actor.id);
  }

  await journal.update({
    [`flags.${ATCEL_ID}.${ATCEL_FLAG}`]: { actorUuids: [...uuids] },
    [`flags.${ATCEL_ID}.${ATCEL_LEGACY_FLAG}`]: {
      ...legacy,
      actors: [...actorIds]
    }
  });

  return linked;
}

function atCelFolderNames(folder) {
  const names = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(String(current.name || ""));
    const parentId = String(current.folder?.id ?? current.folder ?? "");
    current = parentId ? game.folders?.get(parentId) || null : null;
  }
  return names;
}

function atCelJournalKind(journal) {
  if (!journal) return "";
  const flagged = String(journal.getFlag?.(ATCEL_ID, "type") || "").toLowerCase();
  if (flagged === "sessions" || flagged === "session") return "session";
  if (flagged === "quests" || flagged === "quest") return "quest";

  const names = atCelFolderNames(journal.folder || game.folders?.get(String(journal.folder?.id ?? journal.folder ?? "")))
    .map((name) => name.toLowerCase());

  if (names.includes("sessions")) return "session";
  if (names.includes("quests")) return "quest";
  return "";
}

function atCelCampaignJournals() {
  const sessions = [];
  const quests = [];
  for (const journal of game.journal?.contents ?? []) {
    if (!atCelCanView(journal)) continue;
    const kind = atCelJournalKind(journal);
    if (kind === "session") sessions.push(journal);
    else if (kind === "quest") quests.push(journal);
  }
  const sort = (a, b) => a.name.localeCompare(b.name, game.i18n?.lang, { numeric: true });
  sessions.sort(sort);
  quests.sort(sort);
  return { sessions, quests };
}

function atCelActors() {
  return [...(game.actors?.contents ?? [])]
    .filter((actor) => atCelCanView(actor))
    .sort((a, b) => {
      const ag = a.getFlag?.(ATCEL_ID, ATCEL_GROUP_FLAG) === true ? 0 : 1;
      const bg = b.getFlag?.(ATCEL_ID, ATCEL_GROUP_FLAG) === true ? 0 : 1;
      if (ag !== bg) return ag - bg;
      return a.name.localeCompare(b.name, game.i18n?.lang, { numeric: true });
    });
}

function atCelJournalLinksForActor(actor) {
  const { sessions, quests } = atCelCampaignJournals();
  const linked = (journal) => {
    const canonical = atCelCanonical(journal).actorUuids.includes(actor.uuid);
    const legacy = atCelLegacy(journal).actors.map(String).includes(actor.id);
    return canonical || legacy;
  };
  return {
    sessions: sessions.filter(linked),
    quests: quests.filter(linked)
  };
}

function atCelCurrentContext(app) {
  if (!app) return null;
  if (app.activeTab === "sessions" && app.activeSessionId) {
    const journal = game.journal?.get(app.activeSessionId) || null;
    return journal ? { type: "session", journal } : null;
  }
  if (app.activeTab === "questDetail" && app.activeQuestId) {
    const journal = game.journal?.get(app.activeQuestId) || null;
    return journal ? { type: "quest", journal } : null;
  }
  if (app.activeTab === "profile" && app.activeActorId) {
    const actor = game.actors?.get(app.activeActorId) || null;
    return actor ? { type: "actor", actor } : null;
  }
  return null;
}

function atCelActorOptions(linkedIds = new Set()) {
  const actors = atCelActors().filter((actor) => !linkedIds.has(actor.id));
  if (!actors.length) return '<option value="">No more visible Actors</option>';
  let groupOpen = false;
  let otherOpen = false;
  const rows = ['<option value="">Choose character / NPC…</option>'];
  for (const actor of actors) {
    const isGroup = actor.getFlag?.(ATCEL_ID, ATCEL_GROUP_FLAG) === true;
    if (isGroup && !groupOpen) {
      if (otherOpen) rows.push("</optgroup>");
      rows.push('<optgroup label="Group PCs">');
      groupOpen = true;
      otherOpen = false;
    } else if (!isGroup && !otherOpen) {
      if (groupOpen) rows.push("</optgroup>");
      rows.push('<optgroup label="World Actors / NPCs">');
      otherOpen = true;
      groupOpen = false;
    }
    rows.push(`<option value="${atCelEscape(actor.uuid)}">${atCelEscape(actor.name)}</option>`);
  }
  if (groupOpen || otherOpen) rows.push("</optgroup>");
  return rows.join("");
}

function atCelJournalOptions(actor) {
  const linked = atCelJournalLinksForActor(actor);
  const linkedIds = new Set([...linked.sessions, ...linked.quests].map((journal) => journal.id));
  const { sessions, quests } = atCelCampaignJournals();
  const rows = ['<option value="">Choose Session or Quest…</option>'];

  const addGroup = (label, kind, journals) => {
    const available = journals.filter((journal) => !linkedIds.has(journal.id));
    if (!available.length) return;
    rows.push(`<optgroup label="${label}">`);
    for (const journal of available) {
      rows.push(`<option value="${kind}:${atCelEscape(journal.id)}">${atCelEscape(journal.name)}</option>`);
    }
    rows.push("</optgroup>");
  };

  addGroup("Sessions", "session", sessions);
  addGroup("Quests", "quest", quests);
  return rows.join("");
}

function atCelLinkedActorChips(journal) {
  const links = atCelLinkedActors(journal);
  if (!links.length) return '<p class="at-cel-empty">No manually linked characters yet.</p>';
  return links.map(({ actor, canonical }) => `
    <span class="at-cel-chip" data-at-cel-actor-chip="${atCelEscape(actor.id)}">
      <button type="button" class="at-cel-chip-open" data-at-cel-open="actor:${atCelEscape(actor.id)}">
        <i class="fa-solid fa-user"></i>${atCelEscape(actor.name)}
      </button>
      <button type="button" class="at-cel-unlink" data-at-cel-unlink-actor="${atCelEscape(actor.id)}" title="Unlink ${atCelEscape(actor.name)}">
        <i class="fa-solid fa-xmark"></i>
      </button>
      ${canonical ? "" : '<small title="Existing Tome link">legacy</small>'}
    </span>
  `).join("");
}

function atCelLinkedJournalChips(actor) {
  const linked = atCelJournalLinksForActor(actor);
  const render = (journal, kind, icon) => `
    <span class="at-cel-chip">
      <button type="button" class="at-cel-chip-open" data-at-cel-open="${kind}:${atCelEscape(journal.id)}">
        <i class="fa-solid ${icon}"></i>${atCelEscape(journal.name)}
      </button>
      <button type="button" class="at-cel-unlink" data-at-cel-unlink-journal="${kind}:${atCelEscape(journal.id)}" title="Unlink ${atCelEscape(journal.name)}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </span>
  `;

  const sessions = linked.sessions.map((journal) => render(journal, "session", "fa-book-open")).join("");
  const quests = linked.quests.map((journal) => render(journal, "quest", "fa-diamond")).join("");
  if (!sessions && !quests) return '<p class="at-cel-empty">No manually linked Sessions or Quests yet.</p>';

  return `
    ${sessions ? `<div class="at-cel-link-group"><strong>Sessions</strong><div class="at-cel-chips">${sessions}</div></div>` : ""}
    ${quests ? `<div class="at-cel-link-group"><strong>Quests</strong><div class="at-cel-chips">${quests}</div></div>` : ""}
  `;
}

function atCelManagerForJournal(context) {
  const linkedIds = new Set(atCelLinkedActors(context.journal).map(({ actor }) => actor.id));
  const title = context.type === "quest" ? "Quest Characters" : "Session Characters";
  const section = document.createElement("section");
  section.className = "at-cel-manager";
  section.dataset.atCelManager = context.type;
  section.dataset.journalId = context.journal.id;
  section.innerHTML = `
    <div class="at-cel-heading">
      <div><i class="fa-solid fa-link"></i><strong>${title}</strong><small>Canonical Actor links</small></div>
    </div>
    <div class="at-cel-chips">${atCelLinkedActorChips(context.journal)}</div>
    ${game.user?.isGM ? `
      <div class="at-cel-add-row">
        <select data-at-cel-actor-picker>${atCelActorOptions(linkedIds)}</select>
        <button type="button" class="at-secondary" data-at-cel-add-actor><i class="fa-solid fa-plus"></i> Link Character</button>
      </div>
    ` : ""}
  `;
  return section;
}

function atCelManagerForActor(context) {
  const section = document.createElement("section");
  section.className = "at-profile-panel at-profile-campaign-links at-cel-manager at-cel-actor-manager";
  section.dataset.atCelManager = "actor";
  section.dataset.actorId = context.actor.id;
  section.innerHTML = `
    <div class="at-profile-section-heading at-cel-heading">
      <i class="fa-solid fa-link"></i><h2>Campaign Links</h2>
      <small>Manual Session / Quest links</small>
    </div>
    <div class="at-cel-actor-links">${atCelLinkedJournalChips(context.actor)}</div>
    ${game.user?.isGM ? `
      <div class="at-cel-add-row">
        <select data-at-cel-journal-picker>${atCelJournalOptions(context.actor)}</select>
        <button type="button" class="at-secondary" data-at-cel-add-journal><i class="fa-solid fa-plus"></i> Link Session / Quest</button>
      </div>
    ` : ""}
  `;
  return section;
}

function atCelMount() {
  const app = atCelApp();
  const root = app?.element;
  if (!root?.isConnected) return;
  const context = atCelCurrentContext(app);

  root.querySelectorAll("[data-at-cel-manager]").forEach((node) => node.remove());
  if (!context) return;

  if (context.type === "session") {
    const host = root.querySelector(".at-session-detail");
    if (!host) return;
    const openFull = host.querySelector(".at-session-open-full");
    const manager = atCelManagerForJournal(context);
    if (openFull) host.insertBefore(manager, openFull);
    else host.append(manager);
    return;
  }

  if (context.type === "quest") {
    const host = root.querySelector(".at-quest-detail-page .at-linked-panel");
    if (!host) return;
    host.append(atCelManagerForJournal(context));
    return;
  }

  if (context.type === "actor") {
    const main = root.querySelector(".at-profile-page");
    if (!main) return;
    const existingCampaign = main.querySelector(".at-profile-campaign-links");
    const relations = main.querySelector(".at-profile-relations");
    const manager = atCelManagerForActor(context);

    if (existingCampaign) {
      existingCampaign.classList.add("at-cel-existing-campaign-links");
      existingCampaign.after(manager);
    } else if (relations) {
      relations.before(manager);
    } else {
      main.append(manager);
    }
  }
}

function atCelQueue(delay = 0) {
  if (atCelQueued) return;
  atCelQueued = true;
  window.setTimeout(() => {
    atCelQueued = false;
    try { atCelMount(); }
    catch (error) { console.warn("Adventurer's Tome | Campaign Entity Links mount failed safely", error); }
  }, delay);
}

async function atCelOpen(refKey) {
  const app = atCelApp();
  if (!app || !refKey) return;
  if (typeof app._openRefKey === "function") {
    await app._openRefKey(refKey);
    return;
  }
  const [kind, id] = String(refKey).split(":");
  if (kind === "actor") { app.activeActorId = id; app.activeTab = "profile"; }
  else if (kind === "session") { app.activeSessionId = id; app.activeTab = "sessions"; }
  else if (kind === "quest") { app.activeQuestId = id; app.activeTab = "questDetail"; }
  await app.render?.({ parts: ["main"] });
}

async function atCelRefresh() {
  const app = atCelApp();
  if (app?.rendered) await app.render({ parts: ["main"] });
  atCelQueue(80);
}

async function atCelAddActor(manager) {
  const journal = game.journal?.get(String(manager.dataset.journalId || "")) || null;
  const uuid = String(manager.querySelector("[data-at-cel-actor-picker]")?.value || "");
  const resolver = game.modules.get(ATCEL_ID)?.api?.universalDocuments?.resolveCanonical;
  const actor = typeof resolver === "function"
    ? await resolver(uuid, { consumer: "campaign-entity-links" })
    : atCelActorFromUuid(uuid);
  if (!actor || actor.documentName !== "Actor") return ui.notifications.warn("Adventurer's Tome: Choose an Actor to link.");
  await atCelSetActorLink(journal, actor, true);
  ui.notifications.info(`Adventurer's Tome: Linked ${actor.name}.`);
  await atCelRefresh();
}

async function atCelUnlinkActor(manager, actorId) {
  const journal = game.journal?.get(String(manager.dataset.journalId || "")) || null;
  const actor = game.actors?.get(String(actorId || "")) || null;
  if (!journal || !actor) return;
  await atCelSetActorLink(journal, actor, false);
  ui.notifications.info(`Adventurer's Tome: Unlinked ${actor.name}.`);
  await atCelRefresh();
}

async function atCelAddJournal(manager) {
  const actor = game.actors?.get(String(manager.dataset.actorId || "")) || null;
  const value = String(manager.querySelector("[data-at-cel-journal-picker]")?.value || "");
  const [, id] = value.split(":");
  const journal = id ? game.journal?.get(id) || null : null;
  if (!actor || !journal) return ui.notifications.warn("Adventurer's Tome: Choose a Session or Quest to link.");
  await atCelSetActorLink(journal, actor, true);
  ui.notifications.info(`Adventurer's Tome: Linked ${actor.name} ↔ ${journal.name}.`);
  await atCelRefresh();
}

async function atCelUnlinkJournal(manager, value) {
  const actor = game.actors?.get(String(manager.dataset.actorId || "")) || null;
  const [, id] = String(value || "").split(":");
  const journal = id ? game.journal?.get(id) || null : null;
  if (!actor || !journal) return;
  await atCelSetActorLink(journal, actor, false);
  ui.notifications.info(`Adventurer's Tome: Unlinked ${actor.name} ↔ ${journal.name}.`);
  await atCelRefresh();
}

function atCelInstallStyles() {
  if (document.getElementById("at-cel-styles")) return;
  const style = document.createElement("style");
  style.id = "at-cel-styles";
  style.textContent = `
    .at-cel-manager {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid rgba(214,178,108,.28);
      border-radius: 6px;
      background: rgba(18,13,9,.42);
    }
    .at-cel-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: var(--at-gold, #d6b26c);
    }
    .at-cel-heading > div { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .at-cel-heading small { opacity:.65; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
    .at-cel-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .at-cel-chip {
      display:inline-flex;
      align-items:stretch;
      border:1px solid rgba(214,178,108,.28);
      border-radius:4px;
      overflow:hidden;
      background:rgba(214,178,108,.06);
    }
    .at-cel-chip button { border:0 !important; border-radius:0 !important; margin:0 !important; min-height:28px; }
    .at-cel-chip-open { padding:4px 8px !important; color:var(--at-gold, #d6b26c); background:transparent; }
    .at-cel-chip-open i { margin-right:5px; }
    .at-cel-unlink { width:28px; padding:0 !important; opacity:.62; background:rgba(120,35,25,.18) !important; }
    .at-cel-unlink:hover { opacity:1; }
    .at-cel-chip small { display:flex; align-items:center; padding:0 5px; opacity:.45; font-size:8px; text-transform:uppercase; }
    .at-cel-add-row { display:flex; gap:8px; margin-top:10px; align-items:center; }
    .at-cel-add-row select { flex:1 1 auto; min-width:180px; }
    .at-cel-add-row button { flex:0 0 auto; white-space:nowrap; }
    .at-cel-empty { margin:0; opacity:.6; font-size:12px; }
    .at-cel-link-group + .at-cel-link-group { margin-top:10px; }
    .at-cel-link-group > strong { display:block; margin-bottom:5px; color:rgba(214,178,108,.72); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
    .at-cel-actor-manager .at-profile-section-heading small { margin-left:auto; }
    .at-cel-existing-campaign-links + .at-cel-actor-manager { margin-top:12px; }
    @media (max-width: 760px) {
      .at-cel-add-row { flex-direction:column; align-items:stretch; }
      .at-cel-add-row button, .at-cel-add-row select { width:100%; }
    }
  `;
  document.head.appendChild(style);
}

function atCelAudit() {
  const { sessions, quests } = atCelCampaignJournals();
  const rows = [];
  const dangling = [];
  let canonicalLinks = 0;
  let legacyLinks = 0;

  for (const journal of [...sessions, ...quests]) {
    const canonical = atCelCanonical(journal);
    const legacy = atCelLegacy(journal);
    canonicalLinks += canonical.actorUuids.length;
    legacyLinks += legacy.actors.length;
    for (const uuid of canonical.actorUuids) {
      if (!atCelActorFromUuid(uuid)) dangling.push({ journal: journal.uuid, actorUuid: uuid });
    }
    if (canonical.actorUuids.length || legacy.actors.length) {
      rows.push({
        journalUuid: journal.uuid,
        kind: atCelJournalKind(journal),
        canonicalActors: canonical.actorUuids.length,
        projectedActorIds: legacy.actors.length
      });
    }
  }

  return {
    mode: "campaign-entity-links-v1",
    canonicalIdentity: "actor-uuid",
    compatibilityProjection: "flags.adventurers-tome.links.actors",
    sessions: sessions.length,
    quests: quests.length,
    linkedJournals: rows.length,
    canonicalLinks,
    legacyLinks,
    dangling,
    healthy: dangling.length === 0,
    rows
  };
}

Hooks.once("ready", () => {
  atCelInstallStyles();
  const module = game.modules.get(ATCEL_ID);
  if (module?.api) module.api.campaignEntityLinksAudit = atCelAudit;

  document.addEventListener("click", (event) => {
    const manager = event.target.closest?.("[data-at-cel-manager]");
    if (!manager) return;

    const addActor = event.target.closest?.("[data-at-cel-add-actor]");
    if (addActor) {
      event.preventDefault();
      void atCelAddActor(manager).catch((error) => {
        console.error("Adventurer's Tome | Link Character failed", error);
        ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not link Actor."}`);
      });
      return;
    }

    const unlinkActor = event.target.closest?.("[data-at-cel-unlink-actor]");
    if (unlinkActor) {
      event.preventDefault();
      void atCelUnlinkActor(manager, unlinkActor.dataset.atCelUnlinkActor).catch(console.error);
      return;
    }

    const addJournal = event.target.closest?.("[data-at-cel-add-journal]");
    if (addJournal) {
      event.preventDefault();
      void atCelAddJournal(manager).catch((error) => {
        console.error("Adventurer's Tome | Link Session / Quest failed", error);
        ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not link campaign entry."}`);
      });
      return;
    }

    const unlinkJournal = event.target.closest?.("[data-at-cel-unlink-journal]");
    if (unlinkJournal) {
      event.preventDefault();
      void atCelUnlinkJournal(manager, unlinkJournal.dataset.atCelUnlinkJournal).catch(console.error);
      return;
    }

    const open = event.target.closest?.("[data-at-cel-open]");
    if (open) {
      event.preventDefault();
      void atCelOpen(String(open.dataset.atCelOpen || ""));
    }
  }, true);

  atCelQueue(50);
});

Hooks.on("renderApplicationV2", (app) => {
  if (app !== atCelApp()) return;
  atCelQueue(0);
  window.setTimeout(() => atCelQueue(80), 80);
});

for (const hookName of ["updateJournalEntry", "updateActor", "createJournalEntry", "deleteJournalEntry", "createActor", "deleteActor"]) {
  Hooks.on(hookName, () => atCelQueue(80));
}
