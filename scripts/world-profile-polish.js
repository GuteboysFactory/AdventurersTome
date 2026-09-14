const AT_WPP_MODULE_ID = "adventurers-tome";
const AT_WPP_TEASER_WORDS = 10;
const atWppObservers = new WeakMap();
const atWppTimers = new WeakMap();

function atWppRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function atWppIsTome(app) {
  return app?.id === "adventurers-tome-app" || app?.options?.id === "adventurers-tome-app" || app?.constructor?.name === "AdventurersTomeApp";
}

function atWppText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function atWppTeaser(value, maxWords = AT_WPP_TEASER_WORDS) {
  const text = atWppText(value).replace(/^['"“”‘’]+|['"“”‘’]+$/g, "").trim();
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean).slice(0, maxWords);
  if (!words.length) return "";
  words[words.length - 1] = words[words.length - 1].replace(/[.!?;,:…]+$/u, "");
  const preview = words.join(" ").trim();
  return preview ? `"${preview}...."` : "";
}

function atWppApplyViewer(root) {
  const hero = root.querySelector(".at-world-profile-hero");
  if (!hero) return;
  hero.classList.add("at-world-profile-compact");

  const intro = hero.querySelector(".at-profile-intro");
  if (!intro) return;

  let summaryNode = intro.querySelector(":scope > p");
  const biography = root.querySelector(".at-profile-biography");
  const knownNode = biography?.querySelector(".at-tome-richtext, [data-at-af-kind='page'], p:not(.at-empty)");
  const currentSummary = atWppText(summaryNode?.textContent || "");
  const knownInformation = atWppText(knownNode?.textContent || "");
  const sourceText = currentSummary || knownInformation;
  const teaser = atWppTeaser(sourceText);
  if (!teaser) return;

  if (!summaryNode) {
    summaryNode = document.createElement("p");
    intro.append(summaryNode);
  }

  if (summaryNode.textContent !== teaser) summaryNode.textContent = teaser;
  summaryNode.classList.add("at-world-profile-teaser");
  summaryNode.dataset.atWorldProfileTeaser = "locked";
  summaryNode.title = "10-word profile teaser";
}

function atWppApplyEditor(root) {
  const textarea = root.querySelector('textarea[name="worldSummary"]');
  const label = textarea?.closest("label");
  if (!textarea || !label) return;

  if (!label.dataset.atWorldSummaryPolished) {
    label.dataset.atWorldSummaryPolished = "";
    const firstText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (firstText) firstText.textContent = "Profile teaser";
  }

  if (!label.querySelector(".at-world-summary-help")) {
    const help = document.createElement("small");
    help.className = "at-world-summary-help";
    help.textContent = "The profile header always shows the first 10 words in quotation marks. Known Information below remains the full description.";
    label.append(help);
  }
}

function atWppApply(root) {
  atWppApplyViewer(root);
  atWppApplyEditor(root);
}

function atWppSchedule(root) {
  window.clearTimeout(atWppTimers.get(root));
  const timer = window.setTimeout(() => {
    try { atWppApply(root); }
    catch (error) { console.error(`${AT_WPP_MODULE_ID} | World profile polish refresh failed safely`, error); }
  }, 40);
  atWppTimers.set(root, timer);
}

function atWppObserve(root) {
  if (atWppObservers.has(root)) return;
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      return target?.closest?.(".at-world-profile-page, .at-world-profile-hero, .at-profile-intro, .at-profile-biography");
    });
    if (relevant) atWppSchedule(root);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  atWppObservers.set(root, observer);
}

Hooks.on("renderApplicationV2", (app, element) => {
  if (!atWppIsTome(app)) return;
  try {
    const root = atWppRoot(element);
    if (!root) return;
    atWppApply(root);
    atWppObserve(root);
    window.setTimeout(() => atWppSchedule(root), 120);
    window.setTimeout(() => atWppSchedule(root), 400);
  } catch (error) {
    console.error(`${AT_WPP_MODULE_ID} | World profile polish failed safely`, error);
  }
});
