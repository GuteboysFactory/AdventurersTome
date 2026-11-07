import {digestIndexValue} from './index-digest-core.mjs';
// Receives only the authorized derived inputs. No document APIs or storage.
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,result:await digestIndexValue(data.value,data.secure)});}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
