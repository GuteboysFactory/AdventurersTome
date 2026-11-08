// Production platform boundary; canonical document flags and UUIDs stay intact.
// ATTestAI is retained as an internal compatibility API for the tested runtime.
const ID='adventurers-tome',OLD='adventurers-tome-testai';
const pending=new Map(),receipts=new Map(),errors=[];let running=null;
const owner=()=>`${game.world?.id}|${game.userId||game.user?.id}`;
const conflict=()=>game.modules?.get(OLD)?.active===true;
function assertEnabled(){if(conflict())throw Error('Deactivate Adventurer’s Tome – TestAI before activating Adventurer’s Tome, then reload.');}
const receiptKey=scope=>`productionUpgradeV1_${scope}`;
function stored(namespace,key,scope){
 const storage=game.settings.storage.get(scope);
 return scope==='client'?storage.getItem(`${namespace}.${key}`)!==null:Boolean(storage.getSetting(`${namespace}.${key}`,scope==='user'?(game.userId||game.user?.id):null));
}
function receipt(scope){
 const token=`${owner()}|${scope}`;
 if(!receipts.has(token)){
  const key=receiptKey(scope);game.settings.register(ID,key,{scope,config:false,type:Object,default:{}});
  receipts.set(token,{...game.settings.get(ID,key)});
 }
 return receipts.get(token);
}
async function mark(scope,key){const done=receipt(scope);done[key]=true;await game.settings.set(ID,receiptKey(scope),{...done});}
function register(namespace,key,options){
 if(globalThis.AdventurersTomeVaultSecurity?.handles(namespace,key))return game.settings.register(namespace,key,options);
 if(namespace!==ID)return game.settings.register(namespace,key,options);
 const scope=['world','user'].includes(options.scope)?options.scope:'client',done=receipt(scope);
 game.settings.register(namespace,key,options);
 // Only saved test values transfer. Ordinary worlds keep their existing values.
 if(done[key]||!stored(OLD,key,scope))return;
 game.settings.register(OLD,key,{...options,config:false,onChange:undefined});
 let value=structuredClone(game.settings.get(OLD,key));
 if(key==='background'&&typeof value==='string'&&value.startsWith(`modules/${OLD}/assets/`))value=value.replace(`modules/${OLD}/assets/`,`modules/${ID}/assets/`);
 pending.set(key,{scope,value,owner:owner()});
}
const settings=new Proxy({},{get(_target,key){const target=game.settings;
 if(key==='register')return register;
 if(key==='get')return (namespace,name,...args)=>{
  if(globalThis.AdventurersTomeVaultSecurity?.handles(namespace,name))return globalThis.AdventurersTomeVaultSecurity.get(name);
  const entry=namespace===ID?pending.get(name):null;
  if(entry?.owner===owner()&&target.get(ID,receiptKey(entry.scope))?.[name]===true){pending.delete(name);return target.get(namespace,name,...args);}
  if(entry?.owner===owner()&&!args[0]?.document)return structuredClone(entry.value);
  return target.get(namespace,name,...args);
 };
 if(key==='set')return async(namespace,name,value,...args)=>{
  if(globalThis.AdventurersTomeVaultSecurity?.handles(namespace,name))return globalThis.AdventurersTomeVaultSecurity.set(name,value);
  const entry=namespace===ID?pending.get(name):null;
  const result=await target.set(namespace,name,value,...args);
  if(entry?.owner===owner()){pending.delete(name);await mark(entry.scope,name);}
  return result;
 };
 const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
}});
function migrateBrowserState(){
 // Copy only local records owned by this world and user; derived caches rebuild.
 const suffixes=[`world-tree-view.${owner()}`];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);
  if(key?.startsWith(OLD+'.')&&key.includes(game.world?.id)&&key.includes(game.userId||game.user?.id))suffixes.push(key.slice(OLD.length+1));
 }
 for(const suffix of new Set(suffixes)){
  const from=OLD+'.'+suffix,to=ID+'.'+suffix,marker=ID+'.upgraded-local.'+suffix,value=localStorage.getItem(from);
  if(value!==null&&localStorage.getItem(marker)!=='1'){localStorage.setItem(to,value);localStorage.setItem(marker,'1');}
 }
}
async function migrate(){
 if(running)return running;const expected=owner();
 running=(async()=>{
  assertEnabled();try{migrateBrowserState();}catch(error){errors.push(String(error.message||error));}
  for(const [key,entry] of pending){
   if(owner()!==expected||entry.owner!==expected)break;
   if(game.settings.get(ID,receiptKey(entry.scope))?.[key]===true){pending.delete(key);continue;}
   if(entry.scope==='world'&&(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id))continue;
   try{
    if(pending.get(key)!==entry)continue;
    await game.settings.set(ID,key,structuredClone(entry.value));
    if(pending.get(key)===entry)pending.delete(key);
    await mark(entry.scope,key);
   }catch(error){errors.push(`${key}: ${error.message||error}`);}
  }
  if(errors.length){ui.notifications.error('Tome could not finish transferring some test settings. Original data is preserved. See the console for details.',{permanent:true});console.error('Adventurer’s Tome | Upgrade transfer',errors);}
  return {pending:pending.size,errors:[...errors]};
 })();return running;
}
const modules=new Proxy({},{get(_target,key){if(key==='get')return id=>globalThis.game?.modules?.get(id);if(key==='has')return id=>globalThis.game?.modules?.has(id)||false;const target=globalThis.game?.modules;if(!target)return undefined;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
const socket=new Proxy({},{get(_target,key){const target=game.socket;if(!target)return undefined;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
globalThis.ATTestAI=Object.freeze({id:ID,dataNamespace:ID,modules,settings,socket,flags:document=>document,assertEnabled,get conflict(){return conflict();},upgrade:Object.freeze({run:migrate,status:()=>({pending:pending.size,errors:[...errors]})})});
Hooks.once('init',()=>{if(conflict()){ui.notifications.error('Deactivate Adventurer’s Tome – TestAI and reload. Only one Tome engine can run in a world.',{permanent:true});assertEnabled();}});
Hooks.once('ready',()=>{void migrate();});
assertEnabled();
