import {D6_MARKINGS, D6_MODELS, DICE_FLAG, DICE_MATERIALS, activeTiming, createTiming, diceFromRolls, diceStartDelay, dieDesign, normalizeDice, rollSeed, visibleRoll} from "./dice-table-core.mjs";
import {makeDiceView, renderDiePreview} from "./dice-table-renderer.mjs";
import {MESH_DICE} from "./dice-table-meshes.mjs";
import {installDicePool, registerDicePool} from "./dice-table-pool.mjs";
import {contactAudio, initializeDiceAudio, primeVoices} from "./dice-table-audio.mjs";
import {DAGGERHEART_ID, daggerheartDiceKind, daggerheartDicePreset} from "./dice-table-daggerheart.mjs";
import {GENESYS_ID, genesysDicePreset, genesysFaceLabels, readGenesysDice} from "./dice-table-genesys.mjs";

const ID = "adventurers-tome";
const active = new Map();
const played = new Map();
const presets = new Map();
const MIN_FADE_SECONDS = 5;
const DEFAULT_FADE_SECONDS = 10;
const MAX_FADE_SECONDS = 15;
const FADE_SETTING = "diceFadeSeconds";
let latestMapRoll;
let fadingRoll;
let diceSettingsTask;
const MATERIAL_CHOICES = Object.fromEntries(Object.entries(DICE_MATERIALS).map(([key, {label}]) => [key, label]));
const VOICE_CHOICES = {every: "EveryHit", occasional: "OccasionalHit", off: "VoiceOff"};
const VOICE_FILES = [["diceVoiceMale2", "VoiceMale2"], ["diceVoiceMale3", "VoiceMale3"],
  ["diceVoiceFemale2", "VoiceFemale2"], ["diceVoiceFemale3", "VoiceFemale3"]];
const findFlag = message => message.getFlag(ID, DICE_FLAG);
const serverNow = () => {
  const time = game.time?.serverTime;
  return Number.isFinite(time) ? time : Date.now();
};
const enabled = () => game.settings.get(ID, "diceRevealMode") === "synchronized" &&
  !game.modules.get("dice-so-nice")?.active &&
  !(game.system.id === GENESYS_ID && game.modules.get("genesys-dice-forge")?.active);
const translate = key => game.i18n.localize(`AT.DiceTable.${key}`);

function fadeSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(MIN_FADE_SECONDS, Math.min(MAX_FADE_SECONDS, Math.round(seconds))) : DEFAULT_FADE_SECONDS;
}

function preferences() {
  return {
    animate: game.settings.get(ID, "diceAnimate"),
    fadeSeconds: fadeSeconds(game.settings.get(ID, FADE_SETTING)),
    sound: game.settings.get(ID, "diceSound"),
    voiceFrequency: game.settings.get(ID, "diceVoiceFrequency"),
    material: game.settings.get(ID, "diceMaterial"),
    d6Model: game.settings.get(ID, "diceD6Model"),
    d6Markings: game.settings.get(ID, "diceD6Markings"),
    color: game.settings.get(ID, "diceColor"),
    ink: game.settings.get(ID, "diceInk")
  };
}

function presetFor(die) {
  const defaults = game.system.id === DAGGERHEART_ID ? daggerheartDicePreset(die)
    : game.system.id === GENESYS_ID ? genesysDicePreset(die, genesysFaceLabels(game.genesysVtt?.dice?.faces)) : {};
  try { return {...defaults, ...presets.get(game.system.id)?.(die)}; }
  catch (error) {
    console.warn("Adventurer’s Tome | Dice appearance adapter failed.", error);
    return defaults;
  }
}

function nativeDice(rolls) {
  return diceFromRolls(rolls, game.system.id === DAGGERHEART_ID ? daggerheartDiceKind : undefined);
}

function messageDice(message, timing) {
  if (timing?.dice && !message.whisper?.length && !message.blind) return normalizeDice(timing.dice);
  if (game.system.id === GENESYS_ID && game.genesysVtt?.dice?.faces && !message.whisper?.length && !message.blind) {
    const narrative = readGenesysDice(message.content);
    if (narrative) return narrative;
  }
  return nativeDice(message.rolls);
}

function stamp(count, sceneId) {
  return {...createTiming(serverNow(), count, foundry.utils.randomID(), sceneId), issuedAt: Date.now()};
}

function prepareChatStage(rollOrDice, {whisper = [], blind = false, sceneId = canvas?.scene?.id ?? null} = {}) {
  if (!enabled() || whisper.length || blind) return null;
  const input = Array.isArray(rollOrDice) ? rollOrDice : [rollOrDice];
  const dice = input[0]?.dice ? nativeDice(input) : normalizeDice(input);
  if (!dice) return null;
  return {...stamp(dice.length, sceneId), dice};
}

function readStage(message) {
  if (!enabled() || !visibleRoll(message)) return null;
  const timing = findFlag(message);
  if (!timing || !Number.isFinite(timing.issuedAt) || Math.abs(Date.now() - timing.issuedAt) > 90000) return null;
  const dice = messageDice(message, timing);
  if (!dice || !activeTiming(timing, dice.length, serverNow())) return null;
  return {dice, timing};
}

function createNativeStage(message, _data, _options, userId) {
  if (userId !== game.user.id || !enabled()) return;
  const staged = findFlag(message);
  if (staged && (!Number.isFinite(staged.issuedAt) || Math.abs(Date.now() - staged.issuedAt) > 90000)) return;
  const dice = messageDice(message, staged);
  if (!dice) return;
  const timing = staged ?? stamp(dice.length, canvas?.scene?.id ?? null);
  if (!activeTiming(timing, dice.length, serverNow())) return;
  const defaultSound = globalThis.CONFIG?.sounds?.dice;
  const suppressSound = defaultSound && message.sound === defaultSound;
  message.updateSource({
    [`flags.${ID}.${DICE_FLAG}`]: timing,
    ...(suppressSound ? {sound: null} : {})
  });
}

function decorateCard(html, dice, prefs, timing) {
  const content = [...html.querySelectorAll("[data-at-dice-stage]")]
    .find(section => section.dataset.atDiceStage === timing.key) ?? html.querySelector(".message-content");
  if (!content || content.querySelector(":scope > .at-dice-roll-preview")) return null;
  const rollElements = [...content.childNodes];
  const native = document.createElement("div");
  native.className = "at-dice-result-pending";
  native.setAttribute("inert", "");
  native.append(...rollElements);
  const progress = document.createElement("div");
  progress.className = "at-dice-roll-preview";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.textContent = translate("Rolling");
  progress.append(status);
  const tiles = dice.map(die => {
    const tile = document.createElement("span");
    const preset = presetFor(die);
    const design = dieDesign(die, prefs, preset);
    tile.className = "at-dice-roll-face";
    tile.dataset.rolling = "";
    tile.setAttribute("aria-label", translate("Rolling"));
    tile.style.setProperty("--at-die-color", design.color);
    tile.style.setProperty("--at-dice-ink", design.ink);
    progress.append(tile);
    return {tile, label: design.label, role: preset.role};
  });
  content.append(progress, native);
  let last = 0;
  return {
    show(count) {
      for (let i = last; i < count; i++) {
        const {tile, label, role} = tiles[i];
        delete tile.dataset.rolling;
        tile.toggleAttribute("data-discarded", dice[i].discarded);
        tile.removeAttribute("aria-label");
        tile.textContent = role ? `${role} ${label || translate("Genesys.Blank")}` : label;
      }
      last = count;
    },
    finish(reveal = true) {
      progress.remove();
      if (reveal) native.replaceWith(...native.childNodes);
      else native.remove();
    }
  };
}

function scheduleStep(state) {
  const now = serverNow();
  const message = game.messages.get(state.message.id) ?? state.message;
  if (!visibleRoll(message)) {
    finish(state, false);
    return;
  }
  if (findFlag(message)?.key !== state.timing.key) {
    finish(state);
    return;
  }
  const count = enabled() ? state.timing.ends.filter(end => now >= end).length : state.dice.length;
  for (const card of state.cards) card.show(count);
  for (let i = state.revealed; i < count; i++) {
    Hooks.callAll("adventurersTomeDieSettled", message, {key: state.timing.key, index: i, die: state.dice[i]});
  }
  state.revealed = count;
  if (count >= state.dice.length) {
    Hooks.callAll("adventurersTomeDiceComplete", message, state.timing.key);
    finish(state, true, enabled());
    return;
  }
  state.timer = setTimeout(() => scheduleStep(state), Math.max(8, state.timing.ends[count] - now + 2));
}

function clearFadingRoll() {
  const state = fadingRoll;
  fadingRoll = undefined;
  state?.view.close();
}

function finish(state, reveal = true, fade = false) {
  clearTimeout(state.timer);
  cancelAnimationFrame(state.frame);
  for (const timer of state.soundTimers ?? []) clearTimeout(timer);
  for (const card of state.cards) card.finish(reveal);
  state.cards.clear();
  if (state.view && reveal && fade && state.id === latestMapRoll) {
    state.view.render(serverNow());
    fadingRoll = state;
    void state.view.fadeOut(state.prefs.fadeSeconds * 1000).then(() => {
      if (fadingRoll === state) clearFadingRoll();
    });
  } else state.view?.close();
  active.delete(state.id);
  played.set(state.id, state.timing.ends.at(-1));
  const expiry = serverNow() - 10000;
  for (const [id, end] of played) if (end < expiry) played.delete(id);
}

function startStage(message, html) {
  const stage = readStage(message);
  if (!stage) return;
  const {dice, timing} = stage;
  const id = `${message.id}:${timing.key}`;
  if (played.has(id)) return;
  let state = active.get(id);
  if (!state) {
    clearFadingRoll();
    const prefs = preferences();
    state = {...stage, id, message, prefs, revealed: 0, cards: new Set()};
    active.set(id, state);
    const onSound = contactAudio(prefs, rollSeed(`${id}:${game.user.id}`));
    try {
      state.view = makeDiceView({dice, timing, preferences: prefs, presetFor, onSound});
    } catch (error) {
      console.warn("Adventurer’s Tome | Dice canvas is unavailable.", error);
    }
    if (state.view) {
      latestMapRoll = id;
      const paint = () => {
        if (!active.has(id)) return;
        if (canvas.scene?.id !== timing.sceneId || !visibleRoll(game.messages.get(message.id) ?? message)) {
          state.view.close();
          state.view = null;
          return;
        }
        state.view.render(serverNow());
        state.frame = requestAnimationFrame(paint);
      };
      state.frame = requestAnimationFrame(paint);
    } else if (prefs.sound) {
      state.soundTimers = dice.map((_, index) => setTimeout(() => {
        const current = game.messages.get(message.id) ?? message;
        if (enabled() && visibleRoll(current) && findFlag(current)?.key === timing.key) {
          onSound({kind: "table", index, power: .8}, dice.length);
        }
      }, Math.max(0, timing.start - serverNow() + diceStartDelay(index))));
    }
    state.timer = setTimeout(() => scheduleStep(state), 0);
  }
  if (html) {
    const card = decorateCard(html, dice, state.prefs, timing);
    if (card) {
      card.show(timing.ends.filter(end => serverNow() >= end).length);
      state.cards.add(card);
    }
  }
}

function renderTokenVoice(app, html) {
  if (!game.user.isGM || app.document?.documentName !== "Token") return;
  const area = html.querySelector('.tab[data-tab="appearance"]') ?? html.querySelector(".sheet-body");
  if (!area || area.querySelector("[data-at-dice-voice]")) return;
  const row = document.createElement("label");
  row.className = "form-group";
  row.dataset.atDiceVoice = "";
  const label = document.createElement("span");
  label.textContent = translate("TokenVoice");
  const input = document.createElement("select");
  input.name = `flags.${ID}.diceTokenVoice`;
  for (const [key, name] of [["auto", "AutomaticVoice"], ["male", "Male"], ["female", "Female"], ["custom", "CustomReaction"], ["none", "NoVoice"]]) {
    input.add(new Option(translate(name), key));
  }
  input.value = app.document.getFlag(ID, "diceTokenVoice") || "auto";
  row.append(label, input);

  const soundRow = document.createElement("div");
  soundRow.className = "form-group at-dice-custom-sound";
  const soundLabel = document.createElement("label");
  soundLabel.id = `${app.id}-dice-reaction-file-label`;
  soundLabel.textContent = translate("CustomReactionFile");
  const controls = document.createElement("div");
  controls.className = "form-fields";
  const picker = foundry.applications.elements.HTMLFilePickerElement.create({
    type: "audio", name: `flags.${ID}.diceTokenSound`, value: app.document.getFlag(ID, "diceTokenSound") || ""
  });
  picker.setAttribute("aria-labelledby", soundLabel.id);
  controls.append(picker);
  soundRow.append(soundLabel, controls);
  const refresh = () => { soundRow.hidden = input.value !== "custom"; };
  input.addEventListener("change", refresh);
  refresh();
  area.append(row, soundRow);
}

function renderDiceColorPickers(html) {
  const material = html.querySelector(`[name="${ID}.diceMaterial"]`);
  if (!material) return;

  for (const [key, label, channel] of [["diceColor", "Color", "color"], ["diceInk", "Ink", "ink"]]) {
    const field = html.querySelector(`input[name="${ID}.${key}"]`);
    if (!field || field.type === "hidden") continue;

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "at-dice-color-picker";
    picker.setAttribute("aria-label", translate(label));
    picker.id = field.id;
    field.removeAttribute("id");
    field.type = "hidden";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "at-dice-color-reset";
    reset.textContent = translate("UseMaterialColor");
    reset.setAttribute("aria-label", `${translate("UseMaterialColor")} · ${translate(label)}`);
    field.after(picker, reset);

    const refresh = () => {
      const design = dieDesign({faces: 6, value: 6}, {[channel]: field.value, material: material.value});
      picker.value = design[channel];
      reset.disabled = field.value === "";
    };
    const setColor = value => {
      if (field.value === value) return;
      field.value = value;
      field.dispatchEvent(new Event("change", {bubbles: true}));
    };
    picker.addEventListener("input", () => setColor(picker.value));
    picker.addEventListener("change", () => setColor(picker.value));
    reset.addEventListener("click", () => setColor(""));
    field.addEventListener("change", refresh);
    material.addEventListener("change", refresh);
    refresh();
  }
}

async function promptDiceSettings() {
  const appearance = [
    ["diceD6Model", "D6Model", D6_MODELS],
    ["diceD6Markings", "D6Markings", D6_MARKINGS],
    ["diceMaterial", "Material", MATERIAL_CHOICES],
    ["diceColor", "Color"],
    ["diceInk", "Ink"],
    ["diceAnimate", "Animate"]
  ];
  const audio = [
    ["diceSound", "Sound"],
    ["diceVoiceFrequency", "VoiceFrequency", VOICE_CHOICES]
  ];
  const isGM = game.user.isGM;
  const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
  const fade = fadeSeconds(game.settings.get(ID, FADE_SETTING));
  const previewTypes = [...MESH_DICE, 6].sort((a, b) => a - b)
    .map(faces => `<option value="${faces}" ${faces === 6 ? "selected" : ""}>D${faces}</option>`).join("");
  const settingRow = ([key, label, choices]) => {
    const value = game.settings.get(ID, key);
    const name = `${ID}.${key}`;
    const id = `at-dice-setting-${key}`;
    const control = choices
      ? `<select id="${id}" name="${name}">${Object.entries(choices).map(([option, title]) =>
        `<option value="${option}" ${option === value ? "selected" : ""}>${escape(translate(title))}</option>`).join("")}</select>`
      : typeof value === "boolean" ? `<input type="checkbox" id="${id}" name="${name}" ${value ? "checked" : ""}>`
        : `<input type="text" id="${id}" name="${name}" value="${escape(value)}">`;
    return `<div class="at-dice-setting-row"><label for="${id}">${escape(translate(label))}</label><div class="form-fields">${control}</div></div>`;
  };
  const voiceRows = isGM ? VOICE_FILES.map(([key, label]) =>
    `<div class="at-dice-setting-row"><label for="at-dice-audio-${key}">${escape(translate(label))}</label><div class="form-fields" data-dice-audio="${key}"></div></div>`).join("") : "";
  const result = await foundry.applications.api.DialogV2.input({
    window: {title: translate("Settings"), resizable: true},
    position: {width: 530},
    classes: ["at-dice-settings"],
    rejectClose: false,
    ok: {label: translate("SaveSettings")},
    content: `
      <fieldset><legend>${escape(translate("Appearance"))}</legend>${appearance.map(settingRow).join("")}
      <div class="at-dice-setting-row"><label for="at-dice-preview-type">${escape(translate("D6Preview"))}</label>
        <div class="at-dice-preview-controls"><select id="at-dice-preview-type">${previewTypes}</select>
          <div class="at-dice-preview-strip" aria-hidden="true"><div data-at-dice-preview></div></div>
        </div>
      </div>
      <div class="at-dice-setting-row"><label for="at-dice-fade-seconds">${escape(translate("FadeDuration"))}</label>
        <div class="form-fields"><input type="range" id="at-dice-fade-seconds" name="${ID}.${FADE_SETTING}"
          min="${MIN_FADE_SECONDS}" max="${MAX_FADE_SECONDS}" step="1" value="${fade}" aria-valuetext="${fade} s">
          <output for="at-dice-fade-seconds">${fade} s</output>
        </div>
      </div></fieldset>
      <fieldset><legend>${escape(translate("Audio"))}</legend>${audio.map(settingRow).join("")}</fieldset>
      ${voiceRows ? `<fieldset><legend>${escape(translate("WorldVoices"))}</legend>${voiceRows}</fieldset>` : ""}`,
    render: (_event, dialog) => {
      renderDiceColorPickers(dialog.element);
      const preview = dialog.element.querySelector("[data-at-dice-preview]");
      const previewType = dialog.element.querySelector("#at-dice-preview-type");
      const fields = {
        d6Model: "diceD6Model", d6Markings: "diceD6Markings",
        material: "diceMaterial", color: "diceColor", ink: "diceInk"
      };
      const inputs = Object.entries(fields).map(([style, key]) => [style, dialog.element.querySelector(`[name="${ID}.${key}"]`)]);
      const updatePreview = () => renderDiePreview(preview, Object.fromEntries(inputs.map(([style, input]) => [style, input.value])), Number(previewType.value));
      for (const [, input] of inputs) input.addEventListener("change", updatePreview);
      previewType.addEventListener("change", updatePreview);
      updatePreview();
      const slider = dialog.element.querySelector("#at-dice-fade-seconds");
      const output = dialog.element.querySelector('output[for="at-dice-fade-seconds"]');
      slider.addEventListener("input", () => {
        output.value = `${slider.value} s`;
        slider.setAttribute("aria-valuetext", output.value);
      });
      for (const placeholder of dialog.element.querySelectorAll("[data-dice-audio]")) {
        const key = placeholder.dataset.diceAudio;
        placeholder.replaceChildren(foundry.applications.elements.HTMLFilePickerElement.create({
          type: "audio", id: `at-dice-audio-${key}`, name: `${ID}.${key}`, value: game.settings.get(ID, key)
        }));
      }
    }
  });
  if (!result) return;
  const selectedFade = result[`${ID}.${FADE_SETTING}`];
  if (selectedFade !== undefined && fadeSeconds(selectedFade) !== game.settings.get(ID, FADE_SETTING)) {
    await game.settings.set(ID, FADE_SETTING, fadeSeconds(selectedFade));
  }
  const allowed = [...appearance, ...audio, ...(isGM && game.user.isGM ? VOICE_FILES : [])];
  for (const [key] of allowed) {
    const value = result[`${ID}.${key}`];
    if (value !== undefined && value !== game.settings.get(ID, key)) await game.settings.set(ID, key, value);
  }
}

function openDiceSettings() {
  diceSettingsTask ??= promptDiceSettings().finally(() => { diceSettingsTask = undefined; });
  return diceSettingsTask;
}

Hooks.once("init", () => {
  const setting = (key, label, value, options = {}) => {
    game.settings.register(ID, key, {name: `AT.DiceTable.${label}`, scope: "client", config: false,
      type: typeof value === "boolean" ? Boolean : String, default: value, ...options});
  };
  setting("diceRevealMode", "RevealMode", "synchronized", {scope: "world", config: true,
    choices: {synchronized: "AT.DiceTable.Synchronized", direct: "AT.DiceTable.Direct"}});
  setting("diceAnimate", "Animate", !matchMedia("(prefers-reduced-motion: reduce)").matches);
  setting(FADE_SETTING, "FadeDuration", DEFAULT_FADE_SECONDS, {type: Number});
  setting("diceSound", "Sound", true);
  setting("diceVoiceFrequency", "VoiceFrequency", "every", {
    onChange: value => {
      if (value !== "off") for (const group of ["male", "female"]) primeVoices(group);
    }
  });
  setting("diceMaterial", "Material", "steel");
  setting("diceD6Model", "D6Model", "beveled");
  setting("diceD6Markings", "D6Markings", "model");
  setting("diceColor", "Color", "");
  setting("diceInk", "Ink", "");
  for (const [key, label] of VOICE_FILES) {
    setting(key, label, "", {
      scope: "world", onChange: () => primeVoices(key.startsWith("diceVoiceMale") ? "male" : "female")
    });
  }
});
Hooks.once("ready", () => {
  const api = game.modules.get(ID)?.api;
  if (api) api.diceTable = Object.freeze({
    version: 1, flag: DICE_FLAG, prepareChatStage, openSettings: openDiceSettings, registerDicePool,
    isStageActive(message, key) { return Boolean(key && readStage(message)?.timing.key === key); },
    async waitForStage(timing) {
      while (enabled() && activeTiming(timing, timing?.dice?.length, serverNow())) {
        const remaining = timing.ends.at(-1) - serverNow();
        await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(remaining, 100))));
      }
    },
    registerPreset(systemId, resolver) {
      if (systemId !== game.system.id || typeof resolver !== "function") return false;
      presets.set(systemId, resolver);
      return true;
    }
  });
  initializeDiceAudio();
  installDicePool();
  if (game.settings.get(ID, "diceVoiceFrequency") !== "off") for (const group of ["male", "female"]) primeVoices(group);
});
Hooks.on("preCreateChatMessage", createNativeStage);
Hooks.on("createChatMessage", message => startStage(message));
Hooks.on("updateChatMessage", message => {
  if (message.id === fadingRoll?.message.id && !visibleRoll(message)) clearFadingRoll();
  startStage(message);
});
Hooks.on("renderChatMessageHTML", (message, html) => startStage(message, html));
Hooks.on("deleteChatMessage", message => {
  if (message.id === fadingRoll?.message.id) clearFadingRoll();
  for (const state of active.values()) if (state.message.id === message.id) finish(state, false);
});
Hooks.on("canvasTearDown", () => {
  clearFadingRoll();
  latestMapRoll = undefined;
  for (const state of active.values()) {
    state.view?.close();
    state.view = null;
    cancelAnimationFrame(state.frame);
  }
  for (const layer of document.querySelectorAll(".at-dice-table")) layer.remove();
});
Hooks.on("renderTokenConfig", renderTokenVoice);
