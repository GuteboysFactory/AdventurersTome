import {unreadPlayerEntries} from './player-updates-core.mjs';
globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome',KEY='seenCampaignEntriesV1';
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
let host,launcher,observer,resizeObserver,pending={quests:[],sessions:[]},write=Promise.resolve();
const seen=()=>globalThis.ATTestAI.flags(game.user).getFlag(ID,KEY)||{};

function position(){
  if(!host||host.hidden||!launcher?.isConnected)return;
  const rect=launcher.getBoundingClientRect(),width=host.offsetWidth,height=host.offsetHeight;
  const fits=rect.right+6+width<=innerWidth-4;
  host.style.left=Math.max(4,Math.min(fits?rect.right+6:rect.right-width,innerWidth-width-4))+'px';
  host.style.top=Math.max(4,Math.min(fits?rect.top+(rect.height-height)/2:rect.bottom+5,innerHeight-height-4))+'px';
}
function refresh(){
  if(game.user?.isGM)return;
  launcher=document.getElementById('adventurers-tome-launcher');
  if(!launcher||!api()?.canView)return;
  if(!host){
    host=document.createElement('div');host.id='at-player-updates';host.setAttribute('role','group');host.setAttribute('aria-label','Unread campaign entries');
    for(const [section,letter] of [['quests','Q'],['sessions','S']]){
      const button=document.createElement('button');button.type='button';button.dataset.atUnread=section;button.textContent=letter;
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          const app=api().app();app._pushNavigationState?.();app.activeTab=section;app.activeQuestId=null;
          if(section==='sessions')app.activeSessionId=pending.sessions.at(-1)?.id||null;
          await globalThis.AdventurersTomeWindowDock?.restore(app);
          await app.render({force:true});app.bringToFront?.();
        }catch(error){console.error('Adventurer\'s Tome | Could not open campaign updates',error);}
        finally{button.disabled=false;}
      });
      host.append(button);
    }
    document.body.append(host);
    observer=new MutationObserver(position);observer.observe(launcher,{attributes:true,attributeFilter:['style','class']});
    resizeObserver=new ResizeObserver(position);resizeObserver.observe(launcher);
    window.addEventListener('resize',position);
  }
  pending=unreadPlayerEntries(game.journal?.contents||[],seen(),doc=>api().canView(doc,game.user));
  for(const button of host.querySelectorAll('button')){
    const section=button.dataset.atUnread,count=pending[section].length;
    button.hidden=!count;button.title=`${count} unread ${section} · Open ${section==='quests'?'Quests':'Sessions'}`;button.setAttribute('aria-label',button.title);
  }
  host.hidden=!pending.quests.length&&!pending.sessions.length;position();
}
function acknowledge(app){
  if(game.user?.isGM||app?._atWindowDocked||!app?.rendered)return;
  const section=app.activeTab==='questDetail'?'quests':app.activeTab;
  if(!['quests','sessions'].includes(section))return;
  // Snapshot what was actually visible in this view, not anything arriving
  // while the asynchronous User flag update is in flight.
  const unread=unreadPlayerEntries(game.journal?.contents||[],seen(),doc=>api()?.canView(doc,game.user));
  const viewed=section==='quests'&&app.activeTab==='questDetail'?unread.quests.filter(doc=>doc.id===app.activeQuestId):unread[section];
  if(!viewed.length)return;
  write=write.then(async()=>{
    const current=seen();
    await globalThis.ATTestAI.flags(game.user).setFlag(ID,KEY,{...current,[section]:[...new Set([...(current[section]||[]),...viewed.map(doc=>doc.uuid)])]});
    refresh();
  }).catch(error=>console.error('Adventurer\'s Tome | Could not acknowledge updates',error));
}
Hooks.once('ready',refresh);
Hooks.on('adventurersTomeLauncherReady',refresh);
Hooks.on('adventurersTomeViewPrepared',app=>{refresh();acknowledge(app);});
for(const event of ['createJournalEntry','updateJournalEntry','deleteJournalEntry'])Hooks.on(event,refresh);
Hooks.on('updateUser',user=>{if(user.id===game.user.id)refresh();});
