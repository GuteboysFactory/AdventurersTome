import {savedActorDisplayArtwork,tokenArtState} from './token-art.mjs';

const ID='adventurers-tome';
const GM_PORTRAIT=`modules/${ID}/assets/gm-chronicler.png`;

function speakerActor(speaker){
  if(speaker.scene&&speaker.token){
    const token=game.scenes.get(speaker.scene)?.tokens.get(speaker.token);
    if(token?.hidden&&!game.user.isGM)return null;
    return token?.actor || (speaker.actor?game.actors.get(speaker.actor):null);
  }
  return speaker.actor?game.actors.get(speaker.actor):null;
}

function renderPortrait(message,html){
  if(!game.settings.get(ID,'chatSpeakerPortraits')||message.isContentVisible===false||message.blind&&!game.user.isGM)return;
  const root=html?.querySelector?html:html?.[0];
  const header=root?.querySelector('.message-header');
  if(!header||header.querySelector('[data-tome-chat-portrait]'))return;
  const speaker=message.speaker||{};
  let path;
  if(message.style===CONST.CHAT_MESSAGE_STYLES.OOC||(!speaker.actor&&!speaker.token)){
    if(!message.author?.isGM)return;
    path=GM_PORTRAIT;
  }else{
    const actor=speakerActor(speaker);
    if(!actor?.testUserPermission(game.user,'OBSERVER'))return;
    const api=game.modules.get(ID)?.api;
    if(api?.usesTomeAccess?.(actor)&&!api.canView(actor,game.user))return;
    const artwork=tokenArtState(actor);
    path=savedActorDisplayArtwork(actor)||artwork.portrait||actor.img||artwork.token;
  }
  try{if(!path||!['http:','https:'].includes(new URL(path,document.baseURI).protocol))return;}catch{return;}
  const image=document.createElement('img');
  image.dataset.tomeChatPortrait=game.settings.get(ID,'chatPortraitShape');
  image.alt='';image.src=path;
  const size=Math.max(24,Math.min(64,Number(game.settings.get(ID,'chatPortraitSize'))||36));
  image.width=image.height=size;
  image.addEventListener('error',()=>image.remove(),{once:true});
  header.prepend(image);
}

Hooks.once('init',()=>{
  const register=(key,name,type,defaultValue,options={})=>game.settings.register(ID,key,{name,scope:'client',config:true,type,default:defaultValue,...options,onChange:()=>ui.chat?.render()});
  register('chatSpeakerPortraits','Show speaker portraits in chat',Boolean,true);
  register('chatPortraitShape','Chat portrait shape',String,'circle',{choices:{circle:'Circle',rounded:'Rounded square',square:'Square'}});
  register('chatPortraitSize','Chat portrait size (pixels)',Number,36,{range:{min:24,max:64,step:4}});
});
Hooks.on('renderChatMessageHTML',renderPortrait);
