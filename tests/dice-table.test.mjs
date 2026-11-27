import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {D6_MODELS, DICE_MATERIALS, activeTiming, buildTrajectories, createTiming, diceFromRolls, dieDesign, resolveDiceTokenVoice, visibleRoll} from "../scripts/dice-table-core.mjs";
import {diceMeshParts, layoutDiceMesh} from "../scripts/dice-table-meshes.mjs";
import {readDicePool} from "../scripts/dice-table-pool.mjs";
import {daggerheartDiceKind, daggerheartDicePreset} from "../scripts/dice-table-daggerheart.mjs";
import {genesysDicePreset, genesysFaceLabels, genesysPoolAdapter, readGenesysDice} from "../scripts/dice-table-genesys.mjs";

const genesysFaces = Object.fromEntries([
  ["boost", 6], ["setback", 6], ["ability", 8], ["difficulty", 8], ["proficiency", 12], ["challenge", 12]
].map(([type, count]) => [type, Array.from({length: count}, () => ({symbols: {}}))]));
genesysFaces.boost[3] = {symbols: {success: 1, advantage: 1}};
genesysFaces.ability[3] = {symbols: {success: 2}};
genesysFaces.proficiency[11] = {symbols: {triumph: 1}};
genesysFaces.challenge[11] = {symbols: {despair: 1}};

test("Genesys uses the system face table for combined symbols, blanks and special faces", () => {
  const faceLabels = genesysFaceLabels(genesysFaces);
  assert.equal(faceLabels.boost[3], "✱ ▲");
  assert.equal(faceLabels.ability[3], "✱ ✱");
  assert.equal(faceLabels.proficiency[11], "✪");
  assert.equal(faceLabels.challenge[11], "⊠");
  assert.equal(faceLabels.setback[0], "");
  assert.equal(genesysFaceLabels({}), null);

  const blank = {kind: "difficulty", faces: 8, value: 8};
  const design = dieDesign(blank, {color: "#ffffff"}, genesysDicePreset(blank, faceLabels));
  const [part] = diceMeshParts(blank, design.label, design.faceLabels);
  assert.equal(part.faceIndex, 7);
  assert.equal(layoutDiceMesh(part, 46).find(face => face.result).label, "");
  assert.notEqual(design.color, "#ffffff");
});

test("Genesys reads the actual face numbers from native chat cards", () => {
  const doc = {
    createElement: () => ({
      content: {querySelectorAll: () => [{
        querySelectorAll: () => [
          {textContent: "Boost #4: success ×1, advantage ×1"},
          {textContent: "Challenge #12: despair ×1"}
        ]
      }]}
    })
  };
  assert.deepEqual(readGenesysDice('<section class="genesys-chat-roll"></section>', doc), [
    {kind: "boost", faces: 6, value: 4, discarded: false},
    {kind: "challenge", faces: 12, value: 12, discarded: false}
  ]);
  assert.equal(readGenesysDice("An ordinary chat message", doc), null);
});

test("Genesys sends public pools through the native API and blind results through Foundry privacy", async () => {
  let mode = "publicroll";
  let rollCount = 0;
  const result = {
    succeeded: false,
    net: {success: 0, failure: 0, advantage: 0, threat: 0, triumph: 0, despair: 1},
    dice: [{type: "challenge", faceIndex: 11, symbols: {despair: 1}}]
  };
  const adapter = genesysPoolAdapter({
    faces: genesysFaces,
    rollToChat: counts => ({counts}),
    roll() { rollCount++; return result; }
  }, {
    chat: {
      getSpeaker: () => ({alias: "Test"}),
      applyRollMode: (data, mode) => ({...data, whisper: ["gm"], blind: mode === "blindroll"}),
      create: data => data
    },
    rollMode: () => mode,
    blindRoll: async () => ({toJSON: () => ({formula: "0"})}),
    localize: key => key
  });
  const pool = [{id: "challenge", count: 1}];
  assert.equal(adapter.dice.length, 6);
  assert.deepEqual(await adapter.roll(pool), {counts: {challenge: 1}});
  assert.equal(rollCount, 0);
  mode = "blindroll";
  const message = await adapter.roll(pool);
  assert.equal(rollCount, 1);
  assert.deepEqual(message.whisper, ["gm"]);
  assert.equal(message.blind, true);
  assert.deepEqual(message.rolls, [{formula: "0"}]);
  assert.match(message.content, /Challenge<\/strong> #12: despair ×1/);
  assert.equal(message.flags, undefined);
});

test("the chat pool supports mixed numeric or symbolic types and validates the total", () => {
  const numeric = [{id: "6"}, {id: "20"}, {id: "100"}];
  assert.deepEqual(readDicePool(numeric, {"pool-6": "2", "pool-20": 1, "pool-100": 0}), [
    {id: "6", count: 2}, {id: "20", count: 1}
  ]);
  const symbols = [{id: "ability"}, {id: "difficulty"}];
  assert.deepEqual(readDicePool(symbols, {"pool-ability": 2, "pool-difficulty": 1}), [
    {id: "ability", count: 2}, {id: "difficulty", count: 1}
  ]);
  assert.deepEqual(readDicePool(numeric, {"pool-6": 40, "pool-20": 1}), [{id: "6", count: 40}, {id: "20", count: 1}]);
  assert.equal(readDicePool(numeric, {"pool-6": Number.MAX_SAFE_INTEGER, "pool-20": 1}), null);
  assert.equal(readDicePool(numeric, {"pool-6": -1}), null);
  assert.equal(readDicePool(numeric, {"pool-6": 2.5}), null);
  assert.equal(readDicePool(numeric, {}), null);
});

test("polyhedral dice have the correct faces and land on the actual result", () => {
  for (const [faces, sides] of [[2, 24], [4, 3], [8, 3], [10, 4], [12, 5], [20, 3]]) {
    for (let value = 1; value <= faces; value++) {
      const label = String(value);
      const [part] = diceMeshParts({faces, value}, label);
      const layout = layoutDiceMesh(part, 46);
      assert.equal(layout.filter(face => !face.rim).length, faces);
      assert.ok(layout.filter(face => !face.rim).every(face => face.polygon.length === sides));
      const front = layout.find(face => face.result);
      assert.equal(front.label, label);
      assert.ok(Math.abs(front.basis[2][2] - 1) < 1e-6);
      assert.ok(layout.every(face => face.polygon.flat().every(Number.isFinite)));
      if (faces === 2) assert.equal(layout.filter(face => face.rim).length, 24);
    }
  }
  assert.deepEqual(diceMeshParts({faces: 7, value: 5}, "5"), []);
});

test("percentile dice display one result as a pair including 01, 10 and 100", () => {
  for (const [value, tens, ones] of [[1, "00", "1"], [10, "10", "0"], [57, "50", "7"], [100, "00", "0"]]) {
    const parts = diceMeshParts({faces: 100, value}, String(value));
    assert.deepEqual(parts.map(part => part.faces), [10, 10]);
    assert.deepEqual(parts.map(part => layoutDiceMesh(part, 32).find(face => face.result).label), [tens, ones]);
  }
});

test("automatic token voices use Realm Guard silhouettes and respect manual overrides", () => {
  const character = {type: "character", getFlag: (_, key) => key === "inventorySilhouetteSex" ? "female" : undefined};
  assert.equal(resolveDiceTokenVoice(undefined, "realm-guard", character), "female");
  assert.equal(resolveDiceTokenVoice("auto", "realm-guard", {...character, type: "npc"}), "female");
  assert.equal(resolveDiceTokenVoice("auto", "realm-guard", {type: "character"}), "male");
  assert.equal(resolveDiceTokenVoice("auto", "realm-guard", {type: "npc"}), "none");
  assert.equal(resolveDiceTokenVoice("auto", "another-system", character), "none");
  assert.equal(resolveDiceTokenVoice("male", "realm-guard", character), "male");
  assert.equal(resolveDiceTokenVoice("none", "realm-guard", character), "none");
  assert.equal(resolveDiceTokenVoice("female", "another-system", null), "female");
  assert.equal(resolveDiceTokenVoice("custom", "realm-guard", character), "custom");
});

test("Tome reads evaluated dice and keeps discarded and rerolled values without evaluating again", () => {
  const dice = diceFromRolls([{dice: [
    {faces: 6, denomination: "d", results: [{result: 1, active: false}, {result: 5}]},
    {faces: 20, denomination: "d", results: [{result: 17}]}
  ]}]);
  assert.deepEqual(dice, [
    {faces: 6, kind: "d6", value: 1, discarded: true},
    {faces: 6, kind: "d6", value: 5, discarded: false},
    {faces: 20, kind: "d20", value: 17, discarded: false}
  ]);
  assert.equal(diceFromRolls([{dice: [{faces: 6, results: []}]}]), null);
  assert.equal(diceFromRolls([{dice: [{faces: 6, results: [{result: Infinity}]}]}]), null);
});

test("shared reveal timing is bounded, preserves each die slot and rejects expired or malformed timing", () => {
  const timing = createTiming(1000, 3, "roll", "scene");
  assert.deepEqual(timing.ends, [2380, 2760, 3140]);
  assert.equal(activeTiming(timing, 3, 1400), true);
  assert.equal(activeTiming(timing, 3, 3140), false);
  assert.equal(activeTiming(timing, 2, 1400), false);
  assert.equal(activeTiming({...timing, ends: [2380, 2379, 3140]}, 3, 1400), false);
  assert.equal(visibleRoll({visible: true, isContentVisible: false}), false);
  assert.equal(visibleRoll({visible: false, isContentVisible: true}), false);
  assert.equal(visibleRoll({visible: true, isContentVisible: true}), true);
});

test("Daggerheart keeps the roles and exact results of evaluated dice", () => {
  const term = (name, faces, ...results) => ({constructor: {name}, denomination: "d", faces, results});
  const rolls = [{dice: [
    term("HopeDie", 12, {result: 8}),
    term("FearDie", 12, {result: 8}),
    term("AdvantageDie", 6, {result: 2, active: false}, {result: 5}),
    term("DisadvantageDie", 6, {result: 3}),
    term("BaseDie", 20, {result: 17})
  ]}];
  const dice = diceFromRolls(rolls, daggerheartDiceKind);
  assert.deepEqual(dice.map(die => [die.kind, die.value, die.discarded]), [
    ["hope", 8, false], ["fear", 8, false], ["advantage", 2, true],
    ["advantage", 5, false], ["disadvantage", 3, false], ["d20", 17, false]
  ]);
  assert.deepEqual(diceFromRolls(rolls).map(die => die.kind), ["d12", "d12", "d6", "d6", "d6", "d20"]);
  const [hope, fear] = dice;
  const settings = {color: "#ffffff", ink: "#ffffff"};
  const hopeStyle = dieDesign(hope, settings, daggerheartDicePreset(hope));
  const fearStyle = dieDesign(fear, settings, daggerheartDicePreset(fear));
  assert.notEqual(hopeStyle.color, fearStyle.color);
  assert.ok([hopeStyle, fearStyle].every(style => style.shape === "d12" && style.label === "8"));
  assert.equal(dieDesign(dice.at(-1), settings, daggerheartDicePreset(dice.at(-1))).color, "#ffffff");
});

test("Foundry v13 Daggerheart keeps matching Hope and Fear results distinct", () => {
  class DualityRoll {
    hasAdvantage = true;
    dice = [
      {faces: 12, denomination: "d", results: [{result: 8}]},
      {faces: 12, denomination: "d", results: [{result: 8}]},
      {faces: 6, denomination: "d", results: [{result: 4}]},
      {faces: 8, denomination: "d", results: [{result: 7}]}
    ];
  }

  const roll = new DualityRoll();
  const roles = () => diceFromRolls([roll], daggerheartDiceKind).map(({kind, value}) => [kind, value]);
  assert.deepEqual(roles(), [["hope", 8], ["fear", 8], ["advantage", 4], ["d8", 7]]);
  roll.hasAdvantage = false;
  assert.deepEqual(roles(), [["hope", 8], ["fear", 8], ["d6", 4], ["d8", 7]]);
  roll.hasDisadvantage = true;
  assert.deepEqual(roles(), [["hope", 8], ["fear", 8], ["disadvantage", 4], ["d8", 7]]);
});

test("a client-local token collision reverses a die while its shared settle time stays the same", () => {
  const timing = createTiming(1000, 3, "roll", "scene");
  const input = {width: 810, height: 480, size: 42, timing, seed: "roll"};
  const clean = buildTrajectories({...input, obstacles: []});
  const at = clean.dice[0].frames[25];
  const obstructed = buildTrajectories({...input, obstacles: [{x: at.x + 24, y: at.y, radius: 38, voice: "custom", sound: "audio/ouch.wav"}]});
  const bounce = obstructed.dice[0].sounds.find(sound => sound.kind === "token");
  assert.equal(bounce?.voice, "custom");
  assert.equal(bounce?.sound, "audio/ouch.wav");
  const frame = Math.round(bounce.time / obstructed.step);
  assert.ok(obstructed.dice[0].frames[frame + 2].x < obstructed.dice[0].frames[frame].x);
  assert.equal(obstructed.dice[0].end, clean.dice[0].end);
  assert.equal(clean.dice[0].sounds.some(sound => sound.kind === "token"), false);
});

test("system presets can lock color and ink while ordinary dice use client preferences", () => {
  const d6 = {faces: 6, value: 5};
  assert.equal(dieDesign(d6).model, "beveled");
  assert.equal(dieDesign(d6, {d6Model: "classic", material: "marble"}).model, "classic");
  assert.equal(dieDesign(d6, {d6Model: "precision"}).model, "precision");
  assert.equal(dieDesign(d6, {d6Model: "invalid"}).model, "beveled");
  assert.equal(dieDesign(d6).material, "steel");
  assert.equal(dieDesign(d6, {material: "marble", color: "#428145"}).color, "#428145");
  const abilityDie = {faces: 8, value: 5};
  assert.deepEqual(dieDesign(abilityDie, {color: "#ff0000", ink: "#0000ff"}, {
    color: "#4fa432", ink: "#ffffff", lockColor: true, lockInk: true, label: "◆"
  }), {material: "steel", label: "◆", color: "#4fa432", ink: "#ffffff", shape: "d8"});
});

test("the packaged sound banks have 30 table contacts and three token contacts", () => {
  for (const [name, count] of [["table", 30], ["token", 3]]) {
    const wav = readFileSync(new URL(`../assets/dice/${name}.wav`, import.meta.url));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(40), count * Math.round(.12 * wav.readUInt32LE(24)) * wav.readUInt16LE(32));
  }
});

test("all dice materials reference high-resolution texture assets", () => {
  const css = readFileSync(new URL("../styles/dice-table.css", import.meta.url), "utf8");
  for (const material of ["steel", "bone", "marble"]) {
    const asset = `assets/dice/surfaces/${material}.png`;
    assert.ok(css.includes(`url("../${asset}")`));
    const png = readFileSync(new URL(`../${asset}`, import.meta.url));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.ok(png.readUInt32BE(16) >= 256);
    assert.ok(png.readUInt32BE(20) >= 256);
  }
});

test("all twelve fantasy materials have a dedicated atlas tile and support independent shape and tint", () => {
  const themes = Object.entries(DICE_MATERIALS).filter(([, {tile}]) => tile !== undefined);
  const translations = ["en", "sv"].map(locale =>
    JSON.parse(readFileSync(new URL(`../lang/${locale}.json`, import.meta.url), "utf8")));
  assert.deepEqual(themes.map(([, {tile}]) => tile), Array.from({length: 12}, (_, index) => index));
  for (const [material, {label, tile}] of themes) {
    for (const strings of translations) assert.ok(strings[`AT.DiceTable.${label}`]);
    assert.equal(dieDesign({faces: 20, value: 18}, {material}).tile, tile);
    assert.equal(dieDesign({faces: 6, value: 5}, {material}).tint, false);
    const custom = dieDesign({faces: 6, value: 5}, {material, color: "#54133c", d6Model: "classic"});
    assert.equal(custom.tint, true);
    assert.equal(custom.color, "#54133c");
    assert.equal(custom.model, "classic");
  }
  const atlas = readFileSync(new URL("../assets/dice/surfaces/fantasy-atlas.png", import.meta.url));
  assert.equal(atlas.toString("ascii", 1, 4), "PNG");
  assert.ok(atlas.readUInt32BE(16) >= 1024);
  assert.ok(atlas.readUInt32BE(20) >= 768);
});

test("every D6 model and material supports both marking styles", () => {
  const die = {faces: 6, value: 5};
  for (const d6Model of Object.keys(D6_MODELS)) {
    for (const material of Object.keys(DICE_MATERIALS)) {
      for (const d6Markings of ["pips", "numbers"]) {
        const design = dieDesign(die, {material, d6Model, d6Markings});
        assert.equal(design.model, d6Model);
        assert.equal(design.markings, d6Markings);
        assert.equal(design.material, material);
        assert.equal(design.label, "5");
      }
    }
  }
  assert.equal(dieDesign(die, {d6Model: "classic"}).markings, "pips");
  assert.equal(dieDesign(die, {d6Model: "precision"}).markings, "numbers");
});
