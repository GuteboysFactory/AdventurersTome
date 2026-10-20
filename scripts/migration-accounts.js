/* Explicitly requested Player accounts are created only when Do Import runs. */
(() => {
  function propose(env,data,previous={}){
    if(!env.user()?.isGM)throw Error('GM permission required.');
    const out={...previous};if(!data)return out;out[data.gmOwnerId]=env.user().id;
    const reserved=new Set(Object.values(out).filter(id=>id&&id!=='new-player'));
    for(const source of data.users){if(Object.hasOwn(out,source.id))continue;
      const matches=env.users().filter(user=>!user.isGM&&!reserved.has(user.id)&&String(user.name||'').trim().toLowerCase()===source.name.trim().toLowerCase());
      out[source.id]=source.isGM?null:matches.length===1?matches[0].id:'new-player';
      if(out[source.id]&&out[source.id]!=='new-player')reserved.add(out[source.id]);
    }
    return out;
  }
  async function resolve(env,data,mapping,source){
    if(!env.user()?.isGM)throw Error('GM permission required.');
    const out={...mapping};if(!data)return out;
    const fresh='new-player',requests=data.users.filter(row=>mapping[row.id]===fresh);
    // Validate every other selection before creating even the first account.
    const ids=env.users().map(user=>user.id);
    for(const row of data.users)if(!Object.hasOwn(mapping,row.id)||(mapping[row.id]!==null&&mapping[row.id]!==fresh&&!ids.includes(mapping[row.id])))throw Error(`Choose a destination or Keep private for ${row.name}.`);
    if(out[data.gmOwnerId]!==env.user().id)throw Error('The exporting GM must map to the importing GM.');
    const selected=new Map();
    for(const row of data.users){const target=out[row.id];if(!target||target===fresh)continue;const sources=selected.get(target)||[];sources.push(row);selected.set(target,sources);}
    for(const [target,sources] of selected)if(sources.length>1&&!(target===env.user().id&&sources.every(row=>row.isGM===true))){const name=env.users().find(user=>user.id===target)?.name||target;const error=Error(`Account mapping conflict: ${sources.map(row=>row.name).join(' + ')} both use ${name}. Choose a separate Player account or Keep GM-only. Old GM accounts may share the importing GM.`);error.code='TOME_ACCOUNT_MAPPING';throw error;}
    for(const row of requests){
      if(!env.user()?.isGM)throw Error('GM access changed.');
      const matches=env.users().filter(user=>(user.flags?.['adventurers-tome']?.migrationAccountV1||[]).some(record=>record.sourceWorldId===source.worldId&&record.sourceUserId===row.id));
      if(matches.length>1||matches.some(user=>user.isGM))throw Error(`Choose an existing Player account for ${row.name}; migration account is ambiguous.`);
      const user=matches[0]||await env.create({name:row.name,role:env.playerRole,flags:{'adventurers-tome':{migrationAccountV1:[{sourceWorldId:source.worldId,sourceUserId:row.id}]}}});
      if(!user?.id||user.isGM)throw Error('Could not create a Player account.');if(selected.has(user.id)){const error=Error(`Account mapping conflict: ${row.name} would reuse an account already assigned to another source. Choose a separate Player account.`);error.code='TOME_ACCOUNT_MAPPING';throw error;}out[row.id]=user.id;selected.set(user.id,[row]);
    }
    return out;
  }
  globalThis.AdventurersTomeMigrationAccounts=Object.freeze({propose,resolve});
})();
