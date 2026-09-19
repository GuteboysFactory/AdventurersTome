import {
  AT_SEMANTIC_CATALOG_VERSION,
  semanticCatalogEntry,
  semanticCatalogSnapshot
} from "./semantic-catalog.js";

const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-universal-semantic-layer";
const VERSION = 1;

const stats = {
  resolves:0,
  adapterHits:0,
  genericHits:0,
  unavailable:0,
  denied:0,
  failures:0,
  lastError:""
};

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_err) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_error) { return value ?? null; }
  }
}

function currentUser(options = {}) {
  return options?.user || game.user || null;
}

function canObserve(source, user) {
  if (!source || !user) return false;
  if (user.isGM) return true;
  try {
    if (typeof source.testUserPermission === "function") {
      return source.testUserPermission(user, "OBSERVER") === true;
    }
  } catch (_error) {}
  return Boolean(source.isOwner && user.id === game.user?.id);
}

function canOwn(source, user) {
  if (!source || !user) return false;
  if (user.isGM) return true;
  try {
    if (typeof source.testUserPermission === "function") {
      return source.testUserPermission(user, "OWNER") === true;
    }
  } catch (_error) {}
  return Boolean(source.isOwner && user.id === game.user?.id);
}

function visibilityAllowed(visibility, source, user) {
  const value = String(visibility || "").trim();
  if (!value) return false;
  if (user?.isGM) return true;
  if (value === "public" || value === "player-visible" || value === "source") return canObserve(source, user);
  if (value === "owner-only") return canOwn(source, user);
  if (value === "gm-only") return false;
  return false;
}

function adapterApi() {
  return game.modules.get(MODULE_ID)?.api?.adapters
    || globalThis.AdventurersTomeSystemAdapters
    || null;
}

function baseResult(source, semantic, overrides = {}) {
  return {
    contract:CONTRACT,
    version:VERSION,
    catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
    semantic,
    status:"unavailable",
    authority:"",
    confidence:0,
    provider:"",
    sourceUuid:String(source?.uuid || ""),
    sourcePath:"",
    visibility:"",
    writable:false,
    data:null,
    ...overrides
  };
}

function normalizeAdapterFact(source, semantic, row) {
  const result = row?.result;
  if (!result || typeof result !== "object") return null;
  const resolvedSemantic = String(result.semantic || semantic || "").trim();
  if (resolvedSemantic !== semantic) return null;

  const visibility = String(result.visibility || "").trim();
  if (!visibility) return null;

  return baseResult(source, semantic, {
    status:String(result.status || "resolved"),
    authority:String(result.authority || "adapter"),
    confidence:Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 1,
    provider:String(result.provider || row.adapterId || ""),
    sourceUuid:String(result.sourceUuid || source?.uuid || ""),
    sourcePath:String(result.sourcePath || ""),
    visibility,
    writable:result.writable === true,
    data:clone(result.data ?? result.value ?? null)
  });
}

async function resolveViaAdapter(source, semantic, options, user) {
  const adapters = adapterApi();
  if (typeof adapters?.execute !== "function") return null;
  if (!adapters.capabilities?.includes?.("semanticRead")) return null;

  let rows = [];
  try {
    rows = await adapters.execute("semanticRead", {
      source,
      semantic,
      user,
      surface:String(options?.surface || "semantic"),
      context:clone(options?.context || {})
    });
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | USL adapter resolve failed safely", error);
    return null;
  }

  for (const row of rows) {
    if (row?.error) continue;
    const fact = normalizeAdapterFact(source, semantic, row);
    if (!fact) continue;
    if (!visibilityAllowed(fact.visibility, source, user)) {
      stats.denied += 1;
      continue;
    }
    stats.adapterHits += 1;
    return fact;
  }
  return null;
}

function resolveGenericIdentity(source, semantic, user) {
  if (!canObserve(source, user)) return null;

  if (semantic === "identity.name") {
    return baseResult(source, semantic, {
      status:"resolved",
      authority:"foundry",
      confidence:1,
      provider:"tome-generic-foundry",
      sourcePath:"name",
      visibility:"source",
      writable:Boolean(user?.isGM || canOwn(source, user)),
      data:String(source?.name || "")
    });
  }

  if (semantic === "identity.type") {
    return baseResult(source, semantic, {
      status:"resolved",
      authority:"foundry",
      confidence:1,
      provider:"tome-generic-foundry",
      sourcePath:"type",
      visibility:"source",
      writable:false,
      data:String(source?.type || source?.documentName || "")
    });
  }

  if (semantic === "identity") {
    return baseResult(source, semantic, {
      status:"resolved",
      authority:"foundry",
      confidence:1,
      provider:"tome-generic-foundry",
      sourcePath:"",
      visibility:"source",
      writable:Boolean(user?.isGM || canOwn(source, user)),
      data:{
        name:String(source?.name || ""),
        type:String(source?.type || source?.documentName || ""),
        img:String(source?.img || "")
      }
    });
  }

  return null;
}

async function resolve(source, semanticId, options = {}) {
  stats.resolves += 1;
  const semantic = String(semanticId || "").trim();
  const catalogEntry = semanticCatalogEntry(semantic);
  const user = currentUser(options);

  if (!source || !semantic || !catalogEntry) {
    stats.unavailable += 1;
    return baseResult(source, semantic, { status:"unavailable" });
  }

  if (!canObserve(source, user)) {
    stats.denied += 1;
    stats.unavailable += 1;
    return baseResult(source, semantic, {
      status:"unavailable",
      ...(user?.isGM ? { reason:"permission" } : {})
    });
  }

  const adapterFact = await resolveViaAdapter(source, semantic, options, user);
  if (adapterFact) return adapterFact;

  const generic = resolveGenericIdentity(source, semantic, user);
  if (generic) {
    stats.genericHits += 1;
    return generic;
  }

  stats.unavailable += 1;
  return baseResult(source, semantic, { status:"unavailable" });
}

async function resolveMany(source, semantics = [], options = {}) {
  const ids = [...new Set((Array.isArray(semantics) ? semantics : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const results = [];
  for (const semantic of ids) results.push(await resolve(source, semantic, options));
  return results;
}

async function inspect(source, options = {}) {
  const user = currentUser(options);
  if (!canObserve(source, user)) {
    return {
      contract:CONTRACT,
      version:VERSION,
      sourceUuid:String(source?.uuid || ""),
      readable:false,
      semantics:[]
    };
  }

  const semantics = [];
  for (const entry of semanticCatalogSnapshot()) {
    const result = await resolve(source, entry.id, { ...options, user });
    if (result.status === "resolved") semantics.push({
      semantic:entry.id,
      authority:result.authority,
      provider:result.provider,
      visibility:result.visibility,
      writable:result.writable,
      sourcePath:result.sourcePath
    });
  }

  return {
    contract:CONTRACT,
    version:VERSION,
    sourceUuid:String(source?.uuid || ""),
    readable:true,
    semantics
  };
}

function audit() {
  return {
    contract:CONTRACT,
    version:VERSION,
    catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
    healthy:stats.failures === 0,
    stats:{ ...stats }
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
  catalog:()=>semanticCatalogSnapshot(),
  getCatalogEntry:(id)=>clone(semanticCatalogEntry(id)),
  resolve,
  resolveMany,
  inspect,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.semantic = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | Universal Semantic Layer v1 foundation ready.");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.semantic !== publicApi) attach();
});
