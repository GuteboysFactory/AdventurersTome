const AT_WPP_MODULE_ID = "adventurers-tome";
const AT_WPP_TEASER_WORDS = 10;

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

function atWppTeaser(value, maxWords = AT_WPP_TEASER_WORDS) {
  const text = atWppText(value).replace(/^['"“”‘’]+|['"“”‘’]+$/g, "").trim();
  if (!text) return "";

  const words = text.split(/\s+/).filter(Boolean).slice(0, maxWords);
  if (!words.length) return "";

  words[words.length - 1] = words[words.length - 1].replace(/[.!?;,:…]+$/u, "");
  const preview = words.join(" ").trim();
  return preview ? `"${preview}...."` : "";
}

function atWppSummaryDuplicates(summary, body) {
  const s = atWppComparable(summary);
  const b = atWppComparable(body);
  if (!s || !b) return false;
  if (s === b) return true;
  if (b.startsWith(s) || s.startsWith(b)) return true;
  if (b.includes(s) && s.split(/\s+/).length > AT_WPP_TEASER_WORDS) return true;
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
  const shouldDerive = !existingSummary || atWppSummaryDuplicates(existingSummary, knownInformation);
  const teaser = atWppTeaser(shouldDerive ? knownInformation : existingSummary);
  if (!teaser) return;

  if (!summaryNode) {
    summaryNode = document.createElement("p");
    intro.append(summaryNode);
  }

  summaryNode.textContent = teaser;
  summaryNode.classList.add("at-world-profile-teaser");
  summaryNode.dataset.atWorldProfileTeaser = shouldDerive ? "derived" : "summary";
  summaryNode.title = shouldDerive ? "10-word preview from Known Information" : "10-word profile teaser";
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
    help.textContent = "The profile header shows at most 10 words in quotation marks. Known Information below remains the full description.";
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
