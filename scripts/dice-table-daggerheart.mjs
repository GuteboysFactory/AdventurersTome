export const DAGGERHEART_ID = "daggerheart";

const diceRoles = {
  HopeDie: "hope",
  FearDie: "fear",
  AdvantageDie: "advantage",
  DisadvantageDie: "disadvantage"
};

const appearance = {
  hope: {role: "Hope", color: "#d3a74f", ink: "#241a10"},
  fear: {role: "Fear", color: "#52296e", ink: "#fff1e0"},
  advantage: {role: "Advantage", color: "#245c47", ink: "#fff5d5"},
  disadvantage: {role: "Disadvantage", color: "#893c38", ink: "#fff1e0"}
};

export function daggerheartDiceKind(term, roll, index) {
  const name = term.constructor?.name;
  if (Object.hasOwn(diceRoles, name)) return diceRoles[name];
  // Foundryborne's v13 DualityRoll stores both roles as regular dice in this order.
  if (roll.constructor?.name !== "DualityRoll") return;
  if (index === 0) return "hope";
  if (index === 1) return "fear";
  if (index === 2 && roll.hasDisadvantage) return "disadvantage";
  if (index === 2 && roll.hasAdvantage) return "advantage";
}

export function daggerheartDicePreset({kind}) {
  if (!Object.hasOwn(appearance, kind)) return {};
  return {...appearance[kind], lockColor: true, lockInk: true};
}
