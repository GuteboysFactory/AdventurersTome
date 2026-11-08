import nacl from '../vendor/tweetnacl-1.0.3.mjs';
import {sha256} from './local-sha256.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
const bytes=(s,n)=>{if(typeof s!=='string'||s.length>4100000||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('Invalid encrypted whisper.');const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(n&&b.length!==n)throw Error('Invalid whisper key.');return b;};
const identity=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(s);
export async function createDevice(){const p=nacl.box.keyPair();try{return {id:await sha256(p.publicKey),publicKey:b64(p.publicKey),secretKey:b64(p.secretKey)};}finally{p.secretKey.fill(0);}}
const signed=p=>enc.encode(JSON.stringify([p.format,p.version,p.worldId,p.senderId,p.id,p.audience,p.nonce,p.ephemeral,p.keys,p.data,p.signerId]));
export async function sealWhisper({worldId,senderId,audience,payload,devices,signing}){
 if(!identity(worldId)||!identity(senderId)||!Array.isArray(audience)||!audience.length||audience.length>50||!audience.every(identity)||!audience.includes(senderId))throw Error('Invalid whisper audience.');
 validatePayload(payload);const plain=enc.encode(JSON.stringify(payload));if(plain.length>2901000)throw Error('Selected content exceeds the encrypted whisper limit.');
 const secret=nacl.randomBytes(32),ephemeral=nacl.box.keyPair(),nonce=nacl.randomBytes(24),privateSigning=bytes(signing.secretKey,64);
 try{const keys=[];for(const userId of audience){const userDevices=devices.filter(d=>d.userId===userId);if(!userDevices.length||userDevices.length>8)throw Error('A recipient must open Tome on this device before receiving encrypted whispers.');for(const d of userDevices){const pub=bytes(d.publicKey,32);if(await sha256(pub)!==d.id)throw Error('Invalid recipient key.');const n=nacl.randomBytes(24);keys.push({userId,id:d.id,nonce:b64(n),data:b64(nacl.box(secret,n,pub,ephemeral.secretKey))});}}
 const p={format:'tome-private-whisper',version:1,worldId,senderId,id:b64(nacl.randomBytes(24)),audience:[...audience],nonce:b64(nonce),ephemeral:b64(ephemeral.publicKey),keys,data:b64(nacl.secretbox(plain,nonce,secret)),signerId:signing.id};return {...p,signature:b64(nacl.sign.detached(signed(p),privateSigning))};
 }finally{secret.fill(0);ephemeral.secretKey.fill(0);privateSigning.fill(0);plain.fill(0);}
}
function validatePacket(p){if(p?.format!=='tome-private-whisper'||p.version!==1||!identity(p.worldId)||!identity(p.senderId)||typeof p.id!=='string'||p.id.length!==32||typeof p.signerId!=='string'||!/^[a-f0-9]{64}$/.test(p.signerId)||!Array.isArray(p.audience)||!p.audience.length||p.audience.length>50||!p.audience.every(identity)||!p.audience.includes(p.senderId)||!Array.isArray(p.keys)||p.keys.length>400||typeof p.data!=='string'||p.data.length>4000000||p.keys.some(k=>!p.audience.includes(k.userId)||!/^[a-f0-9]{64}$/.test(k.id)||typeof k.data!=='string'||k.data.length!==64||typeof k.nonce!=='string'||k.nonce.length!==32))throw Error('Unsupported encrypted whisper.');bytes(p.nonce,24);bytes(p.ephemeral,32);bytes(p.signature,64);}
function validatePayload(p){if(p?.version!==1||!['text','image'].includes(p.kind)||typeof p.title!=='string'||p.title.length>500)throw Error('Invalid whisper content.');if(p.kind==='text'&&(typeof p.text!=='string'||p.text.length>200000))throw Error('Selected text is too long.');if(p.kind==='image'&&(typeof p.dataURL!=='string'||p.dataURL.length>2900000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(p.dataURL)))throw Error('Invalid shared image.');}
export async function openWhisper({packet:p,device,worldId,userId,senderPublicKey}){
 validatePacket(p);if(p.worldId!==worldId||!p.audience.includes(userId)||!identity(userId))throw Error('This whisper belongs to another recipient or world.');
 const pub=bytes(senderPublicKey,32);if(await sha256(pub)!==p.signerId||!nacl.sign.detached.verify(signed(p),bytes(p.signature,64),pub))throw Error('Whisper sender verification failed.');
 const slot=p.keys.find(k=>k.userId===userId&&k.id===device.id);if(!slot)throw Error('This device has no key for this whisper. Use the original browser profile.');
 const privateKey=bytes(device.secretKey,32);let key,plain;try{key=nacl.box.open(bytes(slot.data,48),bytes(slot.nonce,24),bytes(p.ephemeral,32),privateKey);if(!key)throw Error('Whisper authentication failed.');plain=nacl.secretbox.open(bytes(p.data),bytes(p.nonce,24),key);if(!plain)throw Error('Whisper authentication failed.');const payload=JSON.parse(dec.decode(plain));validatePayload(payload);return payload;}finally{privateKey.fill(0);key?.fill(0);plain?.fill(0);}
}
