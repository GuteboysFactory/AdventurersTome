import {MESH_DICE} from "./dice-table-meshes.mjs";

export const DICE_FLAG = "diceTableV1";
export const MAX_DICE = 40;
const LEAD = 420;
const MAX_STAGE_TIME = 3400;
export const DICE_MATERIALS = Object.freeze({
  steel: {label: "Steel", color: "#343b45", ink: "#f8e7c8"},
  bone: {label: "Bone", color: "#d8bd91", ink: "#382412"},
  marble: {label: "Marble", color: "#294e40", ink: "#ffe3a3"},
  fire: {label: "Fire", color: "#48291c", ink: "#ffca86", tile: 0},
  frost: {label: "Frost", color: "#4d829d", ink: "#f5fbff", tile: 1},
  undead: {label: "Undead", color: "#b9a781", ink: "#291d13", tile: 2},
  demonic: {label: "Demonic", color: "#32161e", ink: "#ffb1a1", tile: 3},
  nature: {label: "Nature", color: "#533524", ink: "#d7e5a3", tile: 4},
  magic: {label: "Magic", color: "#202b89", ink: "#f5e3ad", tile: 5},
  mystic: {label: "Mystic", color: "#613e7b", ink: "#ffe1a3", tile: 6},
  thunder: {label: "Thunder", color: "#203749", ink: "#e5f7ff", tile: 7},
  elven: {label: "Elven", color: "#bbbdd0", ink: "#2d394a", tile: 8},
  dwarven: {label: "Dwarven", color: "#3e3730", ink: "#f4ce84", tile: 9},
  sea: {label: "Sea", color: "#297266", ink: "#fff3d8", tile: 10},
  starfield: {label: "Starfield", color: "#141f57", ink: "#ffdf9b", tile: 11}
});
export const D6_MODELS = Object.freeze({beveled: "D6Beveled", classic: "D6Classic", precision: "D6Precision"});
export const D6_MARKINGS = Object.freeze({model: "MarkingsByModel", pips: "Pips", numbers: "Numbers"});
const COLORS = /^#[0-9a-f]{6}$/i;

export function normalizeDice(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_DICE) return null;
  const dice = [];
  for (const row of rows) {
    const faces = Number(row?.faces);
    const value = row?.value;
    if (!Number.isInteger(faces) || faces < 2 || faces > 1000 ||
        !(Number.isFinite(value) || typeof value === "string" && value.length <= 18 && value.trim())) return null;
    const kind = typeof row.kind === "string" && /^[\w-]{1,40}$/.test(row.kind) ? row.kind : `d${faces}`;
    dice.push({kind, faces, value, discarded: row.discarded === true});
  }
  return dice;
}

export function diceFromRolls(rolls, classifyTerm = () => undefined) {
  if (!Array.isArray(rolls)) return null;
  return normalizeDice(rolls.flatMap(roll => (roll.dice || []).flatMap((term, index) =>
    (term.results || []).map(result => ({
      faces: term.faces || (term.constructor?.name === "FateDie" ? 3 : 0),
      kind: classifyTerm(term, roll, index) ?? (term.constructor?.name === "FateDie" ? "fate" : term.denomination === "d" ? undefined : term.denomination),
      value: result.result,
      discarded: result.active === false || result.discarded === true
    })))));
}

export function createTiming(now, count, key, sceneId = null) {
  const start = Math.round(now + LEAD);
  const spacing = Math.min(380, 1600 / Math.max(1, count - 1));
  return {key, sceneId, start, ends: Array.from({length: count}, (_, i) => start + Math.round(960 + spacing * i))};
}

export function activeTiming(timing, count, now) {
  if (!timing || typeof timing.key !== "string" || timing.key.length > 80 ||
      !Number.isFinite(timing.start) || !Array.isArray(timing.ends) || timing.ends.length !== count ||
      timing.start > now + 2400 ||
      timing.ends.some((end, i) => !Number.isFinite(end) || end <= (timing.ends[i - 1] ?? timing.start) ||
        end - timing.start > MAX_STAGE_TIME)) return false;
  return timing.ends.at(-1) > now;
}

export function visibleRoll(message) {
  return message?.visible === true && message.isContentVisible === true;
}

export function resolveDiceTokenVoice(override, systemId, actor) {
  if (["none", "male", "female", "custom"].includes(override)) return override;
  if (systemId !== "realm-guard") return "none";
  const silhouette = actor?.getFlag?.("realm-guard", "inventorySilhouetteSex");
  if (silhouette === "male" || silhouette === "female") return silhouette;
  return actor?.type === "character" ? "male" : "none";
}

export function dieDesign(die, preferences = {}, preset = {}) {
  const theme = Object.hasOwn(DICE_MATERIALS, preferences.material) ? preferences.material : "steel";
  const material = Object.hasOwn(DICE_MATERIALS, preset.material) ? preset.material : theme;
  const {color: base, ink, tile} = DICE_MATERIALS[material];
  const playerTint = !preset.lockColor && COLORS.test(preferences.color);
  const presetTint = COLORS.test(preset.color);
  const color = presetTint ? preset.color : base;
  const lettering = COLORS.test(preset.ink) ? preset.ink : ink;
  const faceLabels = Array.isArray(preset.faceLabels) && preset.faceLabels.length === die.faces &&
    Number.isInteger(die.value) && die.value >= 1 && die.value <= die.faces &&
    preset.faceLabels.every(face => typeof face === "string" && face.length <= 18) ? preset.faceLabels : null;
  const label = faceLabels ? faceLabels[die.value - 1]
    : typeof preset.label === "string" && preset.label.trim() ? preset.label.slice(0, 18) : String(die.value);
  const model = Object.hasOwn(D6_MODELS, preferences.d6Model) ? preferences.d6Model : "beveled";
  const markings = ["pips", "numbers"].includes(preferences.d6Markings)
    ? preferences.d6Markings : model === "classic" ? "pips" : "numbers";
  return {
    material, label,
    ...(faceLabels ? {faceLabels} : {}),
    color: playerTint ? preferences.color : color,
    ink: !preset.lockInk && COLORS.test(preferences.ink) ? preferences.ink : lettering,
    shape: die.faces === 6 ? "cube" : MESH_DICE.includes(die.faces) ? `d${die.faces}` : "badge",
    ...(die.faces === 6 ? {model, markings} : {}),
    ...(tile === undefined ? {} : {tile, tint: playerTint || presetTint})
  };
}

export function rollSeed(key) {
  let state = 2166136261;
  for (const char of key) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const diceStartDelay = index => Math.min(150, index * 23);

// Collision numbers use screen pixels. Results and reveal times are shared separately.
export function buildTrajectories({width, height, size, obstacles, timing, seed}) {
  const random = rollSeed(seed);
  const radius = size * .45;
  const step = 1000 / 90;
  const dice = timing.ends.map((end, index) => {
    const direction = (random() - .5) * .72;
    const velocity = Math.min(1640, Math.max(490, width * (.95 + random() * .68)));
    return {
      x: -radius + index % 3 * radius * .7,
      y: Math.max(radius, Math.min(height - radius, height * (.27 + random() * .47))),
      vx: Math.cos(direction) * velocity, vy: Math.sin(direction) * velocity,
      delay: diceStartDelay(index), end: end - timing.start,
      spin: 0, frames: [], sounds: [], recent: -10000
    };
  });
  const total = timing.ends.at(-1) - timing.start;
  const contacts = new Map();
  for (let time = 0; time <= total + step; time += step) {
    for (const [index, die] of dice.entries()) {
      if (time >= die.delay && time < die.end) {
        const remaining = die.end - time;
        const speed = Math.hypot(die.vx, die.vy);
        const friction = remaining < 360 ? .902 : .989;
        die.x += die.vx * step / 1000;
        die.y += die.vy * step / 1000;
        die.vx *= friction;
        die.vy *= friction;
        die.spin += speed * step / 1000 / radius;
        if (die.x >= width - radius && die.vx > 0) {
          die.x = width - radius;
          die.vx *= -.65;
          die.sounds.push({time, kind: "table", power: Math.min(1, speed / 900)});
        }
        if (die.x < radius && die.vx < 0) {
          die.x = radius;
          die.vx *= -.65;
        }
        if (die.y < radius || die.y > height - radius) {
          die.y = Math.min(height - radius, Math.max(radius, die.y));
          die.vy *= -.66;
          die.sounds.push({time, kind: "table", power: Math.min(1, speed / 900)});
        }
        for (const [j, token] of obstacles.entries()) {
          const dx = die.x - token.x, dy = die.y - token.y;
          const distance = Math.hypot(dx, dy) || .001;
          const edge = radius + token.radius;
          if (distance >= edge) continue;
          const nx = distance === .001 ? -1 : dx / distance;
          const ny = dy / distance;
          const approach = die.vx * nx + die.vy * ny;
          die.x = token.x + nx * (edge + .5);
          die.y = token.y + ny * (edge + .5);
          if (approach >= 0) continue;
          die.vx -= 1.77 * approach * nx;
          die.vy -= 1.77 * approach * ny;
          const key = index * obstacles.length + j;
          if (time - (contacts.get(key) ?? -10000) > 100) {
            contacts.set(key, time);
            die.sounds.push({time, kind: "token", voice: token.voice, sound: token.sound, power: Math.min(1, -approach / 700)});
          }
        }
        const beat = 62 + Math.min(110, 4500 / Math.max(40, speed));
        if (time - die.recent >= beat && (speed > 55 || remaining < step * 2)) {
          die.recent = time;
          die.sounds.push({time, kind: "table", power: Math.min(.9, .12 + speed / 1000)});
        }
      }
      die.frames.push({x: die.x, y: die.y, spin: die.spin});
    }
    // A moving die may deflect another, but a settled die keeps its position.
    for (let a = 0; a < dice.length; a++) for (let b = a + 1; b < dice.length; b++) {
      const first = dice[a], second = dice[b];
      if (time < second.delay || time >= first.end || time >= second.end) continue;
      const dx = second.x - first.x, dy = second.y - first.y, dist = Math.hypot(dx, dy);
      if (dist < .1 || dist >= radius * 2) continue;
      const nx = dx / dist, ny = dy / dist;
      const impulse = (first.vx - second.vx) * nx + (first.vy - second.vy) * ny;
      if (impulse <= 0) continue;
      first.vx -= impulse * .8 * nx; first.vy -= impulse * .8 * ny;
      second.vx += impulse * .8 * nx; second.vy += impulse * .8 * ny;
      if (impulse > 70) second.sounds.push({time, kind: "table", power: Math.min(.65, impulse / 900)});
    }
  }
  return {step, dice};
}
