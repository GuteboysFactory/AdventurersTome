import { universalDocumentRegistryApi } from "./universal-document-registry.js";

const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-universal-campaign-discovery";
const VERSION = 1;

let lastSnapshot = null;
let scanTimer = null;

const stats = {
  scans:0,
  worldDocuments:0,
  compendiumEntries:0,
  adapterSources:0,
  adapterEntities:0,
  adapterRelationships:0,
  semanticOnly:0,
  unresolved:0,
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

function currentUser(options = {}) {
  return options?.user || game.user || null;
}

function canObserve(document, user) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  try {
    if (typeof document.testUserPermission === "function") return document.testUserPermission(user, "OBSERVER") === true;
  } catch (_error) {}
  return Boolean(document.visible);
}

function adapterApi() {
  return game.modules.get(MODULE_ID)?.api?.adapters
    || globalThis.AdventurersTomeSystemAdapters
    || null;
}

function kindForDocument(documentName) {
  const map = {
    Actor:"actor",
    Item:"item",
    JournalEntry:"journal",
    JournalEntryPage:"journal-page",
    Scene:"scene",
    Folder:"folder"
  };
  return map[String(documentName || "")] || "document";
}

function folderPathFor(record, registry, cache = new Map()) {
  const folderUuid = clean(record?.documentName === "Folder" ? record?.parentUuid : record?.folderUuid);
  if (!folderUuid) return [];
  if (cache.has(folderUuid)) return [...cache.get(folderUuid)];

  const names = [];
  const seen = new Set();
  let cursor = folderUuid;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = registry.get(cursor);
    if (!folder || folder.documentName !== "Folder") break;
    if (folder.name) names.unshift(String(folder.name));
    cursor = clean(folder.parentUuid || folder.folderUuid);
  }
  cache.set(folderUuid, Object.freeze([...names]));
  return names;
}

function worldEntity(record, registry, folderCache) {
  const path = folderPathFor(record, registry, folderCache);
  return {
    key:`foundry:${record.uuid}`,
    kind:kindForDocument(record.documentName),
    name:String(record.name || ""),
    canonicalUuid:String(record.uuid || ""),
    state:"resolved",
    authority:"foundry",
    visibility:"source",
    provenance:[{
      provider:"tome-universal-document-registry",
      authority:"foundry",
      sourceUuid:String(record.uuid || ""),
      sourcePath:"UniversalDocumentRegistry"
    }],
    foundry:{
      documentName:String(record.documentName || ""),
      id:String(record.id || ""),
      folderUuid:String(record.folderUuid || ""),
      parentUuid:String(record.parentUuid || ""),
      folderPath:path
    },
    attributes:{}
  };
}

async function compendiumEntities(user) {
  const entities = [];
  for (const pack of game.packs ?? []) {
    try {
      if (!user?.isGM && pack.visible === false) continue;
      const index = await pack.getIndex();
      for (const entry of Array.from(index || [])) {
        const id = clean(entry?._id || entry?.id);
        if (!id) continue;
        const uuid = `Compendium.${pack.collection}.${id}`;
        entities.push({
          key:`compendium:${uuid}`,
          kind:kindForDocument(pack.documentName || entry?.documentName || entry?.type),
          name:String(entry?.name || ""),
          canonicalUuid:uuid,
          state:"compendium",
          authority:"foundry",
          visibility:"source",
          provenance:[{
            provider:"tome-foundry-compendium-index",
            authority:"foundry",
            sourceUuid:uuid,
            sourcePath:`Compendium.${pack.collection}`
          }],
          foundry:{
            documentName:String(pack.documentName || ""),
            id,
            folderUuid:"",
            parentUuid:"",
            folderPath:[],
            compendium:{
              collection:String(pack.collection || ""),
              packageName:String(pack.metadata?.packageName || ""),
              packageType:String(pack.metadata?.packageType || ""),
              label:String(pack.title || pack.metadata?.label || "")
            }
          },
          attributes:{
            type:String(entry?.type || ""),
            img:String(entry?.img || "")
          }
        });
      }
    } catch (error) {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Compendium discovery failed safely", pack?.collection, error);
    }
  }
  return entities;
}

function mergeProvenance(a = [], b = []) {
  const out = [];
  const seen = new Set();
  for (const row of [...a, ...b]) {
    if (!row || typeof row !== "object") continue;
    const key = [row.provider, row.authority, row.sourceUuid, row.sourcePath].map(clean).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clone(row));
  }
  return out;
}

function upsertEntity(entityMap, uuidIndex, aliasMap, raw, provenance = {}) {
  if (!raw || typeof raw !== "object") return null;
  const suppliedKey = clean(raw.key);
  const canonicalUuid = clean(raw.canonicalUuid);
  const canonicalKey = canonicalUuid ? uuidIndex.get(canonicalUuid) : "";
  const key = canonicalKey || suppliedKey || (canonicalUuid ? `discovered:${canonicalUuid}` : "");
  if (!key) return null;

  const existing = entityMap.get(key);
  const incomingProvenance = [{
    provider:clean(provenance.provider),
    authority:clean(raw.authority || provenance.authority || "adapter"),
    sourceUuid:clean(provenance.sourceUuid),
    sourcePath:clean(provenance.sourcePath)
  }];

  if (existing) {
    const next = {
      ...existing,
      kind:existing.kind === "actor" && raw.kind ? clean(raw.kind) : existing.kind,
      name:existing.name || clean(raw.name),
      canonicalUuid:existing.canonicalUuid || canonicalUuid,
      authority:existing.authority === "foundry" ? existing.authority : clean(raw.authority || existing.authority),
      provenance:mergeProvenance(existing.provenance, incomingProvenance),
      attributes:{ ...(existing.attributes || {}), ...(clone(raw.attributes || {})) },
      system:raw.system ? { ...(existing.system || {}), ...clone(raw.system) } : existing.system,
      representation:raw.representation
        ? { ...(existing.representation || {}), ...clone(raw.representation) }
        : existing.representation,
      semanticKeys:[...new Set([...(existing.semanticKeys || []), suppliedKey].filter(Boolean))]
    };
    entityMap.set(key, next);
    if (suppliedKey) aliasMap.set(suppliedKey, key);
    if (canonicalUuid) uuidIndex.set(canonicalUuid, key);
    return next;
  }

  const representation = raw.representation && typeof raw.representation === "object"
    ? clone(raw.representation)
    : null;
  const resolved = Boolean(canonicalUuid && uuidIndex.has(canonicalUuid));
  const semanticOnly = !canonicalUuid && clean(representation?.mode) === "semantic-only";
  const next = {
    key,
    kind:clean(raw.kind || "entity"),
    name:clean(raw.name),
    canonicalUuid,
    state:resolved ? "resolved" : (semanticOnly ? "semantic-only" : (canonicalUuid ? "unresolved-reference" : "unresolved")),
    authority:clean(raw.authority || provenance.authority || "adapter"),
    visibility:clean(raw.visibility || provenance.visibility || "source"),
    provenance:mergeProvenance([], incomingProvenance),
    foundry:raw.foundry ? clone(raw.foundry) : null,
    attributes:clone(raw.attributes || {}),
    system:raw.system ? clone(raw.system) : null,
    representation,
    semanticKeys:suppliedKey ? [suppliedKey] : []
  };
  entityMap.set(key, next);
  if (suppliedKey) aliasMap.set(suppliedKey, key);
  if (canonicalUuid) uuidIndex.set(canonicalUuid, key);
  return next;
}

function endpointKey(endpoint, uuidIndex, aliasMap) {
  const uuid = clean(endpoint?.canonicalUuid);
  if (uuid && uuidIndex.has(uuid)) return uuidIndex.get(uuid);
  const entityKey = clean(endpoint?.entityKey);
  if (entityKey && aliasMap.has(entityKey)) return aliasMap.get(entityKey);
  return entityKey || (uuid ? `discovered:${uuid}` : "");
}

function normalizeRelationship(raw, provenance, uuidIndex, aliasMap) {
  if (!raw || typeof raw !== "object") return null;
  const fromKey = endpointKey(raw.from, uuidIndex, aliasMap);
  const toKey = endpointKey(raw.to, uuidIndex, aliasMap);
  if (!fromKey || !toKey) return null;
  return {
    key:clean(raw.key) || `relationship:${fromKey}:${clean(raw.role)}:${toKey}`,
    kind:"relationship",
    from:{
      key:fromKey,
      semanticKey:clean(raw.from?.entityKey),
      canonicalUuid:clean(raw.from?.canonicalUuid)
    },
    to:{
      key:toKey,
      semanticKey:clean(raw.to?.entityKey),
      canonicalUuid:clean(raw.to?.canonicalUuid)
    },
    role:clean(raw.role || "related"),
    status:clean(raw.status),
    origin:clean(raw.origin),
    authority:clean(raw.authority || provenance.authority || "adapter"),
    visibility:clean(raw.visibility || provenance.visibility || "source"),
    provenance:[{
      provider:clean(provenance.provider),
      authority:clean(raw.authority || provenance.authority || "adapter"),
      sourceUuid:clean(provenance.sourceUuid),
      sourcePath:clean(provenance.sourcePath)
    }],
    attributes:clone(raw.attributes || {}),
    system:raw.system ? clone(raw.system) : null
  };
}

function addStructuralRelationships(entityMap) {
  const edges = [];
  for (const entity of entityMap.values()) {
    const folderUuid = clean(entity?.foundry?.folderUuid);
    if (folderUuid) {
      const folderKey = `foundry:${folderUuid}`;
      if (entityMap.has(folderKey)) {
        edges.push({
          key:`structure:${folderKey}:${entity.key}`,
          kind:"relationship",
          from:{ key:folderKey, canonicalUuid:folderUuid },
          to:{ key:entity.key, canonicalUuid:clean(entity.canonicalUuid) },
          role:"contains",
          status:"",
          origin:"foundry-structure",
          authority:"foundry",
          visibility:"source",
          provenance:[{
            provider:"tome-universal-document-registry",
            authority:"foundry",
            sourceUuid:clean(entity.canonicalUuid),
            sourcePath:"folderUuid"
          }],
          attributes:{},
          system:null
        });
      }
    }

    if (entity.kind === "folder") {
      const parentUuid = clean(entity?.foundry?.parentUuid);
      if (parentUuid) {
        const parentKey = `foundry:${parentUuid}`;
        if (entityMap.has(parentKey)) {
          edges.push({
            key:`structure:${parentKey}:${entity.key}`,
            kind:"relationship",
            from:{ key:parentKey, canonicalUuid:parentUuid },
            to:{ key:entity.key, canonicalUuid:clean(entity.canonicalUuid) },
            role:"contains",
            status:"",
            origin:"foundry-structure",
            authority:"foundry",
            visibility:"source",
            provenance:[{
              provider:"tome-universal-document-registry",
              authority:"foundry",
              sourceUuid:clean(entity.canonicalUuid),
              sourcePath:"parentUuid"
            }],
            attributes:{},
            system:null
          });
        }
      }
    }
  }
  return edges;
}

async function scan(options = {}) {
  stats.scans += 1;
  stats.worldDocuments = 0;
  stats.compendiumEntries = 0;
  stats.adapterSources = 0;
  stats.adapterEntities = 0;
  stats.adapterRelationships = 0;
  stats.semanticOnly = 0;
  stats.unresolved = 0;
  const user = currentUser(options);
  const includeCompendiums = options?.includeCompendiums !== false;
  const registry = universalDocumentRegistryApi();
  const folderCache = new Map();
  const entityMap = new Map();
  const uuidIndex = new Map();
  const aliasMap = new Map();
  const relationships = [];

  for (const record of registry.snapshot()) {
    const document = registry.resolve(record.uuid);
    if (!document || !canObserve(document, user)) continue;
    const entity = worldEntity(record, registry, folderCache);
    entityMap.set(entity.key, entity);
    uuidIndex.set(entity.canonicalUuid, entity.key);
  }
  stats.worldDocuments = entityMap.size;

  if (includeCompendiums) {
    const packs = await compendiumEntities(user);
    for (const entity of packs) {
      if (uuidIndex.has(entity.canonicalUuid)) continue;
      entityMap.set(entity.key, entity);
      uuidIndex.set(entity.canonicalUuid, entity.key);
    }
    stats.compendiumEntries = packs.length;
  } else {
    stats.compendiumEntries = 0;
  }

  relationships.push(...addStructuralRelationships(entityMap));

  const adapters = adapterApi();
  if (adapters?.capabilities?.includes?.("entityDiscovery") && typeof adapters.execute === "function") {
    for (const record of registry.byType("Actor")) {
      const source = registry.resolve(record.uuid);
      if (!source || !canObserve(source, user)) continue;

      let rows = [];
      try {
        rows = await adapters.execute("entityDiscovery", {
          source,
          user,
          context:clone(options?.context || {})
        });
      } catch (error) {
        stats.failures += 1;
        stats.lastError = String(error?.message || error);
        console.warn("Adventurer's Tome | Entity discovery adapter failed safely", error);
        continue;
      }

      for (const row of rows) {
        if (row?.error || !row?.result || typeof row.result !== "object") continue;
        stats.adapterSources += 1;
        const result = row.result;
        const provenance = {
          provider:clean(result.provider || row.adapterId),
          authority:clean(result.authority || "adapter"),
          visibility:clean(result.visibility || "source"),
          sourceUuid:clean(result.sourceUuid || source.uuid),
          sourcePath:clean(result.sourcePath)
        };

        for (const rawEntity of Array.isArray(result.entities) ? result.entities : []) {
          if (upsertEntity(entityMap, uuidIndex, aliasMap, rawEntity, provenance)) stats.adapterEntities += 1;
        }

        for (const rawRelationship of Array.isArray(result.relationships) ? result.relationships : []) {
          const normalized = normalizeRelationship(rawRelationship, provenance, uuidIndex, aliasMap);
          if (!normalized) continue;
          relationships.push(normalized);
          stats.adapterRelationships += 1;
        }
      }
    }
  }

  const entities = [...entityMap.values()];
  const semanticOnly = entities.filter((entity) => entity.state === "semantic-only");
  const unresolved = entities.filter((entity) => entity.state === "unresolved" || entity.state === "unresolved-reference");
  stats.semanticOnly = semanticOnly.length;
  stats.unresolved = unresolved.length;

  lastSnapshot = Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    generatedAt:Date.now(),
    systemId:String(game.system?.id || ""),
    systemVersion:String(game.system?.version || ""),
    readOnly:true,
    includeCompendiums,
    entities:clone(entities),
    relationships:clone(relationships),
    semanticOnly:clone(semanticOnly),
    unresolved:clone(unresolved),
    summary:{
      entities:entities.length,
      relationships:relationships.length,
      semanticOnly:semanticOnly.length,
      unresolved:unresolved.length,
      worldDocuments:stats.worldDocuments,
      compendiumEntries:stats.compendiumEntries,
      adapterEntities:stats.adapterEntities,
      adapterRelationships:stats.adapterRelationships
    }
  });

  Hooks.callAll("adventurersTomeCampaignDiscoveryUpdated", clone(lastSnapshot.summary));
  return clone(lastSnapshot);
}

function snapshot() {
  return clone(lastSnapshot);
}

function get(keyOrUuid) {
  if (!lastSnapshot) return null;
  const wanted = clean(keyOrUuid);
  return clone(lastSnapshot.entities.find((entity) => entity.key === wanted || entity.canonicalUuid === wanted) || null);
}

function relationshipsFor(keyOrUuid) {
  if (!lastSnapshot) return [];
  const entity = get(keyOrUuid);
  const key = entity?.key || clean(keyOrUuid);
  return clone(lastSnapshot.relationships.filter((edge) => edge.from?.key === key || edge.to?.key === key));
}

function audit() {
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0,
    hasSnapshot:Boolean(lastSnapshot),
    summary:clone(lastSnapshot?.summary || {}),
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  readOnly:true,
  scan,
  snapshot,
  get,
  relationshipsFor,
  semanticOnly:()=>clone(lastSnapshot?.semanticOnly || []),
  unresolved:()=>clone(lastSnapshot?.unresolved || []),
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.discovery = publicApi;
  return true;
}

function scheduleScan(reason = "lifecycle") {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    void scan({ includeCompendiums:true, context:{ reason } }).catch((error) => {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Campaign discovery scan failed safely", error);
    });
  }, 120);
}

Hooks.once("ready", () => {
  attach();
  scheduleScan("ready");
  console.info("Adventurer's Tome | Universal Campaign Discovery v1 ready (read-only).");
});

Hooks.on("adventurersTomeUniversalRegistryRebuilt", () => scheduleScan("registry-rebuilt"));

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.discovery !== publicApi) attach();
});
