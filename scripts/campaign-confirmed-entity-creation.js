const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-confirmed-entity-creation";
const VERSION = 2;

const SEMANTIC_TYPES = Object.freeze([
  Object.freeze({ type:"npc", label:"Character / NPC", icon:"fa-user" }),
  Object.freeze({ type:"contact", label:"Contact", icon:"fa-address-card" }),
  Object.freeze({ type:"location", label:"Location", icon:"fa-location-dot" }),
  Object.freeze({ type:"faction", label:"Faction", icon:"fa-flag" }),
  Object.freeze({ type:"item", label:"Item", icon:"fa-gem" }),
  Object.freeze({ type:"lore", label:"Lore", icon:"fa-book" })
]);

let plans = 0;
let applies = 0;
let creates = 0;
let cancels = 0;
let duplicateBlocks = 0;
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
    .replace(/[’']/g, "")
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

function moduleApi() {
  return game.modules.get(MODULE_ID)?.api || null;
}

function learningApi() {
  return moduleApi()?.campaignReviewLearning || null;
}

function campaignLinksApi() {
  return moduleApi()?.campaignEntityLinks || null;
}

function defaultSemanticType(kind) {
  const key = clean(kind).toLowerCase();
  if (["character","person","npc"].includes(key)) return "npc";
  if (["contact","location","faction","item","lore"].includes(key)) return key;
  return "lore";
}

function visibleExactMatches(text) {
  const wanted = normalize(text);
  if (!wanted) return [];
  const entities = moduleApi()?.discovery?.snapshot?.()?.entities || [];
  return entities
    .filter((entity) => clean(entity?.canonicalUuid) && normalize(entity?.name) === wanted)
    .map((entity) => ({
      uuid:clean(entity.canonicalUuid),
      name:clean(entity.name),
      kind:clean(entity.kind || "entity"),
      state:clean(entity.state),
      authority:clean(entity.authority)
    }));
}

function confirmedDecision(text, sourceUuid = "") {
  const decision = learningApi()?.decisionFor?.(text, { sourceUuid }) || null;
  return decision?.action === "confirmed" ? decision : null;
}

function plan({ text, kind = "unknown", sourceUuid = "", semanticType = "" } = {}) {
  plans += 1;
  const name = clean(text);
  if (!name) throw new Error("Candidate name is required.");

  const confirmed = confirmedDecision(name, sourceUuid);
  const exactMatches = visibleExactMatches(name);
  const inferredType = clean(semanticType || defaultSemanticType(confirmed?.kind || kind));
  const supportedType = SEMANTIC_TYPES.some((entry) => entry.type === inferredType);

  return Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    text:name,
    kind:clean(confirmed?.kind || kind || "unknown").toLowerCase(),
    sourceUuid:clean(sourceUuid),
    semanticType:supportedType ? inferredType : "lore",
    semanticTypes:clone(SEMANTIC_TYPES),
    confirmed:Boolean(confirmed),
    decision:clone(confirmed),
    exactMatches:clone(exactMatches),
    duplicateBlocked:exactMatches.length > 0,
    createEligible:Boolean(confirmed) && exactMatches.length === 0,
    requiresExplicitApply:true,
    campaignLinkWrite:false
  });
}

async function canonicalUuidFromResult(result) {
  if (!result) return "";

  if (clean(result?.uuid)) {
    try {
      const doc = await fromUuid(clean(result.uuid));
      if (doc?.uuid) return doc.uuid;
    } catch (_error) {}
  }

  for (const key of ["actorUuid","journalUuid","itemUuid","targetUuid","documentUuid"]) {
    const uuid = clean(result?.[key]);
    if (!uuid) continue;
    try {
      const doc = await fromUuid(uuid);
      if (doc?.uuid) return doc.uuid;
    } catch (_error) {}
  }

  if (result?.document?.uuid) return clean(result.document.uuid);
  if (result?.actor?.uuid) return clean(result.actor.uuid);
  if (result?.journal?.uuid) return clean(result.journal.uuid);
  if (result?.item?.uuid) return clean(result.item.uuid);

  if (result?.result && result.result !== result) return canonicalUuidFromResult(result.result);
  return "";
}

async function refreshDiscovery() {
  try { moduleApi()?.universalDocuments?.rebuild?.(); }
  catch (_error) {}

  try {
    await moduleApi()?.discovery?.scan?.({
      includeCompendiums:true,
      user:game.user,
      context:{ reason:"campaign-intelligence-created-entity" }
    });
  } catch (_error) {}
}

async function apply(input = {}) {
  if (!game.user?.isGM) throw new Error("Confirmed entity creation is GM-only.");

  const prepared = plan(input);
  if (!prepared.confirmed) throw new Error("Candidate must be explicitly Confirmed before creation.");
  if (prepared.duplicateBlocked) {
    duplicateBlocks += 1;
    throw new Error("An existing canonical campaign entity already has this exact name. Use Link Existing instead.");
  }

  const semanticType = clean(input.semanticType || prepared.semanticType);
  if (!SEMANTIC_TYPES.some((entry) => entry.type === semanticType)) {
    throw new Error(`Unsupported campaign entity type '${semanticType}'.`);
  }

  const quickCreate = moduleApi()?.folderQuickCreate;
  if (!quickCreate?.bootstrap || !quickCreate?.quickCreate) {
    throw new Error("Tome Quick Create is unavailable.");
  }

  try {
    applies += 1;
    const folders = await quickCreate.bootstrap();
    const folder = folders?.folders?.[semanticType] || null;
    if (!folder) throw new Error(`No canonical Tome World folder is available for ${semanticType}.`);

    const result = await quickCreate.quickCreate(folder, {
      blank:true,
      initialName:prepared.text,
      name:prepared.text,
      initialQuery:prepared.text,
      closeAfterCreate:true,
      openAfterCreate:false,
      source:"campaign-intelligence",
      sourceUuid:prepared.sourceUuid
    });

    if (!result) {
      cancels += 1;
      return Object.freeze({ cancelled:true, created:false, text:prepared.text, semanticType });
    }

    const targetUuid = await canonicalUuidFromResult(result);
    if (!targetUuid) {
      throw new Error("Creation completed but Tome could not resolve the resulting canonical UUID.");
    }

    let document = null;
    try { document = await fromUuid(targetUuid); }
    catch (_error) { document = null; }
    if (!document?.uuid) throw new Error("Created entity no longer resolves after creation.");

    await learningApi()?.recordCreated?.({
      text:prepared.text,
      sourceUuid:prepared.sourceUuid,
      targetUuid:document.uuid,
      targetName:document.name,
      targetKind:document.documentName,
      semanticType
    });

    let campaignLinked = false;
    let campaignLinkError = "";
    if (prepared.sourceUuid) {
      try {
        const linkApi = campaignLinksApi();
        if (!linkApi?.linkCanonical) throw new Error("Campaign Entity Links API is unavailable.");
        await linkApi.linkCanonical({
          sourceUuid:prepared.sourceUuid,
          targetUuid:document.uuid
        });
        campaignLinked = true;
        await learningApi()?.markCampaignLinked?.({
          text:prepared.text,
          sourceUuid:prepared.sourceUuid,
          targetUuid:document.uuid
        });
      } catch (error) {
        campaignLinkError = String(error?.message || error);
        console.warn("Adventurer's Tome | Entity created but Campaign Link convergence failed", error);
      }
    }

    await refreshDiscovery();
    creates += 1;
    Hooks.callAll("adventurersTomeCampaignEntityCreated", {
      text:prepared.text,
      semanticType,
      targetUuid:document.uuid,
      targetName:clean(document.name),
      sourceUuid:prepared.sourceUuid
    });

    return Object.freeze({
      cancelled:false,
      created:true,
      text:prepared.text,
      semanticType,
      targetUuid:document.uuid,
      targetName:clean(document.name),
      documentName:clean(document.documentName),
      campaignLinked,
      campaignLinkError
    });
  } catch (error) {
    failures += 1;
    lastError = String(error?.message || error);
    throw error;
  }
}

function audit() {
  return Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    healthy:failures === 0,
    gmOnly:true,
    explicitConfirmRequired:true,
    duplicateExactNameBlock:true,
    delegatesToQuickCreate:true,
    canonicalUuidRequired:true,
    campaignLearningRecorded:true,
    campaignLinkWrites:true,
    sourceToCanonicalLinkAfterCreate:true,
    supportedTypes:SEMANTIC_TYPES.map((entry) => entry.type),
    stats:{ plans, applies, creates, cancels, duplicateBlocks, failures, lastError }
  });
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  semanticTypes:clone(SEMANTIC_TYPES),
  plan,
  apply,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignEntityCreation = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | Confirmed Entity Creation v1 ready.");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.campaignEntityCreation !== publicApi) attach();
});
