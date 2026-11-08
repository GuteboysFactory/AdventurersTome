import {sealWhisper,openWhisper} from './private-whisper-codec.mjs';
self.onmessage=async({data})=>{try{const result=await (data.action==='seal'?sealWhisper(data.args):openWhisper(data.args));self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
