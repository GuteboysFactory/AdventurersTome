import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync(new URL('../../scripts/adventurers-tome.js',import.meta.url),'utf8');
// Exercise Tome's actual vault accessors with Foundry-style per-user settings.
export function installPrivateFacts(w) {
 const scopes=new Map(),base={...w.game.settings};
 const keyFor=key=>scopes.get(key)==='user'?`${w.game.user.id}|${key}`:key;
 w.game.settings.register=(module,key,options)=>{scopes.set(key,options.scope);base.register(module,keyFor(key),options);};
 w.game.settings.get=(module,key)=>base.get(module,keyFor(key));
 w.game.settings.set=(module,key,value)=>base.set(module,keyFor(key),value);
 w.game.settings.register('adventurers-tome','gmPrivateVault',{scope:'user',default:'{}'});
 w.context.safeJSONParse=(value,fallback)=>{try{return JSON.parse(value);}catch{return fallback;}};
 w.context.normalizeGmNote=value=>structuredClone(value);
 const body=main.slice(main.indexOf('function privateVaultKey('),main.indexOf('function publicAccessData('));
 vm.runInContext(`{const PRIVATE_VAULT_SETTING='gmPrivateVault';${body}
 game.modules.get('adventurers-tome').api.privateFactStore={read:doc=>getPrivateOverlay(doc).facts,write:(doc,facts)=>setPrivateOverlay(doc,{facts})};}`,w.context);
 const once=w.context.Hooks.once;
 w.context.Hooks.once=(name,callback)=>name==='init'?callback():once(name,callback);
 return scopes;
}
