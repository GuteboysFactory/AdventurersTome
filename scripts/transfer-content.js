/* Shared transfer routing. Existing text import/export engines remain authoritative. */
(() => {
  function detect(text){
    const trimmed=String(text).trim();
    if(!trimmed)throw Error('Choose a file or paste content first.');
    if(/^[\[{]/.test(trimmed)){
      let data;try{data=JSON.parse(trimmed);}catch{throw Error('The JSON file is incomplete or invalid.');}
      if(data.format==='tome-chronicle-transfer')return 'chronicle';
      if(data.format==='tome-gm-private-transfer')return 'gm-private';
      if(data.schema==='adventurers-tome.backup')return 'archive';
      return 'content';
    }
    return 'content';
  }
  function create(env){
    const plans=new WeakMap(),gm=()=>{if(!env.user()?.isGM)throw Error('Only a GM can transfer campaign content.');};
    function preview(text,name='',mode='auto'){
      gm();const type=detect(text);if(type==='chronicle')throw Error('This is a personal Chronicle file. Import it on its mapped player account.');
      if(type==='gm-private')throw Error('Use the GM Notes & Vault restore preview for this file.');
      if(type==='archive')throw Error('This older GM archive is a backup/reference file, not a restorable campaign package. Use a campaign ZIP to move a world.');
      const plan=env.api().previewImport({text,sourceName:name,mode});plans.set(plan,{preview:structuredClone(plan),revision:env.revision()});return plan;
    }
    async function apply(plan,choices={},links={},options={}){
      gm();const saved=plans.get(plan);if(!saved)throw Error('Preview the content before importing.');
      if(saved.revision!==env.revision())throw Error('Campaign content changed after preview. Preview again before importing.');
      for(const row of saved.preview.entries){const action=choices[row.key]||row.defaultAction;if(!['create','update','skip'].includes(action)||action==='update'&&!row.canUpdate)throw Error('Invalid content import choice.');choices[row.key]=action;}
      for(const row of saved.preview.links||[]){const action=links[row.key]||'skip';if(!['apply','skip'].includes(action)||action==='apply'&&!row.resolved)throw Error('Invalid link choice.');links[row.key]=action;}
      // Consume the preview before a write; repeated clicks cannot replay a transaction.
      plans.delete(plan);return env.api().applyImport(structuredClone(saved.preview),choices,links,options);
    }
    function exportContent(kind){gm();if(!['portable','player-safe','backup'].includes(kind))throw Error('Choose an export type.');return kind==='backup'?env.api().exportBackup():env.api().exportPortable({playerSafe:kind==='player-safe'});}
    return Object.freeze({preview,apply,exportContent,history:()=>{gm();return env.api().getImportHistory();},undo:()=>{gm();return env.api().undoLastImport();}});
  }
  globalThis.AdventurersTomeTransferContent=Object.freeze({detect,create});
})();
