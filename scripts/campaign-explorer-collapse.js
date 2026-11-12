globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome';
const storageKey=section=>`${ID}.explorer-collapsed.${game.world.id}.${game.user.id}.${section}`;
function preference(section){try{return localStorage.getItem(storageKey(section))==='1';}catch{return false;}}
function mount(){
  for(const page of document.querySelectorAll('#adventurers-tome-app .at-sessions-page,#adventurers-tome-app .at-quests-page')){
    const section=page.classList.contains('at-sessions-page')?'sessions':'quests',layout=page.querySelector('.at-cw-catalog-layout'),explorer=layout?.querySelector(':scope>.at-cw-explorer');if(!explorer)continue;
    layout.classList.add('at-explorer-toggle-layout');let button=layout.querySelector(':scope>[data-at-explorer-toggle]');
    if(!button){button=document.createElement('button');button.type='button';button.dataset.atExplorerToggle=section;button.className='at-explorer-toggle';layout.prepend(button);}
    const apply=()=>{const collapsed=preference(section);layout.classList.toggle('at-explorer-collapsed',collapsed);button.style.left=collapsed?'auto':Math.max(0,explorer.offsetWidth-34)+'px';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Show Campaign Explorer':'Minimize Campaign Explorer');button.title=button.getAttribute('aria-label');const html=`<i class="fa-solid fa-angles-${collapsed?'right':'left'}" aria-hidden="true"></i>`;if(button.innerHTML!==html)button.innerHTML=html;};
    button.onclick=()=>{try{localStorage.setItem(storageKey(section),preference(section)?'0':'1');}catch{}apply();};apply();
  }
}
Hooks.once('ready',()=>{let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});}).observe(document.getElementById('interface')||document.body,{childList:true,subtree:true});mount();});
Hooks.on('adventurersTomeViewPrepared',mount);
window.addEventListener('resize',mount);
