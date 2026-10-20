// Personal records are deliberately outside Campaign Memory and its index.
// User-scoped storage separates plain notes from other players; optional AES-GCM
// protects note bodies at rest from technical GM access, not a hostile host.
const ATPC_ID='adventurers-tome';
function createPlayerChronicle(env) {
  const clone=value=>structuredClone(value), sessions=new Map();
  const me=()=>env.user(), users=()=>env.users();
  const header=doc=>doc?.getFlag?.(ATPC_ID,'chronicleV1');
  const books=()=>env.journals().filter(doc=>header(doc)?.version===1);
  function book(kind,ownerId=me().id) {
    return books().find(doc=>header(doc).kind===kind&&header(doc).ownerId===ownerId
      && Number(doc.ownership?.[ownerId])===3);
  }
  function mine(kind) {
    const doc=book(kind);
    if(!doc || !doc.testUserPermission(me(),'OWNER'))throw Error('Chronicle storage is not ready. Reopen Tome and try again.');
    return doc;
  }
  function rows(doc) {return Object.values(doc?.getFlag?.(ATPC_ID,'chronicleEntries')||{});}
  const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const encoded=value=>new TextEncoder().encode(value);
  const aad=id=>encoded(`${env.worldId()}:${me().id}:${id}:chronicle-v1`);
  function cryptoReady() {if(!env.crypto?.subtle)throw Error('Encryption requires HTTPS or localhost. Plain private notes remain available.');}
  async function key(phrase,salt) {
    cryptoReady();
    const material=await env.crypto.subtle.importKey('raw',encoded(phrase),'PBKDF2',false,['deriveKey']);
    return env.crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(salt),iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(value,phrase,id) {
    if(typeof phrase!=='string'||phrase.length<12)throw Error('Use a Chronicle passphrase of at least 12 characters.');
    cryptoReady();
    const salt=b64(env.crypto.getRandomValues(new Uint8Array(16))),iv=b64(env.crypto.getRandomValues(new Uint8Array(12)));
    const data=await env.crypto.subtle.encrypt({name:'AES-GCM',iv:bytes(iv),additionalData:aad(id)},await key(phrase,salt),encoded(JSON.stringify(value)));
    return {format:1,salt,iv,data:b64(data)};
  }
  async function unseal(record,phrase) {
    const e=record.envelope;
    if(e?.format!==1)throw Error('Unsupported encrypted note format.');
    try {
      const context=e.migrationContext,additionalData=context?encoded(`${context.worldId}:${context.ownerId}:${context.noteId}:chronicle-v1`):aad(record.id);
      const note=JSON.parse(new TextDecoder().decode(await env.crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData},await key(phrase,e.salt),bytes(e.data))));
      return record.migrationLinks?globalThis.AdventurersTomePrivateMigration.remap(note,Object.fromEntries(record.migrationLinks.map(row=>[row.sourceUuid,row.targetUuid]))):note;
    }
    catch {throw Error('Could not unlock this note. Check the passphrase; the stored note has not been changed.');}
  }
  async function target(uuid) {
    if(!uuid)return null;
    const doc=await env.resolve(uuid);
    if(!doc || header(doc) || !env.canView(doc,me()))return null;
    return {uuid:doc.uuid,name:doc.name,kind:doc.documentName};
  }
  async function project(note) {
    const linked=[];
    for(const uuid of note.targetUuids||[]) {const row=await target(uuid);if(row)linked.push(row);}
    // Never expose inaccessible UUIDs, old names or hidden-count differences.
    return {...clone(note),targetUuids:linked.map(row=>row.uuid),linked};
  }
  async function privateRows() {
    const doc=book('private');if(!doc||header(doc).ownerId!==me().id)return [];
    const result=[];
    for(const row of rows(doc)) {
      if(row.deleted)continue;
      if(row.envelope) {
        const cached=sessions.get(row.id);
        if(cached?.revision===row.revision)result.push(await project({...cached.note,id:row.id,revision:row.revision,encrypted:true}));
        else result.push({id:row.id,revision:row.revision,encrypted:true,locked:true,title:'Encrypted note',text:'',targetUuids:[],linked:[]});
      } else result.push(await project({...row.note,id:row.id,revision:row.revision,encrypted:false}));
    }
    return result;
  }
  async function sharedRows({gmOnly=false}={}) {
    const result=[];
    for(const doc of books()) {
      const h=header(doc);
      if(h.kind==='private'||gmOnly&&h.kind!=='gm'||h.kind==='gm'&&!me().isGM&&h.ownerId!==me().id)continue;
      if(!['party','gm'].includes(h.kind)||!doc.testUserPermission(me(),'OBSERVER'))continue;
      for(const row of rows(doc))if(!row.deleted&&row.note)result.push(await project({...row.note,id:row.id,ownerId:h.ownerId,visibility:h.kind,revision:row.revision,shared:true,pending:h.ownerId===me().id&&Boolean(env.deliveryPending?.(row.id,h.kind))}));
    }
    return result;
  }
  async function knownEntities() {
    const own=await privateRows(),shared=(await sharedRows()).filter(row=>row.ownerId!==me().id);
    const sourceRows=[...own,...shared],notes=new Map();
    for(const row of sourceRows) {
      const ownerId=row.ownerId||me().id,key=`${ownerId}:${row.id}`;
      const current=notes.get(key);
      if(!current||Number(row.updatedAt||0)>Number(current.updatedAt||0))notes.set(key,{...row,ownerId});
    }
    const result=new Map();
    for(const row of notes.values())for(const entity of row.linked||[]) {
      const found=result.get(entity.uuid)||{...entity,mentions:[]};
      found.mentions.push({noteId:row.id,ownerId:row.ownerId,title:row.title||'Untitled note',visibility:row.visibility||'private',signalType:row.signalType||'Interest',momentDate:row.momentDate||'',updatedAt:Number(row.updatedAt)||0});
      result.set(entity.uuid,found);
    }
    return [...result.values()].map(entity=>({...entity,mentions:entity.mentions.sort((a,b)=>b.updatedAt-a.updatedAt)}))
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  async function nextSessionSignals() {
    if(!me().isGM)return [];
    const rows=(await sharedRows({gmOnly:true})).filter(row=>row.visibility==='gm'&&row.ownerId!==me().id&&!row.rumour);
    const buckets=new Map();
    for(const row of rows) {
      const links=row.linked?.length?row.linked:[null];
      for(const entity of links) {
        const type=String(row.signalType||'Interest'),key=`${entity?.uuid||'unlinked'}:${type}`;
        const bucket=buckets.get(key)||{entity,signalType:type,entries:[],players:new Set()};
        bucket.players.add(row.ownerId);
        bucket.entries.push({id:row.id,ownerId:row.ownerId,playerName:users().find(user=>user.id===row.ownerId)?.name||'Player',title:row.title||'Untitled note',text:row.text||'',updatedAt:Number(row.updatedAt)||0});
        buckets.set(key,bucket);
      }
    }
    return [...buckets.values()].map(bucket=>({entity:bucket.entity,signalType:bucket.signalType,playerCount:bucket.players.size,entries:bucket.entries.sort((a,b)=>b.updatedAt-a.updatedAt)}))
      .sort((a,b)=>b.playerCount-a.playerCount||b.entries.length-a.entries.length||b.entries[0]?.updatedAt-a.entries[0]?.updatedAt||a.signalType.localeCompare(b.signalType));
  }
  async function save(input,{id,expectedRevision,encrypt=false,phrase}={}) {
    const doc=mine('private');id=id||env.id();
    const old=(doc.getFlag(ATPC_ID,'chronicleEntries')||{})[id];
    if(old && old.revision!==expectedRevision)throw Error('This note changed on another device. Reload it before saving.');
    if(!old&&expectedRevision)throw Error('This note is no longer available.');
    if(old?.envelope&&!encrypt)throw Error('Encrypted notes cannot silently become plain notes.');
    const text=String(input.text||''),title=String(input.title||'').trim().slice(0,160);
    if(text.length>20000)throw Error('A note can contain up to 20,000 characters.');
    const links=[...new Set(input.targetUuids||[])];if(links.length>20)throw Error('Use at most 20 linked entities.');
    for(const uuid of links)if(!await target(uuid))throw Error('A linked entity is missing or no longer visible. Remove that link before saving.');
    const momentDate=String(input.momentDate||'');
    if(momentDate) {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(momentDate))throw Error('Choose a valid remembered-moment date.');
      const [year,month,day]=momentDate.split('-').map(Number),check=new Date(Date.UTC(year,month-1,day));
      if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)throw Error('Choose a valid remembered-moment date.');
    }
    const note={title,text,targetUuids:links,bookmark:Boolean(input.bookmark),momentDate,signalType:['Interest','Suspicion','Goal','Question','Theory','Relationship','Fear','Unfinished business'].includes(input.signalType)?input.signalType:'Interest',updatedAt:env.now(),createdAt:old?.createdAt||env.now()};
    if(input.rumour) {
      if(!me().isGM)throw Error('Only a GM can save a campaign rumour.');
      if(!input.rumour.subjectUuid||!links.includes(input.rumour.subjectUuid)||!links.includes(input.rumour.sourceUuid))throw Error('A rumour needs a visible subject and source.');
      note.rumour={certainty:'rumoured',subjectUuid:input.rumour.subjectUuid,sourceUuid:input.rumour.sourceUuid,sourceText:String(input.rumour.sourceText||'').slice(0,20000),anonymousSource:true};
    }
    const revision=env.id(),record={id,revision,createdAt:old?.createdAt||env.now()};
    if(encrypt)record.envelope=await seal(note,phrase,id);else record.note=note;
    await doc.setFlag(ATPC_ID,`chronicleEntries.${id}`,record);
    if(encrypt)sessions.set(id,{revision,note});
    return {id,revision};
  }
  async function unlock(id,phrase) {
    const row=(mine('private').getFlag(ATPC_ID,'chronicleEntries')||{})[id];
    if(!row?.envelope||row.deleted)throw Error('Encrypted note not found.');
    const note=await unseal(row,phrase);sessions.set(id,{revision:row.revision,note});return project({...note,id,revision:row.revision,encrypted:true});
  }
  async function share(id,visibility,expectedRevision) {
    if(!['gm','party'].includes(visibility))throw Error('Choose Share with GM or Party.');
    const note=(await privateRows()).find(row=>row.id===id);
    if(!note||note.locked)throw Error('Unlock the note before sharing.');
    if(note.rumour)throw Error('Campaign rumours stay in the GM rumour workspace.');
    if(note.revision!==expectedRevision)throw Error('The note changed. Review the current text before sharing.');
    const dest=mine(visibility);
    const recipients=users().filter(user=>visibility==='gm' ? user.id===me().id||user.isGM : dest.testUserPermission(user,'OBSERVER'));
    const links=[];
    for(const uuid of note.targetUuids){const doc=await env.resolve(uuid);if(doc&&recipients.every(user=>env.canView(doc,user)))links.push(uuid);}
    const snapshot={title:note.title,text:note.text,bookmark:note.bookmark,momentDate:note.momentDate||'',createdAt:note.createdAt||note.updatedAt,signalType:note.signalType,targetUuids:links,updatedAt:env.now(),sourceRevision:note.revision};
    // Repeated sends of the same revision do not duplicate notifications.
    const existing=(dest.getFlag(ATPC_ID,'chronicleEntries')||{})[id];
    if(existing&&!existing.deleted&&existing.note?.sourceRevision===note.revision&&existing.delivered&&!env.deliveryPending?.(id,visibility))return {shared:true,alreadyShared:true};
    const record=existing&&!existing.deleted&&existing.note?.sourceRevision===note.revision?existing:{id,revision:env.id(),note:snapshot};
    await dest.setFlag(ATPC_ID,`chronicleEntries.${id}`,record);
    let notificationError='',pendingRecipients=[];
    try{const delivery=await env.notify({id,ownerId:me().id,visibility,record,recipients:recipients.filter(user=>user.id!==me().id).map(user=>user.id)});pendingRecipients=delivery?.pendingRecipients||[];await dest.setFlag(ATPC_ID,`chronicleEntries.${id}`,{...record,delivered:true});}catch(error){notificationError=String(error.message||error);}
    return {shared:true,notificationError,pendingRecipients};
  }
  async function withdraw(id) {
    // Tombstones also survive reload; private edits never alter sent snapshots.
    for(const kind of ['gm','party']) {
      const doc=mine(kind);
      if((doc.getFlag(ATPC_ID,'chronicleEntries')||{})[id]) {
        const record={id,deleted:true,revision:env.id()};await doc.setFlag(ATPC_ID,`chronicleEntries.${id}`,record);
        await env.notify({id,ownerId:me().id,visibility:kind,record,recipients:users().filter(user=>user.id!==me().id&&(kind==='gm'?user.isGM:doc.testUserPermission(user,'OBSERVER'))).map(user=>user.id)});
      }
    }
  }
  async function remove(id,expectedRevision) {
    const doc=mine('private'),row=(doc.getFlag(ATPC_ID,'chronicleEntries')||{})[id];
    if(!row||row.revision!==expectedRevision)throw Error('The note changed. Reload before deleting.');
    await withdraw(id);await doc.setFlag(ATPC_ID,`chronicleEntries.${id}`,{id,deleted:true,revision:env.id()});sessions.delete(id);
  }
  async function provision() {
    if(!me().isGM)throw Error('Only a GM can prepare Chronicle notebooks.');
    if(env.userScoped)return;
    for(const owner of users())for(const kind of ['private','gm','party'])if(!book(kind,owner.id)) {
      const ownership={default:0,[owner.id]:3};
      if(kind==='party')for(const user of users())if(user.id!==owner.id)ownership[user.id]=2;
      await env.createJournal({name:`Chronicle · ${owner.name} · ${kind}`,ownership,flags:{[ATPC_ID]:{chronicleV1:{version:1,kind,ownerId:owner.id},chronicleEntries:{}}}});
    }
  }
  return Object.freeze({privateRows,sharedRows,knownEntities,nextSessionSignals,save,unlock,share,withdraw,remove,provision,target,lock:()=>sessions.clear(),ready:()=>Boolean(book('private')),isChronicle:doc=>Boolean(header(doc)||header(doc?.parent))});
}
globalThis.createPlayerChronicle=createPlayerChronicle;
