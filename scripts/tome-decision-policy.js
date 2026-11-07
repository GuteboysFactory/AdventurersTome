// One authority policy, shared by name resolution, reference grounding and
// commit preparation. Pure inputs only; no document creation or permissions.
export const DECISION_REVISION='tome-decisions-3';
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const id=r=>r.uuid||r.canonicalUuid||r.match?.authorityUuid||'';
const person=r=>['character','npc','person','contact','pc'].includes(r.kind);
export function documentRole(doc){
 if(doc?.documentName!=='Actor')return 'identity';
 const flags=doc.flags||{},t=flags['adventurers-tome']||{},r=flags['realm-guard']||{};
 if(t.testaiIdentityRole==='template'||t.actorProfile?.kind==='template'||doc.type==='template'||doc.system?.isTemplate===true||doc.system?.template===true||r.isTemplate===true)return 'template';
 // Instance creation retains metadata, but adds an explicit instance marker.
 if(r.npcTemplate?.templateId&&!r.createdFromNpcTemplate&&!r.createdFromNpcTemplateId)return 'template';
 return 'identity';
}
export function selectAuthority(input){
 const rows=[...new Map(input.map(r=>[id(r),r])).values()];
 // A Contact and an NPC are only the same identity when their UUID-backed
 // authority has explicitly been reconciled upstream. Name equality is not proof.
 return {rows,reason:rows.length===1?'single-authority':'distinct-authorities'};
}
export function referenceKey(reference){return reference?.packId&&reference?.id?reference.packId+':'+reference.id:'';}
export function decideReference({lookup,catalog=[],choice=null,blocked=false}){
 const trace=['gm-policy','campaign-identities','selected-world-library'];
 if(choice||blocked)return {status:'blocked',reason:'gm-policy',trace};
 if(lookup?.status!=='recognized'||lookup.references?.length!==1)return {status:lookup?.status==='ambiguous'?'ambiguous':'unknown',reason:'reference-not-unique',trace};
 const reference=lookup.references[0],key=referenceKey(reference);
 if(!key||!['location','faction','npc'].includes(reference.kind)||!reference.sources?.length)return {status:'unknown',reason:'unverified-reference',trace};
 const names=new Set([reference.name,...reference.aliases].map(norm));
 const candidates=catalog.filter(r=>r.role!=='template'&&/^(JournalEntry|Scene|Actor|Item)\.[^.]+$/u.test(id(r))
  &&(r.referenceKey===key||[r.name,...(r.aliases||[])].some(n=>names.has(norm(n)))));
 if(candidates.some(r=>r.excluded||r.paused))return {status:'blocked',reason:'campaign-identity-disabled',reference,candidates,trace};
 const sameKind=r=>reference.kind==='npc'?person(r):r.kind===reference.kind;
 const locations=candidates.filter(sameKind);
 const canonical=locations.filter(r=>r.referenceKey===key);
 const pool=canonical.length?canonical:locations;
 const worlds=pool.filter(r=>/^JournalEntry\./u.test(id(r)));
 const selected=worlds.length===1&&pool.every(r=>r===worlds[0]||/^Scene\./u.test(id(r)))?worlds:pool;
 if(candidates.some(r=>!sameKind(r))||selected.length>1)return {status:'ambiguous',reason:'reference-campaign-conflict',reference,candidates,trace};
 if(selected.length===1)return {status:'existing',reason:reference.kind==='npc'?'library-person-authority':'library-location-authority',reference,target:selected[0],trace};
 return {status:'create',reason:reference.kind==='npc'?'verified-library-person':'verified-library-location',reference,trace:[...trace,'no-existing-identity']};
}
globalThis.AdventurersTomeDecisionPolicy=Object.freeze({selectAuthority,decideReference,referenceKey,documentRole,revision:DECISION_REVISION});
