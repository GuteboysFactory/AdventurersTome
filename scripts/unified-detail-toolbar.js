const ATDT_MODULE_ID = "adventurers-tome";
const ATDT_ROOT = "#adventurers-tome-app";
const ATDT_PAGES = [
  ".at-profile-page",
  ".at-quest-detail-page",
  ".at-rule-detail-page"
];

let atDtQueued = false;
let atDtBusy = false;

function atDtText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function atDtAction(node) {
  return String(node?.dataset?.action || "").trim();
}

function atDtCategory(button) {
  const action = atDtAction(button);
  const text = atDtText(button);

  if (action === "toggleFavorite" || text.includes("favorite")) return "personal";

  if (
    action === "openJournal"
    || action === "openActor"
    || text.includes("open quest journal")
    || text.includes("open rule journal")
    || text.includes("character sheet")
  ) return "source";

  if (
    action === "sendSelectionToChat"
    || action === "whisperSelectionToChat"
    || text.includes("send selected")
    || text.includes("whisper selected")
  ) return "share";

  if (
    action === "queueReveal"
    || action === "showToPlayers"
    || action === "quickNote"
    || action === "editAccess"
    || action === "editProfile"
    || text.includes("queue reveal")
    || text.includes("show to players")
    || text.includes("gm note")
    || text.includes("permissions")
    || text.includes("edit profile")
  ) return "gm";

  return "misc";
}

function atDtGroup(className, label) {
  const div = document.createElement("div");
  div.className = `at-detail-action-group ${className}`;
  div.dataset.atDetailGroup = label;
  return div;
}

function atDtGmMenu() {
  const details = document.createElement("details");
  details.className = "at-detail-gm-tools";
  details.innerHTML = `
    <summary><i class="fa-solid fa-sliders"></i><span>GM Tools</span><i class="fa-solid fa-chevron-down at-detail-gm-caret"></i></summary>
    <div class="at-detail-gm-menu" role="menu"></div>
  `;
  details.addEventListener("click", (event) => {
    if (!event.target.closest("button")) return;
    window.setTimeout(() => { details.open = false; }, 0);
  });
  return details;
}

function atDtAppend(parent, button) {
  if (!parent || !button || button.parentElement === parent) return;
  parent.append(button);
}

function atDtPolishPage(page) {
  const toolbar = page.querySelector(".at-profile-toolbar.at-detail-toolbar");
  const actions = toolbar?.querySelector(":scope > .at-profile-toolbar-actions");
  if (!toolbar || !actions) return;

  let host = toolbar.querySelector(":scope > .at-detail-action-groups");
  if (!host) {
    host = document.createElement("div");
    host.className = "at-detail-action-groups";
    actions.before(host);
  }

  let source = host.querySelector(".at-detail-action-source");
  let personal = host.querySelector(".at-detail-action-personal");
  let share = host.querySelector(".at-detail-action-share");
  let misc = host.querySelector(".at-detail-action-misc");
  let gm = host.querySelector(".at-detail-gm-tools");

  if (!source) { source = atDtGroup("at-detail-action-source", "Source"); host.append(source); }
  if (!personal) { personal = atDtGroup("at-detail-action-personal", "Personal"); host.append(personal); }
  if (!share) { share = atDtGroup("at-detail-action-share", "Share"); host.append(share); }
  if (!misc) { misc = atDtGroup("at-detail-action-misc", "More"); host.append(misc); }
  if (!gm) { gm = atDtGmMenu(); host.append(gm); }

  const gmMenu = gm.querySelector(".at-detail-gm-menu");
  const buttons = [...actions.querySelectorAll(":scope > button")];

  for (const button of buttons) {
    const category = atDtCategory(button);
    button.classList.add("at-detail-action-button");

    if (category === "source") atDtAppend(source, button);
    else if (category === "personal") atDtAppend(personal, button);
    else if (category === "share") atDtAppend(share, button);
    else if (category === "gm") atDtAppend(gmMenu, button);
    else atDtAppend(misc, button);
  }

  source.hidden = !source.querySelector("button");
  personal.hidden = !personal.querySelector("button");
  share.hidden = !share.querySelector("button");
  misc.hidden = !misc.querySelector("button");
  gm.hidden = !gmMenu.querySelector("button");

  actions.hidden = true;
  toolbar.classList.add("at-detail-toolbar-polished");
}

function atDtPolish() {
  if (atDtBusy) return;
  const root = document.querySelector(ATDT_ROOT);
  if (!root) return;

  atDtBusy = true;
  try {
    for (const selector of ATDT_PAGES) {
      const page = root.querySelector(selector);
      if (page) atDtPolishPage(page);
    }
  } finally {
    atDtBusy = false;
  }
}

function atDtQueue() {
  if (atDtQueued || atDtBusy) return;
  atDtQueued = true;
  requestAnimationFrame(() => {
    atDtQueued = false;
    try { atDtPolish(); }
    catch (error) { console.warn(`${ATDT_MODULE_ID} | Unified detail toolbar polish failed safely`, error); }
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver((mutations) => {
    if (atDtBusy) return;
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (!target) return false;
      if (target.closest?.(".at-detail-action-groups")) return false;
      return Boolean(ATDT_PAGES.some((selector) => target.closest?.(`${ATDT_ROOT} ${selector} .at-detail-toolbar`)));
    });
    if (relevant) atDtQueue();
  });
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  atDtQueue();
});

Hooks.on("renderApplicationV2", atDtQueue);
Hooks.on("updateJournalEntry", atDtQueue);
Hooks.on("updateActor", atDtQueue);
