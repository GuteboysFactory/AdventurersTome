const ATASR_ID = "adventurers-tome";
const atAsrObservers = new WeakMap();

function atAsrRoot(element, app) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function atAsrActor(app) {
  const doc = app?.document || app?.actor || app?.object;
  return doc?.documentName === "Actor" ? doc : null;
}

function atAsrWorldProfile(journal) {
  const raw = journal?.getFlag?.(ATASR_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function atAsrIsWorld(journal) {
  return journal?.documentName === "JournalEntry" && (
    String(journal.getFlag?.(ATASR_ID, "type") || "") === "world" ||
    Boolean(journal.getFlag?.(ATASR_ID, "worldProfile"))
  );
}

function atAsrHasWorldIdentity(actor) {
  if (!actor?.uuid) return false;
  return [...(game.journal?.contents ?? [])].some((journal) => {
    if (!atAsrIsWorld(journal)) return false;
    const profile = atAsrWorldProfile(journal);
    const uuid = String(journal.getFlag?.(ATASR_ID, "quickImportSourceUuid") || profile.sourceUuid || "").trim();
    if (uuid) return uuid === actor.uuid;
    return String(profile.actorId || "") === String(actor.id || "");
  });
}

function atAsrPrunePcExtension(root, actor) {
  if (!root || !atAsrHasWorldIdentity(actor)) return;
  for (const panel of root.querySelectorAll(".at-sdki-sheet-panel.at-ki-pc-panel")) panel.remove();
}

function atAsrObserve(root, actor) {
  if (atAsrObservers.has(root)) return;
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      observer.disconnect();
      atAsrObservers.delete(root);
      return;
    }
    atAsrPrunePcExtension(root, actor);
  });
  observer.observe(root, { childList: true, subtree: true });
  atAsrObservers.set(root, observer);
}

Hooks.on("renderApplicationV2", (app, element) => {
  const actor = atAsrActor(app);
  if (!actor || !atAsrHasWorldIdentity(actor)) return;
  const root = atAsrRoot(element, app);
  if (!root) return;

  /*
   * Role precedence for Actor sheets:
   * a permanent Actor-backed World identity owns the public sheet extension.
   * actor-known-information-sync.js provides Known Information there.
   * The separate PC/Group Character Information extension must not compete
   * on the same sheet, even if the Actor also carries Group profile metadata.
   * This is presentation routing only; no Actor or Journal data is rewritten.
   */
  atAsrPrunePcExtension(root, actor);
  atAsrObserve(root, actor);
  requestAnimationFrame(() => atAsrPrunePcExtension(root, actor));
  window.setTimeout(() => atAsrPrunePcExtension(root, actor), 100);
});
