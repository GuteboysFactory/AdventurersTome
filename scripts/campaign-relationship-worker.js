// Receives authorized plain text and minimal identity roles; no storage,
// Foundry document instances, network fetches or canonical write API.
globalThis.Hooks={once(){},on(){}};
const moduleRecord={api:{}};
globalThis.game={user:{isGM:true},modules:new Map([['adventurers-tome',moduleRecord]])};
globalThis.ATTestAI={modules:game.modules,assertEnabled(){},flags:doc=>({getFlag:(_scope,key)=>doc?.flags?.['adventurers-tome']?.[key]})};
globalThis.foundry={utils:{deepClone:value=>structuredClone(value)}};
const initialized=(async()=>{
 await import('./language-packs/en.js');await import('./language-packs/sv.js');await import('./campaign-language-foundation.js');
 await import('./campaign-relationship-evidence.js');
})();
const collection=rows=>{const map=new Map(rows.map(row=>[row.id,row]));return {contents:rows,get:id=>map.get(id)};};
self.onmessage=async({data})=>{
 try{
  await initialized;
  const {input}=data,roles=input.roles;
  for(const [kind,key]of [['Actor','actors'],['Item','items'],['JournalEntry','journal'],['Scene','scenes']])game[key]=collection(roles.filter(row=>row.documentName===kind));
  const result=globalThis.AdventurersTomeRelationshipExtract(input.entry,input.page,input.kind,{text:input.text,aliases:new Map(input.aliases.map(([name,uuids])=>[name,new Set(uuids)]))});
  self.postMessage({id:data.id,result});
 }catch(error){self.postMessage({id:data.id,error:String(error?.message||error)});}
};
