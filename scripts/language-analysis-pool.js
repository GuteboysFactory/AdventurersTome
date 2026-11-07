// Read-only, owner-scoped NLP pool. A bounded model per supported language;
// one parse job at a time, never one model reload per mixed-language page.
import {chunks,alignTokens} from './testai-language-core.js';
export function createLanguagePool({allowed=()=>false,owner=()=>'',idleMs=45000,makeWorker=url=>new Worker(url,{type:'module'}),now=()=>performance.now()}={}){
 const workers=new Map(),cache=new Map(),stats={loads:{sv:0,en:0},requests:0,reuses:0,loadMs:0,parseMs:0,idleReleases:0,sourceCharacters:0,parsedCharacters:0,chunks:0};let stamp=owner(),serial=0,tail=Promise.resolve(),closed=false;
 function check(expected=stamp){if(closed||!allowed()||owner()!==expected){dispose();throw Error('Language analysis owner or permission changed.');}}
 function drop(lang,reason){const entry=workers.get(lang);if(!entry)return;clearTimeout(entry.idle);clearTimeout(entry.pending?.timeout);entry.worker.terminate();workers.delete(lang);entry.pending?.reject(Error(reason||'Language worker released.'));}
 function dispose(){closed=true;for(const lang of [...workers.keys()])drop(lang,'Language analysis stopped.');cache.clear();}
 function parse(lang,parts,expected){
  check(expected);let entry=workers.get(lang);
  if(!entry){const worker=makeWorker(new URL('./testai-udpipe-worker.js',import.meta.url));entry={worker,pending:null,idle:null};workers.set(lang,entry);stats.loads[lang]++;
   worker.onerror=event=>drop(lang,event.message||'Language worker failed.');
   worker.onmessage=({data})=>{const pending=entry.pending;if(!pending||data.id!==pending.id||data.progress)return;clearTimeout(pending.timeout);entry.pending=null;
    if(data.error){drop(lang,data.error);pending.reject(Error(data.error));return;}
    try{check(pending.expected);stats.loadMs+=data.result.loadMs;stats.parseMs+=data.result.parseMs;pending.resolve(data.result);entry.idle=setTimeout(()=>{stats.idleReleases++;drop(lang);},idleMs);}catch(error){pending.reject(error);}
   };
  }
  clearTimeout(entry.idle);return new Promise((resolve,reject)=>{const id=++serial;entry.pending={id,expected,resolve,reject,timeout:setTimeout(()=>drop(lang,'Language analysis timed out.'),120000)};entry.worker.postMessage({id,lang,parts});});
 }
 async function evidence(text,mode='auto',structure){
  const blocks=structure?.blocks?.length?structure.blocks.map(b=>({start:b.start,end:b.end,skip:b.skipLanguage===true})):null;
  check();const expected=stamp,started=now(),key=JSON.stringify([text,mode,blocks]);stats.requests++;stats.sourceCharacters+=text.length;
  if(cache.has(key)){stats.reuses++;return {tokens:structuredClone(cache.get(key)),cached:true,elapsedMs:now()-started};}
  const parts=blocks?blocks.filter(b=>!b.skip).flatMap(b=>chunks(text.slice(b.start,b.end),mode,'sv').map(part=>({...part,start:part.start+b.start}))):chunks(text,mode,'sv'),tokens=[];
  stats.chunks+=parts.length;stats.parsedCharacters+=parts.reduce((n,p)=>n+p.text.length,0);
  for(const lang of ['sv','en']){const selected=parts.map((part,index)=>({...part,index})).filter(part=>part.language===lang);if(!selected.length)continue;
   const result=await parse(lang,selected,expected);check(expected);for(const row of result.results){const part=parts[row.index];tokens.push(...alignTokens(part.text,row.tokens,part.start).map(token=>({...token,language:lang,sentenceKey:row.index})));}
  }
  check(expected);tokens.sort((a,b)=>a.start-b.start);cache.set(key,tokens);while(cache.size>128)cache.delete(cache.keys().next().value);
  return {tokens:structuredClone(tokens),cached:false,elapsedMs:now()-started};
 }
 return Object.freeze({assistText(text,{language='auto',structure}={}){const run=tail.catch(()=>{}).then(()=>evidence(String(text),language,structure));tail=run;return run;},dispose,status:()=>({...structuredClone(stats),residentLanguages:[...workers.keys()],cacheEntries:cache.size,closed})});
}
