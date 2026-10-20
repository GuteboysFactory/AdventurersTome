import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const code=fs.readFileSync(new URL('../scripts/migration-core.js',import.meta.url),'utf8');
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,Uint8Array,DataView,Blob,DOMException,setTimeout});vm.runInContext(code,ctx);
const {createMigrationToolkit,storedZip}=ctx.AdventurersTomeMigrationCore;
test('SHA-256 integrity works on HTTP without Web Crypto and matches native hashes across padding boundaries',async()=>{
  const insecure=vm.createContext({TextEncoder,Uint8Array,Uint32Array,DataView,Blob,DOMException,setTimeout});vm.runInContext(code,insecure);
  for(const size of [0,1,55,56,63,64,65,119,120,1024,70000]){const bytes=new Uint8Array(size);for(let i=0;i<size;i++)bytes[i]=i%251;assert.equal(await insecure.AdventurersTomeMigrationCore.digest(bytes),createHash('sha256').update(bytes).digest('hex'));}
  assert.equal(await insecure.AdventurersTomeMigrationCore.digest('Åsby — svenska'),createHash('sha256').update('Åsby — svenska').digest('hex'));
});
function world() {
  let isGM=true,packReads=0,writes=0;
  const doc=(type,id,more={})=>({uuid:`${type}.${id}`,documentName:type,raw:{_id:id,name:id,...more},toObject(){return structuredClone(this.raw);},update(){writes++;throw Error('No source writes');}});
  const actor=doc('Actor','gunther',{system:{skill:7,unknown:{keep:'me'}},items:[{_id:'sword',name:'Sword',system:{damage:4}}],flags:{foreign:{unknown:42}},ownership:{default:0,gm:3}});
  const journal=doc('JournalEntry','history',{pages:[{_id:'page',text:{content:'<p>@UUID[Actor.gunther]{Gunther} <img src="worlds/w/map.webp"></p>'}}],ownership:{default:0},flags:{'adventurers-tome':{summary:'History',privateFact:{truth:'secret'}}}});
  const scene=doc('Scene','map',{folder:'places',journal:'history',playlist:'music',playlistSound:'song',background:{src:'worlds/w/map.webp'},tokens:[{_id:'token',actorId:'gunther',delta:{system:{hp:2}}}],notes:[{_id:'note',entryId:'history',pageId:'page'}],walls:[{_id:'wall',c:[1,2,3,4]}],lights:[{_id:'light',config:{dim:10}}]});
  const playlist=doc('Playlist','music',{sounds:[{_id:'song',path:'worlds/w/audio.ogg',volume:.5}]});
  const folder=doc('Folder','places',{type:'Scene'}),chronicle=doc('JournalEntry','private',{flags:{'adventurers-tome':{chronicleV1:{kind:'private'},chronicleEntries:{secret:'Do not export'}}}});
  const collections={actors:[actor],items:[],journal:[journal,chronicle],scenes:[scene],playlists:[playlist],tables:[],folders:[folder]};
  const packDoc=doc('JournalEntry','packed',{pages:[],folder:'pFolder'});packDoc.uuid='Compendium.world.library.packed';
  const pack={collection:'world.library',documentName:'JournalEntry',metadata:{label:'Library',type:'JournalEntry',packageType:'world',packageName:'w'},folders:{contents:[doc('Folder','pFolder',{type:'JournalEntry'})]},getDocuments:async()=>{packReads++;return [packDoc];}};
  const env={user:()=>({isGM}),world:()=>({id:'w',title:'Campaign'}),system:()=>({id:'source',version:'1'}),module:()=>({version:'1.9.0-qa.1'}),foundryVersion:()=> '13.351',collection:key=>collections[key],packs:()=>[pack],yield:async()=>{},readAsset:async()=>new Uint8Array([1,2,3])};
  return {api:createMigrationToolkit(env),env,collections,actor,scene,journal,pack,doc,setGM:value=>isGM=value,stats:()=>({packReads,writes})};
}
function unpack(buffer) {
  const result={},v=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);let pos=0;
  while(v.getUint32(pos,true)===0x04034b50){assert.equal(v.getUint16(pos+8,true),0);const length=v.getUint32(pos+18,true),nameLength=v.getUint16(pos+26,true),extra=v.getUint16(pos+28,true);const name=new TextDecoder().decode(buffer.slice(pos+30,pos+30+nameLength));const start=pos+30+nameLength+extra;result[name]=buffer.slice(start,start+length);pos=start+length;}
  assert.equal(v.getUint32(pos,true),0x02014b50);assert.equal(v.getUint32(buffer.length-22,true),0x06054b50);return result;
}
test('Analysis preserves canonical sources, unknown system fields, scene data and GM ownership without writes',async()=>{
  const w=world(),before=JSON.stringify(w.collections),s=await w.api.analyze();
  assert.equal(JSON.stringify(w.collections),before);assert.equal(w.stats().writes,0);
  const a=s.documents.find(row=>row.sourceUuid==='Actor.gunther');assert.equal(a.status,'unmapped');assert.equal(a.unmapped.systemData.unknown.keep,'me');assert.equal(a.sourceData.ownership.default,0);
  assert.equal(s.documents.find(row=>row.sourceUuid==='Scene.map').sourceData.tokens[0].delta.system.hp,2);
  assert.ok(s.identityMap.some(row=>row.sourceUuid==='Actor.gunther.Item.sword'));
  assert.ok(s.identityMap.some(row=>row.sourceUuid==='JournalEntry.history.JournalEntryPage.page'));
  assert.equal(s.manifest.excludedEntries.length,1);assert.ok(!JSON.stringify(s).includes('Do not export'));
  assert.ok(s.references.find(row=>row.targetUuid==='Playlist.music.PlaylistSound.song'&&row.status==='included'));
  assert.ok(s.references.find(row=>row.targetUuid==='JournalEntry.history.JournalEntryPage.page'&&row.status==='included'));
  assert.equal(s.assets.length,2);assert.equal(s.assets.find(a=>a.source.endsWith('map.webp')).uses.length,2);
  assert.equal(s.manifest.privacy.classification,'private-gm-migration-package');
});
test('Packs are read only when selected, with pack folders and stable canonical identities',async()=>{
  const w=world();w.api.inventory();assert.equal(w.stats().packReads,0);await w.api.analyze();assert.equal(w.stats().packReads,0);
  const s=await w.api.analyze({types:[],packs:['world.library']});assert.equal(w.stats().packReads,1);assert.equal(s.packs[0].folders.length,1);
  assert.ok(s.identityMap.some(row=>row.sourceUuid==='Compendium.world.library.Folder.pFolder'));
  assert.ok(s.references.some(row=>row.targetUuid==='Compendium.world.library.Folder.pFolder'&&row.status==='included'));
  assert.equal(s.documents[0].canonicalId,(await w.api.analyze({types:[],packs:['world.library']})).documents[0].canonicalId);
});
test('Partial selection reports unresolved document references rather than inventing target identities',async()=>{
  const w=world(),s=await w.api.analyze({types:['Scene']});assert.ok(s.manifest.unresolvedEntries.some(row=>row.targetUuid==='Actor.gunther'));
  assert.equal(s.documents[0].status,'needs-review');
  assert.ok(s.identityMap.every(row=>row.targetUuid===null));
});
test('Changes during analysis invalidate the snapshot before it can be reviewed/exported',async()=>{
  const w=world();let revision=0;w.env.revision=()=>revision;w.env.yield=async()=>{revision++;};
  await assert.rejects(w.api.analyze(),/Source content changed during analysis/);
});
test('Nested Chronicle journals in Adventure compendiums cannot bypass owner-aware migration exclusion',async()=>{
  const w=world();const adventure=w.doc('Adventure','adventure',{journal:[{_id:'private',flags:{'adventurers-tome':{chronicleV1:{kind:'private'},chronicleEntries:{text:'NESTED PRIVATE'}}}}]});adventure.uuid='Compendium.world.library.adventure';w.pack.getDocuments=async()=>[adventure];
  const s=await w.api.analyze({types:[],packs:['world.library']});assert.equal(s.documents.length,0);assert.equal(s.manifest.excludedEntries.length,1);assert.ok(!JSON.stringify(s).includes('NESTED PRIVATE'));
});
test('Export rebuilds the payload from canonical sources and ignores mutated cached document data',async()=>{
  const w=world(),s=await w.api.analyze();s.documents[0].sourceData.name='Forged cached name';
  const out=await w.api.exportPackage(s),files=unpack(new Uint8Array(await out.blob.arrayBuffer()));
  const payload=JSON.parse(new TextDecoder().decode(files['campaign.json']));assert.equal(payload.documents[0].sourceData.name,'gunther');
});
test('GM authorization is enforced for inventory, analysis and export including role loss mid-operation',async()=>{
  const w=world(),s=await w.api.analyze();w.setGM(false);assert.throws(()=>w.api.inventory(),/Only a GM/);await assert.rejects(w.api.analyze(),/Only a GM/);await assert.rejects(w.api.exportPackage(s),/Only a GM/);
  w.setGM(true);await assert.rejects(w.api.analyze({progress:()=>w.setGM(false)}),/Only a GM/);
});
test('Export detects changed sources after review and does not write or silently export stale data',async()=>{
  const w=world(),s=await w.api.analyze();w.actor.raw.name='Renamed';await assert.rejects(w.api.exportPackage(s),/Source content changed/);assert.equal(w.stats().writes,0);
});
test('Portable ZIP has valid entries, payload checksums, media mappings and original paths',async()=>{
  const w=world(),s=await w.api.analyze({mediaMode:'include'}),out=await w.api.exportPackage(s);
  const files=unpack(new Uint8Array(await out.blob.arrayBuffer()));const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json'])),payload=JSON.parse(new TextDecoder().decode(files['campaign.json']));
  for(const entry of manifest.files){assert.equal(files[entry.path].length,entry.bytes);assert.equal(createHash('sha256').update(files[entry.path]).digest('hex'),entry.sha256);}
  assert.equal(payload.documents.find(d=>d.documentType==='Scene').sourceData.background.src,'worlds/w/map.webp');
  assert.equal(payload.assets.length,2);assert.ok(payload.assets.every(a=>a.status==='included'&&files[a.packagePath]));assert.equal(manifest.mediaIssues.length,0);
});
test('Unavailable media is retained and reported; reference export never reads media',async()=>{
  const w=world();let reads=0;w.env.readAsset=async()=>{reads++;throw Error('Missing file');};
  const ref=await w.api.exportPackage(await w.api.analyze());assert.equal(reads,0);assert.equal(ref.assets[0].status,'referenced');
  const out=await w.api.exportPackage(await w.api.analyze({mediaMode:'include'}));assert.equal(reads,2);assert.equal(out.manifest.mediaIssues.length,2);assert.ok(out.assets.every(a=>a.status==='unavailable'&&a.source));
});
test('Cancellation stops analysis/export; unsupported pack data is preserved',async()=>{
  const w=world(),controller=new AbortController();controller.abort();await assert.rejects(w.api.analyze({signal:controller.signal}),{name:'AbortError'});
  const doc=w.doc('Macro','macro',{command:'never execute me'});doc.uuid='Compendium.world.library.macro';w.pack.getDocuments=async()=>[doc];
  const s=await w.api.analyze({types:[],packs:['world.library']});assert.equal(s.documents[0].status,'unsupported');assert.equal(s.documents[0].sourceData.command,'never execute me');assert.equal(s.manifest.unsupportedEntries.length,1);
  await assert.rejects(w.api.exportPackage(s,{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(storedZip([{name:'../escape',data:new Uint8Array()}]),/Unsafe package path/);
});
test('Toolkit launcher is GM settings-only and migration is not hooked into world document writes or indexing',()=>{
  const ui=fs.readFileSync(new URL('../scripts/migration-ui.js',import.meta.url),'utf8');
  assert.ok(ui.includes('TomeMigrationApp'));assert.ok(!ui.includes("Hooks.on('update"));assert.ok(!code.includes('.update('));assert.ok(!code.includes('.create('));assert.ok(!code.includes('.setFlag('));
  const template=fs.readFileSync(new URL('../templates/tome.hbs',import.meta.url),'utf8');assert.ok(template.includes('data-action="openMigration"'));
});
