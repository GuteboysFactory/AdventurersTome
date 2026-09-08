const ATQIC_MODULE_ID = "adventurers-tome";
const ATQIC_SOURCE_UUID = "quickImportSourceUuid";
const ATQIC_SOURCE_TYPE = "quickImportSourceType";
const ATQIC_CONTENT_VERSION = "quickImportContentVersion";
const ATQIC_VERSION = 1;
const ATQIC_RUNNING = new Set();
let atQicTimer = null;

const ATQIC_TEXT_KEYS = [
  "rulesSummary", "rules", "description", "summary", "biography", "bio", "details", "notes", "note", "text", "effect", "effects"
];

const ATQIC_FACT_PRIORITY = [
  "tier", "rank", "ranked", "activation", "source", "automation", "type", "category", "rarity", "level",
  "price", "cost", "value", "encumbrance", "damage", "critical", "crit", "range", "defense", "soak"
];

const ATQIC_SKIP_KEYS = new Set([
  "description", "summary", "biography", "bio", "details", "notes", "note", "text", "rules", "rulessummary",
  "effect", "effects", "img", "image", "icon", "uuid", "id", "_id", "flags", "ownership", "folder", "sort",
  "createdtime", "modifiedtime", "updatedtime"
]);

function atQicEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atQicTitle(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function atQicPlain(value) {
  const host = document.createElement("div");
  host.innerHTML = String(value || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atQicMeaningfulText(value) {
  if (typeof value !== "string") return "";
  const text = atQicPlain(value);
  if (!text || text.length < 3) return "";
  if (/^(?:none|n\/a|null|undefined)$/i.test(text)) return "";
  return value.trim();
}

function atQicDisplayScalar(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") {
    const text = atQicPlain(value);
    if (!text || text.length > 160) return "";
    return text;
  }
  return "";
}

function atQicUnwrap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  for (const key of ["value", "label", "name", "current"]) {
    if (Object.hasOwn(value, key)) {
      const scalar = atQicDisplayScalar(value[key]);
      if (scalar) return value[key];
    }
  }
  return value;
}

function atQicFindTextFields(root, maxDepth = 3) {
  const found = [];
  const seen = new Set();
  const visit = (value, path = [], depth = 0) => {
    if (depth > maxDepth || value == null) return;
    if (typeof value !== "object" || Array.isArray(value)) return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const [key, raw] of Object.entries(value)) {
      const lower = String(key).toLowerCase();
      const unwrapped = atQicUnwrap(raw);
      const priority = ATQIC_TEXT_KEYS.findIndex((candidate) => candidate.toLowerCase() === lower);
      if (priority >= 0) {
        const text = atQicMeaningfulText(unwrapped);
        if (text) found.push({ key, path: [...path, key], value: text, priority });
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) visit(raw, [...path, key], depth + 1);
    }
  };
  visit(root);
  return found.sort((a, b) => a.priority - b.priority || a.path.length - b.path.length);
}

function atQicFlattenFacts(root, maxDepth = 2) {
  const facts = [];
  const seen = new Set();
  const visit = (value, path = [], depth = 0) => {
    if (depth > maxDepth || value == null || typeof value !== "object" || Array.isArray(value)) return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const [key, raw] of Object.entries(value)) {
      const lower = String(key).toLowerCase();
      if (ATQIC_SKIP_KEYS.has(lower) || lower.startsWith("_") || lower.includes("html")) continue;
      const nextPath = [...path, key];
      const unwrapped = atQicUnwrap(raw);
      const scalar = atQicDisplayScalar(unwrapped);
      if (scalar) {
        if (/^(?:0|false)$/i.test(scalar) && !ATQIC_FACT_PRIORITY.includes(lower)) continue;
        facts.push({ key, path: nextPath, value: scalar });
        continue;
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) visit(raw, nextPath, depth + 1);
    }
  };
  visit(root);

  const scored = facts.map((fact) => {
    const lower = String(fact.key).toLowerCase();
    const priority = ATQIC_FACT_PRIORITY.indexOf(lower);
    return { ...fact, score: priority >= 0 ? priority : 100 + fact.path.length };
  }).sort((a, b) => a.score - b.score || a.path.length - b.path.length || String(a.key).localeCompare(String(b.key)));

  const result = [];
  const labels = new Set();
  for (const fact of scored) {
    const label = atQicTitle(fact.key);
    if (!label || labels.has(label.toLowerCase())) continue;
    labels.add(label.toLowerCase());
    result.push({ label, value: fact.value, visibility: "player", gmOnly: false });
    if (result.length >= 10) break;
  }
  return result;
}

function atQicSourcePayload(source) {
  const system = source?.system && typeof source.system === "object" ? source.system : {};
  const sourceData = source?.toObject?.() || {};
  const textCandidates = atQicFindTextFields(system);

  if (!textCandidates.length) {
    for (const key of ["description", "text", "notes", "biography"]) {
      const text = atQicMeaningfulText(sourceData?.[key]);
      if (text) textCandidates.push({ key, path: [key], value: text, priority: 50 });
    }
  }

  const uniqueText = [];
  const seenText = new Set();
  for (const candidate of textCandidates) {
    const plain = atQicPlain(candidate.value);
    if (!plain || seenText.has(plain.toLowerCase())) continue;
    seenText.add(plain.toLowerCase());
    uniqueText.push(candidate.value);
    if (uniqueText.length >= 3) break;
  }

  let bodyHtml = "";
  if (uniqueText.length) {
    bodyHtml = uniqueText.map((text) => /<\/?[a-z][\s\S]*>/i.test(text) ? text : `<p>${atQicEscape(text)}</p>`).join("");
  }

  const summaryPlain = uniqueText.length ? atQicPlain(uniqueText[0]).slice(0, 360) : "";
  const facts = atQicFlattenFacts(system);
  return { bodyHtml, summary: summaryPlain, facts };
}

function atQicIsBlankPage(page) {
  const html = String(page?.text?.content || "");
  if (!html.trim()) return true;
  const host = document.createElement("div");
  host.innerHTML = html;
  host.querySelectorAll("[data-at-tome-summary]").forEach((node) => node.remove());
  const text = String(host.textContent || "").replace(/\u00a0/g, " ").trim();
  return !text && !host.querySelector("img, video, audio, iframe, table, ul, ol, blockquote");
}

function atQicPrimaryTextPage(journal) {
  const profile = journal?.getFlag?.(ATQIC_MODULE_ID, "worldProfile") || {};
  const preferred = String(journal?.getFlag?.(ATQIC_MODULE_ID, "worldSyncPage") || profile?.syncPageId || "");
  const pages = [...(journal?.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred && String(page.type || "text").toLowerCase() === "text")
    || pages.find((page) => String(page.type || "text").toLowerCase() === "text")
    || null;
}

function atQicQuickSource(journal) {
  const profile = journal?.getFlag?.(ATQIC_MODULE_ID, "worldProfile") || {};
  const uuid = String(journal?.getFlag?.(ATQIC_MODULE_ID, ATQIC_SOURCE_UUID) || profile?.sourceUuid || "").trim();
  const type = String(journal?.getFlag?.(ATQIC_MODULE_ID, ATQIC_SOURCE_TYPE) || profile?.sourceDocumentType || "").trim();
  if (!uuid || !type || type === "JournalEntry") return null;
  return { uuid, type };
}

async function atQicEnrichJournal(journal) {
  if (!game.user?.isGM || !journal || ATQIC_RUNNING.has(journal.id)) return false;
  const quick = atQicQuickSource(journal);
  if (!quick) return false;
  const version = Number(journal.getFlag?.(ATQIC_MODULE_ID, ATQIC_CONTENT_VERSION) || 0);
  if (version >= ATQIC_VERSION) return false;

  ATQIC_RUNNING.add(journal.id);
  try {
    const source = await fromUuid(quick.uuid);
    if (!source) return false;
    const payload = atQicSourcePayload(source);
    const current = journal.getFlag?.(ATQIC_MODULE_ID, "worldProfile") || {};
    const profile = current && typeof current === "object" && !Array.isArray(current) ? foundry.utils.deepClone(current) : {};
    const existingFacts = Array.isArray(profile.facts) ? profile.facts : [];
    const page = atQicPrimaryTextPage(journal);
    const pageBlank = atQicIsBlankPage(page);
    let profileChanged = false;

    if (!String(profile.summary || "").trim() && payload.summary) {
      profile.summary = payload.summary;
      profileChanged = true;
    }
    if (!String(profile.body || "").trim() && payload.bodyHtml) {
      profile.body = payload.bodyHtml;
      profileChanged = true;
    }
    if (!existingFacts.length && payload.facts.length) {
      profile.facts = payload.facts;
      profileChanged = true;
    }

    if (profileChanged) await journal.setFlag(ATQIC_MODULE_ID, "worldProfile", profile);

    if (page && pageBlank && payload.bodyHtml) {
      const summary = payload.summary ? `<p data-at-tome-summary="true">${atQicEscape(payload.summary)}</p>` : "";
      await page.update({
        "text.content": `${summary}${payload.bodyHtml}`,
        "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
      });
    }

    await journal.setFlag(ATQIC_MODULE_ID, ATQIC_CONTENT_VERSION, ATQIC_VERSION);
    return profileChanged || (page && pageBlank && Boolean(payload.bodyHtml));
  } catch (error) {
    console.warn(`Adventurer's Tome | Could not populate Quick Import content for ${journal.name}`, error);
    return false;
  } finally {
    window.setTimeout(() => ATQIC_RUNNING.delete(journal.id), 120);
  }
}

function atQicScheduleAll(delay = 180) {
  if (!game.user?.isGM) return;
  window.clearTimeout(atQicTimer);
  atQicTimer = window.setTimeout(async () => {
    atQicTimer = null;
    let changed = false;
    for (const journal of game.journal?.contents ?? []) {
      if (await atQicEnrichJournal(journal)) changed = true;
    }
    if (changed) {
      window.setTimeout(() => {
        try { game.modules.get(ATQIC_MODULE_ID)?.api?.app?.()?.render?.({ parts: ["main"] }); } catch (_err) {}
      }, 100);
    }
  }, delay);
}

Hooks.once("ready", () => atQicScheduleAll(250));
for (const hookName of ["createJournalEntry", "createJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => atQicScheduleAll(180));
}
