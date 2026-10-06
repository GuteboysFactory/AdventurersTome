const ATRE_ID = "adventurers-tome";
const ATRE_SETTING = "campaignRelationshipEvidenceV1";
const ATRE_TYPES = Object.freeze({
  FRIEND_OF:["Friend","Friend"], ACQUAINTANCE_OF:["Acquaintance","Acquaintance"],
  QUARTERMASTER_OF:["Quartermaster","Quartermaster"], COMMANDER_OF:["Commander","Commander"],
  KEEPER_OF:["Keeper","Keeper"], MEMBER_OF:["Member","Member"],
  INFORMANT_FOR:["Informant","Informant"], WORKS_FOR:["Works for","Worked for by"],
  OPERATES_FROM:["Operates from","Base for"], KNOWS:["Knows","Known by"],
  OWES_FAVOUR_TO:["Owes a favour","Owed a favour by"], TRUSTS:["Trusts","Trusted by"],
  SERVES:["Serves","Served by"], MET:["Met","Met"], SPEAKS_WITH:["Speaks with","Speaks with"],
  INFORMATION_PROVIDER:["Provides information","Receives information"]
});
// Semantic registry is independent of extractor vocabulary and campaign data.
const ATRE_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(ATRE_TYPES).map(([type,labels])=>[type,{
  label:labels[0],inverseLabel:labels[1],
  negativeLabel:type === "MEMBER_OF" ? "Not a member" : `Not: ${labels[0].toLowerCase()}`,
  inverseNegativeLabel:type === "MEMBER_OF" ? "Not a member" : `Not: ${labels[1].toLowerCase()}`,
  symmetric:["FRIEND_OF","ACQUAINTANCE_OF","MET","SPEAKS_WITH"].includes(type)
}])));
function atReNormalize(input) {
  const row={...input};
  row.relationType=row.relationType || row.predicate;
  row.polarity=["positive","negative"].includes(row.polarity) ? row.polarity : ["negated","ended"].includes(row.status) ? "negative" : "positive";
  row.certainty=["asserted","possible","rumoured","disputed","unknown"].includes(row.certainty) ? row.certainty : row.status === "possible" ? "possible" : ["asserted","negated","ended"].includes(row.status) ? "asserted" : "unknown";
  row.temporalScope=["current","historical","unknown"].includes(row.temporalScope) ? row.temporalScope : "unknown";
  row.changeSemantics=row.changeSemantics || (row.status === "ended" ? "no_longer" : null);
  if(row.changeSemantics === "no_longer")row.polarity="negative";
  const endpoints=[row.subjectUuid,row.objectUuid];
  if(ATRE_REGISTRY[row.relationType]?.symmetric)endpoints.sort();
  row.identityKey=[endpoints[0],row.relationType,endpoints[1]].join("|");
  row.visibility=row.visibility || "source-bounded";
  return row;
}
let atReBusy = null;
let atReTimer = null;
let atReWrites = Promise.resolve();
function atReWrite(work) {
  const write=atReWrites.then(work);
  atReWrites=write.catch(()=>{});
  return write;
}
const atReClean = value => String(value ?? "").trim();
const atReNorm = value => atReClean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const atReClone = value => foundry.utils.deepClone(value);
const atReApi = () => game.modules.get(ATRE_ID)?.api || {};
function atReHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash,16777619); }
  return (hash >>> 0).toString(36);
}
function atReDocument(uuid) {
  const [kind,id] = atReClean(uuid).split(".");
  return (kind === "Actor" ? game.actors : kind === "Item" ? game.items : kind === "JournalEntry" ? game.journal : null)?.get(id) || null;
}
function atReCanRead(document, user = game.user) {
  if (!document) return false;
  if (user?.isGM) return true;
  try {
    const page = document.documentName === "JournalEntryPage" || document.uuid?.includes(".JournalEntryPage.");
    if(page && !atReCanRead(document.parent,user))return false;
    if(document.testUserPermission?.(user,"OBSERVER") !== true)return false;
    const access=document.getFlag?.(ATRE_ID,"access");
    if(access?.visibility === "gm" || access?.discovered === false)return false;
    if(!page && atReApi().canView && !atReApi().canView(document))return false;
    return true;
  } catch (_) { return false; }
}
function atRePlain(html) {
  const element = document.createElement("div");
  element.innerHTML = String(html || "").replace(/<\/(?:p|div|h\d)>|<br\s*\/?\s*>/gi,"\n");
  return String(element.textContent || "").replace(/\r/g, "");
}
function atReSourceKind(entry) {
  const type = atReNorm(entry.getFlag?.(ATRE_ID,"type"));
  if (["session","quest"].includes(type)) return type;
  const seen=new Set();
  for(let folder=entry.folder;folder && typeof folder === "object" && !seen.has(folder.id);folder=typeof folder.folder === "object" ? folder.folder : game.folders?.get(folder.folder)) {
    seen.add(folder.id);
    const name=atReNorm(folder.name);
    if(name === "sessions")return "session";
    if(name === "quests")return "quest";
  }
  return "";
}
function atReChronology(entry, kind) {
  const flag = entry.getFlag?.(ATRE_ID,"sessionNumber");
  const nameNumber = entry.name?.match(/\bsession\s*0*(\d+)\b/i)?.[1];
  const ordinal = kind === "session" && Number(flag || nameNumber) > 0 ? Number(flag || nameNumber) : null;
  // Sort is presentation order, retained as provenance, never invented narrative time.
  return {sessionNumber:ordinal, sourceSort:Number(entry.sort || 0)};
}
function atReLedger(normalize=true) {
  if (!game.user?.isGM) return {evidence:[],decisions:[]};
  try {
    const raw = JSON.parse(game.settings.get(ATRE_ID,ATRE_SETTING) || "{}");
    return {evidence:Array.isArray(raw.evidence) ? (normalize ? raw.evidence.map(atReNormalize) : raw.evidence) : [],decisions:Array.isArray(raw.decisions) ? raw.decisions : []};
  } catch (_) { return {evidence:[],decisions:[]}; }
}
function atReEntityIndex(sourceUuid) {
  const aliases = new Map();
  const source=atReDocument(sourceUuid);
  const canonicalLinks=source?.getFlag?.(ATRE_ID,"campaignEntityLinksV1") || {};
  const legacyLinks=source?.getFlag?.(ATRE_ID,"links") || {};
  const sourceAuthorities=new Set([
    ...(canonicalLinks.actorUuids || []),...(canonicalLinks.entityUuids || []),
    ...(legacyLinks.actors || []).map(id=>`Actor.${id}`),...(legacyLinks.world || []).map(id=>`JournalEntry.${id}`)
  ].map(uuid=>atReApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:uuid})?.authorityUuid || uuid));
  const add = (name, uuid) => {
    const canonical = atReApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:uuid})?.authorityUuid || uuid;
    if (!atReCanRead(atReDocument(canonical))) return;
    // A public namesake cannot substitute for a hidden source-selected person.
    // Players require this source's existing canonical links, not a new global
    // identity inference from the subset of names they are allowed to see.
    if (!game.user?.isGM && !sourceAuthorities.has(canonical))return;
    const key = atReNorm(name).replace(/^the /u, "");
    if (!key) return;
    if (!aliases.has(key)) aliases.set(key,new Set());
    aliases.get(key).add(canonical);
  };
  for (const doc of [...(game.actors?.contents || []),...(game.items?.contents || []),...(game.journal?.contents || [])]) {
    if (!atReCanRead(doc) || atReSourceKind(doc) || (doc.documentName === "JournalEntry" && !doc.getFlag?.(ATRE_ID,"worldProfile") && !doc.getFlag?.(ATRE_ID,"backendProjectionV1"))) continue;
    add(doc.name,doc.uuid);
    const profile = doc.getFlag?.(ATRE_ID,doc.documentName === "Actor" ? "actorProfile" : "worldProfile") || {};
    if (game.user?.isGM) for (const alias of Array.isArray(profile.aliases) ? profile.aliases : []) add(alias,doc.uuid);
  }
  // Source-specific resolved mentions supersede global namesake ambiguity.
  if (game.user?.isGM) {
    for (const row of atReApi().campaignMentionEvidence?.recordsForSource?.(sourceUuid) || []) {
      if (row.active === false || !["LINKED","CREATED"].includes(row.outcome) || !row.targetUuid) continue;
      const uuid = atReApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:row.targetUuid})?.authorityUuid || row.targetUuid;
      if (atReCanRead(atReDocument(uuid))) aliases.set(atReNorm(row.mentionText),new Set([uuid]));
    }
  }
  return aliases;
}
// English-provider helpers only: the state engine consumes their normalized output.
function atReEnglishClause(sentence,predicateStart,objectEnd,hits) {
  const boundaries=[...sentence.matchAll(/\b(?:and|but|whereas|while)\b|;/gi)]
    .filter(hit=>!hits.some(entity=>hit.index>=entity.index && hit.index<entity.index+entity[0].length));
  const preceding=boundaries.filter(hit=>hit.index<predicateStart).at(-1);
  const following=boundaries.find(hit=>hit.index>=objectEnd);
  let start=preceding ? preceding.index+preceding[0].length : 0;
  let end=following ? following.index : sentence.length;
  start+=sentence.slice(start,end).match(/^\s*/)[0].length;
  end-=sentence.slice(start,end).match(/\s*$/)[0].length;
  let prefix=sentence.slice(start,predicateStart);
  for(const entity of hits.filter(hit=>hit.index>=start && hit.index+hit[0].length<=predicateStart)) {
    const offset=entity.index-start;
    prefix=prefix.slice(0,offset)+" ".repeat(entity[0].length)+prefix.slice(offset+entity[0].length);
  }
  return {start,end,text:sentence.slice(start,end),prefix,suffix:sentence.slice(objectEnd,end)};
}
function atReEnglishTemporal(type,predicate,clause,ended) {
  const prefix=clause.prefix.replace(/^.*\b(?:claimed|said|reported)\s+that\s+/i,"");
  const current=/\b(?:still|currently|presently|now|remains?|continues?(?:\s+to)?)\b/i.test(prefix);
  const historical=/\b(?:formerly|previously|once|used to|before that|former|was|were|had)\b/i.test(prefix)
    || /\b(?:in the past|years ago|(?:from|during)\s+(?:an?\s+)?earlier\s+(?:journey|expedition))\b/i.test(clause.suffix)
    || /\b(?:worked|operated|knew|trusted|owed|supplied|provided|served|commanded|met|recognized|recognised)\b/i.test(predicate);
  const encounter=type === "MET" || type === "KNOWS" && /recogn(?:iz|is)ed/i.test(predicate);
  return {temporalScope:ended || current ? "current" : encounter && type === "KNOWS" ? "unknown" : historical ? "historical"
    : /\b(?:is|are|am)\b/i.test(prefix) || /\b(?:works?|working|operates?|knows|trusts|owes|passes|supplies|commands?|serves?|speaks?)\b/i.test(predicate)
      || ["FRIEND_OF","ACQUAINTANCE_OF","QUARTERMASTER_OF","COMMANDER_OF","KEEPER_OF","INFORMANT_FOR"].includes(type) ? "current" : "unknown",
    ...(encounter && historical ? {eventTemporalScope:"historical"} : {})};
}
function atReExtract(entry, page, kind) {
  const text = atRePlain(page.text?.content);
  const aliases = atReEntityIndex(entry.uuid);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const names = [...aliases.keys()].sort((a,b)=>b.length-a.length);
  if (!names.length) return {evidence:[],diagnostics:[]};
  const evidence = [], diagnostics = [];
  for (const paragraphHit of text.matchAll(/[^\n]+/g)) {
    const paragraph=paragraphHit[0],paragraphOffset=paragraphHit.index;
    let previousSubject = null;
    let previousObject = null;
    const localNames = new Map(aliases);
    for (const sentenceHit of paragraph.matchAll(/[^.!?]+[.!?]?/g)) {
      const sentence = sentenceHit[0].trim();
      if (!sentence) continue;
      // Same-paragraph unique first names are references, never global aliases.
      for (const name of names.filter(name=>name.includes(" "))) {
        if (!new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,"iu").test(sentence)) continue;
        const first = name.split(" ")[0];
        const person=[...aliases.get(name)].every(uuid=>{
          const doc=atReDocument(uuid);
          return doc?.documentName === "Actor" || ["contact","npc","character"].includes(doc?.getFlag?.(ATRE_ID,"worldProfile")?.category);
        });
        if (!person || ["captain","commander"].includes(first)) continue;
        if (!localNames.has(first)) localNames.set(first,new Set(aliases.get(name)));
        else for (const uuid of aliases.get(name)) localNames.get(first).add(uuid);
      }
      const localPattern = [...localNames.keys()].sort((a,b)=>b.length-a.length).map(name=>name.split(" ").map(escape).join("\\s+")).join("|");
      const hits = [...sentence.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])(?:${localPattern})(?![\\p{L}\\p{N}])`,"giu"))];
      const resolve = name => {
        const matches = localNames.get(atReNorm(name).replace(/^the /u,""));
        return matches?.size === 1 ? [...matches][0] : "";
      };
      let subject = hits[0] && /^[\s"“]*(?:at\b|according to\b|later\b)/i.test(sentence) ? null : hits[0];
      let subjectUuid = subject ? resolve(subject[0]) : "";
      let tailStart = subject ? subject.index + subject[0].length : 0;
      if (/^(?:He|She)\b/u.test(sentence) && previousSubject) { subjectUuid=previousSubject; subject=null; tailStart=sentence.match(/^(He|She)\b/u)[0].length; }
      const tail = sentence.slice(tailStart);
      const clauses = [
        ["FRIEND_OF",/\b(?:old\s+)?friend\s+of\s+(?:the\s+)?/gi],
        ["ACQUAINTANCE_OF",/\b(?:old\s+)?acquaintance\s+of\s+(?:the\s+)?/gi],
        ["QUARTERMASTER_OF",/\bquartermaster\s+of\s+(?:the\s+)?/gi],
        ["COMMANDER_OF",/\b(?:(?:commander|captain)\s+of|commands?|commanded)\s+(?:the\s+)?/gi],
        ["KEEPER_OF",/\bkeeper\s+of\s+(?:the\s+)?/gi],
        ["MEMBER_OF",/\bmember\s+of\s+(?:the\s+)?/gi],
        ["INFORMANT_FOR",/\b(?:informant\s+for|passes\s+information\s+to|supplied\s+information\s+to|supplies\s+information\s+to)\s+(?:the\s+)?/gi],
        ["INFORMATION_PROVIDER",/\b(?:supplied|provided)\s+(?:the\s+)?/gi],
        ["WORKS_FOR",/\b(?:works?\s+for|worked\s+for|working\s+for)\s+(?:the\s+)?/gi],
        ["OPERATES_FROM",/\b(?:operates?|operated)\s+from\s+(?:the\s+)?/gi],
        ["KNOWS",/\b(?:knows|knew|recognized|recognised)\s+(?:the\s+)?/gi],
        ["TRUSTS",/\b(?:trusts|trusted)\s+(?:the\s+)?/gi],
        ["OWES_FAVOUR_TO",/\b(?:owes|owed)\s+(?:the\s+)?/gi],
        ["SERVES",/\b(?:serves?|served)\s+(?:the\s+)?/gi],
        ["MET",/\bmet\s+(?:the\s+)?/gi],
        ["SPEAKS_WITH",/\bspeaks?\s+with\s+(?:the\s+)?/gi]
      ];
      const compoundInformation = /\bbut\s+he\s+has\s+supplied\s+them\s+with\s+information\b/i.exec(tail);
      const explicitMembershipObject = /\bmember\s+of\s+(?:the\s+)?/i.exec(tail);
      const subjectNames=[...localNames.keys()].filter(name=>resolve(name) === subjectUuid);
      const informantRole=subjectNames.length && new RegExp(`(?<![\\p{L}\\p{N}])(?:${subjectNames.map(escape).join("|")})\\s*,\\s*(?:a|an|the)\\s+(?:(?:ferryman|merchant|guide|occasional|and|an?)\\s+)*informant\\b`,"iu").exec(paragraph.slice(0,sentenceHit.index));
      if (compoundInformation && explicitMembershipObject && informantRole) {
        const objectPosition=tailStart+explicitMembershipObject.index+explicitMembershipObject[0].length;
        const namedObject=hits.find(hit=>hit.index===objectPosition);
        if(namedObject)clauses.push(["INFORMANT_FOR",new RegExp(escape(explicitMembershipObject[0]),"g")]);
      }
      let attributedSubject = subjectUuid;
      // A named subject immediately preceding "may be working for" is the
      // possible worker, not the person reporting their suspicion.
      for (const [type, regex] of clauses) for (const match of tail.matchAll(regex)) {
        const absolute = tailStart + match.index;
        const objectStart = absolute + match[0].length;
        let objectHit = hits.find(hit=>hit.index === objectStart);
        let pronounObject = "";
        if(!objectHit) {
          const pronoun=/^(?:him|her|them|it)\b/i.exec(sentence.slice(objectStart));
          const precedingObjects=new Set(hits.filter(hit=>hit.index<objectStart).map(hit=>resolve(hit[0])).filter(uuid=>uuid && uuid!==subjectUuid));
          pronounObject=precedingObjects.size === 1 ? [...precedingObjects][0] : precedingObjects.size ? "" : previousObject;
          if(pronoun && pronounObject) {objectHit=[pronoun[0]];objectHit.index=objectStart;}
        }
        if (!objectHit) {
          diagnostics.push({reason:"object-not-resolved-or-unsupported-reference",sourceUuid:entry.uuid,excerpt:sentence,type});continue;
        }
        const objectUuid = pronounObject || resolve(objectHit[0]);
        const clause=atReEnglishClause(sentence,absolute,objectStart+objectHit[0].length,hits);
        const intervening = hits.filter(hit=>hit.index >= Math.max(tailStart,clause.start) && hit.index < absolute);
        let actualSubject = subjectUuid;
        let predicateStart = tailStart;
        if (intervening.length) {
          const last = intervening[intervening.length-1];
          const between = sentence.slice(last.index+last[0].length,absolute);
          if (/^[\s,]+(?:(?:is|was|an?|the|old|former|used|to|may|might|be|been|has|had|not|no|longer|still|now|currently|formerly|previously|possibly|allegedly)\s+)*$/i.test(between)) {
            actualSubject=resolve(last[0]);predicateStart=last.index+last[0].length;
          }
          else if (!/\b(?:and|but)\b/i.test(sentence.slice(last.index+last[0].length,absolute))) continue;
        }
        const before = sentence.slice(Math.max(tailStart,clause.start),absolute).replace(/^\s*(?:(?:claimed|said|reported)\s+that\s+)?(?:he|she|they)\s+/i,"");
        // Require an attached predicate/apposition, rather than arbitrary
        // vocabulary anywhere near two entity names.
        if (!intervening.length && !/^[\s,]*(?:(?:is|was|an?|the|old|former|formerly|once|used|normally|occasionally|previously|still|now|currently|presently|remains?|continues?|no|longer|not|may|might|be|has|had|been|possibly|allegedly|rumored|rumoured|to)\s+)*$/i.test(before)
          && !/\b(?:and|but)\s+(?:an?|the|occasionally|still|now|normally)?\s*$/i.test(before)) continue;
        if (type === "OWES_FAVOUR_TO" && !/^\s+(?:an?\s+)?favou?r\b/i.test(sentence.slice(objectStart+objectHit[0].length))) continue;
        if (type === "INFORMATION_PROVIDER" && (!/^\s+(?:with\s+)?information\b/i.test(sentence.slice(objectStart+objectHit[0].length)) || compoundInformation && informantRole))continue;
        if(type === "KNOWS" && /recogn(?:iz|is)ed/i.test(match[0])) {
          const target=atReDocument(objectUuid);
          if(!/^\s+from\s+(?:an?\s+)?earlier\s+journey\b/i.test(sentence.slice(objectStart+objectHit[0].length))
            || !(target?.documentName === "Actor" || ["contact","npc","character"].includes(target?.getFlag?.(ATRE_ID,"worldProfile")?.category)))continue;
        }
        if (!actualSubject || !objectUuid || actualSubject === objectUuid) {
          diagnostics.push({reason:"unresolved-canonical-endpoint",sourceUuid:entry.uuid,excerpt:sentence,type}); continue;
        }
        const hedged = /\b(?:suspects?|may|might|perhaps|rumou?red|allegedly|possibly)\b/i.test(clause.text);
        const relationPrefix = sentence.slice(Math.max(predicateStart,clause.start),absolute);
        const informationContrast = type === "INFORMANT_FOR" && compoundInformation && /member\s+of/i.test(match[0]);
        const negated = !informationContrast && /\b(?:not|no longer|never)\b/i.test(relationPrefix);
        const ended = !informationContrast && /\bno longer\b/i.test(relationPrefix);
        const status = hedged ? "possible" : ended ? "ended" : negated ? "negated" : "asserted";
        const assertionClause=informationContrast ? atReEnglishClause(sentence,tailStart+compoundInformation.index+3,sentence.length,hits) : clause;
        const temporal=atReEnglishTemporal(type,informationContrast ? compoundInformation[0] : match[0],assertionClause,ended);
        const excerpt = informationContrast ? `${informantRole[0]} … ${sentence}` : sentence;
        const endpoints=[actualSubject,objectUuid];
        if(ATRE_REGISTRY[type]?.symmetric)endpoints.sort();
        const identityKey = [endpoints[0],type,endpoints[1]].join("|");
        const key = [entry.uuid,page.uuid,identityKey,atReNorm(excerpt),status].join("|");
        const sourceSpan={start:paragraphOffset+sentenceHit.index+sentenceHit[0].indexOf(sentence)+assertionClause.start,
          end:paragraphOffset+sentenceHit.index+sentenceHit[0].indexOf(sentence)+assertionClause.end,text:assertionClause.text,coordinateSpace:"plain-text"};
        const legacyId=`rel-${atReHash(key)}`;
        const prior=evidence.find(row=>row.id === legacyId);
        // Keep established IDs/GM decisions for the first claim; additional
        // distinct propositions must not collapse just because their sentence matches.
        const id=prior && (prior.sourceSpan.start!==sourceSpan.start || prior.sourceSpan.end!==sourceSpan.end || prior.temporalScope!==temporal.temporalScope)
          ? `rel-${atReHash(`${key}|${sourceSpan.start}|${sourceSpan.end}|${temporal.temporalScope}`)}` : legacyId;
        evidence.push({id,identityKey,subjectUuid:actualSubject,relationType:type,objectUuid,
          sourceUuid:entry.uuid,sourcePageUuid:page.uuid,sourceKind:kind,sourceName:entry.name,sourceExcerpt:excerpt,
          sourceOffset:paragraphOffset+sentenceHit.index,provenance:[{provider:"explicit-relationship-pattern",rule:type}],
          sourceSpan,
          confidence:hedged ? 0.55 : 0.95,visibility:"source-bounded",chronology:atReChronology(entry,kind),
          status,polarity:negated ? "negative" : "positive",certainty:hedged ? (/\brumou?red\b/i.test(sentence) ? "rumoured" : "possible") : "asserted",
          ...temporal,
          changeSemantics:ended ? "no_longer" : /\bformer\b/i.test(relationPrefix) ? "former" : null,active:true});
        if(informationContrast)evidence[evidence.length-1].provenance.push({provider:"source-role-and-information",roleExcerpt:informantRole[0],roleOffset:paragraphOffset+informantRole.index});
        attributedSubject=actualSubject;
      }
      const personUuids=new Set(hits.map(hit=>resolve(hit[0])).filter(uuid=>{
        const doc=atReDocument(uuid);
        return doc?.documentName === "Actor" || ["contact","npc","character"].includes(doc?.getFlag?.(ATRE_ID,"worldProfile")?.category);
      }));
      // A second person makes a following He/She reference unsafe. Do not
      // infer gender or choose a referent merely because it was mentioned last.
      previousSubject = personUuids.size > 1 ? null : attributedSubject || null;
      const objects=new Set(hits.map(hit=>resolve(hit[0])).filter(uuid=>uuid && uuid!==attributedSubject));
      previousObject=objects.size === 1 ? [...objects][0] : null;
    }
  }
  // Multiple extraction paths for the same excerpt do not create copies.
  return {evidence:[...new Map(evidence.map(row=>[row.id,atReNormalize(row)])).values()],diagnostics};
}
function atReExtractVisible() {
  const evidence=[],diagnostics=[];
  for (const entry of game.journal?.contents || []) {
    const kind=atReSourceKind(entry);
    if (!kind || !atReCanRead(entry)) continue;
    for (const page of entry.pages?.contents || []) {
      if (!atReCanRead(page) && !game.user?.isGM) continue;
      const result=atReExtract(entry,page,kind);
      evidence.push(...result.evidence);diagnostics.push(...result.diagnostics);
    }
  }
  return {evidence,diagnostics};
}
async function atReSync() {
  if (!game.user?.isGM) return {evidence:[],decisions:[],diagnostics:[]};
  if (atReBusy) return atReBusy;
  const activeGM=game.users?.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return atReSnapshot();
  atReBusy=atReWrite(async()=>{
    const old=atReLedger(false),current=atReExtractVisible();
    const map=new Map(old.evidence.map(row=>[row.id,{...row,active:row.origin === "provider" ? row.active !== false && !!atReDocument(row.sourceUuid) : false}]));
    for(const row of current.evidence)map.set(row.id,{...map.get(row.id),...row});
    const ledger={version:2,evidence:[...map.values()],decisions:old.decisions};
    await game.settings.set(ATRE_ID,ATRE_SETTING,JSON.stringify(ledger));
    Hooks.callAll("adventurersTomeRelationshipEvidenceUpdated",{count:ledger.evidence.length});
    return {...atReClone(ledger),evidence:ledger.evidence.map(atReNormalize),diagnostics:current.diagnostics};
  });
  try { return await atReBusy; } finally { atReBusy=null; }
}
function atReSnapshot() {
  // Players derive only from presently observable sources. They never read
  // another user's GM ledger or GM decisions, including confirmed rumours.
  return game.user?.isGM ? atReClone(atReLedger()) : {evidence:atReExtractVisible().evidence,decisions:[]};
}
function atReSemantic(input,decisions) {
  const row=atReNormalize(input);
  const decision=[...decisions].reverse().find(item=>item.evidenceId === row.id);
  if(decision?.action === "reject")return {...row,rejected:true};
  if(decision?.action === "possible")return {...row,certainty:"possible"};
  if(decision?.action === "confirm")return {...row,certainty:"asserted"};
  return row;
}
function atReResolution(rows,decisions) {
  const active=rows.filter(row=>row.active !== false).map(row=>atReSemantic(row,decisions));
  const supported=active.filter(row=>!row.rejected && row.certainty === "asserted");
  let candidates=supported.filter(row=>row.temporalScope === "current" || ["no_longer","former","changed"].includes(row.changeSemantics));
  let state;
  if(!candidates.length) {
    state=active.some(row=>!row.rejected && ["possible","rumoured"].includes(row.certainty)) ? "possible"
      : active.some(row=>!row.rejected && row.certainty === "disputed") ? "conflicting"
      : supported.some(row=>row.temporalScope === "unknown") ? "unknown"
      : supported.length || !active.length ? "historical"
      : active.every(row=>row.rejected) ? "rejected" : "unknown";
    candidates=supported.length ? supported : active.length ? active : rows.map(row=>atReSemantic(row,decisions));
  } else {
    const signature=row=>row.changeSemantics === "former" ? "former" : row.polarity;
    if(new Set(candidates.map(signature)).size > 1) {
      if(candidates.every(row=>row.sourceKind === "session" && Number.isFinite(row.chronology?.sessionNumber))) {
        const latest=Math.max(...candidates.map(row=>row.chronology.sessionNumber));
        candidates=candidates.filter(row=>row.chronology.sessionNumber === latest);
      }
    }
    state=new Set(candidates.map(signature)).size > 1 ? "conflicting"
      : candidates[0].changeSemantics === "former" ? "historical"
      : candidates[0].polarity === "negative" ? "negative" : "current";
    if(supported.some(row=>row.temporalScope === "unknown" && candidates.some(current=>current.polarity !== row.polarity)))state="conflicting";
  }
  const signs=new Set(candidates.map(row=>row.polarity));
  const changes=new Set(candidates.map(row=>row.changeSemantics));
  return {state,polarity:signs.size === 1 ? [...signs][0] : "unknown",
    certainty:state === "possible" ? "possible" : state === "conflicting" ? "disputed" : state === "unknown" ? "unknown" : "asserted",
    temporalScope:state === "historical" ? "historical" : ["current","negative"].includes(state) ? "current" : "unknown",
    changeSemantics:changes.size === 1 ? [...changes][0] : null};
}
function atReState(rows,decisions) {
  return atReResolution(rows,decisions).state;
}
function atRePresentation(type,resolution,reverse=false) {
  const definition=ATRE_REGISTRY[type];
  const positive=definition?.[reverse ? "inverseLabel" : "label"] || type;
  const negative=definition?.[reverse ? "inverseNegativeLabel" : "negativeLabel"] || `Not: ${positive}`;
  const label=resolution.polarity === "negative" && resolution.state !== "conflicting" ? negative : positive;
  const stateLabel=resolution.changeSemantics === "no_longer" && resolution.state === "negative" ? "No longer"
    : resolution.changeSemantics === "former" && resolution.state === "historical" ? "Former / historical"
    : ({current:"Current",negative:"Denied / negated",possible:"Possible / rumour",conflicting:"Conflicting evidence",historical:"Historical",unknown:"Unknown",rejected:"Rejected"})[resolution.state];
  return {label:resolution.state === "possible" ? `Possible: ${label.toLowerCase()}` : label,stateLabel};
}
function atReProviderId(providerId,row,includeSpan=true) {
  const parts=[providerId,row.assertionId || "",row.identityKey,row.sourceUuid,row.sourcePageUuid || "",row.sourceExcerpt,row.polarity,row.certainty,row.temporalScope,row.changeSemantics || ""];
  if(includeSpan && row.sourceSpan)parts.push(JSON.stringify([row.sourceSpan.start,row.sourceSpan.end,row.sourceSpan.text]));
  return `provider-${atReHash(parts.join("|"))}`;
}
async function atReIngest(providerId,assertions) {
  if(!game.user?.isGM)throw new Error("GM permission required.");
  if(!atReClean(providerId) || !Array.isArray(assertions))throw new Error("Provider id and assertions required.");
  const prepared=assertions.map(input=>{
    const row=atReNormalize(input);
    if(!ATRE_REGISTRY[row.relationType] || ![row.subjectUuid,row.objectUuid,row.sourceUuid].every(uuid=>atReDocument(uuid))
      || row.subjectUuid === row.objectUuid || !atReClean(row.sourceExcerpt))throw new Error("Valid canonical endpoints, source, predicate and excerpt required.");
    for(const field of ["subjectUuid","objectUuid"])row[field]=atReApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:row[field]})?.authorityUuid || row[field];
    if(row.subjectUuid === row.objectUuid)throw new Error("Distinct canonical endpoints required.");
    const normalized=atReNormalize(row);
    return {...normalized,id:atReProviderId(providerId,normalized),origin:"provider",providerId,
      provenance:[...(Array.isArray(row.provenance) ? row.provenance : []),{provider:providerId}],active:true};
  });
  return atReWrite(async()=>{
    const ledger=atReLedger(false),map=new Map(ledger.evidence.map(row=>[row.id,row]));
    const result=[];
    for(const row of prepared) {
      const legacy=map.get(atReProviderId(providerId,row,false));
      const spanKey=value=>JSON.stringify(value ? [value.start,value.end,value.text] : null);
      const final=legacy?.origin === "provider" && spanKey(legacy.sourceSpan) === spanKey(row.sourceSpan) ? {...row,id:legacy.id} : row;
      if(!map.has(final.id))map.set(final.id,final);
      result.push(final);
    }
    ledger.evidence=[...map.values()];
    await game.settings.set(ATRE_ID,ATRE_SETTING,JSON.stringify({version:2,...ledger}));
    Hooks.callAll("adventurersTomeRelationshipEvidenceUpdated",{count:ledger.evidence.length});
    return atReClone(result);
  });
}
function atReRelationshipsFor(uuid) {
  const canonical=atReApi().campaignIdentityReconciliation?.identityFor?.({canonicalUuid:uuid})?.authorityUuid || uuid;
  if (!atReCanRead(atReDocument(canonical))) return [];
  const snapshot=atReSnapshot(),groups=new Map();
  for(const row of snapshot.evidence) {
    if (row.subjectUuid !== canonical && row.objectUuid !== canonical) continue;
    if (!game.user?.isGM && !atReCanRead(atReDocument(row.sourceUuid))) continue;
    const otherUuid=row.subjectUuid === canonical ? row.objectUuid : row.subjectUuid;
    if (!atReCanRead(atReDocument(otherUuid))) continue;
    if (!groups.has(row.identityKey))groups.set(row.identityKey,[]);
    groups.get(row.identityKey).push(row);
  }
  return [...groups.values()].map(rows=>{
    const first=rows[0],reverse=first.objectUuid === canonical;
    const otherUuid=reverse ? first.subjectUuid : first.objectUuid;
    const resolution=atReResolution(rows,snapshot.decisions);
    return {id:first.identityKey,otherUuid,name:atReDocument(otherUuid)?.name || "",relationType:first.relationType,reverse,
      ...resolution,...atRePresentation(first.relationType,resolution,reverse),evidenceCount:rows.length,
      history:rows.map(row=>({...atReClone(row),...atRePresentation(row.relationType,atReResolution([row],snapshot.decisions),reverse)}))};
  }).filter(row=>game.user?.isGM || row.state === "current");
}
function atReReview(sourceUuid="") {
  if (!game.user?.isGM) return [];
  const snapshot=atReSnapshot();
  return snapshot.evidence.filter(row=>row.active !== false && ["possible","rumoured","disputed","unknown"].includes(row.certainty)
    && (!sourceUuid || row.sourceUuid === sourceUuid)
    && !["confirm","possible","reject"].includes([...snapshot.decisions].reverse().find(decision=>decision.evidenceId === row.id)?.action))
    .map(row=>({...row,subjectName:atReDocument(row.subjectUuid)?.name || "Missing identity",objectName:atReDocument(row.objectUuid)?.name || "Missing identity",
      relationLabel:atRePresentation(row.relationType,atReResolution([row],snapshot.decisions)).label}));
}
async function atReDecide(evidenceId,action) {
  if (!game.user?.isGM) throw new Error("GM permission required.");
  if (!["confirm","possible","reject","unresolved"].includes(action)) throw new Error("Unknown relationship decision.");
  return atReWrite(async()=>{
    const ledger=atReLedger(false),raw=ledger.evidence.find(item=>item.id === evidenceId),row=raw && atReNormalize(raw);
    if (!row || row.active === false || !["possible","rumoured","disputed","unknown"].includes(row.certainty)) throw new Error("Active uncertain relationship evidence required.");
    ledger.decisions.push({evidenceId,action,userId:game.user.id,decidedAt:Date.now()});
    await game.settings.set(ATRE_ID,ATRE_SETTING,JSON.stringify({version:2,...ledger}));
    Hooks.callAll("adventurersTomeRelationshipEvidenceUpdated",{evidenceId,action});
    return atReClone(row);
  });
}
function atReSchedule() {
  if(!game.user?.isGM)return;
  window.clearTimeout(atReTimer);
  atReTimer=window.setTimeout(()=>void atReSync().catch(error=>console.warn("Adventurer's Tome | Relationship sync",error)),260);
}
const ATRE_API=Object.freeze({version:2,sync:atReSync,snapshot:atReSnapshot,relationshipsFor:atReRelationshipsFor,review:atReReview,decide:atReDecide,ingest:atReIngest,normalize:atReNormalize,registry:ATRE_REGISTRY});
Hooks.once("init",()=>game.settings.register(ATRE_ID,ATRE_SETTING,{scope:"user",config:false,type:String,default:JSON.stringify({version:1,evidence:[],decisions:[]})}));
Hooks.once("ready",()=>{const module=game.modules.get(ATRE_ID);module.api ||= {};module.api.campaignRelationshipEvidence=ATRE_API;atReSchedule();});
Hooks.on("adventurersTomeCampaignMentionEvidenceUpdated",atReSchedule);
Hooks.on("updateJournalEntryPage",atReSchedule);
Hooks.on("deleteJournalEntryPage",atReSchedule);
Hooks.on("updateJournalEntry",atReSchedule);
Hooks.on("deleteJournalEntry",atReSchedule);
