// One evidence contract shared by discovery, Memory and the final write gate.
import {roleKey} from './source-document-map.js';
export const INTEGRATED_REVISION='integrated-evidence-3';
export function decisionRows(result){
 return result.decisions.map(d=>({text:d.text,normalized:roleKey(d.text),
  status:d.action==='link'?'matched':d.action==='review'&&d.candidates?.length?'ambiguous':'unknown',reason:d.reason,
  target:d.targetUuid?{uuid:d.targetUuid,name:d.text,kind:d.kind}:null,
  candidates:d.targetUuid?[{uuid:d.targetUuid,name:d.text,kind:d.kind}]:d.candidates||[],
  worldReference:d.reference,decision:d,
  occurrences:d.evidence.map(e=>({text:e.proof.quote,start:e.proof.start,end:e.proof.end}))}));
}
export function discoveryGroups(result){
 return decisionRows(result).map(r=>({
  grouped:{text:r.text,normalized:r.normalized,tokenCount:r.text.split(/\s+/u).length,
   occurrences:r.occurrences.map(o=>({...o,context:result.map.text.slice(Math.max(0,o.start-105),o.end+105)}))},
  classification:{kind:r.decision.kind,confidence:1,signals:['document-language-evidence'],alternatives:[]},
  detection:{score:1,band:'review',signals:['integrated-interpretation']},disposition:'review',
  worldReference:r.worldReference,nameEvidence:{decision:'review',reason:r.reason},
  briefing:{},interpretation:{revision:INTEGRATED_REVISION,sourceHash:result.sourceHash,action:r.decision.action}
 }));
}
export function sameDecision(result,row){
 const key=roleKey(row.text);
 return result.decisions.find(d=>roleKey(d.text)===key||d.evidence?.some(e=>roleKey(e.proof?.quote)===key))||null;
}
export function writeDisposition(decision){
 if(!decision)return {outcome:'UNVERIFIED',reason:'no-current-source-evidence'};
 if(decision.action==='link'&&decision.targetUuid)return {outcome:'LINKED',targetUuid:decision.targetUuid,reason:decision.reason};
 if(decision.action==='create'&&decision.reference)return {outcome:'CREATE',reference:decision.reference,reason:decision.reason};
 return {outcome:'REVIEW',reason:decision.reason,candidates:decision.candidates||[]};
}
