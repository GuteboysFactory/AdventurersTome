const ATRP_ROOT = "#adventurers-tome-app";

function atRpNormalizeSurface(surface) {
  if (!surface || surface.dataset.atReadabilityNormalized === "true") return;
  surface.dataset.atReadabilityNormalized = "true";

  for (const node of surface.querySelectorAll("*")) {
    if (!(node instanceof HTMLElement)) continue;

    // Foundry Journals can carry inline colors/backgrounds from their original
    // sheet/theme. Tome owns presentation, so remove presentation-only values
    // that can make imported text unreadable on the Tome surface.
    for (const property of [
      "color",
      "background",
      "background-color",
      "font-family",
      "text-shadow",
      "opacity"
    ]) node.style?.removeProperty(property);

    node.removeAttribute("color");
    node.removeAttribute("bgcolor");
  }
}

function atRpPolishRuleReader(root) {
  const reading = root.querySelector(".at-rule-reading[data-at-structured-journal]");
  if (!reading) return;
  reading.classList.add("at-readable-journal");

  for (const surface of reading.querySelectorAll(".at-journal-page-content")) atRpNormalizeSurface(surface);
}

function atRpPolishWorld(root) {
  for (const surface of root.querySelectorAll(".at-tome-richtext")) {
    surface.classList.add("at-readable-journal");
    atRpNormalizeSurface(surface);
  }
}

function atRpPolish() {
  const root = document.querySelector(ATRP_ROOT);
  if (!root) return;
  atRpPolishRuleReader(root);
  atRpPolishWorld(root);
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(() => atRpPolish());
  observer.observe(document.body, { childList: true, subtree: true });
  atRpPolish();
});

for (const hookName of ["updateJournalEntry", "updateJournalEntryPage", "createJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, () => window.setTimeout(atRpPolish, 20));
}
