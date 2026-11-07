// Legacy VM fixtures predate the isolated installation boundary. Supply the
// production pass-through facade, without changing their domain/API fixtures.
import vm from 'node:vm';
import * as learningScope from '../../scripts/analysis-learning-scope.mjs';
import * as digestPool from '../../scripts/index-digest-pool.mjs';
const create=vm.createContext;
vm.createContext=function(sandbox={},...args){
 const defaults={assertEnabled(){},flags:d=>d,get modules(){return sandbox.game?.modules;},get settings(){return sandbox.game?.settings;},get socket(){return sandbox.game?.socket;}};
 const supplied=sandbox.ATTestAI;
 sandbox.ATTestAI=Object.defineProperties(defaults,Object.getOwnPropertyDescriptors(supplied||{}));
 return create.call(this,sandbox,...args);
};
const run=vm.runInContext;
vm.runInContext=function(code,context,...args){
 // These VM suites load source text rather than using an ESM linker. New pure
 // dependencies are linked explicitly; the domain implementation is unchanged.
 code=code.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)['"];?\s*$/gm,(line,names,file)=>{
  const exports=({'analysis-learning-scope.mjs':learningScope,'index-digest-pool.mjs':digestPool})[file];
  if(!exports)return line;
  for(const name of names.split(',').map(s=>s.trim()))context[name]=exports[name];
  return '';
 });
 // A legacy test already supplies the real semantic catalog in its VM. Its
 // anchored import removal predates the installation guard at the file start.
 if(context.semanticCatalogEntry)code=code.replace(/^import\s*\{[^}]+\}\s*from\s*["']\.\/semantic-catalog\.js["'];?\s*/gm,'');
 return run.call(this,code,context,...args);
};
