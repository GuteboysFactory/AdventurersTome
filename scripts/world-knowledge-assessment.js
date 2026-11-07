import {normalize,resolveMention,excludedOccurrence} from './testai-language-core.js';
import {decideReference} from './tome-decision-policy.js';
import {occurrenceAllowed,prepareNameContext} from './candidate-evidence.js';
// Enrichment retains campaign decisions and occurrence offsets. A reference
// carries no invented UUID; only an actual campaign document can be a target.
export function assessWorldReferences(text,assessment,engine,catalog,choiceFor,structure){
 const references=[],groundedHits=[],nameContext=prepareNameContext(text,assessment.tokens||[],structure);
 for(const hit of engine.mentions(text)){
  if(hit.status!=='recognized'||excludedOccurrence(hit.start,hit.end,structure||{},{known:true}))continue;
  const choice=choiceFor?.(hit.text)||choiceFor?.(hit.references[0].name),campaign=resolveMention(hit.text,catalog,choice);
  if(!occurrenceAllowed({text,start:hit.start,end:hit.end,structure,context:nameContext,trusted:Boolean(choice?.sourceChoice)}))continue;
  const grounded=decideReference({lookup:hit,catalog,choice});
  if(grounded.status==='ambiguous'){
   for(const row of assessment.rows)if(row.occurrences.some(o=>o.start===hit.start&&o.end===hit.end))Object.assign(row,{status:'ambiguous',target:null,candidates:grounded.candidates,reason:'library-entity-type-conflict'});
  }
  if(grounded.status==='existing'){
   groundedHits.push(hit);let covered=false;
   for(const row of assessment.rows)if(row.occurrences.some(o=>o.start===hit.start&&o.end===hit.end)){Object.assign(row,{status:'matched',target:grounded.target,candidates:[grounded.target],reason:grounded.reason});covered=true;}
   if(!covered)assessment.rows.push({text:hit.text,normalized:normalize(hit.text),status:'matched',target:grounded.target,candidates:[grounded.target],reason:grounded.reason,occurrences:[{text:hit.text,start:hit.start,end:hit.end}]});
  }
  if(campaign.status!=='unknown'||choice)continue;
  if(assessment.excludedSpans?.some(s=>hit.start>=s.start&&hit.end<=s.end))continue;
  // A name used explicitly for a person in this source is not turned into a
  // place merely because it also occurs in a gazetteer.
  const nearby=text.slice(Math.max(0,hit.start-24),hit.start);
  if(hit.references[0].kind!=='npc'&&/(?:king|queen|captain|kung|drottning|kapten)\s+$/iu.test(nearby))continue;
  references.push({...hit,reference:hit.references[0]});
 }
 const wholeNames=[...groundedHits,...references];
 const rows=assessment.rows.map(row=>({...row,occurrences:row.occurrences.filter(o=>row.reason==='confirmed-source-choice'||!wholeNames.some(hit=>o.start>=hit.start&&o.end<=hit.end&&(o.start!==hit.start||o.end!==hit.end)))})).filter(row=>row.occurrences.length);
 for(const hit of references){
  const existing=rows.find(r=>r.status==='unknown'&&r.occurrences.some(o=>o.start===hit.start&&o.end===hit.end));
  if(existing){existing.worldReference=hit.reference;continue;}
  // Do not let a fragment or a statistical candidate swallow a whole reference.
  rows.push({text:hit.text,normalized:normalize(hit.text),status:'unknown',reason:'world-reference-not-in-campaign',candidates:[],worldReference:hit.reference,occurrences:[{text:hit.text,start:hit.start,end:hit.end}]});
 }
 // Present identities, not one question per dictionary occurrence. Preserve
 // exact source offsets for every occurrence and never merge different UUIDs.
 const grouped=new Map();
 for(const row of rows){
  const reference=row.worldReference,key=[row.status,row.target?.uuid||'',reference?reference.packId+':'+reference.id:'',...(row.status==='ambiguous'?(row.candidates||[]).map(c=>c.uuid).sort():[]),row.target?.uuid||reference?'':normalize(row.text)].join('|');
  const old=grouped.get(key);
  if(!old){grouped.set(key,{...row,occurrences:[...row.occurrences]});continue;}
  const spans=new Set(old.occurrences.map(o=>o.start+':'+o.end));
  old.occurrences.push(...row.occurrences.filter(o=>!spans.has(o.start+':'+o.end)));
 }
 for(const row of grouped.values()){row.occurrences.sort((a,b)=>a.start-b.start);row.text=row.occurrences[0].text||row.text;row.normalized=normalize(row.text);}
 return {...assessment,rows:[...grouped.values()],worldReferences:references};
}
