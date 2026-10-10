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

async function apply(input = {}, automaticCandidate = null) {
  if (!game.user?.isGM) throw new Error("Confirmed entity creation is GM-only.");

  const prepared = plan(input);
  if (!prepared.confirmed && !automaticCandidate) throw new Error("Candidate must be explicitly Confirmed before creation.");
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
      initialQuery:"",
      closeAfterCreate:true,
      openAfterCreate:false,
      awaitCreation:true,
      source:"campaign-intelligence",
      sourceUuid:prepared.sourceUuid,
      ...(automaticCandidate ? { campaignIdentity:clone(automaticCandidate.identityBriefing || {}) } : {})
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
    globalThis.AdventurersTomeReviewDecision?.trackCreated(document.uuid);

    const measure=(phase,work)=>globalThis.AdventurersTomeReviewDecision?.measure ? globalThis.AdventurersTomeReviewDecision.measure(phase,work) : work();
    await measure("decision-save",()=>learningApi()?.recordCreated?.({
      text:prepared.text,
      sourceUuid:prepared.sourceUuid,
      targetUuid:document.uuid,
      targetName:document.name,
      targetKind:document.documentName,
      semanticType
    }));

    let campaignLinked = false;
    let campaignLinkError = "";
    if (prepared.sourceUuid) {
      try {
        const linkApi = campaignLinksApi();
        if (!linkApi?.linkCanonical) throw new Error("Campaign Entity Links API is unavailable.");
        await measure("canonical-write",()=>linkApi.linkCanonical({
          sourceUuid:prepared.sourceUuid,
          targetUuid:document.uuid
        }));
        campaignLinked = true;
        await measure("decision-save",()=>learningApi()?.markCampaignLinked?.({
          text:prepared.text,
          sourceUuid:prepared.sourceUuid,
          targetUuid:document.uuid
        }));
      } catch (error) {
        campaignLinkError = String(error?.message || error);
        console.warn("Adventurer's Tome | Entity created but Campaign Link convergence failed", error);
      }
    }

    if (globalThis.AdventurersTomeReviewDecision?.isActive?.()) {
      try {await moduleApi()?.discovery?.refreshDocument?.(document.uuid);}
      catch (_error) {console.warn("Adventurer's Tome | Canonical creation saved; discovery view needs refresh.");}
    } else await refreshDiscovery();
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

function identityDocument(target) {
  const uuid = clean(target?.canonicalUuid || target?.uuid);
  const match = /^(Actor|Item|JournalEntry)\.([^.]+)$/.exec(uuid);
  return match ? (match[1] === "Actor" ? game.actors : match[1] === "Item" ? game.items : game.journal)?.get(match[2]) : null;
}

function identityFamily(kind) {
  const value = normalize(kind);
  if (["actor","character","person","npc","contact","pc","adventurer"].includes(value)) return "person";
  if (["gear","equipment","artifact"].includes(value)) return "item";
  if (["place","region","settlement","scene"].includes(value)) return "location";
  if (["organization","organisation"].includes(value)) return "faction";
  return ["unknown","entity","world", ""].includes(value) ? "" : value;
}

function identityAliases(target, document) {
  const profile = document?.getFlag?.(MODULE_ID, document.documentName === "Actor" ? "actorProfile" : "worldProfile") || {};
  const values = [target?.aliases, target?.attributes?.aliases, profile.aliases].flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
  for (const fact of profile.facts || []) {
    if (/^(alias|aliases|nickname|known as|called|smeknamn|känd som)$/iu.test(clean(fact.label))) values.push(...clean(fact.value).split(/[,;|]/u));
  }
  return [...new Set(values.map((value) => normalize(typeof value === "object" ? value?.name || value?.text || value?.value : value)).filter(Boolean))];
}

function nameSimilarity(left, right, minimum=0) {
  if (!left || !right || Math.max(left.length,right.length) > 160) return 0;
  const length=Math.max(left.length,right.length);
  const budget=Math.floor((1-minimum)*length+1e-9);
  if(Math.abs(left.length-right.length)>budget)return 0;
  let previous = Array.from({length:right.length+1},(_,i)=>i);
  for(let i=1;i<=left.length;i++) {
    const current=[i];
    for(let j=1;j<=right.length;j++)current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));
    // No continuation can undo an edit cost already above the acceptance bound.
    if(Math.min(...current)>budget)return 0;
    previous=current;
  }
  return 1-previous[right.length]/Math.max(left.length,right.length);
}

function assessExistingMatch({ text, kind="unknown", sourceUuid="", target={}, explicitUuid="", currentIdentityName="" } = {}) {
  const document = identityDocument(target);
  const uuid = clean(target.canonicalUuid || target.uuid);
  // Persisted suggestions may carry the mention's old display name alongside
  // another entity's UUID. Assess the current document, not that stale label.
  const name = normalize(currentIdentityName || document?.name || target.name).replace(/^the /u,"");
  const wanted = normalize(text).replace(/^the /u,"");
  const profile = document?.getFlag?.(MODULE_ID,"worldProfile");
  const documentKind = normalize(document?.getFlag?.(MODULE_ID,"type"));
  const folderNames = [];
  const seen = new Set();
  for(let folder=document?.folder;folder && typeof folder === "object" && !seen.has(folder.id);folder=typeof folder.folder === "object" ? folder.folder : game.folders?.get(folder.folder)) {
    seen.add(folder.id);folderNames.push(normalize(folder.name));
  }
  const campaignSource = ["session","sessions","quest","quests","rule","rules"].includes(documentKind)
    || folderNames.some((value)=>["sessions","quests","rules"].includes(value));
  const family = identityFamily(kind);
  const authorityUuid = moduleApi()?.campaignIdentityReconciliation?.identityFor?.({canonicalUuid:uuid})?.authorityUuid || uuid;
  const authorityDocument = identityDocument({canonicalUuid:authorityUuid}) || document;
  const targetFamily = identityFamily(authorityDocument?.documentName === "Actor" ? "person" : authorityDocument?.documentName === "Item" ? "item" : profile?.category || target.kind);
  const rejected = {eligible:false,safe:false,reason:"no-safe-name-evidence",authorityUuid};
  const explicit = explicitUuid && (explicitUuid === uuid || explicitUuid === authorityUuid);
  if (!uuid || !wanted || !name || uuid === sourceUuid || authorityUuid === sourceUuid) return {...rejected,reason:"not-a-compatible-campaign-entity"};
  if ((campaignSource || ["session","quest","rule"].includes(targetFamily)) && !(explicit && ["session","quest","rule"].includes(family))) return {...rejected,reason:"not-a-compatible-campaign-entity"};
  if (explicit) return {eligible:true,safe:true,reason:"explicit-canonical-identity",authorityUuid};
  if (family && targetFamily && family !== targetFamily) return {...rejected,reason:"incompatible-entity-type"};
  if (wanted === name) return {eligible:true,safe:true,rank:100,reason:"exact-normalized-full-name",authorityUuid};
  const language=globalThis.AdventurersTomeLanguage;
  const wantedForm=language.nameForm(wanted),targetForm=language.nameForm(name);
  if(targetFamily==='person' && wantedForm.normalized===targetForm.normalized
    && wantedForm.text.split(/\s+/u).length>=2 && (wantedForm.titles.length || targetForm.titles.length))
    return {eligible:true,safe:true,rank:98,reason:'title-qualified-full-name',authorityUuid};
  if (identityAliases(target,document).some((alias)=>alias.replace(/^the /u,"") === wanted)) return {eligible:true,safe:true,rank:95,reason:"known-alias",authorityUuid};
  const left=wanted.split(" "),right=name.split(" ");
  const fullName = left.length>=2 && left.length===right.length && nameSimilarity(wanted,name,0.85)>=0.85
    && left.every((part,i)=>nameSimilarity(part,right[i],0.7)>=0.7);
  if (fullName) return {eligible:true,safe:false,rank:70,reason:"strong-compatible-full-name",authorityUuid};
  // Whole personal-name tokens are useful Review choices, never automatic
  // aliases. Also block creating a full name beside an existing short-name person.
  const shorterPerson=left.length<right.length?left:right,longerPerson=left.length<right.length?right:left;
  if(targetFamily==="person" && (!family || family==="person") && left.length!==right.length
    && shorterPerson.every(part=>part.length>=3) && (` ${longerPerson.join(" ")} `).includes(` ${shorterPerson.join(" ")} `)) {
    // A complete first/last name token is stronger than incidental overlap,
    // but remains a Review candidate rather than canonical authority.
    const boundary=longerPerson[0]===shorterPerson[0] || longerPerson.at(-1)===shorterPerson.at(-1);
    return {eligible:true,safe:false,rank:boundary?65:50,reason:"personal-name-fragment",authorityUuid};
  }
  // A distinctive settlement prefix can indicate real place ambiguity.
  // Generic shared nouns (Lantern, Bell, Silver) cannot establish this.
  const shorter=left.length<right.length?left:right, longer=left.length<right.length?right:left;
  if (targetFamily === "location" && (!family || family === "location") && shorter.length===1
    && shorter[0].length>=8 && longer[0]===shorter[0]
    && !["settlement","watchtower","location","northern","southern"].includes(shorter[0])) {
    return {eligible:true,safe:false,rank:10,reason:"distinctive-place-name-prefix",authorityUuid};
  }
  return rejected;
}

function possibleDuplicates(text, kind="unknown", sourceUuid="") {
  const discovery=moduleApi()?.discovery;
  const identities=typeof discovery?.identityCandidates === "function" ? discovery.identityCandidates() : discovery?.snapshot?.()?.entities;
  const rows = [
    ...(identities || []),
    ...(game.actors?.contents || []), ...(game.items?.contents || []),
    ...(game.journal?.contents || []).filter((doc) => doc.getFlag?.(MODULE_ID, "worldProfile"))
  ];
  const matches = new Map();
  for (const row of rows) {
    const uuid = clean(row.canonicalUuid || row.uuid);
    const target={name:row.name,canonicalUuid:uuid,kind:row.kind || row.getFlag?.(MODULE_ID,"worldProfile")?.category || (row.documentName === "Actor" ? "character" : row.documentName === "Item" ? "item" : "entity"),aliases:row.aliases};
    // A freshly read adapter identity can legitimately use a source name that
    // differs from the Foundry document's display name. Persisted Review labels
    // do not receive this authority.
    const match=assessExistingMatch({text,kind,sourceUuid,target,currentIdentityName:row.name});
    if(match.eligible && (!matches.has(match.authorityUuid) || Number(match.rank||0)>Number(matches.get(match.authorityUuid).match.rank||0)))matches.set(match.authorityUuid,{...target,match});
  }
  // An unregistered longer fragment of a GM-chosen name is a possible duplicate,
  // not an alias. Keep it in Review instead of creating or merging another person.
  const wanted = normalize(text);
  for (const choice of Object.values(learningApi()?.all?.()?.sourceChoices?.[sourceUuid] || {})) {
    const document = identityDocument({canonicalUuid:choice.targetUuid});
    const name = normalize(document?.name);
    const confirmed = normalize(choice.text);
    if (!document || matches.has(choice.targetUuid) || wanted.split(" ").length < 2
      || name === wanted || !name.endsWith(` ${wanted}`) || !(` ${wanted} `).includes(` ${confirmed} `)) continue;
    matches.set(choice.targetUuid,{name:document.name,canonicalUuid:choice.targetUuid,kind:document.documentName,
      match:{eligible:true,safe:false,reason:"source-choice-name-variant",authorityUuid:choice.targetUuid}});
  }
  return [...matches.values()].sort((a,b)=>Number(b.match.rank||0)-Number(a.match.rank||0));
}

function automaticType(row) {
  const kind = row.classification?.kind;
  const signals = row.classification?.signals || [];
  const alternatives = row.classification?.alternatives || [];
  const margin = Number(row.classification?.confidence || 0) - Number(alternatives[0]?.score || 0);
  if (Number(row.detection?.score || 0) < 0.82 || margin < 0.20) return "";
  if (kind === "character" && (signals.includes("person-role-apposition") || signals.includes("character-title"))) return "contact";
  if (["location","item","faction"].includes(kind) && Number(row.classification.confidence) >= 0.68
    && signals.some((signal) => signal === `${kind}-suffix` || signal === `${kind}-lexeme` || signal === "faction-name-prefix" || kind==="item" && signal==="document-title-source-role")) return kind;
  return "";
}

let resolving = null;
async function resolveCandidates(rows = [], options = {}) {
  if (!game.user?.isGM) return [];
  // Only the active GM creates campaign documents; other GMs still get review.
  if (resolving) { await resolving; return resolveCandidates(rows,options); }
  let finish;
  resolving = new Promise((resolve) => { finish = resolve; });
  try {
    const results = [];
    for (const row of rows) {
      await globalThis.AdventurersTomeIndex?.yieldControl?.();
      options.assertCurrent?.();
      const result = { ...clone(row), outcome:"REVIEW", outcomeReason:"insufficient-identity-evidence", targetUuid:"", identityCandidates:[] };
      try {
        const sourceUuid = row.sourceJournalUuid;
        const learned = learningApi()?.decisionFor?.(row.text, { sourceUuid });
        if (["suppressed","source-ignored"].includes(learned?.action)) {
          result.outcomeReason = `gm-${learned.action}`;
          results.push(result);
          continue;
        }
        if (!moduleApi()?.campaignDeterministicAutoLink?.resolveIdentity) {
          throw new Error("Identity resolution is unavailable; this candidate requires GM review.");
        }
        const exact = moduleApi().campaignDeterministicAutoLink.resolveIdentity({ text:row.text, sourceUuid });
        const strongType = Number(row.classification?.confidence || 0) >= 0.68
          && (row.classification?.signals || []).some((signal)=>/-suffix$|-lexeme$|person-role-apposition|character-title|faction-name-prefix|document-title-source-role/u.test(signal));
        const matchingKind = strongType ? row.classification?.kind : "unknown";
        result.resolutionKind = matchingKind;
        let matches = possibleDuplicates(row.text,matchingKind,sourceUuid);
        // A guessed type must not hide an existing exact-name identity and
        // lead to a duplicate creation attempt. Lexical suffix guesses yield
        // to an exact identity; attached contradictory evidence stays in Review.
        if(strongType) {
          const attachedType=(row.classification?.signals || []).some(signal=>
            /person-role-apposition|character-title|faction-name-prefix|document-title-source-role|location-source-role/u.test(signal));
          for(const candidate of possibleDuplicates(row.text,'unknown',sourceUuid)) {
            if(normalize(candidate.name)!==normalize(row.text) || matches.some(old=>old.match.authorityUuid===candidate.match.authorityUuid))continue;
            matches.push({...candidate,match:{...candidate.match,safe:!attachedType && candidate.match.safe,
              reason:attachedType?'source-type-conflict':candidate.match.reason}});
          }
        }
        const pausedMatches=matches.filter(target=>learningApi()?.isPaused?.(target.match.authorityUuid));
        matches=matches.filter(target=>!learningApi()?.isPaused?.(target.match.authorityUuid));
        const safeMatches = matches.filter((target)=>target.match.safe);
        result.identityAmbiguous = safeMatches.length > 1 || row.ambiguousSourceReference === true;
        const scoped = moduleApi()?.campaignSourceScopedIdentity?.resolveMention?.({ text:row.text, sourceUuid, sourcePageUuid:row.sourcePageUuid });
        if(scoped?.confirmedChoice && !scoped.authorityUuid && !learned?.campaignDefault) {
          result.identityAmbiguous=scoped.identityAmbiguous;
          result.identityCandidates=scoped.candidates || [];
          result.outcomeReason=scoped.reason;
          results.push(result);continue;
        }
        result.identityChoice=scoped?.identityChoice || null;
        const chosen = (learned?.sourceChoice || learned?.action === "created") && learned.sourceUuid === sourceUuid
          ? await fromUuid(learned.targetUuid) : null;
        const preferred=learned?.campaignDefault ? await fromUuid(learned.targetUuid) : null;
        if(learned?.campaignDefault && !preferred) {result.outcomeReason='campaign-default-identity-deleted';results.push(result);continue;}
        if (learned?.sourceChoice && !chosen?.uuid) {
          result.outcomeReason = "gm-selected-identity-deleted";
          results.push(result);
          continue;
        }
        const exactSafe = exact?.deterministic && matches.some((target)=>target.match.safe && target.match.authorityUuid === exact.targetUuid);
        const scopedUuid=!scoped?.identityAmbiguous && (scoped?.confirmedChoice || scoped?.sourceInline || scoped?.sourceCanonical) ? scoped.authorityUuid : '';
        const selectedUuid = chosen?.uuid || scopedUuid || preferred?.uuid || (row.ambiguousSourceReference ? '' : exactSafe ? exact.targetUuid : safeMatches.length === 1 ? safeMatches[0].match.authorityUuid : '');
        const targetUuid = selectedUuid ? moduleApi()?.campaignIdentityReconciliation?.identityFor?.({ canonicalUuid:selectedUuid })?.authorityUuid || selectedUuid : "";
        if (chosen?.uuid) result.identityAmbiguous = false;
        if (targetUuid) {
          result.targetUuid = targetUuid;
          const journal = await fromUuid(sourceUuid);
          const blocked = journal?.getFlag?.(MODULE_ID,"campaignAutoLinkPolicyV1")?.suppressedTargetUuids?.includes(targetUuid);
          if (blocked) result.outcomeReason = "gm-unlink-suppression";
          else {
            options.assertCurrent?.();
            if (!campaignLinksApi()?.hasCanonicalLink?.({ sourceUuid, targetUuid })) {
              await campaignLinksApi().linkCanonical({ sourceUuid, targetUuid });
            }
            result.outcome = learned?.action === "created" && learned.targetUuid === targetUuid
              && learned.sourceUuid === sourceUuid ? "CREATED" : "LINKED";
            result.outcomeReason = "single-canonical-identity";
          }
        } else {
          result.identityCandidates = matches;
          if (result.identityAmbiguous || result.identityCandidates.length) result.outcomeReason = "possible-duplicate-or-ambiguous-identity";
          else if(pausedMatches.length)result.outcomeReason='automatic-matching-paused';
          else {
            result.outcomeReason = "no-safe-existing-match";
            if(globalThis.AdventurersTomeIndex?.historicalForName?.(row.text)?.length) {
              result.outcomeReason='A previous identity with this name was deleted. Link an existing identity or deliberately create a new one.';
              results.push(result);continue;
            }
            const semanticType = automaticType(row);
            const activeGM = game.users?.activeGM;
            if (options.allowCreate !== false && semanticType && (!activeGM || activeGM.id === game.user.id)) {
              const created = await apply({ text:row.text, kind:row.classification.kind, sourceUuid, semanticType }, row);
              result.targetUuid = created.targetUuid || "";
              result.outcome = created.created && created.campaignLinked ? "CREATED" : "REVIEW";
              result.outcomeReason = created.campaignLinkError || (created.cancelled ? "creation-cancelled" : "clear-new-identity");
            }
          }
        }
      } catch (error) {
        result.outcome = "REVIEW";
        result.outcomeReason = String(error?.message || error);
        console.warn("Adventurer's Tome | Candidate requires GM review", row.text, error);
      }
      results.push(result);
    }
    return clone(results);
  } finally { finish(); resolving = null; }
}

async function verify({ text, sourceUuid = "" } = {}) {
  const decision = learningApi()?.decisionFor?.(text, { sourceUuid }) || null;
  const targetUuid = clean(decision?.targetUuid);
  if (!targetUuid) {
    return Object.freeze({
      text:clean(text),
      sourceUuid:clean(sourceUuid),
      targetUuid:"",
      targetResolves:false,
      canonicalVisible:false,
      campaignLinked:false,
      converged:false,
      reason:"no-learned-canonical-target"
    });
  }

  let document = null;
  try { document = await fromUuid(targetUuid); }
  catch (_error) { document = null; }

  const exact = visibleExactMatches(document?.name || text);
  const canonicalVisible = exact.some((row) => row.uuid === targetUuid);
  const campaignLinked = Boolean(campaignLinksApi()?.hasCanonicalLink?.({
    sourceUuid,
    targetUuid
  }));

  return Object.freeze({
    text:clean(text),
    sourceUuid:clean(sourceUuid),
    targetUuid,
    targetName:clean(document?.name || decision?.targetName),
    targetResolves:Boolean(document?.uuid),
    canonicalVisible,
    campaignLinked,
    converged:Boolean(document?.uuid && canonicalVisible && campaignLinked)
  });
}

function audit() {
  return Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    healthy:failures === 0,
    gmOnly:true,
    explicitConfirmRequired:true,
    automaticDiscoveryResolution:true,
    automaticCreationRequiresStrongTypeEvidence:true,
    uncertainCandidateOutcome:"REVIEW",
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
  apply:(input = {}) => apply(input),
  resolveCandidates,
  assessExistingMatch,
  existingMatches:({text,kind,sourceUuid}={})=>game.user?.isGM ? clone(possibleDuplicates(text,kind,sourceUuid)) : [],
  verify,
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
