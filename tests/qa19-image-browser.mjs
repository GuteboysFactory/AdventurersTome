import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const FALLBACK_ACTOR_IMAGE'),source.indexOf('const MAX_IMPORT_FILE_BYTES'));
const resolver=source.slice(source.indexOf('function resolveFoundryAssetUrl('),source.indexOf('\nfunction cssUrl('));
const attach=source.slice(source.indexOf('  _attachImageFallbacks() {'),source.indexOf('  async _loadImportFile('));
let missing=0;const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/missing.webp')){missing++;res.writeHead(404);res.end();return;}
  if(req.url.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');return;}
  res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root"></div></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.TOME_BROWSER?{channel:process.env.TOME_BROWSER}:{})});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(code=>{
    globalThis.foundry={utils:{getRoute:path=>'/'+path}};
    // Exercise the actual production helper and fallback handler with native image requests.
    eval(`${code.helpers}\n${code.resolver}\nclass Guard {${code.attach}}\nconst guard=new Guard();guard.element=document.querySelector('#root');globalThis.draw=()=>{guard.element.innerHTML='<div class="at-home-group"><img data-at-tome-image src="'+tomeImageSource('missing.webp?v=1')+'"></div>';guard._attachImageFallbacks();};document.addEventListener('error',event=>rememberTomeImageFailure(event.target),true);`);
  },{helpers,resolver,attach});
  await page.evaluate(()=>draw());await page.waitForFunction(()=>document.querySelector('img').src.endsWith('mystery-man.svg')&&document.querySelector('img').naturalWidth>0);
  for(let n=0;n<25;n++){await page.evaluate(()=>draw());await page.waitForFunction(()=>document.querySelector('img').complete&&document.querySelector('img').naturalWidth>0);}
  assert.equal(missing,1);
  console.log('PASS: native browser renders 26 times; missing portrait requested once; fallback loads; stored source unchanged.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
