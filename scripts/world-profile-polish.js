const AT_WPP_MODULE_ID = "adventurers-tome";
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

function atWppApply(root) {
  const page = root.querySelector(".at-world-profile-page");
  if (!page) return;

  const hero = page.querySelector(".at-world-profile-hero");
  const intro = hero?.querySelector(".at-profile-intro");
  const content = page.querySelector(".at-profile-content");
  const facts = content?.querySelector(":scope > .at-profile-facts") || page.querySelector(".at-profile-facts");
  if (!hero || !intro || !content) return;

  hero.classList.add("at-world-profile-compact", "at-world-profile-facts-header");
  content.classList.add("at-profile-content-single");

  /*
   * World profile header is identity + structured facts only.
   * Summary/body preview text is deliberately not rendered here; Known Information
   * remains the single player-facing prose source below the header.
   */
  for (const node of [...intro.children]) {
    if (node.tagName === "P") node.remove();
  }

  if (facts) {
    facts.classList.add("at-profile-facts-hero");
    if (facts.parentElement !== hero) hero.append(facts);
  }
}

function atWppSchedule(root, delay = 40) {
  window.clearTimeout(atWppTimers.get(root));
  const timer = window.setTimeout(() => {
    try { atWppApply(root); }
    catch (error) { console.error(`${AT_WPP_MODULE_ID} | World profile layout refresh failed safely`, error); }
  }, delay);
  atWppTimers.set(root, timer);
}

function atWppObserve(root) {
  if (atWppObservers.has(root)) return;
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation.type !== "childList") return false;
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (!target?.closest?.(".at-world-profile-page")) return false;
      /* Never react to typing inside Known Information. */
      if (target.closest?.(".at-profile-biography, [contenteditable='true'], [data-at-af-editing='true']")) return false;
      return true;
    });
    if (relevant) atWppSchedule(root);
  });
  observer.observe(root, { childList: true, subtree: true });
  atWppObservers.set(root, observer);
}

Hooks.on("renderApplicationV2", (app, element) => {
  if (!atWppIsTome(app)) return;
  try {
    const root = atWppRoot(element);
    if (!root) return;
    atWppApply(root);
    atWppObserve(root);
    window.setTimeout(() => atWppSchedule(root, 0), 120);
    window.setTimeout(() => atWppSchedule(root, 0), 400);
  } catch (error) {
    console.error(`${AT_WPP_MODULE_ID} | World profile layout failed safely`, error);
  }
});
