import {createWorldKnowledge} from './world-knowledge-core.js';
const ID='adventurers-tome',EXTRAS='campaignWorldReferences',engine=createWorldKnowledge(),loaded=new Set();
const choices={none:'No background world pack',tolkien:'Tolkien — places, buildings and people'};
let current=null,currentSignature=null,flight=null,lastError='',generation=0;
const gm=()=>{if(!game.user?.isGM)throw Error('World reference analysis is GM-only.');};
const extrasRaw=()=>String(globalThis.ATTestAI.settings.get(ID,EXTRAS)||'');
async function ready(){
 gm();const selected=globalThis.ATTestAI.settings.get(ID,'worldKnowledgePack')||'none',extra=extrasRaw(),signature=selected+'\n'+extra;
 if(currentSignature===signature)return;
 if(flight?.signature===signature)return flight.promise;
 const previousRevision=engine.status().revision,turn=++generation;engine.select([]);current=null;currentSignature=null;
 const promise=Promise.resolve().then(async()=>{try{
  if(selected!=='none'&&!Object.hasOwn(choices,selected))throw Error('Unknown reference pack selection.');
  if(selected==='tolkien'&&!loaded.has(selected)){
   const response=await fetch(new URL('../data/world-packs/tolkien-places.json',import.meta.url));if(!response.ok)throw Error('Local world pack could not load.');
   const bytes=await response.text();if(bytes.length>2*1024*1024)throw Error('World pack exceeds size limit.');engine.register(JSON.parse(bytes));loaded.add(selected);
  }
  if(extra){const pack=JSON.parse(extra);if(pack.id!=='campaign'||pack.scope!=='campaign')throw Error('Invalid campaign references.');engine.register(pack,{allowCampaign:true});}
  if(turn!==generation||!game.user?.isGM)return;
  engine.select([...(selected==='none'?[]:[selected]),...(extra?['campaign']:[])]);current=selected;currentSignature=signature;lastError='';
  Hooks.callAll('adventurersTomeWorldLibraryReady');
  if(engine.status().revision!==previousRevision)globalThis.AdventurersTomeIndex?.request?.('world-reference-changed');
 }catch(error){if(turn===generation){lastError=String(error.message||error);current=selected;currentSignature=signature;engine.select([]);}}
 finally{if(flight?.promise===promise)flight=null;}});flight={signature,promise};return promise;
}
async function importCampaignPack(input){
 gm();if(!input||!/^[-a-z0-9]+$/u.test(input.id)||!Array.isArray(input.entries)||input.entries.length>500)throw Error('Choose a campaign reference JSON file with at most 500 entries.');
 const expected=extrasRaw(),previous=expected?JSON.parse(expected):{entries:[]},rows=new Map(previous.entries.map(row=>[row.id,row]));
 for(const row of input.entries)rows.set(input.id+':'+row.id,{...structuredClone(row),id:input.id+':'+row.id,scope:'campaign'});
 if(rows.size>500)throw Error('This campaign supports up to 500 local references.');
 const pack={id:'campaign',scope:'campaign',title:'Campaign references',version:String(Date.now()),languages:['en','sv'],entries:[...rows.values()]};
 createWorldKnowledge().register(pack,{allowCampaign:true});gm();
 if(extrasRaw()!==expected)throw Error('Campaign references changed while importing. Try again.');
 await globalThis.ATTestAI.settings.set(ID,EXTRAS,JSON.stringify(pack));await ready();return pack.entries.length;
}
async function clearCampaignPack(){gm();await globalThis.ATTestAI.settings.set(ID,EXTRAS,'');await ready();}
export const worldKnowledge=Object.freeze({ready,importCampaignPack,clearCampaignPack,lookup:text=>{gm();return engine.lookup(text);},mentions:text=>{gm();return engine.mentions(String(text));},status:()=>({...engine.status(),selection:current,loading:Boolean(flight),lastError})});
if(globalThis.Hooks){
 Hooks.once('init',()=>{
  globalThis.ATTestAI.settings.register(ID,'worldKnowledgePack',{name:'Tome background world knowledge',hint:'Choose once for this campaign. Tome reuses existing identities and automatically creates missing verified library entries when mentioned. Campaign facts and explicit GM decisions take priority.',scope:'world',config:true,type:String,choices,default:'none',onChange:()=>{if(game.user?.isGM)void ready();}});
  globalThis.ATTestAI.settings.register(ID,EXTRAS,{scope:'world',config:false,restricted:true,type:String,default:'',onChange:()=>{if(game.user?.isGM)void ready();}});
 });
 Hooks.once('ready',()=>{const m=game.modules.get(ID);if(m){m.api||={};m.api.worldKnowledge=worldKnowledge;}if(game.user?.isGM)void ready();});
 Hooks.on('updateUser',()=>{if(!game.user?.isGM){generation++;engine.select([]);current=null;currentSignature=null;}else void ready();});
}
