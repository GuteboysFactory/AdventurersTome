import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TOME_PLAYWRIGHT||'playwright');
const root=path.resolve(import.meta.dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/adventurers-tome.js'),'utf8');
const core='C:/Program Files/Foundry Virtual Tabletop/resources/app/public';
function method(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const methods=method('  render(options={},...args) {','  static DEFAULT_OPTIONS')+method('  _scheduleWindowStateSave() {','  _applyTomeTransparency(')+method('  _installWindowChromeControls() {','  async _prepareContext(');
const launcherSource=source.slice(source.indexOf('function installLauncher() {'),source.indexOf('Hooks.once("init",',source.indexOf('function installLauncher() {')));
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<body class="theme-dark"></body>');return;}const url=decodeURIComponent(req.url.split('?')[0]),base=url.startsWith('/core/')?core:root,file=path.resolve(base,url.startsWith('/core/')?url.slice(6):url.slice(1));if(!file.startsWith(path.resolve(base)+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.TOME_BROWSER||'msedge'}),results=[];
try{
 for(const reduced of [false,true]){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addStyleTag({url:'/core/css/foundry2.css'});await page.addStyleTag({url:'/core/fonts/fontawesome/css/all.min.css'});
  await page.addStyleTag({url:'/styles/adventurers-tome.css'});
  await page.addStyleTag({url:'/styles/window-dock.css'});await page.addStyleTag({content:'body{background:#27333b;font:16px Georgia;margin:0}.application{position:absolute;box-sizing:border-box;border:1px solid #a88648;background:#19130e;color:#ead49b;display:flex;flex-direction:column}.window-header{display:flex;align-items:center;height:34px;flex-shrink:0;background:#0c0a08;padding:8px}.window-header h1{font:14px Georgia;flex:1}.window-content{overflow:auto;flex:1;padding:20px}.at-shell{height:1800px}textarea{width:90%;height:160px;background:#100d09;color:#ead49b}button{cursor:pointer}'});
  await page.addStyleTag({content:'#adventurers-tome-app .window-content{overflow:auto!important;padding:20px!important}#adventurers-tome-app .at-shell{height:1800px;overflow:visible;container-type:normal}'});
  await page.evaluate(async({methods,launcherSource})=>{
   globalThis.MODULE_ID='adventurers-tome';const saved={windowMode:'remember',tomeTransparency:0};globalThis.settingWrites=[];
   globalThis.game={i18n:{localize:k=>k},settings:{get:(_m,k)=>saved[k],set:async(_m,k,v)=>{saved[k]=v;settingWrites.push(k);}},modules:new Map()};globalThis.Hooks={on(){},once(){}};globalThis.ui={notifications:{info(){}}};
   globalThis.clamp=(v,min,max)=>Math.min(max,Math.max(min,v));globalThis.safeJSONParse=(v,fallback)=>{try{return JSON.parse(v);}catch{return fallback;}};globalThis.getApp=()=>globalThis.app;
   globalThis.installLauncher=eval('('+launcherSource+')');
   const originalAnimate=Element.prototype.animate;globalThis.animations=0;globalThis.animationTargets=[];Element.prototype.animate=function(...a){animations++;animationTargets.push({frames:a[0],launcher:document.getElementById('adventurers-tome-launcher').getBoundingClientRect().toJSON(),window:this.getBoundingClientRect().toJSON()});return originalAnimate.apply(this,a);};
   globalThis.Base=class{
    constructor(){this.position={width:1100,height:800,left:100,top:50};this.rendered=true;this.activeTab='campaignToolsAssistant';this.renders=0;this.closes=0;this.element=document.createElement('div');this.element.id='adventurers-tome-app';this.element.className='application adventurers-tome-app';this.element.innerHTML='<header class="window-header"><h1>Adventurer’s Tome</h1><button type="button" data-action="close">×</button></header><section class="window-content"><div class="at-shell"><h2>Private campaign scratchpad</h2><textarea name="draft">Saved text</textarea><p>Scroll test</p></div></section>';document.body.append(this.element);this.setPosition(this.position);this.element.addEventListener('click',e=>{if(e.target.closest('[data-action=close]'))void this.close();});}
    setPosition(p){Object.assign(this.position,p);for(const k of ['width','height','left','top'])this.element.style[k]=this.position[k]+'px';return this.position;}
    render(){this.renders++;return Promise.resolve(this);}
    _tearDown(){this.element.remove();this.rendered=false;}
    close(){this.closes++;this._tearDown({});return Promise.resolve(this);}
    _applyTomeTransparency(){}
    _captureNavigationState(){return {activeTab:this.activeTab};}
    bringToFront(){ui.activeWindow=this;}
   };
   globalThis.Test=eval(`(class extends Base {${methods}})`);globalThis.app=new Test();
   await import('/scripts/window-dock.js');app._installWindowChromeControls();
  },{methods,launcherSource});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'scripts/adaptive-window.js'),'utf8')+'\nglobalThis.testAdaptivePatch=atAwPatchApp;'});
  await page.evaluate(()=>{testAdaptivePatch(app);app._attachResponsiveObserver();});
  const launcher=page.locator('#adventurers-tome-launcher');
  async function dragLauncher(dx,dy){const r=await launcher.boundingBox();await page.mouse.move(r.x+40,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+40+dx,r.y+r.height/2+dy,{steps:7});await page.mouse.up();}
  await dragLauncher(210,-550);
  await page.locator('textarea').fill('Unsaved private prep — keep this exact text.');await page.locator('textarea').evaluate(e=>{e.focus();e.setSelectionRange(7,14);});
  await page.locator('.window-content').evaluate(e=>e.scrollTop=230);
  const before=await page.evaluate(()=>({position:{...app.position},scroll:document.querySelector('.window-content').scrollTop,renders:app.renders,writes:settingWrites.length}));
  await page.locator('[data-action=close]').click();await page.waitForFunction(()=>document.querySelector('#adventurers-tome-app').classList.contains('at-window-docked'));
  assert.equal(await page.evaluate(()=>app.closes),0);assert.equal(await page.locator('#adventurers-tome-launcher.at-launcher-parked').isVisible(),true);assert.equal(await page.locator('.at-window-dock').count(),0);
  const parkedWrites=await page.evaluate(()=>settingWrites.length);
  const parked=await page.evaluate(async()=>{for(let i=0;i<20;i++)await app.render({parts:['main']});for(let i=0;i<20;i++)app._scheduleWindowStateSave();await new Promise(r=>setTimeout(r,350));return {renders:app.renders,writes:settingWrites.length,inert:app.element.inert,rect:document.querySelector('#adventurers-tome-launcher').getBoundingClientRect().toJSON()};});
  assert.equal(parked.renders,before.renders);assert.equal(parked.writes,parkedWrites);assert.equal(parked.inert,true);assert.ok(parked.rect.bottom<=1000);
  if(!reduced){const target=await page.evaluate(()=>animationTargets[0]);assert.equal(target.frames[1].transform,`translate(${target.launcher.left-target.window.left}px,${target.launcher.top-target.window.top}px) scale(${target.launcher.width/target.window.width},${target.launcher.height/target.window.height})`);}
  await dragLauncher(280,90);assert.equal(await page.evaluate(()=>app._atWindowDocked),true);
  const moved=await launcher.boundingBox(),closeRect=await page.locator('[data-at-dock-close]').boundingBox();assert.ok(Math.abs(closeRect.x-(moved.x+moved.width-32))<1,JSON.stringify({moved,closeRect,style:await page.locator('[data-at-dock-close]').getAttribute('style')}));
  await page.screenshot({path:path.join(root,`../qa19-migration-checks/window-dock-qa416-${reduced?'reduced':'animated'}.png`)});
  await page.locator('[data-at-dock-restore]').click();await page.waitForFunction(()=>!app._atWindowDocked);
  assert.equal(await page.locator('textarea').inputValue(),'Unsaved private prep — keep this exact text.');
  assert.equal(await page.evaluate(()=>document.querySelector('.window-content').scrollTop),before.scroll);
  assert.deepEqual(await page.evaluate(()=>({...app.position})),before.position);assert.equal(await page.evaluate(()=>app.renders),0);
  assert.equal(await page.evaluate(()=>animations),reduced?0:2);
  if(!reduced){const target=await page.evaluate(()=>animationTargets[1]);assert.equal(target.frames[0].transform,`translate(${target.launcher.left-target.window.left}px,${target.launcher.top-target.window.top}px) scale(${target.launcher.width/target.window.width},${target.launcher.height/target.window.height})`);assert.ok(target.launcher.left!==parked.rect.left);}
  // Rapid repeated requests serialize, then force-open uses the real render override.
  await page.evaluate(async()=>{await Promise.all([AdventurersTomeWindowDock.park(app),AdventurersTomeWindowDock.park(app)]);await Promise.all([app.render(true),app.render(true)]);});
  assert.equal(await launcher.count(),1);assert.equal(await page.locator('.at-launcher-parked').count(),0);assert.equal(await page.locator('[data-at-dock-close]').isVisible(),false);assert.equal(await page.locator('textarea').inputValue(),'Unsaved private prep — keep this exact text.');
  await page.evaluate(()=>AdventurersTomeWindowDock.park(app));await launcher.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!app._atWindowDocked);
  await page.evaluate(()=>AdventurersTomeWindowDock.park(app));await launcher.click({button:'right'});assert.equal(await page.evaluate(()=>app._atWindowDocked),true);
  const reset=await launcher.boundingBox(),resetClose=await page.locator('[data-at-dock-close]').boundingBox();assert.equal(Math.round(reset.x),14);assert.ok(Math.abs(resetClose.x-(reset.x+reset.width-32))<1);
  await launcher.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!app._atWindowDocked);
  // Clean views refresh once after a parked background request.
  await page.evaluate(async()=>{const t=document.querySelector('textarea');t.value=t.defaultValue;await AdventurersTomeWindowDock.park(app);await app.render({parts:['main']});await AdventurersTomeWindowDock.restore(app);});
  assert.equal(await page.evaluate(()=>app.renders),1);
  // Explicit navigation resumes the requested tab, including when a draft existed.
  await page.evaluate(async()=>{document.querySelector('textarea').value='another draft';await AdventurersTomeWindowDock.park(app);app.activeTab='world';await app.render({parts:['main']});});assert.equal(await page.evaluate(()=>app.renders),2);
  await page.evaluate(()=>AdventurersTomeWindowDock.park(app));await page.setViewportSize({width:680,height:700});await page.locator('[data-at-dock-restore]').click();await page.waitForFunction(()=>!app._atWindowDocked);
  const rect=await page.locator('#adventurers-tome-app').boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=681&&rect.y+rect.height<=701);
  await page.evaluate(()=>AdventurersTomeWindowDock.park(app));await page.locator('[data-at-dock-close]').click();assert.equal(await launcher.count(),1);assert.equal(await page.locator('[data-at-dock-close]').count(),0);assert.equal(await page.locator('#adventurers-tome-app').count(),0);assert.equal(await page.evaluate(()=>app.closes),1);
  // Real close during animation must never resurrect a bar or window.
  await page.evaluate(async()=>{globalThis.app=new Test();app._installWindowChromeControls();const pending=AdventurersTomeWindowDock.park(app);await app.close();await pending;});assert.equal(await page.locator('.at-window-dock').count(),0);assert.equal(await page.locator('[data-at-dock-close]').count(),0);assert.equal(await launcher.count(),1);assert.deepEqual(errors,[]);
  results.push({reducedMotion:reduced,existingLauncherOnly:true,dragWhileParked:true,rightClickPositionReset:true,keyboardRestore:true,animationUsesCurrentLauncherRectangle:true,drafts:true,scroll:true,position:true,deferredRefreshes:20,hiddenGeometryWrites:0,rapidRequests:true,explicitNavigation:true,viewportResize:true,realCloseCleanup:true});await page.close();
 }
 fs.writeFileSync(path.join(root,'../qa19-migration-checks/window-dock-qa416-results.json'),JSON.stringify(results,null,2));console.log('PASS: existing draggable launcher only; animation endpoints use its current rectangle before and after moving while parked; real launcher/render/chrome/teardown methods; draft/scroll/position retained; deferred refresh, rapid requests, explicit navigation, viewport resize, reduced motion and complete-close cleanup.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
