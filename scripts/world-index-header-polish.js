const ATWHP_MODULE_ID = "adventurers-tome";
const ATWHP_VERSION = 1;

let atWhpObserver = null;
let atWhpTimer = null;

function atWhpRoot() {
  return document.querySelector("#adventurers-tome-app");
}

function atWhpText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function atWhpSchedule(delay = 30) {
  if (atWhpTimer) window.clearTimeout(atWhpTimer);
  atWhpTimer = window.setTimeout(() => {
    atWhpTimer = null;
    atWhpPolish();
  }, delay);
}

function atWhpHeadingDirectChild(node, heading) {
  let current = node;
  while (current?.parentElement && current.parentElement !== heading) current = current.parentElement;
  return current?.parentElement === heading ? current : null;
}

function atWhpParkImporter(page, heading) {
  let parking = page.querySelector(":scope > .at-whp-import-parking");
  if (!parking) {
    parking = document.createElement("div");
    parking.className = "at-whp-import-parking";
    page.append(parking);
  }

  let original = parking.querySelector("button[data-at-whp-original-import]");
  if (original) return original;

  const candidate = [...page.querySelectorAll("button")].find((button) =>
    /import\s+existing\s+journals/i.test(atWhpText(button))
  );
  if (!candidate) return null;

  const block = heading?.contains(candidate) ? atWhpHeadingDirectChild(candidate, heading) : null;
  candidate.dataset.atWhpOriginalImport = "1";
  parking.append(candidate);

  if (block && block !== candidate && block.parentElement === heading) block.remove();

  return candidate;
}

function atWhpCleanHeading(page) {
  const heading = page.querySelector(":scope > .at-world-heading");
  if (!heading) return null;

  // qa.22 moved Quick NPC to the semantically correct folder context menu.
  heading.querySelector(".at-world-heading-tools")?.remove();
  heading.querySelector('[data-action="openQuickNpc"]')?.remove();

  // Any legacy importer callout is reduced to a parked functional button.
  const importer = atWhpParkImporter(page, heading);

  let actions = heading.querySelector(":scope > .at-whp-header-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "at-whp-header-actions";
    heading.append(actions);
  }

  const create = heading.querySelector(
    ':scope > [data-at-af-create="world"], :scope > [data-at-a3-create="world"], [data-at-af-create="world"], [data-at-a3-create="world"]'
  );
  const editors = heading.querySelector(
    ':scope > [data-at-a3-section-editors="world"], [data-at-a3-section-editors="world"]'
  );

  if (create && create.parentElement !== actions) actions.append(create);
  if (editors && editors.parentElement !== actions) actions.append(editors);

  if (!actions.children.length) actions.remove();

  // Remove legacy helper copy if the importer callout survived without its button.
  for (const child of [...heading.children]) {
    if (child.matches?.(".at-whp-header-actions")) continue;
    const text = atWhpText(child);
    if (/already\s+have\s+campaign\s+journals/i.test(text)) child.remove();
  }

  return importer;
}

function atWhpPolishFilterbar(page, importer) {
  const bar = page.querySelector(".at-cw-catalog .at-cw-filterbar");
  if (!bar) return;

  const count = bar.querySelector(":scope > .at-cw-filter-count, .at-cw-filter-count");
  let right = bar.querySelector(":scope > .at-whp-catalog-right");
  if (!right) {
    right = document.createElement("div");
    right.className = "at-whp-catalog-right";
    bar.append(right);
  }

  let proxy = right.querySelector("[data-at-whp-import-proxy]");
  if (importer && !proxy) {
    proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = "at-secondary at-whp-import-button";
    proxy.dataset.atWhpImportProxy = "1";
    proxy.innerHTML = '<i class="fa-solid fa-file-import"></i><span>Import Journals</span>';
    proxy.title = "Import existing Foundry Journals into Tome World";
    proxy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      importer.click();
    });
    right.prepend(proxy);
  }

  if (count && count.parentElement !== right) right.append(count);
}

function atWhpPolish() {
  const root = atWhpRoot();
  const page = root?.querySelector(".at-world-page");
  if (!page) return false;

  const importer = atWhpCleanHeading(page);
  atWhpPolishFilterbar(page, importer);
  return true;
}

function atWhpInstallObserver() {
  const root = atWhpRoot();
  if (!root) return false;

  atWhpObserver?.disconnect?.();
  atWhpObserver = new MutationObserver(() => atWhpSchedule(20));
  atWhpObserver.observe(root, { childList:true, subtree:true });
  return true;
}

Hooks.once("ready", () => {
  atWhpSchedule(120);
  window.setTimeout(() => {
    atWhpInstallObserver();
    atWhpSchedule(40);
  }, 350);
  console.info(`Adventurer's Tome | World index header polish v${ATWHP_VERSION} ready.`);
});

for (const hookName of ["renderApplication", "renderApplicationV2"]) {
  Hooks.on(hookName, () => {
    atWhpSchedule(40);
    window.setTimeout(() => atWhpInstallObserver(), 80);
  });
}
