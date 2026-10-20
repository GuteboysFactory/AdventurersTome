import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const Handlebars=require('./helpers/vendor/handlebars-4.7.10.cjs').create();
Handlebars.registerHelper('atImageSrc',value=>value);
const root=path.resolve(import.meta.dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'module.json'),'utf8'));
const render=Handlebars.compile(fs.readFileSync(path.join(root,'templates/tome.hbs'),'utf8'));
const image='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>';
const markup=(isGM,context)=>render({isProfile:true,isGM,settings:{nav:{}},profileView:{id:'pc',name:'Arantor',img:image,relations:Array.from({length:9},(_,i)=>({label:'Contact',target:{name:`Contact ${i}`,img:image}})),intelligence:{available:true,entity:{uuid:'Actor.pc'},relationships:[],context:{count:context?1:0,appearanceGroups:context?[{label:'Sessions',entries:[{name:'Linked session',uuid:'JournalEntry.linked'}]}]:[]}}}});
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head></head><body></body></html>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.TOME_BROWSER||'msedge'});
try {
  const results=[];
  for(const isGM of [true,false]) for(const context of [false,true]) {
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for(const css of manifest.styles)await page.addStyleTag({url:`/${css}`});
    await page.addStyleTag({content:'#adventurers-tome-app{width:1280px;height:850px;overflow:auto}'});
    await page.evaluate(({isGM,context})=>{
      const hooks=new Map();globalThis.Hooks={on:(name,fn)=>{if(!hooks.has(name))hooks.set(name,[]);hooks.get(name).push(fn);},once:(name,fn)=>Hooks.on(name,fn),callAll:(name,...args)=>{for(const fn of hooks.get(name)||[])fn(...args);}};
      globalThis.writes=0;
      const actor={id:'pc',uuid:'Actor.pc',name:'Arantor',getFlag:()=>false,testUserPermission:()=>true};
      const journal=(id,name,linked=false)=>({id,uuid:`JournalEntry.${id}`,name,flags:linked?{campaignEntityLinksV1:{actorUuids:[actor.uuid]}}:{},getFlag(_id,key){return key==='type'?'session':this.flags[key];},testUserPermission:()=>true});
      globalThis.docs=[journal('linked','Linked session',context),journal('available',"Session & Queen's Road")];
      globalThis.module={api:{}};
      globalThis.game={user:{id:'viewer',isGM},i18n:{lang:'en'},modules:new Map([['adventurers-tome',module]]),actors:{contents:[actor],get:id=>id===actor.id?actor:null},journal:{contents:docs,get:id=>docs.find(doc=>doc.id===id)},folders:{contents:[],get:()=>null},items:{get:()=>null}};
      globalThis.foundry={utils:{deepClone:value=>structuredClone(value)}};
      globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
      const root=document.createElement('div');root.id='adventurers-tome-app';root.className='adventurers-tome-app';document.body.append(root);
      globalThis.app={element:root,activeTab:'profile',activeActorId:'pc'};module.api.app=()=>app;
    },{isGM,context});
    await page.addScriptTag({url:'/scripts/view-continuity.js',type:'module'});
    await page.addScriptTag({url:'/scripts/campaign-entity-links.js',type:'module'});
    const result=await page.evaluate(async({html,isGM,context})=>{
      const root=app.element,continuity=AdventurersTomeViewContinuity;
      const draw=()=>{root.innerHTML=html;Hooks.callAll('adventurersTomeViewPrepared',app,root);Hooks.callAll('renderApplicationV2',app,root);};
      // Reproduce the missing panel before the old delayed mount can run.
      root.innerHTML=html;const legacyMissing=!root.querySelector('.at-cel-inline-editor');
      Hooks.callAll('ready');draw();
      const geometry=()=>({top:root.querySelector('.at-profile-relations').offsetTop,editors:root.querySelectorAll('.at-cel-inline-editor').length,panels:root.querySelectorAll('[data-at-cel-owned-panel]').length});
      const first=geometry(),samples=[];
      for(let i=0;i<40;i++){await new Promise(resolve=>requestAnimationFrame(resolve));samples.push(geometry());}
      let kept=null;
      if(isGM) {
        const editor=root.querySelector('.at-cel-inline-editor'),picker=editor.querySelector('select');
        editor.open=true;picker.value='session:available';picker.focus();
        let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(root,{childList:true,subtree:true});
        for(let i=0;i<5;i++){Hooks.callAll('updateActor',{});Hooks.callAll('renderApplicationV2',app,root);await new Promise(resolve=>setTimeout(resolve,180));}
        observer.disconnect();
        kept={sameNode:editor===root.querySelector('.at-cel-inline-editor'),open:editor.open,value:picker.value,focused:document.activeElement===picker,mutations};
        // A real available-target rename updates options without replacing the control.
        docs.find(doc=>doc.id==='available').name='Renamed & readable';Hooks.callAll('updateJournalEntry',{});await new Promise(resolve=>setTimeout(resolve,200));
        if(!picker.selectedOptions[0].textContent.includes('Renamed'))throw Error('Changed source options were not refreshed');
        if(picker.value!=='session:available'||!editor.open)throw Error('Target update lost the pending choice');
        const state=continuity.capture(root);draw();continuity.restoreSettled(root,state);
        await new Promise(resolve=>setTimeout(resolve,250));
        if(!root.querySelector('.at-cel-inline-editor').open||root.querySelector('select').value!=='session:available')throw Error('Full render lost open manager or choice');
      }
      if (isGM && context) {
        const sourceSelector='[data-action="openContextEntity"][data-target-uuid="JournalEntry.linked"]';
        const editor=root.querySelector('.at-cel-inline-editor');
        docs[0].flags.campaignEntityLinksV1.actorUuids=[];
        Hooks.callAll('updateJournalEntry',docs[0]);await new Promise(resolve=>setTimeout(resolve,200));
        if(root.querySelector('[data-at-cel-unlink-journal="session:linked"]'))throw Error('Stale unlink action survived a link removal');
        if(!root.querySelector(sourceSelector)||root.querySelector('.at-cel-inline-editor')!==editor)throw Error('Removing a link removed source navigation or the editor');
        docs[0].flags.campaignEntityLinksV1.actorUuids=['Actor.pc'];
        Hooks.callAll('updateJournalEntry',docs[0]);await new Promise(resolve=>setTimeout(resolve,200));
        if(root.querySelectorAll('[data-at-cel-unlink-journal="session:linked"]').length!==1)throw Error('Canonical unlink action not restored exactly once');
        game.user.isGM=false;Hooks.callAll('renderApplicationV2',app,root);await new Promise(resolve=>setTimeout(resolve,200));
        if(root.querySelector('.at-cel-inline-editor')||root.querySelector('[data-at-cel-unlink-journal]')||!root.querySelector(sourceSelector))throw Error('Role change leaked GM controls or removed source navigation');
      }
      return {isGM,legacyMissing,first,samples,kept,writes};
    },{html:markup(isGM,context),isGM,context});
    assert.equal(result.legacyMissing,true);
    assert.equal(result.first.editors,isGM?1:0);
    for(const sample of result.samples)assert.deepEqual(sample,result.first,'relations must not move after the first paint');
    if(isGM)assert.deepEqual(result.kept,{sameNode:true,open:true,value:'session:available',focused:true,mutations:0});
    assert.equal(result.writes,0);assert.deepEqual(errors,[]);
    results.push({...result,context,samples:result.samples.length});
    await page.close();
  }
  console.log('PASS: profile links exist before paint; no relation-card movement; repeated refresh preserves the same open editor, selection and focus; changed source choices refresh; full-render continuity and player visibility hold.',JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
