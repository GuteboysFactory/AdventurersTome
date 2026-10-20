/* Target preparation and copy-only import. No source-world writes. */
(() => {
  const ID='adventurers-tome', TYPES=['Folder','Actor','Item','JournalEntry','Scene','Playlist','RollTable'];
  const embedded={Actor:{items:'Item',effects:'ActiveEffect'},Item:{effects:'ActiveEffect'},JournalEntry:{pages:'JournalEntryPage'},Scene:{tokens:'Token',tiles:'Tile',walls:'Wall',lights:'AmbientLight',sounds:'AmbientSound',notes:'Note',drawings:'Drawing',templates:'MeasuredTemplate',regions:'Region'},Playlist:{sounds:'PlaylistSound'},RollTable:{results:'TableResult'},Region:{behaviors:'RegionBehavior'}};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function safe(value) {
    if(!value||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)) {
      if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe object key in package.');
      safe(child);
    }
  }
  function guard(env,signal) {
    if(!env.user()?.isGM)throw Error('Only a GM can import migration packages.');
    if(signal?.aborted)throw new DOMException('Import cancelled. Already created copies remain in the target world.','AbortError');
  }
  function hasChronicle(value) {
    if(!value||typeof value!=='object')return false;
    return Boolean(value.flags?.[ID]?.chronicleV1||value.flags?.[ID]?.chronicleEntries)||Object.values(value).some(hasChronicle);
  }
  async function readPackage(bytes) {
    if(!(bytes instanceof Uint8Array)||bytes.length>600*1024*1024)throw Error('Package exceeds the 600 MiB limit.');
    const files=new Map(),decoder=new TextDecoder('utf-8',{fatal:true}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=0;
    while(offset+4<=bytes.length&&view.getUint32(offset,true)===0x04034b50) {
      if(offset+30>bytes.length)throw Error('Truncated ZIP.');
      const flags=view.getUint16(offset+6,true),method=view.getUint16(offset+8,true),size=view.getUint32(offset+18,true),expanded=view.getUint32(offset+22,true),length=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
      if(method!==0||(flags&9)||size!==expanded)throw Error('Use an original Tome Migration ZIP (stored, unencrypted entries).');
      const start=offset+30+length+extra,end=start+size;
      if(end>bytes.length)throw Error('Truncated ZIP entry.');
      const name=decoder.decode(bytes.subarray(offset+30,offset+30+length));
      if(!/^(?:manifest\.json|campaign\.json|assets\/[0-9]+\.[a-z0-9]+)$/i.test(name)||files.has(name))throw Error('Unsafe or duplicate package path.');
      files.set(name,bytes.slice(start,end));offset=end;await pause();
    }
    if(offset+4>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid ZIP directory.');
    const manifest=JSON.parse(decoder.decode(files.get('manifest.json')||new Uint8Array()));safe(manifest);
    if(manifest.format!=='tome-migration'||![1,2].includes(manifest.schemaVersion)||!Array.isArray(manifest.files))throw Error('Unsupported migration format.');
    const declared=new Set(['manifest.json']);
    for(const row of manifest.files) {
      const data=files.get(row.path);
      if(declared.has(row.path)||!data||data.length!==row.bytes||await AdventurersTomeMigrationCore.digest(data)!==row.sha256)throw Error(`Package checksum mismatch: ${row.path}`);
      declared.add(row.path);
    }
    if(declared.size!==files.size||!declared.has('campaign.json'))throw Error('Package contains undeclared files.');
    const payload=JSON.parse(decoder.decode(files.get('campaign.json')));safe(payload);
    if(payload.privateData){if(!globalThis.AdventurersTomePrivateMigration)throw Error('This package requires owner-aware migration support.');AdventurersTomePrivateMigration.validate(payload.privateData);}
    if(!Array.isArray(payload.documents)||!Array.isArray(payload.identityMap)||payload.documents.length>50000)throw Error('Invalid document list.');
    const seen=new Set();
    for(const row of payload.documents) {
      if(typeof row.sourceUuid!=='string'||seen.has(row.sourceUuid)||!row.sourceData||typeof row.sourceData!=='object')throw Error('Invalid or duplicate document identity.');
      seen.add(row.sourceUuid);
      if(hasChronicle(row.sourceData))throw Error('Chronicle migration requires owner-aware support.');
    }
    return {manifest,...payload,files,packageId:await AdventurersTomeMigrationCore.digest(files.get('campaign.json'))};
  }
  function createImporter(env) {
    const plans=new WeakMap(),mediaFiles=new WeakMap();
    const liveFlags=(flags,source,target)=>Object.fromEntries(Object.entries(flags||{}).filter(([namespace])=>namespace===ID||(source===target&&namespace===target)));
    function liveReference(path,source,target){const parts=String(path||'').split('.');for(let i=0;i<parts.length-1;i++)if(parts[i]==='flags'&&parts[i+1]!==ID&&!(source===target&&parts[i+1]===target))return false;return true;}
    function tafGroups(pkg) {
      guard(env);if(pkg.manifest.source.systemId!=='taf'||env.system().id!=='realm-guard')return [];
      const folders=new Map(pkg.documents.filter(row=>row.documentType==='Folder').map(row=>[row.sourceData._id,row.sourceData])),groups=new Map();
      for(const row of pkg.documents.filter(row=>row.documentType==='Actor')){
        const id=JSON.stringify([row.packId||'',row.sourceData.folder||'']),path=[],seen=new Set();let folder=folders.get(row.sourceData.folder);
        while(folder&&!seen.has(folder._id)){seen.add(folder._id);path.unshift(folder.name);folder=folders.get(folder.folder);}
        const pack=(pkg.packs||[]).find(pack=>pack.id===row.packId),name=row.packId?`Compendium: ${pack?.metadata?.label||row.packId}`:path.join(' / ')||'Actors without folder';
        const hints=[...path,row.packId?pack?.metadata?.label||row.packId:''];
        const pc=hints.some(value=>/^PC(?:\b|[ _-])/i.test(value)),npc=hints.some(value=>/^NPC(?:\b|[ _-])/i.test(value));
        const group=groups.get(id)||{id,name,count:0,suggested:pc&&!npc?'character':npc&&!pc?'npc':'',sample:[]};group.count++;if(group.sample.length<3)group.sample.push(row.name);groups.set(id,group);
      }
      return [...groups.values()];
    }
    function prepareTaf(pkg,choices={},groups={},fallback='',scenePolicy=false,userMapping={}) {
      guard(env);if(!tafGroups(pkg).length)throw Error('Choose a TAF campaign for Realm Guard.');
      const output=clone(choices);
      for(const row of pkg.documents){const current=output[row.sourceUuid]||{};
        if(row.documentType==='Actor'){
          const category=AdventurersTomeMigrationCore.classification(row.sourceData,'Actor').category,id=JSON.stringify([row.packId||'',row.sourceData.folder||'']);
          const type=['character','npc'].includes(category)?category:current.tafProposed===false&&current.type?current.type:current.tafTransfer?(groups[id]||fallback||current.type):(current.type||groups[id]||fallback);
          if(!['character','npc'].includes(type))continue;
          output[row.sourceUuid]={...current,type,tafTransfer:true,include:current.tafTransfer?current.include!==false:true};
        }else if(row.documentType==='Item')output[row.sourceUuid]={...current,tafTransfer:true,include:current.tafTransfer?current.include!==false:true};
        else if(row.documentType==='Scene')output[row.sourceUuid]={...current,tafSceneBase:scenePolicy===true};
      }
      return prepare(pkg,output,userMapping);
    }
    function proposeTaf(pkg,choices={},options={}) {
      guard(env);
      const input=clone(choices);
      for(const choice of Object.values(input))if(choice.tafProposed){delete choice.type;delete choice.tafTransfer;delete choice.include;delete choice.approved;}
      const groups={...Object.fromEntries(tafGroups(pkg).filter(group=>group.suggested).map(group=>[group.id,group.suggested])),...(options.groups||{})};
      const draft=prepareTaf(pkg,input,groups,options.fallback??'npc',options.sceneBase??true,options.userMapping||{});
      for(const row of draft.rows){const prior=choices[row.sourceUuid];if(prior?.tafProposed||(!prior?.type&&!prior?.approved&&prior?.tafProposed!==false))row.choice.tafProposed=true;}
      // Show the actual eligible set, including withheld dependencies, before the
      // single explicit Import approval. Preparing a proposal performs no writes.
      return approveReady(pkg,Object.fromEntries(draft.rows.map(row=>[row.sourceUuid,row.choice])),options.userMapping||{});
    }
    function classifyUnknown(pkg,choices={},type) {
      guard(env);if(!['character','npc'].includes(type))throw Error('Choose Character or NPC.');
      const output=clone(choices);
      for(const entry of pkg.documents)if(entry.documentType==='Actor'&&!AdventurersTomeMigrationCore.classification(entry.sourceData,entry.documentType).category&&!output[entry.sourceUuid]?.type)output[entry.sourceUuid]={...output[entry.sourceUuid],type,include:true,approved:false};
      return output;
    }
    function reuseMappings(pkg,choices={}) {
      guard(env);const rules=new Map(),normalize=value=>String(value||'').trim().toLowerCase();
      for(const entry of pkg.documents) {
        const choice=choices[entry.sourceUuid];if(!choice?.approved)continue;
        const key=`${entry.documentType}:${entry.sourceData.type}`,rule=rules.get(key)||{attributes:{},labels:new Set()};
        for(const item of entry.sourceData.items||[])if(choice.attributes?.[item._id]) {
          const label=normalize(item.system?.key||item.name),field=choice.attributes[item._id];
          if(rule.attributes[label]&&rule.attributes[label]!==field)throw Error(`Conflicting field mapping: ${label}`);
          rule.attributes[label]=field;
        }
        for(const item of entry.sourceData.items||[])if(item.type==='attribute')rule.labels.add(normalize(item.system?.key||item.name));
        rules.set(key,rule);
      }
      const output=clone(choices);
      for(const entry of pkg.documents) {
        const rule=rules.get(`${entry.documentType}:${entry.sourceData.type}`);if(!rule)continue;
        const current=output[entry.sourceUuid]||{};
        current.attributes??={};
        for(const item of entry.sourceData.items||[]) {
          const field=rule.attributes[normalize(item.system?.key||item.name)];
          if(field&&!current.attributes[item._id])current.attributes[item._id]=field;
        }
        const category=AdventurersTomeMigrationCore.classification(entry.sourceData,entry.documentType).category;
        if(!current.type&&['character','npc'].includes(category))current.type=category;
        if(current.type&&!entry.review?.length&&(entry.sourceData.items||[]).filter(item=>item.type==='attribute').every(item=>rule.labels.has(normalize(item.system?.key||item.name)))) {
          try {const mapped=AdventurersTomeMigrationAdapters.map(entry,pkg.manifest.source,env.system(),current);
            if(mapped.status==='mapped'){current.approved=true;current.include=current.include!==false;}
          }catch{current.approved=false;}
        }
        output[entry.sourceUuid]=current;
      }
      return output;
    }
    function prepare(pkg,choices={},userMapping={}) {
      guard(env);const target=clone(env.system()),worldId=env.world().id;
      const libraries=new Set((pkg.packs||[]).filter(pack=>AdventurersTomeMigrationCore.systemLibraryPack(pack.id,pack.metadata,pkg.manifest.source.systemId)).map(pack=>pack.id));
      const campaignDocuments=pkg.documents.filter(entry=>!(entry.packId&&(libraries.has(entry.packId)||AdventurersTomeMigrationCore.systemLibraryPack(entry.packId,{},pkg.manifest.source.systemId)))&&!AdventurersTomeMigrationCore.systemLibraryCopy(entry.sourceData));
      const entries=[...campaignDocuments,...(pkg.packs||[]).filter(pack=>!libraries.has(pack.id)).flatMap(pack=>(pack.folders||[]).map(folder=>({sourceUuid:`Compendium.${pack.id}.Folder.${folder._id}`,name:folder.name,documentType:'Folder',packId:pack.id,sourceData:folder})))];
      const rows=entries.map(entry=>{
        if(hasChronicle(entry.sourceData))throw Error('Chronicle migration requires owner-aware support.');
        const category=AdventurersTomeMigrationCore.classification(entry.sourceData,entry.documentType),choice=clone(choices[entry.sourceUuid]||{});
        if(entry.documentType==='Actor'&&['character','npc'].includes(category.category)) {
          if(choice.type&&choice.type!==category.category)throw Error(`Keep the source category for ${entry.name}: ${category.category}.`);
          choice.type=category.category;
        }
        let mapping;
        try {mapping=TYPES.includes(entry.documentType)?AdventurersTomeMigrationAdapters.map(entry,pkg.manifest.source,target,choice):{status:'unsupported',data:null,notes:['Document type preserved in package only.']};}
        catch(error){let suggestions=[];try{suggestions=AdventurersTomeMigrationAdapters.map(entry,pkg.manifest.source,target,{...choice,attributes:{}}).suggestions||[];}catch{}
          mapping={status:'needs-review',data:null,notes:[error.message],suggestions};}
        if(mapping.data&&pkg.manifest.source.systemId==='taf'&&target.id==='realm-guard'&&mapping.storyPreview?.contacts){
          // Resolve explicit source Actor links before target legacy-field migration runs.
          const fields=new Map();
          mapping.contactRepairs=[];
          for(const contact of mapping.storyPreview.contacts){
            if(!contact.sourceUuid)continue;
            const original=contact.sourceUuid,repairKey=JSON.stringify([contact.role||'',original]);
            if(!pkg.documents.some(candidate=>candidate.documentType==='Actor'&&candidate.sourceUuid===original)){
              const selected=choice.contactTargets?.[repairKey]||'';
              const repair={key:repairKey,role:contact.role||'Contact',sourceUuid:original,selectedUuid:selected};
              mapping.contactRepairs.push(repair);
              if(selected){
                const candidate=pkg.documents.find(item=>item.documentType==='Actor'&&!item.packId&&item.sourceUuid===selected);
                if(!candidate||candidate.sourceUuid===entry.sourceUuid)throw Error('Choose a different world Actor from this package for the contact.');
                contact.sourceUuid=selected;
                contact.details+='\nOriginal Actor reference: '+original;
                const literal=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                const pattern=new RegExp('('+literal(contact.role||'Contact')+'\\s*:\\s*)@UUID\\['+literal(original)+'(?:#[^\\]]*)?\\](?:\\{[^}]*\\})?','g');
                mapping.data.system.biography=mapping.data.system.biography.replace(pattern,(_whole,prefix)=>prefix+'@UUID['+selected+']');
              }
            }
            const found=pkg.documents.filter(candidate=>candidate.documentType==='Actor'&&candidate.sourceUuid===contact.sourceUuid);
            if(found.length!==1){
              if(contact.field&&mapping.data.system[contact.field]){contact.details+='\nOriginal '+contact.role+' text: '+mapping.data.system[contact.field];delete mapping.data.system[contact.field];}
              if(contact.name===contact.sourceUuid)contact.name=`Unresolved ${contact.role||'contact'}`;
              contact.details+='\nOriginal Actor reference: '+contact.sourceUuid;
              continue;
            }
            contact.name=found[0].name||found[0].sourceData?.name||contact.name;
            if(contact.field){const names=fields.get(contact.field)||new Set();names.add(contact.name);fields.set(contact.field,names);}
          }
          for(const original of new Set(mapping.contactRepairs.map(repair=>repair.sourceUuid))){
            const repairs=mapping.contactRepairs.filter(repair=>repair.sourceUuid===original),targets=new Set(repairs.map(repair=>repair.selectedUuid));
            if(repairs.every(repair=>repair.selectedUuid)&&targets.size===1){
              const literal=original.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
              mapping.data.system.biography=mapping.data.system.biography.replace(new RegExp('@UUID\\['+literal+'(?:#[^\\]]*)?\\]','g'),'@UUID['+[...targets][0]+']');
            }
          }
          for(const [field,names] of fields)if(names.size===1)mapping.data.system[field]=[...names][0];
          mapping.storyPreview.fields=Object.entries(mapping.data.system).filter(([field,value])=>typeof value==='string'&&!['biography','notes'].includes(field)).map(([field,value])=>({field,value}));
          // Same person may be both Friend and Senior Artisan; retain both roles/notes.
          const merged=new Map();
          for(const contact of mapping.storyPreview.contacts){const key=contact.sourceUuid||String(contact.name).trim().toLowerCase(),previous=merged.get(key);if(previous){if(!previous.details.includes(contact.details))previous.details+='\n'+contact.details;if(contact.parentRole)previous.parentRole=contact.parentRole;}else merged.set(key,contact);}
          mapping.storyPreview.contacts=[...merged.values()];
        }
        if(mapping.data&&(pkg.manifest.source.systemId===target.id||choice.tafTransfer)&&env.validateCopy) {
          try{if(env.validateCopy(entry.documentType,clone(mapping.data))===false)throw Error('Target data validation failed.');}
          catch(error){mapping={status:'needs-review',data:null,notes:[`Target cannot accept this data: ${error.message}`]};}
        }
        if(entry.documentType==='Scene'&&pkg.manifest.source.systemId!==target.id&&entry.sourceData.tokens?.some(token=>token.delta&&Object.keys(token.delta).length)){
          if(choice.tafSceneBase===true&&pkg.manifest.source.systemId==='taf'&&target.id==='realm-guard')mapping.notes.push('Confirmed: tokens use converted base Actors; TAF token overrides remain in the source archive.');
          else {mapping.status='needs-review';mapping.notes.push('Token-specific TAF rules need review. Use the shared scene policy or review this Scene.');}
        }
        if(mapping.data)mapping.data.ownership={default:0};
        return {sourceUuid:entry.sourceUuid,name:entry.name,type:entry.documentType,classification:category,...mapping,notes:[...mapping.notes,...(entry.review||[])],choice,included:Boolean(mapping.data)&&choice.include!==false,approved:choice.approved===true,sourceData:clone(entry.sourceData),packId:entry.packId};
      });
      const sources=new Set(rows.map(row=>row.sourceUuid));
      const references=clone(pkg.references||[]).filter(ref=>sources.has(ref.sourceUuid)&&!AdventurersTomeMigrationCore.isProvenancePath(ref.path)&&(liveReference(ref.path,pkg.manifest.source.systemId,target.id)||(rows.find(row=>row.sourceUuid===ref.sourceUuid)?.choice.tafTransfer&&/^flags\.ffs\.inventory\.[^.]+\.text$/.test(ref.path)))).map(ref=>{const row=rows.find(row=>row.sourceUuid===ref.sourceUuid);return ref.path==='folder'&&row?.packId&&row.sourceData.folder?{...ref,targetUuid:`Compendium.${row.packId}.Folder.${row.sourceData.folder}`}:ref;}),available=new Set(Object.keys(env.imported?.(pkg.packageId)||{}));
      for(let index=references.length-1;index>=0;index--){
        const ref=references[index],row=rows.find(row=>row.sourceUuid===ref.sourceUuid),repairs=row?.contactRepairs?.filter(repair=>repair.sourceUuid===ref.targetUuid);
        if(!repairs?.length||!repairs.every(repair=>repair.selectedUuid)||ref.path!=='system.content'||row.data.system.biography.includes('@UUID['+ref.targetUuid))continue;
        references.splice(index,1,...[...new Set(repairs.map(repair=>repair.selectedUuid))].map(targetUuid=>({...ref,targetUuid})));
      }
      function collect(data,type,uuid) {
        available.add(uuid);
        for(const [key,childType] of Object.entries(embedded[type]||{}))for(const child of data[key]||[])if(child._id)collect(child,childType,`${uuid}.${childType}.${child._id}`);
      }
      for(const row of rows)if(row.data&&row.included)collect(row.data,row.type,row.sourceUuid);
      for(const row of rows) {
        const profile=row.sourceData.flags?.[ID]?.worldProfile;
        for(const [field,type] of [['actorId','Actor'],['itemId','Item']])if(profile?.[field])references.push({sourceUuid:row.sourceUuid,targetUuid:`${type}.${profile[field]}`,path:`worldProfile.${field}`});
        if(row.type==='Actor'&&pkg.manifest.source.systemId==='realm-guard')for(const [index,item] of (row.sourceData.items||[]).entries())if(item.system?.inventory?.containerId)references.push({sourceUuid:row.sourceUuid,targetUuid:`${row.sourceUuid}.Item.${item.system.inventory.containerId}`,path:`items.${index}.system.inventory.containerId`});
        if(row.type==='Folder'&&row.packId&&row.sourceData.folder)references.push({sourceUuid:row.sourceUuid,targetUuid:`Compendium.${row.packId}.Folder.${row.sourceData.folder}`,path:'parent'});
        const missing=references.filter(ref=>ref.sourceUuid===row.sourceUuid&&!available.has(ref.targetUuid));
        if(missing.length&&row.status==='ready'){row.status='needs-review';row.notes.push(`${missing.length} reference(s) need a missing or unmapped target.`);}
      }
      const plan={packageId:pkg.packageId,worldId,systemId:target.id,rows,privateData:pkg.privateData?clone(pkg.privateData):null,userMapping:clone(userMapping),packs:clone((pkg.packs||[]).filter(pack=>!libraries.has(pack.id))),excludedSystemEntries:pkg.documents.length-campaignDocuments.length,identityMap:clone(pkg.identityMap),references,assets:clone(pkg.assets||[]),source:clone(pkg.manifest.source),warnings:['Copies are staged GM-only. Packages with private-data support restore permissions after account mapping; older packages remain GM-only.','Compendium content stays in separate migrated packs; templates are not created as active world Actors. Existing packs are never overwritten.','Included images and audio are restored to this world and linked automatically. Files absent from the ZIP retain their original references.']};
      if(pkg.manifest.source.systemId===target.id&&pkg.manifest.source.systemVersion!==target.version)plan.warnings.push(`Same-system copy: source ${pkg.manifest.source.systemVersion||'unknown'} → target ${target.version||'unknown'}. Version differences alone do not require individual review; incompatible data does.`);
      plans.set(plan,clone(plan));mediaFiles.set(plan,pkg.files);return plan;
    }
    function approveReady(pkg,choices={},userMapping={}) {
      guard(env);const initial=prepare(pkg,choices,userMapping),output=clone(choices),eligible=new Map(),owned=new Map(),available=new Set(Object.keys(env.imported?.(pkg.packageId)||{})),reverse=new Map();
      function collect(data,type,uuid,list) {list.push(uuid);for(const [key,childType] of Object.entries(embedded[type]||{}))for(const child of data[key]||[])if(child._id)collect(child,childType,`${uuid}.${childType}.${child._id}`,list);}
      for(const row of initial.rows)if(row.included&&row.data&&(row.status==='ready'||row.approved)) {
        const ids=[];collect(row.data,row.type,row.sourceUuid,ids);owned.set(row.sourceUuid,ids);ids.forEach(id=>available.add(id));eligible.set(row.sourceUuid,row);
      }
      for(const ref of initial.references) {
        const sources=reverse.get(ref.targetUuid)||new Set();sources.add(ref.sourceUuid);reverse.set(ref.targetUuid,sources);
      }
      const queue=[];
      for(const [target,sources] of reverse)if(!available.has(target))queue.push(...sources);
      while(queue.length) {
        const uuid=queue.pop(),row=eligible.get(uuid);if(!row||row.approved)continue;
        eligible.delete(uuid);
        for(const id of owned.get(uuid)||[]){available.delete(id);queue.push(...(reverse.get(id)||[]));}
      }
      for(const row of initial.rows)output[row.sourceUuid]={...row.choice,include:eligible.has(row.sourceUuid),approved:eligible.has(row.sourceUuid)};
      return prepare(pkg,output,userMapping);
    }
    async function executeWork(plan,{signal,progress}={}) {
      guard(env,signal);
      const prepared=plans.get(plan);
      const files=mediaFiles.get(plan);
      if(!prepared||env.world().id!==prepared.worldId||env.system().id!==prepared.systemId)throw Error('Prepare the import again in this target world.');
      plan=prepared;
      if(plan.privateData){if(!env.restorePrivate||!env.users)throw Error('This package needs private-data restoration support.');AdventurersTomePrivateMigration.validateUsers(plan.privateData,plan.userMapping,env.users(),env.user());}
      const imported=env.imported?.(plan.packageId)||{};
      let rows=clone(plan.rows.filter(row=>row.included&&!imported[row.sourceUuid]));
      if(rows.some(row=>!row.approved||!row.data))throw Error('Approve the remaining exceptions before importing.');
      if(!rows.length&&!Object.keys(imported).length&&!plan.privateData)throw Error('No ready or reviewed copies selected. Resolve the exceptions first.');
      if(!env.imported&&env.hasPackage?.(plan.packageId))throw Error('This package already has imported copies. Review them before retrying.');
      const includedMedia=plan.assets.filter(asset=>asset.status==='included');
      let mediaPaths={};
      if(includedMedia.length){
        if(!env.restoreMedia)throw Error('This ZIP includes media files, but this importer cannot restore them. Update the complete Tome module before importing.');
        mediaPaths=await env.restoreMedia({assets:clone(includedMedia),files,packageId:plan.packageId,signal,progress});guard(env,signal);
      }
      const media=value=>{
        if(typeof value==='string')return mediaPaths[value]||value.replace(/((?:src|poster)\s*=\s*["'])([^"']+)(["'])/gi,(whole,start,path,end)=>mediaPaths[path]?start+mediaPaths[path]+end:whole).replace(/url\((["']?)([^)'"\s]+)\1\)/gi,(whole,quote,path)=>mediaPaths[path]?`url(${quote}${mediaPaths[path]}${quote})`:whole);
        if(Array.isArray(value))return value.map(media);
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,media(child)]));
        return value;
      };
      const portraits=await env.restorePortraits?.({rows,paths:mediaPaths,signal});guard(env,signal);
      if(env.reuseStandardFolders){Object.assign(imported,await env.reuseStandardFolders(rows,plan.packageId));rows=rows.filter(row=>!imported[row.sourceUuid]);}
      const identities=new Map(Object.entries(imported)),folderIds=new Map(),packIds=new Map(),folderKey=(pack,id)=>`${pack||'world'}:${id}`,result={packageId:plan.packageId,portraits,created:[],unresolved:[],skipped:plan.rows.filter(row=>!row.included).map(row=>row.sourceUuid),alreadyImported:plan.rows.filter(row=>imported[row.sourceUuid]).map(row=>row.sourceUuid)};
      for(const id of new Set(rows.filter(row=>row.packId).map(row=>row.packId))){guard(env,signal);if(!env.ensurePack)throw Error('Compendium import is unavailable; no templates were created as world Actors.');const metadata=plan.packs.find(pack=>pack.id===id)?.metadata||{};const type=rows.find(row=>row.packId===id&&row.type!=='Folder')?.type||metadata.type;packIds.set(id,await env.ensurePack({packageId:plan.packageId,sourceId:id,label:metadata.label||id,type}));}
      for(const row of plan.rows)if(row.type==='Folder'&&imported[row.sourceUuid])folderIds.set(folderKey(row.packId,row.sourceData._id),imported[row.sourceUuid].split('.').at(-1));
      // Allocate target IDs before creating anything so forward links can be rewritten.
      function allocate(data,type,sourceUuid,targetUuid) {
        identities.set(sourceUuid,targetUuid);
        for(const [key,childType] of Object.entries(embedded[type]||{}))for(const child of data[key]||[]) {
          const old=child._id;child._id=env.randomId();
          if(old)allocate(child,childType,`${sourceUuid}.${childType}.${old}`,`${targetUuid}.${childType}.${child._id}`);
        }
      }
      for(const row of rows) {row.data._id=env.randomId();const root=row.packId?`Compendium.${packIds.get(row.packId)}.${row.type}.${row.data._id}`:`${row.type}.${row.data._id}`;allocate(row.data,row.type,row.sourceUuid,root);if(row.type==='Folder')folderIds.set(folderKey(row.packId,row.sourceData._id),row.data._id);}
      result.unresolved=plan.references.filter(row=>identities.has(row.sourceUuid)&&!identities.has(row.targetUuid)).map(row=>row.targetUuid);
      function rewrite(value) {
        if(typeof value==='string') {
          if(identities.has(value))return identities.get(value);
          return value.replace(/@UUID\[([^\]#]+)([^\]]*)\]|data-uuid=(["'])([^"']+)\3/g,(whole,uuid,suffix,quote,htmlUuid)=>{
            const target=identities.get(uuid||htmlUuid);if(!target){result.unresolved.push(uuid||htmlUuid);return whole;}
            return uuid?`@UUID[${target}${suffix}]`:`data-uuid=${quote}${target}${quote}`;
          });
        }
        if(Array.isArray(value))return value.map(rewrite);
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,rewrite(key==='flags'?liveFlags(child,plan.source.systemId,plan.systemId):child)]));
        return value;
      }
      function relinkInventory(items,actorSource) {
        if(plan.source.systemId!=='realm-guard'||plan.systemId!=='realm-guard')return;
        for(const item of items||[])if(item.system?.inventory?.containerId){const source=`${actorSource}.Item.${item.system.inventory.containerId}`,target=identities.get(source);if(target)item.system.inventory.containerId=target.split('.').at(-1);else result.unresolved.push(source);}
      }
      function privateCopy(data,type,packId=null) {
        data.ownership={default:0};delete data.permission;delete data._stats;
        data.flags=Object.fromEntries(Object.entries(data.flags||{}).filter(([namespace])=>namespace===ID||(plan.source.systemId===plan.systemId&&namespace===plan.systemId)));
        if('folder' in data)data.folder=folderIds.get(folderKey(packId,data.folder))||null;
        for(const [key,childType] of Object.entries(embedded[type]||{}))for(const child of data[key]||[])privateCopy(child,childType);
        if(type==='Scene') {
          data.active=false;data.navigation=false;
          for(const token of data.tokens||[]) {const actorSource=`Actor.${token.actorId}`;token.actorId=identities.get(actorSource)?.split('.')[1]||null;
            if(plan.source.systemId!==plan.systemId)delete token.delta;
            else if(token.delta){privateCopy(token.delta,'Actor');for(const [key,kind] of [['items','Item'],['effects','ActiveEffect']])for(const child of token.delta[key]||[])child._id=identities.get(`${actorSource}.${kind}.${child._id}`)?.split('.').at(-1)||child._id;relinkInventory(token.delta.items,actorSource);}
          }
          for(const note of data.notes||[]) {const source=`JournalEntry.${note.entryId}`;note.entryId=identities.get(source)?.split('.')[1]||null;note.pageId=identities.get(`${source}.JournalEntryPage.${note.pageId}`)?.split('.').at(-1)||null;}
          const playlist=data.playlist;
          if(data.playlistSound)data.playlistSound=identities.get(`Playlist.${playlist}.PlaylistSound.${data.playlistSound}`)?.split('.').at(-1)||null;
          for(const key of ['journal','playlist'])if(data[key])data[key]=identities.get(`${key==='journal'?'JournalEntry':'Playlist'}.${data[key]}`)?.split('.')[1]||null;
        }
        if(type==='Playlist'){data.playing=false;for(const sound of data.sounds||[])sound.playing=false;}
        if(type==='RollTable')for(const row of data.results||[])if(row.documentCollection&&row.documentId) {
          const uuid=`${row.documentCollection.includes('.')?'Compendium.':''}${row.documentCollection}.${row.documentId}`,target=identities.get(uuid);
          if(target){const parts=target.split('.');row.documentCollection=parts[0]==='Compendium'?parts.slice(1,3).join('.'):parts[0];row.documentId=parts[0]==='Compendium'?parts[4]:parts[1];}else result.unresolved.push(uuid);
        }
      }
      // Source folder IDs are ordered by parent depth; reject cycles before writing.
      const folderRows=rows.filter(row=>row.type==='Folder'),done=new Set(plan.rows.filter(row=>row.type==='Folder'&&imported[row.sourceUuid]).map(row=>folderKey(row.packId,row.sourceData._id))),ordered=[];
      while(ordered.length<folderRows.length) {
        const ready=folderRows.filter(row=>!done.has(folderKey(row.packId,row.sourceData._id))&&(!folderIds.has(folderKey(row.packId,row.sourceData.folder))||done.has(folderKey(row.packId,row.sourceData.folder))));
        if(!ready.length)throw Error('Folder cycle detected.');
        for(const row of ready){done.add(folderKey(row.packId,row.sourceData._id));ordered.push(row);}
      }
      ordered.push(...rows.filter(row=>row.type!=='Folder'));
      try {for(const row of ordered) {
        guard(env,signal);let data=media(rewrite(row.data));privateCopy(data,row.type,row.packId);
        if(row.type==='Actor')relinkInventory(data.items,row.sourceUuid);
        const profile=data.flags[ID]?.worldProfile;
        if(profile?.actorId)profile.actorId=identities.get(`Actor.${profile.actorId}`)?.split('.')[1]||null;
        if(profile?.itemId)profile.itemId=identities.get(`Item.${profile.itemId}`)?.split('.')[1]||null;
        for(const marker of [data.flags[ID]?.backendProjectionV1,data.flags[ID]?.backendFolderProjectionV1])if(marker){for(const key of ['sourceFolderId','sourceRootId'])if(marker[key])marker[key]=folderIds.get(folderKey(null,marker[key]))||marker[key];if(marker.sourceId&&marker.sourceDocumentName)marker.sourceId=identities.get(`${marker.sourceDocumentName}.${marker.sourceId}`)?.split('.').at(-1)||marker.sourceId;}
        // UUIDs contain dots. Foundry expands object keys as paths, so store them as values.
        const archive=clone(row.sourceData);
        // A GM-only module flag must never be published through the source archive
        // when account mapping later restores player ownership of this document.
        const redact=value=>{if(!value||typeof value!=='object')return;if(value.flags)delete value.flags['gm-notes'];for(const child of Object.values(value))redact(child);};redact(archive);
        data.flags[ID]={...data.flags[ID],migrationV1:{packageId:plan.packageId,sourceUuid:row.sourceUuid,sourceSystem:plan.source,classification:row.classification,targetCategory:row.classification.category||row.choice.type||null,contactTargets:Object.entries(row.choice.contactTargets||{}).map(([key,targetUuid])=>({key,targetUuid})),identities:[...identities].filter(([source])=>source===row.sourceUuid||source.startsWith(`${row.sourceUuid}.`)).map(([sourceUuid,targetUuid])=>({sourceUuid,targetUuid})),sourceData:archive,notes:row.notes}};
        progress?.({phase:'import',message:`Importing ${row.name}`,documents:result.created.length,total:ordered.length});
        let doc;
        try{doc=await env.create(row.type,data,{pack:row.packId?packIds.get(row.packId):null});if(!doc?.uuid)throw Error('Foundry did not return a saved document.');}
        catch(error){result.failed={sourceUuid:row.sourceUuid,name:row.name,type:row.type};throw Error(`${row.type} “${row.name}”: ${error.message}`,{cause:error});}
        result.created.push({sourceUuid:row.sourceUuid,targetUuid:doc.uuid});progress?.({phase:'import',message:`Saved ${row.name}`,documents:result.created.length,total:ordered.length});await pause();
      }} catch(error){result.remaining=ordered.length-result.created.length;error.partialResult=result;throw error;}
      result.identityMap=plan.identityMap.map(row=>({...row,targetUuid:identities.get(row.sourceUuid)||null}));
      if(env.restoreRelationships)try{result.relationships=await env.restoreRelationships({rows:plan.rows.filter(row=>row.included),identities:Object.fromEntries(identities),source:plan.source,packageId:plan.packageId,signal,progress});}
      catch(error){result.remaining=0;result.relationshipsPending=true;error.partialResult=result;throw error;}
      if(plan.privateData)try{progress?.({phase:'private',message:'Restoring GM data and account permissions',documents:result.created.length});await env.restorePrivate({data:media(plan.privateData),source:plan.source,packageId:plan.packageId,mapping:plan.userMapping,identities:Object.fromEntries(identities),rows:plan.rows.filter(row=>row.included),signal});result.privateDataRestored=true;}catch(error){result.remaining=0;result.privateDataPending=true;error.partialResult=result;throw error;}
      result.unresolved=[...new Set(result.unresolved)];return result;
    }
    async function execute(plan,options={}){guard(env,options.signal);try{await env.beginImport?.();return await executeWork(plan,options);}finally{await env.endImport?.();}}
    return Object.freeze({readPackage,prepare,prepareTaf,proposeTaf,tafGroups,execute,reuseMappings,approveReady,classifyUnknown,revision:AdventurersTomeMigrationCore.revision});
  }
  globalThis.AdventurersTomeMigrationImport=Object.freeze({readPackage,createImporter});
})();
