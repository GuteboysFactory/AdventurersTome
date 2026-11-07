globalThis.ATTestAI.assertEnabled();
const ATDAL_ID = "adventurers-tome";
const ATDAL_CONTRACT = "adventurers-tome-deterministic-auto-link";
const ATDAL_VERSION = 1;
const ATDAL_POLICY_FLAG = "campaignAutoLinkPolicyV1";
const ATDAL_PROVENANCE_FLAG = "campaignAutoLinkEvidenceV1";

let atDalTimer = null;
let atDalRunning = false;
let atDalInternalWrite = false;

const ATDAL_STATS = {
  scans:0,
  considered:0,
  resolved:0,
  linked:0,
  alreadyLinked:0,
  ambiguous:0,
  unresolved:0,
  suppressed:0,
  skippedUnsupported:0,
  failures:0,
  lastError:""
};

function atDalClean(value) {
  return String(value ?? "").trim();
}

function atDalNormalize(value) {
  return atDalClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atDalClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atDalArray(value) {
  return Array.isArray(value) ? value : [];
}

function atDalUnique(values) {
  return [...new Set(values.map(atDalClean).filter(Boolean))];
}

function atDalIdentityApi() {
  return globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignIdentityReconciliation || null;
}

function atDalDiscoveryApi() {
  return globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignMentionDiscovery || null;
}

function atDalLinksApi() {
  return globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignEntityLinks || null;
}

function atDalEvidenceApi() {
  return globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignMentionEvidence || null;
}

function atDalFolderNames(folder) {
  const names = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(atDalNormalize(current.name));
    const parentId = atDalClean(current.folder?.id ?? current.folder);
    current = parentId ? game.folders?.get(parentId) || null : null;
  }
  return names;
}

function atDalJournalKind(journal) {
  if (!journal || journal.documentName !== "JournalEntry") return "";
  const flagged = atDalClean(globalThis.ATTestAI.flags(journal).getFlag?.(ATDAL_ID, "type")).toLowerCase();
  if (["session","sessions"].includes(flagged)) return "session";
  if (["quest","quests"].includes(flagged)) return "quest";
  if (["rule","rules"].includes(flagged)) return "rule";

  const folderNames = atDalFolderNames(journal.folder || game.folders?.get(atDalClean(journal.folder?.id ?? journal.folder)));
  if (folderNames.includes("sessions")) return "session";
  if (folderNames.includes("quests")) return "quest";
  if (folderNames.includes("rules")) return "rule";
  return "";
}

function atDalWorldJournal(journal) {
  if (!journal || journal.documentName !== "JournalEntry") return false;
  if (atDalJournalKind(journal)) return false;

  const backend = globalThis.ATTestAI.flags(journal).getFlag?.(ATDAL_ID, "backendProjectionV1");
  if (backend?.managed === true) return true;

  const semantic = globalThis.ATTestAI.flags(journal).getFlag?.(ATDAL_ID, "semanticProjection");
  if (semantic?.kind) return true;

  const profile = globalThis.ATTestAI.flags(journal).getFlag?.(ATDAL_ID, "worldProfile");
  if (profile && typeof profile === "object") return true;

  const categories = new Set([
    "world","contacts","contact","factions","faction","locations","location",
    "places","place","items","item","lore","npcs","npc","npc groups","npc group"
  ]);
  return atDalFolderNames(journal.folder || game.folders?.get(atDalClean(journal.folder?.id ?? journal.folder)))
    .some((name) => categories.has(name));
}

function atDalKindForJournal(journal) {
  const backend = globalThis.ATTestAI.flags(journal)?.getFlag?.(ATDAL_ID, "backendProjectionV1");
  if (backend?.category) return atDalClean(backend.category).toLowerCase();
  const semantic = globalThis.ATTestAI.flags(journal)?.getFlag?.(ATDAL_ID, "semanticProjection");
  if (semantic?.kind) return atDalClean(semantic.kind).toLowerCase();
  const profile = globalThis.ATTestAI.flags(journal)?.getFlag?.(ATDAL_ID, "worldProfile");
  if (profile?.category) return atDalClean(profile.category).toLowerCase();

  const names = atDalFolderNames(journal?.folder || game.folders?.get(atDalClean(journal?.folder?.id ?? journal?.folder)));
  if (names.includes("factions")) return "faction";
  if (names.includes("locations") || names.includes("places")) return "location";
  if (names.includes("items")) return "item";
  if (names.includes("contacts")) return "contact";
  if (names.includes("lore")) return "lore";
  return "world";
}

function atDalCandidateFromActor(actor) {
  return {
    name:atDalClean(actor?.name),
    kind:"character",
    canonicalUuid:atDalClean(actor?.uuid),
    foundry:{ documentName:"Actor", id:atDalClean(actor?.id) }
  };
}

function atDalCandidateFromItem(item) {
  return {
    name:atDalClean(item?.name),
    kind:"item",
    canonicalUuid:atDalClean(item?.uuid),
    foundry:{ documentName:"Item", id:atDalClean(item?.id) }
  };
}

function atDalCandidateFromJournal(journal) {
  return {
    name:atDalClean(journal?.name),
    kind:atDalKindForJournal(journal),
    canonicalUuid:atDalClean(journal?.uuid),
    foundry:{ documentName:"JournalEntry", id:atDalClean(journal?.id) }
  };
}

function atDalCandidatePool() {
  const rows = [];
  for (const actor of game.actors?.contents || []) rows.push(atDalCandidateFromActor(actor));
  for (const item of game.items?.contents || []) rows.push(atDalCandidateFromItem(item));
  for (const journal of game.journal?.contents || []) {
    if (atDalWorldJournal(journal)) rows.push(atDalCandidateFromJournal(journal));
  }
  const excluded=new Set(globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage?.excludedUuids?.()||[]);
  return rows.filter((row) => row.name && row.canonicalUuid&&!excluded.has(row.canonicalUuid)&&globalThis.AdventurersTomeDecisionPolicy?.documentRole(game.actors?.get(row.foundry?.id))!=='template');
}

function atDalAuthorityUuid(row) {
  return atDalClean(
    row?.identityAuthorityUuid
    || row?.identity?.authorityUuid
    || row?.canonicalUuid
    || row?.uuid
  );
}

function atDalResolveIdentity(input = {}) {
  const text = atDalClean(input.text || input.name || input.row?.text);
  const normalized = atDalNormalize(text);
  const sourceUuid = atDalClean(input.sourceUuid || input.row?.sourceJournalUuid || input.row?.source?.uuid);

  if (!normalized) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:"empty-mention",
      text,
      sourceUuid,
      candidates:[]
    };
  }

  const learning=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignReviewLearning;
  const choice=learning?.decisionFor?.(text,{sourceUuid});
  let preferred=(choice?.sourceChoice || choice?.campaignDefault) ? choice.targetUuid : '';
  if(choice?.campaignDefault) {
    const scoped=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignSourceScopedIdentity?.resolveMention?.({text,sourceUuid,sourcePageUuid:input.row?.sourcePageUuid});
    if(scoped?.sourceCanonical || scoped?.sourceInline) {
      if(scoped.identityAmbiguous)return {decision:'ambiguous',deterministic:false,reason:scoped.reason,text,sourceUuid,candidates:scoped.candidates || []};
      preferred=scoped.authorityUuid;
    }
  }
  const exact = atDalCandidatePool().filter((candidate) => preferred
    ? atDalAuthorityUuid(candidate) === preferred
    : atDalNormalize(candidate.name) === normalized && !learning?.isPaused?.(atDalAuthorityUuid(candidate)));
  if(!preferred){
    const supported=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage?.resolveCatalogue?.(text,sourceUuid);
    if(supported?.reason==='library-entity-type-conflict')return {decision:'ambiguous',deterministic:false,reason:supported.reason,text,sourceUuid,identityCount:supported.candidates.length,candidates:supported.candidates};
    if(supported?.status==='matched'&&['npc-before-contact','library-location-authority'].includes(supported.reason)){
      const target=supported.target;return {contract:ATDAL_CONTRACT,version:ATDAL_VERSION,decision:'deterministic',deterministic:true,reason:supported.reason,text,sourceUuid,authorityUuid:target.uuid,targetUuid:target.uuid,targetName:target.name,targetKind:target.kind,identityCount:1,candidates:[{name:target.name,kind:target.kind,canonicalUuid:target.uuid}]};
    }
  }
  if (!exact.length && !preferred) {
    const supported=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage?.resolveCatalogue?.(text,sourceUuid);
    if(supported?.status==='matched'){
      const target=supported.target;
      if(/^(Actor|Item|JournalEntry)\.[^.]+$/.test(target.uuid))return {contract:ATDAL_CONTRACT,version:ATDAL_VERSION,decision:'deterministic',deterministic:true,reason:'tome-catalogue:'+supported.reason,text,sourceUuid,authorityUuid:target.uuid,targetUuid:target.uuid,targetName:target.name,targetKind:target.kind,identityCount:1,candidates:[{name:target.name,kind:target.kind,canonicalUuid:target.uuid}]};
    }
    if(supported?.status==='ambiguous')return {decision:'ambiguous',deterministic:false,reason:supported.reason,text,sourceUuid,identityCount:supported.candidates.length,candidates:supported.candidates.map(t=>({...t,canonicalUuid:t.uuid}))};
  }
  if (!exact.length) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:"no-exact-world-identity",
      text,
      sourceUuid,
      candidates:[]
    };
  }

  const identityApi = atDalIdentityApi();
  const reconciled = identityApi?.reconcile
    ? (identityApi.reconcile(exact) || [])
    : exact.map((candidate) => ({
        ...candidate,
        identityAuthorityUuid:candidate.canonicalUuid,
        identityAmbiguous:false,
        identityCount:1
      }));

  const ambiguousRow = reconciled.find((row) => row?.identityAmbiguous === true) || null;
  const distinctAuthorities = atDalUnique(reconciled.map(atDalAuthorityUuid));
  const identityCount = Math.max(
    Number(ambiguousRow?.identityCount || 0),
    distinctAuthorities.length,
    ambiguousRow ? 2 : 0
  );

  if (ambiguousRow || distinctAuthorities.length > 1 || reconciled.length > 1) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"ambiguous",
      deterministic:false,
      reason:"multiple-unrelated-exact-identities",
      text,
      sourceUuid,
      identityCount:Math.max(2, identityCount),
      candidates:atDalClone(exact),
      reconciled:atDalClone(reconciled)
    };
  }

  const selected = reconciled[0] || exact[0];
  const authorityUuid = atDalAuthorityUuid(selected);
  if (!authorityUuid || authorityUuid === sourceUuid) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unresolved",
      deterministic:false,
      reason:authorityUuid === sourceUuid ? "source-self-reference" : "missing-authority-uuid",
      text,
      sourceUuid,
      candidates:atDalClone(exact)
    };
  }

  const supported = /^(?:Actor|Item|JournalEntry)\.[^.]+$/.test(authorityUuid);
  if (!supported) {
    return {
      contract:ATDAL_CONTRACT,
      version:ATDAL_VERSION,
      decision:"unsupported",
      deterministic:false,
      reason:"authority-type-not-linkable",
      text,
      sourceUuid,
      authorityUuid,
      candidates:atDalClone(exact)
    };
  }

  return {
    contract:ATDAL_CONTRACT,
    version:ATDAL_VERSION,
    decision:"deterministic",
    deterministic:true,
    reason:"exact-name-single-canonical-identity-after-reconciliation",
    text,
    sourceUuid,
    authorityUuid,
    targetUuid:authorityUuid,
    targetName:atDalClean(selected?.name || exact[0]?.name || text),
    targetKind:atDalClean(selected?.identityKindLabel || selected?.kind || exact[0]?.kind || "entity"),
    projectionCollapsed:selected?.identityProjectionCollapsed === true,
    identityCount:1,
    candidates:atDalClone(exact),
    reconciled:atDalClone(reconciled)
  };
}

function atDalPolicy(source) {
  const raw = globalThis.ATTestAI.flags(source)?.getFlag?.(ATDAL_ID, ATDAL_POLICY_FLAG);
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    suppressedTargetUuids:atDalUnique(atDalArray(value.suppressedTargetUuids)),
    updatedAt:Number(value.updatedAt || 0)
  };
}

function atDalProvenance(source) {
  const raw = globalThis.ATTestAI.flags(source)?.getFlag?.(ATDAL_ID, ATDAL_PROVENANCE_FLAG);
  const rows = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return foundry.utils.deepClone(rows);
}

async function atDalWritePolicy(source, policy) {
  if (!source?.update || !game.user?.isGM) return;
  await source.update({
    [`flags.${ATDAL_ID}.${ATDAL_POLICY_FLAG}`]:{
      suppressedTargetUuids:atDalUnique(policy?.suppressedTargetUuids || []),
      updatedAt:Date.now()
    }
  });
}

async function atDalWriteProvenance(source, targetUuid, row, resolution, guard) {
  guard?.();
  if (!source?.update || !game.user?.isGM) return;
  const current = atDalProvenance(source);
  if(guard && current[targetUuid])return;
  current[targetUuid] = {
    mode:"deterministic-auto-link-v1",
    targetUuid,
    targetName:atDalClean(resolution?.targetName || row?.text),
    mentionText:atDalClean(row?.text),
    sourcePageUuid:atDalClean(row?.sourcePageUuid || row?.source?.pageUuid),
    reason:atDalClean(resolution?.reason),
    identityCount:Number(resolution?.identityCount || 1),
    projectionCollapsed:resolution?.projectionCollapsed === true,
    linkedAt:Date.now()
  };
  await source.update({
    [`flags.${ATDAL_ID}.${ATDAL_PROVENANCE_FLAG}`]:current
  },guard?{tomeStartupCommit:true}:{});
  guard?.();
}

function atDalSourceJournal(sourceUuid) {
  const value = atDalClean(sourceUuid);
  const match = /^JournalEntry\.([^.]+)/.exec(value);
  return match ? game.journal?.get(match[1]) || null : null;
}

function atDalWasAutoLinked(source, targetUuid) {
  const provenance = atDalProvenance(source);
  return Boolean(provenance?.[targetUuid]);
}

async function atDalMarkSuppressed(sourceUuid, targetUuid) {
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !targetUuid) return false;
  const policy = atDalPolicy(source);
  if (policy.suppressedTargetUuids.includes(targetUuid)) return true;
  policy.suppressedTargetUuids.push(targetUuid);
  await atDalWritePolicy(source, policy);
  return true;
}

async function atDalClearSuppressed(sourceUuid, targetUuid) {
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !targetUuid) return false;
  const policy = atDalPolicy(source);
  if (!policy.suppressedTargetUuids.includes(targetUuid)) return true;
  policy.suppressedTargetUuids = policy.suppressedTargetUuids.filter((uuid) => uuid !== targetUuid);
  await atDalWritePolicy(source, policy);
  return true;
}

async function atDalAutoLinkRow(row, options = {}) {
  options.assertCurrent?.();
  ATDAL_STATS.considered += 1;
  const sourceUuid = atDalClean(row?.sourceJournalUuid || row?.source?.uuid);
  const source = atDalSourceJournal(sourceUuid);
  if (!source || !["session","quest"].includes(atDalJournalKind(source))) {
    return { linked:false, decision:"skip", reason:"source-not-session-or-quest" };
  }

  const catalogueMatch=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage?.resolveCatalogue?.(row.text,sourceUuid);
  const catalogueProtected=catalogueMatch?.status==='matched';
  const consolidated = globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignNewEntityDiscovery?.candidateForMention?.(row);
  const preference=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignReviewLearning?.decisionFor?.(row.text,{sourceUuid});
  if(['suppressed','source-ignored'].includes(preference?.action))return {linked:false,decision:'suppressed',reason:'gm-mention-preference',text:row.text,sourceUuid};
  if (!catalogueProtected && consolidated?.ambiguousSourceReference && !preference?.campaignDefault && !preference?.sourceChoice) {
    ATDAL_STATS.ambiguous += 1;
    return {linked:false,decision:"ambiguous",reason:"ambiguous-source-first-name-reference",text:row.text,sourceUuid};
  }
  if (consolidated && !catalogueProtected) row = {...row,text:consolidated.text};

  const resolution = atDalResolveIdentity({ row, sourceUuid, text:row?.text });
  if (resolution.decision === "ambiguous") {
    ATDAL_STATS.ambiguous += 1;
    return { linked:false, ...resolution };
  }
  if (resolution.decision === "unsupported") {
    ATDAL_STATS.skippedUnsupported += 1;
    return { linked:false, ...resolution };
  }
  if (!resolution.deterministic || !resolution.targetUuid) {
    ATDAL_STATS.unresolved += 1;
    return { linked:false, ...resolution };
  }

  if(options.expectedTargetUuid && resolution.targetUuid!==options.expectedTargetUuid)
    throw Object.assign(Error('Resolved identity changed before commit.'),{code:'TOME_STARTUP_STALE'});
  options.assertCurrent?.();
  ATDAL_STATS.resolved += 1;
  const policy = atDalPolicy(source);
  if (policy.suppressedTargetUuids.includes(resolution.targetUuid)) {
    ATDAL_STATS.suppressed += 1;
    return { linked:false, ...resolution, decision:"suppressed", reason:"gm-unlink-suppression" };
  }

  const links = atDalLinksApi();
  if (!links?.hasCanonicalLink || !links?.linkCanonical) {
    return { linked:false, ...resolution, decision:"unavailable", reason:"campaign-link-api-unavailable" };
  }

  if (!options.assertCurrent && links.hasCanonicalLink({ sourceUuid, targetUuid:resolution.targetUuid })) {
    ATDAL_STATS.alreadyLinked += 1;
    return { linked:false, alreadyLinked:true, ...resolution };
  }

  atDalInternalWrite = true;
  let canonicalSaved=false;
  try {
    if(options.assertCurrent){
      if(!links.linkCanonicalGuarded)throw Error('Guarded canonical API unavailable.');
      await links.linkCanonicalGuarded({sourceUuid,targetUuid:resolution.targetUuid,assertCurrent:options.assertCurrent});
    }else await links.linkCanonical({ sourceUuid, targetUuid:resolution.targetUuid });
    canonicalSaved=true;
    options.assertCurrent?.();
    await atDalWriteProvenance(source, resolution.targetUuid, row, resolution,options.assertCurrent);
    ATDAL_STATS.linked += 1;
    return { linked:true, ...resolution };
  } catch(error){
    if(options.assertCurrent&&canonicalSaved&&!error.partialCommit)error.partialCommit={sourceUuid,targetUuid:resolution.targetUuid,acknowledged:true};
    throw error;
  } finally {
    atDalInternalWrite = false;
  }
}

function atDalOnlyExcludedSourceOccurrences(source,labels,cache) {
  const language=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage;
  if(!language?.prepareDocument||!labels?.length)return false;
  const pages=(source.pages?.contents||[]).map(page=>page.text?.content||'');let saved=cache?.get(source);
  if(!saved||saved.name!==source.name||saved.pages.length!==pages.length||pages.some((html,i)=>html!==saved.pages[i])){saved={name:source.name,pages,structures:pages.map(html=>language.prepareDocument(html,{sourceName:source.name}))};cache?.set(source,saved);}
  let hits=0;
  for(const structure of saved.structures){const text=structure.text;
    for(const label of labels){
      const needle=atDalClean(label);if(!needle)continue;
      const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/['‘’]/gu,"['‘’]");
      for(const match of text.matchAll(new RegExp(escaped,'giu'))){const at=match.index,end=at+match[0].length;hits++;
          if(!language.excludedOccurrence(at,end,structure,{known:true})&&!structure.spans.some(span=>span.kind==='ordinary'&&at>=span.start&&end<=span.end)&&globalThis.AdventurersTomeCandidateEvidence?.occurrenceAllowed?.({text,start:at,end,structure})!==false)return false;
      }
    }
  }
  return hits>0;
}
async function atDalRetireTemplateLinks(options){
  const roleCache=new Map(),catalogue=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.testAILanguage?.catalogSnapshot?.()||[];
  if(game.users?.activeGM?.id!==game.user?.id)return;
  const learning=globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignReviewLearning;
  for(const source of game.journal?.contents||[]){
    if((options.sourceUuid&&source.uuid!==options.sourceUuid)||!['session','quest'].includes(atDalJournalKind(source)))continue;
    const evidence=atDalProvenance(source),choices=Object.values(learning?.all?.()?.sourceChoices?.[source.uuid]||{});
    let changed=false;
    for(const [targetUuid,row]of Object.entries(evidence)){
      const actor=game.actors?.get(targetUuid.match(/^Actor\.([^.]+)$/u)?.[1]);
      if(row.mode!=='deterministic-auto-link-v1')continue;
      const template=globalThis.AdventurersTomeDecisionPolicy?.documentRole(actor)==='template';
      const target=catalogue.find(record=>record.uuid===targetUuid),labels=[row.mentionText,target?.name,...(target?.aliases||[])].filter(Boolean);
      if(!template&&!atDalOnlyExcludedSourceOccurrences(source,labels,roleCache))continue;
      const choice=learning?.decisionFor?.(row.mentionText,{sourceUuid:source.uuid});
      if(choices.some(c=>c.targetUuid===targetUuid)||choice?.targetUuid===targetUuid)continue;
      if((source.pages?.contents||[]).some(p=>String(p.text?.content||'').includes('@UUID['+targetUuid+']')||actor&&String(p.text?.content||'').includes('@Actor['+actor.id+']')))continue;
      options.assertCurrent?.();
      await atDalLinksApi()?.unlinkCanonical?.({sourceUuid:source.uuid,targetUuid});
      delete evidence[targetUuid];changed=true;
    }
    if(changed){options.assertCurrent?.();await source.update({[`flags.${ATDAL_ID}.${ATDAL_PROVENANCE_FLAG}`]:evidence});}
  }
}

async function atDalScan(options = {}) {
  if (!game.user?.isGM) return atDalAudit();
  if (atDalRunning) return atDalAudit();
  atDalRunning = true;
  ATDAL_STATS.scans += 1;

  try {
    await atDalRetireTemplateLinks(options);
    const discovery = atDalDiscoveryApi();
    let snapshot = discovery?.snapshot?.() || null;
    if ((!snapshot || options.rescan === true) && discovery?.scan) {
      snapshot = await discovery.scan({ rescanDiscovery:options.rescanDiscovery === true });
    }
    if (!snapshot) return atDalAudit();

    if(!options.reuseDiscovery)await globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignNewEntityDiscovery?.scan?.({sourceUuid:options.sourceUuid});

    const results = [];
    for (const row of atDalArray(snapshot.mentions).filter(row=>!options.sourceUuid || row.sourceJournalUuid===options.sourceUuid)) {
      if(row.interpretation)continue; // Integrated resolution owns these writes.
      await globalThis.AdventurersTomeIndex?.yieldControl?.();
      options.assertCurrent?.();
      try {
        results.push(await atDalAutoLinkRow(row));
      } catch (error) {
        if(error?.code==='TOME_INDEX_STALE')throw error;
        ATDAL_STATS.failures += 1;
        ATDAL_STATS.lastError = String(error?.message || error);
        results.push({
          linked:false,
          decision:"error",
          text:atDalClean(row?.text),
          sourceUuid:atDalClean(row?.sourceJournalUuid || row?.source?.uuid),
          reason:String(error?.message || error)
        });
      }
    }

    if (!options.reuseDiscovery && results.some((row) => row.linked)) {
      try { await atDalEvidenceApi()?.sync?.({ reason:"deterministic-auto-link" }); }
      catch (_error) {}
      const app = globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.app?.();
      if (app?.rendered) void app.render({ parts:["main"] });
    }

    Hooks.callAll("adventurersTomeDeterministicAutoLinkCompleted", {
      reason:atDalClean(options.reason || "scan"),
      results:atDalClone(results)
    });

    return { ...atDalAudit(), results:atDalClone(results) };
  } catch (error) {
    if(error?.code==='TOME_INDEX_STALE')throw error;
    ATDAL_STATS.failures += 1;
    ATDAL_STATS.lastError = String(error?.message || error);
    console.warn("Adventurer's Tome | Deterministic Auto-Link failed safely", error);
    return atDalAudit();
  } finally {
    atDalRunning = false;
  }
}

function atDalAudit() {
  return {
    contract:ATDAL_CONTRACT,
    version:ATDAL_VERSION,
    healthy:ATDAL_STATS.failures === 0,
    gmOnly:true,
    autoLinkWrites:true,
    autoEntityCreation:false,
    ambiguousAutoLink:false,
    exactNameRequired:true,
    uniqueCanonicalIdentityRequired:true,
    gmUnlinkCreatesSuppression:true,
    supportedTargetTypes:["Actor","Item","JournalEntry"],
    stats:{ ...ATDAL_STATS }
  };
}

function atDalSchedule(reason = "lifecycle", delay = 320) {
  if(game.user?.isGM && globalThis.AdventurersTomeIndex?.request(reason))return;
  if (!game.user?.isGM) return;
  window.clearTimeout(atDalTimer);
  atDalTimer = window.setTimeout(() => {
    atDalTimer = null;
    void atDalScan({ reason }).catch((error) => {
      ATDAL_STATS.failures += 1;
      ATDAL_STATS.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Deterministic Auto-Link scheduled scan failed safely", error);
    });
  }, delay);
}

const ATDAL_API = Object.freeze({
  contract:ATDAL_CONTRACT,
  version:ATDAL_VERSION,
  autoLinkWrites:true,
  autoEntityCreation:false,
  resolveIdentity:(input = {}) => atDalClone(atDalResolveIdentity(input)),
  applyGuardedMention:(row,options={})=>{
    if(typeof options.assertCurrent!=='function'||!options.expectedTargetUuid)throw Error('Guarded mention requires its captured target and input guard.');
    return atDalAutoLinkRow(row,options);
  },
  scan:(options = {}) => atDalScan(options),
  audit:atDalAudit,
  suppress:({ sourceUuid, targetUuid }) => atDalMarkSuppressed(sourceUuid, targetUuid),
  unsuppress:({ sourceUuid, targetUuid }) => atDalClearSuppressed(sourceUuid, targetUuid)
});

function atDalAttach() {
  const module = globalThis.ATTestAI.modules.get(ATDAL_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignDeterministicAutoLink = ATDAL_API;
  return true;
}

Hooks.once("ready", () => {
  atDalAttach();
  atDalSchedule("ready", 480);
  console.info("Adventurer's Tome | Deterministic Campaign Auto-Link v1 ready.");
});

Hooks.on("adventurersTomeSemanticMentionDiscoveryUpdated", () => atDalSchedule("mention-discovery-updated", 360));
Hooks.on("adventurersTomeCampaignEntityLinkChanged", (event = {}) => {
  if (!game.user?.isGM || atDalInternalWrite) return;
  const sourceUuid = atDalClean(event.sourceUuid);
  const targetUuid = atDalClean(event.targetUuid);
  if (!sourceUuid || !targetUuid) return;

  const source = atDalSourceJournal(sourceUuid);
  if (!source) return;

  if (event.linked === false && atDalWasAutoLinked(source, targetUuid)) {
    void atDalMarkSuppressed(sourceUuid, targetUuid);
    return;
  }

  if (event.linked === true) {
    void atDalClearSuppressed(sourceUuid, targetUuid);
  }
});

Hooks.on("renderApplicationV2", () => {
  if (globalThis.ATTestAI.modules.get(ATDAL_ID)?.api?.campaignDeterministicAutoLink !== ATDAL_API) atDalAttach();
});

