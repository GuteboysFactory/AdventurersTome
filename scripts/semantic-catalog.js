export const AT_SEMANTIC_CATALOG_VERSION = 3;

export const AT_SEMANTIC_CATALOG = Object.freeze({
  identity:Object.freeze({
    id:"identity",
    label:"Identity",
    aliases:Object.freeze(["identity","profile","character"]),
    resolution:"single",
    children:Object.freeze([
      "identity.name",
      "identity.type",
      "identity.ancestry",
      "identity.class",
      "identity.background",
      "identity.biography"
    ])
  }),
  "identity.name":Object.freeze({
    id:"identity.name",
    label:"Name",
    aliases:Object.freeze(["name"]),
    resolution:"single"
  }),
  "identity.type":Object.freeze({
    id:"identity.type",
    label:"Type",
    aliases:Object.freeze(["type","actorType","kind"]),
    resolution:"single"
  }),
  "identity.ancestry":Object.freeze({
    id:"identity.ancestry",
    label:"Ancestry",
    aliases:Object.freeze(["ancestry","race","species","heritage","kin","people"]),
    resolution:"single"
  }),
  "identity.class":Object.freeze({
    id:"identity.class",
    label:"Class / Career",
    aliases:Object.freeze(["class","career","profession","archetype","calling","role"]),
    resolution:"single"
  }),
  "identity.background":Object.freeze({
    id:"identity.background",
    label:"Background",
    aliases:Object.freeze(["background","origin","culture","upbringing"]),
    resolution:"single"
  }),
  "identity.biography":Object.freeze({
    id:"identity.biography",
    label:"Biography",
    aliases:Object.freeze(["biography","bio","history","backstory"]),
    resolution:"single"
  }),
  drives:Object.freeze({
    id:"drives",
    label:"Drives",
    aliases:Object.freeze(["drives","motivations","beliefs-goals-instincts"]),
    resolution:"single",
    children:Object.freeze(["beliefs","goals","instincts"])
  }),
  beliefs:Object.freeze({
    id:"beliefs",
    label:"Beliefs",
    aliases:Object.freeze(["beliefs","belief","ideals","convictions","principles"]),
    resolution:"single"
  }),
  goals:Object.freeze({
    id:"goals",
    label:"Goals",
    aliases:Object.freeze(["goals","goal","objectives","ambitions","agenda"]),
    resolution:"single"
  }),
  instincts:Object.freeze({
    id:"instincts",
    label:"Instincts",
    aliases:Object.freeze(["instincts","instinct","impulses","reflexes"]),
    resolution:"single"
  }),
  skills:Object.freeze({
    id:"skills",
    label:"Skills",
    aliases:Object.freeze(["skills","roles","abilities","proficiencies"]),
    resolution:"merge"
  }),
  wises:Object.freeze({
    id:"wises",
    label:"Wises",
    aliases:Object.freeze(["wises","knowledges","lore","lores"]),
    resolution:"merge"
  }),
  talents:Object.freeze({
    id:"talents",
    label:"Talents",
    aliases:Object.freeze(["talents","feats","perks","edges","features"]),
    resolution:"merge"
  }),
  conditions:Object.freeze({
    id:"conditions",
    label:"Conditions",
    aliases:Object.freeze(["conditions","states","afflictions","injuries"]),
    resolution:"merge"
  }),
  relationships:Object.freeze({
    id:"relationships",
    label:"Relationships",
    aliases:Object.freeze(["relationships","relations","contacts","allies","enemies","rivals","bonds","connections"]),
    resolution:"merge"
  }),
  traits:Object.freeze({
    id:"traits",
    label:"Traits",
    aliases:Object.freeze(["traits","qualities","aspects","distinctions"]),
    resolution:"merge"
  })
});

export function semanticCatalogEntry(id) {
  return AT_SEMANTIC_CATALOG[String(id || "").trim()] || null;
}

export function semanticCatalogSnapshot() {
  return Object.values(AT_SEMANTIC_CATALOG).map((entry) => ({
    id:entry.id,
    label:entry.label,
    aliases:[...(entry.aliases || [])],
    children:[...(entry.children || [])],
    resolution:String(entry.resolution || "single")
  }));
}
