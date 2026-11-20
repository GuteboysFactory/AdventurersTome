globalThis.ATTestAI.assertEnabled();
let term='',owner='',listTop=0,explorerTop=0;
const readerPositions=new Map();
const pageSelector='.at-sessions-page',readerSelector='[data-at-session-reader]';
const findSearch=root=>root.querySelector('[data-at-lup-search-proxy="sessions"]')||root.querySelector('[data-at-local-search="sessions"]');
function account(){const key=game.world.id+'|'+game.user.id;if(key!==owner){owner=key;term='';listTop=explorerTop=0;readerPositions.clear();}}
function capture(element){
  account();const root=element?.querySelector(pageSelector);if(!root)return;
  const list=root.querySelector('.at-session-master'),explorer=root.querySelector('.at-cw-tree-scroll'),reader=root.querySelector(readerSelector);
  if(list?.getClientRects().length)listTop=list.scrollTop;
  if(explorer?.getClientRects().length)explorerTop=explorer.scrollTop;
  if(reader?.getClientRects().length)readerPositions.set(reader.dataset.atSessionReader,reader.scrollTop);
}
function restore(element){
  account();const root=element?.querySelector(pageSelector);if(!root)return;
  for(const field of root.querySelectorAll('[data-at-local-search="sessions"],[data-at-lup-search-proxy="sessions"]'))field.value=term;
  const field=findSearch(root);
  if(term&&field)field.dispatchEvent(new Event('input',{bubbles:true}));
  const list=root.querySelector('.at-session-master'),explorer=root.querySelector('.at-cw-tree-scroll'),reader=root.querySelector(readerSelector);
  if(list)list.scrollTop=listTop;
  if(explorer)explorer.scrollTop=explorerTop;
  if(reader)reader.scrollTop=readerPositions.get(reader.dataset.atSessionReader)||0;
}
globalThis.AdventurersTomeSessionLayout=Object.freeze({capture,restore});
Hooks.once('ready',()=>{
  document.addEventListener('input',event=>{const root=event.target.closest?.(pageSelector);if(root&&event.target.matches?.('[data-at-local-search="sessions"],[data-at-lup-search-proxy="sessions"]')){account();term=event.target.value;}});
});
