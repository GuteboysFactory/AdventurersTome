// Exactly the existing index wire format. Keep JSON order, Map/Set handling,
// SHA-256 bytes and the collision-free non-secure-origin fallback unchanged.
export function encodeIndexValue(value){return JSON.stringify(value,(_key,v)=>v instanceof Set?[...v].sort():v instanceof Map?[...v.entries()]:v);}
export async function digestIndexValue(value,secure=Boolean(globalThis.crypto?.subtle)){
 const text=encodeIndexValue(value);if(!secure)return `exact:${text}`;
 if(!globalThis.crypto?.subtle)throw Error('Secure hashing is unavailable in the index worker.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return `sha256:${[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
