const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-campaign-analysis-preview";
const VERSION = 1;

const TYPE_META = Object.freeze({
  character:{ label:"Character / NPC", icon:"fa-user" },
  person:{ label:"Character / NPC", icon:"fa-user" },
  npc:{ label:"Character / NPC", icon:"fa-user" },
  contact:{ label:"Character / NPC", icon:"fa-address-card" },
  location:{ label:"Location", icon:"fa-location-dot" },
  faction:{ label:"Faction", icon:"fa-flag" },
  item:{ label:"Item", icon:"fa-gem" },
  lore:{ label:"Lore", icon:"fa-book" },
  quest:{ label:"Quest", icon:"fa-diamond" },
  session:{ label:"Session", icon:"fa-book-open" },
  unknown:{ label:"Unknown", icon:"fa-circle-question" }
});

let timer = null;
let pending = false;
let renders = 0;
let failures = 0;
let lastError = "";

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function percent(value) {
  const number = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(number * 100);
}

function typeMeta(kind) {
  return TYPE_META[clean(kind).toLowerCase()] || TYPE_META.unknown;
}

function tomeApp() {
  try { return game.modules.get(MODULE_ID)?.api?.app?.() || null; }
  catch (_error) { return null; }
}

function authoringActive(app = tomeApp()) {
  if (!app) return false;
  if (Number(app._atRichEditingCount || 0) > 0) return true;
  const root = document.querySelector("#adventurers-tome-app");
  return Boolean(root?.querySelector(
    "[data-at-af-editing='true'], [data-at-ep-editing='true'], [data-at-wie-rich-editing='true'], .at-wie-rich-editor[contenteditable='true'], [data-at-ep-editor][contenteditable='true'], [contenteditable='true'].is-editing"
  ));
}

function currentSource(app = tomeApp()) {
  if (!app || !game.user?.isGM) return null;

  if (app.activeTab === "sessions" && app.activeSessionId) {
    const journal = game.journal?.get(clean(app.activeSessionId));
    if (journal) return { kind:"session", journal, uuid:journal.uuid };
  }

  if (app.activeTab === "questDetail" && app.activeQuestId) {
    const journal = game.journal?.get(clean(app.activeQuestId));
    if (journal) return { kind:"quest", journal, uuid:journal.uuid };
  }

  return null;
}

function knownApi() {
  return game.modules.get(MODULE_ID)?.api?.campaignMentionDiscovery || null;
}

function newApi() {
  return game.modules.get(MODULE_ID)?.api?.campaignNewEntityDiscovery || null;
}

function decisionRank(decision) {
  const key = clean(decision);
  if (["resolved-canonical","resolved-semantic","resolved-external"].includes(key)) return 5;
  if (key === "resolved-corroborated") return 4;
  if (key === "review") return 3;
  if (key === "ambiguous") return 2;
  if (key === "unresolved") return 1;
  return 0;
}

function decisionLabel(decision) {
  const key = clean(decision);
  if (["resolved-canonical","resolved-semantic","resolved-external"].includes(key)) return "Resolved";
  if (key === "resolved-corroborated") return "Corroborated";
  if (key === "review") return "Existing · review";
  if (key === "ambiguous") return "Ambiguous";
  if (key === "unresolved") return "Unresolved";
  return key || "Detected";
}

function knownRowsForSource(uuid) {
  const api = knownApi();
  if (!api?.mentionsForSource) return [];

  const raw = api.mentionsForSource(uuid) || [];
  const grouped = new Map();

  for (const row of raw) {
    const selected = row?.resolution?.selectedTarget || null;
    const candidate = row?.resolution?.candidates?.[0]?.target || null;
    const target = selected || candidate;
    const targetName = clean(target?.name);
    const text = clean(row?.text);
    if (!targetName && !text) continue;

    const canonicalUuid = clean(target?.canonicalUuid);
    const key = canonicalUuid || normalize(targetName || text);
    if (!key) continue;

    const kind = clean(target?.kind || row?.kindHint || "unknown").toLowerCase();
    const item = {
      key,
      text:targetName || text,
      kind,
      decision:clean(row?.resolution?.decision),
      identityConfidence:Number(row?.resolution?.confidence || row?.assessment?.identity?.score || 0),
      detectionConfidence:Number(row?.assessment?.detection?.score || 0),
      mentionType:clean(row?.mentionType),
      canonicalUuid,
      occurrences:1
    };

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, item);
      continue;
    }

    current.occurrences += 1;
    current.detectionConfidence = Math.max(current.detectionConfidence, item.detectionConfidence);
    current.identityConfidence = Math.max(current.identityConfidence, item.identityConfidence);
    if (decisionRank(item.decision) > decisionRank(current.decision)) current.decision = item.decision;
    if (current.kind === "unknown" && item.kind !== "unknown") current.kind = item.kind;
  }

  return [...grouped.values()].sort((a, b) =>
    typeMeta(a.kind).label.localeCompare(typeMeta(b.kind).label)
    || a.text.localeCompare(b.text, game.i18n?.lang, { numeric:true })
  );
}

function newRowsForSource(uuid) {
  const api = newApi();
  if (!api?.candidatesForSource) return [];

  return (api.candidatesForSource(uuid) || [])
    .map((row) => ({
      text:clean(row?.text),
      kind:clean(row?.classification?.kind || "unknown").toLowerCase(),
      detectionConfidence:Number(row?.detection?.score || 0),
      typeConfidence:Number(row?.classification?.confidence || 0),
      disposition:clean(row?.disposition),
      mentionCount:Number(row?.mentionCount || 1),
      identityStatus:clean(row?.identity?.status || "no-existing-canonical-match")
    }))
    .filter((row) => row.text)
    .sort((a, b) =>
      typeMeta(a.kind).label.localeCompare(typeMeta(b.kind).label)
      || b.detectionConfidence - a.detectionConfidence
      || a.text.localeCompare(b.text, game.i18n?.lang, { numeric:true })
    );
}

function snapshotForSource(uuid) {
  const known = knownRowsForSource(uuid);
  const possibleNew = newRowsForSource(uuid);
  return {
    contract:CONTRACT,
    version:VERSION,
    sourceUuid:clean(uuid),
    readOnly:true,
    writesPerformed:false,
    reviewActionsEnabled:false,
    known:clone(known),
    possibleNew:clone(possibleNew),
    summary:{
      known:known.length,
      possibleNew:possibleNew.length,
      highConfidenceNew:possibleNew.filter((row) => row.disposition === "high-confidence").length
    }
  };
}

function knownCard(row) {
  const meta = typeMeta(row.kind);
  const detection = percent(row.detectionConfidence);
  const identity = percent(row.identityConfidence);
  return `
    <article class="at-analysis-entity at-analysis-known">
      <span class="at-analysis-entity-icon"><i class="fa-solid ${meta.icon}"></i></span>
      <span class="at-analysis-entity-copy">
        <strong>${escapeHtml(row.text)}</strong>
        <small>${escapeHtml(meta.label)} · ${escapeHtml(decisionLabel(row.decision))}</small>
      </span>
      <span class="at-analysis-confidence" title="Detection ${detection}% · Identity ${identity}%">
        <b>${identity || detection}%</b><em>identity</em>
      </span>
    </article>`;
}

function newCard(row) {
  const meta = typeMeta(row.kind);
  const detection = percent(row.detectionConfidence);
  const typeConfidence = percent(row.typeConfidence);
  const confidenceClass = row.disposition === "high-confidence" ? "is-high" : row.disposition === "review" ? "is-review" : "is-weak";
  return `
    <article class="at-analysis-entity at-analysis-new ${confidenceClass}">
      <span class="at-analysis-entity-icon"><i class="fa-solid ${meta.icon}"></i></span>
      <span class="at-analysis-entity-copy">
        <strong>${escapeHtml(row.text)}</strong>
        <small>${escapeHtml(meta.label)} · ${row.mentionCount} mention${row.mentionCount === 1 ? "" : "s"}</small>
      </span>
      <span class="at-analysis-confidence" title="Detection ${detection}% · Type ${typeConfidence}%">
        <b>${Math.max(detection, typeConfidence)}%</b><em>${escapeHtml(row.disposition || "candidate")}</em>
      </span>
    </article>`;
}

function panelHtml(source, data) {
  const knownHtml = data.known.length
    ? data.known.map(knownCard).join("")
    : '<p class="at-analysis-empty">No existing campaign entities were detected directly in this text.</p>';

  const newHtml = data.possibleNew.length
    ? data.possibleNew.map(newCard).join("")
    : '<p class="at-analysis-empty">No possible new entities detected.</p>';

  return `
    <section class="at-campaign-analysis-preview" data-at-campaign-analysis-preview data-source-uuid="${escapeHtml(source.uuid)}">
      <header class="at-analysis-header">
        <div>
          <span class="at-kicker">Campaign Intelligence · Read-only</span>
          <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Campaign Analysis</h3>
          <p>Direct mentions from this ${source.kind === "quest" ? "Quest" : "Session"} only. No campaign data is changed.</p>
        </div>
        <div class="at-analysis-summary">
          <span><strong>${data.summary.known}</strong><small>known</small></span>
          <span><strong>${data.summary.possibleNew}</strong><small>possible new</small></span>
        </div>
      </header>

      <div class="at-analysis-columns">
        <section class="at-analysis-column">
          <div class="at-analysis-column-title">
            <span><i class="fa-solid fa-link"></i> Known mentions</span>
            <small>Existing campaign identities detected in the text</small>
          </div>
          <div class="at-analysis-list">${knownHtml}</div>
        </section>

        <section class="at-analysis-column">
          <div class="at-analysis-column-title">
            <span><i class="fa-solid fa-sparkles"></i> Possible new entities</span>
            <small>Detected and classified, but not created or linked</small>
          </div>
          <div class="at-analysis-list">${newHtml}</div>
        </section>
      </div>

      <footer class="at-analysis-footer">
        <i class="fa-solid fa-shield-halved"></i>
        Analysis Preview only · Confirm / Ignore / Create actions are intentionally disabled in qa.14.
      </footer>
    </section>`;
}

function mountTarget(source) {
  const root = document.querySelector("#adventurers-tome-app");
  if (!root) return null;

  if (source.kind === "session") {
    const detail = root.querySelector(".at-session-detail");
    if (!detail) return null;
    return {
      host:detail,
      before:detail.querySelector(".at-session-detail-notes, .at-session-open-full")
    };
  }

  const detail = root.querySelector(".at-quest-detail-page");
  if (!detail) return null;
  return {
    host:detail,
    before:detail.querySelector(".at-quest-detail-grid")
  };
}

function renderPreview() {
  const app = tomeApp();
  if (!app?.rendered || !game.user?.isGM) return false;

  if (authoringActive(app)) {
    pending = true;
    return false;
  }

  const source = currentSource(app);
  const root = document.querySelector("#adventurers-tome-app");
  root?.querySelectorAll("[data-at-campaign-analysis-preview]").forEach((node) => node.remove());
  if (!source) {
    pending = false;
    return false;
  }

  const target = mountTarget(source);
  if (!target) {
    pending = true;
    return false;
  }

  const data = snapshotForSource(source.uuid);
  const shell = document.createElement("div");
  shell.innerHTML = panelHtml(source, data);
  const panel = shell.firstElementChild;
  if (!panel) return false;

  if (target.before) target.host.insertBefore(panel, target.before);
  else target.host.append(panel);

  renders += 1;
  pending = false;
  return true;
}

function scheduleRender(delay = 90) {
  pending = true;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    try {
      if (!renderPreview() && authoringActive()) pending = true;
    } catch (error) {
      failures += 1;
      lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Campaign Analysis Preview failed safely", error);
    }
  }, delay);
}

function audit() {
  const app = tomeApp();
  const source = currentSource(app);
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:failures === 0,
    gmOnlyPreview:true,
    readOnly:true,
    writesPerformed:false,
    reviewActionsEnabled:false,
    respectsLiveAuthoring:true,
    source:source ? { kind:source.kind, uuid:source.uuid, name:source.journal.name } : null,
    mounted:Boolean(document.querySelector("[data-at-campaign-analysis-preview]")),
    pending,
    renders,
    failures,
    lastError
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  writesPerformed:false,
  reviewActionsEnabled:false,
  snapshotForSource,
  refresh:() => scheduleRender(0),
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignAnalysisPreview = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  scheduleRender(220);
  console.info("Adventurer's Tome | Campaign Analysis Preview v1 ready (GM-only, read-only).");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignAnalysisPreview !== publicApi) attach();
  scheduleRender(120);
});

Hooks.on("adventurersTomeSemanticMentionDiscoveryUpdated", () => scheduleRender(60));
Hooks.on("adventurersTomeNewEntityDiscoveryUpdated", () => scheduleRender(60));
Hooks.on("adventurersTomeAuthoringEditingChanged", ({ active } = {}) => {
  if (!active && pending) scheduleRender(140);
});
Hooks.on("adventurersTomeAuthoringSaveSettled", () => {
  if (pending) scheduleRender(140);
});
