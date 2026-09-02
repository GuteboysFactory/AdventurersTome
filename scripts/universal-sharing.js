const ATUS_MODULE_ID = "adventurers-tome";
const ATUS_ROOT = "#adventurers-tome-app";
const ATUS_MAX_TEXT = 5000;

let atusCaptured = null;
let atusToolbar = null;
let atusMenu = null;

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
    "script", "style", "form", "input", "textarea", "select", "option", "button",
    "iframe", "canvas", "audio", "video",
    ".at-profile-toolbar", ".at-detail-toolbar", ".at-topbar", ".at-page-tools",
    ".at-gm-note-stack", ".at-detail-gm-note", ".at-access-badges",
    ".at-favorite-button", ".at-favorite-icon", ".at-sync-badge",
    ".at-selection-share", ".at-universal-share", ".at-share-current-button",
    "[hidden]", "[aria-hidden='true']"
  ];
  if (playerSafe) remove.push(".is-gm-only", "[data-gm-only='true']", ".secret", "[data-secret='true']");
  container.querySelectorAll(remove.join(",")).forEach((node) => node.remove());

  const allowed = new Set([
    "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE",
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S",
    "UL", "OL", "LI", "H1", "H2", "H3", "H4",
    "BLOCKQUOTE", "CODE", "PRE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
    "A", "SPAN", "SMALL", "IMG"
  ]);

  for (const node of [...container.querySelectorAll("*")]) {
    if (!(node instanceof HTMLElement)) continue;
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }

    const href = node.tagName === "A" ? String(node.getAttribute("href") || "") : "";
    const src = node.tagName === "IMG" ? String(node.getAttribute("src") || "") : "";
    const alt = node.tagName === "IMG" ? String(node.getAttribute("alt") || "") : "";
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);

    if (node.tagName === "A" && /^(?:https?:|mailto:)/i.test(href)) {
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG" && src && !/^javascript:/i.test(src)) {
      node.setAttribute("src", src);
      if (alt) node.setAttribute("alt", alt);
    }
  }
  return container;
}

function atusHtmlFromRange(range) {
  const container = document.createElement("div");
  container.append(range.cloneContents());
  atusCleanClone(container, { playerSafe: false });
  const text = String(container.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > ATUS_MAX_TEXT) {
    const clipped = `${text.slice(0, ATUS_MAX_TEXT - 1).trimEnd()}…`;
    return { html: `<p>${atusEscape(clipped)}</p>`, text: clipped };
  }
  return { html: container.innerHTML, text };
}

function atusCaptureSelection() {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!atusInsideTome(range.commonAncestorContainer) || atusEditing(range.commonAncestorContainer)) return null;
  const payload = atusHtmlFromRange(range);
  if (!payload) return null;
  const rect = range.getBoundingClientRect();
  return {
    ...payload,
    title: atusSourceTitle(),
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
    <button type="button" data-atus-public title="Send selected text to public chat"><i class="fa-solid fa-comment"></i> Public</button>
    <button type="button" data-atus-whisper title="Whisper selected text"><i class="fa-solid fa-user-secret"></i> Whisper…</button>`;
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

function atusChatCard(payload) {
  const label = payload.snapshot ? "Shared from Adventurer's Tome" : "Excerpt from Adventurer's Tome";
  return `
    <article class="adventurers-tome-share-card">
      <header><i class="fa-solid fa-book-open"></i><div><small>${atusEscape(label)}</small><strong>${atusEscape(payload.title || "Adventurer's Tome")}</strong></div></header>
      <div class="adventurers-tome-share-body">${payload.html}</div>
    </article>`;
}

async function atusCreateChat(payload, whisper = []) {
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
  const users = atusUserList();
  if (!users.length) return ui.notifications.warn("Adventurer's Tome: No other users are available to whisper.");

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
  atusMenu = document.createElement("div");
  atusMenu.className = "at-share-current-menu";
  atusMenu.innerHTML = `
    <button type="button" data-atus-menu-public><i class="fa-solid fa-comment"></i><span><strong>Public Chat</strong><small>Publish a player-safe snapshot</small></span></button>
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
    void atusCreateChat(payload);
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

  const shareCurrent = event.target.closest("[data-atus-share-current]");
  if (shareCurrent) {
    event.preventDefault();
    event.stopPropagation();
    const payload = atusSnapshotCurrentView();
    if (!payload) return ui.notifications.warn("Adventurer's Tome: Open a Session, Quest, Character, World entry, or Rule before sharing the current view.");
    atusOpenShareMenu(payload, shareCurrent);
    return;
  }

  if (atusMenu?.isConnected && !event.target.closest(".at-share-whisper-menu, .at-share-current-menu")) atusCloseMenu();
}

Hooks.once("ready", () => {
  atusEnsureToolbar();
  document.addEventListener("selectionchange", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("mouseup", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("keyup", () => window.requestAnimationFrame(atusUpdateSelection));
  document.addEventListener("click", atusHandleClick, true);

  const observer = new MutationObserver(() => atusEnhance());
  observer.observe(document.body, { childList: true, subtree: true });
  atusEnhance();
});
