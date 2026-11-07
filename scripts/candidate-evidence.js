import {namePrefixBoundary,GRAMMAR_PREFIXES,prepareNameContext,refineNameSpans,proposeNameSpans,occurrenceAllowed,nameEvidence,explicitNaming,NAME_POLICY_REVISION} from './name-span-policy.js';
export {namePrefixBoundary,prepareNameContext,refineNameSpans,proposeNameSpans,occurrenceAllowed,explicitNaming,NAME_POLICY_REVISION};
// Shared, source-local admission policy. Capitalisation proposes a span; it
// never on its own establishes an identity or a question for the GM.
export function incompleteName(text,start,end,structure={},context){
 const block=structure.blocks?.find(b=>start>=b.start&&end<=b.end);
 const left=String(text).slice(block?.start||0,start),right=String(text).slice(end,block?.end??text.length);
 const previous=left.match(/([\p{L}\p{M}'’-]+)\s+$/u)?.[1];
 const next=right.match(/^\s+([\p{L}\p{M}'’-]+)/u)?.[1];
 const grammar=value=>GRAMMAR_PREFIXES.has(String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
 const previousAt=previous?start-(left.match(/([\p{L}\p{M}'’-]+)\s+$/u)?.[0].length||0):start;
 const rolePrefix=structure.spans?.some(span=>span.kind==='ordinary'&&previousAt>=span.start&&previousAt<span.end);
 const joins=(from,to)=>!context||refineNameSpans({text,start:from,end:to,tokens:context.tokens,structure,context}).some(s=>s.start<=from&&s.end>=to);
 return Boolean(previous&&/^\p{Lu}/u.test(previous)&&!['the','a','an'].includes(previous.toLowerCase())&&!grammar(previous)&&!rolePrefix&&joins(previousAt,end)||next&&/^\p{Lu}/u.test(next)&&!grammar(next)&&joins(start,end+(right.match(/^\s+([\p{L}\p{M}'’-]+)/u)?.[0].length||0)));
}
export function candidateEvidence(input){
 const evidence=nameEvidence(input);
 if(evidence.decision==='review'&&evidence.reason!=='attached-entity-role'&&incompleteName(input.text,input.start,input.end,input.structure,input.context||prepareNameContext(input.text,input.tokens,input.structure)))return {decision:'observe',reason:'incomplete-name-span'};
 return evidence;
}
globalThis.AdventurersTomeCandidateEvidence=Object.freeze({candidateEvidence,incompleteName,namePrefixBoundary,prepareNameContext,refineNameSpans,proposeNameSpans,occurrenceAllowed,explicitNaming,revision:NAME_POLICY_REVISION});
