import {createSenderKey} from './private-vault-inbox-codec.mjs';
let opening;
function database(){return opening||=(new Promise((resolve,reject)=>{const request=indexedDB.open('adventurers-tome-inbox-device',1);request.onupgradeneeded=()=>request.result.createObjectStore('keys');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));}
async function record(action,id,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('keys',action==='get'?'readonly':'readwrite'),store=tx.objectStore('keys'),request=action==='get'?store.get(id):store.put(value,id);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export async function senderKey(owner){let key=await record('get',owner);if(!key){key=await createSenderKey();await record('put',owner,key);}return key;}
