const ATRG_SEMANTIC_ADAPTER_ID = "realm-guard-semantic-reference";

function atRgSemanticRegistry() {
  const early = globalThis.AdventurersTomeSystemAdapters;
  if (early?.register) return early;
  return globalThis.game?.modules?.get?.("adventurers-tome")?.api?.adapters || null;
}

function atRgText(value) {
  return String(value ?? "").trim();
}

function atRgNpcSchema() {
  return {
    contract:"adventurers-tome-npc-schema",
    version:1,
    systemId:"realm-guard",
    actorType:"npc",
    label:"Realm Guard NPC",
    fields:[
      { id:"concept", label:"Concept", path:"system.concept", type:"string", default:"", required:false, order:10 },
      { id:"rank", label:"Rank", path:"system.rank", type:"string", default:"", required:false, order:20 },
      { id:"homeland", label:"Homeland", path:"system.homeland", type:"string", default:"", required:false, order:30 },
      { id:"ancestry", label:"Ancestry", path:"system.ancestry", type:"string", default:"", required:false, order:40 },
      { id:"biography", label:"Biography", path:"system.biography", type:"html", default:"", required:false, order:50 },
      { id:"notes", label:"Notes", path:"system.notes", type:"html", default:"", required:false, order:60 }
    ],
    defaults:{
      img:"systems/realm-guard/assets/actors/npc-creature.webp"
    }
  };
}

function atRgRelationshipEntries(source) {
  const m8 = globalThis.game?.realmGuard?.core?.m8;
  const snapshot = String(source?.type || "") === "character"
    ? m8?.social?.snapshot?.(source)
    : null;

  if (snapshot) {
    const people = new Map(Array.from(snapshot.people || []).map((person) => [String(person?.id || ""), person]));
    return Array.from(snapshot.relationships || [])
      .map((relationship) => {
        const person = people.get(String(relationship?.personId || ""));
        if (!person) return null;
        return {
          id:String(relationship?.id || ""),
          kind:atRgRelationshipRole(relationship?.role),
          label:atRgText(relationship?.role).replaceAll("_", " "),
          value:atRgText(person?.name),
          name:atRgText(person?.name),
          personId:String(person?.id || ""),
          actorUuid:atRgText(person?.actorUuid),
          profession:atRgText(person?.profession),
          culture:atRgText(person?.people),
          location:atRgText(person?.location),
          status:atRgText(relationship?.status).toLowerCase(),
          origin:atRgText(relationship?.origin).toLowerCase(),
          history:Array.from(relationship?.history || []).map((entry) => ({
            id:String(entry?.id || ""),
            from:atRgText(entry?.from).toLowerCase(),
            to:atRgText(entry?.to).toLowerCase(),
            reason:atRgText(entry?.reason),
            sessionId:atRgText(entry?.sessionId),
            timestamp:atRgText(entry?.timestamp),
            source:atRgText(entry?.source).toLowerCase()
          })),
          sourcePath:"game.realmGuard.core.m8.social.snapshot"
        };
      })
      .filter(Boolean);
  }

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

  if (semantic === "notes.private") {
    const value = atRgText(source.system?.notes);
    if (!value) return null;
    return {
      semantic,
      status:"resolved",
      authority:"system",
      confidence:1,
      visibility:"owner-only",
      revealState:"private",
      sourcePath:"system.notes",
      writable:false,
      data:value
    };
  }

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
      sourcePath:data.some((entry) => entry.sourcePath === "game.realmGuard.core.m8.social.snapshot")
        ? "game.realmGuard.core.m8.social.snapshot"
        : "system.parents | system.seniorArtisan | system.mentor | system.friend | system.enemy",
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

function atRgRelationshipRole(role) {
  const value = atRgText(role).toLowerCase().replaceAll("_", "-");
  const map = {
    parent:"parent",
    "senior-artisan":"artisan",
    mentor:"mentor",
    friend:"friend",
    enemy:"enemy",
    contact:"contact",
    other:"other"
  };
  return map[value] || value || "other";
}

function atRgEntityDiscovery({ source, user }) {
  if (String(source?.documentName || "") !== "Actor" || String(source?.type || "") !== "character") return null;
  if (!user) return null;
  if (!user.isGM && !source?.testUserPermission?.(user, "OBSERVER")) return null;

  const m8 = globalThis.game?.realmGuard?.core?.m8;
  const snapshot = m8?.social?.snapshot?.(source);
  if (!snapshot) return null;

  const people = Array.from(snapshot.people || []);
  const relationships = Array.from(snapshot.relationships || []);
  const peopleById = new Map(people.map((person) => [String(person?.id || ""), person]));

  const entities = people
    .filter((person) => atRgText(person?.name))
    .map((person) => ({
      key:`realm-guard:person:${String(source.uuid || source.id || "")}:${String(person.id || "")}`,
      kind:"person",
      name:atRgText(person.name),
      canonicalUuid:atRgText(person.actorUuid),
      visibility:"source",
      authority:"system",
      representation:{
        mode:atRgText(person.actorUuid) ? "canonical-document" : "semantic-only",
        materialization:"optional",
        preferredDocumentType:"Actor"
      },
      attributes:{
        profession:atRgText(person.profession),
        culture:atRgText(person.people),
        location:atRgText(person.location)
      },
      system:{
        id:String(person.id || ""),
        sourceActorUuid:String(source.uuid || ""),
        model:"realm-guard-m8-social-network",
        schemaVersion:Number(snapshot.schemaVersion || 0),
        migrationVersion:atRgText(snapshot.migrationVersion)
      }
    }));

  const edges = relationships
    .map((relationship) => {
      const person = peopleById.get(String(relationship?.personId || ""));
      if (!person) return null;
      const personKey = `realm-guard:person:${String(source.uuid || source.id || "")}:${String(person.id || "")}`;
      return {
        key:`realm-guard:relationship:${String(source.uuid || source.id || "")}:${String(relationship.id || "")}`,
        kind:"relationship",
        from:{
          canonicalUuid:String(source.uuid || ""),
          entityKey:`foundry:${String(source.uuid || "")}`
        },
        to:{
          canonicalUuid:atRgText(person.actorUuid),
          entityKey:personKey
        },
        role:atRgRelationshipRole(relationship.role),
        status:atRgText(relationship.status).toLowerCase(),
        origin:atRgText(relationship.origin).toLowerCase(),
        visibility:"source",
        authority:"system",
        attributes:{
          capabilities:Array.from(relationship.capabilities || []).map(atRgText).filter(Boolean),
          effects:Array.from(relationship.effects || []),
          history:Array.from(relationship.history || []).map((entry) => ({
            id:String(entry?.id || ""),
            from:atRgText(entry?.from).toLowerCase(),
            to:atRgText(entry?.to).toLowerCase(),
            reason:atRgText(entry?.reason),
            sessionId:atRgText(entry?.sessionId),
            timestamp:atRgText(entry?.timestamp),
            source:atRgText(entry?.source).toLowerCase()
          }))
        },
        system:{
          id:String(relationship.id || ""),
          personId:String(relationship.personId || ""),
          model:"realm-guard-m8-social-network",
          gameplayAuthority:atRgText(snapshot?.metadata?.gameplayAuthority || "LEGACY_MIXED")
        }
      };
    })
    .filter(Boolean);

  return {
    provider:ATRG_SEMANTIC_ADAPTER_ID,
    authority:"system",
    visibility:"source",
    sourceUuid:String(source.uuid || ""),
    sourcePath:"game.realmGuard.core.m8.social.snapshot",
    entities,
    relationships:edges,
    metadata:{
      systemId:"realm-guard",
      model:"M8 Social Network",
      schemaVersion:Number(snapshot.schemaVersion || 0),
      migrationVersion:atRgText(snapshot.migrationVersion),
      gameplayAuthority:atRgText(snapshot?.metadata?.gameplayAuthority || "LEGACY_MIXED")
    }
  };
}

function atRgSemanticWritePlan({ source, semantic, proposedValue, user }) {
  if (String(source?.documentName || "") !== "Actor") return null;

  const fields = {
    "identity.ancestry":"system.ancestry",
    "identity.class":"system.rank",
    "identity.biography":"system.biography",
    beliefs:"system.belief",
    goals:"system.goal",
    instincts:"system.instinct"
  };

  if (semantic === "notes.private") {
    return {
      semantic,
      allowed:Boolean(user?.isGM || source?.testUserPermission?.(user, "OWNER")),
      authority:"system",
      visibility:"owner-only",
      revealState:"private",
      permission:"OWNER",
      operation:"update",
      targetUuid:String(source?.uuid || ""),
      targetPath:"system.notes",
      sourcePath:"system.notes",
      currentValue:atRgText(source.system?.notes),
      proposedValue,
      conflict:false
    };
  }

  const targetPath = fields[semantic];
  if (!targetPath) return null;

  const currentValue = targetPath.split(".").slice(1).reduce((value, key) => value?.[key], source.system);
  return {
    semantic,
    allowed:Boolean(user?.isGM || source?.testUserPermission?.(user, "OWNER")),
    authority:"system",
    visibility:"source",
    permission:"OWNER",
    operation:"update",
    targetUuid:String(source?.uuid || ""),
    targetPath,
    sourcePath:targetPath,
    currentValue:currentValue ?? "",
    proposedValue,
    conflict:false
  };
}

async function atRgSemanticWriteApply({ source, semantic, proposedValue, plan, user }) {
  if (String(source?.documentName || "") !== "Actor") return null;
  if (!(user?.isGM || source?.testUserPermission?.(user, "OWNER"))) {
    throw new Error("Permission denied for Realm Guard semantic write.");
  }

  const fields = {
    "identity.ancestry":"system.ancestry",
    "identity.class":"system.rank",
    "identity.biography":"system.biography",
    beliefs:"system.belief",
    goals:"system.goal",
    instincts:"system.instinct",
    "notes.private":"system.notes"
  };

  const targetPath = fields[semantic];
  if (!targetPath) return null;
  if (String(plan?.targetPath || "") !== targetPath) {
    throw new Error(`Semantic write target mismatch for ${semantic}.`);
  }

  await source.update(
    { [targetPath]:proposedValue },
    {
      render:false,
      adventurersTomeSemanticWrite:true,
      adventurersTomeSemantic:semantic
    }
  );

  const currentValue = targetPath.split(".").slice(1).reduce((value, key) => value?.[key], source.system);
  return {
    semantic,
    applied:true,
    authority:"system",
    targetUuid:String(source.uuid || ""),
    targetPath,
    value:currentValue ?? ""
  };
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
    capabilities:["npcSchema","semanticRead","semanticWritePlan","semanticWriteApply","entityDiscovery"],
    npcSchema:atRgNpcSchema,
    semanticRead:atRgSemanticRead,
    semanticWritePlan:atRgSemanticWritePlan,
    semanticWriteApply:atRgSemanticWriteApply,
    entityDiscovery:atRgEntityDiscovery
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
