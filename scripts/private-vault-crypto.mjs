import {createVaultCrypto} from './private-vault-portable-crypto.mjs';
// Native secure-context keys remain non-extractable; HTTP uses a portable AES key.
// A remembered device key is never a replacement for keeping the passphrase.
export function createEncryptedVault({crypto,owner,allowed,read,write,legacy,retire,remembered,merge=(a,b)=>({...a,...b}),changed=()=>{}}){
 crypto=createVaultCrypto(crypto);
 const enc=new TextEncoder(),dec=new TextDecoder();let session=null,tail=Promise.resolve();
 const b64=b=>{const value=new Uint8Array(b);let binary='';for(let i=0;i<value.length;i+=32768)binary+=String.fromCharCode(...value.subarray(i,i+32768));return btoa(binary);},bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const stamp=()=>owner(),check=s=>{if(!allowed()||stamp()!==s)throw Error('Vault owner or permission changed.');},aad=s=>enc.encode('tome-private-vault-v1|'+s);
 function envelope(){const e=read();if(!e)return null;if(e.format!=='tome-private-vault-encrypted'||e.version!==1||e.owner!==stamp()||e.iterations!==600000||bytes(e.salt).length!==16||bytes(e.iv).length!==12)throw Error('Unsupported or mismatched encrypted Vault. Stored data has not been changed.');return e;}
 async function key(phrase,salt){const material=await crypto.subtle.importKey('raw',enc.encode(phrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 async function seal(payload,s){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(s.owner)},s.key,enc.encode(JSON.stringify(payload)));return {format:'tome-private-vault-encrypted',version:1,owner:s.owner,iterations:600000,salt:s.salt,iv:b64(iv),data:b64(data),revision:crypto.randomUUID()};}
 async function decrypt(e,k){try{const payload=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:aad(e.owner)},k,bytes(e.data))));if(payload?.version!==1||!payload.values||typeof payload.values!=='object'||Array.isArray(payload.values)||Object.values(payload.values).some(v=>typeof v!=='string'))throw Error();return payload;}catch{throw Error('Vault could not be unlocked. Check the passphrase; stored data has not been changed.');}}
 function unlocked(){return Boolean(allowed()&&session?.owner===stamp());}
 async function unlock(phrase,{remember=false,device=false}={}){
  const token=stamp();check(token);const existing=envelope();let k,salt,payload;
  if(device){const saved=await remembered.get(token);check(token);if(!existing||!saved||saved.salt!==existing.salt||!crypto.canUseRemembered(saved.key))return false;k=saved.key;salt=saved.salt;payload=await decrypt(existing,k);}
  else{if(typeof phrase!=='string'||phrase.length<12)throw Error('Use a Vault passphrase of at least 12 characters.');salt=existing?.salt||b64(crypto.getRandomValues(new Uint8Array(16)));k=await key(phrase,salt);check(token);payload=existing?await decrypt(existing,k):{version:1,values:await legacy()};}
  check(token);let current=existing;const incoming=await legacy();check(token);const combined=existing?{version:1,values:merge(payload.values,incoming)}:payload;
  if(!existing||JSON.stringify(combined)!==JSON.stringify(payload)){if(existing&&envelope()?.revision!==existing.revision)throw Error('Vault changed during unlocking. Try again.');payload=combined;const candidate=await seal(payload,{key:k,salt,owner:token});check(token);await write(candidate);check(token);current=envelope();if(current?.revision!==candidate.revision)throw Error('Vault changed during setup. Reopen it before continuing.');await decrypt(current,k);}
  session={key:k,salt,owner:token,payload,revision:current.revision};
  try{await retire();check(token);}catch(e){session=null;throw Error('Encrypted copy saved, but old clear-text data could not be removed. Retry unlocking before using Vault.');}
  if(remember&&!device){await remembered.put(token,{key:k,salt});check(token);}changed();return true;
 }
 async function refresh(){if(!unlocked())return;const e=envelope();if(e?.revision!==session.revision){const token=stamp(),s=session,payload=await decrypt(e,s.key);check(token);if(session!==s)throw Error('Vault was locked during refresh.');s.payload=payload;s.revision=e.revision;changed();}}
 function get(name){if(!unlocked())return '{}';return structuredClone(session.payload.values[name]??'{}');}
 function set(name,value){const token=stamp();check(token);if(!unlocked())throw Error('Unlock Private Vault before changing private notes.');const captured=structuredClone(value);const work=async()=>{check(token);if(!unlocked())throw Error('Vault is locked.');await refresh();const s=session,values={...s.payload.values,[name]:captured},payload={version:1,values};const e=await seal(payload,s);check(token);if(session!==s)throw Error('Vault was locked before saving.');await write(e);check(token);if(session!==s)throw Error('Vault locked while saving. Reopen it to read the saved version.');s.payload=payload;s.revision=e.revision;changed();return captured;};const result=tail.then(work,work);tail=result.catch(()=>{});return result;}
 function lock(){session=null;changed();}
 async function forget(){const token=stamp();check(token);await remembered.delete(token);lock();}

 function attachmentSession(id){
  if(!unlocked())throw Error('Unlock Private Vault before opening images.');
  if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id))throw Error('Invalid private image identifier.');
  check(session.owner);return session;
 }
 const attachmentAAD=(s,id)=>enc.encode('tome-private-vault-attachment-v1|'+s.owner+'|'+id);
 async function sealAttachment(id,value){
  const s=attachmentSession(id),input=new Uint8Array(value);
  if(!input.length||input.length>2097152)throw Error('Private images must be at most 2 MB.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:attachmentAAD(s,id)},s.key,input);
  check(s.owner);if(session!==s)throw Error('Vault locked while preparing the image.');
  return {format:'tome-private-image',version:1,id,owner:s.owner,salt:s.salt,iv:b64(iv),data:b64(data)};
 }
 async function openAttachment(id,value){
  const s=attachmentSession(id);
  if(value?.format!=='tome-private-image'||value.version!==1||value.id!==id||value.owner!==s.owner||value.salt!==s.salt||typeof value.data!=='string'||value.data.length>2800000||bytes(value.iv).length!==12)throw Error('This private image does not belong to this Vault.');
  let result;try{result=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:attachmentAAD(s,id)},s.key,bytes(value.data));}catch{throw Error('Private image authentication failed.');}
  check(s.owner);if(session!==s)throw Error('Vault locked while opening the image.');return result;
 }
 return Object.freeze({sealAttachment,openAttachment,unlock,get,set,refresh,lock,forget,unlocked,exportValues:async()=>{const token=stamp();await tail;check(token);if(!unlocked())throw Error('Unlock Vault first.');await refresh();check(token);return structuredClone(session.payload.values);},status:()=>({configured:Boolean(read()),unlocked:unlocked(),owner:allowed()?stamp():null})});
}
