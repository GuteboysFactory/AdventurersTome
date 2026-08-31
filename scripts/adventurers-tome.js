const MODULE_ID = "adventurers-tome";
const DEFAULT_BACKGROUND = `modules/${MODULE_ID}/assets/default-hero.webp`;
const FALLBACK_ACTOR_IMAGE = "icons/svg/mystery-man.svg";
const FALLBACK_GENERIC_IMAGE = "icons/svg/book.svg";
const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMPORT_CHARS = 2_000_000;
const EXPORT_SCHEMA = "adventurers-tome.export";
const BACKUP_SCHEMA = "adventurers-tome.backup";
const PRIVATE_VAULT_SETTING = "gmPrivateVault";
const PRIVATE_REVEAL_SETTING = "gmRevealQueue";
const PRIVATE_IMPORT_HISTORY_SETTING = "gmImportHistory";
const PRIVATE_IMPORT_UNDO_SETTING = "gmLastImportUndo";
const PRIVATE_GM_WORKSPACE_SETTING = "gmWorkspace";

const GM_NOTE_TYPES = Object.freeze({
  prep: { label: "Prep", icon: "fa-list-check" },
  secret: { label: "Secret", icon: "fa-user-secret" },
  reminder: { label: "Reminder", icon: "fa-bell" },
  clue: { label: "Clue", icon: "fa-magnifying-glass" },
  reveal: { label: "Reveal", icon: "fa-eye" },
  consequence: { label: "Consequence", icon: "fa-bolt" },
  question: { label: "Question", icon: "fa-circle-question" },
  idea: { label: "Idea", icon: "fa-lightbulb" },
  scene: { label: "Scene", icon: "fa-clapperboard" }
});

const GM_NOTE_STATUSES = Object.freeze({
  open: { label: "Open" },
  resolved: { label: "Resolved" }
});

/**
 * Resolve a Foundry Data path into a browser-safe URL.
 *
 * Foundry may be hosted below a route prefix (for example /game). Relative
 * CSS URLs from an ApplicationV2 template can then resolve against the wrong
 * browser location. getRoute() adds the active Foundry route prefix while
 * absolute/external URLs are left untouched.
 */
function resolveFoundryAssetUrl(path) {
  const value = String(path || "").trim() || DEFAULT_BACKGROUND;
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  try {
    return foundry.utils.getRoute(value);
  } catch (_err) {
    return value;
  }
}

function cssUrl(value) {
  return `url(${JSON.stringify(String(value || ""))})`;
}

const FLAGS = Object.freeze({
  GROUP_MEMBER: "groupMember",
  GROUP_ORDER: "groupOrder",
  PROFILE: "profile",
  WORLD_PROFILE: "worldProfile",
  DEMO: "demo",
  IMPORT_META: "importMeta",
  LINKS: "links",
  ACCESS: "access",
  QUICK_CAPTURE_INBOX: "quickCaptureInbox",
  WORLD_SYNC_PAGE: "worldSyncPage",
  RULE_LINK: "ruleLink"
});

const THEME_DEFS = Object.freeze({
  tome: { label: "Tome", className: "at-theme-tome", description: "Classic dark leather, warm gold, and parchment accents." },
  dark: { label: "Dark", className: "at-theme-dark", description: "Deeper neutral blacks with restrained bronze highlights." },
  parchment: { label: "Parchment", className: "at-theme-parchment", description: "Warmer parchment panels and brighter reading surfaces." },
  minimal: { label: "Minimal", className: "at-theme-minimal", description: "Cleaner flat panels with reduced ornamentation." }
});

const NAV_SECTION_DEFS = Object.freeze([
  ["sessions", "Sessions", "fa-book-open"],
  ["quests", "Quests", "fa-diamond"],
  ["group", "Group", "fa-users"],
  ["world", "World", "fa-earth-europe"],
  ["rules", "Rules", "fa-scroll"],
  ["search", "Search", "fa-magnifying-glass"]
]);

const HOME_BLOCK_DEFS = Object.freeze([
  ["latestSession", "Latest Session", "fa-book-open", true, "normal"],
  ["activeQuests", "Active Quests", "fa-diamond", true, "normal"],
  ["group", "The Group", "fa-users", true, "normal"],
  ["recentWorld", "Recent Discoveries", "fa-map-pin", true, "normal"],
  ["campaignSnapshot", "Campaign Snapshot", "fa-chart-simple", false, "compact"],
  ["favorites", "My Favorites", "fa-star", false, "normal"],
  ["gmTools", "GM Tools", "fa-wand-magic-sparkles", false, "normal"]
]);

const HOME_MODES = Object.freeze({
  dashboard: { label: "Dashboard", description: "Classic Tome landing page with hero, sidebar, and campaign widgets." },
  minimal: { label: "Minimal", description: "A clean, cinematic landing page focused on the campaign artwork." },
  custom: { label: "Custom", description: "Full Home Builder control with widget sizes, hero composition, and optional sidebar." }
});

const NOTEBOOK_WIDGET_DEFS = Object.freeze([
  ["scratchpad", "Campaign Scratchpad", "fa-pen-to-square", true, "half", "A freeform private pad for rough prep and temporary thoughts."],
  ["quickCapture", "Quick Capture", "fa-bolt", true, "half", "Create structured private notes without leaving the Notebook."],
  ["customPads", "Custom Notepads", "fa-book-open", true, "full", "Create as many named private pads as your GM workflow needs."],
  ["sessionTools", "Session Tools", "fa-wand-magic-sparkles", true, "full", "Jump to Next Session, Reveal Queue, Quick Capture, and Post-Session tools."],
  ["briefing", "Notebook Overview", "fa-chart-simple", true, "full", "Stats, search, and filters for the campaign-wide GM note feed."],
  ["notes", "Notes Feed", "fa-note-sticky", true, "full", "All standalone and source-linked GM Notes in one searchable feed."]
]);

const NOTEBOOK_WIDGET_SIZES = Object.freeze({
  quarter: "Quarter width",
  half: "Half width",
  threeQuarter: "Three-quarter width",
  full: "Full width"
});

const NOTEBOOK_PRESETS = Object.freeze({
  standard: { label: "Standard", description: "Balanced scratchpad, capture, tools, and full campaign briefing.", layout: [
    ["scratchpad", true, "half"], ["quickCapture", true, "half"], ["customPads", true, "full"], ["sessionTools", true, "full"], ["briefing", true, "full"], ["notes", true, "full"]
  ]},
  prep: { label: "Session Prep", description: "Live-session tools first, then writing space and the note feed.", layout: [
    ["sessionTools", true, "full"], ["briefing", true, "full"], ["scratchpad", true, "half"], ["quickCapture", true, "half"], ["customPads", true, "full"], ["notes", true, "full"]
  ]},
  writer: { label: "Writer's Desk", description: "Writing surfaces first, with command tools kept secondary.", layout: [
    ["scratchpad", true, "full"], ["customPads", true, "full"], ["quickCapture", true, "half"], ["sessionTools", true, "half"], ["briefing", true, "full"], ["notes", true, "full"]
  ]},
  minimal: { label: "Minimal", description: "Just the essentials: scratchpad, quick capture, and notes.", layout: [
    ["scratchpad", true, "full"], ["quickCapture", true, "full"], ["notes", true, "full"], ["customPads", false, "full"], ["sessionTools", false, "full"], ["briefing", false, "full"]
  ]}
});

const MANUAL_SECTIONS = Object.freeze([
  { id: "welcome", category: "Start Here", icon: "fa-compass", title: "Welcome to Adventurer's Tome", summary: "What Tome is, how it fits beside Foundry, and what a new user should understand before clicking around.", useWhen: "Read this first if you have never used Adventurer's Tome before.", steps: [
    ["Open Tome", "Use the Adventurer's Tome launcher in Foundry. Tome opens as its own resizable application inside your world."],
    ["Pick a section", "Home is your landing page; Sessions and Quests track the story; Group presents player characters; World holds NPCs, places, factions, items, and lore; Rules is your table reference."],
    ["Know what is personal", "Your window size, launcher position, transparency, current page, Favorites, Recently Viewed, and GM Notebook workspace layout are personal. Campaign content changes made by a GM are shared."],
    ["Follow Foundry permissions", "Tome never grants access that Foundry denies. If a player cannot observe a Foundry document, Tome will not expose its full content."]
  ], tip: "You do not need to configure everything before play. Start with Home, Group, a few Sessions/Quests, and let World grow naturally." },

  { id: "five-minute", category: "Start Here", icon: "fa-stopwatch", title: "Five-Minute GM Setup", gmOnly: true, summary: "A practical first-run checklist that gets a new campaign usable without learning every advanced feature.", useWhen: "Use this after enabling the module in a world for the first time.", steps: [
    ["Create the Tome folders", "Campaign Settings → Developer Tools → Create / Verify Folders prepares Sessions, Quests, World, and Rules journal structure."],
    ["Choose a Home style", "Campaign Settings → Home Layout lets you keep Dashboard, use a cinematic Minimal page, or build a Custom Home."],
    ["Choose the Group", "Open Group → Manage Group and mark the Foundry Actors that should appear as player characters."],
    ["Add or import campaign history", "Create Sessions/Quests manually or use Import for Markdown/text/Tome Package data."],
    ["Check permissions", "Before inviting players, open Campaign Settings → Permissions and verify which content is visible, discovered, or GM-only."],
    ["Run Health Check", "Developer Tools → Tome Health Check gives you a quick sanity check before the campaign starts."]
  ], tip: "If you only do these six steps, Tome is already ready for normal play." },

  { id: "home", category: "Core", icon: "fa-house", title: "Home & Home Builder", summary: "Choose how much campaign information the landing page should show and keep the Session/Quest dashboard when you want it.", useWhen: "Use Home Builder when the default dashboard feels too busy or too empty for your table.", items: [
    ["Dashboard", "The classic Tome overview keeps Latest Session, Active Quests, Group, and Recent Discoveries visible."],
    ["Minimal", "An artwork-first landing page with an Enter button. The GM settings gear remains available in the top-right."],
    ["Custom", "Show, hide, reorder, and resize widgets while keeping your preferred hero composition."],
    ["Per-campaign presentation", "Theme, logo, backgrounds, navigation, and Home content are campaign settings shared with the table."]
  ], example: "A lore-heavy campaign might use Dashboard; a cinematic horror game might use Minimal; a sandbox GM might use Custom with Active Quests + Recent Discoveries + Favorites." },

  { id: "sessions", category: "Core", icon: "fa-book-open", title: "Sessions", summary: "Your campaign chronicle: searchable session history, previews, links, and the underlying Foundry Journal.", useWhen: "Use Sessions to remember what happened, find old details quickly, or connect current events to earlier play.", steps: [
    ["Browse", "Select a Session in the left history list. On wide windows, the detail preview appears on the right."],
    ["Search locally", "Use Search Sessions when you already know you only want session results."],
    ["Open the source", "Open Full Session opens the underlying Foundry Journal if you need the original entry."],
    ["Import after play", "GMs can import structured session logs with preview before Tome writes anything."]
  ], tip: "Use consistent Session numbers. Health Check warns about duplicates because automatic linking becomes ambiguous." },

  { id: "quests", category: "Core", icon: "fa-diamond", title: "Quests", summary: "Track active, completed, dormant, and failed goals without turning the quest log into another long session transcript.", useWhen: "Use Quests for concise objectives and state changes; keep narrative detail in Sessions.", items: [
    ["Statuses", "Active, Completed, Dormant, and Failed are grouped separately so players can scan the campaign state quickly."],
    ["Quest Detail", "Open a Quest inside Tome to see summary, objectives, updates, and campaign links."],
    ["Local search", "Search Quests filters the current page without mixing in unrelated World or Session results."],
    ["Cross-links", "Quest pages can link to Sessions, Characters, NPCs, Locations, Factions, Items, and Lore."]
  ], example: "A Session log can say what happened in detail, while the Quest entry simply changes from 'Find the missing ranger' to 'Completed' with one short outcome note." },

  { id: "group", category: "Core", icon: "fa-users", title: "Group & Character Profiles", summary: "Campaign-facing character profiles that remain system-independent while Foundry Actor sheets stay available where appropriate.", useWhen: "Use Group when you want players to learn who the party is without exposing or duplicating game-system statistics.", items: [
    ["Tome profile", "Title, subtitle, biography, facts, relations, artwork, motto, first appearance, and campaign links live in Tome presentation data."],
    ["Actor sheet", "The actual rules/statistics remain in the Foundry Actor and its game-system sheet."],
    ["Custom buttons", "GMs can add shortcuts such as Inventory, Spellbook, Party Chest, Notes, Stronghold, or any Foundry UUID/https link."],
    ["Relations", "Relations can be player-visible or private GM information."]
  ], tip: "Custom buttons are how Tome stays system-independent: configure the shortcuts your current system needs instead of hardcoding one game's data model." },

  { id: "world", category: "Core", icon: "fa-earth-europe", title: "World, Journals & Actors", summary: "NPCs, Locations, Factions, Items, and Lore presented as Tome profiles while Foundry remains the underlying source of truth.", useWhen: "Use World for anything the campaign should remember outside the player party.", steps: [
    ["Create or import a World entry", "World entries are Foundry Journals categorized as NPC, Location, Faction, Item, or Lore."],
    ["Edit Known Information", "Known Information is synchronized with the linked Foundry Journal page."],
    ["Link an Actor when useful", "NPC World entries can point to a real Foundry Actor. GM-only Open Sheet and Actor Access then become available."],
    ["Control discovery", "Prepare content in advance and keep it Undiscovered or GM-only until the players should see it."]
  ], warning: "Do not treat Tome visibility as a replacement for Foundry permissions on hard secrets. Keep truly sensitive documents inaccessible in Foundry too." },

  { id: "rules", category: "Core", icon: "fa-scroll", title: "Rules", summary: "Build a searchable table reference from Tome-created rules or existing Foundry Journals.", useWhen: "Use Rules for house rules, travel procedures, conditions, campaign-specific rulings, or links to existing reference Journals.", steps: [
    ["Create Rule", "Create a new rule directly from Tome when the rule does not already exist."],
    ["Link Existing", "Point Tome at an existing Foundry Journal instead of duplicating content."],
    ["Search", "Use local Rule search for fast table lookup."],
    ["Share", "Highlight readable text and choose Public or Whisper to send only that excerpt to Foundry chat."]
  ], example: "A GM can create a 'Chase Procedure' rule, search it mid-session, highlight the relevant paragraph, and whisper it to one player without opening a separate reference document." },

  { id: "search", category: "Core", icon: "fa-magnifying-glass", title: "Search, Favorites & Recent", summary: "Find campaign content globally and keep personal shortcuts without changing anyone else's Tome.", items: [
    ["Global Search", "Search Sessions, Quests, Characters, NPCs, Locations, Factions, Items, Lore, and Rules from one page."],
    ["Local searches", "Sessions, Quests, and Rules also have focused searches when you do not need global results."],
    ["Favorites", "Favorites are personal per user."],
    ["Recently Viewed", "Recently Viewed is also personal and follows your own navigation only."]
  ], tip: "Press / when you are not typing in another field to jump quickly to global Search." },

  { id: "chat", category: "Core", icon: "fa-comments", title: "Sharing Text to Chat", summary: "Select exactly the words you want the table to see and send them publicly or privately.", useWhen: "Use this for rule excerpts, clues, descriptions, and exact wording you do not want players to misremember.", steps: [
    ["Highlight readable text", "Drag across the text inside a shareable Tome detail view."],
    ["Choose Public", "Public posts the selected excerpt to normal Foundry chat."],
    ["Choose Whisper", "Whisper lets you select one or more connected users, or whisper to the GM(s)."],
    ["Keep navigating privately", "Opening pages in Tome never broadcasts your navigation automatically."]
  ], tip: "If you highlight a rule or clue, only the selection is sent—not the whole page." },

  { id: "permissions", category: "GM", icon: "fa-shield-halved", title: "Permissions & Discovery", gmOnly: true, summary: "Understand the two-layer visibility model before preparing secrets for players.", useWhen: "Read this before using Undiscovered, GM-only, or Show to Players.", steps: [
    ["Foundry ownership first", "The user must have Observer-or-better access for Tome to expose full player-facing content."],
    ["Tome discovery second", "Discovered controls whether otherwise accessible content has been revealed inside Tome."],
    ["GM-only last", "GM-only hides a Tome entry from players even if Foundry access would otherwise allow it."],
    ["Private fields", "GM Notes plus GM-only Facts and Relations are kept in the GM's private user vault."]
  ], example: "Prepare an NPC before play, keep it Undiscovered, then reveal it when the party meets them. If the NPC is a true secret, keep Foundry ownership at None as well." },

  { id: "gm-notebook", category: "GM", icon: "fa-note-sticky", title: "GM Notebook & Workspace Builder", gmOnly: true, summary: "A private, rebuildable GM workspace: scratchpads, custom notepads, Quick Capture, session tools, filters, and the campaign-wide note feed.", useWhen: "Use this as your private command desk before, during, and after play. Customize it if the default layout does not match how you GM.", steps: [
    ["Customize Workspace", "Open Campaign Settings → GM Notebook → Customize Workspace."],
    ["Choose a preset", "Standard, Session Prep, Writer's Desk, and Minimal give you starting points."],
    ["Rebuild it", "Enter Customize Workspace, then drag Notebook windows by their grip handle or use the left/right arrow buttons. Each window can be hidden and sized to quarter, half, three-quarter, or full width. Builder changes save immediately; the classic list remains available as a precise fallback and to restore hidden windows."],
    ["Create custom notepads", "Add named private pages for topics such as NPC Ideas, Rumours, Tonight, Voices, Loot, or any workflow you invent. Individual notepads can also be dragged and resized."],
    ["Keep structured notes separate", "Use Quick Capture/GM Notes when you want pins, types, triggers, target Sessions, due state, and Next Session surfacing."]
  ], tip: "Scratchpad/custom pads are for freeform thinking. Structured GM Notes are for information Tome should actively help you remember. Tome transparency is a personal client setting in the window header: 25/50/75/90% reveals the actual Foundry Scene behind Tome while text and controls remain fully opaque. Close Tome with X and reopen it from the movable launcher." },

  { id: "gm-live", category: "GM", icon: "fa-wand-magic-sparkles", title: "Live GM Tools", gmOnly: true, summary: "Use Tome as a live command deck instead of only as a campaign archive.", steps: [
    ["Next Session Dashboard", "Collect due/pinned notes, clues, reveals, consequences, active Quests, current-location context, Quick Captures, and Reveal Queue state."],
    ["Quick Capture", "Capture an unexpected NPC, clue, scene idea, consequence, or reminder immediately."],
    ["Reveal Queue", "Queue material privately. Nothing is shown until you explicitly use Show to Players."],
    ["Post-Session Assistant", "Review unresolved notes, captures, active quests, consequences, reveals, and export/checkpoint opportunities after play."]
  ], warning: "Show to Players is explicit. Normal GM navigation is private and never drags player clients along." },

  { id: "import-export", category: "GM", icon: "fa-arrows-rotate", title: "Import, Export & Undo", gmOnly: true, summary: "Bring structured logs in safely, move campaign data out, and understand what each package type is for.", useWhen: "Use Import after a game night or when migrating structured material into Tome. Use Export for portability or backup workflows.", items: [
    ["Import preview", "Session logs, Quest logs, and Tome Package JSON use dry-run preview with Create, Update, Skip, and cross-link review."],
    ["Undo Last Import", "Rolls back the most recent Tome import transaction only; it is not a general Foundry backup."],
    ["Portable Package", "Designed to be re-imported into Tome."],
    ["Player-safe Package", "Omits private GM data and hidden material."],
    ["Full GM Archive", "A private backup/audit export containing sensitive GM state. Keep it private."]
  ]},

  { id: "health", category: "GM", icon: "fa-stethoscope", title: "Health Check", gmOnly: true, summary: "Detect broken references and stale Tome metadata after months or years of campaign changes.", steps: [
    ["Run Health Check", "Scan broken cross-links, deleted targets, stale Favorites/Recents, malformed flags, duplicate Session numbers, and ambiguous names."],
    ["Repair Safe Issues", "Tome removes only references it can prove are stale."],
    ["Review warnings", "Ambiguous issues such as duplicate Session numbers are intentionally left for the GM to resolve."]
  ], warning: "Health Check cleans broken references. It does not recreate a deleted Actor/Journal because Tome cannot know whether deletion was intentional." },

  { id: "troubleshooting", category: "Help", icon: "fa-screwdriver-wrench", title: "Common Questions & Troubleshooting", summary: "Fast answers to the things new players and GMs most often wonder about.", items: [
    ["Why can't a player see this entry?", "Check Foundry ownership first, then Tome GM-only/discovery state. The player needs Observer-or-better Foundry access."],
    ["Why is Open Sheet missing in World?", "World Open Sheet is intentionally GM-only. Link the World NPC to an Actor if the GM needs that shortcut."],
    ["Does my navigation move other players?", "No. Your current Tome page is local to your client unless the GM explicitly uses Show to Players."],
    ["Where did my GM Notes go?", "GM Notes are stored privately per GM user. Another GM account has its own workspace unless data is deliberately transferred through a private GM archive workflow."],
    ["Journal and Tome text differ", "For World Known Information, edit the synced Journal text page or save the Tome World edit and allow the Journal hook to refresh Tome."],
    ["I changed screens and Tome opens oddly", "Tome clamps saved window size/position to the current viewport. Resize once and the client-specific state is updated."]
  ], tip: "When something feels wrong, run Health Check before manually deleting Tome metadata." }
]);

function buildManualView() {
  const version = String(game.modules.get(MODULE_ID)?.version || "");
  const sections = MANUAL_SECTIONS.filter((section) => game.user?.isGM || !section.gmOnly).map((section) => {
    const items = Array.isArray(section.items) ? section.items.map(([title, text]) => ({ title, text })) : [];
    const steps = Array.isArray(section.steps) ? section.steps.map(([title, text]) => ({ title, text })) : [];
    const searchParts = [section.category, section.title, section.summary, section.useWhen, section.tip, section.warning, section.example];
    for (const item of [...items, ...steps]) searchParts.push(item.title, item.text);
    return { ...section, items, steps, searchText: searchParts.filter(Boolean).join(" ").toLowerCase() };
  });
  return {
    version,
    sections,
    isGM: Boolean(game.user?.isGM),
    intro: game.user?.isGM
      ? "Adventurer's Tome is a campaign workspace layered on top of Foundry. Use Foundry Documents for the underlying world data and Tome for presentation, discovery, cross-links, GM workflow, and campaign memory."
      : "Adventurer's Tome is your campaign companion inside Foundry: a place to revisit Sessions, follow Quests, learn about the Group and World, search Rules, and keep personal Favorites.",
    quickSteps: game.user?.isGM
      ? ["Open Campaign Settings", "Create / verify Tome folders", "Choose a Home layout", "Select Group members", "Check Permissions", "Start adding or importing campaign content"]
      : ["Open Home", "Browse Sessions and Quests", "Explore Group and World", "Use Search when you are unsure where something lives", "Favorite things you want to return to"]
  };
}

const HOME_WIDGET_SIZES = Object.freeze({
  compact: "Compact",
  normal: "Normal",
  wide: "Wide"
});

const SECTION_BACKGROUND_KEYS = Object.freeze(["sessions", "quests", "group", "world", "rules", "search", "settings", "import", "export"]);

function defaultNavConfig() {
  return Object.fromEntries(NAV_SECTION_DEFS.map(([id]) => [id, true]));
}

function defaultHomeLayout() {
  return HOME_BLOCK_DEFS.map(([id, _label, _icon, defaultVisible = true, defaultSize = "normal"]) => ({ id, visible: defaultVisible, size: defaultSize }));
}

function defaultNotebookLayout(preset = "standard") {
  const presetDef = NOTEBOOK_PRESETS[preset] || NOTEBOOK_PRESETS.standard;
  const base = new Map(NOTEBOOK_WIDGET_DEFS.map(([id, _label, _icon, defaultVisible = true, defaultSize = "full"]) => [id, { id, visible: defaultVisible, size: defaultSize }]));
  const ordered = [];
  for (const [id, visible, size] of presetDef.layout) {
    const row = base.get(id);
    if (!row) continue;
    ordered.push({ ...row, visible: visible !== false, size: NOTEBOOK_WIDGET_SIZES[size] ? size : row.size });
    base.delete(id);
  }
  return [...ordered, ...base.values()];
}

function normalizeNotebookLayout(raw = []) {
  const source = Array.isArray(raw) ? raw : [];
  const byId = new Map(source.map((item) => [String(item?.id || ""), item]));
  const defaults = defaultNotebookLayout("standard");
  const rows = defaults.map((row) => {
    const saved = byId.get(row.id);
    const size = NOTEBOOK_WIDGET_SIZES[String(saved?.size || "")] ? String(saved.size) : row.size;
    return { id: row.id, visible: saved ? saved.visible !== false : row.visible, size };
  });
  rows.sort((a, b) => {
    const ai = source.findIndex((item) => item?.id === a.id);
    const bi = source.findIndex((item) => item?.id === b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  return rows;
}

function normalizeNotebookPad(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const now = Date.now();
  const size = NOTEBOOK_WIDGET_SIZES[String(source.size || "")] ? String(source.size) : "half";
  return {
    id: String(source.id || foundry.utils.randomID?.() || `pad-${now}`),
    title: String(source.title || "Notepad").trim().slice(0, 120) || "Notepad",
    body: String(source.body || ""),
    size,
    createdAt: Number(source.createdAt || now) || now,
    updatedAt: Number(source.updatedAt || now) || now
  };
}

function getNavConfig() {
  const parsed = safeJSONParse(game.settings.get(MODULE_ID, "navConfig"), {});
  return { ...defaultNavConfig(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
}

function getHomeLayout() {
  const parsed = safeJSONParse(game.settings.get(MODULE_ID, "homeLayout"), []);
  const list = Array.isArray(parsed) ? parsed : [];
  const byId = new Map(list.map((item) => [String(item?.id || ""), item]));
  return HOME_BLOCK_DEFS.map(([id, _label, _icon, defaultVisible = true, defaultSize = "normal"]) => {
    const saved = byId.get(id);
    const size = HOME_WIDGET_SIZES[String(saved?.size || "")] ? String(saved.size) : defaultSize;
    return { id, visible: saved ? saved.visible !== false : defaultVisible, size };
  }).sort((a, b) => {
    const ai = list.findIndex((item) => item?.id === a.id);
    const bi = list.findIndex((item) => item?.id === b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

function getSectionBackgrounds() {
  const parsed = safeJSONParse(game.settings.get(MODULE_ID, "sectionBackgrounds"), {});
  const result = {};
  for (const key of SECTION_BACKGROUND_KEYS) result[key] = String(parsed?.[key] || "").trim();
  return result;
}

function configuredDefaultLanding() {
  const configured = String(game.settings.get(MODULE_ID, "defaultLanding") || "home").trim().toLowerCase();
  if (configured === "home") return "home";
  const nav = getNavConfig();
  return nav[configured] ? configured : "home";
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FilePicker = foundry.applications.apps.FilePicker;

/**
 * Adventurer's Tome Core Rule
 * ---------------------------
 * The module may use Foundry's system-agnostic Document API, but it must not
 * depend on game-system data paths. In particular, do not read actor.system.*
 * in core code. Optional system integrations can be added separately later.
 */

function registerSetting(key, data) {
  const { scope = "world", ...settingData } = data;
  game.settings.register(MODULE_ID, key, {
    scope,
    config: false,
    ...settingData
  });
}

function safeJSONParse(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

function normalizeRefList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((ref) => String(ref || "").trim()).filter(Boolean))];
}

function getClientRefList(settingKey) {
  try {
    return normalizeRefList(safeJSONParse(game.settings.get(MODULE_ID, settingKey), []));
  } catch (_err) {
    return [];
  }
}

function getFavoriteRefs() {
  return getClientRefList("favorites");
}

function getRecentRefs() {
  return getClientRefList("recentItems");
}

async function setFavoriteRefs(refs = []) {
  const normalized = normalizeRefList(refs).slice(0, 120);
  await game.settings.set(MODULE_ID, "favorites", JSON.stringify(normalized));
  return normalized;
}

async function recordRecentRef(refKey) {
  const key = String(refKey || "").trim();
  if (!key) return getRecentRefs();
  const next = [key, ...getRecentRefs().filter((ref) => ref !== key)].slice(0, 18);
  await game.settings.set(MODULE_ID, "recentItems", JSON.stringify(next));
  return next;
}

function inferJournalRefKey(journal) {
  if (!journal?.id) return "";
  const flagged = String(journal.getFlag?.(MODULE_ID, "type") ?? "").toLowerCase();
  const lineage = folderLineageNames(journal.folder).join(" ");
  if (flagged === "sessions" || /(?:^|\s)sessions?(?:\s|$)/.test(lineage)) return `session:${journal.id}`;
  if (flagged === "quests" || /(?:^|\s)quests?(?:\s|$)/.test(lineage)) return `quest:${journal.id}`;
  if (flagged === "world" || /(?:^|\s)world(?:\s|$)/.test(lineage)) return `world:${journal.id}`;
  if (flagged === "rules" || /(?:^|\s)rules?(?:\s|$)/.test(lineage)) return `rule:${journal.id}`;
  return "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getViewportSize() {
  const root = document.documentElement;
  return {
    width: Math.max(640, window.innerWidth || root?.clientWidth || 1280),
    height: Math.max(560, window.innerHeight || root?.clientHeight || 800)
  };
}

/**
 * Return a per-client starting position which fits the user's current viewport.
 * Saved sizes are respected, but always constrained so a layout saved on a
 * larger monitor cannot open off-screen on a smaller display.
 */
function getAdaptiveWindowPosition(savedValue = "") {
  const viewport = getViewportSize();
  const maxWidth = Math.max(620, viewport.width - 32);
  const maxHeight = Math.max(520, viewport.height - 72);
  const defaultWidth = Math.min(1680, Math.max(780, viewport.width - Math.max(48, Math.round(viewport.width * 0.08))));
  const defaultHeight = Math.min(980, Math.max(560, viewport.height - Math.max(78, Math.round(viewport.height * 0.10))));

  const saved = safeJSONParse(savedValue, {});
  const hasSavedSize = saved && typeof saved === "object" && Number.isFinite(Number(saved.width)) && Number.isFinite(Number(saved.height));

  const width = clamp(hasSavedSize ? Number(saved.width) : defaultWidth, Math.min(680, maxWidth), maxWidth);
  const height = clamp(hasSavedSize ? Number(saved.height) : defaultHeight, Math.min(540, maxHeight), maxHeight);
  const centeredLeft = Math.round((viewport.width - width) / 2);
  const centeredTop = Math.max(24, Math.round((viewport.height - height) / 2));
  const left = clamp(Number.isFinite(Number(saved?.left)) ? Number(saved.left) : centeredLeft, 0, Math.max(0, viewport.width - width));
  const top = clamp(Number.isFinite(Number(saved?.top)) ? Number(saved.top) : centeredTop, 0, Math.max(0, viewport.height - height));

  return { width, height, left, top };
}

function getSavedWindowState() {
  try {
    return game.settings.get(MODULE_ID, "windowState") || "";
  } catch (_err) {
    return "";
  }
}

function stripMarkup(value = "") {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value = "", max = 170) {
  const text = stripMarkup(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function plainTextToJournalHtml(value = "") {
  const text = String(value || "").trim();
  if (!text) return "<p></p>";
  return text.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("\n");
}

function getWorldSyncPage(entry, profile = null) {
  if (!entry) return null;
  const pages = entry.pages?.contents || [];
  const configuredId = String(profile?.syncPageId || "").trim();
  return (configuredId ? pages.find((page) => page.id === configuredId) : null)
    || pages.find((page) => page.getFlag?.(MODULE_ID, FLAGS.WORLD_SYNC_PAGE) === true)
    || null;
}

function worldSyncedBody(entry, profile = null) {
  const page = getWorldSyncPage(entry, profile);
  if (page) return stripMarkup(stripFoundrySecretBlocks(page.text?.content || ""));
  const journalBody = stripMarkup(journalText(entry));
  const legacy = String(profile?.body || "").trim();
  return journalBody || legacy;
}

async function ensureWorldSyncPage(entry, body = "", profile = {}) {
  if (!entry || !game.user?.isGM) return { profile, page: null };
  let page = getWorldSyncPage(entry, profile);
  const content = plainTextToJournalHtml(body);
  if (!page) page = entry.pages?.contents?.find((candidate) => candidate.type === "text") || null;
  if (!page) {
    const created = await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "Known Information",
      type: "text",
      text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content },
      flags: { [MODULE_ID]: { [FLAGS.WORLD_SYNC_PAGE]: true } }
    }]);
    page = created?.[0] || null;
  } else {
    await page.update({ "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, "text.content": content });
    if (page.getFlag?.(MODULE_ID, FLAGS.WORLD_SYNC_PAGE) !== true) await page.setFlag(MODULE_ID, FLAGS.WORLD_SYNC_PAGE, true);
  }
  return { profile: { ...profile, syncPageId: page?.id || String(profile?.syncPageId || "") }, page };
}

function normalizeCustomLink(link = {}) {
  return {
    label: String(link?.label || "").trim(),
    icon: String(link?.icon || "fa-link").trim() || "fa-link",
    target: String(link?.target || "").trim()
  };
}

function stripFoundrySecretBlocks(value = "") {
  const html = String(value || "");
  if (!html || game.user?.isGM) return html;

  // Foundry secret blocks are a presentation/security boundary for normal
  // Journal rendering. Tome must not flatten those hidden blocks into plain
  // summaries/search text for non-GM users. Remove them conservatively before
  // any stripMarkup/truncate/cross-link inference is performed.
  try {
    const host = globalThis.document?.createElement?.("div");
    if (host) {
      host.innerHTML = html;
      host.querySelectorAll?.(".secret, [data-secret='true']")?.forEach((node) => node.remove());
      return host.innerHTML;
    }
  } catch (_err) {
    // Fall through to a conservative string fallback.
  }

  return html
    .replace(/<(section|div|p|span)\b[^>]*class=["'][^"']*\bsecret\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(section|div|p|span)\b[^>]*data-secret=["']true["'][^>]*>[\s\S]*?<\/\1>/gi, " ");
}

function journalText(entry) {
  const pages = entry?.pages?.contents ?? [];
  return pages
    .map((page) => stripFoundrySecretBlocks(page?.text?.content ?? ""))
    .filter(Boolean)
    .join(" ");
}

function folderLineageNames(folder) {
  const names = [];
  let current = folder;
  const seen = new Set();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(String(current.name ?? "").toLowerCase());
    current = current.folder;
  }

  return names;
}

function sectionEntries(section) {
  const normalized = section.toLowerCase();

  return game.journal.contents
    .filter((entry) => canViewInTome(entry))
    .filter((entry) => {
      const flagged = String(entry.getFlag(MODULE_ID, "type") ?? "").toLowerCase();
      if (flagged === normalized) return true;
      return folderLineageNames(entry.folder).some((name) => name === normalized || name.includes(normalized));
    })
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true }));
}

function sessionDisplayMeta(name = "") {
  const value = String(name || "").trim();
  const match = value.match(/^\s*session\s*0*(\d{1,4})\s*(?:[—–:-]\s*)?(.*)$/i);
  if (!match) return { number: null, title: value };
  return {
    number: Number(match[1]),
    title: String(match[2] || "").trim() || `Session ${Number(match[1])}`
  };
}

function normalizeQuestStatus(status = "") {
  const normalized = String(status || "active").trim().toLowerCase();
  return ["active", "completed", "failed", "dormant"].includes(normalized) ? normalized : "active";
}


const TOME_VISIBILITY = Object.freeze({
  inherit: { label: "Foundry access", description: "Respect Foundry ownership and show the entry when the user can normally see it." },
  gm: { label: "GM only in Tome", description: "Hide the entry from non-GM users inside Adventurer's Tome." }
});

function defaultTomeVisibility() {
  try {
    const value = String(game.settings.get(MODULE_ID, "defaultTomeVisibility") || "inherit").toLowerCase();
    return TOME_VISIBILITY[value] ? value : "inherit";
  } catch (_err) {
    return "inherit";
  }
}

function defaultTomeDiscovered() {
  try { return game.settings.get(MODULE_ID, "defaultTomeDiscovered") !== false; }
  catch (_err) { return true; }
}

function makeGmNoteId() {
  try { return foundry.utils.randomID(12); }
  catch (_err) { return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}

function normalizeGmNote(note = {}) {
  const type = GM_NOTE_TYPES[String(note?.type || "reminder").toLowerCase()] ? String(note.type).toLowerCase() : "reminder";
  const status = GM_NOTE_STATUSES[String(note?.status || "open").toLowerCase()] ? String(note.status).toLowerCase() : "open";
  const sessionTarget = Number(note?.sessionTarget || 0);
  return {
    id: String(note?.id || makeGmNoteId()),
    title: String(note?.title || "GM Note").trim() || "GM Note",
    body: String(note?.body || note?.text || "").trim(),
    type,
    status,
    pinned: note?.pinned === true,
    trigger: String(note?.trigger || "").trim(),
    sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? Math.floor(sessionTarget) : null,
    createdAt: Number(note?.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(note?.updatedAt || Date.now()) || Date.now()
  };
}

function normalizeGmNotes(access = {}) {
  const notes = Array.isArray(access?.notes) ? access.notes.map(normalizeGmNote).filter((note) => note.body || note.title !== "GM Note") : [];
  const legacy = String(access?.gmNotes || "").trim();
  if (!notes.length && legacy) {
    notes.push(normalizeGmNote({ id: "legacy-note", title: "GM Note", body: legacy, type: "reminder", status: "open" }));
  }
  return notes;
}

function privateVaultKey(document) {
  if (!document?.id) return "";
  const type = String(document.documentName || "document").toLowerCase();
  return `${type}:${document.id}`;
}

function resolvePrivateVaultKey(key = "") {
  const match = String(key || "").match(/^(actor|journalentry):(.+)$/i);
  if (!match) return null;
  return match[1].toLowerCase() === "actor" ? (game.actors.get(match[2]) || null) : (game.journal.get(match[2]) || null);
}

function getPrivateVault() {
  if (!game.user?.isGM) return {};
  try {
    const parsed = safeJSONParse(game.settings.get(MODULE_ID, PRIVATE_VAULT_SETTING), {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function normalizeGmWorkspace(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const presetRaw = String(source.preset || "");
  const preset = NOTEBOOK_PRESETS[presetRaw] ? presetRaw : (presetRaw === "custom" ? "custom" : "standard");
  return {
    scratchpad: String(source.scratchpad || ""),
    notes: Array.isArray(source.notes) ? source.notes.map(normalizeGmNote) : [],
    pads: Array.isArray(source.pads) ? source.pads.map(normalizeNotebookPad).slice(0, 24) : [],
    layout: normalizeNotebookLayout(source.layout),
    preset
  };
}

function emptyGmWorkspace() {
  return { scratchpad: "", notes: [], pads: [], layout: defaultNotebookLayout("standard"), preset: "standard" };
}

function getGmWorkspace() {
  if (!game.user?.isGM) return emptyGmWorkspace();
  try {
    return normalizeGmWorkspace(safeJSONParse(game.settings.get(MODULE_ID, PRIVATE_GM_WORKSPACE_SETTING), {}));
  } catch (_err) {
    return emptyGmWorkspace();
  }
}

async function setGmWorkspace(patch = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can change the private GM workspace.");
  const current = getGmWorkspace();
  const next = normalizeGmWorkspace({
    scratchpad: Object.hasOwn(patch, "scratchpad") ? patch.scratchpad : current.scratchpad,
    notes: Array.isArray(patch.notes) ? patch.notes : current.notes,
    pads: Array.isArray(patch.pads) ? patch.pads : current.pads,
    layout: Array.isArray(patch.layout) ? patch.layout : current.layout,
    preset: Object.hasOwn(patch, "preset") ? patch.preset : current.preset
  });
  await game.settings.set(MODULE_ID, PRIVATE_GM_WORKSPACE_SETTING, JSON.stringify(next));
  return next;
}

function getPrivateOverlay(document) {
  if (!game.user?.isGM || !document?.id) return { notes: [], facts: [], relations: [] };
  const raw = getPrivateVault()[privateVaultKey(document)];
  const overlay = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    notes: Array.isArray(overlay.notes) ? overlay.notes.map(normalizeGmNote) : [],
    facts: Array.isArray(overlay.facts) ? foundry.utils.deepClone(overlay.facts) : [],
    relations: Array.isArray(overlay.relations) ? foundry.utils.deepClone(overlay.relations) : []
  };
}

async function setPrivateOverlay(document, patch = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can change private Adventurer's Tome data.");
  if (!document?.id) throw new Error("A Foundry Document is required.");
  const vault = getPrivateVault();
  const key = privateVaultKey(document);
  const current = getPrivateOverlay(document);
  const next = {
    notes: Array.isArray(patch.notes) ? patch.notes.map(normalizeGmNote) : current.notes,
    facts: Array.isArray(patch.facts) ? foundry.utils.deepClone(patch.facts) : current.facts,
    relations: Array.isArray(patch.relations) ? foundry.utils.deepClone(patch.relations) : current.relations
  };
  if (!next.notes.length && !next.facts.length && !next.relations.length) delete vault[key];
  else vault[key] = next;
  await game.settings.set(MODULE_ID, PRIVATE_VAULT_SETTING, JSON.stringify(vault));
  return next;
}

function publicAccessData(document) {
  const raw = document?.getFlag?.(MODULE_ID, FLAGS.ACCESS);
  const access = raw && typeof raw === "object" ? raw : {};
  const visibilityRaw = String(access.visibility ?? defaultTomeVisibility()).toLowerCase();
  return {
    visibility: TOME_VISIBILITY[visibilityRaw] ? visibilityRaw : "inherit",
    discovered: access.discovered == null ? defaultTomeDiscovered() : access.discovered !== false
  };
}

function getTomeAccess(document) {
  const publicAccess = publicAccessData(document);
  let notes = [];
  if (game.user?.isGM) {
    const overlay = getPrivateOverlay(document);
    notes = overlay.notes.length ? overlay.notes : normalizeGmNotes(document?.getFlag?.(MODULE_ID, FLAGS.ACCESS) || {});
  }
  return {
    ...publicAccess,
    gmNotes: game.user?.isGM ? String(notes[0]?.body || "").trim() : "",
    notes
  };
}

async function saveTomeAccess(document, { visibility = "inherit", discovered = true, notes = null } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can change Adventurer's Tome access metadata.");
  const normalizedVisibility = TOME_VISIBILITY[String(visibility || "inherit")] ? String(visibility) : "inherit";
  await document.setFlag(MODULE_ID, FLAGS.ACCESS, { visibility: normalizedVisibility, discovered: discovered !== false });
  if (Array.isArray(notes)) await setPrivateOverlay(document, { notes });
  return getTomeAccess(document);
}

function canViewInTome(document) {
  if (!document) return false;
  if (game.user?.isGM) return true;
  // Tome renders full campaign content, so require Foundry OBSERVER or better.
  // LIMITED visibility is intentionally not enough, which prevents Tome from
  // exposing more content than the underlying Foundry document permission.
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
  if (!document.testUserPermission?.(game.user, observer)) return false;
  const access = getTomeAccess(document);
  if (access.visibility === "gm") return false;
  if (!access.discovered) return false;
  return true;
}

function foundryOwnershipLabel(document) {
  const level = Number(document?.ownership?.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0);
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS || {};
  if (level >= Number(levels.OWNER ?? 3)) return "Owner";
  if (level >= Number(levels.OBSERVER ?? 2)) return "Observer";
  if (level >= Number(levels.LIMITED ?? 1)) return "Limited";
  return "None";
}

function accessView(document) {
  const access = getTomeAccess(document);
  const notes = access.notes.map((note) => ({
    ...note,
    typeLabel: GM_NOTE_TYPES[note.type]?.label || "Note",
    typeIcon: GM_NOTE_TYPES[note.type]?.icon || "fa-note-sticky",
    statusLabel: GM_NOTE_STATUSES[note.status]?.label || "Open",
    typeOptions: Object.entries(GM_NOTE_TYPES).map(([id, meta]) => ({ id, ...meta, selected: note.type === id })),
    statusOptions: Object.entries(GM_NOTE_STATUSES).map(([id, meta]) => ({ id, ...meta, selected: note.status === id }))
  }));
  return {
    ...access,
    notes,
    openNotes: notes.filter((note) => note.status !== "resolved"),
    resolvedNotes: notes.filter((note) => note.status === "resolved"),
    noteCount: notes.length,
    gmOnly: access.visibility === "gm",
    undiscovered: access.discovered === false,
    restricted: access.visibility === "gm" || access.discovered === false,
    foundryDefault: foundryOwnershipLabel(document),
    foundryVisibleToCurrentUser: Boolean(document?.visible),
    visibilityOptions: Object.entries(TOME_VISIBILITY).map(([id, meta]) => ({ id, ...meta, selected: access.visibility === id }))
  };
}

function factVisibility(value) {
  return String(value || "players").toLowerCase() === "gm" ? "gm" : "players";
}

function entryView(entry, extra = {}) {
  const raw = journalText(entry);
  const session = sessionDisplayMeta(entry.name);
  const flaggedSummary = String(entry.getFlag(MODULE_ID, "summary") ?? "").trim();
  const sessionSummary = session.number != null
    ? extractMarkdownSection(raw, ["Summary", "Sammanfattning", "Session summary", "Sessionssammanfattning"])
    : "";
  const summarySource = flaggedSummary || sessionSummary || raw || entry.name;
  const summary = truncate(summarySource, 220);
  const configuredQuestStatus = (() => { try { return game.settings.get(MODULE_ID, "defaultQuestStatus") || "active"; } catch (_err) { return "active"; } })();
  const status = normalizeQuestStatus(String(entry.getFlag(MODULE_ID, "status") ?? configuredQuestStatus));

  return {
    id: entry.id,
    name: entry.name,
    img: entry.img || null,
    summary,
    homeSummary: truncate(summarySource, 112),
    listSummary: truncate(summarySource, 150),
    sessionNumber: session.number,
    displayTitle: session.title,
    status,
    statusLabel: displayQuestStatus(status),
    featured: Boolean(entry.getFlag(MODULE_ID, "featured")),
    access: accessView(entry),
    ...extra
  };
}


function sessionListItems(value = "") {
  const items = [];
  for (const rawLine of String(value || "").replace(/\r\n?/g, "\n").split("\n")) {
    const match = rawLine.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/);
    if (!match) continue;
    const clean = stripInlineMarkdown(match[1])
      .replace(/^\s*[@#]/, "")
      .replace(/\s*(?:\||—|–)\s*.*$/, "")
      .trim();
    if (clean) items.push(clean);
  }
  return items;
}

function sessionSectionItems(raw = "", labels = []) {
  const section = extractMarkdownSection(raw, labels);
  return sessionListItems(section);
}

function matchesReferenceName(value = "", candidate = "") {
  const a = normalizeImportName(value);
  const b = normalizeImportName(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function sessionReferenceCandidates(raw = "", candidates = [], labels = [], limit = 8) {
  const explicit = sessionSectionItems(raw, labels);
  const rawNormalized = normalizeImportName(raw);
  const selected = [];
  const seen = new Set();

  const add = (candidate) => {
    if (!candidate || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    selected.push(candidate);
  };

  for (const item of explicit) {
    const match = candidates.find((candidate) => matchesReferenceName(item, candidate.name));
    if (match) add(match);
    if (selected.length >= limit) return selected;
  }

  // Fallback for ordinary prose and older sessions: link only full document names
  // that are actually mentioned. This deliberately avoids fuzzy token matching,
  // keeping cross-links conservative instead of inventing associations.
  for (const candidate of candidates) {
    const name = normalizeImportName(candidate.name);
    if (name.length < 4) continue;
    if (rawNormalized.includes(name)) add(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getTomeLinks(document) {
  const raw = document?.getFlag?.(MODULE_ID, FLAGS.LINKS);
  const links = raw && typeof raw === "object" ? raw : {};
  const normalize = (value) => Array.isArray(value) ? [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))] : [];
  return {
    sessions: normalize(links.sessions),
    quests: normalize(links.quests),
    world: normalize(links.world),
    actors: normalize(links.actors)
  };
}

function textMentionsName(text = "", name = "") {
  const needle = normalizeImportName(name);
  if (!needle || needle.length < 4) return false;
  return normalizeImportName(text).includes(needle);
}

function actorProfileText(actor) {
  const profile = getActorProfile(actor);
  if (!profile) return "";
  const relationText = profile.relations.map((relation) => {
    const target = game.actors.get(relation.actorId);
    return [relation.label, relation.note, target?.name].filter(Boolean).join(" ");
  }).join(" ");
  return [
    actor.name, profile.title, profile.subtitle, profile.summary, profile.biography, profile.motto,
    ...profile.facts.flatMap((fact) => [fact.label, fact.value]), relationText
  ].filter(Boolean).join(" ");
}

function worldProfileText(entry) {
  const profile = getWorldProfile(entry);
  return [entry?.name, profile?.subtitle, profile?.summary, profile?.body, journalText(entry), ...(profile?.facts || []).flatMap((fact) => [fact.label, fact.value])].filter(Boolean).join(" ");
}

function candidatesFromExplicit(document, key, candidates = []) {
  const ids = new Set(getTomeLinks(document)[key] || []);
  return candidates.filter((candidate) => ids.has(candidate.id));
}

function actorReferenceTerms(candidate, actors = []) {
  const actor = game.actors.get(candidate?.id);
  if (!actor) return [];
  const profile = getActorProfile(actor);
  const terms = [actor.name];
  const first = String(actor.name || "").trim().split(/\s+/)[0];
  if (first.length >= 4) {
    const collisions = actors.filter((other) => String(other?.name || "").trim().split(/\s+/)[0].toLowerCase() === first.toLowerCase());
    if (collisions.length === 1) terms.push(first);
  }
  if (profile?.title && profile.title.length >= 5) terms.push(profile.title);
  for (const fact of profile?.facts || []) {
    if (/^(?:alias|nickname|known as|called|smeknamn|känd som)$/i.test(fact.label) && fact.value) terms.push(fact.value);
  }
  return [...new Set(terms.map((term) => String(term || "").trim()).filter(Boolean))];
}

function textMentionsActor(text = "", candidate, actors = []) {
  return actorReferenceTerms(candidate, actors).some((term) => textMentionsName(text, term));
}

function actorReferenceCandidates(raw = "", actors = [], labels = [], limit = 10) {
  const selected = [...sessionReferenceCandidates(raw, actors, labels, limit)];
  const seen = new Set(selected.map((actor) => actor.id));
  for (const actor of actors) {
    if (seen.has(actor.id)) continue;
    if (textMentionsActor(raw, actor, actors)) { selected.push(actor); seen.add(actor.id); }
    if (selected.length >= limit) break;
  }
  return selected;
}

function sessionMentionedInText(raw = "", session = {}) {
  if (textMentionsName(raw, session.name)) return true;
  if (session.displayTitle && textMentionsName(raw, session.displayTitle)) return true;
  if (session.sessionNumber != null) {
    const re = new RegExp(`\\bsession\\s*0*${Number(session.sessionNumber)}\\b`, "i");
    if (re.test(String(raw || ""))) return true;
  }
  return false;
}

function sessionLinksToTarget(session, target, targetKey, labels = []) {
  const entry = game.journal.get(session?.id);
  if (!entry || !target?.id) return false;
  const explicit = getTomeLinks(entry)[targetKey] || [];
  if (explicit.includes(target.id)) return true;
  const raw = journalText(entry);
  if (labels.length && sessionReferenceCandidates(raw, [target], labels, 1).length) return true;
  return textMentionsName(raw, target.name);
}

function linkedSessionsForTarget(targetDocument, targetView, sessions = [], targetKey, labels = []) {
  if (!targetDocument || !targetView) return [];
  const targetExplicit = new Set(getTomeLinks(targetDocument).sessions);
  const directText = targetDocument?.documentName === "Actor" ? actorProfileText(targetDocument) : journalText(targetDocument);
  return sessions.filter((session) => {
    if (targetExplicit.has(session.id)) return true;
    if (sessionMentionedInText(directText, session)) return true;
    return sessionLinksToTarget(session, targetView, targetKey, labels);
  });
}

function questDetailView(questView, sessions = [], world = [], actors = []) {
  if (!questView?.id) return null;
  const entry = game.journal.get(questView.id);
  if (!entry) return null;
  const raw = journalText(entry);
  const summarySection = extractMarkdownSection(raw, ["Summary", "Sammanfattning", "Quest summary", "Uppdragssammanfattning"]);
  const objectivesSection = extractMarkdownSection(raw, ["Objectives", "Objective", "Goals", "Goal", "Mål", "Delmål"]);
  const updatesSection = extractMarkdownSection(raw, ["Updates", "Quest Updates", "Progress", "Developments", "Utveckling", "Uppdateringar"]);
  const objectives = sessionListItems(objectivesSection).slice(0, 8);
  let updates = sessionListItems(updatesSection).slice(0, 8);
  if (!updates.length && updatesSection) updates = stripMarkup(updatesSection).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);

  const sessionLinks = linkedSessionsForTarget(entry, questView, sessions, "quests", [
    "Quest Updates", "Quest Update", "Quests", "Quest Log", "Questlogg", "Uppdrag", "Uppdragsuppdateringar"
  ]);
  const explicitWorld = candidatesFromExplicit(entry, "world", world);
  const inferredWorld = world.filter((candidate) => textMentionsName(raw, candidate.name));
  const worldLinks = uniqueById([...explicitWorld, ...inferredWorld]).slice(0, 12);
  const explicitActors = candidatesFromExplicit(entry, "actors", actors);
  const inferredActors = actors.filter((candidate) => textMentionsActor(raw, candidate, actors));
  const actorLinks = uniqueById([...explicitActors, ...inferredActors]).slice(0, 12);
  const orderedSessions = [...sessionLinks].sort((a, b) => (a.sessionNumber ?? 99999) - (b.sessionNumber ?? 99999));

  return {
    ...questView,
    summary: truncate(summarySection || questView.summary || raw || entry.name, 520),
    bodyPreview: truncate(raw || questView.summary || entry.name, 1600),
    objectives,
    hasObjectives: objectives.length > 0,
    updates,
    hasUpdates: updates.length > 0,
    sessionLinks: orderedSessions,
    hasSessionLinks: orderedSessions.length > 0,
    firstSession: orderedSessions[0] || null,
    lastSession: orderedSessions.length ? orderedSessions[orderedSessions.length - 1] : null,
    worldLinks,
    hasWorldLinks: worldLinks.length > 0,
    actorLinks,
    hasActorLinks: actorLinks.length > 0,
    linkedCount: orderedSessions.length + worldLinks.length + actorLinks.length
  };
}

function sessionDetailView(sessionView, quests = [], world = [], actors = []) {
  if (!sessionView?.id) return null;
  const entry = game.journal.get(sessionView.id);
  if (!entry) return null;
  const raw = journalText(entry);
  const summarySection = extractMarkdownSection(raw, ["Summary", "Sammanfattning", "Session summary", "Sessionssammanfattning"]);
  const highlightsSection = extractMarkdownSection(raw, ["Highlights", "Important events", "Key events", "Viktiga händelser", "Händelser"]);
  let highlights = sessionListItems(highlightsSection).slice(0, 6);
  if (!highlights.length && highlightsSection) {
    highlights = stripMarkup(highlightsSection).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
  }

  const questLinks = sessionReferenceCandidates(raw, quests, [
    "Quest Updates", "Quest Update", "Quests", "Quest Log", "Questlogg", "Uppdrag", "Uppdragsuppdateringar"
  ], 6);
  const explicitWorldLinks = candidatesFromExplicit(entry, "world", world);
  const inferredWorldLinks = sessionReferenceCandidates(raw, world, [
    "World", "World Updates", "NPC", "NPCs", "Locations", "Places", "Platser", "Factions", "Fraktioner", "Items", "Föremål", "Lore"
  ], 8);
  const worldLinks = uniqueById([...explicitWorldLinks, ...inferredWorldLinks]).slice(0, 10);
  const explicitActorLinks = candidatesFromExplicit(entry, "actors", actors);
  const inferredActorLinks = actorReferenceCandidates(raw, actors, [
    "Characters", "Character", "People", "Personer", "Companions", "Följeslagare"
  ], 8);
  const actorLinks = uniqueById([...explicitActorLinks, ...inferredActorLinks]).slice(0, 10);

  const summary = truncate(summarySection || sessionView.summary || raw || entry.name, 420);
  const bodyPreview = truncate(raw || summary, 900);
  return {
    ...sessionView,
    summary,
    bodyPreview,
    highlights,
    hasHighlights: highlights.length > 0,
    questLinks,
    hasQuestLinks: questLinks.length > 0,
    worldLinks,
    hasWorldLinks: worldLinks.length > 0,
    actorLinks,
    hasActorLinks: actorLinks.length > 0,
    linkedCount: questLinks.length + worldLinks.length + actorLinks.length
  };
}

/**
 * Normalize Tome-owned profile data stored on an Actor flag.
 * This deliberately contains campaign presentation data only.
 */
function getActorProfile(actorOrId) {
  const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId;
  if (!actor) return null;

  const raw = actor.getFlag(MODULE_ID, FLAGS.PROFILE);
  const profile = raw && typeof raw === "object" ? raw : {};
  const overlay = getPrivateOverlay(actor);

  const normalizeFact = (fact, forcedVisibility = null) => ({
    label: String(fact?.label ?? "").trim(),
    value: String(fact?.value ?? "").trim(),
    visibility: forcedVisibility || factVisibility(fact?.visibility),
    gmOnly: (forcedVisibility || factVisibility(fact?.visibility)) === "gm"
  });
  const normalizeRelation = (relation, forcedVisibility = null) => ({
    actorId: String(relation?.actorId ?? "").trim(),
    label: String(relation?.label ?? "").trim(),
    note: String(relation?.note ?? "").trim(),
    visibility: forcedVisibility || factVisibility(relation?.visibility),
    gmOnly: (forcedVisibility || factVisibility(relation?.visibility)) === "gm"
  });

  const sharedFacts = Array.isArray(profile.facts) ? profile.facts.map((fact) => normalizeFact(fact)).filter((fact) => fact.label || fact.value) : [];
  const sharedRelations = Array.isArray(profile.relations) ? profile.relations.map((relation) => normalizeRelation(relation)).filter((relation) => relation.actorId) : [];
  const privateFacts = game.user?.isGM ? overlay.facts.map((fact) => normalizeFact(fact, "gm")).filter((fact) => fact.label || fact.value) : [];
  const privateRelations = game.user?.isGM ? overlay.relations.map((relation) => normalizeRelation(relation, "gm")).filter((relation) => relation.actorId) : [];

  const facts = game.user?.isGM ? [...sharedFacts, ...privateFacts] : sharedFacts.filter((fact) => fact.visibility !== "gm");
  const relations = game.user?.isGM ? [...sharedRelations, ...privateRelations] : sharedRelations.filter((relation) => relation.visibility !== "gm");

  return {
    title: String(profile.title ?? "").trim(),
    subtitle: String(profile.subtitle ?? "").trim(),
    summary: String(profile.summary ?? "").trim(),
    biography: String(profile.biography ?? "").trim(),
    heroImage: String(profile.heroImage ?? "").trim(),
    motto: String(profile.motto ?? "").trim(),
    firstSessionId: String(profile.firstSessionId ?? "").trim(),
    customLinks: (Array.isArray(profile.customLinks) ? profile.customLinks : []).map(normalizeCustomLink).filter((link) => link.label && link.target),
    facts,
    relations
  };
}

function actorView(actor) {
  const profile = getActorProfile(actor);
  const fallbackImage = actor.img || "icons/svg/mystery-man.svg";
  const displayRole = profile.title || profile.subtitle || game.i18n.localize("AT.GenericAdventurer") || "Adventurer";

  return {
    id: actor.id,
    name: actor.name,
    img: profile.heroImage || fallbackImage,
    actorImg: fallbackImage,
    owner: actor.isOwner,
    title: profile.title,
    subtitle: profile.subtitle,
    summary: profile.summary,
    displayRole,
    access: accessView(actor),
    hasProfile: Boolean(
      profile.title
      || profile.subtitle
      || profile.summary
      || profile.biography
      || profile.heroImage
      || profile.motto
      || profile.firstSessionId
      || profile.customLinks.length
      || profile.facts.length
      || profile.relations.length
    )
  };
}


const WORLD_CATEGORIES = Object.freeze({
  npc: { label: "NPC", icon: "fa-user" },
  location: { label: "Location", icon: "fa-location-dot" },
  faction: { label: "Faction", icon: "fa-flag" },
  item: { label: "Item", icon: "fa-gem" },
  lore: { label: "Lore", icon: "fa-book" }
});

function inferWorldCategory(entry) {
  const flagged = String(entry?.getFlag?.(MODULE_ID, FLAGS.WORLD_PROFILE)?.category ?? "").toLowerCase();
  if (WORLD_CATEGORIES[flagged]) return flagged;
  const names = folderLineageNames(entry?.folder);
  const joined = names.join(" ");
  if (/npc|people|person|character/.test(joined)) return "npc";
  if (/place|location|region|city|town/.test(joined)) return "location";
  if (/faction|group|organization|organisation/.test(joined)) return "faction";
  if (/item|artifact|artefact|object/.test(joined)) return "item";
  try {
    const configured = String(game.settings.get(MODULE_ID, "defaultWorldCategory") || "lore").toLowerCase();
    return WORLD_CATEGORIES[configured] ? configured : "lore";
  } catch (_err) {
    return "lore";
  }
}

function getWorldProfile(entryOrId) {
  const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId;
  if (!entry) return null;
  const raw = entry.getFlag(MODULE_ID, FLAGS.WORLD_PROFILE);
  const profile = raw && typeof raw === "object" ? raw : {};
  const overlay = getPrivateOverlay(entry);
  const normalizeFact = (fact, forcedVisibility = null) => ({
    label: String(fact?.label ?? "").trim(),
    value: String(fact?.value ?? "").trim(),
    visibility: forcedVisibility || factVisibility(fact?.visibility),
    gmOnly: (forcedVisibility || factVisibility(fact?.visibility)) === "gm"
  });
  const sharedFacts = Array.isArray(profile.facts) ? profile.facts.map((fact) => normalizeFact(fact)).filter((fact) => fact.label || fact.value) : [];
  const privateFacts = game.user?.isGM ? overlay.facts.map((fact) => normalizeFact(fact, "gm")).filter((fact) => fact.label || fact.value) : [];
  const facts = game.user?.isGM ? [...sharedFacts, ...privateFacts] : sharedFacts.filter((fact) => fact.visibility !== "gm");
  const normalized = {
    category: WORLD_CATEGORIES[String(profile.category ?? "").toLowerCase()] ? String(profile.category).toLowerCase() : inferWorldCategory(entry),
    subtitle: String(profile.subtitle ?? "").trim(),
    summary: String(profile.summary ?? "").trim(),
    heroImage: String(profile.heroImage ?? "").trim(),
    actorId: String(profile.actorId ?? "").trim(),
    syncPageId: String(profile.syncPageId ?? "").trim(),
    facts
  };
  normalized.body = worldSyncedBody(entry, profile);
  return normalized;
}


/**
 * Resolve the Foundry Actor behind a World entry without touching game-system data.
 * Explicit Tome links win. If no Actor has been linked yet, a single exact-name
 * Actor match is used as a safe convenience fallback (useful for imported/demo NPCs).
 */
function resolveWorldActor(entryOrId, profile = null) {
  const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId;
  if (!entry) return null;
  const worldProfile = profile || getWorldProfile(entry);
  if (worldProfile?.actorId) {
    const explicit = game.actors.get(worldProfile.actorId);
    if (explicit) return explicit;
  }
  const name = String(entry.name || "").trim().toLocaleLowerCase(game.i18n?.lang || undefined);
  if (!name) return null;
  const matches = game.actors.contents.filter((actor) => String(actor.name || "").trim().toLocaleLowerCase(game.i18n?.lang || undefined) === name);
  return matches.length === 1 ? matches[0] : null;
}

async function migrateLegacyPrivateData() {
  if (!game.user?.isGM) return { migrated: 0 };

  // v0.15.1 and earlier stored GM workflow state in world settings. Move it
  // into V13 user-scoped settings so each GM keeps private state in their own
  // account rather than publishing it to every client in the World.
  const settingMigrations = [
    ["revealQueue", PRIVATE_REVEAL_SETTING, "[]"],
    ["importHistory", PRIVATE_IMPORT_HISTORY_SETTING, "[]"],
    ["lastImportUndo", PRIVATE_IMPORT_UNDO_SETTING, ""]
  ];
  for (const [legacyKey, privateKey, emptyValue] of settingMigrations) {
    try {
      const legacy = game.settings.get(MODULE_ID, legacyKey);
      const current = game.settings.get(MODULE_ID, privateKey);
      const currentEmpty = current == null || current === emptyValue || (emptyValue === "[]" && String(current).trim() === "[]");
      const legacyHasData = legacy != null && legacy !== emptyValue && !(emptyValue === "[]" && String(legacy).trim() === "[]");
      if (currentEmpty && legacyHasData) await game.settings.set(MODULE_ID, privateKey, legacy);
      if (legacyHasData) await game.settings.set(MODULE_ID, legacyKey, emptyValue);
    } catch (error) {
      console.warn(`Adventurer's Tome | Could not migrate private setting ${legacyKey}`, error);
    }
  }

  const vault = getPrivateVault();
  let vaultChanged = false;
  let migrated = 0;
  const cleanups = [];
  const uniqueObjects = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  for (const document of [...game.actors.contents, ...game.journal.contents]) {
    const key = privateVaultKey(document);
    const existing = vault[key] && typeof vault[key] === "object" ? vault[key] : { notes: [], facts: [], relations: [] };
    let next = {
      notes: Array.isArray(existing.notes) ? existing.notes.map(normalizeGmNote) : [],
      facts: Array.isArray(existing.facts) ? foundry.utils.deepClone(existing.facts) : [],
      relations: Array.isArray(existing.relations) ? foundry.utils.deepClone(existing.relations) : []
    };
    let documentChanged = false;

    const rawAccess = document.getFlag?.(MODULE_ID, FLAGS.ACCESS);
    if (rawAccess && typeof rawAccess === "object") {
      const legacyNotes = normalizeGmNotes(rawAccess);
      if (legacyNotes.length) {
        next.notes = uniqueObjects([...next.notes, ...legacyNotes]);
        vaultChanged = true;
        migrated += legacyNotes.length;
      }
      if (Object.hasOwn(rawAccess, "notes") || Object.hasOwn(rawAccess, "gmNotes")) {
        const cleanAccess = {
          visibility: TOME_VISIBILITY[String(rawAccess.visibility || "inherit")] ? String(rawAccess.visibility) : "inherit",
          discovered: rawAccess.discovered == null ? defaultTomeDiscovered() : rawAccess.discovered !== false
        };
        cleanups.push(() => document.setFlag(MODULE_ID, FLAGS.ACCESS, cleanAccess));
        documentChanged = true;
      }
    }

    if (document.documentName === "Actor") {
      const rawProfile = document.getFlag?.(MODULE_ID, FLAGS.PROFILE);
      if (rawProfile && typeof rawProfile === "object") {
        const privateFacts = (Array.isArray(rawProfile.facts) ? rawProfile.facts : []).filter((fact) => factVisibility(fact?.visibility) === "gm");
        const privateRelations = (Array.isArray(rawProfile.relations) ? rawProfile.relations : []).filter((relation) => factVisibility(relation?.visibility) === "gm");
        if (privateFacts.length || privateRelations.length) {
          next.facts = uniqueObjects([...next.facts, ...privateFacts]);
          next.relations = uniqueObjects([...next.relations, ...privateRelations]);
          vaultChanged = true;
          migrated += privateFacts.length + privateRelations.length;
          const cleanProfile = {
            ...rawProfile,
            facts: (Array.isArray(rawProfile.facts) ? rawProfile.facts : []).filter((fact) => factVisibility(fact?.visibility) !== "gm"),
            relations: (Array.isArray(rawProfile.relations) ? rawProfile.relations : []).filter((relation) => factVisibility(relation?.visibility) !== "gm")
          };
          cleanups.push(() => document.setFlag(MODULE_ID, FLAGS.PROFILE, cleanProfile));
          documentChanged = true;
        }
      }
    } else if (document.documentName === "JournalEntry") {
      const rawProfile = document.getFlag?.(MODULE_ID, FLAGS.WORLD_PROFILE);
      if (rawProfile && typeof rawProfile === "object") {
        const privateFacts = (Array.isArray(rawProfile.facts) ? rawProfile.facts : []).filter((fact) => factVisibility(fact?.visibility) === "gm");
        if (privateFacts.length) {
          next.facts = uniqueObjects([...next.facts, ...privateFacts]);
          vaultChanged = true;
          migrated += privateFacts.length;
          const cleanProfile = {
            ...rawProfile,
            facts: (Array.isArray(rawProfile.facts) ? rawProfile.facts : []).filter((fact) => factVisibility(fact?.visibility) !== "gm")
          };
          cleanups.push(() => document.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, cleanProfile));
          documentChanged = true;
        }
      }
    }

    if (next.notes.length || next.facts.length || next.relations.length) {
      vault[key] = next;
      if (documentChanged) vaultChanged = true;
    }
  }

  // Write the private copy first; only then remove legacy private fields from
  // shared Documents. This ordering prevents a failed migration from losing GM data.
  if (vaultChanged) await game.settings.set(MODULE_ID, PRIVATE_VAULT_SETTING, JSON.stringify(vault));
  for (const cleanup of cleanups) await cleanup();
  return { migrated };
}

function worldEntryView(entry) {
  const base = entryView(entry);
  const profile = getWorldProfile(entry);
  const meta = WORLD_CATEGORIES[profile.category] || WORLD_CATEGORIES.lore;
  const journalFallback = stripMarkup(journalText(entry));
  return {
    ...base,
    category: profile.category,
    categoryLabel: meta.label,
    icon: meta.icon,
    subtitle: profile.subtitle,
    summary: profile.summary || base.summary,
    body: profile.body || journalFallback,
    img: profile.heroImage || entry.img || null,
    actorId: profile.actorId,
    syncedToJournal: Boolean(getWorldSyncPage(entry, profile)),
    heroImage: profile.heroImage,
    facts: profile.facts,
    hasTomeProfile: Boolean(profile.subtitle || profile.summary || profile.body || profile.heroImage || profile.facts.length)
  };
}

/**
 * v0.1.0 used a world setting containing Actor IDs. Keep reading it as a
 * backwards-compatible fallback while v0.1.1 moves membership onto Actor flags.
 */
function getLegacyGroupActorIds() {
  return safeJSONParse(game.settings.get(MODULE_ID, "groupActors"), []);
}

function actorIsGroupMember(actor, legacyIds = new Set()) {
  const flagged = actor.getFlag(MODULE_ID, FLAGS.GROUP_MEMBER);
  if (flagged === true) return true;
  if (flagged === false) return false;
  return legacyIds.has(actor.id);
}

function getGroupActors() {
  const legacyIds = new Set(getLegacyGroupActorIds());
  const sortMode = String(game.settings.get(MODULE_ID, "groupSort") || "manual");

  return game.actors.contents
    .filter((actor) => canViewInTome(actor))
    .filter((actor) => actorIsGroupMember(actor, legacyIds))
    .sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
      const aOrder = Number(a.getFlag(MODULE_ID, FLAGS.GROUP_ORDER) ?? 9999);
      const bOrder = Number(b.getFlag(MODULE_ID, FLAGS.GROUP_ORDER) ?? 9999);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
    })
    .map(actorView);
}


function parseTomeRefKey(refKey = "") {
  const match = String(refKey || "").trim().match(/^(session|quest|world|rule|actor):(.+)$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase(), id: match[2] };
}

function resolveTomeRefKey(refKey = "") {
  const parsed = parseTomeRefKey(refKey);
  if (!parsed) return null;
  if (parsed.type === "actor") return game.actors.get(parsed.id) || null;
  const journal = game.journal.get(parsed.id) || null;
  if (!journal) return null;
  const inferred = inferJournalRefKey(journal);
  if (!inferred) return null;
  const inferredType = inferred.split(":")[0];
  return inferredType === parsed.type ? journal : null;
}

function validExplicitLinkTarget(key, id) {
  const targetId = String(id || "").trim();
  if (!targetId) return false;
  if (key === "actors") return Boolean(game.actors.get(targetId));
  const journal = game.journal.get(targetId);
  if (!journal) return false;
  const type = inferJournalRefKey(journal).split(":")[0];
  return (key === "sessions" && type === "session")
    || (key === "quests" && type === "quest")
    || (key === "world" && type === "world");
}

function healthIssue(code, label, detail, repairable = false, document = null) {
  return {
    code,
    label,
    detail: String(detail || ""),
    repairable: Boolean(repairable),
    documentName: document?.name || "",
    documentId: document?.id || "",
    documentType: document?.documentName || ""
  };
}

function buildTomeHealthReport() {
  const issues = [];
  let checked = 0;

  const favorites = getFavoriteRefs();
  const recent = getRecentRefs();
  for (const [kind, refs] of [["Favorite", favorites], ["Recent", recent]]) {
    for (const ref of refs) {
      checked += 1;
      if (!resolveTomeRefKey(ref)) issues.push(healthIssue("stale-client-ref", `${kind} points to missing content`, ref, true));
    }
  }

  const journalDocs = game.journal?.contents || [];
  const actorDocs = game.actors?.contents || [];
  const allDocs = [...journalDocs, ...actorDocs];
  for (const document of allDocs) {
    checked += 1;
    const rawLinksFlag = document.getFlag?.(MODULE_ID, FLAGS.LINKS);
    if (rawLinksFlag != null && (typeof rawLinksFlag !== "object" || Array.isArray(rawLinksFlag))) {
      issues.push(healthIssue("malformed-links", "Malformed explicit cross-links", "Links flag is not an object.", true, document));
    }
    const links = getTomeLinks(document);
    for (const [key, ids] of Object.entries(links)) {
      for (const id of ids) {
        checked += 1;
        if (!validExplicitLinkTarget(key, id)) issues.push(healthIssue("broken-explicit-link", `Broken or mismatched ${key} cross-link`, id, true, document));
      }
    }

    const rawAccess = document.getFlag?.(MODULE_ID, FLAGS.ACCESS);
    if (rawAccess != null && (typeof rawAccess !== "object" || Array.isArray(rawAccess))) {
      issues.push(healthIssue("malformed-access", "Malformed Tome access metadata", "Access flag is not an object.", true, document));
    } else if (rawAccess && (Object.hasOwn(rawAccess, "notes") || Object.hasOwn(rawAccess, "gmNotes"))) {
      issues.push(healthIssue("legacy-private-access", "Legacy GM Notes are still stored on a shared Document", "Run safe repair to migrate them into the private GM user vault.", true, document));
    }
  }

  if (game.user?.isGM) {
    const vault = getPrivateVault();
    for (const [key, overlay] of Object.entries(vault)) {
      checked += 1;
      const source = resolvePrivateVaultKey(key);
      if (!source) {
        issues.push(healthIssue("stale-private-vault", "Private GM data points to deleted content", key, true));
        continue;
      }
      const relations = Array.isArray(overlay?.relations) ? overlay.relations : [];
      for (const relation of relations) {
        const targetId = String(relation?.actorId || "").trim();
        if (targetId && !game.actors.get(targetId)) issues.push(healthIssue("broken-private-relation", "Private GM relation target is missing", targetId, true, source));
      }
    }
  }

  for (const actor of actorDocs) {
    checked += 1;
    const raw = actor.getFlag?.(MODULE_ID, FLAGS.PROFILE);
    if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) {
      issues.push(healthIssue("malformed-actor-profile", "Malformed character profile", "Profile flag is not an object.", true, actor));
      continue;
    }
    const legacyPrivateFacts = (Array.isArray(raw?.facts) ? raw.facts : []).filter((fact) => factVisibility(fact?.visibility) === "gm");
    const legacyPrivateRelations = (Array.isArray(raw?.relations) ? raw.relations : []).filter((relation) => factVisibility(relation?.visibility) === "gm");
    if (legacyPrivateFacts.length || legacyPrivateRelations.length) issues.push(healthIssue("legacy-private-profile", "Legacy private Character data is still stored on a shared Actor", `${legacyPrivateFacts.length} fact(s), ${legacyPrivateRelations.length} relation(s)`, true, actor));
    const relations = Array.isArray(raw?.relations) ? raw.relations : [];
    for (const relation of relations) {
      const targetId = String(relation?.actorId || "").trim();
      if (targetId && !game.actors.get(targetId)) issues.push(healthIssue("broken-relation", "Character relation target is missing", targetId, true, actor));
    }
    const firstSessionId = String(raw?.firstSessionId || "").trim();
    if (firstSessionId && !game.journal.get(firstSessionId)) issues.push(healthIssue("broken-first-session", "First appeared Session is missing", firstSessionId, true, actor));
  }

  for (const journal of journalDocs) {
    checked += 1;
    const ref = inferJournalRefKey(journal);
    const type = ref ? ref.split(":")[0] : "";
    if (type === "quest") {
      const rawStatus = journal.getFlag?.(MODULE_ID, "status");
      if (rawStatus != null && !["active", "completed", "failed", "dormant"].includes(String(rawStatus).toLowerCase())) {
        issues.push(healthIssue("invalid-quest-status", "Unsupported Quest status", String(rawStatus), true, journal));
      }
    }
    if (type === "world") {
      const rawProfile = journal.getFlag?.(MODULE_ID, FLAGS.WORLD_PROFILE);
      if (rawProfile != null && (typeof rawProfile !== "object" || Array.isArray(rawProfile))) {
        issues.push(healthIssue("malformed-world-profile", "Malformed World profile", "World profile flag is not an object.", true, journal));
      } else {
        if (rawProfile?.category && !WORLD_CATEGORIES[String(rawProfile.category).toLowerCase()]) issues.push(healthIssue("invalid-world-category", "Unsupported World category", String(rawProfile.category), true, journal));
        const legacyPrivateFacts = (Array.isArray(rawProfile?.facts) ? rawProfile.facts : []).filter((fact) => factVisibility(fact?.visibility) === "gm");
        if (legacyPrivateFacts.length) issues.push(healthIssue("legacy-private-world", "Legacy private World facts are still stored on a shared Journal", `${legacyPrivateFacts.length} fact(s)`, true, journal));
      }
    }
  }

  const sessions = sectionEntries("sessions").map(entryView).filter((entry) => entry.sessionNumber != null);
  const bySessionNumber = new Map();
  for (const session of sessions) {
    const list = bySessionNumber.get(session.sessionNumber) || [];
    list.push(session.name);
    bySessionNumber.set(session.sessionNumber, list);
  }
  for (const [number, names] of bySessionNumber.entries()) {
    if (names.length > 1) issues.push(healthIssue("duplicate-session-number", `Duplicate Session ${number}`, names.join(" · "), false));
  }

  const ambiguitySets = [
    ["Actor", actorDocs],
    ["Quest", sectionEntries("quests")],
    ["World", sectionEntries("world")]
  ];
  for (const [kind, docs] of ambiguitySets) {
    const names = new Map();
    for (const doc of docs) {
      const key = normalizeImportName(doc.name);
      if (!key) continue;
      const list = names.get(key) || [];
      list.push(doc.name);
      names.set(key, list);
    }
    for (const values of names.values()) {
      if (values.length > 1) issues.push(healthIssue("duplicate-name", `Duplicate ${kind} name may make automatic linking ambiguous`, values.join(" · "), false));
    }
  }

  const repairable = issues.filter((issue) => issue.repairable).length;
  return {
    ran: true,
    timestamp: Date.now(),
    checked,
    issues,
    issueCount: issues.length,
    repairable,
    warningCount: issues.length - repairable,
    healthy: issues.length === 0,
    summary: issues.length === 0
      ? `Healthy — ${checked} references and Tome records checked.`
      : `${issues.length} issue${issues.length === 1 ? "" : "s"} found · ${repairable} safe repair${repairable === 1 ? "" : "s"} available.`
  };
}

async function repairTomeHealthIssues() {
  if (!game.user?.isGM) throw new Error("Only a GM can repair Adventurer's Tome data.");
  const before = buildTomeHealthReport();
  let repaired = 0;
  const migration = await migrateLegacyPrivateData();
  if (migration.migrated) repaired += migration.migrated;

  const validFavorites = getFavoriteRefs().filter((ref) => resolveTomeRefKey(ref));
  if (validFavorites.length !== getFavoriteRefs().length) { await setFavoriteRefs(validFavorites); repaired += 1; }
  const validRecent = getRecentRefs().filter((ref) => resolveTomeRefKey(ref));
  if (validRecent.length !== getRecentRefs().length) { await game.settings.set(MODULE_ID, "recentItems", JSON.stringify(validRecent)); repaired += 1; }

  const vault = getPrivateVault();
  let vaultChanged = false;
  for (const key of Object.keys(vault)) {
    const source = resolvePrivateVaultKey(key);
    if (!source) { delete vault[key]; vaultChanged = true; repaired += 1; continue; }
    if (Array.isArray(vault[key]?.relations)) {
      const cleaned = vault[key].relations.filter((relation) => !relation?.actorId || Boolean(game.actors.get(String(relation.actorId))));
      if (cleaned.length !== vault[key].relations.length) { vault[key].relations = cleaned; vaultChanged = true; repaired += 1; }
    }
  }
  if (vaultChanged) await game.settings.set(MODULE_ID, PRIVATE_VAULT_SETTING, JSON.stringify(vault));

  for (const document of [...(game.journal?.contents || []), ...(game.actors?.contents || [])]) {
    const rawLinksFlag = document.getFlag?.(MODULE_ID, FLAGS.LINKS);
    const rawLinks = getTomeLinks(document);
    const cleaned = {
      sessions: rawLinks.sessions.filter((id) => validExplicitLinkTarget("sessions", id)),
      quests: rawLinks.quests.filter((id) => validExplicitLinkTarget("quests", id)),
      world: rawLinks.world.filter((id) => validExplicitLinkTarget("world", id)),
      actors: rawLinks.actors.filter((id) => validExplicitLinkTarget("actors", id))
    };
    if ((rawLinksFlag != null && (typeof rawLinksFlag !== "object" || Array.isArray(rawLinksFlag))) || JSON.stringify(rawLinks) !== JSON.stringify(cleaned)) { await document.setFlag(MODULE_ID, FLAGS.LINKS, cleaned); repaired += 1; }

    const rawAccess = document.getFlag?.(MODULE_ID, FLAGS.ACCESS);
    if (rawAccess != null && (typeof rawAccess !== "object" || Array.isArray(rawAccess))) {
      await document.setFlag(MODULE_ID, FLAGS.ACCESS, publicAccessData(document)); repaired += 1;
    }
  }

  for (const actor of game.actors?.contents || []) {
    const raw = actor.getFlag?.(MODULE_ID, FLAGS.PROFILE);
    if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) {
      await actor.setFlag(MODULE_ID, FLAGS.PROFILE, {}); repaired += 1; continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const next = foundry.utils.deepClone(raw);
    let actorChanged = false;
    if (Array.isArray(next.relations)) {
      const cleaned = next.relations.filter((relation) => !relation?.actorId || Boolean(game.actors.get(String(relation.actorId))));
      if (cleaned.length !== next.relations.length) { next.relations = cleaned; actorChanged = true; repaired += 1; }
    }
    if (next.firstSessionId && !game.journal.get(String(next.firstSessionId))) { next.firstSessionId = ""; actorChanged = true; repaired += 1; }
    if (actorChanged) await actor.setFlag(MODULE_ID, FLAGS.PROFILE, next);
  }

  for (const journal of game.journal?.contents || []) {
    const ref = inferJournalRefKey(journal);
    const type = ref ? ref.split(":")[0] : "";
    if (type === "quest") {
      const rawStatus = journal.getFlag?.(MODULE_ID, "status");
      if (rawStatus != null && !["active", "completed", "failed", "dormant"].includes(String(rawStatus).toLowerCase())) {
        await journal.setFlag(MODULE_ID, "status", normalizeQuestStatus(rawStatus)); repaired += 1;
      }
    }
    if (type === "world") {
      const rawProfile = journal.getFlag?.(MODULE_ID, FLAGS.WORLD_PROFILE);
      if (rawProfile != null && (typeof rawProfile !== "object" || Array.isArray(rawProfile))) {
        await journal.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, {}); repaired += 1;
      } else if (rawProfile?.category && !WORLD_CATEGORIES[String(rawProfile.category).toLowerCase()]) {
        const next = foundry.utils.deepClone(rawProfile);
        next.category = inferWorldCategory(journal);
        await journal.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, next); repaired += 1;
      }
    }
  }

  return { before, after: buildTomeHealthReport(), repaired };
}

async function createJournalFolder(name, parent = null) {
  const parentId = parent?.id ?? null;
  const existing = game.folders.find((folder) => (
    folder.type === "JournalEntry"
    && folder.name === name
    && (folder.folder?.id ?? null) === parentId
  ));

  if (existing) return existing;
  return Folder.create({ name, type: "JournalEntry", folder: parentId });
}


const DEMO_ASSETS = Object.freeze({
  hobbit: `modules/${MODULE_ID}/assets/demo/hobbit.svg`,
  ranger: `modules/${MODULE_ID}/assets/demo/ranger.svg`,
  wizard: `modules/${MODULE_ID}/assets/demo/wizard.svg`,
  elf: `modules/${MODULE_ID}/assets/demo/elf.svg`,
  dwarf: `modules/${MODULE_ID}/assets/demo/dwarf.svg`,
  warrior: `modules/${MODULE_ID}/assets/demo/warrior.svg`,
  noble: `modules/${MODULE_ID}/assets/demo/noble.svg`,
  shadow: `modules/${MODULE_ID}/assets/demo/shadow.svg`,
  location: `modules/${MODULE_ID}/assets/demo/location.svg`,
  item: `modules/${MODULE_ID}/assets/demo/item.svg`,
  faction: `modules/${MODULE_ID}/assets/demo/faction.svg`,
  lore: `modules/${MODULE_ID}/assets/demo/lore.svg`
});

const DEMO_PRESENTATION_KEYS = Object.freeze([
  "campaignTitle",
  "campaignSubtitle",
  "background",
  "currentLocation",
  "sessionLabel",
  "welcomeTitle",
  "welcomeText"
]);

function demoFlagData(extra = {}) {
  return { [MODULE_ID]: { [FLAGS.DEMO]: true, ...extra } };
}

function isDemoDocument(document) {
  return Boolean(document?.getFlag?.(MODULE_ID, FLAGS.DEMO));
}

function getDemoState() {
  return safeJSONParse(game.settings.get(MODULE_ID, "demoState"), {});
}

function getDemoSummary() {
  const actors = game.actors.contents.filter(isDemoDocument).length;
  const journals = game.journal.contents.filter(isDemoDocument).length;
  const folders = game.folders.filter(isDemoDocument).length;
  const state = getDemoState();
  return {
    active: Boolean(actors || journals || folders || state?.active),
    variant: String(state?.variant || ""),
    variantLabel: state?.campaign === "ashen-road"
      ? (state?.variant === "full" ? "Full Ashen Road Demo" : state?.variant === "small" ? "Small Ashen Road Demo" : "Ashen Road Demo")
      : (state?.variant === "full" ? "Legacy Full Demo" : state?.variant === "small" ? "Legacy Small Demo" : "Demo data"),
    actors,
    journals,
    folders
  };
}

function demoOwnership() {
  return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 };
}

function getDemoActorType() {
  const listed = Array.isArray(game.documentTypes?.Actor) ? game.documentTypes.Actor : [];
  const configured = Object.keys(CONFIG.Actor?.typeLabels ?? {});
  const types = [...new Set([...listed, ...configured])].filter(Boolean);
  const preferred = ["character", "pc", "player", "hero", "adventurer"];
  return preferred.find((type) => types.includes(type)) || types[0] || null;
}

async function createDemoFolder(name, type, parent = null) {
  const parentId = parent?.id ?? null;
  const existing = game.folders.find((folder) => (
    folder.type === type
    && folder.name === name
    && (folder.folder?.id ?? null) === parentId
    && isDemoDocument(folder)
  ));
  if (existing) return existing;
  return Folder.create({ name, type, folder: parentId, flags: demoFlagData() });
}

function demoPageData(name, html) {
  return [{
    name,
    type: "text",
    text: {
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
      content: html
    }
  }];
}

function demoParagraphs(...paragraphs) {
  return paragraphs.filter(Boolean).map((text) => `<p>${text}</p>`).join("");
}

function getDemoDefinition(variant = "small") {
  const full = variant === "full";

  const sessions = [
    { key: "s01", name: "Session 01 — The Lantern at Greyhaven", small: true, text: "A rain-soaked arrival in Greyhaven draws the party into the disappearance of a royal cartographer and the first rumours of the Ashen Road." },
    { key: "s02", name: "Session 02 — The Missing Cartographer", small: true, text: "Clues in Greyhaven lead the party toward Blackroot Forest, where abandoned survey markers point to a route no modern map records." },
    { key: "s03", name: "Session 03 — Shadows on the Ashen Road", small: true, text: "On the old road east, the party survives an ambush and finds evidence that someone is reopening sealed waystations along the frontier." },
    { key: "s04", name: "Session 04 — Blackroot Crossing", small: true, text: "The company crosses flooded woodland, bargains with Tovin Ash, and discovers a hidden entrance beneath the roots of an ancient bridge." },
    { key: "s05", name: "Session 05 — The Broken Observatory", small: true, text: "At the Broken Observatory, Mira Vale deciphers a damaged star chart while the Lantern Company searches the ruins for a missing relic." },
    { key: "s06", name: "Session 06 — The Bell Beneath the Hill", text: "A buried bell rings beneath Starfall Marsh, awakening old wards and drawing the Pale Traveller closer to the party." },
    { key: "s07", name: "Session 07 — Guests of House Valmere", text: "House Valmere offers shelter, politics, and carefully measured hospitality while evidence points toward a conspiracy inside Greyhaven." },
    { key: "s08", name: "Session 08 — The Flooded Archive", text: "The party descends into the Flooded Archive, recovers part of the Star Map, and learns why the Ashen Seal was broken generations ago." },
    { key: "s09", name: "Session 09 — The Silent Watchtower", text: "At the Silent Watchtower, Eryn Thorne discovers that the wardens vanished without a fight and left one warning carved into the stone." },
    { key: "s10", name: "Session 10 — Ember Pass", text: "The road through Ember Pass becomes a race against weather, raiders, and a caravan carrying the second fragment of the Star Map." },
    { key: "s11", name: "Session 11 — The Hollow Crown", text: "Beneath the Hollow Crown Ruins, the party confronts the Ashen Choir and learns that the old kings were protecting something rather than hiding treasure." },
    { key: "s12", name: "Session 12 — Siege of Greyhaven", text: "Greyhaven closes its gates as the Ashen Choir moves openly, forcing Captain Orlan and the party to choose what to defend first." },
    { key: "s13", name: "Session 13 — Beneath the Glass Vault", text: "The restored Star Map opens the path to the Glass Vault, where impossible reflections reveal the final purpose of the Ashen Seal." },
    { key: "s14", name: "Session 14 — The Broken Seal", text: "At Cinder Bridge, every unresolved alliance and secret converges as the party decides whether the Ashen Seal should be restored, remade, or destroyed." }
  ].filter((entry) => full || entry.small);

  const quests = [
    { name: "Find the Missing Cartographer", small: true, status: "active", featured: true, text: "Follow the vanished surveyor's trail from Greyhaven into Blackroot Forest and recover the missing expedition records." },
    { name: "Whispers Beneath Greyhaven", small: true, status: "active", featured: true, text: "Investigate reports of voices below the old city and determine who is using the forgotten tunnels." },
    { name: "Secure the Broken Observatory", small: true, status: "completed", text: "Clear the ruined observatory, recover its surviving records, and make the site safe enough for study." },
    { name: "Escort the Ember Caravan", small: true, status: "completed", text: "Guide a supply caravan through Ember Pass before winter closes the eastern road." },
    { name: "Recover the Star Map", status: "active", featured: true, text: "Reassemble the ancient Star Map from fragments scattered between the Flooded Archive, Ember Pass, and the Glass Vault." },
    { name: "Unmask the Lantern Thief", status: "completed", text: "Discover who has been stealing signal lanterns from Greyhaven's walls and why the thefts matter." },
    { name: "Warn House Valmere", status: "completed", text: "Deliver proof of the Ashen Choir's plans before House Valmere commits its riders elsewhere." },
    { name: "Break the Ashen Seal", status: "active", featured: true, text: "Reach the Glass Vault and decide how to deal with the damaged ward that anchors the Ashen Road." },
    { name: "The Bell in the Deep", status: "dormant", text: "Return to the buried bell beneath Starfall Marsh once the party understands what answered its call." },
    { name: "Return to Blackroot", status: "dormant", text: "Tovin Ash claims the forest is changing again and asks the party to return when the eastern road is secure." },
    { name: "Save the North Gate", status: "failed", text: "Hold Greyhaven's North Gate during the first assault. The gate was lost, but the survivors escaped into the inner city." }
  ].filter((entry) => full || entry.small);

  const actors = [
    { key: "kael", name: "Kael Rowan", role: "ranger", group: true, small: true, title: "Roadwarden", subtitle: "Scout of the Lantern Company", first: "s01", motto: "A road is safest when someone remembers where it failed.", summary: "A patient frontier scout who reads roads, weather, and people with the same careful attention.", bio: "Kael Rowan spent years carrying messages between isolated settlements before joining the Lantern Company. He distrusts grand plans but has an instinct for noticing the small failures that become disasters later.", facts: [["Homeland", "Greyhaven March"], ["Calling", "Roadwarden"], ["Known for", "Quiet observation"]], relations: [["mira", "Trusted scholar", "He relies on Mira to explain what the old maps omit."], ["orlan", "Former commander", "Captain Orlan trained him as a young scout."], ["tovin", "Old contact", "They know the same roads for very different reasons."]] },
    { key: "mira", name: "Mira Vale", role: "wizard", group: true, small: true, title: "Star-reader", subtitle: "Scholar of the Glass Archive", first: "s01", motto: "Every mystery leaves a pattern somewhere.", summary: "A disciplined occult scholar whose curiosity is strongest when old records contradict accepted history.", bio: "Mira trained among archivists rather than battle-mages. Her greatest strength is connecting damaged records, half-remembered rituals, and physical evidence into a coherent theory before anyone else sees the pattern.", facts: [["Discipline", "Celestial lore"], ["Former post", "Glass Archive"], ["Weakness", "Cannot leave a contradiction alone"]], relations: [["kael", "Trusted scout", "Kael keeps her theories grounded in what is actually on the road."], ["selene", "Mentor", "Archivist Selene taught her how to read damaged star tables."], ["pale", "Unanswered question", "The Pale Traveller seems to recognise her research."]] },
    { key: "brunna", name: "Brunna Stonehand", role: "dwarf", group: true, small: true, title: "Vaultbreaker", subtitle: "Engineer of the Deep Roads", first: "s01", motto: "If it was built, it can be understood.", summary: "A practical engineer who treats ruins as machines with forgotten purposes rather than tombs.", bio: "Brunna joined the expedition to study the roadworks beneath Greyhaven. She is blunt, methodical, and deeply suspicious of anyone who calls a dangerous mechanism sacred instead of explaining how it works.", facts: [["Trade", "Engineer"], ["Specialty", "Ancient mechanisms"], ["Keepsake", "A brass survey chain"]], relations: [["amara", "Protective friend", "Amara has patched Brunna up more times than either admits."], ["cassian", "Professional distrust", "House Valmere funded projects Brunna considers dangerously rushed."]] },
    { key: "eryn", name: "Eryn Thorne", role: "elf", group: true, small: true, title: "Greenpath Hunter", subtitle: "Warden of Blackroot", first: "s02", motto: "The forest remembers every shortcut.", summary: "A swift hunter from Blackroot Forest whose local knowledge repeatedly saves the party from taking the obvious route.", bio: "Eryn grew up among wardens who treat the forest as a living border rather than empty wilderness. They join the party after the disappearance of the cartographer threatens to draw soldiers into places best left undisturbed.", facts: [["Home", "Blackroot Forest"], ["Role", "Warden"], ["Talent", "Tracking without trail"]], relations: [["tovin", "Complicated ally", "Tovin knows the old poacher paths better than anyone."], ["kael", "Professional respect", "They disagree often but trust each other's field judgement."]] },
    { key: "amara", name: "Sister Amara", role: "noble", group: true, small: true, title: "Lantern Healer", subtitle: "Keeper of the Last Light", first: "s01", motto: "Hope is a duty before it is a feeling.", summary: "A healer and mediator whose calm presence often keeps frightened people from becoming dangerous crowds.", bio: "Amara serves a small charitable order that maintains roadside shelters and signal lamps. She joined the party to investigate why several lamps along the Ashen Road went dark on the same night.", facts: [["Order", "Keepers of the Last Light"], ["Calling", "Healer"], ["Strength", "Calm under pressure"]], relations: [["brunna", "Close friend", "Their arguments are frequent and affectionate."], ["mara", "Trusted contact", "Mara Venn passes messages through the inn network."], ["orlan", "Moral counterweight", "She challenges Orlan when necessity becomes an excuse."]] },
    { key: "corin", name: "Corin Wren", role: "warrior", group: true, title: "Freeblade", subtitle: "Former Greyhaven guardsman", first: "s03", summary: "A former city guard who left after refusing an order and now sells his sword only when he believes the cause is worth it.", bio: "Corin knows Greyhaven's walls, guard rotations, and political grudges better than he likes to admit. His past makes him useful during the siege and uncomfortable around Captain Orlan.", facts: [["Former rank", "Gate Sergeant"], ["Weapon", "Longsword"], ["Debt", "Owes Mara Venn a favour"]], relations: [["orlan", "Estranged commander", "Neither has forgotten the argument that ended Corin's service."], ["mara", "Friend", "Mara helped him disappear after he left the guard."]] },
    { key: "selene", name: "Archivist Selene", role: "noble", npc: true, small: true, title: "Keeper of Star Records", subtitle: "Senior archivist of Greyhaven", first: "s01", summary: "A careful scholar who knows which records were removed from the archive and who had permission to remove them.", bio: "Selene appears conservative and procedural, but she has quietly preserved copies of records the city council ordered destroyed years ago.", facts: [["Office", "Glass Archive"], ["Specialty", "Star charts"], ["Secret", "Keeps forbidden copies"]], relations: [["mira", "Former student", "Mira was one of her most persistent apprentices."], ["cassian", "Political tension", "House Valmere wants access to records Selene refuses to release."]] },
    { key: "orlan", name: "Captain Orlan", role: "warrior", npc: true, small: true, title: "Captain of the North Gate", subtitle: "Commander of the Greyhaven Wardens", first: "s01", summary: "A disciplined officer balancing public safety, political pressure, and a threat he cannot yet explain to his soldiers.", bio: "Orlan is competent, tired, and unwilling to panic the city without evidence. His caution often frustrates the party, but he consistently puts civilians ahead of reputation.", facts: [["Command", "Greyhaven Wardens"], ["Post", "North Gate"], ["Priority", "Civilian safety"]], relations: [["kael", "Former trainee", "He still trusts Kael's judgement in the field."], ["corin", "Estranged subordinate", "Their old dispute remains unresolved."], ["amara", "Respected critic", "He listens when Amara tells him a decision has gone too far."]] },
    { key: "mara", name: "Mara Venn", role: "noble", npc: true, title: "Innkeeper and broker", subtitle: "Owner of the Lantern & Pike", first: "s01", summary: "A well-connected innkeeper who hears news from merchants, guards, smugglers, and pilgrims before official reports catch up.", bio: "Mara claims she only trades in rooms and meals. In practice, half the city's informal messages pass through her common room or kitchen.", facts: [["Business", "The Lantern & Pike"], ["Network", "Merchants and couriers"], ["Rule", "No drawn steel inside"]], relations: [["amara", "Trusted friend", "Amara uses the inn as a safe relay point."], ["corin", "Old friend", "She helped him after he left the guard."]] },
    { key: "pale", name: "The Pale Traveller", role: "shadow", npc: true, title: "Unknown wanderer", subtitle: "A figure seen along the Ashen Road", first: "s03", summary: "A silent traveller who repeatedly appears near broken wards and seems to know the party's route in advance.", bio: "No one agrees on when the Pale Traveller first arrived in the region. Witnesses describe different clothing, different ages, and the same unmistakable voice.", facts: [["Identity", "Unknown"], ["Seen near", "Broken wards"], ["Pattern", "Always ahead of the party"]], relations: [["mira", "Unanswered connection", "The traveller recognises symbols from Mira's research."], ["nix", "Possible accomplice", "Nix claims never to have met the traveller, too quickly."]] },
    { key: "cassian", name: "Lord Cassian Valmere", role: "noble", npc: true, title: "Head of House Valmere", subtitle: "Patron of the eastern road", first: "s07", summary: "A polished noble whose family wealth depends on the Ashen Road remaining open, safe, and under Valmere influence.", bio: "Cassian is neither openly hostile nor fully trustworthy. He genuinely wants the road protected, but his definition of protection includes control over who may use it.", facts: [["House", "Valmere"], ["Seat", "Cinder Hall"], ["Interest", "Eastern trade"]], relations: [["selene", "Political dispute", "He wants records she refuses to release."], ["brunna", "Difficult contractor", "They disagree about whether speed justifies risk."]] },
    { key: "tovin", name: "Tovin Ash", role: "ranger", npc: true, title: "Blackroot guide", subtitle: "Hunter, poacher, and reluctant informant", first: "s04", summary: "A sharp-eyed guide who knows hidden forest paths and sells information when he believes the buyer will survive using it.", bio: "Tovin is tolerated by the wardens because he notices changes others miss. He rarely tells the whole truth at once, but what he does say is usually accurate.", facts: [["Home", "Blackroot edge"], ["Trade", "Guide"], ["Reputation", "Useful nuisance"]], relations: [["eryn", "Complicated ally", "They have arrested and rescued each other more than once."], ["kael", "Old contact", "They exchange road news when interests align."]] },
    { key: "nix", name: "Nix Fen", role: "shadow", npc: true, title: "Locksmith", subtitle: "Specialist in sealed doors", first: "s08", summary: "A quick-handed locksmith whose expertise becomes suspiciously useful once the party reaches the Flooded Archive.", bio: "Nix insists that every lock is only a conversation between metal and patience. The problem is that someone has already paid them to open several doors the party has not reached yet.", facts: [["Trade", "Locksmith"], ["Known for", "Impossible mechanisms"], ["Current problem", "Two employers"]], relations: [["pale", "Denied connection", "Nix refuses to discuss the Pale Traveller."], ["mara", "Occasional client", "Mara has hired Nix for legitimate work before."]] }
  ].filter((entry) => full || entry.small);

  const world = [
    { name: "Archivist Selene", category: "npc", small: true, subtitle: "Keeper of Star Records", summary: "A senior archivist who has preserved records others wanted forgotten.", body: "Selene manages the oldest surviving star tables in Greyhaven and quietly keeps copies of documents removed from official shelves.", facts: [["Office", "Glass Archive"], ["Connection", "Mira Vale"]] },
    { name: "Captain Orlan", category: "npc", small: true, subtitle: "Commander of the Greyhaven Wardens", summary: "A cautious officer trying to protect the city without causing panic.", body: "Orlan commands the North Gate and becomes one of the party's most important official allies once the threat can no longer be dismissed as rumour.", facts: [["Post", "North Gate"], ["Faction", "Greyhaven Wardens"]] },
    { name: "Mara Venn", category: "npc", subtitle: "Owner of the Lantern & Pike", summary: "An innkeeper whose common room doubles as an informal information exchange.", body: "Mara hears trade news before the council does and has a talent for knowing which rumours are frightened nonsense and which deserve attention.", facts: [["Business", "Lantern & Pike"], ["Network", "Couriers"]] },
    { name: "The Pale Traveller", category: "npc", subtitle: "Unknown wanderer", summary: "A recurring figure seen near broken wards along the Ashen Road.", body: "Witness descriptions vary, but the same calm voice and habit of arriving before disasters make the sightings difficult to dismiss.", facts: [["Identity", "Unknown"], ["Pattern", "Appears before ward failures"]] },
    { name: "Lord Cassian Valmere", category: "npc", subtitle: "Head of House Valmere", summary: "A politically skilled noble whose wealth and influence depend on the eastern road.", body: "Cassian Valmere supports the party when their goals align with his family's interests and becomes dangerous when they do not.", facts: [["House", "Valmere"], ["Seat", "Cinder Hall"]] },
    { name: "Tovin Ash", category: "npc", subtitle: "Blackroot guide", summary: "A hunter and occasional poacher who knows paths omitted from every official map.", body: "Tovin's information is reliable, but he treats truth as something best delivered in useful portions.", facts: [["Region", "Blackroot Forest"], ["Trade", "Guide"]] },
    { name: "Nix Fen", category: "npc", subtitle: "Locksmith of uncertain loyalties", summary: "A specialist in sealed mechanisms whose services have been purchased by more than one side.", body: "Nix is charming, evasive, and far too familiar with the old locks beneath Greyhaven.", facts: [["Trade", "Locksmith"], ["Specialty", "Ancient mechanisms"]] },

    { name: "Greyhaven", category: "location", small: true, subtitle: "River city at the western end of the Ashen Road", summary: "A fortified trade city built around bridges, archive towers, and old tunnels beneath the river cliffs.", body: "Greyhaven is prosperous enough to attract every faction with an interest in the Ashen Road and old enough to have forgotten much of what lies beneath its streets.", facts: [["Population", "Large city"], ["Known for", "Bridges and archives"]] },
    { name: "Blackroot Forest", category: "location", small: true, subtitle: "Ancient woodland east of Greyhaven", summary: "A dense forest where old road markers disappear beneath roots and flooded ground.", body: "Blackroot's wardens maintain paths that do not appear on official maps. Parts of the forest have begun changing since the old seals weakened.", facts: [["Region", "Greyhaven March"], ["Warden", "Eryn Thorne"]] },
    { name: "The Ashen Road", category: "location", small: true, subtitle: "The forgotten eastern road", summary: "A broken imperial road connecting Greyhaven to ruined observatories, watchtowers, and sealed vaults.", body: "Most travellers use newer routes, but the Ashen Road still links structures that were once part of a single defensive network.", facts: [["Condition", "Partially ruined"], ["Direction", "East"]] },
    { name: "The Broken Observatory", category: "location", small: true, subtitle: "Ruined star tower", summary: "A collapsed observatory containing damaged star records and the first fragment of the Star Map.", body: "The tower was abandoned after a fire decades ago. Its lower chambers survived better than the official reports suggest.", facts: [["Status", "Ruined"], ["Discovery", "Star Map fragment"]] },
    { name: "Ember Pass", category: "location", small: true, subtitle: "High road through red granite cliffs", summary: "A narrow mountain route where weather and ambushes can close the road within minutes.", body: "Ember Pass is the fastest route east when open and the worst place in the region to be trapped when the wind turns.", facts: [["Terrain", "Mountain pass"], ["Risk", "Rapid storms"]] },
    { name: "The Flooded Archive", category: "location", subtitle: "Submerged record vault beneath Greyhaven", summary: "A forgotten archive partly flooded by the river and protected by locks older than the current city.", body: "The archive preserves records that never entered the public catalogue, including references to the Ashen Seal and the Glass Vault.", facts: [["Access", "Hidden tunnel"], ["Hazard", "Rising water"]] },
    { name: "The Silent Watchtower", category: "location", subtitle: "Abandoned eastern watchpost", summary: "A fortified tower where the entire garrison vanished without signs of battle.", body: "The tower's signal mirror still works, but its final message was carved into the floor rather than sent west.", facts: [["Status", "Abandoned"], ["Clue", "Carved warning"]] },
    { name: "The Glass Vault", category: "location", subtitle: "Hidden chamber beneath the eastern cliffs", summary: "A sealed complex whose mirrored walls react to the restored Star Map.", body: "The Glass Vault appears to be both archive and control chamber for the network of wards along the Ashen Road.", facts: [["Access", "Star Map"], ["Purpose", "Ward control"]] },
    { name: "Moonwell", category: "location", subtitle: "Cold spring beneath a ruined shrine", summary: "A silver-lit spring used by roadwardens to test whether a seal had been disturbed.", body: "Moonwell water reflects certain ward marks even when they are invisible to the naked eye.", facts: [["Feature", "Reflective spring"], ["Use", "Ward testing"]] },
    { name: "Cinder Bridge", category: "location", subtitle: "Stone bridge across the eastern chasm", summary: "The final intact crossing before the Glass Vault and the place where the Ashen Road narrows to a single defensible route.", body: "Cinder Bridge becomes strategically vital once the ward network starts failing.", facts: [["Structure", "Ancient bridge"], ["Importance", "Eastern chokepoint"]] },
    { name: "Valmere Estate", category: "location", subtitle: "Valmere estate above Greyhaven", summary: "A fortified manor used for diplomacy, trade negotiations, and private meetings far from the city council chamber.", body: "The estate is elegant, heavily guarded, and filled with maps showing roads that House Valmere officially claims not to know.", facts: [["Owner", "House Valmere"], ["Type", "Fortified estate"]] },
    { name: "Hollow Crown Ruins", category: "location", subtitle: "Hilltop ruins of a forgotten dynasty", summary: "Broken halls surrounding a circular throne chamber carved directly into the hill.", body: "The ruins were once thought ceremonial. Evidence found beneath the throne suggests the site controlled part of the ward network.", facts: [["Age", "Ancient"], ["Linked faction", "Ashen Choir"]] },
    { name: "North Gate", category: "location", subtitle: "Greyhaven's northern fortification", summary: "A busy gate controlling military and caravan traffic into the city.", body: "The gate becomes a major defensive position during the Siege of Greyhaven and later a symbol of the cost of the conflict.", facts: [["Commander", "Captain Orlan"], ["Status", "Contested"]] },
    { name: "Starfall Marsh", category: "location", subtitle: "Wetlands around a fallen stone", summary: "A marsh where compass needles drift and an ancient bell can sometimes be heard beneath the waterlogged earth.", body: "Locals avoid the deepest pools after sunset. The marsh contains pieces of worked stone far older than Greyhaven.", facts: [["Hazard", "Unstable ground"], ["Mystery", "Buried bell"]] },
    { name: "Old Quarry", category: "location", subtitle: "Abandoned slate quarry", summary: "A cut in the hills now used by smugglers and anyone wishing to avoid the eastern checkpoint.", body: "The quarry's lower tunnel connects to a roadwardens' maintenance passage beneath the Ashen Road.", facts: [["Status", "Abandoned"], ["Current use", "Smuggling route"]] },

    { name: "Lantern Company", category: "faction", small: true, subtitle: "Roadwardens, couriers, and rescue crews", summary: "A loose service order that maintains signals, shelters, and emergency routes between settlements.", body: "The Lantern Company has little formal power but enormous practical value wherever roads become dangerous.", facts: [["Base", "Greyhaven"], ["Role", "Road safety"]] },
    { name: "House Valmere", category: "faction", small: true, subtitle: "Merchant nobility of the eastern road", summary: "A wealthy house whose influence grows wherever trade follows the Ashen Road.", body: "House Valmere funds bridges, guards, and expeditions, rarely without expecting control in return.", facts: [["Head", "Lord Cassian Valmere"], ["Interest", "Eastern trade"]] },
    { name: "Greyhaven Wardens", category: "faction", subtitle: "City guard and frontier patrol", summary: "The professional force responsible for Greyhaven's walls, gates, and nearby patrol roads.", body: "The Wardens are stretched thin between normal civic duties and a threat most citizens cannot yet see.", facts: [["Commander", "Captain Orlan"], ["Base", "Greyhaven"]] },
    { name: "Cartographers' Guild", category: "faction", subtitle: "Surveyors and mapmakers", summary: "A respected guild whose missing expedition triggered the party's first investigation.", body: "The guild's maps shape trade and military planning, making altered survey records more dangerous than they first appear.", facts: [["Trade", "Surveying"], ["Current problem", "Missing expedition"]] },
    { name: "Ashen Choir", category: "faction", subtitle: "Secretive keepers of broken rites", summary: "A hidden order attempting to restore the old ward network according to its own interpretation of forgotten doctrine.", body: "The Ashen Choir believes the current age is unworthy of choosing how the ancient seals should be used.", facts: [["Goal", "Control the ward network"], ["Method", "Ritual and infiltration"]] },

    { name: "The Star Map", category: "item", small: true, subtitle: "Fragmented celestial chart", summary: "An ancient map that aligns roads, observatories, and ward sites rather than ordinary geography.", body: "When complete, the Star Map acts as both map and key to the Glass Vault.", facts: [["Fragments", "Three"], ["Use", "Opens the Glass Vault"]] },
    { name: "Lantern Key", category: "item", small: true, subtitle: "Brass key with five rotating rings", summary: "A maintenance key used on old signal housings and some locks beneath Greyhaven.", body: "The key predates the modern Lantern Company, suggesting the order inherited more than its name.", facts: [["Material", "Brass"], ["Use", "Ward maintenance"]] },
    { name: "Glass Compass", category: "item", subtitle: "Compass that points toward active wards", summary: "A delicate instrument whose needle ignores north and instead turns toward the strongest nearby ward.", body: "The compass becomes unreliable when several wards are active at once, making interpretation as important as direction.", facts: [["Maker", "Unknown"], ["Function", "Ward detection"]] },
    { name: "Ashen Seal", category: "item", subtitle: "Black stone disk carved with interlocking roads", summary: "A damaged control seal linked to the network beneath the Ashen Road.", body: "The seal appears to have been deliberately broken rather than worn down by age.", facts: [["State", "Damaged"], ["Material", "Black stone"]] },
    { name: "Bell Fragment", category: "item", subtitle: "Piece of dark resonant bronze", summary: "A shard from the buried bell beneath Starfall Marsh that vibrates near certain old structures.", body: "Even a tiny fragment produces a tone too low to hear when brought close to a damaged ward.", facts: [["Origin", "Starfall Marsh"], ["Property", "Resonance"]] },
    { name: "Moonsteel Knife", category: "item", subtitle: "Silver-grey utility blade", summary: "A roadwarden's tool designed for cutting ward-cord and marking stone without damaging inscriptions.", body: "Moonsteel is rare and impractical for weapons, but exceptionally useful around old ward materials.", facts: [["Material", "Moonsteel"], ["Use", "Ward maintenance"]] },

    { name: "The First Lantern", category: "lore", small: true, subtitle: "Origin story of the roadwardens", summary: "A foundational tale describing the first signal lit after the old eastern kingdom collapsed.", body: "Whether literal history or later myth, the story explains why roadwardens treat keeping a light burning as a civic duty rather than a religious ritual.", facts: [["Era", "After the Eastern Collapse"], ["Legacy", "Lantern Company"]] },
    { name: "The Ashen Kings", category: "lore", small: true, subtitle: "Rulers remembered mostly through ruins", summary: "A dynasty associated with the construction of the Ashen Road and its hidden ward network.", body: "Modern histories portray the Ashen Kings as conquerors, while older records suggest they spent their final years trying to contain something beneath the eastern hills.", facts: [["Legacy", "Ashen Road"], ["Seat", "Hollow Crown"]] },
    { name: "Starfall", category: "lore", subtitle: "A celestial event recorded in damaged archives", summary: "An ancient night when several bright objects crossed the sky and one struck the marsh east of Greyhaven.", body: "The event appears in weather records, songs, and engineering notes, but each source describes a different consequence.", facts: [["Region", "Starfall Marsh"], ["Linked object", "Buried bell"]] },
    { name: "The Hollow Crown", category: "lore", subtitle: "Title used by the last Ashen monarch", summary: "A ceremonial title that may refer to a place, office, or mechanism rather than a literal crown.", body: "The phrase appears repeatedly near descriptions of ward control and succession disputes.", facts: [["Linked site", "Hollow Crown Ruins"], ["Meaning", "Uncertain"]] },
    { name: "The Flood Below", category: "lore", subtitle: "Old Greyhaven warning", summary: "A civic phrase about tunnels, forgotten watercourses, and the danger of building over older foundations.", body: "Most citizens treat it as a proverb. Archivist Selene believes it refers to a deliberate emergency system beneath the city.", facts: [["Region", "Greyhaven"], ["Linked site", "Flooded Archive"]] },
    { name: "The Old Road", category: "lore", subtitle: "Before the Ashen Road had a name", summary: "Fragments of older maps imply the route existed long before the Ashen Kings rebuilt it.", body: "The oldest surviving markers do not match any known kingdom, suggesting the road network inherited an even older purpose.", facts: [["Age", "Unknown"], ["Question", "Who built the first route?"]] },
    { name: "The Night Bells", category: "lore", subtitle: "Frontier superstition with uncomfortable evidence", summary: "Stories claim that bells ring underground before a ward fails or a road disappears.", body: "The party's experience at Starfall Marsh makes the superstition much harder to dismiss.", facts: [["Common belief", "Warning omen"], ["Evidence", "Starfall Marsh"]] }
  ].filter((entry) => full || entry.small);

  const rules = [
    { name: "Demo Guide — Navigation", small: true, text: "Use Home as the dashboard, Group for party profiles, World for lore entries, and Search to test discovery across the generated campaign." },
    { name: "Demo Guide — Character Profiles", small: true, text: "Open a party member, edit facts and relations, then return to Group to verify that Tome presentation data remains separate from the active game system's Actor sheet." },
    { name: "Demo Guide — Quest States", small: true, text: "The Ashen Road demo includes active, completed, dormant, and failed quests so status groups, counters, dashboard summaries, and permissions can be tested quickly." },
    { name: "Demo Guide — Responsive Layout", text: "Resize the Tome window through wide, compact, narrow, and tiny layouts. The same generated content should remain readable at each size." },
    { name: "Demo Guide — GM Tools", text: "Use GM Notes, Next Session Dashboard, Quick Capture, Reveal Queue, Permissions, Export, and Health Check against disposable demo records before using them on campaign data." },
    { name: "Demo Guide — Cleanup Safety", text: "All generated demo documents and folders carry an Adventurer's Tome demo flag. Remove Demo Campaign deletes only flagged test data and restores the previous presentation settings." }
  ].filter((entry) => full || entry.small);

  return { sessions, quests, actors, world, rules };
}
async function createDemoJournal({ name, folder, text, flags = {}, img = null }) {
  const data = {
    name,
    folder: folder?.id ?? null,
    ownership: demoOwnership(),
    pages: demoPageData(name, demoParagraphs(text)),
    flags: demoFlagData(flags)
  };
  return CONFIG.JournalEntry.documentClass.create(data);
}

async function generateDemoCampaign(variant = "small") {
  if (!game.user.isGM) throw new Error("Only a GM can generate Adventurer's Tome demo data.");
  if (getDemoSummary().active) throw new Error("Demo data already exists. Remove it before generating another demo.");

  const actorType = getDemoActorType();
  if (!actorType) throw new Error("The active game system does not expose an Actor type that Adventurer's Tome can use for demo documents.");

  const definition = getDemoDefinition(variant);
  const backup = Object.fromEntries(DEMO_PRESENTATION_KEYS.map((key) => [key, game.settings.get(MODULE_ID, key)]));
  await game.settings.set(MODULE_ID, "demoState", JSON.stringify({ active: true, variant, campaign: "ashen-road", backup, startedAt: Date.now() }));

  try {
    const journalRoot = await createDemoFolder("Adventurer's Tome Demo — The Ashen Road", "JournalEntry");
    const sessionFolder = await createDemoFolder("Sessions", "JournalEntry", journalRoot);
    const questFolder = await createDemoFolder("Quests", "JournalEntry", journalRoot);
    const worldFolder = await createDemoFolder("World", "JournalEntry", journalRoot);
    const rulesFolder = await createDemoFolder("Rules", "JournalEntry", journalRoot);
    const worldFolders = {};
    for (const [category, name] of [["npc", "NPCs"], ["location", "Locations"], ["faction", "Factions"], ["item", "Items"], ["lore", "Lore"]]) {
      worldFolders[category] = await createDemoFolder(name, "JournalEntry", worldFolder);
    }
    const actorFolder = await createDemoFolder("Adventurer's Tome Demo — Characters", "Actor");

    const sessionMap = new Map();
    for (const session of definition.sessions) {
      const entry = await createDemoJournal({ name: session.name, folder: sessionFolder, text: session.text, flags: { type: "sessions" } });
      sessionMap.set(session.key, entry);
    }

    for (const quest of definition.quests) {
      await createDemoJournal({
        name: quest.name,
        folder: questFolder,
        text: quest.text,
        flags: { type: "quests", status: quest.status, featured: Boolean(quest.featured) }
      });
    }

    const worldImageFor = (entry) => entry.image || (entry.category === "location" ? DEMO_ASSETS.location : entry.category === "item" ? DEMO_ASSETS.item : entry.category === "faction" ? DEMO_ASSETS.faction : entry.category === "npc" ? DEMO_ASSETS.noble : DEMO_ASSETS.lore);
    for (const item of definition.world) {
      const heroImage = worldImageFor(item);
      await createDemoJournal({
        name: item.name,
        folder: worldFolders[item.category] || worldFolders.lore,
        text: item.body || item.summary,
        img: heroImage,
        flags: {
          type: "world",
          [FLAGS.WORLD_PROFILE]: {
            category: item.category,
            subtitle: item.subtitle || "",
            summary: item.summary || "",
            body: item.body || "",
            heroImage,
            facts: (item.facts || []).map(([label, value]) => ({ label, value }))
          }
        }
      });
    }

    for (const rule of definition.rules) {
      await createDemoJournal({ name: rule.name, folder: rulesFolder, text: rule.text, flags: { type: "rules" } });
    }

    const actorData = definition.actors.map((entry, index) => ({
      name: entry.name,
      type: actorType,
      folder: actorFolder.id,
      img: DEMO_ASSETS[entry.role] || DEMO_ASSETS.noble,
      ownership: demoOwnership(),
      flags: demoFlagData({
        [FLAGS.GROUP_MEMBER]: Boolean(entry.group),
        [FLAGS.GROUP_ORDER]: entry.group ? (index + 1) * 10 : 9999
      })
    }));

    const createdActors = await CONFIG.Actor.documentClass.createDocuments(actorData);
    const actorMap = new Map();
    for (let index = 0; index < definition.actors.length; index += 1) actorMap.set(definition.actors[index].key, createdActors[index]);

    for (const entry of definition.actors) {
      const actor = actorMap.get(entry.key);
      if (!actor) continue;
      const relations = (entry.relations || [])
        .map(([targetKey, label, note]) => ({ target: actorMap.get(targetKey), label, note }))
        .filter((relation) => relation.target)
        .map((relation) => ({ actorId: relation.target.id, label: relation.label, note: relation.note }));
      const firstSession = sessionMap.get(entry.first);
      await actor.setFlag(MODULE_ID, FLAGS.PROFILE, {
        title: entry.title || "",
        subtitle: entry.subtitle || "",
        summary: entry.summary || "",
        biography: entry.bio || "",
        heroImage: DEMO_ASSETS[entry.role] || DEMO_ASSETS.noble,
        motto: entry.motto || "",
        firstSessionId: firstSession?.id || "",
        facts: (entry.facts || []).map(([label, value]) => ({ label, value })),
        relations
      });
    }

    const presentation = variant === "full" ? {
      campaignTitle: "The Ashen Road — Full Demo",
      campaignSubtitle: "A large original Adventurer's Tome stress-test campaign",
      background: DEFAULT_BACKGROUND,
      currentLocation: "Cinder Bridge",
      sessionLabel: "Session",
      welcomeTitle: "The Ashen Road remembers…",
      welcomeText: "Explore an original stress-test campaign of adventurers, quests, locations, factions, lore, and linked relationships."
    } : {
      campaignTitle: "The Ashen Road — Demo",
      campaignSubtitle: "A compact original Adventurer's Tome test campaign",
      background: DEFAULT_BACKGROUND,
      currentLocation: "Greyhaven",
      sessionLabel: "Session",
      welcomeTitle: "The lanterns are going dark…",
      welcomeText: "Use this compact demo to test the dashboard, party profiles, quests, sessions, World entries, cross-links, and responsive layouts."
    };
    for (const [key, value] of Object.entries(presentation)) await game.settings.set(MODULE_ID, key, value);

    await game.settings.set(MODULE_ID, "demoState", JSON.stringify({ active: true, variant, campaign: "ashen-road", backup, createdAt: Date.now() }));
    return getDemoSummary();
  } catch (error) {
    console.error("Adventurer's Tome | Demo generation failed", error);
    await removeDemoCampaign({ restoreSettings: true, skipConfirmation: true });
    throw error;
  }
}

function folderDepth(folder) {
  let depth = 0;
  let current = folder?.folder;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = current.folder;
  }
  return depth;
}

async function removeDemoCampaign({ restoreSettings = true, skipConfirmation = false } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can remove Adventurer's Tome demo data.");
  const state = getDemoState();

  const journalIds = game.journal.contents.filter(isDemoDocument).map((entry) => entry.id);
  const actorIds = game.actors.contents.filter(isDemoDocument).map((actor) => actor.id);

  if (journalIds.length) await CONFIG.JournalEntry.documentClass.deleteDocuments(journalIds);
  if (actorIds.length) await CONFIG.Actor.documentClass.deleteDocuments(actorIds);

  const demoFolders = game.folders.filter(isDemoDocument).sort((a, b) => folderDepth(b) - folderDepth(a));
  for (const folder of demoFolders) {
    try {
      await folder.delete();
    } catch (error) {
      console.warn(`Adventurer's Tome | Demo folder could not be removed: ${folder.name}`, error);
    }
  }

  if (restoreSettings && state?.backup && typeof state.backup === "object") {
    for (const key of DEMO_PRESENTATION_KEYS) {
      if (Object.hasOwn(state.backup, key)) await game.settings.set(MODULE_ID, key, state.backup[key]);
    }
  }
  await game.settings.set(MODULE_ID, "demoState", "");
  return getDemoSummary();
}

async function confirmDemoAction({ title, content }) {
  const DialogV2 = foundry.applications.api.DialogV2;
  if (DialogV2?.confirm) {
    return Boolean(await DialogV2.confirm({ window: { title }, content, rejectClose: false, modal: true }));
  }
  return globalThis.confirm ? globalThis.confirm(stripMarkup(content)) : true;
}


const IMPORT_SCHEMA = "adventurers-tome.import";
const IMPORT_SCHEMA_VERSION = 2;
const IMPORT_MODES = Object.freeze({
  auto: "Auto detect",
  session: "Session Log",
  quest: "Quest Log",
  package: "Tome Package"
});

const IMPORT_WORLD_CATEGORY_ALIASES = Object.freeze({
  npc: "npc", npcs: "npc", person: "npc", people: "npc", character: "npc", characters: "npc",
  location: "location", locations: "location", place: "location", places: "location", plats: "location", platser: "location",
  faction: "faction", factions: "faction", group: "faction", groups: "faction", fraktion: "faction", fraktioner: "faction",
  item: "item", items: "item", object: "item", objects: "item", föremål: "item", foremal: "item",
  lore: "lore", fact: "lore", facts: "lore", fakta: "lore"
});

const IMPORT_WORLD_SECTIONS = Object.freeze([
  { category: "npc", labels: ["NPC", "NPCs", "People", "Persons", "Personer", "NPCer", "NPC:er"] },
  { category: "location", labels: ["Locations", "Location", "Places", "Place", "Platser", "Plats"] },
  { category: "faction", labels: ["Factions", "Faction", "Groups", "Organizations", "Organisations", "Fraktioner", "Fraktion"] },
  { category: "item", labels: ["Items", "Item", "Objects", "Artifacts", "Artefacts", "Föremål", "Foremal"] },
  { category: "lore", labels: ["Lore", "Facts", "Fact", "Fakta"] }
]);

function normalizeImportName(value = "") {
  return stripMarkup(String(value || ""))
    .normalize("NFKC")
    .toLocaleLowerCase(game.i18n.lang || undefined)
    .replace(/[’'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function importMarkdownFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.MARKDOWN ?? 2;
}

function cleanMarkdownHeading(value = "") {
  return String(value || "")
    .replace(/^\s*#+\s*/, "")
    .replace(/\s*#+\s*$/, "")
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/^__(.*?)__$/, "$1")
    .trim();
}

function firstMarkdownHeading(text = "") {
  for (const line of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) return cleanMarkdownHeading(match[1]);
  }
  return "";
}

function basenameWithoutExtension(name = "") {
  return String(name || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.(?:atome\.)?json$/i, "")
    .replace(/\.(?:md|markdown|txt)$/i, "")
    .trim();
}

function importSummary(text = "", max = 180) {
  const cleaned = String(text || "")
    .replace(/^\s*#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*(?:Status|Statusen|Featured|Senast uppdaterad|Latest session)\s*:\s*.*$/gim, " ");
  return truncate(cleaned, max);
}

function extractMarkdownSection(text = "", labels = []) {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const wanted = labels.map((label) => normalizeImportName(label));
  let start = -1;
  let headingLevel = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const label = normalizeImportName(cleanMarkdownHeading(match[2]));
    if (wanted.some((needle) => label === needle || label.includes(needle))) {
      start = i + 1;
      headingLevel = match[1].length;
      break;
    }
  }
  if (start < 0) return "";
  const collected = [];
  for (let i = start; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match && match[1].length <= headingLevel) break;
    collected.push(lines[i]);
  }
  return collected.join("\n").trim();
}

function extractSessionNumber(value = "") {
  const match = String(value || "").match(/\b(?:session|spel(?:kv[aä]ll)?|sessionen)\s*0*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

function questStatusFromLabel(value = "") {
  const key = normalizeImportName(value);
  if (!key) return "";
  if (/(^|\s)(active|aktiva|aktiv|ongoing|current|pågående|open|öppna|oppna)(\s|$)/i.test(key)) return "active";
  if (/(^|\s)(completed|complete|done|finished|avslutad|avslutade|klar|klara|färdig|färdiga|fardig|fardiga)(\s|$)/i.test(key)) return "completed";
  if (/(^|\s)(failed|failure|misslyckad|misslyckade)(\s|$)/i.test(key)) return "failed";
  if (/(^|\s)(dormant|inactive|paused|pause|on hold|vilande|pausad|pausade|väntande|vantande)(\s|$)/i.test(key)) return "dormant";
  return "";
}

function displayQuestStatus(status = "") {
  const labels = { active: "Active", completed: "Completed", failed: "Failed", dormant: "Dormant" };
  return labels[status] || status || "Active";
}

function stripInlineMarkdown(value = "") {
  return String(value || "")
    .replace(/^\s*(?:\*\*|__)/, "")
    .replace(/(?:\*\*|__)\s*$/, "")
    .replace(/^\s*[`*_]+|[`*_]+\s*$/g, "")
    .trim();
}

function parseReferenceList(section = "") {
  const refs = [];
  for (const rawLine of String(section || "").replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = rawLine.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/);
    if (!bullet) continue;
    const value = stripInlineMarkdown(bullet[1])
      .replace(/^[@#]/, "")
      .replace(/\s*(?:\||—|–)\s*.*$/, "")
      .trim();
    if (value) refs.push(value);
  }
  return [...new Set(refs)];
}

function emptyImportLinkRefs() {
  return { sessions: [], quests: [], world: [], actors: [] };
}

function normalizeWorldCategory(value = "") {
  return IMPORT_WORLD_CATEGORY_ALIASES[normalizeImportName(value)] || "lore";
}

function normalizeImportLinkRef(value, type = "world", defaultCategory = "") {
  if (value == null || value === "") return null;
  if (type === "sessions" && Number.isFinite(Number(value))) return { number: Number(value), name: `Session ${Number(value)}` };
  if (typeof value === "string" || typeof value === "number") {
    const name = String(value).trim();
    if (!name) return null;
    return type === "world" ? { name, category: defaultCategory || "" } : { name };
  }
  if (typeof value !== "object") return null;
  const name = String(value.name || value.title || value.label || value.ref || "").trim();
  const number = type === "sessions" ? Number(value.number ?? value.sessionNumber) : NaN;
  if (!name && !Number.isFinite(number)) return null;
  const ref = { name: name || `Session ${number}` };
  if (Number.isFinite(number)) ref.number = number;
  if (type === "world") ref.category = normalizeWorldCategory(value.category || value.type || defaultCategory || "lore");
  if (value.id) ref.id = String(value.id);
  return ref;
}

function mergeImportLinkRefs(...sources) {
  const merged = emptyImportLinkRefs();
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(merged)) {
      const values = Array.isArray(source[key]) ? source[key] : [];
      for (const raw of values) {
        const ref = normalizeImportLinkRef(raw, key);
        if (!ref) continue;
        const identity = `${normalizeImportName(ref.name)}:${ref.number ?? ""}:${ref.category ?? ""}:${ref.id ?? ""}`;
        if (!merged[key].some((candidate) => `${normalizeImportName(candidate.name)}:${candidate.number ?? ""}:${candidate.category ?? ""}:${candidate.id ?? ""}` === identity)) merged[key].push(ref);
      }
    }
  }
  return merged;
}

function structuredImportLinks(text = "") {
  const refs = emptyImportLinkRefs();
  const questSection = extractMarkdownSection(text, ["Quest Updates", "Quest Update", "Quests", "Quest Log", "Questlogg", "Uppdrag", "Uppdragsuppdateringar"]);
  refs.quests = parseReferenceList(questSection).map((name) => ({ name }));
  const actorSection = extractMarkdownSection(text, ["Characters", "Character", "Party", "Player Characters", "Spelarkaraktärer", "Karaktärer"]);
  refs.actors = parseReferenceList(actorSection).map((name) => ({ name }));
  for (const section of IMPORT_WORLD_SECTIONS) {
    const content = extractMarkdownSection(text, section.labels);
    for (const name of parseReferenceList(content)) refs.world.push({ name, category: section.category });
  }
  return mergeImportLinkRefs(refs);
}

function packageLinkRefs(item = {}) {
  const raw = item.links && typeof item.links === "object" ? item.links : {};
  const relations = item.relations && typeof item.relations === "object" && !Array.isArray(item.relations) ? item.relations : {};
  const refs = emptyImportLinkRefs();
  const gather = (source, key) => {
    const value = source?.[key];
    if (Array.isArray(value)) return value;
    return value != null && value !== "" ? [value] : [];
  };

  for (const value of [...gather(raw, "sessions"), ...gather(raw, "session"), ...gather(relations, "sessions"), ...gather(relations, "session")]) {
    const ref = normalizeImportLinkRef(value, "sessions");
    if (ref) refs.sessions.push(ref);
  }
  for (const value of [...gather(raw, "quests"), ...gather(raw, "quest"), ...gather(relations, "quests"), ...gather(relations, "quest")]) {
    const ref = normalizeImportLinkRef(value, "quests");
    if (ref) refs.quests.push(ref);
  }
  for (const value of [...gather(raw, "actors"), ...gather(raw, "characters"), ...gather(raw, "party"), ...gather(relations, "actors"), ...gather(relations, "characters"), ...gather(relations, "party")]) {
    const ref = normalizeImportLinkRef(value, "actors");
    if (ref) refs.actors.push(ref);
  }

  const worldSources = [raw, relations];
  for (const source of worldSources) {
    for (const value of gather(source, "world")) {
      const ref = normalizeImportLinkRef(value, "world", typeof value === "object" ? (value.category || value.type || "") : "");
      if (ref) refs.world.push(ref);
    }
    for (const [alias, category] of [["npcs", "npc"], ["locations", "location"], ["factions", "faction"], ["items", "item"], ["lore", "lore"]]) {
      for (const value of gather(source, alias)) {
        const ref = normalizeImportLinkRef(value, "world", category);
        if (ref) refs.world.push(ref);
      }
    }
  }
  return mergeImportLinkRefs(refs);
}

function parseSessionImport(text, sourceName = "") {
  const source = String(text || "").trim();
  if (!source) return [];
  const firstHeading = firstMarkdownHeading(source);
  const genericFirstHeading = /^(?:summary|sammanfattning|important events|viktiga händelser|highlights|notes|anteckningar)$/i.test(normalizeImportName(firstHeading));
  let name = (!genericFirstHeading && firstHeading) || basenameWithoutExtension(sourceName) || "Imported Session";
  const fileSessionNumber = extractSessionNumber(sourceName);
  const titleSessionNumber = extractSessionNumber(name);
  if (!titleSessionNumber && fileSessionNumber && !/^session\b/i.test(name)) name = `Session ${fileSessionNumber} — ${name}`;
  const summarySection = extractMarkdownSection(source, ["Summary", "Sammanfattning", "Session summary", "Sessionssammanfattning"]);
  return [{
    kind: "session",
    name,
    status: "",
    featured: false,
    content: source,
    summary: importSummary(summarySection || source),
    format: "markdown",
    linkRefs: structuredImportLinks(source)
  }];
}

function parseQuestBullet(line, status) {
  const match = String(line || "").match(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/);
  if (!match) return null;
  const body = match[1].trim();
  const split = body.match(/^(.+?)\s*(?:\||—|–|:\s+)\s*(.+)$/);
  const name = stripInlineMarkdown(split ? split[1] : body);
  const summary = stripInlineMarkdown(split ? split[2] : "");
  if (!name) return null;
  return {
    kind: "quest",
    name,
    status: status || "active",
    featured: null,
    content: summary || name,
    summary: truncate(summary || name),
    format: "markdown",
    linkRefs: emptyImportLinkRefs()
  };
}

function parseQuestLogImport(text, sourceName = "") {
  const source = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const lines = source.split("\n");
  const quests = [];
  let currentStatus = "active";
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    const statusLine = current.lines.find((line) => /^\s*(?:\*\*|__)?(?:status|statusen)(?:\*\*|__)?\s*:/i.test(line));
    const statusOverride = statusLine ? questStatusFromLabel(statusLine.split(":").slice(1).join(":")) : "";
    const featuredLine = current.lines.find((line) => /^\s*(?:\*\*|__)?featured(?:\*\*|__)?\s*:/i.test(line));
    const featured = featuredLine ? /\b(?:true|yes|ja|1)\b/i.test(featuredLine.split(":").slice(1).join(":")) : null;
    const cleanedBody = body
      .replace(/^\s*(?:\*\*|__)?(?:status|statusen|featured)(?:\*\*|__)?\s*:\s*.*$/gim, "")
      .trim();
    quests.push({
      kind: "quest",
      name: current.name,
      status: statusOverride || current.status || "active",
      featured,
      content: cleanedBody || current.name,
      summary: importSummary(cleanedBody || current.name),
      format: "markdown",
      linkRefs: structuredImportLinks(cleanedBody)
    });
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = cleanMarkdownHeading(heading[2]);
      const status = questStatusFromLabel(title);
      const generic = /^(?:quest\s*log|questlogg(?:en)?|quester|quests|uppdrag|uppdragslogg(?:en)?)$/i.test(normalizeImportName(title));
      if (status) {
        flush();
        currentStatus = status;
        continue;
      }
      if (level === 1 && generic) continue;
      const nestedMeta = current && /^(?:summary|sammanfattning|objectives?|goals?|mål|delmål|updates?|progress|developments?|utveckling|uppdateringar|npcs?|people|persons?|personer|locations?|places?|platser?|factions?|groups?|organizations?|organisations?|fraktioner?|items?|objects?|artifacts?|artefacts?|föremål|foremal|lore|facts?|fakta|characters?|party|spelarkaraktärer|karaktärer)$/i.test(normalizeImportName(title));
      if (nestedMeta) {
        current.lines.push(line);
        continue;
      }
      if (level >= 2 || (level === 1 && !generic)) {
        flush();
        current = { name: title, status: currentStatus, lines: [] };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
      continue;
    }

    const bullet = parseQuestBullet(line, currentStatus);
    if (bullet) quests.push(bullet);
  }
  flush();

  if (!quests.length) {
    for (const line of lines) {
      const bullet = parseQuestBullet(line, "active");
      if (bullet) quests.push(bullet);
    }
  }

  const byName = new Map();
  for (const quest of quests) byName.set(normalizeImportName(quest.name), quest);
  return [...byName.values()].filter((quest) => quest.name);
}

function sessionPackageName(item = {}) {
  if (item.name) return String(item.name).trim();
  const number = Number(item.number ?? item.sessionNumber);
  const title = String(item.title || "").trim();
  if (Number.isFinite(number)) return title ? `Session ${number} — ${title}` : `Session ${number}`;
  return title || "Imported Session";
}

function packageMarkdownForSession(item = {}) {
  if (item.content || item.markdown || item.text) return String(item.content || item.markdown || item.text).trim();
  const name = sessionPackageName(item);
  const parts = [`# ${name}`];
  if (item.summary) parts.push("", "## Summary", "", String(item.summary).trim());
  if (Array.isArray(item.highlights) && item.highlights.length) parts.push("", "## Highlights", "", ...item.highlights.map((value) => `- ${value}`));
  return parts.join("\n").trim();
}

function packageMarkdownForQuest(item = {}) {
  if (item.content || item.markdown || item.text || item.body) return String(item.content || item.markdown || item.text || item.body).trim();
  const parts = [];
  if (item.summary) parts.push(String(item.summary).trim());
  if (Array.isArray(item.objectives) && item.objectives.length) parts.push("", "## Objectives", "", ...item.objectives.map((value) => `- ${value}`));
  if (Array.isArray(item.updates) && item.updates.length) parts.push("", "## Updates", "", ...item.updates.map((value) => `- ${value}`));
  if (Array.isArray(item.notes) && item.notes.length) parts.push("", ...item.notes.map((value) => `- ${value}`));
  return parts.join("\n").trim() || String(item.name || "Imported Quest");
}

function normalizeImportFacts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((fact) => {
    if (Array.isArray(fact)) return { label: String(fact[0] || "").trim(), value: String(fact[1] || "").trim() };
    return { label: String(fact?.label || fact?.name || "").trim(), value: String(fact?.value || fact?.text || "").trim() };
  }).filter((fact) => fact.label || fact.value);
}

function packageWorldEntry(item = {}, category = "lore") {
  if (typeof item === "string") item = { name: item };
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || item.title || "").trim();
  if (!name) return null;
  const normalizedCategory = normalizeWorldCategory(item.category || item.type || category);
  const summary = String(item.summary || item.description || "").trim();
  const body = String(item.body || item.content || item.markdown || item.text || summary || name).trim();
  return {
    kind: "world",
    name,
    category: normalizedCategory,
    subtitle: String(item.subtitle || item.role || "").trim(),
    heroImage: String(item.heroImage || item.image || item.img || "").trim(),
    facts: normalizeImportFacts(item.facts),
    content: body,
    body,
    summary: summary || importSummary(body),
    format: "markdown",
    linkRefs: mergeImportLinkRefs(packageLinkRefs(item), structuredImportLinks(body))
  };
}

function collectPackageWorld(data = {}) {
  const entries = [];
  const add = (value, category) => {
    const list = Array.isArray(value) ? value : value != null ? [value] : [];
    for (const item of list) {
      const entry = packageWorldEntry(item, category);
      if (entry) entries.push(entry);
    }
  };

  if (Array.isArray(data.world)) add(data.world, "lore");
  else if (data.world && typeof data.world === "object") {
    for (const [key, value] of Object.entries(data.world)) add(value, normalizeWorldCategory(key));
  }
  for (const key of ["npcs", "locations", "factions", "items", "lore"]) if (data[key] != null) add(data[key], normalizeWorldCategory(key));

  const byIdentity = new Map();
  for (const entry of entries) byIdentity.set(`${entry.category}:${normalizeImportName(entry.name)}`, entry);
  return [...byIdentity.values()];
}

function parseTomePackageImport(text) {
  let data;
  try {
    data = JSON.parse(String(text || ""));
  } catch (error) {
    throw new Error(`Invalid JSON package: ${error.message}`);
  }

  if (Array.isArray(data)) data = { quests: data };
  if (!data || typeof data !== "object") throw new Error("Tome Package must be a JSON object.");

  const schema = String(data.schema || data.type || "").trim();
  if (schema && schema !== IMPORT_SCHEMA && schema !== "adventurers-tome") console.warn(`Adventurer's Tome | Importing package with unrecognized schema: ${schema}`);

  const entries = [];
  const sessions = [data.session, ...(Array.isArray(data.sessions) ? data.sessions : [])].filter(Boolean);
  for (const item of sessions) {
    const content = packageMarkdownForSession(item);
    entries.push({
      kind: "session",
      name: sessionPackageName(item),
      status: "",
      featured: false,
      content,
      summary: String(item.summary || "").trim() || importSummary(content),
      format: "markdown",
      linkRefs: mergeImportLinkRefs(packageLinkRefs(item), structuredImportLinks(content))
    });
  }

  const quests = Array.isArray(data.quests) ? data.quests : [];
  for (const item of quests) {
    if (!item || !String(item.name || "").trim()) continue;
    const status = questStatusFromLabel(item.status || "") || String(item.status || "active").toLowerCase();
    const content = packageMarkdownForQuest(item);
    entries.push({
      kind: "quest",
      name: String(item.name).trim(),
      status,
      featured: typeof item.featured === "boolean" ? item.featured : null,
      content,
      summary: String(item.summary || "").trim() || importSummary(content),
      format: "markdown",
      linkRefs: mergeImportLinkRefs(packageLinkRefs(item), structuredImportLinks(content))
    });
  }

  entries.push(...collectPackageWorld(data));
  if (!entries.length) throw new Error("The Tome Package contains no sessions, quests, or World entries.");
  return { entries, packageVersion: Number(data.version || 1) || 1 };
}

function detectImportMode(text = "", sourceName = "") {
  const trimmed = String(text || "").trim();
  if (/\.(?:atome\.)?json$/i.test(sourceName) || /^[\[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (Array.isArray(parsed) || parsed.session || parsed.sessions || parsed.quests || parsed.world || parsed.npcs || parsed.locations || parsed.schema)) return "package";
    } catch (_error) {
      // Continue with text detection below.
    }
  }
  if (/quest|uppdrag/i.test(sourceName)) return "quest";
  if (/session|spelkv[aä]ll/i.test(sourceName)) return "session";
  if (/^\s*#{1,4}\s+(?:active|aktiva|completed|avslutade|failed|misslyckade|dormant|vilande)\b/im.test(trimmed)) return "quest";
  if (/^\s*#\s+(?:quest\s*log|questlogg|uppdragslogg)\b/im.test(trimmed)) return "quest";
  return "session";
}

function importSectionForKind(kind) {
  if (kind === "quest") return "quests";
  if (kind === "world") return "world";
  return "sessions";
}

function findExistingImportMatch(entry) {
  const section = importSectionForKind(entry.kind);
  const docs = sectionEntries(section);
  const target = normalizeImportName(entry.name);
  let existing = docs.find((doc) => normalizeImportName(doc.name) === target) || null;
  let reason = existing ? "Exact name match" : "";

  if (!existing && entry.kind === "session") {
    const number = extractSessionNumber(entry.name);
    if (number != null) {
      existing = docs.find((doc) => extractSessionNumber(doc.name) === number) || null;
      if (existing) reason = `Session ${number} match`;
    }
  }

  if (existing && entry.kind === "world" && entry.category) {
    const existingCategory = inferWorldCategory(existing);
    if (existingCategory !== entry.category) reason = `Name match (${WORLD_CATEGORIES[existingCategory]?.label || existingCategory})`;
  }

  return existing ? { id: existing.id, name: existing.name, reason } : null;
}

function importEntryIdentity(entry) {
  if (entry.kind === "session") {
    const number = extractSessionNumber(entry.name);
    if (number != null) return `session:#${number}`;
  }
  return `${entry.kind}:${entry.kind === "world" ? `${entry.category || "lore"}:` : ""}${normalizeImportName(entry.name)}`;
}

function addDiscoveredWorldEntries(entries = []) {
  const importedWorld = new Map(entries.filter((entry) => entry.kind === "world").map((entry) => [`${entry.category || "lore"}:${normalizeImportName(entry.name)}`, entry]));
  const existingWorld = sectionEntries("world").map(worldEntryView);
  const additions = [];

  for (const source of entries) {
    for (const ref of source.linkRefs?.world || []) {
      const name = String(ref.name || "").trim();
      if (!name) continue;
      const category = normalizeWorldCategory(ref.category || "lore");
      const normalizedName = normalizeImportName(name);
      const key = `${category}:${normalizedName}`;
      if (importedWorld.has(key) || [...importedWorld.values()].some((candidate) => normalizeImportName(candidate.name) === normalizedName)) continue;
      const existing = existingWorld.find((candidate) => normalizeImportName(candidate.name) === normalizedName);
      if (existing) continue;
      const discovered = {
        kind: "world",
        name,
        category,
        subtitle: "",
        heroImage: "",
        facts: [],
        content: `# ${name}\n\nDiscovered during ${source.name}.`,
        body: `Discovered during ${source.name}.`,
        summary: `Discovered during ${source.name}.`,
        format: "markdown",
        discovered: true,
        discoveredFrom: source.name,
        linkRefs: emptyImportLinkRefs()
      };
      additions.push(discovered);
      importedWorld.set(key, discovered);
    }
  }
  return [...entries, ...additions];
}

function findImportedTarget(ref, targetKind, prepared = []) {
  if (!ref) return null;
  if (targetKind === "session" && Number.isFinite(Number(ref.number))) {
    return prepared.find((entry) => entry.kind === "session" && extractSessionNumber(entry.name) === Number(ref.number)) || null;
  }
  const name = normalizeImportName(ref.name);
  if (!name) return null;
  if (targetKind === "world") {
    const category = ref.category ? normalizeWorldCategory(ref.category) : "";
    return prepared.find((entry) => entry.kind === "world" && normalizeImportName(entry.name) === name && (!category || entry.category === category))
      || prepared.find((entry) => entry.kind === "world" && normalizeImportName(entry.name) === name)
      || null;
  }
  return prepared.find((entry) => entry.kind === targetKind && normalizeImportName(entry.name) === name) || null;
}

function resolveExistingLinkTarget(ref, targetKind) {
  if (ref?.id) {
    if (targetKind === "actor") return game.actors.get(ref.id) || null;
    return game.journal.get(ref.id) || null;
  }
  if (targetKind === "actor") {
    const name = normalizeImportName(ref?.name);
    return game.actors.contents.find((actor) => normalizeImportName(actor.name) === name) || null;
  }
  const section = targetKind === "session" ? "sessions" : targetKind === "quest" ? "quests" : "world";
  const docs = sectionEntries(section);
  if (targetKind === "session" && Number.isFinite(Number(ref?.number))) return docs.find((doc) => extractSessionNumber(doc.name) === Number(ref.number)) || null;
  const name = normalizeImportName(ref?.name);
  return docs.find((doc) => normalizeImportName(doc.name) === name) || null;
}

function buildImportLinkIntents(prepared = []) {
  const links = [];
  const seen = new Set();
  const keyMap = { sessions: "session", quests: "quest", world: "world", actors: "actor" };
  let linkIndex = 0;

  for (const source of prepared) {
    const refs = source.linkRefs || emptyImportLinkRefs();
    for (const [refKey, targetKind] of Object.entries(keyMap)) {
      for (const ref of refs[refKey] || []) {
        const imported = targetKind === "actor" ? null : findImportedTarget(ref, targetKind, prepared);
        const existing = imported ? null : resolveExistingLinkTarget(ref, targetKind);
        const targetName = imported?.name || existing?.name || ref.name || (ref.number ? `Session ${ref.number}` : "Unknown");
        const identity = `${source.key}:${targetKind}:${normalizeImportName(targetName)}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        linkIndex += 1;
        links.push({
          key: `link-${linkIndex}`,
          sourceKey: source.key,
          sourceName: source.name,
          sourceKind: source.kind,
          targetKind,
          targetName,
          targetEntryKey: imported?.key || "",
          targetExistingId: existing?.id || "",
          targetExistingType: existing?.documentName || "",
          targetState: imported ? "Imported item" : existing ? "Existing Tome entry" : "Unresolved",
          resolved: Boolean(imported || existing),
          defaultApply: Boolean(imported || existing),
          defaultSkip: !imported && !existing
        });
      }
    }
  }
  return links;
}

function buildImportPreview({ text, mode = "auto", sourceName = "" } = {}) {
  const source = String(text || "").trim();
  if (!source) throw new Error("Paste text or choose a file before previewing the import.");
  if (source.length > MAX_IMPORT_CHARS) throw new Error(`Import text is too large (${source.length.toLocaleString()} characters). Adventurer\'s Tome limits a single import to ${MAX_IMPORT_CHARS.toLocaleString()} characters.`);
  const requestedMode = IMPORT_MODES[mode] ? mode : "auto";
  const detectedMode = requestedMode === "auto" ? detectImportMode(source, sourceName) : requestedMode;
  let entries;
  let packageVersion = null;
  if (detectedMode === "package") {
    const parsed = parseTomePackageImport(source);
    entries = parsed.entries;
    packageVersion = parsed.packageVersion;
  } else if (detectedMode === "quest") entries = parseQuestLogImport(source, sourceName);
  else entries = parseSessionImport(source, sourceName);
  if (!entries.length) throw new Error("No importable session, quest, or World entries were found.");

  entries = addDiscoveredWorldEntries(entries);
  const prepared = entries.map((entry, index) => {
    const existing = findExistingImportMatch(entry);
    const categoryMeta = entry.kind === "world" ? (WORLD_CATEGORIES[entry.category] || WORLD_CATEGORIES.lore) : null;
    return {
      ...entry,
      key: `entry-${index + 1}`,
      kindLabel: entry.kind === "quest" ? "Quest" : entry.kind === "world" ? "World" : "Session",
      subtypeLabel: categoryMeta?.label || "",
      previewIcon: entry.kind === "quest" ? "fa-diamond" : entry.kind === "world" ? categoryMeta.icon : "fa-book-open",
      statusLabel: entry.kind === "quest" ? displayQuestStatus(entry.status) : "",
      existingId: existing?.id || "",
      existingName: existing?.name || "",
      matchReason: existing?.reason || "",
      canUpdate: Boolean(existing),
      defaultAction: existing ? "update" : "create",
      defaultCreate: !existing,
      defaultUpdate: Boolean(existing)
    };
  });

  const links = buildImportLinkIntents(prepared);
  return {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    packageVersion,
    requestedMode,
    mode: detectedMode,
    modeLabel: IMPORT_MODES[detectedMode] || detectedMode,
    sourceName: String(sourceName || "Pasted text").trim() || "Pasted text",
    createdAt: Date.now(),
    entries: prepared,
    links,
    sessions: prepared.filter((entry) => entry.kind === "session").length,
    quests: prepared.filter((entry) => entry.kind === "quest").length,
    worlds: prepared.filter((entry) => entry.kind === "world").length,
    discoveredWorlds: prepared.filter((entry) => entry.kind === "world" && entry.discovered).length,
    existing: prepared.filter((entry) => entry.existingId).length,
    resolvedLinks: links.filter((link) => link.resolved).length,
    unresolvedLinks: links.filter((link) => !link.resolved).length
  };
}

function getImportHistory() {
  const parsed = safeJSONParse(game.settings.get(MODULE_ID, PRIVATE_IMPORT_HISTORY_SETTING), []);
  return Array.isArray(parsed) ? parsed : [];
}

function getLastImportUndo() {
  const parsed = safeJSONParse(game.settings.get(MODULE_ID, PRIVATE_IMPORT_UNDO_SETTING), {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function getImportHistoryView() {
  const formatter = new Intl.DateTimeFormat(game.i18n.lang || undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const undo = getLastImportUndo();
  return getImportHistory().slice(0, 12).map((item) => ({
    ...item,
    worlds: Number(item.worlds || 0),
    linksApplied: Number(item.linksApplied || 0),
    when: formatter.format(new Date(item.timestamp || Date.now())),
    modeLabel: IMPORT_MODES[item.mode] || item.mode || "Import",
    canUndo: Boolean(undo?.transactionId && undo.transactionId === item.transactionId && !item.undoneAt),
    undone: Boolean(item.undoneAt)
  }));
}

async function addImportHistory(record) {
  const history = getImportHistory();
  history.unshift(record);
  await game.settings.set(MODULE_ID, PRIVATE_IMPORT_HISTORY_SETTING, JSON.stringify(history.slice(0, 40)));
}

async function ensureImportFolders() {
  const root = await createJournalFolder("Adventurer's Tome");
  const sessions = await createJournalFolder("Sessions", root);
  const quests = await createJournalFolder("Quests", root);
  const world = await createJournalFolder("World", root);
  const worldCategories = {};
  for (const [category, name] of [["npc", "NPCs"], ["location", "Locations"], ["faction", "Factions"], ["item", "Items"], ["lore", "Lore"]]) {
    worldCategories[category] = await createJournalFolder(name, world);
  }
  return { root, sessions, quests, world, worldCategories };
}

function importMetaFor(preview, entry) {
  return {
    schema: IMPORT_SCHEMA,
    schemaVersion: IMPORT_SCHEMA_VERSION,
    sourceName: preview.sourceName || "Pasted text",
    importedAt: new Date().toISOString(),
    kind: entry.kind
  };
}

function importedPageData(entry) {
  return [{
    name: entry.name,
    type: "text",
    text: {
      format: importMarkdownFormat(),
      content: String(entry.content || entry.summary || entry.name)
    }
  }];
}

function importedWorldProfile(entry) {
  return {
    category: normalizeWorldCategory(entry.category || "lore"),
    subtitle: String(entry.subtitle || "").trim(),
    summary: String(entry.summary || "").trim(),
    body: String(entry.body || entry.content || entry.summary || "").trim(),
    heroImage: String(entry.heroImage || "").trim(),
    facts: normalizeImportFacts(entry.facts)
  };
}

function cloneImportData(value) {
  if (value == null) return value;
  try { return foundry.utils.deepClone(value); } catch (_error) { return JSON.parse(JSON.stringify(value)); }
}

function snapshotImportDocument(document) {
  if (!document?.id) return null;
  const base = {
    documentName: document.documentName,
    id: document.id,
    name: document.name,
    tomeFlags: cloneImportData(document.flags?.[MODULE_ID] || {})
  };
  if (document.documentName === "JournalEntry") {
    const page = document.pages?.contents?.find((candidate) => candidate.type === "text") || null;
    base.textPage = page ? {
      id: page.id,
      name: page.name,
      type: page.type,
      format: page.text?.format ?? importMarkdownFormat(),
      content: page.text?.content ?? ""
    } : null;
  }
  return base;
}

async function restoreModuleFlags(document, flags = {}) {
  const current = document.flags?.[MODULE_ID] || {};
  for (const key of Object.keys(current)) await document.unsetFlag(MODULE_ID, key);
  for (const [key, value] of Object.entries(flags || {})) await document.setFlag(MODULE_ID, key, cloneImportData(value));
}

async function createImportedEntry(entry, folder, preview) {
  const tomeFlags = {
    type: entry.kind === "quest" ? "quests" : entry.kind === "world" ? "world" : "sessions",
    summary: String(entry.summary || "").trim(),
    [FLAGS.IMPORT_META]: importMetaFor(preview, entry)
  };
  if (entry.kind === "quest") {
    tomeFlags.status = entry.status || "active";
    tomeFlags.featured = Boolean(entry.featured);
  }
  if (entry.kind === "world") tomeFlags[FLAGS.WORLD_PROFILE] = importedWorldProfile(entry);
  return CONFIG.JournalEntry.documentClass.create({
    name: entry.name,
    folder: folder?.id ?? null,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
    pages: importedPageData(entry),
    flags: { [MODULE_ID]: tomeFlags }
  });
}

async function updateImportedEntry(existing, entry, preview) {
  if (!existing) throw new Error(`Existing ${entry.kind} could not be found for update.`);
  if (existing.name !== entry.name) await existing.update({ name: entry.name });
  await existing.setFlag(MODULE_ID, "type", entry.kind === "quest" ? "quests" : entry.kind === "world" ? "world" : "sessions");
  await existing.setFlag(MODULE_ID, "summary", String(entry.summary || "").trim());
  await existing.setFlag(MODULE_ID, FLAGS.IMPORT_META, importMetaFor(preview, entry));
  if (entry.kind === "quest") {
    await existing.setFlag(MODULE_ID, "status", entry.status || "active");
    if (typeof entry.featured === "boolean") await existing.setFlag(MODULE_ID, "featured", entry.featured);
  }
  if (entry.kind === "world") {
    // Merge against the shared World profile only. getWorldProfile() also
    // overlays the current GM's private vault; writing that merged view back
    // to a Journal flag would accidentally publish GM-only facts.
    const rawProfile = existing.getFlag(MODULE_ID, FLAGS.WORLD_PROFILE);
    const oldProfile = rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile) ? foundry.utils.deepClone(rawProfile) : {};
    const nextProfile = importedWorldProfile(entry);
    await existing.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, {
      ...oldProfile,
      ...nextProfile,
      heroImage: nextProfile.heroImage || oldProfile.heroImage || "",
      facts: nextProfile.facts.length ? nextProfile.facts : (oldProfile.facts || [])
    });
  }

  let page = existing.pages?.contents?.find((candidate) => candidate.type === "text") || null;
  let createdPageId = "";
  if (page) {
    await page.update({
      name: entry.name,
      "text.format": importMarkdownFormat(),
      "text.content": String(entry.content || entry.summary || entry.name)
    });
  } else {
    const created = await existing.createEmbeddedDocuments("JournalEntryPage", importedPageData(entry));
    createdPageId = created?.[0]?.id || "";
  }
  return { document: existing, createdPageId };
}

function kindToLinkKey(kind) {
  return kind === "session" ? "sessions" : kind === "quest" ? "quests" : kind === "world" ? "world" : "actors";
}

async function mergeExplicitLink(document, key, targetId) {
  if (!document?.id || !targetId || !["sessions", "quests", "world", "actors"].includes(key)) return false;
  const links = getTomeLinks(document);
  if (links[key].includes(targetId)) return false;
  links[key].push(targetId);
  await document.setFlag(MODULE_ID, FLAGS.LINKS, links);
  return true;
}

async function applyImportPreview(preview, selections = {}, linkSelections = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can import into Adventurer's Tome.");
  if (!preview?.entries?.length) throw new Error("There is no import preview to apply.");
  const folders = await ensureImportFolders();
  const transactionId = foundry.utils.randomID?.() || `${Date.now()}`;
  const transaction = {
    transactionId,
    timestamp: Date.now(),
    sourceName: preview.sourceName || "Pasted text",
    createdJournalIds: [],
    snapshots: [],
    createdPageIds: []
  };
  const snapshotIds = new Set();
  const snapshotIfNeeded = (document) => {
    if (!document?.id || transaction.createdJournalIds.includes(document.id)) return;
    const key = `${document.documentName}:${document.id}`;
    if (snapshotIds.has(key)) return;
    const snapshot = snapshotImportDocument(document);
    if (snapshot) {
      transaction.snapshots.push(snapshot);
      snapshotIds.add(key);
    }
  };

  const result = { created: 0, updated: 0, skipped: 0, failed: 0, linksApplied: 0, linksSkipped: 0, linksFailed: 0, failures: [] };
  const documentsByEntryKey = new Map();
  const actionsByEntryKey = new Map();

  for (const entry of preview.entries) {
    const action = selections[entry.key] || entry.defaultAction || "skip";
    actionsByEntryKey.set(entry.key, action);
    if (action === "skip") {
      result.skipped += 1;
      if (entry.existingId) documentsByEntryKey.set(entry.key, game.journal.get(entry.existingId) || null);
      continue;
    }
    try {
      if (action === "update") {
        let existing = game.journal.get(entry.existingId);
        if (!existing) {
          const match = findExistingImportMatch(entry);
          existing = match ? game.journal.get(match.id) : null;
        }
        if (!existing) throw new Error("The matched Journal no longer exists.");
        snapshotIfNeeded(existing);
        const updated = await updateImportedEntry(existing, entry, preview);
        if (updated.createdPageId) transaction.createdPageIds.push({ journalId: existing.id, pageId: updated.createdPageId });
        documentsByEntryKey.set(entry.key, existing);
        result.updated += 1;
      } else {
        const folder = entry.kind === "quest" ? folders.quests : entry.kind === "world" ? folders.worldCategories[entry.category || "lore"] : folders.sessions;
        const created = await createImportedEntry(entry, folder, preview);
        if (created) {
          transaction.createdJournalIds.push(created.id);
          documentsByEntryKey.set(entry.key, created);
        }
        result.created += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.failures.push(`${entry.name}: ${error.message}`);
      console.error(`Adventurer's Tome | Import failed for ${entry.name}`, error);
    }
  }

  for (const link of preview.links || []) {
    const linkAction = linkSelections[link.key] || (link.defaultApply ? "apply" : "skip");
    if (linkAction !== "apply" || !link.resolved) {
      result.linksSkipped += 1;
      continue;
    }
    const sourceAction = actionsByEntryKey.get(link.sourceKey) || "skip";
    if (sourceAction === "skip") {
      result.linksSkipped += 1;
      continue;
    }
    const source = documentsByEntryKey.get(link.sourceKey) || null;
    let target = link.targetEntryKey ? documentsByEntryKey.get(link.targetEntryKey) : null;
    if (!target && link.targetExistingId) target = link.targetExistingType === "Actor" ? game.actors.get(link.targetExistingId) : game.journal.get(link.targetExistingId);
    if (!source || !target) {
      result.linksSkipped += 1;
      continue;
    }
    try {
      snapshotIfNeeded(source);
      snapshotIfNeeded(target);
      const sourceEntry = preview.entries.find((entry) => entry.key === link.sourceKey);
      const targetEntry = link.targetEntryKey ? preview.entries.find((entry) => entry.key === link.targetEntryKey) : null;
      const targetKind = link.targetKind;
      const sourceKind = sourceEntry?.kind || (source.documentName === "Actor" ? "actor" : "world");
      const changedSource = await mergeExplicitLink(source, kindToLinkKey(targetKind), target.id);

      // Respect Skip on an imported target: the source may link to an existing target,
      // but Skip means do not mutate that target document itself.
      const targetAction = link.targetEntryKey ? (actionsByEntryKey.get(link.targetEntryKey) || "skip") : "external";
      let changedTarget = false;
      if (targetAction !== "skip") changedTarget = await mergeExplicitLink(target, kindToLinkKey(sourceKind), source.id);
      else if (!link.targetEntryKey) changedTarget = await mergeExplicitLink(target, kindToLinkKey(sourceKind), source.id);
      if (changedSource || changedTarget) result.linksApplied += 1;
      else result.linksSkipped += 1;
    } catch (error) {
      result.linksFailed += 1;
      result.failures.push(`${link.sourceName} → ${link.targetName}: ${error.message}`);
      console.error("Adventurer's Tome | Cross-link import failed", error);
    }
  }

  if (result.created || result.updated || result.linksApplied) await game.settings.set(MODULE_ID, PRIVATE_IMPORT_UNDO_SETTING, JSON.stringify(transaction));
  else await game.settings.set(MODULE_ID, PRIVATE_IMPORT_UNDO_SETTING, "");

  const historyRecord = {
    id: foundry.utils.randomID?.() || `${Date.now()}`,
    transactionId,
    timestamp: Date.now(),
    sourceName: preview.sourceName || "Pasted text",
    mode: preview.mode,
    total: preview.entries.length,
    sessions: preview.sessions || 0,
    quests: preview.quests || 0,
    worlds: preview.worlds || 0,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    linksApplied: result.linksApplied,
    linksSkipped: result.linksSkipped,
    linksFailed: result.linksFailed
  };
  await addImportHistory(historyRecord);
  return { ...result, historyRecord };
}

async function undoLastImport() {
  if (!game.user.isGM) throw new Error("Only a GM can undo Adventurer's Tome imports.");
  const transaction = getLastImportUndo();
  if (!transaction?.transactionId) throw new Error("There is no import transaction available to undo.");

  const restored = { deleted: 0, restored: 0, pageCleanups: 0, missing: 0 };

  for (const created of [...(transaction.createdJournalIds || [])].reverse()) {
    const journal = game.journal.get(created);
    if (!journal) { restored.missing += 1; continue; }
    await journal.delete();
    restored.deleted += 1;
  }

  for (const pageRef of transaction.createdPageIds || []) {
    const journal = game.journal.get(pageRef.journalId);
    const page = journal?.pages?.get?.(pageRef.pageId) || journal?.pages?.contents?.find((candidate) => candidate.id === pageRef.pageId);
    if (page) {
      await page.delete();
      restored.pageCleanups += 1;
    }
  }

  for (const snapshot of transaction.snapshots || []) {
    const document = snapshot.documentName === "Actor" ? game.actors.get(snapshot.id) : game.journal.get(snapshot.id);
    if (!document) { restored.missing += 1; continue; }
    if (snapshot.documentName === "JournalEntry" && document.name !== snapshot.name) await document.update({ name: snapshot.name });
    await restoreModuleFlags(document, snapshot.tomeFlags || {});
    if (snapshot.documentName === "JournalEntry" && snapshot.textPage) {
      let page = document.pages?.get?.(snapshot.textPage.id) || document.pages?.contents?.find((candidate) => candidate.id === snapshot.textPage.id) || null;
      if (page) {
        await page.update({
          name: snapshot.textPage.name,
          "text.format": snapshot.textPage.format,
          "text.content": snapshot.textPage.content
        });
      } else {
        await document.createEmbeddedDocuments("JournalEntryPage", [{
          name: snapshot.textPage.name,
          type: "text",
          text: { format: snapshot.textPage.format, content: snapshot.textPage.content }
        }]);
      }
    }
    restored.restored += 1;
  }

  const history = getImportHistory();
  const record = history.find((item) => item.transactionId === transaction.transactionId);
  if (record) record.undoneAt = Date.now();
  await game.settings.set(MODULE_ID, PRIVATE_IMPORT_HISTORY_SETTING, JSON.stringify(history));
  await game.settings.set(MODULE_ID, PRIVATE_IMPORT_UNDO_SETTING, "");
  // An undo snapshot from a pre-0.15.2 world may contain legacy private fields.
  // Re-run the privacy migration immediately so they never remain shared.
  await migrateLegacyPrivateData();
  return restored;
}

function exportTomeLinksByName(document, playerSafe = false) {
  const links = getTomeLinks(document);
  const journalName = (id) => {
    const entry = game.journal.get(id);
    if (!entry || (playerSafe && !isPlayerSafeExportDocument(entry))) return null;
    return entry.name;
  };
  const actorName = (id) => {
    const actor = game.actors.get(id);
    if (!actor || (playerSafe && !isPlayerSafeExportDocument(actor))) return null;
    return actor.name;
  };
  return {
    sessions: (links.sessions || []).map(journalName).filter(Boolean),
    quests: (links.quests || []).map(journalName).filter(Boolean),
    world: (links.world || []).map((id) => {
      const entry = game.journal.get(id);
      if (!entry || (playerSafe && !isPlayerSafeExportDocument(entry))) return null;
      return { name: entry.name, category: getWorldProfile(entry).category };
    }).filter(Boolean),
    actors: (links.actors || []).map(actorName).filter(Boolean)
  };
}

function isPlayerSafeExportDocument(document) {
  if (!document) return false;
  const access = getTomeAccess(document);
  if (access.visibility === "gm" || access.discovered === false) return false;
  const observer = Number(CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2);
  return Number(document.ownership?.default ?? 0) >= observer;
}

function exportFacts(facts = [], playerSafe = false) {
  // Portable packages are intentionally free of user-vault GM-only facts.
  // Full GM Archive is the private backup surface for those records. Keeping
  // portable imports public-only prevents an exported private fact from being
  // re-created later as a shared Journal flag by an older/newer importer.
  return (Array.isArray(facts) ? facts : [])
    .filter((fact) => factVisibility(fact?.visibility) !== "gm")
    .map((fact) => ({
      label: String(fact?.label || ""), value: String(fact?.value || "")
    }));
}

function buildPortableTomeExport({ playerSafe = false } = {}) {
  const journals = game.journal.contents.filter((entry) => !playerSafe || isPlayerSafeExportDocument(entry));
  const sessions = journals.filter((entry) => inferJournalRefKey(entry).startsWith("session:")).map((entry) => {
    const meta = sessionDisplayMeta(entry.name);
    const explicitSummary = String(entry.getFlag(MODULE_ID, "summary") || "").trim();
    const summary = playerSafe ? explicitSummary : (explicitSummary || importSummary(journalText(entry)));
    return {
      number: meta.number,
      title: meta.title,
      name: entry.name,
      summary,
      // Player-safe export deliberately does not serialize raw Journal pages.
      // Those pages can contain Foundry secret blocks or GM prose that Tome
      // cannot reliably classify outside Foundry's own permission context.
      content: playerSafe ? (summary || entry.name) : journalText(entry),
      links: exportTomeLinksByName(entry, playerSafe)
    };
  });
  const quests = journals.filter((entry) => inferJournalRefKey(entry).startsWith("quest:")).map((entry) => {
    const explicitSummary = String(entry.getFlag(MODULE_ID, "summary") || "").trim();
    const summary = playerSafe ? explicitSummary : (explicitSummary || importSummary(journalText(entry)));
    return {
      name: entry.name,
      status: normalizeQuestStatus(entry.getFlag(MODULE_ID, "status") || "active"),
      featured: entry.getFlag(MODULE_ID, "featured") === true,
      summary,
      content: playerSafe ? (summary || entry.name) : journalText(entry),
      links: exportTomeLinksByName(entry, playerSafe)
    };
  });
  const world = journals.filter((entry) => inferJournalRefKey(entry).startsWith("world:")).map((entry) => {
    const profile = getWorldProfile(entry);
    const summary = playerSafe ? String(profile.summary || "").trim() : (profile.summary || importSummary(journalText(entry)));
    return {
      name: entry.name,
      category: profile.category,
      subtitle: profile.subtitle,
      summary,
      body: playerSafe ? summary : (profile.body || journalText(entry)),
      heroImage: profile.heroImage || "",
      facts: exportFacts(profile.facts, playerSafe),
      links: exportTomeLinksByName(entry, playerSafe)
    };
  });
  return {
    schema: IMPORT_SCHEMA,
    version: 2,
    exportedBy: `Adventurer's Tome ${game.modules.get(MODULE_ID)?.version || ""}`.trim(),
    exportedAt: new Date().toISOString(),
    playerSafe: Boolean(playerSafe),
    playerSafeNotice: playerSafe ? "Raw Journal page text is intentionally omitted; only explicit Tome summaries/public metadata are included." : undefined,
    campaign: {
      title: game.settings.get(MODULE_ID, "campaignTitle"),
      subtitle: game.settings.get(MODULE_ID, "campaignSubtitle"),
      currentLocation: game.settings.get(MODULE_ID, "currentLocation")
    },
    sessions,
    quests,
    world
  };
}

function exportSettingKeys() {
  return ["campaignTitle","campaignSubtitle","background","currentLocation","sessionLabel","welcomeTitle","welcomeText","campaignLogo","theme","sectionBackgrounds","homeLayout","homeMode","homeHeroLayout","homeHeroHeight","homeHeroShade","homeHeroFocus","homeShowEnterButton","homeEnterTarget","homeAtGlance","homeSidebarCampaign","homeSidebarQuickLinks","navConfig","defaultLanding","groupHomeLimit","groupSort","defaultQuestStatus","defaultWorldCategory","defaultTomeVisibility","defaultTomeDiscovered"];
}

function buildFullTomeBackup() {
  const settings = Object.fromEntries(exportSettingKeys().map((key) => [key, game.settings.get(MODULE_ID, key)]));
  const actors = game.actors.contents.filter((actor) => actor.flags?.[MODULE_ID]).map((actor) => ({
    id: actor.id,
    name: actor.name,
    img: actor.img || "",
    tomeFlags: cloneImportData(actor.flags?.[MODULE_ID] || {})
  }));
  const journals = game.journal.contents.filter((entry) => entry.flags?.[MODULE_ID] || inferJournalRefKey(entry)).map((entry) => ({
    id: entry.id,
    name: entry.name,
    folder: folderLineageNames(entry.folder),
    ownership: cloneImportData(entry.ownership || {}),
    content: journalText(entry),
    tomeFlags: cloneImportData(entry.flags?.[MODULE_ID] || {})
  }));
  return {
    schema: BACKUP_SCHEMA,
    version: 1,
    moduleVersion: game.modules.get(MODULE_ID)?.version || "",
    foundryVersion: game.version,
    exportedAt: new Date().toISOString(),
    warning: "Full GM archive. Contains private GM notes and Tome-only metadata. Keep it private.",
    settings,
    privateGmState: {
      noteVault: cloneImportData(getPrivateVault()),
      gmWorkspace: cloneImportData(getGmWorkspace()),
      revealQueue: cloneImportData(getRevealQueueRaw()),
      importHistory: cloneImportData(getImportHistory()),
      lastImportUndo: cloneImportData(getLastImportUndo())
    },
    actors,
    journals
  };
}

function stringifyExport(data) { return JSON.stringify(data, null, 2); }

function downloadTextFile(filename, text, mime = "application/json") {
  try {
    if (typeof saveDataToFile === "function") return saveDataToFile(text, mime, filename);
  } catch (_err) {}
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilename(mode = "portable") {
  const campaign = String(game.settings.get(MODULE_ID, "campaignTitle") || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
  const date = new Date().toISOString().slice(0, 10);
  return `adventurers-tome-${campaign}-${mode}-${date}.json`;
}

function buildGmNotebookRows() {
  const latest = game.journal.contents.map((entry) => sessionDisplayMeta(entry.name).number).filter((n) => Number.isFinite(n));
  const nextSession = (latest.length ? Math.max(...latest) : 0) + 1;
  const documents = [
    ...game.actors.contents.map((document) => ({ document, documentType: "actor" })),
    ...game.journal.contents.map((document) => ({ document, documentType: "journal" }))
  ];
  const rows = [];
  for (const { document, documentType } of documents) {
    const access = accessView(document);
    if (!access.notes.length) continue;
    const ref = documentType === "actor" ? "actor" : (inferJournalRefKey(document).split(":")[0] || "journal");
    const kind = ref === "actor" ? "Character" : ref[0].toUpperCase() + ref.slice(1);
    for (const note of access.notes) {
      rows.push({
        ...note,
        documentId: document.id,
        documentType,
        documentName: document.name,
        sourceKind: kind,
        standalone: false,
        due: note.status !== "resolved" && note.sessionTarget != null && note.sessionTarget <= nextSession,
        resolved: note.status === "resolved",
        searchText: [note.title, note.body, note.typeLabel, note.trigger, document.name, kind].filter(Boolean).join(" ").toLowerCase()
      });
    }
  }

  const workspace = getGmWorkspace();
  for (const rawNote of workspace.notes) {
    const note = normalizeGmNote(rawNote);
    const typeLabel = GM_NOTE_TYPES[note.type]?.label || "Note";
    const typeIcon = GM_NOTE_TYPES[note.type]?.icon || "fa-note-sticky";
    rows.push({
      ...note, typeLabel, typeIcon, statusLabel: GM_NOTE_STATUSES[note.status]?.label || "Open",
      documentId: "gm-workspace", documentType: "workspace", documentName: "GM Notebook", sourceKind: "Notebook", standalone: true,
      due: note.status !== "resolved" && note.sessionTarget != null && note.sessionTarget <= nextSession,
      resolved: note.status === "resolved",
      searchText: [note.title, note.body, typeLabel, note.trigger, "GM Notebook", "Notebook"].filter(Boolean).join(" ").toLowerCase()
    });
  }

  rows.sort((a,b) => Number(b.pinned)-Number(a.pinned) || Number(b.due)-Number(a.due) || Number(a.status === "resolved")-Number(b.status === "resolved") || (b.updatedAt-a.updatedAt));
  const widgetMeta = new Map(NOTEBOOK_WIDGET_DEFS.map(([id, label, icon, _visible, _size, description]) => [id, { label, icon, description }]));
  const layout = workspace.layout.map((item) => {
    const meta = widgetMeta.get(item.id) || { label: item.id, icon: "fa-square", description: "" };
    return {
      ...item,
      ...meta,
      sizeLabel: NOTEBOOK_WIDGET_SIZES[item.size] || NOTEBOOK_WIDGET_SIZES.full,
      sizeClass: `at-notebook-widget-${item.size || "full"}`,
      sizeQuarter: item.size === "quarter",
      sizeHalf: item.size === "half",
      sizeThreeQuarter: item.size === "threeQuarter",
      sizeFull: item.size === "full",
      isScratchpad: item.id === "scratchpad",
      isQuickCapture: item.id === "quickCapture",
      isCustomPads: item.id === "customPads",
      isSessionTools: item.id === "sessionTools",
      isBriefing: item.id === "briefing",
      isNotes: item.id === "notes"
    };
  });
  return {
    rows,
    scratchpad: workspace.scratchpad,
    pads: workspace.pads.map((pad) => ({
      ...pad,
      updatedLabel: new Date(pad.updatedAt).toLocaleString(),
      sizeClass: `at-pad-size-${pad.size || "half"}`,
      sizeQuarter: pad.size === "quarter",
      sizeHalf: pad.size === "half",
      sizeThreeQuarter: pad.size === "threeQuarter",
      sizeFull: pad.size === "full"
    })),
    layout,
    preset: workspace.preset,
    presetLabel: NOTEBOOK_PRESETS[workspace.preset]?.label || "Custom",
    presetOptions: [
      ...Object.entries(NOTEBOOK_PRESETS).map(([id, meta]) => ({ id, label: meta.label, description: meta.description, selected: workspace.preset === id, disabled: false })),
      { id: "custom", label: "Custom", description: "Your personal arrangement", selected: workspace.preset === "custom", disabled: true }
    ],
    sizeOptions: Object.entries(NOTEBOOK_WIDGET_SIZES).map(([id, label]) => ({ id, label })),
    nextSession,
    typeOptions: Object.entries(GM_NOTE_TYPES).map(([id, meta]) => ({ id, ...meta })),
    stats: {
      total: rows.length,
      open: rows.filter((n) => n.status !== "resolved").length,
      pinned: rows.filter((n) => n.pinned && n.status !== "resolved").length,
      due: rows.filter((n) => n.due).length,
      secrets: rows.filter((n) => n.type === "secret" && n.status !== "resolved").length,
      reveals: rows.filter((n) => n.type === "reveal" && n.status !== "resolved").length,
      resolved: rows.filter((n) => n.status === "resolved").length
    }
  };
}


function tomeRefMeta(refKey = "") {
  const parsed = parseTomeRefKey(refKey);
  const document = resolveTomeRefKey(refKey);
  if (!parsed || !document) return null;
  const labels = {
    session: ["Session", "fa-book-open"],
    quest: ["Quest", "fa-diamond"],
    world: ["World", "fa-earth-europe"],
    rule: ["Rule", "fa-scroll"],
    actor: ["Character", "fa-user"]
  };
  let category = labels[parsed.type]?.[0] || "Tome";
  let icon = labels[parsed.type]?.[1] || "fa-book";
  let summary = "";
  let img = null;
  if (parsed.type === "actor") {
    const view = actorView(document);
    category = "Character";
    summary = view.summary || view.displayRole || "";
    img = view.img;
  } else if (parsed.type === "world") {
    const view = worldEntryView(document);
    category = view.categoryLabel || "World";
    icon = view.icon || icon;
    summary = view.summary || "";
    img = view.image || null;
  } else {
    const view = entryView(document);
    summary = view.summary || "";
    if (parsed.type === "quest") category = `Quest · ${view.statusLabel || "Quest"}`;
    if (parsed.type === "session" && view.sessionNumber != null) category = `Session ${view.sessionNumber}`;
  }
  return { refKey, type: parsed.type, id: parsed.id, document, name: document.name, category, icon, summary: truncate(summary, 140), img };
}

function getRevealQueueRaw() {
  const raw = safeJSONParse(game.settings.get(MODULE_ID, PRIVATE_REVEAL_SETTING), []);
  return Array.isArray(raw) ? raw : [];
}

async function setRevealQueueRaw(items = []) {
  const clean = (Array.isArray(items) ? items : []).slice(0, 100).map((item) => ({
    refKey: String(item?.refKey || "").trim(),
    addedAt: Number(item?.addedAt || Date.now()) || Date.now(),
    shownAt: item?.shownAt ? Number(item.shownAt) : null
  })).filter((item) => item.refKey);
  await game.settings.set(MODULE_ID, PRIVATE_REVEAL_SETTING, JSON.stringify(clean));
  return clean;
}

function buildRevealQueueView() {
  const rows = getRevealQueueRaw().map((item) => {
    const meta = tomeRefMeta(item.refKey);
    if (!meta) return null;
    const access = getTomeAccess(meta.document);
    const foundryPlayerCount = game.users?.contents?.filter((user) => !user.isGM && user.active && meta.document.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)).length || 0;
    return {
      ...item,
      ...meta,
      queued: !item.shownAt,
      shown: Boolean(item.shownAt),
      shownLabel: item.shownAt ? new Date(item.shownAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      gmOnly: access.visibility === "gm",
      undiscovered: access.discovered === false,
      foundryPlayerCount,
      revealReady: access.visibility !== "gm" && foundryPlayerCount > 0
    };
  }).filter(Boolean);
  rows.sort((a,b) => Number(a.shown)-Number(b.shown) || (a.shown ? (b.shownAt-a.shownAt) : (a.addedAt-b.addedAt)));
  return {
    queued: rows.filter((row) => !row.shownAt),
    recent: rows.filter((row) => row.shownAt).slice(0, 12),
    queuedCount: rows.filter((row) => !row.shownAt).length,
    recentCount: rows.filter((row) => row.shownAt).length
  };
}

async function queueRevealRef(refKey) {
  const key = String(refKey || "").trim();
  if (!tomeRefMeta(key)) throw new Error("Reveal target not found.");
  const rows = getRevealQueueRaw();
  const existing = rows.find((row) => row.refKey === key);
  if (existing) {
    existing.shownAt = null;
    existing.addedAt = Date.now();
  } else rows.push({ refKey: key, addedAt: Date.now(), shownAt: null });
  await setRevealQueueRaw(rows);
}

async function removeRevealRef(refKey) {
  await setRevealQueueRaw(getRevealQueueRaw().filter((row) => row.refKey !== refKey));
}

async function markRevealShown(refKey) {
  const rows = getRevealQueueRaw();
  const existing = rows.find((row) => row.refKey === refKey);
  if (existing) existing.shownAt = Date.now();
  else rows.push({ refKey, addedAt: Date.now(), shownAt: Date.now() });
  await setRevealQueueRaw(rows);
}

function getQuickCaptureInbox() {
  return game.journal.contents.find((entry) => entry.getFlag(MODULE_ID, FLAGS.QUICK_CAPTURE_INBOX) === true) || null;
}

async function ensureQuickCaptureInbox() {
  let inbox = getQuickCaptureInbox();
  if (inbox) return inbox;
  const root = await createJournalFolder("Adventurer's Tome");
  const tools = await createJournalFolder("GM Tools", root);
  inbox = await JournalEntry.create({
    name: "GM Quick Capture Inbox",
    folder: tools?.id || null,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: {
      [MODULE_ID]: {
        [FLAGS.QUICK_CAPTURE_INBOX]: true,
        [FLAGS.ACCESS]: { visibility: "gm", discovered: false }
      }
    }
  });
  return inbox;
}

function latestSessionNumber() {
  const nums = game.journal.contents.map((entry) => sessionDisplayMeta(entry.name).number).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 0;
}

function buildNextSessionDashboard(sessions = [], quests = [], world = [], group = []) {
  const notebook = buildGmNotebookRows();
  const latest = sessions.length ? sessions[sessions.length - 1] : null;
  const currentLocationName = String(game.settings.get(MODULE_ID, "currentLocation") || "").trim().toLowerCase();
  const currentLocation = world.find((item) => item.category === "location" && String(item.name || "").trim().toLowerCase() === currentLocationName) || null;
  const open = notebook.rows.filter((note) => note.status !== "resolved");
  const due = open.filter((note) => note.due);
  const pinned = open.filter((note) => note.pinned).slice(0, 8);
  const clues = open.filter((note) => note.type === "clue").slice(0, 8);
  const reveals = open.filter((note) => note.type === "reveal").slice(0, 8);
  const consequences = open.filter((note) => note.type === "consequence").slice(0, 8);
  const inbox = getQuickCaptureInbox();
  const inboxNotes = inbox ? accessView(inbox).openNotes : [];
  const revealQueue = buildRevealQueueView();
  return {
    nextSession: notebook.nextSession,
    latestSession: latest,
    currentLocation,
    due,
    pinned,
    clues,
    reveals,
    consequences,
    activeQuests: quests.filter((quest) => quest.status === "active").slice(0, 8),
    group: group.slice(0, 8),
    inboxCount: inboxNotes.length,
    revealQueueCount: revealQueue.queuedCount,
    stats: {
      due: due.length,
      pinned: pinned.length,
      clues: clues.length,
      reveals: reveals.length,
      consequences: consequences.length,
      activeQuests: quests.filter((quest) => quest.status === "active").length,
      inbox: inboxNotes.length,
      queue: revealQueue.queuedCount
    }
  };
}

function buildPostSessionAssistant(sessions = [], quests = []) {
  const notebook = buildGmNotebookRows();
  const latest = sessions.length ? sessions[sessions.length - 1] : null;
  const latestNumber = latest?.sessionNumber || latestSessionNumber();
  const overdueNotes = notebook.rows.filter((note) => note.status !== "resolved" && note.sessionTarget != null && note.sessionTarget <= latestNumber);
  const openReveals = notebook.rows.filter((note) => note.status !== "resolved" && note.type === "reveal");
  const openConsequences = notebook.rows.filter((note) => note.status !== "resolved" && note.type === "consequence");
  const inbox = getQuickCaptureInbox();
  const inboxNotes = inbox ? accessView(inbox).openNotes : [];
  const activeQuests = quests.filter((quest) => quest.status === "active");
  return {
    latest,
    latestNumber,
    nextSession: notebook.nextSession,
    overdueNotes: overdueNotes.slice(0, 12),
    openReveals: openReveals.slice(0, 8),
    openConsequences: openConsequences.slice(0, 8),
    inboxNotes: inboxNotes.slice(0, 10),
    activeQuests: activeQuests.slice(0, 10),
    stats: {
      overdueNotes: overdueNotes.length,
      reveals: openReveals.length,
      consequences: openConsequences.length,
      inbox: inboxNotes.length,
      activeQuests: activeQuests.length
    },
    checklist: [
      { icon: "fa-book-open", title: "Session record", detail: latest ? `${latest.displayTitle || latest.name} is the latest Chronicle entry.` : "No session record exists yet.", done: Boolean(latest), action: latest ? "selectSession" : "openImporter", journalId: latest?.id || "" },
      { icon: "fa-note-sticky", title: "Resolve due GM notes", detail: overdueNotes.length ? `${overdueNotes.length} note(s) targeted at Session ${latestNumber} or earlier still need review.` : "No overdue GM notes.", done: overdueNotes.length === 0, action: "openNotebook" },
      { icon: "fa-bolt", title: "Empty the live-capture inbox", detail: inboxNotes.length ? `${inboxNotes.length} quick capture(s) are waiting to be sorted.` : "Quick Capture inbox is clear.", done: inboxNotes.length === 0, action: "openNotebook" },
      { icon: "fa-diamond", title: "Review active quests", detail: `${activeQuests.length} quest(s) are currently active. Check whether the session changed status, objectives, or links.`, done: activeQuests.length === 0, action: "navigate", tab: "quests" },
      { icon: "fa-file-export", title: "Create a campaign checkpoint", detail: "Export a portable package or private GM archive after important sessions.", done: false, action: "openExporter" }
    ]
  };
}

class AdventurersTomeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "adventurers-tome-app",
    classes: ["adventurers-tome-app"],
    position: {
      width: 1280,
      height: 800
    },
    window: {
      title: "Adventurer's Tome",
      icon: "fa-solid fa-book-open",
      resizable: true
    },
    actions: {
      navigate: this._onNavigate,
      goBack: this._onGoBack,
      toggleFavorite: this._onToggleFavorite,
      clearRecent: this._onClearRecent,
      selectSession: this._onSelectSession,
      openActor: this._onOpenActor,
      openProfile: this._onOpenProfile,
      editProfile: this._onEditProfile,
      cancelProfileEdit: this._onCancelProfileEdit,
      saveProfile: this._onSaveProfile,
      browseProfileImage: this._onBrowseProfileImage,
      openWorldProfile: this._onOpenWorldProfile,
      openQuestDetail: this._onOpenQuestDetail,
      editWorldProfile: this._onEditWorldProfile,
      cancelWorldEdit: this._onCancelWorldEdit,
      saveWorldProfile: this._onSaveWorldProfile,
      browseWorldImage: this._onBrowseWorldImage,
      openJournal: this._onOpenJournal,
      openCustomLink: this._onOpenCustomLink,
      createRule: this._onCreateRule,
      linkRule: this._onLinkRule,
      openRuleDetail: this._onOpenRuleDetail,
      sendSelectionToChat: this._onSendSelectionToChat,
      whisperSelectionToChat: this._onWhisperSelectionToChat,
      browseBackground: this._onBrowseBackground,
      resetBackground: this._onResetBackground,
      browseSettingImage: this._onBrowseSettingImage,
      previewSettings: this._onPreviewSettings,
      resetSettingsDefaults: this._onResetSettingsDefaults,
      saveSettings: this._onSaveSettings,
      initializeStructure: this._onInitializeStructure,
      openImporter: this._onOpenImporter,
      openExporter: this._onOpenExporter,
      downloadExport: this._onDownloadExport,
      copyExport: this._onCopyExport,
      openNotebook: this._onOpenNotebook,
      openManual: this._onOpenManual,
      saveNotebookScratchpad: this._onSaveNotebookScratchpad,
      saveNotebookCapture: this._onSaveNotebookCapture,
      toggleNotebookBuilder: this._onToggleNotebookBuilder,
      moveNotebookWidget: this._onMoveNotebookWidget,
      setNotebookWidgetSize: this._onSetNotebookWidgetSize,
      toggleNotebookWidgetVisibility: this._onToggleNotebookWidgetVisibility,
      moveNotebookPad: this._onMoveNotebookPad,
      setNotebookPadSize: this._onSetNotebookPadSize,
      saveNotebookLayout: this._onSaveNotebookLayout,
      applyNotebookPreset: this._onApplyNotebookPreset,
      resetNotebookLayout: this._onResetNotebookLayout,
      addNotebookPad: this._onAddNotebookPad,
      saveNotebookPad: this._onSaveNotebookPad,
      deleteNotebookPad: this._onDeleteNotebookPad,
      editStandaloneNote: this._onEditStandaloneNote,
      resetStandaloneNoteEditor: this._onResetStandaloneNoteEditor,
      toggleStandaloneNoteStatus: this._onToggleStandaloneNoteStatus,
      deleteStandaloneNote: this._onDeleteStandaloneNote,
      openGmDashboard: this._onOpenGmDashboard,
      openQuickCapture: this._onOpenQuickCapture,
      saveQuickCapture: this._onSaveQuickCapture,
      openRevealQueue: this._onOpenRevealQueue,
      queueReveal: this._onQueueReveal,
      showToPlayers: this._onShowToPlayers,
      removeReveal: this._onRemoveReveal,
      clearRevealHistory: this._onClearRevealHistory,
      openPostSession: this._onOpenPostSession,
      resolveNotebookNote: this._onResolveNotebookNote,
      openNoteSource: this._onOpenNoteSource,
      quickNote: this._onQuickNote,
      addGmNote: this._onAddGmNote,
      removeGmNote: this._onRemoveGmNote,
      moveGmNote: this._onMoveGmNote,
      previewImport: this._onPreviewImport,
      clearImport: this._onClearImport,
      applyImport: this._onApplyImport,
      clearImportHistory: this._onClearImportHistory,
      undoLastImport: this._onUndoLastImport,
      generateSmallDemo: this._onGenerateSmallDemo,
      generateFullDemo: this._onGenerateFullDemo,
      removeDemo: this._onRemoveDemo,
      openSettings: this._onOpenSettings,
      editAccess: this._onEditAccess,
      cancelAccess: this._onCancelAccess,
      saveAccess: this._onSaveAccess,
      runHealthCheck: this._onRunHealthCheck,
      repairHealthIssues: this._onRepairHealthIssues
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/tome.hbs`
    }
  };

  constructor(options = {}) {
    const adaptivePosition = getAdaptiveWindowPosition(getSavedWindowState());
    super({
      ...options,
      position: {
        ...adaptivePosition,
        ...(options.position ?? {})
      }
    });
    this.activeTab = configuredDefaultLanding();
    this.settingsSection = "campaign";
    this.activeSessionId = null;
    this.activeActorId = null;
    this.profileEditing = false;
    this.activeWorldId = null;
    this._selectedShareText = "";
    this.activeQuestId = null;
    this.activeRuleId = null;
    this.activeAccessType = null;
    this.activeAccessId = null;
    this.worldEditing = false;
    this.importMode = "auto";
    this.importText = "";
    this.importSourceName = "";
    this.importPreview = null;
    this.importError = "";
    this.importLastResult = null;
    this.searchQuery = "";
    this.searchFilter = "all";
    this._navigationHistory = [];
    this._bulkUpdating = false;
    this._resizeObserver = null;
    this._viewportResizeHandler = null;
    this._searchShortcutHandler = null;
    this._selectionChangeHandler = null;
    this._windowStateTimer = null;
    this._healthReport = null;
    this._quickCaptureSourceRef = "";
    this._notebookEditing = false;
  }

  _captureNavigationState() {
    return {
      activeTab: this.activeTab,
      activeSessionId: this.activeSessionId,
      activeActorId: this.activeActorId,
      activeWorldId: this.activeWorldId,
      activeQuestId: this.activeQuestId,
      activeRuleId: this.activeRuleId,
      activeAccessType: this.activeAccessType,
      activeAccessId: this.activeAccessId
    };
  }

  _pushNavigationState() {
    const state = this._captureNavigationState();
    const last = this._navigationHistory[this._navigationHistory.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(state)) return;
    this._navigationHistory.push(state);
    if (this._navigationHistory.length > 32) this._navigationHistory.shift();
  }

  _restoreNavigationState(state = {}) {
    this.activeTab = state.activeTab || "home";
    this.activeSessionId = state.activeSessionId || null;
    this.activeActorId = state.activeActorId || null;
    this.activeWorldId = state.activeWorldId || null;
    this.activeQuestId = state.activeQuestId || null;
    this.activeRuleId = state.activeRuleId || null;
    this.activeAccessType = state.activeAccessType || null;
    this.activeAccessId = state.activeAccessId || null;
    this.profileEditing = false;
    this.worldEditing = false;
  }

  _fallbackBackState() {
    if (this.activeTab === "questDetail") return { activeTab: "quests" };
    if (this.activeTab === "profile") return { activeTab: "group" };
    if (this.activeTab === "worldProfile") return { activeTab: "world" };
    if (this.activeTab === "ruleDetail") return { activeTab: "rules" };
    if (this.activeTab === "access") return { activeTab: "settings" };
    if (["gmDashboard", "quickCapture", "revealQueue", "postSession", "manual"].includes(this.activeTab)) return { activeTab: "home" };
    return { activeTab: "home" };
  }

  setPosition(position = {}) {
    const result = super.setPosition(position);
    this._syncResponsiveState();
    if (this.rendered) this._scheduleWindowStateSave();
    return result;
  }

  _scheduleWindowStateSave() {
    clearTimeout(this._windowStateTimer);
    this._windowStateTimer = setTimeout(() => {
      if (!this.rendered) return;
      const { width, height, left, top } = this.position ?? {};
      if (![width, height, left, top].every((value) => Number.isFinite(Number(value)))) return;
      const payload = JSON.stringify({
        width: Math.round(Number(width)),
        height: Math.round(Number(height)),
        left: Math.round(Number(left)),
        top: Math.round(Number(top))
      });
      game.settings.set(MODULE_ID, "windowState", payload).catch((error) => {
        console.warn("Adventurer's Tome | Could not save client window state", error);
      });
    }, 300);
  }

  _syncResponsiveState() {
    const shell = this.element?.querySelector?.(".at-shell");
    if (!shell) return;
    const width = shell.clientWidth || this.position?.width || 1280;
    const height = shell.clientHeight || this.position?.height || 800;
    shell.classList.toggle("at-layout-compact", width < 1240);
    shell.classList.toggle("at-layout-narrow", width < 920);
    shell.classList.toggle("at-layout-tiny", width < 720);
    shell.classList.toggle("at-layout-short", height < 760);
  }

  _applyTomeTransparency(value = null) {
    const allowed = [0, 25, 50, 75, 90];
    let transparency = Number(value ?? game.settings.get(MODULE_ID, "tomeTransparency") ?? 0);
    if (!allowed.includes(transparency)) transparency = 0;

    // Never fade the Application itself. "Transparency" means the Foundry
    // Scene shows through Tome's surfaces while text/controls remain opaque.
    const profiles = {
      0:  { shell: 1.00, header: 1.00, panel: .94, soft: .78, input: .92 },
      25: { shell: .74, header: .86, panel: .84, soft: .68, input: .88 },
      50: { shell: .52, header: .76, panel: .72, soft: .56, input: .82 },
      75: { shell: .30, header: .66, panel: .56, soft: .42, input: .74 },
      90: { shell: .13, header: .54, panel: .38, soft: .28, input: .64 }
    };
    const p = profiles[transparency];
    const shell = this.element?.querySelector?.(".at-shell");
    const content = this.element?.querySelector?.(".window-content");

    if (this.element) {
      this.element.dataset.atTransparency = String(transparency);
      this.element.style.setProperty("--at-glass-alpha", String(p.shell));
      this.element.style.setProperty("--at-header-alpha", String(p.header));
      this.element.style.setProperty("--at-panel-alpha", String(p.panel));
      this.element.style.setProperty("--at-soft-alpha", String(p.soft));
      this.element.style.setProperty("--at-input-alpha", String(p.input));
      // Guard against stale v0.20.1/v0.20.2 inline styles or theme rules.
      this.element.style.setProperty("opacity", "1", "important");
      this.element.style.setProperty("filter", "none", "important");
      if (transparency > 0) {
        this.element.style.setProperty("background", "transparent", "important");
        this.element.style.setProperty("background-image", "none", "important");
      } else {
        this.element.style.removeProperty("background");
        this.element.style.removeProperty("background-image");
      }
    }
    if (content) {
      content.style.setProperty("opacity", "1", "important");
      if (transparency > 0) {
        content.style.setProperty("background", "transparent", "important");
        content.style.setProperty("background-image", "none", "important");
      } else {
        content.style.removeProperty("background");
        content.style.removeProperty("background-image");
      }
    }
    if (shell) {
      shell.dataset.atTransparency = String(transparency);
      shell.style.setProperty("opacity", "1", "important");
    }
    const select = this.element?.querySelector?.("[data-at-transparency-select]");
    if (select && String(select.value) !== String(transparency)) select.value = String(transparency);
  }

  _installWindowChromeControls() {
    const header = this.element?.querySelector?.(".window-header");
    if (!header) return;

    let transparency = header.querySelector("[data-at-transparency-control]");
    if (!transparency) {
      transparency = document.createElement("label");
      transparency.className = "at-window-transparency-control";
      transparency.dataset.atTransparencyControl = "true";
      transparency.title = "See the Foundry Scene through Adventurer's Tome (local to your client)";
      transparency.innerHTML = '<i class="fa-solid fa-circle-half-stroke"></i><select data-at-transparency-select aria-label="Tome transparency"><option value="0">Normal</option><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="90">90%</option></select>';
      transparency.querySelector("select")?.addEventListener("change", async (event) => {
        const value = Number(event.currentTarget.value || 0);
        await game.settings.set(MODULE_ID, "tomeTransparency", value);
        this._applyTomeTransparency(value);
      });
    }

    const close = header.querySelector('[data-action="close"], .close');
    if (close) {
      if (!transparency.isConnected) header.insertBefore(transparency, close);
    } else if (!transparency.isConnected) {
      header.appendChild(transparency);
    }

    this._applyTomeTransparency();
  }

  _attachResponsiveObserver() {
    this._resizeObserver?.disconnect();
    if (globalThis.ResizeObserver && this.element) {
      this._resizeObserver = new ResizeObserver(() => {
        this._syncResponsiveState();
        this._scheduleWindowStateSave();
      });
      this._resizeObserver.observe(this.element);
    }

    if (this._viewportResizeHandler) window.removeEventListener("resize", this._viewportResizeHandler);
    this._viewportResizeHandler = () => {
      if (!this.rendered) return;
      const constrained = getAdaptiveWindowPosition(JSON.stringify(this.position ?? {}));
      this.setPosition(constrained);
    };
    window.addEventListener("resize", this._viewportResizeHandler);
    this._syncResponsiveState();
  }

  _tearDown(options) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._viewportResizeHandler) window.removeEventListener("resize", this._viewportResizeHandler);
    this._viewportResizeHandler = null;
    if (this._searchShortcutHandler) window.removeEventListener("keydown", this._searchShortcutHandler);
    this._searchShortcutHandler = null;
    if (this._selectionChangeHandler) document.removeEventListener("selectionchange", this._selectionChangeHandler);
    this._selectionChangeHandler = null;
    clearTimeout(this._windowStateTimer);
    return super._tearDown(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const sessions = sectionEntries("sessions").map((entry) => entryView(entry));
    const quests = sectionEntries("quests").map((entry) => entryView(entry));
    const worldDocs = sectionEntries("world");
    const world = worldDocs.map((entry) => worldEntryView(entry));
    const rules = sectionEntries("rules").map((entry) => ({ ...entryView(entry), localSearchText: `${entry.name} ${stripMarkup(journalText(entry))}`.toLowerCase() }));
    const ruleIds = new Set(rules.map((rule) => rule.id));
    const ruleLinkCandidates = game.journal.contents
      .filter((entry) => game.user.isGM && !ruleIds.has(entry.id))
      .sort((a,b) => a.name.localeCompare(b.name, game.i18n.lang, {numeric:true}))
      .map((entry) => ({ id: entry.id, name: entry.name }));
    let ruleEntry = this.activeRuleId ? game.journal.get(this.activeRuleId) : null;
    if (ruleEntry && !canViewInTome(ruleEntry)) ruleEntry = null;
    if (this.activeTab === "ruleDetail" && !ruleEntry) { this.activeTab = "rules"; this.activeRuleId = null; }
    const ruleDetail = ruleEntry ? {
      ...entryView(ruleEntry),
      refKey: `rule:${ruleEntry.id}`,
      body: stripMarkup(journalText(ruleEntry)),
      access: accessView(ruleEntry)
    } : null;

    sessions.sort((a, b) => {
      if (a.sessionNumber != null && b.sessionNumber != null) return a.sessionNumber - b.sessionNumber;
      if (a.sessionNumber != null) return -1;
      if (b.sessionNumber != null) return 1;
      return a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
    });

    quests.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
    });

    const activeQuests = quests.filter((quest) => quest.status === "active");
    const questGroups = [
      { id: "active", label: "Active", icon: "fa-compass", entries: quests.filter((quest) => quest.status === "active") },
      { id: "completed", label: "Completed", icon: "fa-circle-check", entries: quests.filter((quest) => quest.status === "completed") },
      { id: "dormant", label: "Dormant", icon: "fa-moon", entries: quests.filter((quest) => quest.status === "dormant") },
      { id: "failed", label: "Failed", icon: "fa-circle-xmark", entries: quests.filter((quest) => quest.status === "failed") }
    ].map((group) => ({ ...group, count: group.entries.length })).filter((group) => group.count);

    const numberedSessions = sessions.filter((session) => session.sessionNumber != null);
    const latestSession = numberedSessions.length ? numberedSessions[numberedSessions.length - 1] : (sessions.length ? sessions[sessions.length - 1] : null);
    const selectedSessionBase = sessions.find((session) => session.id === this.activeSessionId) || latestSession || sessions[0] || null;
    if (selectedSessionBase) this.activeSessionId = selectedSessionBase.id;
    const group = getGroupActors();
    const visibleActors = game.actors.contents
      .filter((actor) => canViewInTome(actor))
      .map(actorView);

    let questEntry = this.activeQuestId ? game.journal.get(this.activeQuestId) : null;
    if (questEntry && !canViewInTome(questEntry)) questEntry = null;
    if (this.activeTab === "questDetail" && !questEntry) {
      this.activeTab = "quests";
      this.activeQuestId = null;
    }
    const questBaseView = questEntry ? quests.find((quest) => quest.id === questEntry.id) || entryView(questEntry) : null;
    let questDetail = questBaseView ? questDetailView(questBaseView, sessions, world, visibleActors) : null;

    const background = game.settings.get(MODULE_ID, "background") || DEFAULT_BACKGROUND;
    const themeId = String(game.settings.get(MODULE_ID, "theme") || "tome");
    const theme = THEME_DEFS[themeId] || THEME_DEFS.tome;
    const logo = String(game.settings.get(MODULE_ID, "campaignLogo") || "").trim();
    const nav = getNavConfig();
    const homeLayout = getHomeLayout();
    const sectionBackgrounds = getSectionBackgrounds();
    const defaultLanding = configuredDefaultLanding();
    const settings = {
      campaignTitle: game.settings.get(MODULE_ID, "campaignTitle"),
      campaignSubtitle: game.settings.get(MODULE_ID, "campaignSubtitle"),
      background,
      backgroundUrl: resolveFoundryAssetUrl(background),
      logo,
      logoUrl: logo ? resolveFoundryAssetUrl(logo) : "",
      hasLogo: Boolean(logo),
      themeId,
      themeClass: theme.className,
      themeOptions: Object.entries(THEME_DEFS).map(([id, meta]) => ({ id, ...meta, selected: id === themeId })),
      currentLocation: game.settings.get(MODULE_ID, "currentLocation"),
      sessionLabel: game.settings.get(MODULE_ID, "sessionLabel"),
      welcomeTitle: game.settings.get(MODULE_ID, "welcomeTitle"),
      welcomeText: game.settings.get(MODULE_ID, "welcomeText"),
      defaultLanding,
      defaultLandingOptions: [["home", "Home"], ...NAV_SECTION_DEFS.map(([id, label]) => [id, label])].map(([id, label]) => ({ id, label, selected: id === defaultLanding })),
      nav,
      navOptions: NAV_SECTION_DEFS.map(([id, label, icon]) => ({ id, label, icon, visible: nav[id] !== false })),
      homeLayout: homeLayout.map((item) => { const meta = HOME_BLOCK_DEFS.find(([id]) => id === item.id); return { ...item, label: meta?.[1] || item.id, icon: meta?.[2] || "fa-square", sizeOptions: Object.entries(HOME_WIDGET_SIZES).map(([id, label]) => ({ id, label, selected: id === item.size })) }; }),
      homeMode: HOME_MODES[String(game.settings.get(MODULE_ID, "homeMode") || "dashboard")] ? String(game.settings.get(MODULE_ID, "homeMode")) : "dashboard",
      homeModeOptions: Object.entries(HOME_MODES).map(([id, meta]) => ({ id, ...meta, selected: id === String(game.settings.get(MODULE_ID, "homeMode") || "dashboard") })),
      homeHeroLayout: ["classic", "centered", "immersive"].includes(String(game.settings.get(MODULE_ID, "homeHeroLayout") || "classic")) ? String(game.settings.get(MODULE_ID, "homeHeroLayout")) : "classic",
      homeHeroHeight: ["standard", "tall", "full"].includes(String(game.settings.get(MODULE_ID, "homeHeroHeight") || "standard")) ? String(game.settings.get(MODULE_ID, "homeHeroHeight")) : "standard",
      homeHeroShade: ["soft", "balanced", "strong"].includes(String(game.settings.get(MODULE_ID, "homeHeroShade") || "balanced")) ? String(game.settings.get(MODULE_ID, "homeHeroShade")) : "balanced",
      homeHeroFocus: ["left", "center", "right"].includes(String(game.settings.get(MODULE_ID, "homeHeroFocus") || "center")) ? String(game.settings.get(MODULE_ID, "homeHeroFocus")) : "center",
      homeShowEnterButton: Boolean(game.settings.get(MODULE_ID, "homeShowEnterButton")),
      homeEnterTarget: String(game.settings.get(MODULE_ID, "homeEnterTarget") || "sessions"),
      homeAtGlance: Boolean(game.settings.get(MODULE_ID, "homeAtGlance")),
      homeSidebarCampaign: Boolean(game.settings.get(MODULE_ID, "homeSidebarCampaign")),
      homeSidebarQuickLinks: Boolean(game.settings.get(MODULE_ID, "homeSidebarQuickLinks")),
      groupHomeLimit: Number(game.settings.get(MODULE_ID, "groupHomeLimit") || 3),
      groupSort: String(game.settings.get(MODULE_ID, "groupSort") || "manual"),
      groupSortManual: String(game.settings.get(MODULE_ID, "groupSort") || "manual") === "manual",
      groupSortName: String(game.settings.get(MODULE_ID, "groupSort") || "manual") === "name",
      defaultQuestStatus: String(game.settings.get(MODULE_ID, "defaultQuestStatus") || "active"),
      questStatusOptions: ["active", "completed", "dormant", "failed"].map((id) => ({ id, label: displayQuestStatus(id), selected: id === String(game.settings.get(MODULE_ID, "defaultQuestStatus") || "active") })),
      defaultWorldCategory: String(game.settings.get(MODULE_ID, "defaultWorldCategory") || "lore"),
      worldCategoryOptions: Object.entries(WORLD_CATEGORIES).map(([id, meta]) => ({ id, label: meta.label, selected: id === String(game.settings.get(MODULE_ID, "defaultWorldCategory") || "lore") })),
      defaultTomeVisibility: defaultTomeVisibility(),
      defaultTomeVisibilityOptions: Object.entries(TOME_VISIBILITY).map(([id, meta]) => ({ id, ...meta, selected: id === defaultTomeVisibility() })),
      defaultTomeDiscovered: defaultTomeDiscovered(),
      sectionBackgrounds,
      sectionBackgroundRows: SECTION_BACKGROUND_KEYS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), value: sectionBackgrounds[id] || "" })),
      settingsSections: [
        ["campaign", "Campaign Info", "fa-feather-pointed"],
        ["appearance", "Appearance", "fa-palette"],
        ["home", "Home Layout", "fa-table-columns"],
        ["navigation", "Navigation", "fa-compass"],
        ["group", "Group", "fa-users-gear"],
        ["content", "Content Defaults", "fa-sliders"],
        ["permissions", "Permissions", "fa-shield-halved"],
        ["notebook", "GM Notebook", "fa-note-sticky"],
        ["developer", "Developer Tools", "fa-flask-vial"]
      ].map(([id, label, icon]) => ({ id, label, icon, active: this.settingsSection === id }))
    };

    settings.homeHeroLayoutClassic = settings.homeHeroLayout === "classic";
    settings.homeHeroLayoutCentered = settings.homeHeroLayout === "centered";
    settings.homeHeroLayoutImmersive = settings.homeHeroLayout === "immersive";
    settings.homeHeroHeightStandard = settings.homeHeroHeight === "standard";
    settings.homeHeroHeightTall = settings.homeHeroHeight === "tall";
    settings.homeHeroHeightFull = settings.homeHeroHeight === "full";
    settings.homeHeroShadeSoft = settings.homeHeroShade === "soft";
    settings.homeHeroShadeBalanced = settings.homeHeroShade === "balanced";
    settings.homeHeroShadeStrong = settings.homeHeroShade === "strong";
    settings.homeHeroFocusLeft = settings.homeHeroFocus === "left";
    settings.homeHeroFocusCenter = settings.homeHeroFocus === "center";
    settings.homeHeroFocusRight = settings.homeHeroFocus === "right";
    settings.homeModeDashboard = settings.homeMode === "dashboard";
    settings.homeModeMinimal = settings.homeMode === "minimal";
    settings.homeModeCustom = settings.homeMode === "custom";
    settings.homeModeClass = `at-home-mode-${settings.homeMode}`;
    settings.homeHeroLayoutClass = `at-home-hero-${settings.homeHeroLayout}`;
    settings.homeHeroHeightClass = `at-home-height-${settings.homeHeroHeight}`;
    settings.homeHeroShadeClass = `at-home-shade-${settings.homeHeroShade}`;
    settings.homeHeroFocusClass = `at-home-focus-${settings.homeHeroFocus}`;
    settings.homeAtGlanceEffective = settings.homeAtGlance && !settings.homeModeMinimal;
    settings.homeShowEnterButtonEffective = settings.homeShowEnterButton || settings.homeModeMinimal;
    const enterTargetMeta = [["sessions","Sessions"],["quests","Quests"],["group","Group"],["world","World"],["rules","Rules"],["search","Search"]];
    if (!settings.nav[settings.homeEnterTarget]) settings.homeEnterTarget = enterTargetMeta.find(([id]) => settings.nav[id])?.[0] || "home";
    settings.homeEnterTargetOptions = enterTargetMeta.map(([id,label]) => ({ id, label, selected: id === settings.homeEnterTarget, disabled: settings.nav[id] === false }));

    const legacyIds = new Set(getLegacyGroupActorIds());
    const actorOptions = game.actors.contents
      .filter((actor) => game.user.isGM || canViewInTome(actor))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true }))
      .map((actor) => ({
        ...actorView(actor),
        selected: actorIsGroupMember(actor, legacyIds)
      }));

    let profileActor = this.activeActorId ? game.actors.get(this.activeActorId) : null;
    if (profileActor && !canViewInTome(profileActor)) profileActor = null;
    if (this.activeTab === "profile" && !profileActor) {
      this.activeTab = "group";
      this.profileEditing = false;
    }

    const relationCandidates = game.actors.contents
      .filter((actor) => canViewInTome(actor) && actor.id !== profileActor?.id)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true }));

    let profileView = null;
    let profileEditor = null;
    if (profileActor) {
      const profile = getActorProfile(profileActor);
      const base = actorView(profileActor);
      const relations = profile.relations
        .map((relation) => {
          const target = game.actors.get(relation.actorId);
          if (!target || !canViewInTome(target)) return null;
          return {
            ...relation,
            target: actorView(target)
          };
        })
        .filter(Boolean);

      const firstSession = profile.firstSessionId ? game.journal.get(profile.firstSessionId) : null;
      const actorCampaignSessions = linkedSessionsForTarget(profileActor, base, sessions, "actors", ["Characters", "Character", "People", "Personer", "Companions", "Följeslagare"]);
      const actorText = actorProfileText(profileActor);
      const actorCampaignQuests = quests.filter((quest) => {
        const questEntry = game.journal.get(quest.id);
        return getTomeLinks(questEntry).actors.includes(profileActor.id) || textMentionsName(journalText(questEntry), profileActor.name) || textMentionsName(actorText, quest.name);
      });
      const actorCampaignWorld = world.filter((worldView) => {
        const worldEntry = game.journal.get(worldView.id);
        return getTomeLinks(worldEntry).actors.includes(profileActor.id) || textMentionsName(worldProfileText(worldEntry), profileActor.name) || textMentionsName(actorText, worldView.name);
      });
      const incomingRelations = game.actors.contents
        .filter((candidate) => candidate.id !== profileActor.id && canViewInTome(candidate))
        .map((candidate) => {
          const relation = getActorProfile(candidate)?.relations?.find((item) => item.actorId === profileActor.id);
          return relation ? { ...relation, source: actorView(candidate) } : null;
        }).filter(Boolean);
      profileView = {
        ...base,
        biography: profile.biography,
        motto: profile.motto,
        firstSession: canViewInTome(firstSession) ? entryView(firstSession) : (actorCampaignSessions[0] || null),
        facts: profile.facts,
        relations,
        incomingRelations,
        campaignSessions: actorCampaignSessions,
        campaignQuests: actorCampaignQuests,
        campaignWorld: actorCampaignWorld,
        customLinks: profile.customLinks,
        hasCustomLinks: profile.customLinks.length > 0,
        hasCampaignLinks: Boolean(actorCampaignSessions.length || actorCampaignQuests.length || actorCampaignWorld.length || incomingRelations.length)
      };

      const relationRows = profile.relations.map((relation) => ({
        ...relation,
        options: relationCandidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          selected: candidate.id === relation.actorId
        }))
      }));

      if (!relationRows.length) {
        relationRows.push({
          actorId: "",
          label: "",
          note: "",
          options: relationCandidates.map((candidate) => ({ id: candidate.id, name: candidate.name, selected: false }))
        });
      }

      profileEditor = {
        actorId: profileActor.id,
        name: profileActor.name,
        actorImg: profileActor.img || "icons/svg/mystery-man.svg",
        title: profile.title,
        subtitle: profile.subtitle,
        summary: profile.summary,
        biography: profile.biography,
        heroImage: profile.heroImage,
        motto: profile.motto,
        firstSessionId: profile.firstSessionId,
        sessionOptions: sessions.map((session) => ({ ...session, selected: session.id === profile.firstSessionId })),
        previewImage: profile.heroImage || profileActor.img || "icons/svg/mystery-man.svg",
        facts: profile.facts.length ? profile.facts : [{ label: "", value: "" }],
        relations: relationRows,
        customLinks: profile.customLinks.length ? profile.customLinks : [{ label: "", icon: "fa-link", target: "" }]
      };
    }


    let worldEntry = this.activeWorldId ? game.journal.get(this.activeWorldId) : null;
    if (worldEntry && !canViewInTome(worldEntry)) worldEntry = null;
    if (this.activeTab === "worldProfile" && !worldEntry) {
      this.activeTab = "world";
      this.worldEditing = false;
    }

    let worldProfileView = null;
    let worldProfileEditor = null;
    if (worldEntry) {
      const profile = getWorldProfile(worldEntry);
      const view = worldEntryView(worldEntry);
      const worldCampaignSessions = linkedSessionsForTarget(worldEntry, view, sessions, "world", ["World", "World Updates", "NPC", "NPCs", "Locations", "Places", "Platser", "Factions", "Fraktioner", "Items", "Föremål", "Lore"]);
      const worldCampaignQuests = quests.filter((quest) => {
        const questEntry = game.journal.get(quest.id);
        return getTomeLinks(questEntry).world.includes(worldEntry.id) || textMentionsName(journalText(questEntry), worldEntry.name) || getTomeLinks(worldEntry).quests.includes(quest.id);
      });
      const worldCampaignActors = visibleActors.filter((actorViewItem) => {
        const actor = game.actors.get(actorViewItem.id);
        return getTomeLinks(actor).world.includes(worldEntry.id) || textMentionsName(actorProfileText(actor), worldEntry.name) || getTomeLinks(worldEntry).actors.includes(actorViewItem.id);
      });
      const linkedActor = resolveWorldActor(worldEntry, profile);
      const linkedActorVisible = Boolean(linkedActor && canViewInTome(linkedActor));
      const linkedActorInferred = Boolean(linkedActor && !profile.actorId);
      worldProfileView = {
        ...view,
        journalId: worldEntry.id,
        linkedActor: linkedActorVisible ? actorView(linkedActor) : null,
        hasLinkedActor: linkedActorVisible,
        linkedActorInferred,
        syncPageName: getWorldSyncPage(worldEntry, profile)?.name || "",
        syncedToJournal: Boolean(getWorldSyncPage(worldEntry, profile)),
        campaignSessions: worldCampaignSessions,
        campaignQuests: worldCampaignQuests,
        campaignActors: worldCampaignActors,
        firstSession: worldCampaignSessions[0] || null,
        lastSession: worldCampaignSessions.length ? worldCampaignSessions[worldCampaignSessions.length - 1] : null,
        hasCampaignLinks: Boolean(worldCampaignSessions.length || worldCampaignQuests.length || worldCampaignActors.length)
      };
      worldProfileEditor = {
        journalId: worldEntry.id,
        name: worldEntry.name,
        journalImg: worldEntry.img || "icons/svg/book.svg",
        category: profile.category,
        categories: Object.entries(WORLD_CATEGORIES).map(([id, meta]) => ({ id, label: meta.label, selected: id === profile.category })),
        subtitle: profile.subtitle,
        summary: profile.summary,
        body: profile.body,
        heroImage: profile.heroImage,
        actorId: profile.actorId || linkedActor?.id || "",
        actorOptions: game.actors.contents.slice().sort((a,b) => a.name.localeCompare(b.name, game.i18n.lang, {numeric:true})).map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === (profile.actorId || linkedActor?.id || "") })),
        syncedToJournal: Boolean(getWorldSyncPage(worldEntry, profile)),
        previewImage: profile.heroImage || worldEntry.img || "icons/svg/book.svg",
        facts: profile.facts.length ? profile.facts : [{ label: "", value: "" }]
      };
    }

    const worldGroups = Object.entries(WORLD_CATEGORIES).map(([id, meta]) => ({
      id,
      label: meta.label,
      icon: meta.icon,
      entries: world.filter((entry) => entry.category === id)
    })).filter((group) => group.entries.length);

    const sessionRows = sessions.map((session) => ({ ...session, selected: session.id === selectedSessionBase?.id, localSearchText: `${session.name} ${session.summary || ""} ${session.bodyPreview || ""}`.toLowerCase() }));
    let selectedSession = selectedSessionBase ? sessionDetailView(selectedSessionBase, quests, world, visibleActors) : null;

    const demo = getDemoSummary();

    const importState = {
      mode: this.importMode,
      text: this.importText,
      sourceName: this.importSourceName,
      error: this.importError,
      preview: this.importPreview,
      lastResult: this.importLastResult,
      modes: Object.entries(IMPORT_MODES).map(([id, label]) => ({ id, label, selected: id === this.importMode })),
      history: getImportHistoryView(),
      hasUndo: Boolean(getLastImportUndo()?.transactionId)
    };

    const favoriteRefs = getFavoriteRefs();
    const favoriteSet = new Set(favoriteRefs);
    const recentRefs = getRecentRefs();

    const searchEntry = (item, { refType, filterKey, category, icon, action, actor = false, meta = "", img = null }) => {
      const refKey = `${refType}:${item.id}`;
      const summary = truncate(item.summary || item.listSummary || item.displayRole || item.subtitle || "", 240);
      const searchText = [item.name, item.displayTitle, category, meta, summary, item.subtitle, item.statusLabel, item.displayRole]
        .filter(Boolean).join(" ").toLowerCase();
      return {
        ...item,
        refKey,
        filterKey,
        category,
        icon,
        action,
        actor,
        meta,
        img: img || item.img || null,
        summary,
        searchText,
        isFavorite: favoriteSet.has(refKey)
      };
    };

    const searchEntries = [
      ...sessions.map((item) => searchEntry(item, { refType: "session", filterKey: "session", category: "Session", icon: "fa-book-open", action: "selectSession", meta: item.sessionNumber != null ? `Session ${item.sessionNumber}` : "Chronicle" })),
      ...quests.map((item) => searchEntry(item, { refType: "quest", filterKey: "quest", category: "Quest", icon: "fa-diamond", action: "openQuestDetail", meta: item.statusLabel || "Quest" })),
      ...world.map((item) => searchEntry(item, { refType: "world", filterKey: item.category || "lore", category: item.categoryLabel || "World", icon: item.icon || "fa-earth-europe", action: "openWorldProfile", meta: item.subtitle || item.categoryLabel || "World" })),
      ...rules.map((item) => searchEntry(item, { refType: "rule", filterKey: "rule", category: "Rule", icon: "fa-scroll", action: "openRuleDetail", meta: "Reference" })),
      ...group.map((item) => searchEntry(item, { refType: "actor", filterKey: "character", category: "Character", icon: "fa-user", action: "openProfile", actor: true, meta: item.displayRole, img: item.img }))
    ];

    const searchFilterDefs = [
      ["all", "All", "fa-layer-group"],
      ["session", "Sessions", "fa-book-open"],
      ["quest", "Quests", "fa-diamond"],
      ["character", "Characters", "fa-user"],
      ["npc", "NPCs", "fa-user-group"],
      ["location", "Locations", "fa-location-dot"],
      ["faction", "Factions", "fa-flag"],
      ["item", "Items", "fa-gem"],
      ["lore", "Lore", "fa-book"],
      ["rule", "Rules", "fa-scroll"]
    ];
    const searchFilters = searchFilterDefs.map(([key, label, icon]) => ({
      key,
      label,
      icon,
      count: key === "all" ? searchEntries.length : searchEntries.filter((entry) => entry.filterKey === key).length,
      active: key === this.searchFilter
    })).filter((filter) => filter.key === "all" || filter.count > 0);

    const byRefKey = new Map(searchEntries.map((entry) => [entry.refKey, entry]));
    const favoriteEntries = favoriteRefs.map((ref) => byRefKey.get(ref)).filter(Boolean);
    const recentEntries = recentRefs.map((ref) => byRefKey.get(ref)).filter(Boolean).slice(0, 8);

    if (selectedSession) selectedSession = { ...selectedSession, refKey: `session:${selectedSession.id}`, isFavorite: favoriteSet.has(`session:${selectedSession.id}`) };
    if (questDetail) questDetail = { ...questDetail, refKey: `quest:${questDetail.id}`, isFavorite: favoriteSet.has(`quest:${questDetail.id}`) };
    if (profileView) profileView = { ...profileView, refKey: `actor:${profileView.id}`, isFavorite: favoriteSet.has(`actor:${profileView.id}`) };
    if (worldProfileView) worldProfileView = { ...worldProfileView, refKey: `world:${worldProfileView.id}`, isFavorite: favoriteSet.has(`world:${worldProfileView.id}`) };

    const groupHomeLimit = clamp(Number(settings.groupHomeLimit || 3), 1, 8);
    const homeGroup = group.slice(0, groupHomeLimit);
    const homeBlocks = (settings.homeModeMinimal ? [] : settings.homeLayout)
      .filter((item) => item.visible !== false)
      .filter((item) => item.id !== "gmTools" || game.user.isGM)
      .map((item) => ({
        ...item,
        sizeClass: `at-home-widget-${HOME_WIDGET_SIZES[item.size] ? item.size : "normal"}`,
        isLatestSession: item.id === "latestSession",
        isActiveQuests: item.id === "activeQuests",
        isGroup: item.id === "group",
        isRecentWorld: item.id === "recentWorld",
        isCampaignSnapshot: item.id === "campaignSnapshot",
        isFavorites: item.id === "favorites",
        isGmTools: item.id === "gmTools"
      }));
    settings.homeCardsVisible = homeBlocks.length > 0;
    const homeSidebarVisible = !settings.homeModeMinimal && Boolean(settings.homeSidebarCampaign || settings.homeSidebarQuickLinks || game.user.isGM);

    const revealQueue = game.user.isGM ? buildRevealQueueView() : { queued: [], recent: [], queuedCount: 0, recentCount: 0 };
    const gmDashboard = game.user.isGM ? buildNextSessionDashboard(sessions, quests, world, group) : null;
    const postSession = game.user.isGM ? buildPostSessionAssistant(sessions, quests) : null;
    const quickCaptureCurrent = (() => {
      if (!game.user.isGM || !this._quickCaptureSourceRef) return null;
      const meta = tomeRefMeta(this._quickCaptureSourceRef);
      return meta ? { ...meta, targetValue: this._quickCaptureSourceRef } : null;
    })();
    const quickCapture = game.user.isGM ? {
      nextSession: buildGmNotebookRows().nextSession,
      current: quickCaptureCurrent,
      typeOptions: Object.entries(GM_NOTE_TYPES).map(([id, meta]) => ({ id, ...meta, selected: id === "reminder" }))
    } : null;

    const accessRows = game.user.isGM ? [
      ...sessions.map((item) => ({ documentType: "journal", id: item.id, name: item.name, category: "Session", icon: "fa-book-open", access: accessView(game.journal.get(item.id)) })),
      ...quests.map((item) => ({ documentType: "journal", id: item.id, name: item.name, category: "Quest", icon: "fa-diamond", access: accessView(game.journal.get(item.id)) })),
      ...world.map((item) => ({ documentType: "journal", id: item.id, name: item.name, category: item.categoryLabel || "World", icon: item.icon || "fa-earth-europe", access: accessView(game.journal.get(item.id)) })),
      ...rules.map((item) => ({ documentType: "journal", id: item.id, name: item.name, category: "Rule", icon: "fa-scroll", access: accessView(game.journal.get(item.id)) })),
      ...group.map((item) => ({ documentType: "actor", id: item.id, name: item.name, category: "Character", icon: "fa-user", access: accessView(game.actors.get(item.id)) }))
    ].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, game.i18n.lang, { numeric: true })) : [];
    settings.accessRows = accessRows;
    settings.healthReport = this._healthReport;
    settings.gmNotebook = game.user.isGM ? buildGmNotebookRows() : { rows: [], nextSession: 1, stats: {} };

    let accessEditor = null;
    if (game.user.isGM && this.activeTab === "access" && this.activeAccessType && this.activeAccessId) {
      const document = this.activeAccessType === "actor" ? game.actors.get(this.activeAccessId) : game.journal.get(this.activeAccessId);
      if (document) {
        const access = accessView(document);
        const inferred = this.activeAccessType === "actor" ? "Character" : (inferJournalRefKey(document).split(":")[0] || "Journal");
        accessEditor = {
          id: document.id,
          documentType: this.activeAccessType,
          name: document.name,
          kind: inferred ? inferred[0].toUpperCase() + inferred.slice(1) : "Document",
          ...access,
          foundryOwnershipOptions: [
            [CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0, "None"],
            [CONST.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1, "Limited"],
            [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2, "Observer"],
            [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3, "Owner"]
          ].map(([value,label]) => ({ value, label, selected: Number(document.ownership?.default ?? 0) === Number(value) }))
        };
      } else {
        this.activeTab = "settings";
        this.activeAccessType = null;
        this.activeAccessId = null;
      }
    }

    return foundry.utils.mergeObject(context, {
      activeTab: this.activeTab,
      isHome: this.activeTab === "home",
      isSessions: this.activeTab === "sessions",
      isQuests: this.activeTab === "quests",
      isQuestNavActive: this.activeTab === "quests" || this.activeTab === "questDetail",
      isQuestDetail: this.activeTab === "questDetail" && Boolean(questDetail),
      isGroup: this.activeTab === "group",
      isGroupNavActive: this.activeTab === "group" || this.activeTab === "profile",
      isWorld: this.activeTab === "world",
      isWorldNavActive: this.activeTab === "world" || this.activeTab === "worldProfile",
      isWorldProfile: this.activeTab === "worldProfile" && Boolean(worldProfileView),
      isWorldProfileEditing: this.activeTab === "worldProfile" && Boolean(worldProfileView) && this.worldEditing && game.user.isGM,
      isRules: this.activeTab === "rules",
      isRulesNavActive: this.activeTab === "rules" || this.activeTab === "ruleDetail",
      isRuleDetail: this.activeTab === "ruleDetail" && Boolean(ruleDetail),
      isSearch: this.activeTab === "search",
      isManual: this.activeTab === "manual",
      manual: buildManualView(),
      isImport: this.activeTab === "import" && game.user.isGM,
      isExport: this.activeTab === "export" && game.user.isGM,
      isGmDashboard: this.activeTab === "gmDashboard" && game.user.isGM,
      isQuickCapture: this.activeTab === "quickCapture" && game.user.isGM,
      isRevealQueue: this.activeTab === "revealQueue" && game.user.isGM,
      isPostSession: this.activeTab === "postSession" && game.user.isGM,
      isSettings: this.activeTab === "settings",
      isAccess: this.activeTab === "access" && Boolean(accessEditor) && game.user.isGM,
      accessEditor,
      isProfile: this.activeTab === "profile" && Boolean(profileView),
      isProfileEditing: this.activeTab === "profile" && Boolean(profileView) && this.profileEditing && game.user.isGM,
      isGM: game.user.isGM,
      settings,
      profileView,
      profileEditor,
      worldProfileView,
      worldProfileEditor,
      worldGroups,
      sessions: sessionRows,
      selectedSession,
      questDetail,
      quests,
      activeQuests,
      questGroups: questGroups.map((group) => ({ ...group, entries: group.entries.map((entry) => ({ ...entry, localSearchText: `${entry.name} ${entry.summary || ""} ${entry.statusLabel || ""}`.toLowerCase() })) })),
      homeQuests: activeQuests.slice(0, 3),
      latestSession,
      world,
      homeWorld: world.slice(0, 3),
      homeBlocks,
      homeSidebarVisible,
      rules,
      ruleLinkCandidates,
      ruleDetail,
      group,
      homeGroup,
      actorOptions,
      searchEntries,
      searchState: {
        query: this.searchQuery,
        filter: this.searchFilter,
        filters: searchFilters,
        favorites: favoriteEntries,
        recent: recentEntries,
        hasFavorites: favoriteEntries.length > 0,
        hasRecent: recentEntries.length > 0,
        total: searchEntries.length
      },
      canGoBack: this._navigationHistory.length > 0,
      demo,
      importState,
      gmDashboard,
      quickCapture,
      revealQueue,
      postSession,
      exportState: game.user.isGM ? {
        portable: { sessions: sessions.length, quests: quests.length, world: world.length },
        playerSafe: {
          sessions: game.journal.contents.filter((entry) => inferJournalRefKey(entry).startsWith("session:") && isPlayerSafeExportDocument(entry)).length,
          quests: game.journal.contents.filter((entry) => inferJournalRefKey(entry).startsWith("quest:") && isPlayerSafeExportDocument(entry)).length,
          world: game.journal.contents.filter((entry) => inferJournalRefKey(entry).startsWith("world:") && isPlayerSafeExportDocument(entry)).length
        },
        backup: { actors: game.actors.contents.filter((actor) => actor.flags?.[MODULE_ID]).length, journals: game.journal.contents.filter((entry) => entry.flags?.[MODULE_ID] || inferJournalRefKey(entry)).length }
      } : null,
      stats: {
        activeQuests: activeQuests.length,
        group: group.length,
        world: world.length,
        sessions: sessions.length
      }
    }, { inplace: false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this._applyThemeBackground(context?.settings);
    this._installWindowChromeControls();
    this._attachResponsiveObserver();
    this._attachImageFallbacks();

    if (this._searchShortcutHandler) window.removeEventListener("keydown", this._searchShortcutHandler);
    this._searchShortcutHandler = async (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!getNavConfig().search) return;
      const active = document.activeElement;
      if (active?.matches?.("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (this.activeTab !== "search") {
        this._pushNavigationState();
        this.activeTab = "search";
        await this.render({ parts: ["main"] });
      }
      this.element?.querySelector("[data-at-search]")?.focus?.();
    };
    window.addEventListener("keydown", this._searchShortcutHandler);

    const settingsForm = this.element?.querySelector(".at-settings-form");
    settingsForm?.addEventListener("submit", (event) => event.preventDefault());
    if (settingsForm) {
      const setSettingsSection = (sectionId) => {
        this.settingsSection = String(sectionId || "campaign");
        for (const button of settingsForm.querySelectorAll("[data-at-settings-section]")) {
          button.classList.toggle("active", button.dataset.atSettingsSection === this.settingsSection);
        }
        for (const panel of settingsForm.querySelectorAll("[data-at-settings-panel]")) {
          panel.hidden = panel.dataset.atSettingsPanel !== this.settingsSection;
        }
      };
      for (const button of settingsForm.querySelectorAll("[data-at-settings-section]")) {
        button.addEventListener("click", () => setSettingsSection(button.dataset.atSettingsSection));
      }
      setSettingsSection(this.settingsSection);

      const refreshHomeBuilderPreview = () => {
        const preview = settingsForm.querySelector("[data-at-home-builder-preview]");
        if (!preview) return;
        const mode = String(settingsForm.querySelector('[name="homeMode"]')?.value || "dashboard");
        const hero = String(settingsForm.querySelector('[name="homeHeroLayout"]')?.value || "classic");
        const height = String(settingsForm.querySelector('[name="homeHeroHeight"]')?.value || "standard");
        preview.dataset.mode = mode;
        preview.dataset.hero = hero;
        preview.dataset.height = height;
        const tiles = preview.querySelector("[data-at-home-builder-tiles]");
        if (tiles) {
          tiles.innerHTML = "";
          for (const row of settingsForm.querySelectorAll("[data-at-home-config-row]")) {
            if (!row.querySelector('input[type="checkbox"]')?.checked || mode === "minimal") continue;
            const tile = document.createElement("span");
            tile.dataset.size = row.querySelector('select[data-at-home-widget-size]')?.value || "normal";
            tile.textContent = row.querySelector("strong")?.textContent || row.dataset.homeBlockId || "Widget";
            tiles.appendChild(tile);
          }
        }
      };
      settingsForm.addEventListener("click", (event) => {
        const preset = event.target.closest("[data-at-home-preset]");
        if (preset) {
          event.preventDefault();
          const mode = preset.dataset.atHomePreset || "dashboard";
          const modeInput = settingsForm.querySelector('[name="homeMode"]');
          if (modeInput) modeInput.value = mode;
          const setSelect = (name, value) => { const input = settingsForm.querySelector(`[name="${name}"]`); if (input) input.value = value; };
          const setCheck = (name, value) => { const input = settingsForm.querySelector(`[name="${name}"]`); if (input) input.checked = value; };
          if (mode === "dashboard") {
            setSelect("homeHeroLayout", "classic"); setSelect("homeHeroHeight", "standard"); setSelect("homeHeroShade", "balanced");
            setCheck("homeAtGlance", true); setCheck("homeSidebarCampaign", true); setCheck("homeSidebarQuickLinks", true); setCheck("homeShowEnterButton", false);
            for (const row of settingsForm.querySelectorAll("[data-at-home-config-row]")) {
              const id = row.dataset.homeBlockId; const checkbox = row.querySelector('input[type="checkbox"]');
              if (checkbox) checkbox.checked = ["latestSession","activeQuests","group","recentWorld"].includes(id);
            }
          } else if (mode === "minimal") {
            setSelect("homeHeroLayout", "centered"); setSelect("homeHeroHeight", "full"); setSelect("homeHeroShade", "soft");
            setCheck("homeAtGlance", false); setCheck("homeSidebarCampaign", false); setCheck("homeSidebarQuickLinks", false); setCheck("homeShowEnterButton", true);
          } else {
            setSelect("homeHeroLayout", "immersive"); setSelect("homeHeroHeight", "tall"); setSelect("homeHeroShade", "balanced");
            setCheck("homeShowEnterButton", true);
          }
          refreshHomeBuilderPreview();
          return;
        }
        const move = event.target.closest("[data-at-move-setting-row]");
        if (!move) return;
        const row = move.closest("[data-at-config-row]");
        if (!row?.parentElement) return;
        const direction = move.dataset.atMoveSettingRow;
        if (direction === "up" && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
        if (direction === "down" && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
        refreshHomeBuilderPreview();
      });
      settingsForm.addEventListener("change", (event) => { if (event.target.closest('[data-at-settings-panel="home"]')) refreshHomeBuilderPreview(); });
      refreshHomeBuilderPreview();
    }

    const notebookBuilder = this.element?.querySelector("[data-at-notebook-builder]");
    if (notebookBuilder) {
      if (this._notebookEditing) {
        notebookBuilder.hidden = false;
        const toggle = this.element?.querySelector('[data-action="toggleNotebookBuilder"]');
        toggle?.classList.add("active");
        const label = toggle?.querySelector("span");
        if (label) label.textContent = "Finish Layout";
      }
      const list = notebookBuilder.querySelector(".at-notebook-layout-list");
      const markCustom = () => {
        const select = notebookBuilder.querySelector('[name="notebookPreset"]');
        if (select) select.value = "custom";
      };
      const persistBuilderLayout = async ({ rerender = true } = {}) => {
        const rows = [...notebookBuilder.querySelectorAll("[data-at-notebook-layout-row]")];
        if (!rows.length) return;
        const layout = rows.map((row) => {
          const id = String(row.dataset.notebookWidgetId || "");
          const visible = row.querySelector('input[type="checkbox"]')?.checked !== false;
          const rawSize = String(row.querySelector('select[name="notebookWidgetSize"]')?.value || "full");
          const size = NOTEBOOK_WIDGET_SIZES[rawSize] ? rawSize : "full";
          return { id, visible, size };
        }).filter((row) => row.id);
        await setGmWorkspace({ layout, preset: "custom" });
        markCustom();
        if (rerender) await this.render({ parts: ["main"] });
      };
      notebookBuilder.addEventListener("click", async (event) => {
        const move = event.target.closest("[data-at-notebook-move]");
        if (!move) return;
        event.preventDefault();
        const row = move.closest("[data-at-notebook-layout-row]");
        if (!row?.parentElement) return;
        const direction = String(move.dataset.atNotebookMove || "");
        if (direction === "up" && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
        if (direction === "down" && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
        await persistBuilderLayout();
      });
      notebookBuilder.addEventListener("change", async (event) => {
        if (!event.target.closest("[data-at-notebook-layout-row]")) return;
        await persistBuilderLayout();
      });
      if (list) {
        let dragged = null;
        list.addEventListener("dragstart", (event) => {
          const handle = event.target.closest(".at-layout-drag-handle");
          const row = handle?.closest("[data-at-notebook-layout-row]");
          if (!row) return;
          dragged = row;
          row.classList.add("is-dragging");
          event.dataTransfer?.setData("text/plain", row.dataset.notebookWidgetId || "");
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });
        list.addEventListener("dragover", (event) => {
          if (!dragged) return;
          event.preventDefault();
          const target = event.target.closest("[data-at-notebook-layout-row]");
          if (!target || target === dragged) return;
          const rect = target.getBoundingClientRect();
          const before = event.clientY < rect.top + rect.height / 2;
          target.parentElement.insertBefore(dragged, before ? target : target.nextElementSibling);
        });
        list.addEventListener("drop", async (event) => {
          if (!dragged) return;
          event.preventDefault();
          await persistBuilderLayout();
        });
        list.addEventListener("dragend", () => {
          dragged?.classList.remove("is-dragging");
          dragged = null;
        });
      }
    }

    const notebookWorkspace = this.element?.querySelector("[data-at-notebook-workspace]");
    if (notebookWorkspace) {
      notebookWorkspace.classList.toggle("is-editing", this._notebookEditing === true);

      // Pointer-based drag avoids Foundry/ApplicationV2 HTML5-drag conflicts.
      let dragState = null;
      const finishPointerDrag = async (event) => {
        if (!dragState) return;
        const state = dragState;
        dragState = null;
        state.widget.classList.remove("is-dragging");
        try { state.handle.releasePointerCapture?.(event.pointerId); } catch (_err) {}
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", finishPointerDrag, true);
        window.removeEventListener("pointercancel", finishPointerDrag, true);
        if (!state.changed) return;
        const current = getGmWorkspace();
        const order = [...notebookWorkspace.querySelectorAll(":scope > [data-notebook-widget-id]")].map((row) => String(row.dataset.notebookWidgetId || "")).filter(Boolean);
        const byId = new Map(current.layout.map((row) => [row.id, row]));
        const visible = order.map((id) => byId.get(id)).filter(Boolean);
        const hidden = current.layout.filter((row) => !order.includes(row.id));
        await setGmWorkspace({ layout: [...visible, ...hidden], preset: "custom" });
        this._notebookEditing = true;
        await this.render({ parts: ["main"] });
      };
      const onPointerMove = (event) => {
        if (!dragState) return;
        event.preventDefault();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-notebook-widget-id]");
        if (!target || target === dragState.widget || target.parentElement !== notebookWorkspace) return;
        const rect = target.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2 || (Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * .25 && event.clientX < rect.left + rect.width / 2);
        notebookWorkspace.insertBefore(dragState.widget, before ? target : target.nextElementSibling);
        dragState.changed = true;
      };
      notebookWorkspace.addEventListener("pointerdown", (event) => {
        if (!notebookWorkspace.classList.contains("is-editing")) return;
        const handle = event.target.closest(".at-live-drag-handle");
        const widget = handle?.closest("[data-notebook-widget-id]");
        if (!handle || !widget) return;
        event.preventDefault();
        dragState = { widget, handle, changed: false };
        widget.classList.add("is-dragging");
        try { handle.setPointerCapture?.(event.pointerId); } catch (_err) {}
        window.addEventListener("pointermove", onPointerMove, true);
        window.addEventListener("pointerup", finishPointerDrag, true);
        window.addEventListener("pointercancel", finishPointerDrag, true);
      });
    }

    const customPadGrid = this.element?.querySelector("[data-at-custom-pad-grid]");
    if (customPadGrid) {
      let dragPad = null;
      const finishPadDrag = async (event) => {
        if (!dragPad) return;
        const state = dragPad;
        dragPad = null;
        state.card.classList.remove("is-dragging");
        try { state.handle.releasePointerCapture?.(event.pointerId); } catch (_err) {}
        window.removeEventListener("pointermove", onPadMove, true);
        window.removeEventListener("pointerup", finishPadDrag, true);
        window.removeEventListener("pointercancel", finishPadDrag, true);
        if (!state.changed) return;
        const current = getGmWorkspace();
        const byId = new Map(current.pads.map((pad) => [pad.id, pad]));
        const ordered = [...customPadGrid.querySelectorAll("[data-at-notebook-pad]")].map((card) => byId.get(String(card.dataset.atNotebookPad || ""))).filter(Boolean);
        await setGmWorkspace({ pads: ordered });
        this._notebookEditing = true;
        await this.render({ parts: ["main"] });
      };
      const onPadMove = (event) => {
        if (!dragPad) return;
        event.preventDefault();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-at-notebook-pad]");
        if (!target || target === dragPad.card || target.parentElement !== customPadGrid) return;
        const rect = target.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2 || event.clientX < rect.left + rect.width / 2;
        customPadGrid.insertBefore(dragPad.card, before ? target : target.nextElementSibling);
        dragPad.changed = true;
      };
      customPadGrid.addEventListener("pointerdown", (event) => {
        if (!this._notebookEditing) return;
        const handle = event.target.closest(".at-custom-pad-drag-handle");
        const card = handle?.closest("[data-at-notebook-pad]");
        if (!handle || !card) return;
        event.preventDefault();
        dragPad = { card, handle, changed: false };
        card.classList.add("is-dragging");
        try { handle.setPointerCapture?.(event.pointerId); } catch (_err) {}
        window.addEventListener("pointermove", onPadMove, true);
        window.addEventListener("pointerup", finishPadDrag, true);
        window.addEventListener("pointercancel", finishPadDrag, true);
      });
    }

    const noteSearch = this.element?.querySelector("[data-at-note-search]");
    if (noteSearch) {
      let noteFilter = "all";
      const applyNoteFilter = () => {
        const needle = String(noteSearch.value || "").trim().toLowerCase();
        let visible = 0;
        for (const row of this.element.querySelectorAll("[data-at-note-row-view]")) {
          const text = String(row.dataset.noteSearch || "").toLowerCase();
          const matchesText = !needle || text.includes(needle);
          const matchesFilter = noteFilter === "all"
            || (noteFilter === "pinned" && row.dataset.notePinned === "true")
            || (noteFilter === "due" && row.dataset.noteDue === "true")
            || (noteFilter === "resolved" && row.dataset.noteStatus === "resolved")
            || row.dataset.noteType === noteFilter;
          row.hidden = !(matchesText && matchesFilter);
          if (!row.hidden) visible += 1;
        }
        const empty = this.element.querySelector("[data-at-note-empty]");
        if (empty) empty.hidden = visible > 0;
        for (const button of this.element.querySelectorAll("[data-at-note-filter]")) button.classList.toggle("active", button.dataset.atNoteFilter === noteFilter);
      };
      noteSearch.addEventListener("input", applyNoteFilter);
      for (const button of this.element.querySelectorAll("[data-at-note-filter]")) button.addEventListener("click", () => { noteFilter = button.dataset.atNoteFilter || "all"; applyNoteFilter(); });
      applyNoteFilter();
    }

    const manualSearch = this.element?.querySelector("[data-at-manual-search]");
    if (manualSearch) {
      const applyManualSearch = () => {
        const needle = String(manualSearch.value || "").trim().toLowerCase();
        let visible = 0;
        for (const card of this.element.querySelectorAll("[data-at-manual-section]")) {
          const haystack = String(card.dataset.manualSearch || "").toLowerCase();
          card.hidden = Boolean(needle) && !haystack.includes(needle);
          if (!card.hidden) visible += 1;
        }
        const empty = this.element.querySelector("[data-at-manual-empty]");
        if (empty) empty.hidden = visible > 0;
        const count = this.element.querySelector("[data-at-manual-count]");
        if (count) count.textContent = `${visible} section${visible === 1 ? "" : "s"}`;
      };
      manualSearch.addEventListener("input", applyManualSearch);
      applyManualSearch();
    }

    const importForm = this.element?.querySelector(".at-import-form");
    if (importForm) {
      importForm.addEventListener("submit", (event) => event.preventDefault());
      const fileInput = importForm.querySelector("[data-at-import-file]");
      fileInput?.addEventListener("change", async (event) => {
        const file = event.currentTarget.files?.[0];
        if (file) await this._loadImportFile(file);
      });
      const dropZone = importForm.querySelector("[data-at-import-drop]");
      dropZone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
      dropZone?.addEventListener("drop", async (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file) await this._loadImportFile(file);
      });
    }

    const searchInput = this.element?.querySelector("[data-at-search]");
    if (searchInput) {
      const applySearchState = () => {
        const needle = String(this.searchQuery || "").trim().toLowerCase();
        const filter = this.searchFilter || "all";
        let visible = 0;
        for (const row of this.element.querySelectorAll("[data-at-search-row]")) {
          const haystack = String(row.dataset.searchText || "").toLowerCase();
          const category = row.dataset.searchCategory || "";
          const matchesText = !needle || haystack.includes(needle);
          const matchesFilter = filter === "all" || category === filter;
          row.hidden = !(matchesText && matchesFilter);
          if (!row.hidden) visible += 1;
        }
        for (const button of this.element.querySelectorAll("[data-at-search-filter]")) {
          button.classList.toggle("active", button.dataset.atSearchFilter === filter);
        }
        const counter = this.element.querySelector("[data-at-search-count]");
        if (counter) counter.textContent = `${visible} result${visible === 1 ? "" : "s"}`;
        const empty = this.element.querySelector("[data-at-search-empty]");
        if (empty) empty.hidden = visible > 0;
        this.element.querySelector(".at-search-page")?.classList.toggle("is-searching", Boolean(needle));
      };

      searchInput.addEventListener("input", (event) => {
        this.searchQuery = event.currentTarget.value;
        applySearchState();
      });
      for (const button of this.element.querySelectorAll("[data-at-search-filter]")) {
        button.addEventListener("click", () => {
          this.searchFilter = button.dataset.atSearchFilter || "all";
          applySearchState();
        });
      }
      applySearchState();
    }

    for (const input of this.element?.querySelectorAll?.("[data-at-local-search]") || []) {
      const scope = input.dataset.atLocalSearch || "default";
      const apply = () => {
        const needle = String(input.value || "").trim().toLowerCase();
        let visible = 0;
        for (const row of this.element.querySelectorAll(`[data-at-local-search-row="${scope}"]`)) {
          const haystack = String(row.dataset.localSearchText || row.textContent || "").toLowerCase();
          row.hidden = Boolean(needle && !haystack.includes(needle));
          if (!row.hidden) visible += 1;
        }
        const empty = this.element.querySelector(`[data-at-local-search-empty="${scope}"]`);
        if (empty) empty.hidden = visible > 0;
      };
      input.addEventListener("input", apply);
      apply();
    }

    const selectionButton = this.element?.querySelector("[data-at-selection-share]");
    if (selectionButton) {
      const updateSelection = () => {
        const selection = globalThis.getSelection?.();
        const text = String(selection?.toString?.() || "").trim();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        let common = range?.commonAncestorContainer || selection?.anchorNode || null;
        if (common?.nodeType === Node.TEXT_NODE) common = common.parentElement;
        const shareable = common?.closest?.(".at-shareable-text");
        const inside = Boolean(text && shareable && this.element?.contains?.(shareable));
        const now = globalThis.performance?.now?.() ?? Date.now();
        const shareLockActive = Number(this._selectionShareLockUntil || 0) > now;
        if (!inside) {
          // Clicking a share control collapses the browser selection before the
          // ApplicationV2 click action fires. Keep the captured text alive for a
          // short grace period so Public/Whisper can still consume it.
          if (shareLockActive && this._selectedShareText) {
            selectionButton.hidden = false;
            return;
          }
          this._selectedShareText = "";
          selectionButton.hidden = true;
          return;
        }
        this._selectedShareText = text.slice(0, 4000);
        selectionButton.hidden = false;
        if (!range) return;

        // Keep the action next to the user's selection rather than hiding it at
        // the bottom of a tall Tome page. Clamp to the viewport so it remains usable.
        const rect = range.getBoundingClientRect?.();
        if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.bottom)) {
          const buttonWidth = selectionButton.offsetWidth || 170;
          const buttonHeight = selectionButton.offsetHeight || 34;
          const left = Math.max(10, Math.min(window.innerWidth - buttonWidth - 10, rect.left + (rect.width / 2) - (buttonWidth / 2)));
          const top = Math.max(10, Math.min(window.innerHeight - buttonHeight - 10, rect.bottom + 8));
          selectionButton.style.left = `${left}px`;
          selectionButton.style.top = `${top}px`;
        }
      };

      // Preserve the captured selection when any Send-to-Chat control is pressed.
      // Foundry/system UI can collapse the native selection between pointerdown and click.
      // We therefore capture the text on pointerdown AND bind a direct click handler.
      // The direct handler intentionally bypasses ApplicationV2 data-action delegation for
      // these floating controls; some Foundry 13 layouts render/focus the contextual popup
      // in a way that prevents delegated actions from firing reliably.
      for (const shareControl of this.element.querySelectorAll('[data-action="sendSelectionToChat"], [data-action="whisperSelectionToChat"]')) {
        const captureSelection = () => {
          const current = globalThis.getSelection?.();
          const currentText = String(current?.toString?.() || "").trim();
          const range = current?.rangeCount ? current.getRangeAt(0) : null;
          let common = range?.commonAncestorContainer || current?.anchorNode || null;
          if (common?.nodeType === Node.TEXT_NODE) common = common.parentElement;
          const shareable = common?.closest?.(".at-shareable-text");
          if (currentText && shareable && this.element?.contains?.(shareable)) {
            this._selectedShareText = currentText.slice(0, 4000);
          }
          const now = globalThis.performance?.now?.() ?? Date.now();
          this._selectionShareLockUntil = now + 1800;
        };

        shareControl.addEventListener("pointerdown", captureSelection, { capture: true });
        shareControl.addEventListener("mousedown", captureSelection, { capture: true });

        shareControl.addEventListener("click", async (event) => {
          // Prevent a second invocation from ApplicationV2's delegated data-action handler.
          event.preventDefault();
          event.stopImmediatePropagation();
          captureSelection();
          try {
            if (shareControl.dataset.action === "whisperSelectionToChat") {
              await AdventurersTomeApp._onWhisperSelectionToChat.call(this, event, shareControl);
            } else {
              await AdventurersTomeApp._onSendSelectionToChat.call(this, event, shareControl);
            }
          } catch (error) {
            console.error("Adventurer's Tome | Selected-text share failed", error);
            ui.notifications.error("Adventurer's Tome: Could not send the selected text. Check the console for details.");
          }
        }, { capture: true });
      }
      this.element.addEventListener("pointerup", () => setTimeout(updateSelection, 0));
      this.element.addEventListener("keyup", () => setTimeout(updateSelection, 0));
      if (this._selectionChangeHandler) document.removeEventListener("selectionchange", this._selectionChangeHandler);
      this._selectionChangeHandler = () => setTimeout(updateSelection, 0);
      document.addEventListener("selectionchange", this._selectionChangeHandler);
    }

    const profileForm = this.element?.querySelector(".at-profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", (event) => event.preventDefault());
      profileForm.querySelector("[data-at-add-fact]")?.addEventListener("click", () => this._appendFactRow());
      profileForm.querySelector("[data-at-add-relation]")?.addEventListener("click", () => this._appendRelationRow());
      profileForm.querySelector("[data-at-add-custom-link]")?.addEventListener("click", () => this._appendCustomLinkRow());
      profileForm.addEventListener("click", (event) => {
        const remove = event.target.closest?.("[data-at-remove-row]");
        if (remove) {
          remove.closest(".at-edit-row")?.remove();
          return;
        }
        const move = event.target.closest?.("[data-at-move-row]");
        if (move) this._moveEditorRow(move.closest(".at-edit-row"), move.dataset.atMoveRow);
      });

      const heroInput = profileForm.querySelector('input[name="profileHeroImage"]');
      const preview = profileForm.querySelector("[data-at-profile-preview]");
      heroInput?.addEventListener("input", () => {
        if (!preview) return;
        const value = heroInput.value.trim();
        preview.src = resolveFoundryAssetUrl(value || preview.dataset.fallback || "icons/svg/mystery-man.svg");
      });
    }

    const worldForm = this.element?.querySelector(".at-world-profile-form");
    if (worldForm) {
      worldForm.addEventListener("submit", (event) => event.preventDefault());
      worldForm.querySelector("[data-at-add-world-fact]")?.addEventListener("click", () => this._appendWorldFactRow());
      worldForm.addEventListener("click", (event) => {
        const remove = event.target.closest?.("[data-at-remove-row]");
        if (remove) {
          remove.closest(".at-edit-row")?.remove();
          return;
        }
        const move = event.target.closest?.("[data-at-move-row]");
        if (move) this._moveEditorRow(move.closest(".at-edit-row"), move.dataset.atMoveRow);
      });
      const imageInput = worldForm.querySelector('input[name="worldHeroImage"]');
      const preview = worldForm.querySelector("[data-at-world-preview]");
      imageInput?.addEventListener("input", () => {
        if (!preview) return;
        const value = imageInput.value.trim();
        preview.src = resolveFoundryAssetUrl(value || preview.dataset.fallback || "icons/svg/book.svg");
      });
    }
  }

  _attachImageFallbacks() {
    for (const img of this.element?.querySelectorAll?.("img") || []) {
      if (img.dataset.atImageGuard === "1") continue;
      img.dataset.atImageGuard = "1";
      img.addEventListener("error", () => {
        if (img.dataset.atFallbackApplied === "1") {
          img.hidden = true;
          img.closest?.(".at-world-card-art, .at-search-shelf-icon, .at-search-result-icon, .at-profile-art, .at-world-profile-art")?.classList.add("at-image-missing");
          return;
        }
        img.dataset.atFallbackApplied = "1";
        const brand = img.closest?.(".at-brand-logo");
        if (brand) {
          brand.className = "at-brand-icon";
          brand.innerHTML = '<i class="fa-solid fa-book-open"></i>';
          return;
        }
        const explicit = String(img.dataset.fallback || "").trim();
        const actorLike = Boolean(img.closest?.(".at-home-group, .at-character-image, .at-character-grid, .at-actor-option, .at-relation-card"));
        const fallback = explicit || (actorLike ? FALLBACK_ACTOR_IMAGE : FALLBACK_GENERIC_IMAGE);
        const current = String(img.getAttribute("src") || "");
        const fallbackUrl = resolveFoundryAssetUrl(fallback);
        if (current === fallbackUrl || current.endsWith(fallback)) { img.hidden = true; return; }
        img.src = fallbackUrl;
        img.classList.add("at-image-fallback");
      }, { once: false });
    }
  }

  async _loadImportFile(file) {
    if (!file || !game.user.isGM) return;
    const allowed = /(?:\.md|\.markdown|\.txt|\.json)$/i.test(file.name || "") || /(?:json|text|markdown)/i.test(file.type || "");
    if (Number(file.size || 0) > MAX_IMPORT_FILE_BYTES) {
      ui.notifications.warn(`Adventurer\'s Tome: Import files are limited to ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    if (!allowed) {
      ui.notifications.warn("Adventurer's Tome: Importer supports Markdown, text, and JSON files.");
      return;
    }
    try {
      this.importText = await file.text();
      this.importSourceName = file.name || "Imported file";
      this.importError = "";
      this.importPreview = null;
      this.importLastResult = null;
      if (this.importMode === "auto") this.importMode = detectImportMode(this.importText, this.importSourceName);
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error("Adventurer's Tome | Could not read import file", error);
      ui.notifications.error(`Adventurer's Tome could not read the selected file: ${error.message}`);
    }
  }

  _moveEditorRow(row, direction) {
    if (!row?.parentElement) return;
    if (direction === "up" && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    if (direction === "down" && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
  }

  _rowControls(label = "entry") {
    return `<span class="at-row-order"><button type="button" data-at-move-row="up" title="Move ${label} up"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-at-move-row="down" title="Move ${label} down"><i class="fa-solid fa-chevron-down"></i></button></span>`;
  }

  _appendWorldFactRow() {
    const list = this.element?.querySelector("[data-at-world-facts-editor]");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "at-edit-row at-fact-edit-row";
    row.innerHTML = `${this._rowControls("fact")}<input type="text" name="worldFactLabel" placeholder="Label"><input type="text" name="worldFactValue" placeholder="Value"><select name="worldFactVisibility" title="Visibility"><option value="players">Players</option><option value="gm">GM only</option></select><button type="button" class="at-row-remove" data-at-remove-row title="Remove fact"><i class="fa-solid fa-xmark"></i></button>`;
    list.appendChild(row);
    row.querySelector("input")?.focus();
  }

  _appendFactRow() {
    const list = this.element?.querySelector("[data-at-facts-editor]");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "at-edit-row at-fact-edit-row";
    row.innerHTML = `${this._rowControls("fact")}
      <input type="text" name="factLabel" placeholder="Label">
      <input type="text" name="factValue" placeholder="Value">
      <select name="factVisibility" title="Visibility"><option value="players">Players</option><option value="gm">GM only</option></select>
      <button type="button" class="at-row-remove" data-at-remove-row title="Remove fact"><i class="fa-solid fa-xmark"></i></button>`;
    list.appendChild(row);
    row.querySelector("input")?.focus();
  }

  _appendCustomLinkRow() {
    const list = this.element?.querySelector("[data-at-custom-links-editor]");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "at-edit-row at-custom-link-edit-row";
    row.innerHTML = `${this._rowControls("link")}<input type="text" name="customLinkLabel" placeholder="Button label"><input type="text" name="customLinkIcon" value="fa-link" placeholder="Font Awesome icon"><input type="text" name="customLinkTarget" placeholder="Foundry UUID or https://…"><button type="button" class="at-row-remove" data-at-remove-row title="Remove link"><i class="fa-solid fa-xmark"></i></button>`;
    list.appendChild(row);
    row.querySelector("input")?.focus();
  }

  _appendRelationRow() {
    const list = this.element?.querySelector("[data-at-relations-editor]");
    if (!list) return;
    const activeActorId = this.activeActorId;
    const candidates = game.actors.contents
      .filter((actor) => canViewInTome(actor) && actor.id !== activeActorId)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true }));

    const row = document.createElement("div");
    row.className = "at-edit-row at-relation-edit-row";

    const select = document.createElement("select");
    select.name = "relationActorId";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose character / NPC…";
    select.appendChild(blank);
    for (const actor of candidates) {
      const option = document.createElement("option");
      option.value = actor.id;
      option.textContent = actor.name;
      select.appendChild(option);
    }

    const label = document.createElement("input");
    label.type = "text";
    label.name = "relationLabel";
    label.placeholder = "Relation, e.g. Ally";

    const note = document.createElement("input");
    note.type = "text";
    note.name = "relationNote";
    note.placeholder = "Short note";

    const visibility = document.createElement("select");
    visibility.name = "relationVisibility";
    visibility.title = "Visibility";
    visibility.innerHTML = '<option value="players">Players</option><option value="gm">GM only</option>';

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "at-row-remove";
    remove.dataset.atRemoveRow = "";
    remove.title = "Remove relation";
    remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    const controls = document.createElement("span");
    controls.className = "at-row-order";
    controls.innerHTML = `<button type="button" data-at-move-row="up" title="Move relation up"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-at-move-row="down" title="Move relation down"><i class="fa-solid fa-chevron-down"></i></button>`;
    row.append(controls, select, label, note, visibility, remove);
    list.appendChild(row);
    select.focus();
  }

  _applyThemeBackground(settings = {}) {
    const configuredPath = settings?.background || game.settings.get(MODULE_ID, "background") || DEFAULT_BACKGROUND;
    const configuredUrl = settings?.backgroundUrl || resolveFoundryAssetUrl(configuredPath);
    const fallbackUrl = resolveFoundryAssetUrl(DEFAULT_BACKGROUND);
    const sectionBackgrounds = settings?.sectionBackgrounds || getSectionBackgrounds();
    const sectionKey = this.activeTab === "profile" ? "group"
      : this.activeTab === "worldProfile" ? "world"
      : this.activeTab === "questDetail" ? "quests"
      : this.activeTab === "access" ? "settings"
      : this.activeTab;
    const pagePath = String(sectionBackgrounds?.[sectionKey] || "").trim();
    const pageUrl = pagePath ? resolveFoundryAssetUrl(pagePath) : configuredUrl;

    const shell = this.element?.querySelector?.(".at-shell");
    if (shell) {
      shell.classList.remove(...Object.values(THEME_DEFS).map((meta) => meta.className));
      const themeId = settings?.themeId || game.settings.get(MODULE_ID, "theme") || "tome";
      shell.classList.add(THEME_DEFS[themeId]?.className || THEME_DEFS.tome.className);
    }

    const apply = (heroUrl, innerUrl = heroUrl) => {
      const imageValue = cssUrl(heroUrl);
      const pageValue = cssUrl(innerUrl);
      const hero = this.element?.querySelector?.(".at-hero");
      const preview = this.element?.querySelector?.(".at-background-preview");
      shell?.style.setProperty("--at-background", imageValue);
      shell?.style.setProperty("--at-page-background", pageValue);
      if (hero) hero.style.backgroundImage = imageValue;
      if (preview) preview.style.backgroundImage = imageValue;
    };

    apply(configuredUrl, pageUrl);

    const heroProbe = new Image();
    heroProbe.onload = () => apply(configuredUrl, pageUrl);
    heroProbe.onerror = () => {
      console.warn(`Adventurer's Tome | Could not load landing background: ${configuredPath}. Falling back to the bundled default hero.`);
      apply(fallbackUrl, pagePath ? pageUrl : fallbackUrl);
    };
    heroProbe.src = configuredUrl;

    if (pagePath) {
      const pageProbe = new Image();
      pageProbe.onerror = () => {
        console.warn(`Adventurer's Tome | Could not load section background: ${pagePath}. Using Home hero.`);
        shell?.style.setProperty("--at-page-background", cssUrl(configuredUrl));
      };
      pageProbe.src = pageUrl;
    }
  }

  static async _onNavigate(_event, target) {
    const nextTab = target.dataset.tab || "home";
    if (nextTab !== this.activeTab) this._pushNavigationState();
    this.activeTab = nextTab;
    if (this.activeTab !== "profile") this.profileEditing = false;
    if (this.activeTab !== "worldProfile") this.worldEditing = false;
    if (this.activeTab !== "questDetail") this.activeQuestId = null;
    if (this.activeTab !== "ruleDetail") this.activeRuleId = null;
    await this.render({ parts: ["main"] });
  }

  static async _onGoBack() {
    const state = this._navigationHistory.pop() || this._fallbackBackState();
    this._restoreNavigationState(state);
    await this.render({ parts: ["main"] });
  }

  static async _onToggleFavorite(_event, target) {
    const refKey = String(target.dataset.refKey || "").trim();
    if (!refKey) return;
    const favorites = getFavoriteRefs();
    const exists = favorites.includes(refKey);
    const next = exists ? favorites.filter((ref) => ref !== refKey) : [refKey, ...favorites];
    await setFavoriteRefs(next);
    await this.render({ parts: ["main"] });
  }

  static async _onClearRecent() {
    await game.settings.set(MODULE_ID, "recentItems", "[]");
    await this.render({ parts: ["main"] });
  }

  static async _onSelectSession(_event, target) {
    const id = String(target.dataset.journalId || "").trim();
    const journal = id ? game.journal.get(id) : null;
    if (!journal || !canViewInTome(journal)) {
      return ui.notifications.warn("Adventurer's Tome: Session not found or not visible.");
    }
    if (this.activeTab !== "sessions" || this.activeSessionId !== journal.id) this._pushNavigationState();
    this.activeSessionId = journal.id;
    this.activeTab = "sessions";
    await recordRecentRef(`session:${journal.id}`);
    await this.render({ parts: ["main"] });
    if (this.element?.querySelector(".at-shell")?.classList.contains("at-layout-narrow")) {
      this.element?.querySelector(".at-session-detail")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  }


  static async _onOpenQuestDetail(_event, target) {
    const entry = game.journal.get(target.dataset.journalId);
    if (!entry || !canViewInTome(entry)) return ui.notifications.warn("Adventurer's Tome: Quest not found or not visible.");
    if (this.activeTab !== "questDetail" || this.activeQuestId !== entry.id) this._pushNavigationState();
    this.activeQuestId = entry.id;
    this.activeTab = "questDetail";
    await recordRecentRef(`quest:${entry.id}`);
    await this.render({ parts: ["main"] });
  }

  static async _onEditAccess(_event, target) {
    if (!game.user.isGM) return;
    const type = String(target.dataset.documentType || "journal").toLowerCase() === "actor" ? "actor" : "journal";
    const id = String(target.dataset.documentId || target.dataset.journalId || target.dataset.actorId || "").trim();
    const document = type === "actor" ? game.actors.get(id) : game.journal.get(id);
    if (!document) return ui.notifications.warn("Adventurer's Tome: Permission target not found.");
    this._pushNavigationState();
    this.activeAccessType = type;
    this.activeAccessId = id;
    this.activeTab = "access";
    await this.render({ parts: ["main"] });
  }

  static async _onCancelAccess() {
    const state = this._navigationHistory.pop() || { activeTab: "settings" };
    this._restoreNavigationState(state);
    await this.render({ parts: ["main"] });
  }

  static async _onSaveAccess() {
    if (!game.user.isGM || !this.activeAccessType || !this.activeAccessId) return;
    const document = this.activeAccessType === "actor" ? game.actors.get(this.activeAccessId) : game.journal.get(this.activeAccessId);
    const form = this.element?.querySelector(".at-access-form");
    if (!document || !form) return;
    const data = new FormData(form);
    const visibility = TOME_VISIBILITY[String(data.get("accessVisibility") || "inherit")] ? String(data.get("accessVisibility")) : "inherit";
    const now = Date.now();
    const notes = [...form.querySelectorAll("[data-at-gm-note-row]")].map((row) => {
      const originalCreated = Number(row.dataset.createdAt || now) || now;
      const sessionTarget = Number(row.querySelector('[name="noteSessionTarget"]')?.value || 0);
      return normalizeGmNote({
        id: row.dataset.noteId || makeGmNoteId(),
        title: row.querySelector('[name="noteTitle"]')?.value || "GM Note",
        body: row.querySelector('[name="noteBody"]')?.value || "",
        type: row.querySelector('[name="noteType"]')?.value || "reminder",
        status: row.querySelector('[name="noteStatus"]')?.value || "open",
        pinned: Boolean(row.querySelector('[name="notePinned"]')?.checked),
        trigger: row.querySelector('[name="noteTrigger"]')?.value || "",
        sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? sessionTarget : null,
        createdAt: originalCreated,
        updatedAt: now
      });
    }).filter((note) => note.body || note.title !== "GM Note");
    const requestedOwnership = Number(data.get("foundryDefaultOwnership"));
    if (Number.isFinite(requestedOwnership) && Number(document.ownership?.default ?? 0) !== requestedOwnership) {
      await document.update({ ownership: { ...(document.ownership || {}), default: requestedOwnership } });
    }
    await saveTomeAccess(document, {
      visibility,
      discovered: Boolean(form.querySelector('input[name="accessDiscovered"]')?.checked),
      notes
    });
    ui.notifications.info(`Adventurer's Tome access saved for ${document.name}.`);
    const state = this._navigationHistory.pop() || { activeTab: "settings" };
    this._restoreNavigationState(state);
    await this.render({ parts: ["main"] });
  }

  static async _onOpenExporter() {
    if (!game.user.isGM) return;
    this._pushNavigationState();
    this.activeTab = "export";
    await this.render({ parts: ["main"] });
  }

  static async _onDownloadExport(_event, target) {
    if (!game.user.isGM) return;
    const mode = String(target.dataset.exportMode || "portable");
    const data = mode === "backup" ? buildFullTomeBackup() : buildPortableTomeExport({ playerSafe: mode === "player-safe" });
    downloadTextFile(exportFilename(mode), stringifyExport(data));
    ui.notifications.info(`Adventurer's Tome: ${mode === "backup" ? "Full GM archive" : mode === "player-safe" ? "Player-safe package" : "portable package"} exported.`);
  }

  static async _onCopyExport(_event, target) {
    if (!game.user.isGM) return;
    const mode = String(target.dataset.exportMode || "portable");
    const data = mode === "backup" ? buildFullTomeBackup() : buildPortableTomeExport({ playerSafe: mode === "player-safe" });
    try {
      await navigator.clipboard.writeText(stringifyExport(data));
      ui.notifications.info("Adventurer's Tome export copied to clipboard.");
    } catch (error) {
      console.warn("Adventurer's Tome | Clipboard export failed", error);
      ui.notifications.warn("Adventurer's Tome could not access the clipboard. Use Download JSON instead.");
    }
  }

  _currentTomeRef() {
    if (this.activeTab === "sessions" && this.activeSessionId) return `session:${this.activeSessionId}`;
    if (this.activeTab === "questDetail" && this.activeQuestId) return `quest:${this.activeQuestId}`;
    if (this.activeTab === "profile" && this.activeActorId) return `actor:${this.activeActorId}`;
    if (this.activeTab === "worldProfile" && this.activeWorldId) return `world:${this.activeWorldId}`;
    if (this.activeTab === "ruleDetail" && this.activeRuleId) return `rule:${this.activeRuleId}`;
    return "";
  }

  async _openRefKey(refKey, { record = true } = {}) {
    const parsed = parseTomeRefKey(refKey);
    const document = resolveTomeRefKey(refKey);
    if (!parsed || !document || !canViewInTome(document)) return false;
    if (record) await recordRecentRef(refKey);
    if (parsed.type === "actor") {
      this.activeActorId = document.id; this.activeTab = "profile"; this.profileEditing = false;
    } else if (parsed.type === "session") {
      this.activeSessionId = document.id; this.activeTab = "sessions";
    } else if (parsed.type === "quest") {
      this.activeQuestId = document.id; this.activeTab = "questDetail";
    } else if (parsed.type === "world") {
      this.activeWorldId = document.id; this.activeTab = "worldProfile"; this.worldEditing = false;
    } else if (parsed.type === "rule") {
      this.activeRuleId = document.id; this.activeTab = "ruleDetail";
    }
    await this.render({ parts: ["main"] });
    return true;
  }

  static async _onOpenGmDashboard() {
    if (!game.user.isGM) return;
    if (this.activeTab !== "gmDashboard") this._pushNavigationState();
    this.activeTab = "gmDashboard";
    await this.render({ parts: ["main"] });
  }

  static async _onOpenQuickCapture() {
    if (!game.user.isGM) return;
    this._quickCaptureSourceRef = this._currentTomeRef();
    if (this.activeTab !== "quickCapture") this._pushNavigationState();
    this.activeTab = "quickCapture";
    await this.render({ parts: ["main"] });
    requestAnimationFrame(() => this.element?.querySelector('[name="captureTitle"]')?.focus());
  }

  static async _onSaveQuickCapture() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-quick-capture-form");
    if (!form) return;
    const data = new FormData(form);
    const source = String(data.get("captureTarget") || "inbox");
    let document = null;
    if (source !== "inbox") document = resolveTomeRefKey(source);
    if (!document) document = await ensureQuickCaptureInbox();
    const access = getTomeAccess(document);
    const sessionTarget = Number(data.get("captureSessionTarget") || 0);
    const note = normalizeGmNote({
      title: String(data.get("captureTitle") || "Quick Capture").trim() || "Quick Capture",
      body: String(data.get("captureBody") || "").trim(),
      type: String(data.get("captureType") || "reminder"),
      pinned: data.get("capturePinned") === "on",
      trigger: String(data.get("captureTrigger") || "").trim(),
      sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? sessionTarget : null,
      status: "open"
    });
    if (!note.body && !note.title) return ui.notifications.warn("Adventurer's Tome: Capture needs a title or note.");
    const notes = [note, ...access.notes];
    await setPrivateOverlay(document, { notes });
    ui.notifications.info(`Captured to ${document.name}.`);
    this.activeTab = "gmDashboard";
    await this.render({ parts: ["main"] });
  }

  static async _onOpenRevealQueue() {
    if (!game.user.isGM) return;
    if (this.activeTab !== "revealQueue") this._pushNavigationState();
    this.activeTab = "revealQueue";
    await this.render({ parts: ["main"] });
  }

  static async _onQueueReveal(_event, target) {
    if (!game.user.isGM) return;
    const refKey = String(target.dataset.refKey || "").trim();
    if (!refKey) return;
    try {
      await queueRevealRef(refKey);
      ui.notifications.info("Added to Reveal Queue.");
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error("Adventurer's Tome | Queue reveal failed", error);
      ui.notifications.warn("Adventurer's Tome: Could not queue that reveal.");
    }
  }

  static async _onShowToPlayers(_event, target) {
    if (!game.user.isGM) return;
    const refKey = String(target.dataset.refKey || "").trim();
    const meta = tomeRefMeta(refKey);
    if (!meta) return ui.notifications.warn("Adventurer's Tome: Reveal target not found.");
    const access = getTomeAccess(meta.document);
    if (access.visibility === "gm") return ui.notifications.warn("This entry is GM-only in Tome. Change its Permissions before revealing it.");
    if (!access.discovered) {
      await meta.document.setFlag(MODULE_ID, FLAGS.ACCESS, { visibility: access.visibility, discovered: true });
    }
    const activePlayers = game.users?.contents?.filter((user) => !user.isGM && user.active) || [];
    const eligible = activePlayers.filter((user) => meta.document.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
    if (!eligible.length) return ui.notifications.warn("No active player currently has Foundry access to this entry. Grant Foundry permission first.");
    game.socket.emit(`module.${MODULE_ID}`, { type: "showTomeRef", refKey, senderId: game.user.id, sentAt: Date.now() });
    await markRevealShown(refKey);
    ui.notifications.info(`Revealed ${meta.name} to ${eligible.length} active player(s).`);
    await this.render({ parts: ["main"] });
  }

  static async _onRemoveReveal(_event, target) {
    if (!game.user.isGM) return;
    await removeRevealRef(String(target.dataset.refKey || ""));
    await this.render({ parts: ["main"] });
  }

  static async _onClearRevealHistory() {
    if (!game.user.isGM) return;
    await setRevealQueueRaw(getRevealQueueRaw().filter((row) => !row.shownAt));
    await this.render({ parts: ["main"] });
  }

  static async _onOpenPostSession() {
    if (!game.user.isGM) return;
    if (this.activeTab !== "postSession") this._pushNavigationState();
    this.activeTab = "postSession";
    await this.render({ parts: ["main"] });
  }

  static async _onResolveNotebookNote(_event, target) {
    if (!game.user.isGM) return;
    const documentType = String(target.dataset.documentType || "journal");
    const documentId = String(target.dataset.documentId || "");
    const noteId = String(target.dataset.noteId || "");
    if (!noteId) return;
    if (documentType === "workspace") {
      const workspace = getGmWorkspace();
      await setGmWorkspace({ notes: workspace.notes.map((note) => note.id === noteId ? normalizeGmNote({ ...note, status: "resolved", updatedAt: Date.now() }) : note) });
      ui.notifications.info("GM Notebook note marked resolved.");
      return this.render({ parts: ["main"] });
    }
    const document = documentType === "actor" ? game.actors.get(documentId) : game.journal.get(documentId);
    if (!document) return;
    const access = getTomeAccess(document);
    const notes = access.notes.map((note) => note.id === noteId ? normalizeGmNote({ ...note, status: "resolved", updatedAt: Date.now() }) : note);
    await setPrivateOverlay(document, { notes });
    ui.notifications.info("GM Note marked resolved.");
    await this.render({ parts: ["main"] });
  }

  static async _onOpenNotebook() {
    if (!game.user.isGM) return;
    this.activeTab = "settings";
    this.settingsSection = "notebook";
    await this.render({ parts: ["main"] });
  }

  static async _onOpenManual() {
    if (this.activeTab !== "manual") this._pushNavigationState();
    this.activeTab = "manual";
    await this.render({ parts: ["main"] });
    requestAnimationFrame(() => this.element?.querySelector("[data-at-manual-search]")?.focus?.());
  }

  static async _onSaveNotebookScratchpad() {
    if (!game.user.isGM) return;
    const input = this.element?.querySelector('[name="gmWorkspaceScratchpad"]');
    if (!input) return;
    await setGmWorkspace({ scratchpad: input.value || "" });
    ui.notifications.info("GM scratchpad saved privately.");
  }

  static async _onToggleNotebookBuilder() {
    if (!game.user.isGM) return;
    const builder = this.element?.querySelector("[data-at-notebook-builder]");
    if (!builder) return;
    builder.hidden = !builder.hidden;
    const editing = !builder.hidden;
    this._notebookEditing = editing;
    const button = this.element?.querySelector('[data-action="toggleNotebookBuilder"]');
    if (button) {
      button.classList.toggle("active", editing);
      const label = button.querySelector("span");
      if (label) label.textContent = editing ? "Finish Layout" : "Customize Workspace";
      else button.title = editing ? "Finish editing workspace layout" : "Customize workspace";
    }
    this.element?.querySelector("[data-at-notebook-workspace]")?.classList.toggle("is-editing", editing);
    if (!builder.hidden) builder.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  static async _onMoveNotebookWidget(_event, target) {
    if (!game.user.isGM) return;
    const id = String(target?.dataset?.widgetId || "");
    const direction = String(target?.dataset?.direction || "later");
    const workspace = getGmWorkspace();
    const layout = workspace.layout.map((row) => ({ ...row }));
    const index = layout.findIndex((row) => row.id === id);
    if (index < 0) return;
    const delta = direction === "earlier" ? -1 : 1;
    const nextIndex = clamp(index + delta, 0, layout.length - 1);
    if (nextIndex === index) return;
    const [item] = layout.splice(index, 1);
    layout.splice(nextIndex, 0, item);
    await setGmWorkspace({ layout, preset: "custom" });
    this._notebookEditing = true;
    await this.render({ parts: ["main"] });
  }

  static async _onSetNotebookWidgetSize(_event, target) {
    if (!game.user.isGM) return;
    const id = String(target?.dataset?.widgetId || "");
    const size = String(target?.dataset?.size || "full");
    if (!NOTEBOOK_WIDGET_SIZES[size]) return;
    const workspace = getGmWorkspace();
    const layout = workspace.layout.map((row) => row.id === id ? { ...row, size } : { ...row });
    await setGmWorkspace({ layout, preset: "custom" });
    this._notebookEditing = true;
    await this.render({ parts: ["main"] });
  }

  static async _onToggleNotebookWidgetVisibility(_event, target) {
    if (!game.user.isGM) return;
    const id = String(target?.dataset?.widgetId || "");
    const workspace = getGmWorkspace();
    const layout = workspace.layout.map((row) => row.id === id ? { ...row, visible: row.visible === false } : { ...row });
    await setGmWorkspace({ layout, preset: "custom" });
    this._notebookEditing = true;
    await this.render({ parts: ["main"] });
  }

  static async _onMoveNotebookPad(_event, target) {
    if (!game.user.isGM) return;
    const id = String(target?.dataset?.padId || "");
    const direction = String(target?.dataset?.direction || "later");
    const workspace = getGmWorkspace();
    const pads = workspace.pads.map((pad) => ({ ...pad }));
    const index = pads.findIndex((pad) => pad.id === id);
    if (index < 0) return;
    const delta = direction === "earlier" ? -1 : 1;
    const nextIndex = clamp(index + delta, 0, pads.length - 1);
    if (nextIndex === index) return;
    const [item] = pads.splice(index, 1);
    pads.splice(nextIndex, 0, item);
    await setGmWorkspace({ pads });
    this._notebookEditing = true;
    await this.render({ parts: ["main"] });
  }

  static async _onSetNotebookPadSize(_event, target) {
    if (!game.user.isGM) return;
    const id = String(target?.dataset?.padId || "");
    const size = String(target?.dataset?.size || "half");
    if (!NOTEBOOK_WIDGET_SIZES[size]) return;
    const workspace = getGmWorkspace();
    const pads = workspace.pads.map((pad) => pad.id === id ? normalizeNotebookPad({ ...pad, size, updatedAt: pad.updatedAt }) : pad);
    await setGmWorkspace({ pads });
    this._notebookEditing = true;
    await this.render({ parts: ["main"] });
  }

  static async _onSaveNotebookLayout() {
    if (!game.user.isGM) return;
    const rows = [...(this.element?.querySelectorAll("[data-at-notebook-layout-row]") || [])];
    if (!rows.length) return ui.notifications.warn("Adventurer's Tome: Notebook layout editor is not available.");
    const layout = rows.map((row) => ({
      id: String(row.dataset.notebookWidgetId || ""),
      visible: row.querySelector('input[type="checkbox"]')?.checked !== false,
      size: NOTEBOOK_WIDGET_SIZES[String(row.querySelector('select[name="notebookWidgetSize"]')?.value || "full")]
        ? String(row.querySelector('select[name="notebookWidgetSize"]')?.value || "full")
        : "full"
    })).filter((row) => row.id);
    await setGmWorkspace({ layout, preset: "custom" });
    ui.notifications.info("GM Notebook layout saved for your GM account.");
    await this.render({ parts: ["main"] });
  }

  static async _onApplyNotebookPreset() {
    if (!game.user.isGM) return;
    const select = this.element?.querySelector('[name="notebookPreset"]');
    const preset = String(select?.value || "standard");
    if (!NOTEBOOK_PRESETS[preset]) return ui.notifications.warn("Adventurer's Tome: Unknown Notebook preset.");
    await setGmWorkspace({ layout: defaultNotebookLayout(preset), preset });
    ui.notifications.info(`GM Notebook preset applied: ${NOTEBOOK_PRESETS[preset].label}.`);
    await this.render({ parts: ["main"] });
  }

  static async _onResetNotebookLayout() {
    if (!game.user.isGM) return;
    const ok = await confirmDemoAction({ title: "Reset GM Notebook layout?", content: "<p>This resets only your private Notebook layout to the Standard preset. Notes and notepads are kept.</p>" });
    if (!ok) return;
    await setGmWorkspace({ layout: defaultNotebookLayout("standard"), preset: "standard" });
    ui.notifications.info("GM Notebook layout reset to Standard.");
    await this.render({ parts: ["main"] });
  }

  static async _onAddNotebookPad() {
    if (!game.user.isGM) return;
    const workspace = getGmWorkspace();
    if (workspace.pads.length >= 24) return ui.notifications.warn("Adventurer's Tome: Maximum 24 private notepads per GM workspace.");
    const pad = normalizeNotebookPad({ title: `Notepad ${workspace.pads.length + 1}`, body: "" });
    await setGmWorkspace({ pads: [pad, ...workspace.pads] });
    await this.render({ parts: ["main"] });
    requestAnimationFrame(() => this.element?.querySelector(`[data-at-notebook-pad="${pad.id}"] input[name="notebookPadTitle"]`)?.focus?.());
  }

  static async _onSaveNotebookPad(_event, target) {
    if (!game.user.isGM) return;
    const padId = String(target.dataset.padId || "");
    const card = this.element?.querySelector(`[data-at-notebook-pad="${CSS.escape(padId)}"]`);
    if (!card) return;
    const workspace = getGmWorkspace();
    const existing = workspace.pads.find((pad) => pad.id === padId);
    if (!existing) return ui.notifications.warn("Adventurer's Tome: Notepad no longer exists.");
    const title = String(card.querySelector('[name="notebookPadTitle"]')?.value || "Notepad").trim() || "Notepad";
    const body = String(card.querySelector('[name="notebookPadBody"]')?.value || "");
    const size = String(card.querySelector('[name="notebookPadSize"]')?.value || existing.size || "half");
    const pads = workspace.pads.map((pad) => pad.id === padId ? normalizeNotebookPad({ ...pad, title, body, size, updatedAt: Date.now() }) : pad);
    await setGmWorkspace({ pads });
    ui.notifications.info(`Saved private notepad: ${title}.`);
  }

  static async _onDeleteNotebookPad(_event, target) {
    if (!game.user.isGM) return;
    const padId = String(target.dataset.padId || "");
    const workspace = getGmWorkspace();
    const pad = workspace.pads.find((row) => row.id === padId);
    if (!pad) return;
    const ok = await confirmDemoAction({ title: `Delete ${foundry.utils.escapeHTML?.(pad.title) || pad.title}?`, content: "<p>This permanently removes only this private GM notepad. Campaign documents and GM Notes are not changed.</p>" });
    if (!ok) return;
    await setGmWorkspace({ pads: workspace.pads.filter((row) => row.id !== padId) });
    await this.render({ parts: ["main"] });
  }

  static async _onSaveNotebookCapture() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-notebook-capture-form");
    if (!form) return;
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
    const checked = (name) => form.querySelector(`[name="${name}"]`)?.checked === true;
    const workspace = getGmWorkspace();
    const noteId = String(value("workspaceNoteId") || "").trim();
    const existing = noteId ? workspace.notes.find((note) => note.id === noteId) : null;
    const sessionTarget = Number(value("workspaceSessionTarget") || 0);
    const rawTitle = String(value("workspaceTitle") || "").trim();
    const note = normalizeGmNote({
      ...(existing || {}),
      id: noteId || makeGmNoteId(),
      title: rawTitle || "Quick Capture",
      body: String(value("workspaceBody") || "").trim(),
      type: String(value("workspaceType") || "reminder"),
      status: String(value("workspaceStatus") || "open"),
      pinned: checked("workspacePinned"),
      trigger: String(value("workspaceTrigger") || "").trim(),
      sessionTarget: Number.isFinite(sessionTarget) && sessionTarget > 0 ? Math.floor(sessionTarget) : null,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    if (!note.body && !rawTitle) return ui.notifications.warn("Adventurer's Tome: Add a title or note before saving.");
    const notes = existing
      ? workspace.notes.map((row) => row.id === note.id ? note : row)
      : [note, ...workspace.notes];
    await setGmWorkspace({ notes });
    ui.notifications.info(existing ? "GM Notebook note updated." : "Captured to GM Notebook.");
    await this.render({ parts: ["main"] });
  }

  static async _onEditStandaloneNote(_event, target) {
    if (!game.user.isGM) return;
    const noteId = String(target.dataset.noteId || "");
    const note = getGmWorkspace().notes.find((row) => row.id === noteId);
    const form = this.element?.querySelector(".at-notebook-capture-form");
    if (!note || !form) return;
    const set = (name, value) => { const input = form.querySelector(`[name="${name}"]`); if (input) input.value = value ?? ""; };
    set("workspaceNoteId", note.id); set("workspaceTitle", note.title); set("workspaceBody", note.body); set("workspaceType", note.type); set("workspaceStatus", note.status); set("workspaceTrigger", note.trigger); set("workspaceSessionTarget", note.sessionTarget || "");
    const pin = form.querySelector('[name="workspacePinned"]'); if (pin) pin.checked = note.pinned === true;
    form.dataset.editing = "true";
    form.querySelector("[data-at-workspace-editor-title]")?.replaceChildren(document.createTextNode("Edit Notebook Note"));
    form.scrollIntoView?.({ behavior: "smooth", block: "start" });
    form.querySelector('[name="workspaceTitle"]')?.focus?.();
  }

  static async _onResetStandaloneNoteEditor() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-notebook-capture-form");
    if (!form) return;
    const set = (name, value) => { const input = form.querySelector(`[name="${name}"]`); if (input) input.value = value ?? ""; };
    set("workspaceNoteId", ""); set("workspaceTitle", ""); set("workspaceBody", ""); set("workspaceType", "reminder"); set("workspaceStatus", "open"); set("workspaceTrigger", ""); set("workspaceSessionTarget", String(buildGmNotebookRows().nextSession || ""));
    const pin = form.querySelector('[name="workspacePinned"]'); if (pin) pin.checked = false;
    form.dataset.editing = "false";
    form.querySelector("[data-at-workspace-editor-title]")?.replaceChildren(document.createTextNode("Quick Capture"));
  }

  static async _onToggleStandaloneNoteStatus(_event, target) {
    if (!game.user.isGM) return;
    const noteId = String(target.dataset.noteId || "");
    const workspace = getGmWorkspace();
    const notes = workspace.notes.map((note) => note.id === noteId ? normalizeGmNote({ ...note, status: note.status === "resolved" ? "open" : "resolved", updatedAt: Date.now() }) : note);
    await setGmWorkspace({ notes });
    await this.render({ parts: ["main"] });
  }

  static async _onDeleteStandaloneNote(_event, target) {
    if (!game.user.isGM) return;
    const noteId = String(target.dataset.noteId || "");
    if (!noteId) return;
    const ok = await confirmDemoAction({ title: "Delete GM Notebook note?", content: "<p>This removes only this private standalone GM note. Campaign documents are not changed.</p>" });
    if (!ok) return;
    const workspace = getGmWorkspace();
    await setGmWorkspace({ notes: workspace.notes.filter((note) => note.id !== noteId) });
    await this.render({ parts: ["main"] });
  }

  static async _onOpenNoteSource(_event, target) {
    if (!game.user.isGM) return;
    const type = String(target.dataset.documentType || "journal");
    const id = String(target.dataset.documentId || "");
    if (type === "workspace") return this._onOpenNotebook();
    if (type === "actor") return this._onOpenProfile(_event, { dataset: { actorId: id } });
    const entry = game.journal.get(id);
    if (!entry) return ui.notifications.warn("Adventurer's Tome: Note source no longer exists.");
    const ref = inferJournalRefKey(entry).split(":")[0];
    if (ref === "session") return this._onSelectSession(_event, { dataset: { journalId: id } });
    if (ref === "quest") return this._onOpenQuestDetail(_event, { dataset: { journalId: id } });
    if (ref === "world") return this._onOpenWorldProfile(_event, { dataset: { journalId: id } });
    return this._onOpenJournal(_event, { dataset: { journalId: id } });
  }

  static async _onQuickNote(_event, target) {
    if (!game.user.isGM) return;
    await this._onEditAccess(_event, target);
    requestAnimationFrame(() => this.element?.querySelector(".at-gm-note-workbench")?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }

  static async _onAddGmNote() {
    const container = this.element?.querySelector("[data-at-gm-note-list]");
    if (!container) return;
    const row = document.createElement("article");
    row.className = "at-gm-note-editor-row";
    row.dataset.atGmNoteRow = "";
    row.dataset.noteId = makeGmNoteId();
    row.dataset.createdAt = String(Date.now());
    row.innerHTML = `<div class="at-gm-note-editor-head"><label>Type<select name="noteType">${Object.entries(GM_NOTE_TYPES).map(([id, meta]) => `<option value="${id}">${meta.label}</option>`).join("")}</select></label><label>Status<select name="noteStatus"><option value="open">Open</option><option value="resolved">Resolved</option></select></label><label class="at-note-pin"><input type="checkbox" name="notePinned"> <span><i class="fa-solid fa-thumbtack"></i> Pin</span></label><span class="at-note-row-actions"><button type="button" data-action="moveGmNote" data-direction="up" title="Move up"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-action="moveGmNote" data-direction="down" title="Move down"><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-action="removeGmNote" title="Remove"><i class="fa-solid fa-xmark"></i></button></span></div><div class="at-settings-grid"><label>Title<input type="text" name="noteTitle" value="GM Note"></label><label>Target session<input type="number" min="1" name="noteSessionTarget" placeholder="Optional"></label></div><label>Trigger / when it matters<input type="text" name="noteTrigger" placeholder="When the party reaches Greyhaven…"></label><label>Private note<textarea name="noteBody" rows="4" placeholder="Secret, prep, clue, consequence, reminder…"></textarea></label>`;
    container.prepend(row);
    row.querySelector('[name="noteTitle"]')?.focus();
  }

  static async _onRemoveGmNote(_event, target) {
    target.closest("[data-at-gm-note-row]")?.remove();
  }

  static async _onMoveGmNote(_event, target) {
    const row = target.closest("[data-at-gm-note-row]");
    if (!row?.parentElement) return;
    if (target.dataset.direction === "up" && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    if (target.dataset.direction === "down" && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
  }

  static async _onOpenSettings(_event, target) {
    if (!game.user.isGM) return;
    const requestedSection = String(target?.dataset?.settingsSection || "").trim();
    if (requestedSection) this.settingsSection = requestedSection;
    this.activeTab = "settings";
    await this.render({ parts: ["main"] });
  }

  static async _onOpenProfile(_event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor || !canViewInTome(actor)) {
      return ui.notifications.warn("Adventurer's Tome: Character not found or not visible.");
    }
    if (this.activeTab !== "profile" || this.activeActorId !== actor.id) this._pushNavigationState();
    this.activeActorId = actor.id;
    this.profileEditing = false;
    this.activeTab = "profile";
    await recordRecentRef(`actor:${actor.id}`);
    await this.render({ parts: ["main"] });
  }

  static async _onEditProfile() {
    if (!game.user.isGM || !this.activeActorId) return;
    this.profileEditing = true;
    this.activeTab = "profile";
    await this.render({ parts: ["main"] });
  }

  static async _onCancelProfileEdit() {
    this.profileEditing = false;
    await this.render({ parts: ["main"] });
  }

  static async _onBrowseProfileImage() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-profile-form");
    const input = form?.querySelector('input[name="profileHeroImage"]');
    const actor = this.activeActorId ? game.actors.get(this.activeActorId) : null;
    const current = input?.value || actor?.img || "";
    const picker = new FilePicker({
      type: "image",
      current,
      callback: (path) => {
        if (input) input.value = path;
        const preview = form?.querySelector("[data-at-profile-preview]");
        if (preview) preview.src = resolveFoundryAssetUrl(path || actor?.img || "icons/svg/mystery-man.svg");
      }
    });
    await picker.render(true);
  }

  static async _onSaveProfile() {
    if (!game.user.isGM) return;
    const actor = this.activeActorId ? game.actors.get(this.activeActorId) : null;
    const form = this.element?.querySelector(".at-profile-form");
    if (!actor || !form) return;

    const data = new FormData(form);
    const facts = [...form.querySelectorAll(".at-fact-edit-row")]
      .map((row) => ({
        label: String(row.querySelector('[name="factLabel"]')?.value || "").trim(),
        value: String(row.querySelector('[name="factValue"]')?.value || "").trim(),
        visibility: factVisibility(row.querySelector('[name="factVisibility"]')?.value || "players")
      }))
      .filter((fact) => fact.label || fact.value);

    const relations = [...form.querySelectorAll(".at-relation-edit-row")]
      .map((row) => ({
        actorId: String(row.querySelector('[name="relationActorId"]')?.value || "").trim(),
        label: String(row.querySelector('[name="relationLabel"]')?.value || "").trim(),
        note: String(row.querySelector('[name="relationNote"]')?.value || "").trim(),
        visibility: factVisibility(row.querySelector('[name="relationVisibility"]')?.value || "players")
      }))
      .filter((relation) => relation.actorId && relation.actorId !== actor.id);

    const customLinks = [...form.querySelectorAll(".at-custom-link-edit-row")].map((row) => normalizeCustomLink({
      label: row.querySelector('[name="customLinkLabel"]')?.value || "",
      icon: row.querySelector('[name="customLinkIcon"]')?.value || "fa-link",
      target: row.querySelector('[name="customLinkTarget"]')?.value || ""
    })).filter((link) => link.label && link.target);

    const publicFacts = facts.filter((fact) => fact.visibility !== "gm");
    const privateFacts = facts.filter((fact) => fact.visibility === "gm");
    const publicRelations = relations.filter((relation) => relation.visibility !== "gm");
    const privateRelations = relations.filter((relation) => relation.visibility === "gm");
    const profile = {
      title: String(data.get("profileTitle") || "").trim(),
      subtitle: String(data.get("profileSubtitle") || "").trim(),
      summary: String(data.get("profileSummary") || "").trim(),
      biography: String(data.get("profileBiography") || "").trim(),
      heroImage: String(data.get("profileHeroImage") || "").trim(),
      motto: String(data.get("profileMotto") || "").trim(),
      firstSessionId: String(data.get("profileFirstSessionId") || "").trim(),
      customLinks,
      facts: publicFacts,
      relations: publicRelations
    };

    await actor.setFlag(MODULE_ID, FLAGS.PROFILE, profile);
    await setPrivateOverlay(actor, { facts: privateFacts, relations: privateRelations });
    ui.notifications.info(`Adventurer's Tome profile saved for ${actor.name}.`);
    this.profileEditing = false;
    await this.render({ parts: ["main"] });
  }


  static async _onOpenWorldProfile(_event, target) {
    const entry = game.journal.get(target.dataset.journalId);
    if (!entry || !canViewInTome(entry)) return ui.notifications.warn("Adventurer's Tome: World entry not found or not visible.");
    if (this.activeTab !== "worldProfile" || this.activeWorldId !== entry.id) this._pushNavigationState();
    this.activeWorldId = entry.id;
    this.worldEditing = false;
    this.activeTab = "worldProfile";
    await recordRecentRef(`world:${entry.id}`);
    await this.render({ parts: ["main"] });
  }

  static async _onEditWorldProfile() {
    if (!game.user.isGM || !this.activeWorldId) return;
    this.worldEditing = true;
    this.activeTab = "worldProfile";
    await this.render({ parts: ["main"] });
  }

  static async _onCancelWorldEdit() {
    this.worldEditing = false;
    await this.render({ parts: ["main"] });
  }

  static async _onBrowseWorldImage() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-world-profile-form");
    const input = form?.querySelector('input[name="worldHeroImage"]');
    const entry = this.activeWorldId ? game.journal.get(this.activeWorldId) : null;
    const current = input?.value || entry?.img || "";
    const picker = new FilePicker({
      type: "image",
      current,
      callback: (path) => {
        if (input) input.value = path;
        const preview = form?.querySelector("[data-at-world-preview]");
        if (preview) preview.src = resolveFoundryAssetUrl(path || entry?.img || "icons/svg/book.svg");
      }
    });
    await picker.render(true);
  }

  static async _onSaveWorldProfile() {
    if (!game.user.isGM) return;
    const entry = this.activeWorldId ? game.journal.get(this.activeWorldId) : null;
    const form = this.element?.querySelector(".at-world-profile-form");
    if (!entry || !form) return;
    const data = new FormData(form);
    const facts = [...form.querySelectorAll(".at-fact-edit-row")]
      .map((row) => ({
        label: String(row.querySelector('[name="worldFactLabel"]')?.value || "").trim(),
        value: String(row.querySelector('[name="worldFactValue"]')?.value || "").trim(),
        visibility: factVisibility(row.querySelector('[name="worldFactVisibility"]')?.value || "players")
      })).filter((fact) => fact.label || fact.value);
    const category = String(data.get("worldCategory") || "lore").trim().toLowerCase();
    const publicFacts = facts.filter((fact) => fact.visibility !== "gm");
    const privateFacts = facts.filter((fact) => fact.visibility === "gm");
    let profile = {
      category: WORLD_CATEGORIES[category] ? category : "lore",
      subtitle: String(data.get("worldSubtitle") || "").trim(),
      summary: String(data.get("worldSummary") || "").trim(),
      heroImage: String(data.get("worldHeroImage") || "").trim(),
      actorId: String(data.get("worldActorId") || "").trim(),
      syncPageId: String(entry.getFlag(MODULE_ID, FLAGS.WORLD_PROFILE)?.syncPageId || "").trim(),
      facts: publicFacts
    };
    const synced = await ensureWorldSyncPage(entry, String(data.get("worldBody") || "").trim(), profile);
    profile = synced.profile;
    await entry.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, profile);
    await setPrivateOverlay(entry, { facts: privateFacts });
    ui.notifications.info(`Adventurer's Tome entry saved for ${entry.name}.`);
    this.worldEditing = false;
    await this.render({ parts: ["main"] });
  }

  static _onOpenActor(_event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor || !canViewInTome(actor)) return ui.notifications.warn("Adventurer's Tome: Actor not found or not visible.");
    actor.sheet.render(true);
  }

  static async _onOpenCustomLink(_event, target) {
    const value = String(target.dataset.linkTarget || "").trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value)) { window.open(value, "_blank", "noopener"); return; }
    try {
      const document = await fromUuid(value);
      if (!document) return ui.notifications.warn(`Adventurer's Tome: Could not resolve ${value}.`);
      if (document.documentName === "JournalEntryPage") document.parent?.sheet?.render(true, { pageId: document.id });
      else if (document.sheet?.render) document.sheet.render(true);
      else if (document.parent?.sheet?.render) document.parent.sheet.render(true);
      else ui.notifications.warn("Adventurer's Tome: The linked Foundry document has no sheet to open.");
    } catch (error) {
      console.error("Adventurer's Tome | Custom link failed", error);
      ui.notifications.error(`Adventurer's Tome: Could not open custom link — ${error.message}`);
    }
  }

  static async _onOpenRuleDetail(_event, target) {
    const journal = game.journal.get(String(target.dataset.journalId || ""));
    if (!journal || !canViewInTome(journal)) return ui.notifications.warn("Adventurer's Tome: Rule not found or not visible.");
    if (this.activeTab !== "ruleDetail" || this.activeRuleId !== journal.id) this._pushNavigationState();
    this.activeRuleId = journal.id; this.activeTab = "ruleDetail";
    await recordRecentRef(`rule:${journal.id}`);
    await this.render({ parts: ["main"] });
  }

  static async _onCreateRule() {
    if (!game.user.isGM) return;
    const input = this.element?.querySelector('[name="newRuleName"]');
    const name = String(input?.value || "").trim();
    if (!name) return ui.notifications.warn("Adventurer's Tome: Enter a rule name first.");
    const root = await createJournalFolder("Adventurer's Tome");
    const folder = await createJournalFolder("Rules", root);
    const journal = await CONFIG.JournalEntry.documentClass.create({
      name, folder: folder?.id ?? null, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
      pages: [{ name, type: "text", text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content: "<p>Write the rule here.</p>" } }],
      flags: { [MODULE_ID]: { type: "rules" } }
    });
    ui.notifications.info(`Adventurer's Tome: Rule created — ${name}.`);
    journal.sheet.render(true);
    await this.render({ parts: ["main"] });
  }

  static async _onLinkRule() {
    if (!game.user.isGM) return;
    const select = this.element?.querySelector('[name="existingRuleJournalId"]');
    const journal = game.journal.get(String(select?.value || ""));
    if (!journal) return ui.notifications.warn("Adventurer's Tome: Choose an existing Journal first.");
    await journal.setFlag(MODULE_ID, "type", "rules");
    await journal.setFlag(MODULE_ID, FLAGS.RULE_LINK, true);
    ui.notifications.info(`Adventurer's Tome: ${journal.name} is now linked in Rules.`);
    await this.render({ parts: ["main"] });
  }

  static _getSelectedShareText() {
    return String(this._selectedShareText || globalThis.getSelection?.()?.toString?.() || "").trim();
  }

  static _clearSelectedShareText() {
    this._selectedShareText = "";
    this._selectionShareLockUntil = 0;
    const button = this.element?.querySelector('[data-at-selection-share]');
    if (button) button.hidden = true;
  }

  static _formatSelectedChatContent(text) {
    return `<div class="adventurers-tome-chat-quote"><i class="fa-solid fa-book-open"></i><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p></div>`;
  }

  static async _onSendSelectionToChat() {
    const text = AdventurersTomeApp._getSelectedShareText.call(this);
    if (!text) return ui.notifications.warn("Adventurer's Tome: Select some text first.");
    const speaker = ChatMessage.getSpeaker?.() ?? { alias: game.user?.name || "Adventurer's Tome" };
    await ChatMessage.create({
      user: game.user?.id,
      content: AdventurersTomeApp._formatSelectedChatContent.call(this, text),
      speaker
    });
    AdventurersTomeApp._clearSelectedShareText.call(this);
  }

  static async _onWhisperSelectionToChat() {
    const text = AdventurersTomeApp._getSelectedShareText.call(this);
    if (!text) return ui.notifications.warn("Adventurer's Tome: Select some text first.");

    const users = (game.users?.contents || [])
      .filter((user) => user.id !== game.user.id)
      .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || String(a.name || "").localeCompare(String(b.name || "")));
    const activeUsers = users.filter((user) => user.active);
    const gmIds = (game.users?.contents || []).filter((user) => user.isGM).map((user) => user.id);

    if (!activeUsers.length && !gmIds.length) {
      return ui.notifications.warn("Adventurer's Tome: No whisper recipients are available.");
    }

    const recipientRows = activeUsers.length
      ? activeUsers.map((user) => `<label class="at-whisper-recipient"><input type="checkbox" name="atWhisperRecipient" value="${escapeHtml(user.id)}"><span>${escapeHtml(user.name || "Player")}${user.isGM ? ' <small>GM</small>' : ''}</span></label>`).join("")
      : '<p class="at-empty">No other connected users.</p>';

    const DialogV2 = foundry.applications.api.DialogV2;
    if (!DialogV2?.wait) return ui.notifications.warn("Adventurer's Tome: Whisper dialog is unavailable in this Foundry build.");

    const result = await DialogV2.wait({
      window: { title: "Whisper selected text" },
      content: `<div class="at-whisper-dialog"><p>Choose who should receive the selected Tome text.</p><div class="at-whisper-recipient-list">${recipientRows}</div></div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "selected",
          label: "Whisper to Selected",
          icon: "fa-solid fa-user-secret",
          default: activeUsers.length > 0,
          callback: (_event, button) => ({
            mode: "selected",
            recipients: Array.from(button.form?.querySelectorAll?.('input[name="atWhisperRecipient"]:checked') || []).map((input) => input.value)
          })
        },
        {
          action: "gms",
          label: "Whisper to GM(s)",
          icon: "fa-solid fa-shield-halved",
          callback: () => ({ mode: "gms", recipients: gmIds })
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ]
    });

    if (!result || result === "cancel") return;
    const recipients = Array.isArray(result?.recipients) ? result.recipients.filter(Boolean) : [];
    if (!recipients.length) return ui.notifications.warn("Adventurer's Tome: Choose at least one whisper recipient.");

    const whisper = Array.from(new Set([...recipients, game.user.id]));
    const speaker = ChatMessage.getSpeaker?.() ?? { alias: game.user?.name || "Adventurer's Tome" };
    await ChatMessage.create({
      user: game.user?.id,
      content: AdventurersTomeApp._formatSelectedChatContent.call(this, text),
      speaker,
      whisper
    });
    AdventurersTomeApp._clearSelectedShareText.call(this);
  }

  static async _onOpenJournal(_event, target) {
    const journal = game.journal.get(target.dataset.journalId);
    if (!journal || !canViewInTome(journal)) return ui.notifications.warn("Adventurer's Tome: Journal not found or not visible.");
    const refKey = String(target.dataset.refKey || inferJournalRefKey(journal) || "").trim();
    if (refKey) await recordRecentRef(refKey);
    journal.sheet.render(true);
  }

  static async _onBrowseBackground() {
    if (!game.user.isGM) return;
    const input = this.element?.querySelector('input[name="background"]');
    const current = input?.value || DEFAULT_BACKGROUND;
    const picker = new FilePicker({
      type: "image",
      current,
      callback: (path) => {
        if (input) input.value = path;
      }
    });
    await picker.render(true);
  }

  static _onResetBackground() {
    const input = this.element?.querySelector('input[name="background"]');
    if (input) input.value = DEFAULT_BACKGROUND;
  }

  static async _onBrowseSettingImage(_event, target) {
    if (!game.user.isGM) return;
    const inputName = String(target?.dataset?.inputName || "").trim();
    if (!inputName) return;
    const input = this.element?.querySelector(`[name="${CSS.escape(inputName)}"]`);
    const picker = new FilePicker({
      type: "image",
      current: input?.value || "",
      callback: (path) => { if (input) input.value = path; }
    });
    await picker.render(true);
  }

  _readSettingsForm() {
    const form = this.element?.querySelector(".at-settings-form");
    if (!form) return null;
    const data = new FormData(form);
    const nav = defaultNavConfig();
    for (const [id] of NAV_SECTION_DEFS) nav[id] = Boolean(form.querySelector(`input[name="nav_${id}"]`)?.checked);
    const homeLayout = [...form.querySelectorAll("[data-at-home-config-row]")].map((row) => ({
      id: String(row.dataset.homeBlockId || ""),
      visible: Boolean(row.querySelector('input[type="checkbox"]')?.checked),
      size: HOME_WIDGET_SIZES[String(row.querySelector('select[data-at-home-widget-size]')?.value || "normal")] ? String(row.querySelector('select[data-at-home-widget-size]')?.value || "normal") : "normal"
    })).filter((item) => HOME_BLOCK_DEFS.some(([id]) => id === item.id));
    const sectionBackgrounds = {};
    for (const key of SECTION_BACKGROUND_KEYS) sectionBackgrounds[key] = String(data.get(`sectionBackground_${key}`) || "").trim();
    return {
      campaignTitle: String(data.get("campaignTitle") || "").trim() || "Your Campaign",
      campaignSubtitle: String(data.get("campaignSubtitle") || "").trim(),
      background: String(data.get("background") || "").trim() || DEFAULT_BACKGROUND,
      campaignLogo: String(data.get("campaignLogo") || "").trim(),
      theme: THEME_DEFS[String(data.get("theme") || "tome")] ? String(data.get("theme")) : "tome",
      currentLocation: String(data.get("currentLocation") || "").trim(),
      sessionLabel: String(data.get("sessionLabel") || "").trim() || "Session",
      welcomeTitle: String(data.get("welcomeTitle") || "").trim(),
      welcomeText: String(data.get("welcomeText") || "").trim(),
      defaultLanding: String(data.get("defaultLanding") || "home").trim(),
      nav,
      homeLayout: homeLayout.length ? homeLayout : defaultHomeLayout(),
      homeMode: HOME_MODES[String(data.get("homeMode") || "dashboard")] ? String(data.get("homeMode")) : "dashboard",
      homeHeroLayout: ["classic", "centered", "immersive"].includes(String(data.get("homeHeroLayout") || "classic")) ? String(data.get("homeHeroLayout")) : "classic",
      homeHeroHeight: ["standard", "tall", "full"].includes(String(data.get("homeHeroHeight") || "standard")) ? String(data.get("homeHeroHeight")) : "standard",
      homeHeroShade: ["soft", "balanced", "strong"].includes(String(data.get("homeHeroShade") || "balanced")) ? String(data.get("homeHeroShade")) : "balanced",
      homeHeroFocus: ["left", "center", "right"].includes(String(data.get("homeHeroFocus") || "center")) ? String(data.get("homeHeroFocus")) : "center",
      homeShowEnterButton: Boolean(form.querySelector('input[name="homeShowEnterButton"]')?.checked),
      homeEnterTarget: String(data.get("homeEnterTarget") || "sessions"),
      homeAtGlance: Boolean(form.querySelector('input[name="homeAtGlance"]')?.checked),
      homeSidebarCampaign: Boolean(form.querySelector('input[name="homeSidebarCampaign"]')?.checked),
      homeSidebarQuickLinks: Boolean(form.querySelector('input[name="homeSidebarQuickLinks"]')?.checked),
      groupHomeLimit: clamp(Number(data.get("groupHomeLimit") || 3), 1, 8),
      groupSort: ["manual", "name"].includes(String(data.get("groupSort") || "manual")) ? String(data.get("groupSort")) : "manual",
      defaultQuestStatus: normalizeQuestStatus(String(data.get("defaultQuestStatus") || "active")),
      defaultWorldCategory: WORLD_CATEGORIES[String(data.get("defaultWorldCategory") || "lore")] ? String(data.get("defaultWorldCategory")) : "lore",
      defaultTomeVisibility: TOME_VISIBILITY[String(data.get("defaultTomeVisibility") || "inherit")] ? String(data.get("defaultTomeVisibility")) : "inherit",
      defaultTomeDiscovered: Boolean(form.querySelector('input[name="defaultTomeDiscovered"]')?.checked),
      sectionBackgrounds,
      selectedActorIds: [...form.querySelectorAll('input[name="groupActor"]:checked')].map((element) => element.value)
    };
  }

  static async _onPreviewSettings() {
    if (!game.user.isGM) return;
    const values = this._readSettingsForm();
    if (!values) return;
    const shell = this.element?.querySelector(".at-shell");
    if (shell) {
      shell.classList.remove(...Object.values(THEME_DEFS).map((meta) => meta.className));
      shell.classList.add(THEME_DEFS[values.theme]?.className || THEME_DEFS.tome.className);
    }
    const backgroundUrl = resolveFoundryAssetUrl(values.background);
    const settingsBackground = values.sectionBackgrounds?.settings ? resolveFoundryAssetUrl(values.sectionBackgrounds.settings) : backgroundUrl;
    shell?.style.setProperty("--at-background", cssUrl(backgroundUrl));
    shell?.style.setProperty("--at-page-background", cssUrl(settingsBackground));
    const preview = this.element?.querySelector(".at-background-preview");
    if (preview) preview.style.backgroundImage = cssUrl(backgroundUrl);
    const logoUrl = values.campaignLogo ? resolveFoundryAssetUrl(values.campaignLogo) : "";
    const logoPreview = this.element?.querySelector("[data-at-logo-preview]");
    if (logoPreview) { logoPreview.src = logoUrl; logoPreview.hidden = !values.campaignLogo; }
    const brand = this.element?.querySelector(".at-brand");
    const existingLogo = brand?.querySelector(".at-brand-logo, .at-brand-icon");
    if (brand && existingLogo) {
      const replacement = document.createElement("span");
      if (logoUrl) {
        replacement.className = "at-brand-logo";
        const image = document.createElement("img");
        image.src = logoUrl;
        image.alt = "Campaign logo";
        replacement.appendChild(image);
      } else { replacement.className = "at-brand-icon"; replacement.innerHTML = '<i class="fa-solid fa-book-open"></i>'; }
      existingLogo.replaceWith(replacement);
    }
    ui.notifications.info("Adventurer's Tome: Visual preview applied locally. Save to apply layout/navigation changes to the campaign.");
  }

  static async _onResetSettingsDefaults() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-settings-form");
    if (!form) return;
    const set = (name, value) => { const input = form.querySelector(`[name="${CSS.escape(name)}"]`); if (input) input.value = value; };
    set("campaignTitle", "Your Campaign");
    set("campaignSubtitle", "A living record of your adventures");
    set("background", DEFAULT_BACKGROUND);
    set("campaignLogo", "");
    set("theme", "tome");
    set("currentLocation", "Greyhaven");
    set("sessionLabel", "Session");
    set("welcomeTitle", "The story continues…");
    set("welcomeText", "The road leads onward. Allies await, mysteries deepen, and legends are born.");
    set("defaultLanding", "home");
    set("homeMode", "dashboard");
    set("homeHeroLayout", "classic");
    set("homeHeroHeight", "standard");
    set("homeHeroShade", "balanced");
    set("homeHeroFocus", "center");
    set("homeEnterTarget", "sessions");
    { const input = form.querySelector('input[name="homeShowEnterButton"]'); if (input) input.checked = false; }
    set("groupHomeLimit", "3");
    set("groupSort", "manual");
    set("defaultQuestStatus", "active");
    set("defaultWorldCategory", "lore");
    set("defaultTomeVisibility", "inherit");
    { const input = form.querySelector('input[name="defaultTomeDiscovered"]'); if (input) input.checked = true; }
    for (const [id] of NAV_SECTION_DEFS) { const input = form.querySelector(`input[name="nav_${id}"]`); if (input) input.checked = true; }
    for (const name of ["homeAtGlance", "homeSidebarCampaign", "homeSidebarQuickLinks"]) { const input = form.querySelector(`input[name="${name}"]`); if (input) input.checked = true; }
    for (const [id, _label, _icon, defaultVisible = true, defaultSize = "normal"] of HOME_BLOCK_DEFS) {
      const row = form.querySelector(`[data-home-block-id="${id}"]`);
      if (!row) continue;
      const input = row.querySelector('input[type="checkbox"]');
      const size = row.querySelector('select[data-at-home-widget-size]');
      if (input) input.checked = defaultVisible;
      if (size) size.value = defaultSize;
    }
    const homeList = form.querySelector("[data-at-home-layout-list]");
    if (homeList) for (const [id] of HOME_BLOCK_DEFS) { const row = homeList.querySelector(`[data-home-block-id="${id}"]`); if (row) homeList.appendChild(row); }
    for (const key of SECTION_BACKGROUND_KEYS) set(`sectionBackground_${key}`, "");
    await AdventurersTomeApp._onPreviewSettings.call(this);
  }

  static async _onSaveSettings() {
    if (!game.user.isGM) return;
    const values = this._readSettingsForm();
    if (!values) return;
    const selectedSet = new Set(values.selectedActorIds);

    const updates = {
      campaignTitle: values.campaignTitle,
      campaignSubtitle: values.campaignSubtitle,
      background: values.background,
      campaignLogo: values.campaignLogo,
      theme: values.theme,
      sectionBackgrounds: JSON.stringify(values.sectionBackgrounds),
      currentLocation: values.currentLocation,
      sessionLabel: values.sessionLabel,
      welcomeTitle: values.welcomeTitle,
      welcomeText: values.welcomeText,
      homeLayout: JSON.stringify(values.homeLayout),
      homeMode: values.homeMode,
      homeHeroLayout: values.homeHeroLayout,
      homeHeroHeight: values.homeHeroHeight,
      homeHeroShade: values.homeHeroShade,
      homeHeroFocus: values.homeHeroFocus,
      homeShowEnterButton: values.homeShowEnterButton,
      homeEnterTarget: values.homeEnterTarget,
      homeAtGlance: values.homeAtGlance,
      homeSidebarCampaign: values.homeSidebarCampaign,
      homeSidebarQuickLinks: values.homeSidebarQuickLinks,
      navConfig: JSON.stringify(values.nav),
      defaultLanding: values.defaultLanding === "home" || values.nav[values.defaultLanding] ? values.defaultLanding : "home",
      groupHomeLimit: values.groupHomeLimit,
      groupSort: values.groupSort,
      defaultQuestStatus: values.defaultQuestStatus,
      defaultWorldCategory: values.defaultWorldCategory,
      defaultTomeVisibility: values.defaultTomeVisibility,
      defaultTomeDiscovered: values.defaultTomeDiscovered
    };

    for (const [key, value] of Object.entries(updates)) await game.settings.set(MODULE_ID, key, value);

    // Membership is Tome-owned metadata on the Actor document. This is generic
    // Foundry Document data and does not touch the active game's system schema.
    let nextOrder = 10;
    for (const actor of game.actors.contents) {
      const shouldBeMember = selectedSet.has(actor.id);
      const currentMember = actor.getFlag(MODULE_ID, FLAGS.GROUP_MEMBER);
      if (currentMember !== shouldBeMember) await actor.setFlag(MODULE_ID, FLAGS.GROUP_MEMBER, shouldBeMember);
      if (shouldBeMember && actor.getFlag(MODULE_ID, FLAGS.GROUP_ORDER) == null) await actor.setFlag(MODULE_ID, FLAGS.GROUP_ORDER, nextOrder);
      if (shouldBeMember) nextOrder += 10;
    }

    // Keep the old setting in sync for backwards compatibility with v0.1.0.
    await game.settings.set(MODULE_ID, "groupActors", JSON.stringify(values.selectedActorIds));

    ui.notifications.info("Adventurer's Tome settings saved.");
    this.activeTab = values.defaultLanding === "home" || values.nav[values.defaultLanding] ? values.defaultLanding : "home";
    await this.render({ parts: ["main"] });
  }

  static async _onOpenImporter(_event, target) {
    if (!game.user.isGM) return;
    const mode = String(target?.dataset?.importMode || "auto");
    this.importMode = IMPORT_MODES[mode] ? mode : "auto";
    this.importError = "";
    this.importPreview = null;
    this.importLastResult = null;
    this.activeTab = "import";
    await this.render({ parts: ["main"] });
  }

  static async _onPreviewImport() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".at-import-form");
    if (!form) return;
    const data = new FormData(form);
    this.importMode = String(data.get("importMode") || "auto");
    this.importSourceName = String(data.get("importSourceName") || "").trim();
    this.importText = String(data.get("importText") || "");
    this.importError = "";
    this.importLastResult = null;
    try {
      this.importPreview = buildImportPreview({
        text: this.importText,
        mode: this.importMode,
        sourceName: this.importSourceName
      });
      ui.notifications.info(`Adventurer's Tome: Preview ready — ${this.importPreview.entries.length} item(s), no data changed yet.`);
    } catch (error) {
      this.importPreview = null;
      this.importError = error.message;
      console.warn("Adventurer's Tome | Import preview failed", error);
    }
    await this.render({ parts: ["main"] });
  }

  static async _onClearImport() {
    if (!game.user.isGM) return;
    this.importText = "";
    this.importSourceName = "";
    this.importPreview = null;
    this.importError = "";
    this.importLastResult = null;
    await this.render({ parts: ["main"] });
  }

  static async _onApplyImport() {
    if (!game.user.isGM || !this.importPreview?.entries?.length) return;
    const selections = {};
    for (const select of this.element?.querySelectorAll?.("[data-at-import-action]") || []) {
      selections[select.dataset.importKey] = select.value;
    }
    const linkSelections = {};
    for (const select of this.element?.querySelectorAll?.("[data-at-import-link-action]") || []) {
      linkSelections[select.dataset.importLinkKey] = select.value;
    }
    const createCount = Object.values(selections).filter((value) => value === "create").length;
    const updateCount = Object.values(selections).filter((value) => value === "update").length;
    const skipCount = Object.values(selections).filter((value) => value === "skip").length;
    const linkCount = Object.values(linkSelections).filter((value) => value === "apply").length;
    const proceed = await confirmDemoAction({
      title: "Apply Adventurer's Tome Import",
      content: `<p>Apply this import?</p><p><strong>${createCount}</strong> create · <strong>${updateCount}</strong> update · <strong>${skipCount}</strong> skip · <strong>${linkCount}</strong> cross-links</p><p>The preview itself has not changed any Foundry data. This transaction can be undone from Import History until another import is applied.</p>`
    });
    if (!proceed) return;

    this._bulkUpdating = true;
    try {
      const preview = this.importPreview;
      const result = await applyImportPreview(preview, selections, linkSelections);
      this.importLastResult = {
        ...result,
        sourceName: preview.sourceName,
        modeLabel: preview.modeLabel,
        hasFailures: Boolean(result.failed || result.linksFailed)
      };
      this.importPreview = null;
      this.importText = "";
      this.importSourceName = "";
      this.importError = "";
      const message = `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.linksApplied} cross-links${result.failed || result.linksFailed ? `, ${result.failed + result.linksFailed} failed` : ""}.`;
      if (result.failed) ui.notifications.warn(`Adventurer's Tome: ${message}`);
      else ui.notifications.info(`Adventurer's Tome: ${message}`);
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error("Adventurer's Tome | Import failed", error);
      this.importError = error.message;
      ui.notifications.error(`Adventurer's Tome import failed: ${error.message}`);
      await this.render({ parts: ["main"] });
    } finally {
      this._bulkUpdating = false;
    }
  }

  static async _onClearImportHistory() {
    if (!game.user.isGM || !getImportHistory().length) return;
    const proceed = await confirmDemoAction({
      title: "Clear Import History",
      content: "<p>Clear the Adventurer's Tome import audit history?</p><p>This does <strong>not</strong> delete any imported Journals.</p>"
    });
    if (!proceed) return;
    await game.settings.set(MODULE_ID, PRIVATE_IMPORT_HISTORY_SETTING, "[]");
    await this.render({ parts: ["main"] });
  }

  static async _onUndoLastImport() {
    if (!game.user.isGM || !getLastImportUndo()?.transactionId) return;
    const proceed = await confirmDemoAction({
      title: "Undo Last Tome Import",
      content: "<p>Undo the most recent Adventurer's Tome import transaction?</p><p>Newly created import Journals will be deleted and Tome-managed fields, text, and cross-links changed by that import will be restored.</p><p><strong>This only applies to the latest import transaction.</strong></p>"
    });
    if (!proceed) return;
    this._bulkUpdating = true;
    try {
      const result = await undoLastImport();
      this.importLastResult = null;
      ui.notifications.info(`Adventurer's Tome: Import undone — ${result.deleted} created entries removed, ${result.restored} existing documents restored.`);
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error("Adventurer's Tome | Undo import failed", error);
      ui.notifications.error(`Adventurer's Tome undo failed: ${error.message}`);
    } finally {
      this._bulkUpdating = false;
    }
  }

  static async _onGenerateSmallDemo() {
    if (!game.user.isGM) return;
    if (getDemoSummary().active) return ui.notifications.warn("Adventurer's Tome: Remove the current demo before generating another one.");
    const proceed = await confirmDemoAction({
      title: "Generate Small Ashen Road Demo",
      content: "<p>This creates a compact <strong>The Ashen Road</strong> original test dataset with Actors, sessions, quests, World entries, rules, facts, and relations.</p><p>Your current Tome presentation settings are saved and restored when the demo is removed.</p>"
    });
    if (!proceed) return;
    ui.notifications.info("Adventurer's Tome: Generating the Small Ashen Road Demo…");
    try {
      const result = await generateDemoCampaign("small");
      ui.notifications.info(`Small Ashen Road Demo ready: ${result.actors} Actors and ${result.journals} Journals.`);
      this.activeTab = "home";
      await this.render({ parts: ["main"] });
    } catch (error) {
      ui.notifications.error(`Adventurer's Tome demo generation failed: ${error.message}`);
    }
  }

  static async _onGenerateFullDemo() {
    if (!game.user.isGM) return;
    if (getDemoSummary().active) return ui.notifications.warn("Adventurer's Tome: Remove the current demo before generating another one.");
    const proceed = await confirmDemoAction({
      title: "Generate Full Ashen Road Demo",
      content: "<p>This creates a larger <strong>The Ashen Road</strong> stress-test dataset: party members, relation NPCs, many sessions, quests, locations, factions, items, lore entries, and demo rules.</p><p>Generation can take a few seconds. Existing non-demo Actors and Journals are not changed.</p>"
    });
    if (!proceed) return;
    ui.notifications.info("Adventurer's Tome: Generating the Full Ashen Road Demo…");
    try {
      const result = await generateDemoCampaign("full");
      ui.notifications.info(`Full Ashen Road Demo ready: ${result.actors} Actors and ${result.journals} Journals.`);
      this.activeTab = "home";
      await this.render({ parts: ["main"] });
    } catch (error) {
      ui.notifications.error(`Adventurer's Tome demo generation failed: ${error.message}`);
    }
  }

  static async _onRemoveDemo() {
    if (!game.user.isGM || !getDemoSummary().active) return;
    const proceed = await confirmDemoAction({
      title: "Remove Demo Campaign",
      content: "<p>Remove all documents and folders generated by Adventurer's Tome Demo Tools?</p><p><strong>Only data carrying the Tome demo flag is deleted.</strong> Your previous campaign presentation settings are restored.</p>"
    });
    if (!proceed) return;
    try {
      await removeDemoCampaign({ restoreSettings: true });
      ui.notifications.info("Adventurer's Tome demo data removed and previous presentation settings restored.");
      this.activeActorId = null;
      this.activeWorldId = null;
      this.profileEditing = false;
      this.worldEditing = false;
      this.activeTab = "settings";
      await this.render({ parts: ["main"] });
    } catch (error) {
      console.error("Adventurer's Tome | Demo cleanup failed", error);
      ui.notifications.error(`Adventurer's Tome demo cleanup failed: ${error.message}`);
    }
  }

  static async _onRunHealthCheck() {
    if (!game.user.isGM) return;
    this._healthReport = buildTomeHealthReport();
    const report = this._healthReport;
    if (report.healthy) ui.notifications.info(`Adventurer's Tome health check: ${report.summary}`);
    else ui.notifications.warn(`Adventurer's Tome health check: ${report.summary}`);
    this.settingsSection = "developer";
    await this.render({ parts: ["main"] });
  }

  static async _onRepairHealthIssues() {
    if (!game.user.isGM) return;
    const initial = this._healthReport || buildTomeHealthReport();
    if (!initial.repairable) {
      ui.notifications.info("Adventurer's Tome: No safe repairs are currently needed.");
      return;
    }
    const proceed = await confirmDemoAction({
      title: "Repair Adventurer's Tome",
      content: `<p>Apply ${initial.repairable} safe repair${initial.repairable === 1 ? "" : "s"}?</p><p>This removes stale references, broken links, invalid relation targets, and normalizes malformed Tome-owned metadata. It does not delete campaign Journals or Actors.</p>`
    });
    if (!proceed) return;
    this._bulkUpdating = true;
    try {
      const result = await repairTomeHealthIssues();
      this._healthReport = result.after;
      ui.notifications.info(`Adventurer's Tome: Repair complete. ${result.repaired} record change${result.repaired === 1 ? "" : "s"} applied.`);
    } catch (error) {
      console.error("Adventurer's Tome | Health repair failed", error);
      ui.notifications.error(`Adventurer's Tome health repair failed: ${error.message}`);
    } finally {
      this._bulkUpdating = false;
    }
    this.settingsSection = "developer";
    await this.render({ parts: ["main"] });
  }

  static async _onInitializeStructure() {
    if (!game.user.isGM) return;
    const root = await createJournalFolder("Adventurer's Tome");
    let worldFolder = null;
    for (const name of ["Sessions", "Quests", "World", "Rules"]) {
      const folder = await createJournalFolder(name, root);
      if (name === "World") worldFolder = folder;
    }
    if (worldFolder) {
      for (const name of ["NPCs", "Locations", "Factions", "Items", "Lore"]) await createJournalFolder(name, worldFolder);
    }
    ui.notifications.info("Adventurer's Tome journal folders are ready.");
    await this.render({ parts: ["main"] });
  }
}

function registerSettings() {
  registerSetting("campaignTitle", { type: String, default: "Your Campaign" });
  registerSetting("campaignSubtitle", { type: String, default: "A living record of your adventures" });
  registerSetting("background", { type: String, default: DEFAULT_BACKGROUND });
  registerSetting("currentLocation", { type: String, default: "Greyhaven" });
  registerSetting("sessionLabel", { type: String, default: "Session" });
  registerSetting("welcomeTitle", { type: String, default: "The story continues…" });
  registerSetting("welcomeText", { type: String, default: "The road leads onward. Allies await, mysteries deepen, and legends are born." });

  // v0.12 GM / Campaign configuration. These settings affect Tome presentation only.
  registerSetting("campaignLogo", { type: String, default: "" });
  registerSetting("theme", { type: String, default: "tome" });
  registerSetting("sectionBackgrounds", { type: String, default: "{}" });
  registerSetting("homeLayout", { type: String, default: JSON.stringify(defaultHomeLayout()) });
  registerSetting("homeMode", { type: String, default: "dashboard" });
  registerSetting("homeHeroLayout", { type: String, default: "classic" });
  registerSetting("homeHeroHeight", { type: String, default: "standard" });
  registerSetting("homeHeroShade", { type: String, default: "balanced" });
  registerSetting("homeHeroFocus", { type: String, default: "center" });
  registerSetting("homeShowEnterButton", { type: Boolean, default: false });
  registerSetting("homeEnterTarget", { type: String, default: "sessions" });
  registerSetting("homeAtGlance", { type: Boolean, default: true });
  registerSetting("homeSidebarCampaign", { type: Boolean, default: true });
  registerSetting("homeSidebarQuickLinks", { type: Boolean, default: true });
  registerSetting("navConfig", { type: String, default: JSON.stringify(defaultNavConfig()) });
  registerSetting("defaultLanding", { type: String, default: "home" });
  registerSetting("groupHomeLimit", { type: Number, default: 3 });
  registerSetting("groupSort", { type: String, default: "manual" });
  registerSetting("defaultQuestStatus", { type: String, default: "active" });
  registerSetting("defaultWorldCategory", { type: String, default: "lore" });
  registerSetting("defaultTomeVisibility", { type: String, default: "inherit" });
  registerSetting("defaultTomeDiscovered", { type: Boolean, default: true });

  // Client-scoped: each user keeps their own Tome size, position, favorites, and navigation recents.
  registerSetting("windowState", { scope: "client", type: String, default: "" });
  registerSetting("favorites", { scope: "client", type: String, default: "[]" });
  registerSetting("recentItems", { scope: "client", type: String, default: "[]" });
  registerSetting("tomeTransparency", { scope: "client", type: Number, default: 0 });
  registerSetting("launcherPosition", { scope: "client", type: String, default: "" });

  // GM-private V13 user settings. These are intentionally not world-scoped:
  // other users get their own empty values rather than the GM's private data.
  registerSetting(PRIVATE_VAULT_SETTING, { scope: "user", type: String, default: "{}" });
  registerSetting(PRIVATE_REVEAL_SETTING, { scope: "user", type: String, default: "[]" });
  registerSetting(PRIVATE_IMPORT_HISTORY_SETTING, { scope: "user", type: String, default: "[]" });
  registerSetting(PRIVATE_IMPORT_UNDO_SETTING, { scope: "user", type: String, default: "" });
  registerSetting(PRIVATE_GM_WORKSPACE_SETTING, { scope: "user", type: String, default: "{\"scratchpad\":\"\",\"notes\":[],\"pads\":[],\"layout\":[],\"preset\":\"standard\"}" });

  // Legacy v0.1.0 storage. Hidden from Foundry settings and retained only so
  // existing worlds migrate cleanly when the GM next saves Campaign Settings.
  registerSetting("groupActors", { type: String, default: "[]" });

  // World-scoped state for the optional demo/test data generator.
  registerSetting("demoState", { type: String, default: "" });

  // Lightweight GM audit trail for Session / Quest imports.
  registerSetting("importHistory", { type: String, default: "[]" });
  registerSetting("lastImportUndo", { type: String, default: "" });
  registerSetting("revealQueue", { type: String, default: "[]" });
}

let tomeApp;

function getApp() {
  tomeApp ??= new AdventurersTomeApp();
  return tomeApp;
}

function installLauncher() {
  if (document.getElementById("adventurers-tome-launcher")) return;

  const button = document.createElement("button");
  button.id = "adventurers-tome-launcher";
  button.type = "button";
  button.title = `${game.i18n.localize("AT.Launch")} · Drag to move`;
  button.innerHTML = '<i class="fa-solid fa-book-open"></i><span>Adventurer\'s Tome</span>';
  document.body.appendChild(button);

  const defaultPos = () => ({ left: 14, top: Math.max(14, window.innerHeight - button.offsetHeight - 118) });
  const clampLauncher = (pos = {}) => {
    const width = button.offsetWidth || 150;
    const height = button.offsetHeight || 38;
    return {
      left: clamp(Number(pos.left ?? 14), 4, Math.max(4, window.innerWidth - width - 4)),
      top: clamp(Number(pos.top ?? defaultPos().top), 4, Math.max(4, window.innerHeight - height - 4))
    };
  };

  // Keep the launcher on a compositor transform while dragging. Updating
  // top/left forces layout on every pointer event and felt like the button was
  // trailing behind the cursor on some Foundry clients.
  let currentPos = { left: 14, top: defaultPos().top };
  const applyPos = (pos) => {
    currentPos = clampLauncher(pos);
    button.style.left = "0px";
    button.style.top = "0px";
    button.style.bottom = "auto";
    button.style.transform = `translate3d(${Math.round(currentPos.left)}px, ${Math.round(currentPos.top)}px, 0)`;
    return { ...currentPos };
  };

  const saved = safeJSONParse(game.settings.get(MODULE_ID, "launcherPosition"), null);
  applyPos(saved && typeof saved === "object" ? saved : defaultPos());

  let drag = null;
  let suppressNextClick = false;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: currentPos.left,
      originTop: currentPos.top,
      moved: false
    };
    button.classList.add("is-pointer-active");
    try { button.setPointerCapture?.(event.pointerId); } catch (_err) {}
  });

  button.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    event.preventDefault();
    button.classList.add("is-dragging");
    applyPos({ left: drag.originLeft + dx, top: drag.originTop + dy });
  });

  const finish = async (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    button.classList.remove("is-pointer-active", "is-dragging");
    try { button.releasePointerCapture?.(event.pointerId); } catch (_err) {}
    if (moved) {
      suppressNextClick = true;
      const pos = applyPos(currentPos);
      await game.settings.set(MODULE_ID, "launcherPosition", JSON.stringify(pos));
    }
  };

  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);
  button.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    getApp().render(true);
  });
  button.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    await game.settings.set(MODULE_ID, "launcherPosition", "");
    applyPos(defaultPos());
    ui.notifications.info("Adventurer's Tome launcher position reset.");
  });
  window.addEventListener("resize", () => applyPos(currentPos));
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", async () => {
  if (game.user?.isGM) {
    try {
      const migration = await migrateLegacyPrivateData();
      if (migration.migrated) console.info(`Adventurer's Tome | Migrated ${migration.migrated} private GM record(s) into the V13 user vault.`);
    } catch (error) {
      console.error("Adventurer's Tome | Private data migration failed", error);
      ui.notifications.error("Adventurer's Tome: GM private-data migration failed. Your legacy data was not intentionally deleted; check the console before editing GM Notes.");
    }
  }
  const module = game.modules.get(MODULE_ID);
  module.api = {
    open: () => getApp().render(true),
    app: () => getApp(),
    getGroup: () => getGroupActors(),
    getActorProfile: (actorOrId) => { const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId; return actor && canViewInTome(actor) ? getActorProfile(actor) : null; },
    getWorldProfile: (entryOrId) => { const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId; return entry && canViewInTome(entry) ? getWorldProfile(entry) : null; },
    getLinks: (document) => {
      if (!document || (!game.user.isGM && !canViewInTome(document))) return { sessions: [], quests: [], world: [], actors: [] };
      const links = getTomeLinks(document);
      if (game.user.isGM) return links;
      return {
        sessions: links.sessions.filter((id) => { const d = game.journal.get(id); return d && canViewInTome(d); }),
        quests: links.quests.filter((id) => { const d = game.journal.get(id); return d && canViewInTome(d); }),
        world: links.world.filter((id) => { const d = game.journal.get(id); return d && canViewInTome(d); }),
        actors: links.actors.filter((id) => { const d = game.actors.get(id); return d && canViewInTome(d); })
      };
    },
    getAccess: (document) => getTomeAccess(document),
    canView: (document) => canViewInTome(document),
    setAccess: async (document, access = {}) => {
      if (!game.user.isGM) throw new Error("Only a GM can change Adventurer's Tome access metadata.");
      if (!document?.setFlag) throw new Error("A Foundry Document is required.");
      const notes = Array.isArray(access.notes) ? access.notes.map(normalizeGmNote) : normalizeGmNotes(access);
      const result = await saveTomeAccess(document, { visibility: access.visibility, discovered: access.discovered !== false, notes });
      if (tomeApp?.rendered) await tomeApp.render({ parts: ["main"] });
      return result;
    },
    getFavorites: () => getFavoriteRefs(),
    getRecentItems: () => getRecentRefs(),
    setLinks: async (document, links = {}) => {
      if (!game.user.isGM) throw new Error("Only a GM can change Adventurer's Tome links.");
      if (!document?.setFlag) throw new Error("A Foundry Document is required.");
      await document.setFlag(MODULE_ID, FLAGS.LINKS, links);
      if (tomeApp?.rendered) await tomeApp.render({ parts: ["main"] });
      return getTomeLinks(document);
    },
    setActorProfile: async (actorOrId, profile = {}) => {
      if (!game.user.isGM) throw new Error("Only a GM can change Adventurer's Tome profiles.");
      const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId;
      if (!actor) throw new Error("Actor not found.");
      const facts = Array.isArray(profile.facts) ? profile.facts : [];
      const relations = Array.isArray(profile.relations) ? profile.relations : [];
      await actor.setFlag(MODULE_ID, FLAGS.PROFILE, {
        ...profile,
        facts: facts.filter((fact) => factVisibility(fact?.visibility) !== "gm"),
        relations: relations.filter((relation) => factVisibility(relation?.visibility) !== "gm")
      });
      await setPrivateOverlay(actor, { facts: facts.filter((fact) => factVisibility(fact?.visibility) === "gm"), relations: relations.filter((relation) => factVisibility(relation?.visibility) === "gm") });
      if (tomeApp?.rendered) await tomeApp.render({ parts: ["main"] });
      return getActorProfile(actor);
    },
    setWorldProfile: async (entryOrId, profile = {}) => {
      if (!game.user.isGM) throw new Error("Only a GM can change Adventurer's Tome world profiles.");
      const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId;
      if (!entry) throw new Error("Journal entry not found.");
      const facts = Array.isArray(profile.facts) ? profile.facts : [];
      await entry.setFlag(MODULE_ID, FLAGS.WORLD_PROFILE, { ...profile, facts: facts.filter((fact) => factVisibility(fact?.visibility) !== "gm") });
      await setPrivateOverlay(entry, { facts: facts.filter((fact) => factVisibility(fact?.visibility) === "gm") });
      if (tomeApp?.rendered) await tomeApp.render({ parts: ["main"] });
      return getWorldProfile(entry);
    },
    previewImport: ({ text = "", mode = "auto", sourceName = "" } = {}) => { if (!game.user.isGM) throw new Error("Only a GM can preview Tome imports."); return buildImportPreview({ text, mode, sourceName }); },
    applyImport: async (preview, selections = {}, linkSelections = {}) => applyImportPreview(preview, selections, linkSelections),
    undoLastImport: async () => undoLastImport(),
    getImportHistory: () => { if (!game.user.isGM) return []; return getImportHistory(); },
    exportPortable: ({ playerSafe = false } = {}) => { if (!game.user.isGM) throw new Error("Only a GM can export Tome campaign data."); return buildPortableTomeExport({ playerSafe }); },
    exportBackup: () => { if (!game.user.isGM) throw new Error("Only a GM can export a private Tome backup."); return buildFullTomeBackup(); },
    getGmNotebook: () => { if (!game.user.isGM) return { rows: [], nextSession: 0, stats: {} }; return buildGmNotebookRows(); },
    getRevealQueue: () => { if (!game.user.isGM) return { queued: [], recent: [], queuedCount: 0, recentCount: 0 }; return buildRevealQueueView(); },
    queueReveal: async (refKey) => { if (!game.user.isGM) throw new Error("Only a GM can queue reveals."); return queueRevealRef(refKey); },
    quickCaptureInbox: () => game.user.isGM ? getQuickCaptureInbox() : null,
    generateDemo: async (variant = "small") => generateDemoCampaign(variant === "full" ? "full" : "small"),
    removeDemo: async () => removeDemoCampaign({ restoreSettings: true }),
    getDemoSummary: () => getDemoSummary(),
    healthCheck: ({ repair = false } = {}) => { if (!game.user.isGM) throw new Error("Only a GM can run Tome health diagnostics."); return repair ? repairTomeHealthIssues() : buildTomeHealthReport(); },
    setGroupMember: async (actorOrId, enabled = true) => {
      if (!game.user.isGM) throw new Error("Only a GM can change Adventurer's Tome group membership.");
      const actor = typeof actorOrId === "string" ? game.actors.get(actorOrId) : actorOrId;
      if (!actor) throw new Error("Actor not found.");
      await actor.setFlag(MODULE_ID, FLAGS.GROUP_MEMBER, Boolean(enabled));
      if (enabled && actor.getFlag(MODULE_ID, FLAGS.GROUP_ORDER) == null) {
        await actor.setFlag(MODULE_ID, FLAGS.GROUP_ORDER, (getGroupActors().length + 1) * 10);
      }
      if (tomeApp?.rendered) await tomeApp.render({ parts: ["main"] });
      return actor;
    },
    moduleId: MODULE_ID
  };

  installLauncher();
  game.socket.on(`module.${MODULE_ID}`, async (payload = {}) => {
    if (payload?.type !== "showTomeRef" || game.user.isGM) return;
    const sender = game.users?.get?.(String(payload.senderId || ""));
    if (!sender?.isGM) return;
    const refKey = String(payload.refKey || "").trim();
    let targetDocument = resolveTomeRefKey(refKey);
    if (!targetDocument) return;
    // A reveal may immediately follow a GM Discovered flag update. Give the
    // normal Foundry Document update a brief chance to arrive before deciding
    // the player still cannot see the target.
    if (!canViewInTome(targetDocument)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      targetDocument = resolveTomeRefKey(refKey);
    }
    if (!targetDocument || !canViewInTome(targetDocument)) return;
    const app = getApp();
    if (!app.rendered) await app.render(true);
    await app._openRefKey(refKey, { record: true });
    ui.notifications.info(`${targetDocument.name} was revealed by the GM.`);
  });
  console.log(`Adventurer's Tome | v${game.modules.get(MODULE_ID)?.version || "?"} ready for Foundry VTT ${game.version}`);
});

// Keep an open Tome in sync with generic Foundry document changes. Debounce
// external bulk edits so a large import or another module cannot trigger a
// render storm across dozens of create/update hooks.
let tomeRefreshTimer = null;
function scheduleTomeRefresh() {
  if (!tomeApp?.rendered || tomeApp._bulkUpdating) return;
  clearTimeout(tomeRefreshTimer);
  tomeRefreshTimer = setTimeout(() => {
    tomeRefreshTimer = null;
    if (tomeApp?.rendered && !tomeApp._bulkUpdating) tomeApp.render({ parts: ["main"] }).catch((error) => console.error("Adventurer's Tome | Background refresh failed", error));
  }, 90);
}
for (const hookName of ["createActor", "updateActor", "deleteActor", "createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, scheduleTomeRefresh);
}

