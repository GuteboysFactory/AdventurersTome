import {buildTrajectories, dieDesign, resolveDiceTokenVoice} from "./dice-table-core.mjs";
import {primeDiceReaction} from "./dice-table-audio.mjs";
import {diceMeshParts, layoutDiceMesh} from "./dice-table-meshes.mjs";

function tableViewport() {
  const board = canvas?.app?.canvas ?? canvas?.app?.view;
  const rect = board?.getBoundingClientRect?.();
  if (!rect || rect.width < 160 || rect.height < 140 || !canvas.stage?.worldTransform) return null;
  const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
  const right = sidebar?.width > 90 && sidebar.left > rect.left + 180 ? Math.min(rect.right, sidebar.left) : rect.right;
  return {left: rect.left, top: rect.top, width: right - rect.left, height: rect.height, view: rect};
}

function visibleObstacles({view, width, height}) {
  const transform = canvas.stage.worldTransform;
  const scale = Math.hypot(transform.a, transform.b);
  return canvas.tokens.placeables.flatMap(token => {
    if (token.visible !== true || !token.mesh?.visible ||
        token.document.hidden && !game.user.isGM || !token.center) return [];
    const point = transform.apply(token.center);
    const x = point.x * view.width / canvas.app.screen.width;
    const y = point.y * view.height / canvas.app.screen.height;
    const radius = Math.max(8, Math.min(token.w, token.h) * scale * .48);
    if (![x, y, radius].every(Number.isFinite) || x < -radius || y < -radius || x > width + radius || y > height + radius) return [];
    const voice = resolveDiceTokenVoice(token.document.getFlag("adventurers-tome", "diceTokenVoice"), game.system.id, token.actor);
    const sound = voice === "custom" ? token.document.getFlag("adventurers-tome", "diceTokenSound") : null;
    return [{x, y, radius, voice, sound}];
  }).slice(0, 100);
}

function element(tag, className, content = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

const PIP_CELLS = [[], [5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
// The middle row in the artwork is slightly shorter. Sample inside each tile.
const FANTASY_ATLAS_ROWS = ["2%", "49%", "97%"];

function appendDiceMeshes(model, parts, size) {
  const pair = parts.length === 2;
  const pieceSize = pair ? size * .74 : size;
  const cssNumber = value => Number(value.toFixed(5));
  for (const [index, part] of parts.entries()) {
    const mesh = element("div", "at-dice-mesh");
    mesh.style.setProperty("--at-die-size", `${pieceSize}px`);
    if (pair) {
      const offset = (size - pieceSize) / 2 + (index === 0 ? -.36 : .36) * size;
      mesh.style.left = `${offset}px`;
      mesh.style.top = `${(size - pieceSize) / 2}px`;
      mesh.style.transform = `rotateZ(${index === 0 ? -6 : 6}deg)`;
    }
    for (const {basis, center, polygon, label, rim, result} of layoutDiceMesh(part, pieceSize)) {
      const face = element("span", `at-dice-face at-dice-mesh-face${rim ? " at-dice-coin-rim" : ""}`, label);
      const matrix = [...basis.flatMap(axis => [...axis, 0]), ...center, 1].map(cssNumber);
      face.style.transform = `matrix3d(${matrix.join(",")})`;
      face.style.clipPath = `polygon(${polygon.map(point => point.map(value => `${cssNumber(value / pieceSize * 100 + 50)}%`).join(" ")).join(",")})`;
      const light = Math.max(0, Math.min(1, .8 * basis[2][2] - .24 * basis[2][0] - .42 * basis[2][1]));
      face.style.setProperty("--at-face-light", `${Math.round((1 - light) * 40)}%`);
      if (result) face.dataset.resultFace = "";
      mesh.append(face);
    }
    model.append(mesh);
  }
}

function makeDie(die, design, size) {
  const shadow = element("div", "at-dice-shadow");
  const shell = element("div", "at-dice-die");
  shell.dataset.material = design.material;
  shell.dataset.shape = design.shape;
  if (design.faceLabels) shell.dataset.symbols = "";
  if (design.model) shell.dataset.model = design.model;
  if (design.tile !== undefined) {
    shell.dataset.fantasy = design.tint ? "tinted" : "true";
    shell.style.setProperty("--at-die-tile-x", `${(design.tile % 4) * 100 / 3}%`);
    shell.style.setProperty("--at-die-tile-y", FANTASY_ATLAS_ROWS[Math.floor(design.tile / 4)]);
  }
  shell.style.setProperty("--at-die-size", `${size}px`);
  shell.style.setProperty("--at-die-color", design.color);
  shell.style.setProperty("--at-die-ink", design.ink);
  const model = element("div", "at-dice-model");
  const printable = design.shape === "cube" && Number.isInteger(die.value) && die.value >= 1 && die.value <= 6;
  if (design.shape === "cube") {
    const opposing = printable ? 7 - die.value : 6;
    const after = printable ? [1, 2, 3, 4, 5, 6].filter(value => value !== opposing && value !== die.value) : ["", "", "", ""];
    const labels = design.faceLabels
      ? [die.value, after[0], opposing, after[3], after[1], after[2]].map(value => design.faceLabels[value - 1])
      : [design.label, after[0], printable ? opposing : "", after[3], after[1], after[2]];
    for (const label of labels) {
      const face = element("span", "at-dice-face", String(label));
      const pips = !design.faceLabels && printable && design.markings === "pips" && /^[1-6]$/.test(label) && PIP_CELLS[Number(label)];
      if (pips?.length) {
        face.textContent = "";
        const pattern = element("span", "at-dice-pips");
        for (const cell of pips) {
          const pip = element("span", "at-dice-pip");
          pip.style.gridRow = String(Math.ceil(cell / 3));
          pip.style.gridColumn = String((cell - 1) % 3 + 1);
          pattern.append(pip);
        }
        face.append(pattern);
      }
      model.append(face);
    }
  } else if (design.shape === "badge") {
    model.append(element("span", "at-dice-face at-dice-poly", design.label));
  } else {
    appendDiceMeshes(model, diceMeshParts(die, design.label, design.faceLabels), size);
  }
  shell.append(model);
  shadow.style.width = `${size * (design.shape === "d100" ? 1.4 : .82)}px`;
  shadow.style.height = `${size * .48}px`;
  return {shell, model, shadow};
}

export function renderDiePreview(preview, preferences, faces = 6) {
  const die = {faces, value: faces === 100 ? 57 : faces};
  const {shell, model} = makeDie(die, dieDesign(die, preferences), 43);
  model.style.transform = "rotateX(-15deg) rotateY(-22deg)";
  preview.replaceChildren(shell);
}

function paintDie(element, state, elapsed, end, size) {
  const remaining = Math.max(0, end - elapsed);
  const drop = Math.min(1, remaining / 170);
  const lift = Math.abs(Math.sin(state.spin * 1.2)) * size * .32 * drop;
  element.shell.style.transform = `translate3d(${state.x - size / 2}px,${state.y - size / 2 - lift}px,0)`;
  const halfShadow = element.shell.dataset.shape === "d100" ? .7 : .41;
  element.shadow.style.transform = `translate3d(${state.x - size * halfShadow + 2}px,${state.y - size * .18 + 5}px,0)`;
  element.shadow.style.opacity = String(.57 - lift / size * .62);
  const degree = state.spin * 180 / Math.PI;
  const settle = value => drop === 1 ? value : (((value + 180) % 360 + 360) % 360 - 180) * drop;
  const tilt = element.shell.dataset.shape === "badge" ? 0 : 1 - drop;
  element.model.style.transform = `rotateZ(${settle(degree * .34)}deg) rotateX(${settle(degree * .73) - 14 * tilt}deg) rotateY(${settle(degree) - 13 * tilt}deg)`;
}

export function makeDiceView({dice, timing, preferences, presetFor, onSound}) {
  if (!canvas?.ready || canvas.scene?.id !== timing.sceneId || !preferences.animate) return null;
  const viewport = tableViewport();
  if (!viewport) return null;
  const size = Math.max(24, Math.min(46, Math.min(viewport.width, viewport.height) * .078));
  const models = dice.map(die => makeDie(die, dieDesign(die, preferences, presetFor(die)), size));
  const layer = element("div", "at-dice-table");
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${viewport.left}px`;
  layer.style.top = `${viewport.top}px`;
  layer.style.width = `${viewport.width}px`;
  layer.style.height = `${viewport.height}px`;
  for (const model of models) {
    model.shell.hidden = model.shadow.hidden = true;
    layer.append(model.shadow, model.shell);
  }
  document.body.append(layer);
  const obstacles = visibleObstacles(viewport);
  if (preferences.sound && preferences.voiceFrequency !== "off") {
    for (const {sound} of obstacles) primeDiceReaction(sound);
  }
  const physics = buildTrajectories({...viewport, size, obstacles, timing,
    seed: `${timing.key}:${Math.round(viewport.width)}:${Math.round(viewport.height)}`});
  const sounds = physics.dice.flatMap((die, index) => die.sounds.map(sound => ({...sound, index}))).sort((a, b) => a.time - b.time);
  let soundIndex = 0;
  let fade;
  return {
    render(now) {
      const elapsed = now - timing.start;
      if (elapsed < 0) return;
      while (soundIndex < sounds.length && sounds[soundIndex].time <= elapsed) {
        const sound = sounds[soundIndex++];
        if (elapsed - sound.time < 70) onSound(sound, dice.length);
      }
      for (const [index, model] of models.entries()) {
        const die = physics.dice[index];
        if (elapsed < die.delay) continue;
        model.shell.hidden = model.shadow.hidden = false;
        const point = die.frames[Math.min(die.frames.length - 1, Math.floor(elapsed / physics.step))];
        paintDie(model, point, elapsed, die.end, size);
      }
    },
    fadeOut(duration) {
      fade = layer.animate([{opacity: 1}, {opacity: 0}], {duration, easing: "ease-in", fill: "forwards"});
      return fade.finished.catch(() => {});
    },
    close() {
      fade?.cancel();
      layer.remove();
    }
  };
}
