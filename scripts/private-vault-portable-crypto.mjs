// AES-GCM/PBKDF2 compatibility for HTTP browsers. The on-disk v1 format is unchanged.
let portable;
async function library(){return portable||=Promise.all([import('../vendor/noble-hashes-1.8.0/pbkdf2.js'),import('../vendor/noble-hashes-1.8.0/sha2.js'),import('../vendor/noble-ciphers-1.3.0/aes.js')]).then(([a,b,c])=>({...a,...b,...c}));}
export async function derivePortableKey(password,salt,iterations){
 const {pbkdf2Async,sha256}=await library();
 return pbkdf2Async(sha256,password,salt,{c:iterations,dkLen:32,asyncTick:10});
}
async function derive(password,salt,iterations){
 if(typeof Worker==='undefined')return derivePortableKey(password,salt,iterations);
 return new Promise((resolve,reject)=>{
  let worker;try{worker=new Worker(new URL('./private-vault-key-worker.mjs',import.meta.url),{type:'module'});}catch{derivePortableKey(password,salt,iterations).then(resolve,reject);return;}
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Vault key preparation timed out. Try again.'));},120000);
  const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onmessage=e=>{finish();if(e.data.error)reject(Error(e.data.error));else resolve(new Uint8Array(e.data.key));};worker.onerror=()=>{finish();reject(Error('Vault key worker could not start. Reload and try again.'));};
  worker.postMessage({password:new Uint8Array(password),salt:new Uint8Array(salt),iterations});
 });
}
export function createVaultCrypto(native){
 const random=buffer=>{if(!native?.getRandomValues)throw Error('Secure random numbers are unavailable.');return native.getRandomValues(buffer);};
 const raw=v=>v instanceof Uint8Array?v:new Uint8Array(v);
 const portableKey=k=>k?.type==='tome-portable-aes'&&k.bytes instanceof Uint8Array&&k.bytes.length===32;
 const subtle={
  importKey:async(...args)=>{if(native?.subtle)return native.subtle.importKey(...args);if(args[0]!=='raw'||args[2]!=='PBKDF2')throw Error('Unsupported Vault key format.');random(new Uint8Array(1));return {type:'tome-pbkdf2',bytes:raw(args[1]).slice()};},
  deriveKey:async(params,material,...rest)=>{
   if(native?.subtle)return native.subtle.deriveKey(params,material,...rest);
   try{return {type:'tome-portable-aes',bytes:await derive(material.bytes,params.salt,params.iterations),extractable:true};}finally{material.bytes.fill(0);}
  },
  encrypt:async(params,key,data)=>{
   if(!portableKey(key)){if(native?.subtle)return native.subtle.encrypt(params,key,data);throw Error('Enter your Vault passphrase on this connection.');}
   const {gcm}=await library();return gcm(key.bytes,raw(params.iv),params.additionalData?raw(params.additionalData):undefined).encrypt(raw(data));
  },
  decrypt:async(params,key,data)=>{
   if(!portableKey(key)){if(native?.subtle)return native.subtle.decrypt(params,key,data);throw Error('Enter your Vault passphrase on this connection.');}
   const {gcm}=await library();return gcm(key.bytes,raw(params.iv),params.additionalData?raw(params.additionalData):undefined).decrypt(raw(data));
  }
 };
 return {subtle,getRandomValues:random,randomUUID:()=>native?.randomUUID?.()||Array.from(random(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),canUseRemembered:key=>portableKey(key)||Boolean(native?.subtle)};
}
