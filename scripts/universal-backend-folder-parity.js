const ATBFP_ID = "adventurers-tome";
const ATBFP_CONTRACT = "adventurers-tome-foundry-backend-folder-parity";
const ATBFP_VERSION = 1;
const ATBFP_PROJECTION_FLAG = "backendProjectionV1";
const ATBFP_FOLDER_FLAG = "backendFolderProjectionV1";
const ATBFP_SOURCE_CATEGORY_FLAG = "backendCategory";
const ATBFP_SOURCE_VERSION_FLAG = "backendCategoryVersion";

const ATBFP_BINDINGS = Object.freeze([
  Object.freeze({ category:"npc", label:"NPC", sourceDocumentName:"Actor", aliases:["NPC","NPCs"] }),
  Object.freeze({ category:"npc-group", label:"NPC Groups", sourceDocumentName:"Actor", aliases:["NPC Groups","NPC Group","NPCs Groups"] }),
  Object.freeze({ category:"contact", label:"Contacts", sourceDocumentName:"Actor", aliases:["Contacts","Contact"] }),
  Object.freeze({ category:"item", label:"Items", sourceDocumentName:"Item", aliases:["Items","Item"] }),
  Object.freeze({ category:"faction", label:"Factions", sourceDocumentName:"JournalEntry", aliases:["Factions","Faction"] }),
  Object.freeze({ category:"location", label:"Locations", sourceDocumentName:"JournalEntry", aliases:["Locations","Location","Places","Place"] }),
  Object.freeze({ category:"lore", label:"Lore", sourceDocumentName:"JournalEntry", aliases:["Lore"] })
]);

const ATBFP_STATS = {
  syncs:0,
  sourceRootsAdopted:0,
  sourceDocumentsSeen:0,
  projectionsCreated:0,
  projectionsUpdated:0,
  projectionsReused:0,
  projectionsDeleted:0,
  mirrorFoldersCreated:0,
  mirrorFoldersUpdated:0,
  mirrorFoldersDeleted:0,
  routedFolderCreates:0,
  routedFolderRenames:0,
  routedFolderMoves:0,
  routedFolderDeletes:0,
  routedDocumentMoves:0,
  routedDocumentRenames:0,
  routedDocumentDeletes:0,
  failures:0,
  lastError:""
};

let atBfpSyncing = false;
let atBfpTimer = null;
let atBfpLastSnapshot = null;

function atBfpClean(value) {
  return String(value ?? "").trim();
}

function atBfpNormalize(value) {
  return atBfpClean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function atBfpClone(value) {
  try { return foundry.utils.deepClone(value); }
  catch (_error) {
    try { return JSON.parse(JSON.stringify(value ?? null)); }
    catch (_err) { return value ?? null; }
  }
}

function atBfpParentId(folder) {
  return atBfpClean(folder?.folder?.id ?? folder?.folder);
}

function atBfpFolderPath(folder) {
  const parts = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(atBfpClean(current.name));
    current = game.folders?.get(atBfpParentId(current)) || null;
  }
  return parts.filter(Boolean).join(" › ");
}

function atBfpFolderAncestors(folder) {
  const rows = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    rows.unshift(current);
    current = game.folders?.get(atBfpParentId(current)) || null;
  }
  return rows;
}

function atBfpIsDescendantOf(folder, root) {
  if (!folder || !root) return false;
  return atBfpFolderAncestors(folder).some((entry) => entry.id === root.id);
}

function atBfpCanView(document, user = game.user) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  try {
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    return typeof document.testUserPermission !== "function" || document.testUserPermission(user, observer);
  } catch (_error) {
    return document.visible !== false;
  }
}

function atBfpFolderQuickCreateApi() {
  return game.modules.get(ATBFP_ID)?.api?.folderQuickCreate || null;
}

function atBfpApp() {
  try { return game.modules.get(ATBFP_ID)?.api?.app?.() || null; }
  catch (_error) { return null; }
}

function atBfpProjectionOf(journal) {
  const raw = journal?.getFlag?.(ATBFP_ID, ATBFP_PROJECTION_FLAG);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

function atBfpMirrorOf(folder) {
  const raw = folder?.getFlag?.(ATBFP_ID, ATBFP_FOLDER_FLAG);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

function atBfpIsManagedProjection(journal) {
  return atBfpProjectionOf(journal)?.managed === true;
}

function atBfpIsManagedMirror(folder) {
  return atBfpMirrorOf(folder)?.managed === true;
}

function atBfpWorldProfile(journal) {
  const raw = journal?.getFlag?.(ATBFP_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? atBfpClone(raw) : {};
}

function atBfpSourceUuidFromWorld(journal) {
  const projection = atBfpProjectionOf(journal);
  const profile = atBfpWorldProfile(journal);
  return atBfpClean(
    projection?.sourceUuid
    || journal?.getFlag?.(ATBFP_ID, "quickImportSourceUuid")
    || profile?.sourceUuid
  );
}

function atBfpCategoryFromWorld(journal) {
  const projection = atBfpProjectionOf(journal);
  const profile = atBfpWorldProfile(journal);
  return atBfpClean(projection?.category || profile?.category).toLowerCase();
}

function atBfpDocumentFromUuid(uuid) {
  const value = atBfpClean(uuid);
  let match = /^Actor\.([^.]+)$/.exec(value);
  if (match) return game.actors?.get(match[1]) || null;
  match = /^Item\.([^.]+)$/.exec(value);
  if (match) return game.items?.get(match[1]) || null;
  match = /^JournalEntry\.([^.]+)$/.exec(value);
  if (match) return game.journal?.get(match[1]) || null;
  return null;
}

function atBfpCollection(documentName) {
  if (documentName === "Actor") return game.actors?.contents || [];
  if (documentName === "Item") return game.items?.contents || [];
  if (documentName === "JournalEntry") return game.journal?.contents || [];
  return [];
}

function atBfpBinding(category) {
  return ATBFP_BINDINGS.find((entry) => entry.category === atBfpClean(category).toLowerCase()) || null;
}

function atBfpStandardFolderMap(bootstrap = null) {
  const folders = bootstrap?.folders || {};
  const out = {};
  for (const binding of ATBFP_BINDINGS) {
    const direct = folders?.[binding.category] || null;
    if (direct) out[binding.category] = direct;
  }
  return out;
}

function atBfpTomeFolderIds(bootstrap) {
  const ids = new Set();
  const root = bootstrap?.root;
  if (!root) return ids;
  for (const folder of game.folders?.contents || []) {
    if (folder.type !== "JournalEntry") continue;
    if (atBfpIsDescendantOf(folder, root)) ids.add(folder.id);
  }
  return ids;
}

function atBfpSourceCategory(folder) {
  return atBfpClean(folder?.getFlag?.(ATBFP_ID, ATBFP_SOURCE_CATEGORY_FLAG)).toLowerCase();
}

function atBfpAliasMatches(folder, binding) {
  const name = atBfpNormalize(folder?.name);
  return binding.aliases.some((alias) => atBfpNormalize(alias) === name);
}

function atBfpSourceRoots(binding, bootstrap) {
  const tomeFolderIds = atBfpTomeFolderIds(bootstrap);
  return [...(game.folders?.contents || [])]
    .filter((folder) => folder.type === binding.sourceDocumentName)
    .filter((folder) => binding.sourceDocumentName !== "JournalEntry" || !tomeFolderIds.has(folder.id))
    .filter((folder) => {
      const flagged = atBfpSourceCategory(folder);
      return flagged === binding.category || (!flagged && atBfpAliasMatches(folder, binding));
    })
    .filter((folder) => {
      const ancestors = atBfpFolderAncestors(folder).slice(0, -1);
      return !ancestors.some((ancestor) => atBfpSourceCategory(ancestor) === binding.category);
    })
    .sort((a, b) => atBfpFolderPath(a).localeCompare(atBfpFolderPath(b), game.i18n?.lang, { numeric:true }));
}

async function atBfpAdoptSourceRoots(binding, roots) {
  if (!game.user?.isGM) return;
  for (const folder of roots) {
    const category = atBfpSourceCategory(folder);
    if (category === binding.category && Number(folder.getFlag?.(ATBFP_ID, ATBFP_SOURCE_VERSION_FLAG) || 0) >= ATBFP_VERSION) continue;
    await folder.update({
      [`flags.${ATBFP_ID}.${ATBFP_SOURCE_CATEGORY_FLAG}`]:binding.category,
      [`flags.${ATBFP_ID}.${ATBFP_SOURCE_VERSION_FLAG}`]:ATBFP_VERSION
    }, { render:false, adventurersTomeBackendParity:true });
    ATBFP_STATS.sourceRootsAdopted += 1;
  }
}

function atBfpRootForFolder(folder, roots) {
  if (!folder) return null;
  const ancestors = atBfpFolderAncestors(folder);
  return roots.find((root) => ancestors.some((entry) => entry.id === root.id)) || null;
}

function atBfpRelativeFolders(folder, root) {
  if (!folder || !root) return [];
  const chain = atBfpFolderAncestors(folder);
  const index = chain.findIndex((entry) => entry.id === root.id);
  if (index < 0) return [];
  return chain.slice(index + 1);
}

function atBfpSourceDocs(binding, roots) {
  const rows = [];
  for (const document of atBfpCollection(binding.sourceDocumentName)) {
    if (!document?.folder || !atBfpCanView(document)) continue;
    if (binding.sourceDocumentName === "JournalEntry" && atBfpIsManagedProjection(document)) continue;
    const root = atBfpRootForFolder(document.folder, roots);
    if (!root) continue;
    rows.push({ document, root, relativeFolders:atBfpRelativeFolders(document.folder, root) });
  }
  return rows;
}

function atBfpExistingMirrorMap(category) {
  const map = new Map();
  for (const folder of game.folders?.contents || []) {
    if (folder.type !== "JournalEntry") continue;
    const mirror = atBfpMirrorOf(folder);
    if (!mirror?.managed || mirror.category !== category || !mirror.sourceFolderId) continue;
    map.set(atBfpClean(mirror.sourceFolderId), folder);
  }
  return map;
}

async function atBfpEnsureMirrorFolder(category, sourceFolder, sourceRoot, parentTarget, mirrorMap) {
  if (!sourceFolder) return parentTarget;
  const key = atBfpClean(sourceFolder.id);
  let mirror = mirrorMap.get(key) || null;
  const flags = {
    managed:true,
    version:ATBFP_VERSION,
    category,
    sourceFolderId:key,
    sourceRootId:atBfpClean(sourceRoot?.id),
    sourceDocumentName:atBfpClean(sourceRoot?.type),
    sourceFolderPath:atBfpFolderPath(sourceFolder)
  };

  if (!mirror) {
    mirror = await Folder.create({
      name:sourceFolder.name,
      type:"JournalEntry",
      folder:parentTarget.id,
      flags:{ [ATBFP_ID]:{ [ATBFP_FOLDER_FLAG]:flags } }
    }, { adventurersTomeBackendParity:true });
    mirrorMap.set(key, mirror);
    ATBFP_STATS.mirrorFoldersCreated += 1;
    return mirror;
  }

  const current = atBfpMirrorOf(mirror) || {};
  const parentId = atBfpParentId(mirror);
  const changed = mirror.name !== sourceFolder.name
    || parentId !== parentTarget.id
    || current.sourceFolderPath !== flags.sourceFolderPath
    || current.sourceRootId !== flags.sourceRootId
    || current.version !== ATBFP_VERSION;

  if (changed) {
    await mirror.update({
      name:sourceFolder.name,
      folder:parentTarget.id,
      [`flags.${ATBFP_ID}.${ATBFP_FOLDER_FLAG}`]:flags
    }, { render:false, adventurersTomeBackendParity:true });
    ATBFP_STATS.mirrorFoldersUpdated += 1;
  }
  return mirror;
}

async function atBfpTargetFolderForSource(category, sourceRoot, relativeFolders, categoryTarget, mirrorMap) {
  let parent = categoryTarget;
  for (const sourceFolder of relativeFolders) {
    parent = await atBfpEnsureMirrorFolder(category, sourceFolder, sourceRoot, parent, mirrorMap);
  }
  return parent;
}

function atBfpPlainText(value) {
  const raw = atBfpClean(value);
  if (!raw) return "";
  try {
    const host = document.createElement("div");
    host.innerHTML = raw;
    return atBfpClean(host.textContent || host.innerText).replace(/\s+/g, " ");
  } catch (_error) {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function atBfpSourceSummary(source) {
  if (!source) return "";
  if (source.documentName === "JournalEntry") {
    for (const page of source.pages?.contents || []) {
      const text = atBfpPlainText(page?.text?.content || "");
      if (text) return text.slice(0, 320);
    }
    return "";
  }

  const system = source.system || {};
  const candidates = [
    system.summary,
    system.description,
    system.biography,
    system.concept,
    system.notes
  ];
  for (const value of candidates) {
    const text = atBfpPlainText(typeof value === "object" ? (value?.value || value?.content || "") : value);
    if (text) return text.slice(0, 320);
  }
  return "";
}

function atBfpProjectionProfile(source, category, current = {}) {
  const profile = current && typeof current === "object" && !Array.isArray(current) ? atBfpClone(current) : {};
  profile.category = category;
  profile.subtitle = source.documentName === "Actor"
    ? (source.type ? String(source.type).replace(/\b\w/g, (char) => char.toUpperCase()) : "Actor")
    : source.documentName === "Item"
      ? (source.type ? String(source.type).replace(/\b\w/g, (char) => char.toUpperCase()) : "Item")
      : "Foundry Journal";
  profile.summary = atBfpSourceSummary(source);
  profile.body = profile.summary;
  profile.heroImage = atBfpClean(source.img);
  profile.sourceUuid = atBfpClean(source.uuid);
  profile.sourceDocumentType = atBfpClean(source.documentName);
  profile.actorId = source.documentName === "Actor" ? atBfpClean(source.id) : "";
  profile.itemId = source.documentName === "Item" ? atBfpClean(source.id) : "";
  profile.backendManaged = true;
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  return profile;
}

function atBfpEquivalentRepresentations(category, sourceUuid) {
  return [...(game.journal?.contents || [])].filter((journal) => {
    const projection = atBfpProjectionOf(journal);
    if (projection?.managed && projection.category === category && atBfpClean(projection.sourceUuid) === sourceUuid) return true;
    return atBfpCategoryFromWorld(journal) === category && atBfpSourceUuidFromWorld(journal) === sourceUuid;
  });
}

function atBfpProjectionData(source, category, targetFolder, existing = null, sourceRoot = null) {
  const profile = atBfpProjectionProfile(source, category, existing ? atBfpWorldProfile(existing) : {});
  const projection = {
    managed:true,
    version:ATBFP_VERSION,
    category,
    sourceUuid:atBfpClean(source.uuid),
    sourceDocumentName:atBfpClean(source.documentName),
    sourceId:atBfpClean(source.id),
    sourceFolderId:atBfpClean(source.folder?.id ?? source.folder),
    sourceRootId:atBfpClean(sourceRoot?.id),
    sourceFolderPath:atBfpFolderPath(source.folder),
    active:true,
    lastSeenAt:Date.now()
  };
  const ownership = atBfpClone(source.ownership || { default:CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0 });
  return {
    name:source.name,
    img:source.img || null,
    folder:targetFolder.id,
    ownership,
    flags:{
      [ATBFP_ID]:{
        type:"world",
        worldProfile:profile,
        quickImportSourceUuid:source.uuid,
        quickImportSourceType:source.documentName,
        [ATBFP_PROJECTION_FLAG]:projection
      }
    }
  };
}

function atBfpProjectionNeedsUpdate(journal, data) {
  const profile = atBfpWorldProfile(journal);
  const projection = atBfpProjectionOf(journal) || {};
  const desiredFlags = data.flags?.[ATBFP_ID] || {};
  const desiredProjection = desiredFlags[ATBFP_PROJECTION_FLAG] || {};
  const desiredProfile = desiredFlags.worldProfile || {};
  const ownershipNow = JSON.stringify(journal.ownership || {});
  const ownershipNext = JSON.stringify(data.ownership || {});
  return journal.name !== data.name
    || atBfpClean(journal.img) !== atBfpClean(data.img)
    || atBfpClean(journal.folder?.id ?? journal.folder) !== atBfpClean(data.folder)
    || ownershipNow !== ownershipNext
    || projection.sourceFolderPath !== desiredProjection.sourceFolderPath
    || projection.sourceFolderId !== desiredProjection.sourceFolderId
    || projection.sourceRootId !== desiredProjection.sourceRootId
    || projection.version !== ATBFP_VERSION
    || profile.summary !== desiredProfile.summary
    || profile.subtitle !== desiredProfile.subtitle
    || profile.heroImage !== desiredProfile.heroImage
    || profile.sourceUuid !== desiredProfile.sourceUuid
    || profile.sourceDocumentType !== desiredProfile.sourceDocumentType;
}

async function atBfpEnsureProjection(source, category, targetFolder, sourceRoot, desiredKeys) {
  const sourceUuid = atBfpClean(source.uuid);
  const key = `${category}|${sourceUuid}`;
  desiredKeys.add(key);

  const representations = atBfpEquivalentRepresentations(category, sourceUuid);
  const managed = representations.filter(atBfpIsManagedProjection);
  const manual = representations.filter((journal) => !atBfpIsManagedProjection(journal));

  if (manual.length) {
    ATBFP_STATS.projectionsReused += 1;
    for (const duplicate of managed) {
      await duplicate.delete({ adventurersTomeBackendParity:true });
      ATBFP_STATS.projectionsDeleted += 1;
    }
    return manual[0];
  }

  let journal = managed[0] || null;
  for (const duplicate of managed.slice(1)) {
    await duplicate.delete({ adventurersTomeBackendParity:true });
    ATBFP_STATS.projectionsDeleted += 1;
  }

  const data = atBfpProjectionData(source, category, targetFolder, journal, sourceRoot);
  if (!journal) {
    journal = await JournalEntry.create(data, { adventurersTomeBackendParity:true });
    ATBFP_STATS.projectionsCreated += 1;
    return journal;
  }

  if (atBfpProjectionNeedsUpdate(journal, data)) {
    await journal.update({
      name:data.name,
      img:data.img,
      folder:data.folder,
      ownership:data.ownership,
      [`flags.${ATBFP_ID}.type`]:"world",
      [`flags.${ATBFP_ID}.worldProfile`]:data.flags[ATBFP_ID].worldProfile,
      [`flags.${ATBFP_ID}.quickImportSourceUuid`]:data.flags[ATBFP_ID].quickImportSourceUuid,
      [`flags.${ATBFP_ID}.quickImportSourceType`]:data.flags[ATBFP_ID].quickImportSourceType,
      [`flags.${ATBFP_ID}.${ATBFP_PROJECTION_FLAG}`]:data.flags[ATBFP_ID][ATBFP_PROJECTION_FLAG]
    }, { render:false, adventurersTomeBackendParity:true });
    ATBFP_STATS.projectionsUpdated += 1;
  }
  return journal;
}

async function atBfpCleanupProjections(desiredKeys) {
  for (const journal of [...(game.journal?.contents || [])]) {
    const projection = atBfpProjectionOf(journal);
    if (!projection?.managed) continue;
    const key = `${atBfpClean(projection.category)}|${atBfpClean(projection.sourceUuid)}`;
    if (desiredKeys.has(key)) continue;
    await journal.delete({ adventurersTomeBackendParity:true });
    ATBFP_STATS.projectionsDeleted += 1;
  }
}

async function atBfpCleanupMirrorFolders(desiredMirrorIds) {
  const mirrors = [...(game.folders?.contents || [])]
    .filter((folder) => folder.type === "JournalEntry" && atBfpIsManagedMirror(folder))
    .sort((a, b) => atBfpFolderAncestors(b).length - atBfpFolderAncestors(a).length);

  for (const folder of mirrors) {
    const mirror = atBfpMirrorOf(folder);
    const key = atBfpClean(mirror?.sourceFolderId);
    if (desiredMirrorIds.has(key)) continue;

    const childFolder = [...(game.folders?.contents || [])].some((candidate) =>
      candidate.type === "JournalEntry" && atBfpParentId(candidate) === folder.id
    );
    const childJournal = [...(game.journal?.contents || [])].some((journal) =>
      atBfpClean(journal.folder?.id ?? journal.folder) === folder.id
    );
    if (childFolder || childJournal) continue;

    await folder.delete({ adventurersTomeBackendParity:true });
    ATBFP_STATS.mirrorFoldersDeleted += 1;
  }
}

function atBfpSectionAudit(bootstrap) {
  const sections = [
    ["sessions", bootstrap?.sessions],
    ["quests", bootstrap?.quests],
    ["rules", bootstrap?.rules]
  ];
  return sections.map(([section, folder]) => ({
    section,
    backend:"JournalEntry",
    folderId:atBfpClean(folder?.id),
    path:folder ? atBfpFolderPath(folder) : "",
    documents:[...(game.journal?.contents || [])].filter((journal) => atBfpIsDescendantOf(journal.folder, folder)).length,
    directFoundryAuthority:true
  }));
}

async function atBfpBuildSnapshot(bootstrap, bindingsState, reason) {
  const managed = [...(game.journal?.contents || [])].filter(atBfpIsManagedProjection);
  const mirrors = [...(game.folders?.contents || [])].filter(atBfpIsManagedMirror);
  const categories = bindingsState.map((row) => {
    const projections = managed.filter((journal) => atBfpProjectionOf(journal)?.category === row.category);
    return {
      category:row.category,
      targetFolderId:atBfpClean(row.targetFolder?.id),
      targetPath:row.targetFolder ? atBfpFolderPath(row.targetFolder) : "",
      sourceDocumentName:row.binding.sourceDocumentName,
      sourceRoots:row.roots.map((folder) => ({
        id:folder.id,
        name:folder.name,
        path:atBfpFolderPath(folder),
        flaggedCategory:atBfpSourceCategory(folder)
      })),
      sourceDocuments:row.sourceDocs.length,
      managedProjections:projections.length,
      manualRepresentations:row.manualRepresentations,
      missing:Math.max(0, row.sourceDocs.length - projections.length - row.manualRepresentations)
    };
  });

  return {
    contract:ATBFP_CONTRACT,
    version:ATBFP_VERSION,
    generatedAt:Date.now(),
    reason:atBfpClean(reason || "sync"),
    foundryIsAuthority:true,
    tomeIsPresentationLayer:true,
    canonicalUuidAuthority:true,
    sections:atBfpSectionAudit(bootstrap),
    categories,
    managedProjectionCount:managed.length,
    managedMirrorFolderCount:mirrors.length,
    healthy:ATBFP_STATS.failures === 0 && categories.every((row) => row.missing === 0),
    stats:{ ...ATBFP_STATS }
  };
}

async function atBfpSync(options = {}) {
  if (atBfpSyncing) return atBfpClone(atBfpLastSnapshot);
  if (!game.user?.isGM) return atBfpClone(atBfpLastSnapshot);

  atBfpSyncing = true;
  ATBFP_STATS.syncs += 1;
  try {
    const bootstrap = await atBfpFolderQuickCreateApi()?.bootstrap?.();
    if (!bootstrap?.world) throw new Error("Tome standard folder bootstrap is unavailable.");

    const targetFolders = atBfpStandardFolderMap(bootstrap);
    const desiredProjectionKeys = new Set();
    const desiredMirrorIds = new Set();
    const bindingsState = [];

    for (const binding of ATBFP_BINDINGS) {
      const targetFolder = targetFolders[binding.category];
      if (!targetFolder) continue;

      const roots = atBfpSourceRoots(binding, bootstrap);
      await atBfpAdoptSourceRoots(binding, roots);
      const sourceDocs = atBfpSourceDocs(binding, roots);
      ATBFP_STATS.sourceDocumentsSeen += sourceDocs.length;
      const mirrorMap = atBfpExistingMirrorMap(binding.category);
      let manualRepresentations = 0;

      for (const row of sourceDocs) {
        let target = targetFolder;
        for (const sourceFolder of row.relativeFolders) {
          const sourceParent = game.folders?.get(atBfpParentId(sourceFolder));
          let parentTarget = targetFolder;
          if (sourceParent && sourceParent.id !== row.root.id) {
            const parentMirror = mirrorMap.get(sourceParent.id);
            if (parentMirror) parentTarget = parentMirror;
          }
          target = await atBfpEnsureMirrorFolder(binding.category, sourceFolder, row.root, parentTarget, mirrorMap);
          desiredMirrorIds.add(sourceFolder.id);
        }

        const existing = atBfpEquivalentRepresentations(binding.category, row.document.uuid);
        if (existing.some((journal) => !atBfpIsManagedProjection(journal))) manualRepresentations += 1;
        await atBfpEnsureProjection(row.document, binding.category, target, row.root, desiredProjectionKeys);
      }

      bindingsState.push({ binding, category:binding.category, targetFolder, roots, sourceDocs, manualRepresentations });
    }

    await atBfpCleanupProjections(desiredProjectionKeys);
    await atBfpCleanupMirrorFolders(desiredMirrorIds);

    atBfpLastSnapshot = await atBfpBuildSnapshot(bootstrap, bindingsState, options.reason || "sync");
    try { Hooks.callAll("adventurersTomeBackendFolderParityUpdated", atBfpClone(atBfpLastSnapshot)); } catch (_error) {}
    return atBfpClone(atBfpLastSnapshot);
  } catch (error) {
    ATBFP_STATS.failures += 1;
    ATBFP_STATS.lastError = String(error?.message || error);
    console.error("Adventurer's Tome | Universal Foundry backend folder parity sync failed", error);
    throw error;
  } finally {
    atBfpSyncing = false;
  }
}

function atBfpSchedule(reason = "lifecycle", delay = 180) {
  if (!game.user?.isGM || atBfpSyncing) return;
  window.clearTimeout(atBfpTimer);
  atBfpTimer = window.setTimeout(() => {
    atBfpTimer = null;
    void atBfpSync({ reason }).catch((error) => {
      console.warn("Adventurer's Tome | Backend folder parity scheduled sync failed safely", error);
    });
  }, delay);
}

function atBfpBackendContextForTomeFolder(folder) {
  if (!folder || folder.type !== "JournalEntry") return null;

  const mirror = atBfpMirrorOf(folder);
  if (mirror?.managed) {
    const sourceFolder = game.folders?.get(atBfpClean(mirror.sourceFolderId)) || null;
    const binding = atBfpBinding(mirror.category);
    const sourceRoot = game.folders?.get(atBfpClean(mirror.sourceRootId)) || null;
    if (binding && sourceFolder) {
      return {
        category:binding.category,
        binding,
        sourceFolder,
        sourceRoot,
        targetFolder:folder,
        managedMirror:true
      };
    }
  }

  const standardType = atBfpClean(folder.getFlag?.(ATBFP_ID, "standardFolder")).toLowerCase();
  const binding = atBfpBinding(standardType);
  if (!binding || binding.sourceDocumentName === "JournalEntry") return null;

  const roots = [...(game.folders?.contents || [])]
    .filter((candidate) => candidate.type === binding.sourceDocumentName && atBfpSourceCategory(candidate) === binding.category)
    .sort((a, b) => atBfpFolderPath(a).localeCompare(atBfpFolderPath(b)));

  const sourceRoot = roots[0] || null;
  if (!sourceRoot) return null;
  return {
    category:binding.category,
    binding,
    sourceFolder:sourceRoot,
    sourceRoot,
    targetFolder:folder,
    managedMirror:false
  };
}

async function atBfpCreateBackendFolder(tomeParent, name) {
  if (!game.user?.isGM) throw new Error("Backend folder writes are GM-only.");
  const context = atBfpBackendContextForTomeFolder(tomeParent);
  if (!context) return null;
  const cleanName = atBfpClean(name);
  if (!cleanName) return null;

  const folder = await Folder.create({
    name:cleanName,
    type:context.binding.sourceDocumentName,
    folder:context.sourceFolder.id
  }, { adventurersTomeBackendParity:true });
  ATBFP_STATS.routedFolderCreates += 1;
  await atBfpSync({ reason:"tome-folder-create" });
  return folder;
}

async function atBfpRenameBackendFolder(tomeFolder, name) {
  if (!game.user?.isGM) throw new Error("Backend folder writes are GM-only.");
  const context = atBfpBackendContextForTomeFolder(tomeFolder);
  if (!context?.managedMirror) return false;
  const cleanName = atBfpClean(name);
  if (!cleanName) return false;
  await context.sourceFolder.update({ name:cleanName }, { adventurersTomeBackendParity:true });
  ATBFP_STATS.routedFolderRenames += 1;
  await atBfpSync({ reason:"tome-folder-rename" });
  return true;
}

async function atBfpDeleteBackendFolder(tomeFolder) {
  if (!game.user?.isGM) throw new Error("Backend folder writes are GM-only.");
  const context = atBfpBackendContextForTomeFolder(tomeFolder);
  if (!context?.managedMirror) return false;

  const sourceId = context.sourceFolder.id;
  const hasChildren = [...(game.folders?.contents || [])].some((folder) =>
    folder.type === context.binding.sourceDocumentName && atBfpParentId(folder) === sourceId
  );
  const hasDocuments = atBfpCollection(context.binding.sourceDocumentName).some((document) =>
    atBfpClean(document.folder?.id ?? document.folder) === sourceId
  );
  if (hasChildren || hasDocuments) throw new Error("Backend folder is not empty.");

  await context.sourceFolder.delete({ adventurersTomeBackendParity:true });
  ATBFP_STATS.routedFolderDeletes += 1;
  await atBfpSync({ reason:"tome-folder-delete" });
  return true;
}

async function atBfpMoveBackendFolder(tomeFolder, targetTomeFolder) {
  if (!game.user?.isGM) throw new Error("Backend folder writes are GM-only.");
  const source = atBfpBackendContextForTomeFolder(tomeFolder);
  const target = atBfpBackendContextForTomeFolder(targetTomeFolder);
  if (!source?.managedMirror || !target) return false;
  if (source.binding.sourceDocumentName !== target.binding.sourceDocumentName || source.category !== target.category) {
    throw new Error("Backend folders can only move within the same canonical category.");
  }
  if (source.sourceFolder.id === target.sourceFolder.id || atBfpIsDescendantOf(target.sourceFolder, source.sourceFolder)) {
    throw new Error("Backend folder cannot move into itself or one of its descendants.");
  }

  await source.sourceFolder.update({ folder:target.sourceFolder.id }, { adventurersTomeBackendParity:true });
  ATBFP_STATS.routedFolderMoves += 1;
  await atBfpSync({ reason:"tome-folder-move" });
  return true;
}

function atBfpSourceForProjection(journal) {
  if (!atBfpIsManagedProjection(journal)) return null;
  return atBfpDocumentFromUuid(atBfpProjectionOf(journal)?.sourceUuid);
}

async function atBfpMoveBackendDocument(journal, targetTomeFolder) {
  if (!game.user?.isGM) throw new Error("Backend document writes are GM-only.");
  const source = atBfpSourceForProjection(journal);
  const target = atBfpBackendContextForTomeFolder(targetTomeFolder);
  const projection = atBfpProjectionOf(journal);
  if (!source || !target || !projection?.managed) return false;
  if (source.documentName !== target.binding.sourceDocumentName) {
    throw new Error("This source document cannot move into that backend category.");
  }

  await source.update({ folder:target.sourceFolder.id }, { render:false, adventurersTomeBackendParity:true });
  ATBFP_STATS.routedDocumentMoves += 1;
  await atBfpSync({ reason:"tome-document-move" });
  return true;
}

async function atBfpRenameBackendDocument(journal, name) {
  if (!game.user?.isGM) throw new Error("Backend document writes are GM-only.");
  const source = atBfpSourceForProjection(journal);
  if (!source) return false;
  const cleanName = atBfpClean(name);
  if (!cleanName) return false;
  await source.update({ name:cleanName }, { render:false, adventurersTomeBackendParity:true });
  ATBFP_STATS.routedDocumentRenames += 1;
  await atBfpSync({ reason:"tome-document-rename" });
  return true;
}

async function atBfpDeleteBackendDocument(journal) {
  if (!game.user?.isGM) throw new Error("Backend document writes are GM-only.");
  const source = atBfpSourceForProjection(journal);
  if (!source) return false;
  await source.delete({ adventurersTomeBackendParity:true });
  ATBFP_STATS.routedDocumentDeletes += 1;
  await atBfpSync({ reason:"tome-document-delete" });
  return true;
}

function atBfpAudit() {
  const snapshot = atBfpLastSnapshot || {
    contract:ATBFP_CONTRACT,
    version:ATBFP_VERSION,
    generatedAt:0,
    foundryIsAuthority:true,
    tomeIsPresentationLayer:true,
    canonicalUuidAuthority:true,
    sections:[],
    categories:[],
    managedProjectionCount:0,
    managedMirrorFolderCount:0,
    healthy:ATBFP_STATS.failures === 0,
    stats:{ ...ATBFP_STATS }
  };
  return atBfpClone(snapshot);
}

function atBfpRegistry() {
  return ATBFP_BINDINGS.map((binding) => ({
    ...binding,
    aliases:[...binding.aliases],
    sourceOfTruth:"Foundry",
    canonicalAuthority:"source-document-uuid"
  }));
}

const ATBFP_API = Object.freeze({
  contract:ATBFP_CONTRACT,
  version:ATBFP_VERSION,
  foundryIsAuthority:true,
  tomeIsPresentationLayer:true,
  registry:atBfpRegistry,
  sync:atBfpSync,
  schedule:atBfpSchedule,
  audit:atBfpAudit,
  isManagedProjection:atBfpIsManagedProjection,
  isManagedMirror:atBfpIsManagedMirror,
  sourceForProjection:atBfpSourceForProjection,
  backendContextForTomeFolder:atBfpBackendContextForTomeFolder,
  createFolder:atBfpCreateBackendFolder,
  renameFolder:atBfpRenameBackendFolder,
  moveFolder:atBfpMoveBackendFolder,
  deleteFolder:atBfpDeleteBackendFolder,
  moveDocument:atBfpMoveBackendDocument,
  renameDocument:atBfpRenameBackendDocument,
  deleteDocument:atBfpDeleteBackendDocument
});

function atBfpAttach() {
  const module = game.modules.get(ATBFP_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.backendFolderParity = ATBFP_API;
  return true;
}

Hooks.once("ready", () => {
  atBfpAttach();
  if (game.user?.isGM) atBfpSchedule("ready", 260);
  console.info("Adventurer's Tome | Universal Foundry Backend Folder Parity v1 ready.");
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(ATBFP_ID)?.api?.backendFolderParity !== ATBFP_API) atBfpAttach();
});

for (const hookName of [
  "createActor","updateActor","deleteActor",
  "createItem","updateItem","deleteItem",
  "createJournalEntry","updateJournalEntry","deleteJournalEntry",
  "createJournalEntryPage","updateJournalEntryPage","deleteJournalEntryPage",
  "createFolder","updateFolder","deleteFolder"
]) {
  Hooks.on(hookName, (_document, _changes, options = {}) => {
    if (atBfpSyncing || options?.adventurersTomeBackendParity === true) return;
    atBfpSchedule(hookName, 180);
  });
}

Hooks.on("adventurersTomeFolderBootstrapComplete", () => {
  if (!atBfpSyncing) atBfpSchedule("folder-bootstrap", 120);
});
