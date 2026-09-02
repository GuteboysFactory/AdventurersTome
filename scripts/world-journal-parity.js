const ATWJ_MODULE_ID = "adventurers-tome";
const ATWJ_ROOT = "#adventurers-tome-app";
const ATWJ_SUPPORTED_TYPES = new Set(["text", "image", "video", "pdf"]);

function atWjEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atWjSlug(value, fallback = "page") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;
}

function atWjCanView(page, journal) {
  if (game.user?.isGM) return true;
  try {
    if (typeof page?.testUserPermission === "function") return page.testUserPermission(game.user, "OBSERVER");
    if (typeof journal?.testUserPermission === "function") return journal.testUserPermission(game.user, "OBSERVER");
  } catch (_err) {}
  return Boolean(page?.visible ?? journal?.visible ?? true);
}

function atWjStripSecrets(html) {
  if (game.user?.isGM) return String(html || "");
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  host.querySelectorAll(".secret, [data-secret='true'], section.secret").forEach((node) => node.remove());
  return host.innerHTML;
}

async function atWjEnrich(html, relativeTo) {
  const safe = atWjStripSecrets(html);
  try {
    return await TextEditor.enrichHTML(safe, {
      async: true,
      documents: true,
      secrets: Boolean(game.user?.isGM),
      relativeTo
    });
  } catch (error) {
    console.warn("Adventurer's Tome | World Journal text enrich failed; using stored HTML.", error);
    return safe;
  }
}

function atWjType(page) {
  return String(page?.type || "text").toLowerCase();
}

function atWjTypeIcon(type) {
  return ({ text: "fa-file-lines", image: "fa-image", video: "fa-film", pdf: "fa-file-pdf" })[type] || "fa-puzzle-piece";
}

function atWjResolveMedia(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;
  try { return foundry.utils.getRoute(value); } catch (_err) { return value; }
}

function atWjVideoEmbed(src) {
  const value = String(src || "").trim();
  if (!value) return null;
  const yt = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

async function atWjRenderPage(page, index) {
  const type = atWjType(page);
  const name = String(page.name || `Page ${index + 1}`);
  const id = `at-world-journal-${atWjSlug(name, `page-${index + 1}`)}-${String(page.id || index).slice(-5)}`;
  let body = "";

  if (type === "text") {
    const html = await atWjEnrich(page?.text?.content ?? "", page);
    body = `<div class="at-world-journal-text at-tome-richtext at-shareable-text">${html || '<p class="at-empty">This text page is empty.</p>'}</div>`;
  } else if (type === "image") {
    const src = atWjResolveMedia(page?.src);
    const caption = String(page?.image?.caption || "").trim();
    body = src
      ? `<figure class="at-world-journal-image at-shareable-text"><img src="${atWjEscape(src)}" alt="${atWjEscape(name)}">${caption ? `<figcaption>${atWjEscape(caption)}</figcaption>` : ""}</figure>`
      : '<div class="at-empty">This image page has no source file.</div>';
  } else if (type === "video") {
    const src = atWjResolveMedia(page?.src);
    const embed = atWjVideoEmbed(src);
    const loop = Boolean(page?.video?.loop);
    const autoplay = Boolean(page?.video?.autoplay);
    const width = Number(page?.video?.width || 0);
    const height = Number(page?.video?.height || 0);
    const dimensions = width || height ? `<small>${width || "auto"} × ${height || "auto"}</small>` : "";
    body = src
      ? `<div class="at-world-journal-video">${embed
          ? `<iframe src="${atWjEscape(embed)}" title="${atWjEscape(name)}" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
          : `<video src="${atWjEscape(src)}" controls playsinline ${loop ? "loop" : ""} ${autoplay ? "autoplay" : ""}></video>`}
          <div class="at-world-media-meta"><a href="${atWjEscape(src)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open media</a>${loop ? "<span>Loop</span>" : ""}${autoplay ? "<span>Autoplay</span>" : ""}${dimensions}</div></div>`
      : '<div class="at-empty">This video page has no source file.</div>';
  } else if (type === "pdf") {
    const src = atWjResolveMedia(page?.src);
    body = src
      ? `<div class="at-world-journal-pdf"><iframe src="${atWjEscape(src)}" title="${atWjEscape(name)}" loading="lazy"></iframe><a class="at-secondary at-world-media-open" href="${atWjEscape(src)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open PDF</a></div>`
      : '<div class="at-empty">This PDF page has no source file.</div>';
  } else {
    body = `<div class="at-world-journal-unsupported"><i class="fa-solid fa-puzzle-piece"></i><div><strong>${atWjEscape(type || "Custom")} Journal page</strong><p>This is a system/module-defined Journal page type. Tome preserves it, but this RC does not reinterpret custom page data.</p></div></div>`;
  }

  return {
    id,
    name,
    type,
    icon: atWjTypeIcon(type),
    html: `<article class="at-world-journal-page" id="${id}" data-page-id="${atWjEscape(page.id)}" data-page-type="${atWjEscape(type)}"><header><span class="at-world-page-type"><i class="fa-solid ${atWjTypeIcon(type)}"></i>${atWjEscape(type)}</span><h2>${atWjEscape(name)}</h2></header>${body}</article>`
  };
}

function atWjPreferredOverviewId(journal, pages) {
  const profile = journal.getFlag?.(ATWJ_MODULE_ID, "worldProfile");
  const preferred = String(journal.getFlag?.(ATWJ_MODULE_ID, "worldSyncPage") || profile?.syncPageId || "");
  if (preferred && pages.some((page) => page.id === preferred)) return preferred;
  return pages.find((page) => atWjType(page) === "text")?.id || "";
}

async function atWjEnhanceWorld(root) {
  const world = root.querySelector(".at-world-profile-page");
  if (!world) return;
  const sourceButton = world.querySelector('[data-action="openJournal"][data-journal-id]');
  const journalId = String(sourceButton?.dataset?.journalId || "");
  if (!journalId) return;
  const journal = game.journal?.get(journalId);
  if (!journal) return;

  const existing = world.querySelector(`.at-world-journal-parity[data-journal-id="${CSS.escape(journalId)}"]`);
  const stamp = `${journalId}:${journal._stats?.modifiedTime || journal._stats?.updatedTime || journal.pages?.size || 0}:${journal.pages?.contents?.map((p) => `${p.id}:${p._stats?.modifiedTime || p.sort || 0}`).join("|")}`;
  if (existing?.dataset?.stamp === stamp) return;
  existing?.remove();

  const pages = [...(journal.pages?.contents ?? [])]
    .filter((page) => atWjCanView(page, journal))
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const overviewId = atWjPreferredOverviewId(journal, pages);
  const additional = pages.filter((page) => page.id !== overviewId);

  if (game.user?.isGM) {
    const toolbar = world.querySelector(".at-profile-toolbar-actions");
    if (toolbar && !toolbar.querySelector('[data-at-wj-action="editPages"]')) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "at-secondary";
      edit.dataset.atWjAction = "editPages";
      edit.dataset.journalId = journalId;
      edit.innerHTML = '<i class="fa-solid fa-layer-group"></i> Edit Journal Pages';
      const source = toolbar.querySelector('[data-action="openJournal"]');
      if (source) toolbar.insertBefore(edit, source);
      else toolbar.append(edit);
    }
  }

  if (sourceButton) {
    sourceButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Source in Foundry';
    sourceButton.title = "Optional source view. Adventurer's Tome renders the campaign-facing Journal experience.";
  }

  const profileContent = world.querySelector(".at-profile-content");
  if (!profileContent) return;

  const shell = document.createElement("section");
  shell.className = "at-profile-panel at-world-journal-parity";
  shell.dataset.journalId = journalId;
  shell.dataset.stamp = stamp;

  if (!additional.length) {
    shell.innerHTML = `<div class="at-world-journal-single"><i class="fa-solid fa-file-lines"></i><span><strong>Foundry Journal synced</strong><small>This World entry currently has one readable Journal page. Add more pages in Tome or Foundry when the entry grows.</small></span>${game.user?.isGM ? `<button type="button" class="at-secondary" data-at-wj-action="editPages" data-journal-id="${atWjEscape(journalId)}"><i class="fa-solid fa-plus"></i> Manage Pages</button>` : ""}</div>`;
  } else {
    const rendered = [];
    for (let index = 0; index < additional.length; index += 1) rendered.push(await atWjRenderPage(additional[index], index));
    shell.innerHTML = `
      <div class="at-world-journal-heading"><div><span class="at-kicker">Journal-backed World</span><h2>More from ${atWjEscape(journal.name)}</h2><p>${pages.length} readable Journal ${pages.length === 1 ? "page" : "pages"} · page order and media preserved</p></div>${game.user?.isGM ? `<button type="button" class="at-secondary" data-at-wj-action="editPages" data-journal-id="${atWjEscape(journalId)}"><i class="fa-solid fa-layer-group"></i> Manage Pages</button>` : ""}</div>
      <div class="at-world-journal-layout">
        <nav class="at-world-journal-toc" aria-label="World Journal pages">
          ${rendered.map((page) => `<button type="button" data-at-wj-scroll="${atWjEscape(page.id)}"><i class="fa-solid ${page.icon}"></i><span><strong>${atWjEscape(page.name)}</strong><small>${atWjEscape(page.type)}</small></span></button>`).join("")}
        </nav>
        <div class="at-world-journal-document">${rendered.map((page) => page.html).join("")}</div>
      </div>`;
  }

  profileContent.insertAdjacentElement("afterend", shell);
}

function atWjPermissionOptions(page) {
  const current = Number(page?.ownership?.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1);
  const levels = [
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1, "Inherit from Journal"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0, "None"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1, "Limited"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2, "Observer"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3, "Owner"]
  ];
  return levels.map(([value, label]) => `<option value="${value}" ${Number(value) === current ? "selected" : ""}>${label}</option>`).join("");
}

function atWjEditorToolbar() {
  return `<div class="at-wj-editor-toolbar"><button type="button" data-at-wj-format="bold"><i class="fa-solid fa-bold"></i></button><button type="button" data-at-wj-format="italic"><i class="fa-solid fa-italic"></i></button><button type="button" data-at-wj-format="formatBlock" data-value="h2"><i class="fa-solid fa-heading"></i></button><button type="button" data-at-wj-format="insertUnorderedList"><i class="fa-solid fa-list-ul"></i></button><button type="button" data-at-wj-format="insertOrderedList"><i class="fa-solid fa-list-ol"></i></button></div>`;
}

function atWjEditorRow(page, index, isNew = false) {
  const type = atWjType(page);
  const supported = ATWJ_SUPPORTED_TYPES.has(type);
  const name = String(page?.name || `New ${type} page`);
  const common = `
    <div class="at-wj-editor-row-head">
      <span class="at-wj-drag"><i class="fa-solid fa-grip-lines"></i></span>
      <label><span>Page title</span><input type="text" data-at-wj-name value="${atWjEscape(name)}" ${supported ? "" : "disabled"}></label>
      <span class="at-wj-type"><i class="fa-solid ${atWjTypeIcon(type)}"></i>${atWjEscape(type)}</span>
      <label class="at-wj-permission"><span>Player access</span><select data-at-wj-permission ${supported ? "" : "disabled"}>${atWjPermissionOptions(page)}</select></label>
      <div class="at-wj-order"><button type="button" data-at-wj-move="up" title="Move up"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-at-wj-move="down" title="Move down"><i class="fa-solid fa-chevron-down"></i></button></div>
      ${supported ? '<button type="button" class="at-wj-remove" data-at-wj-remove title="Remove page"><i class="fa-solid fa-trash"></i></button>' : ""}
    </div>`;

  let editor = "";
  if (type === "text") {
    editor = `${atWjEditorToolbar()}<div class="at-wj-text-editor" contenteditable="true" spellcheck="true">${String(page?.text?.content ?? "<p>Write here.</p>")}</div>`;
  } else if (type === "image") {
    editor = `<div class="at-wj-media-fields"><label><span>Image source</span><input type="text" data-at-wj-src value="${atWjEscape(page?.src || "")}" placeholder="path/to/image.webp or https://…"></label><label><span>Caption</span><input type="text" data-at-wj-caption value="${atWjEscape(page?.image?.caption || "")}"></label></div>`;
  } else if (type === "video") {
    editor = `<div class="at-wj-media-fields at-wj-video-fields"><label class="wide"><span>Video source / YouTube / Vimeo</span><input type="text" data-at-wj-src value="${atWjEscape(page?.src || "")}" placeholder="path/to/video.webm or https://…"></label><label><span>Volume</span><input type="number" min="0" max="1" step="0.05" data-at-wj-volume value="${Number(page?.video?.volume ?? 0.5)}"></label><label><span>Start timestamp</span><input type="number" min="0" step="1" data-at-wj-timestamp value="${Number(page?.video?.timestamp ?? 0)}"></label><label><span>Width</span><input type="number" min="0" step="1" data-at-wj-width value="${Number(page?.video?.width ?? 0)}"></label><label><span>Height</span><input type="number" min="0" step="1" data-at-wj-height value="${Number(page?.video?.height ?? 0)}"></label><label class="at-wj-check"><input type="checkbox" data-at-wj-loop ${page?.video?.loop ? "checked" : ""}><span>Loop</span></label><label class="at-wj-check"><input type="checkbox" data-at-wj-autoplay ${page?.video?.autoplay ? "checked" : ""}><span>Autoplay</span></label></div>`;
  } else if (type === "pdf") {
    editor = `<div class="at-wj-media-fields"><label><span>PDF source</span><input type="text" data-at-wj-src value="${atWjEscape(page?.src || "")}" placeholder="path/to/document.pdf or https://…"></label></div>`;
  } else {
    editor = `<div class="at-world-journal-unsupported"><i class="fa-solid fa-shield-halved"></i><div><strong>Custom Journal page preserved</strong><p>Tome will not overwrite this ${atWjEscape(type)} page. Use Open Source in Foundry if the owning system/module needs to edit its custom fields.</p></div></div>`;
  }

  return `<section class="at-wj-editor-row" data-page-id="${atWjEscape(page?.id || "")}" data-page-type="${atWjEscape(type)}" data-new-page="${isNew ? "true" : "false"}">${common}${editor}</section>`;
}

function atWjCloseEditor() {
  document.querySelector(ATWJ_ROOT)?.querySelector(".at-wj-editor-overlay")?.remove();
}

async function atWjOpenEditor(journal) {
  if (!game.user?.isGM || !journal) return;
  const root = document.querySelector(ATWJ_ROOT);
  if (!root) return;
  atWjCloseEditor();
  const pages = [...(journal.pages?.contents ?? [])].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const overlay = document.createElement("div");
  overlay.className = "at-wj-editor-overlay";
  overlay.dataset.journalId = journal.id;
  overlay.innerHTML = `
    <section class="at-wj-editor-shell">
      <header class="at-wj-editor-header"><div><span class="at-kicker">World Journal Editor</span><h1>${atWjEscape(journal.name)}</h1><p>Manage Foundry Journal Pages without leaving Adventurer's Tome. Core Text, Image, Video and PDF pages are supported; custom page types are preserved.</p></div><button type="button" class="at-icon-button" data-at-wj-close><i class="fa-solid fa-xmark"></i></button></header>
      <div class="at-wj-editor-add"><span>Add Journal Page</span><button type="button" data-at-wj-add="text"><i class="fa-solid fa-file-lines"></i> Text</button><button type="button" data-at-wj-add="image"><i class="fa-solid fa-image"></i> Image</button><button type="button" data-at-wj-add="video"><i class="fa-solid fa-film"></i> Video</button><button type="button" data-at-wj-add="pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button></div>
      <div class="at-wj-editor-pages">${pages.length ? pages.map((page, index) => atWjEditorRow(page, index)).join("") : atWjEditorRow({ type: "text", name: "Overview", text: { content: "<p>Write here.</p>" }, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1 } }, 0, true)}</div>
      <footer class="at-wj-editor-footer"><span><i class="fa-solid fa-database"></i> Saves directly to the linked Foundry Journal; Tome remains the presentation layer.</span><div><button type="button" class="at-secondary" data-at-wj-close>Cancel</button><button type="button" class="at-primary" data-at-wj-save><i class="fa-solid fa-floppy-disk"></i> Save Journal Pages</button></div></footer>
    </section>`;
  root.append(overlay);
}

function atWjNumber(row, selector, fallback = undefined) {
  const raw = String(row.querySelector(selector)?.value ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function atWjDataFromRow(row, index) {
  const type = String(row.dataset.pageType || "text");
  const data = {
    name: String(row.querySelector("[data-at-wj-name]")?.value || `Page ${index + 1}`).trim() || `Page ${index + 1}`,
    sort: (index + 1) * 100000,
    ownership: { default: Number(row.querySelector("[data-at-wj-permission]")?.value ?? CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1) }
  };
  if (type === "text") {
    data.type = "text";
    data.text = {
      content: String(row.querySelector(".at-wj-text-editor")?.innerHTML || "<p></p>"),
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    };
  } else if (type === "image") {
    data.type = "image";
    data.src = String(row.querySelector("[data-at-wj-src]")?.value || "").trim() || null;
    data.image = { caption: String(row.querySelector("[data-at-wj-caption]")?.value || "").trim() || undefined };
  } else if (type === "video") {
    data.type = "video";
    data.src = String(row.querySelector("[data-at-wj-src]")?.value || "").trim() || null;
    data.video = {
      loop: Boolean(row.querySelector("[data-at-wj-loop]")?.checked),
      autoplay: Boolean(row.querySelector("[data-at-wj-autoplay]")?.checked),
      volume: Math.max(0, Math.min(1, atWjNumber(row, "[data-at-wj-volume]", 0.5))),
      timestamp: Math.max(0, atWjNumber(row, "[data-at-wj-timestamp]", 0)),
      width: Math.max(0, atWjNumber(row, "[data-at-wj-width]", 0)) || undefined,
      height: Math.max(0, atWjNumber(row, "[data-at-wj-height]", 0)) || undefined
    };
  } else if (type === "pdf") {
    data.type = "pdf";
    data.src = String(row.querySelector("[data-at-wj-src]")?.value || "").trim() || null;
  }
  return data;
}

async function atWjSaveEditor(overlay) {
  if (!game.user?.isGM) return;
  const journal = game.journal?.get(String(overlay.dataset.journalId || ""));
  if (!journal) return;
  const save = overlay.querySelector("[data-at-wj-save]");
  if (save) save.disabled = true;
  try {
    const original = [...(journal.pages?.contents ?? [])];
    const originalSupportedIds = new Set(original.filter((page) => ATWJ_SUPPORTED_TYPES.has(atWjType(page))).map((page) => page.id));
    const rows = [...overlay.querySelectorAll(".at-wj-editor-row")];
    const keepSupportedIds = new Set();
    const updates = [];
    const creates = [];

    rows.forEach((row, index) => {
      const type = String(row.dataset.pageType || "text");
      const id = String(row.dataset.pageId || "");
      if (!ATWJ_SUPPORTED_TYPES.has(type)) {
        if (id) updates.push({ _id: id, sort: (index + 1) * 100000 });
        return;
      }
      const data = atWjDataFromRow(row, index);
      if (id) {
        keepSupportedIds.add(id);
        updates.push({ _id: id, ...data });
      } else creates.push(data);
    });

    if (updates.length) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
    if (creates.length) await journal.createEmbeddedDocuments("JournalEntryPage", creates);
    const deletes = [...originalSupportedIds].filter((id) => !keepSupportedIds.has(id));
    if (deletes.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", deletes);

    ui.notifications.info(`Adventurer's Tome: Saved Journal pages for ${journal.name}.`);
    atWjCloseEditor();
    window.setTimeout(() => { void atWjEnhance(); }, 40);
  } catch (error) {
    console.error("Adventurer's Tome | World Journal page save failed", error);
    ui.notifications.error("Adventurer's Tome: Journal pages could not be saved. Check the console for details.");
    if (save) save.disabled = false;
  }
}

function atWjMove(row, direction) {
  const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction === "up") row.parentElement.insertBefore(row, sibling);
  else row.parentElement.insertBefore(sibling, row);
}

function atWjHandleClick(event) {
  const root = event.target.closest(ATWJ_ROOT);
  if (!root) return;

  const edit = event.target.closest('[data-at-wj-action="editPages"]');
  if (edit) {
    event.preventDefault();
    event.stopPropagation();
    const journal = game.journal?.get(String(edit.dataset.journalId || ""));
    if (journal) void atWjOpenEditor(journal);
    return;
  }

  const scroll = event.target.closest("[data-at-wj-scroll]");
  if (scroll) {
    event.preventDefault();
    const target = root.querySelector(`#${CSS.escape(scroll.dataset.atWjScroll)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.classList.add("at-journal-highlight");
    window.setTimeout(() => target?.classList.remove("at-journal-highlight"), 900);
    return;
  }

  const overlay = event.target.closest(".at-wj-editor-overlay");
  if (!overlay) return;
  if (event.target.closest("[data-at-wj-close]")) return atWjCloseEditor();

  const add = event.target.closest("[data-at-wj-add]");
  if (add) {
    event.preventDefault();
    const type = String(add.dataset.atWjAdd || "text");
    const pages = overlay.querySelector(".at-wj-editor-pages");
    const blank = { type, name: `New ${type[0].toUpperCase()}${type.slice(1)} Page`, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.INHERIT ?? -1 } };
    if (type === "text") blank.text = { content: "<p>Write here.</p>" };
    if (type === "video") blank.video = { volume: 0.5 };
    pages?.insertAdjacentHTML("beforeend", atWjEditorRow(blank, pages.children.length, true));
    return;
  }

  const move = event.target.closest("[data-at-wj-move]");
  if (move) {
    event.preventDefault();
    const row = move.closest(".at-wj-editor-row");
    if (row) atWjMove(row, move.dataset.atWjMove);
    return;
  }

  const remove = event.target.closest("[data-at-wj-remove]");
  if (remove) {
    event.preventDefault();
    const row = remove.closest(".at-wj-editor-row");
    if (!row) return;
    row.classList.add("is-removing");
    window.setTimeout(() => row.remove(), 120);
    return;
  }

  const format = event.target.closest("[data-at-wj-format]");
  if (format) {
    event.preventDefault();
    const editor = format.closest(".at-wj-editor-row")?.querySelector(".at-wj-text-editor");
    editor?.focus();
    try { document.execCommand(format.dataset.atWjFormat, false, format.dataset.value || null); } catch (_err) {}
    return;
  }

  const save = event.target.closest("[data-at-wj-save]");
  if (save) {
    event.preventDefault();
    void atWjSaveEditor(overlay);
  }
}

let atWjQueued = false;
async function atWjEnhance() {
  if (atWjQueued) return;
  atWjQueued = true;
  await Promise.resolve();
  atWjQueued = false;
  const root = document.querySelector(ATWJ_ROOT);
  if (!root) return;
  await atWjEnhanceWorld(root);
}

Hooks.once("ready", () => {
  document.addEventListener("click", atWjHandleClick, true);
  const observer = new MutationObserver(() => { void atWjEnhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
  void atWjEnhance();
});

for (const hookName of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"]) {
  Hooks.on(hookName, () => window.setTimeout(() => { void atWjEnhance(); }, 30));
}
