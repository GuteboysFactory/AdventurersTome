const ATSA_MODULE_ID = "adventurers-tome";
const ATSA_CONTRACT = "adventurers-tome-adapter-api";
const ATSA_VERSION = 1;
const ATSA_REGISTRY = new Map();
const ATSA_CAPABILITIES = Object.freeze([
  "enrich",
  "actorMapping",
  "itemMapping",
  "displayFields",
  "npcSchema",
  "actions",
  "rules",
  "presentation"
]);

const ATSA_STATS = {
  registrations: 0,
  unregisters: 0,
  executions: 0,
  failures: 0,
  lastError: ""
};

function atSaSystemId() {
  return String(game.system?.id || "");
}

function atSaNormalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))];
}

function atSaCapabilities(adapter) {
  const explicit = atSaNormalizeList(adapter?.capabilities);
  const inferred = ATSA_CAPABILITIES.filter((capability) => typeof adapter?.[capability] === "function");
  return [...new Set([...explicit, ...inferred])];
}

function atSaPublicDescriptor(adapter) {
  if (!adapter) return null;
  return Object.freeze({
    id: adapter.id,
    label: adapter.label,
    apiVersion: adapter.apiVersion,
    systemId: adapter.systemId,
    priority: adapter.priority,
    documentTypes: [...adapter.documentTypes],
    sourceTypes: [...adapter.sourceTypes],
    capabilities: [...adapter.capabilities]
  });
}

function atSaNormalizeAdapter(idOrAdapter, maybeAdapter) {
  const raw = typeof idOrAdapter === "string"
    ? { ...(maybeAdapter || {}), id: String(idOrAdapter || "").trim() }
    : { ...(idOrAdapter || {}) };

  const id = String(raw.id || "").trim();
  if (!id) throw new Error("Tome adapters require a stable id.");

  const apiVersion = Number(raw.apiVersion || 1);
  if (!Number.isFinite(apiVersion) || apiVersion < 1) throw new Error(`Adapter ${id} has an invalid apiVersion.`);
  if (apiVersion > ATSA_VERSION) throw new Error(`Adapter ${id} requires unsupported Adapter API v${apiVersion}.`);

  const systemId = String(raw.systemId || "").trim();
  const label = String(raw.label || id).trim() || id;
  const priorityValue = Number(raw.priority ?? 100);
  const priority = Number.isFinite(priorityValue) ? priorityValue : 100;
  const documentTypes = atSaNormalizeList(raw.documentTypes);
  const sourceTypes = atSaNormalizeList(raw.sourceTypes);
  const capabilities = atSaCapabilities(raw);

  if (!capabilities.length) throw new Error(`Adapter ${id} does not expose a supported capability.`);

  return Object.freeze({
    ...raw,
    id,
    label,
    apiVersion,
    systemId,
    priority,
    documentTypes:Object.freeze(documentTypes),
    sourceTypes:Object.freeze(sourceTypes),
    capabilities:Object.freeze(capabilities)
  });
}

function atSaRegister(idOrAdapter, maybeAdapter, options = {}) {
  const adapter = atSaNormalizeAdapter(idOrAdapter, maybeAdapter);
  const replace = options?.replace === true;
  const existing = ATSA_REGISTRY.get(adapter.id);

  if (existing && !replace) throw new Error(`Tome adapter already registered: ${adapter.id}`);

  ATSA_REGISTRY.set(adapter.id, adapter);
  ATSA_STATS.registrations += 1;
  ATSA_STATS.lastError = "";

  try {
    Hooks.callAll("adventurersTomeAdapterRegistered", atSaPublicDescriptor(adapter));
  } catch (_error) {}

  return adapter.id;
}

function atSaUnregister(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  const existing = ATSA_REGISTRY.get(key);
  if (!existing) return false;
  const removed = ATSA_REGISTRY.delete(key);
  if (removed) {
    ATSA_STATS.unregisters += 1;
    try {
      Hooks.callAll("adventurersTomeAdapterUnregistered", atSaPublicDescriptor(existing));
    } catch (_error) {}
  }
  return removed;
}

function atSaGet(id) {
  return atSaPublicDescriptor(ATSA_REGISTRY.get(String(id || "").trim()));
}

function atSaList(options = {}) {
  const rows = [...ATSA_REGISTRY.values()]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (options?.details === true) return rows.map(atSaPublicDescriptor);
  return rows.map((adapter) => adapter.id);
}

function atSaMatchesSource(adapter, source, systemId = atSaSystemId()) {
  try {
    if (adapter.systemId && adapter.systemId !== systemId) return false;
    if (adapter.documentTypes.length && !adapter.documentTypes.includes(String(source?.documentName || ""))) return false;
    if (adapter.sourceTypes.length && !adapter.sourceTypes.includes(String(source?.type || ""))) return false;
    if (typeof adapter.matches === "function") {
      return adapter.matches({ source, systemId, game }) === true;
    }
    return true;
  } catch (error) {
    ATSA_STATS.failures += 1;
    ATSA_STATS.lastError = String(error?.message || error);
    console.warn(`Adventurer's Tome | Adapter ${adapter.id} match failed safely`, error);
    return false;
  }
}

function atSaMatchingAdapters(source, capability = "") {
  const systemId = atSaSystemId();
  return [...ATSA_REGISTRY.values()]
    .filter((adapter) => !capability || adapter.capabilities.includes(capability))
    .filter((adapter) => atSaMatchesSource(adapter, source, systemId))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

async function atSaExecute(capability, payload = {}) {
  const key = String(capability || "").trim();
  if (!ATSA_CAPABILITIES.includes(key)) throw new Error(`Unsupported Tome adapter capability: ${key || "(empty)"}`);

  const source = payload?.source || null;
  const systemId = atSaSystemId();
  const results = [];

  for (const adapter of atSaMatchingAdapters(source, key)) {
    const handler = adapter[key];
    if (typeof handler !== "function") continue;
    try {
      ATSA_STATS.executions += 1;
      const result = await handler({
        ...payload,
        source,
        systemId,
        game,
        adapter:atSaPublicDescriptor(adapter)
      });
      results.push({ adapterId:adapter.id, result });
    } catch (error) {
      ATSA_STATS.failures += 1;
      ATSA_STATS.lastError = String(error?.message || error);
      console.warn(`Adventurer's Tome | Adapter ${adapter.id} capability ${key} failed safely`, error);
      results.push({ adapterId:adapter.id, error:String(error?.message || error) });
    }
  }

  return results;
}

async function atSaEnrich(source) {
  const merged = { bodyHtml:"", summary:"", facts:[] };
  const rows = await atSaExecute("enrich", { source });

  for (const row of rows) {
    const result = row?.result;
    if (!result || typeof result !== "object") continue;
    if (!merged.bodyHtml && String(result.bodyHtml || "").trim()) merged.bodyHtml = String(result.bodyHtml);
    if (!merged.summary && String(result.summary || "").trim()) merged.summary = String(result.summary);
    if (Array.isArray(result.facts)) merged.facts.push(...result.facts);
  }

  return merged;
}

function atSaSupports(capability, source = null) {
  const key = String(capability || "").trim();
  if (!ATSA_CAPABILITIES.includes(key)) return false;
  return atSaMatchingAdapters(source, key).length > 0;
}

function atSaAudit() {
  const systemId = atSaSystemId();
  const adapters = atSaList({ details:true });
  return {
    contract:ATSA_CONTRACT,
    version:ATSA_VERSION,
    systemId,
    healthy:ATSA_STATS.failures === 0,
    registered:adapters.length,
    active:adapters.filter((adapter) => !adapter.systemId || adapter.systemId === systemId).map((adapter) => adapter.id),
    capabilities:[...ATSA_CAPABILITIES],
    stats:{ ...ATSA_STATS },
    adapters
  };
}

const ATSA_PUBLIC_API = Object.freeze({
  contract:ATSA_CONTRACT,
  version:ATSA_VERSION,
  capabilities:Object.freeze([...ATSA_CAPABILITIES]),
  register:atSaRegister,
  unregister:atSaUnregister,
  get:atSaGet,
  list:atSaList,
  matching:(source, capability = "") => atSaMatchingAdapters(source, capability).map(atSaPublicDescriptor),
  supports:atSaSupports,
  execute:atSaExecute,
  enrich:atSaEnrich,
  audit:atSaAudit
});

// Backward-compatible global bridge for existing v1.1-v1.4 consumers.
// New integrations should prefer game.modules.get("adventurers-tome").api.adapters.
globalThis.AdventurersTomeSystemAdapters = ATSA_PUBLIC_API;

function atSaAttachPublicApi() {
  const module = game.modules.get(ATSA_MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.adapters = ATSA_PUBLIC_API;
  return true;
}

Hooks.once("ready", () => {
  atSaAttachPublicApi();
  console.info(`Adventurer's Tome | Formal Adapter API v${ATSA_VERSION} ready (${ATSA_REGISTRY.size} registered).`);
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATSA_MODULE_ID)?.api?.adapters !== ATSA_PUBLIC_API) atSaAttachPublicApi();
});
