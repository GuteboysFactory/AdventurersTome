const ATAH_MODULE_ID = "adventurers-tome";
const ATAH_ROOT = "#adventurers-tome-app";
const ATAH_REPAIR_FLAG = "autosaveScaffoldRepair111";

function atAhCanViewPage(page, journal) {
  if (game.user?.isGM) return true;
  try {
    if (page?.testUserPermission?.(game.user, "OBSERVER")) return true;
    if (journal?.testUserPermission?.(game.user, "OBSERVER")) return true;
  } catch (_err) {}
  return Boolean(page?.visible ?? journal?.visible ?? false);
}

function atAhPageStamp(journal) {
  if (!journal) return "";
  const pages = [...(journal.pages?.contents ?? [])]
    .filter((page) => atAhCanViewPage(page, journal))
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return `${journal.id}:${pages.map((page) => `${page.id}:${page._stats?.modifiedTime || page.sort || 0}`).join("|")}`;
}

function atAhPreserveActiveEditor(page) {
  const journal = page?.parent;
  if (!journal) return;
  const root = document.querySelector(ATAH_ROOT);
  if (!root) return;
  const shell = root.querySelector(`.at-authoring-pages[data-journal-id="${CSS.escape(journal.id)}"]`);
  if (!shell) return;

  const active = shell.querySelector(
    "[data-at-af-editing='true'], [data-at-ep-editing='true'], [data-at-wie-rich-editing='true'], .at-wie-rich-editor[contenteditable='true'], [data-at-ep-editor][contenteditable='true']"
  );
  if (!active) return;

  // authoring-foundation schedules a refresh shortly after updateJournalEntryPage.
  // Its page renderer rebuilds only when this stamp differs. Advancing the stamp
  // while a live editor owns the DOM tells that renderer that the current shell
  // already represents this document revision, preserving caret/focus.
  shell.dataset.stamp = atAhPageStamp(journal);
}

function atAhCleanEditorScaffold(html) {
  const raw = String(html || "");
  if (!/(?:at-ep-status|at-eb-autosave-state|at-wie-rich-toolbar|at-wie-rich-actions|data-at-ep-editor|at-wie-rich-editor)/.test(raw)) return raw;

  const host = document.createElement("div");
  host.innerHTML = raw;

  host.querySelectorAll(".at-ep-status, .at-eb-autosave-state, .at-wie-rich-toolbar, .at-wie-rich-actions").forEach((node) => node.remove());

  // If a legacy editor wrapper itself was persisted, keep the user's authored
  // children and discard only the transient editor container.
  for (const editor of host.querySelectorAll("[data-at-ep-editor], .at-wie-rich-editor")) {
    editor.replaceWith(...editor.childNodes);
  }

  return host.innerHTML;
}

async function atAhRepairPersistedScaffold() {
  if (!game.user?.isGM) return;
  if (game.settings?.get?.(ATAH_MODULE_ID, ATAH_REPAIR_FLAG) === true) return;

  let repaired = 0;
  for (const journal of game.journal?.contents ?? []) {
    for (const page of journal.pages?.contents ?? []) {
      if (String(page.type || "text").toLowerCase() !== "text") continue;
      const before = String(page.text?.content || "");
      const after = atAhCleanEditorScaffold(before);
      if (after === before) continue;
      try {
        await page.update({
          "text.content": after,
          "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
        });
        repaired += 1;
      } catch (error) {
        console.warn(`Adventurer's Tome | Could not repair autosave scaffold in ${journal.name} / ${page.name}`, error);
      }
    }
  }

  await game.settings?.set?.(ATAH_MODULE_ID, ATAH_REPAIR_FLAG, true);
  if (repaired) {
    console.info(`Adventurer's Tome | Repaired transient autosave editor markup in ${repaired} Journal page(s).`);
    ui.notifications.info(`Adventurer's Tome: repaired ${repaired} page${repaired === 1 ? "" : "s"} affected by the autosave editor bug.`);
  }
}

Hooks.once("init", () => {
  game.settings.register(ATAH_MODULE_ID, ATAH_REPAIR_FLAG, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
});

Hooks.on("updateJournalEntryPage", (page) => {
  // Run synchronously. The original authoring refresh is delayed, so this stamp
  // update wins before the renderer evaluates whether it should replace the DOM.
  atAhPreserveActiveEditor(page);
});

Hooks.once("ready", () => {
  if (game.user?.isGM) window.setTimeout(() => void atAhRepairPersistedScaffold(), 350);
});
