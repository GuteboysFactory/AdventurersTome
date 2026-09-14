const AT_WPP_MODULE_ID = "adventurers-tome";
const AT_WPP_TEASER_MAX = 180;

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

function atWppComparable(value) {
  return atWppText(value).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}

function atWppTeaser(value, max = AT_WPP_TEASER_MAX) {
  const text = atWppText(value);
  if (!text) return "";

  const sentenceMatch = text.match(/^(.+?[.!?])(?:\s|$)/);
  let teaser = sentenceMatch?.[1] ? atWppText(sentenceMatch[1]) : text;

  if (teaser.length <= max) return teaser;
  const slice = teaser.slice(0, max + 1);
  const breakAt = Math.max(slice.lastIndexOf(" "), Math.floor(max * 0.72));
  return `${slice.slice(0, breakAt > 0 ? breakAt : max).trim()}…`;
}

function atWppSummaryDuplicates(summary, body) {
  const s = atWppComparable(summary);
  const b = atWppComparable(body);
  if (!s || !b) return false;
  if (s === b) return true;
  if (s.length > AT_WPP_TEASER_MAX && (b.startsWith(s) || s.startsWith(b))) return true;
  if (s.length > AT_WPP_TEASER_MAX && b.includes(s)) return true;
  return false;
}

function atWppApplyViewer(root) {
  const hero = root.querySelector(".at-world-profile-hero");
  if (!hero) return;

  hero.classList.add("at-world-profile-compact");

  const intro = hero.querySelector(".at-profile-intro");
  const biography = root.querySelector(".at-profile-biography");
  const bodyNode = biography?.querySelector("p:not(.at-empty)");
  const knownInformation = atWppText(bodyNode?.textContent || "");
  if (!intro || !knownInformation) return;

  let summaryNode = intro.querySelector(":scope > p");
  const existingSummary = atWppText(summaryNode?.textContent || "");
  const shouldDerive = !existingSummary || existingSummary.length > AT_WPP_TEASER_MAX || atWppSummaryDuplicates(existingSummary, knownInformation);
  const teaser = shouldDerive ? atWppTeaser(knownInformation) : atWppTeaser(existingSummary);
  if (!teaser) return;

  if (!summaryNode) {
    summaryNode = document.createElement("p");
    intro.append(summaryNode);
  }

  summaryNode.textContent = teaser;
  summaryNode.classList.add("at-world-profile-teaser");
  summaryNode.dataset.atWorldProfileTeaser = shouldDerive ? "derived" : "summary";
  summaryNode.title = shouldDerive ? "Short preview from Known Information" : "Profile teaser";
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
    help.textContent = "Keep this to 1–2 short lines. Known Information below remains the full description.";
    label.append(help);
  }
}

Hooks.on("renderApplicationV2", (app, element) => {
  if (!atWppIsTome(app)) return;
  try {
    const root = atWppRoot(element);
    if (!root) return;
    atWppApplyViewer(root);
    atWppApplyEditor(root);
  } catch (error) {
    console.error(`${AT_WPP_MODULE_ID} | World profile polish failed safely`, error);
  }
});
