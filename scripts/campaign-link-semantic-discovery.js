const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-semantic-mention-discovery";
const VERSION = 1;

let lastSnapshot = null;
let scanTimer = null;

const stats = {
  scans:0,
  sources:0,
  pages:0,
  explicitMentions:0,
  proseMentions:0,
  resolvedCanonical:0,
  review:0,
  ambiguous:0,
  unresolved:0,
  permissionFiltered:0,
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
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function resolverApi() {
  return game.modules.get(MODULE_ID)?.api?.campaignMentions || null;
}

function entityKindHint(entity) {
  const semantic = normalizeText(entity?.kind);
  if (["character","pc"].includes(semantic)) return "character";
  if (["npc","person","contact"].includes(semantic)) return "npc";
  if (["item","gear","artifact","equipment"].includes(semantic)) return "item";
  if (["location","place","region","settlement"].includes(semantic)) return "location";
  if (["faction","organization","organisation"].includes(semantic)) return "faction";
  if (semantic === "quest") return "quest";
  if (semantic === "session") return "session";
  if (semantic === "lore") return "lore";

  const documentName = clean(entity?.foundry?.documentName);
  if (documentName === "Actor") return "npc";
  if (documentName === "Item") return "item";
  if (documentName === "Scene") return "location";
  if (documentName === "JournalEntry") {
    const path = (entity?.foundry?.folderPath || []).map((row) => normalizeText(row));
    if (path.includes("sessions")) return "session";
    if (path.includes("quests")) return "quest";
    if (path.includes("locations")) return "location";
    if (path.includes("factions")) return "faction";
    return "lore";
  }
  return "unknown";
}

function visibleEntityIndex(snapshot) {
  const byUuid = new Map();
  const byName = new Map();

  for (const entity of snapshot?.entities || []) {
    const uuid = clean(entity?.canonicalUuid);
    if (uuid) byUuid.set(uuid, entity);

    const name = normalizeText(entity?.name);
    if (!name || name.length < 3) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entity);
  }

  return { byUuid, byName };
}

function foundryInlineRefs(html) {
  const source = String(html ?? "");
  const rows = [];
  const patterns = [
    { re:/@UUID\[([^\]]+)\](?:\{([^}]+)\})?/gi, toUuid:(id) => clean(id) },
    { re:/@(Actor|Item|JournalEntry|Scene)\[([^\]]+)\](?:\{([^}]+)\})?/gi, toUuid:(id, type) => `${type}.${clean(id)}` }
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.re.exec(source)) !== null) {
      const isUuid = match[0].startsWith("@UUID[");
      const type = isUuid ? "" : clean(match[1]);
      const id = clean(isUuid ? match[1] : match[2]);
      const label = clean(isUuid ? match[2] : match[3]);
      const uuid = pattern.toUuid(id, type);
      if (!uuid) continue;
      rows.push({
        uuid,
        label,
        start:match.index,
        end:match.index + match[0].length,
        raw:match[0]
      });
    }
  }

  return rows.sort((a, b) => a.start - b.start);
}

function boundaryOkay(text, start, length) {
  const before = start > 0 ? text[start - 1] : "";
  const after = start + length < text.length ? text[start + length] : "";
  const word = /[\p{L}\p{N}_]/u;
  return (!before || !word.test(before)) && (!after || !word.test(after));
}

function exactNameOccurrences(text, name) {
  const haystack = String(text ?? "").toLocaleLowerCase();
  const needle = clean(name).toLocaleLowerCase();
  if (!needle || needle.length < 3) return [];
  const out = [];
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    if (boundaryOkay(haystack, index, needle.length)) out.push(index);
    offset = index + Math.max(1, needle.length);
  }
  return out;
}

function mentionKey(row) {
  return [
    clean(row?.source?.uuid),
    clean(row?.source?.pageUuid),
    clean(row?.explicit?.canonicalUuid),
    normalizeText(row?.text),
    Number(row?.source?.start ?? -1)
  ].join("|");
}

function summarizeResolution(resolution) {
  return {
    decision:clean(resolution?.decision),
    confidence:Number(resolution?.confidence || 0),
    selectedTarget:clone(resolution?.selectedTarget || null),
    candidates:clone(resolution?.candidates || []),
    autoLinkEligible:Boolean(resolution?.autoLinkEligible),
    requiresReview:Boolean(resolution?.requiresReview),
    reason:clean(resolution?.reason)
  };
}

async function scan(options = {}) {
  stats.scans += 1;
  stats.sources = 0;
  stats.pages = 0;
  stats.explicitMentions = 0;
  stats.proseMentions = 0;
  stats.resolvedCanonical = 0;
  stats.review = 0;
  stats.ambiguous = 0;
  stats.unresolved = 0;
  stats.permissionFiltered = 0;

  const user = options.user || game.user;
  const discovery = discoveryApi();
  const resolver = resolverApi();
  if (!discovery || !resolver) throw new Error("Campaign Discovery or Campaign Mention resolver is unavailable.");

  let discoverySnapshot = discovery.snapshot?.() || null;
  if (!discoverySnapshot || options.rescanDiscovery === true) {
    discoverySnapshot = await discovery.scan({
      includeCompendiums:true,
      user,
      context:{ reason:"semantic-mention-discovery" }
    });
  }
  if (!discoverySnapshot) throw new Error("No viewer-scoped Campaign Discovery snapshot is available.");

  const index = visibleEntityIndex(discoverySnapshot);
  const rows = [];
  const seen = new Set();

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
      const hasInlineRefs = foundryInlineRefs(safeHtml).length > 0;
      if (!text && !hasInlineRefs) continue;

      const sourceBase = {
        uuid:journal.uuid,
        documentName:"JournalEntry",
        pageUuid:page.uuid,
        path:`${kind}/${clean(journal.name)}/${clean(page.name)}`
      };

      for (const ref of foundryInlineRefs(safeHtml)) {
        const target = index.byUuid.get(ref.uuid) || null;
        if (!target) {
          stats.permissionFiltered += 1;
          continue;
        }

        const candidate = resolver.createCandidate({
          id:`explicit:${page.uuid}:${ref.start}`,
          text:ref.label || target.name,
          kindHint:entityKindHint(target),
          source:{ ...sourceBase, start:ref.start, end:ref.end },
          explicit:{ canonicalUuid:target.canonicalUuid },
          provenance:[{
            provider:"tome-session-quest-text",
            authority:"foundry-inline-link",
            sourceUuid:page.uuid,
            sourcePath:sourceBase.path
          }],
          visibility:"source"
        });

        const key = mentionKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);

        const resolution = resolver.resolve(candidate);
        if (resolution?.decision === "resolved-canonical") stats.resolvedCanonical += 1;
        rows.push({
          id:candidate.id,
          sourceKind:kind,
          sourceJournalUuid:journal.uuid,
          sourcePageUuid:page.uuid,
          sourceName:journal.name,
          pageName:page.name,
          mentionType:"explicit-link",
          text:candidate.text,
          kindHint:candidate.kindHint,
          source:clone(candidate.source),
          resolution:summarizeResolution(resolution)
        });
        stats.explicitMentions += 1;
      }

      for (const [normalizedName, entities] of index.byName.entries()) {
        const displayName = clean(entities[0]?.name);
        if (!displayName || normalizedName.length < 3) continue;
        const positions = exactNameOccurrences(text, displayName);
        if (!positions.length) continue;

        for (const start of positions) {
          const kinds = [...new Set(entities.map(entityKindHint))];
          const kindHint = kinds.length === 1 ? kinds[0] : "unknown";
          const candidate = resolver.createCandidate({
            id:`prose:${page.uuid}:${start}:${normalizedName}`,
            text:displayName,
            kindHint,
            source:{ ...sourceBase, start, end:start + displayName.length },
            provenance:[{
              provider:"tome-session-quest-text",
              authority:"prose-mention",
              sourceUuid:page.uuid,
              sourcePath:sourceBase.path
            }],
            visibility:"source"
          });

          const key = mentionKey(candidate);
          if (seen.has(key)) continue;
          seen.add(key);

          const resolution = resolver.resolve(candidate);
          if (resolution?.decision === "review") stats.review += 1;
          else if (resolution?.decision === "ambiguous") stats.ambiguous += 1;
          else if (resolution?.decision === "unresolved") stats.unresolved += 1;

          rows.push({
            id:candidate.id,
            sourceKind:kind,
            sourceJournalUuid:journal.uuid,
            sourcePageUuid:page.uuid,
            sourceName:journal.name,
            pageName:page.name,
            mentionType:"prose-name",
            text:candidate.text,
            kindHint:candidate.kindHint,
            source:clone(candidate.source),
            resolution:summarizeResolution(resolution)
          });
          stats.proseMentions += 1;
        }
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
    mentions:clone(rows),
    summary:{
      sources:stats.sources,
      pages:stats.pages,
      mentions:rows.length,
      explicitMentions:stats.explicitMentions,
      proseMentions:stats.proseMentions,
      resolvedCanonical:stats.resolvedCanonical,
      review:stats.review,
      ambiguous:stats.ambiguous,
      unresolved:stats.unresolved,
      permissionFiltered:stats.permissionFiltered
    }
  });

  Hooks.callAll("adventurersTomeSemanticMentionDiscoveryUpdated", clone(lastSnapshot.summary));
  return clone(lastSnapshot);
}

function snapshot() {
  return clone(lastSnapshot);
}

function mentionsForSource(uuid) {
  const wanted = clean(uuid);
  return clone((lastSnapshot?.mentions || []).filter((row) =>
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
    textScanning:true,
    sourceScope:["session","quest"],
    writesPerformed:false,
    autoPersistence:false,
    privacyModel:"viewer-scoped-source-and-target-evidence",
    summary:clone(lastSnapshot?.summary || {}),
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  textScanning:true,
  writesPerformed:false,
  autoPersistence:false,
  scan,
  snapshot,
  mentionsForSource,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignMentionDiscovery = publicApi;
  return true;
}

function scheduleScan(reason = "lifecycle") {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    void scan({ context:{ reason } }).catch((error) => {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Semantic Mention Discovery failed safely", error);
    });
  }, 180);
}

Hooks.once("ready", () => {
  attach();
  scheduleScan("ready");
  console.info("Adventurer's Tome | Semantic Mention Discovery v1 ready (Sessions/Quests, read-only).");
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
  const journal = page?.parent || null;
  const kind = journalKind(journal);
  if (kind === "session" || kind === "quest") scheduleScan("page-updated");
});
Hooks.on("adventurersTomeCampaignDiscoveryUpdated", () => scheduleScan("discovery-updated"));
Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignMentionDiscovery !== publicApi) attach();
});
