// Pure Tome policy. UDPipe supplies evidence, never identities or write authority.
export const REVISION='testai-language-1';
import {annotateSourceRoles,GRAMMAR_PREFIXES} from './source-document-roles.js';
import {candidateEvidence,incompleteName,prepareNameContext,refineNameSpans,proposeNameSpans,occurrenceAllowed,explicitNaming} from './candidate-evidence.js';
import {selectAuthority} from './tome-decision-policy.js';
export {decideReference,referenceKey,documentRole} from './tome-decision-policy.js';
export const POLICY_REVISION='tome-interpretation-10';
// Structure is advisory data with offsets in the unchanged collapsed text.
// It never changes source HTML or grants permission to read private content.
export function documentStructure(html,plain,{sourceName=''}={}){
 const referenceText=plain(html,{paragraphs:true}),text=plain(html),spans=[],blocks=[];let cursor=0,privateLevel=null;
 const add=(start,end,kind,reason)=>{if(start>=0&&end>start)spans.push({start,end,kind,reason});};
 const title=normalize(sourceName);
 const headings=[];let headingCursor=0;
 for(const hit of String(html).matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/giu)){
  const label=plain(hit[2]),start=text.indexOf(label,headingCursor);if(start<0||!label)continue;headingCursor=start+label.length;headings.push({start,end:headingCursor,level:Number(hit[1])});
 }
 for(const hit of String(html).matchAll(/<(?:p|div)\b[^>]*>\s*<(?:strong|b)\b[^>]*>([^<]+)<\/(?:strong|b)>\s*<\/(?:p|div)>/giu)){
  const label=plain(hit[1]);if(!label||label.length>160||/[.!?]$/u.test(label))continue;const start=text.indexOf(label,plain(String(html).slice(0,hit.index)).length);if(start>=0)headings.push({start,end:start+label.length,level:2});
 }
 for(const line of referenceText.split('\n').map(s=>s.trim()).filter(Boolean)){
  const start=text.indexOf(line,cursor);if(start<0)continue;const end=start+line.length;cursor=end;
  const headingRow=headings.find(h=>h.start===start&&h.end===end),markdown=line.match(/^(#{1,6})\s+/u);
  const typographic=/\p{Lu}/u.test(line)&&!/[\p{Ll}]/u.test(line)&&line.split(/\s+/u).length<=12&&!/[.!?]$/u.test(line);
  const heading=Boolean(headingRow||markdown||typographic),level=headingRow?.level||markdown?.[1].length||1;
  if(heading&&privateLevel!==null&&level<=privateLevel)privateLevel=null;
  if(/^(?:(?:gm|dm|sl) (?:notes?|anteckningar)|spelledaranteckningar|hemligheter|secrets)$/u.test(normalize(line.replace(/^#+\s*/,''))))privateLevel=level;
  // This is a section clue, not a replacement for the source permissions.
  blocks.push({start,end,kind:heading?'heading':'narrative',section:privateLevel===null?'narrative':'gm-notes',level:heading?level:null,semanticHeading:Boolean(headingRow||markdown)});
  const session=/^(?:session|spelmo?te|spelmöte)\s*(?:#\s*)?\d+(?:\s*[:—–-].*)?$/iu.test(line);
  if((heading||blocks.length<=2)&&session){add(start,end,'metadata','session-title');continue;}
  if(heading&&title&&normalize(line)===title){add(start,end,'metadata','source-title');continue;}
  const dated=/^(?:datum\s*:\s*|date\s*:\s*)?(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|january|february|march|may|june|july|august|october|december)\s+\d{4})(?:\s*\|.*)?$/iu.test(line);
  if(dated){
   add(start,end,'metadata','session-date');
   const parts=[...line.matchAll(/\|\s*([^|]+)/gu)];for(const p of parts){if(/^(?:SL|DM|GM|spelledare|game master|dungeon master)\s*:/iu.test(p[1]))continue;const at=start+p.index+p[0].indexOf(p[1]);add(at,at+p[1].length,'participants','session-participants');}
  }
  if(/^(?:deltagare|players|participants|characters|karaktärer)\s*:/iu.test(line)){add(start,end,'metadata','participant-label');const colon=line.indexOf(':')+1;add(start+colon,end,'participants','session-participants');}
  // A GM label must be explicit. Never infer a header from position alone.
  for(const m of line.matchAll(/(?:^|[|])\s*(?:SL|DM|GM|spelledare|game master|dungeon master)\s*:\s*[^|]*/giu))add(start+m.index,start+m.index+m[0].length,'metadata','gamemaster-label');
  if(heading&&!spans.some(s=>s.start===start&&s.kind==='metadata'))add(start,end,'heading','section-heading');
 }
 return annotateSourceRoles({text,referenceText,spans,blocks,policyRevision:POLICY_REVISION});
}
export function excludedOccurrence(start,end,structure,{known=false,participant=false}={}){
 const spans=structure?.spans||[];
 const overlaps=s=>start<s.end&&end>s.start;
 if(!known&&spans.some(s=>['metadata','heading'].includes(s.kind)&&overlaps(s)))return !(participant&&spans.some(s=>s.kind==='participants'&&start>=s.start&&end<=s.end));
 if(spans.some(s=>s.kind==='metadata'&&s.reason==='gamemaster-label'&&start>=s.start&&end<=s.end))return true;
 if(spans.some(s=>s.kind==='metadata'&&start>=s.start&&end<=s.end))return !(participant&&spans.some(s=>s.kind==='participants'&&start>=s.start&&end<=s.end));
 return !known&&spans.some(s=>s.kind==='heading'&&start>=s.start&&end<=s.end);
}
export const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export const person=row=>['character','npc','contact','person'].includes(row.kind);
const valid=row=>/^(Actor|Item|JournalEntry|Scene)\.[^.]+$/.test(row.uuid||'')&&!row.excluded&&!row.paused;
const keys=row=>[row.name,...(row.aliases||[])].filter(x=>typeof x==='string'&&x.trim());
const titles=/^(?:(?:king|queen|captain|sir|lady|lord|doctor|sergeant|prince|princess|wight|elf|dwarf|halfling|kung|drottning|kapten|herr|fru|doktor|sergeant|prins|prinsessa|vålnaden|alven|dvärgen|hobbiten)\s+)+/iu;
const untitled=value=>String(value).replace(titles,'');
function unique(rows){const seen=new Set();return rows.filter(r=>!seen.has(r.uuid)&&seen.add(r.uuid));}
export function prepareCatalog(catalog){
 const pool=unique(catalog.filter(valid)),exact=new Map(),first=new Map(),titled=new Map(),surname=new Map();
 const add=(map,key,row)=>{if(key)map.set(key,[...(map.get(key)||[]),row]);};
 for(const row of pool){for(const key of new Set(keys(row).map(normalize)))add(exact,key,row);if(person(row)){add(first,normalize(row.name.match(/^[\p{L}\p{M}\p{N}-]+/u)?.[0]),row);for(const name of keys(row))if(untitled(name)!==name)add(titled,normalize(untitled(name)),row);}}
 for(const row of pool.filter(person)){
  const full=untitled(row.name),parts=full.split(/\s+/u);
  if(parts.length>=2&&parts.every(p=>/^\p{Lu}[\p{L}\p{M}'’-]*$/u.test(p))&&!parts.some(p=>GRAMMAR_PREFIXES.has(normalize(p))))add(surname,normalize(parts.at(-1)),row);
 }
 return {pool,exact,first,titled,surname};
}
export function chooseLanguage(text,mode='auto',fallback='sv'){
 if(['sv','en'].includes(mode))return mode;
 const words=String(text).toLowerCase().match(/\p{L}+/gu)||[];
 const sv=new Set('och att det den de en ett som på för med till är var från inte skulle men han hon deras'.split(' '));
 const en=new Set('and that the a an of on for with to is was from not would but he she their they'.split(' '));
 const scores=words.reduce((a,w)=>[a[0]+Number(sv.has(w)),a[1]+Number(en.has(w))],[0,0]);
 return scores[0]===scores[1]?(fallback==='en'?'en':'sv'):scores[0]>scores[1]?'sv':'en';
}
export function chunks(text,mode='auto',fallback='sv'){
 const out=[];const source=String(text);const pattern=/[^.!?\n]+(?:[.!?]+|\n|$)/gu;
 for(const match of source.matchAll(pattern)){
  // The statistical parser is bounded to short chunks; exact original offsets
  // are retained even when a long sentence needs splitting at whitespace.
  let position=0;const sentence=match[0];
  while(position<sentence.length){let end=Math.min(sentence.length,position+900);if(end<sentence.length){const space=sentence.lastIndexOf(' ',end);if(space>position)end=space+1;}
   const value=sentence.slice(position,end);if(value.trim())out.push({text:value,start:match.index+position,language:chooseLanguage(sentence,mode,fallback)});position=end;
  }
 }
 return out;
}
export function alignTokens(text,tokens,start=0){
 let cursor=0;const rows=[];
 for(const token of tokens){const form=String(token.form||'');if(!form)continue;const at=text.indexOf(form,cursor);if(at<0)continue;cursor=at+form.length;rows.push({...token,start:start+at,end:start+cursor});}
 return rows;
}
export function resolveMention(text,catalog,choice,prepared){
 const index=prepared||prepareCatalog(catalog),pool=index.pool;const wanted=normalize(text);
 if(!wanted)return {status:'unknown',candidates:[],reason:'empty'};
 if(choice?.action==='suppressed'||['ignored','source-ignored'].includes(choice?.action))return {status:'ignored',candidates:[],reason:'confirmed-ignore'};
 if(choice?.sourceChoice?.targetUuid||choice?.sourceChoice===true&&choice.targetUuid){const uuid=choice.sourceChoice?.targetUuid||choice.targetUuid;const picked=pool.filter(r=>r.uuid===uuid);if(picked.length===1)return {status:'matched',candidates:picked,target:picked[0],reason:'confirmed-source-choice'};}
 let matches=[...(index.exact.get(wanted)||[])];let reason='exact-name-or-registered-alias';
 const baseTitle=normalize(untitled(String(text).trim()));
 if(baseTitle!==wanted||index.titled.has(wanted)){
  matches.push(...(index.exact.get(baseTitle)||[]).filter(person),...(index.titled.get(baseTitle)||[]));reason='title-qualified-campaign-name';
 }
 if(!matches.length){
  const raw=String(text).trim();let base='';
  if(/[’']s$/iu.test(raw))base=raw.slice(0,-2);
  else if(/s[’']$/iu.test(raw))base=raw.slice(0,-1);
  else if(/s$/iu.test(raw))base=raw.slice(0,-1);
  if(base){matches=[...(index.exact.get(normalize(base))||[])];reason='attested-possessive-form';}
 }
 if(!matches.length){
  const raw=String(text).trim().replace(/[’']s$/iu,'').replace(/s[’']$/iu,'s');
  const forms=new Set([normalize(raw),...(/s$/iu.test(raw)?[normalize(raw.slice(0,-1))]:[])]);
  // A single first name may resolve only when a Group person participates and
  // every person sharing that first name has the same canonical identity.
  const first=unique([...forms].flatMap(form=>index.first.get(form)||[]));
  if(first.some(r=>r.group)){matches=first;reason='group-first-name';}
 }
 if(wanted.split(' ').length===1&&matches.length){
  const raw=String(text).trim(),forms=new Set([wanted]);
  const exactPerson=reason==='exact-name-or-registered-alias'&&matches.some(person);
  if(/[’']s$/iu.test(raw))forms.add(normalize(raw.slice(0,-2)));
  else if(/s[’']$/iu.test(raw))forms.add(normalize(raw.slice(0,-1)));
  else if(/s$/iu.test(raw)&&!exactPerson)forms.add(normalize(raw.slice(0,-1)));
  const groupNames=[...forms].flatMap(form=>index.first.get(form)||[]).filter(r=>r.group);matches.push(...groupNames);
 }
 matches=unique(matches);
 // A shared surname is a candidate identity, never sufficient authority to
 // attach a mention to an existing person or invent a family relationship.
 if(!matches.length&&wanted.split(' ').length===1&&index.surname?.has(wanted))return {status:'ambiguous',candidates:unique(index.surname.get(wanted)),reason:'surname-needs-context'};
 const authority=selectAuthority(matches);matches=authority.rows;if(authority.reason==='npc-before-contact'&&matches.length===1)reason=authority.reason;
 if(matches.length===1)return {status:'matched',target:matches[0],candidates:matches,reason};
 return {status:matches.length?'ambiguous':'unknown',candidates:matches,reason:matches.length?'multiple-visible-identities':'no-supported-catalogue-match'};
}
export function protectedOccurrences(text,catalog){
 const names=new Set();for(const row of catalog.filter(valid)){
  for(const name of keys(row).flatMap(name=>person(row)?[name,untitled(name)]:[name])){names.add(name);names.add(name+'s');names.add(name+"'s");names.add(name+'’s');if(/s$/iu.test(name)){names.add(name+"'");names.add(name+'’');}}
  if(person(row)&&row.group){const first=row.name.match(/^[\p{L}\p{M}\p{N}-]+/u)?.[0];if(first){names.add(first);names.add(first+'s');names.add(first+"'s");names.add(first+'’s');}}
 }
 const escaped=[...names].sort((a,b)=>b.length-a.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const rows=[];if(!escaped.length)return rows;
 // Chunk the dictionary patterns so a large World cannot create one huge regexp.
 for(let i=0;i<escaped.length;i+=150)for(const hit of text.matchAll(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${escaped.slice(i,i+150).join('|')})(?![\\p{L}\\p{M}\\p{N}])`,'giu')))rows.push({text:hit[0],start:hit.index,end:hit.index+hit[0].length});
 const selected=[];for(const row of rows.sort((a,b)=>a.start-b.start||b.end-a.end)){if(selected.length&&row.start<selected.at(-1).end)continue;selected.push(row);}return selected;
}
// This small closed vocabulary describes document/game roles, never campaign
// identities. An attested name, alias or explicit source choice takes priority.
const ordinaryLabels=new Set('sl dm gm spelare spelarna spelaren gruppen grupp äventyrarna äventyrare party player players session sessionen sessionens overview sammanfattning'.split(' ').map(normalize));
function ordinaryReason(label){return (ordinaryLabels.has(normalize(label))||GRAMMAR_PREFIXES.has(normalize(label)))?'ordinary-document-or-game-role':'';}
export function occurrenceRole(text,hit,tokens){
 const unknown={role:'mentioned',reason:'no-supported-syntactic-role',advisoryOnly:true};
 const inside=tokens.filter(t=>t.start>=hit.start&&t.end<=hit.end);if(!inside.length)return unknown;
 // Token IDs restart in each sentence. Only follow heads inside this sentence.
 const start=Math.max(text.lastIndexOf('.',hit.start-1),text.lastIndexOf('!',hit.start-1),text.lastIndexOf('?',hit.start-1),text.lastIndexOf('\n',hit.start-1))+1;
 const endings=['.','!','?','\n'].map(c=>text.indexOf(c,hit.end)).filter(n=>n>=0),end=endings.length?Math.min(...endings):text.length;
 const sentence=tokens.filter(t=>t.start>=start&&t.start<end);
 // A tightly bounded pronoun + modal + question verb can corroborate the
 // recipient when a fantasy name is misparsed. Inverted "asked Gunther"
 // alone is insufficient: Gunther might be the speaker in that construction.
 if(/\b(?:jag|du|han|hon|vi|ni|de|i|you|he|she|we|they)\s+(?:ska|skall|skulle|vill|ville|kan|kunde|will|would|can|could|should|must)\s+(?:fråga|ask|question|query)\s+$/iu.test(text.slice(start,hit.start)))return {role:'consulted',reason:'explicit-subject-modal-question',advisoryOnly:true};
 const anchor=inside.find(t=>!['flat','fixed','compound'].includes(t.deprel?.split(':')[0]))||inside[0];
 let relation=String(anchor.deprel||''),governor=sentence.find(t=>t.id===anchor.head);
 const seen=new Set([anchor.id]);
 // A coordinated participant inherits grammar, never campaign ownership.
 while(relation==='conj'&&governor&&!seen.has(governor.id)){seen.add(governor.id);relation=String(governor.deprel||'');governor=sentence.find(t=>t.id===governor.head);}
 const verb=normalize(governor?.lemma||governor?.form||'');
 if(relation==='nsubj:pass'||relation==='csubj:pass')return {role:'affected',reason:'passive-subject',verb,advisoryOnly:true};
 if(relation==='nsubj'||relation==='csubj')return {role:'actor',reason:'grammatical-subject',verb,advisoryOnly:true};
 if(['obj','iobj','obl'].includes(relation.split(':')[0]))return {role:['obj','iobj'].includes(relation)&&['fraga','ask','question','query'].includes(verb)?'consulted':'affected',reason:'grammatical-'+relation,verb,advisoryOnly:true};
 if(relation==='nmod:poss'||relation==='det:poss')return {role:'possessor',reason:'possessive-dependency',advisoryOnly:true};
 return unknown;
}
export function assessText(text,tokens,catalog,choiceFor=()=>null,structure={}){
 const index=prepareCatalog(catalog),resolve=label=>resolveMention(label,catalog,choiceFor(label),index);
 const context=prepareNameContext(text,tokens,structure);
 const found=protectedOccurrences(text,catalog);const filtered=[];
 for(const hit of found){const match=resolve(hit.text);if(match.target&&person(match.target)){const before=text.slice(0,hit.start),prefix=before.match(/(?:^|[^\p{L}\p{N}])((?:(?:king|queen|captain|wight|elf|dwarf|halfling|kung|drottning|kapten|vålnaden|alven|dvärgen|hobbiten)\s+)+)$/iu)?.[1];if(prefix){hit.start-=prefix.length;hit.text=text.slice(hit.start,hit.end);}}}
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(!/^\p{Lu}/u.test(token.form)||!/^\p{L}[\p{L}\p{M}\p{N}’'-]*$/u.test(token.form))continue;
  if(found.some(r=>token.start>=r.start&&token.end<=r.end))continue;
  if(token.upos==='PROPN'){
   let end=token.end,label=token.form;
   while(i+1<tokens.length&&tokens[i+1].upos==='PROPN'&&/^\p{Lu}/u.test(tokens[i+1].form)&&!found.some(r=>tokens[i+1].start>=r.start&&tokens[i+1].start<r.end)&&/^\s+$/u.test(text.slice(end,tokens[i+1].start))){i++;label+=' '+tokens[i].form;end=tokens[i].end;}
   const reason=ordinaryReason(label);
   if(reason&&resolve(label).status==='unknown'&&!/\b(?:heter|kallas|kallades|namnet|named|called)\s+[“"«]?$/iu.test(text.slice(Math.max(0,token.start-55),token.start)))filtered.push({text:label,start:token.start,end,upos:token.upos,lemma:token.lemma,reason});
   else found.push({text:label,start:token.start,end});
  }else filtered.push({text:token.form,start:token.start,upos:token.upos,lemma:token.lemma});
 }
 // The diagnostic/model surface and legacy discovery share whole name spans,
 // including fantasy words that the statistical model did not tag as PROPN.
 for(const span of proposeNameSpans(context))if((explicitNaming(text,span.start)||tokens.some(t=>t.start>=span.start&&t.end<=span.end&&t.upos==='PROPN'))&&!found.some(hit=>span.start<hit.end&&span.end>hit.start&&resolve(hit.text).status!=='unknown')){
  for(let i=found.length-1;i>=0;i--)if(found[i].start>=span.start&&found[i].end<=span.end&&resolve(found[i].text).status==='unknown')found.splice(i,1);
  if(!found.some(hit=>hit.start===span.start&&hit.end===span.end))found.push(span);
 }
 const grouped=new Map();
 const refined=[];
 for(const hit of found){
  const resolution=resolve(hit.text),choice=choiceFor(hit.text),trusted=Boolean(choice?.sourceChoice?.targetUuid||choice?.sourceChoice===true&&choice?.targetUuid);
  if(resolution.reason==='surname-needs-context'&&!trusted&&!tokens.some(t=>t.start>=hit.start&&t.end<=hit.end&&t.upos==='PROPN'))continue;
  const spans=refineNameSpans({text,start:hit.start,end:hit.end,tokens,structure,context,protectedName:['matched','ambiguous'].includes(resolution.status)&&resolution.reason!=='surname-needs-context',trusted});
  if(!spans.length)filtered.push({...hit,reason:'grammatical-span-rejected'});
  for(const span of spans)if(!refined.some(r=>r.start===span.start&&r.end===span.end))refined.push({...hit,...span});
 }
 for(const hit of refined.sort((a,b)=>a.start-b.start)){
  const resolution=resolve(hit.text);if(resolution.status==='ignored')continue;
  if(resolution.status==='unknown'&&ordinaryReason(hit.text)&&! /\b(?:heter|kallas|kallades|namnet|named|called)\s+[“"«]?$/iu.test(text.slice(Math.max(0,hit.start-65),hit.start)))continue;
  if(excludedOccurrence(hit.start,hit.end,structure,{known:resolution.status==='matched'||resolution.status==='ambiguous',participant:resolution.target?.group===true}))continue;
  if(resolution.target&&!person(resolution.target)&&!hit.text.includes(' ')&&/^\p{Ll}/u.test(hit.text))continue;
  if(resolution.target&&!person(resolution.target)&&incompleteName(text,hit.start,hit.end,structure))continue;
  const key=resolution.target?.uuid||normalize(hit.text);const existing=grouped.get(key);const language=tokens.find(t=>t.start>=hit.start&&t.start<hit.end);
  const participant=structure.spans?.some(s=>s.kind==='participants'&&hit.start>=s.start&&hit.end<=s.end);
  const occurrence={...hit,upos:language?.upos||'',lemma:language?.lemma||'',section:structure.blocks?.find(b=>hit.start>=b.start&&hit.end<=b.end)?.section||'narrative',interpretation:participant?{role:'participant',reason:'session-participant-metadata',advisoryOnly:true}:occurrenceRole(text,hit,tokens)};
  if(existing){existing.occurrences.push(occurrence);continue;}
  grouped.set(key,{text:hit.text,...resolution,occurrences:[occurrence],advisoryOnly:true});
 }
 const excludedSpans=[...(structure.spans||[])];
 const chosenOccurrences=[...grouped.values()].filter(row=>row.reason==='confirmed-source-choice').flatMap(row=>row.occurrences);
 for(const word of context.words){
  if(chosenOccurrences.some(o=>word.start>=o.start&&word.end<=o.end))continue;
  if(!occurrenceAllowed({text,start:word.start,end:word.end,tokens,structure,context}))excludedSpans.push({start:word.start,end:word.end,kind:'ordinary',reason:'grammatical-function-word'});
 }

 // Definite common nouns at a sentence/block boundary are not automatically
 // names. Preserve attested names and explicit naming/apposition contexts.
 for(const token of tokens){
  if(token.upos!=='NOUN'||!/^(?:\p{Lu})/u.test(token.form)||!/(?:en|et|arna|erna|orna)$/iu.test(token.form)||!token.lemma||normalize(token.lemma)===normalize(token.form))continue;
  if(resolve(token.form).status!=='unknown'||!(/(?:^|[.!?\n])\s*$/u.test(text.slice(0,token.start))||structure.blocks?.some(b=>b.kind==='narrative'&&b.start===token.start)))continue;
  excludedSpans.push({start:token.start,end:token.end,kind:'ordinary',reason:'sentence-initial-definite-noun'});
 }
 for(const m of text.matchAll(/\b(?:en|ett|a|an)\s+([\p{Lu}][\p{L}-]+\s+(?:Conflict|Check|Test|Roll))\b/gu)){
  const label=m[1],start=m.index+m[0].indexOf(label);if(resolve(label).status==='unknown')excludedSpans.push({start,end:start+label.length,kind:'ordinary',reason:'explicit-game-mechanic'});
 }
 const rows=[...grouped.values()].filter(row=>{row.occurrences=row.occurrences.filter(o=>!excludedSpans.some(s=>s.kind==='ordinary'&&o.start>=s.start&&o.end<=s.end));
  if(row.status==='unknown')row.occurrences=row.occurrences.filter(o=>{o.admission=candidateEvidence({text,start:o.start,end:o.end,tokens,structure,context});if(o.admission.decision!=='ordinary')return true;filtered.push({...o,reason:o.admission.reason});return false;});
  return row.occurrences.length;});
 return {rows,filtered,excludedSpans,policyRevision:POLICY_REVISION};
}



