export function createIndexDigestPool({owner,allowed,makeWorker=()=>new Worker(new URL('./index-digest-worker.js',import.meta.url),{type:'module',name:'Tome index fingerprints'}),idleMs=45000}={}){
 let worker=null,serial=0,idle=null,closed=false;const pending=new Map(),stats={jobs:0,failures:0,starts:0};
 const stop=error=>{clearTimeout(idle);idle=null;worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timeout);job.reject(error);}pending.clear();};
 function armIdle(){clearTimeout(idle);if(!pending.size)idle=setTimeout(()=>stop(Error('Idle index worker released.')),idleMs);}
 return Object.freeze({
  async digest(value,secure){
   if(closed||!allowed?.()||!owner?.())throw Error('Index fingerprint owner is unavailable.');const scope=owner();clearTimeout(idle);
   if(!worker){worker=makeWorker();stats.starts++;worker.onerror=e=>{stats.failures++;stop(Error(e.message||'Index fingerprint worker failed.'));};worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timeout);if(!allowed()||owner()!==job.scope)job.reject(Error('Index fingerprint owner changed.'));else if(data.error)job.reject(Error(data.error));else job.resolve(data.result);armIdle();};}
   if(pending.size>=64)throw Error('Index fingerprint queue is full.');stats.jobs++;
   return new Promise((resolve,reject)=>{const id=++serial,timeout=setTimeout(()=>{stats.failures++;stop(Error('Index fingerprint worker timed out.'));},30000);pending.set(id,{resolve,reject,timeout,scope});try{worker.postMessage({id,value,secure});}catch(error){pending.delete(id);clearTimeout(timeout);reject(error);armIdle();}});
  },
  dispose(){closed=true;stop(Error('Index fingerprint worker stopped.'));},status:()=>({...stats,pending:pending.size,resident:Boolean(worker),closed})
 });
}
