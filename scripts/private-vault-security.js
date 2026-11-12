import {createEncryptedVault} from './private-vault-crypto.mjs';
import {createAccountVault,createVaultAccess} from './private-vault-access.mjs';
const ID='adventurers-tome',OLD=ID+'-testai',KEY='privateVaultEncryptedV1',keys=['gmPrivateVault','gmContextualPrivateVaultV2','migrationPrivateStateV1'];
let service,deviceDB,nativeGet,nativeSet;const owner=()=>`${game.world?.id}|${game.user?.id}`,gm=()=>game.user?.isGM===true;
function deviceStore(){return deviceDB||=(new Promise((resolve,reject)=>{const request=indexedDB.open('adventurers-tome-vault-device',1);request.onupgradeneeded=()=>request.result.createObjectStore('keys');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));}
async function device(action,key,value){const db=await deviceStore();return new Promise((resolve,reject)=>{const tx=db.transaction('keys',action==='get'?'readonly':'readwrite'),store=tx.objectStore('keys'),r=action==='put'?store.put(value,key):store[action](key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function raw(namespace,key){const full=namespace+'.'+key,stored=game.settings.storage.get('user').getSetting(full,game.user.id);if(!stored)return '{}';if(!game.settings.settings.has(full))game.settings.register(namespace,key,{scope:'user',config:false,type:String,default:'{}'});return nativeGet(namespace,key);}
function parse(value){let p;try{p=JSON.parse(value||'{}');}catch{throw Error('An existing Vault is unreadable. No old data has been removed.');}if(!p||typeof p!=='object'||Array.isArray(p))throw Error('An existing Vault has an unsupported format.');const safe=v=>{if(v&&typeof v==='object')for(const[k,child]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('An existing Vault contains an unsafe key. No old data has been removed.');safe(child);}};safe(p);return p;}
function mergeNotes(a=[],b=[]){const out=new Map();for(const n of [...a,...b]){const id=n.id||JSON.stringify([n.title,n.body??n.text,n.createdAt]);if(!out.has(id)||Number(n.updatedAt||0)>Number(out.get(id).updatedAt||0))out.set(id,n);}return [...out.values()];}
function mergeRecord(a={},b={}){return {...b,...a,notes:mergeNotes(a.notes,b.notes),facts:[...new Map([...(a.facts||[]),...(b.facts||[])].map(v=>[JSON.stringify(v),v])).values()],relations:[...new Map([...(a.relations||[]),...(b.relations||[])].map(v=>[JSON.stringify(v),v])).values()]};}
function mergeValues(a={},b={}){const out={...b,...a};for(const key of keys){const left=parse(a[key]),right=parse(b[key]);if(!Object.keys(right).length)continue;if(key==='migrationPrivateStateV1'){out[key]=JSON.stringify({...right,...left,imports:{...right.imports,...left.imports}});}else if(key==='gmPrivateVault'){const v={...right,...left};for(const ref of new Set([...Object.keys(left),...Object.keys(right)]))v[ref]=mergeRecord(left[ref],right[ref]);out[key]=JSON.stringify(v);}else{const records={...right.records,...left.records};for(const ref of new Set([...Object.keys(left.records||{}),...Object.keys(right.records||{})]))records[ref]=mergeRecord(left.records?.[ref],right.records?.[ref]);out[key]=JSON.stringify({...right,...left,records});}}return out;}
let priorUnlocked=false,priorMode=null;
function changed(){const unlocked=service?.unlocked()===true,mode=service?.status().mode;if(priorMode&&mode!==priorMode)Hooks.callAll('adventurersTomeVaultLockChanged',{unlocked:false});if(unlocked!==priorUnlocked||mode!==priorMode){priorUnlocked=unlocked;priorMode=mode;Hooks.callAll('adventurersTomeVaultLockChanged',{unlocked,mode});}globalThis.ATTestAI?.modules.get(ID)?.api?.privateVault?.invalidate();}
globalThis.AdventurersTomeVaultSecurity=Object.freeze({handles:(ns,key)=>[ID,OLD].includes(ns)&&keys.includes(key),get:key=>service?.get(key)||'{}',set:(key,value)=>{if(!service)throw Error('Private Vault is not ready.');return service.set(key,value);},unlocked:()=>service?.unlocked()===true});
Hooks.once('init',()=>{
 nativeGet=game.settings.get.bind(game.settings);nativeSet=game.settings.set.bind(game.settings);
 game.settings.register(ID,KEY,{scope:'user',config:false,type:Object,default:null});
 game.settings.register(ID,'privateVaultAccountV1',{scope:'user',config:false,type:Object,default:null});
 game.settings.register(ID,'privateVaultAccessModeV1',{scope:'user',config:false,type:String,default:'auto'});
 const legacy=async()=>mergeValues(Object.fromEntries(keys.map(key=>[key,raw(ID,key)])),Object.fromEntries(keys.map(key=>[key,raw(OLD,key)])));
 const retire=async()=>{for(const ns of [ID,OLD])for(const key of keys){const before=raw(ns,key);if(before!=='{}'&&Object.keys(parse(before)).length)await nativeSet(ns,key,'{}');}await game.modules.get(ID)?.api?.migratePrivateVaultSources?.();};
 const encrypted=createEncryptedVault({crypto:globalThis.crypto,owner,allowed:gm,read:()=>nativeGet(ID,KEY),write:value=>nativeSet(ID,KEY,value),merge:mergeValues,legacy,retire,
  remembered:{get:key=>device('get',key),put:(key,value)=>device('put',key,value),delete:key=>device('delete',key)},changed});
 const account=createAccountVault({owner,allowed:gm,read:()=>nativeGet(ID,'privateVaultAccountV1'),write:value=>nativeSet(ID,'privateVaultAccountV1',value),legacy,retire,merge:mergeValues,changed});
 service=createVaultAccess({encrypted,account,owner,allowed:gm,modeRead:()=>nativeGet(ID,'privateVaultAccessModeV1'),modeWrite:value=>nativeSet(ID,'privateVaultAccessModeV1',value),encryptedRead:()=>nativeGet(ID,KEY),changed});
 // Keep existing integrations on the same encrypted path. The document:true
 // branch remains native because Foundry uses it internally when persisting.
 game.settings.get=(namespace,key,...args)=>globalThis.AdventurersTomeVaultSecurity.handles(namespace,key)&&!args[0]?.document?service.get(key):nativeGet(namespace,key,...args);
 game.settings.set=(namespace,key,value,...args)=>globalThis.AdventurersTomeVaultSecurity.handles(namespace,key)?service.set(key,value):nativeSet(namespace,key,value,...args);
});
Hooks.once('ready',async()=>{const module=game.modules.get(ID);module.api||={};module.api.securePrivateVault=service;if(gm()){try{await service.unlock(null,{device:true});}catch{service.lock();}}});
Hooks.on('updateSetting',setting=>{if(setting.key===ID+'.'+KEY&&service?.unlocked())void service.refresh().catch(()=>service.lock());});
Hooks.on('updateUser',()=>{if(!gm()||service?.status().owner!==owner())service?.lock();});
Hooks.on('closeGame',()=>service?.lock());
