const PVB_MODULE_ID = "adventurers-tome";
const PVB_VAULT_SETTING = "gmContextualPrivateVaultV2";
const PVB_LINKS_FLAG = "links";
const PVB_PROFILE_FLAG = "worldProfile";

function pvbClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) { return JSON.parse(JSON.stringify(value ?? null)); }
}

function pvbParse(value, fallback = {}) {
  try { return JSON.parse(String(value ?? "")) ?? fallback; }
  catch (_err) { return fallback; }
}

function pvbEsc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pvbAppRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function pvbIsTomeApp(app) {
  return app?.id === "adventurers-tome-app" || app?.options?.id === "adventurers-tome-app" || app?.constructor?.name === "AdventurersTomeApp";
}

function pvbVault() {
  if (!game.user?.isGM) return { records: {} };
  const raw = pvbParse(game.settings.get(PVB_MODULE_ID, PVB_VAULT_SETTING), {});
  return {
    schema: String(raw?.schema || "adventurers-tome.private-vault"),
    version: Number(raw?.version || 2),
    records: raw?.records && typeof raw.records === "object" && !Array.isArray(raw.records) ? pvbClone(raw.records) : {}
  };
}

function pvbDocumentFromUuid(uuid) {
  const value = String(uuid || "").trim();
  let match = value.match(/^Actor\.([^\.]+)$/);
  if (match) return game.actors?.get(match[1]) || null;
  match = value.match(/^JournalEntry\.([^\.]+)$/);
  if (match) return game.journal?.get(match[1]) || null;
  match = value.match(/^Item\.([^\.]+)$/);
  if (match) return game.items?.get(match[1]) || null;
  match = value.match(/^Scene\.([^\.]+)$/);
  if (match) return game.scenes?.get(match[1]) || null;
  return null;
}

function pvbWorldProfile(journal) {
  const raw = journal?.getFlag?.(PVB_MODULE_ID, PVB_PROFILE_FLAG);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function pvbLinkedActor(journal) {
  if (journal?.documentName !== "JournalEntry") return null;
  const profile = pvbWorldProfile(journal);
  const sourceUuid = String(journal.getFlag?.(PVB_MODULE_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  const match = sourceUuid.match(/^Actor\.([^\.]+)$/);
  if (match) return game.actors?.get(match[1]) || null;
  const actorId = String(profile.actorId || "").trim();
  return actorId ? game.actors?.get(actorId) || null : null;
}

function pvbLinkedJournals(actor) {
  if (actor?.documentName !== "Actor") return [];
  return [...(game.journal?.contents ?? [])].filter((journal) => {
    const profile = pvbWorldProfile(journal);
    const sourceUuid = String(journal.getFlag?.(PVB_MODULE_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    return sourceUuid === actor.uuid || String(profile.actorId || "") === String(actor.id);
  });
}

function pvbCanonicalDocument(document) {
  if (document?.documentName !== "JournalEntry") return document;
  return pvbLinkedActor(document) || document;
}

function pvbNormalizeNote(note = {}) {
  return {
    id: String(note.id || ""),
    title: String(note.title || "GM Note").trim() || "GM Note",
    body: String(note.body || note.text || "").trim(),
    type: String(note.type || "reminder").toLowerCase(),
    status: String(note.status || "open").toLowerCase(),
    pinned: note.pinned === true,
    trigger: String(note.trigger || "").trim(),
    sessionTarget: Number(note.sessionTarget || 0) > 0 ? Math.floor(Number(note.sessionTarget)) : null,
    updatedAt: Number(note.updatedAt || 0),
    createdAt: Number(note.createdAt || 0)
  };
}

function pvbMergeNotes(current = [], incoming = []) {
  const byId = new Map();
  for (const raw of [...current, ...incoming]) {
    const note = pvbNormalizeNote(raw);
    const key = note.id || `${note.title}|${note.body}|${note.createdAt}`;
    const old = byId.get(key);
    if (!old || Number(note.updatedAt || 0) >= Number(old.updatedAt || 0)) byId.set(key, note);
  }
  return [...byId.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function pvbDocumentKind(document, record = {}) {
  if (document?.documentName === "Actor") return "Actor";
  if (document?.documentName === "Item") return "Item";
  if (document?.documentName === "Scene") return "Scene";
  if (document?.documentName === "JournalEntry") {
    const raw = String(document.getFlag?.(PVB_MODULE_ID, "type") || "").toLowerCase();
    if (raw === "session") return "Session";
    if (raw === "quest") return "Quest";
    if (raw === "world") return "World";
    if (raw === "rule") return "Rule";
    return "Journal";
  }
  return String(record.documentName || "Source");
}

function pvbCanonicalRecords() {
  const vault = pvbVault();
  const groups = new Map();

  for (const [uuid, raw] of Object.entries(vault.records || {})) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const sourceDocument = pvbDocumentFromUuid(uuid);
    const canonical = pvbCanonicalDocument(sourceDocument);
    const key = String(canonical?.uuid || uuid);
    const existing = groups.get(key) || {
      uuid: key,
      document: canonical || null,
      aliases: new Set(),
      name: String(canonical?.name || raw.nameSnapshot || "Untitled"),
      kind: pvbDocumentKind(canonical, raw),
      notes: [],
      updatedAt: 0,
      missing: !canonical
    };

    existing.aliases.add(uuid);
    existing.notes = pvbMergeNotes(existing.notes, Array.isArray(raw.notes) ? raw.notes : []);
    existing.updatedAt = Math.max(existing.updatedAt, Number(raw.updatedAt || 0));
    if (!existing.document && canonical) existing.document = canonical;
    if (canonical?.name) existing.name = canonical.name;
    if (canonical) {
      existing.kind = pvbDocumentKind(canonical, raw);
      existing.missing = false;
    }
    groups.set(key, existing);
  }

  return [...groups.values()]
    .filter((record) => record.notes.length)
    .sort((a, b) => Number(b.notes.some((note) => note.pinned)) - Number(a.notes.some((note) => note.pinned)) || Number(b.updatedAt) - Number(a.updatedAt) || a.name.localeCompare(b.name));
}

function pvbLinks(document) {
  const raw = document?.getFlag?.(PVB_MODULE_ID, PVB_LINKS_FLAG);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const clean = (value) => [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || "").trim()).filter(Boolean))];
  return {
    sessions: clean(source.sessions),
    quests: clean(source.quests),
    world: clean(source.world),
    actors: clean(source.actors)
  };
}

function pvbJournalKind(journal) {
  const type = String(journal?.getFlag?.(PVB_MODULE_ID, "type") || "").toLowerCase();
  if (["session", "quest", "world", "rule"].includes(type)) return type;
  const folder = String(journal?.folder?.name || "").toLowerCase();
  if (folder.includes("session")) return "session";
  if (folder.includes("quest")) return "quest";
  if (folder.includes("rule")) return "rule";
  return "world";
}

function pvbRelationKey(document) {
  if (document?.documentName === "Actor") return { key: "actors", id: document.id };
  if (document?.documentName !== "JournalEntry") return null;
  const kind = pvbJournalKind(document);
  if (kind === "session") return { key: "sessions", id: document.id };
  if (kind === "quest") return { key: "quests", id: document.id };
  if (kind === "world") return { key: "world", id: document.id };
  return null;
}

function pvbRelationTargets(document) {
  const sources = [document];
  if (document?.documentName === "Actor") sources.push(...pvbLinkedJournals(document));
  const related = new Map();

  for (const source of sources.filter(Boolean)) {
    const links = pvbLinks(source);
    for (const id of links.sessions) {
      const target = game.journal?.get(id);
      if (target) related.set(target.uuid, target);
    }
    for (const id of links.quests) {
      const target = game.journal?.get(id);
      if (target) related.set(target.uuid, target);
    }
    for (const id of links.world) {
      const target = game.journal?.get(id);
      if (target) related.set(target.uuid, target);
    }
    for (const id of links.actors) {
      const target = game.actors?.get(id);
      if (target) related.set(target.uuid, target);
    }
  }

  const sourceKeys = sources.map(pvbRelationKey).filter(Boolean);
  const candidates = [...(game.journal?.contents ?? []), ...(game.actors?.contents ?? [])];
  for (const candidate of candidates) {
    if (!candidate?.uuid || sources.some((source) => source?.uuid === candidate.uuid)) continue;
    const links = pvbLinks(candidate);
    if (sourceKeys.some(({ key, id }) => links[key]?.includes(id))) related.set(candidate.uuid, candidate);
  }

  return [...related.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function pvbIcon(kind) {
  const key = String(kind || "").toLowerCase();
  if (key === "actor") return "fa-user-shield";
  if (key === "session") return "fa-book-open";
  if (key === "quest") return "fa-diamond";
  if (key === "world") return "fa-earth-europe";
  if (key === "rule") return "fa-scroll";
  if (key === "item") return "fa-suitcase";
  if (key === "scene") return "fa-map";
  return "fa-file-lines";
}

function pvbNoteHtml(note) {
  const classes = ["at-pvb-note", note.pinned ? "is-pinned" : "", note.status === "resolved" ? "is-resolved" : ""].filter(Boolean).join(" ");
  const body = note.body ? `<p>${pvbEsc(note.body)}</p>` : "";
  const trigger = note.trigger ? `<span><i class="fa-solid fa-bell"></i> ${pvbEsc(note.trigger)}</span>` : "";
  const session = note.sessionTarget ? `<span><i class="fa-solid fa-calendar-day"></i> Session ${note.sessionTarget}</span>` : "";
  return `<article class="${classes}" data-pvb-note-search="${pvbEsc(`${note.title} ${note.body} ${note.type} ${note.status} ${note.trigger}`.toLowerCase())}">
    <header><strong>${note.pinned ? '<i class="fa-solid fa-thumbtack"></i> ' : ""}${pvbEsc(note.title)}</strong><span>${pvbEsc(note.type)} · ${pvbEsc(note.status)}</span></header>
    ${body}
    ${(trigger || session) ? `<footer>${trigger}${session}</footer>` : ""}
  </article>`;
}

function pvbRelationHtml(document) {
  const kind = pvbDocumentKind(document, {});
  return `<button type="button" class="at-pvb-link" data-pvb-open-uuid="${pvbEsc(document.uuid)}" title="Open ${pvbEsc(document.name)}"><i class="fa-solid ${pvbIcon(kind)}"></i><span>${pvbEsc(document.name)}</span></button>`;
}

function pvbRecordHtml(record) {
  const related = record.document ? pvbRelationTargets(record.document) : [];
  const openCount = record.notes.filter((note) => note.status !== "resolved").length;
  const pinnedCount = record.notes.filter((note) => note.pinned).length;
  const search = `${record.name} ${record.kind} ${record.notes.map((note) => `${note.title} ${note.body} ${note.type} ${note.status} ${note.trigger}`).join(" ")} ${related.map((document) => document.name).join(" ")}`.toLowerCase();
  const sourceButton = record.document
    ? `<button type="button" class="at-secondary" data-pvb-open-uuid="${pvbEsc(record.document.uuid)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Source</button>`
    : `<span class="at-pvb-missing"><i class="fa-solid fa-triangle-exclamation"></i> Source missing</span>`;
  const relations = related.length
    ? `<div class="at-pvb-backlinks"><span class="at-pvb-label"><i class="fa-solid fa-link"></i> Related / backlinks</span><div>${related.map(pvbRelationHtml).join("")}</div></div>`
    : `<div class="at-pvb-backlinks is-empty"><span class="at-pvb-label"><i class="fa-solid fa-link"></i> No Tome links/backlinks found</span></div>`;

  return `<section class="at-pvb-record" data-pvb-record data-pvb-kind="${pvbEsc(record.kind.toLowerCase())}" data-pvb-search="${pvbEsc(search)}">
    <header class="at-pvb-record-head">
      <div><span class="at-pvb-source-icon"><i class="fa-solid ${pvbIcon(record.kind)}"></i></span><div><h3>${pvbEsc(record.name)}</h3><p>${pvbEsc(record.kind)} · ${record.notes.length} note${record.notes.length === 1 ? "" : "s"} · ${openCount} open${pinnedCount ? ` · ${pinnedCount} pinned` : ""}</p></div></div>
      ${sourceButton}
    </header>
    <div class="at-pvb-notes">${record.notes.map(pvbNoteHtml).join("")}</div>
    ${relations}
  </section>`;
}

function pvbBrowserContent(records) {
  const totalNotes = records.reduce((sum, record) => sum + record.notes.length, 0);
  return `<div class="at-pvb-browser">
    <div class="at-pvb-summary"><div><i class="fa-solid fa-vault"></i><span><strong>${records.length}</strong> source${records.length === 1 ? "" : "s"}</span><span><strong>${totalNotes}</strong> private note${totalNotes === 1 ? "" : "s"}</span></div><small>GM-private. Source relationships are derived from existing Tome links; no new canonical campaign data is created.</small></div>
    <div class="at-pvb-tools">
      <label class="at-pvb-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-pvb-search placeholder="Search source, note, trigger or backlink…"></label>
      <select data-pvb-filter title="Filter Private Vault"><option value="all">All sources</option><option value="actor">Actors</option><option value="session">Sessions</option><option value="quest">Quests</option><option value="world">World</option><option value="rule">Rules</option><option value="other">Other</option></select>
      <label class="at-pvb-check"><input type="checkbox" data-pvb-pinned> Pinned only</label>
      <label class="at-pvb-check"><input type="checkbox" data-pvb-open> Open only</label>
    </div>
    <div class="at-pvb-list" data-pvb-list>${records.map(pvbRecordHtml).join("") || '<div class="at-pvb-empty"><i class="fa-solid fa-lock-open"></i><strong>Private Vault is empty.</strong><span>Add contextual GM notes from Tome or a supported Foundry sheet.</span></div>'}</div>
    <div class="at-pvb-no-results" data-pvb-no-results hidden>No Private Vault entries match the current filters.</div>
  </div>`;
}

function pvbWireBrowser(dialog) {
  const root = dialog?.element;
  if (!(root instanceof HTMLElement)) return;
  const search = root.querySelector("[data-pvb-search]");
  const filter = root.querySelector("[data-pvb-filter]");
  const pinnedOnly = root.querySelector("[data-pvb-pinned]");
  const openOnly = root.querySelector("[data-pvb-open]");
  const noResults = root.querySelector("[data-pvb-no-results]");

  const apply = () => {
    const query = String(search?.value || "").trim().toLowerCase();
    const kind = String(filter?.value || "all");
    let shown = 0;
    for (const record of root.querySelectorAll("[data-pvb-record]")) {
      const recordKind = String(record.dataset.pvbKind || "");
      const kindMatch = kind === "all" || (kind === "other" ? !["actor", "session", "quest", "world", "rule"].includes(recordKind) : recordKind === kind);
      const textMatch = !query || String(record.dataset.pvbSearch || "").includes(query);
      const notes = [...record.querySelectorAll(".at-pvb-note")];
      const pinnedMatch = !pinnedOnly?.checked || notes.some((note) => note.classList.contains("is-pinned"));
      const openMatch = !openOnly?.checked || notes.some((note) => !note.classList.contains("is-resolved"));
      const visible = kindMatch && textMatch && pinnedMatch && openMatch;
      record.hidden = !visible;
      if (visible) shown += 1;
    }
    if (noResults) noResults.hidden = shown > 0 || root.querySelectorAll("[data-pvb-record]").length === 0;
  };

  search?.addEventListener("input", apply);
  filter?.addEventListener("change", apply);
  pinnedOnly?.addEventListener("change", apply);
  openOnly?.addEventListener("change", apply);

  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-pvb-open-uuid]");
    if (!button) return;
    const document = pvbDocumentFromUuid(button.dataset.pvbOpenUuid);
    if (!document) return ui.notifications.warn("Adventurer's Tome: The linked Foundry source is no longer available.");
    document.sheet?.render?.(true);
  });
}

async function pvbOpenBrowser() {
  if (!game.user?.isGM) return;
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return ui.notifications.error("Adventurer's Tome: DialogV2 is unavailable in this Foundry build.");
  const records = pvbCanonicalRecords();
  await DialogV2.wait({
    window: { title: "Private Vault Browser" },
    content: pvbBrowserContent(records),
    modal: false,
    rejectClose: false,
    buttons: [{ action: "close", label: "Close", default: true }],
    render: (_event, dialog) => pvbWireBrowser(dialog)
  });
}

function pvbInstallStyle() {
  if (document.getElementById("at-private-vault-browser-style")) return;
  const style = document.createElement("style");
  style.id = "at-private-vault-browser-style";
  style.textContent = `
    .at-pvb-browser{display:grid;gap:.75rem;min-width:min(760px,78vw);max-width:min(980px,86vw);max-height:72vh;overflow:auto;padding:.15rem}
    .at-pvb-summary{display:grid;gap:.3rem;padding:.7rem .8rem;border:1px solid rgba(203,170,104,.32);border-radius:9px;background:rgba(90,72,36,.12)}
    .at-pvb-summary>div{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.at-pvb-summary>div>i{color:#d5b56d}.at-pvb-summary small{opacity:.72}
    .at-pvb-tools{display:grid;grid-template-columns:minmax(260px,1fr) auto auto auto;gap:.45rem;align-items:center;position:sticky;top:0;z-index:2;padding:.45rem;background:rgba(18,19,21,.96);border-radius:8px}
    .at-pvb-search{display:flex;align-items:center;gap:.4rem}.at-pvb-search input{width:100%;min-width:0}.at-pvb-check{white-space:nowrap;font-size:.9em}
    .at-pvb-list{display:grid;gap:.65rem}.at-pvb-record{display:grid;gap:.55rem;padding:.75rem;border:1px solid rgba(130,130,130,.28);border-radius:10px;background:rgba(22,23,25,.64)}
    .at-pvb-record-head{display:flex;justify-content:space-between;gap:.7rem;align-items:flex-start}.at-pvb-record-head>div:first-child{display:flex;gap:.55rem;min-width:0}.at-pvb-record-head h3{margin:0;font-size:1.05rem}.at-pvb-record-head p{margin:.12rem 0 0;opacity:.68;font-size:.84em}
    .at-pvb-source-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;border:1px solid rgba(203,170,104,.35);color:#d8bb78;flex:0 0 auto}
    .at-pvb-notes{display:grid;gap:.4rem}.at-pvb-note{display:grid;gap:.3rem;padding:.55rem .6rem;border-left:3px solid rgba(143,143,143,.42);background:rgba(255,255,255,.025);border-radius:5px}.at-pvb-note.is-pinned{border-left-color:#d2ad57}.at-pvb-note.is-resolved{opacity:.66}.at-pvb-note header{display:flex;justify-content:space-between;gap:.6rem}.at-pvb-note header span{opacity:.65;font-size:.78em;text-transform:capitalize}.at-pvb-note p{margin:0;white-space:pre-wrap}.at-pvb-note footer{display:flex;gap:.7rem;flex-wrap:wrap;font-size:.78em;opacity:.7}
    .at-pvb-backlinks{display:grid;gap:.35rem;padding-top:.45rem;border-top:1px solid rgba(128,128,128,.18)}.at-pvb-backlinks>div{display:flex;gap:.35rem;flex-wrap:wrap}.at-pvb-label{font-size:.78em;opacity:.68}.at-pvb-link{display:inline-flex!important;align-items:center!important;gap:.3rem!important;width:auto!important;min-width:0!important;padding:.2rem .45rem!important;font-size:.78em!important}.at-pvb-missing{color:#e3aa78;font-size:.82em}.at-pvb-no-results,.at-pvb-empty{padding:1.2rem;text-align:center;opacity:.7}.at-pvb-empty{display:grid;gap:.3rem;place-items:center}
    .at-context-vault-browser-button{position:relative}.at-context-vault-browser-button .at-pvb-badge{position:absolute;right:-3px;top:-4px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;font-size:9px;line-height:15px;text-align:center;background:var(--color-border-highlight,#b58d4f);color:#fff;pointer-events:none}
    @media(max-width:760px){.at-pvb-browser{min-width:min(540px,84vw)}.at-pvb-tools{grid-template-columns:1fr 1fr}.at-pvb-search{grid-column:1/-1}.at-pvb-record-head{flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function pvbInstallTomeButton(app, element) {
  if (!game.user?.isGM || !pvbIsTomeApp(app)) return;
  const root = pvbAppRoot(element);
  const actions = root?.querySelector?.(".at-gm-top-actions");
  if (!actions || actions.querySelector("[data-at-pvb-browser]")) return;

  const records = pvbCanonicalRecords();
  const noteCount = records.reduce((sum, record) => sum + record.notes.length, 0);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-icon-button at-context-vault-browser-button";
  button.dataset.atPvbBrowser = "";
  button.title = noteCount ? `Private Vault Browser · ${records.length} sources · ${noteCount} notes` : "Private Vault Browser";
  button.setAttribute("aria-label", "Private Vault Browser");
  button.innerHTML = `<i class="fa-solid fa-box-archive"></i><span class="at-pvb-badge"${noteCount ? "" : " hidden"}>${noteCount}</span>`;
  button.addEventListener("click", () => pvbOpenBrowser().catch((error) => {
    console.error("Adventurer's Tome | Private Vault Browser failed", error);
    ui.notifications.error("Adventurer's Tome: Could not open Private Vault Browser. See console for details.");
  }));
  actions.insertBefore(button, actions.firstChild);
}

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  pvbInstallStyle();
  const module = game.modules.get(PVB_MODULE_ID);
  if (module) {
    const api = module.api && typeof module.api === "object" ? module.api : {};
    module.api = { ...api, privateVaultBrowser: { open: pvbOpenBrowser, list: pvbCanonicalRecords } };
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  try { pvbInstallTomeButton(app, element); }
  catch (error) { console.error("Adventurer's Tome | Private Vault Browser render hook failed safely", error); }
});
