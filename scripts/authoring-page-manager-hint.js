const ATPMH_ROOT = "#adventurers-tome-app";
let atPmhQueued = false;

function atPmhEnhance() {
  const root = document.querySelector(ATPMH_ROOT);
  if (!root) return;

  for (const button of root.querySelectorAll("[data-at-a2-page-manager]")) {
    if (button.nextElementSibling?.classList?.contains("at-a2-page-manager-hint")) continue;
    const hint = document.createElement("span");
    hint.className = "at-a2-page-manager-hint";
    hint.innerHTML = '<i class="fa-solid fa-circle-plus"></i><span>Add new pages here</span>';
    hint.title = "Open Page Manager to add and organize Journal pages";
    button.insertAdjacentElement("afterend", hint);
  }
}

function atPmhQueue() {
  if (atPmhQueued) return;
  atPmhQueued = true;
  window.requestAnimationFrame(() => {
    atPmhQueued = false;
    atPmhEnhance();
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(atPmhQueue);
  observer.observe(document.body, { childList: true, subtree: true });
  atPmhQueue();
});
