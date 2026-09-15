import { filePickerClass, foundryPlatformInfo } from "./foundry-platform.js";

const ATHP_ID = "adventurers-tome";
const ATHP_ROOT = "#adventurers-tome-app";
const ATHP_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);

function atHpSafeBase(value) {
  return String(value || "image")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function atHpLooksLikeImage(value) {
  const src = String(value || "").split(/[?#]/)[0];
  const extension = src.includes(".") ? src.split(".").pop().toLowerCase() : "";
  return ATHP_EXTENSIONS.has(extension) || /^(?:data:image\/|blob:)/i.test(String(value || ""));
}

function atHpNormalizeStoredPath(value) {
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

function atHpProfile(journal) {
  const raw = journal?.getFlag?.(ATHP_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
}

function atHpCanEdit(journal) {
  if (!journal || !game.user) return false;
  if (game.user.isGM) return true;
  try {
    if (journal.isOwner === true || journal.testUserPermission?.(game.user, "OWNER")) return true;
  } catch (_err) {}
  const editors = journal.getFlag?.(ATHP_ID, "worldEditors");
  return Array.isArray(editors) && editors.map(String).includes(String(game.user.id));
}

function atHpApp() {
  try { return game.modules.get(ATHP_ID)?.api?.app?.(); }
  catch (_err) { return null; }
}

function atHpJournal(zone) {
  return game.journal?.get(String(zone?.dataset?.journalId || "")) || null;
}

async function atHpSaveHero(journal, path) {
  if (!journal || !atHpCanEdit(journal)) return;
  const profile = atHpProfile(journal);
  profile.heroImage = String(path || "").trim();
  const app = atHpApp();
  if (app) app._bulkUpdating = true;
  try {
    await journal.setFlag(ATHP_ID, "worldProfile", profile);
  } finally {
    window.setTimeout(() => { if (app) app._bulkUpdating = false; }, 220);
  }
  ui.notifications.info(profile.heroImage
    ? `Adventurer's Tome: Hero image updated for ${journal.name}.`
    : `Adventurer's Tome: Hero image removed from ${journal.name}.`);
  await app?.render?.({ parts: ["main"] });
}

async function atHpEnsureUploadDirectory() {
  const Picker = filePickerClass();
  if (!Picker?.createDirectory) throw new Error("Foundry FilePicker upload API is unavailable.");
  const worldId = atHpSafeBase(game.world?.id || "world");
  const parts = ["worlds", worldId, "adventurers-tome", "heroes"];
  let target = "";
  for (const part of parts) {
    target = target ? `${target}/${part}` : part;
    try { await Picker.createDirectory("data", target); } catch (_err) {}
  }
  return target;
}

async function atHpUploadHeroFile(file, journal) {
  if (!(file instanceof File)) throw new Error("Dropped item is not a file.");
  if (!String(file.type || "").startsWith("image/") && !atHpLooksLikeImage(file.name)) throw new Error("Drop an image file here.");
  const Picker = filePickerClass();
  if (!Picker?.upload) throw new Error("Foundry FilePicker upload API is unavailable.");
  const target = await atHpEnsureUploadDirectory();
  const ext = String(file.name || "image.webp").split(".").pop().toLowerCase();
  const safeExt = ATHP_EXTENSIONS.has(ext) ? ext : "webp";
  const renamed = new File([file], `${atHpSafeBase(journal.name)}-${Date.now()}.${safeExt}`, {
    type: file.type,
    lastModified: file.lastModified
  });
  const response = await Picker.upload("data", target, renamed, {}, { notify: false });
  const path = String(response?.path || response?.url || response?.file || "").trim();
  if (!path) throw new Error("Foundry did not return an uploaded image path.");
  return atHpNormalizeStoredPath(path);
}

function atHpPathFromObject(value) {
  if (!value || typeof value !== "object") return "";
  for (const candidate of [value.path, value.src, value.img, value.image, value?.texture?.src, value?.prototypeToken?.texture?.src]) {
    if (typeof candidate === "string" && atHpLooksLikeImage(candidate)) return atHpNormalizeStoredPath(candidate);
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== "object") continue;
    const candidate = atHpPathFromObject(child);
    if (candidate) return candidate;
  }
  return "";
}

async function atHpDroppedImagePath(dataTransfer) {
  const file = [...(dataTransfer?.files || [])].find((item) => String(item.type || "").startsWith("image/") || atHpLooksLikeImage(item.name));
  if (file) return { file };

  const uri = String(dataTransfer?.getData?.("text/uri-list") || "").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  if (uri && atHpLooksLikeImage(uri)) return { path: atHpNormalizeStoredPath(uri) };

  const html = String(dataTransfer?.getData?.("text/html") || "");
  if (html) {
    const host = document.createElement("div");
    host.innerHTML = html;
    const src = host.querySelector("img")?.getAttribute("src");
    if (src && atHpLooksLikeImage(src)) return { path: atHpNormalizeStoredPath(src) };
  }

  const plain = String(dataTransfer?.getData?.("text/plain") || "").trim();
  if (!plain) return {};
  if (atHpLooksLikeImage(plain)) return { path: atHpNormalizeStoredPath(plain) };
  try {
    const data = JSON.parse(plain);
    const direct = atHpPathFromObject(data);
    if (direct) return { path: direct };
    const uuid = String(data?.uuid || data?.documentUuid || "").trim();
    if (uuid && typeof fromUuid === "function") {
      const document = await fromUuid(uuid);
      const documentPath = atHpPathFromObject(document);
      if (documentPath) return { path: documentPath };
    }
  } catch (_err) {}
  return {};
}

function atHpOpenPicker(journal) {
  if (!journal || !atHpCanEdit(journal)) return;
  const Picker = filePickerClass();
  if (!Picker) return ui.notifications.error("Adventurer's Tome: Foundry FilePicker is unavailable.");
  const picker = new Picker({
    type: "image",
    current: atHpProfile(journal).heroImage || "",
    callback: (path) => { void atHpSaveHero(journal, atHpNormalizeStoredPath(path)); }
  });
  try { picker.render({ force: true }); }
  catch (_err) { picker.render(true); }
}

async function atHpHandleDrop(zone, event) {
  const journal = atHpJournal(zone);
  if (!journal || !atHpCanEdit(journal)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  zone.classList.remove("is-drag-over");
  try {
    const dropped = await atHpDroppedImagePath(event.dataTransfer);
    let path = dropped.path || "";
    if (dropped.file) {
      zone.classList.add("is-uploading");
      ui.notifications.info("Adventurer's Tome: Uploading hero image…");
      path = await atHpUploadHeroFile(dropped.file, journal);
    }
    if (!path) throw new Error("No usable image was found in the dropped data.");
    await atHpSaveHero(journal, path);
  } catch (error) {
    console.error("Adventurer's Tome | Platform hero image flow failed", error);
    ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not use that image."}`);
  } finally {
    zone.classList.remove("is-uploading");
  }
}

Hooks.once("ready", () => {
  const platform = foundryPlatformInfo();
  console.debug(`${ATHP_ID} | Hero authoring platform path active on Foundry ${platform.version} (generation ${platform.generation || "unknown"}).`);

  // Capture-phase handlers intentionally run before the legacy alpha2 hero
  // handlers and stop only hero-image events. All non-hero alpha2 behavior is
  // left untouched during the v1.2 completion gate.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(ATHP_ROOT)) return;

    const remove = event.target.closest?.("[data-at-a2-hero-remove]");
    if (remove) {
      const zone = remove.closest("[data-at-a2-hero-drop]");
      const journal = atHpJournal(zone);
      if (!journal) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void atHpSaveHero(journal, "");
      return;
    }

    const pick = event.target.closest?.("[data-at-a2-hero-pick]");
    if (pick) {
      const zone = pick.closest("[data-at-a2-hero-drop]");
      const journal = atHpJournal(zone);
      if (!journal) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      atHpOpenPicker(journal);
      return;
    }

    const zone = event.target.closest?.("[data-at-a2-hero-drop]");
    if (zone && !event.target.closest("button, a")) {
      const journal = atHpJournal(zone);
      if (!journal) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      atHpOpenPicker(journal);
    }
  }, true);

  document.addEventListener("drop", (event) => {
    const zone = event.target.closest?.(`${ATHP_ROOT} [data-at-a2-hero-drop]`);
    if (!zone) return;
    void atHpHandleDrop(zone, event);
  }, true);
});
