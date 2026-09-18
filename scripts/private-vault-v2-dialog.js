const MODULE_ID = "adventurers-tome";
const VAULT_SETTING = "gmContextualPrivateVaultV2";
const LEGACY_SETTING = "gmPrivateVault";

function pv2Clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function pv2Parse(value, fallback = {}) {
  try { return JSON.parse(String(value ?? "")) ?? fallback; }
  catch (_err) { return fallback; }
}

function pv2Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pv2Note(note = {}) {
  const now = Date.now();
  return {
    id: String(note.id || foundry.utils.randomID?.(12) || now),
    title: String(note.title || "GM Note").trim() || "GM Note",
    body: String(note.body || note.text || "").trim(),
    type: String(note.type || "reminder"),
    status: String(note.status || "open"),
    pinned: note.pinned === true,
    trigger: String(note.trigger || "").trim(),
    sessionTarget: Number(note.sessionTarget || 0) > 0 ? Math.floor(Number(note.sessionTarget)) : null,
    createdAt: Number(note.createdAt || now) || now,
    updatedAt: Number(note.updatedAt || now) || now
  };
}

function pv2Record(document, record = {}) {
  const now = Date.now();
  return {
    uuid: String(document?.uuid || record.uuid || ""),
    documentName: String(document?.documentName || record.documentName || "Document"),
    documentId: String(document?.id || record.documentId || ""),
    nameSnapshot: String(document?.name || record.nameSnapshot || "Untitled"),
    notes: Array.isArray(record.notes) ? record.notes.map(pv2Note) : [],
    facts: Array.isArray(record.facts) ? pv2Clone(record.facts) : [],
    relations: Array.isArray(record.relations) ? pv2Clone(record.relations) : [],
    createdAt: Number(record.createdAt || now) || now,
    updatedAt: Number(record.updatedAt || now) || now
  };
}

function pv2WorldProfile(journal) {
  const raw = journal?.getFlag?.(MODULE_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function pv2ResolveActor(journal) {
  if (journal?.documentName !== "JournalEntry") return null;
  const profile = pv2WorldProfile(journal);
  const sourceUuid = String(journal.getFlag?.(MODULE_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  const match = sourceUuid.match(/^Actor\.([^\.]+)$/);
  if (match) return game.actors?.get(match[1]) || null;
  const actorId = String(profile.actorId || "").trim();
  return actorId ? game.actors?.get(actorId) || null : null;
}

function pv2Canonical(document) {
  if (document?.documentName !== "JournalEntry") return document;
  return pv2ResolveActor(document) || document;
}

function pv2LinkedJournal(actor) {
  if (actor?.documentName !== "Actor") return null;
  return [...(game.journal?.contents ?? [])].find((journal) => {
    const profile = pv2WorldProfile(journal);
    const sourceUuid = String(journal.getFlag?.(MODULE_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    return sourceUuid === actor.uuid || String(profile.actorId || "") === String(actor.id);
  }) || null;
}

function pv2Vault() {
  const raw = pv2Parse(game.settings.get(MODULE_ID, VAULT_SETTING), {});
  return {
    schema: "adventurers-tome.private-vault",
    version: 2,
    records: raw?.records && typeof raw.records === "object" && !Array.isArray(raw.records) ? pv2Clone(raw.records) : {},
    migration: raw?.migration && typeof raw.migration === "object" ? pv2Clone(raw.migration) : {}
  };
}

function pv2Legacy() {
  const raw = pv2Parse(game.settings.get(MODULE_ID, LEGACY_SETTING), {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? pv2Clone(raw) : {};
}

function pv2LegacyKey(document) {
  return document?.id ? `${String(document.documentName || "document").toLowerCase()}:${document.id}` : "";
}

function pv2GetRecord(document) {
  document = pv2Canonical(document);
  const vault = pv2Vault();
  const direct = vault.records?.[document?.uuid];
  if (direct) return pv2Record(document, direct);

  if (document?.documentName === "Actor") {
    const alias = pv2LinkedJournal(document);
    const aliased = alias ? vault.records?.[alias.uuid] : null;
    if (aliased) return pv2Record(document, aliased);
  }

  const legacy = pv2Legacy();
  const old = legacy[pv2LegacyKey(document)];
  return pv2Record(document, old || {});
}

async function pv2SaveRecord(document, notes) {
  document = pv2Canonical(document);
  if (!document?.uuid) throw new Error("Private Vault requires a stable Foundry UUID.");

  const alias = document.documentName === "Actor" ? pv2LinkedJournal(document) : null;
  const vault = pv2Vault();
  const current = pv2GetRecord(document);
  const next = pv2Record(document, {
    ...current,
    notes: notes.map(pv2Note),
    createdAt: current.createdAt,
    updatedAt: Date.now()
  });
  const empty = !next.notes.length && !next.facts.length && !next.relations.length;

  if (empty) delete vault.records[document.uuid];
  else vault.records[document.uuid] = next;

  if (alias) {
    if (empty) delete vault.records[alias.uuid];
    else vault.records[alias.uuid] = pv2Record(alias, next);
  }

  await game.settings.set(MODULE_ID, VAULT_SETTING, JSON.stringify(vault));

  const legacy = pv2Legacy();
  const payload = {
    notes: next.notes.map(pv2Note),
    facts: pv2Clone(next.facts),
    relations: pv2Clone(next.relations)
  };
  for (const source of [document, alias].filter(Boolean)) {
    const key = pv2LegacyKey(source);
    if (empty) delete legacy[key];
    else legacy[key] = pv2Clone(payload);
  }
  await game.settings.set(MODULE_ID, LEGACY_SETTING, JSON.stringify(legacy));
  return next;
}

function pv2NoteRow(note) {
  const n = pv2Note(note);
  const types = ["prep", "secret", "reminder", "clue", "reveal", "consequence", "question", "idea", "scene"];
  const options = types.map((type) => `<option value="${type}"${type === n.type ? " selected" : ""}>${type[0].toUpperCase() + type.slice(1)}</option>`).join("");
  return `<div class="atp-note" data-pv2-note data-id="${pv2Escape(n.id)}" data-created="${n.createdAt}">
    <div>
      <input data-title value="${pv2Escape(n.title)}">
      <select data-type>${options}</select>
      <select data-status><option value="open"${n.status === "open" ? " selected" : ""}>Open</option><option value="resolved"${n.status === "resolved" ? " selected" : ""}>Resolved</option></select>
      <label><input type="checkbox" data-pin${n.pinned ? " checked" : ""}> Pin</label>
      <button type="button" data-remove title="Remove"><i class="fa-solid fa-trash"></i></button>
    </div>
    <textarea data-body rows="4">${pv2Escape(n.body)}</textarea>
    <div>
      <input data-trigger value="${pv2Escape(n.trigger)}" placeholder="Trigger / when it matters">
      <input data-session type="number" min="1" value="${n.sessionTarget || ""}" placeholder="Session">
    </div>
  </div>`;
}

function pv2Collect(root) {
  return [...root.querySelectorAll("[data-pv2-note]")].map((row) => pv2Note({
    id: row.dataset.id,
    title: row.querySelector("[data-title]")?.value,
    body: row.querySelector("[data-body]")?.value,
    type: row.querySelector("[data-type]")?.value,
    status: row.querySelector("[data-status]")?.value,
    pinned: row.querySelector("[data-pin]")?.checked,
    trigger: row.querySelector("[data-trigger]")?.value,
    sessionTarget: row.querySelector("[data-session]")?.value,
    createdAt: Number(row.dataset.created || Date.now()),
    updatedAt: Date.now()
  })).filter((note) => note.body || note.title !== "GM Note");
}

function pv2WireDialog(dialog) {
  const root = dialog?.element;
  if (!(root instanceof HTMLElement)) return;
  const list = root.querySelector("[data-pv2-list]");
  const wireRow = (row) => row?.querySelector("[data-remove]")?.addEventListener("click", () => row.remove());
  root.querySelectorAll("[data-pv2-note]").forEach(wireRow);
  root.querySelector("[data-add]")?.addEventListener("click", () => {
    list?.querySelector("[data-empty]")?.remove();
    list?.insertAdjacentHTML("afterbegin", pv2NoteRow({}));
    wireRow(list?.firstElementChild);
    list?.firstElementChild?.querySelector("[data-title]")?.focus();
  });
}

async function pv2OpenVault(document) {
  if (!game.user?.isGM) return;
  document = pv2Canonical(document);
  if (!document?.uuid) return;

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) {
    ui.notifications.error("Adventurer's Tome: DialogV2 is unavailable in this Foundry build.");
    return;
  }

  const record = pv2GetRecord(document);
  const content = `<div class="atp-vault-form">
    <p class="atp-private"><i class="fa-solid fa-user-shield"></i> GM-private · UUID-backed · ${pv2Escape(document.documentName)}: <strong>${pv2Escape(document.name)}</strong></p>
    <div data-pv2-list>${record.notes.map(pv2NoteRow).join("") || '<p data-empty>No private context yet.</p>'}</div>
    <button type="button" data-add><i class="fa-solid fa-plus"></i> Add Note</button>
  </div>`;

  await DialogV2.wait({
    window: { title: `Private Vault · ${document.name}` },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "close", label: "Close" },
      {
        action: "save",
        label: "Save GM Context",
        icon: "fa-solid fa-floppy-disk",
        default: true,
        callback: async (_event, button) => {
          const root = button.form || button.closest("form");
          if (!root) throw new Error("Private Vault dialog form was not found.");
          await pv2SaveRecord(document, pv2Collect(root));
          ui.notifications.info(`Adventurer's Tome: Private GM context saved for ${document.name}.`);
          return "save";
        }
      }
    ],
    render: (_event, dialog) => pv2WireDialog(dialog)
  });
}

function pv2AppRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function pv2IsTomeApp(app) {
  return app?.id === "adventurers-tome-app" || app?.options?.id === "adventurers-tome-app" || app?.constructor?.name === "AdventurersTomeApp";
}

function pv2SheetDocument(app) {
  const document = app?.document || app?.actor || app?.object;
  return ["Actor", "JournalEntry"].includes(String(document?.documentName || "")) ? pv2Canonical(document) : null;
}

function pv2CurrentTomeDocument(app) {
  if (!pv2IsTomeApp(app) || typeof app._currentTomeRef !== "function") return null;
  const [type, id] = String(app._currentTomeRef() || "").split(":");
  if (type !== "world" || !id) return null;
  const journal = game.journal?.get(id) || null;
  return journal ? pv2Canonical(journal) : null;
}

function pv2Count(document) {
  try { return pv2GetRecord(document).notes.length; }
  catch (_err) { return 0; }
}

function pv2ReplaceButton(button, document, { compact = false } = {}) {
  if (!(button instanceof HTMLElement) || !document?.uuid) return;
  const replacement = button.cloneNode(true);
  replacement.onclick = null;
  replacement.dataset.pv2Dialog = "";

  const count = pv2Count(document);
  replacement.title = count ? `Private Vault · ${count} note${count === 1 ? "" : "s"}` : "Private Vault";

  if (compact) {
    replacement.classList.add("atp-sheet-vault-v2");
    replacement.innerHTML = `<i class="fa-solid fa-lock"></i><span class="atp-sheet-vault-badge"${count ? "" : " hidden"}>${count}</span>`;
    replacement.setAttribute("aria-label", "Private Vault");
  } else {
    const badge = replacement.querySelector(".at-context-badge");
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count < 1;
    }
  }

  replacement.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    pv2OpenVault(document).catch((error) => {
      console.error("Adventurer's Tome | DialogV2 Private Vault failed", error);
      ui.notifications.error("Adventurer's Tome: Could not open Private Vault. See console for details.");
    });
  });
  button.replaceWith(replacement);
}

function pv2InstallStyle() {
  if (document.getElementById("at-private-vault-v2-style")) return;
  const style = document.createElement("style");
  style.id = "at-private-vault-v2-style";
  style.textContent = `
    .atp-sheet-vault-v2 {
      position: relative;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      width: 30px !important;
      min-width: 30px !important;
      height: 28px !important;
      padding: 0 !important;
      gap: 0 !important;
    }
    .atp-sheet-vault-v2 .atp-sheet-vault-badge {
      position: absolute;
      right: -3px;
      top: -4px;
      min-width: 15px;
      height: 15px;
      padding: 0 3px;
      border-radius: 8px;
      font-size: 9px;
      line-height: 15px;
      text-align: center;
      background: var(--color-border-highlight, #b58d4f);
      color: var(--color-text-light-highlight, #fff);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  pv2InstallStyle();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    if (!module.api || typeof module.api !== "object") module.api = {};
    const api = module.api;
    const contextual = api.contextualPrivateVault && typeof api.contextualPrivateVault === "object"
      ? api.contextualPrivateVault
      : {};
    api.contextualPrivateVault = contextual;
    Object.assign(contextual, {
      open: async (documentOrUuid) => {
        let document = documentOrUuid;
        if (typeof documentOrUuid === "string") {
          try {
            document = api.universalDocuments?.resolve?.(documentOrUuid) || fromUuidSync?.(documentOrUuid) || null;
          } catch (_err) {
            document = api.universalDocuments?.resolve?.(documentOrUuid) || null;
          }
        }
        if (!document?.uuid) return false;
        await pv2OpenVault(document);
        return true;
      }
    });
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  if (!game.user?.isGM) return;
  const root = pv2AppRoot(element);
  if (!root) return;

  if (pv2IsTomeApp(app)) {
    const document = pv2CurrentTomeDocument(app);
    const button = root.querySelector("[data-atp-vault-open]");
    if (document && button && !button.hasAttribute("data-pv2-dialog")) pv2ReplaceButton(button, document);
    return;
  }

  const document = pv2SheetDocument(app);
  const button = root.querySelector("[data-atp-sheet-vault]");
  if (document && button && !button.hasAttribute("data-pv2-dialog")) pv2ReplaceButton(button, document, { compact: true });
});
