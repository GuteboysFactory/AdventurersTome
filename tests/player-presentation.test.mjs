import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {playerPresentationUpdate,presentationAuthorityUuid} from '../scripts/player-visibility.mjs';
import {unreadPlayerEntries} from '../scripts/player-updates-core.mjs';
import {createImportSharing} from '../scripts/import-player-sharing.mjs';
const ID='adventurers-tome',users=[{id:'gm',isGM:true},{id:'p',isGM:false},{id:'q',isGM:false}];
function document(id,{ownership={default:0},flags={},...extra}={}){
 const d={id,uuid:'JournalEntry.'+id,documentName:'JournalEntry',ownership,flags:{[ID]:flags},getFlag(ns,key){return this.flags[ns]?.[key];},async setFlag(ns,key,value){this.flags[ns]||={};this.flags[ns][key]=structuredClone(value);return this;},async update(patch){for(const [path,value]of Object.entries(patch)){const keys=path.split('.');let target=this;for(const key of keys.slice(0,-1))target=target[key]||={};const key=keys.at(-1);if(key.startsWith('-='))delete target[key.slice(2)];else target[key]=structuredClone(value);}return this;},...extra};return d;
}
test('Presentation grants all players Observer including offline explicit denials, preserving owners and content',async()=>{
 const d=document('a',{ownership:{default:0,p:0,q:3,gm:3},flags:{access:{visibility:'gm',discovered:false,gmNotes:'PRIVATE'},worldProfile:{body:'PUBLIC'}}});
 await d.update(playerPresentationUpdate(d,users));assert.deepEqual(d.ownership,{default:2,p:2,q:3,gm:3});assert.deepEqual(d.getFlag(ID,'access'),{visibility:'inherit',discovered:true,gmNotes:'PRIVATE'});assert.equal(d.getFlag(ID,'worldProfile').body,'PUBLIC');
});
test('Personal Quest grants only its recipient and GM, clearing other explicit permissions',async()=>{
 const d=document('personal',{ownership:{default:2,p:0,q:3,gm:3}});await d.update(playerPresentationUpdate(d,users,{audience:['p']}));assert.deepEqual(d.ownership,{default:0,p:2,gm:3});assert.throws(()=>playerPresentationUpdate(d,users,{audience:['missing']}),/current player/);
});
test('Contact presentation authorizes the target, never its relationship owner',async()=>{
 const d=document('contact',{flags:{semanticProjection:{kind:'contact',sourceUuid:'Actor.privatePC',linkedUuid:'Actor.npc',ownershipManaged:true},worldProfile:{sourceUuid:'Actor.privatePC'}}});
 assert.equal(presentationAuthorityUuid(d),'Actor.npc');await d.update(playerPresentationUpdate(d,users));assert.equal(d.getFlag(ID,'semanticProjection').permissionOverride,true);assert.equal(d.getFlag(ID,'semanticProjection').ownershipManaged,false);
 const unlinked=document('unlinked',{flags:{semanticProjection:{kind:'contact',sourceUuid:'Actor.privatePC'},worldProfile:{actorId:'privatePC'}}});assert.equal(presentationAuthorityUuid(unlinked),'');
});
test('Private Chronicle, Inbox and compendium documents cannot be presented',()=>{
 for(const extra of [{flags:{chronicleV1:{}}},{flags:{vaultInboxV1:{}}},{pack:'pack'},{parent:{}},{documentName:'User'}])assert.throws(()=>playerPresentationUpdate(document('private',extra),users),/cannot be presented/);
});
test('Unread entries include only accessible active Quests and Sessions; seen entries stay acknowledged',()=>{
 const make=(id,type,extra={})=>document(id,{flags:{type,...extra}}),q=make('q','quests'),s=make('s','sessions'),hidden=make('hidden','quests'),done=make('done','quests',{quest:{status:'completed'}});
 const list=[q,s,hidden,done,make('world','world')],canView=d=>d!==hidden;
 assert.deepEqual(unreadPlayerEntries(list,{},canView),{quests:[q],sessions:[s]});assert.deepEqual(unreadPlayerEntries(list,{quests:[q.uuid],sessions:[s.uuid]},canView),{quests:[],sessions:[]});
});

function importFixture({trusted=false,failPrivate=false,failComplete=false,kind='session'}={}){
 const docs=[],privateNotes=[],writes=[],owner=trusted?users[1]:users[0],model={},api={};let sequence=0;
 const ctx={console,structuredClone,TextEncoder,playerPresentationUpdate,createImportSharing,game:{user:{...owner,role:trusted?2:4,can:()=>true},users:{contents:users},journal:{contents:docs}},CONST:{USER_ROLES:{TRUSTED:2},DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3},JOURNAL_ENTRY_PAGE_FORMATS:{HTML:1}},ATTestAI:{assertEnabled(){},flags:d=>d,modules:{get:()=>({api})}},Hooks:{once(){},on(){}},DOMParser:class{parseFromString(html){return {body:{innerHTML:html}};}},digest:async text=>createHash('sha256').update(text).digest('hex'),escapeText:text=>String(text),blocksHtml:blocks=>blocks.map(b=>'<p>'+b.text+'</p>').join(''),model};
 if(trusted)ctx.game.users.activeGM={active:true,query:async(_name,data)=>{const d=docs.find(doc=>doc.id===data.journalId),receipt=d.getFlag(ID,data.key);await d.update({...playerPresentationUpdate(d,users),[`flags.${ID}.${data.key}`]:{...receipt,state:'complete'}});return {id:d.id};}};
 const create=async(options,type)=>{
  await options.beforeCreate?.();const page={id:'page'+(++sequence),uuid:'JournalEntry.x.JournalEntryPage.'+sequence,text:{content:'<p data-at-tome-summary="true"></p>'+options.body}};
  const d=document('j'+sequence,{name:options.title,ownership:{default:0,...(trusted?{p:3}:{})},flags:{type,access:{visibility:trusted?'inherit':'gm'},...(options.uploadReceipt?{[type==='sessions'?'sessionUploadV1':'questUploadV1']:options.uploadReceipt}:{}),...(options.briefingSource?{briefingSourceV1:options.briefingSource}:{}),session:{number:options.number}},pages:{contents:[page]}});
  const update=d.update.bind(d);d.update=async patch=>{if(failComplete&&patch[`flags.${ID}.sessionUploadV1`]?.state==='complete')throw Error('Completion failed');writes.push({id:d.id,patch});return update(patch);};docs.push(d);return {journal:d,page};
 };
 api.campaignAuthoringV2={createSession:o=>create(o,'sessions'),createQuest:o=>create(o,'quests'),nextSessionNumber:()=>2};api.campaignEntityLinks={linkCanonical:async()=>{}};api.securePrivateVault={unlocked:()=>true};api.privateVault={saveNotes:async(d,transform)=>{assert.equal(d.ownership.default,0);if(failPrivate)throw Error('Private handoff failed');privateNotes.push(...transform([]));}};
 api.gmInbox={preflight(){},send:async({notes})=>{if(failPrivate)throw Error('Private handoff failed');privateNotes.push(...notes);return 'JournalEntry.inbox';}};
 api.canView=()=>true;
 const sections=[{id:'public',title:'Story',route:'chronicle',blocks:[{text:'PUBLIC_STORY'}]},{id:'private',title:'Secret',route:'private',blocks:[{text:'GM_SECRET'}]}];
 const context=vm.createContext(ctx),source=fs.readFileSync(new URL('../scripts/session-upload.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(source,context);
 ctx.state={kind,parsed:{digest:'digest',sections},owner:owner.id,defaultPrivateRecipient:trusted?'gm':'self',questRows:[{id:'quest',sectionId:'public',title:'Find it',body:'PUBLIC_OBJECTIVE'}]};vm.runInContext('previews.set(model,state)',context);
 const apply=(choices={})=>{ctx.choices={number:1,title:'Import',...choices};return vm.runInContext('applyPreview(model,choices)',context);};
 return {docs,privateNotes,writes,apply,context};
}
test('Session import becomes visible only after private sections are safely separated',async()=>{
 const f=importFixture();const result=await f.apply({quests:{quest:{action:'create',title:'Shared Quest'}}});assert.equal(result.journal.ownership.default,2);assert.equal(result.journal.getFlag(ID,'access').discovered,true);assert.equal(result.journal.getFlag(ID,'sessionUploadV1').state,'complete');assert.equal(f.privateNotes[0].body,'GM_SECRET');assert.ok(!JSON.stringify(f.docs).includes('GM_SECRET'));assert.equal(f.docs[1].ownership.default,2);
});
test('Failed private handoff keeps the unfinished Session private and does not create public Quests',async()=>{
 const f=importFixture({failPrivate:true});await assert.rejects(f.apply(),/Private handoff failed/);assert.equal(f.docs[0].ownership.default,0);assert.equal(f.docs[0].getFlag(ID,'sessionUploadV1').state,'pending');assert.equal(f.writes.length,0);
});
test('Quest import defaults to shared; personal and GM-only choices stay restricted',async()=>{
 for(const audience of ['all','player:p','gm']){const f=importFixture({kind:'quest'});const {journal}=await f.apply({audience});assert.equal(journal.ownership.default,audience==='all'?2:0);assert.equal(journal.ownership.p,audience==='player:p'?2:undefined);assert.equal(journal.ownership.q,undefined);assert.ok(!JSON.stringify(journal).includes('GM_SECRET'));}
});
test('Session suggestions preserve personal audience and linked existing Quests are never broadened',async()=>{
 const f=importFixture();await f.apply({quests:{quest:{action:'create',title:'Personal Quest',audience:'player:p'}}});assert.deepEqual(f.docs[1].ownership,{default:0,p:2});assert.equal(f.docs[1].getFlag(ID,'questAudienceV1').mode,'personal');
 const linked=importFixture();const existing=document('existing',{flags:{type:'quests',questAudienceV1:{mode:'personal',userIds:['q']}}});linked.docs.push(existing);await linked.apply({quests:{quest:{action:'link',targetUuid:existing.uuid}}});assert.deepEqual(existing.ownership,{default:0});
});
test('Trusted importer shares public Session text but cannot reroute GM-only sections into it',async()=>{
 const f=importFixture({trusted:true});const {journal}=await f.apply();assert.equal(journal.ownership.default,2);assert.equal(journal.ownership.p,3);assert.equal(f.privateNotes[0].body,'GM_SECRET');const rejected=importFixture({trusted:true});await assert.rejects(rejected.apply({routes:{private:'chronicle'}}),/GM-only sections/);assert.equal(rejected.docs.length,0);
});

function delegationFixture(){
 const gm={id:'gm',isGM:true,active:true},p={id:'p',role:2,active:true,isGM:false,can:()=>true},q={id:'q',isGM:false};
 const d=document('import',{testUserPermission:user=>user.id==='p',flags:{type:'sessions',sessionUploadV1:{ownerId:'p',planHash:'hash',state:'ready',audience:'all'}}}),queries={},listeners={};
 const game={user:gm,users:{contents:[gm,p,q],get:id=>[gm,p,q].find(u=>u.id===id),activeGM:gm},journal:{get:id=>id===d.id?d:null}},service=createImportSharing({game,queries,socket:{on:(name,fn)=>listeners[name]=fn}});service.install();
 const data=()=>({journalId:d.id,key:'sessionUploadV1',planHash:'hash'});
 const request=(payload=data(),sender='p')=>{if(sender)listeners.userQuery(sender,'query','adventurersTome.shareOwnedImport',payload);return queries['adventurersTome.shareOwnedImport'](payload);};return {game,d,p,q,data,request,service};
}
test('Delegated sharing authenticates the native query envelope and applies only the ready import',async()=>{const f=delegationFixture();await assert.rejects(f.request(f.data(),null),/authenticated/);await f.request();assert.equal(f.d.ownership.default,2);assert.equal(f.d.getFlag(ID,'sessionUploadV1').state,'complete');await f.request();assert.equal(f.d.ownership.default,2);});
test('Delegated sharing rejects another owner, a forged plan, private journals, changed roles and cross-player personal audience',async()=>{
 for(const mutate of [f=>f.d.flags[ID].sessionUploadV1.ownerId='q',f=>f.d.flags[ID].sessionUploadV1.planHash='changed',f=>f.d.flags[ID].chronicleV1={},f=>f.p.role=1,f=>f.d.flags[ID].sessionUploadV1.state='pending',f=>f.d.flags[ID].sessionUploadV1.audience='player:q']){const f=delegationFixture();mutate(f);await assert.rejects(f.request());assert.equal(f.d.ownership.default,0);}
});
test('No active GM leaves a Trusted import private with a resumable ready receipt',async()=>{const f=delegationFixture();f.game.user=f.p;f.game.users.activeGM=null;await assert.rejects(f.service.complete(f.d,'sessionUploadV1'),/saved privately/);assert.equal(f.d.ownership.default,0);assert.equal(f.d.getFlag(ID,'sessionUploadV1').state,'ready');});
