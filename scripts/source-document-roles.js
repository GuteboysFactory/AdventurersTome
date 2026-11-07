// Source-local document roles. All spans refer to unchanged analysis text.
// These rules describe report fields and grammar, never campaign name lists.
const norm=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export {GRAMMAR_PREFIXES,namePrefixBoundary} from './name-span-policy.js';
export function annotateSourceRoles(structure){
 const {text,blocks}=structure,spans=[...structure.spans],stack=[];let preamble=true;
 const add=(start,end,kind,reason)=>{if(end>start&&!spans.some(s=>s.start===start&&s.end===end&&s.kind===kind&&s.reason===reason))spans.push({start,end,kind,reason});};
 const administrative=new Set(['quest log','quest journal','uppdragslogg','aktiva uppdrag','active quests','framsteg','progress','oppna tradar','open threads','sessionsslut','session end','kallnotering','kallnoteringar','source notes','transcript notes','transcription notes']);
 const editorial=/^(?:kallnotering(?:ar)?|source notes?|transcript(?:ion)? notes?|editorial notes?)$/u;
 const quest=/^(?:quest log|quest journal|uppdragslogg|aktiva uppdrag|active quests)$/u;
 const action=/^(?:[◆•●▪*-]\s*)?((?:radda|hjalpa|forsta|na|hitta|soka|fortsatta|fortsatt|overlev|undersoka|hamta|stoppa|varna|skydda|atervand|save|rescue|help|understand|reach|find|seek|continue|survive|investigate|retrieve|stop|warn|protect|return))\s+/u;
 // Explicit report/table fields may use a colon, a tab or plain whitespace.
 for(const block of blocks){
  const label=text.slice(block.start,block.end),key=norm(label),level=block.level||1;
  if(block.semanticHeading){while(stack.length&&stack.at(-1).level>=level)stack.pop();const role=editorial.test(key)?'editorial':quest.test(key)?'quest':stack.at(-1)?.role||'narrative';stack.push({level,role});if(/^(?:sammanfattning|summary|berattelse|chronicle|story|narrative)$/u.test(key))preamble=false;}
  block.sectionRole=stack.at(-1)?.role||'narrative';
  if(block.sectionRole==='editorial'){add(block.start,block.end,'metadata','source-editorial-note');continue;}
  if(block.semanticHeading&&administrative.has(key)){add(block.start,block.end,'metadata','document-section-label');continue;}
  if(preamble&&label.length<180&&/\b(?:session|campaign)\s+(?:report|rapport)\s*$/iu.test(label)){add(block.start,block.end,'metadata','report-attribution');continue;}
  if(label.length>200)preamble=false;
  const fields=/^(?:datum|date|speltid|duration|play time|session duration|deltagare|participants|players|characters|karaktarer|gm|dm|sl|spelledare|game master|dungeon master)\b/u.exec(key);
  if(fields&&label.length<240){const field=fields[0],m=/^[\p{L}\p{M} ]+?(?=\s*[:：]|\s{2,}|\t|\s+(?:\d|[\p{Lu}]))/u.exec(label),valueAt=m?label.indexOf(m[0])+m[0].length:label.indexOf(' ');const gm=/^(?:gm|dm|sl|spelledare|game master|dungeon master)$/u.test(field),participant=/^(?:deltagare|participants|players|characters|karaktarer)$/u.test(field);
   const value=label.slice(Math.max(0,valueAt)).replace(/^[\s:：]+/u,'');
   const nameList=/^[\p{Lu}][\p{L}\p{M}\p{N}'’" -]*(?:(?:[·,|/]\s*|\s+(?:och|and)\s+)[\p{Lu}][\p{L}\p{M}\p{N}'’" -]*)*$/u.test(value)&&!value.split(/\s+/u).some(word=>/^\p{Ll}/u.test(word)&&!['och','and','de','van','von'].includes(word));
   if((gm||participant)&&(nameList||/^[^:：]+[:：]/u.test(label))||!gm&&!participant&&/\d/u.test(label)){add(block.start,block.end,'metadata',gm?'gamemaster-label':participant?'participant-label':'session-field');if(participant&&valueAt>0){const tail=label.slice(valueAt),skip=tail.match(/^[\s:：]+/u)?.[0].length||0;add(block.start+valueAt+skip,block.end,'participants','session-participants');}continue;}
  }
  if(block.sectionRole==='quest'){
   // Instruction words delimit a task label; people inside it remain candidates.
   const prefix=action.exec(norm(label));if(prefix){const original=label.match(/^(?:[◆•●▪*-]\s*)?([\p{L}\p{M}]+)/u);if(original){const start=block.start+original[0].lastIndexOf(original[1]);add(start,start+original[1].length,'ordinary','task-instruction-prefix');}}
   if(/^(?:spar|status|lage|track|state|objective|description)$/u.test(key))add(block.start,block.end,'metadata','progress-table-label');
  }
 }
 // Domain terms are learned from explicit attribute/skill syntax in THIS source.
 const mechanics=new Set();
 for(const m of text.matchAll(/(?<![\p{L}\p{M}])([\p{Lu}][\p{L}\p{M}]+)([-– ](?:trait|traits|skill|skills|check|test|roll|forsok|försök|kunskaper|varden|värden|paverkan|påverkan))\b/gu)){mechanics.add(m[1]);add(m.index,m.index+m[0].length,'ordinary','explicit-game-mechanic');}
 // A replacement value inherits an explicitly stated game-attribute role.
 for(const name of [...mechanics]){
  const escape=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const m of text.matchAll(new RegExp('(?<![\\p{L}\\p{M}])'+escape+'(?:[-– ]trait)?[^.!?]{0,100}?(?:ersattes med|forandrades till|förändrades till|blivit|changed to|replaced (?:by|with)|became)\\s+([\\p{Lu}][\\p{L}\\p{M}]+)','gu'))){const at=m.index+m[0].lastIndexOf(m[1]);mechanics.add(m[1]);add(at,at+m[1].length,'ordinary','game-attribute-value');}
 }
 for(const name of mechanics){const escape=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const m of text.matchAll(new RegExp('(?<![\\p{L}\\p{M}])'+escape+'(?![\\p{L}\\p{M}])','gu'))){const before=text.slice(Math.max(0,m.index-65),m.index),after=text.slice(m.index+name.length,m.index+name.length+50);
   if(/(?:gruppens|sin|sina|hans|hennes|deras|their|his|her|your|our|slå|rulla|roll|test|från|from|till|to|med|with|blivit|sänkta|låga|höga)\s+$/iu.test(before)||/^(?:\s+(?:till|to)\s+[\p{Lu}][\p{L}\p{M}]+|[-–](?:trait|värden|påverkan))/u.test(after))add(m.index,m.index+name.length,'ordinary','contextual-game-attribute');
  }}
 // Naming a writing/language does not make it a new NPC or place.
 for(const m of text.matchAll(/(?<![\p{L}\p{M}])(?:språket|language|tungan|tongue)\s+([\p{Lu}][\p{L}\p{M}-]+)|(?:inskription(?:er(?:na)?)?|inscription|runor|runes|texten|text)[^.!?]{0,100}?(?:som(?: en form av)?|as(?: a form of)?|på|in)\s+([\p{Lu}][\p{L}\p{M}-]+)/gu)){const label=m[1]||m[2],start=m.index+m[0].lastIndexOf(label);add(start,start+label.length,'ordinary','writing-language-role');}
 return {...structure,spans,blocks,mechanics:[...mechanics]};
}
