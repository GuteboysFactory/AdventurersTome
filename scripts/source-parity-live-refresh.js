const ATSPLR_ID = "adventurers-tome";

function atSplrProfile(journal) {
  const raw = journal?.getFlag?.(ATSPLR_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
}

function atSplrLinkedActor(journal, actor) {
  if (!journal || !actor) return false;
  const profile = atSplrProfile(journal);
  const uuid = String(journal.getFlag?.(ATSPLR_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
  if (uuid) return uuid === actor.uuid;
  return String(profile.actorId || "") === String(actor.id || "");
}

function atSplrOpenWorld() {
  const page = document.querySelector("#adventurers-tome-app .at-world-profile-page");
  if (!page) return null;
  const source = page.querySelector('[data-action="openJournal"][data-journal-id]');
  const journal = game.journal?.get(String(source?.dataset?.journalId || "")) || null;
  return journal ? { page, journal } : null;
}

function atSplrSourceImageMode(journal, actor) {
  const profile = atSplrProfile(journal);
  const explicit = String(profile.sourceImageMode || "").toLowerCase();
  if (explicit === "source" || explicit === "override") return explicit;
  const hero = String(profile.heroImage || "");
  const snapshot = String(profile.sourceImageSnapshot || "");
  const actorImg = String(actor?.img || "");
  return !hero || hero === actorImg || (snapshot && hero === snapshot) ? "source" : "override";
}

function atSplrResolveMedia(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;
  try { return foundry.utils.getRoute(value); }
  catch (_err) { return value; }
}

function atSplrPatchIdentity(actor, changes = {}) {
  const open = atSplrOpenWorld();
  if (!open || !atSplrLinkedActor(open.journal, actor)) return false;

  let touched = false;

  if (Object.prototype.hasOwnProperty.call(changes, "name")) {
    const title = open.page.querySelector(".at-world-profile-hero .at-profile-intro h1");
    if (title && title.textContent !== String(actor.name || "")) {
      title.textContent = String(actor.name || "");
      touched = true;
    }

    /* Keep visible World breadcrumb/current-label text coherent where present. */
    for (const node of open.page.querySelectorAll("[data-at-world-current-name], .at-world-current-name")) {
      if (node.textContent !== String(actor.name || "")) {
        node.textContent = String(actor.name || "");
        touched = true;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, "img") && atSplrSourceImageMode(open.journal, actor) === "source") {
    const img = open.page.querySelector(".at-world-profile-art img");
    const next = atSplrResolveMedia(actor.img);
    if (img && next && img.getAttribute("src") !== next) {
      img.setAttribute("src", next);
      touched = true;
    }
  }

  return touched;
}

function atSplrScheduleSettledRender(actor) {
  window.setTimeout(() => {
    const open = atSplrOpenWorld();
    if (!open || !atSplrLinkedActor(open.journal, actor)) return;
    const app = game.modules.get(ATSPLR_ID)?.api?.app?.();
    if (!app?.rendered || app._bulkUpdating || Number(app._atRichEditingCount || 0) > 0) return;
    app.render({ parts: ["main"] }).catch((error) => console.warn("Adventurer's Tome | Source identity settled refresh failed safely", error));
  }, 180);
}

Hooks.on("updateActor", (actor, changes = {}) => {
  const identityTouched = Object.prototype.hasOwnProperty.call(changes, "name")
    || Object.prototype.hasOwnProperty.call(changes, "img")
    || Object.prototype.hasOwnProperty.call(changes, "folder");
  if (!identityTouched) return;

  try {
    atSplrPatchIdentity(actor, changes);
    atSplrScheduleSettledRender(actor);
  } catch (error) {
    console.warn("Adventurer's Tome | Linked World live identity refresh failed safely", error);
  }
});
