import {loadParser} from '../vendor/udpipe/runtime.mjs';
let parser=null,language='';
self.onmessage=async ({data})=>{
 const {id,lang,parts}=data;
 try{
  if(!['sv','en'].includes(lang)||!Array.isArray(parts))throw Error('Invalid language request.');
  const began=performance.now();
  if(language&&language!==lang)throw Error('One model per worker.');
  if(!parser){parser=await loadParser({modelUrl:new URL(`../vendor/udpipe/${lang}.udpipe`,import.meta.url).href,wasmUrl:new URL('../vendor/udpipe/udpipe.wasm',import.meta.url).href});language=lang;}
  const loaded=performance.now();const results=[];
  for(let i=0;i<parts.length;i++){
   const part=parts[i];if(typeof part.text!=='string'||part.text.length>900)throw Error('Language chunk exceeds the bounded parser input.');
   results.push({index:part.index,tokens:parser.parse(part.text).tokens});
   self.postMessage({id,progress:i+1,total:parts.length,language:lang});
  }
  self.postMessage({id,result:{results,language:lang,loadMs:loaded-began,parseMs:performance.now()-loaded}});
 }catch(error){self.postMessage({id,error:String(error?.message||error)});}
};
