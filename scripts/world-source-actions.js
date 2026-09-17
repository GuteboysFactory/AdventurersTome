const ATWSA_ID = "adventurers-tome";
const ATWSA_WORLD = "#adventurers-tome-app .at-world-profile-page";
const ATWSA_PROFILE = "worldProfile";
const ATWSA_SOURCE_UUID = "quickImportSourceUuid";
const ATWSA_SOURCE_TYPE = "quickImportSourceType";

let atWsaQueued = false;
let atWsaWorking = false;

function atWsaText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function atWsaJournal(world) {
  const button = world?.querySelector('[data-action="openJournal"][data-journal-id], [data-journal-id]');
  const id = String(button?.dataset?.journalId || "").trim();
  return id ? game.journal?.get(id) || null : null;
}

function atWsaSourceMeta(journal) {
  const profile = journal?.getFlag?.(ATWSA_ID, ATWSA_PROFILE) || {};
  return {
    uuid: String(journal?.getFlag?.(ATWSA_ID, ATWSA_SOURCE_UUID) || profile?.sourceUuid || "").trim(),
    type: String(journal?.getFlag?.(ATWSA_ID, ATWSA_SOURCE_TYPE) || profile?.sourceDocumentType || "").trim()
  };
}

function atWsaIsLegacySourceButton(button) {
  if (!button || button.dataset?.atWsaAction) return false;
  const action = String(button.dataset?.action || "");
  const text = atWsaText(button);
  return Boolean(
    button.dataset?.atQiOpenSource
    || action === "openActor"
    || action === "openJournal"
    || text === "open sheet"
    || text === "open actor"
    || text === "open item"
    || text === "open scene"
    || text === "open journal"
    || text.includes("open source in foundry")
  );
}

function atWsaHost(world) {
  const sourceGroup = world.querySelector(".at-world-action-groups .at-world-action-source");
  if (sourceGroup) return sourceGroup;
  return world.querySelector(".at-profile-toolbar-actions") || world.querySelector(".at-detail-toolbar");
}

function atWsaButton({ action, label, icon, journalId = "", sourceUuid = "", sourceType = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-secondary at-world-action-button at-wsa-source-action";
  button.dataset.atWsaAction = action;
  if (journalId) button.dataset.journalId = journalId;
  if (sourceUuid) button.dataset.sourceUuid = sourceUuid;
  if (sourceType) button.dataset.sourceType = sourceType;
  button.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  return button;
}

function atWsaDesired(world, journal) {
  const source = atWsaSourceMeta(journal);
  const desired = [{
    action: "journal",
    label: "Open Journal",
    icon: "fa-book-open",
    journalId: String(journal.id || "")
  }];

  if (source.uuid && source.type && source.type !== "JournalEntry") {
    const labels = { Actor: "Actor", Item: "Item", Scene: "Scene" };
    const icons = { Actor: "fa-user", Item: "fa-suitcase", Scene: "fa-map" };
    const label = labels[source.type] || "Source";
    desired.push({
      action: "source",
      label: `Open ${label}`,
      icon: icons[source.type] || "fa-arrow-up-right-from-square",
      sourceUuid: source.uuid,
      sourceType: source.type
    });
  }
  return desired;
}

function atWsaSignature(button) {
  return [
    String(button?.dataset?.atWsaAction || ""),
    String(button?.dataset?.journalId || ""),
    String(button?.dataset?.sourceUuid || ""),
    String(button?.dataset?.sourceType || ""),
    String(button?.textContent || "").replace(/\s+/g, " ").trim()
  ].join("|");
}

function atWsaDesiredSignature(spec) {
  return [
    String(spec.action || ""),
    String(spec.journalId || ""),
    String(spec.sourceUuid || ""),
    String(spec.sourceType || ""),
    String(spec.label || "")
  ].join("|");
}

function atWsaRebuild() {
  if (atWsaWorking) return;
  const world = document.querySelector(ATWSA_WORLD);
  if (!world) return;
  const journal = atWsaJournal(world);
  if (!journal) return;
  const host = atWsaHost(world);
  if (!host) return;

  const desired = atWsaDesired(world, journal);
  const existingCanonical = [...world.querySelectorAll("button[data-at-wsa-action]")];
  const legacy = [...world.querySelectorAll("button")].filter(atWsaIsLegacySourceButton);
  const existingSignatures = existingCanonical.map(atWsaSignature);
  const desiredSignatures = desired.map(atWsaDesiredSignature);
  const alreadyCorrect = legacy.length === 0
    && existingCanonical.length === desired.length
    && desiredSignatures.every((signature, index) => existingSignatures[index] === signature);

  if (alreadyCorrect) return;

  atWsaWorking = true;
  try {
    for (const button of legacy) button.remove();
    for (const button of existingCanonical) button.remove();
    for (const spec of desired) host.append(atWsaButton(spec));
    host.hidden = false;
  } finally {
    atWsaWorking = false;
  }
}

function atWsaQueue(delay = 0) {
  if (atWsaQueued) return;
  atWsaQueued = true;
  window.setTimeout(() => {
    atWsaQueued = false;
    try { atWsaRebuild(); }
    catch (error) { console.warn("Adventurer's Tome | World source actions failed safely", error); }
  }, delay);
}

function atWsaCanView(document) {
  if (!document) return false;
  if (game.user?.isGM) return true;
  try {
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
    return typeof document.testUserPermission !== "function" || document.testUserPermission(game.user, observer);
  } catch (_err) {
    return document.visible !== false;
  }
}

async function atWsaOpenJournal(button) {
  const journal = game.journal?.get(String(button.dataset.journalId || ""));
  if (!journal || !atWsaCanView(journal)) {
    ui.notifications.warn("Adventurer's Tome: Journal not found or not visible.");
    return;
  }
  journal.sheet?.render?.(true);
}

async function atWsaOpenSource(button) {
  const uuid = String(button.dataset.sourceUuid || "").trim();
  const resolver = game.modules.get(ATWSA_ID)?.api?.universalDocuments?.resolveCanonical;
  if (!uuid || typeof resolver !== "function") {
    ui.notifications.warn("Adventurer's Tome: Source resolver is not available.");
    return;
  }

  const source = await resolver(uuid, { consumer: "world-source-actions" });
  if (!source || !atWsaCanView(source)) {
    ui.notifications.warn("Adventurer's Tome: Source document no longer exists or is not visible.");
    return;
  }

  if (source.documentName === "Scene" && typeof source.view === "function") await source.view();
  else if (source.sheet?.render) source.sheet.render(true);
  else ui.notifications.warn("Adventurer's Tome: That source document has no openable sheet.");
}

Hooks.once("ready", () => {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(`${ATWSA_WORLD} button[data-at-wsa-action]`);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = String(button.dataset.atWsaAction || "");
    if (action === "journal") void atWsaOpenJournal(button);
    else if (action === "source") void atWsaOpenSource(button);
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (atWsaWorking) return;
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      return Boolean(target?.closest?.("#adventurers-tome-app .at-world-profile-page .at-detail-toolbar"));
    });
    if (relevant) atWsaQueue(0);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  atWsaQueue(0);
  window.setTimeout(() => atWsaQueue(0), 120);
  window.setTimeout(() => atWsaQueue(0), 350);
});

for (const hookName of ["renderApplicationV2", "updateJournalEntry", "updateActor", "createJournalEntry", "deleteJournalEntry"]) {
  Hooks.on(hookName, () => {
    atWsaQueue(0);
    window.setTimeout(() => atWsaQueue(0), 120);
  });
}
