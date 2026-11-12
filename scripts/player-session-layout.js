globalThis.ATTestAI.assertEnabled();
let term='',owner='';
function account(){const key=game.world.id+'|'+game.user.id;if(key!==owner){owner=key;term='';}}
function searchState(root){
  root?.classList.toggle('is-searching-sessions',Boolean(term.trim()));
}
Hooks.on('adventurersTomeViewPrepared',app=>{
  account();const root=app?.element?.querySelector('.at-player-sessions');if(!root)return;
  for(const field of root.querySelectorAll('[data-at-local-search="sessions"],[data-at-lup-search-proxy="sessions"]'))field.value=term;
  const field=root.querySelector('[data-at-lup-search-proxy="sessions"]')||root.querySelector('[data-at-local-search="sessions"]');
  if(term&&field)field.dispatchEvent(new Event('input',{bubbles:true}));searchState(root);
});
Hooks.once('ready',()=>{
  document.addEventListener('input',event=>{const root=event.target.closest?.('.at-player-sessions');if(root&&event.target.matches?.('[data-at-local-search="sessions"],[data-at-lup-search-proxy="sessions"]')){account();term=event.target.value;searchState(root);}});
  document.addEventListener('click',event=>{
    const row=event.target.closest?.('.at-player-sessions [data-action="selectSession"]');if(!row)return;
    const root=row.closest('.at-player-sessions'),field=root.querySelector('[data-at-lup-search-proxy="sessions"]')||root.querySelector('[data-at-local-search="sessions"]');
    account();term='';
    if(field?.value){field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));}
    searchState(root);
  },true);
});
