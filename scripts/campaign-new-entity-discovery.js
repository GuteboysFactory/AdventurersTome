const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-new-entity-discovery";
const VERSION = 7;

const BANDS = Object.freeze({
  HIGH:"high-confidence",
  REVIEW:"review",
  WEAK:"weak",
  SUPPRESSED:"suppressed"
});

const CONNECTORS = new Set(globalThis.AdventurersTomeLanguage.words("CONNECTORS"));
const LEADING_ARTICLES = new Set(globalThis.AdventurersTomeLanguage.words("LEADING_ARTICLES"));
const LEADING_CONTEXT_WORDS = new Set(globalThis.AdventurersTomeLanguage.words("LEADING_CONTEXT_WORDS"));
const COMMON_SINGLETONS = new Set(globalThis.AdventurersTomeLanguage.words("COMMON_SINGLETONS"));

const CHARACTER_TITLES = new Set(globalThis.AdventurersTomeLanguage.words("CHARACTER_TITLES"));

const LOCATION_SUFFIXES = new Set(globalThis.AdventurersTomeLanguage.words("LOCATION_SUFFIXES"));

const FACTION_SUFFIXES = new Set(globalThis.AdventurersTomeLanguage.words("FACTION_SUFFIXES"));

const ITEM_SUFFIXES = new Set(globalThis.AdventurersTomeLanguage.words("ITEM_SUFFIXES"));

const LORE_SUFFIXES = new Set(globalThis.AdventurersTomeLanguage.words("LORE_SUFFIXES"));

let lastSnapshot = null;
let lastNotifiedContent = null;
let scanTimer = null;

const stats = {
  scans:0,
  sources:0,
  pages:0,
  rawCandidates:0,
  knownFiltered:0,
  commonFiltered:0,
  precisionFiltered:0,
  nlpBoundaryRefined:0,
  aliasMerged:0,
  subsumed:0,
  candidates:0,
  highConfidence:0,
  review:0,
  weak:0,
  learningSuppressed:0,
  learningSourceIgnored:0,
  learningConfirmed:0,
  learningLinked:0,
  failures:0,
  lastError:""
};

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripPossessive(value) {
  return clean(value).replace(/[’']s$/iu, "");
}

function canObserve(document, user = game.user) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  try {
    if (typeof document.testUserPermission === "function") {
      return document.testUserPermission(user, "OBSERVER") === true;
    }
  } catch (_error) {}
  return Boolean(document.visible);
}

function folderNames(folder) {
  const names = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(clean(current.name));
    const parentId = clean(current.folder?.id ?? current.folder);
    current = parentId ? game.folders?.get(parentId) || null : null;
  }
  return names;
}

function journalKind(journal) {
  if (!journal) return "";
  const flagged = clean(journal.getFlag?.(MODULE_ID, "type")).toLowerCase();
  if (flagged === "session" || flagged === "sessions") return "session";
  if (flagged === "quest" || flagged === "quests") return "quest";
  const path = folderNames(journal.folder || game.folders?.get(clean(journal.folder?.id ?? journal.folder)))
    .map((name) => name.toLowerCase());
  if (path.includes("sessions")) return "session";
  if (path.includes("quests")) return "quest";
  return "";
}

function campaignSources(user = game.user) {
  return [...(game.journal?.contents ?? [])]
    .filter((journal) => canObserve(journal, user))
    .map((journal) => ({ journal, kind:journalKind(journal) }))
    .filter((row) => row.kind === "session" || row.kind === "quest")
    .sort((a, b) => a.journal.name.localeCompare(b.journal.name, game.i18n?.lang, { numeric:true }));
}

function stripSecrets(html, user = game.user) {
  if (user?.isGM) return String(html ?? "");
  const host = document.createElement("div");
  host.innerHTML = String(html ?? "");
  host.querySelectorAll(".secret, [data-secret='true'], section.secret").forEach((node) => node.remove());
  return host.innerHTML;
}

function removeFoundryInlineRefs(value) {
  return String(value ?? "")
    .replace(/@UUID\[[^\]]+\](?:\{[^}]+\})?/gi, " ")
    .replace(/@(Actor|Item|JournalEntry|Scene)\[[^\]]+\](?:\{[^}]+\})?/gi, " ");
}

function plainText(html) {
  const host = document.createElement("div");
  host.innerHTML = String(html ?? "");
  return clean(host.textContent || host.innerText || "").replace(/\s+/g, " ");
}
function referenceSource(html) {
  const host=document.createElement('div');
  host.innerHTML=String(html??'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/giu,'\n');
  return clean(host.textContent||host.innerText||'');
}

function discoveryApi() {
  return game.modules.get(MODULE_ID)?.api?.discovery || null;
}

function mentionDiscoveryApi() {
  return game.modules.get(MODULE_ID)?.api?.campaignMentionDiscovery || null;
}

function nlpProviderApi() {
  return game.modules.get(MODULE_ID)?.api?.nlpProvider || null;
}

function reviewLearningApi() {
  return game.modules.get(MODULE_ID)?.api?.campaignReviewLearning || null;
}

function properToken(value) {
  const token = stripPossessive(value);
  const first = [...token].find((char) => /\p{L}/u.test(char)) || "";
  if (!first) return false;
  return first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase();
}

function tokenize(text) {
  const rows = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
  let match;
  while ((match = re.exec(String(text ?? ""))) !== null) {
    rows.push({
      raw:match[0],
      clean:stripPossessive(match[0]),
      normalized:normalizeText(stripPossessive(match[0])),
      start:match.index,
      end:match.index + match[0].length
    });
  }
  return rows;
}

function stripLeadingContext(tokens) {
  const out = [...tokens];

  while (out.length > 1 && LEADING_CONTEXT_WORDS.has(out[0].normalized)) {
    out.shift();
  }

  while (out.length && LEADING_ARTICLES.has(out[0].normalized)) {
    out.shift();
  }

  return out;
}

function candidateRuns(text, knownIndex = {}) {
  const tokens = tokenize(text);
  const rows = [];

  for (let i = 0; i < tokens.length; i += 1) {
    if (!properToken(tokens[i].clean)) continue;

    const run = [tokens[i]];
    let lastEnd = tokens[i].end;

    for (let j = i + 1; j < tokens.length && run.length < 9; j += 1) {
      const gap = String(text).slice(lastEnd, tokens[j].start);
      if (!/^\s+$/u.test(gap) && !(gap.match(/^\.\s+$/u) && CHARACTER_TITLES.has(run.at(-1).normalized))) break;

      const normalized = tokens[j].normalized;
      // A conjunction can belong to a named establishment, but must not
      // combine a party enumeration such as Baran and Citronimus.
      const establishmentTail = tokens.slice(j + 1, j + 5).findIndex((token, offset, tail) =>
        ["inn","tavern","hotel","vardshus","vardshuset"].includes(token.normalized)
        && tail.slice(0, offset + 1).every((part, k) => (properToken(part.clean) || k === offset)
          && /^\s+$/u.test(String(text).slice(k ? tail[k-1].end : tokens[j].end, part.start))));
      const allowed = properToken(tokens[j].clean) || CONNECTORS.has(normalized)
        || (["and","och"].includes(normalized) && establishmentTail >= 0)
        || ((ITEM_SUFFIXES.has(normalized) || FACTION_SUFFIXES.has(normalized) || globalThis.AdventurersTomeLanguage.documentHead(tokens[j].clean)) && /(?:s|[’']s)$/iu.test(run[0].raw))
        || normalized === "militia";
      if (!allowed) break;

      run.push(tokens[j]);
      lastEnd = tokens[j].end;
    }

    const trimmed = stripLeadingContext(run);
    while (trimmed.length && CONNECTORS.has(trimmed.at(-1).normalized)) trimmed.pop();
    if (!trimmed.length) continue;

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    const display = String(text).slice(first.start, last.end).replace(/[’']s$/iu, "");

    const provider = nlpProviderApi();
    const refinement = provider?.refineBoundary?.(display) || null;
    const refinedText = clean(refinement?.text || display);
    const relativeStart = refinement?.changed ? display.indexOf(refinedText) : 0;
    const safeRelativeStart = relativeStart >= 0 ? relativeStart : 0;
    const candidateText = refinedText || display;
    const normalized = normalizeText(candidateText);
    if (!normalized) continue;

    if (refinement?.changed) stats.nlpBoundaryRefined += 1;

    rows.push({
      text:candidateText,
      normalized,
      start:first.start + safeRelativeStart,
      end:first.start + safeRelativeStart + candidateText.length,
      tokenCount:wordParts(candidateText).length,
      nlp:{
        provider:clean(refinement?.provider),
        providerVersion:clean(refinement?.providerVersion),
        changed:Boolean(refinement?.changed),
        signals:clone(refinement?.signals || [])
      }
    });

    i += Math.max(0, run.length - 1);
  }

  // A Swedish possessive is evidence for a previously named base, never a
  // reason to remove the final s from arbitrary names such as Jonas or Vis.
  for (const row of rows) {
    if (row.tokenCount !== 1 || !/s$/u.test(row.text)) continue;
    const base=row.text.slice(0,-1),normalized=normalizeText(base);
    if (!/^(?:\s+)(?:södra|norra|östra|västra|port|torg|väg|centrum)(?![\p{L}\p{N}])/iu.test(String(text).slice(row.end))) continue;
    if (!rows.some(other=>other.normalized===normalized) && !knownIndex.names?.has(normalized)) continue;
    row.text=base;row.normalized=normalized;row.end-=1;
  }
  return rows;
}

function knownIdentityIndex(discoverySnapshot, mentionSnapshot) {
  const names = new Set();
  const singleAliases = new Set();

  for (const entity of discoverySnapshot?.entities || []) {
    const name = normalizeText(entity?.name);
    if (!name) continue;
    names.add(name);
    const parts = name.split(" ").filter(Boolean);
    if (parts.length > 1) {
      singleAliases.add(parts[0]);
      singleAliases.add(parts[parts.length - 1]);
    }
  }

  for (const mention of mentionSnapshot?.mentions || []) {
    const name = normalizeText(mention?.text);
    if (name) names.add(name);
  }

  return { names, singleAliases, entities:discoverySnapshot?.entities || [] };
}

function sourceContext(text, start, end, radius = 105) {
  const left = Math.max(0, Number(start || 0) - radius);
  const right = Math.min(String(text ?? "").length, Number(end || 0) + radius);
  return String(text ?? "").slice(left, right);
}

function wordParts(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function scoreClassification(text, context, occurrence = {}) {
  const phrase = normalizeText(text);
  const parts = wordParts(text);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const ctx = normalizeText(context);
  const anchored = Number.isFinite(occurrence.contextOffset);
  const beforeName = anchored ? normalizeText(String(context).slice(0, occurrence.contextOffset)) : ctx.slice(0, ctx.indexOf(phrase)).trim();
  const rawAfter = Number.isFinite(occurrence.contextOffset) ? String(context).slice(occurrence.contextOffset + text.length) : String(context).slice(String(context).indexOf(text)+text.length);
  // Require an attached role, not the next named speaker ("According to X,
  // Captain Y ..."). Modifiers such as former do not truncate the person's name.
  const personRole = globalThis.AdventurersTomeLanguage.anyPattern("personRole").test(rawAfter)
    || globalThis.AdventurersTomeLanguage.roleEvidence(context,[text]).length > 0;
  const documentRole = globalThis.AdventurersTomeLanguage.anyPattern("documentRole").test(beforeName);
  // Motion/residence attached to this occurrence is place evidence. A generic
  // "in/from/near" elsewhere (or "left Gunther") is not enough.
  const placeRole = globalThis.AdventurersTomeLanguage.anyPattern("placeRole").test(beforeName);

  const scores = {
    character:0,
    location:0,
    faction:0,
    item:0,
    lore:0
  };
  const signals = {
    character:[],
    location:[],
    faction:[],
    item:[],
    lore:[]
  };

  const add = (kind, value, signal) => {
    scores[kind] += value;
    signals[kind].push(signal);
  };

  if (CHARACTER_TITLES.has(first)) add("character", 0.72, "character-title");
  if (LOCATION_SUFFIXES.has(last)) add("location", 0.68, "location-suffix");
  if (FACTION_SUFFIXES.has(last)) add("faction", 0.56, "faction-suffix");
  if (globalThis.AdventurersTomeLanguage.anyPattern("factionPrefix").test(phrase)) add("faction", 0.82, "faction-name-prefix");
  if (ITEM_SUFFIXES.has(last) || parts.length>1 && globalThis.AdventurersTomeLanguage.documentHead(last)) add("item", 0.68, "item-suffix");
  if (LORE_SUFFIXES.has(last)) add("lore", 0.72, "lore-suffix");

  if (globalThis.AdventurersTomeLanguage.anyPattern("characterContext").test(ctx)) {
    add("character", 0.28, "character-context");
  }
  if (globalThis.AdventurersTomeLanguage.anyPattern("locationContext").test(ctx)) {
    add("location", 0.22, "location-context");
  }
  if (globalThis.AdventurersTomeLanguage.anyPattern("factionContext").test(ctx)) {
    add("faction", 0.52, "faction-context");
  }
  if (globalThis.AdventurersTomeLanguage.anyPattern("itemContext").test(ctx)) {
    add("item", 0.30, "item-context");
  }
  if (globalThis.AdventurersTomeLanguage.anyPattern("loreContext").test(ctx)) {
    add("lore", 0.32, "lore-context");
  }

  if (globalThis.AdventurersTomeLanguage.anyPattern("locationLexeme").test(phrase)) add("location", 0.18, "location-lexeme");
  if (globalThis.AdventurersTomeLanguage.anyPattern("loreLexeme").test(phrase)) add("lore", 0.18, "lore-lexeme");
  if (globalThis.AdventurersTomeLanguage.anyPattern("itemLexeme").test(phrase)) add("item", 0.18, "item-lexeme");

  // A role immediately attached to this name outweighs incidental vocabulary
  // elsewhere in the context (e.g. the surname Vale beside a river).
  if (personRole) {
    scores.character = 0.99;
    scores.location = scores.faction = scores.item = scores.lore = 0;
    signals.character.push("person-role-apposition");
  }
  if(documentRole && !personRole && !CHARACTER_TITLES.has(first)) {
    scores.item=0.99;scores.character=scores.location=scores.faction=scores.lore=0;
    signals.item.push("document-title-source-role");
  }
  if (LOCATION_SUFFIXES.has(last) && last !== "watch" && !personRole) {
    scores.location = Math.max(0.9, scores.location);
    scores.character = Math.min(0.28, scores.character);
  }
  if (signals.faction.includes("faction-name-prefix")) {
    scores.faction = 0.99;
    scores.item = scores.location = scores.character = scores.lore = 0;
  }
  if (placeRole && !personRole && !CHARACTER_TITLES.has(first)
    && !signals.faction.includes("faction-name-prefix") && !ITEM_SUFFIXES.has(last) && !FACTION_SUFFIXES.has(last)) {
    scores.location = 0.9;
    scores.character = scores.faction = scores.item = scores.lore = 0;
    signals.location.push("location-source-role");
  }

  const ordered = Object.entries(scores)
    .map(([kind, score]) => ({
      kind,
      score:Math.min(0.99, Math.round(score * 100) / 100),
      signals:signals[kind]
    }))
    .sort((a, b) => b.score - a.score);

  const best = ordered[0];
  return {
    kind:best.score >= 0.45 ? best.kind : "unknown",
    confidence:best.score,
    signals:[...best.signals],
    alternatives:ordered.slice(1, 4).filter((row) => row.score > 0)
  };
}

function detectionAssessment(row, occurrenceCount) {
  let score = row.tokenCount > 1 ? 0.72 : 0.56;
  const signals = [row.tokenCount > 1 ? "multi-token-proper-name-shape" : "single-token-proper-name-shape"];

  if (occurrenceCount > 1) {
    score += Math.min(0.15, (occurrenceCount - 1) * 0.05);
    signals.push("repeated-mention");
  }

  if (row.classification.confidence >= 0.68) {
    score += 0.14;
    signals.push("strong-type-context");
  } else if (row.classification.confidence >= 0.45) {
    score += 0.07;
    signals.push("type-context");
  }

  score = Math.min(0.99, Math.round(score * 100) / 100);
  const band = score >= 0.82 ? BANDS.HIGH : score >= 0.68 ? BANDS.REVIEW : BANDS.WEAK;
  return { score, band, signals };
}

function mergeAliases(rows, knownIndex) {
  // Place-name prefixes are distinct identities: Blackbridge is not an alias
  // for Blackbridge Watch. Only merge unique personal short names.
  const multi = rows.filter((row) => row.tokenCount > 1
    && (scoreClassification(row.text, row.context, row).kind === "character"
      || (knownIndex?.entities || []).some(entity=>normalizeText(entity.name)===row.normalized
        && ['character','contact','npc'].includes(entity.kind))));
  const aliases = new Map();

  for (const row of multi) {
    const parts = row.normalized.split(" ").filter(Boolean);
    for (const alias of [parts[CHARACTER_TITLES.has(parts[0]) ? 1 : 0]]) {
      if (!alias || alias.length < 3) continue;
      if (!aliases.has(alias)) aliases.set(alias, new Set());
      aliases.get(alias).add(row.normalized);
    }
  }

  const out = [];
  for (const row of rows) {
    if (row.tokenCount !== 1) {
      out.push(row);
      continue;
    }
    const targets = [...(aliases.get(row.normalized) || [])];
    const established = targets.filter((name)=>rows.some((full)=>full.normalized === name && full.start < row.start
      && full.sourceJournalUuid === row.sourceJournalUuid && full.sourcePageUuid === row.sourcePageUuid));
    if (established.length > 1) row.ambiguousSourceReference = true;
    const localTarget = established.length === 1 ? established[0] : targets[0];
    const target = rows.find((candidate) => candidate.normalized === localTarget);
    const authority = (entity) => entity.analysisAuthority || game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation?.identityFor?.(entity)?.authorityUuid || entity.canonicalUuid;
    const fullAuthorities = new Set((knownIndex?.entities || []).filter((entity) => normalizeText(entity.name) === target?.normalized).map(authority));
    const independentKnownName = (knownIndex?.entities || []).some((entity) => normalizeText(entity.name) === row.normalized && !fullAuthorities.has(authority(entity)));
    const competingFullName = (knownIndex?.entities || []).some((entity) => {
      const parts=wordParts(entity.name),first=parts[CHARACTER_TITLES.has(parts[0])?1:0];
      return parts.length>1 && first===row.normalized && normalizeText(globalThis.AdventurersTomeLanguage.nameForm(entity.name).text)!==normalizeText(globalThis.AdventurersTomeLanguage.nameForm(target?.text).text)
        && !fullAuthorities.has(authority(entity));
    });
    if(targets.length && (competingFullName || independentKnownName))row.ambiguousSourceReference=true;
    if (established.length === 1 && target.start < row.start && !independentKnownName && !competingFullName
      && target.sourceJournalUuid === row.sourceJournalUuid && target.sourcePageUuid === row.sourcePageUuid) {
      row.aliasOf = localTarget;
      row.consolidationReason = "UNIQUE_SOURCE_FIRST_NAME_REFERENCE";
      stats.aliasMerged += 1;
    } else {
      out.push(row);
    }
  }

  return { rows:out, aliases };
}

function aggregateCandidates(rawRows, knownIndex) {
  const preliminary = rawRows.filter((row) => {
    if (!row.normalized) return false;

    // Existing names and possible aliases must reach resolution, too.

    if (row.tokenCount === 1 && COMMON_SINGLETONS.has(row.normalized) && !knownIndex.names.has(row.normalized)) {
      stats.commonFiltered += 1;
      return false;
    }

    return true;
  });

  // Subsumption requires a physical contained span and a complete name with
  // attached type evidence. Text length alone never establishes identity.
  for (const row of preliminary) {
    const stronger = preliminary.filter((other) => other !== row
      && other.sourcePageUuid === row.sourcePageUuid && other.sourceJournalUuid === row.sourceJournalUuid
      && other.start <= row.start && other.end >= row.end
      && other.tokenCount > row.tokenCount
      && ` ${other.normalized} `.includes(` ${row.normalized} `)
      && scoreClassification(other.text, other.context, other).confidence >= 0.68)
      .sort((a,b) => b.tokenCount - a.tokenCount)[0];
    if (stronger && (!row.canonicalUuid || row.canonicalUuid === stronger.canonicalUuid)) {
      row.aliasOf = stronger.normalized;
      row.consolidationReason = "SUBSUMED_BY_STRONGER_MENTION";
      row.consolidatedStart = stronger.start;
      row.consolidatedEnd = stronger.end;
      stats.subsumed += 1;
    }
  }
  mergeAliases(preliminary.filter((row) => !row.aliasOf), knownIndex);
  const byKey = new Map();

  for (const row of preliminary) {
    const normalized = row.aliasOf || row.normalized;
    if (!byKey.has(normalized)) {
      const canonical = preliminary.find((candidate) => candidate.normalized === normalized) || row;
      byKey.set(normalized, {
        normalized,
        text:canonical.text,
        tokenCount:canonical.tokenCount,
        occurrences:[]
      });
    }
    byKey.get(normalized).occurrences.push(row);
    if (row.ambiguousSourceReference) byKey.get(normalized).ambiguousSourceReference = true;
  }

  return [...byKey.values()];
}

function identityBriefing(grouped, text, references=[]) {
  const names = new Set(grouped.occurrences.map((row) => normalizeText(row.text)));
  const sentences = globalThis.AdventurersTomeLanguage.sentences(text).map(hit=>hit[0]);
  let sameSubject = false;
  const relevant = sentences.map(clean).filter((sentence) => {
    const plain = normalizeText(sentence);
    const normalized = ` ${plain} `;
    const pronounContinuation = sameSubject && globalThis.AdventurersTomeLanguage.anyPattern("briefingPronoun").test(plain);
    sameSubject = [...names].some((name) => plain.startsWith(`${name} `)) || pronounContinuation;
    return pronounContinuation || [...names].some((name) => normalized.includes(` ${name} `));
  });
  const starts=grouped.occurrences.every(row=>Number.isFinite(row.start)) ? new Set(grouped.occurrences.map(row=>row.start)) : null;
  const roleEvidence=globalThis.AdventurersTomeLanguage.roleEvidence(text,grouped.occurrences.map(row=>row.text),starts,references);
  const currentRoles=[...new Set(roleEvidence.filter(row=>row.status==='current').map(row=>row.role))];
  const historicalRoles=[...new Set(roleEvidence.filter(row=>row.status==='historical').map(row=>row.role))];
  // Keep the legacy display usable when only an explicitly former role exists.
  const roles=currentRoles.length?currentRoles:historicalRoles;
  // These are attributed source excerpts, not asserted canonical relations.
  const briefItems = [];
  if (roles.length) briefItems.push({ label:"Role / profession", value:roles.join(" / "), icon:"fa-briefcase", temporalStatus:currentRoles.length?'current':'historical' });
  for (const [label, pattern, icon] of [
    ["Faction / organization", globalThis.AdventurersTomeLanguage.anyPattern("briefingFaction"), "fa-flag"],
    ["Location", globalThis.AdventurersTomeLanguage.anyPattern("briefingLocation"), "fa-location-dot"],
    ["Relations (source)", globalThis.AdventurersTomeLanguage.anyPattern("briefingRelations"), "fa-people-arrows"]
  ]) {
    const excerpts = relevant.filter((sentence) => pattern.test(normalizeText(sentence))).slice(0, 3);
    if (excerpts.length) briefItems.push({ label, value:excerpts.join(" "), icon });
  }
  if(historicalRoles.length && currentRoles.length)briefItems.push({label:'Historical role',value:historicalRoles.join(' / '),icon:'fa-clock-rotate-left',temporalStatus:'historical'});
  return { roles, currentRoles, historicalRoles, roleEvidence, briefItems, excerpts:relevant, sourceDerived:true };
}

// The same pure page analysis runs in the worker and in compatibility tests.
function analyzePage({text,referenceText:referenceTextInput,knownIndex,journal,page,kind}) {
  const before={...stats};
  const diagnostics=[],groups=[];
      const raw = candidateRuns(text,knownIndex).map((row) => ({
        ...row,
        context:sourceContext(text, row.start, row.end),
        contextOffset:row.start - Math.max(0, row.start - 105),
        sourceKind:kind,
        sourceJournalUuid:journal.uuid,
        sourcePageUuid:page.uuid,
        sourceName:journal.name,
        pageName:page.name
      }));
      const referenceNames=raw.filter(row=>!COMMON_SINGLETONS.has(row.normalized));
      const personNames=new Set(referenceNames.filter(row=>scoreClassification(row.text,row.context,row).kind==='character'
        || knownIndex.entities.some(entity=>normalizeText(entity.name)===row.normalized&&['character','contact','npc'].includes(entity.kind))).map(row=>row.text));
      // Legacy discovery offsets use collapsed whitespace. Analyse paragraphs
      // separately and map back only when both coordinate spaces agree.
      const referenceText=referenceTextInput;
      const toOffset=offset=>referenceText.slice(0,offset).replace(/\s+/gu,' ').trimStart().length;
      const references=referenceText.replace(/\s+/gu,' ')===text
        ? globalThis.AdventurersTomeLanguage.references(referenceText,referenceNames.map(row=>row.text))
          .filter(row=>personNames.has(row.resolved))
          .map(row=>({...row,start:toOffset(row.start),end:toOffset(row.end),antecedentStart:toOffset(row.antecedentStart)})) : [];

      stats.rawCandidates += raw.length;
      const aggregate = aggregateCandidates(raw, knownIndex);
      diagnostics.push(...raw.map((hit) => ({
        sourceJournalUuid:journal.uuid, sourcePageUuid:page.uuid,
        text:hit.text, start:hit.start, end:hit.end,
        status:hit.aliasOf ? hit.consolidationReason : COMMON_SINGLETONS.has(hit.normalized) ? "COMMON_GRAMMAR_TOKEN" : "FINAL_CANDIDATE",
        candidateNormalized:hit.aliasOf || hit.normalized,
        candidateId:COMMON_SINGLETONS.has(hit.normalized) ? "" : `unknown:${page.uuid}:${hit.aliasOf || hit.normalized}`
      })));

      for (const grouped of aggregate) {
        const occurrences = grouped.occurrences;
        if (!occurrences.length) continue;

        const typeVotes = occurrences.filter((row) => !row.aliasOf).map((row) => scoreClassification(row.text, row.context, row));
        const classification = typeVotes
          .sort((a, b) => b.confidence - a.confidence)[0] || { kind:"unknown", confidence:0, signals:[], alternatives:[] };

        const representative = {
          ...occurrences[0],
          text:grouped.text,
          normalized:grouped.normalized,
          tokenCount:grouped.tokenCount,
          classification
        };
        const occurrenceCount = new Set(occurrences.map((row) => `${row.consolidatedStart ?? row.start}:${row.consolidatedEnd ?? row.end}`)).size;
        const detection = detectionAssessment(representative, occurrenceCount);

        const disposition = detection.band === BANDS.HIGH && classification.confidence >= 0.45
          ? BANDS.HIGH
          : detection.band === BANDS.WEAK
            ? BANDS.WEAK
            : BANDS.REVIEW;

        groups.push({grouped,classification,detection,disposition,briefing:identityBriefing(grouped,text,references)});
      }
      const counters=Object.fromEntries(Object.entries(stats).filter(([,value])=>typeof value==='number').map(([key,value])=>[key,value-before[key]]));
      Object.assign(stats,before);
      return {groups,diagnostics,counters};
}
globalThis.AdventurersTomeAnalyzePage=analyzePage;

async function scan(options = {}) {
  const startupToken=globalThis.AdventurersTomeStartup?.begin("new-entity-discovery");
  try {
  globalThis.AdventurersTomeReviewDecision?.count("memory-refresh",options.sourceUuid ? "sourceScans" : "fullScans");
  globalThis.AdventurersTomeReviewDecision?.count("memory-refresh","analysisRuns");
  stats.scans += 1;
  stats.sources = 0;
  stats.pages = 0;
  stats.rawCandidates = 0;
  stats.knownFiltered = 0;
  stats.commonFiltered = 0;
  stats.precisionFiltered = 0;
  stats.nlpBoundaryRefined = 0;
  stats.aliasMerged = 0;
  stats.subsumed = 0;
  stats.candidates = 0;
  stats.highConfidence = 0;
  stats.review = 0;
  stats.weak = 0;
  stats.learningSuppressed = 0;
  stats.learningSourceIgnored = 0;
  stats.learningConfirmed = 0;
  stats.learningLinked = 0;

  const user = options.user || game.user;
  const discovery = discoveryApi();
  const mentionApi = mentionDiscoveryApi();
  if (!discovery || !mentionApi) throw new Error("Campaign Discovery or Semantic Mention Discovery is unavailable.");

  let discoverySnapshot = discovery.snapshot?.() || null;
  if (!discoverySnapshot || options.rescanDiscovery === true) {
    discoverySnapshot = await discovery.scan({
      includeCompendiums:true,
      user,
      context:{ reason:"new-entity-discovery" }
    });
  }

  let mentionSnapshot = mentionApi.snapshot?.() || null;
  if (!mentionSnapshot || options.rescanMentions === true) {
    mentionSnapshot = await mentionApi.scan({ user, rescanDiscovery:false });
  }

  const knownIndex = knownIdentityIndex(discoverySnapshot, mentionSnapshot);
  knownIndex.entities=knownIndex.entities.map(entity=>({name:entity.name,kind:entity.kind,canonicalUuid:entity.canonicalUuid,analysisAuthority:game.modules.get(MODULE_ID)?.api?.campaignIdentityReconciliation?.identityFor?.(entity)?.authorityUuid || entity.canonicalUuid}));
  const candidates = [];
  const suppressedCandidates = [];
  const diagnostics = [];

  for (const source of campaignSources(user).filter(source=>!options.sourceUuid || source.journal.uuid === options.sourceUuid)) {
    globalThis.AdventurersTomeReviewDecision?.count("memory-refresh","sourceVisits");
    const { journal, kind } = source;
    stats.sources += 1;

    const pages = [...(journal.pages?.contents ?? [])]
      .filter((page) => canObserve(page, user))
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

    for (const page of pages) {
      if (page?.text?.content === undefined) continue;
      stats.pages += 1;

      const safeHtml = stripSecrets(page.text.content, user);
      const text = plainText(removeFoundryInlineRefs(safeHtml));
      if (!text) continue;

      const payload={text,referenceText:referenceSource(removeFoundryInlineRefs(safeHtml)),knownIndex,journal:{uuid:journal.uuid,name:journal.name},page:{uuid:page.uuid,name:page.name},kind};
      const indexService=globalThis.AdventurersTomeIndex;
      const analysis=indexService && user?.isGM
        ? await indexService.analyzePage(payload,()=>analyzePage(payload)) : analyzePage(payload);
      diagnostics.push(...analysis.diagnostics);
      for(const [key,value] of Object.entries(analysis.counters || {}))stats[key]+=value;
      for (const {grouped,classification,detection,disposition,briefing} of analysis.groups) {
        const occurrences=grouped.occurrences;
        const learning = reviewLearningApi()?.decisionFor?.(grouped.text, { sourceUuid:journal.uuid }) || null;
        if (learning?.action === "suppressed") {
          suppressedCandidates.push({
            id:`learning-suppressed:${page.uuid}:${grouped.normalized}`,
            sourceKind:kind,
            sourceJournalUuid:journal.uuid,
            sourcePageUuid:page.uuid,
            sourceName:journal.name,
            pageName:page.name,
            text:grouped.text,
            normalized:grouped.normalized,
            mentionCount:occurrences.length,
            detection,
            classification,
            learning:clone(learning),
            reason:"gm-campaign-suppression",
            readOnly:true
          });
          stats.learningSuppressed += 1;
          // An explicit GM dismissal remains traceable in the outcome ledger.
        }
        if (learning?.action === "source-ignored") {
          suppressedCandidates.push({
            id:`learning-source-ignored:${page.uuid}:${grouped.normalized}`,
            sourceKind:kind,
            sourceJournalUuid:journal.uuid,
            sourcePageUuid:page.uuid,
            sourceName:journal.name,
            pageName:page.name,
            text:grouped.text,
            normalized:grouped.normalized,
            mentionCount:occurrences.length,
            detection,
            classification,
            learning:clone(learning),
            reason:"gm-source-ignore",
            readOnly:true
          });
          stats.learningSourceIgnored += 1;
          // Preserve the existing source-scoped dismissal, without losing evidence.
        }
        if (learning?.action === "confirmed") stats.learningConfirmed += 1;
        if (learning?.action === "linked") stats.learningLinked += 1;

        const row = {
          id:`unknown:${page.uuid}:${grouped.normalized}`,
          sourceKind:kind,
          sourceJournalUuid:journal.uuid,
          sourcePageUuid:page.uuid,
          sourceName:journal.name,
          pageName:page.name,
          text:grouped.text,
          normalized:grouped.normalized,
          ambiguousSourceReference:grouped.ambiguousSourceReference === true,
          mentionCount:occurrences.length,
          mentions:occurrences.map((occurrence) => ({
            text:occurrence.text,
            start:occurrence.start,
            end:occurrence.end,
            context:occurrence.context,
            nlp:clone(occurrence.nlp || null)
          })),
          detection,
          classification,
          identityBriefing:briefing,
          identity:{
            status:"no-existing-canonical-match",
            confidence:0,
            canonicalTarget:null
          },
          disposition,
          learning:clone(learning),
          createEligible:false,
          persistenceEligible:false,
          readOnly:true
        };

        candidates.push(row);
        stats.candidates += 1;
        if (disposition === BANDS.HIGH) stats.highConfidence += 1;
        else if (disposition === BANDS.REVIEW) stats.review += 1;
        else stats.weak += 1;
      }
    }
  }

  if(options.sourceUuid && lastSnapshot?.viewerUserId === clean(user?.id) && lastSnapshot?.viewerIsGM === Boolean(user?.isGM)) {
    candidates.push(...(lastSnapshot.candidates || []).filter(row=>row.sourceJournalUuid !== options.sourceUuid));
    suppressedCandidates.push(...(lastSnapshot.suppressedCandidates || []).filter(row=>row.sourceJournalUuid !== options.sourceUuid));
    diagnostics.push(...(lastSnapshot.diagnostics || []).filter(row=>row.sourceJournalUuid !== options.sourceUuid));
  }
  lastSnapshot = Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    generatedAt:Date.now(),
    viewerUserId:clean(user?.id),
    viewerIsGM:Boolean(user?.isGM),
    readOnly:true,
    writesPerformed:false,
    autoPersistence:false,
    sourceScope:["session","quest"],
    confidenceModel:"detection-type-and-identity-separated",
    candidates:clone(candidates),
    diagnostics:clone(diagnostics),
    suppressedCandidates:clone(suppressedCandidates),
    summary:{
      sources:stats.sources,
      pages:stats.pages,
      candidates:stats.candidates,
      highConfidence:stats.highConfidence,
      review:stats.review,
      weak:stats.weak,
      knownFiltered:stats.knownFiltered,
      commonFiltered:stats.commonFiltered,
      precisionFiltered:stats.precisionFiltered,
      nlpBoundaryRefined:stats.nlpBoundaryRefined,
      aliasMerged:stats.aliasMerged,
      subsumed:stats.subsumed,
      learningSuppressed:stats.learningSuppressed,
      learningSourceIgnored:stats.learningSourceIgnored,
      learningConfirmed:stats.learningConfirmed,
      learningLinked:stats.learningLinked
    }
  });

  const content=JSON.stringify([lastSnapshot.viewerUserId,lastSnapshot.viewerIsGM,lastSnapshot.candidates,lastSnapshot.suppressedCandidates,lastSnapshot.diagnostics]);
  if(!options.silent && content !== lastNotifiedContent) {
    lastNotifiedContent=content;
    Hooks.callAll("adventurersTomeNewEntityDiscoveryUpdated", clone(lastSnapshot.summary));
  }
  return clone(lastSnapshot);
  } finally {globalThis.AdventurersTomeStartup?.end(startupToken);}
}

function snapshot() {
  return clone(lastSnapshot);
}

function candidateForMention(row = {}) {
  if (row.mentionType === "explicit-link") return null;
  const pageUuid = row.sourcePageUuid || row.source?.pageUuid;
  const journalUuid = row.sourceJournalUuid || row.source?.uuid;
  const start = Number(row.start ?? row.source?.start);
  const end = Number(row.end ?? row.source?.end);
  const normalized = normalizeText(row.text);
  const matches = (lastSnapshot?.candidates || []).filter((candidate) => candidate.sourceJournalUuid === journalUuid
    && candidate.sourcePageUuid === pageUuid
    && candidate.mentions.some((mention) => (Number.isFinite(start) && Number.isFinite(end)
      && start >= mention.start && end <= mention.end && ` ${normalizeText(mention.text)} `.includes(` ${normalized} `))
      || (normalizeText(mention.text) === normalized && (!Number.isFinite(start) || mention.start === start))));
  return matches.length === 1 ? clone(matches[0]) : null;
}

function candidatesForSource(uuid) {
  const wanted = clean(uuid);
  return clone((lastSnapshot?.candidates || []).filter((row) =>
    row.sourceJournalUuid === wanted || row.sourcePageUuid === wanted
  ));
}

function suppressedForSource(uuid) {
  const wanted = clean(uuid);
  return clone((lastSnapshot?.suppressedCandidates || []).filter((row) =>
    row.sourceJournalUuid === wanted || row.sourcePageUuid === wanted
  ));
}

function audit() {
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0,
    hasSnapshot:Boolean(lastSnapshot),
    readOnly:true,
    writesPerformed:false,
    autoPersistence:false,
    sourceScope:["session","quest"],
    confidenceModel:"detection-type-and-identity-separated",
    policy:{
      knownCanonicalNamesFiltered:false,
      knownSingleTokenAliasesFiltered:false,
      leadingContextWordsTrimmed:true,
      questionAuxiliaryStartersTrimmed:true,
      localNlpBoundaryProvider:true,
      genericVerbCannotTrimFantasyName:true,
      fantasyLocationVocabulary:true,
      contextualFactionSemanticsStrengthened:true,
      gmReviewLearningApplied:true,
      explicitCampaignSuppressionApplied:true,
      sourceIgnoreApplied:true,
      confirmedCandidateMemoryApplied:true,
      linkedCandidateMemoryApplied:true,
      knownAliasRecheckedAfterBoundaryTrim:true,
      oneOffUnknownSingletonsSuppressed:false,
      longestProperNameRuns:true,
      repeatedMentionsBoostDetectionOnly:true,
      contextualTypeClassification:true,
      noEntityCreation:true,
      noCampaignLinkWrites:true
    },
    summary:clone(lastSnapshot?.summary || {}),
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  writesPerformed:false,
  autoPersistence:false,
  confidenceBands:Object.freeze({ ...BANDS }),
  scan,
  snapshot,
  restoreSnapshot:(value)=>{if(game.user?.isGM && value?.viewerUserId===String(game.user.id) && value?.viewerIsGM)lastSnapshot=clone(value);},
  candidatesForSource,
  candidateForMention,
  briefingFor:({text='',names=[]}={})=>game.user?.isGM ? clone(identityBriefing({occurrences:names.filter(Boolean).map(text=>({text}))},plainText(text))) : null,
  consolidate:(rows=[])=>clone(aggregateCandidates(clone(rows),knownIdentityIndex(discoveryApi()?.snapshot?.(),null))),
  suppressedForSource,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignNewEntityDiscovery = publicApi;
  return true;
}

function scheduleScan(reason = "lifecycle") {
  if(game.user?.isGM && globalThis.AdventurersTomeIndex?.request(reason)) return;
  if (globalThis.AdventurersTomeReviewDecision?.isActive?.() && ["known-mentions-updated","campaign-learning-updated","discovery-updated"].includes(reason)) return;
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    void scan({}).catch((error) => {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | New Entity Discovery failed safely", error, { reason });
    });
  }, 260);
}

Hooks.once("ready", () => {
  attach();
  scheduleScan("ready");
  console.info("Adventurer's Tome | New Entity Discovery v1 ready (read-only).");
});

Hooks.on("updateJournalEntry", (journal,changes={},options={}) => {
  if(options.adventurersTomeReviewDecision && Object.keys(changes).every(key=>key.startsWith("flags.adventurers-tome."))) return;
  const kind = journalKind(journal);
  if (kind === "session" || kind === "quest") scheduleScan("journal-updated");
});
Hooks.on("createJournalEntry", (journal) => {
  const kind = journalKind(journal);
  if (kind === "session" || kind === "quest") scheduleScan("journal-created");
});
Hooks.on("deleteJournalEntry", () => scheduleScan("journal-deleted"));
Hooks.on("updateJournalEntryPage", (page) => {
  const kind = journalKind(page?.parent || null);
  if (kind === "session" || kind === "quest") scheduleScan("page-updated");
});
Hooks.on("adventurersTomeSemanticMentionDiscoveryUpdated", () => scheduleScan("known-mentions-updated"));
Hooks.on("adventurersTomeCampaignLearningUpdated", () => scheduleScan("campaign-learning-updated"));
Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignNewEntityDiscovery !== publicApi) attach();
});
