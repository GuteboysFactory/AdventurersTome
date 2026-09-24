const ATFQ_MODULE_ID = "adventurers-tome";
const ATFQ_CONTRACT = "adventurers-tome-folder-quick-create";
const ATFQ_VERSION = 1;
const ATFQ_FOLDER_FLAG = "standardFolder";
const ATFQ_FOLDER_VERSION_FLAG = "standardFolderVersion";

const ATFQ_CORE_FOLDERS = Object.freeze([
  Object.freeze({ type:"npc", label:"NPC", aliases:["NPC", "NPCs"], icon:"fa-user", profileCategory:"npc", mode:"native-npc" }),
  Object.freeze({ type:"npc-group", label:"NPC Groups", aliases:["NPC Groups", "NPCs Groups", "NPC Group"], icon:"fa-people-group", profileCategory:"npc", mode:"native-npc-group" }),
  Object.freeze({ type:"contact", label:"Contacts", aliases:["Contacts", "Contact"], icon:"fa-address-card", profileCategory:"contact", mode:"generic" }),
  Object.freeze({ type:"faction", label:"Factions", aliases:["Factions", "Faction"], icon:"fa-flag", profileCategory:"faction", mode:"generic" }),
  Object.freeze({ type:"item", label:"Items", aliases:["Items", "Item"], icon:"fa-gem", profileCategory:"item", mode:"generic" }),
  Object.freeze({ type:"location", label:"Locations", aliases:["Locations", "Location"], icon:"fa-location-dot", profileCategory:"location", mode:"generic" }),
  Object.freeze({ type:"lore", label:"Lore", aliases:["Lore"], icon:"fa-book", profileCategory:"lore", mode:"generic" })
]);

const ATFQ_TEMPLATES = Object.freeze({
  contact:Object.freeze([
    Object.freeze({ id:"blank", name:"Blank Contact", icon:"fa-address-card", subtitle:"Contact", summary:"A person, ally, rival or useful connection.", body:"", facts:[] }),
    Object.freeze({ id:"ally", name:"Trusted Ally", icon:"fa-handshake", subtitle:"Ally", summary:"A dependable contact who is willing to help when it matters.", body:"<p>What do they want? Why do they trust the group? What could put that trust at risk?</p>", facts:[["Relationship","Ally"],["Availability",""],["Leverage",""]] }),
    Object.freeze({ id:"patron", name:"Patron / Employer", icon:"fa-coins", subtitle:"Patron", summary:"A contact with resources, influence, work or expectations.", body:"<p>What can this patron provide, and what do they expect in return?</p>", facts:[["Relationship","Patron"],["Resources",""],["Current Request",""]] }),
    Object.freeze({ id:"informant", name:"Informant", icon:"fa-user-secret", subtitle:"Informant", summary:"A source of rumours, secrets and hard-to-find information.", body:"<p>What do they know? What do they fear? What price do they demand?</p>", facts:[["Relationship","Informant"],["Reliability",""],["Price",""]] }),
    Object.freeze({ id:"rival", name:"Rival", icon:"fa-user-ninja", subtitle:"Rival", summary:"A recurring contact whose goals conflict with the group.", body:"<p>What do they compete over, and what line will they refuse to cross?</p>", facts:[["Relationship","Rival"],["Goal",""],["Pressure Point",""]] })
  ]),
  faction:Object.freeze([
    Object.freeze({ id:"blank", name:"Blank Faction", icon:"fa-flag", subtitle:"Faction", summary:"A group with shared identity, resources and goals.", body:"", facts:[] }),
    Object.freeze({ id:"guild", name:"Guild / Company", icon:"fa-briefcase", subtitle:"Guild", summary:"An organized professional, mercantile or craft faction.", body:"<p>What does the guild control? Who leads it? Who competes with it?</p>", facts:[["Leader",""],["Headquarters",""],["Resources",""],["Goal",""]] }),
    Object.freeze({ id:"order", name:"Order / Brotherhood", icon:"fa-shield-halved", subtitle:"Order", summary:"A disciplined organization united by duty, creed or tradition.", body:"<p>What oath binds the order, and what threatens its purpose?</p>", facts:[["Leader",""],["Creed",""],["Base",""],["Enemy",""]] }),
    Object.freeze({ id:"house", name:"Noble House", icon:"fa-crown", subtitle:"Noble House", summary:"A dynasty built on bloodline, holdings, alliances and ambition.", body:"<p>What does the house want, and which alliance or feud defines it?</p>", facts:[["Head",""],["Seat",""],["Ally",""],["Rival",""]] }),
    Object.freeze({ id:"cult", name:"Cult / Secret Society", icon:"fa-eye", subtitle:"Secret Society", summary:"A hidden group with beliefs, rituals and concealed objectives.", body:"<p>What do they believe? What are they hiding? How does someone recognize a member?</p>", facts:[["Leader",""],["Belief",""],["Secret",""],["Sign",""]] })
  ]),
  item:Object.freeze([
    Object.freeze({ id:"blank", name:"Blank Item", icon:"fa-gem", subtitle:"Item", summary:"A notable object, treasure or campaign item.", body:"", facts:[] }),
    Object.freeze({ id:"artifact", name:"Artifact / Relic", icon:"fa-ring", subtitle:"Artifact", summary:"An important object with history, power or symbolic value.", body:"<p>Who made it? Why does it matter now? What cost or danger follows it?</p>", facts:[["Origin",""],["Known Power",""],["Current Holder",""],["Condition",""]] }),
    Object.freeze({ id:"key-item", name:"Key Item / Clue", icon:"fa-key", subtitle:"Key Item", summary:"An object that unlocks a place, mystery, relationship or plot.", body:"<p>What does it unlock or prove? Who else wants it?</p>", facts:[["Purpose",""],["Found At",""],["Wanted By",""]] }),
    Object.freeze({ id:"treasure", name:"Treasure", icon:"fa-coins", subtitle:"Treasure", summary:"Valuable loot with a story, owner or consequence.", body:"<p>What makes this treasure distinctive, and who might recognize it?</p>", facts:[["Value",""],["Origin",""],["Claimed By",""]] })
  ]),
  location:Object.freeze([
    Object.freeze({ id:"blank", name:"Blank Location", icon:"fa-location-dot", subtitle:"Location", summary:"A place in the campaign world.", body:"", facts:[] }),
    Object.freeze({ id:"settlement", name:"Settlement", icon:"fa-city", subtitle:"Settlement", summary:"A village, town, city or inhabited stronghold.", body:"<p>What is this place known for? Who holds power? What trouble is close?</p>", facts:[["Region",""],["Population",""],["Authority",""],["Known For",""]] }),
    Object.freeze({ id:"inn", name:"Inn / Tavern", icon:"fa-martini-glass", subtitle:"Inn / Tavern", summary:"A social hub for rumours, meetings, shelter and trouble.", body:"<p>Who runs it? Who gathers here? What rumour is circulating tonight?</p>", facts:[["Keeper",""],["Settlement",""],["Clientele",""],["Rumour",""]] }),
    Object.freeze({ id:"ruin", name:"Ruin / Ancient Site", icon:"fa-landmark", subtitle:"Ruin", summary:"A dangerous or mysterious remnant of the past.", body:"<p>Who built it? What remains? What danger or secret keeps people away?</p>", facts:[["Region",""],["Origin",""],["Danger",""],["Secret",""]] }),
    Object.freeze({ id:"wilderness", name:"Wilderness Landmark", icon:"fa-mountain-sun", subtitle:"Wilderness", summary:"A memorable natural site, crossing, refuge or hazard.", body:"<p>How is it recognized? Why do travellers care about it?</p>", facts:[["Region",""],["Terrain",""],["Hazard",""],["Route",""]] })
  ]),
  lore:Object.freeze([
    Object.freeze({ id:"blank", name:"Blank Lore Entry", icon:"fa-book", subtitle:"Lore", summary:"A piece of campaign history, knowledge or world lore.", body:"", facts:[] }),
    Object.freeze({ id:"legend", name:"Legend / Tale", icon:"fa-scroll", subtitle:"Legend", summary:"A story people tell about the past, a hero, a monster or a place.", body:"<p>What does the tale claim happened? Which part might be wrong?</p>", facts:[["Origin",""],["Known By",""],["Truth","Unknown"]] }),
    Object.freeze({ id:"history", name:"Historical Event", icon:"fa-hourglass-half", subtitle:"History", summary:"An event that changed the world and still matters to the campaign.", body:"<p>What happened, who benefited, and what consequence remains?</p>", facts:[["Date / Era",""],["Participants",""],["Consequence",""]] }),
    Object.freeze({ id:"rumour", name:"Rumour", icon:"fa-comments", subtitle:"Rumour", summary:"Information circulating in the world whose truth is uncertain.", body:"<p>Who is repeating this rumour, and what would change if it were true?</p>", facts:[["Source",""],["Reliability","Unknown"],["Related Place",""]] }),
    Object.freeze({ id:"mystery", name:"Mystery / Secret", icon:"fa-magnifying-glass", subtitle:"Mystery", summary:"An unresolved question, hidden truth or strange phenomenon.", body:"<p>What is known, what is missing, and which clues point toward the truth?</p>", facts:[["Known",""],["Unknown",""],["Clue",""]] }),
    Object.freeze({ id:"prophecy", name:"Prophecy / Omen", icon:"fa-star-and-crescent", subtitle:"Prophecy", summary:"A prediction, omen or cryptic warning that may shape future choices.", body:"<p>Who spoke it? How is it interpreted? What sign suggests it is unfolding?</p>", facts:[["Source",""],["Interpretation",""],["Sign",""]] })
  ]),
  "npc-group":Object.freeze([
    Object.freeze({ id:"blank", name:"Blank NPC Group", icon:"fa-people-group", subtitle:"NPC Group", summary:"A group of NPCs encountered or tracked together.", body:"", facts:[] }),
    Object.freeze({ id:"patrol", name:"Patrol / Guard Detail", icon:"fa-shield", subtitle:"NPC Group", summary:"An organized patrol, watch or guard detail.", body:"<p>Who commands them, what are they protecting, and what is their current posture?</p>", facts:[["Leader",""],["Strength",""],["Purpose",""],["Disposition",""]] }),
    Object.freeze({ id:"warband", name:"Warband / Hostile Group", icon:"fa-people-robbery", subtitle:"NPC Group", summary:"A hostile group with shared purpose and leadership.", body:"<p>What are they after, how are they organized, and what will make them retreat?</p>", facts:[["Leader",""],["Strength",""],["Goal",""],["Morale",""]] })
  ])
});

const atFqStats = {
  bootstraps:0,
  adopted:0,
  createdFolders:0,
  contextMenus:0,
  quickCreates:0,
  nativeDelegations:0,
  genericCreates:0,
  blanks:0,
  failures:0,
  lastError:""
};

let atFqMenu = null;

function atFqClean(value) {
  return String(value ?? "").trim();
}

function atFqEscape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function atFqParentId(folder) {
  return String(folder?.folder?.id ?? folder?.folder ?? "");
}

function atFqNormalizeName(value) {
  return atFqClean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function atFqFolderPath(folder) {
  const names = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = game.folders?.get(atFqParentId(current)) || null;
  }
  return names.join(" › ");
}

function atFqModuleApi() {
  return game.modules.get(ATFQ_MODULE_ID)?.api || null;
}

function atFqFolderFlag(folder) {
  return atFqClean(folder?.getFlag?.(ATFQ_MODULE_ID, ATFQ_FOLDER_FLAG));
}

function atFqCoreSpec(type) {
  return ATFQ_CORE_FOLDERS.find((entry) => entry.type === type) || null;
}

function atFqFolderSpecFromName(folder) {
  const name = atFqNormalizeName(folder?.name);
  return ATFQ_CORE_FOLDERS.find((spec) => spec.aliases.some((alias) => atFqNormalizeName(alias) === name)) || null;
}

function atFqSemanticType(folder) {
  let current = folder;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const flagged = atFqFolderFlag(current);
    if (flagged) return flagged;
    const named = atFqFolderSpecFromName(current);
    if (named) return named.type;
    current = game.folders?.get(atFqParentId(current)) || null;
  }
  return "";
}

async function atFqProviderFolderSpecs() {
  const adapters = atFqModuleApi()?.adapters;
  if (!adapters?.quickCreateFolders) return [];

  try {
    const rows = await adapters.quickCreateFolders();
    const list = Array.isArray(rows) ? rows : [];
    const normalized = [];
    for (const raw of list) {
      const type = atFqClean(raw?.type || raw?.id);
      const label = atFqClean(raw?.label || raw?.name);
      if (!type || !label) continue;
      normalized.push(Object.freeze({
        type,
        label,
        aliases:Array.isArray(raw.aliases) ? raw.aliases.map(atFqClean).filter(Boolean) : [label],
        icon:atFqClean(raw.icon || "fa-folder"),
        profileCategory:atFqClean(raw.profileCategory || "lore"),
        mode:"provider",
        provider:true
      }));
    }
    return normalized;
  } catch (error) {
    console.warn("Adventurer's Tome | Provider folder discovery failed safely", error);
    return [];
  }
}

async function atFqAllSpecs() {
  const provider = await atFqProviderFolderSpecs();
  const merged = new Map(ATFQ_CORE_FOLDERS.map((spec) => [spec.type, spec]));
  for (const spec of provider) if (!merged.has(spec.type)) merged.set(spec.type, spec);
  return [...merged.values()];
}

async function atFqEnsureJournalFolder(name, parent = null, extraFlags = {}) {
  const parentId = String(parent?.id ?? parent ?? "");
  const found = [...(game.folders?.contents ?? [])].find((folder) =>
    folder.type === "JournalEntry"
    && atFqNormalizeName(folder.name) === atFqNormalizeName(name)
    && atFqParentId(folder) === parentId
  );
  if (found) return found;
  return Folder.create({
    name,
    type:"JournalEntry",
    folder:parentId || null,
    flags:{ [ATFQ_MODULE_ID]:{ ...extraFlags } }
  });
}

async function atFqAdoptOrCreateStandardFolder(worldFolder, spec) {
  const children = [...(game.folders?.contents ?? [])].filter((folder) =>
    folder.type === "JournalEntry" && atFqParentId(folder) === worldFolder.id
  );

  let folder = children.find((entry) => atFqFolderFlag(entry) === spec.type) || null;
  if (!folder) {
    const aliasNames = new Set(spec.aliases.map(atFqNormalizeName));
    folder = children.find((entry) => aliasNames.has(atFqNormalizeName(entry.name))) || null;
  }

  if (folder) {
    if (atFqFolderFlag(folder) !== spec.type) {
      await folder.setFlag(ATFQ_MODULE_ID, ATFQ_FOLDER_FLAG, spec.type);
      await folder.setFlag(ATFQ_MODULE_ID, ATFQ_FOLDER_VERSION_FLAG, ATFQ_VERSION);
      atFqStats.adopted += 1;
    }
    return folder;
  }

  folder = await Folder.create({
    name:spec.label,
    type:"JournalEntry",
    folder:worldFolder.id,
    flags:{
      [ATFQ_MODULE_ID]:{
        [ATFQ_FOLDER_FLAG]:spec.type,
        [ATFQ_FOLDER_VERSION_FLAG]:ATFQ_VERSION
      }
    }
  });
  atFqStats.createdFolders += 1;
  return folder;
}

async function atFqBootstrap() {
  if (!game.user?.isGM) return null;

  atFqStats.bootstraps += 1;
  try {
    const root = await atFqEnsureJournalFolder("Adventurer's Tome");
    const sessions = await atFqEnsureJournalFolder("Sessions", root, { section:"sessions" });
    const quests = await atFqEnsureJournalFolder("Quests", root, { section:"quests" });
    const world = await atFqEnsureJournalFolder("World", root, { section:"world" });
    const rules = await atFqEnsureJournalFolder("Rules", root, { section:"rules" });

    const specs = await atFqAllSpecs();
    const folders = {};
    for (const spec of specs) folders[spec.type] = await atFqAdoptOrCreateStandardFolder(world, spec);

    try { Hooks.callAll("adventurersTomeFolderBootstrapComplete", { root, sessions, quests, world, rules, folders }); } catch (_error) {}
    return Object.freeze({ root, sessions, quests, world, rules, folders:Object.freeze({ ...folders }) });
  } catch (error) {
    atFqStats.failures += 1;
    atFqStats.lastError = String(error?.message || error);
    console.error("Adventurer's Tome | Standard folder bootstrap failed", error);
    ui.notifications.error(`Adventurer's Tome: Standard folder bootstrap failed. ${atFqStats.lastError}`);
    return null;
  }
}

function atFqTemplateList(type) {
  return ATFQ_TEMPLATES[type] || [];
}

async function atFqChooseTemplate(type, spec) {
  const templates = atFqTemplateList(type);
  if (!templates.length) return null;

  return new Promise(async (resolve) => {
    let settled = false;
    const done = async (value, dialog) => {
      if (settled) return;
      settled = true;
      resolve(value);
      try { await dialog?.close?.(); } catch (_error) {}
    };

    const dialog = new foundry.applications.api.DialogV2({
      window:{ title:`Adventurer's Tome · Quick Create ${spec.label}`, resizable:true },
      position:{ width:920, height:720 },
      content:`<div class="at-fq-template-library">
        <div class="at-fq-brand"><i class="fa-solid ${atFqEscape(spec.icon)}"></i><span>ADVENTURER'S TOME · QUICK CREATE</span></div>
        <div class="at-fq-template-heading">
          <div><h2>${atFqEscape(spec.label)} Templates</h2><p>Search a starting point, then customize it before creation.</p></div>
          <strong data-at-fq-count>${templates.length} templates</strong>
        </div>
        <label class="at-fq-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-at-fq-search placeholder="Search templates…"></label>
        <div class="at-fq-template-grid" data-at-fq-results>
          ${templates.map((template) => `<button type="button" class="at-fq-template-card" data-at-fq-template="${atFqEscape(template.id)}" data-at-fq-search-text="${atFqEscape(`${template.name} ${template.subtitle} ${template.summary}`.toLowerCase())}">
            <span class="at-fq-template-icon"><i class="fa-solid ${atFqEscape(template.icon)}"></i></span>
            <span><strong>${atFqEscape(template.name)}</strong><small>${atFqEscape(template.subtitle)}</small><p>${atFqEscape(template.summary)}</p></span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>`).join("")}
        </div>
        <div class="at-fq-template-empty" data-at-fq-empty hidden><i class="fa-solid fa-magnifying-glass"></i><span>No templates match that search.</span></div>
      </div>`,
      modal:false,
      buttons:[{ action:"cancel", label:"Cancel", callback:() => done(null, dialog) }],
      close:() => { if (!settled) { settled = true; resolve(null); } }
    });

    await dialog.render(true);
    const root = dialog.element;
    const search = root?.querySelector?.("[data-at-fq-search]");
    const cards = [...(root?.querySelectorAll?.("[data-at-fq-template]") || [])];
    const count = root?.querySelector?.("[data-at-fq-count]");
    const empty = root?.querySelector?.("[data-at-fq-empty]");

    const applySearch = () => {
      const query = atFqClean(search?.value).toLowerCase();
      let visible = 0;
      for (const card of cards) {
        const show = !query || String(card.dataset.atFqSearchText || "").includes(query);
        card.hidden = !show;
        if (show) visible += 1;
      }
      if (count) count.textContent = `${visible} template${visible === 1 ? "" : "s"}`;
      if (empty) empty.hidden = visible > 0;
    };

    search?.addEventListener("input", applySearch);
    for (const card of cards) {
      card.addEventListener("click", () => {
        const selected = templates.find((template) => template.id === card.dataset.atFqTemplate) || null;
        void done(selected, dialog);
      });
    }
    queueMicrotask(() => search?.focus());
  });
}

function atFqTemplateFacts(template) {
  return (template?.facts || []).map(([label, value]) => ({
    label:atFqClean(label),
    value:atFqClean(value),
    visibility:"players"
  })).filter((fact) => fact.label || fact.value);
}

async function atFqEditGenericEntry(type, spec, template, folder) {
  const defaultName = template?.id === "blank" ? "" : template?.name || "";
  const choice = await foundry.applications.api.DialogV2.wait({
    window:{ title:`Adventurer's Tome · New ${spec.label}`, resizable:true },
    position:{ width:720, height:"auto" },
    content:`<form class="at-fq-create-form">
      <div class="at-fq-brand"><i class="fa-solid ${atFqEscape(spec.icon)}"></i><span>QUICK CREATE · ${atFqEscape(spec.label)}</span></div>
      <div class="at-fq-destination"><i class="fa-solid fa-folder-open"></i><span>Create in <strong>${atFqEscape(atFqFolderPath(folder))}</strong></span></div>
      <label><span>Name</span><input type="text" name="name" value="${atFqEscape(defaultName)}" placeholder="Name" required autofocus></label>
      <label><span>Subtitle / type</span><input type="text" name="subtitle" value="${atFqEscape(template?.subtitle || spec.label)}"></label>
      <label><span>Short summary</span><textarea name="summary" rows="3">${atFqEscape(template?.summary || "")}</textarea></label>
      <label><span>Known information</span><textarea name="body" rows="7">${atFqEscape(String(template?.body || "").replace(/<\/?p>/g, ""))}</textarea></label>
      <div class="at-fq-create-note"><i class="fa-solid fa-wand-magic-sparkles"></i><span>The template is only a starting point. The result is a normal editable Tome World entry.</span></div>
    </form>`,
    modal:false,
    rejectClose:false,
    buttons:[
      {
        action:"create",
        label:`Create ${spec.label.replace(/s$/, "")}`,
        icon:"fa-solid fa-plus",
        default:true,
        callback:(_event, button) => {
          const form = button.form;
          return {
            name:atFqClean(form?.elements?.name?.value),
            subtitle:atFqClean(form?.elements?.subtitle?.value),
            summary:atFqClean(form?.elements?.summary?.value),
            body:atFqClean(form?.elements?.body?.value)
          };
        }
      },
      { action:"cancel", label:"Cancel", callback:() => null }
    ]
  });

  if (!choice?.name) return null;

  const category = ["npc","contact","location","faction","item","lore"].includes(spec.profileCategory)
    ? spec.profileCategory
    : "lore";

  const worldProfile = {
    category,
    subtitle:choice.subtitle,
    summary:choice.summary,
    body:choice.body,
    heroImage:"",
    actorId:"",
    facts:atFqTemplateFacts(template)
  };

  const entry = await JournalEntry.create({
    name:choice.name,
    folder:folder.id,
    ownership:{ default:CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
    flags:{
      [ATFQ_MODULE_ID]:{
        worldProfile,
        quickCreate:{
          contract:ATFQ_CONTRACT,
          version:ATFQ_VERSION,
          semanticType:type,
          templateId:template?.id || "blank",
          templateName:template?.name || "Blank",
          createdAt:new Date().toISOString()
        }
      }
    }
  });

  if (!entry) throw new Error("Foundry did not return the created Journal Entry.");
  atFqStats.genericCreates += 1;
  if (template?.id === "blank") atFqStats.blanks += 1;

  try {
    const app = atFqModuleApi()?.app?.();
    if (app) {
      app.activeWorldId = entry.id;
      app.activeTab = "worldProfile";
      app.worldEditing = true;
      await app.render({ parts:["main"] });
    } else entry.sheet?.render?.(true);
  } catch (_error) {
    entry.sheet?.render?.(true);
  }

  return entry;
}

async function atFqProviderQuickCreate(type, folder, spec, options = {}) {
  const adapters = atFqModuleApi()?.adapters;
  if (!adapters?.quickCreate) return null;
  try {
    return await adapters.quickCreate(type, {
      ...options,
      folder,
      folderId:folder.id,
      folderPath:atFqFolderPath(folder),
      semanticType:type,
      spec
    });
  } catch (error) {
    console.warn(`Adventurer's Tome | Provider Quick Create failed for ${type}`, error);
    return null;
  }
}

async function atFqQuickCreate(folderOrId, options = {}) {
  if (!game.user?.isGM) return ui.notifications.warn("Adventurer's Tome: Quick Create is GM-only.");
  const folder = typeof folderOrId === "string" ? game.folders?.get(folderOrId) : folderOrId;
  if (!folder || folder.type !== "JournalEntry") return null;

  const type = atFqSemanticType(folder);
  if (!type) return ui.notifications.warn("Adventurer's Tome: This folder has no Quick Create type.");

  const specs = await atFqAllSpecs();
  const spec = specs.find((entry) => entry.type === type) || atFqCoreSpec(type) || {
    type,
    label:folder.name,
    icon:"fa-folder",
    profileCategory:"lore",
    mode:"provider"
  };

  atFqStats.quickCreates += 1;

  if (type === "npc") {
    const quickNpc = atFqModuleApi()?.quickNpc;
    if (quickNpc?.providerInfo) {
      const native = await quickNpc.providerInfo();
      if (native) {
        atFqStats.nativeDelegations += 1;
        return quickNpc.open({
          initialQuery:atFqClean(options.initialQuery),
          closeAfterCreate:false
        });
      }
    }
    return quickNpc?.open?.({ forceGeneric:true });
  }

  if (type === "npc-group") {
    const adapters = atFqModuleApi()?.adapters;
    const native = await adapters?.nativeQuickNpc?.();
    if (native?.result?.openGroups) {
      atFqStats.nativeDelegations += 1;
      return native.result.openGroups();
    }
  }

  const providerResult = await atFqProviderQuickCreate(type, folder, spec, options);
  if (providerResult?.result !== undefined && providerResult?.result !== null) {
    atFqStats.nativeDelegations += 1;
    return providerResult.result;
  }

  const templates = atFqTemplateList(type);
  if (!templates.length) {
    return ui.notifications.warn(`Adventurer's Tome: No Quick Create provider or generic templates are available for ${spec.label} yet.`);
  }

  const template = options.blank === true
    ? templates.find((entry) => entry.id === "blank") || templates[0]
    : await atFqChooseTemplate(type, spec);

  if (!template) return null;

  try {
    return await atFqEditGenericEntry(type, spec, template, folder);
  } catch (error) {
    atFqStats.failures += 1;
    atFqStats.lastError = String(error?.message || error);
    console.error("Adventurer's Tome | Quick Create failed", error);
    ui.notifications.error(`Adventurer's Tome: Quick Create failed. ${atFqStats.lastError}`);
    return null;
  }
}

function atFqCloseMenu() {
  if (!atFqMenu) return;
  atFqMenu.remove();
  atFqMenu = null;
}

async function atFqOpenContextMenu(event, folder) {
  const type = atFqSemanticType(folder);
  if (!type) return false;

  const specs = await atFqAllSpecs();
  const spec = specs.find((entry) => entry.type === type) || atFqCoreSpec(type) || {
    type,
    label:folder.name,
    icon:"fa-folder",
    profileCategory:"lore",
    mode:"provider"
  };

  atFqCloseMenu();
  atFqStats.contextMenus += 1;

  const singular = spec.label.replace(/s$/, "");
  const menu = document.createElement("div");
  menu.className = "at-fq-context-menu";
  menu.innerHTML = `
    <div class="at-fq-context-head"><i class="fa-solid ${atFqEscape(spec.icon)}"></i><span><strong>${atFqEscape(folder.name)}</strong><small>${atFqEscape(atFqFolderPath(folder))}</small></span></div>
    <button type="button" data-at-fq-menu="quick"><i class="fa-solid fa-wand-magic-sparkles"></i><span><strong>Quick Create ${atFqEscape(singular)}…</strong><small>Templates and system provider</small></span></button>
    ${atFqTemplateList(type).length ? `<button type="button" data-at-fq-menu="blank"><i class="fa-solid fa-file-circle-plus"></i><span><strong>Create Blank ${atFqEscape(singular)}</strong><small>Skip template selection</small></span></button>` : ""}
  `;

  document.body.append(menu);
  atFqMenu = menu;

  const rect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  menu.querySelector('[data-at-fq-menu="quick"]')?.addEventListener("click", () => {
    atFqCloseMenu();
    void atFqQuickCreate(folder);
  });
  menu.querySelector('[data-at-fq-menu="blank"]')?.addEventListener("click", () => {
    atFqCloseMenu();
    void atFqQuickCreate(folder, { blank:true });
  });

  return true;
}

function atFqInstallContextMenu() {
  document.addEventListener("contextmenu", (event) => {
    if (!game.user?.isGM) return;
    const row = event.target.closest?.(".adventurers-tome-app .at-cw-explorer[data-at-cw-section='world'] [data-at-cw-drop-folder]");
    if (!row) {
      atFqCloseMenu();
      return;
    }
    const folder = game.folders?.get(String(row.dataset.atCwDropFolder || ""));
    if (!folder || !atFqSemanticType(folder)) return;
    event.preventDefault();
    event.stopPropagation();
    void atFqOpenContextMenu(event, folder);
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (atFqMenu && !event.target.closest?.(".at-fq-context-menu")) atFqCloseMenu();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") atFqCloseMenu();
  }, true);
}

function atFqAudit() {
  const standard = [...(game.folders?.contents ?? [])]
    .filter((folder) => folder.type === "JournalEntry" && atFqFolderFlag(folder))
    .map((folder) => ({ id:folder.id, name:folder.name, type:atFqFolderFlag(folder), path:atFqFolderPath(folder) }));

  const duplicateTypes = standard
    .map((entry) => entry.type)
    .filter((type, index, all) => all.indexOf(type) !== index);

  return Object.freeze({
    contract:ATFQ_CONTRACT,
    version:ATFQ_VERSION,
    gmOnly:true,
    healthy:atFqStats.failures === 0 && duplicateTypes.length === 0,
    coreTypes:Object.freeze(ATFQ_CORE_FOLDERS.map((entry) => entry.type)),
    standardFolders:Object.freeze(standard),
    duplicateTypes:Object.freeze([...new Set(duplicateTypes)]),
    stats:Object.freeze({ ...atFqStats })
  });
}

const atFqPublicApi = Object.freeze({
  contract:ATFQ_CONTRACT,
  version:ATFQ_VERSION,
  coreFolders:() => ATFQ_CORE_FOLDERS,
  bootstrap:atFqBootstrap,
  semanticType:atFqSemanticType,
  quickCreate:atFqQuickCreate,
  audit:atFqAudit
});

function atFqAttach() {
  const module = game.modules.get(ATFQ_MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.folderQuickCreate = atFqPublicApi;
  return true;
}

Hooks.once("ready", async () => {
  atFqAttach();
  atFqInstallContextMenu();
  if (game.user?.isGM) await atFqBootstrap();
  console.info("Adventurer's Tome | Universal Folder Quick Create ready.");
});
