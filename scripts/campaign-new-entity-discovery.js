const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-new-entity-discovery";
const VERSION = 6;

const BANDS = Object.freeze({
  HIGH:"high-confidence",
  REVIEW:"review",
  WEAK:"weak",
  SUPPRESSED:"suppressed"
});

const CONNECTORS = new Set(["of","the","de","da","del","van","von","af","av"]);
const LEADING_ARTICLES = new Set(["the","a","an","den","det","en","ett"]);
const LEADING_CONTEXT_WORDS = new Set([
  "before","after","during","behind","beside","beneath","above","near","on","in","at","from","to","toward","towards",
  "through","across","within","outside","inside","around","shortly","later","meanwhile","rather","according","with","without",
  "by","beyond","under","over",
  "is","are","was","were","did","does","do","has","have","had","can","could","would","should","might","must",
  "före","efter","under","bakom","bredvid","nära","på","i","från","till","mot","genom","över","med","utan",
  "ar","var","kan","ska","skall","har","hade","vill","bor"
]);
const COMMON_SINGLETONS = new Set([
  "the","a","an","and","but","or","before","after","during","according","near","on","in","at","from","to","toward","towards",
  "shortly","somewhere","meanwhile","later","then","when","while","there","here","this","that","these","those","he","she","they",
  "his","her","their","it","its","we","our","you","your","i","my","yes","no",
  "is","are","was","were","did","does","do","has","have","had","can","could","would","should","might","must",
  "den","det","en","ett","och","men","eller","före","efter","under","nära","på","i","från","till","mot","senare","där","här",
  "ar","var","kan","ska","skall","har","hade","vill","bor"
]);

const CHARACTER_TITLES = new Set([
  "brother","sister","captain","lord","lady","sir","dame","father","mother","master","mistress","doctor","dr","sergeant",
  "general","commander","king","queen","prince","princess","duke","duchess","baron","baroness","abbot","abbess"
]);

const LOCATION_SUFFIXES = new Set([
  "ford","pass","ruins","keep","marsh","pines","road","gate","tower","bridge","crossing","hollow","wood","woods","forest",
  "vale","valley","hill","hills","mount","mountain","mountains","river","lake","mere","moor","village","town","city","fort",
  "fortress","castle","cave","caves","mine","mines","isle","island","coast","harbor","harbour","bay","reach","watch",
  "abbey","temple","monastery","shrine","sanctuary","citadel","stronghold","manor","palace","camp","outpost","chapel"
]);

const FACTION_SUFFIXES = new Set([
  "company","order","guild","clan","tribe","hand","guard","guards","brotherhood","sisterhood","circle","council","host","legion",
  "army","cult","league","banner","wolves","riders","choir"
]);

const ITEM_SUFFIXES = new Set([
  "key","blade","sword","axe","bow","ring","crown","staff","wand","book","tome","map","stone","gem","amulet","relic","artifact",
  "shield","helm","horn","lantern","chalice","seal","token"
]);

const LORE_SUFFIXES = new Set([
  "oath","prophecy","legend","ritual","pact","curse","blessing","song","lay","tale","doctrine","creed","law","secret","accord"
]);

let lastSnapshot = null;
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

function candidateRuns(text) {
  const tokens = tokenize(text);
  const rows = [];

  for (let i = 0; i < tokens.length; i += 1) {
    if (!properToken(tokens[i].clean)) continue;

    const run = [tokens[i]];
    let lastEnd = tokens[i].end;

    for (let j = i + 1; j < tokens.length && run.length < 5; j += 1) {
      const gap = String(text).slice(lastEnd, tokens[j].start);
      if (!/^\s+$/u.test(gap)) break;

      const normalized = tokens[j].normalized;
      const allowed = properToken(tokens[j].clean) || CONNECTORS.has(normalized);
      if (!allowed) break;

      run.push(tokens[j]);
      lastEnd = tokens[j].end;
    }

    const trimmed = stripLeadingContext(run);
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

  return { names, singleAliases };
}

function sourceContext(text, start, end, radius = 105) {
  const left = Math.max(0, Number(start || 0) - radius);
  const right = Math.min(String(text ?? "").length, Number(end || 0) + radius);
  return String(text ?? "").slice(left, right);
}

function wordParts(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function scoreClassification(text, context) {
  const phrase = normalizeText(text);
  const parts = wordParts(text);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const ctx = normalizeText(context);

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
  if (ITEM_SUFFIXES.has(last)) add("item", 0.68, "item-suffix");
  if (LORE_SUFFIXES.has(last)) add("lore", 0.72, "lore-suffix");

  if (/\b(met|named|called|healer|officer|man|woman|person|scout|merchant|guide|captain|brother|sister)\b/u.test(ctx)) {
    add("character", 0.28, "character-context");
  }
  if (/\b(reached|arrived|entered|left|through|toward|towards|beneath|above|near|at|in|from|crossing|road|ruins|fortress|village|town|city)\b/u.test(ctx)) {
    add("location", 0.22, "location-context");
  }
  if (/\b(soldiers? of|members? of|mark of|servants? of|warriors? of|agents? of|followers? of|faction|guild|clan|tribe|order|company|cult)\b/u.test(ctx)) {
    add("faction", 0.52, "faction-context");
  }
  if (/\b(carried|carry|object|artifact|weapon|key|sword|ring|book|map|relic|item|open|unlock)\b/u.test(ctx)) {
    add("item", 0.30, "item-context");
  }
  if (/\b(oath|legend|story|tale|prophecy|ritual|pact|curse|creed|secret|symbol|known as|remembered|forgotten)\b/u.test(ctx)) {
    add("lore", 0.32, "lore-context");
  }

  if (phrase.includes("ruins")) add("location", 0.18, "location-lexeme");
  if (phrase.includes("oath")) add("lore", 0.18, "lore-lexeme");
  if (phrase.includes("key")) add("item", 0.18, "item-lexeme");

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

function mergeAliases(rows) {
  const multi = rows.filter((row) => row.tokenCount > 1);
  const aliases = new Map();

  for (const row of multi) {
    const parts = row.normalized.split(" ").filter(Boolean);
    for (const alias of [parts[0], parts[parts.length - 1]]) {
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
    if (targets.length === 1) {
      row.aliasOf = targets[0];
      stats.aliasMerged += 1;
    } else {
      out.push(row);
    }
  }

  return { rows:out, aliases };
}

function aggregateCandidates(rawRows, knownIndex) {
  const preliminary = rawRows.filter((row) => {
    if (!row.normalized || row.normalized.length < 3) return false;

    if (knownIndex.names.has(row.normalized)) {
      stats.knownFiltered += 1;
      return false;
    }

    if (row.tokenCount === 1 && knownIndex.singleAliases.has(row.normalized)) {
      stats.knownFiltered += 1;
      return false;
    }

    if (row.tokenCount === 1 && COMMON_SINGLETONS.has(row.normalized)) {
      stats.commonFiltered += 1;
      return false;
    }

    return true;
  });

  const merged = mergeAliases(preliminary);
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
  }

  return [...byKey.values()];
}

async function scan(options = {}) {
  stats.scans += 1;
  stats.sources = 0;
  stats.pages = 0;
  stats.rawCandidates = 0;
  stats.knownFiltered = 0;
  stats.commonFiltered = 0;
  stats.precisionFiltered = 0;
  stats.nlpBoundaryRefined = 0;
  stats.aliasMerged = 0;
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
  const candidates = [];
  const suppressedCandidates = [];

  for (const source of campaignSources(user)) {
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

      const raw = candidateRuns(text).map((row) => ({
        ...row,
        context:sourceContext(text, row.start, row.end),
        sourceKind:kind,
        sourceJournalUuid:journal.uuid,
        sourcePageUuid:page.uuid,
        sourceName:journal.name,
        pageName:page.name
      }));

      stats.rawCandidates += raw.length;
      const aggregate = aggregateCandidates(raw, knownIndex);

      for (const grouped of aggregate) {
        const occurrences = grouped.occurrences;
        if (!occurrences.length) continue;

        const typeVotes = occurrences.map((row) => scoreClassification(row.text, row.context));
        const classification = typeVotes
          .sort((a, b) => b.confidence - a.confidence)[0] || { kind:"unknown", confidence:0, signals:[], alternatives:[] };

        const representative = {
          ...occurrences[0],
          text:grouped.text,
          normalized:grouped.normalized,
          tokenCount:grouped.tokenCount,
          classification
        };
        const detection = detectionAssessment(representative, occurrences.length);

        // Conservative precision gate: a one-off, single-token capitalized word
        // with no classifiable entity evidence is much more likely to be a
        // sentence-start noun/adverb/verb than a campaign entity. Keep it in a
        // suppressed diagnostic bucket instead of presenting it as a candidate.
        if (
          grouped.tokenCount === 1
          && occurrences.length === 1
          && classification.kind === "unknown"
          && classification.confidence < 0.45
        ) {
          suppressedCandidates.push({
            id:`suppressed:${page.uuid}:${grouped.normalized}`,
            sourceKind:kind,
            sourceJournalUuid:journal.uuid,
            sourcePageUuid:page.uuid,
            sourceName:journal.name,
            pageName:page.name,
            text:grouped.text,
            normalized:grouped.normalized,
            mentionCount:1,
            detection,
            classification,
            reason:"one-off-single-token-without-entity-evidence",
            readOnly:true
          });
          stats.precisionFiltered += 1;
          continue;
        }

        const disposition = detection.band === BANDS.HIGH && classification.confidence >= 0.45
          ? BANDS.HIGH
          : detection.band === BANDS.WEAK
            ? BANDS.WEAK
            : BANDS.REVIEW;

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
          continue;
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
          continue;
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
      learningSuppressed:stats.learningSuppressed,
      learningSourceIgnored:stats.learningSourceIgnored,
      learningConfirmed:stats.learningConfirmed,
      learningLinked:stats.learningLinked
    }
  });

  Hooks.callAll("adventurersTomeNewEntityDiscoveryUpdated", clone(lastSnapshot.summary));
  return clone(lastSnapshot);
}

function snapshot() {
  return clone(lastSnapshot);
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
      knownCanonicalNamesFiltered:true,
      knownSingleTokenAliasesFiltered:true,
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
      oneOffUnknownSingletonsSuppressed:true,
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
  candidatesForSource,
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

Hooks.on("updateJournalEntry", (journal) => {
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
