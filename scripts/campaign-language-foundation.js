// Local narrative rules. No network, translation, world scan, or write authority.
const ATLF_ID="adventurers-tome";
const atLfNormalize=value=>String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const atLfPacks=globalThis.AdventurersTomeLanguagePacks || {};
const atLfPatterns=new Map(),atLfCombined=new Map();
function atLfFreeze(value) {
  if(value && typeof value==="object" && !Object.isFrozen(value)) {
    for(const child of Object.values(value))atLfFreeze(child);
    Object.freeze(value);
  }
  return value;
}
for(const [id,pack] of Object.entries(atLfPacks)) {
  if(pack.id!==id || pack.version!==1 || !Array.isArray(pack.relations))throw new Error(`Invalid Tome language pack: ${id}`);
  for(const [key,rule] of Object.entries(pack.patterns))atLfPatterns.set(`${id}:${key}`,new RegExp(rule.source,rule.flags));
  atLfFreeze(pack);
}
atLfFreeze(atLfPacks);
function atLfPattern(key,language) {
  const pattern=atLfPatterns.get(`${language}:${key}`);
  if(!pattern)throw new Error(`Unknown Tome language rule: ${language}:${key}`);
  pattern.lastIndex=0;
  return pattern;
}
function atLfAnyPattern(key) {
  if(!atLfCombined.has(key)) {
    const rules=Object.values(atLfPacks).map(pack=>pack.patterns[key]).filter(Boolean);
    if(!rules.length)throw new Error(`Unknown Tome language rule: ${key}`);
    const flags=[...new Set(rules.flatMap(rule=>[...rule.flags]))].join("");
    atLfCombined.set(key,new RegExp(rules.map(rule=>`(?:${rule.source})`).join("|"),flags));
  }
  const pattern=atLfCombined.get(key);pattern.lastIndex=0;return pattern;
}
const atLfRelations=Object.values(atLfPacks).flatMap(pack=>pack.relations.map(rule=>({type:rule.type,language:pack.id,packVersion:pack.version,regex:new RegExp(rule.source,rule.flags)})));
// All offsets refer to the original text, never to a translated or rewritten copy.
function atLfSentences(value) {
  const text=String(value??''),rows=[];
  const abbreviations=new Set(Object.values(atLfPacks).flatMap(pack=>pack.lexicon.ABBREVIATIONS||[]));
  let start=0;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(!'.!?\n'.includes(c))continue;
    if(c==='.') {
      const token=text.slice(start,i).match(/[\p{L}.]+$/u)?.[0]||'';
      if(abbreviations.has(token.toLowerCase()) || /^\p{Lu}$/u.test(token) && /^\s*\p{Lu}/u.test(text.slice(i+1))
        || /\d/u.test(text[i-1]||'') && /\d/u.test(text[i+1]||''))continue;
    }
    while(i+1<text.length && /[.!?]/u.test(text[i+1]))i++;
    let end=i+1;
    if(text.slice(start,end).trim()) {const hit=[text.slice(start,end)];hit.index=start;rows.push(hit);}
    start=end;
  }
  if(text.slice(start).trim()){const hit=[text.slice(start)];hit.index=start;rows.push(hit);}
  return rows;
}
function atLfNameForm(value) {
  const words=String(value??'').trim().split(/\s+/u);
  const titles=new Set(Object.values(atLfPacks).flatMap(pack=>pack.lexicon.CHARACTER_TITLES||[]).map(atLfNormalize));
  const removed=[];
  while(words.length>1 && titles.has(atLfNormalize(words[0].replace(/\.$/u,''))))removed.push(words.shift());
  return {text:words.join(' '),titles:removed,normalized:atLfNormalize(words.join(' ')).replace(/[’']/gu,'')};
}
function atLfDocumentHead(value) {
  return Object.values(atLfPacks).some(pack=>(pack.lexicon.DOCUMENT_HEADS||[]).some(word=>atLfNormalize(word)===atLfNormalize(value))
    || atLfPattern('documentCompound',pack.id).test(value));
}
function atLfClaimContext(value) {
  const text=String(value??''),languages=Object.keys(atLfPacks);
  const matches=key=>languages.some(language=>atLfPattern(key,language).test(text));
  const question=/\?\s*[”"’']?\s*$/u.test(text);
  const quoted=/[“”«»]|(?:^|\s)"[^"\n]+"/u.test(text);
  // Swedish "om" also means "about"; only a leading conditional is a gate.
  const modalityText=text.replace(/(?<![\p{L}\p{N}])om(?![\p{L}\p{N}])/giu,(word,offset)=>text.slice(0,offset).trim()? '':word);
  const nonAssertive=languages.some(language=>atLfPattern('nonAssertive',language).test(modalityText)),reported=matches('reportedClaim');
  const rumoured=matches('rumoured') || /\brumou?rs?\b/iu.test(text);
  const uncertain=matches('roleUncertainPrefix') || matches('hedged');
  const reasons=[question&&'question',quoted&&'quotation',nonAssertive&&'conditional-or-intended',reported&&'reported-claim',rumoured&&'rumour',uncertain&&'uncertainty'].filter(Boolean);
  return {assertable:reasons.length===0,certainty:rumoured?'rumoured':reasons.length?'possible':'asserted',reasons,source:text};
}
// Source-local reference proposals, never aliases or canonical links. Names are
// supplied by discovery, so this layer cannot scan a world or expose documents.
function atLfReferences(value,entities=[]) {
  const text=String(value??''),escape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rows=[];let previous=[],previousStart=null,previousEnd=0;
  const names=[...new Set(entities.map(row=>typeof row==='string'?row:row.name).filter(Boolean))].sort((a,b)=>b.length-a.length);
  for(const sentence of atLfSentences(text)) {
    const content=sentence[0],hits=[];
    if(/^\s*\n/u.test(content) || /\n/u.test(text.slice(previousEnd,sentence.index)))previous=[];
    previousEnd=sentence.index+content.length;
    for(const name of names)for(const hit of content.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,'giu'))) {
      if(hits.some(old=>hit.index>=old.start&&hit.index+name.length<=old.end))continue;
      hits.push({name,start:hit.index,end:hit.index+name.length});
    }
    hits.sort((a,b)=>a.start-b.start);
    const pronoun=/^\s*(Han|Hon|Hen|He|She)\s+/iu.exec(content);
    if(pronoun)rows.push({text:pronoun[1],start:sentence.index+pronoun[0].indexOf(pronoun[1]),end:sentence.index+pronoun[0].indexOf(pronoun[1])+pronoun[1].length,
      candidates:[...previous],resolved:previous.length===1?previous[0]:null,antecedentStart:previous.length===1?previousStart:null,reason:previous.length===1?'unique-previous-subject':'ambiguous-or-missing-subject',source:content});
    // A named object also prevents pronoun guessing; gender is never inferred
    // from a person's spelling, profession or title.
    previous=[...new Set(hits.map(hit=>hit.name))];
    if(hits.length)previousStart=sentence.index+hits[0].start;
    if(pronoun && !previous.length)previous=rows.at(-1).candidates;
    if(content.endsWith('\n'))previous=[];
  }
  return rows;
}
// Evidence only: callers own identity resolution and persistence. Match role
// syntax at a supplied name span, never a profession elsewhere in the sentence.
function atLfRoleEvidence(text,names=[],allowedStarts=null,references=[]) {
  const evidence=[];
  const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const ordered=[...new Set(names.filter(Boolean))].sort((a,b)=>b.length-a.length);
  for(const sentenceHit of atLfSentences(text)) {
    const sentence=sentenceHit[0];
    const spans=[];
    for(const name of ordered)for(const match of sentence.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,'giu'))) {
      if(allowedStarts && !allowedStarts.has(sentenceHit.index+match.index))continue;
      if(spans.some(span=>match.index>=span.start && match.index+name.length<=span.end))continue;
      spans.push({start:match.index,end:match.index+name.length,name});
    }
    for(const span of spans)for(const language of Object.keys(atLfPacks)) {
      const before=sentence.slice(0,span.start),after=sentence.slice(span.end);
      if(!atLfClaimContext(sentence).assertable)continue;
      const title=atLfPattern('roleTitle',language).exec(span.name)
        || atLfPattern('roleTitle',language).exec(before.match(/[\p{L}]+\s+$/u)?.[0]||'');
      const titleContext=before.match(/(?:[\p{L}]+\s+){0,2}$/u)?.[0]||'';
      if(title && !atLfPattern('roleDenied',language).test(after) && !atLfPattern('roleDenied',language).test(titleContext)) {
        const historical=atLfPattern('roleHistorical',language).test(titleContext);
        evidence.push({role:`${historical?(language==='sv'?'tidigare ':'former '):''}${title[1].toLocaleLowerCase()}`,status:historical?'historical':'current',subject:span.name,source:sentence.trim(),language});
      }
      const temporalPredicate=atLfPattern('roleTemporalPredicate',language).exec(after);
      const predicate=temporalPredicate || atLfPattern('roleOngoingPredicate',language).exec(after)
        || atLfPattern('rolePredicate',language).exec(after);
      const apposition=atLfPattern('personRole',language).test(after);
      if(!predicate && !apposition)continue;
      const suffix=predicate?after.slice(predicate[0].length):after.replace(/^\s*,\s*/u,'');
      if(atLfPattern('roleDenied',language).test(suffix))continue;
      const normalized=` ${atLfNormalize(suffix).trimStart()}`;
      const role=atLfPattern('briefingRole',language).exec(normalized)?.[1];
      if(!role)continue;
      // Avoid extracting a role from a longer word or an attached person's title.
      const end=normalized.indexOf(role)+role.length;
      if(/[\p{L}\p{N}]/u.test(normalized[end]||''))continue;
      const original=suffix.trimStart(),offset=normalized.indexOf(role)-1;
      if(/^\s+[A-ZÅÄÖ][\p{L}]+/u.test(original.slice(offset+role.length)))continue;
      const display=original.slice(offset,offset+role.length);
      const status=temporalPredicate || atLfPattern('roleHistorical',language).test(`${predicate?.[0]||''} ${display}`)?'historical':'current';
      const roleDisplay=status==='historical' && !atLfPattern('roleHistorical',language).test(display)
        ? `${language==='sv'?'tidigare':'former'} ${display}`:display;
      evidence.push({role:roleDisplay,status,subject:span.name,source:sentence.trim(),language});
      const tail=original.slice(offset+role.length),coordination=atLfPattern('roleCoordination',language).exec(tail);
      if(coordination) {
        const continuation=` ${tail.slice(coordination[0].length)}`;
        // Only an immediately coordinated predicate inherits the subject.
        // "and Dorian works ..." fails this grammar gate.
        if(['rolePredicate','roleTemporalPredicate','roleOngoingPredicate'].some(key=>atLfPattern(key,language).test(continuation)))evidence.push(...atLfRoleEvidence(`${span.name}${continuation}`,[span.name]).map(row=>({...row,source:sentence.trim()})));
      }
    }
  }
  for(const ref of references) {
    if(!ref.resolved || !names.includes(ref.resolved) || allowedStarts && !allowedStarts.has(ref.antecedentStart))continue;
    // Parse at the pronoun's own source position; only attribution is inherited.
    for(const row of atLfRoleEvidence(ref.source,[ref.text]))evidence.push({...row,subject:ref.resolved,reference:{text:ref.text,start:ref.start,antecedentStart:ref.antecedentStart}});
  }
  return evidence.filter((row,index)=>!evidence.slice(0,index).some(old=>old.subject===row.subject&&old.role===row.role&&old.status===row.status&&old.source===row.source));
}
const ATLF_API=Object.freeze({
  contract:"adventurers-tome-narrative-language",version:1,
  words:key=>[...new Set(Object.values(atLfPacks).flatMap(pack=>pack.lexicon[key]||[]).map(atLfNormalize))],
  pattern:atLfPattern,anyPattern:atLfAnyPattern,
  sentences:atLfSentences,nameForm:atLfNameForm,documentHead:atLfDocumentHead,claimContext:atLfClaimContext,
  references:atLfReferences,
  roleEvidence:atLfRoleEvidence,
  relationshipRules:()=>atLfRelations.map(rule=>{rule.regex.lastIndex=0;return {...rule};}),
  versionFor:language=>atLfPacks[language]?.version || null,
  audit:()=>({version:1,languages:Object.keys(atLfPacks),packVersions:Object.fromEntries(Object.values(atLfPacks).map(pack=>[pack.id,pack.version])),localOnly:true,networkRequired:false,identityAuthority:false,writeAuthority:false,translation:false})
});
globalThis.AdventurersTomeLanguage=ATLF_API;
Hooks.once("init",()=>{const module=game.modules.get(ATLF_ID);module.api ||= {};module.api.narrativeLanguage=ATLF_API;});
