const ATAF_MODULE_ID = "adventurers-tome";
const ATAF_ROOT = "#adventurers-tome-app";
const ATAF_SAVE_DELAY = 800;
const ATAF_SUMMARY_ATTR = "data-at-tome-summary";
const ATAF_WORLD_CATEGORIES = Object.freeze({
  npc: "NPCs",
  location: "Locations",
  faction: "Factions",
  item: "Items",
  lore: "Lore"
});

const atAfPending = new Map();
let atAfEnhanceQueued = false;
let atAfSaveBadgeTimer = null;

function atAfEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atAfNormalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function atAfHtmlFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function atAfCanCreateJournals() {
  if (game.user?.isGM) return true;
  try {
    if (game.user?.can?.("JOURNAL_CREATE")) return true;
    if (game.user?.hasPermission?.("JOURNAL_CREATE")) return true;
  } catch (_err) {}
  return false;
}

function atAfCanEdit(journal) {
  if (!journal || !game.user) return false;
  if (game.user.isGM) return true;
  try {
    if (journal.isOwner === true) return true;
    if (journal.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  const editors = journal.getFlag?.(ATAF_MODULE_ID, "worldEditors");
  return Array.isArray(editors) && editors.map(String).includes(String(game.user.id));
}

function atAfCanViewPage(page, journal) {
  if (game.user?.isGM) return true;
  try {
    if (page?.testUserPermission?.(game.user, "OBSERVER")) return true;
    if (journal?.testUserPermission?.(game.user, "OBSERVER")) return true;
  } catch (_err) {}
  return Boolean(page?.visible ?? journal?.visible ?? false);
}

function atAfApp() {
  try { return game.modules.get(ATAF_MODULE_ID)?.api?.app?.(); } catch (_err) { return null; }
}

async function atAfWithoutBackgroundRender(callback) {
  const app = atAfApp();
  if (app) app._bulkUpdating = true;
  try {
    return await callback();
  } finally {
    window.setTimeout(() => { if (app) app._bulkUpdating = false; }, 180);
  }
}

function atAfEnsureSaveBadge(root = document.querySelector(ATAF_ROOT)) {
  if (!root) return null;
  let badge = root.querySelector(".at-authoring-save-state");
  if (badge) return badge;
  badge = document.createElement("div");
  badge.className = "at-authoring-save-state";
  badge.dataset.state = "saved";
  badge.innerHTML = '<i class="fa-solid fa-check"></i><span>Saved</span>';
  root.append(badge);
  return badge;
}

function atAfSetSaveState(state, text) {
  const badge = atAfEnsureSaveBadge();
  if (!badge) return;
  badge.dataset.state = state;
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : state === "editing" ? "fa-pen" : "fa-check";
  badge.innerHTML = `<i class="fa-solid ${icon}"></i><span>${atAfEscape(text || ({ editing: "Editing…", saving: "Saving…", saved: "Saved", error: "Save failed" })[state] || "Saved")}</span>`;
  badge.classList.add("is-visible");
  window.clearTimeout(atAfSaveBadgeTimer);
  if (state === "saved") atAfSaveBadgeTimer = window.setTimeout(() => badge.classList.remove("is-visible"), 1500);
}

function atAfScheduleSave(key, save) {
  const existing = atAfPending.get(key);
  if (existing?.timer) window.clearTimeout(existing.timer);
  atAfSetSaveState("editing");
  const record = { save, timer: null, running: false };
  record.timer = window.setTimeout(() => { void atAfFlushSave(key); }, ATAF_SAVE_DELAY);
  atAfPending.set(key, record);
}

async function atAfFlushSave(key) {
  const record = atAfPending.get(key);
  if (!record || record.running) return;
  if (record.timer) window.clearTimeout(record.timer);
  record.running = true;
  atAfSetSaveState("saving");
  try {
    await atAfWithoutBackgroundRender(record.save);
    atAfPending.delete(key);
    atAfSetSaveState("saved");
  } catch (error) {
    record.running = false;
    record.timer = window.setTimeout(() => { void atAfFlushSave(key); }, 1800);
    atAfPending.set(key, record);
    atAfSetSaveState("error", "Save failed — retrying");
    console.error("Adventurer's Tome | Authoring autosave failed", error);
  }
}

function atAfPrimaryPage(journal, section) {
  if (!journal) return null;
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (section === "world") {
    const profile = journal.getFlag?.(ATAF_MODULE_ID, "worldProfile") || {};
    const preferred = String(journal.getFlag?.(ATAF_MODULE_ID, "worldSyncPage") || profile?.syncPageId || "");
    if (preferred) {
      const found = pages.find((page) => page.id === preferred && String(page.type || "text") === "text");
      if (found) return found;
    }
  }
  return pages.find((page) => String(page.type || "text").toLowerCase() === "text") || null;
}

async function atAfEnsurePrimaryPage(journal, section) {
  let page = atAfPrimaryPage(journal, section);
  if (page) return page;
  const name = section === "sessions" ? "Chronicle" : "Overview";
  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name, type: "text", text: { content: "<p></p>", format: atAfHtmlFormat() }, sort: 100000 }]);
  page = created?.[0] || null;
  if (page && section === "world") await journal.setFlag(ATAF_MODULE_ID, "worldSyncPage", page.id);
  return page;
}

function atAfSummaryHtml(html, summary) {
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  let summaryNode = host.querySelector(`[${ATAF_SUMMARY_ATTR}]`);
  if (!summaryNode) {
    const targetText = atAfNormalize(summary);
    const paragraphs = [...host.querySelectorAll("p")];
    summaryNode = paragraphs.find((node) => atAfNormalize(node.textContent) === targetText) || null;
    if (!summaryNode) {
      summaryNode = document.createElement("p");
      host.prepend(summaryNode);
    }
    summaryNode.setAttribute(ATAF_SUMMARY_ATTR, "true");
  }
  summaryNode.textContent = String(summary || "").trim();
  return host.innerHTML || `<p ${ATAF_SUMMARY_ATTR}="true"></p>`;
}

async function atAfSaveSummary(journal, section, summary) {
  const page = await atAfEnsurePrimaryPage(journal, section);
  if (!page) throw new Error("No writable Journal page available for summary");
  const html = atAfSummaryHtml(page?.text?.content ?? "", summary);
  await page.update({ "text.content": html, "text.format": atAfHtmlFormat() });
}

function atAfDetail(root) {
  const world = root?.querySelector(".at-world-profile-page");
  if (world) {
    const button = world.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(button?.dataset?.journalId || ""));
    if (journal) return { section: "world", container: world, journal };
  }
  const quest = root?.querySelector(".at-quest-detail-page");
  if (quest) {
    const button = quest.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(button?.dataset?.journalId || ""));
    if (journal) return { section: "quests", container: quest, journal };
  }
  const session = root?.querySelector(".at-session-detail");
  if (session) {
    const button = session.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]');
    const journal = game.journal?.get(String(button?.dataset?.journalId || ""));
    if (journal) return { section: "sessions", container: session, journal };
  }
  return null;
}

function atAfMarkEditable(node, { journal, section, kind, page = null, mode = "plain" }) {
  if (!node || !journal || !atAfCanEdit(journal)) return;
  node.dataset.atAfEditable = "true";
  node.dataset.atAfJournalId = journal.id;
  node.dataset.atAfSection = section;
  node.dataset.atAfKind = kind;
  node.dataset.atAfMode = mode;
  if (page?.id) node.dataset.atAfPageId = page.id;
  node.classList.add("at-authoring-editable");
  node.title = mode === "rich" ? "Click to edit — autosaves" : `${node.title || "Click to edit"} — autosaves`;
}

function atAfEnhanceInline(detail) {
  if (!detail || !atAfCanEdit(detail.journal)) return;
  const { section, container, journal } = detail;
  if (section === "world") {
    const intro = container.querySelector(".at-profile-intro");
    atAfMarkEditable(intro?.querySelector("h1"), { journal, section, kind: "title" });
    const summary = intro ? [...intro.children].find((child) => child.tagName === "P") : null;
    atAfMarkEditable(summary, { journal, section, kind: "summary" });
    const known = [...container.querySelectorAll(".at-profile-panel")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Known Information");
    const primary = atAfPrimaryPage(journal, section);
    const knownText = known?.querySelector(".at-tome-richtext") || (known ? [...known.children].find((child) => !child.classList?.contains("at-profile-section-heading")) : null);
    if (primary) atAfMarkEditable(knownText, { journal, section, kind: "page", page: primary, mode: "rich" });
    for (const surface of container.querySelectorAll(".at-world-journal-page[data-page-id] .at-world-journal-text")) {
      const article = surface.closest("[data-page-id]");
      const page = journal.pages?.get(String(article?.dataset?.pageId || ""));
      if (page) atAfMarkEditable(surface, { journal, section, kind: "page", page, mode: "rich" });
    }
  } else if (section === "quests") {
    const hero = container.querySelector(".at-quest-detail-hero");
    atAfMarkEditable(hero?.querySelector("h1"), { journal, section, kind: "title" });
    const summary = hero?.querySelector(":scope > div > p") || hero?.querySelector("p");
    atAfMarkEditable(summary, { journal, section, kind: "summary" });
  } else if (section === "sessions") {
    atAfMarkEditable(container.querySelector(".at-session-detail-head h2"), { journal, section, kind: "title" });
    atAfMarkEditable(container.querySelector(".at-session-detail-summary"), { journal, section, kind: "summary" });
  }
}

async function atAfEnrichPageHtml(page) {
  const raw = String(page?.text?.content ?? "");
  if (game.user?.isGM) {
    try { return await TextEditor.enrichHTML(raw, { async: true, documents: true, secrets: true, relativeTo: page }); } catch (_err) { return raw; }
  }
  const host = document.createElement("div");
  host.innerHTML = raw;
  host.querySelectorAll(".secret, [data-secret='true'], section.secret").forEach((node) => node.remove());
  try { return await TextEditor.enrichHTML(host.innerHTML, { async: true, documents: true, secrets: false, relativeTo: page }); } catch (_err) { return host.innerHTML; }
}

function atAfMediaSrc(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;
  try { return foundry.utils.getRoute(value); } catch (_err) { return value; }
}

async function atAfRenderPage(page, journal, section) {
  const type = String(page.type || "text").toLowerCase();
  let body = "";
  if (type === "text") {
    body = `<div class="at-af-page-text at-tome-richtext at-shareable-text">${await atAfEnrichPageHtml(page) || '<p class="at-empty">This page is empty.</p>'}</div>`;
  } else if (type === "image") {
    const src = atAfMediaSrc(page.src);
    body = src ? `<figure class="at-af-media"><img src="${atAfEscape(src)}" alt="${atAfEscape(page.name)}">${page?.image?.caption ? `<figcaption>${atAfEscape(page.image.caption)}</figcaption>` : ""}</figure>` : '<p class="at-empty">No image source.</p>';
  } else if (type === "video") {
    const src = atAfMediaSrc(page.src);
    body = src ? `<div class="at-af-media"><video src="${atAfEscape(src)}" controls playsinline></video><a href="${atAfEscape(src)}" target="_blank" rel="noopener noreferrer">Open media</a></div>` : '<p class="at-empty">No video source.</p>';
  } else if (type === "pdf") {
    const src = atAfMediaSrc(page.src);
    body = src ? `<div class="at-af-media at-af-pdf"><iframe src="${atAfEscape(src)}" title="${atAfEscape(page.name)}"></iframe><a href="${atAfEscape(src)}" target="_blank" rel="noopener noreferrer">Open PDF</a></div>` : '<p class="at-empty">No PDF source.</p>';
  } else {
    body = `<p class="at-empty">${atAfEscape(type)} pages stay preserved in Foundry. Open Source in Foundry to edit this custom page type.</p>`;
  }
  return `<article class="at-af-page" data-page-id="${atAfEscape(page.id)}" data-page-type="${atAfEscape(type)}"><header><span>${atAfEscape(type)}</span><h3>${atAfEscape(page.name || "Untitled page")}</h3></header>${body}</article>`;
}

async function atAfRenderJournalPages(detail) {
  if (!detail || detail.section === "world") return;
  const { container, journal, section } = detail;
  const pages = [...(journal.pages?.contents ?? [])].filter((page) => atAfCanViewPage(page, journal)).sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const stamp = `${journal.id}:${pages.map((page) => `${page.id}:${page._stats?.modifiedTime || page.sort || 0}`).join("|")}`;
  const existing = container.querySelector(`.at-authoring-pages[data-journal-id="${CSS.escape(journal.id)}"]`);
  if (existing?.dataset?.stamp === stamp) return;
  existing?.remove();

  const shell = document.createElement("section");
  shell.className = "at-authoring-pages";
  shell.dataset.journalId = journal.id;
  shell.dataset.stamp = stamp;
  const editable = atAfCanEdit(journal);
  const rendered = [];
  for (const page of pages) rendered.push(await atAfRenderPage(page, journal, section));
  shell.innerHTML = `<div class="at-af-pages-head"><div><span class="at-kicker">Journal-backed content</span><h2>${section === "quests" ? "Quest Pages" : "Session Pages"}</h2><p>Real Foundry Journal pages, authored inside Tome.</p></div>${editable ? `<button type="button" class="at-secondary" data-at-af-add-page="${atAfEscape(journal.id)}"><i class="fa-solid fa-plus"></i> Page</button>` : ""}</div>${pages.length ? `<div class="at-af-pages-layout"><nav>${pages.map((page) => `<button type="button" data-at-af-scroll-page="${atAfEscape(page.id)}"><i class="fa-solid fa-file-lines"></i><span>${atAfEscape(page.name || "Untitled")}</span></button>`).join("")}</nav><div class="at-af-pages-document">${rendered.join("")}</div></div>` : '<p class="at-empty">No readable Journal pages yet.</p>';

  if (section === "sessions") {
    const open = container.querySelector(".at-session-open-full");
    if (open) open.insertAdjacentElement("beforebegin", shell);
    else container.append(shell);
  } else container.append(shell);

  if (editable) {
    for (const article of shell.querySelectorAll(".at-af-page[data-page-id]")) {
      const page = journal.pages?.get(String(article.dataset.pageId || ""));
      if (!page) continue;
      atAfMarkEditable(article.querySelector("h3"), { journal, section, kind: "pageTitle", page });
      if (String(page.type || "text") === "text") atAfMarkEditable(article.querySelector(".at-af-page-text"), { journal, section, kind: "page", page, mode: "rich" });
    }
  }
}

function atAfEditableKey(node) {
  return [node.dataset.atAfJournalId, node.dataset.atAfKind, node.dataset.atAfPageId || ""].join(":");
}

function atAfBeginEdit(node, event) {
  if (!node || node.dataset.atAfEditing === "true") return;
  const journal = game.journal?.get(String(node.dataset.atAfJournalId || ""));
  if (!journal || !atAfCanEdit(journal)) return;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  node.dataset.atAfEditing = "true";
  node.classList.add("is-editing");
  const mode = node.dataset.atAfMode || "plain";
  if (mode === "rich") {
    const page = journal.pages?.get(String(node.dataset.atAfPageId || ""));
    if (!page) return;
    node.dataset.atAfDisplayHtml = node.innerHTML;
    node.innerHTML = String(page?.text?.content ?? "<p></p>");
  }
  node.contentEditable = "true";
  node.spellcheck = true;
  node.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = globalThis.getSelection?.();
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);
  } catch (_err) {}
}

function atAfScheduleNodeSave(node) {
  const journal = game.journal?.get(String(node.dataset.atAfJournalId || ""));
  if (!journal) return;
  const section = String(node.dataset.atAfSection || "");
  const kind = String(node.dataset.atAfKind || "");
  const page = journal.pages?.get(String(node.dataset.atAfPageId || ""));
  const key = atAfEditableKey(node);
  const plain = String(node.textContent || "").trim();
  const rich = String(node.innerHTML || "<p></p>");
  atAfScheduleSave(key, async () => {
    if (kind === "title") await journal.update({ name: plain || journal.name });
    else if (kind === "summary") await atAfSaveSummary(journal, section, plain);
    else if (kind === "pageTitle" && page) await page.update({ name: plain || page.name });
    else if (kind === "page" && page) await page.update({ "text.content": rich, "text.format": atAfHtmlFormat() });
  });
}

async function atAfFinishEdit(node) {
  if (!node || node.dataset.atAfEditing !== "true") return;
  const key = atAfEditableKey(node);
  await atAfFlushSave(key);
  node.contentEditable = "false";
  node.dataset.atAfEditing = "false";
  node.classList.remove("is-editing");
  if ((node.dataset.atAfMode || "plain") === "rich") {
    const journal = game.journal?.get(String(node.dataset.atAfJournalId || ""));
    const page = journal?.pages?.get(String(node.dataset.atAfPageId || ""));
    if (page) node.innerHTML = await atAfEnrichPageHtml(page);
  }
}

function atAfFolderParentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

async function atAfEnsureFolder(name, parent = null) {
  const parentId = parent?.id ?? parent ?? null;
  const existing = game.folders?.find((folder) => folder.type === "JournalEntry" && folder.name === name && atAfFolderParentId(folder) === parentId);
  if (existing) return existing;
  return Folder.create({ name, type: "JournalEntry", folder: parentId });
}

async function atAfSectionFolder(section) {
  const root = await atAfEnsureFolder("Adventurer's Tome");
  const label = section === "sessions" ? "Sessions" : section === "quests" ? "Quests" : "World";
  return atAfEnsureFolder(label, root);
}

function atAfDescendantFolders(root) {
  if (!root) return [];
  const result = [];
  const walk = (parent, depth = 0) => {
    const children = [...(game.folders?.contents ?? game.folders ?? [])].filter((folder) => folder.type === "JournalEntry" && atAfFolderParentId(folder) === parent.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const child of children) { result.push({ folder: child, depth }); walk(child, depth + 1); }
  };
  walk(root, 0);
  return result;
}

function atAfModal(title, body, onSubmit) {
  document.querySelector(".at-authoring-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "at-authoring-modal-overlay";
  overlay.innerHTML = `<form class="at-authoring-modal"><header><div><span class="at-kicker">Tome Authoring</span><h2>${atAfEscape(title)}</h2></div><button type="button" data-at-af-close title="Close"><i class="fa-solid fa-xmark"></i></button></header><div class="at-authoring-modal-body">${body}</div><footer><button type="button" class="at-secondary" data-at-af-close>Cancel</button><button type="submit" class="at-primary"><i class="fa-solid fa-plus"></i> Create</button></footer></form>`;
  document.body.append(overlay);
  const form = overlay.querySelector("form");
  overlay.addEventListener("click", (event) => { if (event.target === overlay || event.target.closest("[data-at-af-close]")) overlay.remove(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await onSubmit(new FormData(form));
      overlay.remove();
    } catch (error) {
      console.error("Adventurer's Tome | Create failed", error);
      ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create content."}`);
      submit.disabled = false;
    }
  });
}

async function atAfOpenCreate(section) {
  const sectionFolder = await atAfSectionFolder(section);
  const descendants = atAfDescendantFolders(sectionFolder);
  const folderOptions = [`<option value="">${atAfEscape(sectionFolder.name)} (root)</option>`, ...descendants.map(({ folder, depth }) => `<option value="${atAfEscape(folder.id)}">${"— ".repeat(depth + 1)}${atAfEscape(folder.name)}</option>`)].join("");
  const worldFields = section === "world" ? `<label><span>World type</span><select name="category">${Object.entries(ATAF_WORLD_CATEGORIES).map(([id, label]) => `<option value="${id}">${atAfEscape(label.replace(/s$/, ""))}</option>`).join("")}</select></label>` : "";
  const questFields = section === "quests" ? '<label><span>Quest status</span><select name="status"><option value="active">Active</option><option value="dormant">Dormant</option><option value="completed">Completed</option><option value="failed">Failed</option></select></label>' : "";
  const sessionFields = section === "sessions" ? '<label><span>Session number <small>optional</small></span><input name="sessionNumber" type="number" min="1" step="1" placeholder="27"></label>' : "";
  const body = `<label><span>Create</span><select name="kind"><option value="entry">New ${section === "world" ? "World entry" : section === "quests" ? "Quest" : "Session"}</option><option value="folder">New folder / subfolder</option></select></label><label><span>Name</span><input name="name" required autocomplete="off" placeholder="${section === "world" ? "Bree" : section === "quests" ? "The Lost Ranger" : "A Night at the Crossroads"}"></label><label><span>Parent folder</span><select name="parent">${folderOptions}</select></label>${worldFields}${questFields}${sessionFields}<p class="at-authoring-help"><i class="fa-solid fa-database"></i> Tome creates real Foundry Journal data. Disabling Tome never traps the campaign inside the module.</p>`;
  atAfModal(`Create in ${section === "world" ? "World" : section === "quests" ? "Quests" : "Sessions"}`, body, async (data) => {
    const kind = String(data.get("kind") || "entry");
    const rawName = String(data.get("name") || "").trim();
    if (!rawName) throw new Error("Enter a name first.");
    const requestedParent = game.folders?.get(String(data.get("parent") || "")) || sectionFolder;
    if (kind === "folder") {
      await Folder.create({ name: rawName, type: "JournalEntry", folder: requestedParent.id });
      ui.notifications.info(`Adventurer's Tome: Created folder ${rawName}.`);
      await atAfApp()?.render?.({ parts: ["main"] });
      return;
    }

    let name = rawName;
    let folder = requestedParent;
    const flags = {};
    if (section === "world") {
      const category = String(data.get("category") || "lore");
      if (!data.get("parent")) folder = await atAfEnsureFolder(ATAF_WORLD_CATEGORIES[category] || "Lore", sectionFolder);
      flags.type = "world";
      flags.worldProfile = { category, subtitle: "", summary: "", body: "", heroImage: "", facts: [], summaryJournalBacked: true };
    } else if (section === "quests") {
      flags.type = "quests";
      flags.status = String(data.get("status") || "active");
    } else {
      flags.type = "sessions";
      const number = Number(data.get("sessionNumber") || 0);
      if (number > 0 && !new RegExp(`^session\\s+${number}\\b`, "i").test(name)) name = `Session ${number} — ${name}`;
    }
    const journal = await JournalEntry.create({ name, folder: folder.id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 }, flags: { [ATAF_MODULE_ID]: flags } });
    const pageName = section === "sessions" ? "Chronicle" : "Overview";
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: pageName, type: "text", text: { content: `<p ${ATAF_SUMMARY_ATTR}="true"></p><p></p>`, format: atAfHtmlFormat() }, sort: 100000 }]);
    if (section === "world" && created?.[0]) await journal.setFlag(ATAF_MODULE_ID, "worldSyncPage", created[0].id);
    ui.notifications.info(`Adventurer's Tome: Created ${name}.`);
    const app = atAfApp();
    await app?.render?.({ parts: ["main"] });
    window.setTimeout(() => {
      const root = document.querySelector(ATAF_ROOT);
      const selector = section === "world" ? `[data-action="openWorldProfile"][data-journal-id="${CSS.escape(journal.id)}"]` : section === "quests" ? `[data-action="openQuestDetail"][data-journal-id="${CSS.escape(journal.id)}"]` : `[data-action="selectSession"][data-journal-id="${CSS.escape(journal.id)}"]`;
      root?.querySelector(selector)?.click();
    }, 120);
  });
}

async function atAfOpenAddPage(journalId) {
  const journal = game.journal?.get(String(journalId || ""));
  if (!journal || !atAfCanEdit(journal)) return;
  const body = `<label><span>Page title</span><input name="name" required autocomplete="off" placeholder="History"></label><label><span>Page type</span><select name="type"><option value="text">Text</option><option value="image">Image</option><option value="video">Video</option><option value="pdf">PDF</option></select></label><label><span>Media source <small>Image / Video / PDF only. Drag & drop upload arrives in alpha.2.</small></span><input name="src" autocomplete="off" placeholder="worlds/my-world/media/file.webp"></label><p class="at-authoring-help"><i class="fa-solid fa-link"></i> This becomes a real JournalEntryPage and stays visible in Foundry.</p>`;
  atAfModal(`Add page to ${journal.name}`, body, async (data) => {
    const name = String(data.get("name") || "").trim();
    const type = String(data.get("type") || "text");
    const src = String(data.get("src") || "").trim();
    if (!name) throw new Error("Enter a page title first.");
    const maxSort = Math.max(0, ...[...(journal.pages?.contents ?? [])].map((page) => Number(page.sort || 0)));
    const pageData = { name, type, sort: maxSort + 100000 };
    if (type === "text") pageData.text = { content: "<p></p>", format: atAfHtmlFormat() };
    else pageData.src = src;
    await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
    ui.notifications.info(`Adventurer's Tome: Added ${name}.`);
    await atAfApp()?.render?.({ parts: ["main"] });
  });
}

function atAfAddCreateButtons(root) {
  if (!atAfCanCreateJournals()) return;
  const configs = [
    ["sessions", root.querySelector(".at-sessions-page .at-page-tools")],
    ["quests", root.querySelector(".at-quests-page .at-page-tools")],
    ["world", root.querySelector(".at-world-page .at-world-heading")]
  ];
  for (const [section, host] of configs) {
    if (!host || host.querySelector(`[data-at-af-create="${section}"]`)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "at-primary at-authoring-create";
    button.dataset.atAfCreate = section;
    button.innerHTML = '<i class="fa-solid fa-plus"></i> Create';
    host.append(button);
  }
}

function atAfAddPageButton(detail) {
  if (!detail || !atAfCanEdit(detail.journal)) return;
  const { section, container, journal } = detail;
  let host = null;
  if (section === "world" || section === "quests") host = container.querySelector(".at-profile-toolbar-actions");
  else host = container.querySelector(".at-session-detail-head");
  if (!host || host.querySelector(`[data-at-af-add-page="${CSS.escape(journal.id)}"]`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-secondary at-authoring-add-page";
  button.dataset.atAfAddPage = journal.id;
  button.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> Page';
  host.append(button);
}

async function atAfMigrateWorldSummaries() {
  if (!game.user?.isGM) return;
  let migrated = 0;
  for (const journal of game.journal?.contents ?? []) {
    const raw = journal.getFlag?.(ATAF_MODULE_ID, "worldProfile");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const profile = foundry.utils.deepClone(raw);
    const summary = String(profile.summary || "").trim();
    if (!summary || profile.summaryJournalBacked === true) continue;
    try {
      const page = await atAfEnsurePrimaryPage(journal, "world");
      if (!page) continue;
      const html = atAfSummaryHtml(page?.text?.content ?? "", summary);
      await page.update({ "text.content": html, "text.format": atAfHtmlFormat() });
      profile.summary = "";
      profile.summaryJournalBacked = true;
      await journal.setFlag(ATAF_MODULE_ID, "worldProfile", profile);
      migrated += 1;
    } catch (error) {
      console.warn(`Adventurer's Tome | Could not migrate World summary for ${journal.name}`, error);
    }
  }
  if (migrated) console.info(`Adventurer's Tome | Migrated ${migrated} World summaries into Journal-backed Overview content.`);
}

async function atAfEnhance() {
  const root = document.querySelector(ATAF_ROOT);
  if (!root) return;
  atAfEnsureSaveBadge(root);
  atAfAddCreateButtons(root);
  const detail = atAfDetail(root);
  if (detail) {
    atAfAddPageButton(detail);
    atAfEnhanceInline(detail);
    await atAfRenderJournalPages(detail);
  }
}

function atAfQueueEnhance() {
  if (atAfEnhanceQueued) return;
  atAfEnhanceQueued = true;
  window.requestAnimationFrame(() => {
    atAfEnhanceQueued = false;
    void atAfEnhance().catch((error) => console.error("Adventurer's Tome | Authoring enhancement failed", error));
  });
}

Hooks.once("ready", () => {
  if (game.user?.isGM) void atAfMigrateWorldSummaries().then(() => atAfApp()?.rendered && atAfApp()?.render?.({ parts: ["main"] }));

  document.addEventListener("click", (event) => {
    const create = event.target.closest("[data-at-af-create]");
    if (create) { event.preventDefault(); event.stopImmediatePropagation(); void atAfOpenCreate(String(create.dataset.atAfCreate || "")); return; }
    const addPage = event.target.closest("[data-at-af-add-page]");
    if (addPage) { event.preventDefault(); event.stopImmediatePropagation(); void atAfOpenAddPage(String(addPage.dataset.atAfAddPage || "")); return; }
    const scroll = event.target.closest("[data-at-af-scroll-page]");
    if (scroll) {
      event.preventDefault();
      const article = scroll.closest(".at-authoring-pages")?.querySelector(`.at-af-page[data-page-id="${CSS.escape(String(scroll.dataset.atAfScrollPage || ""))}"]`);
      article?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    const editable = event.target.closest("[data-at-af-editable='true']");
    if (!editable || event.target.closest("a, button, input, select, textarea")) return;
    atAfBeginEdit(editable, event);
  }, true);

  document.addEventListener("input", (event) => {
    const node = event.target.closest?.("[data-at-af-editing='true']");
    if (node) atAfScheduleNodeSave(node);
  }, true);

  document.addEventListener("focusout", (event) => {
    const node = event.target.closest?.("[data-at-af-editing='true']");
    if (node) void atAfFinishEdit(node);
  }, true);

  const observer = new MutationObserver(atAfQueueEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  atAfQueueEnhance();
});

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "createFolder", "updateFolder", "deleteFolder"]) {
  Hooks.on(hookName, () => window.setTimeout(atAfQueueEnhance, 40));
}
