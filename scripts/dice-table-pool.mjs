import {MESH_DICE} from "./dice-table-meshes.mjs";
import {GENESYS_ID, genesysPoolAdapter} from "./dice-table-genesys.mjs";

const NUMERIC_DICE = [...MESH_DICE, 6].sort((a, b) => a - b);
const adapters = new Map();
let pending;
const text = key => game.i18n.localize(`AT.DiceTable.${key}`);

const numericPool = {
  dice: NUMERIC_DICE.map(faces => ({id: String(faces), label: `D${faces}`})),
  roll(pool) {
    const formula = pool.map(({id, count}) => `${count}d${id}`).join(" + ");
    return foundry.dice.Roll.create(formula).toMessage();
  }
};

export function readDicePool(dice, fields) {
  const pool = [];
  let total = 0;
  for (const {id} of dice) {
    const count = Number(fields[`pool-${id}`] ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) return null;
    if (count) pool.push({id, count});
    total += count;
  }
  return total > 0 && Number.isSafeInteger(total) ? pool : null;
}

async function promptDicePool(adapter) {
  const escape = value => foundry.utils.escapeHTML(String(value));
  const rows = adapter.dice.map(({id, label, symbol, color}) => {
    const name = escape(label);
    const swatch = /^#[0-9a-f]{6}$/i.test(color) ? ` class="at-dice-pool-symbol" style="--at-pool-color:${color}"` : "";
    return `<div class="at-dice-pool-cell">
      <button type="button" data-at-pool-add="${id}" aria-label="+ 1 ${name}">${symbol ? `<span${swatch} aria-hidden="true">${escape(symbol)}</span> ` : ""}${name}</button>
      <input name="pool-${id}" type="number" min="0" step="1" value="0" aria-label="${name}">
    </div>`;
  });
  const result = await foundry.applications.api.DialogV2.input({
    window: {title: text("DicePool"), resizable: true},
    position: {width: 440},
    classes: ["at-dice-settings"],
    content: `<div class="at-dice-pool-grid">${rows.join("")}</div>`,
    ok: {label: text("RollPool"), disabled: true},
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const roll = form.querySelector('button[data-action="ok"]');
      const counts = () => Object.fromEntries(adapter.dice.map(({id}) => [`pool-${id}`, form.elements.namedItem(`pool-${id}`).value]));
      const refresh = () => { roll.disabled = !readDicePool(adapter.dice, counts()); };
      for (const button of form.querySelectorAll("[data-at-pool-add]")) {
        button.addEventListener("click", () => {
          const field = form.elements.namedItem(`pool-${button.dataset.atPoolAdd}`);
          const count = Number(field.value);
          if (Number.isSafeInteger(count + 1) && count >= 0) field.value = count + 1;
          refresh();
        });
      }
      form.addEventListener("input", refresh);
      refresh();
    }
  });
  const pool = result && readDicePool(adapter.dice, result);
  if (pool) return adapter.roll(pool);
}

export function registerDicePool(systemId, {dice, roll} = {}) {
  if (systemId !== game.system.id || typeof roll !== "function" || !Array.isArray(dice) || !dice.length) return false;
  const ids = new Set();
  for (const choice of dice) {
    if (typeof choice?.id !== "string" || !/^[a-z0-9-]+$/i.test(choice.id) || ids.has(choice.id) ||
        typeof choice.label !== "string" || !choice.label.trim()) return false;
    ids.add(choice.id);
  }
  adapters.set(systemId, {dice, roll});
  mountDicePool();
  return true;
}

function mountDicePool(_app, surfaces) {
  if (game.system.id === "realm-guard") return;
  const fallback = game.system.id === GENESYS_ID
    ? genesysPoolAdapter(game.genesysVtt?.dice, {
      chat: foundry.documents.ChatMessage,
      rollMode: () => game.settings.get("core", "rollMode"),
      blindRoll: () => foundry.dice.Roll.create("0").evaluate(),
      localize: key => text(`Genesys.${key}`)
    })
    : numericPool;
  if (!fallback && !adapters.has(game.system.id)) return;
  const bar = surfaces?.["#chat-controls"] ?? document.getElementById("chat-controls");
  if (!bar || bar.querySelector("[data-at-dice-pool]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.atDicePool = "";
  button.title = text("DicePool");
  button.setAttribute("aria-label", button.title);
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-dice";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", () => {
    const adapter = adapters.get(game.system.id) ?? fallback;
    pending ??= promptDicePool(adapter).catch(error => ui.notifications.error(error.message))
      .finally(() => { pending = undefined; });
  });
  bar.append(button);
}

export function installDicePool() {
  Hooks.on("renderChatInput", mountDicePool);
  Hooks.on("renderChatLog", mountDicePool);
  if (typeof document !== "undefined") mountDicePool();
}
