import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {performance} from 'node:perf_hooks';
import * as before from './frozen-runtime/scripts/testai-language-core.js';import * as after from '../scripts/testai-language-core.js';
const json=v=>JSON.parse(JSON.stringify(v));
test('Cooperative and synchronous language paths preserve every baseline field for varied names, choices and document roles',async()=>{
 const names=['Vaelira Norrwind','Och Edrik','Active','Quest Log','Bree','Orin Thorne','Tjommen','Dúnedain'];
 for(let n=0;n<96;n++){
  const name=names[n%names.length],text=`GM FireVisor\nQuest Log\nAnd ${name} arrived in Bree. Och ${name} gick hem. A scout named Active returned.`,words=[...text.matchAll(/[\p{L}’'-]+/gu)],tokens=words.map((m,i)=>({id:i+1,form:m[0],lemma:m[0].toLowerCase(),upos:/^\p{Lu}/u.test(m[0])?'PROPN':'VERB',start:m.index,end:m.index+m[0].length,head:0,deprel:'nsubj'})),catalog=[{uuid:'Actor.a',name,kind:'character',group:true},{uuid:'JournalEntry.b',name:'Bree',kind:'location'}],structure={blocks:[{start:0,end:26,kind:'metadata'},{start:26,end:text.length,kind:'narrative'}],spans:[{start:0,end:12,kind:'metadata'},{start:13,end:22,kind:'heading'}]},choice=s=>n%3===0&&s==='Active'?{action:'source-ignored'}:null;
  const expected=before.assessText(text,tokens,catalog,choice,structure);assert.deepEqual(json(after.assessText(text,tokens,catalog,choice,structure)),json(expected));assert.deepEqual(json(await after.assessTextAsync(text,tokens,catalog,choice,structure)),json(expected));
 }
});
test('Large protected-name scanning releases the event loop and returns identical spans',async()=>{
 const catalog=Array.from({length:1200},(_,i)=>({uuid:'Actor.'+i,name:'Vaelira Norrwind'+i,kind:'character'})),text='Vaelira Norrwind501 arrived. Vaelira Norrwind991 returned.';let yields=0;
 const result=await after.assessTextAsync(text,[],catalog,()=>null,{},async()=>{yields++;await new Promise(r=>setTimeout(r,0))});assert.ok(yields>0);assert.deepEqual(json(result),json(before.assessText(text,[],catalog)));
});
function reconciliation(candidate=false,source={entities:[],semanticOnly:[],unresolved:[]}){
 const api={discovery:{snapshot:()=>source}},ctx=vm.createContext({console,performance,Map,Set,Promise,game:{world:{id:'w'},user:{id:'gm'},system:{id:'test'}},foundry:{utils:{deepClone:structuredClone}},ATTestAI:{assertEnabled(){},modules:{get:()=>({api})}},window:{setTimeout,clearTimeout},Hooks:{on(){},once(){},callAll(){}}});
 vm.runInContext(fs.readFileSync(new URL(`${candidate?'..':'./frozen-runtime'}/scripts/universal-entity-reconciliation.js`,import.meta.url),'utf8'),ctx);return ctx;
}
test('Prepared name features preserve candidate ranking, thresholds and ambiguous outcomes',()=>{
 const old=reconciliation(),next=reconciliation(true),names=['Arantor','Arantors','Arantor Thorne','Arantar Thorne','Dúnedain','Dunedain','Anna Anna','Ananana','', 'Ab A', 'ABA','Alva-Nor','The Old Keeper'];
 const candidates=names.flatMap((name,n)=>['Actor','Item','JournalEntry'].map(type=>({name,key:type+n,canonicalUuid:type+'.'+n,state:n%2?'resolved':'compendium',kind:'npc',attributes:{location:n%3?'Bree':'Gate',culture:'test'},foundry:{documentName:type,folderPath:['Bree']}})));
 for(const name of names)for(const kind of ['person','location','item','faction','unknown']){
  const input={name,kind,attributes:{location:'Bree',culture:'test'}};assert.deepEqual(json(next.classify(input,candidates)),json(old.classify(input,candidates)));
 }for(const a of names)for(const b of names){assert.equal(next.diceSimilarity(a,b,new Map()),old.diceSimilarity(a,b));assert.equal(next.tokenSimilarity(a,b,new Map()),old.tokenSimilarity(a,b));}
});
test('Cooperative reconciliation publishes the same result and yields on a populated catalogue',async()=>{
 const source={entities:Array.from({length:400},(_,i)=>({name:'Vaelira Thorne '+i,canonicalUuid:'Actor.'+i,state:'resolved',foundry:{documentName:'Actor'},attributes:{culture:'test'}})),semanticOnly:Array.from({length:30},(_,i)=>({key:'q'+i,name:'Vaelira Thorne '+i,kind:'person',attributes:{culture:'test'}})),unresolved:[]},old=reconciliation(false,source),next=reconciliation(true,source);let yields=0;
 next.AdventurersTomeBackground={checkpoint:async()=>{yields++;await new Promise(r=>setTimeout(r,0))}};
 const a=await old.analyze(),b=await next.analyze();assert.deepEqual(json(b.results),json(a.results));assert.deepEqual(json(b.summary),json(a.summary));assert.ok(yields>0);
});
test('An owner change while scoring cannot publish old-world results',async()=>{
 const source={entities:Array.from({length:500},(_,i)=>({name:'Vaelira Thorne '+i,canonicalUuid:'Actor.'+i,state:'resolved',foundry:{documentName:'Actor'}})),semanticOnly:[{key:'q',name:'Vaelira Thorne',kind:'person'}]},ctx=reconciliation(true,source);let changed=false;
 ctx.AdventurersTomeBackground={checkpoint:async()=>{changed=true;ctx.game.world.id='other';}};assert.equal(await ctx.analyze(),null);assert.equal(ctx.snapshot(),null);assert.ok(changed);
});
