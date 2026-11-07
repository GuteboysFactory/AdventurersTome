// Reference knowledge is never a Foundry identity or permission authority.
import {normalize} from './testai-language-core.js';
export function createWorldKnowledge(){
 const packs=new Map();let selected=[],index=new Map(),pattern=null,revision='none';
 const forms=name=>[name,name.replace(/[-‐‑–]/gu,' ')].flatMap(n=>[n,n+'s',n+"'s",n+'’s']);
 function register(input,{allowCampaign=false}={}){
  if(!input||!/^[-a-z0-9]+$/u.test(input.id)||typeof input.version!=='string'||!Array.isArray(input.entries)||input.entries.length>5000||JSON.stringify(input).length>2*1024*1024)throw Error('Invalid or oversized world pack.');
  const pack=structuredClone(input),ids=new Set();
  for(const row of pack.entries){
   if(typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>160||!['location','faction','npc'].includes(row.kind)||!Array.isArray(row.aliases)||row.aliases.length>40||!row.sources?.length||row.sources.length>10||row.uuid||row.canonicalUuid)throw Error('Invalid world reference.');ids.add(row.id);
   if(row.aliases.some(a=>typeof a!=='string'||a.length>160)||Object.values(row.summary||{}).some(s=>typeof s!=='string'||s.length>600)||row.sources.some(s=>!/^https:\/\//u.test(s.url||'')&&!(allowCampaign&&pack.scope==='campaign'&&s.type==='campaign'&&typeof s.label==='string'&&s.label.length>0&&s.label.length<=300)))throw Error('Invalid reference fields.');
   if(row.relations&&(!Array.isArray(row.relations)||row.relations.length>20||row.relations.some(r=>!['located-in','near','part-of','residence','born-in','headquarters','associated-with'].includes(r.type)||typeof r.targetId!=='string'||r.targetId.length>160||typeof r.targetName!=='string'||r.targetName.length>160)))throw Error('Invalid reference relations.');
  }
  packs.set(pack.id,pack);if(selected.includes(pack.id))select(selected);return pack.entries.length;
 }
 function select(ids=[]){
  if(!Array.isArray(ids)||ids.some(id=>!packs.has(id)))throw Error('Unknown world pack.');
  selected=[...new Set(ids)].sort();index=new Map();const spellings=new Set();
  for(const id of selected)for(const row of packs.get(id).entries){
   for(const name of [row.name,...row.aliases]){
    const key=normalize(name);if(!key)continue;const entries=index.get(key)||[];
    if(!entries.some(r=>r.packId===id&&r.id===row.id))entries.push({...row,packId:id,packName:packs.get(id).title,packVersion:packs.get(id).version,advisoryOnly:true});index.set(key,entries);
    for(const form of forms(name))spellings.add(form);
   }
  }
  const escaped=[...spellings].sort((a,b)=>b.length-a.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  pattern=escaped.length?new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{M}\\p{N}])`,'giu'):null;
  revision=selected.map(id=>id+'@'+packs.get(id).version).join('|')||'none';
 }
 function lookup(text){
  let matches=index.get(normalize(text))||[],reason='reference-name-or-alias';
  if(!matches.length){const raw=String(text).replace(/[’']s$/iu,'').replace(/s[’']$/iu,'s');const base=/s$/iu.test(raw)?raw.slice(0,-1):raw;matches=index.get(normalize(base))||index.get(normalize(raw))||[];reason='attested-reference-genitive';}
  return {status:matches.length===1?'recognized':matches.length?'ambiguous':'unknown',reason,references:structuredClone(matches),canonical:false};
 }
 function mentions(text){if(!pattern)return [];const out=[];pattern.lastIndex=0;for(const m of text.matchAll(pattern)){if(/^\p{Ll}/u.test(m[0])&&!m[0].includes(' '))continue;out.push({text:m[0],start:m.index,end:m.index+m[0].length,...lookup(m[0])});}return out;}
 return Object.freeze({register,select,lookup,mentions,status:()=>({selected:[...selected],revision,entries:selected.reduce((n,id)=>n+packs.get(id).entries.length,0),canonicalWrites:false})});
}

