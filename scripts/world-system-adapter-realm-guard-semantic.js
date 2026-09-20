const ATRG_SEMANTIC_ADAPTER_ID = "realm-guard-semantic-reference";

function atRgSemanticRegistry() {
  const early = globalThis.AdventurersTomeSystemAdapters;
  if (early?.register) return early;
  return globalThis.game?.modules?.get?.("adventurers-tome")?.api?.adapters || null;
}

function atRgText(value) {
  return String(value ?? "").trim();
}

function atRgRelationshipEntries(source) {
  const system = source?.system || {};
  const definitions = [
    ["parents", "Parents", "parents"],
    ["seniorArtisan", "Senior Artisan", "artisan"],
    ["mentor", "Mentor", "mentor"],
    ["friend", "Friend / Ally", "ally"],
    ["enemy", "Enemy / Rival", "enemy"]
  ];

  return definitions
    .map(([path, label, kind]) => {
      const value = atRgText(system?.[path]);
      return value ? { kind, label, value, sourcePath:`system.${path}` } : null;
    })
    .filter(Boolean);
}

function atRgTraitEntries(source) {
  return (source?.items?.contents ?? source?.items ?? [])
    .filter((item) => String(item?.type || "") === "trait")
    .map((item) => ({
      id:String(item.id || ""),
      uuid:String(item.uuid || ""),
      name:String(item.name || ""),
      rating:Number(item.system?.rating ?? 0),
      description:String(item.system?.description ?? ""),
      sourcePath:`items.${item.id}`
    }));
}

function atRgItemEntries(source, type, mapEntry) {
  return (source?.items?.contents ?? source?.items ?? [])
    .filter((item) => String(item?.type || "") === type)
    .map((item) => mapEntry(item))
    .filter(Boolean);
}

function atRgSkillEntries(source) {
  return atRgItemEntries(source, "role", (item) => ({
    id:String(item.id || ""),
    uuid:String(item.uuid || ""),
    name:String(item.name || ""),
    rating:Number(item.system?.rating ?? 0),
    trained:Number(item.system?.rating ?? 0) > 0,
    versus:Boolean(item.system?.versus),
    learning:{
      passed:Number(item.system?.learning?.passed ?? 0),
      failed:Number(item.system?.learning?.failed ?? 0),
      passNeeded:Number(item.system?.learning?.passNeeded ?? 0),
      failNeeded:Number(item.system?.learning?.failNeeded ?? 0)
    },
    sourcePath:`items.${item.id}`
  }));
}

function atRgWiseEntries(source) {
  return atRgItemEntries(source, "wise", (item) => ({
    id:String(item.id || ""),
    uuid:String(item.uuid || ""),
    name:String(item.name || ""),
    description:String(item.system?.description ?? ""),
    sourcePath:`items.${item.id}`
  }));
}

function atRgTalentEntries(source) {
  return atRgItemEntries(source, "talent", (item) => ({
    id:String(item.id || ""),
    uuid:String(item.uuid || ""),
    name:String(item.name || ""),
    minLevel:Number(item.system?.minLevel ?? 0),
    frequency:String(item.system?.frequency ?? ""),
    linkType:String(item.system?.linkType ?? ""),
    linkedSkill:String(item.system?.linkedSkill ?? ""),
    linkedAbility:String(item.system?.linkedAbility ?? ""),
    effectMode:String(item.system?.effectMode ?? ""),
    diceBonus:Number(item.system?.diceBonus ?? 0),
    description:String(item.system?.description ?? ""),
    used:Boolean(item.system?.session?.used),
    sourcePath:`items.${item.id}`
  }));
}

function atRgConditionEntries(source) {
  return atRgItemEntries(source, "condition", (item) => ({
    id:String(item.id || ""),
    uuid:String(item.uuid || ""),
    name:String(item.name || ""),
    active:Boolean(item.system?.active),
    rollModifier:Number(item.system?.rollModifier ?? 0),
    appliesTo:String(item.system?.appliesTo ?? ""),
    recoveryType:String(item.system?.recoveryType ?? ""),
    recoveryAbility:String(item.system?.recoveryAbility ?? ""),
    recoveryRole:String(item.system?.recoveryRole ?? ""),
    recoveryObstacle:Number(item.system?.recoveryObstacle ?? 0),
    description:String(item.system?.description ?? ""),
    sourcePath:`items.${item.id}`
  }));
}

function atRgDriveValue(source, field) {
  return atRgText(source?.system?.[field]);
}

function atRgBackground(source) {
  const system = source?.system || {};
  const fields = {
    concept:atRgText(system.concept),
    homeland:atRgText(system.homeland),
    lineage:atRgText(system.lineage),
    insignia:atRgText(system.insignia)
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value)));
}

function atRgSemanticRead({ source, semantic }) {
  if (String(source?.documentName || "") !== "Actor") return null;

  if (semantic === "drives") {
    const belief = atRgDriveValue(source, "belief");
    const goal = atRgDriveValue(source, "goal");
    const instinct = atRgDriveValue(source, "instinct");
    const data = Object.fromEntries(Object.entries({ belief, goal, instinct }).filter(([, value]) => Boolean(value)));
    if (!Object.keys(data).length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.belief | system.goal | system.instinct",
      writable:false,
      data
    };
  }

  if (semantic === "beliefs") {
    const value = atRgDriveValue(source, "belief");
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.belief",
      writable:false,
      data:value
    };
  }

  if (semantic === "goals") {
    const value = atRgDriveValue(source, "goal");
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.goal",
      writable:false,
      data:value
    };
  }

  if (semantic === "instincts") {
    const value = atRgDriveValue(source, "instinct");
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.instinct",
      writable:false,
      data:value
    };
  }

  if (semantic === "skills") {
    const data = atRgSkillEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"embedded Item[type=role]",
      writable:false,
      data
    };
  }

  if (semantic === "wises") {
    const data = atRgWiseEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"embedded Item[type=wise]",
      writable:false,
      data
    };
  }

  if (semantic === "talents") {
    const data = atRgTalentEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"embedded Item[type=talent]",
      writable:false,
      data
    };
  }

  if (semantic === "conditions") {
    const data = atRgConditionEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"embedded Item[type=condition]",
      writable:false,
      data
    };
  }

  if (semantic === "identity.ancestry") {
    const value = atRgText(source.system?.ancestry);
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.ancestry",
      writable:false,
      data:value
    };
  }

  if (semantic === "identity.class") {
    const value = atRgText(source.system?.rank);
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.rank",
      writable:false,
      data:value
    };
  }

  if (semantic === "identity.background") {
    const data = atRgBackground(source);
    if (!Object.keys(data).length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.concept | system.homeland | system.lineage | system.insignia",
      writable:false,
      data
    };
  }

  if (semantic === "identity.biography") {
    const value = atRgText(source.system?.biography);
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.biography",
      writable:false,
      data:value
    };
  }

  if (semantic === "relationships") {
    const data = atRgRelationshipEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"system.parents | system.seniorArtisan | system.mentor | system.friend | system.enemy",
      writable:false,
      data
    };
  }

  if (semantic === "traits") {
    const data = atRgTraitEntries(source);
    if (!data.length) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"source",
      sourcePath:"embedded Item[type=trait]",
      writable:false,
      data
    };
  }

  return null;
}

function atRgRegisterSemanticAdapter() {
  const registry = atRgSemanticRegistry();
  if (!registry?.register) return false;
  if (registry.list?.().includes(ATRG_SEMANTIC_ADAPTER_ID)) return true;

  registry.register({
    id:ATRG_SEMANTIC_ADAPTER_ID,
    label:"Realm Guard Semantic Reference",
    apiVersion:1,
    systemId:"realm-guard",
    priority:40,
    documentTypes:["Actor"],
    sourceTypes:["character","npc"],
    capabilities:["semanticRead"],
    semanticRead:atRgSemanticRead
  });

  return true;
}

if (!atRgRegisterSemanticAdapter()) {
  Hooks.once("ready", () => { atRgRegisterSemanticAdapter(); });
}

Hooks.on("adventurersTomeAdapterRegistered", () => {
  const registry = atRgSemanticRegistry();
  if (!registry?.list?.().includes(ATRG_SEMANTIC_ADAPTER_ID)) atRgRegisterSemanticAdapter();
});
