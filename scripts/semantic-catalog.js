export const AT_SEMANTIC_CATALOG_VERSION = 2;

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
