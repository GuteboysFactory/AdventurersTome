// Cooperative pacing, not a CPU percentage limit. Callers must checkpoint
// inside their loops; one indivisible function may still exceed the budget.
export function createBackgroundPacer(env){
 const now=env.now,delay=ms=>new Promise(resolve=>env.setTimeout(resolve,ms));
 let readyAt=null,lastSlice=-Infinity,lastOpportunity=-Infinity,lastInput=-Infinity,stopped=false,releaseReady,framePending=false;
 const ready=new Promise(resolve=>{releaseReady=resolve;});
 const counters={waits:0,yields:0,asyncYields:0,frameOpportunities:0};
 const waitMs={},waitCounts={},callers={};
 function record(reason,ms){waitMs[reason]=(waitMs[reason]||0)+Math.max(0,ms);waitCounts[reason]=(waitCounts[reason]||0)+1;}
 async function wait(caller='work'){
  const entered=now();await ready;record('beforeReady',now()-entered);if(stopped)throw Error('Tome background work stopped.');
  // Always cross a timer boundary: never run a backlog in one microtask turn.
  do{const constraints=[['minimumPause',25],['startupGrace',(readyAt??now())-now()],['recentInput',lastInput+180-now()],['hidden',env.hidden?.()?1000:0],['dragging',env.busy?.()?250:0]];
   const [reason,ms]=constraints.reduce((best,row)=>row[1]>best[1]?row:best);const began=now();await delay(ms);
   const elapsed=now()-began;record(reason,Math.min(elapsed,ms));if(elapsed>ms)record('timerOverrun',elapsed-ms);
   if(stopped)throw Error('Tome background work stopped.');
   if(now()<readyAt||now()<lastInput+180||env.hidden?.()||env.busy?.())continue;
   if(env.idle){const began=now();await env.idle();record('idleCallback',now()-began);}if(stopped)throw Error('Tome background work stopped.');
  }while(now()<readyAt||now()<lastInput+180||env.hidden?.()||env.busy?.());
  lastSlice=lastOpportunity=now();counters.waits++;
  const label=['index-ready','index-launch'].includes(caller)?caller:'work';const row=callers[label]||={calls:0,elapsedMs:0};row.calls++;row.elapsedMs+=now()-entered;
 }
 async function checkpoint(){
  const urgent=stopped||readyAt===null||now()<readyAt||now()<lastInput+180||env.hidden?.()||env.busy?.();
  if(!urgent&&now()-lastSlice<4&&now()-lastOpportunity<32)return;
  counters.yields++;await wait();
 }
 function noteAsyncYield(){
  if(stopped)return;lastSlice=now();counters.asyncYields++;
  // Completed WebCrypto work has already released the JS thread. Do not
  // charge that wait as CPU time, but still require real frame/timer turns
  // so a rapid chain of resolved promises cannot starve input or painting.
  if(env.frame&&!framePending){framePending=true;env.frame(()=>{framePending=false;if(stopped)return;lastOpportunity=now();counters.frameOpportunities++;});}
 }
 function start(){if(readyAt!==null||stopped)return;readyAt=now()+3000;releaseReady();}
 return Object.freeze({start,wait,checkpoint,noteAsyncYield,interact(){lastInput=now();},stop(){stopped=true;releaseReady();},
  status:()=>({ready:readyAt!==null,stopped,startDelayMs:3000,sliceBudgetMs:4,minimumPauseMs:25,maximumTurnMs:32,...counters,waitMs:{...waitMs},waitCounts:{...waitCounts},callers:structuredClone(callers)})});
}

if(globalThis.Hooks&&globalThis.game&&!globalThis.AdventurersTomeBackground){
 let dragging=false;
 const pacer=createBackgroundPacer({now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),
  hidden:()=>document.visibilityState==='hidden',
  busy:()=>dragging,
  frame:globalThis.requestAnimationFrame?fn=>requestAnimationFrame(fn):undefined,
  idle:globalThis.requestIdleCallback?()=>new Promise(resolve=>requestIdleCallback(resolve,{timeout:1000})):undefined});
 globalThis.AdventurersTomeBackground=pacer;
 const input=()=>pacer.interact();
 const down=event=>{if(event.button===0)dragging=true;input();},up=()=>{dragging=false;input();};
 for(const event of ['pointerdown','keydown','wheel'])document.addEventListener(event,input,{capture:true,passive:true});
 document.addEventListener('pointerdown',down,{capture:true,passive:true});
 for(const event of ['pointerup','pointercancel'])document.addEventListener(event,up,{capture:true,passive:true});
 globalThis.addEventListener?.('blur',up);
 Hooks.once('ready',()=>{
  // Ready has fired; let Foundry paint before starting the quiet grace period.
  if(globalThis.requestAnimationFrame)requestAnimationFrame(()=>requestAnimationFrame(()=>pacer.start()));
  else setTimeout(()=>pacer.start(),0);
 });
 Hooks.once('shutdown',()=>{pacer.stop();for(const event of ['pointerdown','keydown','wheel'])document.removeEventListener(event,input,true);document.removeEventListener('pointerdown',down,true);for(const event of ['pointerup','pointercancel'])document.removeEventListener(event,up,true);globalThis.removeEventListener?.('blur',up);});
}
