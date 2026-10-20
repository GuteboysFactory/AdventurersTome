/* Read-only migration snapshots and export. Target imports live in migration-import.js. */
(() => {
  const ID = 'adventurers-tome';
  const TYPES = Object.freeze({Actor:'actors', Item:'items', JournalEntry:'journal', Scene:'scenes', Playlist:'playlists', RollTable:'tables', Folder:'folders'});
  const EMBEDDED = Object.freeze({Actor:{items:'Item',effects:'ActiveEffect'}, Item:{effects:'ActiveEffect'}, JournalEntry:{pages:'JournalEntryPage'}, Scene:{tokens:'Token',tiles:'Tile',walls:'Wall',lights:'AmbientLight',sounds:'AmbientSound',notes:'Note',drawings:'Drawing',templates:'MeasuredTemplate',regions:'Region'}, Playlist:{sounds:'PlaylistSound'}, RollTable:{results:'TableResult'}, Region:{behaviors:'RegionBehavior'}});
  const GENERIC = new Set(['JournalEntry','Scene','Playlist','RollTable','Folder']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const yieldTurn = () => new Promise(resolve => setTimeout(resolve, 0));
  const canonical = (world, uuid) => `tome:${encodeURIComponent(world)}:${encodeURIComponent(uuid)}`;
  const realmLibraries=new Set(['skills','traits','wises','conditions','gear','tokens-of-power','talents','npc-templates'].map(name=>`world.realm-guard-starter-${name}`));
  function systemLibraryPack(id,metadata={},systemId){return metadata.packageType==='system'||(systemId==='realm-guard'&&realmLibraries.has(id));}
  function systemLibraryCopy(raw){const record=raw.flags?.[ID]?.migrationV1,source=record?.sourceUuid;return record?.sourceSystem?.systemId==='realm-guard'&&source?.startsWith('Compendium.')&&realmLibraries.has(source.split('.').slice(1,3).join('.'));}
  const isProvenancePath=path=>/(?:^|\.)_stats\.|(?:^|\.)flags\.core\.sourceId(?:\.|$)|(?:^|\.)flags\.adventurers-tome\.migrationV1(?:\.|$)/.test(path||'');
  function classification(raw,type) {
    const flags=raw.flags?.[ID]||{},category=flags.worldProfile?.category;
    if(typeof category==='string'&&category.trim())return {category:category.trim().toLowerCase(),authority:'tome-world-profile',documentType:type,systemType:raw.type||null};
    if(type==='Actor'&&['character','npc'].includes(raw.type))return {category:raw.type,authority:'system-document-type',documentType:type,systemType:raw.type};
    if(flags.migrationV1?.targetCategory)return {category:flags.migrationV1.targetCategory,authority:'confirmed-migration-category',documentType:type,systemType:raw.type||null};
    if(type==='Item')return {category:'item',authority:'document-type',documentType:type,systemType:raw.type||null};
    if(typeof flags.type==='string'&&flags.type)return {category:flags.type,authority:'tome-type',documentType:type,systemType:raw.type||null};
    return {category:null,authority:'unknown',documentType:type,systemType:raw.type||null};
  }
  const check = signal => { if(signal?.aborted)throw new DOMException('Migration analysis cancelled.', 'AbortError'); };
  function assertGM(env) { if(!env.user()?.isGM)throw Error('Only a GM can use the Migration Toolkit.'); }
  function isChronicle(raw) {
    if(!raw||typeof raw!=='object')return false;
    const f=raw.flags?.[ID];
    if(f?.chronicleV1||f?.chronicleEntries)return true;
    // Adventure packs can contain nested Chronicle journals. Exclude the whole
    // containing document until owner-aware migration can handle it safely.
    return Object.values(raw).some(isChronicle);
  }
  function stable(value) {
    if(Array.isArray(value))return value.map(stable);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
    return value;
  }
  async function digest(value) {
    const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
    if(globalThis.crypto?.subtle)return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    // Foundry can be served over HTTP. Checksums must work there too; this
    // fallback hashes locally and yields without requiring encryption APIs.
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),block=new Uint8Array(64),view=new DataView(block.buffer);
    const rotate=(n,b)=>(n>>>b)|(n<<(32-b)),length=Math.ceil((bytes.length+9)/64)*64;
    for(let offset=0;offset<length;offset+=64) {
      block.fill(0);block.set(bytes.subarray(offset,Math.min(offset+64,bytes.length)));
      if(offset<=bytes.length&&bytes.length<offset+64)block[bytes.length-offset]=0x80;
      if(offset===length-64){view.setUint32(56,Math.floor(bytes.length/0x20000000));view.setUint32(60,(bytes.length*8)>>>0);}
      for(let i=0;i<16;i++)w[i]=view.getUint32(i*4);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,h]=state;
      for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      const result=[a,b,c,d,e,f,g,h];for(let i=0;i<8;i++)state[i]=(state[i]+result[i])>>>0;
      if(offset&&offset%65536===0)await yieldTurn();
    }
    return state.map(n=>n.toString(16).padStart(8,'0')).join('');
  }
  function inspect(raw, type, uuid, addIdentity, refs, assets, dependencies) {
    const addRef=(path,target)=>{if(target&&!isProvenancePath(path))refs.push({sourceUuid:uuid,path,targetUuid:target});};
    const scan=(value,path='')=>{
      if(typeof value==='string') {
        for(const hit of value.matchAll(/@UUID\[([^\]#]+)(?:#[^\]]*)?\]|data-uuid=["']([^"']+)["']/g))addRef(path,hit[1]||hit[2]);
        for(const hit of value.matchAll(/(?:Compendium\.[\w.-]+|(?:Actor|Item|JournalEntry|Scene|Playlist|RollTable|Folder)\.[\w.-]+)/g)) {
          if(value===hit[0])addRef(path,hit[0]);
        }
        const paths=[];
        if(/\.(?:avif|bmp|gif|jpe?g|png|svg|webp|mp3|ogg|wav|flac|m4a|aac|mp4|webm|m4v)(?:[?#].*)?$/i.test(value)&&!/[<>\n]/.test(value))paths.push(value);
        for(const hit of value.matchAll(/(?:src|poster)=["']([^"']+)["']|url\(["']?([^)'"\s]+)["']?\)/gi))paths.push(hit[1]||hit[2]);
        for(const asset of paths) {
          let row=assets.get(asset);if(!row){row={source:asset,uses:[],status:'referenced',packagePath:null};assets.set(asset,row);}
          row.uses.push({sourceUuid:uuid,path});
          const module=asset.match(/(?:^|\/)modules\/([^/]+)\//);if(module)dependencies.add(`module:${module[1]}`);
          const system=asset.match(/(?:^|\/)systems\/([^/]+)\//);if(system)dependencies.add(`system:${system[1]}`);
        }
      } else if(Array.isArray(value))value.forEach((child,i)=>scan(child,`${path}.${i}`));
      else if(value && typeof value==='object')for(const [key,child] of Object.entries(value))scan(child,path?`${path}.${key}`:key);
    };
    scan(raw);
    // Known Foundry ID fields. Original values remain intact in sourceData.
    if(raw.folder)addRef('folder',`${uuid.startsWith('Compendium.')?uuid.split('.').slice(0,3).join('.')+'.Folder.':'Folder.'}${raw.folder}`);
    if(type==='Scene') {
      if(raw.journal)addRef('journal',`JournalEntry.${raw.journal}`);
      if(raw.playlist)addRef('playlist',`Playlist.${raw.playlist}`);
      if(raw.playlistSound&&raw.playlist)addRef('playlistSound',`Playlist.${raw.playlist}.PlaylistSound.${raw.playlistSound}`);
      for(const [i,token] of (raw.tokens||[]).entries())if(token.actorId)addRef(`tokens.${i}.actorId`,`Actor.${token.actorId}`);
      for(const [i,note] of (raw.notes||[]).entries())if(note.entryId){addRef(`notes.${i}.entryId`,`JournalEntry.${note.entryId}`);if(note.pageId)addRef(`notes.${i}.pageId`,`JournalEntry.${note.entryId}.JournalEntryPage.${note.pageId}`);}
    }
    if(type==='Folder'&&raw.folder)addRef('parent',`Folder.${raw.folder}`);
    const profile=raw.flags?.[ID]?.worldProfile;
    if(profile?.actorId)addRef(`flags.${ID}.worldProfile.actorId`,`Actor.${profile.actorId}`);
    if(profile?.itemId)addRef(`flags.${ID}.worldProfile.itemId`,`Item.${profile.itemId}`);
    if(type==='RollTable')for(const [i,result] of (raw.results||[]).entries())if(result.documentCollection&&result.documentId) {
      const c=result.documentCollection;
      addRef(`results.${i}`,`${c.includes('.')?'Compendium.':''}${c}.${result.documentId}`);
    }
    function embed(data,kind,parent) {
      for(const [field,childType] of Object.entries(EMBEDDED[kind]||{}))for(const child of data[field]||[]) {
        if(!child._id)continue;const childUuid=`${parent}.${childType}.${child._id}`;
        addIdentity(childUuid,childType,parent);embed(child,childType,childUuid);
      }
    }
    embed(raw,type,uuid);
  }
  function createMigrationToolkit(env) {
    function inventory() {
      assertGM(env);
      return {types:Object.entries(TYPES).map(([type,key])=>({type,count:(env.collection(key)||[]).filter(doc=>{const raw=doc.toObject();return !isChronicle(raw)&&!systemLibraryCopy(raw);}).length})),
        packs:env.packs().filter(pack=>!systemLibraryPack(pack.collection,pack.metadata,env.system().id)).map(pack=>({id:pack.collection,label:pack.metadata?.label||pack.collection,type:pack.documentName||pack.metadata?.type,origin:pack.metadata?.packageType||'unknown'})),excludedPacks:env.packs().filter(pack=>systemLibraryPack(pack.collection,pack.metadata,env.system().id)).map(pack=>({id:pack.collection,label:pack.metadata?.label||pack.collection}))};
    }
    async function analyze(options={}) {
      assertGM(env);const signal=options.signal;check(signal);const revision=env.revision?.();
      const selected=options.types||Object.keys(TYPES),packIds=options.packs||[];
      if(selected.some(type=>!TYPES[type]))throw Error('Unknown migration document type.');
      const world=env.world(), sourceSystem=env.system(), entries=[], identityMap=[], refs=[], assets=new Map(), dependencies=new Set(), excluded=[], unsupported=[];
      const addIdentity=(uuid,type,parentUuid=null)=>{identityMap.push({sourceUuid:uuid,canonicalId:canonical(world.id,uuid),documentType:type,parentUuid,targetUuid:null});};
      const report=(message)=>{check(signal);assertGM(env);options.progress?.({message,documents:entries.length});};
      async function collect(doc,type,packId=null) {
        check(signal);assertGM(env);
        const raw=clone(doc.toObject());
        const uuid=doc.uuid||`${packId?'Compendium.'+packId+'.':type+'.'}${raw._id}`;
        if(systemLibraryCopy(raw)){excluded.push({sourceUuid:uuid,reason:'System-library copy created by an earlier migration; not active campaign data.'});return;}
        if(isChronicle(raw)){excluded.push({sourceUuid:uuid,reason:'Player Chronicle data requires owner-aware migration in qa.3.'});return;}
        if(!raw._id)throw Error(`Missing document identity: ${uuid}`);
        const status=type==='Actor'||type==='Item'?'unmapped':GENERIC.has(type)?'ready':'unsupported';
        addIdentity(uuid,type);inspect(raw,type,uuid,addIdentity,refs,assets,dependencies);
        const flags=Object.keys(raw.flags||{}).filter(key=>key!==ID && key!=='core');flags.forEach(key=>dependencies.add(`module:${key}`));
        entries.push({canonicalId:canonical(world.id,uuid),sourceUuid:uuid,documentType:type,classification:classification(raw,type),packId,name:raw.name||type,status,
          sourceData:raw,sourceSystem:sourceSystem.id,unmapped:status==='unmapped'?{reason:'Source/target system adapter required.',systemData:clone(raw.system||{})}:null,
          review:flags.length?['Module flags preserved; dependent module behaviour requires review.']:[]});
        if(type==='Scene'&&raw.tokens?.length)entries.at(-1).review.push('Token Actor links and system-specific token data require target adapter review.');
        if(status==='unsupported')unsupported.push({sourceUuid:uuid,documentType:type,reason:'Preserved source data; target support requires review.'});
        if(entries.length%10===0){report(`Reading ${type}…`);await env.yield();}
      }
      for(const type of selected) {
        report(`Reading ${type}…`);
        for(const doc of env.collection(TYPES[type])||[])await collect(doc,type);
        await env.yield();
      }
      const packs=[];
      for(const id of packIds) {
        const pack=env.packs().find(p=>p.collection===id);if(!pack)throw Error(`Compendium no longer exists: ${id}`);
        if(systemLibraryPack(id,pack.metadata,sourceSystem.id)){excluded.push({packId:id,reason:'System-provided library: reinstall the system in the destination; not campaign data.'});continue;}
        report(`Reading ${pack.metadata?.label||id}…`);
        const metadata=clone(pack.metadata||{});packs.push({id,metadata,folders:(pack.folders?.contents||[]).map(folder=>clone(folder.toObject()))});
        dependencies.add(`${metadata.packageType||'package'}:${metadata.packageName||id.split('.')[0]}`);
        for(const folder of packs.at(-1).folders)if(folder._id)addIdentity(`Compendium.${id}.Folder.${folder._id}`,'Folder');
        const documents=await pack.getDocuments();check(signal);
        for(const doc of documents)await collect(doc,doc.documentName||pack.documentName||metadata.type,id);
        await env.yield();
      }
      if(new Set(identityMap.map(row=>row.sourceUuid)).size!==identityMap.length)throw Error('Duplicate source identities detected; export stopped.');
      const known=new Set(identityMap.map(row=>row.sourceUuid));
      const references=[...new Map(refs.map(row=>[JSON.stringify(row),{...row,status:known.has(row.targetUuid)?'included':'unresolved'}])).values()];
      for(const entry of entries)if(entry.status==='ready'&&(entry.review.length||references.some(ref=>ref.sourceUuid===entry.sourceUuid&&ref.status==='unresolved')))entry.status='needs-review';
      const counts=Object.fromEntries(Object.keys(TYPES).map(type=>[type,0]));for(const entry of entries)counts[entry.documentType]=(counts[entry.documentType]||0)+1;
      const module=env.module();
      const manifest={format:'tome-migration',schemaVersion:1,tomeVersion:module.version,createdAt:new Date().toISOString(),source:{worldId:world.id,worldName:world.title||world.id,systemId:sourceSystem.id,systemVersion:sourceSystem.version,foundryVersion:env.foundryVersion()},targetSystem:options.targetSystem||null,
        entityCounts:counts,totalDocuments:entries.length,totalIdentities:identityMap.length,selectedTypes:[...selected],selectedPacks:packs.map(pack=>pack.id),mediaMode:options.mediaMode==='include'?'include':'references',dependencies:[...dependencies].sort(),
        privacy:{classification:'private-gm-migration-package',ownership:'source user IDs preserved; target user mapping required before visibility is restored',chronicle:'excluded until owner-aware migration'},
        unmappedEntries:entries.filter(row=>row.status==='unmapped').map(row=>row.sourceUuid),unsupportedEntries:unsupported,unresolvedEntries:references.filter(row=>row.status==='unresolved'),excludedEntries:excluded,
        limitations:['Target copies require reviewed mapping in the destination world.','Export preserves Actor and Item rules data without conversion.','GM data belongs to the exporting GM. Each player moves their private Chronicle separately.','Module flags and scene automation may need their original modules.']};
      const privateData=await env.privateSnapshot?.()||null;if(privateData){manifest.schemaVersion=2;manifest.privateData={ownerId:privateData.gmOwnerId,users:privateData.users.length,stores:Object.keys(privateData.settings).length};}
      const snapshot={manifest,documents:entries,packs,identityMap,references,assets:[...assets.values()],...(privateData?{privateData}:{})};
      snapshot.manifest.snapshotHash=await digest(JSON.stringify(stable({documents:entries,packs,identityMap,references,assets:snapshot.assets,source:manifest.source,dependencies:manifest.dependencies,...(privateData?{privateData}:{})})));
      check(signal);assertGM(env);
      if(revision!==env.revision?.())throw Error('Source content changed during analysis. Run Analyze again.');
      report('Analysis complete.');return snapshot;
    }
    async function exportPackage(snapshot,{signal,progress}={}) {
      assertGM(env);check(signal);
      if(snapshot?.manifest?.format!=='tome-migration')throw Error('Analyze the selected content before exporting.');
      const fresh=await analyze({types:snapshot.manifest.selectedTypes,packs:snapshot.manifest.selectedPacks,mediaMode:snapshot.manifest.mediaMode,targetSystem:snapshot.manifest.targetSystem,signal,progress});
      if(fresh.manifest.snapshotHash!==snapshot.manifest.snapshotHash)throw Error('Source content changed after analysis. Run Analyze again before exporting.');
      // Export the revalidated source snapshot, never a caller-mutated payload.
      const output=clone(fresh),files=[], totalLimit=512*1024*1024;let total=0;
      for(const [index,asset] of output.assets.entries()) {
        check(signal);assertGM(env);progress?.({message:`Media ${index+1} / ${output.assets.length}`,documents:output.documents.length});
        if(output.manifest.mediaMode==='include') {
          try {
            const data=await env.readAsset(asset.source,{signal,maxBytes:64*1024*1024});check(signal);
            if(!(data instanceof Uint8Array))throw Error('Invalid media response.');
            if(total+data.length>totalLimit)throw Error('Media exceeds the 512 MiB package limit; export references or select less content.');
            total+=data.length;const ext=asset.source.split(/[?#]/)[0].match(/\.([a-z0-9]{1,8})$/i)?.[1]||'bin';
            asset.packagePath=`assets/${index}.${ext}`;asset.status='included';asset.bytes=data.length;asset.sha256=await digest(data);files.push({name:asset.packagePath,data});
          } catch(error) {if(error.name==='AbortError')throw error;asset.status='unavailable';asset.error=error.message;}
        }
        await env.yield();
      }
      const payload={documents:output.documents,packs:output.packs,identityMap:output.identityMap,references:output.references,assets:output.assets,...(output.privateData?{privateData:output.privateData}:{})};
      const data=new TextEncoder().encode(JSON.stringify(payload));
      output.manifest.files=[{path:'campaign.json',sha256:await digest(data),bytes:data.length},...output.assets.filter(a=>a.status==='included').map(a=>({path:a.packagePath,sha256:a.sha256,bytes:a.bytes}))];
      output.manifest.mediaIssues=output.assets.filter(a=>a.status==='unavailable');
      output.manifest.payloadBytes=data.length;files.unshift({name:'campaign.json',data});files.unshift({name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(output.manifest,null,2))});
      check(signal);assertGM(env);const zip=await storedZip(files,{signal,yield:env.yield});
      return {blob:new Blob([zip],{type:'application/zip'}),manifest:output.manifest,assets:output.assets};
    }
    return Object.freeze({inventory,analyze,exportPackage});
  }
  const CRC_TABLE=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  async function storedZip(files,options={}) {
    if(files.length>65535)throw Error('Too many package files for ZIP32.');
    const parts=[],central=[];let offset=0;
    for(const file of files) {
      check(options.signal);
      if(!/^(?:manifest\.json|campaign\.json|assets\/[0-9]+\.[a-z0-9]+)$/i.test(file.name))throw Error('Unsafe package path.');
      const name=new TextEncoder().encode(file.name),data=file.data;let crc=0xffffffff;
      for(let i=0;i<data.length;i++){crc=CRC_TABLE[(crc^data[i])&255]^(crc>>>8);if(i&&i%1048576===0){check(options.signal);await (options.yield||yieldTurn)();}}
      crc=(crc^0xffffffff)>>>0;
      const h=new Uint8Array(30),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      const c=new Uint8Array(46),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
      parts.push(h,name,data);central.push(c,name);offset+=h.length+name.length+data.length;
      if(offset>0xffffffff)throw Error('Package too large for ZIP32.');await (options.yield||yieldTurn)();
    }
    const size=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
    return new Blob([...parts,...central,end]);
  }
  function identityPairs(record) {
    if(Array.isArray(record.identities))return record.identities.map(row=>[row.sourceUuid,row.targetUuid]).filter(([source,target])=>typeof source==='string'&&typeof target==='string');
    const pairs=[];
    function walk(value,path=''){for(const [key,child] of Object.entries(value||{})){const full=path?`${path}.${key}`:key;if(typeof child==='string')pairs.push([full,child]);else if(child&&typeof child==='object')walk(child,full);}}
    walk(record.identities);
    return pairs;
  }
  const packName=(packageId,sourceId)=>`tome-migration-${packageId.slice(0,12)}-${sourceId.replace(/[^a-z0-9-]/gi,'-').toLowerCase().slice(0,64)}`;
  function standardFolderAliases(rows,bootstrap) {
    if(!bootstrap?.root)return {};
    const folders=rows.filter(row=>row.type==='Folder'&&!row.packId&&row.sourceData.type==='JournalEntry');
    const roots=folders.filter(row=>!row.sourceData.folder&&String(row.sourceData.name).replace(/’/g,"'").trim().toLowerCase()==="adventurer's tome"),rootIds=new Set(roots.map(row=>row.sourceData._id)),worlds=new Set(),aliases={};
    for(const row of roots)aliases[row.sourceUuid]=`Folder.${bootstrap.root.id}`;
    for(const row of folders){const section=row.sourceData.flags?.[ID]?.section;if(rootIds.has(row.sourceData.folder)&&['sessions','quests','world','rules'].includes(section)&&bootstrap[section]?.id){aliases[row.sourceUuid]=`Folder.${bootstrap[section].id}`;if(section==='world')worlds.add(row.sourceData._id);}}
    for(const row of folders){const category=row.sourceData.flags?.[ID]?.standardFolder;if(worlds.has(row.sourceData.folder)&&bootstrap.folders?.[category]?.id)aliases[row.sourceUuid]=`Folder.${bootstrap.folders[category].id}`;}
    return aliases;
  }
  globalThis.AdventurersTomeMigrationCore=Object.freeze({createMigrationToolkit,storedZip,digest,classification,isProvenancePath,identityPairs,packName,systemLibraryPack,systemLibraryCopy,standardFolderAliases,revision:'1.9.0'});
})();
