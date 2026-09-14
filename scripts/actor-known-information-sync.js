const ATKI_ID = "adventurers-tome";
const ATKI_FLAG = "knownInformation";
const ATKI_DELAY = 650;
const atKiActorGuard = new Set();
const atKiPageGuard = new Set();
const atKiEditors = new WeakMap();
let atKiDomQueued = false;

function atKiClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function atKiRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function atKiProfile(journal) {
  const raw = journal?.getFlag?.(ATKI_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? atKiClone(raw) : {};
}

function atKiIsWorld(journal) {
  return journal?.documentName === "JournalEntry" && (
    String(journal.getFlag?.(ATKI_ID, "type") || "") === "world" ||
    Boolean(journal.getFlag?.(ATKI_ID, "worldProfile"))
  );
}

function atKiActorForJournal(journal) {
  if (!atKiIsWorld(journal)) return null;
  const profile = atKiProfile(journal);
  const uuid = String(journal.getFlag?.(ATKI_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  const match = uuid.match(/^Actor\.([^\.]+)$/);
  if (match) return game.actors?.get(match[1]) || null;
  const actorId = String(profile.actorId || "").trim();
  return actorId ? game.actors?.get(actorId) || null : null;
}

function atKiJournalsForActor(actor) {
  if (actor?.documentName !== "Actor") return [];
  return [...(game.journal?.contents ?? [])].filter((journal) => {
    if (!atKiIsWorld(journal)) return false;
    const profile = atKiProfile(journal);
    const uuid = String(journal.getFlag?.(ATKI_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    return uuid === actor.uuid || String(profile.actorId || "") === String(actor.id);
  });
}

function atKiPrimaryPage(journal) {
  if (!journal) return null;
  const profile = atKiProfile(journal);
  const preferred = String(journal.getFlag?.(ATKI_ID, "worldSyncPage") || profile.syncPageId || "").trim();
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred && String(page.type || "text").toLowerCase() === "text")
    || pages.find((page) => String(page.type || "text").toLowerCase() === "text")
    || null;
}

function atKiCleanHtml(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const host = document.createElement("div");
  host.innerHTML = raw;
  host.querySelectorAll("[data-at-tome-summary], .at-ep-status, .at-eb-autosave-state, .at-wie-rich-toolbar, .at-wie-rich-actions").forEach((node) => node.remove());
  for (const wrapper of host.querySelectorAll("[data-at-ep-editor], .at-wie-rich-editor")) wrapper.replaceWith(...wrapper.childNodes);
  return host.innerHTML.trim();
}

function atKiPlain(html) {
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atKiHtmlFromPlain(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const escape = (part) => part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return text.split(/\n{2,}/).map((part) => `<p>${escape(part).replaceAll("\n", "<br>")}</p>`).join("");
}

function atKiPayload(actor) {
  const raw = actor?.getFlag?.(ATKI_ID, ATKI_FLAG);
  if (typeof raw === "string") return { html: atKiCleanHtml(raw), updatedAt: 0 };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { html: atKiCleanHtml(raw.html || ""), updatedAt: Number(raw.updatedAt || 0), sourceJournalUuid: String(raw.sourceJournalUuid || "") };
  }
  return { html: "", updatedAt: 0, sourceJournalUuid: "" };
}

function atKiSeedHtml(journal) {
  const page = atKiPrimaryPage(journal);
  const pageHtml = atKiCleanHtml(page?.text?.content || "");
  if (atKiPlain(pageHtml)) return pageHtml;
  const profile = atKiProfile(journal);
  return atKiHtmlFromPlain(profile.body || "");
}

function atKiCanEdit(actor, journal) {
  if (game.user?.isGM) return true;
  try {
    if (actor?.isOwner || actor?.testUserPermission?.(game.user, "OWNER")) return true;
    if (journal?.isOwner || journal?.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  const editors = journal?.getFlag?.(ATKI_ID, "worldEditors");
  return Array.isArray(editors) && editors.map(String).includes(String(game.user?.id || ""));
}

function atKiApp() {
  try { return game.modules.get(ATKI_ID)?.api?.app?.(); }
  catch (_err) { return null; }
}

async function atKiActorWrite(actor, journal, html, source = "tome") {
  if (!actor) return;
  const clean = atKiCleanHtml(html);
  const current = atKiPayload(actor);
  if (clean === current.html && current.sourceJournalUuid === String(journal?.uuid || current.sourceJournalUuid || "")) return;
  const payload = { html: clean, updatedAt: Date.now(), sourceJournalUuid: String(journal?.uuid || current.sourceJournalUuid || ""), source };
  atKiActorGuard.add(actor.id);
  try {
    await actor.update({ [`flags.${ATKI_ID}.${ATKI_FLAG}`]: payload }, {
      render: false,
      noHook: true,
      adventurersTomeKnownInformation: true
    });
  } finally {
    queueMicrotask(() => atKiActorGuard.delete(actor.id));
  }
}

async function atKiMirrorJournal(actor, html) {
  const clean = atKiCleanHtml(html);
  const plain = atKiPlain(clean);
  for (const journal of atKiJournalsForActor(actor)) {
    const page = atKiPrimaryPage(journal);
    if (page && atKiCleanHtml(page.text?.content || "") !== clean) {
      atKiPageGuard.add(page.id);
      try {
        await page.update({
          "text.content": clean || "<p></p>",
          "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
        }, { render: false, noHook: true, adventurersTomeKnownInformationMirror: true });
      } finally {
        queueMicrotask(() => atKiPageGuard.delete(page.id));
      }
    }
    const profile = atKiProfile(journal);
    if (String(profile.body || "") !== plain) {
      profile.body = plain;
      await journal.update({ [`flags.${ATKI_ID}.worldProfile`]: profile }, {
        render: false,
        noHook: true,
        adventurersTomeKnownInformationMirror: true
      });
    }
  }
}

async function atKiSave(actor, journal, html, source = "tome") {
  await atKiActorWrite(actor, journal, html, source);
  await atKiMirrorJournal(actor, html);
  atKiUpdateOpenSurfaces(actor, html);
}

async function atKiEnsureSeed(actor, journal) {
  if (!actor || !journal) return;
  const existing = atKiPayload(actor);
  if (atKiPlain(existing.html)) {
    await atKiMirrorJournal(actor, existing.html);
    return;
  }
  const seed = atKiSeedHtml(journal);
  if (!atKiPlain(seed)) return;
  await atKiSave(actor, journal, seed, "migration");
}

function atKiJournalFromTome(world) {
  const source = world?.querySelector?.('[data-action="openJournal"][data-journal-id]');
  return source ? game.journal?.get(String(source.dataset.journalId || "")) || null : null;
}

function atKiMakeToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "at-ki-toolbar";
  toolbar.innerHTML = '<button type="button" data-at-ki-command="bold" title="Bold"><i class="fa-solid fa-bold"></i></button><button type="button" data-at-ki-command="italic" title="Italic"><i class="fa-solid fa-italic"></i></button><button type="button" data-at-ki-command="insertUnorderedList" title="Bulleted list"><i class="fa-solid fa-list-ul"></i></button><span class="at-ki-save-state"><i class="fa-solid fa-check"></i> Live sync</span>';
  return toolbar;
}

function atKiSetState(panel, state, label) {
  const node = panel?.querySelector?.(".at-ki-save-state");
  if (!node) return;
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : state === "editing" ? "fa-pen" : "fa-check";
  node.dataset.state = state;
  node.innerHTML = `<i class="fa-solid ${icon}"></i> ${label || ({ editing: "Editing…", saving: "Syncing…", saved: "Synced — keep writing", error: "Sync failed" })[state] || "Live sync"}`;
}

function atKiExec(editor, command) {
  editor?.focus?.();
  try { document.execCommand(command, false, null); }
  catch (_err) {}
}

function atKiBeginEditor(panel, body, actor, journal, context) {
  if (!panel || !body || !actor || atKiEditors.has(body) || !atKiCanEdit(actor, journal)) return;
  const app = context === "tome" ? atKiApp() : null;
  if (app) app._bulkUpdating = true;

  const toolbar = atKiMakeToolbar();
  panel.insertBefore(toolbar, body);
  body.contentEditable = "true";
  body.spellcheck = true;
  body.classList.add("is-editing");
  body.focus();

  const state = { actor, journal, panel, body, toolbar, timer: null, dirty: false, saving: false, context, app, closing: false };
  atKiEditors.set(body, state);
  atKiSetState(panel, "saved", "Live sync on — keep writing");

  toolbar.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-at-ki-command]");
    if (!button) return;
    event.preventDefault();
    atKiExec(body, String(button.dataset.atKiCommand || ""));
  });

  body.addEventListener("input", () => {
    const current = atKiEditors.get(body);
    if (!current) return;
    current.dirty = true;
    atKiSetState(panel, "editing");
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => void atKiFlush(body, false), ATKI_DELAY);
  });

  panel.addEventListener("focusout", () => {
    setTimeout(() => {
      const current = atKiEditors.get(body);
      if (!current || current.closing || panel.contains(document.activeElement)) return;
      current.closing = true;
      void atKiFlush(body, true);
    }, 0);
  });
}

async function atKiFlush(body, close) {
  const state = atKiEditors.get(body);
  if (!state || state.saving) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  const html = atKiCleanHtml(body.innerHTML || "");

  if (state.dirty) {
    state.saving = true;
    atKiSetState(state.panel, "saving");
    try {
      await atKiSave(state.actor, state.journal, html, state.context);
      state.dirty = false;
      state.saving = false;
      atKiSetState(state.panel, "saved", "Synced — keep writing");
    } catch (error) {
      state.saving = false;
      state.dirty = true;
      state.closing = false;
      atKiSetState(state.panel, "error", "Sync failed — keep writing to retry");
      console.error("Adventurer's Tome | Known Information live sync failed", error);
      return;
    }
  }

  if (!close) return;
  body.contentEditable = "false";
  body.classList.remove("is-editing");
  state.toolbar.remove();
  atKiEditors.delete(body);
  if (state.app) {
    state.app._bulkUpdating = false;
    state.app.render({ parts: ["main"] }).catch((error) => console.error("Adventurer's Tome | Known Information post-edit refresh failed", error));
  }
}

function atKiTomePanel(world, journal, actor) {
  let old = [...world.querySelectorAll(".at-profile-panel")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Known Information");
  if (!old) return null;
  if (old.dataset.atKiActorId === actor.id) return old;

  const panel = old.cloneNode(false);
  panel.dataset.atKiActorId = actor.id;
  panel.dataset.atKiOwner = "actor";
  panel.dataset.atWieKnown = "true";
  panel.classList.add("at-ki-panel");
  const heading = old.querySelector(".at-profile-section-heading")?.cloneNode(true);
  if (heading) panel.append(heading);
  const body = document.createElement("div");
  body.className = "at-ki-known-body at-tome-richtext at-shareable-text";
  body.dataset.atKiBody = "tome";
  body.innerHTML = atKiPayload(actor).html || '<p class="at-empty">No Known Information yet.</p>';
  panel.append(body);
  old.replaceWith(panel);

  panel.addEventListener("click", (event) => {
    if (event.target.closest(".at-profile-section-heading, a, button, input, select, textarea") || body.isContentEditable) return;
    atKiBeginEditor(panel, body, actor, journal, "tome");
  });
  return panel;
}

function atKiActorPanel(root, actor, journal) {
  let panel = root.querySelector(".at-ki-actor-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "at-ki-actor-panel";
    panel.dataset.atKiActorId = actor.id;
    panel.innerHTML = '<div class="at-ki-actor-heading"><div><h2><i class="fa-solid fa-book-open-reader"></i> Known Information</h2><small>Live-synced with Adventurer\'s Tome</small></div><span><i class="fa-solid fa-link"></i> Tome</span></div><div class="at-ki-known-body" data-at-ki-body="actor"></div>';

    const rgLeft = root.querySelector(".rg-npc-left");
    const rgNotes = rgLeft?.querySelector(".rg-npc-notes");
    if (rgLeft) {
      panel.classList.add("rg-panel", "rg-npc-known-information");
      if (rgNotes) rgLeft.insertBefore(panel, rgNotes);
      else rgLeft.append(panel);
    } else {
      const form = root.querySelector("form") || root.querySelector(".window-content") || root;
      form.append(panel);
    }
  }

  const body = panel.querySelector("[data-at-ki-body='actor']");
  if (body && !body.isContentEditable) body.innerHTML = atKiPayload(actor).html || '<p class="at-empty">No Known Information yet.</p>';
  panel.title = atKiCanEdit(actor, journal) ? "Click Known Information to edit — live syncs with Tome" : "Known Information from Adventurer's Tome";
  if (!panel.dataset.atKiWired) {
    panel.dataset.atKiWired = "true";
    panel.addEventListener("click", (event) => {
      const liveBody = panel.querySelector("[data-at-ki-body='actor']");
      if (!liveBody || event.target.closest("a, button, input, select, textarea") || liveBody.isContentEditable) return;
      atKiBeginEditor(panel, liveBody, actor, journal, "actor");
    });
  }
  return panel;
}

function atKiSheetActor(app) {
  const doc = app?.document || app?.actor || app?.object;
  return doc?.documentName === "Actor" ? doc : null;
}

function atKiUpdateOpenSurfaces(actor, html) {
  const clean = atKiCleanHtml(html);
  for (const body of document.querySelectorAll(`[data-at-ki-actor-id="${CSS.escape(actor.id)}"] [data-at-ki-body]`)) {
    if (body.isContentEditable || atKiEditors.has(body)) continue;
    body.innerHTML = clean || '<p class="at-empty">No Known Information yet.</p>';
  }
  const tomeWorld = document.querySelector("#adventurers-tome-app .at-world-profile-page");
  const journal = atKiJournalFromTome(tomeWorld);
  if (journal && atKiActorForJournal(journal)?.id === actor.id) {
    const panel = tomeWorld.querySelector(`.at-ki-panel[data-at-ki-actor-id="${CSS.escape(actor.id)}"]`);
    const body = panel?.querySelector("[data-at-ki-body='tome']");
    if (body && !body.isContentEditable && !atKiEditors.has(body)) body.innerHTML = clean || '<p class="at-empty">No Known Information yet.</p>';
  }
}

async function atKiEnhanceTome() {
  const world = document.querySelector("#adventurers-tome-app .at-world-profile-page");
  if (!world) return;
  const journal = atKiJournalFromTome(world);
  const actor = atKiActorForJournal(journal);
  if (!journal || !actor) return;
  await atKiEnsureSeed(actor, journal);
  atKiTomePanel(world, journal, actor);
}

async function atKiEnhanceActorApp(app, element) {
  const actor = atKiSheetActor(app);
  if (!actor) return;
  const journal = atKiJournalsForActor(actor)[0] || null;
  if (!journal) return;
  await atKiEnsureSeed(actor, journal);
  const root = atKiRoot(element) || app?.element;
  if (root instanceof HTMLElement) atKiActorPanel(root, actor, journal);
}

function atKiQueueTome() {
  if (atKiDomQueued) return;
  atKiDomQueued = true;
  requestAnimationFrame(() => {
    atKiDomQueued = false;
    void atKiEnhanceTome().catch((error) => console.warn("Adventurer's Tome | Known Information Tome enhancement failed safely", error));
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(atKiQueueTome);
  observer.observe(document.body, { childList: true, subtree: true });
  atKiQueueTome();
  if (game.user?.isGM) {
    setTimeout(() => {
      for (const journal of game.journal?.contents ?? []) {
        const actor = atKiActorForJournal(journal);
        if (actor) void atKiEnsureSeed(actor, journal).catch((error) => console.warn(`Adventurer's Tome | Could not seed Actor Known Information for ${actor.name}`, error));
      }
    }, 700);
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  void atKiEnhanceActorApp(app, element).catch((error) => console.warn("Adventurer's Tome | Known Information Actor sheet enhancement failed safely", error));
  atKiQueueTome();
});

Hooks.on("updateActor", (actor, changes, options) => {
  if (atKiActorGuard.has(actor.id) || options?.adventurersTomeKnownInformation) return;
  const touched = foundry.utils.hasProperty(changes, `flags.${ATKI_ID}.${ATKI_FLAG}`) || Boolean(changes?.flags?.[ATKI_ID]?.[ATKI_FLAG]);
  if (!touched) return;
  const payload = atKiPayload(actor);
  void atKiMirrorJournal(actor, payload.html).then(() => {
    atKiUpdateOpenSurfaces(actor, payload.html);
    atKiQueueTome();
  }).catch((error) => console.warn("Adventurer's Tome | Actor -> Known Information mirror failed safely", error));
});

Hooks.on("updateJournalEntryPage", (page, changes, options) => {
  if (atKiPageGuard.has(page.id) || options?.adventurersTomeKnownInformationMirror) return;
  const journal = page?.parent;
  const actor = atKiActorForJournal(journal);
  if (!actor || atKiPrimaryPage(journal)?.id !== page.id) return;
  const contentTouched = foundry.utils.hasProperty(changes, "text.content") || Boolean(changes?.text?.content !== undefined);
  if (!contentTouched) return;
  const html = atKiCleanHtml(page.text?.content || "");
  void atKiActorWrite(actor, journal, html, "foundry-journal").then(() => {
    atKiUpdateOpenSurfaces(actor, html);
    atKiQueueTome();
  }).catch((error) => console.warn("Adventurer's Tome | Journal -> Actor Known Information sync failed safely", error));
});

for (const hookName of ["updateJournalEntry", "createJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, atKiQueueTome);
}
