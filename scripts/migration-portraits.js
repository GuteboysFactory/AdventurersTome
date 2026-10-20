(() => {
  async function restore(env,{rows,paths={},signal}) {
    const result={replaced:0,unverified:0};if(env.systemId()!=='realm-guard')return result;
    const defaults={character:'systems/realm-guard/assets/actors/northern-ranger.webp',npc:'systems/realm-guard/assets/actors/npc-creature.webp'},seen=new Map();
    async function resolve(path,fallback){
      if(!env.user()?.isGM)throw Error('Only a GM can prepare migration portraits.');
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      if(paths[path])return path;
      if(!path||/^(?:icons\/svg\/mystery-man\.svg)(?:[?#].*)?$/.test(path)){result.replaced++;return fallback;}
      if(!seen.has(path))seen.set(path,Promise.resolve(env.available(path,signal)));
      const available=await seen.get(path);
      if(available===false){result.replaced++;return fallback;}
      if(available==null)result.unverified++;
      return path;
    }
    const actors=rows.filter(row=>row.type==='Actor'&&['character','npc'].includes(row.data?.type));
    for(const row of actors){row.data.img=await resolve(row.data.img,defaults[row.data.type]);const texture=row.data.prototypeToken?.texture;if(texture)texture.src=await resolve(texture.src,row.data.img);for(const profile of [row.data.flags?.['adventurers-tome']?.profile,row.data.flags?.['adventurers-tome']?.worldProfile])if(profile?.heroImage)profile.heroImage=await resolve(profile.heroImage,row.data.img);}
    for(const row of rows.filter(row=>row.type==='Scene'))for(const token of row.data?.tokens||[]){if(!token.texture)continue;const actor=actors.find(actor=>actor.sourceUuid===`Actor.${token.actorId}`);token.texture.src=await resolve(token.texture.src,actor?.data.img||defaults.npc);}
    return result;
  }
  globalThis.AdventurersTomeMigrationPortraits=Object.freeze({restore});
})();
