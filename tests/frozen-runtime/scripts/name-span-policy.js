// One occurrence-level language gate for every automatic name provider.
// Capitalisation generates proposals; grammar, syntax or source roles admit them.
// Closed grammatical classes are language data, never campaign/entity blacklists.
import {WORD_ROLES} from '../data/language/common-word-roles.js';
export const NAME_POLICY_REVISION='name-spans-1';
const key=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const classes={
 conjunction:'och eller men utan samt ty for and or but nor yet',
 subordinator:'att eftersom ifall medan nar darfor darforatt fast fastan innan tills om sa an although because if unless until whereas whether while than that',
 pronoun:'jag du han hon hen vi ni de det den dem mig dig honom henne oss er sig man nagon nagot nagra ingen inget inga vem vad vilken vilket vilka i you he she it we they me him her us them who whom whose what which someone something nobody nothing',
 determiner:'en ett denna detta dessa dennes hennes deras dess min mitt mina din ditt dina sin sitt sina var vart vara er ert era the a an this these those my your his its our their each every either neither some any such',
 adposition:'av till fran hos med mot mellan bland genom under over utan vid pa ur efter fore bakom framfor inom utom omkring enligt at by from in into of on onto out through toward towards upon via with without between among before behind beyond during near',
 auxiliary:'ska skall skulle kan kunde maste bor borde vill ville far fick ar var varit vara bli blev blir blivit be am is are was were been being do does did have has had shall should would could must might ought',
 particle:'inte ej icke ju val nog bara aven ocksa not to',
 transition:'sedan darefter efterat dock dessutom alltsa darfor nu then however also meanwhile therefore otherwise finally'
};
const grammar=new Map();for(const [type,words]of Object.entries(classes))for(const word of words.split(' '))grammar.set(word,type);
// These spellings genuinely also occur as given names. Syntax/catalogue evidence
// decides their use; a modal spelling must not erase an attested Will Turner.
const ambiguous=new Set(['will','may','can']);
const articles=new Set(['the','a','an']);
const connectors=new Set(['of','de','del','van','von','der','den','di','du','la','le']);
const documentRoles=new Set('sl dm gm spelare spelarna spelaren gruppen grupp aventyrarna aventyrare party player players session sessionen sessionens overview sammanfattning'.split(' '));
const FUNCTION_POS=new Set(['CCONJ','SCONJ','PRON','DET','ADP','AUX','PART','NUM']);
export const GRAMMAR_PREFIXES=new Set(grammar.keys());
export function explicitNaming(text,start){return /\b(?:heter|kallas|kallades|namnet|named|called)\s+[“"«]?$/iu.test(String(text).slice(Math.max(0,start-65),start));}
export function prepareNameContext(text,tokens=[],structure={}){
 const byStart=new Map(tokens.map(t=>[t.start,t]));
 const words=[...String(text).matchAll(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’–-]*/gu)].map(m=>{
  const token=byStart.get(m.index),lex=WORD_ROLES[token?.language],forms=[key(m[0]),key(token?.lemma)];
  const lexicalMask=forms.reduce((mask,form)=>mask|(lex?lex[form]||0:(WORD_ROLES.sv[form]||0)|(WORD_ROLES.en[form]||0)),0);
  return {form:m[0],start:m.index,end:m.index+m[0].length,token,lexicalMask};
 });
 return {text,tokens,structure,words};
}
function wordsIn(context,start,end){
 const words=context.words;let lo=0,hi=words.length;while(lo<hi){const mid=(lo+hi)>>>1;if(words[mid].start<start)lo=mid+1;else hi=mid;}
 const out=[];for(let i=lo;i<words.length&&words[i].end<=end;i++)out.push(words[i]);return out;
}
function grammarWord(word){
 const k=key(word.form),token=word.token;
 if(ambiguous.has(k)&&token?.upos==='PROPN')return false;
 if(grammar.has(k)||ambiguous.has(k)&&FUNCTION_POS.has(token?.upos))return true;
 // Attested closed-class words need not be enumerated in the hand-written
 // grammar profile. Proper-name uses in the data keep ambiguous spellings open.
 if(word.lexicalMask&32&&!(word.lexicalMask&16))return true;
 return FUNCTION_POS.has(token?.upos)&&token?.lemma&&/^\p{Ll}/u.test(token.lemma);
}
function ordinaryWord(word){
 const t=word.token;
 const posMask={ADJ:1,ADV:2,VERB:4,NOUN:8}[t?.upos]||0,attested=Boolean(word.lexicalMask&posMask);
 return grammarWord(word)||Boolean(t&&t.upos!=='PROPN'&&t.lemma&&(/^\p{Ll}/u.test(t.lemma)||attested)&&
  (['ADJ','ADV','VERB'].includes(t.upos)||t.upos==='NOUN'&&(key(t.form)!==key(t.lemma)||attested)));
}
export function refineNameSpans({text,start,end,tokens=[],structure={},context,protectedName=false,trusted=false}){
 context||=prepareNameContext(text,tokens,structure);const words=wordsIn(context,start,end);
 if(!words.length)return [];
 if(trusted||explicitNaming(text,start))return [{start,end,text:String(text).slice(start,end),reason:'explicit-name'}];
 // Exact catalogue/reference names protect established internal connectors and
 // titles, not a spurious leading conjunction attached to somebody else's name.
 if(protectedName&&(!grammarWord(words[0])||articles.has(key(words[0].form))&&words.length>1||words.length===1&&grammar.get(key(words[0].form))==='transition'||ambiguous.has(key(words[0].form))))return [{start,end,text:String(text).slice(start,end),reason:'catalogue-name'}];
 const spans=[];let run=[];
 const flush=()=>{if(run.length){const first=run[0],last=run.at(-1);spans.push({start:first.start,end:last.end,text:String(text).slice(first.start,last.end),reason:'grammatical-name-boundary'});run=[];}};
 for(let i=0;i<words.length;i++){
  const word=words[i],k=key(word.form),next=words[i+1],previous=words[i-1];
  const role=structure.spans?.some(s=>s.kind==='ordinary'&&word.start>=s.start&&word.end<=s.end);
  const article=articles.has(k)&&!run.length&&next&&!grammarWord(next);
  const connector=connectors.has(k)&&run.length&&next&&!grammarWord(next);
  const boundary=previous&&!/^\s+$/u.test(String(text).slice(previous.end,word.start));
  if(boundary)flush();
  if(role||!article&&!connector&&(grammarWord(word)||!protectedName&&ordinaryWord(word))){flush();continue;}
  run.push(word);
 }
 flush();return spans;
}
export function namePrefixBoundary(text,start,end,tokens=[],structure={}){
 const spans=refineNameSpans({text,start,end,tokens,structure});return spans[0]?.start>start?spans[0].start:null;
}
export function proposeNameSpans(context){
 const {text,tokens,structure,words}=context,spans=[];
 const boundaries=new Set((structure.blocks||[]).flatMap(b=>[b.start,b.end]));
 for(let i=0;i<words.length;i++){
  if(!/^\p{Lu}/u.test(words[i].form))continue;
  let j=i;
  while(j+1<words.length&&j-i<8&&!boundaries.has(words[j].end)&&!boundaries.has(words[j+1].start)&&/^\s+$/u.test(text.slice(words[j].end,words[j+1].start))&&(/^\p{Lu}/u.test(words[j+1].form)||connectors.has(key(words[j+1].form))))j++;
  while(j>i&&connectors.has(key(words[j].form)))j--;
  spans.push(...refineNameSpans({text,start:words[i].start,end:words[j].end,tokens,structure,context}));i=j;
 }
 return spans;
}
export function occurrenceAllowed({text,start,end,tokens=[],structure={},context,trusted=false}){
 const spans=refineNameSpans({text,start,end,tokens,structure,context,protectedName:true,trusted});
 return spans.some(s=>s.start===start&&s.end===end);
}
export function nameEvidence({text,start,end,tokens=[],structure={},signals=[],context}){
 context||=prepareNameContext(text,tokens,structure);
 const words=wordsIn(context,start,end),label=String(text).slice(start,end);
 if(structure.spans?.some(s=>['metadata','heading','ordinary'].includes(s.kind)&&start>=s.start&&end<=s.end))return {decision:'ordinary',reason:'document-or-ordinary-span'};
 const named=explicitNaming(text,start);
 if(!named&&documentRoles.has(key(label)))return {decision:'ordinary',reason:'ordinary-document-or-game-role'};
 if(!named&&!refineNameSpans({text,start,end,tokens,structure,context}).some(s=>s.start===start&&s.end===end))return {decision:'ordinary',reason:'grammatical-span-rejected'};
 const attached=named||signals.some(s=>['person-role-apposition','location-source-role','document-title-source-role','faction-name-prefix'].includes(s)||s==='character-title'&&words.length>1);
 if(attached)return {decision:'review',reason:'attached-entity-role'};
 const inside=words.map(w=>w.token).filter(Boolean);
 if(inside.length&&words.every(ordinaryWord))return {decision:'ordinary',reason:'ordinary-language-structure'};
 if(words.length>1&&!/\p{Ll}/u.test(label))return {decision:'ordinary',reason:'typographic-label'};
 const names=words.filter(w=>!articles.has(key(w.form))&&!connectors.has(key(w.form))),proper=names.filter(w=>w.token?.upos==='PROPN');
 // Unknown multiword proposals need actual language evidence. Adjacent capitals
 // alone, especially when the parser is unavailable, never open a GM question.
 if(names.length>1&&proper.length&&names.every(w=>w.token?.upos==='PROPN'||w.token?.lemma&&/^\p{Lu}/u.test(w.token.lemma)&&!ordinaryWord(w)))return {decision:'review',reason:'syntax-supported-multiword-name'};
 const prefix=String(text).slice(0,start),initial=structure.blocks?.some(b=>b.start===start)||/(?:^|[.!?\n])\s*$/u.test(prefix);
 if(names.length===1&&proper.length&&!initial)return {decision:'review',reason:'proper-name-in-narrative',syntax:[...new Set(inside.map(t=>t.deprel).filter(Boolean))]};
 return {decision:'observe',reason:!tokens.length?'language-evidence-unavailable':proper.length?'sentence-start-needs-corroboration':'capitalisation-without-name-evidence'};
}
