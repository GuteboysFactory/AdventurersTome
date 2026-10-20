import './transfer-content.js';
import './gm-private-transfer.js';
import './migration-accounts.js';
import './migration-relationships.js';
import './migration-portraits.js';
/* Explicit dependency: an older cached manifest must not leave the transfer engine unloaded. */
/* Migration runs only on explicit GM actions, never during Foundry startup. */
(() => {
  const ID='adventurers-tome';
  const gm=()=>{if(!game.user?.isGM)throw Error('Only a GM can use the Migration Toolkit.');};
  const api=()=>game.modules.get(ID)?.api;
  async function restoreMedia({assets,files,packageId,signal,progress}) {
    gm();
    const Picker=foundry.applications.apps.FilePicker.implementation||foundry.applications.apps.FilePicker;
    if(!/^[a-z0-9_-]+$/i.test(game.world.id)||!/^[a-f0-9]{64}$/i.test(packageId))throw Error('Invalid media destination.');
    // Check every payload before making any uploads or creating documents.
    for(const asset of assets){const bytes=files?.get(asset.packagePath);if(!bytes||await AdventurersTomeMigrationCore.digest(bytes)!==asset.sha256)throw Error(`Missing or changed media payload: ${asset.source}`);}
    const directory=`worlds/${game.world.id}/tome-migration/${packageId}`;
    for(const path of [`worlds/${game.world.id}/tome-migration`,directory]){
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      try{const found=await Picker.browse('data',path);if(found?.error)throw Error(found.error);}catch{const created=await Picker.createDirectory('data',path,{});if(created?.error)throw Error(created.error);}
    }
    const listing=await Picker.browse('data',directory),existing=new Set(listing.files||[]),paths={};
    if(listing.error)throw Error(listing.error);
    for(const [index,asset] of assets.entries()){
      gm();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const ext=asset.packagePath.match(/\.([a-z0-9]+)$/i)?.[1];
      if(!/^(avif|bmp|gif|jpe?g|png|svg|webp|mp3|ogg|wav|flac|m4a|aac|mp4|webm|m4v)$/i.test(ext||''))throw Error(`Unsupported media file: ${asset.packagePath}`);
      const name=`${asset.sha256}.${ext}`,destination=`${directory}/${name}`;
      progress?.({phase:'media',message:`Restoring images and audio ${index+1} / ${assets.length}`,documents:index,total:assets.length});
      if(existing.has(destination)){
        const bytes=await readAsset(destination,{signal,maxBytes:64*1024*1024});
        if(await AdventurersTomeMigrationCore.digest(bytes)!==asset.sha256)throw Error(`Existing media differs; no file was overwritten: ${destination}`);
        paths[asset.source]=destination;
      }else{
        const uploaded=await Picker.upload('data',directory,new File([files.get(asset.packagePath)],name),{},{notify:false});
        if(uploaded?.error||!uploaded?.path)throw Error(`Media upload failed: ${asset.source}${uploaded?.error?' — '+uploaded.error:''}`);
        paths[asset.source]=uploaded.path;existing.add(uploaded.path);
      }
      progress?.({phase:'media',message:`Restored images and audio ${index+1} / ${assets.length}`,documents:index+1,total:assets.length});
    }
    return paths;
  }
  Hooks.once('init',()=>game.settings.register(ID,'migrationPrivateStateV1',{scope:'user',config:false,type:String,default:'{"version":1,"imports":{}}'}));
  const privateEnv=()=>({user:()=>game.user,world:()=>game.world,users:()=>game.users.contents,hasSetting:key=>game.settings.settings.has(`${ID}.${key}`),getSetting:key=>game.settings.get(ID,key),setSetting:(key,value)=>game.settings.set(ID,key,value),
    state:()=>JSON.parse(game.settings.get(ID,'migrationPrivateStateV1')),saveState:state=>game.settings.set(ID,'migrationPrivateStateV1',JSON.stringify(state)),
    setOwnership:async(uuid,ownership)=>{const doc=await fromUuid(uuid);if(!doc)throw Error(`Imported document unavailable: ${uuid}`);await doc.update({ownership},{recursive:false});},
    canView:async(uuid,userId)=>{const doc=await fromUuid(uuid),user=game.users.get(userId);return Boolean(doc&&user&&api().canView(doc,user));},
    receipt:async(userId,row)=>{if(!game.users.get(userId))throw Error('Mapped user no longer exists.');const old=(game.messages?.contents||[]).find(message=>message.author?.id===game.user.id&&message.whisper?.includes(userId)&&message.getFlag(ID,'migrationReceiptV1')?.packageId===row.packageId&&message.getFlag(ID,'migrationReceiptV1')?.sourceOwnerId===row.sourceOwnerId);if(old){await old.update({flags:{[ID]:{migrationReceiptV1:row}}});return;}await ChatMessage.create({content:"Adventurer's Tome — your Chronicle account is ready for migration.",whisper:[userId],flags:{[ID]:{migrationReceiptV1:row}}});}});
  const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
  async function readAsset(path,{signal,maxBytes}) {
    const routed=/^(?:[a-z]+:|\/)/i.test(path)?path:(foundry.utils.getRoute?.(path)||path);
    const url=new URL(routed,document.baseURI);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Unsupported media URL.');
    // Browser-readable resources only. No upload, server filesystem or credentials to external hosts.
    const response=await fetch(url.href,{signal,credentials:url.origin===location.origin?'same-origin':'omit'});
    if(!response.ok)throw Error(`Media could not be read (HTTP ${response.status}).`);
    if(/text\/html/i.test(response.headers.get('content-type')||''))throw Error('The media URL returned an HTML page instead of a media file.');
    if(Number(response.headers.get('content-length'))>maxBytes)throw Error('Media exceeds the 64 MiB per-file limit.');
    const reader=response.body?.getReader();if(!reader)throw Error('Media streaming is unavailable.');
    const chunks=[];let bytes=0;
    try {while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.length;if(bytes>maxBytes)throw Error('Media exceeds the 64 MiB per-file limit.');chunks.push(result.value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const data=new Uint8Array(bytes);let position=0;for(const chunk of chunks){data.set(chunk,position);position+=chunk.length;}return data;
  }
  class TomeMigrationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS={id:'tome-migration-toolkit',classes:['at-migration'],window:{title:'Tome Import & Export',resizable:true},position:{width:950,height:760},actions:{
      prepareTaf:function(){return this.prepareTaf();},analyzeImported:function(){return this.analyzeImported();},restoreGmPrivate:function(){return this.restoreGmPrivate();},
      applyContent:function(){return this.applyContent();},undoContent:function(){return this.undoContent();},clearHistory:function(){return this.clearHistory();},downloadContent:function(){return this.downloadContent();},copyContent:function(){return this.downloadContent(true);},personalImport:function(){return this.personalImport();},personalExport:function(){return this.personalExport();},
      showImport:function(){return this.switchTab('import');},showExport:function(){return this.switchTab('export');},analyze:function(){return this.analyze();},download:function(){return this.download();},cancel:function(){this.controller?.abort();},loadPackage:function(){return this.loadPackage();},reviewImport:function(){return this.reviewImport();},executeImport:function(){return this.executeImport();},reuseMappings:function(){return this.reuseMappings();},importReady:function(){return this.importReady();},unknownNpc:function(){return this.classifyUnknown('npc');},unknownCharacter:function(){return this.classifyUnknown('character');},toggleMappings:function(){return this.toggleMappings();},editContacts:function(_event,button){this.contactEditSource=button.dataset.contactSource;this.contactEditPinned=true;return this.render({force:true});}
    }};
    static PARTS={main:{template:'modules/adventurers-tome/templates/migration.hbs',scrollable:['.at-migration-content']}};
    constructor(...args){super(...args);this.selection={types:['JournalEntry','Scene','Playlist','RollTable','Folder'],packs:[],mediaMode:'include',targetSystem:''};this.busy=false;this.snapshot=null;this.error='';this.exportResult=null;this.exportKind='campaign';this.contentText='';this.contentMode='auto';}
    async _prepareContext() {
      if(!game.user?.isGM){if(!game.user)throw Error('Sign in to transfer your Chronicle.');return {isGM:false,buildVersion:AdventurersTomeMigrationCore.revision,isImport:this.activeTab!=='export',isExport:this.activeTab==='export',busy:this.busy,personalError:this.personalError,personalResult:this.personalResult,receipts:await AdventurersTomeChronicleStorage.receipts()};}
      gm();const inventory=api().migration.inventory();
      const m=this.snapshot?.manifest;
      const completed=new Set([...(this.importResult?.created||[]).map(row=>row.sourceUuid),...(this.importResult?.alreadyImported||[])]);
      if(completed.has(this.contactEditSource)){this.contactEditSource=null;this.contactEditPinned=false;}
      const tafBatchMode=this.importPackage?.manifest.source.systemId==='taf'&&game.system.id==='realm-guard';
      const roleOrder=['Friend','Senior Artisan','Mentor','Enemy','Mother','Father','Contact'];
      const byRole=(a,b)=>(roleOrder.indexOf(a.role)<0?99:roleOrder.indexOf(a.role))-(roleOrder.indexOf(b.role)<0?99:roleOrder.indexOf(b.role));
      const contactRepairSummary=(this.importPlan?.rows||[]).flatMap(row=>(row.contactRepairs||[]).filter(repair=>repair.selectedUuid).map(repair=>{const person=this.importPackage.documents.find(entry=>entry.sourceUuid===repair.selectedUuid)?.name||repair.selectedUuid;const warning=repair.role==='Mentor'&&/\b(enemy|fiende)\b/i.test(person)||repair.role==='Enemy'&&/\bmentor\b/i.test(person);return {sourceUuid:row.sourceUuid,imported:completed.has(row.sourceUuid),actor:row.name,role:repair.role,person,warning:warning?'The selected name suggests another role. Check this choice before importing.':''};}).sort(byRole));
      const unsupported=new Map();
      for(const row of this.importPlan?.rows||[])if(row.status==='unsupported'&&!row.intentionalExclusion) {
        const key=`${row.type}:${row.sourceData.type||''}:${row.notes.join(' ')}`,group=unsupported.get(key)||{type:row.type,sourceType:row.sourceData.type||'',reason:row.notes.join(' '),count:0};group.count++;unsupported.set(key,group);
      }
      const userRows=(this.importPackage?.privateData?.users||[]).map(source=>({id:source.id,name:source.name,isExportingGM:source.id===this.importPackage.privateData.gmOwnerId,keepPrivate:this.userMapping?.[source.id]===null,createPlayer:this.userMapping?.[source.id]==='new-player',options:(game.users?.contents||[]).map(user=>({id:user.id,name:user.name,selected:this.userMapping?.[source.id]===user.id}))}));
      return {isGM:true,contactRepairSummary,...this.tafContext(),gmPrivateBundle:this.gmPrivateBundle,gmPrivateMappings:this.gmPrivateBundle?AdventurersTomeGmPrivateTransfer.mappings(privateEnv(),this.gmPrivateBundle):[],gmPrivateSameWorld:this.gmPrivateBundle?.source.worldId===game.world.id,gmPrivateResult:this.gmPrivateResult,isGmPrivateExport:this.exportKind==='gm-private',isPlayerSafeExport:this.exportKind==='player-safe',isCampaignExport:this.exportKind==='campaign',exportKinds:['campaign','gm-private','portable','player-safe','backup'].map(id=>({id,label:({campaign:'Move campaign (ZIP)','gm-private':'GM Notes & Vault (private JSON)',portable:'Tome content package (JSON)','player-safe':'Player-safe content (JSON)',backup:'Private GM archive (JSON)'})[id],selected:this.exportKind===id})),jsonExport:this.jsonExport,contentText:this.contentText,contentMode:this.contentMode,contentModes:['auto','session','quest','package'].map(id=>({id,selected:this.contentMode===id})),contentPreview:this.contentPreview,contentResult:this.contentResult,isContentImport:Boolean(this.contentPreview||this.contentResult),importHistory:api().getImportHistoryView?.()||[],hasContentUndo:api().hasImportUndo?.(),userRows,hasPrivateData:Boolean(this.importPackage?.privateData),buildVersion:api().migration.revision,isImport:this.activeTab!=='export',isExport:this.activeTab==='export',importFileName:this.importFileName,canDoImport:Boolean(this.importResult?.relationshipsPending)||this.importPlan?.rows.some(row=>Boolean(row.data)&&!completed.has(row.sourceUuid))||Boolean(this.importPlan?.privateData&&(!this.importResult||this.importResult.partial)),busy:this.busy,error:this.error,importProgress:this.importProgress,hasAnalysis:Boolean(m),canDownload:Boolean(m)&&!this.busy,
        importPlan:this.importPlan?{warnings:this.importPlan.warnings,excludedSystemEntries:this.importPlan.excludedSystemEntries}:null,importResult:this.importResult,hasPackage:Boolean(this.importPackage),unsupportedGroups:[...unsupported.values()],showAllMappings:Boolean(this.showAllMappings),targetWorld:game.world.title||game.world.id,targetId:game.system.id,
        importReadyCount:this.importPlan?.rows.filter(row=>!completed.has(row.sourceUuid)&&(row.status==='ready'||row.approved)).length||0,skippedDefinitionCount:this.importPlan?.rows.filter(row=>row.intentionalExclusion).length||0,importExceptionCount:this.importPlan?.rows.filter(row=>row.status!=='ready'&&!row.intentionalExclusion&&!row.approved).length||0,
        importRows:this.importPlan?.rows.map((row,index)=>({row,index})).filter(({row})=>this.showAllMappings||row.sourceUuid===this.contactEditSource||(row.status!=='ready'&&row.status!=='unsupported'&&!row.approved&&!(tafBatchMode&&!row.choice.tafTransfer&&['Actor','Item'].includes(row.type)))).map(({row,index})=>({...row,index,collapseDetails:tafBatchMode&&row.sourceUuid!==this.contactEditSource,contactRepairs:[...(row.contactRepairs||[])].sort(byRole).map(repair=>({...repair,options:(this.importPackage?.documents||[]).filter(entry=>entry.documentType==='Actor'&&!entry.packId&&entry.sourceUuid!==row.sourceUuid&&!AdventurersTomeMigrationCore.systemLibraryCopy(entry.sourceData)).map(entry=>({uuid:entry.sourceUuid,name:entry.name,selected:repair.selectedUuid===entry.sourceUuid})).sort((a,b)=>a.name.localeCompare(b.name))})),preview:row.data?JSON.stringify(row.data,null,2):'',isTafActor:row.type==='Actor'&&this.importPackage?.manifest.source.systemId==='taf'&&game.system.id==='realm-guard',canImport:Boolean(row.data),isCharacter:row.choice.type==='character',isNpc:row.choice.type==='npc',suggestions:this.mappingSuggestions(row)}))||[],
        types:inventory.types.map(row=>({...row,selected:this.selection.types.includes(row.type)})),
        packs:inventory.packs.map(row=>({...row,selected:this.selection.packs.includes(row.id)})),excludedPacks:inventory.excludedPacks,targetSystem:this.selection.targetSystem,
        includeMedia:this.selection.mediaMode==='include',manifest:m,
        ready:this.snapshot?.documents.filter(row=>row.status==='ready').length||0,
        needsReview:this.snapshot?.documents.filter(row=>row.status==='needs-review').length||0,
        unmapped:m?.unmappedEntries.length||0,unsupported:m?.unsupportedEntries.length||0,unresolved:m?.unresolvedEntries.length||0,
        assets:this.snapshot?.assets.length||0,mediaRows:this.snapshot?.assets||[],excluded:m?.excludedEntries.filter(row=>row.reason.startsWith('Player Chronicle')).length||0,
        documents:this.snapshot?.documents.map(row=>({name:row.name,type:row.documentType,status:row.status,pack:row.packId||'World',review:row.review.join(' ')}))||[],
        unresolvedRows:m?.unresolvedEntries||[],dependencies:m?.dependencies||[],mediaIssues:this.exportResult?.manifest.mediaIssues||[],exported:Boolean(this.exportResult)};
    }
    capture() {
      const root=this.element?.[0]||this.element;const form=root.querySelector('[data-migration-selection]');
      this.captureUsers();
      this.contentText=root.querySelector('[name="contentText"]')?.value??this.contentText;this.contentMode=root.querySelector('[name="contentMode"]')?.value??this.contentMode;
      this.exportKind=root.querySelector('[name="transferExportKind"]')?.value||this.exportKind;
      if(form)this.selection={types:[...form.querySelectorAll('[name="type"]:checked')].map(el=>el.value),packs:[...form.querySelectorAll('[name="pack"]:checked')].map(el=>el.value),mediaMode:form.querySelector('[name="mediaMode"]').value,targetSystem:form.querySelector('[name="targetSystem"]').value.trim()};
    }
    _onRender(context,options){super._onRender?.(context,options);const root=this.element?.[0]||this.element;const select=root?.querySelector('[name="transferExportKind"]');for(const node of root.querySelectorAll('[data-taf-group],[name="tafFallback"],[name="tafSceneBase"]'))node.onchange=()=>void this.prepareTaf();for(const node of root.querySelectorAll('[data-contact-repair]'))node.onchange=()=>{if(this.busy)return;if(this.contactEditSource!==node.dataset.contactOwner){this.contactEditSource=node.dataset.contactOwner;this.contactEditPinned=false;}void this.reviewImport();};if(select)select.onchange=()=>{this.capture();this.jsonExport=null;void this.render({force:true});};}
    captureUsers(){const root=this.element?.[0]||this.element;this.userMapping||={};for(const select of root?.querySelectorAll('[data-migration-user]')||[]){const id=select.dataset.migrationUser;if(select.value==='private')this.userMapping[id]=null;else if(select.value)this.userMapping[id]=select.value;else delete this.userMapping[id];}}
    async switchTab(tab) {if(this.busy)return;this.capture();this.activeTab=tab;return this.render({force:true});}
    progress(row) {
      const root=this.element?.[0]||this.element;
      if(row.phase==='content'){const node=root?.querySelector('[data-content-progress]');if(node)node.textContent=`${row.documents} / ${row.total} entries processed · ${row.message}`;return;}
      if(row.phase==='private'){this.importProgress={...(this.importProgress||{}),text:row.message};const node=root?.querySelector('[data-import-progress-text]');if(node)node.textContent=row.message;}
      else if(row.phase==='import'||row.phase==='media') {
        const percent=row.total?Math.floor(row.documents*100/row.total):0;
        this.importProgress={documents:row.documents,total:row.total,percent,text:`${percent}% · ${row.documents} / ${row.total} ${row.phase==='media'?'media processed':'copies saved'} · ${row.message}`};
        const panel=root?.querySelector('[data-import-progress]');if(panel){panel.hidden=false;const bar=panel.querySelector('progress');bar.max=Math.max(1,row.total);bar.value=row.documents;panel.querySelector('[data-import-progress-text]').textContent=this.importProgress.text;}
      } else {const node=root?.querySelector('[data-migration-progress]');if(node)node.textContent=`${row.message} · ${row.documents} documents`;}
    }
    async run(callback) {
      gm();if(this.busy)return;
      this.capture();this.busy=true;this.error='';this.accountMappingNeedsReview=false;this.controller=new AbortController();
      await this.render({force:true});
      try {await callback(this.controller.signal);}catch(error){if(error.code==='TOME_ACCOUNT_MAPPING')this.accountMappingNeedsReview=true;if(error.partialResult){this.importResult={...error.partialResult,partial:true};this.error=`${error.message} ${this.importResult.created.length} target copies remain; ${this.importResult.relationshipsPending?"PC Relationships still need restoring; retry resumes the contact step.":this.importResult.privateDataPending?"GM data or account permissions still need restoring.":`${this.importResult.remaining} copies still need importing.`} Retry reads existing saved copies; source documents are unchanged.`;globalThis.ui?.notifications?.error?.(this.error,{permanent:true});}else this.error=error.name==='AbortError'?'Cancelled. Source world is unchanged.':error.message;}
      finally {this.busy=false;this.controller=null;if(this.rendered)await this.render({force:true});}
    }
    async analyze() {
      this.capture();if(this.exportKind!=='campaign')return this.run(async()=>{const data=this.exportKind==='gm-private'?AdventurersTomeGmPrivateTransfer.exportBundle(privateEnv()):api().transfer.content.exportContent(this.exportKind);this.jsonExport={kind:this.exportKind,bytes:new TextEncoder().encode(JSON.stringify(data)).length};});
      return this.run(async signal=>{this.snapshot=null;this.exportResult=null;this.snapshot=await api().migration.analyze({...this.selection,signal,progress:row=>this.progress(row)});});
    }
    async download() {
      const previous=JSON.stringify(this.selection);
      return this.run(async signal=>{
        if(previous!==JSON.stringify(this.selection)){this.snapshot=null;throw Error('Selection changed. Analyze again before exporting.');}
        if(!this.snapshot)throw Error('Analyze first.');
        const result=await api().migration.exportPackage(this.snapshot,{signal,progress:row=>this.progress(row)});gm();
        if(signal.aborted)throw new DOMException('Cancelled','AbortError');
        this.exportResult=result;
        const link=document.createElement('a'),url=URL.createObjectURL(result.blob);link.href=url;link.download=`tome-migration-${game.world.id.replace(/[^a-z0-9_-]/gi,'_')}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      });
    }
    async close(options) {this.controller?.abort();return super.close(options);}
    importChoices() {
      this.captureUsers();
      const root=this.element?.[0]||this.element,choices=Object.fromEntries((this.importPlan?.rows||[]).map(row=>[row.sourceUuid,{...row.choice,include:row.included,approved:row.approved}]));
      for(const node of root.querySelectorAll('[data-import-row]')) {
        const row=this.importPlan.rows[Number(node.dataset.importRow)];
        const type=node.querySelector('[name="actorType"]')?.value??row.choice.type??'',include=Boolean(node.querySelector('[name="include"]')?.checked),approved=Boolean(node.querySelector('[name="approve"]')?.checked),attributes={...row.choice.attributes},contactTargets={...row.choice.contactTargets};
        let modified=type!==(row.choice.type||'')||include!==Boolean(row.included)||approved!==Boolean(row.approved);
        for(const el of node.querySelectorAll('[data-attribute]')){const id=el.dataset.attribute,expected=row.choice.attributes?.[id]??row.suggestions?.find(s=>s.id===id)?.applied??'';if(el.value!==expected){attributes[id]=el.value;modified=true;}}
        for(const el of node.querySelectorAll('[data-contact-repair]')){const key=el.dataset.contactRepair;if(el.value!==(contactTargets[key]||'')){if(el.value)contactTargets[key]=el.value;else delete contactTargets[key];}}
        choices[row.sourceUuid]={...row.choice,...(modified?{tafProposed:false}:{}),type,include,approved,attributes,contactTargets};
      }
      return choices;
    }
    async loadPackage() {
      const root=this.element?.[0]||this.element,file=root.querySelector('[name="migrationPackage"]')?.files?.[0];
      if(this.busy)return;this.importAnalysis=null;this.contactEditSource=null;this.contactEditPinned=false;this.gmPrivateBundle=null;this.gmPrivateResult=null;this.contentPreview=null;this.contentResult=null;this.importPlan=null;this.importPackage=null;this.importResult=null;this.importFileName=file?.name||'';
      if(!file){return this.run(async()=>{this.contentPreview=api().transfer.content.preview(this.contentText,'Pasted text',this.contentMode);this.reviewedContentText=this.contentText;this.reviewedContentMode=this.contentMode;this.contentResult=null;this.importPackage=null;this.importPlan=null;});}
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(bytes[0]!==0x50||bytes[1]!==0x4b)return this.run(async()=>{if(bytes.length>64*1024*1024)throw Error('JSON or text file exceeds 64 MiB.');this.contentText=new TextDecoder().decode(bytes);if(AdventurersTomeTransferContent.detect(this.contentText)==='gm-private'){const bundle=JSON.parse(this.contentText);AdventurersTomeGmPrivateTransfer.validate(bundle);this.gmPrivateBundle=bundle;this.importFileName=file.name;return;}if(bytes.length>5*1024*1024)throw Error('Text content exceeds 5 MiB.');this.contentPreview=api().transfer.content.preview(this.contentText,file.name,this.contentMode);this.reviewedContentText=this.contentText;this.reviewedContentMode=this.contentMode;this.contentResult=null;this.importPackage=null;this.importPlan=null;this.importFileName=file.name;});
      this.contentPreview=null;this.contentResult=null;
      return this.run(async()=>{this.importProgress=null;this.importResult=null;this.importPlan=null;this.importFileName=file.name;this.importPackage=await api().migration.readPackage(new Uint8Array(await file.arrayBuffer()));const saved=this.importPackage.privateData?privateEnv().state().imports?.[this.importPackage.packageId]?.users:null;this.userMapping=saved|| (this.importPackage.privateData?{[this.importPackage.privateData.gmOwnerId]:game.user.id}:{});await api().migration.refreshImportedPacks(this.importPackage.packageId);this.importPlan=this.initialPlan();});
    }
    contentChoices(){const root=this.element?.[0]||this.element;return {choices:Object.fromEntries([...root.querySelectorAll('[data-content-choice]')].map(el=>[el.dataset.contentChoice,el.value])),links:Object.fromEntries([...root.querySelectorAll('[data-content-link]')].map(el=>[el.dataset.contentLink,el.value]))};}
    async applyContent(){const {choices,links}=this.contentChoices();return this.run(async signal=>{if(this.contentText!==this.reviewedContentText||this.contentMode!==this.reviewedContentMode)throw Error('Content or type changed after preview. Preview Import again.');const preview=this.contentPreview;this.contentPreview=null;this.contentResult=await api().transfer.content.apply(preview,choices,links,{signal,progress:row=>this.progress(row)});this.contentResult.remaining=preview.entries.length-this.contentResult.created-this.contentResult.updated-this.contentResult.skipped-this.contentResult.failed;if(!this.contentResult.cancelled&&!this.contentResult.failed&&!this.contentResult.linksFailed)this.contentText='';});}
    async restoreGmPrivate(){const root=this.element?.[0]||this.element,mapping=root.querySelector('[name="gmPrivateMapping"]')?.value,bundle=this.gmPrivateBundle;return this.run(async signal=>{this.gmPrivateResult=await AdventurersTomeGmPrivateTransfer.restore(privateEnv(),bundle,mapping,signal);});}
    async undoContent(){gm();if(!await foundry.applications.api.DialogV2.confirm({window:{title:'Undo last content import'},content:'<p>Remove entries created by the latest content import and restore the fields and links it changed?</p>',rejectClose:false}))return;return this.run(async()=>{await api().transfer.content.undo();this.contentResult=null;this.contentPreview=null;});}
    async clearHistory(){gm();if(!await foundry.applications.api.DialogV2.confirm({window:{title:'Clear import history'},content:'<p>Clear the audit history? Imported documents remain.</p>',rejectClose:false}))return;return this.run(()=>api().clearImportHistory());}
    saveJson(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    async downloadContent(copy=false){return this.run(async()=>{const data=this.exportKind==='gm-private'?AdventurersTomeGmPrivateTransfer.exportBundle(privateEnv()):api().transfer.content.exportContent(this.exportKind);if(copy)await navigator.clipboard.writeText(JSON.stringify(data,null,2));else this.saveJson(data,`tome-${this.exportKind}-${game.world.id}.json`);});}
    async personalImport(){if(this.busy)return;const root=this.element?.[0]||this.element,file=root.querySelector('[name="chronicleFile"]')?.files?.[0],receipt=root.querySelector('[name="chronicleReceipt"]')?.value;this.busy=true;this.personalError='';try{if(!file)throw Error('Choose your Chronicle JSON file.');if(file.size>64*1024*1024)throw Error('Chronicle file exceeds 64 MiB.');this.personalResult=await AdventurersTomeChronicleStorage.importOwn(JSON.parse(await file.text()),receipt);}catch(error){this.personalError=error.message;}finally{this.busy=false;await this.render({force:true});}}
    async personalExport(){if(this.busy)return;try{this.saveJson(AdventurersTomeChronicleStorage.exportOwn(),`tome-chronicle-${game.user.id}.json`);}catch(error){this.personalError=error.message;await this.render({force:true});}}
    async reviewImport() {
      const choices=this.importChoices(),options=this.isTaf()?this.tafOptions():null;return this.run(async()=>{this.importPlan=options?api().migration.proposeTaf(this.importPackage,choices,{...options,userMapping:this.userMapping}):api().migration.prepare(this.importPackage,choices,this.userMapping);if(this.contactEditSource&&!this.contactEditPinned&&this.importPlan.rows.find(row=>row.sourceUuid===this.contactEditSource)?.status==='ready')this.contactEditSource=null;});
    }
    tafContext(){
      const groups=this.importPackage?api().migration.tafGroups(this.importPackage):[];
      const actors=(this.importPlan?.rows||[]).filter(row=>row.type==='Actor');
      return {accountMappingNeedsReview:Boolean(this.accountMappingNeedsReview),tafCharacters:actors.filter(row=>row.choice.type==='character').length,tafNpcs:actors.filter(row=>row.choice.type==='npc').length,newPlayerCount:Object.values(this.userMapping||{}).filter(id=>id==='new-player').length,tafSceneBase:this.tafSceneBase!==false,tafFallbackNpc:(this.tafFallback??'npc')==='npc',tafFallbackCharacter:this.tafFallback==='character',tafGroups:groups.map(group=>{const choice=this.importPlan?.rows.find(row=>row.type==='Actor'&&JSON.stringify([row.packId||'',row.sourceData.folder||''])===group.id)?.choice;
        const role=this.tafGroupChoices?.[group.id]??group.suggested;return {...group,isCharacter:role==='character',isNpc:role==='npc'};}),hasTafGroups:Boolean(groups.length),tafPrepared:this.importPlan?.rows.some(row=>row.choice.tafTransfer),importAnalysis:this.importAnalysis};
    }
    mappingSuggestions(row){return row.suggestions?.filter(s=>!row.choice.tafTransfer||this.showAllMappings||s.target||row.choice.attributes?.[s.id]).map(s=>{const selected=row.choice.attributes?.[s.id]??s.applied??'';return {...s,selected,options:['health','will','nature','resources','circles'].map(field=>({field,selected:selected===field}))};});}
    async prepareTaf(){
      if(this.busy)return;const options=this.tafOptions(),choices=this.importChoices();
      return this.run(async()=>{this.importPlan=api().migration.proposeTaf(this.importPackage,choices,{...options,userMapping:this.userMapping});});
    }
    isTaf(){return this.importPackage?.manifest.source.systemId==='taf'&&game.system.id==='realm-guard';}
    tafOptions(){const root=this.element?.[0]||this.element;this.tafFallback=root.querySelector('[name="tafFallback"]')?.value??this.tafFallback??'npc';this.tafSceneBase=root.querySelector('[name="tafSceneBase"]')?.checked??this.tafSceneBase??true;this.tafGroupChoices=Object.fromEntries([...root.querySelectorAll('[data-taf-group]')].map(node=>[node.dataset.tafGroup,node.value]));return {groups:this.tafGroupChoices,fallback:this.tafFallback,sceneBase:this.tafSceneBase};}
    initialPlan(){
      if(!this.isTaf())return api().migration.prepare(this.importPackage,{},this.userMapping);
      this.tafFallback='npc';this.tafSceneBase=true;this.tafGroupChoices={};
      this.userMapping=AdventurersTomeMigrationAccounts.propose({user:()=>game.user,users:()=>game.users.contents},this.importPackage.privateData,this.userMapping);
      const choices={};for(const actor of game.actors?.contents||[]){const saved=actor.flags?.[ID]?.migrationV1;if(saved?.packageId===this.importPackage.packageId&&saved.contactTargets&&saved.sourceUuid)choices[saved.sourceUuid]={contactTargets:Array.isArray(saved.contactTargets)?Object.fromEntries(saved.contactTargets.filter(row=>typeof row.key==='string'&&typeof row.targetUuid==='string').map(row=>[row.key,row.targetUuid])):{...saved.contactTargets}};}
      return api().migration.proposeTaf(this.importPackage,choices, {userMapping:this.userMapping});
    }
    async analyzeImported(){
      return this.run(async()=>{const engine=api().campaignRelationshipEvidence;if(!engine?.suggestMigration)throw Error('Tome relationship analysis is not ready. Reload Tome and try again.');
        const imported=api().migration.importedCopies(this.importPackage.packageId);this.importAnalysis=await engine.suggestMigration(imported);api().campaignIndex?.request?.('migration-import-complete');});
    }
    async reuseMappings() {
      const choices=this.importChoices();return this.run(async()=>{this.importPlan=api().migration.prepare(this.importPackage,api().migration.reuseMappings(this.importPackage,choices),this.userMapping);});
    }
    async classifyUnknown(type) {
      const choices=this.importChoices();
      return this.run(async()=>{this.importPlan=api().migration.prepare(this.importPackage,api().migration.classifyUnknown(this.importPackage,choices,type),this.userMapping);});
    }
    async toggleMappings() {
      const choices=this.importChoices();return this.run(async()=>{this.importPlan=api().migration.prepare(this.importPackage,choices,this.userMapping);this.showAllMappings=!this.showAllMappings;});
    }
    async executeImport() {
      return this.importReady();
    }
    async importReady() {
      let choices=this.importChoices();const taf=this.isTaf(),options=taf?this.tafOptions():null;this.importProgress=null;this.importResult=null;return this.run(async signal=>{if(taf){const proposal=api().migration.proposeTaf(this.importPackage,choices,{...options,userMapping:this.userMapping});choices=Object.fromEntries(proposal.rows.map(row=>[row.sourceUuid,row.choice]));}this.userMapping=await AdventurersTomeMigrationAccounts.resolve({user:()=>game.user,users:()=>game.users.contents,playerRole:globalThis.CONST?.USER_ROLES?.PLAYER||1,create:data=>getDocumentClass('User').create(data)},this.importPackage.privateData,this.userMapping,this.importPackage.manifest.source);await api().migration.refreshImportedPacks(this.importPackage.packageId);this.importPlan=api().migration.approveReady(this.importPackage,choices,this.userMapping);this.importResult=await api().migration.execute(this.importPlan,{signal,progress:row=>this.progress(row)});if(this.importResult.privateDataRestored)this.progress({phase:'private',message:'Import complete — GM data and mapped permissions restored.'});});
    }
  }
  let app,sourceEpoch=0;
  for(const type of ['Actor','Item','JournalEntry','JournalEntryPage','Scene','Token','Tile','Wall','AmbientLight','AmbientSound','Note','Drawing','MeasuredTemplate','Region','RegionBehavior','Playlist','PlaylistSound','RollTable','TableResult','Folder','Adventure','Macro','Cards'])for(const operation of ['create','update','delete'])Hooks.on(`${operation}${type}`,()=>{sourceEpoch++;});
  function attach() {
    const core=api();if(!core||core.migration)return;
    const toolkit=AdventurersTomeMigrationCore.createMigrationToolkit({user:()=>game.user,world:()=>game.world,system:()=>game.system,module:()=>game.modules.get(ID),foundryVersion:()=>game.version,
      collection:key=>game[key]?.contents||[],packs:()=>[...game.packs.values()],revision:()=>sourceEpoch,yield:()=>new Promise(resolve=>setTimeout(resolve,0)),readAsset,privateSnapshot:()=>game.settings?.settings?AdventurersTomePrivateMigration.capture(privateEnv()):null});
    const migratedPacks=id=>[...game.packs.values()].filter(pack=>pack.collection.startsWith(`world.tome-migration-${id.slice(0,12)}-`));
    const refreshImportedPacks=async id=>{gm();for(const pack of migratedPacks(id))await pack.getDocuments();};
    let importing=false;
    const migrationDocuments=id=>[...['actors','items','journal','scenes','playlists','tables','folders'].flatMap(key=>(game[key]?.contents||[]).filter(doc=>!doc.flags?.[ID]?.migrationV1?.sourceUuid?.startsWith('Compendium.'))),...migratedPacks(id).flatMap(pack=>[...(pack.contents||[]),...(pack.folders?.contents||[])])];
    const importer=AdventurersTomeMigrationImport.createImporter({user:()=>game.user,world:()=>game.world,
      users:()=>game.users.contents,restoreMedia,restorePortraits:options=>AdventurersTomeMigrationPortraits.restore({user:()=>game.user,systemId:()=>game.system.id,available:async(path,signal)=>{try{const routed=/^(?:[a-z]+:|\/)/i.test(path)?path:(foundry.utils.getRoute?.(path)||path),url=new URL(routed,document.baseURI);if(!['http:','https:'].includes(url.protocol)||url.origin!==location.origin)return null;const response=await fetch(url.href,{method:'HEAD',signal,credentials:'same-origin'});return response.ok?true:[404,410].includes(response.status)?false:null;}catch(error){if(signal?.aborted)throw error;return null;}}},options),restoreRelationships:options=>AdventurersTomeMigrationRelationships.restore({user:()=>game.user,systemId:()=>game.system.id,api:()=>game.realmGuard?.core?.m8,actor:uuid=>fromUuid(uuid),progression:async(actor,fate,persona)=>{const target=await import(foundry.utils.getRoute('systems/realm-guard/module/progression.mjs'));if(typeof target.setProgressionTotals!=='function')throw Error('Target system has no progression restoration API.');return target.setProgressionTotals(actor,fate,persona);}},options),restorePrivate:options=>AdventurersTomePrivateMigration.restore(privateEnv(),options),
      beginImport:async()=>{importing=true;await core.backendFolderParity?.pauseForMigration?.();},endImport:async()=>{importing=false;core.backendFolderParity?.resumeAfterMigration?.();Hooks.callAll?.('adventurersTomeMigrationFinished');},
      reuseStandardFolders:async(rows,packageId)=>{const bootstrap=await core.folderQuickCreate?.bootstrap?.();const aliases=AdventurersTomeMigrationCore.standardFolderAliases(rows,bootstrap);for(const [sourceUuid,targetUuid] of Object.entries(aliases)){const folder=game.folders.get(targetUuid.split('.')[1]);const previous=folder.flags?.[ID]?.migrationFolderAliasesV1||[];if(!previous.some(row=>row.packageId===packageId&&row.sourceUuid===sourceUuid))await folder.setFlag(ID,'migrationFolderAliasesV1',[...previous,{packageId,sourceUuid,targetUuid}]);}return aliases;},
      ensurePack:async({packageId,sourceId,label,type})=>{gm();const name=AdventurersTomeMigrationCore.packName(packageId,sourceId),key=`world.${name}`;let pack=game.packs.get(key);if(!pack){const Collection=foundry.documents?.collections?.CompendiumCollection||globalThis.CompendiumCollection;if(!Collection?.createCompendium)throw Error('Foundry compendium creation is unavailable.');pack=await Collection.createCompendium({name,label:`${label} — Migrated`,type,package:'world',system:game.system.id});}if(!pack||pack.documentName!==type)throw Error('Migration compendium has an incompatible document type.');await pack.configure({locked:false,ownership:{PLAYER:'NONE',TRUSTED:'NONE',ASSISTANT:'NONE',GAMEMASTER:'OWNER'}});return pack.collection;},
      system:()=>({id:game.system.id,version:game.system.version,types:{Actor:Object.keys(CONFIG.Actor.dataModels||{}),Item:Object.keys(CONFIG.Item.dataModels||{})}}),
      validateCopy:(type,data)=>{
        const validate=(kind,raw)=>{
          if(!['Actor','Item'].includes(kind))return;
          const Model=CONFIG[kind].dataModels?.[raw.type];
          if(typeof Model==='function'){const model=new Model(structuredClone(raw.system||{}),{strict:true});if(model.validate({changes:structuredClone(raw.system||{}),strict:true,clean:false,fallback:false})===false)throw Error(`Invalid ${kind} system data.`);}
          if(kind==='Actor')for(const item of raw.items||[]){if(!CONFIG.Item.dataModels?.[item.type])throw Error(`Unsupported embedded Item type: ${item.type}`);validate('Item',item);}
        };validate(type,data);return true;
      },
      randomId:()=>foundry.utils.randomID(),hasPackage:id=>['actors','items','journal','scenes','playlists','tables','folders'].some(key=>(game[key]?.contents||[]).some(doc=>doc.flags?.[ID]?.migrationV1?.packageId===id)),
      imported:id=>Object.fromEntries(migrationDocuments(id).flatMap(doc=>{
        const aliases=(doc.flags?.[ID]?.migrationFolderAliasesV1||[]).filter(row=>row.packageId===id).map(row=>[row.sourceUuid,doc.uuid]);
        const record=doc.flags?.[ID]?.migrationV1;if(record?.packageId!==id)return aliases;
          const pairs=record.identities?AdventurersTomeMigrationCore.identityPairs(record):[[record.sourceUuid,doc.uuid]];
          return [...aliases,...pairs.filter(([,uuid])=>typeof fromUuidSync!=='function'||fromUuidSync(uuid))];
      })),
      create:(type,data,{pack}={})=>getDocumentClass(type).create(data,{keepId:true,renderSheet:false,cloning:true,...(pack?{pack}:{})})});
    const content=AdventurersTomeTransferContent.create({user:()=>game.user,api:()=>core,revision:()=>sourceEpoch});
    const open=({tab='import',mode='auto',kind}={})=>{if(!game.user)throw Error('Sign in to Import & Export.');if(!app||app.ownerId!==game.user.id){app?.close();app=new TomeMigrationApp();app.ownerId=game.user.id;}app.activeTab=tab;app.contentMode=mode;if(kind&&game.user.isGM&&app.exportKind!==kind){app.exportKind=kind;app.jsonExport=null;}return app.render({force:true});};
    core.transfer=Object.freeze({open,content});
    core.migration=Object.freeze({...toolkit,...importer,importedCopies:id=>migrationDocuments(id).filter(doc=>doc.flags?.[ID]?.migrationV1?.packageId===id),refreshImportedPacks,isImporting:()=>importing,open:options=>{gm();return open(options);}});
  }
  Hooks.once('ready',attach);
  Hooks.on('adventurersTomeCoreApiReady',attach);
})();
