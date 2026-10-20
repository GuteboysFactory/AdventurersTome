// Park the live Tome DOM instead of closing it: drafts and scroll stay in place.
const atWindowDocks=new WeakMap();
function atDockHasDraft(element) {
  if(element.querySelector('[contenteditable="true"],[data-at-af-editing="true"],[data-at-ep-editing="true"]'))return true;
  return [...element.querySelectorAll('input,textarea,select')].some(node=>{
    if(node.type==='hidden'||node.disabled)return false;
    if(node.type==='checkbox'||node.type==='radio')return node.checked!==node.defaultChecked;
    if(node.tagName==='SELECT')return [...node.options].some(option=>option.selected!==option.defaultSelected)&&node.value!==([...node.options].find(option=>option.defaultSelected)||node.options[0])?.value;
    return node.value!==node.defaultValue;
  });
}
function atDockNavigationChanged(app) {
  const state=atWindowDocks.get(app);
  return Boolean(state&&state.navigation!==JSON.stringify(app._captureNavigationState?.()||{activeTab:app.activeTab}));
}
async function atDockAnimate(state,reverse=false) {
  const root=state.element,from=root.getBoundingClientRect(),to=state.launcher.getBoundingClientRect();
  if(!root.animate||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!from.width||!from.height||!to.width||!to.height)return;
  const small={transformOrigin:'top left',transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:.25};
  const large={transformOrigin:'top left',transform:'translate(0,0) scale(1,1)',opacity:1};
  const animation=root.animate(reverse?[small,large]:[large,small],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  state.animation=animation;
  try{await animation.finished;}catch(_error){/* A real close cancels an in-flight animation. */}
  finally{animation.cancel();if(state.animation===animation)state.animation=null;}
}
function atDockLauncherMoved(launcher) {
  const close=document.getElementById('adventurers-tome-launcher-close');
  if(!close||close.hidden||!launcher?.isConnected)return;
  const rect=launcher.getBoundingClientRect();
  close.style.left=`${rect.right-32}px`;close.style.top=`${rect.top+(rect.height-28)/2}px`;
}
function atDockLauncherState(state,parked) {
  const launcher=state.launcher;
  launcher.classList.toggle('at-launcher-parked',parked);
  state.close.hidden=!parked;
  if(parked){launcher.dataset.atDockRestore='';launcher.title='Restore Adventurer’s Tome · Drag to move';launcher.setAttribute('aria-label','Restore Adventurer’s Tome');}
  else{delete launcher.dataset.atDockRestore;launcher.title=state.title;if(state.label===null)launcher.removeAttribute('aria-label');else launcher.setAttribute('aria-label',state.label);}
  launcher._atRefreshPosition?.();atDockLauncherMoved(launcher);
}
function atDockAttach(app) {
  const element=app?.element,header=element?.querySelector?.('.window-header');if(!header)return;
  let state=atWindowDocks.get(app);
  if(state?.element===element)return state;
  if(state)atDockDispose(app);
  const launcher=document.getElementById('adventurers-tome-launcher');if(!launcher)return;
  const closeButton=document.createElement('button');closeButton.id='adventurers-tome-launcher-close';closeButton.type='button';closeButton.hidden=true;closeButton.dataset.atDockClose='';
  closeButton.title='Close Tome completely';closeButton.setAttribute('aria-label','Close Tome completely');closeButton.innerHTML='<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  launcher.after(closeButton);
  state={element,launcher,close:closeButton,title:launcher.title,label:launcher.getAttribute('aria-label'),operation:null,disposed:false,focus:null};atWindowDocks.set(app,state);
  state.onClick=event=>{
    const close=event.target.closest?.('[data-action="close"],.close');
    if(!close||close.closest('.window-header')!==header)return;
    event.preventDefault();event.stopImmediatePropagation();
    void atDockPark(app).catch(error=>console.warn('Adventurer’s Tome | Could not minimize',error));
  };
  header.addEventListener('click',state.onClick,true);state.header=header;
  const close=header.querySelector('[data-action="close"],.close');
  if(close){close.title='Minimize Adventurer’s Tome';close.setAttribute('aria-label','Minimize Adventurer’s Tome');close.dataset.tooltip='Minimize Adventurer’s Tome';}
  closeButton.onclick=()=>{void app.close({animate:false});};
  return state;
}
function atDockPark(app) {
  const state=atDockAttach(app);if(!state||state.disposed)return Promise.resolve(app);
  if(state.operation)return state.operation;
  if(app._atWindowDocked)return Promise.resolve(app);
  state.focus=state.element.contains(document.activeElement)?document.activeElement:null;
  state.position={...app.position};state.draft=atDockHasDraft(state.element);
  state.navigation=JSON.stringify(app._captureNavigationState?.()||{activeTab:app.activeTab});
  app._atWindowDocked=true;
  clearTimeout(app._windowStateTimer);clearTimeout(app.__atAdaptiveWindowFitTimer);clearTimeout(app.__atViewportResizeTimer);
  state.element.inert=true;atDockLauncherState(state,true);
  state.operation=(async()=>{
    await atDockAnimate(state);
    if(!state.disposed){state.element.classList.add('at-window-docked');if(globalThis.ui?.activeWindow===app)ui.activeWindow=null;state.launcher.focus({preventScroll:true});}
    return app;
  })().finally(()=>state.operation=null);
  return state.operation;
}
async function atDockRestore(app) {
  const state=atWindowDocks.get(app);if(!state||state.disposed)return app;
  if(state.operation){await state.operation;return atDockRestore(app);}
  if(!app._atWindowDocked||state.disposed)return app;
  state.operation=(async()=>{
    state.element.classList.remove('at-window-docked');
    // Preserve the normal rectangle; only constrain it when the screen shrank.
    const p=state.position,w=window.innerWidth,h=window.innerHeight;
    if(Number(p.width)>w-16||Number(p.height)>h-32||Number(p.left)+Number(p.width)>w||Number(p.top)+Number(p.height)>h){
      const width=Math.min(Number(p.width)||w-16,w-16),height=Math.min(Number(p.height)||h-32,h-32);
      app.setPosition({width,height,left:Math.max(0,Math.min(Number(p.left)||0,w-width)),top:Math.max(0,Math.min(Number(p.top)||0,h-height))});
    }
    await atDockAnimate(state,true);if(state.disposed)return app;
    app._atWindowDocked=false;state.element.inert=false;atDockLauncherState(state,false);
    app.bringToFront?.();app._syncResponsiveState?.();
    const navigated=atDockNavigationChanged(app);
    if(navigated||(app._atDockRefreshPending&&!state.draft&&!atDockHasDraft(state.element))){
      app._atDockRefreshPending=false;await app.render({parts:['main']});
    }
    if(state.focus?.isConnected)state.focus.focus({preventScroll:true});
    else state.header.querySelector('[data-action="close"],.close')?.focus({preventScroll:true});
    return app;
  })().finally(()=>state.operation=null);
  return state.operation;
}
function atDockDispose(app) {
  const state=atWindowDocks.get(app);if(!state)return;
  state.disposed=true;state.animation?.cancel();state.header.removeEventListener('click',state.onClick,true);
  atDockLauncherState(state,false);state.close.remove();state.element.inert=false;state.element.classList.remove('at-window-docked');
  app._atWindowDocked=false;app._atDockRefreshPending=false;atWindowDocks.delete(app);
}
globalThis.AdventurersTomeWindowDock=Object.freeze({attach:atDockAttach,park:atDockPark,restore:atDockRestore,dispose:atDockDispose,navigationChanged:atDockNavigationChanged,launcherMoved:atDockLauncherMoved});
