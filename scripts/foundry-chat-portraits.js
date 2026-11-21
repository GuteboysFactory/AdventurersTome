import {savedActorDisplayArtwork,tokenArtState} from './token-art.mjs';

const ID='adventurers-tome';
const GM_PORTRAIT=`modules/${ID}/assets/gm-chronicler.png`;

function tokenImage(token){
  return token?.texture?.src||(token?.ring?.enabled&&token.ring.subject?.texture);
}

function visibleToken(speaker,referenced){
  const board=globalThis.canvas;
  if(!board?.ready||!board.scene||(speaker.scene&&board.scene.id!==speaker.scene))return;
  const isVisible=placeable=>placeable?.visible===true&&placeable.mesh?.visible!==false&&!placeable.document?.hidden;
  if(speaker.token){
    const placeable=board.tokens?.get?.(speaker.token)||referenced?.object;
    if(isVisible(placeable))return placeable.document||referenced;
    return;
  }
  if(!speaker.actor)return;
  const matches=(board.tokens?.placeables||[]).filter(placeable=>isVisible(placeable)&&placeable.document?.actorId===speaker.actor);
  if(new Set(matches.map(placeable=>tokenImage(placeable.document))).size===1)return matches[0].document;
}

function speakerPortrait(speaker){
  const user=game.user;
  const currentScene=globalThis.canvas?.scene;
  const scene=speaker.scene?game.scenes.get(speaker.scene):currentScene;
  const referenced=speaker.token?scene?.tokens?.get(speaker.token):null;
  const shown=visibleToken(speaker,referenced);
  if(speaker.token&&!user.isGM&&(referenced?.hidden||(!referenced&&!shown)))return;
  const token=user.isGM&&referenced||shown;
  const actor=token?.actor||referenced?.actor||(speaker.actor?game.actors.get(speaker.actor):null);
  const api=game.modules.get(ID)?.api;
  const canReadActor=actor?.testUserPermission?.(user,'OBSERVER')&&
    (!api?.usesTomeAccess?.(actor)||api.canView?.(actor,user));
  const artwork=canReadActor?tokenArtState(actor):null;
  const image=tokenImage(token);
  if(image)return image===artwork?.tokenTexture?artwork.token||image:image;
  if(artwork)return artwork.token||savedActorDisplayArtwork(actor)||artwork.portrait||actor.img;
}

function messagePortrait(message){
  const speaker=message.speaker||{};
  if(message.style!==CONST.CHAT_MESSAGE_STYLES.OOC&&(speaker.actor||speaker.token))return speakerPortrait(speaker);
  const author=message.author;
  if(author?.isGM)return GM_PORTRAIT;
  const character=author?.character;
  const actorId=typeof character==='string'?character:character?.id||author?._source?.character;
  return actorId?speakerPortrait({actor:actorId}):undefined;
}

function renderPortrait(message,html){
  const root=html?.querySelector?html:html?.[0];
  const header=root?.querySelector('.message-header');
  if(!header)return;
  const existing=header.querySelector('[data-tome-chat-portrait]');
  let url;
  if(game.settings.get(ID,'chatSpeakerPortraits')&&message.isContentVisible!==false&&(!message.blind||game.user.isGM)){
    const path=messagePortrait(message);
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
      if(message?.speaker?.token||message?.speaker?.actor||(message?.author&&!message.author.isGM))renderPortrait(message,row);
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
