import {MAX_DICE, normalizeDice} from "./dice-table-core.mjs";

export const GENESYS_ID = "genesys-vtt";

const diceStyles = {
  boost: {label: "Boost", faces: 6, symbol: "□", color: "#399bd7", ink: "#101d2a"},
  ability: {label: "Ability", faces: 8, symbol: "◇", color: "#28754b", ink: "#fff9df"},
  proficiency: {label: "Proficiency", faces: 12, symbol: "⬡", color: "#ebbf38", ink: "#211900"},
  setback: {label: "Setback", faces: 6, symbol: "■", color: "#20242a", ink: "#f0f2fb"},
  difficulty: {label: "Difficulty", faces: 8, symbol: "◆", color: "#683496", ink: "#fff1ff"},
  challenge: {label: "Challenge", faces: 12, symbol: "⬢", color: "#aa2f37", ink: "#fff3e5"}
};

const symbols = {
  success: "✱", advantage: "▲", triumph: "✪", failure: "✕", threat: "▼", despair: "⊠"
};

export function genesysFaceLabels(faces) {
  const labels = {};
  for (const [type, style] of Object.entries(diceStyles)) {
    const table = faces?.[type];
    if (table?.length !== style.faces) return null;
    labels[type] = [];
    for (const face of table) {
      if (!face?.symbols || typeof face.symbols !== "object") return null;
      const groups = Object.entries(face.symbols);
      if (groups.some(([key, count]) => !Object.hasOwn(symbols, key) || !Number.isInteger(count) || count < 1 || count > 2)) {
        return null;
      }
      labels[type].push(groups.map(([key, count]) => Array(count).fill(symbols[key]).join(" ")).join(" "));
    }
  }
  return labels;
}

export function genesysDicePreset({kind}, labels) {
  if (!labels || !Object.hasOwn(diceStyles, kind)) return {};
  const {label, color, ink} = diceStyles[kind];
  return {role: label, color, ink, material: "steel", lockColor: true, lockInk: true, faceLabels: labels[kind]};
}

export function readGenesysDice(content, ownerDocument = globalThis.document) {
  if (!ownerDocument || typeof content !== "string" || !content.includes("genesys-chat-roll")) return null;
  const template = ownerDocument.createElement("template");
  template.innerHTML = content;
  const cards = template.content.querySelectorAll("section.genesys-chat-roll");
  if (!cards.length) return null;
  const rows = [];
  // Genesys VTT lists exact face numbers from its resolved rolls in the card.
  for (const card of cards) {
    const results = card.querySelectorAll(":scope > details > ol > li");
    if (!results.length || rows.length + results.length > MAX_DICE) return null;
    for (const item of results) {
      const match = item.textContent.trim().match(/^([a-z]+)\s+#([1-9]\d?):/i);
      const kind = match?.[1].toLowerCase();
      const value = Number(match?.[2]);
      if (!Object.hasOwn(diceStyles, kind) || value > diceStyles[kind].faces) return null;
      rows.push({kind, value, faces: diceStyles[kind].faces});
    }
  }
  return normalizeDice(rows);
}

export function genesysPoolAdapter(dice, {chat, rollMode, localize, blindRoll}) {
  if (!genesysFaceLabels(dice?.faces) || typeof dice.roll !== "function" || typeof dice.rollToChat !== "function") return null;
  return {
    dice: Object.entries(diceStyles).map(([id, {label, symbol, color, faces}]) => ({
      id, label: `${label} (D${faces})`, symbol, color
    })),
    async roll(pool) {
      const counts = Object.fromEntries(pool.map(({id, count}) => [id, count]));
      const mode = rollMode() ?? "publicroll";
      if (mode === "publicroll") return dice.rollToChat(counts);
      // The system's free-roll publisher currently creates public messages.
      const result = dice.roll(counts);
      const totals = Object.keys(symbols).map(key =>
        `<span>${localize(key)} <strong>${Number(result.net[key])}</strong></span>`).join("");
      const rows = result.dice.map(({type, faceIndex, symbols}) =>
        `<li><strong>${diceStyles[type].label}</strong> #${faceIndex + 1}: ${Object.entries(symbols)
          .map(([key, count]) => `${localize(key)} ×${count}`).join(", ") || localize("Blank")}</li>`).join("");
      const content = `<section class="genesys-chat-roll">
        <h3>${localize(result.succeeded ? "success" : "failure")}</h3>
        <div class="genesys-chat-result-grid">${totals}</div>
        <details><summary>${localize("RolledFaces")}</summary><ol>${rows}</ol></details>
      </section>`;
      const data = chat.applyRollMode({speaker: chat.getSpeaker(), content}, mode);
      if (!data.whisper.length) throw new Error(localize("MissingRecipients"));
      // An ordinary Foundry whisper is visible to its author, even with blind set.
      // A deterministic Roll lets Foundry hide the full card from non-recipients.
      if (data.blind) data.rolls = [(await blindRoll()).toJSON()];
      return chat.create(data);
    }
  };
}
