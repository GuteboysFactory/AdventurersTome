import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,structuredClone,TextEncoder,TextDecoder,btoa,atob,Uint8Array,DataView,Blob,DOMException,setTimeout});
for(const file of ['migration-private-data','migration-core','migration-adapters','migration-import','player-chronicle'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const M=ctx.AdventurersTomePrivateMigration;
const plain=value=>JSON.parse(JSON.stringify(value));
const sourceUsers=[{id:'oldgm',name:'Old GM',isGM:true},{id:'oldp',name:'Player',isGM:false}];
const targetUsers=[{id:'gm',name:'GM',isGM:true},{id:'p',name:'Player',isGM:false}];
const mapping={oldgm:'gm',oldp:'p'},links={'Actor.old':'Actor.new','JournalEntry.old':'JournalEntry.new','JournalEntry.old.JournalEntryPage.page':'JournalEntry.new.JournalEntryPage.newpage'};
function privateData(){return {version:1,gmOwnerId:'oldgm',users:sourceUsers,settings:{gmPrivateVault:JSON.stringify({'Actor.old':{notes:'PRIVATE GM'}})},archives:{gmLastImportUndo:'OLD UNDO'},worldSettings:{campaignTitle:'New title',groupActors:'["old"]'},sharedInbox:{'oldp:gm':{n:{id:'n',note:{ownerId:'oldp',text:'EXPLICIT SHARE',targetUuids:['Actor.old']}}}}};}
function envFixture(){let state={version:1,imports:{}},fail=false;const settings={gmPrivateVault:JSON.stringify({'Actor.target':{notes:'EXISTING GM'}}),campaignTitle:'Target title',groupActors:'[]',playerChronicleV1:{version:1,books:{private:{local:{id:'local',note:{text:'LOCAL NOTE'}}}},inbox:{}}},permissions=[],receipts=[];
 const env={user:()=>targetUsers[0],users:()=>targetUsers,hasSetting:key=>Object.hasOwn(settings,key),getSetting:key=>structuredClone(settings[key]),setSetting:async(key,value)=>{if(fail&&key==='campaignTitle')throw Error('Server unavailable');settings[key]=structuredClone(value);},state:()=>state,saveState:async next=>state=structuredClone(next),setOwnership:async(uuid,value)=>permissions.push([uuid,plain(value)]),canView:async(uuid,id)=>id==='gm'||uuid==='Actor.new',receipt:async(id,row)=>receipts.push([id,plain(row)])};
 return {env,settings,permissions,receipts,state:()=>state,fail:value=>fail=value};}
const restoreOptions=()=>({data:privateData(),source:{worldId:'oldworld',worldName:'Old world'},packageId:'packagehash123',mapping,identities:links,rows:[{sourceUuid:'Actor.old',type:'Actor',sourceData:{ownership:{default:0,oldp:3}}},{sourceUuid:'JournalEntry.old',type:'JournalEntry',sourceData:{ownership:{default:2},pages:[{_id:'page',ownership:{default:-1,oldp:0}}]}}]});

test('Foreign GM Notes restore only to the importing GM Vault before player ownership, without duplicates',async()=>{
 const f=envFixture();f.settings.gmContextualPrivateVaultV2='{"version":2,"records":{}}';const options=restoreOptions();options.rows[0].sourceData.flags={'gm-notes':{notes:'GM ONLY @UUID[Actor.old]'}};options.rows[0].sourceData._id='old';options.rows[0].name='Ada';
 const original=f.env.setOwnership;f.env.setOwnership=async(...args)=>{assert.ok(f.settings.gmContextualPrivateVaultV2.includes('GM ONLY'));return original(...args);};
 await M.restore(f.env,options);await M.restore(f.env,options);const notes=JSON.parse(f.settings.gmContextualPrivateVaultV2).records['Actor.new'].notes;assert.equal(notes.length,1);assert.match(notes[0].body,/Actor.new/);assert.ok(!JSON.stringify(f.receipts).includes('GM ONLY'));assert.ok(!JSON.stringify(f.settings.playerChronicleV1).includes('GM ONLY'));assert.equal(f.state().imports.packagehash123.moduleGmNotes.length,1);
});
test('Explicit old GM aliases can share only the importing GM; ownership merges retain highest level in either source order',()=>{
 const data=privateData();data.users=[...data.users,{id:'oldalias',name:'Old GM alias',isGM:true}];const mapped={...mapping,oldalias:'gm'};
 assert.equal(M.validateUsers(data,mapped,targetUsers,targetUsers[0]).oldalias,'gm');
 for(const ownership of [{default:0,oldgm:3,oldalias:1},{default:0,oldalias:1,oldgm:3}])assert.deepEqual(plain(M.ownership({ownership},mapped,targetUsers)),{default:0,gm:3});
 assert.throws(()=>M.validateUsers(data,{...mapped,oldp:'gm'},targetUsers,targetUsers[0]),error=>error.code==='TOME_ACCOUNT_MAPPING'&&/Player/.test(error.message));
});

test('GM export reads only current GM stores; another player private book cannot enter ZIP',async()=>{
 const f=envFixture(),keys=[];const snapshot=M.capture({...f.env,user:()=>sourceUsers[0],users:()=>sourceUsers,getSetting:key=>{keys.push(key);return f.env.getSetting(key);}});
 assert.ok(keys.every(key=>M.GM_KEYS.includes(key)||M.WORLD_KEYS.includes(key)||key==='playerChronicleV1'));assert.equal(snapshot.gmBooks.private.local.note.text,'LOCAL NOTE');
 const core=ctx.AdventurersTomeMigrationCore.createMigrationToolkit({user:()=>sourceUsers[0],world:()=>({id:'oldworld'}),system:()=>({id:'same'}),module:()=>({version:'qa.3'}),foundryVersion:()=> '13',collection:()=>[],packs:()=>[],yield:async()=>{},privateSnapshot:()=>snapshot});
 const analysis=await core.analyze({types:[]}),zip=await core.exportPackage(analysis),pkg=await ctx.AdventurersTomeMigrationImport.readPackage(new Uint8Array(await zip.blob.arrayBuffer()));
 assert.equal(pkg.manifest.schemaVersion,2);assert.equal(pkg.privateData.settings.gmPrivateVault,snapshot.settings.gmPrivateVault);assert.ok(!JSON.stringify(pkg).includes('OTHER PLAYER PRIVATE'));
 snapshot.settings.gmPrivateVault='changed';await assert.rejects(()=>core.exportPackage(analysis),/Source content changed/);
});
test('Missing, duplicate, nonexistent and wrong GM mappings reject before any target document write',async()=>{
 let writes=0;const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:()=>targetUsers[0],users:()=>targetUsers,world:()=>({id:'target'}),system:()=>({id:'same',types:{}}),restorePrivate:async()=>{},randomId:()=> 'new',create:async()=>{writes++;return {uuid:'JournalEntry.new'};}});
 const pkg={packageId:'package',manifest:{source:{systemId:'same'}},privateData:privateData(),documents:[{sourceUuid:'JournalEntry.old',documentType:'JournalEntry',sourceData:{name:'Old'}}],identityMap:[],references:[]};
 for(const map of [{oldgm:'gm'},{oldgm:'gm',oldp:'gm'},{oldgm:'gm',oldp:'missing'},{oldgm:'p',oldp:'gm'}])await assert.rejects(()=>importer.execute(importer.approveReady(pkg,{},map)));
 assert.equal(writes,0);assert.equal(M.validateUsers(privateData(),{oldgm:'gm',oldp:null},targetUsers,targetUsers[0]).oldp,null);
});
test('GM memory remaps UUID keys, keeps local notes, quarantines Undo and restores page overrides before parent visibility',async()=>{
 assert.deepEqual(plain(M.remap({'actor:old':{documentName:'Actor',documentId:'old',notes:[{text:'Legacy private note'}]}},links)),{'actor:new':{documentName:'Actor',documentId:'new',notes:[{text:'Legacy private note'}]}});
 const f=envFixture();await M.restore(f.env,restoreOptions());const vault=JSON.parse(f.settings.gmPrivateVault);
 assert.equal(vault['Actor.new'].notes,'PRIVATE GM');assert.equal(vault['Actor.target'].notes,'EXISTING GM');assert.equal(f.settings.campaignTitle,'New title');assert.equal(f.settings.groupActors,'["new"]');assert.equal(f.settings.gmLastImportUndo,undefined);
 assert.equal(f.state().imports.packagehash123.archives.gmLastImportUndo,'OLD UNDO');assert.equal(f.settings.playerChronicleV1.books.private.local.note.text,'LOCAL NOTE');assert.equal(f.settings.playerChronicleV1.inbox['p:gm'].n.note.ownerId,'p');
 assert.deepEqual(f.permissions,[['Actor.new',{default:0,p:3}],['JournalEntry.new.JournalEntryPage.newpage',{default:-1,p:0}],['JournalEntry.new',{default:2}]]);
 const player=f.receipts.find(([id])=>id==='p')[1];assert.deepEqual(player.links,[{sourceUuid:'Actor.old',targetUuid:'Actor.new'}]);assert.ok(!JSON.stringify(player).includes('PRIVATE GM'));assert.ok(!JSON.stringify(player).includes('OLD UNDO'));
});
test('Unmapped source accounts prevent default permission widening; GM restoration retries without overwriting later local edits',async()=>{
 assert.deepEqual(plain(M.ownership({ownership:{default:3,oldp:0}},{oldgm:'gm',oldp:null},targetUsers)),{default:0});
 const f=envFixture();f.fail(true);await assert.rejects(()=>M.restore(f.env,restoreOptions()),/Server unavailable/);assert.equal(f.permissions.length,0);
 f.settings.gmPrivateVault=JSON.stringify({'Actor.new':{notes:'LOCAL EDIT AFTER RETRY'}});f.fail(false);await M.restore(f.env,restoreOptions());assert.equal(JSON.parse(f.settings.gmPrivateVault)['Actor.new'].notes,'LOCAL EDIT AFTER RETRY');assert.equal(f.state().imports.packagehash123.complete,true);
});
test('Player transfer matches mapped owner/world, preserves local notes, is repeatable and never imports a spoofed inbox',async()=>{
 let state={version:1,books:{private:{n:{id:'n',note:{text:'LOCAL'}}}},inbox:{}};const env={user:()=>targetUsers[1],read:()=>state,write:async next=>state=plain(next)},bundle={format:'tome-chronicle-transfer',version:1,source:{worldId:'oldworld',ownerId:'oldp'},books:{private:{n:{id:'n',note:{text:'SOURCE',targetUuids:['Actor.old']}}}},inbox:{'evil:gm':{secret:'SPOOF'}}},receipt={sourceWorldId:'oldworld',sourceOwnerId:'oldp',targetOwnerId:'p',links:[{sourceUuid:'Actor.old',targetUuid:'Actor.new'}]};
 await assert.rejects(()=>M.restoreOwn(env,bundle,{...receipt,targetOwnerId:'gm'}),/GM must map/);await assert.rejects(()=>M.restoreOwn(env,bundle,{...receipt,sourceWorldId:'wrong'}),/GM must map/);
 await M.restoreOwn(env,bundle,receipt);assert.equal(state.books.private.n.note.text,'LOCAL');const copy=Object.values(state.books.private).find(row=>row.note.text==='SOURCE');assert.equal(copy.note.targetUuids[0],'Actor.new');assert.equal(copy.delivered,false);assert.deepEqual(state.inbox,{});
 assert.equal((await M.restoreOwn(env,bundle,receipt)).alreadyImported,true);assert.equal(Object.keys(state.books.private).length,2);
});
test('Encrypted note migrates across world/user and collision ID without plaintext or password; access is rechecked after unlock',async()=>{
 const users=[{id:'oldp'},{id:'p'}];let state={version:1,books:{private:{}},inbox:{}},current=users[0],world='oldworld',id=0,visible=true;
 const book={uuid:'Chronicle.virtual',ownership:{oldp:3,p:3},getFlag:(_scope,key)=>key==='chronicleV1'?{version:1,ownerId:current.id,kind:'private'}:state.books.private,testUserPermission:user=>user.id===current.id,setFlag:async(_scope,path,value)=>{state.books.private[path.split('.').at(-1)]=structuredClone(value);}};
 const client=()=>ctx.createPlayerChronicle({user:()=>current,users:()=>users,journals:()=>[book],userScoped:true,worldId:()=>world,crypto:webcrypto,id:()=>`note${++id}`,now:()=>1,resolve:async uuid=>({uuid,name:'Visible target',documentName:'Actor'}),canView:()=>visible});
 await client().save({title:'Encrypted secret',text:'ENCRYPTED TEXT',targetUuids:['Actor.old']},{encrypt:true,phrase:'correct horse battery staple'});
 const bundle=M.ownBundle({user:()=>current,world:()=>({id:world}),read:()=>state});assert.ok(!JSON.stringify(bundle).includes('ENCRYPTED TEXT'));
 current=users[1];world='newworld';state={version:1,books:{private:{note1:{id:'note1',note:{text:'EXISTING'}}}},inbox:{}};
 await M.restoreOwn({user:()=>current,read:()=>state,write:async next=>state=plain(next)},bundle,{sourceWorldId:'oldworld',sourceOwnerId:'oldp',targetOwnerId:'p',links:[{sourceUuid:'Actor.old',targetUuid:'Actor.new'}]});
 const migrated=Object.values(state.books.private).find(row=>row.envelope);assert.notEqual(migrated.id,'note1');const next=client();assert.equal((await next.privateRows()).find(row=>row.id===migrated.id).locked,true);await next.unlock(migrated.id,'correct horse battery staple');const row=(await next.privateRows()).find(row=>row.id===migrated.id);assert.equal(row.text,'ENCRYPTED TEXT');assert.equal(row.targetUuids[0],'Actor.new');visible=false;assert.equal((await next.privateRows()).find(row=>row.id===migrated.id).targetUuids.length,0);
});
test('Optional Realm Guard / Genesys reference adapters leave identity, relationships and private memory system-independent',async()=>{
 // Contract fixtures, not a claim that arbitrary Genesys rules data is convertible.
 for(const [sourceSystem,targetSystem] of [['realm-guard','genesys'],['genesys','realm-guard']]){
  ctx.AdventurersTomeMigrationAdapters.register(`${sourceSystem}->${targetSystem}`,{map:entry=>({status:'mapped',data:{...structuredClone(entry.sourceData),system:{biography:entry.sourceData.system.biography}},notes:['Reference-only biography adapter; unknown mechanics archived.']})});
  const f=envFixture(),saved=[],imported={};let id=0;
  const importer=ctx.AdventurersTomeMigrationImport.createImporter({user:f.env.user,users:f.env.users,world:()=>({id:'target'}),system:()=>({id:targetSystem,types:{Actor:['npc']}}),randomId:()=>`ref${++id}`,imported:()=>imported,create:async(type,data)=>{saved.push(plain(data));const uuid=`${type}.${data._id}`;imported[data.flags['adventurers-tome'].migrationV1.sourceUuid]=uuid;return {uuid};},restorePrivate:options=>M.restore(f.env,options)});
  const pkg={packageId:`reference${sourceSystem}`,manifest:{source:{worldId:'oldworld',systemId:sourceSystem}},privateData:privateData(),identityMap:[],references:[{sourceUuid:'JournalEntry.old',targetUuid:'Actor.old',path:'flags.adventurers-tome.worldProfile.actorId'}],documents:[{sourceUuid:'Actor.old',name:'NPC',documentType:'Actor',sourceData:{_id:'old',name:'NPC',type:'npc',system:{biography:'Original text',unmappedRule:42},ownership:{oldp:2}}},{sourceUuid:'JournalEntry.old',name:'Contact',documentType:'JournalEntry',sourceData:{name:'Contact',flags:{'adventurers-tome':{worldProfile:{category:'contact',actorId:'old'},relations:[{targetUuid:'Actor.old',type:'knows'}]}}}}]};
  const plan=importer.approveReady(pkg,{'Actor.old':{approved:true,include:true}},mapping),result=await importer.execute(plan);assert.equal(result.privateDataRestored,true);
  const [actor,contact]=saved;assert.equal(actor.system.biography,'Original text');assert.equal(actor.flags['adventurers-tome'].migrationV1.sourceData.system.unmappedRule,42);assert.equal(contact.flags['adventurers-tome'].worldProfile.actorId,actor._id);assert.equal(contact.flags['adventurers-tome'].relations[0].targetUuid,`Actor.${actor._id}`);assert.equal(JSON.parse(f.settings.gmPrivateVault)[`Actor.${actor._id}`].notes,'PRIVATE GM');
 }
});
test('Private restoration cancellation retains a retryable checkpoint without granting document visibility',async()=>{
 const f=envFixture(),controller=new AbortController(),original=f.env.setSetting;f.env.setSetting=async(...args)=>{await original(...args);controller.abort();};
 await assert.rejects(()=>M.restore(f.env,{...restoreOptions(),signal:controller.signal}),error=>error.name==='AbortError');assert.equal(f.permissions.length,0);assert.equal(f.receipts.length,0);assert.ok(f.state().imports.packagehash123.originalPrivateData);
});
test('Account receipts accept only GM-authored delivery to the current account and remain in owner storage after logout',async()=>{
 let store={version:1,books:{},inbox:{}};const packet={version:1,packageId:'receiptpackage',sourceWorldId:'oldworld',sourceOwnerId:'oldp',targetOwnerId:'p',links:[{sourceUuid:'Actor.old',targetUuid:'Actor.new'}]};
 const message=(isGM,recipient,row=packet)=>({author:{isGM},whisper:[recipient],getFlag:(_scope,key)=>key==='migrationReceiptV1'?row:null});
 const game={user:{id:'p'},world:{id:'newworld'},settings:{get:()=>structuredClone(store),set:async(_scope,_key,next)=>store=structuredClone(next)},messages:{contents:[message(false,'p'),message(true,'other'),message(true,'p',{...packet,targetOwnerId:'other'}),message(true,'p')]}};
 const scope=vm.createContext({game,Hooks:{once:()=>{},on:()=>{}},structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,DataView,DOMException,setTimeout});
 for(const file of ['migration-private-data','migration-core','player-chronicle-storage'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),scope);
 const storage=scope.AdventurersTomeChronicleStorage;assert.equal((await storage.receipts()).length,1);game.messages.contents=[];assert.equal((await storage.receipts())[0].packageId,'receiptpackage');
 const bundle={format:'tome-chronicle-transfer',version:1,source:{worldId:'oldworld',ownerId:'oldp'},books:{private:{n:{id:'n',note:{text:'Private player note',targetUuids:['Actor.old']}}}}};
 await storage.importOwn(bundle,'receiptpackage');assert.equal(store.books.private.n.note.targetUuids[0],'Actor.new');assert.equal(storage.exportOwn().migrationReceipts,undefined);
 const ownBackup=storage.exportOwn();store={version:1,books:{},inbox:{}};await storage.importOwn(ownBackup,'');assert.equal(store.books.private.n.note.text,'Private player note');
});
