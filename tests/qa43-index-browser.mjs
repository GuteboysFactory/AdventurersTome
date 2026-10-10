import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const root=path.resolve(import.meta.dirname,'..');
const server=http.createServer((request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<main data-at-campaign-index></main>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(request.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/plain');response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.TOME_BROWSER?{channel:process.env.TOME_BROWSER}:{})});
try {
  const page=await browser.newPage();
  const url=`http://127.0.0.1:${server.address().port}`;
  async function boot(){await page.goto(url);await page.evaluate(async()=>{
    const callbacks=[];globalThis.Hooks={once:(event,fn)=>{if(event==='ready')callbacks.push(fn);},on(){},callAll(){}};
    const pageDoc={uuid:'JournalEntry.source.JournalEntryPage.page',name:'Notes',text:{content:'Mira North works as a guide but used to be a scout. Nora Lind arbetar som kurir. Hon hade arbetat som smed.'}};
    const doc={id:'source',uuid:'JournalEntry.source',name:'Test',documentName:'JournalEntry',pages:{contents:[pageDoc]},getFlag:(_id,key)=>key==='type'?'session':null};
    const module={api:{discovery:{scan:async()=>{},snapshot:()=>({entities:[]})},campaignMentionDiscovery:{snapshot:()=>({mentions:[]})},campaignMentionEvidence:{sync:async()=>{}},campaignEntityLinks:{}}};
    globalThis.game={world:{id:'browser-test'},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},modules:new Map([['adventurers-tome',module]]),journal:{contents:[doc],get:()=>doc},actors:{contents:[]},items:{contents:[]},scenes:{contents:[]},i18n:{lang:'en'}};
    globalThis.foundry={utils:{deepClone:structuredClone}};
    await import('/vendor/compromise-14.17.0.js');await import('/scripts/language-packs/en.js');await import('/scripts/language-packs/sv.js');await import('/scripts/campaign-language-foundation.js');await import('/scripts/nlp-provider.js');
    for(const callback of callbacks)callback();callbacks.length=0;
    await import('/scripts/campaign-new-entity-discovery.js');
    await import('/scripts/campaign-index.js');
    globalThis.payload={text:pageDoc.text.content,referenceText:pageDoc.text.content,knownIndex:{names:new Set(),singleAliases:new Set(),entities:[]},journal:{uuid:doc.uuid,name:doc.name},page:{uuid:pageDoc.uuid,name:pageDoc.name},kind:'session'};
  });}
  await boot();
  const first=await page.evaluate(async()=>{
    const expected=AdventurersTomeAnalyzePage(payload);
    let ticks=0;const heartbeat=setInterval(()=>ticks++,2);
    const result=await AdventurersTomeIndex.analyzePage(payload,()=>{throw Error('Worker not used');});
    clearInterval(heartbeat);
    await AdventurersTomeIndex.drain();
    return {ticks,equal:JSON.stringify(expected)===JSON.stringify(result),status:AdventurersTomeIndex.status()};
  });
  assert.ok(first.ticks>0);assert.equal(first.equal,true);assert.equal(first.status.workerError,'');assert.equal(first.status.storageError,'');assert.equal(first.status.misses,1);
  await page.locator('details[data-index-details="recent"] summary').click();
  await page.locator('input').fill('Test');
  await page.evaluate(()=>AdventurersTomeIndex.pause(true));
  assert.equal(await page.locator('input').inputValue(),'Test');
  assert.equal(await page.locator('details[data-index-details="recent"]').getAttribute('open'),'');
  await page.evaluate(()=>AdventurersTomeIndex.pause(false));
  const scrollResult=await page.evaluate(async()=>{
    const host=document.querySelector('main'),wrapper=document.createElement('section');
    wrapper.style.cssText='height:240px;overflow:auto';host.before(wrapper);wrapper.append(host);
    const docs=game.actors.contents;
    for(let i=0;i<40;i++)docs.push({uuid:`Actor.scroll${i}`,name:`Scroll ${i}`,documentName:'Actor'});
    document.querySelector('input').value='';await AdventurersTomeIndex.drain();
    wrapper.scrollTop=700;const before=wrapper.scrollTop;
    await AdventurersTomeIndex.pause(true);
    const after=wrapper.scrollTop;
    await AdventurersTomeIndex.pause(false);return {before,after};
  });
  assert.ok(scrollResult.before>0);assert.equal(scrollResult.after,scrollResult.before);
  await page.addStyleTag({path:path.join(root,'styles/campaign-index.css')});
  await page.addStyleTag({content:'body{background:#100d09;color:#ead49b;font:16px Georgia;padding:24px}button,input{background:#211b14;color:#ead49b}main{max-width:1100px;margin:auto}'});
  await page.screenshot({path:path.join(root,'../index-preview.png'),fullPage:true});
  await boot();
  const warm=await page.evaluate(async()=>{
    const result=await AdventurersTomeIndex.analyzePage(payload,()=>{throw Error('Cache not used');});
    return {groups:result.groups.length,status:AdventurersTomeIndex.status()};
  });
  assert.equal(warm.status.hits,1);assert.equal(warm.status.misses,0);assert.ok(warm.groups>0);
  // A language update must invalidate derived answers without losing history
  // or the GM's paused queue. Simulate the previous installed index revision.
  await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('tome-index:browser-test:gm',1);r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{
      const tx=db.transaction('index','readwrite'),store=tx.objectStore('index'),request=store.get('state');
      request.onsuccess=()=>{const saved=request.result;saved.revision='qa43-index-1';saved.paused=true;
        saved.history['Actor.retired']={uuid:'Actor.retired',name:'Retired NPC',status:'deleted',references:[]};store.put(saved,'state');};
      tx.oncomplete=resolve;
    });db.close();
  });
  await boot();
  const upgraded=await page.evaluate(async()=>{
    await AdventurersTomeIndex.analyzePage(payload,()=>{throw Error('New grammar must run in worker');});
    return AdventurersTomeIndex.status();
  });
  assert.equal(upgraded.hits,0);assert.equal(upgraded.misses,1);assert.equal(upgraded.paused,true);
  assert.ok(upgraded.records.some(row=>row.uuid==='Actor.retired'&&row.status==='deleted'));
  await boot();
  const otherGM=await page.evaluate(async()=>{
    game.user.id='another-gm';await AdventurersTomeIndex.analyzePage(payload,()=>{throw Error('Worker expected');});return AdventurersTomeIndex.status();
  });
  assert.equal(otherGM.hits,0);assert.equal(otherGM.misses,1);
  console.log('PASS: real browser worker equals current main-thread analysis; IndexedDB survives reload and reuses page without analysis.',JSON.stringify({cold:first.status.misses,warmHits:warm.status.hits}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
