import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const Handlebars=require('./helpers/vendor/handlebars-4.7.10.cjs').create();
Handlebars.registerHelper('atImageSrc',value=>value);
const root=path.resolve(import.meta.dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'module.json'),'utf8'));
const template=Handlebars.compile(fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8'));
const entries=Array.from({length:243},(_,i)=>({id:`npc${i}`,name:`Person ${i}`,categoryLabel:'NPC',summary:'Readable imported description.'}));
const markup=(isGM,section)=>template({isWorld:section==='world',isSessions:section==='sessions',isQuests:section==='quests',isRules:section==='rules',isGM,settings:{nav:{}},sessions:entries.map(e=>({...e,displayTitle:e.name})),questGroups:[{id:'active',count:entries.length,label:'Active',entries}],rules:entries,worldGroups:[{icon:'fa-user',label:'NPC',entries}]}).replace('class="at-shell"','class="at-shell at-layout-compact"');
const files=['content-importer.js','authoring-foundation.js','authoring-alpha3.js','authoring-alpha3-campaign-explorer-v2.js','authoring-alpha4-explorer-management.js','authoring-alpha5-entry-management.js','authoring-alpha6-page-polish.js','authoring-alpha7-editor-hardening.js','campaign-authoring-v2.js','world-index-header-polish.js','library-ux-polish.js'];
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head></head><body></body></html>');return;}
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.TOME_BROWSER||'msedge'});
try {
  const results=[];
  for(const section of ['world','sessions','quests','rules']) for(const isGM of [true,false]) {
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for(const css of manifest.styles)await page.addStyleTag({url:`/${css}`});
    await page.addStyleTag({content:'#adventurers-tome-app{width:1280px;height:800px;position:relative}.at-content{height:700px;overflow:auto}'});
    await page.evaluate(({isGM,section})=>{
      const callbacks=new Map();globalThis.Hooks={on:(name,fn)=>{if(!callbacks.has(name))callbacks.set(name,[]);callbacks.get(name).push(fn);},once:(name,fn)=>Hooks.on(name,fn),callAll:(name,...args)=>{for(const fn of callbacks.get(name)||[])fn(...args);}};
      const folders=[{id:'root',name:"Adventurer's Tome",type:'JournalEntry'},{id:'world',name:section[0].toUpperCase()+section.slice(1),type:'JournalEntry',folder:'root'},{id:'npcs',name:'NPC',type:'JournalEntry',folder:'world'}];
      const docs=Array.from({length:243},(_,i)=>({id:`npc${i}`,name:`Person ${i}`,folder:'npcs',flags:{},getFlag:(_id,key)=>key==='type'?section:key==='worldProfile'?{category:'npc'}:null,pages:{contents:[]},testUserPermission:()=>true}));
      globalThis.game={world:{id:'layout-test'},user:{id:'viewer',isGM},users:{contents:[],get:id=>id==='viewer'?{id,isGM}:null},folders:{contents:folders,get:id=>folders.find(f=>f.id===id)},journal:{contents:docs,get:id=>docs.find(d=>d.id===id)},settings:{get:()=>''},modules:new Map([['adventurers-tome',{api:{}}]]),socket:{on(){}}};
      globalThis.CONST={JOURNAL_ENTRY_PAGE_FORMATS:{HTML:1}};
      globalThis.foundry={utils:{deepClone:value=>structuredClone(value)}};
    },{isGM,section});
    for(const file of files)await page.addScriptTag({url:`/scripts/${file}`,type:'module'});
    const result=await page.evaluate(async({html,isGM,section})=>{
      Hooks.callAll('ready');
      const root=document.createElement('div');root.id='adventurers-tome-app';root.className='adventurers-tome-app';document.body.append(root);
      const draw=prepare=>{root.innerHTML=html;if(prepare){Hooks.callAll('adventurersTomePrepareView',{},root);Hooks.callAll('adventurersTomeViewPrepared',{},root);}Hooks.callAll('renderApplicationV2',{},root);};
      const snapshot=()=>{
        const heading=root.querySelector('.at-page-heading'),catalog=root.querySelector('.at-cw-catalog-layout, .at-lup-rule-toolbar');
        return {headingHeight:Math.round(heading.getBoundingClientRect().height),catalogTop:Math.round(catalog?.getBoundingClientRect().top||0),toolbar:Boolean(root.querySelector('.at-fm-folder-tools')),importer:Boolean(root.querySelector(section==='world'?'[data-at-whp-import-proxy]':section==='rules'?'[data-at-lup-rule-search]':'.at-lup-library-tools')),quickNpc:Boolean(root.querySelector('[data-action="openQuickNpc"]')),createCount:root.querySelectorAll('[data-at-a3-create="world"], [data-at-af-create="world"]').length};
      };
      const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      draw(false);await frame();const baseline=snapshot();
      await new Promise(resolve=>setTimeout(resolve,900));
      draw(true);await frame();const first=snapshot();
      const samples=[];for(let i=0;i<70;i++){await frame();samples.push(snapshot());}
      // Unrelated app renders must not make the prepared Tome jump either.
      Hooks.callAll('renderApplicationV2',{},document.createElement('aside'));
      await new Promise(resolve=>setTimeout(resolve,350));
      const settled=snapshot();
      let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(root,{childList:true,subtree:true});
      await new Promise(resolve=>setTimeout(resolve,400));observer.disconnect();
      // A subsequent background main render must paint the same layout.
      draw(true);await frame();const refreshed=snapshot();
      return {section,isGM,baseline,first,samples,settled,refreshed,idleMutations:mutations};
    },{html:markup(isGM,section),isGM,section});
    assert.equal(result.baseline.importer,false,'reproduce the delayed legacy layout');
    assert.equal(result.first.importer,true);assert.equal(result.first.quickNpc,false);
    if(section!=='rules')assert.equal(result.first.toolbar,isGM);
    if(section==='world')assert.equal(result.first.createCount,isGM?1:0);
    for(const sample of [...result.samples,result.settled,result.refreshed])assert.deepEqual(sample,result.first,'layout must be final at first frame and remain unchanged');
    assert.equal(result.idleMutations,0,`${section}/${isGM}: observers must settle, including read-only player header`);
    assert.deepEqual(errors,[]);
    if(section==='world') {
      const search=page.locator('[data-at-cw-world-search]');
      await search.fill('Person 24');await search.focus();
      await page.evaluate(()=>Hooks.callAll('renderApplicationV2',{},document.createElement('aside')));
      await page.waitForTimeout(300);
      assert.equal(await search.inputValue(),'Person 24');
      assert.equal(await search.evaluate(node=>document.activeElement===node),true);
      assert.equal(await page.locator('[data-at-whp-import-proxy]').count(),1);
      assert.equal(await page.locator('.at-world-card:not(.at-cw-filtered-out)').count(),6);
    }
    if(isGM)await page.screenshot({path:path.resolve(root,`../qa19-migration-checks/stable-${section}-qa411.png`),fullPage:true});
    results.push({...result,samples:result.samples.length});
    await page.close();
  }
  console.log('PASS: real template, CSS and library enhancers; legacy first-frame defect reproduced; final layout stable from first frame across 243 cards, background refreshes and unrelated app renders; GM/player observers settle.',JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

