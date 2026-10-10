// Run with Playwright installed, or TOME_PLAYWRIGHT pointing at its package.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const code=fs.readFileSync(new URL('../scripts/view-continuity.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,...(process.env.TOME_BROWSER?{channel:process.env.TOME_BROWSER}:{})});
try {
 const page=await browser.newPage();
 await page.setContent('<main id="tome"></main>');await page.addScriptTag({content:code});
 const result=await page.evaluate(async()=>{
  const root=document.querySelector('#tome'),api=globalThis.AdventurersTomeViewContinuity;
  const markup='<section class="at-content" style="height:240px;overflow:auto"><details id="facts"><summary>Facts</summary><p>Open contents</p></details><div style="height:1800px">Long session</div></section>';
  root.innerHTML=markup;let scroll=root.firstElementChild;scroll.classList.add('at-ca2-primary-workspace');scroll.dataset.atA3TreeReady='true';
  root.querySelector('details').open=true;scroll.scrollTop=520;const state=api.capture(root);
  root.innerHTML='<div>Loading component</div>';api.restoreSettled(root,state);
  await new Promise(resolve=>setTimeout(resolve,90));root.innerHTML=markup;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  scroll=root.firstElementChild;const restored={top:scroll.scrollTop,open:root.querySelector('details').open};
  root.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));root.querySelector('details').open=false;
  // Let native scroll anchoring settle after the user closes the details.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  scroll.scrollTop=160;scroll.append(document.createElement('span'));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return {restored,afterUser:{top:scroll.scrollTop,open:root.querySelector('details').open}};
 });
 assert.equal(result.restored.top,520);assert.equal(result.restored.open,true);
 assert.equal(result.afterUser.top,160);assert.equal(result.afterUser.open,false);
 console.log('PASS: real browser layout restores delayed components and respects user scrolling.',JSON.stringify(result));
} finally {await browser.close();}
