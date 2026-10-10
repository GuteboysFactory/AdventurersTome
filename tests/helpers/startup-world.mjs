import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {performance} from 'node:perf_hooks';
import {world} from './tome-world.mjs';
const root=path.resolve(import.meta.dirname,'../..');
function profileWorld(text='Rhea North works for Copper Circle.') {
 const w=world(text,false),timers=new Map();let serial=0;
 w.context.performance={now:()=>performance.now()};w.context.setTimeout=fn=>{timers.set(++serial,fn);return serial;};w.context.clearTimeout=id=>timers.delete(id);w.context.console.table=()=>{};
 const callbacks=[],hooks=w.context.Hooks;w.context.Hooks={...hooks,once:(name,fn)=>callbacks.push(fn)};
 vm.runInContext(`{${fs.readFileSync(path.join(root,'scripts/startup-performance.js'),'utf8')}}`,w.context);
 w.context.Hooks=hooks;for(const fn of callbacks)fn();
 w.profiler=w.context.AdventurersTomeStartup;w.finish=()=>{for(const fn of [...timers.values()])fn();timers.clear();};
 w.person=w.add('Rhea North','Actor');w.group=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});
 w.session.flags.campaignEntityLinksV1={actorUuids:[w.person.uuid],entityUuids:[w.group.uuid]};w.page.testUserPermission=()=>true;
 return w;
}
function migrationWorld(count=18) {
 const w=profileWorld('');w.context.PRIVATE_VAULT_SETTING='gmPrivateVault';w.context.PRIVATE_REVEAL_SETTING='gmRevealQueue';w.context.PRIVATE_IMPORT_HISTORY_SETTING='gmImportHistory';w.context.PRIVATE_IMPORT_UNDO_SETTING='gmLastImportUndo';
 w.context.FLAGS={ACCESS:'access',PROFILE:'actorProfile',WORLD_PROFILE:'worldProfile'};w.context.GM_NOTE_TYPES={reminder:{}};w.context.GM_NOTE_STATUSES={open:{}};w.context.TOME_VISIBILITY={inherit:{},gm:{}};
 w.context.defaultTomeDiscovered=()=>true;w.context.factVisibility=value=>value==='gm'?'gm':'public';w.context.safeJSONParse=(raw,fallback)=>raw?JSON.parse(raw):fallback;
 const merge=(object,patch)=>{for(const [key,value] of Object.entries(patch)){if(key.startsWith('-='))delete object[key.slice(2)];else if(value&&typeof value==='object'&&!Array.isArray(value))object[key]=merge(object[key]||{},value);else object[key]=structuredClone(value);}return object;};
 w.writeAccess=async(doc,changes)=>{
  w.writes.documents++;
  for(const [key,value] of Object.entries(changes)) {
   const prefix='flags.adventurers-tome.access.';
   if(key.startsWith(prefix))merge(doc.flags.access||=( {} ),{[key.slice(prefix.length)]:value});
  }
 };
 w.writes={settings:0,documents:0};const save=w.game.settings.set;
 w.game.settings.set=async(...args)=>{w.writes.settings++;return save(...args);};
 for(let i=0;i<count;i++) {const doc=w.add(`Private record ${i}`,'Actor',{access:{visibility:'gm',discovered:false,gmNotes:`PRIVATE PAYLOAD ${i}`}});doc.setFlag=async(_m,k,value)=>{w.writes.documents++;doc.flags[k]=merge(doc.flags[k]||{},value);};doc.update=changes=>w.writeAccess(doc,changes);}
 const main=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
 vm.runInContext(main.slice(main.indexOf('function makeGmNoteId('),main.indexOf('function normalizeGmWorkspace('))+main.slice(main.indexOf('async function migrateLegacyPrivateData('),main.indexOf('\nfunction ',main.indexOf('async function migrateLegacyPrivateData('))),w.context);
 w.migrate=()=>w.context.migrateLegacyPrivateData();w.vault=()=>JSON.parse(w.storage.get('gmPrivateVault')||'{}');return w;
}
function universalWorld(w) {
 const callbacks=[],hooks=w.context.Hooks;w.context.Hooks={...hooks,once:(name,fn)=>{if(name==='ready')callbacks.push(fn);}};
 w.context.foundryPlatformInfo=()=>({generation:13,version:'13.350'});
 w.context.document.querySelector=()=>null;w.context.document.addEventListener=()=>{};
 w.context.MutationObserver=class {observe(){}disconnect(){}};
 w.context.window.requestAnimationFrame=()=>0;w.context.window.setInterval=()=>1;w.context.window.clearInterval=()=>{};
 w.context.setInterval=()=>1;w.context.clearInterval=()=>{};
 const app={rendered:false,_prepareContext:async()=>({searchEntries:[]}),_openRefKey:async()=>true,render:async()=>{}};w.api.app=()=>app;
 w.page.documentName='JournalEntryPage';
 const files=['universal-document-registry.js','universal-document-api-bridge.js','universal-document-relation-audit.js','universal-document-permission-read.js','universal-document-consumer-search-navigation.js','universal-document-consumer-explorer-catalog.js','universal-document-lifecycle-hardening.js','imported-source-identity-hardening.js','universal-document-takeover-convergence.js','universal-document-convergence-gate.js'];
 files.splice(2,0,'embedded-item-registry-helper.js','embedded-item-registry-extension.js');
 for(const file of files){let code=fs.readFileSync(path.join(root,'scripts',file),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function ');
  if(file==='embedded-item-registry-helper.js')code+='\nglobalThis.getActorEmbeddedItems=getActorEmbeddedItems;';
  if(file==='embedded-item-registry-extension.js')code=code.slice(0,code.indexOf('Hooks.once("ready"'))+'\nHooks.once("ready",attachEmbeddedItemExtension);';
  if(file==='universal-document-registry.js')code+='\nglobalThis.universalDocumentRegistryApi=universalDocumentRegistryApi;';vm.runInContext(`{${code}}`,w.context,{filename:file});}
 w.context.Hooks=hooks;
 let readyCalled=false;
 w.setupUniversal=()=>{for(const callback of (readyCalled?callbacks.slice(1):callbacks))callback();readyCalled=true;};w.setupUniversal();return w;
}
export {profileWorld,migrationWorld,universalWorld};
