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
  writePlans:0,
  writesApplied:0,
  writeConflicts:0,
  writeDenied:0,
  failures:0,
  lastError:""
};

const WRITE_AUDIT_LIMIT = 20;
const writeAudit = [];

function pushWriteAudit(event = {}) {
  const row = Object.freeze({
    at:Date.now(),
    semantic:String(event.semantic || ""),
    status:String(event.status || ""),
    reason:String(event.reason || ""),
    provider:String(event.provider || ""),
    targetUuid:String(event.targetUuid || ""),
    targetPath:String(event.targetPath || ""),
    userId:String(game.user?.id || "")
  });
  writeAudit.unshift(row);
  if (writeAudit.length > WRITE_AUDIT_LIMIT) writeAudit.length = WRITE_AUDIT_LIMIT;
  return row;
}


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
    revealState:"",
    writable:false,
    data:null,
    ...overrides
  };
}

function mergeSemanticData(semantic, facts = []) {
  if (!facts.length) return null;
  if (semantic === "relationships") {
    const groups = {
      parents:[],
      artisans:[],
      mentors:[],
      allies:[],
      enemies:[],
      other:[]
    };
    for (const fact of facts) {
      const data = fact?.data;
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
      for (const entry of rows) {
        const kind = String(entry?.kind || entry?.type || "other").toLowerCase();
        const row = clone(entry);
        if (kind === "parent" || kind === "parents" || kind === "family") groups.parents.push(row);
        else if (kind === "artisan" || kind === "senior-artisan" || kind === "teacher") groups.artisans.push(row);
        else if (kind === "mentor") groups.mentors.push(row);
        else if (kind === "ally" || kind === "friend" || kind === "contact") groups.allies.push(row);
        else if (kind === "enemy" || kind === "rival") groups.enemies.push(row);
        else groups.other.push(row);
      }
    }
    return groups;
  }

  if (["traits", "skills", "wises", "talents", "conditions"].includes(semantic)) {
    const merged = [];
    const seen = new Set();
    for (const fact of facts) {
      const rows = Array.isArray(fact?.data) ? fact.data : [];
      for (const entry of rows) {
        const key = String(entry?.uuid || entry?.id || `${entry?.type || semantic}:${entry?.name || JSON.stringify(entry)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(clone(entry));
      }
    }
    return merged;
  }

  return clone(facts[0]?.data ?? null);
}

function aggregateFacts(source, semantic, facts = []) {
  if (!facts.length) return null;
  const entry = semanticCatalogEntry(semantic);
  const policy = String(entry?.resolution || "single");
  if (policy !== "merge") return facts[0];

  const visibleFacts = facts.filter(Boolean);
  if (!visibleFacts.length) return null;

  const visibilities = [...new Set(visibleFacts.map((fact) => String(fact.visibility || "")))];
  const authorities = [...new Set(visibleFacts.map((fact) => String(fact.authority || "")))];
  const providers = [...new Set(visibleFacts.map((fact) => String(fact.provider || "")))];
  const paths = visibleFacts.map((fact) => String(fact.sourcePath || "")).filter(Boolean);

  return baseResult(source, semantic, {
    status:"resolved",
    authority:authorities.length === 1 ? authorities[0] : "merged",
    confidence:Math.min(...visibleFacts.map((fact) => Number(fact.confidence ?? 1))),
    provider:providers.join("+"),
    sourceUuid:String(source?.uuid || ""),
    sourcePath:paths.join(" | "),
    visibility:visibilities.length === 1 ? visibilities[0] : "mixed",
    writable:false,
    data:mergeSemanticData(semantic, visibleFacts),
    sources:visibleFacts.map((fact) => ({
      provider:fact.provider,
      sourceUuid:fact.sourceUuid,
      sourcePath:fact.sourcePath,
      authority:fact.authority,
      visibility:fact.visibility
    }))
  });
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
    revealState:String(result.revealState || ""),
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

  const facts = [];
  for (const row of rows) {
    if (row?.error) continue;
    const fact = normalizeAdapterFact(source, semantic, row);
    if (!fact) continue;
    if (!visibilityAllowed(fact.visibility, source, user)) {
      stats.denied += 1;
      continue;
    }
    facts.push(fact);
  }

  if (!facts.length) return null;
  stats.adapterHits += facts.length;
  return aggregateFacts(source, semantic, facts);
}

function tomeCharacterProfile(source) {
  const raw = source?.getFlag?.(MODULE_ID, "profile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function usesTomeCharacterInformation(source) {
  if (String(source?.documentName || "") !== "Actor") return false;
  if (source?.getFlag?.(MODULE_ID, "groupMember") === true) return true;
  const profile = tomeCharacterProfile(source);
  return Boolean(
    profile.title ||
    profile.subtitle ||
    profile.summary ||
    profile.biography ||
    profile.motto ||
    profile.heroImage
  );
}

function publicInformationPayload(source) {
  if (usesTomeCharacterInformation(source)) {
    const profile = tomeCharacterProfile(source);
    return {
      value:String(profile.biography || "").trim(),
      sourcePath:`flags.${MODULE_ID}.profile.biography`,
      provider:"tome-known-information",
      format:"plain"
    };
  }

  const raw = source?.getFlag?.(MODULE_ID, "knownInformation");
  if (typeof raw === "string") {
    return {
      value:String(raw || "").trim(),
      sourcePath:`flags.${MODULE_ID}.knownInformation`,
      provider:"tome-known-information",
      format:"html"
    };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      value:String(raw.html || "").trim(),
      sourcePath:`flags.${MODULE_ID}.knownInformation.html`,
      provider:"tome-known-information",
      format:"html"
    };
  }

  return {
    value:"",
    sourcePath:`flags.${MODULE_ID}.knownInformation.html`,
    provider:"tome-known-information",
    format:"html"
  };
}

function resolveTomeNotes(source, semantic, user) {
  if (!source || !user || !canObserve(source, user)) return null;

  if (semantic === "notes.gm") {
    if (!user.isGM) return null;
    const notes = game.modules.get(MODULE_ID)?.api?.contextualPrivateVault?.getNotes?.(source) || [];
    if (!Array.isArray(notes) || !notes.length) return null;
    return baseResult(source, semantic, {
      status:"resolved",
      authority:"tome",
      confidence:1,
      provider:"tome-private-vault",
      sourcePath:"contextualPrivateVault",
      visibility:"gm-only",
      revealState:"hidden",
      writable:true,
      data:clone(notes)
    });
  }

  if (semantic === "notes.public") {
    const payload = publicInformationPayload(source);
    const value = String(payload?.value || "").trim();
    if (!value) return null;
    return baseResult(source, semantic, {
      status:"resolved",
      authority:"tome",
      confidence:1,
      provider:String(payload.provider || "tome-known-information"),
      sourcePath:String(payload.sourcePath || ""),
      visibility:"player-visible",
      revealState:"revealed",
      writable:Boolean(user?.isGM || canOwn(source, user)),
      data:value
    });
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

  const tomeNote = resolveTomeNotes(source, semantic, user);
  if (tomeNote) {
    stats.genericHits += 1;
    return tomeNote;
  }

  const generic = resolveGenericIdentity(source, semantic, user);
  if (generic) {
    stats.genericHits += 1;
    return generic;
  }

  stats.unavailable += 1;
  return baseResult(source, semantic, { status:"unavailable" });
}

function semanticPrivacy(semantic) {
  return String(semanticCatalogEntry(semantic)?.privacy || "");
}

function genericTomeWritePlan(source, semantic, proposedValue, user) {
  if (semantic === "notes.gm") {
    const notes = user?.isGM
      ? (game.modules.get(MODULE_ID)?.api?.contextualPrivateVault?.getNotes?.(source) || [])
      : [];
    return {
      semantic,
      allowed:Boolean(user?.isGM),
      authority:"tome",
      provider:"tome-private-vault",
      visibility:"gm-only",
      revealState:"hidden",
      permission:"GM",
      operation:"vault-update",
      targetUuid:String(source?.uuid || ""),
      targetPath:"contextualPrivateVault.notes",
      sourcePath:"contextualPrivateVault",
      currentValue:clone(notes),
      proposedValue:clone(proposedValue),
      conflict:false
    };
  }

  if (semantic === "notes.public") {
    const current = publicInformationPayload(source);
    return {
      semantic,
      allowed:Boolean(user?.isGM || canOwn(source, user)),
      authority:"tome",
      provider:String(current.provider || "tome-known-information"),
      visibility:"player-visible",
      revealState:"revealed",
      permission:"OWNER",
      operation:"update",
      targetUuid:String(source?.uuid || ""),
      targetPath:String(current.sourcePath || ""),
      sourcePath:String(current.sourcePath || ""),
      currentValue:String(current.value || ""),
      proposedValue:clone(proposedValue),
      conflict:false
    };
  }

  return null;
}


function writePermissionFor(visibility) {
  if (visibility === "gm-only") return "GM";
  if (visibility === "owner-only") return "OWNER";
  return "OWNER";
}

function canWriteVisibility(source, user, visibility) {
  if (!source || !user) return false;
  if (user.isGM) return true;
  if (visibility === "gm-only") return false;
  return canOwn(source, user);
}

function semanticValuesEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch (_error) { return a === b; }
}

function deniedWritePlan(source, semantic, { visibility = "", permission = "", reason = "permission" } = {}) {
  return {
    contract:CONTRACT,
    version:VERSION,
    catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
    semantic,
    status:"planned",
    allowed:false,
    dryRun:true,
    operation:"none",
    reason,
    authority:"",
    provider:"",
    targetUuid:String(source?.uuid || ""),
    targetPath:"",
    sourcePath:"",
    visibility:String(visibility || ""),
    revealState:"",
    permission:String(permission || writePermissionFor(visibility)),
    currentValue:null,
    proposedValue:null,
    conflict:false,
    conflictReason:"",
    writable:false
  };
}


async function planWrite(source, semanticId, proposedValue, options = {}) {
  stats.writePlans += 1;
  const semantic = String(semanticId || "").trim();
  const entry = semanticCatalogEntry(semantic);
  const user = currentUser(options);

  if (!source || !semantic || !entry) {
    return baseResult(source, semantic, {
      status:"unavailable",
      allowed:false,
      dryRun:true,
      operation:"none",
      reason:"unavailable"
    });
  }

  const genericPlan = genericTomeWritePlan(source, semantic, proposedValue, user);
  if (genericPlan) {
    const permissionAllowed = canWriteVisibility(source, user, genericPlan.visibility) && genericPlan.allowed !== false;
    if (!permissionAllowed) {
      return deniedWritePlan(source, semantic, {
        visibility:String(genericPlan.visibility || semanticPrivacy(semantic) || ""),
        permission:String(genericPlan.permission || writePermissionFor(genericPlan.visibility)),
        reason:"permission"
      });
    }

    const expectedSupplied = Object.prototype.hasOwnProperty.call(options, "expectedCurrentValue");
    const conflict = Boolean(genericPlan.conflict) || (
      expectedSupplied && !semanticValuesEqual(genericPlan.currentValue ?? null, options.expectedCurrentValue)
    );
    const conflictReason = conflict
      ? String(genericPlan.conflictReason || "current-value-mismatch")
      : "";

    return {
      contract:CONTRACT,
      version:VERSION,
      catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
      semantic,
      status:"planned",
      allowed:!conflict,
      dryRun:true,
      operation:String(genericPlan.operation || "update"),
      reason:conflict ? "conflict" : "",
      authority:String(genericPlan.authority || "tome"),
      provider:String(genericPlan.provider || ""),
      targetUuid:String(genericPlan.targetUuid || source?.uuid || ""),
      targetPath:String(genericPlan.targetPath || ""),
      sourcePath:String(genericPlan.sourcePath || genericPlan.targetPath || ""),
      visibility:String(genericPlan.visibility || ""),
      revealState:String(genericPlan.revealState || ""),
      permission:String(genericPlan.permission || writePermissionFor(genericPlan.visibility)),
      currentValue:clone(genericPlan.currentValue ?? null),
      proposedValue:clone(proposedValue),
      conflict,
      conflictReason,
      writable:!conflict
    };
  }

  const adapters = adapterApi();
  if (typeof adapters?.execute !== "function" || !adapters.capabilities?.includes?.("semanticWritePlan")) {
    return baseResult(source, semantic, {
      status:"unavailable",
      allowed:false,
      dryRun:true,
      operation:"none",
      reason:"no-write-provider"
    });
  }

  let rows = [];
  try {
    rows = await adapters.execute("semanticWritePlan", {
      source,
      semantic,
      proposedValue:clone(proposedValue),
      user,
      context:clone(options?.context || {})
    });
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    return baseResult(source, semantic, {
      status:"unavailable",
      allowed:false,
      dryRun:true,
      operation:"none",
      reason:"provider-error"
    });
  }

  for (const row of rows) {
    if (row?.error || !row?.result || typeof row.result !== "object") continue;
    const result = row.result;
    const visibility = String(result.visibility || semanticPrivacy(semantic) || "").trim();
    if (!visibility) continue;

    const permission = String(result.permission || writePermissionFor(visibility));
    const permissionAllowed = canWriteVisibility(source, user, visibility) && result.allowed !== false;
    if (!permissionAllowed) {
      return deniedWritePlan(source, semantic, {
        visibility,
        permission,
        reason:String(result.reason || "permission")
      });
    }

    const expectedSupplied = Object.prototype.hasOwnProperty.call(options, "expectedCurrentValue");
    const conflict = Boolean(result.conflict) || (
      expectedSupplied && !semanticValuesEqual(result.currentValue ?? null, options.expectedCurrentValue)
    );
    const conflictReason = conflict
      ? String(result.conflictReason || "current-value-mismatch")
      : "";

    return {
      contract:CONTRACT,
      version:VERSION,
      catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
      semantic,
      status:"planned",
      allowed:!conflict,
      dryRun:true,
      operation:String(result.operation || "update"),
      reason:conflict ? "conflict" : "",
      authority:String(result.authority || "adapter"),
      provider:String(result.provider || row.adapterId || ""),
      targetUuid:String(result.targetUuid || source?.uuid || ""),
      targetPath:String(result.targetPath || result.sourcePath || ""),
      sourcePath:String(result.sourcePath || result.targetPath || ""),
      visibility,
      revealState:String(result.revealState || ""),
      permission,
      currentValue:clone(result.currentValue ?? null),
      proposedValue:clone(proposedValue),
      conflict,
      conflictReason,
      writable:!conflict
    };
  }

  return baseResult(source, semantic, {
    status:"unavailable",
    allowed:false,
    dryRun:true,
    operation:"none",
    reason:"no-write-plan"
  });
}

async function canWriteSemantic(source, semanticId, options = {}) {
  const plan = await planWrite(source, semanticId, options?.proposedValue ?? null, options);
  return {
    semantic:String(semanticId || ""),
    allowed:plan.allowed === true,
    reason:String(plan.reason || ""),
    provider:String(plan.provider || ""),
    targetPath:String(plan.targetPath || ""),
    visibility:String(plan.visibility || ""),
    permission:String(plan.permission || "")
  };
}

function samePlanTarget(a, b) {
  return String(a?.semantic || "") === String(b?.semantic || "")
    && String(a?.provider || "") === String(b?.provider || "")
    && String(a?.targetUuid || "") === String(b?.targetUuid || "")
    && String(a?.targetPath || "") === String(b?.targetPath || "")
    && String(a?.operation || "") === String(b?.operation || "");
}

async function applyTomeWrite(source, freshPlan) {
  if (freshPlan.semantic !== "notes.public") return null;
  const path = String(freshPlan.targetPath || "");
  if (!path.startsWith(`flags.${MODULE_ID}.`)) return null;

  await source.update(
    { [path]:clone(freshPlan.proposedValue) },
    {
      render:false,
      adventurersTomeSemanticWrite:true,
      adventurersTomeSemantic:freshPlan.semantic
    }
  );

  const verify = publicInformationPayload(source);
  return {
    semantic:freshPlan.semantic,
    applied:true,
    authority:"tome",
    provider:"tome-known-information",
    targetUuid:String(source?.uuid || ""),
    targetPath:path,
    value:clone(verify.value)
  };
}

async function executeWrite(source, plan, options = {}) {
  const user = currentUser(options);
  const supplied = plan && typeof plan === "object" ? clone(plan) : null;

  if (!source || !supplied?.semantic || supplied.dryRun !== true) {
    throw new Error("executeWrite requires a valid dry-run semantic write plan.");
  }
  if (supplied.allowed !== true || supplied.conflict === true) {
    throw new Error("Semantic write plan is not executable.");
  }
  if (String(supplied.targetUuid || "") !== String(source?.uuid || "")) {
    throw new Error("Semantic write source UUID does not match the plan target.");
  }

  const freshPlan = await planWrite(
    source,
    supplied.semantic,
    clone(supplied.proposedValue),
    {
      ...options,
      user,
      expectedCurrentValue:clone(supplied.currentValue)
    }
  );

  if (freshPlan.allowed !== true) {
    if (freshPlan.reason === "permission") stats.writeDenied += 1;
    if (freshPlan.reason === "conflict") stats.writeConflicts += 1;
    pushWriteAudit({
      semantic:supplied.semantic,
      status:"rejected",
      reason:String(freshPlan.reason || "revalidation-failed"),
      targetUuid:String(source?.uuid || "")
    });
    return {
      contract:CONTRACT,
      version:VERSION,
      semantic:String(supplied.semantic || ""),
      applied:false,
      status:"rejected",
      reason:String(freshPlan.reason || "revalidation-failed"),
      conflict:Boolean(freshPlan.conflict),
      conflictReason:String(freshPlan.conflictReason || ""),
      targetUuid:String(source?.uuid || "")
    };
  }

  if (!samePlanTarget(supplied, freshPlan)) {
    stats.writeConflicts += 1;
    pushWriteAudit({
      semantic:supplied.semantic,
      status:"rejected",
      reason:"plan-target-changed",
      targetUuid:String(source?.uuid || "")
    });
    return {
      contract:CONTRACT,
      version:VERSION,
      semantic:String(supplied.semantic || ""),
      applied:false,
      status:"rejected",
      reason:"plan-target-changed",
      conflict:true,
      conflictReason:"plan-target-changed",
      targetUuid:String(source?.uuid || "")
    };
  }

  let result = null;
  try {
    if (freshPlan.authority === "tome") {
      result = await applyTomeWrite(source, freshPlan);
    } else {
      const adapters = adapterApi();
      if (typeof adapters?.executeAdapter !== "function") {
        throw new Error("Adapter API does not support targeted semantic write execution.");
      }
      const row = await adapters.executeAdapter(freshPlan.provider, "semanticWriteApply", {
        source,
        semantic:freshPlan.semantic,
        proposedValue:clone(freshPlan.proposedValue),
        plan:clone(freshPlan),
        user,
        context:clone(options?.context || {})
      });
      if (row?.error) throw new Error(row.error);
      result = row?.result || null;
    }
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Semantic write execution failed safely", error);
    pushWriteAudit({
      semantic:freshPlan.semantic,
      status:"failed",
      reason:"execution-failed",
      provider:freshPlan.provider,
      targetUuid:String(source?.uuid || ""),
      targetPath:freshPlan.targetPath
    });
    return {
      contract:CONTRACT,
      version:VERSION,
      semantic:String(freshPlan.semantic || ""),
      applied:false,
      status:"failed",
      reason:"execution-failed",
      error:String(error?.message || error),
      targetUuid:String(source?.uuid || "")
    };
  }

  if (!result?.applied) {
    pushWriteAudit({
      semantic:freshPlan.semantic,
      status:"rejected",
      reason:"not-applied",
      provider:freshPlan.provider,
      targetUuid:String(source?.uuid || ""),
      targetPath:freshPlan.targetPath
    });
    return {
      contract:CONTRACT,
      version:VERSION,
      semantic:String(freshPlan.semantic || ""),
      applied:false,
      status:"rejected",
      reason:"not-applied",
      targetUuid:String(source?.uuid || "")
    };
  }

  const resolved = await resolve(source, freshPlan.semantic, { ...options, user });
  stats.writesApplied += 1;
  pushWriteAudit({
    semantic:freshPlan.semantic,
    status:"applied",
    provider:freshPlan.provider,
    targetUuid:String(source?.uuid || ""),
    targetPath:freshPlan.targetPath
  });

  return {
    contract:CONTRACT,
    version:VERSION,
    catalogVersion:AT_SEMANTIC_CATALOG_VERSION,
    semantic:String(freshPlan.semantic || ""),
    applied:true,
    status:"applied",
    authority:String(freshPlan.authority || ""),
    provider:String(freshPlan.provider || ""),
    targetUuid:String(source?.uuid || ""),
    targetPath:String(freshPlan.targetPath || ""),
    visibility:String(freshPlan.visibility || ""),
    revealState:String(freshPlan.revealState || ""),
    value:clone(resolved?.status === "resolved" ? resolved.data : result.value ?? null)
  };
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
      revealState:result.revealState,
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
    stats:{ ...stats },
    recentWrites:writeAudit.map((row) => ({ ...row }))
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
  canWrite:canWriteSemantic,
  planWrite,
  executeWrite,
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
