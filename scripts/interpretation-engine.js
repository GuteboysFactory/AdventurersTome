import {documentMap,structureFromMap,roleKey} from './source-document-map.js';
import {assessTextAsync,occurrenceRole} from './testai-language-core.js';
import {assessWorldReferences} from './world-knowledge-assessment.js';
import {candidateEvidence,prepareNameContext} from './candidate-evidence.js';
import {sourceDigest,feedbackFor} from './interpretation-feedback.js';
import {decideReference} from './tome-decision-policy.js';
export const INTERPRETATION_REVISION='evidence-interpreter-shadow-1';
const forbidden=new Set(['section-label','field-label','campaign-metadata','editorial','status-value','task-prefix','mechanic','section-reference']);
const locationRole=/\b(?:city|town|village|station|planet|port|harbour|inn|tavern|stad|by|planet|hamn|vardshus|ruin)\s+(?:named|called|heter|kallas)?\s*$/iu;
const personRole=/\b(?:scout|engineer|pilot|doctor|captain|sailor|merchant|spejare|ingenjor|lakare|kapten|handlare|herde)\s+(?:named|called|heter|kallas)?\s*$/iu;
export function occurrenceProof(map,occurrence,tokens,sourceHash,feedback=[]){
 const start=occurrence.start,end=occurrence.end,node=map.nodes.find(n=>start>=n.start&&end<=n.end),spans=map.spans.filter(s=>start<s.end&&end>s.start),reasons=[];
 const corrected=feedback.map(r=>feedbackFor(r,map,sourceHash,start,end)).find(Boolean);
 const rejected=spans.some(s=>forbidden.has(s.role))||node&&forbidden.has(node.role)||corrected;
 if(!node)reasons.push('no-source-block');
 if(rejected)reasons.push(corrected?'gm-source-role-correction':'non-entity-document-role');
 const prefix=roleKey(map.text.slice(Math.max(node?.start||0,start-75),start)),sentence=tokens.find(t=>t.start>=start&&t.end<=end)?.sentenceKey,syntax=occurrenceRole(map.text,occurrence,sentence===undefined?tokens:tokens.filter(t=>t.sentenceKey===sentence));
 const sourceRole=node?.valueRole==='person'?'person':node?.valueRole==='location'?'location':personRole.test(prefix)?'person':locationRole.test(prefix)?'location':null;
 return {sourceUuid:map.sourceUuid,nodeId:node?.id,path:node?.path,start,end,quote:map.text.slice(start,end),documentRole:node?.role||'unknown',documentConfidence:node?.confidence||0,sourceRole,syntax,rejected:Boolean(rejected||!node),reasons,correction:corrected||null};
}
// No action executor is supplied. Even a grounded link/create result is a plan.
export async function interpretSource({html,sourceUuid,sourceName,catalog=[],choiceFor=()=>null,historyFor=()=>[],knowledge=null,language,feedback=[],baseline=[],tokens:providedTokens}){
 const owner=()=>globalThis.game?String(game.world?.id)+':'+String(game.user?.id):'',expectedOwner=owner();
 const checkpoint=async()=>{if(globalThis.AdventurersTomeBackground?.checkpoint)await globalThis.AdventurersTomeBackground.checkpoint();else await new Promise(resolve=>setTimeout(resolve,0));if(owner()!==expectedOwner||globalThis.game&&game.user?.isGM!==true)throw Error('Interpretation owner changed.');};
 const started=performance.now(),map=documentMap(html,{sourceUuid,sourceName}),sourceHash=await sourceDigest(String(html)),structure=structureFromMap(map);
 map.spans=structure.spans.map(span=>({...span,role:span.role||(span.kind==='ordinary'?'mechanic':span.kind==='metadata'?'campaign-metadata':span.kind)}));
 const languageResult=providedTokens?{tokens:providedTokens}:await language.assistText(map.text,{sourceUuid,structure:{text:map.text,blocks:map.nodes.map(n=>({start:n.start,end:n.end,skipLanguage:forbidden.has(n.role)})),spans:[]}});
 const tokens=languageResult.tokens||[],context=prepareNameContext(map.text,tokens,structure),raw=await assessTextAsync(map.text,tokens,catalog,choiceFor,{text:map.text,blocks:[],spans:[]},checkpoint);
 let assessment=await assessTextAsync(map.text,tokens,catalog,choiceFor,structure,checkpoint);if(knowledge)assessment=assessWorldReferences(map.text,assessment,knowledge,catalog,choiceFor,structure);
 const diagnostics=[],decisions=[],facts=[...map.facts];
 for(const row of raw.rows)for(const occurrence of row.occurrences){const proof=occurrenceProof(map,occurrence,tokens,sourceHash,feedback);if(proof.rejected)diagnostics.push({text:occurrence.text,decision:'exclude',reason:'structure-language-disagreement',proof});}
 for(const row of assessment.rows){
  const evidence=[];for(const occurrence of row.occurrences){
   const proof=occurrenceProof(map,occurrence,tokens,sourceHash,feedback),signals=proof.sourceRole==='person'?['person-role-apposition']:proof.sourceRole==='location'?['location-source-role']:[];
   const admission=candidateEvidence({text:map.text,start:occurrence.start,end:occurrence.end,tokens,structure,context,signals});evidence.push({proof,admission});
  }
  const usable=evidence.filter(e=>!e.proof.rejected&&e.proof.documentRole!=='unknown');
  if(!usable.length){diagnostics.push({text:row.text,decision:'exclude',reason:'no-supported-entity-context',evidence});continue;}
  const choice=choiceFor(row.text),ground=knowledge?.lookup(row.text),authority=ground?decideReference({lookup:ground,catalog,choice}):null,history=historyFor(row.text)||[],kind=row.target?.kind||row.worldReference?.kind||usable.find(e=>e.proof.sourceRole)?.proof.sourceRole||'unknown';
  const typeConflict=usable.some(e=>e.proof.sourceRole==='location'&&['character','npc','contact','person'].includes(kind)||e.proof.sourceRole==='person'&&['location','faction','item'].includes(kind));
  let action='observe',reason='insufficient-independent-support';
  if(typeConflict||row.status==='ambiguous'){action='review';reason=typeConflict?'source-identity-type-conflict':row.reason;}
  else if(row.status==='matched'&&row.target){action='link';reason=row.reason;}
  else if(row.worldReference&&authority?.status==='blocked'){action='observe';reason=authority.reason;}
  else if(row.worldReference&&authority?.status==='ambiguous'){action='review';reason=authority.reason;}
  else if(row.worldReference&&authority?.status==='create'&&history.length){action='review';reason='deleted-reference-needs-gm-decision';}
  else if(row.worldReference&&authority?.status==='create'){action='create';reason='verified-unique-world-reference';}
  else if(usable.some(e=>e.admission.decision==='review')){action='review';reason='source-supported-new-identity';}
  if(choice?.action==='source-ignored'||choice?.action==='suppressed'){action='exclude';reason='gm-choice';}
  const decision={text:row.text,action,reason,kind,targetUuid:row.target?.uuid||null,candidates:(row.candidates||[]).map(c=>({uuid:c.uuid,name:c.name,kind:c.kind})),reference:row.worldReference||null,evidence:usable,sourceUuid,sourceHash,automaticWriteAuthorized:false};
  if(action==='observe'||action==='exclude')diagnostics.push(decision);else decisions.push(decision);
 }
 // Evidence extraction records attributed state changes, not inferred identity.
 for(const node of map.nodes.filter(n=>['narrative','quest-instruction','followup'].includes(n.role))){
  for(const m of node.text.matchAll(/([\p{Lu}][\p{L}\p{M}'’ -]{1,55}?)\s+(?:blir|blev|becomes|became|is marked)\s+([\p{Lu}][\p{L}\p{M}-]+)/gu))facts.push({kind:'state-change',subjectText:m[1],value:m[2],nodeId:node.id,quote:m[0],assertedAsCampaignFact:false});
 }
 const forbiddenDecisions=decisions.filter(d=>d.evidence.some(e=>e.proof.rejected));if(forbiddenDecisions.length)throw Error('Interpretation invariant violated: excluded context reached an identity decision.');
 const oldNames=new Set(baseline.map(r=>roleKey(r.text||r.mentionText))),newNames=new Set(decisions.map(r=>roleKey(r.text)));
 return {tokens,revision:INTERPRETATION_REVISION,mode:'read-only-shadow',sourceUuid,sourceHash,map,decisions,diagnostics,facts,questDrafts:map.quests,comparison:{removed:[...oldNames].filter(n=>!newNames.has(n)),added:[...newNames].filter(n=>!oldNames.has(n))},metrics:{elapsedMs:performance.now()-started,modelAvailable:tokens.length>0,blocks:map.nodes.length,tokens:tokens.length,decisions:decisions.length},canonicalWrites:0};
}
