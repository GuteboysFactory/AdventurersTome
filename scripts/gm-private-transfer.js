globalThis.ATTestAI.assertEnabled();
/* Personal GM backup. No other user's settings or Chronicle books are read. */
(() => {
  const keys=['gmPrivateVault','gmContextualPrivateVaultV2','gmWorkspace','gmRevealQueue'];
  const gm=env=>{if(!env.user()?.isGM)throw Error('Only a GM can transfer GM Notes & Vault.');};
  function exportBundle(env,{allowImages=false}={}){
    if(globalThis.AdventurersTomeVaultSecurity&&!globalThis.AdventurersTomeVaultSecurity.unlocked())throw Error('Unlock Private Vault before exporting GM Notes & Vault.');
    gm(env);const user=env.user(),world=env.world();
    if(!allowImages&&keys.filter(key=>env.hasSetting(key)).some(key=>{const raw=env.getSetting(key);return typeof raw==='string'&&/\"attachments\":\s*\[\s*\{/.test(raw);}))throw Error('This Vault contains private images. Use the complete GM Notes & Vault export, which includes private images. No incomplete notes-only export was created.');
    return {format:'tome-gm-private-transfer',version:1,source:{worldId:world.id,worldName:world.title||world.id,ownerId:user.id},privateData:{version:1,gmOwnerId:user.id,users:[{id:user.id,name:user.name,isGM:true}],settings:Object.fromEntries(keys.filter(key=>env.hasSetting(key)).map(key=>[key,structuredClone(env.getSetting(key))])),archives:{},worldSettings:{},sharedInbox:{},gmBooks:{}}};
  }
  function validate(bundle){
    if(bundle?.format!=='tome-gm-private-transfer'||bundle.version!==1||typeof bundle.source?.worldId!=='string'||!bundle.source.worldId||bundle.source.ownerId!==bundle.privateData?.gmOwnerId)throw Error('Choose a GM Notes & Vault backup.');
    globalThis.AdventurersTomePrivateMigration.validate(bundle.privateData);if(bundle.media)globalThis.AdventurersTomeVaultMediaTransfer.validateMedia(bundle);
    const data=bundle.privateData;
    if(data.users.length!==1||Object.keys(data.settings||{}).some(key=>!keys.includes(key))||['archives','worldSettings','sharedInbox','gmBooks'].some(key=>Object.keys(data[key]||{}).length))throw Error('This file contains data outside GM Notes & Vault.');
  }
  function mappings(env,bundle){gm(env);validate(bundle);return Object.entries(env.state()?.imports||{}).filter(([,row])=>row.complete&&row.source?.worldId===bundle.source.worldId&&row.originalPrivateData?.gmOwnerId===bundle.source.ownerId).map(([id,row])=>({id,name:row.source.worldName||row.source.worldId,identities:row.identities||[]}));}
  async function restore(env,bundle,mappingId,signal){
    gm(env);validate(bundle);let identities={};
    if(bundle.source.worldId!==env.world().id){const chosen=mappings(env,bundle).find(row=>row.id===mappingId);if(!chosen)throw Error('Import the campaign ZIP first, then choose its mapping to restore Vault links in this world.');identities=Object.fromEntries(chosen.identities.map(row=>[row.sourceUuid,row.targetUuid]));}
    const packageId=await globalThis.AdventurersTomeMigrationCore.digest(JSON.stringify(bundle));
    if(bundle.media){const media=game.modules.get('adventurers-tome').api.privateVaultMedia;bundle=await globalThis.AdventurersTomeVaultMediaTransfer.restoreMedia(bundle,{upload:bytes=>media.upload(new File([bytes],'restored.webp',{type:'image/webp'}))});}
    const state=()=>{const value=structuredClone(env.state());const previous=value.imports?.[packageId];if(previous?.complete){previous.applied=[];previous.complete=false;}return value;};
    await globalThis.AdventurersTomePrivateMigration.restore({...env,state,canView:async()=>false,receipt:async()=>{}},{data:bundle.privateData,source:bundle.source,packageId,mapping:{[bundle.source.ownerId]:env.user().id},identities,rows:[],signal});
    if(bundle.media){const secure=game.modules.get('adventurers-tome').api.securePrivateVault;const existing=JSON.parse(secure.get('vaultCategoriesV1')||'{}').categories||[];const merged=new Map(existing.map(c=>[c.id,c]));for(const c of bundle.media.categories)if(!merged.has(c.id))merged.set(c.id,c);await secure.set('vaultCategoriesV1',JSON.stringify({version:1,categories:[...merged.values()]}));}return {restored:true};
  }
  globalThis.AdventurersTomeGmPrivateTransfer=Object.freeze({keys,exportBundle,exportWithMedia:async env=>{if(globalThis.game?.modules?.get('adventurers-tome')?.api?.gmInbox?.pending().length)throw Error('Review incoming GM notes before making a portable personal Vault backup. Pending records remain in the world.');const bundle=exportBundle(env,{allowImages:true}),media=game.modules.get('adventurers-tome').api.privateVaultMedia;return globalThis.AdventurersTomeVaultMediaTransfer.exportMedia(bundle,{read:async ref=>{const url=await media.imageURL(ref);return fetch(url).then(r=>r.arrayBuffer());},categories:media.categories().filter(c=>!c.builtin)});},validate,mappings,restore});
})();
