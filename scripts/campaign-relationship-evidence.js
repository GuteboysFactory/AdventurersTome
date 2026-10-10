const ATRE_ID = "adventurers-tome";
const ATRE_SETTING = "campaignRelationshipEvidenceV1";
const ATRE_GENERIC_TITLES = new Set(globalThis.AdventurersTomeLanguage.words("CHARACTER_TITLES"));
const ATRE_TYPES = Object.freeze({
  FRIEND_OF:["Friend","Friend"], ACQUAINTANCE_OF:["Acquaintance","Acquaintance"],
  QUARTERMASTER_OF:["Quartermaster","Quartermaster"], COMMANDER_OF:["Commander","Commander"],
  KEEPER_OF:["Keeper","Keeper"], MEMBER_OF:["Member","Member"],
  INFORMANT_FOR:["Informant","Informant"], WORKS_FOR:["Works for","Worked for by"],
  OPERATES_FROM:["Operates from","Base for"], KNOWS:["Knows","Known by"],
  OWES_FAVOUR_TO:["Owes a favour","Owed a favour by"], TRUSTS:["Trusts","Trusted by"],
  SERVES:["Serves","Served by"], MET:["Met","Met"], SPEAKS_WITH:["Speaks with","Speaks with"],
  INFORMATION_PROVIDER:["Provides information","Receives information"],
  WORKS_WITH:["Works with","Works with"], STAYS_AT:["Stays at","Hosts"],
  TREATED:["Treated","Treated by"]
});
// Semantic registry is independent of extractor vocabulary and campaign data.
const ATRE_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(ATRE_TYPES).map(([type,labels])=>[type,{
  label:labels[0],inverseLabel:labels[1],
  negativeLabel:type === "MEMBER_OF" ? "Not a member" : `Not: ${labels[0].toLowerCase()}`,
  inverseNegativeLabel:type === "MEMBER_OF" ? "Not a member" : `Not: ${labels[1].toLowerCase()}`,
  symmetric:["FRIEND_OF","ACQUAINTANCE_OF","MET","SPEAKS_WITH","WORKS_WITH"].includes(type)
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
  const [kind,id,pageKind,pageId] = atReClean(uuid).split(".");
  const parent = (kind === "Actor" ? game.actors : kind === "Item" ? game.items : kind === "JournalEntry" ? game.journal : kind === "Scene" ? game.scenes : null)?.get(id) || null;
  const known=pageKind === "JournalEntryPage" ? parent?.pages?.get?.(pageId) || parent?.pages?.contents?.find(page=>page.id === pageId) || null : pageKind ? null : parent;
  if(known)return known;
  try {return typeof fromUuidSync === "function" ? fromUuidSync(atReClean(uuid)) : null;}catch (_) {return null;}
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
// Language providers supply vocabulary; the canonical state engine is unchanged.
function atReLanguagePattern(key,language="en") { return language === "all" ? globalThis.AdventurersTomeLanguage.anyPattern(key) : globalThis.AdventurersTomeLanguage.pattern(key,language); }
function atReLanguageClause(sentence,predicateStart,objectEnd,hits,language="en") {
  const boundaries=[...sentence.matchAll(atReLanguagePattern("clauseBoundaries","all"))]
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
function atReLanguageTemporal(type,predicate,clause,ended,language="en") {
  const prefix=clause.prefix.replace(atReLanguagePattern("reporting",language),"");
  const current=atReLanguagePattern("current",language).test(prefix);
  const historical=atReLanguagePattern("historicalPrefix",language).test(prefix)
    || atReLanguagePattern("historicalSuffix",language).test(clause.suffix)
    || atReLanguagePattern("pastPredicate",language).test(predicate);
  const encounter=type === "MET" || type === "KNOWS" && atReLanguagePattern("recognition",language).test(predicate);
  return {temporalScope:ended || current || type === "MEMBER_OF" && atReLanguagePattern("neverMembership",language).test(prefix) ? "current" : encounter && type === "KNOWS" ? "unknown" : historical ? "historical"
    : atReLanguagePattern("copula",language).test(prefix) || atReLanguagePattern("presentPredicate",language).test(predicate)
      || ["FRIEND_OF","ACQUAINTANCE_OF","QUARTERMASTER_OF","COMMANDER_OF","KEEPER_OF","INFORMANT_FOR"].includes(type) ? "current" : "unknown",
    ...(encounter && historical ? {eventTemporalScope:"historical"} : {})};
}
function atReWithoutRoleApposition(value,language="en") {
  return value.replace(atReLanguagePattern("roleApposition",language)," ");
}
function atReFoldedSource(text) {
  let folded="",offset=0;
  const boundaries=[0];
  for(const character of text) {
    const value=character.normalize("NFKD").replace(/\p{M}/gu,"");
    if(!value)boundaries[boundaries.length-1]=offset+character.length;
    else for(let index=0;index<value.length;index++) {
      folded+=value[index];
      boundaries.push(index===value.length-1 ? offset+character.length : offset);
    }
    offset+=character.length;
  }
  return {text:folded,boundaries};
}
function atReComposedSource(text) {
  let composed="";
  const boundaries=[0];
  for(const hit of text.matchAll(/[^\p{M}]\p{M}*|\p{M}+/gu)) {
    const value=hit[0].normalize("NFC");
    composed+=value;
    for(let index=0;index<value.length;index++)boundaries.push(index===value.length-1 ? hit.index+hit[0].length : hit.index);
  }
  return {text:composed,boundaries};
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
    for (const sentenceHit of globalThis.AdventurersTomeLanguage.sentences(paragraph)) {
      const sourceSentence = sentenceHit[0].trim();
      const composed=atReComposedSource(sourceSentence);
      const sentence = composed.text;
      const language = "all";
      if (!sentence) continue;
      // Match the same normalized names as the identity index, then map hits
      // back to the untouched source, including decomposed accent characters.
      const folded=atReFoldedSource(sentence);
      // Same-paragraph unique first names are references, never global aliases.
      for (const name of names.filter(name=>name.includes(" "))) {
        if (!new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,"iu").test(folded.text)) continue;
        const first = name.split(" ")[0];
        const person=[...aliases.get(name)].every(uuid=>{
          const doc=atReDocument(uuid);
          return doc?.documentName === "Actor" || ["contact","npc","character"].includes(doc?.getFlag?.(ATRE_ID,"worldProfile")?.category);
        });
        if (!person || ATRE_GENERIC_TITLES.has(first)) continue;
        if (!localNames.has(first)) localNames.set(first,new Set(aliases.get(name)));
        else for (const uuid of aliases.get(name)) localNames.get(first).add(uuid);
      }
      const localPattern = [...localNames.keys()].sort((a,b)=>b.length-a.length).map(name=>name.split(" ").map(escape).join("\\s+")).join("|");
      const hits = [...folded.text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])(?:${localPattern})(?![\\p{L}\\p{N}])`,"giu"))].map(hit=>{
        const start=folded.boundaries[hit.index],end=folded.boundaries[hit.index+hit[0].length];
        const original=[sentence.slice(start,end)];original.index=start;return original;
      });
      const resolve = name => {
        const matches = localNames.get(atReNorm(name).replace(/^the /u,""));
        return matches?.size === 1 ? [...matches][0] : "";
      };
      let subject = hits[0] && atReLanguagePattern("intro",language).test(sentence) ? null : hits[0];
      let subjectUuid = subject ? resolve(subject[0]) : "";
      let tailStart = subject ? subject.index + subject[0].length : 0;
      // In an introductory/reporting clause, a unique role apposition names
      // the subject of its attached predicates, not the earlier narrator.
      if(!subjectUuid) {
        const roleSubjects=hits.filter(hit=>{
          const after=sentence.slice(hit.index+hit[0].length);
          return atReWithoutRoleApposition(after,"all")!==after;
        });
        if(roleSubjects.length===1)subjectUuid=resolve(roleSubjects[0][0]);
      }
      if (atReLanguagePattern("subjectPronoun",language).test(sentence) && previousSubject) { subjectUuid=previousSubject; subject=null; tailStart=sentence.match(atReLanguagePattern("subjectPronounCapture",language))[0].length; }
      const tail = sentence.slice(tailStart);
      const clauses = globalThis.AdventurersTomeLanguage.relationshipRules();
      const compoundInformation = /\bbut\s+he\s+has\s+supplied\s+them\s+with\s+information\b/i.exec(tail);
      const explicitMembershipObject = /\bmember\s+of\s+(?:the\s+)?/i.exec(tail);
      const subjectNames=[...localNames.keys()].filter(name=>resolve(name) === subjectUuid);
      const informantRole=subjectNames.length && new RegExp(`(?<![\\p{L}\\p{N}])(?:${subjectNames.map(escape).join("|")})\\s*,\\s*(?:a|an|the)\\s+(?:(?:ferryman|merchant|guide|occasional|and|an?)\\s+)*informant\\b`,"iu").exec(paragraph.slice(0,sentenceHit.index));
      if (compoundInformation && explicitMembershipObject && informantRole) {
        const objectPosition=tailStart+explicitMembershipObject.index+explicitMembershipObject[0].length;
        const namedObject=hits.find(hit=>hit.index===objectPosition);
        if(namedObject)clauses.push({type:"INFORMANT_FOR",regex:new RegExp(escape(explicitMembershipObject[0]),"g"),language:"en"});
      }
      let attributedSubject = subjectUuid;
      // A named subject immediately preceding "may be working for" is the
      // possible worker, not the person reporting their suspicion.
      for (const {type,regex,language} of clauses) for (const match of tail.matchAll(regex)) {
        const absolute = tailStart + match.index;
        const objectStart = absolute + match[0].length;
        let objectHit = hits.find(hit=>hit.index === objectStart);
        let pronounObject = "";
        let explicitFriendPair = false;
        if(type === "FRIEND_OF" && atReLanguagePattern("pair",language).test(match[0])) {
          // Swedish coordinated subjects: "Nora och Elin är [inte] vänner".
          // Require exactly that syntax, not two arbitrary names near "friends".
          if(language === 'sv' && match[0] === 'vänner') {
            const preceding=hits.filter(hit=>hit.index<absolute);
            if(preceding.length!==2)continue;
            const [a,b]=preceding;
            if(sentence.slice(0,a.index).trim() || !/^\s+och\s+$/iu.test(sentence.slice(a.index+a[0].length,b.index))
              || !/^\s+(?:är|var)\s+(?:inte\s+)?$/iu.test(sentence.slice(b.index+b[0].length,absolute)))continue;
            explicitFriendPair=true;
          }
          const pair=[...new Set(hits.filter(hit=>hit.index<absolute).map(hit=>resolve(hit[0])).filter(uuid=>{const doc=atReDocument(uuid);return doc?.documentName==="Actor" || ["contact","npc","character"].includes(doc?.getFlag?.(ATRE_ID,"worldProfile")?.category);}))];
          if(pair.length===2 && pair.includes(subjectUuid)){pronounObject=pair.find(uuid=>uuid!==subjectUuid);objectHit=[""];objectHit.index=objectStart;}
        }
        if(!objectHit) {
          const pronoun=atReLanguagePattern("objectPronoun",language).exec(sentence.slice(objectStart));
          const precedingObjects=new Set(hits.filter(hit=>hit.index<objectStart).map(hit=>resolve(hit[0])).filter(uuid=>uuid && uuid!==subjectUuid));
          pronounObject=precedingObjects.size === 1 ? [...precedingObjects][0] : precedingObjects.size ? "" : previousObject;
          if(pronoun && atReLanguagePattern("organizationPronoun",language).test(pronoun[0]) && atReDocument(pronounObject)?.getFlag?.(ATRE_ID,"worldProfile")?.category!=="faction")pronounObject="";
          if(pronoun && pronounObject) {objectHit=[pronoun[0]];objectHit.index=objectStart;}
        }
        if (!objectHit) {
          diagnostics.push({reason:"object-not-resolved-or-unsupported-reference",sourceUuid:entry.uuid,excerpt:sentence,type});continue;
        }
        const objectUuid = pronounObject || resolve(objectHit[0]);
        const clause=atReLanguageClause(sentence,absolute,objectStart+objectHit[0].length,hits,language);
        const intervening = explicitFriendPair ? [] : hits.filter(hit=>hit.index >= Math.max(tailStart,clause.start) && hit.index < absolute);
        let actualSubject = subjectUuid;
        let predicateStart = tailStart;
        if (intervening.length) {
          const last = intervening[intervening.length-1];
          const between = atReWithoutRoleApposition(sentence.slice(last.index+last[0].length,absolute),language);
          if (atReLanguagePattern("interveningGuard",language).test(between)) {
            actualSubject=resolve(last[0]);predicateStart=last.index+last[0].length;
          }
          else if (!atReLanguagePattern("conjunction",language).test(sentence.slice(last.index+last[0].length,absolute))) continue;
        }
        const before = atReWithoutRoleApposition(sentence.slice(Math.max(tailStart,clause.start),absolute).replace(atReLanguagePattern("reportingPronoun",language),""),language);
        // Require an attached predicate/apposition, rather than arbitrary
        // vocabulary anywhere near two entity names.
        if (!explicitFriendPair && !intervening.length && !atReLanguagePattern("attachedGuard",language).test(before)
          && !atReLanguagePattern("attachedConjunction",language).test(before)) continue;
        if (type === "OWES_FAVOUR_TO" && !atReLanguagePattern("favourSuffix",language).test(sentence.slice(objectStart+objectHit[0].length))) continue;
        if (type === "INFORMATION_PROVIDER" && (!atReLanguagePattern("informationSuffix",language).test(sentence.slice(objectStart+objectHit[0].length)) || compoundInformation && informantRole))continue;
        if(type === "KNOWS" && atReLanguagePattern("recognition",language).test(match[0])) {
          const target=atReDocument(objectUuid);
          if(!atReLanguagePattern("recognitionSuffix",language).test(sentence.slice(objectStart+objectHit[0].length))
            || !(target?.documentName === "Actor" || ["contact","npc","character"].includes(target?.getFlag?.(ATRE_ID,"worldProfile")?.category)))continue;
        }
        if (!actualSubject || !objectUuid || actualSubject === objectUuid) {
          diagnostics.push({reason:"unresolved-canonical-endpoint",sourceUuid:entry.uuid,excerpt:sentence,type}); continue;
        }
        const claimContext=globalThis.AdventurersTomeLanguage.claimContext(clause.text);
        const sentenceContext=globalThis.AdventurersTomeLanguage.claimContext(sentence);
        // A local hedge must not turn a separate denial into speculation.
        // Questions, explicit quotations and reporting frames bound the claim.
        const enclosingReasons=sentenceContext.reasons.filter(reason=>['question','quotation','reported-claim'].includes(reason)
          || reason==='conditional-or-intended' && /^(?:if|unless|om|ifall)\s/iu.test(sentence.trim()));
        claimContext.reasons=[...new Set([...claimContext.reasons,...enclosingReasons])];
        claimContext.assertable=claimContext.reasons.length===0;
        const hedged = atReLanguagePattern("hedged",language).test(clause.text) || !claimContext.assertable;
        const relationPrefix = sentence.slice(Math.max(predicateStart,clause.start),absolute);
        const informationContrast = type === "INFORMANT_FOR" && compoundInformation && /member\s+of/i.test(match[0]);
        const negated = !informationContrast && atReLanguagePattern("negated",language).test(relationPrefix);
        const ended = !informationContrast && atReLanguagePattern("ended",language).test(relationPrefix);
        const status = hedged ? "possible" : ended ? "ended" : negated ? "negated" : "asserted";
        const assertionClause=informationContrast ? atReLanguageClause(sentence,tailStart+compoundInformation.index+3,sentence.length,hits,language) : clause;
        const temporal=atReLanguageTemporal(type,informationContrast ? compoundInformation[0] : match[0],assertionClause,ended,language);
        const excerpt = informationContrast ? `${informantRole[0]} … ${sourceSentence}` : sourceSentence;
        const endpoints=[actualSubject,objectUuid];
        if(ATRE_REGISTRY[type]?.symmetric)endpoints.sort();
        const identityKey = [endpoints[0],type,endpoints[1]].join("|");
        const key = [entry.uuid,page.uuid,identityKey,atReNorm(excerpt),status].join("|");
        const originalStart=composed.boundaries[assertionClause.start],originalEnd=composed.boundaries[assertionClause.end];
        const sourceSpan={start:paragraphOffset+sentenceHit.index+sentenceHit[0].indexOf(sourceSentence)+originalStart,
          end:paragraphOffset+sentenceHit.index+sentenceHit[0].indexOf(sourceSentence)+originalEnd,text:sourceSentence.slice(originalStart,originalEnd),coordinateSpace:"plain-text"};
        const legacyId=`rel-${atReHash(key)}`;
        const prior=evidence.find(row=>row.id === legacyId);
        // Keep established IDs/GM decisions for the first claim; additional
        // distinct propositions must not collapse just because their sentence matches.
        const id=prior && (prior.sourceSpan.start!==sourceSpan.start || prior.sourceSpan.end!==sourceSpan.end || prior.temporalScope!==temporal.temporalScope)
          ? `rel-${atReHash(`${key}|${sourceSpan.start}|${sourceSpan.end}|${temporal.temporalScope}`)}` : legacyId;
        evidence.push({id,identityKey,subjectUuid:actualSubject,relationType:type,objectUuid,
          sourceUuid:entry.uuid,sourcePageUuid:page.uuid,sourceKind:kind,sourceName:entry.name,sourceExcerpt:excerpt,
          sourceOffset:paragraphOffset+sentenceHit.index,provenance:[{provider:"explicit-relationship-pattern",rule:type,language,packVersion:globalThis.AdventurersTomeLanguage.versionFor(language)}],
          sourceSpan,
          confidence:hedged ? 0.55 : 0.95,visibility:"source-bounded",chronology:atReChronology(entry,kind),
          status,polarity:negated ? "negative" : "positive",certainty:hedged ? (atReLanguagePattern("rumoured",language).test(sentence) || claimContext.certainty==='rumoured' ? "rumoured" : "possible") : "asserted",
          interpretationReasons:claimContext.reasons,
          ...temporal,
          changeSemantics:ended ? "no_longer" : atReLanguagePattern("former",language).test(relationPrefix) ? "former" : null,active:true});
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
function atReExtractVisible(sourceUuid="") {
  const atStartupToken = globalThis.AdventurersTomeStartup?.begin("relationship-extraction");
  try {
  const evidence=[],diagnostics=[];
  for (const entry of (game.journal?.contents || []).filter(entry=>!sourceUuid || entry.uuid === sourceUuid)) {
    globalThis.AdventurersTomeStartup?.count("relationship-extraction","documentsScanned");
    const kind=atReSourceKind(entry);
    if (!kind || !atReCanRead(entry)) continue;
    for (const page of entry.pages?.contents || []) {
      if (!atReCanRead(page) && !game.user?.isGM) continue;
      globalThis.AdventurersTomeStartup?.count("relationship-extraction","sourcesExtracted");
      const result=atReExtract(entry,page,kind);
      evidence.push(...result.evidence);diagnostics.push(...result.diagnostics);
    }
  }
  return {evidence,diagnostics};
  } finally { globalThis.AdventurersTomeStartup?.end(atStartupToken); }
}
async function atReSync(options={}) {
  const atStartupToken = globalThis.AdventurersTomeStartup?.begin("relationship-sync");
  try {
  if (!game.user?.isGM) return {evidence:[],decisions:[],diagnostics:[]};
  if (atReBusy) {
    // Full startup syncs coalesce; a scoped decision needs its own fresh pass.
    if (!options.sourceUuid) return await atReBusy;
    await atReBusy;return atReSync(options);
  }
  const activeGM=game.users?.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return atReSnapshot();
  atReBusy=atReWrite(async()=>{
    const old=atReLedger(false),current=atReExtractVisible(options.sourceUuid);
    const map=new Map(old.evidence.map(row=>[row.id,{...row,active:options.sourceUuid && row.sourceUuid !== options.sourceUuid ? row.active : row.origin === "provider" ? row.active !== false && !!atReDocument(row.sourceUuid) : false}]));
    for(const row of current.evidence)map.set(row.id,{...map.get(row.id),...row});
    const ledger={version:2,evidence:[...map.values()],decisions:old.decisions};
    const payload=JSON.stringify(ledger);
    if (game.settings.get(ATRE_ID,ATRE_SETTING) !== payload) {
      await game.settings.set(ATRE_ID,ATRE_SETTING,payload);
      globalThis.AdventurersTomeStartup?.count("relationship-sync","writes");
      Hooks.callAll("adventurersTomeRelationshipEvidenceUpdated",{count:ledger.evidence.length,reviewDecision:globalThis.AdventurersTomeReviewDecision?.isActive?.() === true});
    } else globalThis.AdventurersTomeStartup?.count("relationship-sync","unchangedSyncs");
    return {...atReClone(ledger),evidence:ledger.evidence.map(atReNormalize),diagnostics:current.diagnostics};
  });
  try { return await atReBusy; } finally { atReBusy=null; }
  } finally { globalThis.AdventurersTomeStartup?.end(atStartupToken); }
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
// Build from viewer-visible evidence BEFORE grouping, counting or resolving state.
// The qa.41 profile API retains its contract; intelligence consumes this index once.
function atReGraph() {
  const atStartupToken = globalThis.AdventurersTomeStartup?.begin("relationship-graph");
  try {
  globalThis.AdventurersTomeStartup?.count("relationship-graph","graphBuilds");
  const snapshot=atReSnapshot(),groups=new Map();
  for(const row of snapshot.evidence) {
    if(!atReCanRead(atReDocument(row.subjectUuid)) || !atReCanRead(atReDocument(row.objectUuid)))continue;
    const sourceDocument=atReDocument(row.sourceUuid),page=row.sourcePageUuid ? atReDocument(row.sourcePageUuid) : null;
    const source=row.sourcePageUuid ? (page?.parent?.uuid === sourceDocument?.uuid || page?.uuid === sourceDocument?.uuid ? page : null) : sourceDocument;
    if(!game.user?.isGM && (!atReCanRead(source) || row.visibility === "gm"))continue;
    if(!groups.has(row.identityKey))groups.set(row.identityKey,[]);
    groups.get(row.identityKey).push({...row,active:source ? row.active : false,sourceMissing:!source,sourceName:source?.parent?.name || source?.name || row.sourceName});
  }
  return [...groups.values()].map(rows=>{
    const first=rows[0],resolution=atReResolution(rows,snapshot.decisions);
    return {id:first.identityKey,subjectUuid:first.subjectUuid,objectUuid:first.objectUuid,relationType:first.relationType,
      ...resolution,...atRePresentation(first.relationType,resolution),inverse:atRePresentation(first.relationType,resolution,true),
      history:rows.map(row=>({...atReClone(row),...atRePresentation(row.relationType,atReResolution([row],snapshot.decisions)),
        inverse:atRePresentation(row.relationType,atReResolution([row],snapshot.decisions),true)}))};
  });
  } finally { globalThis.AdventurersTomeStartup?.end(atStartupToken); }
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
function atReSchedule(document,changes,options={}) {
  if (options.adventurersTomeReviewDecision || (globalThis.AdventurersTomeReviewDecision?.isActive?.() && document?.reason === "guided-gm-decision")) return;
  if(!game.user?.isGM)return;
  window.clearTimeout(atReTimer);
  atReTimer=window.setTimeout(()=>void atReSync().catch(error=>console.warn("Adventurer's Tome | Relationship sync",error)),260);
}
const ATRE_API=Object.freeze({version:2,sync:atReSync,snapshot:atReSnapshot,relationshipsFor:atReRelationshipsFor,graph:atReGraph,sourceKind:atReSourceKind,review:atReReview,decide:atReDecide,ingest:atReIngest,normalize:atReNormalize,registry:ATRE_REGISTRY});
Hooks.once("init",()=>game.settings.register(ATRE_ID,ATRE_SETTING,{scope:"user",config:false,type:String,default:JSON.stringify({version:1,evidence:[],decisions:[]})}));
Hooks.once("ready",()=>{const module=game.modules.get(ATRE_ID);module.api ||= {};module.api.campaignRelationshipEvidence=ATRE_API;atReSchedule();});
Hooks.on("adventurersTomeCampaignMentionEvidenceUpdated",atReSchedule);
Hooks.on("updateJournalEntryPage",atReSchedule);
Hooks.on("deleteJournalEntryPage",atReSchedule);
Hooks.on("updateJournalEntry",atReSchedule);
Hooks.on("deleteJournalEntry",atReSchedule);
