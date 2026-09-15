const AT_WAB_ID = "adventurers-tome";
const AT_WAB_ROOT = "#adventurers-tome-app .at-world-profile-page";
let atWabQueued = false;
let atWabRebuilding = false;

function atWabText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function atWabAction(node) {
  return String(node?.dataset?.action || "").trim();
}

function atWabGroup(label, className) {
  const group = document.createElement("div");
  group.className = `at-world-action-group ${className}`;
  group.dataset.atWorldActionGroup = label;
  return group;
}

function atWabGmMenu() {
  const details = document.createElement("details");
  details.className = "at-world-gm-tools";
  details.innerHTML = `
    <summary><i class="fa-solid fa-sliders"></i><span>GM Tools</span><i class="fa-solid fa-chevron-down at-world-gm-caret"></i></summary>
    <div class="at-world-gm-menu" role="menu"></div>
  `;
  details.addEventListener("click", (event) => {
    if (!event.target.closest("button")) return;
    window.setTimeout(() => { details.open = false; }, 0);
  });
  return details;
}

function atWabCategory(button) {
  const action = atWabAction(button);
  const text = atWabText(button);

  if (text === "page" || text === "pages" || text.includes("click text to edit")) return "hide";

  if (action === "toggleFavorite" || text.includes("favorite")) return "personal";

  if (action === "queueReveal" || action === "showToPlayers" || text.includes("queue reveal") || text.includes("show to players")) return "share";

  if (
    action === "quickNote"
    || action === "editAccess"
    || action === "editWorldProfile"
    || text.includes("gm note")
    || text.includes("actor access")
    || text.includes("permissions")
    || text.includes("edit tome entry")
  ) return "gm";

  if (
    text.includes("open source")
    || text === "open actor"
    || text.includes("open journal")
    || action === "openJournal"
  ) return "source";

  if (text.includes("open sheet")) return "personal";

  if (action === "openActor") return "source";

  return "misc";
}

function atWabCollectButtons(toolbar, actions) {
  const candidates = [...toolbar.querySelectorAll("button")].filter((button) => {
    if (button.closest(".at-detail-nav")) return false;
    if (button.closest(".at-world-gm-tools")) return false;
    return true;
  });

  /* Include dynamically injected controls in the toolbar which are not buttons only if
     they are obvious authoring hints. They are hidden instead of removed. */
  for (const node of toolbar.querySelectorAll("span, div, small")) {
    const text = atWabText(node);
    if (text === "click text to edit" || text.startsWith("click text to edit")) node.hidden = true;
  }

  return candidates;
}

function atWabPolish() {
  const world = document.querySelector(AT_WAB_ROOT);
  if (!world) return;
  const toolbar = world.querySelector(".at-profile-toolbar.at-detail-toolbar");
  const actions = toolbar?.querySelector(".at-profile-toolbar-actions");
  if (!toolbar || !actions) return;

  atWabRebuilding = true;
  try {
    let host = toolbar.querySelector(":scope > .at-world-action-groups");
    if (!host) {
      host = document.createElement("div");
      host.className = "at-world-action-groups";
      actions.before(host);
    }

    let source = host.querySelector(".at-world-action-source");
    let personal = host.querySelector(".at-world-action-personal");
    let share = host.querySelector(".at-world-action-share");
    let misc = host.querySelector(".at-world-action-misc");
    let gmTools = host.querySelector(".at-world-gm-tools");

    if (!source) { source = atWabGroup("Source", "at-world-action-source"); host.append(source); }
    if (!personal) { personal = atWabGroup("Personal", "at-world-action-personal"); host.append(personal); }
    if (!share) { share = atWabGroup("Share", "at-world-action-share"); host.append(share); }
    if (!misc) { misc = atWabGroup("More", "at-world-action-misc"); host.append(misc); }
    if (!gmTools) { gmTools = atWabGmMenu(); host.append(gmTools); }
    const gmMenu = gmTools.querySelector(".at-world-gm-menu");

    const buttons = atWabCollectButtons(toolbar, actions);
    for (const button of buttons) {
      const category = atWabCategory(button);
      button.classList.add("at-world-action-button");
      button.hidden = category === "hide";
      if (category === "hide") continue;
      if (category === "source") source.append(button);
      else if (category === "personal") personal.append(button);
      else if (category === "share") share.append(button);
      else if (category === "gm") gmMenu.append(button);
      else misc.append(button);
    }

    source.hidden = !source.querySelector("button:not([hidden])");
    personal.hidden = !personal.querySelector("button:not([hidden])");
    share.hidden = !share.querySelector("button:not([hidden])");
    misc.hidden = !misc.querySelector("button:not([hidden])");
    gmTools.hidden = !gmMenu.querySelector("button:not([hidden])");

    actions.hidden = true;
    toolbar.classList.add("at-world-actionbar-polished");
  } finally {
    atWabRebuilding = false;
  }
}

function atWabQueue() {
  if (atWabQueued || atWabRebuilding) return;
  atWabQueued = true;
  requestAnimationFrame(() => {
    atWabQueued = false;
    try { atWabPolish(); }
    catch (error) { console.warn(`${AT_WAB_ID} | World actionbar polish failed safely`, error); }
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver((mutations) => {
    if (atWabRebuilding) return;
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      return Boolean(target?.closest?.("#adventurers-tome-app .at-world-profile-page .at-detail-toolbar"));
    });
    if (relevant) atWabQueue();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  atWabQueue();
});

Hooks.on("renderApplicationV2", atWabQueue);
Hooks.on("updateJournalEntry", atWabQueue);
Hooks.on("updateActor", atWabQueue);
