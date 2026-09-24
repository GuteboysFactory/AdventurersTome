const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-system-aware-npc-creation";
const SCHEMA_CONTRACT = "adventurers-tome-npc-schema";
const VERSION = 1;

const stats = {
  schemaRequests:0,
  plans:0,
  applies:0,
  reuses:0,
  imports:0,
  creates:0,
  blocked:0,
  failures:0,
  lastError:""
};

function clone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
}

function clean(value) {
  return String(value ?? "").trim();
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function moduleApi() {
  return game.modules.get(MODULE_ID)?.api || null;
}

function safeSystemPath(path) {
  const value = clean(path);
  if (!value.startsWith("system.")) return false;
  const parts = value.split(".");
  if (parts.length < 2) return false;
  return !parts.some((part) => !part || ["__proto__", "prototype", "constructor"].includes(part));
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (entry && typeof entry === "object") {
      const key = clean(entry.value ?? entry.id ?? entry.key);
      if (!key) return null;
      return { value:key, label:clean(entry.label ?? entry.name ?? key) || key };
    }
    const key = clean(entry);
    return key ? { value:key, label:key } : null;
  }).filter(Boolean);
}

function normalizeField(raw, index, adapterId) {
  if (!raw || typeof raw !== "object") throw new Error(`NPC schema field #${index + 1} from ${adapterId} is invalid.`);
  const id = clean(raw.id || raw.key);
  const path = clean(raw.path);
  const type = clean(raw.type || "string").toLowerCase();
  const supported = new Set(["string", "html", "number", "integer", "boolean", "select"]);
  if (!id) throw new Error(`NPC schema field #${index + 1} from ${adapterId} has no id.`);
  if (!safeSystemPath(path)) throw new Error(`NPC schema field ${id} uses unsafe or non-system path '${path}'.`);
  if (!supported.has(type)) throw new Error(`NPC schema field ${id} uses unsupported type '${type}'.`);

  const options = normalizeOptions(raw.options);
  if (type === "select" && !options.length) throw new Error(`NPC schema field ${id} requires select options.`);

  const minimum = Number(raw.min);
  const maximum = Number(raw.max);

  return freeze({
    id,
    label:clean(raw.label || raw.name || id) || id,
    path,
    type,
    required:raw.required === true,
    default:raw.default ?? (type === "boolean" ? false : (["number", "integer"].includes(type) ? 0 : "")),
    min:Number.isFinite(minimum) ? minimum : null,
    max:Number.isFinite(maximum) ? maximum : null,
    options,
    order:Number.isFinite(Number(raw.order)) ? Number(raw.order) : 100
  });
}

function normalizeSchema(adapterId, raw) {
  if (!raw || typeof raw !== "object") throw new Error(`Adapter ${adapterId} did not return an NPC schema.`);
  if (clean(raw.contract) !== SCHEMA_CONTRACT) throw new Error(`Adapter ${adapterId} returned an unsupported NPC schema contract.`);
  if (Number(raw.version) !== 1) throw new Error(`Adapter ${adapterId} returned unsupported NPC schema version ${raw.version}.`);

  const actorType = clean(raw.actorType || "npc");
  if (!actorType) throw new Error(`Adapter ${adapterId} NPC schema has no actorType.`);

  const seenIds = new Set();
  const seenPaths = new Set();
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).map((field, index) => normalizeField(field, index, adapterId));
  for (const field of fields) {
    if (seenIds.has(field.id)) throw new Error(`Adapter ${adapterId} NPC schema duplicates field id '${field.id}'.`);
    if (seenPaths.has(field.path)) throw new Error(`Adapter ${adapterId} NPC schema duplicates path '${field.path}'.`);
    seenIds.add(field.id);
    seenPaths.add(field.path);
  }

  return freeze({
    contract:SCHEMA_CONTRACT,
    version:1,
    adapterId,
    systemId:clean(raw.systemId || game.system?.id),
    actorType,
    label:clean(raw.label || "NPC") || "NPC",
    fields:fields.sort((a,b) => a.order - b.order || a.label.localeCompare(b.label)),
    defaults:clone(raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {})
  });
}

function coerceField(field, value) {
  const current = value === undefined ? field.default : value;
  if (field.required && (current === undefined || current === null || clean(current) === "")) {
    throw new Error(`${field.label} is required.`);
  }

  if (field.type === "boolean") return Boolean(current);

  if (field.type === "number" || field.type === "integer") {
    const number = Number(current);
    if (!Number.isFinite(number)) throw new Error(`${field.label} must be numeric.`);
    const normalized = field.type === "integer" ? Math.trunc(number) : number;
    if (field.min !== null && normalized < field.min) throw new Error(`${field.label} must be at least ${field.min}.`);
    if (field.max !== null && normalized > field.max) throw new Error(`${field.label} must be at most ${field.max}.`);
    return normalized;
  }

  const text = String(current ?? "");
  if (field.type === "select") {
    const allowed = new Set(field.options.map((entry) => entry.value));
    if (text && !allowed.has(text)) throw new Error(`${field.label} contains unsupported option '${text}'.`);
  }
  return text;
}

function buildActorData(schema, { name, values = {}, folderId = "" } = {}) {
  const actorName = clean(name);
  if (!actorName) throw new Error("NPC name is required.");

  const data = {
    name:actorName,
    type:schema.actorType,
    folder:clean(folderId) || null,
    system:{},
    flags:{
      [MODULE_ID]:{
        npcCreation:{
          contract:CONTRACT,
          version:VERSION,
          adapterId:schema.adapterId,
          systemId:schema.systemId
        }
      }
    }
  };

  if (clean(schema.defaults?.img)) data.img = clean(schema.defaults.img);

  const allowedIds = new Set(schema.fields.map((field) => field.id));
  for (const key of Object.keys(values || {})) {
    if (!allowedIds.has(key)) throw new Error(`NPC creation value '${key}' is not allowed by the active adapter schema.`);
  }

  for (const field of schema.fields) {
    const value = coerceField(field, values?.[field.id]);
    foundry.utils.setProperty(data, field.path, value);
  }

  return data;
}

function actorCandidate(actor) {
  return freeze({
    kind:"world",
    uuid:clean(actor?.uuid),
    id:clean(actor?.id),
    name:clean(actor?.name),
    type:clean(actor?.type),
    img:clean(actor?.img)
  });
}

function compendiumUuid(pack, entry) {
  return clean(entry?.uuid) || (pack?.collection && entry?._id ? `Compendium.${pack.collection}.${entry._id}` : "");
}

async function duplicateCandidates(name, actorType) {
  const wanted = clean(name).toLocaleLowerCase();
  const world = (game.actors?.contents || [])
    .filter((actor) => clean(actor.name).toLocaleLowerCase() === wanted && clean(actor.type) === actorType)
    .map(actorCandidate)
    .sort((a,b) => a.uuid.localeCompare(b.uuid));

  const compendium = [];
  for (const pack of game.packs || []) {
    if (clean(pack.documentName) !== "Actor") continue;
    let index;
    try { index = await pack.getIndex({ fields:["name", "type", "img"] }); }
    catch (_error) { continue; }

    for (const entry of Array.from(index || [])) {
      if (clean(entry.name).toLocaleLowerCase() !== wanted || clean(entry.type) !== actorType) continue;
      const uuid = compendiumUuid(pack, entry);
      if (!uuid) continue;
      compendium.push(freeze({
        kind:"compendium",
        uuid,
        id:clean(entry._id),
        pack:clean(pack.collection),
        name:clean(entry.name),
        type:clean(entry.type),
        img:clean(entry.img)
      }));
    }
  }
  compendium.sort((a,b) => a.uuid.localeCompare(b.uuid));

  return freeze({ world, compendium });
}

function chooseResolution(candidates, candidateUuid = "") {
  const explicit = clean(candidateUuid);
  const all = [...candidates.world, ...candidates.compendium];

  if (explicit) {
    const match = all.find((candidate) => candidate.uuid === explicit);
    if (!match) return freeze({ action:"blocked", reason:"explicit-candidate-not-found", candidateUuid:explicit });
    return freeze({
      action:match.kind === "world" ? "reuse-world" : "import-compendium",
      reason:"explicit-candidate",
      candidate:match
    });
  }

  if (candidates.world.length === 1) return freeze({ action:"reuse-world", reason:"exact-world-match", candidate:candidates.world[0] });
  if (candidates.world.length > 1) return freeze({ action:"blocked", reason:"ambiguous-world-match", candidates:candidates.world });

  if (candidates.compendium.length === 1) return freeze({ action:"import-compendium", reason:"exact-compendium-match", candidate:candidates.compendium[0] });
  if (candidates.compendium.length > 1) return freeze({ action:"blocked", reason:"ambiguous-compendium-match", candidates:candidates.compendium });

  return freeze({ action:"create-new", reason:"no-exact-canonical-match" });
}

function stablePlanSignature(plan) {
  return JSON.stringify({
    contract:plan.contract,
    version:plan.version,
    systemId:plan.systemId,
    adapterId:plan.adapterId,
    actorType:plan.actorType,
    name:plan.name,
    folderId:plan.folderId,
    resolution:plan.resolution,
    actorData:plan.actorData
  });
}

async function schema(options = {}) {
  stats.schemaRequests += 1;
  const adapters = moduleApi()?.adapters;
  if (!adapters?.npcSchema) throw new Error("Adapter API npcSchema helper is unavailable.");

  const source = options?.source || { documentName:"Actor", type:"npc" };
  const row = await adapters.npcSchema({ ...options, source });
  if (!row?.adapterId || !row?.result) {
    throw new Error(`No NPC creation schema is available for system '${clean(game.system?.id) || "unknown"}'.`);
  }
  return normalizeSchema(row.adapterId, row.result);
}

async function plan(options = {}) {
  if (!game.user?.isGM) {
    stats.blocked += 1;
    throw new Error("System-aware NPC creation planning is GM-only.");
  }

  const activeSchema = await schema(options);
  const actorData = buildActorData(activeSchema, options);
  const candidates = await duplicateCandidates(actorData.name, activeSchema.actorType);
  const resolution = chooseResolution(candidates, options?.candidateUuid);

  const result = {
    contract:CONTRACT,
    version:VERSION,
    liveMutation:false,
    systemId:clean(game.system?.id),
    adapterId:activeSchema.adapterId,
    actorType:activeSchema.actorType,
    name:actorData.name,
    folderId:clean(options?.folderId),
    schema:activeSchema,
    values:clone(options?.values || {}),
    actorData,
    candidates,
    resolution,
    canApply:resolution.action !== "blocked"
  };
  result.signature = stablePlanSignature(result);
  stats.plans += 1;
  if (!result.canApply) stats.blocked += 1;
  return freeze(result);
}

function assertPlan(input) {
  if (!input || typeof input !== "object") throw new Error("NPC creation plan is required.");
  if (input.contract !== CONTRACT || Number(input.version) !== VERSION) throw new Error("Unsupported NPC creation plan contract.");
  if (input.systemId !== clean(game.system?.id)) throw new Error("NPC creation plan belongs to a different active system.");
  if (!input.canApply || input.resolution?.action === "blocked") throw new Error(`NPC creation plan is blocked: ${input.resolution?.reason || "unknown reason"}.`);
  if (stablePlanSignature(input) !== input.signature) throw new Error("NPC creation plan changed after validation. Rebuild the plan.");
}

function provenance(plan, sourceUuid = "") {
  return {
    contract:CONTRACT,
    version:VERSION,
    adapterId:plan.adapterId,
    systemId:plan.systemId,
    planSignature:plan.signature,
    sourceUuid:clean(sourceUuid),
    createdAt:new Date().toISOString()
  };
}

async function apply(input) {
  if (!game.user?.isGM) {
    stats.blocked += 1;
    throw new Error("System-aware NPC creation is GM-only.");
  }

  assertPlan(input);
  const action = clean(input.resolution?.action);

  try {
    if (action === "reuse-world") {
      const actor = await fromUuid(input.resolution.candidate.uuid);
      if (!actor || actor.documentName !== "Actor") throw new Error("Existing World Actor candidate no longer resolves.");
      stats.applies += 1;
      stats.reuses += 1;
      return freeze({ action, actorId:actor.id, actorUuid:actor.uuid, actorName:actor.name, created:false, sourceUuid:actor.uuid });
    }

    if (action === "import-compendium") {
      const source = await fromUuid(input.resolution.candidate.uuid);
      if (!source || source.documentName !== "Actor") throw new Error("Compendium Actor candidate no longer resolves.");
      const data = source.toObject();
      delete data._id;
      delete data.folder;
      data.folder = input.folderId || null;
      data.flags = clone(data.flags || {});
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] || {}),
        npcCreation:provenance(input, source.uuid)
      };
      const actor = await Actor.create(data);
      if (!actor) throw new Error("Compendium Actor import failed.");
      stats.applies += 1;
      stats.imports += 1;
      return freeze({ action, actorId:actor.id, actorUuid:actor.uuid, actorName:actor.name, created:true, sourceUuid:source.uuid });
    }

    if (action === "create-new") {
      const data = clone(input.actorData);
      data.flags = clone(data.flags || {});
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] || {}),
        npcCreation:provenance(input)
      };
      const actor = await Actor.create(data);
      if (!actor) throw new Error("NPC creation failed.");
      stats.applies += 1;
      stats.creates += 1;
      return freeze({ action, actorId:actor.id, actorUuid:actor.uuid, actorName:actor.name, created:true, sourceUuid:"" });
    }

    throw new Error(`Unsupported NPC creation action '${action}'.`);
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    throw error;
  }
}

function audit() {
  return freeze({
    contract:CONTRACT,
    version:VERSION,
    systemId:clean(game.system?.id),
    gmOnly:true,
    healthy:stats.failures === 0,
    stats:{ ...stats }
  });
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  schema,
  plan,
  apply,
  audit
});

function attach() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.npcCreation = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | System-aware NPC Creation Contract v1 ready.");
});

Hooks.on("adventurersTomeAdapterRegistered", () => {
  // Adapter registration may happen during Foundry init, before game.modules
  // has been constructed. The ready hook remains the authoritative attach
  // point; this hook only refreshes the API when the module registry exists.
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return;
  if (module.api?.npcCreation !== publicApi) attach();
});
