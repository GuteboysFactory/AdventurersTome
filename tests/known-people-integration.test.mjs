import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ID='adventurers-tome',Hooks={once(){},on(){}},guard={assertEnabled(){},flags:d=>d};
test('An exact existing Actor-backed basic card bypasses the new-identity prompt; unresolved references do not',()=>{
 const actor={id:'npc',uuid:'Actor.npc',documentName:'Actor',type:'npc',name:'Known NPC'},context=vm.createContext({console,Hooks,ATTestAI:guard,game:{user:{isGM:true},actors:{get:id=>id==='npc'?actor:null,contents:[actor]},items:{contents:[]},journal:{contents:[]}}});vm.runInContext(fs.readFileSync(new URL('../scripts/identity-conflicts.js',import.meta.url),'utf8'),context);
 context.data={name:'Known NPC',flags:{[ID]:{worldProfile:{category:'npc'},knownPersonV1:{actorUuid:'Actor.npc'}}}};assert.equal(vm.runInContext("managed(data,{},'JournalEntry')",context),true);context.data.flags[ID].knownPersonV1.actorUuid='Actor.missing';assert.equal(vm.runInContext("managed(data,{},'JournalEntry')",context),false);
});
test('Formatted authoring preserves secret containers while allowing ordinary formatting',()=>{
 const text=value=>({nodeType:3,textContent:value}),node=(name,children,secret=false)=>({nodeType:1,localName:name,childNodes:children,matches:()=>secret});
 const content=[node('p',[text('Public story')]),node('section',[node('p',[text('@UUID[Actor.hidden]{Private name}')])],true)],context=vm.createContext({console,Hooks,ATTestAI:guard,DOMParser:class{parseFromString(){return {body:{childNodes:content}};}}});vm.runInContext(fs.readFileSync(new URL('../scripts/campaign-authoring-v2.js',import.meta.url),'utf8'),context);const result=vm.runInContext("formattedBodyToHtml('input')",context);assert.match(result,/<p>Public story<\/p>/);assert.match(result,/<section class="secret"><p>&#64;UUID\[Actor.hidden\]\{Private name\}<\/p><\/section>/);
});
