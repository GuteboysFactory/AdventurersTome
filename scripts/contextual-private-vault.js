const MODULE_ID = "adventurers-tome";
const LEGACY_VAULT_SETTING = "gmPrivateVault";
const CONTEXT_VAULT_SETTING = "gmContextualPrivateVaultV2";
const VAULT_SCHEMA = "adventurers-tome.private-vault";
const VAULT_VERSION = 2;

const NOTE_TYPES = Object.freeze({
  prep: { label: "Prep", icon: "fa-list-check" },
  secret: { label: "Secret", icon: "fa-user-secret" },
  reminder: { label: "Reminder", icon: "fa-bell" },
  clue: { label: "Clue", icon: "fa-magnifying-glass" },
  reveal: { label: "Reveal", icon: "fa-eye" },
  consequence: { label: "Consequence", icon: "fa-bolt" },
  question: { label: "Question", icon: "fa-circle-question" },
  idea: { label: "Idea", icon: "fa-lightbulb" },
  scene: { label: "Scene", icon: "fa-clapperboard" }
});

const NOTE_STATUSES = Object.freeze({
  open: "Open",
  resolved: "Resolved"
});

const APP_STATE = new WeakMap();

function safeJSONParse(value, fallback) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

function deepClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value)); }
}

function randomId() {
  try { return foundry.utils.randomID(12); }
  catch (_err) { return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}

function normalizeNote(note = {}) {
  const type = NOTE_TYPES[String(note?.type || "reminder").toLowerCase()] ? String(note.type).toLowerCase() : "reminder";
  const status = NOTE_STATUSES[String(note?.status || "open").toLowerCase()] ? String(note.status).toLowerCase() : "open";
  const sessionTarget = Number(note?.sessionTarget || 0);
  return {
    id: String(note?.id || randomId()),
    title: String(note?.title || "GM Note").trim() || "GM Note",
    body: String(note?.body || note?.text || "").trim(),
    type,
    status,
    pinned: note?.pinned === true,
    trigger: String(note?.trigger || "").trim(),
    sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? Math.floor(sessionTarget) : null,
    createdAt: Number(note?.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(note?.updatedAt || Date.now()) || Date.now()
  };
}

function emptyVault() {
  return {
    schema: VAULT_SCHEMA,
    version: VAULT_VERSION,
    records: {},
    migration: {
      legacyImportedAt: null,
      importedRecords: 0
    }
  };
}

function normalizeVault(raw) {
  const parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const records = parsed.records && typeof parsed.records === "object" && !Array.isArray(parsed.records) ? parsed.records : {};
  return {
    schema: VAULT_SCHEMA,
    version: VAULT_VERSION,
    records: deepClone(records),
    migration: {
      legacyImportedAt: Number(parsed?.migration?.legacyImportedAt || 0) || null,
      importedRecords: Number(parsed?.migration?.importedRecords || 0) || 0
    }
  };
}

function getContextVault() {
  if (!game.user?.isGM) return emptyVault();
  try {
    return normalizeVault(safeJSONParse(game.settings.get(MODULE_ID, CONTEXT_VAULT_SETTING), emptyVault()));
  } catch (_err) {
    return emptyVault();
  }
}

async function setContextVault(vault) {
  if (!game.user?.isGM) throw new Error("Only a GM can change private Adventurer's Tome data.");
  const normalized = normalizeVault(vault);
  await game.settings.set(MODULE_ID, CONTEXT_VAULT_SETTING, JSON.stringify(normalized));
  return normalized;
}

function getLegacyVault() {
  if (!game.user?.isGM) return {};
  try {
    const parsed = safeJSONParse(game.settings.get(MODULE_ID, LEGACY_VAULT_SETTING), {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function legacyKey(document) {
  if (!document?.id) return "";
  return `${String(document.documentName || "document").toLowerCase()}:${document.id}`;
}

function canonicalUuid(document) {
  return String(document?.uuid || "").trim();
}

function resolveDocumentFromLegacyKey(key) {
  const match = String(key || "").match(/^([^:]+):(.+)$/);
  if (!match) return null;
  const [, type, id] = match;
  if (type === "actor") return game.actors?.get(id) || null;
  if (type === "journalentry") return game.journal?.get(id) || null;
  if (type === "item") return game.items?.get(id) || null;
  if (type === "scene") return game.scenes?.get(id) || null;
  return null;
}

function normalizeRecord(document, record = {}) {
  const now = Date.now();
  return {
    uuid: canonicalUuid(document) || String(record?.uuid || "").trim(),
    documentName: String(document?.documentName || record?.documentName || "Document"),
    documentId: String(document?.id || record?.documentId || ""),
    nameSnapshot: String(document?.name || record?.nameSnapshot || "Untitled"),
    notes: Array.isArray(record?.notes) ? record.notes.map(normalizeNote) : [],
    facts: Array.isArray(record?.facts) ? deepClone(record.facts) : [],
    relations: Array.isArray(record?.relations) ? deepClone(record.relations) : [],
    createdAt: Number(record?.createdAt || now) || now,
    updatedAt: Number(record?.updatedAt || now) || now
  };
}

function getRecord(document, vault = getContextVault()) {
  const uuid = canonicalUuid(document);
  if (!uuid) return normalizeRecord(document, {});
  const direct = vault.records?.[uuid];
  if (direct && typeof direct === "object") return normalizeRecord(document, direct);

  const old = getLegacyVault()[legacyKey(document)];
  if (old && typeof old === "object") return normalizeRecord(document, old);
  return normalizeRecord(document, {});
}

async function mirrorLegacyRecord(document, record) {
  if (!game.user?.isGM || !document?.id) return;
  const vault = getLegacyVault();
  const key = legacyKey(document);
  const payload = {
    notes: record.notes.map(normalizeNote),
    facts: deepClone(record.facts || []),
    relations: deepClone(record.relations || [])
  };
  if (!payload.notes.length && !payload.facts.length && !payload.relations.length) delete vault[key];
  else vault[key] = payload;
  await game.settings.set(MODULE_ID, LEGACY_VAULT_SETTING, JSON.stringify(vault));
}

async function saveRecord(document, patch = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can change private Adventurer's Tome data.");
  const uuid = canonicalUuid(document);
  if (!uuid) throw new Error("A stable Foundry UUID is required for contextual GM notes.");

  const vault = getContextVault();
  const current = getRecord(document, vault);
  const next = normalizeRecord(document, {
    ...current,
    notes: Array.isArray(patch.notes) ? patch.notes.map(normalizeNote) : current.notes,
    facts: Array.isArray(patch.facts) ? deepClone(patch.facts) : current.facts,
    relations: Array.isArray(patch.relations) ? deepClone(patch.relations) : current.relations,
    createdAt: current.createdAt,
    updatedAt: Date.now()
  });

  if (!next.notes.length && !next.facts.length && !next.relations.length) delete vault.records[uuid];
  else vault.records[uuid] = next;
  await setContextVault(vault);

  // v1.2 migration bridge: keep the proven v1.1 GM Notebook/access editor fully
  // compatible while the new UUID-backed vault is being live-tested.
  await mirrorLegacyRecord(document, next);
  return next;
}

async function migrateLegacyVault() {
  if (!game.user?.isGM) return { imported: 0, skipped: true };
  const vault = getContextVault();
  const legacy = getLegacyVault();
  let imported = 0;

  for (const [key, value] of Object.entries(legacy)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const document = resolveDocumentFromLegacyKey(key);
    const uuid = canonicalUuid(document);
    if (!document || !uuid || vault.records[uuid]) continue;
    vault.records[uuid] = normalizeRecord(document, value);
    imported += 1;
  }

  if (imported || !vault.migration.legacyImportedAt) {
    vault.migration.legacyImportedAt = Date.now();
    vault.migration.importedRecords = Number(vault.migration.importedRecords || 0) + imported;
    await setContextVault(vault);
  }

  if (imported) console.info(`Adventurer's Tome | Private Vault v2 imported ${imported} legacy contextual record(s).`);
  return { imported, skipped: false };
}

function documentFromTomeRef(ref) {
  const [type, id] = String(ref || "").split(":");
  if (!id) return null;
  if (type === "actor") return game.actors?.get(id) || null;
  if (["session", "quest", "world", "rule"].includes(type)) return game.journal?.get(id) || null;
  return null;
}

function currentContext(app) {
  if (!game.user?.isGM || !app) return null;
  const ref = typeof app._currentTomeRef === "function" ? String(app._currentTomeRef() || "") : "";
  const document = documentFromTomeRef(ref);
  if (!ref || !document) return null;
  const type = ref.split(":")[0];
  const labels = { actor: "Character / NPC", session: "Session", quest: "Quest", world: "World entry", rule: "Rule" };
  return { ref, type, label: labels[type] || "Campaign entry", document };
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionHtml(values, selected) {
  return Object.entries(values).map(([id, meta]) => {
    const label = typeof meta === "string" ? meta : meta.label;
    return `<option value="${htmlEscape(id)}"${id === selected ? " selected" : ""}>${htmlEscape(label)}</option>`;
  }).join("");
}

function noteEditorHtml(note) {
  const n = normalizeNote(note);
  return `<article class="at-context-note" data-at-context-note data-note-id="${htmlEscape(n.id)}" data-created-at="${n.createdAt}">
    <div class="at-context-note-head">
      <label>Type<select name="contextNoteType">${optionHtml(NOTE_TYPES, n.type)}</select></label>
      <label>Status<select name="contextNoteStatus">${optionHtml(NOTE_STATUSES, n.status)}</select></label>
      <label class="at-context-pin"><input type="checkbox" name="contextNotePinned"${n.pinned ? " checked" : ""}> <span><i class="fa-solid fa-thumbtack"></i> Pin</span></label>
      <button type="button" class="at-context-note-remove" data-at-context-remove title="Remove note"><i class="fa-solid fa-trash"></i></button>
    </div>
    <label>Title<input type="text" name="contextNoteTitle" value="${htmlEscape(n.title)}"></label>
    <div class="at-context-note-grid">
      <label>Trigger / when it matters<input type="text" name="contextNoteTrigger" value="${htmlEscape(n.trigger)}" placeholder="When the party reaches…"></label>
      <label>Target session<input type="number" min="1" name="contextNoteSessionTarget" value="${n.sessionTarget || ""}" placeholder="Optional"></label>
    </div>
    <label>Private note<textarea name="contextNoteBody" rows="5" placeholder="Secret, prep, clue, consequence, reminder…">${htmlEscape(n.body)}</textarea></label>
  </article>`;
}

function drawerHtml(context, record) {
  const notes = [...record.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.updatedAt) - Number(a.updatedAt));
  return `<aside class="at-context-vault" data-at-context-vault aria-label="Private GM Context">
    <header class="at-context-vault-head">
      <div>
        <span class="at-kicker"><i class="fa-solid fa-lock"></i> Private Vault</span>
        <h2>GM Context</h2>
        <p>${htmlEscape(context.label)} · <strong>${htmlEscape(context.document.name || "Untitled")}</strong></p>
      </div>
      <button type="button" class="at-icon-button" data-at-context-close title="Close GM Context"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="at-context-vault-notice"><i class="fa-solid fa-user-shield"></i><span>Stored in your GM-private UUID-backed vault. Players and delegated editors never receive this content.</span></div>
    <div class="at-context-vault-tools">
      <button type="button" class="at-secondary" data-at-context-add><i class="fa-solid fa-plus"></i> Add Note</button>
      <span>${notes.length} note${notes.length === 1 ? "" : "s"}</span>
    </div>
    <div class="at-context-note-list" data-at-context-note-list>
      ${notes.map(noteEditorHtml).join("") || `<div class="at-context-empty"><i class="fa-regular fa-note-sticky"></i><strong>No private context yet.</strong><span>Add a note without leaving this campaign entry.</span></div>`}
    </div>
    <footer class="at-context-vault-footer">
      <button type="button" class="at-secondary" data-at-context-close>Close</button>
      <button type="button" class="at-primary" data-at-context-save><i class="fa-solid fa-floppy-disk"></i> Save GM Context</button>
    </footer>
  </aside>`;
}

function collectNotes(drawer) {
  const now = Date.now();
  return [...drawer.querySelectorAll("[data-at-context-note]")].map((row) => {
    const createdAt = Number(row.dataset.createdAt || now) || now;
    const sessionTarget = Number(row.querySelector('[name="contextNoteSessionTarget"]')?.value || 0);
    return normalizeNote({
      id: row.dataset.noteId || randomId(),
      title: row.querySelector('[name="contextNoteTitle"]')?.value || "GM Note",
      body: row.querySelector('[name="contextNoteBody"]')?.value || "",
      type: row.querySelector('[name="contextNoteType"]')?.value || "reminder",
      status: row.querySelector('[name="contextNoteStatus"]')?.value || "open",
      pinned: Boolean(row.querySelector('[name="contextNotePinned"]')?.checked),
      trigger: row.querySelector('[name="contextNoteTrigger"]')?.value || "",
      sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? sessionTarget : null,
      createdAt,
      updatedAt: now
    });
  }).filter((note) => note.body || note.title !== "GM Note");
}

function appRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function isTomeApp(app) {
  return app?.id === "adventurers-tome-app" || app?.options?.id === "adventurers-tome-app" || app?.constructor?.name === "AdventurersTomeApp";
}

function setDrawerState(app, patch) {
  const current = APP_STATE.get(app) || { open: false, ref: "" };
  const next = { ...current, ...patch };
  APP_STATE.set(app, next);
  return next;
}

function refreshButton(button, record) {
  const count = record.notes.length;
  button.classList.toggle("has-notes", count > 0);
  button.title = count ? `Private GM Context · ${count} note${count === 1 ? "" : "s"}` : "Private GM Context";
  const badge = button.querySelector(".at-context-badge");
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count < 1;
  }
}

function installContextUi(app, element) {
  const root = appRoot(element);
  if (!root || !game.user?.isGM || !isTomeApp(app)) return;

  const context = currentContext(app);
  const actions = root.querySelector(".at-gm-top-actions");
  if (!actions) return;

  const existingButton = actions.querySelector("[data-at-context-open]");
  const existingDrawer = root.querySelector("[data-at-context-vault]");

  if (!context) {
    existingButton?.remove();
    existingDrawer?.remove();
    setDrawerState(app, { open: false, ref: "" });
    return;
  }

  const record = getRecord(context.document);
  let button = existingButton;
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "at-icon-button at-context-vault-button";
    button.dataset.atContextOpen = "";
    button.innerHTML = `<i class="fa-solid fa-lock"></i><span class="at-context-badge" hidden>0</span>`;
    actions.insertBefore(button, actions.firstChild);
  }
  refreshButton(button, record);

  const state = APP_STATE.get(app) || { open: false, ref: "" };
  if (state.ref && state.ref !== context.ref) setDrawerState(app, { open: false, ref: context.ref });
  else if (!state.ref) setDrawerState(app, { ref: context.ref });

  button.onclick = () => {
    const current = APP_STATE.get(app) || { open: false, ref: context.ref };
    setDrawerState(app, { open: !current.open, ref: context.ref });
    installContextUi(app, root);
  };

  root.querySelector("[data-at-context-vault]")?.remove();
  const nextState = APP_STATE.get(app) || { open: false, ref: context.ref };
  if (!nextState.open) return;

  const shell = root.querySelector(".at-shell") || root;
  shell.insertAdjacentHTML("beforeend", drawerHtml(context, record));
  const drawer = shell.querySelector("[data-at-context-vault]");
  if (!drawer) return;

  drawer.querySelectorAll("[data-at-context-close]").forEach((close) => {
    close.addEventListener("click", () => {
      setDrawerState(app, { open: false, ref: context.ref });
      drawer.remove();
    });
  });

  drawer.querySelector("[data-at-context-add]")?.addEventListener("click", () => {
    const list = drawer.querySelector("[data-at-context-note-list]");
    if (!list) return;
    list.querySelector(".at-context-empty")?.remove();
    list.insertAdjacentHTML("afterbegin", noteEditorHtml(normalizeNote({ title: "GM Note", body: "" })));
    const row = list.firstElementChild;
    row?.querySelector('[name="contextNoteTitle"]')?.focus();
    row?.querySelector("[data-at-context-remove]")?.addEventListener("click", () => row.remove());
  });

  drawer.querySelectorAll("[data-at-context-remove]").forEach((remove) => {
    remove.addEventListener("click", () => remove.closest("[data-at-context-note]")?.remove());
  });

  drawer.querySelector("[data-at-context-save]")?.addEventListener("click", async (event) => {
    const saveButton = event.currentTarget;
    if (!(saveButton instanceof HTMLButtonElement)) return;
    saveButton.disabled = true;
    try {
      const notes = collectNotes(drawer);
      const saved = await saveRecord(context.document, { notes });
      refreshButton(button, saved);
      setDrawerState(app, { open: false, ref: context.ref });
      drawer.remove();
      ui.notifications.info(`Adventurer's Tome: Private GM context saved for ${context.document.name}.`);
    } catch (error) {
      console.error("Adventurer's Tome | Failed to save contextual GM note", error);
      ui.notifications.error("Adventurer's Tome: Could not save private GM context. See console for details.");
      saveButton.disabled = false;
    }
  });
}

function gmApi() {
  return {
    schema: VAULT_SCHEMA,
    version: VAULT_VERSION,
    getSummary(document) {
      if (!game.user?.isGM) return { available: false, noteCount: 0 };
      const record = getRecord(document);
      return { available: true, uuid: canonicalUuid(document), noteCount: record.notes.length, updatedAt: record.updatedAt };
    },
    async migrateLegacy() {
      return migrateLegacyVault();
    }
  };
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, CONTEXT_VAULT_SETTING, {
    scope: "user",
    config: false,
    type: String,
    default: JSON.stringify(emptyVault())
  });
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  try {
    await migrateLegacyVault();
  } catch (error) {
    console.error("Adventurer's Tome | Private Vault v2 migration failed safely; legacy vault remains untouched.", error);
  }

  const module = game.modules.get(MODULE_ID);
  if (module) {
    const api = module.api && typeof module.api === "object" ? module.api : {};
    module.api = { ...api, contextualPrivateVault: gmApi() };
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  try { installContextUi(app, element); }
  catch (error) { console.error("Adventurer's Tome | Contextual Private Vault render hook failed", error); }
});
