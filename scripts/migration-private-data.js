/* Owner-scoped migration. Never read another user's settings or publish private text. */
(() => {
  const ID='adventurers-tome';
  const GM_KEYS=['gmPrivateVault','gmContextualPrivateVaultV2','gmWorkspace','gmRevealQueue','campaignMentionEvidenceV1','campaignRelationshipEvidenceV1'];
  const ARCHIVE_KEYS=['gmImportHistory','gmLastImportUndo','sourceFactCorrectionUndo'];
  const WORLD_KEYS=['campaignTitle','campaignSubtitle','background','currentLocation','sessionLabel','welcomeTitle','welcomeText','campaignLogo','theme','sectionBackgrounds','homeLayout','homeMode','homeHeroLayout','homeHeroHeight','homeHeroShade','homeHeroFocus','homeShowEnterButton','homeEnterTarget','homeAtGlance','homeSidebarCampaign','homeSidebarQuickLinks','navConfig','defaultLanding','groupHomeLimit','groupSort','defaultQuestStatus','defaultWorldCategory','defaultTomeVisibility','defaultTomeDiscovered','groupActors','campaignIntelligenceLearning'];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const parse=value=>{if(typeof value!=='string')return clone(value);try{return JSON.parse(value);}catch{return value;}};
  function gm(env){if(!env.user()?.isGM)throw Error('Only the active GM can migrate campaign-private data.');}
  function safe(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe private-data key.');safe(child);}}
  function capture(env){
    gm(env);const read=keys=>Object.fromEntries(keys.filter(key=>env.hasSetting(key)).map(key=>[key,clone(env.getSetting(key))]));
    // GM inbox contains only versions players already explicitly shared with this GM.
    const inbox=env.hasSetting('playerChronicleV1')?clone(env.getSetting('playerChronicleV1')?.inbox||{}):{};
    const gmBooks=env.hasSetting('playerChronicleV1')?clone(env.getSetting('playerChronicleV1')?.books||{}):{};
    return {version:1,gmOwnerId:env.user().id,users:env.users().map(user=>({id:user.id,name:user.name,isGM:Boolean(user.isGM),role:user.role})),settings:read(GM_KEYS),archives:read(ARCHIVE_KEYS),worldSettings:read(WORLD_KEYS),sharedInbox:inbox,gmBooks};
  }
  function validate(data){if(!data)return;safe(data);if(data.version!==1||typeof data.gmOwnerId!=='string'||!Array.isArray(data.users)||data.users.some(user=>typeof user.id!=='string'||!user.id||typeof user.name!=='string')||new Set(data.users.map(user=>user.id)).size!==data.users.length||!data.users.some(user=>user.id===data.gmOwnerId&&user.isGM))throw Error('Unsupported private migration data.');for(const [field,keys] of [['settings',GM_KEYS],['archives',ARCHIVE_KEYS],['worldSettings',WORLD_KEYS]])for(const key of Object.keys(data[field]||{}))if(!keys.includes(key))throw Error(`Unsupported migration setting: ${key}`);}
  function validateUsers(data,mapping,targets,current){
    validate(data);if(!data)return {};
    const out={};for(const source of data.users){if(!Object.hasOwn(mapping,source.id))throw Error(`Choose a destination or Keep private for ${source.name}.`);const id=mapping[source.id];if(id!==null&&!targets.some(user=>user.id===id))throw Error('Mapped destination user does not exist.');out[source.id]=id;}
    if(out[data.gmOwnerId]!==current.id||!current.isGM)throw Error('The exporting GM must map to the GM currently importing; private data is restored only to this account.');
    const selected=new Map();for(const source of data.users){const target=out[source.id];if(!target)continue;const sources=selected.get(target)||[];sources.push(source);selected.set(target,sources);}
    for(const [target,sources] of selected)if(sources.length>1&&!(target===current.id&&sources.every(source=>source.isGM===true))){const error=Error(`Account mapping conflict: ${sources.map(source=>source.name).join(' + ')} both use ${targets.find(user=>user.id===target)?.name||target}. Choose separate Player accounts or Keep GM-only.`);error.code='TOME_ACCOUNT_MAPPING';throw error;}
    return out;
  }
  function remap(value,identities,users={},field=''){
    if(typeof value==='string'){
      if(Object.hasOwn(users,value)&&/(?:owner|user|author|recipient)Id$/i.test(field))return users[value]||value;
      if(identities[value])return identities[value];
      const legacy=value.match(/^(actor|journalentry|item|scene):([a-zA-Z0-9]+)$/i);
      if(legacy){const kind={actor:'Actor',journalentry:'JournalEntry',item:'Item',scene:'Scene'}[legacy[1].toLowerCase()],uuid=identities[`${kind}.${legacy[2]}`];if(uuid)return `${legacy[1].toLowerCase()}:${uuid.split('.').at(-1)}`;}
      const kinds={actorId:'Actor',itemId:'Item',journalId:'JournalEntry',entryId:'JournalEntry',folderId:'Folder',sceneId:'Scene'};
      if(kinds[field]&&identities[`${kinds[field]}.${value}`])return identities[`${kinds[field]}.${value}`].split('.').at(-1);
      return value.replace(/(?:Compendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.)?(?:Actor|Item|JournalEntry|Scene|Folder|Playlist|RollTable)\.[a-zA-Z0-9]+(?:\.(?:Item|JournalEntryPage|ActiveEffect|PlaylistSound)\.[a-zA-Z0-9]+)*/g,uuid=>identities[uuid]||uuid);
    }
    if(Array.isArray(value))return value.map(child=>remap(child,identities,users,field));
    if(value&&typeof value==='object'){
      const out=Object.fromEntries(Object.entries(value).map(([key,child])=>[remap(key,identities,users),remap(child,identities,users,key)]));
      if(value.documentName&&value.documentId&&identities[`${value.documentName}.${value.documentId}`])out.documentId=identities[`${value.documentName}.${value.documentId}`].split('.').at(-1);
      return out;
    }
    return value;
  }
  function merge(existing,incoming,suffix){
    if(JSON.stringify(existing)===JSON.stringify(incoming))return clone(existing);
    if(Array.isArray(existing)&&Array.isArray(incoming)){
      const out=clone(existing);for(const entry of incoming){if(out.some(row=>JSON.stringify(row)===JSON.stringify(entry)))continue;const row=clone(entry);if(row&&typeof row==='object'&&row.id&&out.some(old=>old?.id===row.id))row.id=`migrated${suffix}${row.id}`;if(!out.some(old=>JSON.stringify(old)===JSON.stringify(row)))out.push(row);}return out;
    }
    if(existing&&incoming&&typeof existing==='object'&&typeof incoming==='object'&&!Array.isArray(existing)&&!Array.isArray(incoming)){
      const out=clone(existing);for(const [key,value] of Object.entries(incoming)){if(!Object.hasOwn(out,key))out[key]=clone(value);else out[key]=merge(out[key],value,suffix);}return out;
    }
    if(existing===null||existing===undefined||existing==='')return clone(incoming);
    return clone(existing);
  }
  function ownership(raw,mapping,targets,embedded=false){
    const source=raw?.ownership||raw?.permission||{default:0};const valid=new Set(targets.map(user=>user.id));
    if(Object.keys(source).some(id=>id!=='default'&&(!mapping[id]||!valid.has(mapping[id]))))return {default:0};
    const result={default:Math.max(embedded?-1:0,Math.min(3,Number(source.default)||0))};for(const [id,level] of Object.entries(source))if(id!=='default'&&mapping[id])result[mapping[id]]=Math.max(result[mapping[id]]??(embedded?-1:0),Math.max(embedded?-1:0,Math.min(3,Number(level)||0)));return result;
  }
  async function restore(env,{data,source,packageId,mapping,identities,rows,signal}){
    const guard=()=>{gm(env);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
    guard();const users=validateUsers(data,mapping,env.users(),env.user());if(!data)return;
    const state=clone(env.state()||{version:1,imports:{}});state.imports||={};const receipt=state.imports[packageId]||{applied:[],source:clone(source),archives:clone(data.archives||{})};state.imports[packageId]=receipt;
    if(receipt.users&&JSON.stringify(receipt.users)!==JSON.stringify(users))throw Error('Account mapping for this package is already saved. Use the same accounts when resuming.');
    receipt.users=users;
    receipt.originalPrivateData=clone(data); // Quarantine original Undo/import snapshots; do not activate old destructive Undo.
    const commit=async()=>{guard();await env.saveState(state);};await commit();
    for(const [key,raw] of Object.entries({...data.settings,...data.worldSettings})){
      guard();if(receipt.applied.includes(key))continue;if(!env.hasSetting(key))throw Error(`Destination setting unavailable: ${key}`);
      let value=remap(parse(raw),identities,users);const current=env.getSetting(key);
      if(GM_KEYS.includes(key)||key==='campaignIntelligenceLearning')value=merge(parse(current),value,packageId.slice(0,8));
      if(key==='groupActors'&&Array.isArray(value))value=value.map(id=>identities[`Actor.${id}`]?.split('.').at(-1)||id);
      const serialized=typeof raw==='string'&&typeof parse(raw)!=='string'?JSON.stringify(value):value;
      await env.setSetting(key,serialized);receipt.applied.push(key);await commit();
    }
    if(Object.keys(data.sharedInbox||{}).length&&!receipt.applied.includes('sharedInbox')){
      const store=clone(env.getSetting('playerChronicleV1')||{version:1,books:{},inbox:{}});store.inbox||={};
      for(const [key,notes] of Object.entries(data.sharedInbox||{})){const [oldOwner,kind]=key.split(':');if(!users[oldOwner]||!['gm','party'].includes(kind))continue;const mapped=remap(notes,identities,users);store.inbox[`${users[oldOwner]}:${kind}`]=merge(store.inbox[`${users[oldOwner]}:${kind}`]||{},mapped,packageId.slice(0,8));}
      await env.setSetting('playerChronicleV1',store);receipt.applied.push('sharedInbox');await commit();
    }
    // Keep the document mapping private; per-player receipts contain only visible targets.
    receipt.identities=Object.entries(identities).map(([sourceUuid,targetUuid])=>({sourceUuid,targetUuid}));receipt.users=users;await commit();
    // Foreign GM Notes are restored only to this GM's private Vault. Never put
    // this text in Actor/Journal flags, biography, shared Chronicle or the index.
    const moduleNotes=rows.filter(row=>identities[row.sourceUuid]&&typeof row.sourceData.flags?.['gm-notes']?.notes==='string'&&row.sourceData.flags['gm-notes'].notes.trim());
    if(moduleNotes.length){
      guard();const key='gmContextualPrivateVaultV2';if(!env.hasSetting(key))throw Error('Private Vault is required to restore GM Notes.');
      const raw=env.getSetting(key),vault=parse(raw)||{schema:'adventurers-tome.private-vault',version:2,records:{}};vault.records||={};receipt.moduleGmNotes||=[];
      for(const row of moduleNotes){
        const uuid=identities[row.sourceUuid],id=`taf${packageId.slice(0,8)}${row.sourceData._id}`,body=remap(row.sourceData.flags['gm-notes'].notes,identities,users);
        const record=vault.records[uuid]||{uuid,documentName:row.type,documentId:uuid.split('.').at(-1),nameSnapshot:row.name,notes:[],facts:[],relations:[]};record.notes||=[];
        if(!record.notes.some(note=>note.id===id))record.notes.push({id,title:'Imported GM Notes',body,type:'secret',status:'open',pinned:false,createdAt:Date.now(),updatedAt:Date.now()});
        vault.records[uuid]=record;
        if(!receipt.moduleGmNotes.some(note=>note.sourceUuid===row.sourceUuid))receipt.moduleGmNotes.push({sourceUuid:row.sourceUuid,original:clone(row.sourceData.flags['gm-notes'])});
      }
      await env.setSetting(key,typeof raw==='string'?JSON.stringify(vault):vault);await commit();
    }
    if(Object.keys(data.gmBooks||{}).length&&!receipt.applied.includes('gmBooks')){
      await restoreOwn({user:env.user,read:()=>env.getSetting('playerChronicleV1'),write:store=>env.setSetting('playerChronicleV1',store)},
        {format:'tome-chronicle-transfer',version:1,source:{worldId:source.worldId,ownerId:data.gmOwnerId},books:data.gmBooks},
        {sourceWorldId:source.worldId,sourceOwnerId:data.gmOwnerId,targetOwnerId:env.user().id,links:receipt.identities});
      receipt.applied.push('gmBooks');await commit();
    }
    for(const row of rows){guard();const uuid=identities[row.sourceUuid];if(!uuid||row.type==='Folder'||row.packId)continue;
      // Restore page overrides before publishing the parent Journal's visibility.
      if(row.type==='JournalEntry')for(const page of row.sourceData.pages||[]){const pageUuid=identities[`${row.sourceUuid}.JournalEntryPage.${page._id}`];if(pageUuid)await env.setOwnership(pageUuid,ownership({ownership:page.ownership||{default:-1}},users,env.users(),true));}
      await env.setOwnership(uuid,ownership(row.sourceData,users,env.users()));}
    for(const sourceUser of data.users){guard();const targetId=users[sourceUser.id];if(!targetId)continue;const links=[];for(const [sourceUuid,targetUuid] of Object.entries(identities)){guard();if(await env.canView(targetUuid,targetId))links.push({sourceUuid,targetUuid});}await env.receipt(targetId,{version:1,packageId,sourceWorldId:source.worldId,sourceWorldName:source.worldName,sourceOwnerId:sourceUser.id,targetOwnerId:targetId,links});}
    receipt.complete=true;await commit();
  }
  function ownBundle(env){
    const user=env.user();if(!user)throw Error('Sign in to export your Chronicle.');const state=env.read();
    return {format:'tome-chronicle-transfer',version:1,source:{worldId:env.world().id,worldName:env.world().title,ownerId:user.id,ownerName:user.name},books:clone(state.books||{})};
  }
  async function restoreOwn(env,bundle,receipt){
    safe(bundle);if(bundle?.format!=='tome-chronicle-transfer'||bundle.version!==1||!bundle.source?.ownerId||!bundle.books||typeof bundle.books!=='object')throw Error('Choose an original Chronicle transfer file.');
    const me=env.user();if(!receipt||receipt.sourceWorldId!==bundle.source.worldId||receipt.sourceOwnerId!==bundle.source.ownerId||receipt.targetOwnerId!==me.id)throw Error('The GM must map your old account to this account before importing this Chronicle.');
    const identities=Object.fromEntries(receipt.links.map(row=>[row.sourceUuid,row.targetUuid]));const state=clone(env.read());state.books||={};state.transfers||=[];
    const signature=await globalThis.AdventurersTomeMigrationCore.digest(JSON.stringify(bundle));if(state.transfers.includes(signature))return {alreadyImported:true};
    for(const [kind,notes] of Object.entries(bundle.books)){if(!['private','gm','party'].includes(kind)||!notes||typeof notes!=='object')throw Error('Unsupported Chronicle book.');state.books[kind]||={};
      for(const [id,raw] of Object.entries(notes)){if(!/^[a-zA-Z0-9]+$/.test(id)||raw.id!==id)throw Error('Invalid Chronicle note identity.');const row=clone(raw);safe(row);
        const targetId=state.books[kind][id]&&JSON.stringify(state.books[kind][id])!==JSON.stringify(row)?`migrated${signature.slice(0,8)}${id}`:id;row.id=targetId;
        if(row.envelope){row.envelope.migrationContext||={worldId:bundle.source.worldId,ownerId:bundle.source.ownerId,noteId:id};row.migrationLinks=[...(row.migrationLinks||[]).map(link=>({...link,targetUuid:identities[link.targetUuid]||link.targetUuid})),...clone(receipt.links)];}
        else if(row.note)row.note=remap(row.note,identities,{[bundle.source.ownerId]:me.id});
        row.delivered=false;state.books[kind][targetId]=row;
      }
    }
    state.transfers.push(signature);await env.write(state);return {alreadyImported:false};
  }
  globalThis.AdventurersTomePrivateMigration=Object.freeze({capture,validate,validateUsers,remap,merge,ownership,restore,ownBundle,restoreOwn,GM_KEYS,WORLD_KEYS});
})();
