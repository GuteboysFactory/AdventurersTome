import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,structuredClone,TextEncoder,TextDecoder,Uint8Array,DataView,Blob,setTimeout,DOMException});
for(const file of ['migration-private-data','migration-core','gm-private-transfer'])vm.runInContext(fs.readFileSync(new URL(`../scripts/${file}.js`,import.meta.url),'utf8'),ctx);
const G=ctx.AdventurersTomeGmPrivateTransfer;
function fixture(){let user={id:'gm',name:'GM',isGM:true},world={id:'old',title:'Old world'},state={version:1,imports:{}};const reads=[],settings={gmPrivateVault:'{"actor:a":{"notes":[{"id":"n","body":"GM PRIVATE"}]}}',gmWorkspace:'{"scratchpad":"MY SCRATCHPAD"}',playerChronicleV1:{books:{private:{n:{text:'PLAYER CHRONICLE'}}}}};
 return {settings,reads,env:{user:()=>user,users:()=>[user],world:()=>world,hasSetting:key=>key in settings,getSetting:key=>{reads.push(key);return structuredClone(settings[key]);},setSetting:async(key,value)=>settings[key]=structuredClone(value),state:()=>state,saveState:async value=>state=structuredClone(value),receipt:async()=>{throw Error('Private backup must not send Chronicle receipts');},canView:async()=>false},setUser:value=>user=value,setWorld:value=>world=value,state:()=>state};}
test('GM Notes & Vault exports only current GM stores and no Chronicle, inbox or campaign settings',()=>{
 const f=fixture(),bundle=G.exportBundle(f.env);assert.ok(f.reads.every(key=>G.keys.includes(key)));assert.ok(!JSON.stringify(bundle).includes('PLAYER CHRONICLE'));assert.equal(bundle.privateData.users.length,1);assert.equal(Object.keys(bundle.privateData.worldSettings).length,0);G.validate(bundle);
 f.setUser({id:'p',name:'Player',isGM:false});assert.throws(()=>G.exportBundle(f.env),/Only a GM/);
});
test('Own-world GM backup merges notes, preserves local notes and can recover deleted data again without touching Chronicle',async()=>{
 const f=fixture(),bundle=G.exportBundle(f.env);f.settings.gmPrivateVault='{}';f.settings.gmWorkspace='{}';await G.restore(f.env,bundle);assert.equal(JSON.parse(f.settings.gmPrivateVault)['actor:a'].notes[0].body,'GM PRIVATE');assert.ok(!f.reads.includes('playerChronicleV1'));
 f.settings.gmPrivateVault='{}';await G.restore(f.env,bundle);assert.equal(JSON.parse(f.settings.gmPrivateVault)['actor:a'].notes.length,1);await G.restore(f.env,bundle);assert.equal(JSON.parse(f.settings.gmPrivateVault)['actor:a'].notes.length,1);
});
test('Another world needs an existing campaign mapping and remaps legacy Vault keys',async()=>{
 const f=fixture(),bundle=G.exportBundle(f.env);f.setWorld({id:'target'});await assert.rejects(()=>G.restore(f.env,bundle),/campaign ZIP first/);
 const state=f.state();state.imports.campaign={complete:true,source:{worldId:'old',worldName:'Old world'},originalPrivateData:{gmOwnerId:'gm'},identities:[{sourceUuid:'Actor.a',targetUuid:'Actor.b'}]};f.settings.gmPrivateVault='{}';await G.restore(f.env,bundle,'campaign');assert.equal(JSON.parse(f.settings.gmPrivateVault)['actor:b'].notes[0].body,'GM PRIVATE');
});
test('Injected campaign/Chronicle fields and player restore attempts fail before writes',async()=>{
 const f=fixture(),bundle=G.exportBundle(f.env);bundle.privateData.gmBooks={private:{secret:{text:'FORGED'}}};assert.throws(()=>G.validate(bundle),/outside GM Notes/);const clean=G.exportBundle(f.env);f.setUser({id:'p',isGM:false});await assert.rejects(()=>G.restore(f.env,clean),/Only a GM/);assert.equal(Object.keys(f.state().imports).length,0);
});
