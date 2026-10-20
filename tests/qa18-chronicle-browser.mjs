import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const Handlebars=require(process.env.TOME_HANDLEBARS||'handlebars');
// Standalone template fixtures do not run Foundry init. Cache behavior has native browser coverage.
Handlebars.registerHelper('atImageSrc', value=>value);
const root=path.resolve(import.meta.dirname,'..'),template=Handlebars.compile(fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8'));
const playerHtml=template({isMyChronicle:true,settings:{nav:{}}});
assert.ok(playerHtml.includes('data-player-chronicle="personal"'));assert.ok(!playerHtml.includes('data-tab="campaignToolsOverview"'));
const gmHtml=template({isGM:true,isCampaignToolsPage:true,isCampaignToolsAnalysis:true,settings:{nav:{}},campaignAnalysis:{}});
assert.ok(!gmHtml.includes('class="<details>'));
assert.ok(gmHtml.includes('data-player-chronicle="rumours"'));
const dashboardHtml=template({isGM:true,isGmDashboard:true,gmDashboard:{nextSession:10,stats:{},due:[],activeQuests:[],currentLocation:null,pinned:[]},settings:{nav:{}}});
assert.ok(dashboardHtml.includes('data-pc-next-session-signals'));
const intelligence={available:true,entity:{uuid:'Actor.lysa'},relationships:[],context:{count:0,appearanceGroups:[],navigationGroups:[]}};
const entitySurfaces=[
 ['Actor profile',template({isProfile:true,profileView:{name:'Lysa',intelligence},settings:{nav:{}}}),'Actor.lysa'],
 ['World profile',template({isWorldProfile:true,worldProfileView:{id:'place',name:'Greyhaven',intelligence},settings:{nav:{}}}),'Actor.lysa'],
 ['Session',template({isSessions:true,selectedSession:{id:'session-9',displayTitle:'Session 9'},settings:{nav:{}}}),'JournalEntry.session-9'],
 ['Quest',template({isQuestDetail:true,questDetail:{id:'quest-1',name:'The Letter'},settings:{nav:{}}}),'JournalEntry.quest-1'],
 ['Generic entity',template({entityContext:{...intelligence},settings:{nav:{}}}),'Actor.lysa']
];
for(const [surface,html,target] of entitySurfaces)assert.ok(html.includes(`data-player-chronicle="entity" data-target-uuid="${target}"`),`${surface} should mount Chronicle against its canonical identity`);
for(const [surface,html] of entitySurfaces)assert.ok(!template({isGM:true,...(surface==='Actor profile'?{isProfile:true,profileView:{name:'Lysa',intelligence}}:surface==='World profile'?{isWorldProfile:true,worldProfileView:{id:'place',name:'Greyhaven',intelligence}}:surface==='Session'?{isSessions:true,selectedSession:{id:'session-9',displayTitle:'Session 9'}}:surface==='Quest'?{isQuestDetail:true,questDetail:{id:'quest-1',name:'The Letter'}}:{entityContext:{...intelligence}}),settings:{nav:{}}}).includes('data-player-chronicle="entity"'),`${surface} must not mount a player Chronicle for the GM`);
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(playerHtml);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TOME_BROWSER?{channel:process.env.TOME_BROWSER}:{})});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async()=>{
  const hooks={};globalThis.Hooks={once:(name,f)=>(hooks[name]||=[]).push(f),on:(name,f)=>(hooks[name]||=[]).push(f)};
  globalThis.trigger=async(name,...args)=>{for(const f of hooks[name]||[])await f(...args);};
  globalThis.notices=[];globalThis.ui={notifications:{warn:m=>notices.push(m),info:m=>notices.push(m)}};
  const user={id:'player',name:'Player',active:true,getFlag:()=>globalThis.chronicleReceipts||[]},gm={id:'gm',name:'GM',isGM:true,active:true};const values={};let serial=0;
  globalThis.CONFIG={queries:{}};
  for(const recipient of [user,gm])recipient.query=async(name,data)=>{const before=game.user;game.user=recipient;try{return await CONFIG.queries[name](structuredClone(data));}finally{game.user=before;}};
  const target={uuid:'Actor.lysa',name:'Lysa Marr',documentName:'Actor',getFlag:()=>null,testUserPermission:()=>true},session={uuid:'JournalEntry.source',name:'Session 9',documentName:'JournalEntry',getFlag:()=>null,testUserPermission:()=>true};
  const api={canView:d=>!d.hidden,entityIntelligence:{open:async uuid=>globalThis.openedUuid=uuid},app:()=>({constructor:{_onResolveCampaignDecision:async()=>globalThis.dismissed=true}})};
  globalThis.game={user,users:{contents:[user,gm],get:id=>[user,gm].find(u=>u.id===id)},world:{id:'qa18'},modules:new Map([['adventurers-tome',{api}]]),actors:{contents:[target,{...target,uuid:'Actor.secret',name:'Hidden spoiler',hidden:true}]},journal:{contents:[session]},items:{contents:[]},scenes:{contents:[]},messages:{contents:[]},settings:{register:()=>{},get:()=>values[game.user.id],set:async(_m,_k,v)=>{values[game.user.id]=structuredClone(v);}}};
  globalThis.fromUuid=async uuid=>[...game.actors.contents,...game.journal.contents].find(d=>d.uuid===uuid);
  globalThis.ChatMessage={create:async data=>{const message={...data,id:`message${++serial}`,author:game.user,timestamp:Date.now(),getFlag:(_m,k)=>data.flags['adventurers-tome'][k]};game.messages.contents.push(message);return message;}};
  globalThis.foundry={utils:{randomID:()=>`note${++serial}`},applications:{api:{DialogV2:{wait:config=>new Promise(resolve=>{
   const dialog=document.createElement('dialog'),form=document.createElement('form');form.innerHTML=config.content;dialog.append(form);
   for(const def of config.buttons){const b=document.createElement('button');b.type='button';b.textContent=def.label;b.dataset.testDialogAction=def.action;form.append(b);b.onclick=async e=>{const answer=await def.callback(e,b);dialog.remove();resolve(answer);};}
   document.body.append(dialog);dialog.showModal();
  })}}}};
  await import('/scripts/migration-private-data.js');await import('/scripts/migration-core.js');await import('/scripts/player-chronicle.js');await import('/scripts/player-chronicle-storage.js');await import('/scripts/player-chronicle-ui.js');await import('/scripts/campaign-rumour-review.js');await trigger('init');
  const canView=api.canView;delete api.canView;await trigger('ready');if(api.playerChronicle)throw Error('Attached before core API was ready');api.canView=canView;await trigger('adventurersTomeCoreApiReady',api);await trigger('renderApplicationV2',{},document);
 });
 await page.addStyleTag({path:path.join(root,'styles/adventurers-tome.css')});await page.addStyleTag({path:path.join(root,'styles/player-chronicle.css')});
 await page.locator('[data-pc="new"]').click();
 assert.equal(await page.locator('option').filter({hasText:'Hidden spoiler'}).count(),0);
 await page.locator('[name="title"]').fill('Tankar om Lysa');await page.locator('[name="text"]').fill('Jag vill fråga Lysa om brevet.');await page.locator('[name="momentDate"]').fill('2026-10-04');await page.locator('[name="target"]').selectOption('Actor.lysa');await page.locator('[name="bookmark"]').check();
 await page.locator('[data-test-dialog-action="save"]').click();await page.locator('.at-chronicle-card').waitFor();
 assert.match(await page.locator('.at-chronicle-card h3').innerText(),/★ Tankar/);
 await page.evaluate(async()=>{game.i18n={localize:key=>key==='AT.Chronicle.Known'?'Känt för mig':key};await trigger('renderApplicationV2',{},document);});assert.equal(await page.locator('[data-pc-view="known"]').innerText(),'Känt för mig');
 await page.locator('[data-pc-view="known"]').click();assert.equal(await page.locator('.at-known-entity').count(),1);assert.match(await page.locator('.at-known-entity').innerText(),/Lysa Marr/);
 await page.locator('[data-pc-search]').fill('Lysa');assert.match(await page.locator('[data-pc-results]').innerText(),/Tankar om Lysa/);
 await page.locator('[data-pc-search]').fill('');await page.locator('[data-pc-view="moments"]').click();assert.match(await page.locator('[data-pc-results]').innerText(),/Remembered 10\/4\/2026|Remembered 4\/10\/2026|Remembered 2026-10-04/);
 await page.locator('[data-pc-view="notes"]').click();
 await page.locator('[data-pc="gm"]').click();await page.locator('[data-test-dialog-action="save"]').click();
 await page.waitForFunction(()=>game.messages.contents.length===1);
 assert.deepEqual(await page.evaluate(()=>game.messages.contents[0].whisper),['gm']);
 assert.equal(await page.evaluate(()=>game.messages.contents[0].flags['adventurers-tome'].chronicleDelivery.snapshot.note.text),'Jag vill fråga Lysa om brevet.');
 await page.locator('[data-pc="edit"]').click();await page.locator('[name="text"]').fill('Privat ändring');await page.locator('[data-test-dialog-action="save"]').click();
 await page.waitForFunction(()=>document.querySelector('.at-chronicle-text')?.textContent==='Privat ändring');
 assert.equal(await page.evaluate(async()=>(await game.modules.get('adventurers-tome').api.playerChronicle.sharedRows())[0].text),'Jag vill fråga Lysa om brevet.');
 assert.equal(await page.evaluate(()=>game.messages.contents[0].content.includes('Jag vill fråga Lysa')),false);
 await page.locator('[data-pc-open]').first().click();assert.equal(await page.evaluate(()=>openedUuid),'Actor.lysa');
 await page.locator('[data-pc-search]').fill('missing');assert.equal(await page.locator('.at-chronicle-card:visible').count(),0);await page.locator('[data-pc-search]').fill('');
 await page.evaluate(async()=>{
  const c=game.modules.get('adventurers-tome').api.playerChronicle;
  await c.save({title:'Session-only memory',text:'This belongs to Session 9.',targetUuids:['JournalEntry.source']});
  document.body.insertAdjacentHTML('beforeend','<section class="at-chronicle" data-player-chronicle="entity" data-target-uuid="Actor.lysa"></section>');
  await trigger('renderApplicationV2',{},document);
 });
 const entityHost=page.locator('[data-player-chronicle="entity"]').last();await entityHost.locator('.at-chronicle-card').first().waitFor();
 assert.ok(await entityHost.locator('.at-chronicle-card').count()>=1);assert.match(await entityHost.innerText(),/Tankar om Lysa/);assert.doesNotMatch(await entityHost.innerText(),/Session-only memory/);
 await entityHost.locator('[data-pc-view="known"]').click();assert.match(await entityHost.locator('[data-pc-results]').innerText(),/Lysa Marr/);assert.doesNotMatch(await entityHost.locator('[data-pc-results]').innerText(),/Session 9/);
 await entityHost.locator('[data-pc-view="notes"]').click();await entityHost.locator('[data-pc="new"]').click();
 assert.ok((await page.locator('[name="target"]').evaluate(select=>[...select.selectedOptions].map(option=>option.value))).includes('Actor.lysa'));await page.locator('[data-test-dialog-action="cancel"]').click();
 await entityHost.evaluate(host=>host.remove());
 const transferDownload=page.waitForEvent('download');await page.locator('[data-pc="move"]').click();await page.locator('[data-test-dialog-action="save"]').click();const transfer=await transferDownload;const transferPath=path.join(root,'../qa19-migration-checks/chronicle-browser-transfer.json');await transfer.saveAs(transferPath);
 const exported=JSON.parse(fs.readFileSync(transferPath,'utf8'));assert.equal(exported.format,'tome-chronicle-transfer');assert.equal(exported.source.ownerId,'player');assert.equal(exported.inbox,undefined);
 await page.evaluate(async()=>{globalThis.previousChronicle=structuredClone(game.settings.get('adventurers-tome','playerChronicleV1'));globalThis.chronicleReceipts=[{version:1,packageId:'browser-migration',sourceWorldId:'qa18',sourceWorldName:'QA campaign',sourceOwnerId:'player',targetOwnerId:'player',links:[{sourceUuid:'Actor.lysa',targetUuid:'Actor.lysa'},{sourceUuid:'JournalEntry.source',targetUuid:'JournalEntry.source'}]}];game.messages.contents.push({author:game.users.get('gm'),whisper:['player'],getFlag:(_scope,key)=>key==='migrationReceiptV1'?chronicleReceipts[0]:undefined});game.world.id='newworld';await game.settings.set('adventurers-tome','playerChronicleV1',{version:1,books:{},inbox:{}});await trigger('renderApplicationV2',{},document);});
 await page.locator('[data-pc="move"]').click();await page.locator('[name="operation"]').selectOption('import');await page.locator('[name="transfer"]').setInputFiles(transferPath);await page.locator('[data-test-dialog-action="save"]').click();await page.waitForFunction(()=>notices.some(text=>text.includes('Your Chronicle has been imported')));
 assert.equal(await page.evaluate(()=>game.messages.contents.length),2);assert.match(await page.locator('.at-chronicle').innerText(),/Privat ändring/);
 await page.evaluate(async()=>{game.world.id='qa18';await game.settings.set('adventurers-tome','playerChronicleV1',previousChronicle);await trigger('renderApplicationV2',{},document);});
 await page.screenshot({path:path.join(root,'../qa18-chronicle-preview.png'),fullPage:true});
 await page.evaluate(async()=>{game.user=game.users.get('gm');await AdventurersTomeChronicleStorage.importDeliveries();document.querySelector('[data-player-chronicle]').dataset.playerChronicle='signals';await trigger('renderApplicationV2',{},document);});
 await page.locator('h2').filter({hasText:'Player Signals'}).waitFor();assert.equal(await page.locator('.at-chronicle-card').count(),1);assert.ok(!(await page.locator('.at-chronicle').innerText()).includes('Privat ändring'));
 await page.evaluate(async()=>{document.body.insertAdjacentHTML('beforeend','<section data-next-session="true"><div data-pc-next-session-signals></div></section>');await trigger('renderApplicationV2',{},document);});
 await page.locator('.at-player-signal-summary').waitFor();assert.match(await page.locator('.at-player-signal-summary').innerText(),/Interest.*Lysa Marr.*Player.*Tankar om Lysa/s);
 await page.evaluate(async()=>{document.body.insertAdjacentHTML('beforeend','<article class="at-guided-decision-card"><header class="at-guided-decision-header"><p>A traveller claimed Lysa smuggles goods.</p></header><button data-save-rumour data-source-uuid="JournalEntry.source" data-decision-text="Traveller">Save as rumour</button></article>');await trigger('renderApplicationV2',{},document);});
 await page.locator('[data-save-rumour]').click();await page.locator('[name="subject"]').selectOption('Actor.lysa');await page.locator('[name="claim"]').fill('Unproven claim about Lysa');assert.match(await page.locator('[name="excerpt"]').inputValue(),/traveller/);await page.locator('[data-test-dialog-action="save"]').click();await page.waitForFunction(()=>globalThis.dismissed);
 const rumours=await page.evaluate(()=>game.modules.get('adventurers-tome').api.playerChronicle.privateRows());assert.equal(rumours[0].rumour.certainty,'rumoured');assert.equal(rumours[0].rumour.sourceUuid,'JournalEntry.source');
 assert.deepEqual(errors,[]);assert.equal((await page.evaluate(()=>notices)).filter(m=>!m.startsWith('Saved as an unconfirmed')&&!m.startsWith('Your Chronicle has been imported')).length,0);
 console.log('PASS: Chronicle on actor, world, session, quest and generic entity surfaces; canonical targeting, target-isolated notes, Known to Me, default entity linking, GM boundary, player navigation, explicit delivery, snapshot isolation, search, Next Session signals and rumour review.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
