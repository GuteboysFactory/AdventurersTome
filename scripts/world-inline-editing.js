const ATWIE_MODULE_ID = "adventurers-tome";
const ATWIE_ROOT = "#adventurers-tome-app";
const ATWIE_EDITOR_FLAG = "worldEditors";
const ATWIE_CAPTURE_KEY = "adventurers-tome.worldPermissionJournal";

function atWieEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atWieEditors(journal) {
  const raw = journal?.getFlag?.(ATWIE_MODULE_ID, ATWIE_EDITOR_FLAG);
  return Array.isArray(raw) ? [...new Set(raw.map(String).filter(Boolean))] : [];
}

function atWieIsEditor(journal, user = game.user) {
  if (!journal || !user) return false;
  if (user.isGM) return true;
  return atWieEditors(journal).includes(String(user.id));
}

function atWieCanInlineEdit(journal) {
  if (!journal || !atWieIsEditor(journal)) return false;
  if (game.user?.isGM) return true;
  try {
    return journal.testUserPermission?.(game.user, "OWNER") === true || journal.isOwner === true;
  } catch (_err) {
    return false;
  }
}

function atWieWorldProfile(journal) {
  const raw = journal?.getFlag?.(ATWIE_MODULE_ID, "worldProfile");
  return raw && typeof raw === "object" && !Array.isArray(raw) ? foundry.utils.deepClone(raw) : {};
}

function atWieWorldJournal(root) {
  const page = root?.querySelector(".at-world-profile-page");
  const source = page?.querySelector('[data-action="openJournal"][data-journal-id]');
  return source ? game.journal?.get(String(source.dataset.journalId || "")) : null;
}

function atWieSyncPage(journal) {
  if (!journal) return null;
  const profile = atWieWorldProfile(journal);
  const preferred = String(journal.getFlag?.(ATWIE_MODULE_ID, "worldSyncPage") || profile.syncPageId || "");
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  return pages.find((page) => page.id === preferred) || pages.find((page) => page?.text?.content !== undefined) || null;
}

function atWieNotifySaved(label) {
  ui.notifications.info(`Adventurer's Tome: ${label} saved.`);
}

async function atWieSaveProfileField(journal, field, value) {
  const profile = atWieWorldProfile(journal);
  profile[field] = value;
  await journal.setFlag(ATWIE_MODULE_ID, "worldProfile", profile);
}

function atWieMakeEditableText(node, { label, multiline = false, getValue, save }) {
  if (!node || node.dataset.atWieEditable === "true") return;
  node.dataset.atWieEditable = "true";
  node.classList.add("at-wie-editable");
  node.title = `Click to edit ${label}`;

  node.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, select, textarea") || node.dataset.atWieEditing === "true") return;
    event.preventDefault();
    event.stopPropagation();
    const original = String(getValue?.() ?? node.textContent ?? "");
    node.dataset.atWieEditing = "true";
    node.classList.add("is-editing");
    node.contentEditable = "true";
    node.spellcheck = true;
    node.textContent = original;
    node.focus();

    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = globalThis.getSelection?.();
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);

    let finished = false;
    const finish = async (commit) => {
      if (finished) return;
      finished = true;
      const next = String(node.textContent || "").trim();
      node.contentEditable = "false";
      node.dataset.atWieEditing = "false";
      node.classList.remove("is-editing");
      if (!commit || next === original) {
        node.textContent = original;
        return;
      }
      try {
        await save(next);
        node.textContent = next;
        atWieNotifySaved(label);
      } catch (error) {
        console.error("Adventurer's Tome | Inline World field save failed", error);
        node.textContent = original;
        ui.notifications.error(`Adventurer's Tome: Could not save ${label}.`);
      }
    };

    node.addEventListener("blur", () => { void finish(true); }, { once: true });
    node.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        void finish(false);
      } else if (!multiline && keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        node.blur();
      } else if (multiline && keyEvent.key === "Enter" && (keyEvent.ctrlKey || keyEvent.metaKey)) {
        keyEvent.preventDefault();
        node.blur();
      }
    });
  });
}

function atWieInlineToolbar() {
  return `<div class="at-wie-rich-toolbar"><button type="button" data-at-wie-format="bold" title="Bold"><i class="fa-solid fa-bold"></i></button><button type="button" data-at-wie-format="italic" title="Italic"><i class="fa-solid fa-italic"></i></button><button type="button" data-at-wie-format="formatBlock" data-value="h2" title="Heading"><i class="fa-solid fa-heading"></i></button><button type="button" data-at-wie-format="insertUnorderedList" title="Bulleted list"><i class="fa-solid fa-list-ul"></i></button><button type="button" data-at-wie-format="insertOrderedList" title="Numbered list"><i class="fa-solid fa-list-ol"></i></button></div>`;
}

function atWieOpenRichEditor(surface, page, label) {
  if (!surface || !page || surface.dataset.atWieRichEditing === "true") return;
  surface.dataset.atWieRichEditing = "true";
  const originalHtml = String(page?.text?.content ?? "");
  const oldHtml = surface.innerHTML;
  surface.classList.add("is-editing");
  surface.innerHTML = `${atWieInlineToolbar()}<div class="at-wie-rich-editor" contenteditable="true" spellcheck="true">${originalHtml || "<p>Write here.</p>"}</div><div class="at-wie-rich-actions"><span><i class="fa-solid fa-circle-info"></i> Ctrl/Cmd + Enter saves</span><button type="button" class="at-secondary" data-at-wie-cancel>Cancel</button><button type="button" class="at-primary" data-at-wie-save><i class="fa-solid fa-floppy-disk"></i> Save</button></div>`;
  surface.querySelector(".at-wie-rich-editor")?.focus();

  const close = (restore = true) => {
    surface.dataset.atWieRichEditing = "false";
    surface.classList.remove("is-editing");
    if (restore) surface.innerHTML = oldHtml;
  };

  surface.querySelector("[data-at-wie-cancel]")?.addEventListener("click", (event) => {
    event.preventDefault();
    close(true);
  });

  const save = async () => {
    const html = String(surface.querySelector(".at-wie-rich-editor")?.innerHTML || "<p></p>");
    const button = surface.querySelector("[data-at-wie-save]");
    if (button) button.disabled = true;
    try {
      await page.update({ "text.content": html, "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 });
      atWieNotifySaved(label);
      close(false);
      surface.innerHTML = html;
      window.setTimeout(() => { surface.dataset.atWieRichEditing = "false"; surface.classList.remove("is-editing"); }, 0);
    } catch (error) {
      console.error("Adventurer's Tome | Inline World rich text save failed", error);
      ui.notifications.error(`Adventurer's Tome: Could not save ${label}.`);
      if (button) button.disabled = false;
    }
  };

  surface.querySelector("[data-at-wie-save]")?.addEventListener("click", (event) => { event.preventDefault(); void save(); });
  surface.querySelector(".at-wie-rich-editor")?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); }
  });
}

function atWieEnhanceKnownInformation(worldPage, journal) {
  const panel = [...worldPage.querySelectorAll(".at-profile-panel")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Known Information");
  if (!panel || panel.dataset.atWieKnown === "true") return;
  const page = atWieSyncPage(journal);
  if (!page) return;
  panel.dataset.atWieKnown = "true";
  panel.classList.add("at-wie-rich-surface");
  panel.title = "Click the text to edit Known Information";
  panel.addEventListener("click", (event) => {
    if (event.target.closest(".at-profile-section-heading, a, button, input, select, textarea") || panel.querySelector(".at-wie-rich-editor")) return;
    const surface = panel.querySelector(".at-tome-richtext") || [...panel.children].find((child) => !child.classList?.contains("at-profile-section-heading"));
    if (surface) atWieOpenRichEditor(surface, page, "Known Information");
  });
}

function atWieEnhanceJournalTextPages(worldPage, journal) {
  for (const surface of worldPage.querySelectorAll(".at-world-journal-page[data-page-type='text'] .at-world-journal-text")) {
    if (surface.dataset.atWieTextPage === "true") continue;
    const article = surface.closest(".at-world-journal-page");
    const page = journal.pages?.get(String(article?.dataset?.pageId || ""));
    if (!page) continue;
    surface.dataset.atWieTextPage = "true";
    surface.classList.add("at-wie-rich-surface");
    surface.title = `Click to edit ${page.name}`;
    surface.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea") || surface.querySelector(".at-wie-rich-editor")) return;
      atWieOpenRichEditor(surface, page, page.name || "Journal page");
    });
  }
}

function atWieEnhanceFacts(worldPage, journal) {
  const profile = atWieWorldProfile(journal);
  const rawFacts = Array.isArray(profile.facts) ? profile.facts : [];
  const playerIndices = rawFacts.map((fact, index) => ({ fact, index })).filter(({ fact }) => !fact?.gmOnly);
  const nodes = [...worldPage.querySelectorAll(".at-profile-facts .at-fact:not(.is-gm-only)")];
  nodes.forEach((node, visibleIndex) => {
    const map = playerIndices[visibleIndex];
    if (!map || node.dataset.atWieFact === "true") return;
    node.dataset.atWieFact = "true";
    node.dataset.atWieFactIndex = String(map.index);
    const labelNode = node.querySelector("span");
    const valueNode = node.querySelector("strong");
    atWieMakeEditableText(labelNode, {
      label: "fact label",
      getValue: () => atWieWorldProfile(journal).facts?.[map.index]?.label || labelNode.textContent || "",
      save: async (value) => {
        const next = atWieWorldProfile(journal);
        next.facts = Array.isArray(next.facts) ? next.facts : [];
        if (!next.facts[map.index] || next.facts[map.index].gmOnly) throw new Error("Fact is no longer player-editable");
        next.facts[map.index].label = value;
        await journal.setFlag(ATWIE_MODULE_ID, "worldProfile", next);
      }
    });
    atWieMakeEditableText(valueNode, {
      label: "fact value",
      getValue: () => atWieWorldProfile(journal).facts?.[map.index]?.value || valueNode.textContent || "",
      save: async (value) => {
        const next = atWieWorldProfile(journal);
        next.facts = Array.isArray(next.facts) ? next.facts : [];
        if (!next.facts[map.index] || next.facts[map.index].gmOnly) throw new Error("Fact is no longer player-editable");
        next.facts[map.index].value = value;
        await journal.setFlag(ATWIE_MODULE_ID, "worldProfile", next);
      }
    });
  });
}

function atWieEnhanceWorld(root) {
  const page = root.querySelector(".at-world-profile-page");
  if (!page) return;
  const journal = atWieWorldJournal(root);
  if (!journal || !atWieCanInlineEdit(journal)) return;

  page.classList.add("at-wie-can-edit");
  const toolbar = page.querySelector(".at-profile-toolbar-actions");
  if (toolbar && !toolbar.querySelector(".at-wie-editor-badge")) {
    const badge = document.createElement("span");
    badge.className = "at-wie-editor-badge";
    badge.innerHTML = game.user?.isGM ? '<i class="fa-solid fa-pen-nib"></i> Click text to edit' : '<i class="fa-solid fa-user-pen"></i> World Editor';
    toolbar.prepend(badge);
  }

  const intro = page.querySelector(".at-profile-intro");
  const title = intro?.querySelector("h1");
  const subtitle = intro?.querySelector("h2");
  const summary = intro ? [...intro.children].find((child) => child.tagName === "P") : null;

  atWieMakeEditableText(title, {
    label: "World title",
    getValue: () => journal.name,
    save: async (value) => { await journal.update({ name: value }); }
  });
  if (subtitle) atWieMakeEditableText(subtitle, {
    label: "subtitle",
    getValue: () => atWieWorldProfile(journal).subtitle || "",
    save: async (value) => atWieSaveProfileField(journal, "subtitle", value)
  });
  if (summary) atWieMakeEditableText(summary, {
    label: "summary",
    multiline: true,
    getValue: () => atWieWorldProfile(journal).summary || "",
    save: async (value) => atWieSaveProfileField(journal, "summary", value)
  });

  atWieEnhanceKnownInformation(page, journal);
  atWieEnhanceFacts(page, journal);
  atWieEnhanceJournalTextPages(page, journal);
}

function atWieRememberPermissionTarget(event) {
  const button = event.target.closest('[data-action="editAccess"][data-document-type="journal"][data-document-id]');
  if (!button || !button.closest(".at-world-profile-page")) return;
  const id = String(button.dataset.documentId || "");
  if (id) sessionStorage.setItem(ATWIE_CAPTURE_KEY, id);
}

function atWieEditorRows(journal) {
  const selected = new Set(atWieEditors(journal));
  const users = [...(game.users?.contents ?? [])]
    .filter((user) => !user.isGM)
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || String(a.name || "").localeCompare(String(b.name || "")));
  if (!users.length) return '<p class="at-empty">No player users exist in this world yet.</p>';
  return users.map((user) => {
    const isEditor = selected.has(String(user.id));
    return `<label class="at-wie-user-row"><input type="checkbox" data-at-wie-editor-user value="${atWieEscape(user.id)}" ${isEditor ? "checked" : ""}><span class="at-wie-user-state ${user.active ? "is-active" : ""}"></span><span><strong>${atWieEscape(user.name)}</strong><small>${user.active ? "Online" : "Offline"} · ${isEditor ? "World Editor" : "Reader"}</small></span><span class="at-wie-role">${isEditor ? "Editor" : "Reader"}</span></label>`;
  }).join("");
}

function atWieEnhanceAccess(root) {
  if (!game.user?.isGM) return;
  const form = root.querySelector(".at-access-form");
  if (!form || form.querySelector("[data-at-wie-editor-card]")) return;
  const journalId = String(sessionStorage.getItem(ATWIE_CAPTURE_KEY) || "");
  const journal = game.journal?.get(journalId);
  if (!journal || String(journal.getFlag?.(ATWIE_MODULE_ID, "type") || "") !== "world") return;

  const grid = form.querySelector(".at-access-grid");
  if (!grid) return;
  const card = document.createElement("article");
  card.className = "at-settings-card at-wie-editor-card";
  card.dataset.atWieEditorCard = "true";
  card.dataset.journalId = journal.id;
  card.innerHTML = `<h2><i class="fa-solid fa-user-pen"></i> Tome World Editors</h2><p class="at-wie-editor-copy">Give selected players permission to edit the player-facing World entry directly in Adventurer's Tome. They never receive GM Notes or the GM-only Tome workspace.</p><div class="at-wie-user-list">${atWieEditorRows(journal)}</div><div class="at-settings-callout"><i class="fa-solid fa-shield-halved"></i><span><strong>Editor boundary:</strong> Foundry requires Owner permission for client-side document writes, so Tome grants Owner on this linked World Journal to selected Editors. Keep hard secrets in Tome GM Notes / GM-only fields or non-player Journal pages. Removing Editor restores Observer when Tome originally granted the ownership.</span></div>`;
  grid.append(card);
}

async function atWieSaveEditorPermissions(card) {
  if (!game.user?.isGM || !card) return;
  const journal = game.journal?.get(String(card.dataset.journalId || ""));
  if (!journal) return;
  const previous = new Set(atWieEditors(journal));
  const selected = new Set([...card.querySelectorAll("[data-at-wie-editor-user]:checked")].map((box) => String(box.value)));
  const ownership = foundry.utils.deepClone(journal.ownership || {});
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;

  for (const id of selected) ownership[id] = OWNER;
  for (const id of previous) {
    if (selected.has(id)) continue;
    if (Number(ownership[id]) === OWNER) ownership[id] = OBSERVER;
  }

  await journal.update({ ownership });
  await journal.setFlag(ATWIE_MODULE_ID, ATWIE_EDITOR_FLAG, [...selected]);
  ui.notifications.info(`Adventurer's Tome: World Editors updated for ${journal.name}.`);
}

function atWieHandlePermissionSave(event) {
  const save = event.target.closest('[data-action="saveAccess"]');
  if (!save || !game.user?.isGM) return;
  const root = save.closest(ATWIE_ROOT);
  const card = root?.querySelector("[data-at-wie-editor-card]");
  if (!card) return;
  const snapshot = card.cloneNode(true);
  window.setTimeout(() => {
    void atWieSaveEditorPermissions(snapshot).catch((error) => {
      console.error("Adventurer's Tome | World Editor permission save failed", error);
      ui.notifications.error("Adventurer's Tome: Could not save World Editor permissions.");
    });
  }, 120);
}

function atWieHandleFormatting(event) {
  const button = event.target.closest("[data-at-wie-format]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const editor = button.closest(".at-wie-rich-surface")?.querySelector(".at-wie-rich-editor");
  editor?.focus();
  try { document.execCommand(button.dataset.atWieFormat, false, button.dataset.value || null); } catch (_err) {}
}

let atWieQueued = false;
function atWieEnhance() {
  if (atWieQueued) return;
  atWieQueued = true;
  window.requestAnimationFrame(() => {
    atWieQueued = false;
    const root = document.querySelector(ATWIE_ROOT);
    if (!root) return;
    atWieEnhanceWorld(root);
    atWieEnhanceAccess(root);
  });
}

Hooks.once("ready", () => {
  document.addEventListener("click", atWieRememberPermissionTarget, true);
  document.addEventListener("click", atWieHandlePermissionSave, true);
  document.addEventListener("click", atWieHandleFormatting, true);
  const observer = new MutationObserver(atWieEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  atWieEnhance();
});

for (const hookName of ["updateJournalEntry", "updateJournalEntryPage", "createJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, () => window.setTimeout(atWieEnhance, 30));
}
