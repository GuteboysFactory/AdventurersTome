// Shadow-stage feedback and deletion plans. This module has no Foundry writes.
import {roleKey} from './source-document-map.js';
export async function sourceDigest(text){if(!globalThis.crypto?.subtle)return 'exact:'+String(text);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');}
const corrections=new Set(['heading','metadata','status','mechanic','editorial']);
export function feedbackRecord({map,nodeId,text,role,sourceHash}){
 const node=map.nodes.find(n=>n.id===nodeId);if(!node||!corrections.has(role))throw Error('Choose a source block and a supported correction role.');
 if(!node.text.includes(text)||!sourceHash||!map.sourceUuid)throw Error('A correction requires exact source evidence.');
 return Object.freeze({version:1,sourceUuid:map.sourceUuid,sourceHash,nodeId,path:node.path,blockText:node.text,text,role,scope:'source-context',authority:'gm',globalWordSuppression:false});
}
export function feedbackFor(record,map,sourceHash,start,end){
 if(record.sourceUuid!==map.sourceUuid||record.sourceHash!==sourceHash)return null;
 const node=map.nodes.find(n=>n.id===record.nodeId&&n.path===record.path&&n.text===record.blockText);if(!node||start<node.start||end>node.end)return null;
 const at=node.text.indexOf(record.text);return at>=0&&start>=node.start+at&&end<=node.start+at+record.text.length?record:null;
}
export function deletionPlan({entity,links=[],sourceEvidence=[],correction=null,ownerKey=null}){
 if(!entity?.uuid||! /^(Actor|Item|JournalEntry|Scene)\.[^.]+$/u.test(entity.uuid))throw Error('A canonical world document is required.');
 if(correction&&!sourceEvidence.some(e=>e.sourceUuid===correction.sourceUuid&&roleKey(e.text)===roleKey(correction.text)))throw Error('Correction evidence does not belong to this deletion.');
 return {mode:'preview-only',ownerKey,expectedModifiedTime:entity.modifiedTime??null,entity:{uuid:entity.uuid,name:entity.name,documentName:entity.documentName||entity.uuid.split('.')[0]},affectedLinks:links.filter(l=>l.targetUuid===entity.uuid||l.sourceUuid===entity.uuid),sourceEvidence,correction,requiresExplicitDeletionConfirmation:true,backendDocumentWouldBeDeleted:true,applied:false};
}
// This executor is never attached to the shadow-analysis runner or preview UI.
// A future GM action can use the native document delete lifecycle so existing
// canonical-link/history hooks run, rather than manually deleting linked roots.
export async function executeConfirmedDeletion(plan,{confirmation,allowed,owner,resolve,saveFeedback}){
 const expected=plan.ownerKey;
 const check=()=>{if(!expected||!allowed?.()||owner?.()!==expected||confirmation?.confirmed!==true||confirmation.uuid!==plan.entity.uuid||confirmation.ownerKey!==expected)throw Error('A current GM deletion confirmation is required.');};
 check();const target=await resolve(plan.entity.uuid);check();
 if(!target||target.uuid!==plan.entity.uuid||target.name!==plan.entity.name||plan.expectedModifiedTime!==null&&target._stats?.modifiedTime!==plan.expectedModifiedTime)throw Error('The document changed since the deletion preview.');
 if(typeof target.delete!=='function')throw Error('The document cannot be deleted through its native lifecycle.');
 if(plan.correction){if(typeof saveFeedback!=='function')throw Error('Source correction storage must be ready before deletion.');await saveFeedback(plan.correction);check();}
 await target.delete();return {deleted:true,uuid:target.uuid,correctionSaved:!!plan.correction,nativeLifecycle:true};
}
export function createFeedbackLedger({storage=globalThis.localStorage,owner=()=>'',allowed=()=>false}={}){
 const slot=()=>{if(!allowed()||!owner())throw Error('Feedback is available only to the authorized GM.');return 'tome-shadow-feedback:'+owner();};
 const valid=r=>r?.version===1&&r.scope==='source-context'&&r.authority==='gm'&&r.sourceUuid&&r.sourceHash&&r.nodeId&&typeof r.text==='string'&&corrections.has(r.role);
 const identity=r=>[r.sourceUuid,r.sourceHash,r.nodeId,roleKey(r.text)].join('|');
 function all(){const raw=storage.getItem(slot());if(!raw)return [];const payload=JSON.parse(raw);if(payload.version!==1||!Array.isArray(payload.records))throw Error('Unsupported feedback storage.');return payload.records.filter(valid);}
 return Object.freeze({all,save(record){if(!valid(record))throw Error('Invalid feedback record.');const records=all().filter(r=>identity(r)!==identity(record));records.push(record);if(records.length>2000)throw Error('Feedback storage limit reached.');storage.setItem(slot(),JSON.stringify({version:1,records}));return record;},remove(record){const records=all().filter(r=>identity(r)!==identity(record));storage.setItem(slot(),JSON.stringify({version:1,records}));return records.length;}});
}
