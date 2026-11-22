import {savedActorDisplayArtwork,tokenArtState} from './token-art.mjs';
import {isPlayerCharacter} from './player-character-core.mjs';
import {presentationAuthorityUuid} from './player-visibility.mjs';

const ID='adventurers-tome';
const PRESENTATION='chatSpeakerV1';
const COMPOSER='chatComposerSpeakerV1';
const GM_PORTRAIT=`modules/${ID}/assets/gm-chronicler.png`;
let selectedSpeaker;

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
  if(matches.length&&new Set(matches.map(placeable=>tokenImage(placeable.document))).size===1)return matches[0].document;
}

function assignedActorId(author){
  const character=author?.character;
  return typeof character==='string'?character:character?.id||author?._source?.character;
}

function canChooseSpeaker(user){
  return Boolean(user&&(user.isGM||Number(user.role)>=(CONST.USER_ROLES?.PLAYER??1)));
}

function speakerChoiceName(user,actor){
  if(!canChooseSpeaker(user)||!actor)return;
  if(user.isGM||assignedActorId(user)===actor.id)return actor.name;
  const api=game.modules.get(ID)?.api;
  if(isPlayerCharacter(actor,game.users?.contents||[])){
    const known=api?.canView?api.canView(actor,user):actor.testUserPermission?.(user,'LIMITED');
    return known?actor.name:undefined;
  }
  return npcName(actor,actor.id,user,api);
}

function currentSpeakerChoice(){
  return selectedSpeaker?.userId===game.user.id&&selectedSpeaker.worldId===game.world.id?selectedSpeaker.actorId:null;
}

function speakerButtonLabel(){
  const actor=game.actors.get(currentSpeakerChoice());
  const name=speakerChoiceName(game.user,actor);
  if(name)return name;
  if(game.user.isGM)return 'Gamemaster';
  return game.actors.get(assignedActorId(game.user))?.name||'My character';
}

function refreshSpeakerButtons(){
  for(const button of document.querySelectorAll('[data-tome-chat-speaker]')){
    const label=button.querySelector('span');
    if(label)label.textContent=speakerButtonLabel();
  }
}

async function chooseChatSpeaker(){
  if(!canChooseSpeaker(game.user))return;
  const user=game.user,worldId=game.world.id;
  const selected=currentSpeakerChoice();
  const actors=game.actors.contents.map(actor=>({id:actor.id,name:speakerChoiceName(user,actor)}))
    .filter(actor=>actor.name).sort((a,b)=>a.name.localeCompare(b.name));
  const folded=name=>name.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
  const api=foundry.applications.api.DialogV2;
  const result=await api.wait({window:{title:'Speak as',resizable:true},position:{width:470},classes:['at-chat-speaker-picker'],rejectClose:false,
    content:`<label>Character name<input type="search" data-speaker-search placeholder="Search by name…"></label>
      <select name="actor" size="8" aria-label="Matching characters"></select>`,
    render:(_event,app)=>{
      const input=app.element.querySelector('[data-speaker-search]');
      const list=app.element.querySelector('select[name="actor"]');
      list.size=8;
      const apply=()=>{
        const query=folded(input.value.trim());
        const rows=actors.filter(actor=>folded(actor.name).includes(query)).slice(0,80);
        list.replaceChildren(...rows.map(actor=>new Option(actor.name,actor.id)));
        if(rows.some(actor=>actor.id===selected)&&!query)list.value=selected;
        else if(rows.length)list.selectedIndex=0;
        app.element.querySelector('[data-action="pick"]').disabled=!rows.length;
      };
      input.addEventListener('input',apply);
      apply();
      input.focus();
    },
    buttons:[
      {action:'pick',label:'Speak as character',default:true,callback:(_event,button)=>({actorId:button.form.elements.actor.value})},
      {action:'reset',label:user.isGM?'Back to Gamemaster':'Use my character',callback:()=>({actorId:null})},
      {action:'cancel',label:'Cancel',callback:()=>null}
    ]});
  if(!result||!canChooseSpeaker(game.user)||game.user.id!==user.id||game.world.id!==worldId)return;
  if(result.actorId&&!speakerChoiceName(game.user,game.actors.get(result.actorId)))throw Error('This character is no longer available for chat.');
  selectedSpeaker={userId:user.id,worldId,actorId:result.actorId};
  refreshSpeakerButtons();
  const input=Array.from(document.querySelectorAll('#chat-message')).find(element=>element.getClientRects().length);
  input?.focus();
}

function mountChatSpeaker(_app,html){
  if(!canChooseSpeaker(game.user))return;
  const root=html?.querySelector?html:html?.[0];
  const form=root?.matches?.('.chat-form')?root:root?.querySelector('.chat-form');
  if(!form||form.querySelector('[data-tome-chat-speaker]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.dataset.tomeChatSpeaker='';
  button.setAttribute('aria-haspopup','dialog');
  button.title='Choose who you speak as';
  button.innerHTML='<i class="fa-solid fa-comment" aria-hidden="true"></i> Speak as <span></span>';
  button.querySelector('span').textContent=speakerButtonLabel();
  button.onclick=()=>void chooseChatSpeaker().catch(error=>ui.notifications.warn(error.message));
  const input=form.querySelector('#chat-message');
  if(input)input.before(button);
  else form.append(button);
}

function voiceSpeaker(actor,user){
  const scene=globalThis.canvas?.scene;
  const mayUseToken=user.isGM||assignedActorId(user)===actor.id||actor.testUserPermission?.(user,'OWNER')===true;
  const token=mayUseToken?visibleToken({actor:actor.id,scene:scene?.id}):null;
  return {
    scene:scene?.id??null,actor:actor.id,token:token?.id??null,
    alias:isPlayerCharacter(actor,game.users?.contents||[])?actor.name:'Unknown NPC'
  };
}

function prepareChatVoice(chat,content,data){
  if(!canChooseSpeaker(game.user))return;
  const [command]=chat.constructor.parse(content);
  if(!['none','ic','emote','whisper','reply','gm','players'].includes(command))return;
  const actorId=currentSpeakerChoice();
  if(!actorId){
    if(game.user.isGM&&command==='none')data.speaker={actor:null,token:null,alias:game.user.name};
    return;
  }
  const actor=game.actors.get(actorId);
  if(!speakerChoiceName(game.user,actor))throw Error('This character is no longer available. Choose who to speak as and send again.');
  data.speaker=voiceSpeaker(actor,game.user);
  data.flags??={};
  data.flags[ID]={...data.flags[ID],[COMPOSER]:{actorId,authorId:game.user.id}};
}

function chatSpeaker(message,author=message.author){
  const original=message.speaker||{};
  const saved=message.getFlag?.(ID,PRESENTATION)??message.flags?.[ID]?.[PRESENTATION];
  const ooc=message.style===CONST.CHAT_MESSAGE_STYLES.OOC;
  const explicit=!ooc&&(original.actor||original.token);
  const assigned=author?.isGM?null:assignedActorId(author);
  const recorded=saved?.authorId&&saved.authorId===author?.id?saved:null;
  const speaker=explicit?original:{actor:recorded?.kind==='pc'?recorded.actorId:assigned};
  if(!speaker.actor&&!speaker.token)return {kind:author?.isGM?'gm':'plain'};
  const scene=speaker.scene?game.scenes.get(speaker.scene):globalThis.canvas?.scene;
  const referenced=speaker.token?scene?.tokens?.get(speaker.token):null;
  const shown=visibleToken(speaker,referenced);
  let token=referenced||shown;
  const actorId=speaker.actor||token?.actorId||token?.actor?.id||recorded?.actorId;
  const actor=(actorId?game.actors.get(actorId):null)||token?.baseActor||token?.actor||
    (author?.character?.id===actorId?author.character:null);
  const kind=(actorId&&(actorId===assigned||(!explicit&&!author?.isGM)||
    (recorded?.kind==='pc'&&recorded.actorId===actorId)))||
    isPlayerCharacter(actor,game.users?.contents||[])?'pc':'npc';
  const snapshot=recorded?.kind===kind&&recorded.actorId===actorId?recorded:null;
  if(kind==='pc'&&!actor&&!token&&!snapshot){
    const tokens=(game.scenes.contents||[]).flatMap(entry=>entry.tokens?.contents||[]);
    const matches=tokens.filter(entry=>entry.actorId===actorId&&!entry.hidden);
    if(new Set(matches.map(tokenImage)).size===1)token=matches[0];
  }
  return {kind,actor,actorId,token,explicitToken:Boolean(speaker.token),hidden:referenced?.hidden===true,snapshot};
}

function canReadActor(actor,user,api){
  return actor?.testUserPermission?.(user,'OBSERVER')===true&&
    (!api?.usesTomeAccess?.(actor)||api.canView?.(actor,user)===true);
}

function npcName(actor,actorId,viewer,api){
  const uuid=actorId?'Actor.'+actorId:actor?.uuid;
  const entries=uuid?(game.journal?.contents||[]).filter(entry=>
    entry.getFlag?.(ID,'knownPersonV1')?.actorUuid===uuid||
    (entry.getFlag?.(ID,'type')==='world'&&presentationAuthorityUuid(entry)===uuid)):[];
  const known=entries.find(entry=>api?.canView?.(entry,viewer)===true);
  if(known)return known.name||actor?.name;
  if(!entries.length&&canReadActor(actor,viewer,api))return actor.name;
}

function speakerArtwork(context,{publishing=false,knownVoice=false}={}){
  const {kind,actor,token,explicitToken,hidden,snapshot}=context;
  const viewer=game.user;
  if(kind==='gm')return GM_PORTRAIT;
  if(kind==='plain'||(kind==='npc'&&hidden&&(publishing||!viewer.isGM)))return;
  const api=game.modules.get(ID)?.api;
  const allowed=kind==='pc'||canReadActor(actor,viewer,api)||(publishing&&(viewer.isGM||knownVoice));
  const artwork=actor&&allowed?tokenArtState(actor):null;
  const image=tokenImage(token);
  if(kind==='pc'&&!explicitToken){
    if(artwork?.token)return artwork.token;
    if(!publishing&&snapshot?.artwork)return snapshot.artwork;
  }
  if(image&&!hidden)return image===artwork?.tokenTexture?artwork.token||image:image;
  if(image&&viewer.isGM&&!publishing)return image;
  if(snapshot?.artwork&&!publishing)return snapshot.artwork;
  if(artwork)return artwork.token||savedActorDisplayArtwork(actor)||artwork.portrait||actor.img;
}

function messagePortrait(message,context=chatSpeaker(message)){
  return speakerArtwork(context);
}

function speakerLabel(message,context){
  const {kind,actor,actorId,token,snapshot}=context;
  if(kind==='pc')return actor?.name||snapshot?.name||token?.name;
  if(kind!=='npc')return;
  if(game.user.isGM)return actor?.name||token?.name||message.speaker?.alias;
  const name=npcName(actor,actorId,game.user,game.modules.get(ID)?.api);
  return name||(game.i18n?.lang==='sv'?'Okänd NPC':'Unknown NPC');
}

function rememberSpeaker(message,_data,_options,userId){
  if(userId!==game.user.id)return;
  const author=message.author||game.user;
  if(author.id!==game.user.id)return;
  const request=message.getFlag?.(ID,COMPOSER)??message.flags?.[ID]?.[COMPOSER];
  if(request){
    const actor=game.actors.get(request.actorId);
    if(request.authorId!==author.id||!speakerChoiceName(author,actor))return false;
    const styles=CONST.CHAT_MESSAGE_STYLES;
    // The native composer clears the speaker for whispers and text without a token.
    message.updateSource({speaker:voiceSpeaker(actor,author),[`flags.${ID}.-=${COMPOSER}`]:null,
      ...(message.style===styles.OOC?{style:styles.IC}:{})});
  }
  const context=chatSpeaker(message,author);
  const {kind,actor,actorId}=context;
  if(kind!=='pc'&&kind!=='npc')return;
  if(!request&&!author.isGM&&actorId!==assignedActorId(author)&&!actor?.testUserPermission?.(author,'OWNER'))return;
  const artwork=speakerArtwork(context,{publishing:true,knownVoice:Boolean(request)});
  const name=kind==='pc'?(actor?.name||context.token?.name):undefined;
  const patch=kind==='npc'?{'speaker.alias':'Unknown NPC'}:{};
  if(artwork||name)patch[`flags.${ID}.${PRESENTATION}`]={kind,actorId,authorId:author.id,...(name?{name}:{}),...(artwork?{artwork}:{})};
  if(Object.keys(patch).length)message.updateSource(patch);
}

function renderPortrait(message,html){
  const root=html?.querySelector?html:html?.[0];
  const header=root?.querySelector('.message-header');
  if(!header)return;
  const existing=header.querySelector('[data-tome-chat-portrait]');
  const visible=message.isContentVisible!==false&&(!message.blind||game.user.isGM);
  const context=chatSpeaker(message);
  const sender=header.querySelector('.message-sender');
  const name=(visible||context.kind==='npc')?speakerLabel(message,context):null;
  if(sender&&name)sender.textContent=name;
  let url;
  if(visible){
    if(game.settings.get(ID,'chatSpeakerPortraits')){
      const path=messagePortrait(message,context);
      try{if(path)url=new URL(path,document.baseURI);}catch{ /* Invalid media path. */ }
      if(url&&!['http:','https:'].includes(url.protocol))url=null;
    }
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
  if(refreshPending)return;
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
Hooks.on('preCreateChatMessage',rememberSpeaker);
Hooks.on('chatMessage',prepareChatVoice);
Hooks.on('renderChatLog',mountChatSpeaker);
Hooks.once('ready',()=>mountChatSpeaker(null,document));
Hooks.on('renderChatMessageHTML',renderPortrait);
for(const hook of ['canvasReady','canvasTearDown','sightRefresh','updateToken','deleteToken'])Hooks.on(hook,refreshTokenPortraits);
for(const hook of ['updateActor','deleteActor','updateJournalEntry','createJournalEntry','deleteJournalEntry','updateUser'])Hooks.on(hook,()=>{
  if(canChooseSpeaker(game.user))refreshSpeakerButtons();
  refreshTokenPortraits();
});
