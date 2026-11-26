import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {MAX_FRAME_BAND_WIDTH,TOKEN_ART_FLAG,TOKEN_ART_ROTATION_PATH,TOKEN_SIZE,actorArtworkUpdate,actorFullArtwork,actorHomeArtwork,actorPortraitArtwork,defaultTokenLockRotation,normalizeTokenArt,paintToken,placedTokenArtworkUpdates,savedActorDisplayArtwork,tokenArtState,tokenFrameScale,tokenGridSize,tokenImageRect,tokenTexturePatch} from '../scripts/token-art.mjs';
import {isPlayerCharacter} from '../scripts/player-character-core.mjs';
import {FRAME_MATERIALS, applyFrameMaterial, tokenFramePattern} from '../scripts/token-frame-materials.mjs';
import {FRAME_SILHOUETTES} from '../scripts/token-frame-shapes.mjs';

const noFrame=applyFrameMaterial({shape:'rectangle'},'none');

test('reads legacy Realm Guard source and crop without changing Actor or token data',()=>{
  const actor={img:'old/token.png',prototypeToken:{lockRotation:true,texture:{src:'old/token.png'}},flags:{'realm-guard':{portraitSource:'old/full.webp',portraitMode:'token',tokenBuilderFraming:{fit:'contain',zoom:1.4,offsetX:12,offsetY:-8}}}};
  const before=structuredClone(actor);
  const state=tokenArtState(actor);
  assert.deepEqual(state.framing,{fit:'contain',zoom:1.4,offsetX:12,offsetY:-8});
  assert.equal(state.source,'old/full.webp');
  assert.equal(state.token,'old/token.png');
  assert.equal(state.defaultMode,'token');
  assert.equal(state.lockRotation,true);
  assert.equal(state.frame.style,'single');
  assert.deepEqual(actor,before);
});

test('reads Tome source and uses the current Foundry prototype image ahead of legacy tokens',()=>{
  const actor={img:'old/token.png',prototypeToken:{texture:{src:'new/token.png'}},flags:{'realm-guard':{tokenPortraitPath:'old/token.png'},'adventurers-tome':{tokenArtV1:{source:'new/full.png',framing:{fit:'whole'},frame:noFrame}}}};
  const state=tokenArtState(actor);
  assert.equal(state.source,'new/full.png');
  assert.equal(state.token,'new/token.png');
  assert.equal(state.frame.style,'none');
});

test('Whole image keeps full portrait proportions without a frame even with stored crop offsets',()=>{
  const {framing,frame}=normalizeTokenArt({fit:'whole',zoom:4,offsetX:110,offsetY:-90},noFrame);
  assert.deepEqual(tokenImageRect(400,800,512,framing,frame),{x:128,y:0,w:256,h:512});
  assert.deepEqual(tokenImageRect(800,400,512,framing,frame),{x:0,y:128,w:512,h:256});
  const framed=tokenImageRect(400,800,512,framing,applyFrameMaterial({shape:'shield'},'bronze'));
  assert.equal(framed.w/framed.h,.5);
  assert.ok(framed.x>128 && framed.y>0);
});

test('every material keeps the selected shape and old solid frames stay solid',()=>{
  const base={shape:'hexagon'};
  for(const name of Object.keys(FRAME_MATERIALS)) {
    const {frame}=normalizeTokenArt({},applyFrameMaterial(base,name));
    assert.equal(frame.shape,'hexagon');
    assert.equal(frame.material,name);
    assert.match(frame.color,/^#([\da-f]{2})\1\1$/i);
  }
  const old = {shape:'oval',style:'double',color:'#302fde',accent:'#ead1ac',weight:11};
  assert.deepEqual(normalizeTokenArt({},old).frame,{...old,material:'plain',effect:'none',effectStrength:100,bandWidth:11,diameter:100,
    ornaments:{top:'none',right:'none',bottom:'none',left:'none'}});
  assert.equal(normalizeTokenArt({}, {...old,style:'none'}).frame.material,'none');
});

test('animation strength defaults to the original rendering and survives an Actor save',()=>{
  const base={effect:'fire'};
  const normalize=effectStrength=>normalizeTokenArt({}, {...base,effectStrength});
  assert.equal(normalize(undefined).frame.effectStrength,100);
  assert.equal(normalize('invalid').frame.effectStrength,100);
  assert.equal(normalize(-10).frame.effectStrength,25);
  assert.equal(normalize(250).frame.effectStrength,200);
  const design=normalize('165');
  const patch=actorArtworkUpdate({mode:'token',source:'full.webp',output:'token.webm',design});
  const saved=patch[`flags.adventurers-tome.${TOKEN_ART_FLAG}.frame`];
  assert.equal(normalizeTokenArt({},saved).frame.effectStrength,165);
});

test('frame width extends a single band and leaves the opening and image crop fixed',()=>{
  const operations=[];
  const ctx={
    beginPath(){},closePath(){},save(){},restore(){},clearRect(){},moveTo(){},stroke(){},fillRect(){},
    ellipse:(_x,_y,rx,ry)=>operations.push(['shape',rx,ry]),
    translate:(...args)=>operations.push(['translate',...args]),
    scale:(...args)=>operations.push(['scale',...args]),
    clip:rule=>operations.push(['clip',rule]),
    drawImage:(_image,...rect)=>operations.push(['image',...rect])
  };
  const canvas={width:TOKEN_SIZE,height:TOKEN_SIZE,getContext:()=>ctx};
  const image={naturalWidth:400,naturalHeight:600};
  const {framing,frame}=normalizeTokenArt({fit:'whole'},{shape:'circle',material:'plain',weight:20,bandWidth:999});
  const extra=MAX_FRAME_BAND_WIDTH-20;
  assert.equal(frame.bandWidth,MAX_FRAME_BAND_WIDTH);
  paintToken(canvas,image,framing,frame);
  const maxScale=140/100;
  const padding=Math.ceil(extra*maxScale+TOKEN_SIZE*(maxScale-1)/2);
  assert.equal(canvas.width,TOKEN_SIZE+2*padding);
  assert.equal(canvas.height,canvas.width);
  assert.deepEqual(operations[0],['translate',padding,padding]);
  assert.deepEqual(operations.filter(([operation])=>operation==='clip'),[['clip',undefined],['clip','evenodd']]);
  const [innerAtPaint,wideOutside,innerBand]=operations.filter(([operation])=>operation==='shape').map(op=>op[1]);
  const enlargedImage=operations.find(([operation])=>operation==='image');
  operations.length=0;
  paintToken(canvas,image,framing,{...frame,bandWidth:12});
  assert.equal(canvas.width,Math.ceil(TOKEN_SIZE*maxScale/2)*2);
  const [sameImageClip,thinOutside,sameInnerBand]=operations.filter(([operation])=>operation==='shape').map(op=>op[1]);
  assert.equal(innerAtPaint,sameImageClip);
  assert.equal(innerBand,sameInnerBand);
  assert.ok(wideOutside>thinOutside);
  assert.deepEqual(operations.find(([operation])=>operation==='image'),enlargedImage);
  for(const diameter of [100,129,140]){
    operations.length=0;
    paintToken(canvas,image,framing,{...frame,diameter});
    assert.equal(canvas.width,TOKEN_SIZE+2*padding);
    assert.deepEqual(operations.find(([operation])=>operation==='scale'),
      diameter===100?undefined:['scale',diameter/100,diameter/100]);
  }
  paintToken(canvas,image,framing,{...noFrame,bandWidth:frame.bandWidth});
  assert.equal(canvas.width,TOKEN_SIZE);
});

test('fitting a circle to token edges keeps the stored diameter and supports thin or wide borders',()=>{
  for(const bandWidth of [3,MAX_FRAME_BAND_WIDTH]){
    const {frame}=normalizeTokenArt({}, {shape:'circle',weight:14,bandWidth,diameter:80,fitToEdges:true});
    const outerRadius=TOKEN_SIZE/2-(TOKEN_SIZE*.03+frame.weight)+bandWidth;
    assert.ok(Math.abs(outerRadius*tokenFrameScale(frame)-TOKEN_SIZE/2)<1e-6);
    assert.equal(frame.diameter,80);
    assert.equal(tokenFrameScale({...frame,fitToEdges:false}),.8);
    assert.equal(normalizeTokenArt({}, {...frame,shape:'oval'}).frame.fitToEdges,undefined);
  }
});

test('illustrated frame choices keep their own aperture and tint across saves',()=>{
  const shapes=['laurelWreath','flowerWreath','thornWreath','dragonWings','runeStar',
    'ravenWreath','dwarvenArch','moonFiligree','frostCrown','coralWreath'];
  const allShapes=Object.keys(FRAME_SILHOUETTES);
  assert.deepEqual(allShapes.filter(shape=>!FRAME_SILHOUETTES[shape].group),shapes);
  assert.equal(allShapes.filter(shape=>FRAME_SILHOUETTES[shape].group).length,90);
  for(const shape of allShapes){
    const {file,center,aperture}=FRAME_SILHOUETTES[shape];
    const png=readFileSync(new URL(`../assets/token-frames/shape-${file}.png`,import.meta.url));
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(png.readUInt32BE(16),png.readUInt32BE(20));
    assert.equal(aperture.length,96);
    const {framing,frame}=normalizeTokenArt({fit:'whole'},{shape,material:'none',silhouetteTint:'#345a64',effect:'glow'});
    assert.equal(frame.shape,shape);
    assert.equal(frame.silhouetteTint,'#345a64');
    assert.equal(frame.effect,'glow');
    assert.equal(normalizeTokenArt(framing,{...frame,silhouetteTint:'invalid'}).frame.silhouetteTint,'');
    const rect=tokenImageRect(400,600,TOKEN_SIZE,framing,frame);
    assert.deepEqual(rect,tokenImageRect(400,600,TOKEN_SIZE,framing,{...frame,bandWidth:MAX_FRAME_BAND_WIDTH}));
    assert.equal(rect.x+rect.w/2,center[0]);
    assert.equal(rect.y+rect.h/2,center[1]);
    assert.ok(Math.hypot(rect.w/2,rect.h/2)<=Math.min(...aperture));
  }
});

test('world frame defaults leave saved and legacy designs intact and do not affect token grid size',()=>{
  const actor={img:'hero.png',prototypeToken:{width:1.5,height:2}};
  const chosen={shape:'library-frost-knot',material:'plain',diameter:130};
  assert.equal(tokenArtState(actor,chosen).frame.shape,chosen.shape);
  assert.equal(tokenArtState(actor,chosen).frame.diameter,130);
  assert.deepEqual(tokenArtState(actor,chosen).gridSize,{width:1.5,height:2});
  const saved={...actor,flags:{'adventurers-tome':{[TOKEN_ART_FLAG]:{frame:{shape:'oval'}}}}};
  assert.equal(tokenArtState(saved,chosen).frame.shape,'oval');
  const legacy={...actor,flags:{'realm-guard':{tokenBuilderFraming:{fit:'contain'}}}};
  assert.equal(tokenArtState(legacy,chosen).frame.shape,'circle');
  assert.deepEqual(tokenGridSize({width:'',height:'3'},actor.prototypeToken),{width:1.5,height:3});
});

test('token size edits the prototype and applies to placed tokens only when included',()=>{
  const design=normalizeTokenArt();
  const gridSize={width:2,height:.5};
  const patch=actorArtworkUpdate({mode:'token',source:'hero.png',output:'token.png',design,gridSize});
  assert.equal(patch['prototypeToken.width'],2);
  assert.equal(patch['prototypeToken.height'],.5);
  const portrait=actorArtworkUpdate({mode:'portrait',source:'hero.png',output:'portrait.png',design,gridSize});
  assert.equal(portrait['prototypeToken.width'],undefined);
  const tokens=[{id:'t',actorId:'hero',texture:{src:'before.png'}}];
  assert.equal(placedTokenArtworkUpdates(tokens,'hero','before.png','token.png',true)[0].width,undefined);
  assert.equal(placedTokenArtworkUpdates(tokens,'hero','before.png','token.png',true,{gridSize})[0].width,2);
});

test('saved frames migrate old outward widths and validate ornaments independently by slot',()=>{
  const legacy=normalizeTokenArt({}, {weight:24,outerWidth:17,ornaments:{top:'laurel',bottom:'hammer',right:'missing'}}).frame;
  assert.equal(legacy.weight,24);
  assert.equal(legacy.bandWidth,41);
  assert.deepEqual(legacy.ornaments,{top:'laurel',right:'none',bottom:'hammer',left:'none'});
  assert.equal(normalizeTokenArt({}, {...legacy,bandWidth:27}).frame.bandWidth,27);
});

test('textured frames keep an opaque base and tint the generated pattern across its light and dark details',()=>{
  const color='#1375c2';
  const pixels={data:new Uint8ClampedArray([40,40,40,255,218,218,218,255,0,0,0,0,90,90,90,255])};
  const fills=[];
  const paint={
    fillRect(){fills.push([this.fillStyle,this.globalAlpha]);},
    drawImage(){},getImageData:()=>pixels,putImageData(){},
    beginPath(){},ellipse(){},fill(){}
  };
  const ctx={canvas:{ownerDocument:{createElement:()=>({getContext:()=>paint})}},createPattern:tile=>tile};
  tokenFramePattern(ctx,{...applyFrameMaterial({},'bronze'),color});
  assert.equal(fills[0][0],color);
  tokenFramePattern(ctx,{...applyFrameMaterial({},'elvenLaurel'),color},{elvenLaurel:{naturalWidth:2}});
  const [dark,bright,gap,medium]=[0,4,8,12].map(index=>Array.from(pixels.data.slice(index,index+4)));
  for(const sample of [dark,bright,gap,medium]){
    assert.equal(sample[3],255);
    assert.ok(sample[2]>sample[0]);
  }
  assert.deepEqual(gap,[19,117,194,255]);
  assert.ok(bright[2]>medium[2]&&medium[2]>dark[2]);
});

test('full artwork, generated portrait, animated texture and its still poster are independent',()=>{
  const actor={img:'legacy.png', prototypeToken:{texture:{src:'fire.webm'}}, flags:{'adventurers-tome':{tokenArtV1:{
    source:'full.png',portrait:{image:'portrait.png',source:'portrait-source.png',framing:{zoom:2}},frame:{material:'gold',effect:'fire'},tokenPoster:{video:'fire.webm',image:'poster.png'}
  }}}};
  const state=tokenArtState(actor);
  assert.equal(actorFullArtwork(actor,'tome-hero.png'),'full.png');
  assert.equal(state.portrait,'portrait.png');
  assert.equal(state.portraitSource,'portrait-source.png');
  assert.equal(state.portraitFraming.zoom,2);
  assert.equal(state.token,'poster.png');
  assert.equal(state.tokenTexture,'fire.webm');
  assert.equal(state.frame.effect,'fire');
  assert.equal(normalizeTokenArt({}, {...noFrame,effect:'fire'}).frame.effect,'none');
  actor.prototypeToken.texture.src='another.png';
  assert.equal(tokenArtState(actor).token,'another.png');
});

test('only the prototype texture and rotation are changed by the token patch',()=>{
  const patch=tokenTexturePatch('token.png',true,'prototypeToken.');
  assert.equal(patch['prototypeToken.texture.src'],'token.png');
  assert.equal(patch['prototypeToken.lockRotation'],true);
  assert.ok(Object.keys(patch).every(key=>/^prototypeToken\.(texture\.|lockRotation$)/.test(key)));
});

test('new scene tokens and Token Builder keep artwork upright by default and honor explicit overrides',()=>{
  const src=readFileSync(new URL('../scripts/token-builder.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const hooks=new Map();
  const context=vm.createContext({TOKEN_ART_ROTATION_PATH,defaultTokenLockRotation,
    Hooks:{once(){},on:(name,fn)=>hooks.set(name,fn)},foundry:{utils:{setProperty:(data,path,value)=>{data[path]=value;}}}});
  vm.runInContext(src,context);
  const source={lockRotation:false};
  const actor={prototypeToken:{lockRotation:false}};
  const add=(baseActor,data=source,opts={})=>{
    const token={baseActor,lockRotation:data.lockRotation,updateSource(patch){Object.assign(this,patch);}};
    hooks.get('preCreateToken')(token,data,opts);
    return token.lockRotation;
  };
  assert.equal(add(actor),true);
  assert.equal(add(null),true);
  assert.equal(add(actor,source,{keepId:true}),false);
  assert.equal(tokenArtState(actor).lockRotation,true);
  assert.equal(actor.prototypeToken.lockRotation,false);
  const optedOut={...actor,flags:{'adventurers-tome':{[TOKEN_ART_FLAG]:{lockRotation:false}}}};
  assert.equal(add(optedOut),false);
  assert.equal(add(optedOut,{lockRotation:true}),true);
  assert.equal(tokenArtState(optedOut).lockRotation,false);
  const changes={prototypeToken:{lockRotation:false}};
  hooks.get('preUpdateActor')({prototypeToken:{lockRotation:true}},changes);
  assert.equal(changes[TOKEN_ART_ROTATION_PATH],false);
  const design=normalizeTokenArt();
  const update=lockRotation=>actorArtworkUpdate({mode:'token',source:'full.webp',output:'token.png',design,lockRotation});
  assert.equal(update(undefined)['prototypeToken.lockRotation'],true);
  assert.equal(update(false)[TOKEN_ART_ROTATION_PATH],false);
});

test('saving character artwork updates Foundry img and preserves the independent Group full artwork',()=>{
  const flag='flags.adventurers-tome.tokenArtV1';
  const design=normalizeTokenArt();
  const token=actorArtworkUpdate({mode:'token',source:'full.webp',output:'token.webm',poster:'poster.png',design,lockRotation:true});
  assert.equal(token.img,'poster.png');
  assert.equal(token['prototypeToken.texture.src'],'token.webm');
  assert.equal(token[flag+'.displayMode'],'token');
  assert.equal(token[flag+'.source'],'full.webp');
  assert.equal(Object.hasOwn(token,flag+'.portrait'),false);
  assert.equal(actorArtworkUpdate({mode:'token',source:'full.webp',output:'token.png',design}).img,'token.png');

  const portrait=actorArtworkUpdate({mode:'portrait',source:'portrait-original.webp',output:'portrait.png',fullArtwork:'full.webp',design});
  assert.equal(portrait.img,'portrait.png');
  assert.equal(portrait[flag+'.source'],'full.webp');
  assert.equal(portrait[flag+'.portrait'].source,'portrait-original.webp');
  assert.ok(Object.keys(portrait).every(key=>!key.startsWith('prototypeToken.')));
  const actor={img:portrait.img,flags:{'adventurers-tome':{tokenArtV1:{displayMode:'portrait',portrait:portrait[flag+'.portrait'],source:portrait[flag+'.source']}}}};
  assert.equal(savedActorDisplayArtwork(actor),'portrait.png');
  assert.equal(actorFullArtwork(actor,'another.jpg'),'full.webp');
});

test('the static thumbnail can stay independent of the Realm Guard prototype texture',()=>{
  const patch=actorArtworkUpdate({mode:'token',source:'full.webp',output:'token.png',poster:'portrait.png',design:normalizeTokenArt()});
  const actor={img:patch.img,prototypeToken:{texture:{src:patch['prototypeToken.texture.src']}},flags:{'adventurers-tome':{tokenArtV1:{
    displayMode:'token',source:'full.webp',tokenPoster:patch['flags.adventurers-tome.tokenArtV1.tokenPoster']
  }}}};
  assert.notEqual(actor.img,actor.prototypeToken.texture.src);
  assert.equal(tokenArtState(actor).token,'portrait.png');
  assert.equal(actorFullArtwork(actor),'full.webp');
});

test('saving the prototype syncs matching placed copies and respects custom images by default',()=>{
  const tokens=[{id:'linked',actorId:'actor',actorLink:true,texture:{src:'before.png'}},
    {id:'unlinked',actorId:'actor',actorLink:false,texture:{src:'before.png'}},
    {id:'custom',actorId:'actor',texture:{src:'custom.png'}},{id:'other',actorId:'another',texture:{src:'before.png'}}];
  const update=token=>({_id:token,'texture.src':'after.webp',lockRotation:true});
  assert.deepEqual(placedTokenArtworkUpdates(tokens,'actor','before.png','after.webp',true),[update('linked'),update('unlinked')]);
  assert.deepEqual(placedTokenArtworkUpdates(tokens,'actor','before.png','after.webp',true,{replaceCustom:true}),[update('linked'),update('unlinked'),update('custom')]);
});

test('Home uses the portrait or falls back to full artwork independently of the Group choice',()=>{
  const actor={img:'old.png',flags:{'adventurers-tome':{tokenArtV1:{source:'full.png',displayMode:'token'}}}};
  assert.equal(actorHomeArtwork(actor),'full.png');
  actor.flags['adventurers-tome'].tokenArtV1.portrait={image:'portrait.png'};
  assert.equal(actorHomeArtwork(actor),'portrait.png');
});

test('artwork updates keep distinct choices for Actors, Group, Home and the sheet while syncing placed tokens',async()=>{
  const src = readFileSync(new URL('../scripts/token-builder.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const actor={id:'marvin',uuid:'Actor.marvin',documentName:'Actor',type:'character',img:'old-sheet.png',canUserModify:()=>false,
    prototypeToken:{texture:{src:'old-token.png'},ring:{subject:{texture:'old-prototype-ring.png'}}},
    flags:{'adventurers-tome':{tokenArtV1:{source:'full.png',portrait:{image:'old-sheet.png'}}}}};
  const token={id:'a',actorId:actor.id,texture:{src:'old-token.png'}};
  const custom={id:'b',actorId:actor.id,texture:{src:'stale-token.png'},ring:{subject:{texture:'stale-ring.png'}}};
  const other={id:'other',actorId:'different-actor',texture:{src:'old-token.png'}};
  const scene=(...tokens)=>({tokens:{contents:tokens},canUserModify:()=>true,updateEmbeddedDocuments:async(type,changes)=>{
    assert.equal(type,'Token');
    for (const {_id,...change} of changes) {
      const token=tokens.find(token=>token.id===_id);
      for (const [path,value] of Object.entries(change)) setProperty(token,path,value);
    }
  }});
  const game={user:{id:'gm',can:permission=>permission==='FILES_UPLOAD'},world:{id:'qa'},system:{id:'realm-guard'},actors:new Map([[actor.id,actor]]),
    scenes:{contents:[scene(token,other),scene(custom)]}};
  const classes=()=>({add(){},contains:()=>false});
  const image=src=>({src,classList:classes(),getAttribute(){return this.src;},toggleAttribute(){}});
  const home=image('old-home.png');
  home.dataset={atTbHomeActor:actor.id};
  const thumbnail=Object.assign(image('old-directory.png'),{tagName:'IMG',toggleAttribute(){}});
  const npc={id:'npc',name:'NPC',type:'npc',documentName:'Actor',img:'npc-portrait.png',prototypeToken:{texture:{src:'npc-token.png'}}};
  game.actors.set(npc.id,npc);
  const npcThumbnail=Object.assign(image(npc.img),{hasAttribute:()=>false});
  const directory={dataset:{},querySelector(){},querySelectorAll:()=>[
    {dataset:{entryId:actor.id},querySelector:()=>thumbnail},
    {dataset:{entryId:npc.id},querySelector:()=>npcThumbnail}
  ]};
  const sheetImage=image('old-from-system.png'),groupImage=image('full.png');
  const choiceEvents={};
  const chooser={value:'',addEventListener:(name,callback)=>{choiceEvents[name]=callback;}};
  const groupBar={querySelector:selector=>selector==='select'?chooser:null};
  const sheetEvents={};
  const sheetChooser={value:'',addEventListener:(name,callback)=>{sheetEvents[name]=callback;}};
  const sheetBar={querySelector:selector=>selector==='select'?sheetChooser:null};
  const makeArt=bar=>({dataset:{},classList:classes(),addEventListener(){},querySelector:selector=>selector==='[data-at-tb-portrait]'?bar:null});
  const groupArt={...makeArt(groupBar),dataset:{atTbGroupActor:actor.id}};
  groupArt.querySelector=selector=>selector==='img'?groupImage:selector==='[data-at-tb-portrait]'?groupBar:null;
  const sheetArt=makeArt(sheetBar);
  sheetImage.closest=()=>sheetArt;
  const sheet={dataset:{},querySelector:()=>sheetImage};
  const root={querySelectorAll:selector=>selector==='[data-at-tb-home-actor]'?[home]:selector==='[data-at-tb-group-actor]'?[groupArt]:[]};
  const app={rendered:true,element:root};
  groupArt.closest=()=>root;
  const api={app:()=>app,canView:()=>true,getActorProfile:()=>({heroImage:'profile.png'})};
  game.modules={get:()=>({api})};
  const stored=new Map([['adventurers-tome.portrait.qa.gm.Actor.marvin.group','full']]);
  const hooks=new Map(),listeners=new Map();
  const setProperty=(obj,path,value)=>{
    const parts=path.split('.'),key=parts.pop();
    for (const part of parts) obj=obj[part]??={};
    obj[key]=value;
  };
  actor.update=async patch=>{
    for (const [path,value] of Object.entries(patch)) setProperty(actor,path,value);
    hooks.get('updateActor')(actor,patch);
  };
  const context=vm.createContext({TOKEN_ART_FLAG,actorArtworkUpdate,placedTokenArtworkUpdates,tokenArtState,actorFullArtwork,actorHomeArtwork,actorPortraitArtwork,savedActorDisplayArtwork,isPlayerCharacter,
    game,document:{querySelectorAll:selector=>selector==='[data-at-tb-actor-directory]'?[directory]:[sheet],getElementById:()=>root,addEventListener:(name,callback)=>listeners.set(name,callback)},
    localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
    ui:{notifications:{warn(message){assert.fail(message);}}},Hooks:{once:(key,callback)=>hooks.set(key,callback),on:(key,callback)=>hooks.set(key,callback)},
    foundry:{utils:{hasProperty:(obj,path)=>path.split('.').reduce((value,key)=>value?.[key],obj)!==undefined}}});
  vm.runInContext(src,context);
  const synthetic={...actor,isToken:true,token:{actorId:actor.id},flags:{},img:'stale-synthetic.png'};
  hooks.get('renderApplicationV2')({actor:synthetic},sheet);
  const legacyButton={
    closest(selector){if(selector==='[data-at-tb-actor-sheet]')return sheet;if(selector.includes('portraitSettings'))return this;return null;}
  };
  const action=context.sheetArtworkAction(legacyButton);
  assert.equal(action.actor,synthetic);
  assert.equal(action.portrait,true);
  const opened=[];
  context.openTokenBuilder=async (document,options)=>opened.push({document,options});
  hooks.get('ready')();
  game.actors.get(actor.id).canUserModify=()=>true;
  let intercepted=false;
  listeners.get('click')({target:legacyButton,preventDefault(){intercepted=true;},stopImmediatePropagation(){}});
  assert.equal(intercepted,true);
  assert.equal(opened[0].document,synthetic);
  assert.equal(opened[0].options.portrait,true);
  const file={type:'image/png'};
  sheetArt.closest=selector=>selector==='[data-at-tb-actor-sheet]'?sheet:sheetArt;
  listeners.get('drop')({target:sheetArt,dataTransfer:{files:[file]},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(opened[1].options.file,file);
  assert.equal(opened[1].options.portrait,true);
  actor.canUserModify=()=>false;
  hooks.get('adventurersTomeViewPrepared')(app,root);
  hooks.get('renderActorDirectory')({},directory);
  assert.equal(thumbnail.src,'old-token.png');
  assert.equal(npcThumbnail.src,'npc-portrait.png');
  assert.equal(groupImage.src,'full.png');
  assert.equal(home.src,'old-sheet.png');
  assert.equal(sheetImage.src,home.src);
  chooser.value='portrait';
  choiceEvents.change();
  assert.equal(home.src,'old-sheet.png');
  assert.equal(groupImage.src,home.src);
  assert.equal(sheetImage.src,home.src);
  sheetChooser.value='full';
  sheetEvents.change();
  assert.equal(home.src,'old-sheet.png');
  assert.equal(groupImage.src,home.src);
  assert.equal(sheetImage.src,'full.png');
  const options={owner:'gm',world:'qa',lockRotation:true,replacePlaced:true,fullArtwork:'full.png'};
  await context.saveActorArtwork(actor,tokenArtState(actor),{full:'new-full.png',output:'new-portrait.png'},normalizeTokenArt(),{...options,portrait:true,fullArtwork:'new-full.png'});
  assert.equal(home.src,'new-portrait.png');
  assert.equal(groupImage.src,home.src);
  assert.equal(sheetImage.src,'new-full.png');
  assert.equal(thumbnail.src,'old-token.png');
  assert.equal(actorFullArtwork(actor),'new-full.png');
  assert.equal(token.texture.src,'old-token.png');
  await context.saveActorArtwork(actor,tokenArtState(actor),{full:'full.png',output:'new-token.png'},normalizeTokenArt(),options);
  assert.equal(actor.prototypeToken.texture.src,'new-token.png');
  assert.equal(actor.prototypeToken.ring.subject.texture,'new-token.png');
  assert.equal(token.texture.src,'new-token.png');
  assert.equal(custom.texture.src,'new-token.png');
  assert.equal(custom.ring.subject.texture,'new-token.png');
  assert.equal(other.texture.src,'old-token.png');
  assert.equal(sheetImage.src,'full.png');
  chooser.value='token';
  choiceEvents.change();
  assert.equal(thumbnail.src,'new-token.png');
  assert.equal(home.src,'new-portrait.png');
  assert.equal(groupImage.src,'new-token.png');
  assert.equal(sheetImage.src,'full.png');
  assert.equal(stored.get('adventurers-tome.portrait.qa.gm.Actor.marvin.group'),'token');
  assert.equal(stored.get('adventurers-tome.portrait.qa.gm.Actor.marvin.sheet'),'full');
});
