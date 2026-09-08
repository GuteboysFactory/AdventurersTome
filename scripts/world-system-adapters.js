const ATSA_MODULE_ID = "adventurers-tome";
const ATSA_REGISTRY = new Map();

function atSaPlain(value) {
  const host = document.createElement("div");
  host.innerHTML = String(value || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atSaEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atSaMeaningful(value) {
  if (typeof value !== "string") return "";
  const plain = atSaPlain(value);
  if (!plain || plain.length < 3) return "";
  if (/^(?:none|n\/a|null|undefined)$/i.test(plain)) return "";
  return value.trim();
}

function atSaFirstText(value, maxDepth = 6, depth = 0, seen = new Set()) {
  if (depth > maxDepth || value == null) return "";
  if (typeof value === "string") return atSaMeaningful(value);
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = atSaFirstText(item, maxDepth, depth + 1, seen);
      if (text) return text;
    }
    return "";
  }

  for (const key of ["value", "text", "content", "summary", "description", "label", "name"]) {
    if (!Object.hasOwn(value, key)) continue;
    const text = atSaFirstText(value[key], maxDepth, depth + 1, seen);
    if (text) return text;
  }

  for (const child of Object.values(value)) {
    const text = atSaFirstText(child, maxDepth, depth + 1, seen);
    if (text) return text;
  }
  return "";
}

function atSaFindMatchingText(root, patterns, maxDepth = 9) {
  const matches = [];
  const seen = new Set();
  const visit = (value, path = [], depth = 0) => {
    if (depth > maxDepth || value == null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, String(index)], depth + 1));
      return;
    }

    for (const [key, raw] of Object.entries(value)) {
      const lower = String(key).toLowerCase();
      const matchIndex = patterns.findIndex((pattern) => pattern.test(lower));
      if (matchIndex >= 0) {
        const text = atSaFirstText(raw);
        if (text) matches.push({ key, path: [...path, key], value: text, priority: matchIndex });
      }
      if (raw && typeof raw === "object") visit(raw, [...path, key], depth + 1);
    }
  };
  visit(root);
  return matches.sort((a, b) => a.priority - b.priority || a.path.length - b.path.length);
}

function atSaHarvestNarrativeStrings(root, maxDepth = 10) {
  const matches = [];
  const seenObjects = new Set();
  const seenText = new Set();
  const blockedPath = /(?:img|image|icon|uuid|folder|ownership|sort|sourceid|sourcetype|automation|name|label|slug|key|path|version|type)$/i;
  const referencePath = /reference|citation|source.*note|source.*reference/i;

  const visit = (value, path = [], depth = 0) => {
    if (depth > maxDepth || value == null) return;
    if (typeof value === "string") {
      const plain = atSaPlain(value);
      if (!plain || plain.length < 24 || plain.length > 4000) return;
      const pathText = path.join(".");
      if (blockedPath.test(pathText) && !referencePath.test(pathText)) return;
      if (!/[A-Za-zÅÄÖåäö]/.test(plain) || !/\s/.test(plain)) return;
      if (!/[.!?)]/.test(plain) && plain.split(/\s+/).length < 6) return;
      const key = plain.toLowerCase();
      if (seenText.has(key)) return;
      seenText.add(key);
      const score = referencePath.test(pathText) ? 60 : 20 - Math.min(path.length, 10);
      matches.push({ key: path.at(-1) || "text", path, value, priority: score });
      return;
    }
    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, String(index)], depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key], depth + 1);
  };

  visit(root);
  return matches.sort((a, b) => a.priority - b.priority || b.value.length - a.value.length);
}

function atSaUniqueTexts(matches, limit = 4) {
  const output = [];
  const seen = new Set();
  for (const match of matches) {
    const plain = atSaPlain(match.value);
    if (!plain) continue;
    const key = plain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(match.value);
    if (output.length >= limit) break;
  }
  return output;
}

function atSaRegister(id, adapter) {
  const key = String(id || "").trim();
  if (!key || !adapter || typeof adapter !== "object") throw new Error("Tome system adapters require an id and adapter object.");
  ATSA_REGISTRY.set(key, Object.freeze({ ...adapter, id: key }));
  return key;
}

function atSaMatchingAdapters(source) {
  const systemId = String(game.system?.id || "");
  return [...ATSA_REGISTRY.values()].filter((adapter) => {
    try {
      if (typeof adapter.matches === "function") return adapter.matches({ source, systemId, game });
      return String(adapter.systemId || "") === systemId;
    } catch (error) {
      console.warn(`Adventurer's Tome | Adapter ${adapter.id} match failed`, error);
      return false;
    }
  });
}

async function atSaEnrich(source) {
  const merged = { bodyHtml: "", summary: "", facts: [] };
  for (const adapter of atSaMatchingAdapters(source)) {
    if (typeof adapter.enrich !== "function") continue;
    try {
      const result = await adapter.enrich({ source, systemId: game.system?.id || "", game });
      if (!result || typeof result !== "object") continue;
      if (!merged.bodyHtml && String(result.bodyHtml || "").trim()) merged.bodyHtml = String(result.bodyHtml);
      if (!merged.summary && String(result.summary || "").trim()) merged.summary = String(result.summary);
      if (Array.isArray(result.facts)) merged.facts.push(...result.facts);
    } catch (error) {
      console.warn(`Adventurer's Tome | Adapter ${adapter.id} enrichment failed`, error);
    }
  }
  return merged;
}

globalThis.AdventurersTomeSystemAdapters = Object.freeze({
  register: atSaRegister,
  enrich: atSaEnrich,
  list: () => [...ATSA_REGISTRY.keys()]
});

// Optional Genesys adapter. This contains no Genesys classes or imports and only
// activates when the current Foundry system identifies itself as genesys-vtt.
// Tome Core remains fully functional when Genesys is absent.
atSaRegister("genesys-vtt-core", {
  systemId: "genesys-vtt",
  matches: ({ source, systemId }) => systemId === "genesys-vtt" && ["Item", "Actor"].includes(String(source?.documentName || "")),
  enrich: ({ source }) => {
    const documentData = source?.toObject?.() || {};
    const system = source?.system && typeof source.system === "object" ? source.system : {};
    const searchable = { system, flags: documentData.flags || {}, document: documentData };

    const mainMatches = atSaFindMatchingText(searchable, [
      /^rulessummary$/i,
      /^rulesummary$/i,
      /rules.*summary/i,
      /^summary$/i,
      /description/i,
      /^rules$/i,
      /effect.*text/i,
      /^effect$/i,
      /^notes$/i,
      /talent.*text/i,
      /ability.*text/i
    ]);

    const referenceMatches = atSaFindMatchingText(searchable, [
      /reference/i,
      /citation/i,
      /source.*note/i,
      /source.*reference/i
    ]);

    let mainTexts = atSaUniqueTexts(mainMatches, 3);
    if (!mainTexts.length) {
      const harvested = atSaHarvestNarrativeStrings(searchable)
        .filter((match) => !/reference|citation/i.test(match.path.join(".")));
      mainTexts = atSaUniqueTexts(harvested, 3);
    }

    const referenceTexts = atSaUniqueTexts(referenceMatches, 2)
      .filter((value) => !mainTexts.some((main) => atSaPlain(main).toLowerCase() === atSaPlain(value).toLowerCase()));

    const bodyParts = [];
    for (const text of mainTexts) {
      bodyParts.push(/<\/?[a-z][\s\S]*>/i.test(text) ? text : `<p>${atSaEscape(text)}</p>`);
    }
    for (const text of referenceTexts) {
      const plain = atSaPlain(text);
      const label = /^reference\s*:/i.test(plain) ? plain : `Reference: ${plain}`;
      bodyParts.push(`<p><em>${atSaEscape(label)}</em></p>`);
    }

    const summary = mainTexts.length ? atSaPlain(mainTexts[0]).slice(0, 360) : "";
    return { bodyHtml: bodyParts.join(""), summary, facts: [] };
  }
});
