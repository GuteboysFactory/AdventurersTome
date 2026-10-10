import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../scripts/view-continuity.js',import.meta.url),'utf8'),context);
const api=context.AdventurersTomeViewContinuity;
class Node {
  constructor(tag,attrs={}) {this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.dataset={};this.style={};this.scrollTop=0;this.scrollLeft=0;this.id=attrs.id||'';this.height=200;}
  get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}));}
  getAttribute(name){return this.attrs[name]??null;}
  setAttribute(name,value){this.attrs[name]=value;}
  get classList(){return {contains:value=>(this.attrs.class||this.className||'').split(' ').includes(value)};}
  add(node){node.parent=this;node.ownerDocument=this.ownerDocument;this.children.push(node);return node;}
  append(...nodes){for(const node of nodes)this.add(node);}
  querySelectorAll(selector){const nodes=this.children.flatMap(node=>[node,...node.querySelectorAll('*')]);return selector==='*'?nodes:nodes.filter(node=>selector==='[data-at-review-key]'&&node.dataset.atReviewKey);}
  querySelector(selector){return this.querySelectorAll('*').find(node=>selector==='.at-guided-decision-list'&&node.classList.contains('at-guided-decision-list'))||null;}
  closest(){return this.dataset.atReviewKey?this:this.parent?.closest()||null;}
  matches(selector){if(selector.includes('[data-action]'))return ['ARTICLE','LI','TR','H2','H3','H4'].includes(this.tagName)||!!this.attrs['data-action'];if(selector.includes('input[type='))return this.tagName==='INPUT'&&['checkbox','radio'].includes(this.attrs.type);return this.tagName==='TEXTAREA'||this.tagName==='INPUT'&&!['file','checkbox','radio'].includes(this.attrs.type);}
  focus(options){this.ownerDocument.activeElement=this;this.focusOptions=options;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  contains(node){return this.children.some(child=>child===node||child.contains(node));}
  getBoundingClientRect(){let top=this.layoutTop||0;for(let parent=this.parent;parent;parent=parent.parent)top-=parent.scrollTop;return {height:this.height,top};}
  get nextElementSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1];}
  insertBefore(node,next){node.parent=this;node.ownerDocument=this.ownerDocument;const index=this.children.indexOf(next);this.children.splice(index<0?this.children.length:index,0,node);}
}
function surface() {
  const root=new Node('main',{id:'main'}),doc={activeElement:null,createElement:tag=>{const node=new Node(tag);node.ownerDocument=doc;return node;}};root.ownerDocument=doc;
  const scroll=root.add(new Node('section',{class:'at-content'}));
  const details=scroll.add(new Node('details',{id:'facts'}));details.open=false;
  const input=scroll.add(new Node('textarea',{name:'notes'}));input.value=input.defaultValue='saved';input.selectionStart=0;input.selectionEnd=0;
  return {root,scroll,details,input,doc};
}
test('Whole Tome refresh preserves nested scrolling, details, draft typing and caret without writing campaign data',()=>{
  const old=surface();old.root.scrollLeft=5;old.scroll.scrollTop=640;old.details.open=true;old.input.value='unsaved draft';old.input.selectionStart=3;old.input.selectionEnd=8;old.input.focus();
  const state=api.capture(old.root),next=surface();api.restore(next.root,state);
  assert.equal(next.scroll.scrollTop,640);assert.equal(next.root.scrollLeft,5);assert.equal(next.details.open,true);
  assert.equal(next.input.value,'unsaved draft');assert.equal(next.doc.activeElement,next.input);assert.equal(next.input.selectionStart,3);assert.equal(next.input.selectionEnd,8);assert.equal(next.input.focusOptions.preventScroll,true);
});
test('Saved values are refreshed, and initial renders/navigation do not restore another view',async()=>{
  const old=surface(),next=surface();next.input.value='new saved document value';api.restore(next.root,api.capture(old.root));assert.equal(next.input.value,'new saved document value');
  const source=fs.readFileSync(new URL('../scripts/adventurers-tome.js',import.meta.url),'utf8');
  const method=source.slice(source.indexOf('  async _renderHTML('),source.indexOf('  async _onRender('));
  context.Base=class {async _renderHTML(){return 'html';}};
  vm.runInContext(`globalThis.App=class extends Base {${method}}`,context);
  const app=new context.App();app.element=old.root;let route='world';app._captureNavigationState=()=>({activeTab:route});
  await app._renderHTML();assert.equal(app._viewContinuity,null);
  old.scroll.scrollTop=320;await app._renderHTML();assert.ok(app._viewContinuity);app.element=next.root;api.restore(app.element,app._viewContinuity);assert.equal(next.scroll.scrollTop,320);
  route='sessions';await app._renderHTML();assert.equal(app._viewContinuity,null);
});
test('A resolved Review card disappears without a placeholder; Undo can restore the real card',()=>{
  const old=surface(),list=old.scroll.add(new Node('div',{class:'at-guided-decision-list'}));
  const card=key=>{const node=new Node('article',{'data-at-review-key':key,class:'at-guided-decision-card'});node.dataset.atReviewKey=key;return node;};
  list.add(card('session|Tala'));list.add(card('session|Rhea'));list.add(card('session|Amber'));
  const state=api.capture(old.root,'session|Rhea'),next=surface(),newList=next.scroll.add(new Node('div',{class:'at-guided-decision-list'}));newList.add(card('session|Tala'));newList.add(card('session|Amber'));
  api.restore(next.root,state);assert.deepEqual(newList.children.map(node=>node.dataset.atReviewKey),['session|Tala','session|Amber']);
  const undone=surface(),undoList=undone.scroll.add(new Node('div',{class:'at-guided-decision-list'}));for(const key of ['session|Tala','session|Rhea','session|Amber'])undoList.add(card(key));
  api.restore(undone.root,api.capture(next.root));assert.equal(undoList.children.length,3);assert.ok(!undoList.children[1].classList.contains('at-completed-decision-slot'));
});
test('Removal by another update does not falsely show a saved decision',()=>{
  const old=surface(),list=old.scroll.add(new Node('div',{class:'at-guided-decision-list'})),card=list.add(new Node('article'));card.dataset.atReviewKey='session|deleted';
  const next=surface(),newList=next.scroll.add(new Node('div',{class:'at-guided-decision-list'}));api.restore(next.root,api.capture(old.root));assert.equal(newList.children.length,0);
});

test('Unsaved select and checkbox choices survive a background update',()=>{
 const old=surface(),select=old.scroll.add(new Node('select',{name:'type'}));select.options=[{value:'person',selected:false,defaultSelected:true},{value:'location',selected:true,defaultSelected:false}];
 const check=old.scroll.add(new Node('input',{name:'enabled',type:'checkbox'}));check.checked=true;check.defaultChecked=false;
 const next=surface(),newSelect=next.scroll.add(new Node('select',{name:'type'}));newSelect.options=[{value:'person',selected:true,defaultSelected:true},{value:'location',selected:false,defaultSelected:false}];
 const newCheck=next.scroll.add(new Node('input',{name:'enabled',type:'checkbox'}));newCheck.checked=false;newCheck.defaultChecked=false;
 api.restore(next.root,api.capture(old.root));assert.equal(newSelect.options[1].selected,true);assert.equal(newSelect.options[0].selected,false);assert.equal(newCheck.checked,true);
});

test('A background change above the viewport keeps the same visible content landmark',()=>{
 const old=surface();old.scroll.scrollTop=640;const heading=old.scroll.add(new Node('h2',{id:'relationships'}));heading.layoutTop=800;
 const state=api.capture(old.root),next=surface(),newHeading=next.scroll.add(new Node('h2',{id:'relationships'}));newHeading.layoutTop=920;
 api.restore(next.root,state);assert.equal(next.scroll.scrollTop,760);assert.equal(newHeading.getBoundingClientRect().top,160);
});

test('Runtime enhancer classes and data guards do not change scroll or details identity',()=>{
 const old=surface();old.scroll.attrs.class+=' at-ca2-primary-workspace';old.scroll.attrs['data-at-a3-tree-ready']='true';
 old.details.attrs['data-at-bound']='true';old.scroll.scrollTop=520;old.details.open=true;
 const next=surface();api.restore(next.root,api.capture(old.root));assert.equal(next.scroll.scrollTop,520);assert.equal(next.details.open,true);
});

function delayedSurface() {
 const w=surface(),frames=new Map(),timers=new Map(),listeners=new Map();let serial=0,mutation;
 w.root.addEventListener=(event,fn)=>listeners.set(event,fn);w.root.removeEventListener=event=>listeners.delete(event);
 w.doc.defaultView={MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){mutation=null;}},
  requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 w.mutate=()=>mutation?.();w.flush=()=>{const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();};
 w.interact=event=>listeners.get(event)?.();w.expire=()=>{for(const fn of [...timers.values()])fn();timers.clear();};
 return w;
}

test('Delayed component replacement preserves scroll and open details after initial render',()=>{
 const old=surface();old.scroll.scrollTop=720;old.details.open=true;const state=api.capture(old.root),next=delayedSurface();
 api.restoreSettled(next.root,state);assert.equal(next.scroll.scrollTop,720);
 const late=surface();next.root.children=[];next.root.add(late.scroll);next.mutate();next.flush();
 assert.equal(late.scroll.scrollTop,720);assert.equal(late.details.open,true);next.expire();
});

test('Another background render retains pending state when its late component is not present yet',()=>{
 const old=surface();old.scroll.scrollTop=680;old.details.open=true;const next=delayedSurface();next.root.children=[];
 api.restoreSettled(next.root,api.capture(old.root));const pending=api.capture(next.root),final=surface();api.restore(final.root,pending);
 assert.equal(final.scroll.scrollTop,680);assert.equal(final.details.open,true);
});

for(const event of ['wheel','pointerdown','keydown','input','touchstart'])test(`User ${event} cancels delayed restoration immediately`,()=>{
 const old=surface();old.scroll.scrollTop=520;old.details.open=true;const next=delayedSurface();api.restoreSettled(next.root,api.capture(old.root));
 next.interact(event);next.scroll.scrollTop=210;next.details.open=false;next.mutate();next.flush();
 assert.equal(next.scroll.scrollTop,210);assert.equal(next.details.open,false);assert.equal(api.capture(next.root).rows.find(row=>row.top)?.top,210);
});

test('Navigation cancellation and expiry cannot restore a previous view later',()=>{
 for(const action of [w=>api.cancel(w.root),w=>w.expire()]) {
  const old=surface();old.scroll.scrollTop=520;const next=delayedSurface();api.restoreSettled(next.root,api.capture(old.root));action(next);
  next.scroll.scrollTop=0;next.mutate();next.flush();assert.equal(next.scroll.scrollTop,0);
 }
});
