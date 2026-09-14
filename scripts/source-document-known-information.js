const ATSDKI_ID = "adventurers-tome";
const ATSDKI_FLAG = "knownInformation";
const ATSDKI_DELAY = 650;
const atSdkiEditors = new WeakMap();
const atSdkiGuards = new Set();
const atSdkiPageGuards = new Set();
let atSdkiQueued = false;

function atSdkiClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function atSdkiRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function atSdkiProfile(journal) {
  const raw = journal?.getFlag?.(ATSDKI_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? atSdkiClone(raw) : {};
}

function atSdkiIsWorld(journal) {
  return journal?.documentName === "JournalEntry" && (
    String(journal.getFlag?.(ATSDKI_ID, "type") || "") === "world" ||
    Boolean(journal.getFlag?.(ATSDKI_ID, "worldProfile"))
  );
}

function atSdkiSourceForWorld(journal) {
  if (!atSdkiIsWorld(journal)) return null;
  const profile = atSdkiProfile(journal);
  const uuid = String(journal.getFlag?.(ATSDKI_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  let match = uuid.match(/^Item\.([^\.]+)$/);
  if (match) return game.items?.get(match[1]) || null;
  match = uuid.match(/^Actor\.([^\.]+)$/);
  if (match) return game.actors?.get(match[1]) || null;
  if (String(profile.sourceDocumentType || "") === "Item" && profile.itemId) return game.items?.get(String(profile.itemId)) || null;
  if (profile.actorId) return game.actors?.get(String(profile.actorId)) || null;
  return null;
}

function atSdkiWorldsForSource(source) {
  if (!source?.uuid) return [];
  return [...(game.journal?.contents ?? [])].filter((journal) => {
    if (!atSdkiIsWorld(journal)) return false;
    const profile = atSdkiProfile(journal);
    const uuid = String(journal.getFlag?.(ATSDKI_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    if (uuid === source.uuid) return true;
    if (source.documentName === "Actor" && String(profile.actorId || "") === String(source.id)) return true;
    if (source.documentName === "Item" && String(profile.itemId || "") === String(source.id)) return true;
    return false;
  });
}

function atSdkiPrimaryPage(journal) {
  if (!journal) return null;
  const profile = atSdkiProfile(journal);
  const preferred = String(journal.getFlag?.(ATSDKI_ID, "worldSyncPage") || profile.syncPageId || "").trim();
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred && String(page.type || "text").toLowerCase() === "text")
    || pages.find((page) => String(page.type || "text").toLowerCase() === "text")
    || null;
}

function atSdkiCleanHtml(value) {
  const raw = String(value || "");
  if (!raw) return "";
  const host = document.createElement("div");
  host.innerHTML = raw;
  host.querySelectorAll("[data-at-tome-summary], .at-ep-status, .at-eb-autosave-state, .at-wie-rich-toolbar, .at-wie-rich-actions, .at-ki-toolbar, .at-sdki-toolbar").forEach((node) => node.remove());
  for (const wrapper of host.querySelectorAll("[data-at-ep-editor], .at-wie-rich-editor")) wrapper.replaceWith(...wrapper.childNodes);
  return host.innerHTML.trim();
}

function atSdkiPlain(html) {
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atSdkiHtmlFromPlain(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const escape = (part) => part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return text.split(/\n{2,}/).map((part) => `<p>${escape(part).replaceAll("\n", "<br>")}</p>`).join("");
}

function atSdkiItemPayload(item) {
  const raw = item?.getFlag?.(ATSDKI_ID, ATSDKI_FLAG);
  if (typeof raw === "string") return { html: atSdkiCleanHtml(raw), updatedAt: 0 };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { html: atSdkiCleanHtml(raw.html || ""), updatedAt: Number(raw.updatedAt || 0), sourceJournalUuid: String(raw.sourceJournalUuid || "") };
  }
  return { html: "", updatedAt: 0, sourceJournalUuid: "" };
}

function atSdkiPcProfile(actor) {
  const raw = actor?.getFlag?.(ATSDKI_ID, "profile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? atSdkiClone(raw) : {};
}

function atSdkiPcHtml(actor) {
  return atSdkiHtmlFromPlain(atSdkiPcProfile(actor).biography || "");
}

function atSdkiIsGroupPc(actor) {
  if (actor?.documentName !== "Actor") return false;
  if (actor.getFlag?.(ATSDKI_ID, "groupMember") === true) return true;
  const profile = atSdkiPcProfile(actor);
  return Boolean(profile.title || profile.subtitle || profile.summary || profile.biography || profile.motto || profile.heroImage);
}

function atSdkiCanEdit(source, journal = null) {
  if (game.user?.isGM) return true;
  try {
    if (source?.isOwner || source?.testUserPermission?.(game.user, "OWNER")) return true;
    if (journal?.isOwner || journal?.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  return false;
}

function atSdkiApp() {
  try { return game.modules.get(ATSDKI_ID)?.api?.app?.(); }
  catch (_err) { return null; }
}

function atSdkiTomeWorld() {
  return document.querySelector("#adventurers-tome-app .at-world-profile-page");
}

function atSdkiJournalFromTome(world = atSdkiTomeWorld()) {
  const source = world?.querySelector?.('[data-action="openJournal"][data-journal-id]');
  return source ? game.journal?.get(String(source.dataset.journalId || "")) || null : null;
}

function atSdkiSeedHtml(journal) {
  const page = atSdkiPrimaryPage(journal);
  const pageHtml = atSdkiCleanHtml(page?.text?.content || "");
  if (atSdkiPlain(pageHtml)) return pageHtml;
  return atSdkiHtmlFromPlain(atSdkiProfile(journal).body || "");
}

async function atSdkiWriteItem(item, journal, html, source = "tome") {
  const clean = atSdkiCleanHtml(html);
  const current = atSdkiItemPayload(item);
  if (clean === current.html && current.sourceJournalUuid === String(journal?.uuid || current.sourceJournalUuid || "")) return;
  const payload = { html: clean, updatedAt: Date.now(), sourceJournalUuid: String(journal?.uuid || current.sourceJournalUuid || ""), source };
  atSdkiGuards.add(item.uuid);
  try {
    await item.update({ [`flags.${ATSDKI_ID}.${ATSDKI_FLAG}`]: payload }, { render: false, noHook: true, adventurersTomeKnownInformation: true });
  } finally {
    queueMicrotask(() => atSdkiGuards.delete(item.uuid));
  }
}

async function atSdkiWritePc(actor, html) {
  const clean = atSdkiCleanHtml(html);
  const biography = atSdkiPlain(clean);
  const profile = atSdkiPcProfile(actor);
  if (String(profile.biography || "") === biography) return;
  profile.biography = biography;
  atSdkiGuards.add(actor.uuid);
  try {
    await actor.update({ [`flags.${ATSDKI_ID}.profile`]: profile }, { render: false, noHook: true, adventurersTomeKnownInformation: true });
  } finally {
    queueMicrotask(() => atSdkiGuards.delete(actor.uuid));
  }
}

async function atSdkiMirrorItemJournal(item, html) {
  const clean = atSdkiCleanHtml(html);
  const plain = atSdkiPlain(clean);
  for (const journal of atSdkiWorldsForSource(item)) {
    const page = atSdkiPrimaryPage(journal);
    if (page && atSdkiCleanHtml(page.text?.content || "") !== clean) {
      atSdkiPageGuards.add(page.id);
      try {
        await page.update({ "text.content": clean || "<p></p>", "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 }, { render: false, noHook: true, adventurersTomeKnownInformationMirror: true });
      } finally {
        queueMicrotask(() => atSdkiPageGuards.delete(page.id));
      }
    }
    const profile = atSdkiProfile(journal);
    if (String(profile.body || "") !== plain) {
      profile.body = plain;
      await journal.update({ [`flags.${ATSDKI_ID}.worldProfile`]: profile }, { render: false, noHook: true, adventurersTomeKnownInformationMirror: true });
    }
  }
}

async function atSdkiSave(source, journal, html, context) {
  if (source.documentName === "Item") {
    await atSdkiWriteItem(source, journal, html, context);
    await atSdkiMirrorItemJournal(source, html);
  } else if (source.documentName === "Actor") {
    await atSdkiWritePc(source, html);
  }
  atSdkiUpdateOpenSurfaces(source, html);
}

async function atSdkiEnsureItemSeed(item, journal) {
  const existing = atSdkiItemPayload(item);
  if (atSdkiPlain(existing.html)) {
    await atSdkiMirrorItemJournal(item, existing.html);
    return;
  }
  const seed = atSdkiSeedHtml(journal);
  if (!atSdkiPlain(seed)) return;
  await atSdkiSave(item, journal, seed, "migration");
}

function atSdkiToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "at-sdki-toolbar at-ki-toolbar";
  toolbar.innerHTML = '<button type="button" data-at-sdki-command="bold" title="Bold"><i class="fa-solid fa-bold"></i></button><button type="button" data-at-sdki-command="italic" title="Italic"><i class="fa-solid fa-italic"></i></button><button type="button" data-at-sdki-command="insertUnorderedList" title="Bulleted list"><i class="fa-solid fa-list-ul"></i></button><span class="at-sdki-state at-ki-save-state"><i class="fa-solid fa-check"></i> Live sync</span>';
  return toolbar;
}

function atSdkiSetState(panel, state, label) {
  const node = panel?.querySelector?.(".at-sdki-state");
  if (!node) return;
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : state === "editing" ? "fa-pen" : "fa-check";
  node.dataset.state = state;
  node.innerHTML = `<i class="fa-solid ${icon}"></i> ${label || ({ editing: "Editing…", saving: "Syncing…", saved: "Synced — keep writing", error: "Sync failed" })[state] || "Live sync"}`;
}

function atSdkiBegin(panel, body, source, journal, context) {
  if (!panel || !body || !source || atSdkiEditors.has(body) || !atSdkiCanEdit(source, journal)) return;
  const app = context === "tome" ? atSdkiApp() : null;
  if (app) app._bulkUpdating = true;
  const toolbar = atSdkiToolbar();
  panel.insertBefore(toolbar, body);
  body.contentEditable = "true";
  body.spellcheck = true;
  body.classList.add("is-editing");
  body.focus();
  const state = { panel, body, source, journal, context, app, toolbar, timer: null, dirty: false, saving: false, closing: false };
  atSdkiEditors.set(body, state);
  atSdkiSetState(panel, "saved", "Live sync on — keep writing");

  toolbar.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-at-sdki-command]");
    if (!button) return;
    event.preventDefault();
    body.focus();
    try { document.execCommand(String(button.dataset.atSdkiCommand || ""), false, null); } catch (_err) {}
  });

  body.addEventListener("input", () => {
    const current = atSdkiEditors.get(body);
    if (!current) return;
    current.dirty = true;
    atSdkiSetState(panel, "editing");
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => void atSdkiFlush(body, false), ATSDKI_DELAY);
  });

  panel.addEventListener("focusout", () => {
    setTimeout(() => {
      const current = atSdkiEditors.get(body);
      if (!current || current.closing || panel.contains(document.activeElement)) return;
      current.closing = true;
      void atSdkiFlush(body, true);
    }, 0);
  });
}

async function atSdkiFlush(body, close) {
  const state = atSdkiEditors.get(body);
  if (!state || state.saving) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  const html = atSdkiCleanHtml(body.innerHTML || "");
  if (state.dirty) {
    state.saving = true;
    atSdkiSetState(state.panel, "saving");
    try {
      await atSdkiSave(state.source, state.journal, html, state.context);
      state.dirty = false;
      state.saving = false;
      atSdkiSetState(state.panel, "saved", "Synced — keep writing");
      if (state.context !== "tome") atSdkiRenderTome();
    } catch (error) {
      state.saving = false;
      state.dirty = true;
      state.closing = false;
      atSdkiSetState(state.panel, "error", "Sync failed — keep writing to retry");
      console.error("Adventurer's Tome | Source Known Information live sync failed", error);
      return;
    }
  }
  if (!close) return;
  body.contentEditable = "false";
  body.classList.remove("is-editing");
  state.toolbar.remove();
  atSdkiEditors.delete(body);
  if (state.app) {
    state.app._bulkUpdating = false;
    state.app.render({ parts: ["main"] }).catch((error) => console.error("Adventurer's Tome | Source Known Information post-edit refresh failed", error));
  }
}

function atSdkiPanelMarkup(kind) {
  const label = kind === "pc" ? "Character Information" : "Known Information";
  return `<div class="at-ki-actor-heading"><div><h2><i class="fa-solid fa-book-open-reader"></i> ${label}</h2><small>Live-synced with Adventurer's Tome</small></div><span><i class="fa-solid fa-link"></i> Tome</span></div><div class="at-ki-known-body" data-at-sdki-body></div>`;
}

function atSdkiWirePanel(panel, source, journal, context) {
  const body = panel.querySelector("[data-at-sdki-body]");
  if (!body) return;
  if (!panel.dataset.atSdkiWired) {
    panel.dataset.atSdkiWired = "true";
    panel.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea, .at-profile-section-heading") || body.isContentEditable) return;
      atSdkiBegin(panel, body, source, journal, context);
    });
  }
}

function atSdkiItemSheetPanel(root, item, journal) {
  let panel = root.querySelector(`.at-sdki-sheet-panel[data-at-sdki-uuid="${CSS.escape(item.uuid)}"]`);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "at-sdki-sheet-panel at-ki-actor-panel at-ki-item-panel";
    panel.dataset.atSdkiUuid = item.uuid;
    panel.innerHTML = atSdkiPanelMarkup("item");
    const form = root.querySelector(".rg-item-form") || root.querySelector("form") || root;
    const description = form.querySelector('textarea[name="system.description"]')?.closest("label");
    if (description) form.insertBefore(panel, description);
    else form.append(panel);
  }
  const body = panel.querySelector("[data-at-sdki-body]");
  if (body && !body.isContentEditable) body.innerHTML = atSdkiItemPayload(item).html || '<p class="at-empty">No Known Information yet.</p>';
  atSdkiWirePanel(panel, item, journal, "sheet");
}

function atSdkiPcSheetPanel(root, actor) {
  let panel = root.querySelector(`.at-sdki-sheet-panel[data-at-sdki-uuid="${CSS.escape(actor.uuid)}"]`);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "at-sdki-sheet-panel at-ki-actor-panel at-ki-pc-panel rg-panel";
    panel.dataset.atSdkiUuid = actor.uuid;
    panel.innerHTML = atSdkiPanelMarkup("pc");
    const grid = root.querySelector('.rg-tab-page[data-rg-page="character"] .rg-character-grid') || root.querySelector(".rg-character-grid");
    if (grid) {
      panel.style.gridColumn = "1 / -1";
      grid.append(panel);
    } else {
      const form = root.querySelector("form") || root;
      form.append(panel);
    }
  }
  const body = panel.querySelector("[data-at-sdki-body]");
  if (body && !body.isContentEditable) body.innerHTML = atSdkiPcHtml(actor) || '<p class="at-empty">No Character Information yet.</p>';
  atSdkiWirePanel(panel, actor, null, "sheet");
}

function atSdkiTomeItemPanel(world, journal, item) {
  let old = [...world.querySelectorAll(".at-profile-panel")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Known Information");
  if (!old) return;
  if (old.dataset.atSdkiUuid === item.uuid) return;
  const panel = old.cloneNode(false);
  panel.classList.add("at-sdki-tome-panel");
  panel.dataset.atSdkiUuid = item.uuid;
  const heading = old.querySelector(".at-profile-section-heading")?.cloneNode(true);
  if (heading) panel.append(heading);
  const body = document.createElement("div");
  body.className = "at-ki-known-body at-tome-richtext at-shareable-text";
  body.dataset.atSdkiBody = "";
  body.innerHTML = atSdkiItemPayload(item).html || '<p class="at-empty">No Known Information yet.</p>';
  panel.append(body);
  old.replaceWith(panel);
  atSdkiWirePanel(panel, item, journal, "tome");
}

function atSdkiUpdateOpenSurfaces(source, html) {
  const clean = source.documentName === "Actor" ? atSdkiHtmlFromPlain(atSdkiPlain(html)) : atSdkiCleanHtml(html);
  for (const panel of document.querySelectorAll(`.at-sdki-sheet-panel[data-at-sdki-uuid="${CSS.escape(source.uuid)}"], .at-sdki-tome-panel[data-at-sdki-uuid="${CSS.escape(source.uuid)}"]`)) {
    const body = panel.querySelector("[data-at-sdki-body]");
    if (body && !body.isContentEditable && !atSdkiEditors.has(body)) body.innerHTML = clean || '<p class="at-empty">No information yet.</p>';
  }
}

function atSdkiRenderTome() {
  const app = atSdkiApp();
  if (!app || !app.rendered || app._bulkUpdating) return;
  app.render({ parts: ["main"] }).catch((error) => console.warn("Adventurer's Tome | Could not live-refresh Tome", error));
}

async function atSdkiEnhanceTome() {
  const world = atSdkiTomeWorld();
  if (!world) return;
  const journal = atSdkiJournalFromTome(world);
  const source = atSdkiSourceForWorld(journal);
  if (!journal || source?.documentName !== "Item") return;
  await atSdkiEnsureItemSeed(source, journal);
  atSdkiTomeItemPanel(world, journal, source);
}

async function atSdkiEnhanceSheet(app, element) {
  const source = app?.document || app?.actor || app?.item || app?.object;
  if (!source) return;
  const root = atSdkiRoot(element) || app?.element;
  if (!(root instanceof HTMLElement)) return;

  if (source.documentName === "Item") {
    const journal = atSdkiWorldsForSource(source)[0] || null;
    if (!journal) return;
    await atSdkiEnsureItemSeed(source, journal);
    atSdkiItemSheetPanel(root, source, journal);
    return;
  }

  if (source.documentName === "Actor" && atSdkiIsGroupPc(source)) {
    atSdkiPcSheetPanel(root, source);
  }
}

function atSdkiQueue() {
  if (atSdkiQueued) return;
  atSdkiQueued = true;
  requestAnimationFrame(() => {
    atSdkiQueued = false;
    void atSdkiEnhanceTome().catch((error) => console.warn("Adventurer's Tome | Item Known Information Tome enhancement failed safely", error));
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(atSdkiQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atSdkiQueue();
  if (game.user?.isGM) {
    setTimeout(() => {
      for (const journal of game.journal?.contents ?? []) {
        const source = atSdkiSourceForWorld(journal);
        if (source?.documentName === "Item") void atSdkiEnsureItemSeed(source, journal).catch((error) => console.warn(`Adventurer's Tome | Could not seed Item Known Information for ${source.name}`, error));
      }
    }, 900);
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  void atSdkiEnhanceSheet(app, element).catch((error) => console.warn("Adventurer's Tome | Source Known Information sheet enhancement failed safely", error));
  atSdkiQueue();
});

Hooks.on("updateItem", (item, changes, options) => {
  if (atSdkiGuards.has(item.uuid) || options?.adventurersTomeKnownInformation) return;
  const touched = foundry.utils.hasProperty(changes, `flags.${ATSDKI_ID}.${ATSDKI_FLAG}`) || Boolean(changes?.flags?.[ATSDKI_ID]?.[ATSDKI_FLAG]);
  if (!touched) return;
  const payload = atSdkiItemPayload(item);
  void atSdkiMirrorItemJournal(item, payload.html).then(() => {
    atSdkiUpdateOpenSurfaces(item, payload.html);
    atSdkiRenderTome();
  }).catch((error) => console.warn("Adventurer's Tome | Item -> Tome Known Information sync failed safely", error));
});

Hooks.on("updateActor", (actor, changes, options) => {
  if (atSdkiGuards.has(actor.uuid) || options?.adventurersTomeKnownInformation || !atSdkiIsGroupPc(actor)) return;
  const touched = foundry.utils.hasProperty(changes, `flags.${ATSDKI_ID}.profile`) || Boolean(changes?.flags?.[ATSDKI_ID]?.profile);
  if (!touched) return;
  atSdkiUpdateOpenSurfaces(actor, atSdkiPcHtml(actor));
  atSdkiRenderTome();
});

Hooks.on("updateJournalEntryPage", (page, changes, options) => {
  if (atSdkiPageGuards.has(page.id) || options?.adventurersTomeKnownInformationMirror) return;
  const journal = page?.parent;
  const source = atSdkiSourceForWorld(journal);
  if (source?.documentName !== "Item" || atSdkiPrimaryPage(journal)?.id !== page.id) return;
  const touched = foundry.utils.hasProperty(changes, "text.content") || Boolean(changes?.text?.content !== undefined);
  if (!touched) return;
  const html = atSdkiCleanHtml(page.text?.content || "");
  void atSdkiWriteItem(source, journal, html, "foundry-journal").then(() => {
    atSdkiUpdateOpenSurfaces(source, html);
    atSdkiRenderTome();
  }).catch((error) => console.warn("Adventurer's Tome | Journal -> Item Known Information sync failed safely", error));
});

for (const hookName of ["updateJournalEntry", "createJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(hookName, atSdkiQueue);
