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
