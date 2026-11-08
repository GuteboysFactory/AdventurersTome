import {createPrivateVaultStore} from './private-vault-store.mjs';
const ID='adventurers-tome',keys=['gmContextualPrivateVaultV2','gmPrivateVault'];
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const owner=()=>`${game.world?.id}|${game.user?.id}`,allowed=()=>game.user?.isGM===true&&(!globalThis.AdventurersTomeVaultSecurity||globalThis.AdventurersTomeVaultSecurity.unlocked());
const flag=(d,key)=>globalThis.ATTestAI.flags(d)?.getFlag?.(ID,key);
let aliasIndex=null,aliasBuilds=0;
function actorFor(journal){
 const p=flag(journal,'worldProfile')||{};
 if(p.category&&!['npc','pc','character','contact'].includes(p.category))return null;
 const uuid=String(flag(journal,'backendProjectionV1')?.sourceUuid||flag(journal,'semanticProjection')?.linkedUuid||flag(journal,'quickImportSourceUuid')||p.sourceUuid||(p.actorId?'Actor.'+p.actorId:''));
 const m=/^Actor\.([^.]+)$/.exec(uuid);return m?game.actors?.get(m[1])||null:null;
}
function canonical(input){
 let d=input?.document||input;
 if(d?.documentName==='Token')return d.baseActor||game.actors?.get(d.actorId)||null;
 if(d?.documentName==='Actor'){if(d.isToken||d.parent?.documentName==='Token')return d.token?.baseActor||d.parent?.baseActor||null;return game.actors?.get(d.id)||null;}
 const collections={JournalEntry:game.journal,Item:game.items,Scene:game.scenes};
 d=collections[d?.documentName]?.get(d?.id);if(d?.documentName==='JournalEntry')return actorFor(d)||d;return d||null;
}
function aliases(d){
 if(d.documentName!=='Actor')return [];
 if(!aliasIndex){aliasIndex=new Map();aliasBuilds++;for(const j of game.journal?.contents||[]){const a=actorFor(j);if(a){const rows=aliasIndex.get(a.uuid)||[];rows.push(j);aliasIndex.set(a.uuid,rows);}}}
 return aliasIndex.get(d.uuid)||[];
}
function invalidate(){aliasIndex=null;api()?.privateVault?.invalidate();}
Hooks.once('ready',()=>{
 const module=globalThis.ATTestAI.modules.get(ID);if(!module)return;module.api||={};
 module.api.privateVault=createPrivateVaultStore({owner,allowed,canonical,aliases,
  read:key=>globalThis.ATTestAI.settings.get(ID,key),write:(key,value)=>globalThis.ATTestAI.settings.set(ID,key,value),
  id:()=>foundry.utils.randomID(16),changed:data=>Hooks.callAll('adventurersTomePrivateNotesChanged',data)});
 module.api.privateVaultDiagnostics=()=>({...module.api.privateVault.stats(),aliasBuilds});
 module.api.privateVaultEntries=()=>{
  if(!allowed())return [];const vault=JSON.parse(globalThis.ATTestAI.settings.get(ID,keys[0])||'{}'),legacy=JSON.parse(globalThis.ATTestAI.settings.get(ID,keys[1])||'{}');
  const refs=new Set(Object.keys(vault.records||{}));const names={actor:'Actor',journalentry:'JournalEntry',item:'Item',scene:'Scene'};for(const k of Object.keys(legacy)){const [type,id]=k.split(':');if(names[type])refs.add(names[type]+'.'+id);}
  const collections={Actor:game.actors,JournalEntry:game.journal,Item:game.items,Scene:game.scenes},seen=new Set(),out=[];
  for(const uuid of refs){const [type,id,...extra]=uuid.split('.');if(extra.length)continue;const source=collections[type]?.get(id),target=source&&canonical(source),key=target?.uuid||uuid;if(seen.has(key))continue;seen.add(key);const rec=target?module.api.privateVault.record(target):vault.records?.[uuid];if(rec?.notes?.length)out.push({uuid:key,document:target,missing:!target,name:target?.name||rec.nameSnapshot||'Unavailable source',kind:target?.documentName||type,notes:rec.notes,updatedAt:rec.updatedAt||0});}
  return out.sort((a,b)=>a.name.localeCompare(b.name));
 };
});
for(const hook of ['createJournalEntry','updateJournalEntry','deleteJournalEntry','deleteActor','updateWorld','updateUser'])Hooks.on(hook,invalidate);
Hooks.on('updateSetting',setting=>{if(keys.includes(String(setting?.key||'').split('.').slice(1).join('.')))api()?.privateVault?.invalidate();});
