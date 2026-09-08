const ATAW_MODULE_ID = "adventurers-tome";
const ATAW_SETTING = "windowMode";
const ATAW_MODES = Object.freeze({
  auto: "Auto",
  remember: "Remember Size",
  full: "Full View"
});
const ATAW_ATTACH_MAX_ATTEMPTS = 60;
const ATAW_ATTACH_DELAY = 100;
let atAwAttachTimer = null;
let atAwAttachedApp = null;

function atAwClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function atAwViewport() {
  const root = document.documentElement;
  return {
    width: Math.max(640, window.innerWidth || root?.clientWidth || 1280),
    height: Math.max(560, window.innerHeight || root?.clientHeight || 800)
  };
}

function atAwParseState(raw = "") {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function atAwSavedState() {
  try { return atAwParseState(game.settings.get(ATAW_MODULE_ID, "windowState") || ""); }
  catch (_err) { return {}; }
}

function atAwMode() {
  try {
    const value = String(game.settings.get(ATAW_MODULE_ID, ATAW_SETTING) || "auto");
    return ATAW_MODES[value] ? value : "auto";
  } catch (_err) {
    return "auto";
  }
}

function atAwLimits(viewport = atAwViewport()) {
  const maxWidth = Math.max(620, viewport.width - 32);
  const maxHeight = Math.max(520, viewport.height - 72);
  return {
    minWidth: Math.min(680, maxWidth),
    minHeight: Math.min(540, maxHeight),
    maxWidth,
    maxHeight
  };
}

function atAwCenter(width, height, viewport = atAwViewport()) {
  return {
    left: Math.max(0, Math.round((viewport.width - width) / 2)),
    top: Math.max(24, Math.round((viewport.height - height) / 2))
  };
}

function atAwDefaultAuto(viewport = atAwViewport()) {
  const limits = atAwLimits(viewport);
  const width = atAwClamp(Math.round(viewport.width * 0.92), limits.minWidth, limits.maxWidth);
  const height = atAwClamp(Math.round(viewport.height * 0.90), limits.minHeight, limits.maxHeight);
  return { width, height, ...atAwCenter(width, height, viewport) };
}

function atAwRemember(saved = atAwSavedState(), viewport = atAwViewport()) {
  const limits = atAwLimits(viewport);
  const fallback = atAwDefaultAuto(viewport);
  const width = atAwClamp(Number.isFinite(Number(saved.width)) ? Number(saved.width) : fallback.width, limits.minWidth, limits.maxWidth);
  const height = atAwClamp(Number.isFinite(Number(saved.height)) ? Number(saved.height) : fallback.height, limits.minHeight, limits.maxHeight);
  const centered = atAwCenter(width, height, viewport);
  const left = atAwClamp(Number.isFinite(Number(saved.left)) ? Number(saved.left) : centered.left, 0, Math.max(0, viewport.width - width));
  const top = atAwClamp(Number.isFinite(Number(saved.top)) ? Number(saved.top) : centered.top, 0, Math.max(0, viewport.height - height));
  return { width, height, left, top };
}

function atAwFull(viewport = atAwViewport()) {
  const limits = atAwLimits(viewport);
  const width = limits.maxWidth;
  const height = limits.maxHeight;
  return { width, height, ...atAwCenter(width, height, viewport) };
}

function atAwViewportChanged(saved = {}, viewport = atAwViewport()) {
  const oldWidth = Number(saved.viewportWidth || 0);
  const oldHeight = Number(saved.viewportHeight || 0);
  if (!oldWidth || !oldHeight) return false;
  const widthDelta = Math.abs(viewport.width - oldWidth);
  const heightDelta = Math.abs(viewport.height - oldHeight);
  return widthDelta >= Math.max(96, oldWidth * 0.06) || heightDelta >= Math.max(72, oldHeight * 0.06);
}

function atAwAuto(saved = atAwSavedState(), viewport = atAwViewport(), { forceDefault = false } = {}) {
  const hasSavedSize = Number.isFinite(Number(saved.width)) && Number.isFinite(Number(saved.height));
  if (forceDefault || !hasSavedSize) return atAwDefaultAuto(viewport);

  const oldViewportWidth = Number(saved.viewportWidth || 0);
  const oldViewportHeight = Number(saved.viewportHeight || 0);
  if (!oldViewportWidth || !oldViewportHeight || !atAwViewportChanged(saved, viewport)) return atAwRemember(saved, viewport);

  const limits = atAwLimits(viewport);
  const widthRatio = viewport.width / oldViewportWidth;
  const heightRatio = viewport.height / oldViewportHeight;
  const width = atAwClamp(Math.round(Number(saved.width) * widthRatio), limits.minWidth, limits.maxWidth);
  const height = atAwClamp(Math.round(Number(saved.height) * heightRatio), limits.minHeight, limits.maxHeight);
  return { width, height, ...atAwCenter(width, height, viewport) };
}

function atAwResolve(mode = atAwMode(), saved = atAwSavedState(), viewport = atAwViewport(), options = {}) {
  if (mode === "full") return atAwFull(viewport);
  if (mode === "remember") return atAwRemember(saved, viewport);
  return atAwAuto(saved, viewport, options);
}

function atAwInstallStyles() {
  if (document.getElementById("at-adaptive-window-styles")) return;
  const style = document.createElement("style");
  style.id = "at-adaptive-window-styles";
  style.textContent = `
    .adventurers-tome-app .at-window-fit-control {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-left: 4px;
      color: #d9bd7d;
      font-size: 11px;
      line-height: 1;
    }
    .adventurers-tome-app .at-window-fit-control i { opacity: .82; }
    .adventurers-tome-app .at-window-fit-control select {
      height: 24px;
      min-height: 24px;
      width: auto;
      margin: 0;
      padding: 0 20px 0 6px;
      border: 1px solid rgba(214, 178, 108, .26);
      border-radius: 4px;
      background: rgba(18, 13, 9, .92);
      color: #e5cd97;
      font-size: 11px;
    }
    .adventurers-tome-app .at-window-fit-control select:hover,
    .adventurers-tome-app .at-window-fit-control select:focus {
      border-color: rgba(214, 178, 108, .58);
      color: #ffe2a2;
    }
    @media (max-width: 900px) {
      .adventurers-tome-app .at-window-fit-control { gap: 3px; }
      .adventurers-tome-app .at-window-fit-control select { max-width: 92px; }
    }
  `;
  document.head.appendChild(style);
}

async function atAwSaveState(app) {
  if (!app?.position) return;
  const { width, height, left, top } = app.position;
  if (![width, height, left, top].every((value) => Number.isFinite(Number(value)))) return;
  const viewport = atAwViewport();
  const payload = JSON.stringify({
    width: Math.round(Number(width)),
    height: Math.round(Number(height)),
    left: Math.round(Number(left)),
    top: Math.round(Number(top)),
    viewportWidth: Math.round(viewport.width),
    viewportHeight: Math.round(viewport.height)
  });
  await game.settings.set(ATAW_MODULE_ID, "windowState", payload);
}

function atAwApply(app, { forceAutoDefault = false } = {}) {
  if (!app) return;
  const position = atAwResolve(atAwMode(), atAwSavedState(), atAwViewport(), { forceDefault: forceAutoDefault });
  app.setPosition(position);
}

function atAwInstallControl(app) {
  const header = app?.element?.querySelector?.(".window-header");
  if (!header) return;
  let control = header.querySelector("[data-at-window-fit-control]");
  if (!control) {
    control = document.createElement("label");
    control.className = "at-window-fit-control";
    control.dataset.atWindowFitControl = "true";
    control.title = "How Adventurer's Tome should fit this player's screen";
    control.innerHTML = `<i class="fa-solid fa-display"></i><select data-at-window-fit-select aria-label="Tome window fit"><option value="auto">Auto</option><option value="remember">Remember Size</option><option value="full">Full View</option></select>`;
    const select = control.querySelector("select");
    select?.addEventListener("change", async (event) => {
      const mode = String(event.currentTarget.value || "auto");
      if (!ATAW_MODES[mode]) return;
      await game.settings.set(ATAW_MODULE_ID, ATAW_SETTING, mode);
      atAwApply(app, { forceAutoDefault: mode === "auto" });
      await atAwSaveState(app);
    });
  }

  const transparency = header.querySelector("[data-at-transparency-control]");
  const close = header.querySelector('[data-action="close"], .close');
  if (!control.isConnected) {
    if (transparency) header.insertBefore(control, transparency);
    else if (close) header.insertBefore(control, close);
    else header.appendChild(control);
  }
  const select = control.querySelector("select");
  if (select && select.value !== atAwMode()) select.value = atAwMode();
}

function atAwPatchApp(app) {
  if (!app || app.__atAdaptiveWindowPatched) return;
  app.__atAdaptiveWindowPatched = true;

  const originalChrome = app._installWindowChromeControls?.bind(app);
  app._installWindowChromeControls = function (...args) {
    const result = originalChrome?.(...args);
    atAwInstallControl(this);
    return result;
  };

  app._scheduleWindowStateSave = function () {
    clearTimeout(this._windowStateTimer);
    this._windowStateTimer = setTimeout(() => {
      if (!this.rendered) return;
      atAwSaveState(this).catch((error) => console.warn("Adventurer's Tome | Could not save adaptive client window state", error));
    }, 300);
  };

  const originalResponsive = app._attachResponsiveObserver?.bind(app);
  app._attachResponsiveObserver = function (...args) {
    originalResponsive?.(...args);
    if (this._viewportResizeHandler) window.removeEventListener("resize", this._viewportResizeHandler);
    clearTimeout(this.__atViewportResizeTimer);
    this._viewportResizeHandler = () => {
      if (!this.rendered) return;
      clearTimeout(this.__atViewportResizeTimer);
      this.__atViewportResizeTimer = setTimeout(() => {
        const mode = atAwMode();
        const saved = atAwSavedState();
        const viewport = atAwViewport();
        if (mode === "remember") this.setPosition(atAwRemember({ ...saved, ...this.position }, viewport));
        else if (mode === "full") this.setPosition(atAwFull(viewport));
        else this.setPosition(atAwAuto(saved, viewport));
        this._syncResponsiveState?.();
      }, 140);
    };
    window.addEventListener("resize", this._viewportResizeHandler);
    this._syncResponsiveState?.();
  };

  const originalTearDown = app._tearDown?.bind(app);
  app._tearDown = function (...args) {
    clearTimeout(this.__atViewportResizeTimer);
    return originalTearDown?.(...args);
  };

  app.setPosition(atAwResolve());
}

function atAwExposeApi(module, app) {
  const windowFit = Object.freeze({
    modes: ATAW_MODES,
    get: () => atAwMode(),
    set: async (mode = "auto") => {
      const normalized = ATAW_MODES[String(mode)] ? String(mode) : "auto";
      await game.settings.set(ATAW_MODULE_ID, ATAW_SETTING, normalized);
      atAwApply(app, { forceAutoDefault: normalized === "auto" });
      await atAwSaveState(app);
      if (app.rendered) atAwInstallControl(app);
      return normalized;
    },
    fit: () => atAwApply(app)
  });

  try {
    if (module?.api && typeof module.api === "object") module.api.windowFit = windowFit;
  } catch (error) {
    console.debug("Adventurer's Tome | Adaptive Window API extension unavailable; window fitting remains active.", error);
  }
  globalThis.AdventurersTomeWindowFit = windowFit;
}

function atAwResolveApp() {
  const module = game.modules.get(ATAW_MODULE_ID);
  if (!module) return { module: null, app: null };
  let app = null;
  try { app = module.api?.app?.() || null; } catch (_err) { app = null; }
  return { module, app };
}

function atAwTryAttach(attempt = 0) {
  if (atAwAttachedApp) {
    if (atAwAttachedApp.rendered) atAwInstallControl(atAwAttachedApp);
    return true;
  }

  const { module, app } = atAwResolveApp();
  if (app) {
    clearTimeout(atAwAttachTimer);
    atAwAttachTimer = null;
    atAwPatchApp(app);
    atAwExposeApi(module, app);
    atAwAttachedApp = app;
    if (app.rendered) atAwInstallControl(app);
    return true;
  }

  if (attempt >= ATAW_ATTACH_MAX_ATTEMPTS) {
    console.warn("Adventurer's Tome | Adaptive Window could not attach after waiting for the Tome application singleton.");
    return false;
  }

  clearTimeout(atAwAttachTimer);
  atAwAttachTimer = window.setTimeout(() => atAwTryAttach(attempt + 1), ATAW_ATTACH_DELAY);
  return false;
}

Hooks.once("init", () => {
  game.settings.register(ATAW_MODULE_ID, ATAW_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: "auto"
  });
});

Hooks.once("ready", () => {
  atAwInstallStyles();
  atAwTryAttach(0);
});

for (const hookName of ["renderApplication", "renderApplicationV2"]) {
  Hooks.on(hookName, (app) => {
    if (!atAwAttachedApp) atAwTryAttach(0);
    if (app === atAwAttachedApp) atAwInstallControl(app);
  });
}
