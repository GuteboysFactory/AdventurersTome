// Account mode uses Foundry's per-user storage. It is access control, not
// encryption against a person who can read the Foundry server's files.
export function createAccountVault({owner,allowed,read,write,legacy=async()=>({}),retire=async()=>{},merge=(a,b)=>({...a,...b}),changed=()=>{}}){
  let session=null,tail=Promise.resolve();const check=stamp=>{if(!allowed()||owner()!==stamp)throw Error('Vault account or permission changed.');};
  const unlocked=()=>Boolean(allowed()&&session===owner());
  function data(){const value=read();if(!value)return {version:1,owner:owner(),values:{}};if(value.version!==1||value.owner!==owner()||!value.values||typeof value.values!=='object')throw Error('Account Vault format or owner mismatch. Stored data has not been changed.');return structuredClone(value);}
  function mutate(fn){const stamp=owner(),job=tail.catch(()=>{}).then(async()=>{check(stamp);if(!unlocked())throw Error('Open your account Vault first.');const state=data();await fn(state);check(stamp);await write(state);check(stamp);if(!unlocked())throw Error('Vault was hidden while saving.');changed();});tail=job;return job;}
  async function unlock(){const stamp=owner();check(stamp);await tail.catch(()=>{});const incoming=await legacy();check(stamp);const state=data();state.values=merge(state.values,incoming);await write(state);check(stamp);session=stamp;await retire();check(stamp);changed();return true;}
  const get=name=>unlocked()?structuredClone(data().values[name]??'{}'):'{}';
  async function set(name,value){if(typeof value!=='string')throw Error('Vault values must be strings.');await mutate(state=>{state.values[name]=value;});return value;}
  async function importValues(values){await mutate(state=>{state.values=merge(state.values,values);});}
  function lock(){session=null;changed();}
  async function sealAttachment(id,bytes){const stamp=owner();check(stamp);if(!unlocked()||!/^[A-Za-z0-9_-]{16,64}$/.test(id))throw Error('Invalid private image or closed Vault.');const input=new Uint8Array(bytes);if(!input.length||input.length>2097152)throw Error('Private images must be at most 2 MB.');let binary='';for(let offset=0;offset<input.length;offset+=32768)binary+=String.fromCharCode(...input.subarray(offset,offset+32768));return {format:'tome-private-image-account',version:1,id,owner:stamp,data:btoa(binary)};}
  async function openAttachment(id,value){check(owner());if(!unlocked()||value?.format!=='tome-private-image-account'||value.version!==1||value.owner!==owner()||value.id!==id||typeof value.data!=='string'||value.data.length>2800000)throw Error('This private image does not belong to your account Vault.');return Uint8Array.from(atob(value.data),c=>c.charCodeAt(0)).buffer;}
  return {unlock,unlocked,get,set,importValues,lock,forget:async()=>lock(),refresh:async()=>{if(unlocked())data();},sealAttachment,openAttachment,exportValues:()=>{if(!unlocked())throw Error('Open Vault first.');return data().values;},status:()=>({configured:Boolean(read()),unlocked:unlocked(),owner:owner(),mode:'account'})};
}

export function createVaultAccess({encrypted,account,owner,allowed,modeRead,modeWrite,encryptedRead,changed=()=>{}}){
  const mode=()=>['account','encrypted'].includes(modeRead())?modeRead():encryptedRead()?'encrypted':'account';
  const active=()=>mode()==='account'?account:encrypted;
  const check=stamp=>{if(!allowed()||owner()!==stamp)throw Error('Vault account or permission changed.');};
  let switching=Promise.resolve();
  function useAccount({copyEncrypted=false}={}){
    const stamp=owner(),job=switching.catch(()=>{}).then(async()=>{
      check(stamp);if(copyEncrypted&&!encrypted.unlocked())throw Error('Unlock the previous encrypted Vault before moving its contents.');
      if(copyEncrypted)await encrypted.refresh();check(stamp);
      await account.unlock();check(stamp);
      const values=copyEncrypted?await encrypted.exportValues():null;check(stamp);
      if(values){
        // Private image bytes must move with the notes, not retain an envelope
        // that depends on the old password/key after switching modes.
        async function convert(value){
          if(value?.format==='tome-private-image'&&value.version===1){const bytes=await encrypted.openAttachment(value.id,value);check(stamp);return account.sealAttachment(value.id,bytes);}
          if(Array.isArray(value))return Promise.all(value.map(convert));
          if(value&&typeof value==='object'){const entries=await Promise.all(Object.entries(value).map(async([key,child])=>[key,await convert(child)]));return Object.fromEntries(entries);}
          return value;
        }
        const converted={};for(const [key,text]of Object.entries(values)){let value;try{value=JSON.parse(text);}catch{converted[key]=text;continue;}converted[key]=JSON.stringify(await convert(value));}
        await account.importValues(converted);check(stamp);
      }
      await modeWrite('account');check(stamp);encrypted.lock();await account.unlock();check(stamp);changed();return true;
    });switching=job;return job;
  }
  async function useEncrypted(){const stamp=owner();check(stamp);if(!encryptedRead())throw Error('There is no previous encrypted Vault.');await modeWrite('encrypted');check(stamp);account.lock();try{await encrypted.unlock(null,{device:true});}catch{encrypted.lock();}check(stamp);changed();return true;}
  const facade={useAccount,useEncrypted,status:()=>({...active().status(),mode:mode(),encryptedConfigured:Boolean(encryptedRead()),accountConfigured:account.status().configured})};
  for(const name of ['unlock','unlocked','get','set','lock','forget','refresh','sealAttachment','openAttachment','exportValues'])facade[name]=(...args)=>active()[name](...args);
  return Object.freeze(facade);
}
