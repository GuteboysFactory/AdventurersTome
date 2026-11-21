import {savedActorDisplayArtwork,tokenArtState} from './token-art.mjs';

const ID='adventurers-tome';
const GM_PORTRAIT=`modules/${ID}/assets/gm-chronicler.png`;

function speakerPortrait(speaker){
  const user=game.user;
  const scene=speaker.scene?game.scenes.get(speaker.scene):null;
  const token=speaker.token?scene?.tokens.get(speaker.token):null;
  if(speaker.token&&!user.isGM&&(!token||token.hidden))return;

  const actor=token?.actor||(speaker.actor?game.actors.get(speaker.actor):null);
  const api=game.modules.get(ID)?.api;
  const canReadActor=actor?.testUserPermission?.(user,'OBSERVER')&&
    (!api?.usesTomeAccess?.(actor)||api.canView?.(actor,user));
  const artwork=canReadActor?tokenArtState(actor):null;
  const board=globalThis.canvas;
  const canSeeToken=token&&(user.isGM||board?.ready&&board.scene===scene&&token.object?.visible===true);
  if(canSeeToken){
    const image=(token.ring?.enabled&&token.ring.subject?.texture)||token.texture?.src;
    if(image)return image===artwork?.tokenTexture?artwork.token||image:image;
  }
  if(artwork)return artwork.token||savedActorDisplayArtwork(actor)||artwork.portrait||actor.img;
}

function renderPortrait(message,html){
  const root=html?.querySelector?html:html?.[0];
  const header=root?.querySelector('.message-header');
  if(!header)return;
  const existing=header.querySelector('[data-tome-chat-portrait]');
  let url;
  if(game.settings.get(ID,'chatSpeakerPortraits')&&message.isContentVisible!==false&&(!message.blind||game.user.isGM)){
    const speaker=message.speaker||{};
    const asAuthor=message.style===CONST.CHAT_MESSAGE_STYLES.OOC||(!speaker.actor&&!speaker.token);
    const path=asAuthor?(message.author?.isGM?GM_PORTRAIT:null):speakerPortrait(speaker);
    try{if(path)url=new URL(path,document.baseURI);}catch{ /* Invalid media path. */ }
    if(url&&!['http:','https:'].includes(url.protocol))url=null;
  }
  if(existing&&url&&existing.src===url.href)return;
  existing?.remove();
  if(!url)return;
  const video=/\.(webm|mp4|m4v|ogv)$/i.test(url.pathname);
  const portrait=document.createElement(video?'video':'img');
  portrait.dataset.tomeChatPortrait=game.settings.get(ID,'chatPortraitShape');
  if(video){
    portrait.muted=true;
    portrait.playsInline=true;
    portrait.preload='auto';
    portrait.setAttribute('aria-hidden','true');
  }else portrait.alt='';
  portrait.src=url.href;
  const size=Math.max(24,Math.min(64,Number(game.settings.get(ID,'chatPortraitSize'))||36));
  portrait.width=portrait.height=size;
  portrait.addEventListener('error',()=>portrait.remove(),{once:true});
  header.prepend(portrait);
}

let refreshPending=false;
function refreshTokenPortraits(){
  if(refreshPending||game.user?.isGM)return;
  refreshPending=true;
  requestAnimationFrame(()=>{
    refreshPending=false;
    for(const row of document.querySelectorAll('.chat-message[data-message-id]')){
      const message=game.messages?.get(row.dataset.messageId);
      if(message?.speaker?.token)renderPortrait(message,row);
    }
  });
}

Hooks.once('init',()=>{
  const register=(key,name,type,defaultValue,options={})=>game.settings.register(ID,key,{name,scope:'client',config:true,type,default:defaultValue,...options,onChange:()=>ui.chat?.render()});
  register('chatSpeakerPortraits','Show speaker portraits in chat',Boolean,true);
  register('chatPortraitShape','Chat portrait shape',String,'circle',{choices:{circle:'Circle',rounded:'Rounded square',square:'Square'}});
  register('chatPortraitSize','Chat portrait size (pixels)',Number,36,{range:{min:24,max:64,step:4}});
});
Hooks.on('renderChatMessageHTML',renderPortrait);
for(const hook of ['canvasReady','canvasTearDown','sightRefresh','updateToken','deleteToken'])Hooks.on(hook,refreshTokenPortraits);
