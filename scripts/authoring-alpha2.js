const ATA2_MODULE_ID = "adventurers-tome";
const ATA2_ROOT = "#adventurers-tome-app";
const ATA2_WORLD_PROFILE = "worldProfile";
const ATA2_WORLD_SYNC_PAGE = "worldSyncPage";
const ATA2_PAGE_SORT_STEP = 100000;
const ATA2_RENAME_DELAY = 650;
const ATA2_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);
const atA2RenameTimers = new Map();
let atA2EnhanceQueued = false;
let atA2ActiveManagerJournalId = "";

function atA2Escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atA2App() {
  try { return game.modules.get(ATA2_MODULE_ID)?.api?.app?.(); } catch (_err) { return null; }
}

async function atA2WithoutBackgroundRender(callback) {
  const app = atA2App();
  if (app) app._bulkUpdating = true;
  try {
    return await callback();
  } finally {
    window.setTimeout(() => { if (app) app._bulkUpdating = false; }, 220);
  }
}

function atA2CanEdit(journal) {
  if (!journal || !game.user) return false;
  if (game.user.isGM) return true;
  try {
    if (journal.isOwner === true) return true;
    if (journal.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  const editors = journal.getFlag?.(ATA2_MODULE_ID, "worldEditors");
  return Array.isArray(editors) && editors.map(String).includes(String(game.user.id));
}

function atA2JournalFromDetail(root) {
  const world = root?.querySelector(".at-world-profile-page");
  if (world) {
    const source = world.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "world", container: world, journal };
  }
  const quest = root?.querySelector(".at-quest-detail-page");
  if (quest) {
    const source = quest.querySelector('[data-action="openJournal"][data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "quests", container: quest, journal };
  }
  const session = root?.querySelector(".at-session-detail");
  if (session) {
    const source = session.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]');
    const journal = game.journal?.get(String(source?.dataset?.journalId || ""));
    if (journal) return { section: "sessions", container: session, journal };
  }
  return null;
}

function atA2WorldProfile(journal) {
  const raw = journal?.getFlag?.(ATA2_MODULE_ID, ATA2_WORLD_PROFILE);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
}

function atA2ResolveMedia(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;
  try { return foundry.utils.getRoute(value); } catch (_err) { return value; }
}

function atA2NormalizeStoredPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(?:https?:|data:|blob:)/i.test(raw) && !raw.startsWith(globalThis.location?.origin || "__never__")) return raw;
  try {
    const url = new URL(raw, globalThis.location?.href || "http://localhost/");
    const decoded = decodeURIComponent(url.pathname || "");
    for (const marker of ["/worlds/", "/modules/", "/systems/", "/icons/", "/assets/"]) {
      const index = decoded.indexOf(marker);
      if (index >= 0) return decoded.slice(index + 1);
    }
  } catch (_err) {}
  return raw.replace(/^\.\//, "");
}

function atA2LooksLikeImage(value) {
  const src = String(value || "").split(/[?#]/)[0];
  const extension = src.includes(".") ? src.split(".").pop().toLowerCase() : "";
  return ATA2_IMAGE_EXTENSIONS.has(extension) || /^(?:data:image\/|blob:)/i.test(String(value || ""));
}

function atA2SafeFileBase(value) {
  return String(value || "image")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function atA2FilePickerClass() {
  return globalThis.FilePicker || foundry?.applications?.apps?.FilePicker?.implementation || foundry?.applications?.apps?.FilePicker || null;
}

async function atA2EnsureUploadDirectory() {
  const Picker = atA2FilePickerClass();
  if (!Picker?.createDirectory) throw new Error("Foundry FilePicker upload API is unavailable.");
  const worldId = atA2SafeFileBase(game.world?.id || "world");
  const parts = ["worlds", worldId, "adventurers-tome", "heroes"];
  let target = "";
  for (const part of parts) {
    target = target ? `${target}/${part}` : part;
    try { await Picker.createDirectory("data", target); } catch (_err) {}
  }
  return target;
}

async function atA2UploadHeroFile(file, journal) {
  if (!(file instanceof File)) throw new Error("Dropped item is not a file.");
  if (!String(file.type || "").startsWith("image/") && !atA2LooksLikeImage(file.name)) throw new Error("Drop an image file here.");
  const Picker = atA2FilePickerClass();
  if (!Picker?.upload) throw new Error("Foundry FilePicker upload API is unavailable.");
  const target = await atA2EnsureUploadDirectory();
  const ext = String(file.name || "image.webp").split(".").pop().toLowerCase();
  const safeExt = ATA2_IMAGE_EXTENSIONS.has(ext) ? ext : "webp";
  const renamed = new File([file], `${atA2SafeFileBase(journal.name)}-${Date.now()}.${safeExt}`, { type: file.type, lastModified: file.lastModified });
  const response = await Picker.upload("data", target, renamed, {}, { notify: false });
  const path = String(response?.path || response?.url || response?.file || "").trim();
  if (!path) throw new Error("Foundry did not return an uploaded image path.");
  return atA2NormalizeStoredPath(path);
}

function atA2PathFromObject(value) {
  if (!value || typeof value !== "object") return "";
  const direct = [value.path, value.src, value.img, value.image, value?.texture?.src, value?.prototypeToken?.texture?.src];
  for (const candidate of direct) {
    if (typeof candidate === "string" && atA2LooksLikeImage(candidate)) return atA2NormalizeStoredPath(candidate);
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== "object") continue;
    const candidate = atA2PathFromObject(child);
    if (candidate) return candidate;
  }
  return "";
}

async function atA2DroppedImagePath(dataTransfer) {
  const file = [...(dataTransfer?.files || [])].find((item) => String(item.type || "").startsWith("image/") || atA2LooksLikeImage(item.name));
  if (file) return { file };

  const uri = String(dataTransfer?.getData?.("text/uri-list") || "").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  if (uri && atA2LooksLikeImage(uri)) return { path: atA2NormalizeStoredPath(uri) };

  const html = String(dataTransfer?.getData?.("text/html") || "");
  if (html) {
    const host = document.createElement("div");
    host.innerHTML = html;
    const src = host.querySelector("img")?.getAttribute("src");
    if (src && atA2LooksLikeImage(src)) return { path: atA2NormalizeStoredPath(src) };
  }

  const plain = String(dataTransfer?.getData?.("text/plain") || "").trim();
  if (!plain) return {};
  if (atA2LooksLikeImage(plain)) return { path: atA2NormalizeStoredPath(plain) };
  try {
    const data = JSON.parse(plain);
    const direct = atA2PathFromObject(data);
    if (direct) return { path: direct };
    const uuid = String(data?.uuid || data?.documentUuid || "").trim();
    if (uuid && typeof fromUuid === "function") {
      const document = await fromUuid(uuid);
      const documentPath = atA2PathFromObject(document);
      if (documentPath) return { path: documentPath };
    }
  } catch (_err) {}
  return {};
}

async function atA2SaveHero(journal, path) {
  if (!journal || !atA2CanEdit(journal)) return;
  const profile = atA2WorldProfile(journal);
  profile.heroImage = String(path || "").trim();
  await atA2WithoutBackgroundRender(() => journal.setFlag(ATA2_MODULE_ID, ATA2_WORLD_PROFILE, profile));
  ui.notifications.info(profile.heroImage ? `Adventurer's Tome: Hero image updated for ${journal.name}.` : `Adventurer's Tome: Hero image removed from ${journal.name}.`);
  await atA2App()?.render?.({ parts: ["main"] });
}

function atA2OpenHeroPicker(journal) {
  const Picker = atA2FilePickerClass();
  if (!Picker) return ui.notifications.error("Adventurer's Tome: Foundry FilePicker is unavailable.");
  const current = atA2WorldProfile(journal).heroImage || "";
  const options = {
    type: "image",
    current,
    callback: (path) => { void atA2SaveHero(journal, atA2NormalizeStoredPath(path)); }
  };
  try {
    const picker = new Picker(options);
    try { picker.render({ force: true }); } catch (_err) { picker.render(true); }
  } catch (error) {
    console.error("Adventurer's Tome | Could not open hero FilePicker", error);
    ui.notifications.error("Adventurer's Tome: Could not open Foundry's image picker.");
  }
}

function atA2HeroMarkup(hasImage) {
  return `<div class="at-a2-hero-drop-ui"><div class="at-a2-hero-drop-message"><i class="fa-solid fa-image"></i><strong>${hasImage ? "Drop to replace hero" : "Drop hero image here"}</strong><span>From Foundry or your computer · click to browse</span></div><div class="at-a2-hero-actions">${hasImage ? '<button type="button" data-at-a2-hero-remove title="Remove hero image"><i class="fa-solid fa-trash"></i></button>' : ""}<button type="button" data-at-a2-hero-pick title="Choose hero image"><i class="fa-solid fa-folder-open"></i></button></div></div>`;
}

function atA2EnhanceHero(detail) {
  if (!detail || detail.section !== "world" || !atA2CanEdit(detail.journal)) return;
  const art = detail.container.querySelector(".at-world-profile-art");
  if (!art) return;
  art.dataset.atA2HeroDrop = "true";
  art.dataset.journalId = detail.journal.id;
  art.classList.add("at-a2-hero-dropzone");
  const hasImage = Boolean(String(atA2WorldProfile(detail.journal).heroImage || "").trim() || art.querySelector("img"));
  let ui = art.querySelector(":scope > .at-a2-hero-drop-ui");
  if (!ui) art.insertAdjacentHTML("beforeend", atA2HeroMarkup(hasImage));
}

function atA2PrimaryPageId(journal, section) {
  const pages = [...(journal?.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  if (!pages.length) return "";
  if (section === "world") {
    const profile = atA2WorldProfile(journal);
    const preferred = String(journal.getFlag?.(ATA2_MODULE_ID, ATA2_WORLD_SYNC_PAGE) || profile.syncPageId || "");
    if (preferred && pages.some((page) => page.id === preferred)) return preferred;
  }
  return pages.find((page) => String(page.type || "text").toLowerCase() === "text")?.id || pages[0]?.id || "";
}

function atA2TypeIcon(type) {
  return ({ text: "fa-file-lines", image: "fa-image", video: "fa-film", pdf: "fa-file-pdf" })[String(type || "text").toLowerCase()] || "fa-puzzle-piece";
}

function atA2PermissionOptions(page) {
  const current = Number(page?.ownership?.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1);
  return [
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1, "Inherit"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0, "None"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1, "Limited"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2, "Observer"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3, "Owner"]
  ].map(([value, label]) => `<option value="${value}" ${Number(value) === current ? "selected" : ""}>${label}</option>`).join("");
}

function atA2MoveOptions(sourceJournal) {
  const journals = [...(game.journal?.contents ?? [])]
    .filter((journal) => journal.id !== sourceJournal.id && atA2CanEdit(journal))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return ['<option value="">Choose destination…</option>', ...journals.map((journal) => `<option value="${atA2Escape(journal.id)}">${atA2Escape(journal.name)}</option>`)].join("");
}

function atA2PageRow(page, primaryId, journal) {
  const type = String(page.type || "text").toLowerCase();
  const primary = page.id === primaryId;
  return `<article class="at-a2-page-row ${primary ? "is-primary" : ""}" data-page-id="${atA2Escape(page.id)}" draggable="true">
    <div class="at-a2-page-grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></div>
    <div class="at-a2-page-type"><i class="fa-solid ${atA2TypeIcon(type)}"></i><span>${atA2Escape(type)}</span>${primary ? '<small>Primary</small>' : ""}</div>
    <label class="at-a2-page-name"><span>Page name</span><input type="text" value="${atA2Escape(page.name || "Untitled page")}" data-at-a2-page-name></label>
    <label class="at-a2-page-access"><span>Player access</span><select data-at-a2-page-access>${atA2PermissionOptions(page)}</select></label>
    <div class="at-a2-page-actions">
      <button type="button" data-at-a2-page-up title="Move up"><i class="fa-solid fa-chevron-up"></i></button>
      <button type="button" data-at-a2-page-down title="Move down"><i class="fa-solid fa-chevron-down"></i></button>
      <button type="button" data-at-a2-page-duplicate title="Duplicate page"><i class="fa-solid fa-copy"></i></button>
      <button type="button" data-at-a2-page-move title="Move to another Journal" ${primary ? "disabled" : ""}><i class="fa-solid fa-arrow-right-arrow-left"></i></button>
      <button type="button" class="at-a2-danger" data-at-a2-page-delete title="Delete page" ${primary ? "disabled" : ""}><i class="fa-solid fa-trash"></i></button>
    </div>
    <div class="at-a2-page-move-panel" hidden><select data-at-a2-page-destination>${atA2MoveOptions(journal)}</select><button type="button" class="at-primary" data-at-a2-page-move-confirm>Move</button></div>
  </article>`;
}

function atA2ManagerStatus(text = "All changes autosave", state = "saved") {
  return `<span class="at-a2-manager-status" data-state="${atA2Escape(state)}"><i class="fa-solid ${state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : "fa-check"}"></i>${atA2Escape(text)}</span>`;
}

function atA2SetManagerStatus(text, state = "saved") {
  const status = document.querySelector(ATA2_ROOT)?.querySelector(".at-a2-manager-status");
  if (!status) return;
  status.dataset.state = state;
  const icon = state === "saving" ? "fa-arrows-rotate" : state === "error" ? "fa-triangle-exclamation" : "fa-check";
  status.innerHTML = `<i class="fa-solid ${icon}"></i>${atA2Escape(text)}`;
}

function atA2ClosePageManager() {
  document.querySelector(ATA2_ROOT)?.querySelector(".at-a2-page-manager-overlay")?.remove();
  atA2ActiveManagerJournalId = "";
}

function atA2RenderPageManager(journal) {
  if (!journal || !atA2CanEdit(journal)) return;
  const root = document.querySelector(ATA2_ROOT);
  if (!root) return;
  root.querySelector(".at-a2-page-manager-overlay")?.remove();
  atA2ActiveManagerJournalId = journal.id;
  const typeFlag = String(journal.getFlag?.(ATA2_MODULE_ID, "type") || "");
  const section = typeFlag === "world" ? "world" : typeFlag === "quests" ? "quests" : typeFlag === "sessions" ? "sessions" : "journal";
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const primaryId = atA2PrimaryPageId(journal, section);
  const overlay = document.createElement("div");
  overlay.className = "at-a2-page-manager-overlay";
  overlay.dataset.journalId = journal.id;
  overlay.innerHTML = `<section class="at-a2-page-manager">
    <header class="at-a2-manager-head"><div><span class="at-kicker">Journal-backed structure</span><h2>Page Manager</h2><p>${atA2Escape(journal.name)} · real Foundry Journal Pages</p></div><div class="at-a2-manager-head-actions">${atA2ManagerStatus()}<button type="button" data-at-a2-manager-close title="Close"><i class="fa-solid fa-xmark"></i></button></div></header>
    <div class="at-a2-manager-add"><span>Add page</span><button type="button" data-at-a2-add-type="text"><i class="fa-solid fa-file-lines"></i> Text</button><button type="button" data-at-a2-add-type="image"><i class="fa-solid fa-image"></i> Image</button><button type="button" data-at-a2-add-type="video"><i class="fa-solid fa-film"></i> Video</button><button type="button" data-at-a2-add-type="pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button></div>
    <div class="at-a2-manager-hint"><i class="fa-solid fa-circle-info"></i><span>Rename, reorder, duplicate, move, delete, and set page access here. Changes are written immediately to the Foundry Journal. The Primary page cannot be moved or deleted because Tome uses it for the entry summary/body.</span></div>
    <div class="at-a2-page-list" data-at-a2-page-list>${pages.map((page) => atA2PageRow(page, primaryId, journal)).join("") || '<div class="at-empty">No pages yet. Create one above.</div>'}</div>
  </section>`;
  root.append(overlay);
}

function atA2ManagerJournal(target) {
  const overlay = target?.closest?.(".at-a2-page-manager-overlay") || document.querySelector(ATA2_ROOT)?.querySelector(".at-a2-page-manager-overlay");
  return game.journal?.get(String(overlay?.dataset?.journalId || "")) || null;
}

function atA2ManagerPage(target) {
  const journal = atA2ManagerJournal(target);
  const row = target?.closest?.(".at-a2-page-row[data-page-id]");
  return { journal, row, page: journal?.pages?.get(String(row?.dataset?.pageId || "")) || null };
}

async function atA2RefreshAfterPageChange(journal) {
  if (!journal) return;
  atA2RenderPageManager(journal);
  await atA2App()?.render?.({ parts: ["main"] });
  window.setTimeout(() => {
    const current = game.journal?.get(journal.id);
    if (current && atA2ActiveManagerJournalId === journal.id) atA2RenderPageManager(current);
  }, 80);
}

async function atA2CreatePage(journal, type) {
  const normalized = ["text", "image", "video", "pdf"].includes(type) ? type : "text";
  const pages = [...(journal.pages?.contents ?? [])];
  const maxSort = Math.max(0, ...pages.map((page) => Number(page.sort || 0)));
  const label = normalized === "text" ? "New Text Page" : normalized === "image" ? "New Image Page" : normalized === "video" ? "New Video Page" : "New PDF Page";
  const data = { name: label, type: normalized, sort: maxSort + ATA2_PAGE_SORT_STEP };
  if (normalized === "text") data.text = { content: "<p></p>", format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 };
  else data.src = "";
  atA2SetManagerStatus("Creating page…", "saving");
  await atA2WithoutBackgroundRender(() => journal.createEmbeddedDocuments("JournalEntryPage", [data]));
  await atA2RefreshAfterPageChange(journal);
}

function atA2ScheduleRename(input, page) {
  const key = `${page.parent?.id || "journal"}:${page.id}`;
  window.clearTimeout(atA2RenameTimers.get(key));
  atA2SetManagerStatus("Editing…", "saving");
  const timer = window.setTimeout(async () => {
    const name = String(input.value || "").trim() || page.name || "Untitled page";
    try {
      await atA2WithoutBackgroundRender(() => page.update({ name }));
      atA2SetManagerStatus("Saved", "saved");
    } catch (error) {
      console.error("Adventurer's Tome | Page rename failed", error);
      atA2SetManagerStatus("Rename failed", "error");
    } finally {
      atA2RenameTimers.delete(key);
    }
  }, ATA2_RENAME_DELAY);
  atA2RenameTimers.set(key, timer);
}

async function atA2PersistDomOrder(list) {
  const journal = atA2ManagerJournal(list);
  if (!journal) return;
  const ids = [...list.querySelectorAll(".at-a2-page-row[data-page-id]")].map((row) => String(row.dataset.pageId || ""));
  const updates = ids.map((id, index) => ({ _id: id, sort: (index + 1) * ATA2_PAGE_SORT_STEP }));
  atA2SetManagerStatus("Saving order…", "saving");
  await atA2WithoutBackgroundRender(() => journal.updateEmbeddedDocuments("JournalEntryPage", updates));
  atA2SetManagerStatus("Saved", "saved");
}

async function atA2MoveRow(row, direction) {
  const list = row?.parentElement;
  if (!list) return;
  const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling?.matches?.(".at-a2-page-row")) return;
  if (direction === "up") list.insertBefore(row, sibling);
  else list.insertBefore(sibling, row);
  await atA2PersistDomOrder(list);
}

async function atA2DuplicatePage(journal, page) {
  const data = page.toObject();
  delete data._id;
  data.name = `${page.name || "Untitled page"} Copy`;
  const maxSort = Math.max(0, ...[...(journal.pages?.contents ?? [])].map((item) => Number(item.sort || 0)));
  data.sort = maxSort + ATA2_PAGE_SORT_STEP;
  atA2SetManagerStatus("Duplicating…", "saving");
  await atA2WithoutBackgroundRender(() => journal.createEmbeddedDocuments("JournalEntryPage", [data]));
  await atA2RefreshAfterPageChange(journal);
}

async function atA2DeletePage(journal, page, button) {
  if (button.dataset.confirm !== "true") {
    button.dataset.confirm = "true";
    button.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Confirm</span>';
    button.title = "Click again to permanently delete this page";
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.confirm = "false";
      button.innerHTML = '<i class="fa-solid fa-trash"></i>';
      button.title = "Delete page";
    }, 4000);
    return;
  }
  atA2SetManagerStatus("Deleting…", "saving");
  await atA2WithoutBackgroundRender(() => journal.deleteEmbeddedDocuments("JournalEntryPage", [page.id]));
  await atA2RefreshAfterPageChange(journal);
}

async function atA2MovePageToJournal(sourceJournal, page, targetJournal) {
  if (!sourceJournal || !page || !targetJournal || sourceJournal.id === targetJournal.id) return;
  const data = page.toObject();
  delete data._id;
  const maxSort = Math.max(0, ...[...(targetJournal.pages?.contents ?? [])].map((item) => Number(item.sort || 0)));
  data.sort = maxSort + ATA2_PAGE_SORT_STEP;
  atA2SetManagerStatus(`Moving to ${targetJournal.name}…`, "saving");
  await atA2WithoutBackgroundRender(async () => {
    await targetJournal.createEmbeddedDocuments("JournalEntryPage", [data]);
    await sourceJournal.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
  });
  ui.notifications.info(`Adventurer's Tome: Moved ${page.name} to ${targetJournal.name}.`);
  await atA2RefreshAfterPageChange(sourceJournal);
}

function atA2EnhancePageButtons(detail) {
  if (!detail || !atA2CanEdit(detail.journal)) return;
  for (const legacy of detail.container.querySelectorAll('[data-at-wj-action="editPages"]')) {
    legacy.innerHTML = '<i class="fa-solid fa-layer-group"></i> Page Manager';
    legacy.title = "Manage real Foundry Journal pages in Tome";
  }
  if (detail.container.querySelector(`[data-at-a2-page-manager="${CSS.escape(detail.journal.id)}"]`)) return;
  let host = detail.container.querySelector(".at-profile-toolbar-actions");
  if (!host && detail.section === "sessions") host = detail.container.querySelector(".at-session-detail-head");
  if (!host) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-secondary at-a2-page-manager-button";
  button.dataset.atA2PageManager = detail.journal.id;
  button.innerHTML = '<i class="fa-solid fa-layer-group"></i> Pages';
  button.title = "Page Manager — autosaved Foundry Journal structure";
  host.append(button);
}

async function atA2HandleHeroDrop(zone, event) {
  const journal = game.journal?.get(String(zone.dataset.journalId || ""));
  if (!journal || !atA2CanEdit(journal)) return;
  event.preventDefault();
  event.stopPropagation();
  zone.classList.remove("is-drag-over");
  const dropped = await atA2DroppedImagePath(event.dataTransfer);
  try {
    let path = dropped.path || "";
    if (dropped.file) {
      zone.classList.add("is-uploading");
      ui.notifications.info("Adventurer's Tome: Uploading hero image…");
      path = await atA2UploadHeroFile(dropped.file, journal);
    }
    if (!path) throw new Error("No usable image was found in the dropped data.");
    await atA2SaveHero(journal, path);
  } catch (error) {
    console.error("Adventurer's Tome | Hero image drop failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not use that image."}`);
  } finally {
    zone.classList.remove("is-uploading");
  }
}

function atA2Enhance() {
  const root = document.querySelector(ATA2_ROOT);
  if (!root) return;
  const detail = atA2JournalFromDetail(root);
  if (!detail) return;
  atA2EnhanceHero(detail);
  atA2EnhancePageButtons(detail);
}

function atA2QueueEnhance() {
  if (atA2EnhanceQueued) return;
  atA2EnhanceQueued = true;
  window.requestAnimationFrame(() => {
    atA2EnhanceQueued = false;
    atA2Enhance();
  });
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const legacyPages = event.target.closest?.('[data-at-wj-action="editPages"]');
    if (legacyPages) {
      const journal = game.journal?.get(String(legacyPages.dataset.journalId || ""));
      if (journal && atA2CanEdit(journal)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atA2RenderPageManager(journal);
        return;
      }
    }

    const managerButton = event.target.closest?.("[data-at-a2-page-manager]");
    if (managerButton) {
      event.preventDefault();
      event.stopPropagation();
      const journal = game.journal?.get(String(managerButton.dataset.atA2PageManager || ""));
      if (journal) atA2RenderPageManager(journal);
      return;
    }

    const heroRemove = event.target.closest?.("[data-at-a2-hero-remove]");
    if (heroRemove) {
      event.preventDefault();
      event.stopPropagation();
      const zone = heroRemove.closest("[data-at-a2-hero-drop]");
      const journal = game.journal?.get(String(zone?.dataset?.journalId || ""));
      if (journal) void atA2SaveHero(journal, "");
      return;
    }

    const heroPick = event.target.closest?.("[data-at-a2-hero-pick]");
    if (heroPick) {
      event.preventDefault();
      event.stopPropagation();
      const zone = heroPick.closest("[data-at-a2-hero-drop]");
      const journal = game.journal?.get(String(zone?.dataset?.journalId || ""));
      if (journal) atA2OpenHeroPicker(journal);
      return;
    }

    const heroZone = event.target.closest?.("[data-at-a2-hero-drop]");
    if (heroZone && !event.target.closest("button, a")) {
      event.preventDefault();
      const journal = game.journal?.get(String(heroZone.dataset.journalId || ""));
      if (journal) atA2OpenHeroPicker(journal);
      return;
    }

    const close = event.target.closest?.("[data-at-a2-manager-close]");
    if (close || event.target.matches?.(".at-a2-page-manager-overlay")) {
      event.preventDefault();
      atA2ClosePageManager();
      return;
    }

    const add = event.target.closest?.("[data-at-a2-add-type]");
    if (add) {
      event.preventDefault();
      const journal = atA2ManagerJournal(add);
      if (journal) void atA2CreatePage(journal, String(add.dataset.atA2AddType || "text"));
      return;
    }

    const up = event.target.closest?.("[data-at-a2-page-up]");
    if (up) { event.preventDefault(); void atA2MoveRow(up.closest(".at-a2-page-row"), "up"); return; }
    const down = event.target.closest?.("[data-at-a2-page-down]");
    if (down) { event.preventDefault(); void atA2MoveRow(down.closest(".at-a2-page-row"), "down"); return; }

    const duplicate = event.target.closest?.("[data-at-a2-page-duplicate]");
    if (duplicate) {
      event.preventDefault();
      const { journal, page } = atA2ManagerPage(duplicate);
      if (journal && page) void atA2DuplicatePage(journal, page);
      return;
    }

    const move = event.target.closest?.("[data-at-a2-page-move]");
    if (move) {
      event.preventDefault();
      const panel = move.closest(".at-a2-page-row")?.querySelector(".at-a2-page-move-panel");
      if (panel) panel.hidden = !panel.hidden;
      return;
    }

    const moveConfirm = event.target.closest?.("[data-at-a2-page-move-confirm]");
    if (moveConfirm) {
      event.preventDefault();
      const { journal, row, page } = atA2ManagerPage(moveConfirm);
      const targetId = String(row?.querySelector("[data-at-a2-page-destination]")?.value || "");
      const targetJournal = game.journal?.get(targetId);
      if (journal && page && targetJournal) void atA2MovePageToJournal(journal, page, targetJournal);
      return;
    }

    const remove = event.target.closest?.("[data-at-a2-page-delete]");
    if (remove) {
      event.preventDefault();
      const { journal, page } = atA2ManagerPage(remove);
      if (journal && page) void atA2DeletePage(journal, page, remove);
    }
  }, true);

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-at-a2-page-name]");
    if (!input) return;
    const { page } = atA2ManagerPage(input);
    if (page) atA2ScheduleRename(input, page);
  }, true);

  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("[data-at-a2-page-access]");
    if (!select) return;
    const { page } = atA2ManagerPage(select);
    if (!page) return;
    atA2SetManagerStatus("Saving access…", "saving");
    void atA2WithoutBackgroundRender(() => page.update({ "ownership.default": Number(select.value) }))
      .then(() => atA2SetManagerStatus("Saved", "saved"))
      .catch((error) => { console.error("Adventurer's Tome | Page access save failed", error); atA2SetManagerStatus("Access save failed", "error"); });
  }, true);

  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.(".at-a2-page-row[draggable='true']");
    if (!row || event.target.closest("input, select, button")) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/x-adventurers-tome-page", String(row.dataset.pageId || ""));
    row.classList.add("is-dragging");
  }, true);

  document.addEventListener("dragend", (event) => {
    event.target.closest?.(".at-a2-page-row")?.classList.remove("is-dragging");
    document.querySelectorAll(".at-a2-page-row.is-drag-target").forEach((row) => row.classList.remove("is-drag-target"));
  }, true);

  document.addEventListener("dragover", (event) => {
    const hero = event.target.closest?.("[data-at-a2-hero-drop]");
    if (hero) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = event.dataTransfer.files?.length ? "copy" : "link";
      hero.classList.add("is-drag-over");
      return;
    }
    const row = event.target.closest?.(".at-a2-page-row");
    if (!row || !event.dataTransfer?.types?.includes?.("text/x-adventurers-tome-page")) return;
    event.preventDefault();
    const list = row.parentElement;
    const dragging = list?.querySelector(".at-a2-page-row.is-dragging");
    if (!dragging || dragging === row) return;
    const rect = row.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    list.insertBefore(dragging, before ? row : row.nextElementSibling);
    row.classList.add("is-drag-target");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const hero = event.target.closest?.("[data-at-a2-hero-drop]");
    if (hero && !hero.contains(event.relatedTarget)) hero.classList.remove("is-drag-over");
  }, true);

  document.addEventListener("drop", (event) => {
    const hero = event.target.closest?.("[data-at-a2-hero-drop]");
    if (hero) { void atA2HandleHeroDrop(hero, event); return; }
    const list = event.target.closest?.("[data-at-a2-page-list]");
    if (!list || !event.dataTransfer?.types?.includes?.("text/x-adventurers-tome-page")) return;
    event.preventDefault();
    document.querySelectorAll(".at-a2-page-row.is-drag-target").forEach((row) => row.classList.remove("is-drag-target"));
    void atA2PersistDomOrder(list);
  }, true);

  const observer = new MutationObserver(atA2QueueEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  atA2QueueEnhance();
});

for (const hookName of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => window.setTimeout(atA2QueueEnhance, 40));
}
