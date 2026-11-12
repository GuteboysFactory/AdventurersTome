import {derivePortableKey} from './private-vault-portable-crypto.mjs';
self.onmessage=async({data})=>{
 try{const key=await derivePortableKey(data.password,data.salt,data.iterations);self.postMessage({key:key.buffer},[key.buffer]);}
 catch{self.postMessage({error:'The Vault key could not be prepared.'});}
 finally{data.password?.fill(0);self.close();}
};
