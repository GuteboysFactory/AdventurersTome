const AT_MODULE_ID = "adventurers-tome";
const AT_RULE_FLAG = "ruleLink";
const AT_TOME_ROOT = "#adventurers-tome-app";

function atEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atSlug(value, fallback = "section") {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

function atCanViewPage(page, journal) {
  if (game.user?.isGM) return true;
  try {
    if (typeof page?.testUserPermission === "function") return page.testUserPermission(game.user, "OBSERVER");
    if (typeof journal?.testUserPermission === "function") return journal.testUserPermission(game.user, "OBSERVER");
  } catch (_err) {}
  return Boolean(page?.visible ?? journal?.visible ?? true);
}

function atStripSecrets(html) {
  if (game.user?.isGM) return String(html ?? "");
  const host = document.createElement("div");
  host.innerHTML = String(html ?? "");
  host.querySelectorAll(".secret, [data-secret='true'], section.secret").forEach((node) => node.remove());
  return host.innerHTML;
}

async function atEnrichJournalHtml(html, relativeTo) {
  const safeHtml = atStripSecrets(html);
  try {
    return await TextEditor.enrichHTML(safeHtml, {
      async: true,
      documents: true,
      secrets: Boolean(game.user?.isGM),
      relativeTo
    });
  } catch (error) {
    console.warn("Adventurer's Tome | Structured Journal enrich failed; using source HTML.", error);
    return safeHtml;
  }
}

function atPageType(page) {
  return String(page?.type ?? page?.documentName ?? "text").toLowerCase();
}

async function atBuildStructuredJournal(journal) {
  const pages = [...(journal?.pages?.contents ?? [])]
    .filter((page) => atCanViewPage(page, journal))
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

  const toc = [];
  const sections = [];
  const usedIds = new Set();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const pageName = String(page.name || `Page ${pageIndex + 1}`);
    let pageId = `at-page-${atSlug(pageName, `page-${pageIndex + 1}`)}`;
    while (usedIds.has(pageId)) pageId += `-${pageIndex + 1}`;
    usedIds.add(pageId);

    const tocPage = { id: pageId, title: pageName, level: 1, children: [] };
    toc.push(tocPage);

    const type = atPageType(page);
    if (type === "text" || page?.text?.content !== undefined) {
      const enriched = await atEnrichJournalHtml(page?.text?.content ?? "", page);
      const body = document.createElement("div");
      body.className = "at-journal-page-content at-shareable-text";
      body.innerHTML = enriched;

      const headings = [...body.querySelectorAll("h1, h2, h3")];
      headings.forEach((heading, headingIndex) => {
        const level = Math.min(3, Math.max(2, Number(heading.tagName.substring(1)) + 1));
        const text = String(heading.textContent || "Section").trim();
        let headingId = `${pageId}-${atSlug(text, `section-${headingIndex + 1}`)}`;
        let suffix = 2;
        while (usedIds.has(headingId)) headingId = `${pageId}-${atSlug(text)}-${suffix++}`;
        usedIds.add(headingId);
        heading.id = headingId;
        tocPage.children.push({ id: headingId, title: text, level });
      });

      sections.push(`
        <article class="at-journal-page" id="${pageId}" data-page-id="${atEscapeHtml(page.id)}">
          <header class="at-journal-page-heading">
            <span class="at-kicker">Journal Page ${pageIndex + 1}</span>
            <h2>${atEscapeHtml(pageName)}</h2>
          </header>
          ${body.outerHTML}
        </article>`);
      continue;
    }

    if (type === "image" && page?.src) {
      sections.push(`
        <article class="at-journal-page" id="${pageId}" data-page-id="${atEscapeHtml(page.id)}">
          <header class="at-journal-page-heading"><span class="at-kicker">Image Page</span><h2>${atEscapeHtml(pageName)}</h2></header>
          <figure class="at-journal-image"><img src="${atEscapeHtml(page.src)}" alt="${atEscapeHtml(pageName)}"></figure>
        </article>`);
      continue;
    }

    sections.push(`
      <article class="at-journal-page" id="${pageId}" data-page-id="${atEscapeHtml(page.id)}">
        <header class="at-journal-page-heading"><span class="at-kicker">Journal Page</span><h2>${atEscapeHtml(pageName)}</h2></header>
        <div class="at-empty">This Journal page type is stored in Foundry and can be opened from the source document.</div>
      </article>`);
  }

  return { toc, sections, pageCount: pages.length };
}

function atRenderToc(toc) {
  if (!toc.length) return '<div class="at-empty">No readable Journal pages.</div>';
  return toc.map((page) => `
    <div class="at-journal-toc-group">
      <button type="button" data-at-scroll-target="${page.id}" class="at-journal-toc-page"><i class="fa-solid fa-file-lines"></i><span>${atEscapeHtml(page.title)}</span></button>
      ${page.children.length ? `<div class="at-journal-toc-children">${page.children.map((child) => `<button type="button" data-at-scroll-target="${child.id}" class="at-journal-toc-level-${child.level}">${atEscapeHtml(child.title)}</button>`).join("")}</div>` : ""}
    </div>`).join("");
}

async function atEnhanceRuleDetail(root) {
  const page = root.querySelector(".at-rule-detail-page");
  if (!page) return;
  const sourceButton = page.querySelector('[data-action="openJournal"][data-journal-id]');
  const journalId = String(sourceButton?.dataset?.journalId || "");
  if (!journalId) return;
  const reading = page.querySelector(".at-rule-reading");
  if (!reading || reading.dataset.atStructuredJournal === journalId) return;
  const journal = game.journal?.get(journalId);
  if (!journal) return;

  reading.dataset.atStructuredJournal = journalId;
  const structured = await atBuildStructuredJournal(journal);
  if (!reading.isConnected || reading.dataset.atStructuredJournal !== journalId) return;

  const ruleTitle = atEscapeHtml(journal.name || "Rule Reference");
  reading.innerHTML = `
    <div class="at-journal-reader-header">
      <div><span class="at-kicker">Rule Reference</span><h1>${ruleTitle}</h1><p>${structured.pageCount} Journal ${structured.pageCount === 1 ? "page" : "pages"} · rendered in Adventurer's Tome</p></div>
    </div>
    <div class="at-journal-reader-layout">
      <aside class="at-journal-toc" aria-label="Rule contents"><div class="at-journal-toc-title"><i class="fa-solid fa-list"></i><span>Contents</span></div>${atRenderToc(structured.toc)}</aside>
      <div class="at-journal-document">${structured.sections.join("") || '<div class="at-empty">This Rule Journal has no readable pages yet.</div>'}</div>
    </div>`;

  if (sourceButton) {
    sourceButton.classList.remove("at-primary");
    sourceButton.classList.add("at-secondary");
    sourceButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Source in Foundry';
  }

  if (game.user?.isGM) {
    const toolbar = page.querySelector(".at-profile-toolbar-actions");
    if (toolbar && !toolbar.querySelector('[data-at-action="editRuleInTome"]')) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "at-primary";
      edit.dataset.atAction = "editRuleInTome";
      edit.dataset.journalId = journalId;
      edit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit in Tome';
      toolbar.prepend(edit);
    }
  }
}

async function atEnhanceWorldDetail(root) {
  const page = root.querySelector(".at-world-profile-page");
  if (!page) return;
  const sourceButton = page.querySelector('[data-action="openJournal"][data-journal-id]');
  const journalId = String(sourceButton?.dataset?.journalId || "");
  if (!journalId) return;
  const panel = [...page.querySelectorAll(".at-profile-panel")].find((node) => node.querySelector("h2")?.textContent?.trim() === "Known Information");
  if (!panel || panel.dataset.atRichJournal === journalId) return;
  const journal = game.journal?.get(journalId);
  if (!journal) return;

  const pages = [...(journal.pages?.contents ?? [])].filter((p) => atCanViewPage(p, journal)).sort((a,b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const preferredId = String(journal.getFlag?.(AT_MODULE_ID, "worldSyncPage") || "");
  const textPage = pages.find((p) => p.id === preferredId) || pages.find((p) => p?.text?.content !== undefined);
  if (!textPage) return;

  const html = await atEnrichJournalHtml(textPage.text?.content ?? "", textPage);
  if (!panel.isConnected) return;
  const oldBody = [...panel.children].find((child) => !child.classList?.contains("at-profile-section-heading"));
  if (oldBody) oldBody.remove();
  const body = document.createElement("div");
  body.className = "at-tome-richtext at-shareable-text";
  body.innerHTML = html || '<p class="at-empty">No Tome details have been added yet.</p>';
  panel.append(body);
  panel.dataset.atRichJournal = journalId;

  if (sourceButton) {
    sourceButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Source in Foundry';
    sourceButton.title = "Optional: open the underlying Foundry Journal. Tome remains the primary presentation.";
  }
}

function atScrollToTarget(event) {
  const button = event.target.closest("[data-at-scroll-target]");
  if (!button) return false;
  const root = button.closest(AT_TOME_ROOT);
  const target = root?.querySelector(`#${CSS.escape(button.dataset.atScrollTarget)}`);
  if (!target) return true;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("at-journal-highlight");
  window.setTimeout(() => target.classList.remove("at-journal-highlight"), 900);
  return true;
}

function atEditorPageRow(page, index) {
  const name = String(page?.name || `Page ${index + 1}`);
  const content = String(page?.text?.content ?? "");
  return `
    <section class="at-tome-editor-page" data-page-id="${atEscapeHtml(page?.id || "")}" data-new-page="${page?.id ? "false" : "true"}">
      <div class="at-tome-editor-page-head">
        <label><span>Page title</span><input type="text" data-at-page-name value="${atEscapeHtml(name)}"></label>
        <button type="button" class="at-secondary" data-at-remove-page title="Remove this page"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="at-tome-editor-toolbar" aria-label="Basic formatting">
        <button type="button" data-at-format="bold" title="Bold"><i class="fa-solid fa-bold"></i></button>
        <button type="button" data-at-format="italic" title="Italic"><i class="fa-solid fa-italic"></i></button>
        <button type="button" data-at-format="formatBlock" data-at-value="h2" title="Heading"><i class="fa-solid fa-heading"></i></button>
        <button type="button" data-at-format="insertUnorderedList" title="Bulleted list"><i class="fa-solid fa-list-ul"></i></button>
        <button type="button" data-at-format="insertOrderedList" title="Numbered list"><i class="fa-solid fa-list-ol"></i></button>
      </div>
      <div class="at-tome-editor-content" contenteditable="true" spellcheck="true">${content}</div>
    </section>`;
}

function atCloseTomeEditor(root) {
  root?.querySelector(".at-tome-editor-overlay")?.remove();
}

async function atOpenRuleEditor(journal) {
  const root = document.querySelector(AT_TOME_ROOT);
  if (!root || !journal || !game.user?.isGM) return;
  atCloseTomeEditor(root);
  const pages = [...(journal.pages?.contents ?? [])]
    .filter((p) => p?.text?.content !== undefined)
    .sort((a,b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

  const overlay = document.createElement("div");
  overlay.className = "at-tome-editor-overlay";
  overlay.dataset.journalId = journal.id;
  overlay.innerHTML = `
    <section class="at-tome-editor-shell">
      <header class="at-tome-editor-header">
        <div><span class="at-kicker">Adventurer's Tome Editor</span><h1>Edit Rule</h1><p>Journal-backed, Tome-rendered. Changes save back to the linked Foundry Journal.</p></div>
        <button type="button" class="at-icon-button" data-at-close-editor title="Close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="at-tome-editor-meta"><label><span>Rule title</span><input type="text" data-at-journal-name value="${atEscapeHtml(journal.name)}"></label><button type="button" class="at-secondary" data-at-add-page><i class="fa-solid fa-plus"></i> Add Page</button></div>
      <div class="at-tome-editor-pages">${pages.length ? pages.map(atEditorPageRow).join("") : atEditorPageRow({name: journal.name, text:{content:"<p>Write the rule here.</p>"}}, 0)}</div>
      <footer class="at-tome-editor-footer"><span><i class="fa-solid fa-arrows-rotate"></i> Saving here updates the Foundry Journal source.</span><div><button type="button" class="at-secondary" data-at-close-editor>Cancel</button><button type="button" class="at-primary" data-at-save-editor><i class="fa-solid fa-floppy-disk"></i> Save Rule</button></div></footer>
    </section>`;
  root.append(overlay);
  overlay.querySelector("[data-at-journal-name]")?.focus();
}

async function atSaveRuleEditor(overlay) {
  const journal = game.journal?.get(String(overlay?.dataset?.journalId || ""));
  if (!journal || !game.user?.isGM) return;
  const save = overlay.querySelector("[data-at-save-editor]");
  if (save) save.disabled = true;
  try {
    const name = String(overlay.querySelector("[data-at-journal-name]")?.value || journal.name).trim() || journal.name;
    if (name !== journal.name) await journal.update({ name });

    const originalTextPageIds = (journal.pages?.contents ?? []).filter((p) => p?.text?.content !== undefined).map((p) => p.id);
    const rows = [...overlay.querySelectorAll(".at-tome-editor-page")];
    const keepIds = new Set();
    const updates = [];
    const creates = [];
    rows.forEach((row, index) => {
      const id = String(row.dataset.pageId || "");
      const pageName = String(row.querySelector("[data-at-page-name]")?.value || `Page ${index + 1}`).trim() || `Page ${index + 1}`;
      const content = String(row.querySelector(".at-tome-editor-content")?.innerHTML || "<p></p>");
      const data = { name: pageName, sort: index * 100000, type: "text", text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content } };
      if (id) { keepIds.add(id); updates.push({ _id: id, ...data }); }
      else creates.push(data);
    });

    if (updates.length) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
    if (creates.length) await journal.createEmbeddedDocuments("JournalEntryPage", creates);
    const deletes = originalTextPageIds.filter((id) => !keepIds.has(id));
    if (deletes.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", deletes);

    ui.notifications.info(`Adventurer's Tome: Saved ${name}.`);
    const root = overlay.closest(AT_TOME_ROOT);
    atCloseTomeEditor(root);
    window.setTimeout(() => atEnhanceTome(), 25);
  } catch (error) {
    console.error("Adventurer's Tome | Tome Rule editor save failed", error);
    ui.notifications.error("Adventurer's Tome: The rule could not be saved. Check the console for details.");
    if (save) save.disabled = false;
  }
}

async function atEnsureRuleFolders() {
  const folders = game.folders?.contents ?? [];
  let root = folders.find((f) => f.type === "JournalEntry" && f.name === "Adventurer's Tome" && !f.folder);
  if (!root) root = await Folder.create({ name: "Adventurer's Tome", type: "JournalEntry", sorting: "a" });
  let rules = (game.folders?.contents ?? []).find((f) => f.type === "JournalEntry" && f.name === "Rules" && (f.folder?.id === root.id || f.folder === root.id));
  if (!rules) rules = await Folder.create({ name: "Rules", type: "JournalEntry", folder: root.id, sorting: "a" });
  return rules;
}

async function atCreateRuleInTome(button) {
  if (!game.user?.isGM) return;
  const root = button.closest(AT_TOME_ROOT);
  const input = root?.querySelector('[name="newRuleName"]');
  const name = String(input?.value || "").trim();
  if (!name) return ui.notifications.warn("Adventurer's Tome: Enter a rule name first.");
  try {
    const folder = await atEnsureRuleFolders();
    const journal = await CONFIG.JournalEntry.documentClass.create({
      name,
      folder: folder?.id ?? null,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2 },
      pages: [{ name, type: "text", text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1, content: "<p>Write the rule here.</p>" } }],
      flags: { [AT_MODULE_ID]: { type: "rules", [AT_RULE_FLAG]: true } }
    });
    if (input) input.value = "";
    ui.notifications.info(`Adventurer's Tome: Rule created — ${name}.`);

    const list = root?.querySelector(".at-rules-page .at-grid-list");
    if (list) {
      list.querySelector(".at-empty.at-wide:not([data-at-local-search-empty])")?.remove();
      const card = document.createElement("button");
      card.type = "button";
      card.className = "at-entry-card";
      card.dataset.action = "openRuleDetail";
      card.dataset.journalId = journal.id;
      card.dataset.atLocalSearchRow = "rules";
      card.dataset.localSearchText = `${name} write the rule here`;
      card.innerHTML = `<i class="fa-solid fa-scroll"></i><span><strong>${atEscapeHtml(name)}</strong><small>New Tome rule</small></span><i class="fa-solid fa-chevron-right"></i>`;
      list.prepend(card);
    }
    await atOpenRuleEditor(journal);
  } catch (error) {
    console.error("Adventurer's Tome | Create Rule in Tome failed", error);
    ui.notifications.error("Adventurer's Tome: The rule could not be created.");
  }
}

async function atHandleClick(event) {
  if (atScrollToTarget(event)) return;
  const root = event.target.closest(AT_TOME_ROOT);
  if (!root) return;

  const create = event.target.closest('[data-action="createRule"]');
  if (create) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await atCreateRuleInTome(create);
    return;
  }

  const edit = event.target.closest('[data-at-action="editRuleInTome"]');
  if (edit) {
    event.preventDefault();
    event.stopPropagation();
    const journal = game.journal?.get(String(edit.dataset.journalId || ""));
    if (journal) await atOpenRuleEditor(journal);
    return;
  }

  if (event.target.closest("[data-at-close-editor]")) {
    event.preventDefault();
    atCloseTomeEditor(root);
    return;
  }

  const add = event.target.closest("[data-at-add-page]");
  if (add) {
    event.preventDefault();
    const pages = root.querySelector(".at-tome-editor-pages");
    if (pages) pages.insertAdjacentHTML("beforeend", atEditorPageRow({ name: "New Page", text: { content: "<p>Write here.</p>" } }, pages.children.length));
    return;
  }

  const remove = event.target.closest("[data-at-remove-page]");
  if (remove) {
    event.preventDefault();
    const row = remove.closest(".at-tome-editor-page");
    const container = row?.parentElement;
    if (row && container && container.querySelectorAll(".at-tome-editor-page").length > 1) row.remove();
    else ui.notifications.warn("Adventurer's Tome: A rule needs at least one page.");
    return;
  }

  const format = event.target.closest("[data-at-format]");
  if (format) {
    event.preventDefault();
    const editor = format.closest(".at-tome-editor-page")?.querySelector(".at-tome-editor-content");
    editor?.focus();
    try { document.execCommand(format.dataset.atFormat, false, format.dataset.atValue || null); } catch (_err) {}
    return;
  }

  const save = event.target.closest("[data-at-save-editor]");
  if (save) {
    event.preventDefault();
    await atSaveRuleEditor(save.closest(".at-tome-editor-overlay"));
  }
}

let atEnhanceQueued = false;
async function atEnhanceTome() {
  if (atEnhanceQueued) return;
  atEnhanceQueued = true;
  await Promise.resolve();
  atEnhanceQueued = false;
  const root = document.querySelector(AT_TOME_ROOT);
  if (!root) return;
  await atEnhanceRuleDetail(root);
  await atEnhanceWorldDetail(root);
}

function atInstallObserver() {
  const observer = new MutationObserver(() => { void atEnhanceTome(); });
  observer.observe(document.body, { childList: true, subtree: true });
  void atEnhanceTome();
}

Hooks.once("ready", async () => {
  document.addEventListener("click", (event) => { void atHandleClick(event); }, true);
  atInstallObserver();

  try {
    const key = `${AT_MODULE_ID}.groupHomeLimit`;
    const worldStore = game.settings.storage?.get("world");
    const explicitlyStored = Boolean(worldStore?.has?.(key) || worldStore?.get?.(key));
    if (!explicitlyStored && Number(game.settings.get(AT_MODULE_ID, "groupHomeLimit") || 3) === 3) {
      await game.settings.set(AT_MODULE_ID, "groupHomeLimit", 8);
    }
  } catch (error) {
    console.debug("Adventurer's Tome | Could not promote implicit home roster limit; leaving the configured value unchanged.", error);
  }
});

for (const hookName of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(hookName, () => { window.setTimeout(() => { void atEnhanceTome(); }, 15); });
}
