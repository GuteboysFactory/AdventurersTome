const MODULE_ID = "adventurers-tome";
const ROOT = "#adventurers-tome-app";
const CONTRACT = "adventurers-tome-campaign-authoring-v2";
const VERSION = 1;

let enhanceTimer = null;
let pendingOpen = null;
let observer = null;

const stats = {
  sessionsCreated:0,
  questsCreated:0,
  canonicalFoldersCreated:0,
  primaryPagesCreated:0,
  openAndFocusAttempts:0,
  failures:0,
  lastError:""
};

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlFormat() {
  return CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
}

function localDateValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parentId(folder) {
  return clean(folder?.folder?.id ?? folder?.folder);
}

function ancestors(folder) {
  const rows = [];
  const seen = new Set();
  let current = folder || null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    rows.unshift(current);
    current = parentId(current) ? game.folders?.get(parentId(current)) || null : null;
  }
  return rows;
}

function folderPath(folder) {
  return ancestors(folder).map((row) => clean(row.name));
}

function sectionFromJournal(journal) {
  const flagged = clean(journal?.getFlag?.(MODULE_ID, "type")).toLowerCase();
  if (["session","sessions"].includes(flagged)) return "sessions";
  if (["quest","quests"].includes(flagged)) return "quests";
  const path = folderPath(journal?.folder || null).map((row) => row.toLowerCase());
  if (path.includes("sessions")) return "sessions";
  if (path.includes("quests")) return "quests";
  return "";
}

function sessionNumberFromJournal(journal) {
  const structured = Number(journal?.getFlag?.(MODULE_ID, "session")?.number || 0);
  if (Number.isFinite(structured) && structured > 0) return structured;
  const match = clean(journal?.name).match(/^session\s+0*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function nextSessionNumber() {
  const values = (game.journal?.contents || [])
    .filter((journal) => sectionFromJournal(journal) === "sessions")
    .map(sessionNumberFromJournal)
    .filter((value) => Number.isFinite(value) && value > 0);
  return (values.length ? Math.max(...values) : 0) + 1;
}

async function ensureCanonicalFolder(section) {
  const sectionName = section === "sessions" ? "Sessions" : "Quests";
  const folders = game.folders?.contents || [];

  let root = folders.find((folder) =>
    folder.type === "JournalEntry"
    && clean(folder.name) === "Adventurer's Tome"
    && !parentId(folder)
  ) || null;

  if (!root) {
    root = await Folder.create({
      name:"Adventurer's Tome",
      type:"JournalEntry",
      sorting:"a"
    });
    stats.canonicalFoldersCreated += 1;
  }

  let target = (game.folders?.contents || []).find((folder) =>
    folder.type === "JournalEntry"
    && clean(folder.name) === sectionName
    && parentId(folder) === root.id
  ) || null;

  if (!target) {
    target = await Folder.create({
      name:sectionName,
      type:"JournalEntry",
      folder:root.id,
      sorting:"a",
      flags:{ [MODULE_ID]:{ section } }
    });
    stats.canonicalFoldersCreated += 1;
  }

  return target;
}

function rootElement() {
  return document.querySelector(ROOT);
}

function closeDialog() {
  rootElement()?.querySelector(".at-ca2-dialog-overlay")?.remove();
}

function dialogMarkup(section) {
  if (section === "sessions") {
    return `
      <form class="at-cw-modal at-em-modal at-ca2-dialog" data-at-ca2-form="sessions">
        <header>
          <div><span class="at-kicker">Campaign Authoring 2.0</span><h2>New Session</h2></div>
          <button type="button" data-at-ca2-close><i class="fa-solid fa-xmark"></i></button>
        </header>
        <label><span>Session number</span><input name="number" type="number" min="1" step="1" value="${nextSessionNumber()}" required></label>
        <label><span>Title</span><input name="title" autocomplete="off" placeholder="The Road Beyond Greyhaven" required></label>
        <label><span>Date</span><input name="date" type="date" value="${localDateValue()}"></label>
        <div class="at-ca2-dialog-note"><i class="fa-solid fa-feather-pointed"></i><span>Tome creates the Foundry Journal and Chronicle page automatically. No Explorer folder selection is required.</span></div>
        <footer>
          <button type="button" class="at-secondary" data-at-ca2-close>Cancel</button>
          <button type="submit" class="at-primary"><i class="fa-solid fa-plus"></i> Create Session</button>
        </footer>
      </form>`;
  }

  let defaultStatus = "active";
  try { defaultStatus = clean(game.settings.get(MODULE_ID, "defaultQuestStatus")) || "active"; } catch (_error) {}
  const statuses = [
    ["active","Active"],
    ["dormant","Dormant"],
    ["completed","Completed"],
    ["failed","Failed"]
  ];
  return `
    <form class="at-cw-modal at-em-modal at-ca2-dialog" data-at-ca2-form="quests">
      <header>
        <div><span class="at-kicker">Campaign Authoring 2.0</span><h2>New Quest</h2></div>
        <button type="button" data-at-ca2-close><i class="fa-solid fa-xmark"></i></button>
      </header>
      <label><span>Title</span><input name="title" autocomplete="off" placeholder="Shadows Over the North" required></label>
      <label><span>Status</span><select name="status">${statuses.map(([id,label]) => `<option value="${id}" ${id === defaultStatus ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <div class="at-ca2-dialog-note"><i class="fa-solid fa-diamond"></i><span>Tome creates the Foundry Journal and Overview page automatically. No Explorer folder selection is required.</span></div>
      <footer>
        <button type="button" class="at-secondary" data-at-ca2-close>Cancel</button>
        <button type="submit" class="at-primary"><i class="fa-solid fa-plus"></i> Create Quest</button>
      </footer>
    </form>`;
}

function openCreateDialog(section) {
  if (!game.user?.isGM) return;
  const root = rootElement();
  if (!root) return;
  closeDialog();

  const overlay = document.createElement("div");
  overlay.className = "at-cw-modal-overlay at-ca2-dialog-overlay";
  overlay.innerHTML = dialogMarkup(section);
  root.append(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-at-ca2-close]")) closeDialog();
  });

  overlay.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      if (section === "sessions") {
        await createSession({
          number:Number(data.get("number") || 0),
          title:clean(data.get("title")),
          date:clean(data.get("date"))
        });
      } else {
        await createQuest({
          title:clean(data.get("title")),
          status:clean(data.get("status")) || "active"
        });
      }
      closeDialog();
    } catch (error) {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.error("Adventurer's Tome | Campaign Authoring 2.0 creation failed", error);
      ui.notifications.error(`Adventurer's Tome: ${error?.message || "Could not create that campaign entry."}`);
      if (submit) submit.disabled = false;
    }
  });

  window.setTimeout(() => {
    const input = overlay.querySelector('input[name="title"]');
    input?.focus();
  }, 0);
}

function primaryPageTemplate(section) {
  const title = section === "sessions" ? "Chronicle" : "Overview";
  return {
    name:title,
    type:"text",
    text:{
      content:'<p data-at-tome-summary="true"></p><p></p>',
      format:htmlFormat()
    },
    sort:100000
  };
}

async function createSession({ number, title, date } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can create Sessions.");
  const sessionNumber = Number(number || 0);
  if (!Number.isFinite(sessionNumber) || sessionNumber < 1) throw new Error("Enter a valid Session number.");
  const cleanTitle = clean(title);
  if (!cleanTitle) throw new Error("Enter a Session title.");

  const folder = await ensureCanonicalFolder("sessions");
  const name = /^session\s+\d+\b/i.test(cleanTitle)
    ? cleanTitle
    : `Session ${sessionNumber} — ${cleanTitle}`;

  const journal = await JournalEntry.create({
    name,
    folder:folder.id,
    ownership:{ default:CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
    flags:{
      [MODULE_ID]:{
        type:"sessions",
        session:{
          number:sessionNumber,
          date:clean(date),
          status:"draft",
          schema:1
        }
      }
    }
  });

  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [primaryPageTemplate("sessions")]);
  const page = created?.[0] || null;
  if (!page) throw new Error("Session was created, but its Chronicle page could not be created.");

  stats.sessionsCreated += 1;
  stats.primaryPagesCreated += 1;
  ui.notifications.info(`Adventurer's Tome: Created ${name}.`);
  await openCreatedEntry("sessions", journal, page);
  return { journal, page };
}

async function createQuest({ title, status } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can create Quests.");
  const cleanTitle = clean(title);
  if (!cleanTitle) throw new Error("Enter a Quest title.");
  const normalizedStatus = ["active","dormant","completed","failed"].includes(clean(status))
    ? clean(status)
    : "active";

  const folder = await ensureCanonicalFolder("quests");
  const journal = await JournalEntry.create({
    name:cleanTitle,
    folder:folder.id,
    ownership:{ default:CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
    flags:{
      [MODULE_ID]:{
        type:"quests",
        status:normalizedStatus,
        quest:{
          status:normalizedStatus,
          schema:1
        }
      }
    }
  });

  const created = await journal.createEmbeddedDocuments("JournalEntryPage", [primaryPageTemplate("quests")]);
  const page = created?.[0] || null;
  if (!page) throw new Error("Quest was created, but its Overview page could not be created.");

  stats.questsCreated += 1;
  stats.primaryPagesCreated += 1;
  ui.notifications.info(`Adventurer's Tome: Created ${cleanTitle}.`);
  await openCreatedEntry("quests", journal, page);
  return { journal, page };
}

async function openCreatedEntry(section, journal, page) {
  pendingOpen = {
    section,
    journalId:journal.id,
    pageId:page.id,
    attempts:0,
    expiresAt:Date.now() + 8000
  };

  const app = game.modules.get(MODULE_ID)?.api?.app?.();
  await app?.render?.({ parts:["main"] });
  scheduleEnhance(80);
  window.setTimeout(tryPendingOpen, 140);
}

function tryPendingOpen() {
  if (!pendingOpen) return;
  if (Date.now() > pendingOpen.expiresAt || pendingOpen.attempts > 24) {
    pendingOpen = null;
    return;
  }

  pendingOpen.attempts += 1;
  stats.openAndFocusAttempts += 1;
  const root = rootElement();
  if (!root) return window.setTimeout(tryPendingOpen, 180);

  const action = pendingOpen.section === "sessions" ? "selectSession" : "openQuestDetail";
  const detailSelector = pendingOpen.section === "sessions" ? ".at-session-detail" : ".at-quest-detail-page";
  const detail = root.querySelector(detailSelector);

  if (!detail) {
    const button = root.querySelector(
      `[data-action="${action}"][data-journal-id="${CSS.escape(pendingOpen.journalId)}"]`
    );
    if (button) {
      button.click();
      return window.setTimeout(tryPendingOpen, 220);
    }
    return window.setTimeout(tryPendingOpen, 180);
  }

  const sourceId = clean(detail.querySelector('[data-action="openJournal"][data-journal-id], .at-session-open-full[data-journal-id]')?.dataset?.journalId);
  if (sourceId && sourceId !== pendingOpen.journalId) {
    return window.setTimeout(tryPendingOpen, 180);
  }

  const editor = detail.querySelector(
    `.at-af-page[data-page-id="${CSS.escape(pendingOpen.pageId)}"] .at-af-page-text`
  );

  if (!editor) return window.setTimeout(tryPendingOpen, 180);

  editor.scrollIntoView?.({ behavior:"smooth", block:"center" });
  editor.click();
  window.setTimeout(() => editor.focus?.(), 0);
  pendingOpen = null;
}

function toolbarMarkup(section) {
  const isSession = section === "sessions";
  return `
    <section class="at-ca2-create-strip" data-at-ca2-strip="${section}">
      <div class="at-ca2-create-copy">
        <span class="at-kicker">Campaign Authoring 2.0</span>
        <strong>${isSession ? "Write the session. Tome handles the structure." : "Create the quest. Tome handles the structure."}</strong>
        <small>${isSession ? "Creates the next Chronicle directly in the canonical Sessions folder." : "Creates an Overview directly in the canonical Quests folder."}</small>
      </div>
      <button type="button" class="at-primary at-ca2-new" data-at-ca2-new="${section}">
        <i class="fa-solid ${isSession ? "fa-book-open" : "fa-diamond"}"></i>
        ${isSession ? "New Session" : "New Quest"}
      </button>
    </section>`;
}

function enhancePage(page, section) {
  if (!game.user?.isGM || !page) return;
  if (page.querySelector(`[data-at-ca2-strip="${section}"]`)) return;
  page.insertAdjacentHTML("afterbegin", toolbarMarkup(section));
}

function enhance() {
  const root = rootElement();
  if (!root || !game.user?.isGM) return;
  enhancePage(root.querySelector(".at-sessions-page"), "sessions");
  enhancePage(root.querySelector(".at-quests-page"), "quests");
  if (pendingOpen) window.setTimeout(tryPendingOpen, 40);
}

function scheduleEnhance(delay = 80) {
  window.clearTimeout(enhanceTimer);
  enhanceTimer = window.setTimeout(() => {
    enhanceTimer = null;
    enhance();
  }, delay);
}

function installHandlers() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(`${ROOT} [data-at-ca2-new]`);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openCreateDialog(clean(button.dataset.atCa2New));
  }, true);
}

function audit() {
  const root = rootElement();
  const sessionsFolder = (game.folders?.contents || []).find((folder) =>
    folder.type === "JournalEntry" && clean(folder.name) === "Sessions"
    && folderPath(folder).includes("Adventurer's Tome")
  ) || null;
  const questsFolder = (game.folders?.contents || []).find((folder) =>
    folder.type === "JournalEntry" && clean(folder.name) === "Quests"
    && folderPath(folder).includes("Adventurer's Tome")
  ) || null;

  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:stats.failures === 0,
    gmOnlyCreation:true,
    explorerSelectionRequired:false,
    canonicalStorage:{
      sessions:"JournalEntry -> Chronicle JournalEntryPage.text.content",
      quests:"JournalEntry -> Overview JournalEntryPage.text.content"
    },
    sessionDefaults:{
      nextNumber:nextSessionNumber(),
      status:"draft",
      date:"local-today"
    },
    questDefaults:{
      status:"configured-default-or-active"
    },
    ui:{
      sessionsButton:Boolean(root?.querySelector('[data-at-ca2-new="sessions"]')),
      questsButton:Boolean(root?.querySelector('[data-at-ca2-new="quests"]'))
    },
    stats:{ ...stats }
  };
}

const api = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  nextSessionNumber,
  createSession,
  createQuest,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.campaignAuthoringV2 = api;
  return true;
}

Hooks.once("ready", () => {
  attach();
  installHandlers();
  observer = new MutationObserver(() => scheduleEnhance(35));
  observer.observe(document.body, { childList:true, subtree:true });
  scheduleEnhance(250);
  console.info("Adventurer's Tome | Campaign Authoring 2.0 ready (Sessions + Quests).");
});

for (const hookName of [
  "renderApplicationV2",
  "createJournalEntry",
  "updateJournalEntry",
  "deleteJournalEntry",
  "createJournalEntryPage",
  "updateJournalEntryPage",
  "deleteJournalEntryPage",
  "createFolder",
  "updateFolder",
  "deleteFolder"
]) {
  Hooks.on(hookName, () => scheduleEnhance(90));
}
