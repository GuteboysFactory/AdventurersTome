// Compute only. Foundry document access and commits stay with the caller.
export function createRelationshipWorker({createWorker,allowed,owner,setTimeout:later=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout:cancel=id=>globalThis.clearTimeout(id)}){
 let worker=null,serial=0,idle=null;const pending=new Map();
 function stop(reason='Relationship analysis stopped.'){
  cancel(idle);idle=null;worker?.terminate();worker=null;
  for(const job of pending.values()){cancel(job.timeout);job.reject(Error(reason));}pending.clear();
 }
 async function extract(input){
  if(!allowed())throw Error('Relationship analysis requires current GM access.');
  const stamp=owner();cancel(idle);
  if(!worker){worker=createWorker();worker.onerror=event=>stop(event.message||'Relationship worker failed.');worker.onmessage=({data})=>{
   const job=pending.get(data.id);if(!job)return;pending.delete(data.id);cancel(job.timeout);
   if(!allowed()||owner()!==job.owner)job.reject(Error('Relationship analysis owner changed.'));
   else if(data.error)job.reject(Error(data.error));else job.resolve(data.result);
   if(!pending.size)idle=later(()=>stop(),45000);
  };}
  return new Promise((resolve,reject)=>{const id=++serial;
   pending.set(id,{resolve,reject,owner:stamp,timeout:later(()=>stop('Relationship analysis timed out. Retry from Index.'),60000)});
   try{worker.postMessage({id,input});}catch(error){stop(error.message);}
  });
 }
 return Object.freeze({extract,stop,status:()=>({running:pending.size>0,pending:pending.size,loaded:Boolean(worker)})});
}
if(globalThis.game&&globalThis.Hooks){
 const client=createRelationshipWorker({createWorker:()=>new Worker(new URL('./campaign-relationship-worker.js',import.meta.url),{type:'module',name:'Tome relationship analysis'}),
  allowed:()=>Boolean(game.user?.isGM)&&!globalThis.ATTestAI?.conflict,owner:()=>`${game.world?.id}:${game.user?.id}`});
 globalThis.AdventurersTomeRelationshipWorker=Object.freeze({...client,available:()=>typeof Worker==='function'&&Boolean(game.user?.isGM)});
 Hooks.on('updateUser',()=>{if(!game.user?.isGM)client.stop('GM access changed.');});Hooks.once('shutdown',()=>client.stop());
}
