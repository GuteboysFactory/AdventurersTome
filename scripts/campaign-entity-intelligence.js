// A rebuildable viewer projection, never a second campaign truth store.
const ATEI_ID="adventurers-tome";
const atEiApi=()=>game.modules.get(ATEI_ID)?.api || {};
let atEiCache=null;
let atEiRevision=0;
let atEiBuilds=0;
let atEiEnricher=null;
const ATEI_CATEGORIES=Object.freeze({person:"People / Characters / Contacts",organization:"Organizations / Factions",location:"Locations",item:"Items",session:"Sessions",quest:"Quests",narrative:"Lore / Journals",scene:"Scenes",other:"Other"});
function atEiDocument(uuid) {
  const [kind,id,pageKind,pageId]=String(uuid || "").split(".");
  const parent=({Actor:game.actors,Item:game.items,JournalEntry:game.journal,Scene:game.scenes})[kind]?.get(id);
  const known=pageKind === "JournalEntryPage" ? parent?.pages?.get?.(pageId) || parent?.pages?.contents?.find(page=>page.id===pageId) || null : pageKind ? null : parent || null;
  if(known)return known;
  try {return typeof fromUuidSync === "function" ? fromUuidSync(String(uuid || "")) : null;}catch (_) {return null;}
}
function atEiVisible(doc) {
  if(!doc)return false;
  if(game.user?.isGM)return true;
  try {
    if(doc.parent && !atEiVisible(doc.parent))return false;
    const access=doc.getFlag?.(ATEI_ID,"access");
    return doc.testUserPermission?.(game.user,"OBSERVER") === true && access?.visibility !== "gm" && access?.discovered !== false
      && (!atEiApi().canView || atEiApi().canView(doc));
  } catch (_) {return false;}
}
function atEiVisibleAggregate(doc) {
  // Link flags have no per-page occurrence provenance. Private pages cannot
  // contribute an Appears in cause via either direction of a public link.
  return atEiVisible(doc) && (game.user?.isGM || !doc.pages?.contents?.some(page=>!atEiVisible(page)));
}
function atEiCanonical(uuid) {
  const value=String(uuid || "");
  const resolved=atEiApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:value})?.authorityUuid || value;
  return atEiVisible(atEiDocument(resolved)) ? resolved : value;
}
function atEiCategory(doc) {
  const meta=doc.getFlag?.(ATEI_ID,"semanticIdentity") || {};
  const declared=meta.entityCategory || doc.getFlag?.(ATEI_ID,"entityCategory");
  if(declared)return String(declared);
  const type=String(doc.getFlag?.(ATEI_ID,"type") || "").toLowerCase();
  const semantic=['session','sessions','quest','quests'].includes(type) ? type : String(doc.getFlag?.(ATEI_ID,"worldProfile")?.category || type).toLowerCase();
  const categories={character:"person",characters:"person",npc:"person",npcs:"person",contact:"person",contacts:"person",faction:"organization",factions:"organization",organization:"organization",organizations:"organization",location:"location",locations:"location",item:"item",items:"item",session:"session",sessions:"session",quest:"quest",quests:"quest",lore:"narrative",rule:"narrative",rules:"narrative"};
  const sourceKind=doc.documentName === "JournalEntry" ? atEiApi().campaignRelationshipEvidence?.sourceKind?.(doc) : "";
  return categories[semantic] || sourceKind || ({Actor:"person",Item:"item",JournalEntry:"narrative",JournalEntryPage:"narrative",Scene:"scene"})[doc.documentName] || "other";
}
function atEiEntity(uuid) {
  const canonicalUuid=atEiCanonical(uuid),doc=atEiDocument(canonicalUuid);
  if(!atEiVisible(doc))return null;
  return {uuid:canonicalUuid,name:doc.name,category:atEiCategory(doc),documentName:doc.documentName};
}
function atEiInvalidate(reason="api") {
  const token=globalThis.AdventurersTomeReviewDecision?.beginPhase("intelligence-invalidation");
  try {
  atEiRevision++;atEiCache=null;
  const safeReason=typeof reason === "string" && /^(?:adventurersTome\w+Updated|adventurersTomeCampaignEntityLinkChanged|(?:create|update|delete)(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|Folder|User))$/.test(reason) ? reason : "api";
  globalThis.AdventurersTomeStartup?.count("entity-intelligence",`invalidations.${safeReason}`);
  } finally {globalThis.AdventurersTomeReviewDecision?.endPhase(token);}
}
function atEiIndex() {
  const atStartupToken = globalThis.AdventurersTomeStartup?.begin("entity-intelligence");
  try {
  const viewer=`${game.user?.id}|${Boolean(game.user?.isGM)}|${atEiRevision}`;
  if(atEiCache?.viewer===viewer){globalThis.AdventurersTomeStartup?.count("entity-intelligence","cacheHits");return atEiCache;}
  globalThis.AdventurersTomeStartup?.count("entity-intelligence","indexBuilds");
  const index={viewer,relations:new Map(),links:new Map(),appearances:new Map()};
  const insert=(map,key,value,id)=>{if(!map.has(key))map.set(key,new Map());map.get(key).set(id,value);};
  for(const edge of atEiApi().campaignRelationshipEvidence?.graph?.() || []) {
    const subject=atEiEntity(edge.subjectUuid),object=atEiEntity(edge.objectUuid);
    if(!subject || !object)continue;
    // Second boundary also protects optional/custom graph providers.
    const history=edge.history.filter(row=>game.user?.isGM || row.visibility !== "gm" && atEiVisible(atEiDocument(row.sourcePageUuid || row.sourceUuid)));
    if(!history.length || history.length !== edge.history.length || edge.state === "rejected")continue;
    for(const [entity,other,reverse] of [[subject,object,false],[object,subject,true]]) {
      const row={...edge,...(reverse ? edge.inverse : {}),otherUuid:other.uuid,name:other.name,category:other.category,reverse,
        active:edge.state === "current" && edge.polarity !== "negative",evidenceCount:history.length,
        history:history.map(evidence=>({...evidence,...(reverse ? evidence.inverse : {}),sourceName:atEiDocument(evidence.sourceUuid)?.name || evidence.sourceName,
          sourceMissing:!atEiDocument(evidence.sourcePageUuid || evidence.sourceUuid),provenanceLabel:typeof evidence.provenance === "string" ? evidence.provenance : evidence.providerId || evidence.extractor || "Source evidence"}))};
      row.latest=row.history.reduce((a,b)=>Number(b.chronology?.sessionNumber || b.lastSeenAt || 0)>Number(a.chronology?.sessionNumber || a.lastSeenAt || 0) ? b : a);
      insert(index.relations,entity.uuid,row,`${entity.uuid}|${edge.id}`);
      for(const evidence of history) {
        const source=atEiEntity(evidence.sourceUuid);
        if(!source || source.uuid===entity.uuid)continue;
        insert(index.appearances,entity.uuid,source,source.uuid);
        insert(index.links,source.uuid,entity,entity.uuid);
      }
    }
  }
  // One visible-document pass per invalidation, bidirectional UUID adjacency.
  const collections=new Set([game.actors,game.items,game.journal,game.scenes,...(game.collections?.values?.() || [])]);
  globalThis.AdventurersTomeStartup?.count("visible-document-pass","passes");
  const visiblePassToken=globalThis.AdventurersTomeStartup?.begin("visible-document-pass");
  try {
  for(const collection of collections)for(const doc of collection?.contents || []) {
    globalThis.AdventurersTomeStartup?.count("visible-document-pass","documentsScanned");
    if(!atEiVisible(doc))continue;
    // Flags lack per-page provenance. Mixed/private-page journals cannot make
    // their aggregate links public; visible relationship evidence still projects.
    if(!atEiVisibleAggregate(doc))continue;
    const from=atEiEntity(doc.uuid);if(!from)continue;
    const canonical=doc.getFlag?.(ATEI_ID,"campaignEntityLinksV1") || {};
    const legacy=doc.getFlag?.(ATEI_ID,"links") || {};
    const array=value=>Array.isArray(value) ? value : [];
    const targets=[...array(canonical.actorUuids),...array(canonical.entityUuids),
      ...array(legacy.actors).map(id=>`Actor.${id}`),...['sessions','quests','world','rules'].flatMap(key=>array(legacy[key]).map(id=>`JournalEntry.${id}`))];
    for(const uuid of new Set(targets)) {
      const to=atEiEntity(uuid);if(!to || to.uuid===from.uuid)continue;
      insert(index.links,from.uuid,to,to.uuid);insert(index.links,to.uuid,from,from.uuid);
      if(['session','quest','narrative'].includes(from.category) && atEiVisibleAggregate(atEiDocument(from.uuid)))insert(index.appearances,to.uuid,from,from.uuid);
      if(['session','quest','narrative'].includes(to.category) && atEiVisibleAggregate(atEiDocument(to.uuid)))insert(index.appearances,from.uuid,to,to.uuid);
    }
  }
  } finally {globalThis.AdventurersTomeStartup?.end(visiblePassToken);}
  atEiBuilds++;atEiCache=index;return index;
  } finally { globalThis.AdventurersTomeStartup?.end(atStartupToken); }
}
function atEiGroups(rows) {
  const groups=new Map();
  for(const row of rows){if(!groups.has(row.category))groups.set(row.category,[]);groups.get(row.category).push(row);}
  return [...groups].map(([category,entries])=>({category,label:ATEI_CATEGORIES[category] || "Other",entries:entries.sort((a,b)=>a.name.localeCompare(b.name))}));
}
function atEiContext(related,links,appearances) {
  // Inputs are already canonical and viewer-visible. Preserve each cause while
  // assigning one presentation slot per UUID across the composed Context panel.
  const rows=new Map(),labels={APPEARS_IN:"Appears in",RELATIONSHIP:"Canonical relationship",CAMPAIGN_LINK:"Campaign link / Related"};
  for(const [reason,entities] of [["APPEARS_IN",appearances],["RELATIONSHIP",related],["CAMPAIGN_LINK",links]])for(const entity of entities) {
    if(!rows.has(entity.uuid))rows.set(entity.uuid,{...entity,reasons:[]});
    const row=rows.get(entity.uuid);
    if(!row.reasons.includes(reason))row.reasons.push(reason);
  }
  const entries=[...rows.values()].map(row=>({...row,reasonLabels:row.reasons.map(reason=>labels[reason]),
    appearedIn:row.reasons.includes("APPEARS_IN"),campaignLinked:row.reasons.includes("CAMPAIGN_LINK"),relationshipRelated:row.reasons.includes("RELATIONSHIP")}));
  return {rows:entries,count:entries.length,navigationGroups:atEiGroups(entries.filter(row=>!row.appearedIn)),appearanceGroups:atEiGroups(entries.filter(row=>row.appearedIn)),
    relatedGroups:atEiGroups(entries.filter(row=>!row.appearedIn && row.relationshipRelated)),
    linkGroups:atEiGroups(entries.filter(row=>!row.appearedIn && !row.relationshipRelated))};
}
function atEiProfile(uuid) {
  const entity=atEiEntity(uuid);
  if(!entity)return {available:false,relationships:[],connectionGroups:[],relatedGroups:[],linkGroups:[],appearanceGroups:[],context:atEiContext([],[],[])};
  const index=atEiIndex(),relationships=[...(index.relations.get(entity.uuid)?.values() || [])];
  const bucket=row=>row.active ? "current" : row.state === "historical" ? "historical" : row.state === "negative" ? "negated" : "uncertain";
  const labels={current:"Current connections",historical:"Historical connections",uncertain:"Possible / uncertain connections",negated:"Denied / negated connections"};
  const connectionGroups=Object.entries(labels).map(([key,label])=>({key,label,entries:relationships.filter(row=>bucket(row)===key)})).filter(group=>group.entries.length);
  // Profile rows and contextual navigation share the already viewer-scoped graph.
  // Navigation deduplicates targets; distinct predicates/evidence stay in Relationships.
  const related=[...new Map(relationships.map(row=>[row.otherUuid,{uuid:row.otherUuid,name:row.name,category:row.category}])).values()];
  const links=[...(index.links.get(entity.uuid)?.values() || [])],appearances=[...(index.appearances.get(entity.uuid)?.values() || [])];
  let enrichment=null;
  // Enrichment receives only a detached viewer-safe projection and cannot alter truth.
  try {
    const result=atEiEnricher?.(foundry.utils.deepClone({entity,relationships,links}));
    if(result?.then)result.catch?.(()=>{});
    else if(result && typeof result.label === "string")enrichment={label:result.label.slice(0,120)};
  } catch (_) { /* Optional presentation must never break Core. */ }
  return foundry.utils.deepClone({available:true,entity,relationships,connectionGroups,relatedGroups:atEiGroups(related),linkGroups:atEiGroups(links),appearanceGroups:atEiGroups(appearances),context:atEiContext(related,links,appearances),enrichment,
    relationshipCount:relationships.length,hasContext:Boolean(relationships.length || links.length || appearances.length)});
}
function atEiResolve(uuid) {
  const entity=atEiEntity(uuid);return entity ? {status:"ready",uuid:entity.uuid,document:atEiDocument(entity.uuid)} : {status:game.user?.isGM && !atEiDocument(uuid) ? "missing" : "unavailable"};
}
async function atEiOpen(uuid,app,{pageUuid=""}={}) {
  const navigationBefore=app?._captureNavigationState?.(),historyLength=app?._navigationHistory?.length;
  try {
  const resolved=atEiResolve(uuid);
  if(resolved.status!=="ready")return resolved;
  const doc=resolved.document;
  if(pageUuid) {
    const page=atEiDocument(pageUuid);
    if(!page || page.parent?.uuid!==doc.uuid)return {status:game.user?.isGM ? "missing" : "unavailable"};
    if(!atEiVisible(page))return {status:"unavailable"};
    if(!doc.sheet?.render)return {status:"unavailable"};
    await doc.sheet.render(true,{pageId:page.id});return {status:"opened",uuid:page.uuid};
  }
  const category=atEiCategory(doc),journalType=['rule','rules'].includes(doc.getFlag?.(ATEI_ID,"type")) ? "rule" : ({session:"session",quest:"quest"})[category] || "world";
  const ref=doc.documentName === "Actor" ? `actor:${doc.id}` : doc.documentName === "JournalEntry" ? `${journalType}:${doc.id}` : null;
  if(ref && app?._openRefKey) {
    const before=app._captureNavigationState?.();
    app._pushNavigationState?.();
    if(await app._openRefKey(ref))return {status:"opened",uuid:resolved.uuid};
    if(before)app._restoreNavigationState?.(before);
    app._navigationHistory?.pop();
  }
  if(app?.render) {
    app._pushNavigationState?.();app.activeContextUuid=resolved.uuid;app.activeTab="entityContext";
    await app.render({parts:["main"]});return {status:"opened",uuid:resolved.uuid};
  }
  if(doc.sheet?.render){await doc.sheet.render(true);return {status:"opened",uuid:resolved.uuid};}
  return {status:"unavailable"};
  } catch (_) {
    if(navigationBefore)app?._restoreNavigationState?.(navigationBefore);
    if(Number.isInteger(historyLength))app._navigationHistory.length=historyLength;
    return {status:"unavailable"};
  }
}
const ATEI_API=Object.freeze({version:1,profile:atEiProfile,resolve:atEiResolve,open:atEiOpen,invalidate:atEiInvalidate,
  registerEnricher:fn=>{atEiEnricher=typeof fn === "function" ? fn : null;},diagnostics:()=>({builds:atEiBuilds,revision:atEiRevision})});
Hooks.once("ready",()=>{const module=game.modules.get(ATEI_ID);module.api ||= {};module.api.entityIntelligence=ATEI_API;});
for(const event of ['adventurersTomeRelationshipEvidenceUpdated','adventurersTomeCampaignMentionEvidenceUpdated','adventurersTomeCampaignDiscoveryUpdated',
  'adventurersTomeCampaignEntityLinkChanged','adventurersTomeCampaignLearningUpdated',
  'createActor','updateActor','deleteActor','createItem','updateItem','deleteItem','createJournalEntry','updateJournalEntry','deleteJournalEntry',
  'createJournalEntryPage','updateJournalEntryPage','deleteJournalEntryPage','createScene','updateScene','deleteScene','updateFolder','updateUser'])Hooks.on(event,()=>atEiInvalidate(event));
// Recent navigation/window preferences are not campaign truth. Do not rebuild
// the world index on each _openRefKey/recordRecentRef or window-state write.
Hooks.on('updateSetting',setting=>{if(setting?.key === `${ATEI_ID}.campaignRelationshipEvidenceV1`)atEiInvalidate();});
