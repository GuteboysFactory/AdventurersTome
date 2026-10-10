// No Foundry documents, storage, network requests or canonical write API are
// supplied to this worker. Only the already-authorized page input is analysed.
const callbacks=[];
const moduleRecord={api:{}};
globalThis.Hooks={once:(event,fn)=>{if(event==='ready')callbacks.push(fn);},on(){}};
globalThis.game={modules:new Map([['adventurers-tome',moduleRecord]])};
globalThis.foundry={utils:{deepClone:structuredClone}};
globalThis.window={clearTimeout(){},setTimeout(){return 0;}};
const initialized=(async()=>{
await import('../vendor/compromise-14.17.0.js');
await import('./language-packs/en.js');
await import('./language-packs/sv.js');
await import('./campaign-language-foundation.js');
await import('./nlp-provider.js');
await import('./campaign-new-entity-discovery.js');
for(const callback of callbacks)callback();
})();
self.onmessage=async({data})=>{
  try { await initialized;self.postMessage({id:data.id,result:globalThis.AdventurersTomeAnalyzePage(data.payload)}); }
  catch(error) {self.postMessage({id:data.id,error:String(error?.message || error)});}
};
