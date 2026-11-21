globalThis.ATTestAI.assertEnabled();
const ATUS_MODULE_ID = "adventurers-tome";
const ATUS_ROOT = "#adventurers-tome-app";
const ATUS_MAX_TEXT = 5000;

let atusCaptured = null;
let atusToolbar = null;
let atusMenu = null;
const atusNativeSheets = new WeakMap();
const ATUS_RESTRICTED = ".secret, [data-secret='true'], .is-gm-only, [data-gm-only='true'], .at-gm-note-stack, .at-detail-gm-note, .at-vault-dialog, .at-vault-hover";
const atusElement = node => node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;

function atusEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atusInsideTome(node) {
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return Boolean(element?.closest?.(ATUS_ROOT));
}

function atusEditing(node) {
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true'], .at-tome-editor-overlay"));
}

function atusSourceTitle(root = document.querySelector(ATUS_ROOT)) {
  if (!root) return "Adventurer's Tome";
  const selectors = [
    ".at-rule-detail-page .at-journal-page-heading h2",
    ".at-rule-detail-page .at-journal-reader-header h1",
    ".at-world-profile-page h1",
    ".at-quest-detail-page h1",
    ".at-profile-page h1",
    ".at-session-detail-head h2",
    "main h1"
  ];
  for (const selector of selectors) {
    const value = String(root.querySelector(selector)?.textContent || "").trim();
    if (value) return value;
  }
  return "Adventurer's Tome";
}

function atusCleanClone(container, { playerSafe = false } = {}) {
  const remove = [
    '.at-chronicle',
    "script", "style", "form", "input", "textarea", "select", "option", "button",
    "iframe", "canvas", "audio", "video",
    ".at-profile-toolbar", ".at-detail-toolbar", ".at-topbar", ".at-page-tools",
    ".at-gm-note-stack", ".at-detail-gm-note", ".at-access-badges",
    ".at-favorite-button", ".at-favorite-icon", ".at-sync-badge",
    ".at-selection-share", ".at-universal-share", ".at-share-current-button",
    "[hidden]", "[aria-hidden='true']"
  ];
  if (playerSafe) remove.push(ATUS_RESTRICTED);
  container.querySelectorAll(remove.join(",")).forEach((node) => node.remove());

  const allowed = new Set([
    "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE",
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
    "UL", "OL", "LI", "H1", "H2", "H3", "H4",
    "BLOCKQUOTE", "CODE", "PRE", "TABLE", "CAPTION", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "FIGURE", "FIGCAPTION",
    "A", "SPAN", "SMALL", "IMG"
  ]);

  for (const node of [...container.querySelectorAll("*")]) {
    if (!(node instanceof HTMLElement)) continue;
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }

    const href = node.tagName === "A" ? String(node.getAttribute("href") || "") : "";
    const src = node.tagName === "IMG" ? String(node.getAttribute("src") || "").trim() : "";
    const alt = node.tagName === "IMG" ? String(node.getAttribute("alt") || "") : "";
    const spans = ["rowspan", "colspan"].map(key => [key, node.getAttribute(key)]);
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);

    if (node.tagName === "A" && /^(?:https?:|mailto:)/i.test(href)) {
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (["TH", "TD"].includes(node.tagName)) {
      for (const [key, value] of spans) if (/^[1-9]\d{0,2}$/.test(value || "")) node.setAttribute(key, value);
    }
    if (node.tagName === "IMG") {
      try {
        if (!src || !["http:", "https:"].includes(new URL(src, document.baseURI).protocol)) throw Error();
        node.setAttribute("src", src);
        node.setAttribute("alt", alt);
      } catch { node.remove(); }
    }
  }
  return container;
}

function atusHtmlFromRange(range, native = false) {
  const container = document.createElement("div");
  container.append(range.cloneContents());
  atusCleanClone(container, { playerSafe: true });
  const tablePart = container.firstElementChild?.tagName;
  if (["TD", "TH", "TR", "CAPTION", "THEAD", "TBODY", "TFOOT"].includes(tablePart)) {
    const table = document.createElement("table");
    const target = ["TD", "TH"].includes(tablePart) ? table.createTBody().insertRow() : table;
    target.append(...container.childNodes);
    container.append(table);
  }
  const text = String(container.textContent || "").replace(/\s+/g, " ").trim();
  const image = container.querySelector("img[src]");
  if (!text && !image) return null;
  const limit = native ? 50_000 : ATUS_MAX_TEXT;
  if (text.length > limit || container.innerHTML.length > 150_000) {
    const clipped = `${(text || image?.alt || "Selected image").slice(0, limit - 1).trimEnd()}…`;
    return { html: `<p>${atusEscape(clipped)}</p>`, text: clipped };
  }
  return { html: container.innerHTML, text: text || image.alt || "Selected image" };
}

function atusNativeSelection(range, element) {
  const sheet = element?.closest?.("[data-atus-native-source]");
  const entry = sheet && atusNativeSheets.get(sheet);
  if (!entry || !sheet.contains(range.startContainer) || !sheet.contains(range.endContainer)) return null;
  if (element.closest(".window-header, .journal-sidebar")) return null;
  if (entry.documentName !== "JournalEntry") return {sheet, documents:[entry]};
  const pages = [...sheet.querySelectorAll(".journal-entry-page[data-page-id]")];
  if (!pages.length) return {sheet, documents:[entry]};
  if (![range.startContainer, range.endContainer].every(node => atusElement(node)?.closest?.(".journal-entry-page[data-page-id]"))) return null;
  const selected = pages.filter(page => range.intersectsNode ? range.intersectsNode(page) : page.contains(range.startContainer))
    .map(page => entry.pages.get(page.dataset.pageId));
  return selected.length && selected.every(Boolean) ? {sheet, documents:[entry, ...selected]} : null;
}

function atusCaptureSelection() {
  const field = document.activeElement;
  if (field?.matches?.('textarea, input[type="text"], input:not([type])') && field.selectionEnd > field.selectionStart) {
    const selected = atusNativeSelection({startContainer:field,endContainer:field},field);
    if (selected && !field.closest(ATUS_RESTRICTED)) {
      const text = field.value.slice(field.selectionStart,field.selectionEnd).slice(0,50_000);
      if (text.trim()) return atusSelectionPayload({text,html:`<p>${atusEscape(text).replaceAll("\n","<br>")}</p>`},field.getBoundingClientRect(),selected);
    }
  }
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const element = atusElement(range.commonAncestorContainer);
  const boundaries = [range.startContainer, range.endContainer, range.commonAncestorContainer];
  if (boundaries.some(node => atusElement(node)?.closest?.(ATUS_RESTRICTED))) return null;
  const insideTome = atusInsideTome(element);
  const native = insideTome ? null : atusNativeSelection(range, element);
  if (!insideTome && !native) return null;
  if (insideTome && boundaries.some(atusEditing)) return null;
  if (Array.from(element?.querySelectorAll?.(ATUS_RESTRICTED) || []).some(node => range.intersectsNode(node))) return null;
  const payload = atusHtmlFromRange(range, Boolean(native));
  if (!payload) return null;
  return atusSelectionPayload(payload,range.getBoundingClientRect(),native);
}

function atusSelectionPayload(payload,rect,native) {
  return {
    ...payload,
    title: native?.documents[0].name || atusSourceTitle(),
    ...(native && {sourceSheet:native.sheet, sourceDocuments:native.documents, sourceUuids:native.documents.map(doc => doc.uuid)}),
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    }
  };
}

function atusEnsureToolbar() {
  if (atusToolbar?.isConnected) return atusToolbar;
  atusToolbar = document.createElement("div");
  atusToolbar.className = "at-universal-share";
  atusToolbar.hidden = true;
  atusToolbar.innerHTML = `
    <button type="button" data-atus-public title="Send the selection to chat"><i class="fa-solid fa-comment"></i> Send to Chat</button>
    <button type="button" data-atus-whisper title="Whisper the selection"><i class="fa-solid fa-user-secret"></i> Whisper…</button>`;
  atusToolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  document.body.append(atusToolbar);
  return atusToolbar;
}

function atusHideToolbar() {
  if (atusToolbar) atusToolbar.hidden = true;
}

function atusPositionToolbar(capture) {
  const toolbar = atusEnsureToolbar();
  toolbar.hidden = false;
  const margin = 8;
  const width = toolbar.offsetWidth || 190;
  const height = toolbar.offsetHeight || 38;
  let left = capture.rect.left + (capture.rect.width / 2) - (width / 2);
  let top = capture.rect.top - height - margin;
  if (top < margin) top = capture.rect.bottom + margin;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
}

function atusUpdateSelection() {
  const capture = atusCaptureSelection();
  if (!capture) {
    if (!atusMenu?.isConnected) {
      atusCaptured = null;
      atusHideToolbar();
    }
    return;
  }
  atusCaptured = capture;
  atusPositionToolbar(capture);
}

function atusCurrentRulePage(root) {
  const pages = [...root.querySelectorAll(".at-rule-detail-page .at-journal-page")];
  if (!pages.length) return null;
  const viewport = root.getBoundingClientRect();
  return pages.find((page) => {
    const rect = page.getBoundingClientRect();
    return rect.bottom > viewport.top + 120 && rect.top < viewport.bottom - 60;
  }) || pages[0];
}

function atusCurrentShareSurface(root) {
  const rulePage = atusCurrentRulePage(root);
  if (rulePage) return { node: rulePage, title: String(rulePage.querySelector("h2")?.textContent || atusSourceTitle(root)).trim() };

  const candidates = [
    [".at-world-profile-page", ".at-world-profile-page h1"],
    [".at-quest-detail-page", ".at-quest-detail-page h1"],
    [".at-profile-page:not(:has(form))", ".at-profile-page h1"],
    [".at-session-detail", ".at-session-detail-head h2"],
    [".at-rule-detail-page .at-rule-reading", ".at-rule-detail-page h1"]
  ];
  for (const [surfaceSelector, titleSelector] of candidates) {
    const node = root.querySelector(surfaceSelector);
    if (!node) continue;
    const title = String(root.querySelector(titleSelector)?.textContent || atusSourceTitle(root)).trim();
    return { node, title };
  }
  return null;
}

function atusSnapshotCurrentView() {
  const root = document.querySelector(ATUS_ROOT);
  if (!root) return null;
  const surface = atusCurrentShareSurface(root);
  if (!surface) return null;

  const container = document.createElement("div");
  container.append(surface.node.cloneNode(true));
  atusCleanClone(container, { playerSafe: true });

  const text = String(container.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > ATUS_MAX_TEXT) {
    const clipped = `${text.slice(0, ATUS_MAX_TEXT - 1).trimEnd()}…`;
    return { title: surface.title, html: `<p>${atusEscape(clipped)}</p>`, text: clipped, snapshot: true };
  }
  return { title: surface.title, html: container.innerHTML, text, snapshot: true };
}

const ATUS_NATIVE_TYPES = new Set(["Actor", "Item", "JournalEntry", "JournalEntryPage", "Scene", "RollTable", "Cards"]);
const atusIsLink = (payload) => Boolean(payload.refKey || payload.documentUuid);
const atusChecksAccess = payload => atusIsLink(payload) || Boolean(payload.sourceUuids?.length);

function atusCanReadNative(entry, user, api) {
  if (!entry || !user || !ATUS_NATIVE_TYPES.has(entry.documentName)) return false;
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const source = entry.parent || entry;
  if (api?.usesTomeAccess?.(source) && !api.canView(source, user)) return false;
  if (user.isGM) return true;
  if (source.pack && !game.packs.get(source.pack)?.testUserPermission(user, observer)) return false;
  return entry.testUserPermission(user, observer);
}

function atusShareAccess(payload, recipients) {
  const api = globalThis.ATTestAI.modules.get(ATUS_MODULE_ID)?.api;
  if (payload.sourceUuids?.length) {
    const documents = payload.sourceDocuments || [];
    return payload.sourceUuids.every((uuid,index) => documents[index]?.uuid === uuid &&
      [game.user, ...recipients].every(user => atusCanReadNative(documents[index],user,api)));
  }
  if (payload.refKey) {
    const entry = api?.resolveEntry?.(payload.refKey);
    return entry && recipients.every((user) => user && api.canView(entry, user)) ? entry : null;
  }
  const entry = payload.document;
  return entry?.uuid === payload.documentUuid && [game.user, ...recipients].every(user => atusCanReadNative(entry, user, api)) ? entry : null;
}

function atusChatCard(payload) {
  const label = payload.snapshot || atusIsLink(payload) ? "Shared from Adventurer's Tome" : "Excerpt from Adventurer's Tome";
  return `
    <article class="adventurers-tome-share-card">
      <header><i class="fa-solid fa-book-open"></i><div><small>${atusEscape(label)}</small><strong>${atusEscape(payload.title || "Adventurer's Tome")}</strong></div></header>
      <div class="adventurers-tome-share-body">${payload.html}</div>
    </article>`;
}

function atusShareDocument(entry,refKey){
  const kind=refKey?.split(':')[0];
  const label=({session:'Session',quest:'Quest',world:'World',rule:'Rule'})[kind] ||
    ({Actor:'Character',Item:'Item',JournalEntry:'Journal',JournalEntryPage:'Journal page',Scene:'Scene',RollTable:'Roll table',Cards:'Cards'})[entry.documentName] || 'Document';
  let art=entry.documentName==='Scene'?entry.thumb || entry.background?.src:entry.img;
  try{if(!art||!['http:','https:'].includes(new URL(art,document.baseURI).protocol))art='';}catch{art='';}
  let detail='';
  if(entry.documentName==='Item') {
    const raw=entry.system?.description;
    const description=typeof raw==='string'?raw:raw?.value;
    if(typeof description==='string'&&globalThis.DOMParser){
      const body=new DOMParser().parseFromString(description,'text/html').body;
      for(const node of body.querySelectorAll(`${ATUS_RESTRICTED},secret-block,script,style,[hidden]`))node.remove();
      const summary=body.textContent.replace(/\s+/g,' ').trim();
      detail=summary.length>280?`${summary.slice(0,279).trimEnd()}…`:summary;
    }
  } else if(entry.documentName==='RollTable'&&Number.isInteger(entry.results?.size))detail=`${entry.results.size} results`;
  else if(entry.documentName==='Cards'&&Number.isInteger(entry.cards?.size))detail=`${entry.cards.size} cards`;
  else if(kind==='quest') {
    const status=entry.flags?.[ATUS_MODULE_ID]?.status;
    if(['active','dormant','completed','failed'].includes(status))detail=status[0].toUpperCase()+status.slice(1);
  }
  return `<div class="at-doc-chat-summary">${art?`<img src="${atusEscape(art)}" alt="" loading="lazy">`:''}<div><small>${label}</small>${detail?`<p>${atusEscape(detail)}</p>`:''}<p>${entry.toAnchor({name:`Open ${entry.name}`}).outerHTML}</p></div></div>`;
}

async function atusCreateChat(payload, whisper = []) {
  if (payload && atusChecksAccess(payload)) {
    if (payload.documentUuid) {
      const document = await foundry.utils.fromUuid(payload.documentUuid);
      payload = { ...payload, document };
    }
    if (payload.sourceUuids) {
      const sourceDocuments = await Promise.all(payload.sourceUuids.map(uuid => foundry.utils.fromUuid(uuid)));
      payload = {...payload, sourceDocuments};
    }
    const recipients = whisper.length ? whisper.map((id) => game.users.get(id)) : (game.users?.contents || []);
    const entry = atusShareAccess(payload, recipients);
    if (!entry) return ui.notifications.warn("Adventurer's Tome: Everyone receiving this share needs access to the source. Choose eligible whisper recipients or review its permissions.");
    if (atusIsLink(payload)) payload = {
      ...payload,
      text: entry.name,
      title: entry.name,
      html: atusShareDocument(entry,payload.refKey)
    };
  }
  if (!payload?.text) return;
  const speaker = ChatMessage.getSpeaker?.() ?? { alias: game.user?.name || "Adventurer's Tome" };
  const data = {
    user: game.user?.id,
    content: atusChatCard(payload),
    speaker,
    flags: { [ATUS_MODULE_ID]: { sharedFromTome: true, sourceTitle: payload.title || "" } }
  };
  if (whisper.length) data.whisper = Array.from(new Set([...whisper, game.user?.id].filter(Boolean)));
  await ChatMessage.create(data);
  atusCloseMenu();
  atusHideToolbar();
  atusCaptured = null;
  globalThis.getSelection?.()?.removeAllRanges?.();
}

function atusUserList() {
  return [...(game.users?.contents || [])]
    .filter((user) => user.id !== game.user?.id)
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || String(a.name || "").localeCompare(String(b.name || "")));
}

function atusCloseMenu() {
  atusMenu?.remove();
  atusMenu = null;
}

function atusOpenWhisperMenu(payload, anchor) {
  atusCloseMenu();
  const users = atusUserList().filter((user) => !atusChecksAccess(payload) || atusShareAccess(payload, [user]));
  if (!users.length) return ui.notifications.warn("Adventurer's Tome: No eligible whisper recipients are available.");

  atusMenu = document.createElement("div");
  atusMenu.className = "at-share-whisper-menu";
  atusMenu.innerHTML = `
    <div class="at-share-whisper-head"><strong>Whisper from Tome</strong><button type="button" data-atus-close><i class="fa-solid fa-xmark"></i></button></div>
    <div class="at-share-whisper-users">
      ${users.map((user) => `<label><input type="checkbox" value="${atusEscape(user.id)}"><span class="at-user-dot ${user.active ? "is-active" : ""}"></span><strong>${atusEscape(user.name)}</strong><small>${user.active ? "Online" : "Offline"}${user.isGM ? " · GM" : ""}</small></label>`).join("")}
    </div>
    <div class="at-share-whisper-actions"><button type="button" data-atus-gms>GM(s)</button><button type="button" data-atus-active>Active players</button><button type="button" class="at-primary" data-atus-send-whisper disabled>Whisper</button></div>`;
  document.body.append(atusMenu);

  const rect = anchor?.getBoundingClientRect?.() || { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
  const width = 320;
  const margin = 8;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  const top = Math.max(margin, Math.min(rect.bottom + 6, window.innerHeight - 360));
  atusMenu.style.left = `${Math.round(left)}px`;
  atusMenu.style.top = `${Math.round(top)}px`;

  const update = () => {
    const button = atusMenu?.querySelector("[data-atus-send-whisper]");
    if (button) button.disabled = !atusMenu.querySelector("input:checked");
  };
  atusMenu.addEventListener("change", update);
  atusMenu.addEventListener("click", (event) => {
    if (event.target.closest("[data-atus-close]")) return atusCloseMenu();
    if (event.target.closest("[data-atus-gms]")) {
      atusMenu.querySelectorAll("input[type='checkbox']").forEach((box) => {
        const user = game.users?.get(box.value);
        box.checked = Boolean(user?.isGM);
      });
      update();
      return;
    }
    if (event.target.closest("[data-atus-active]")) {
      atusMenu.querySelectorAll("input[type='checkbox']").forEach((box) => {
        const user = game.users?.get(box.value);
        box.checked = Boolean(user?.active && !user?.isGM);
      });
      update();
      return;
    }
    if (event.target.closest("[data-atus-send-whisper]")) {
      const recipients = [...atusMenu.querySelectorAll("input:checked")].map((box) => box.value);
      void atusCreateChat(payload, recipients);
    }
  });
}

function atusOpenShareMenu(payload, anchor) {
  atusCloseMenu();
  const canPostPublicly = !atusChecksAccess(payload) || Boolean(atusShareAccess(payload, game.users?.contents || []));
  const publicHint = !canPostPublicly ? "All players need access to post publicly" : payload.sourceUuids
    ? "Post the selected content" : atusIsLink(payload) ? "Post a link to this entry" : "Publish a player-safe snapshot";
  atusMenu = document.createElement("div");
  atusMenu.className = "at-share-current-menu";
  atusMenu.innerHTML = `
    <button type="button" data-atus-menu-public ${canPostPublicly ? "" : "disabled"}><i class="fa-solid fa-comment"></i><span><strong>Public Chat</strong><small>${publicHint}</small></span></button>
    <button type="button" data-atus-menu-whisper><i class="fa-solid fa-user-secret"></i><span><strong>Whisper…</strong><small>Choose one or more users</small></span></button>`;
  document.body.append(atusMenu);
  const rect = anchor.getBoundingClientRect();
  const width = 270;
  const margin = 8;
  atusMenu.style.left = `${Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))}px`;
  atusMenu.style.top = `${Math.max(margin, Math.min(rect.bottom + 6, window.innerHeight - 130))}px`;
  atusMenu.addEventListener("click", (event) => {
    if (event.target.closest("[data-atus-menu-public]")) void atusCreateChat(payload);
    if (event.target.closest("[data-atus-menu-whisper]")) atusOpenWhisperMenu(payload, anchor);
  });
}

function atusEnsureTopShare(root) {
  const actions = root.querySelector(".at-gm-top-actions");
  if (!actions || actions.querySelector("[data-atus-share-current]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "at-icon-button at-share-current-button";
  button.dataset.atusShareCurrent = "true";
  button.title = "Share current Tome entry to chat";
  button.setAttribute("aria-label", "Share current Tome entry to chat");
  button.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
  const manual = actions.querySelector('[data-action="openManual"]');
  if (manual?.nextSibling) actions.insertBefore(button, manual.nextSibling);
  else actions.prepend(button);
}

function atusEnhance() {
  const root = document.querySelector(ATUS_ROOT);
  if (!root) return;
  atusEnsureTopShare(root);
}

function atusHandleClick(event) {
  const publicButton = event.target.closest("[data-atus-public]");
  if (publicButton) {
    event.preventDefault();
    event.stopPropagation();
    const payload = atusCaptured;
    if (!payload) return ui.notifications.warn("Adventurer's Tome: Select some text first.");
    if (payload.sourceUuids) atusOpenShareMenu(payload, publicButton);
    else void atusCreateChat(payload);
    return;
  }

  const whisperButton = event.target.closest("[data-atus-whisper]");
  if (whisperButton) {
    event.preventDefault();
    event.stopPropagation();
    const payload = atusCaptured;
    if (!payload) return ui.notifications.warn("Adventurer's Tome: Select some text first.");
    atusOpenWhisperMenu(payload, whisperButton);
    return;
  }

  const shareEntry = event.target.closest("[data-atus-share-entry]");
  const shareCurrent = shareEntry || event.target.closest("[data-atus-share-current]");
  if (shareCurrent) {
    event.preventDefault();
    event.stopPropagation();
    const entryControl = shareEntry || document.querySelector(`${ATUS_ROOT} [data-atus-share-entry]`);
    const refKey = entryControl?.dataset.atusShareEntry;
    const payload = refKey ? { refKey } : atusSnapshotCurrentView();
    if (!payload) return ui.notifications.warn("Adventurer's Tome: Open a Session, Quest, Character, World entry, or Rule before sharing the current view.");
    atusOpenShareMenu(payload, shareCurrent);
    return;
  }

  if (atusMenu?.isConnected && !event.target.closest(".at-share-whisper-menu, .at-share-current-menu")) atusCloseMenu();
}

function atusOpenNativeShare(entry, anchor) {
  if (!entry?.uuid || !atusCanReadNative(entry, game.user, globalThis.ATTestAI.modules.get(ATUS_MODULE_ID)?.api)) {
    return ui.notifications.warn("Adventurer's Tome: This document is unavailable to share.");
  }
  atusOpenShareMenu({documentUuid: entry.uuid, document: entry}, anchor);
}

function atusNativeHeader(app, html) {
  const entry = app.document || app.actor || app.item || app.object;
  const root = html?.querySelector ? html : html?.[0];
  const header = root?.querySelector(".window-header") || root?.closest(".window-app")?.querySelector(".window-header");
  if (!ATUS_NATIVE_TYPES.has(entry?.documentName) || !header) return;
  const sheet = header.parentElement;
  sheet.dataset.atusNativeSource = "";
  atusNativeSheets.set(sheet,entry);
  if (header.querySelector("[data-atus-native-sheet]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-control icon fa-solid fa-comment";
  button.dataset.atusNativeSheet = "";
  button.title = "Send to Chat";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("pointerdown", event => event.preventDefault());
  button.onclick = (event) => {
    event.stopPropagation();
    const selection = atusCaptureSelection();
    if (selection?.sourceSheet === sheet) return atusOpenShareMenu(selection,button);
    atusOpenNativeShare(entry, button);
  };
  const title = header.querySelector(".window-title");
  if (title) title.after(button);
  else header.prepend(button);
}

for (const type of ATUS_NATIVE_TYPES) {
  Hooks.on(`get${type}ContextOptions`, (app, items) => {
    if (items.some(item => item.atusSendToChat)) return;
    items.push({
      atusSendToChat: true,
      name: "Send to Chat",
      icon: '<i class="fa-solid fa-comment"></i>',
      callback: async (element) => {
        const row = element?.dataset ? element : element?.[0];
        const id = row?.dataset.entryId || row?.dataset.documentId;
        const collection = app.collection || game.collections.get(type);
        if (!id) return;
        try {
          const entry = collection.getDocument ? await collection.getDocument(id) : collection.get(id);
          atusOpenNativeShare(entry, row);
        } catch (error) {
          ui.notifications.error(error.message);
        }
      }
    });
  });
}
Hooks.on("renderApplicationV2", atusNativeHeader);
Hooks.on("renderApplication", atusNativeHeader);

Hooks.once("ready", () => {
  atusEnsureToolbar();
  document.addEventListener("selectionchange", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("select", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("mouseup", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("keyup", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("click", atusHandleClick, true);

  const observer = new MutationObserver(() => atusEnhance());
  observer.observe(document.body, { childList: true, subtree: true });
  atusEnhance();
});
