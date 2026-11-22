import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {isPlayerCharacter} from '../scripts/player-character-core.mjs';
import {presentationAuthorityUuid} from '../scripts/player-visibility.mjs';

function fixture(name,globals={}) {
  const hooks=new Map();
  const source=readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export (?=(?:async )?function )/gm,'');
  const context=vm.createContext({isPlayerCharacter,presentationAuthorityUuid,CONST:{CHAT_MESSAGE_STYLES:{OOC:1}},...globals,
    Hooks:{on:(key,fn)=>hooks.set(key,fn),once:(key,fn)=>hooks.set(key,fn)}});
  vm.runInContext(source,context);
  return {context,hooks};
}

test('directory export includes selected documents and canceled deletion performs no write',async()=>{
  const exports=[],deleted=[],moved=[];
  let confirm=false;
  const game={user:{id:'gm',isGM:true},world:{id:'world'},folders:{contents:[]}};
  const {context}=fixture('foundry-directory-tools',{
    game,foundry:{utils:{escapeHTML:String,saveDataToFile:content=>exports.push(JSON.parse(content))},applications:{api:{DialogV2:{confirm:async()=>confirm,prompt:async()=>''}}}}
  });
  const collection=new Map(['selected','other'].map(id=>[id,{id,name:id,documentName:'JournalEntry',toObject:()=>({_id:id})}]));
  collection.documentClass={deleteDocuments:async ids=>deleted.push(...ids),updateDocuments:async rows=>moved.push(...rows)};
  await context.runBulk('export',collection,new Set(['selected']));
  await context.runBulk('delete',collection,new Set(['selected']));
  assert.deepEqual(exports[0].documents,[{_id:'selected'}]);
  assert.equal(deleted.length,0);
  await context.runBulk('move',collection,new Set(['selected']));
  assert.deepEqual(moved.map(({_id,folder})=>[_id,folder]),[['selected',null]]);
  confirm=true;
  await context.runBulk('delete',collection,new Set(['selected']));
  assert.deepEqual(deleted,['selected']);
});

test('scene defaults fill unset fields and pin appearance can override the world default',()=>{
  const choices=new Map([['sceneDefaultsEnabled',true],['sceneDefaultTokenVision',false],['sceneDefaultGlobalLight',true],['sceneDefaultGridType',0],['sceneDefaultGridSize',90],
    ['sceneDefaultWidth',2400],['sceneDefaultHeight',1600],['sceneDefaultBackgroundColor','#000000'],['mapPinStyle','borderless']]);
  const {hooks}=fixture('foundry-scene-tools',{game:{user:{isGM:true},settings:{get:(_id,key)=>choices.get(key)}}});
  const writes=[];
  const document={updateSource:patch=>writes.push({...patch})};
  const create=hooks.get('preCreateScene');
  create(document,{},{});
  create(document,{tokenVision:true,width:1600,backgroundColor:'#ffffff',grid:{type:2}},{});
  create(document,{_id:'imported'},{});
  create(document,{}, {fromCompendium:true});
  assert.deepEqual(writes,[
    {width:2400,height:1600,backgroundColor:'#000000',tokenVision:false,'environment.globalLight.enabled':true,'grid.type':0,'grid.size':90},
    {height:1600,'environment.globalLight.enabled':true,'grid.size':90}
  ]);
  const note={document:{flags:{}},controlIcon:{bg:{visible:true},border:{visible:true}}};
  hooks.get('refreshNote')(note);
  assert.equal(note.controlIcon.bg.visible,false);
  assert.equal(note.controlIcon.border.visible,true);
  note.document.flags['adventurers-tome']={notePinStyle:'standard'};
  hooks.get('refreshNote')(note);
  assert.equal(note.controlIcon.bg.visible,true);
});

test('scene defaults save future values separately and apply only checked fields to confirmed world scenes',async()=>{
  const settings=new Map([
    ['sceneDefaultGridType',1],['sceneDefaultGridSize',100],['sceneDefaultWidth',0],['sceneDefaultHeight',0],
    ['sceneDefaultBackgroundColor','#000000'],['sceneDefaultTokenVision',true],['sceneDefaultGlobalLight',false]
  ]);
  const writes=[],messages=[];
  const scenes=new Map([['bree',{id:'bree',name:'Bree'}],['inn',{id:'inn',name:'Inn'}]]);
  scenes.contents=[...scenes.values()];
  scenes.documentClass={updateDocuments:async rows=>writes.push(...Array.from(rows,row=>({...row})))};
  const game={user:{id:'gm',isGM:true},world:{id:'qa'},scenes,settings:{
    get:(_id,key)=>settings.get(key),set:async(_id,key,value)=>settings.set(key,value)
  }};
  const values={gridType:'0',gridSize:'100',width:'0',height:'0',backgroundColor:'#123456'};
  const applyFields=new Set(['gridType','globalLight']);
  const elements=new Proxy(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}])),{
    get:(fields,key)=>fields[key]??{checked:['enabled','tokenVision'].includes(key)||applyFields.has(key.replace(/^apply-/,''))&&key.startsWith('apply-')}
  });
  let action='save',all=false,confirmed=false;
  const {context}=fixture('foundry-scene-tools',{game,ui:{notifications:{
    info:message=>messages.push(message),warn:message=>messages.push(message)
  }},foundry:{utils:{escapeHTML:String},applications:{api:{DialogV2:{
    wait:async options=>options.buttons.find(button=>button.action===action).callback(null,{form:{elements}}),
    prompt:async options=>options.ok.callback(null,{form:{elements:{allScenes:{checked:all}},querySelectorAll:()=>[{value:'inn'}]}}),
    confirm:async options=>{
      assert.match(options.content,/Gridless/);
      assert.match(options.content,/Global illumination: <strong>Off/);
      assert.doesNotMatch(options.content,/Background color|Width/);
      return confirmed;
    }
  }}}}});
  await context.editSceneDefaults();
  assert.equal(settings.get('sceneDefaultGridType'),0);
  assert.equal(settings.get('sceneDefaultBackgroundColor'),'#123456');
  assert.equal(settings.get('sceneDefaultsEnabled'),true);
  assert.equal(writes.length,0);
  action='apply';
  elements.backgroundColor.value='#ffffff';
  await context.editSceneDefaults();
  assert.equal(writes.length,0);
  confirmed=true;
  await context.editSceneDefaults();
  assert.deepEqual(writes,[{_id:'inn','grid.type':0,'environment.globalLight.enabled':false}]);
  all=true;
  await context.editSceneDefaults();
  assert.deepEqual(writes.slice(1).map(row=>row._id),['bree','inn']);
  assert.equal(settings.get('sceneDefaultBackgroundColor'),'#123456');
  applyFields.add('width');
  await context.editSceneDefaults();
  assert.match(messages.at(-1),/explicit size/);
  game.user.isGM=false;
  await context.editSceneDefaults();
  assert.equal(writes.length,3);
});

test('scene access preserves existing owner permissions without widening them on save',async()=>{
  const scene={id:'aa',name:'Test',ownership:{default:0,player:3},update:async patch=>writes.push({...patch})};
  const game={user:{id:'gm',isGM:true},world:{id:'qa'},scenes:new Map([[scene.id,scene]]),users:{contents:[{id:'player'},{id:'second'}]}};
  const writes=[];
  const {context}=fixture('foundry-scene-tools',{game,CONST:{DOCUMENT_OWNERSHIP_LEVELS:{LIMITED:1,NONE:0}},foundry:{utils:{escapeHTML:String},applications:{api:{DialogV2:{prompt:async()=>[['default','hide'],['player','show'],['second','show']]}}}}});
  await context.editSceneAccess(scene);
  assert.deepEqual(writes,[{'ownership.second':1}]);
});

test('scene panel shows only available scenes to players, uses public names and separates viewing from activation',async()=>{
  const calls=[];
  const scene={id:'fornost',name:'Fornost – ambush',navName:'Fornost',navigation:true,visible:true,
    view:async()=>calls.push('view'),activate:async()=>calls.push('activate')};
  const secret={id:'secret',name:'Secret cave',navigation:true,visible:false};
  let favorites=[];
  const game={user:{isGM:false},scenes:{contents:[scene,secret]},settings:{
    get:()=>favorites,set:async(_module,_key,value)=>{favorites=[...value];}
  }};
  const {context}=fixture('foundry-scene-tools',{game,foundry:{utils:{escapeHTML:String}}});
  assert.equal(context.sceneRows().length,1);
  assert.equal(context.sceneName(scene),'Fornost');
  assert.doesNotMatch(context.scenePanelRow(scene,new Set()),/ambush|data-scene-command="activate"/);
  await assert.rejects(context.runSceneCommand('view','secret'),/no longer available/);
  await assert.rejects(context.runSceneCommand('activate',scene.id),/Only the GM/);
  await context.runSceneCommand('view',scene.id);
  await context.runSceneCommand('favorite',scene.id);
  assert.deepEqual(favorites,[scene.id]);
  assert.deepEqual(calls,['view']);
  game.user.isGM=true;
  assert.equal(context.sceneRows().length,2);
  assert.match(context.scenePanelRow(scene,new Set()),/Fornost – ambush.*[\s\S]*Activate for everyone/);
  await context.runSceneCommand('activate',scene.id);
  assert.deepEqual(calls,['view','activate']);
});

test('scene navigation registers its own hosted Tools icon and keeps similarly named folders distinct',()=>{
  const providers=new Map(),actions=new Map();
  const host={contract:'gbf-gm-dock-host',hasProvider:id=>providers.has(id),registerProvider:tool=>providers.set(tool.id,tool)};
  const api={gmDock:{registerAction:(id,tool)=>actions.set(id,tool)}};
  const game={user:{isGM:true},modules:new Map([['adventurers-tome',{api}]])};
  const {context,hooks}=fixture('foundry-scene-tools',{game,GuteboysFactory:{gmDockHost:host},installSceneDropTarget(){}});
  hooks.get('ready')();
  assert.equal(providers.get('adventurers-tome-scenes').menu().items[0].onClick,api.sceneNavigation.open);
  assert.equal(actions.get('scene-navigation').visible(),false);
  const parent={id:'main',name:'Region'};
  const folder=id=>({id,name:'Area',getParentFolders:()=>[parent]});
  const tree=context.sceneFolderTree([{id:'one',folder:folder('a')},{id:'two',folder:folder('b')}]);
  const children=tree.children.get(parent.id).children;
  assert.equal(children.size,2);
  assert.equal(children.get('b').scenes[0].id,'two');
});

test('scene panel settings save only for the GM and keep the compact bar as a client preference',async()=>{
  const saved=[];
  const game={user:{id:'gm',isGM:true},world:{id:'world'},settings:{
    get:(_id,key)=>key==='sceneNavigationOptions'?{folders:'gm',gmRealNames:false}:false,
    set:async(_id,key,value)=>saved.push([key,value])
  }};
  let dialogShown=false;
  const {context}=fixture('foundry-scene-tools',{game,foundry:{applications:{api:{DialogV2:{prompt:async options=>{
    dialogShown=true;
    assert.match(options.content,/Show Previous scene|Show original scene names/);
    const elements=new Proxy({compact:{checked:true},folders:{value:'gm'},previous:{value:'none'},directoryDensity:{value:'text'}},
      {get:(target,key)=>target[key]??{checked:key==='closeOnActivate'}});
    return options.ok.callback(null,{form:{elements}});
  }}}}}});
  assert.equal(context.sceneName({name:'Private',navName:'Public'}),'Public');
  await context.editSceneNavigationSettings();
  assert.equal(dialogShown,true);
  assert.equal(saved[0][0],'sceneNavigationOptions');
  assert.equal(saved[0][1].closeOnActivate,true);
  assert.equal(saved[0][1].directoryDensity,'text');
  assert.deepEqual(saved[1],['compactSceneNavigation',true]);
  game.user.isGM=false;
  assert.equal(context.includedForViewer('gm'),false);
  dialogShown=false;
  await context.editSceneNavigationSettings();
  assert.equal(dialogShown,false);
});

test('scene actions save the current camera and require GM authorization before moving players',async()=>{
  const writes=[],pulled=[];
  const scene={id:'map',name:'Map',isView:true,navigation:false,
    update:async data=>writes.push(data),pullUsers:users=>pulled.push(...users.map(user=>user.id))};
  const game={user:{id:'gm',isGM:true},world:{id:'world'},scenes:new Map([[scene.id,scene]]),
    users:{contents:[{id:'gm',isGM:true,active:true},{id:'player',active:true},{id:'offline',active:false}]}};
  let choice='start',confirmed=false;
  const {context}=fixture('foundry-scene-tools',{game,canvas:{ready:true,scene,stage:{pivot:{x:120.1,y:360.8},scale:{x:1.5}}},
    foundry:{utils:{escapeHTML:String},applications:{api:{DialogV2:{wait:async options=>{
      assert.ok(options.buttons.some(button=>button.action===choice));
      return choice;
    },confirm:async()=>confirmed}}}}
  });
  await context.editSceneTools(scene);
  assert.equal(writes[0].initial.x,120);
  assert.equal(writes[0].initial.y,361);
  assert.equal(writes[0].initial.scale,1.5);
  choice='navigation';
  await context.editSceneTools(scene);
  assert.equal(writes[1].navigation,true);
  choice='pull';
  await context.editSceneTools(scene);
  assert.deepEqual(pulled,[]);
  confirmed=true;
  await context.editSceneTools(scene);
  assert.deepEqual(pulled,['player']);
  game.user.isGM=false;
  await context.editSceneTools(scene);
  assert.deepEqual(pulled,['player']);
});

test('manual and dropped scene images share the same private batch import and do not overwrite same-name files',async()=>{
  const writes=[],uploads=[],notifications=[],urls=[];
  const game={user:{id:'gm',isGM:true,can:()=>true},world:{id:'test-world'}};
  const picker={createDirectory:async()=>{},upload:async(_source,folder,file)=>{
    uploads.push(file.name);
    return {path:folder+'/'+file.name};
  }};
  let unique=0;
  const {context}=fixture('scene-image-import',{game,File,filePickerClass:()=>picker,
    Image:class{naturalWidth=1800;naturalHeight=1200;async decode(){}},
    URL:{createObjectURL:()=>String(urls.push('opened')),revokeObjectURL:()=>urls.push('closed')},
    foundry:{utils:{randomID:()=>String(++unique)}},
    getDocumentClass:type=>{assert.equal(type,'Scene');return {create:async data=>writes.push(data)};},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}},
    ui:{notifications:{info:x=>notifications.push(x),warn:x=>notifications.push(x),error:x=>assert.fail(x)}}
  });
  const files=[new File(['image'],'Fornost.png',{type:'image/png'}),new File(['text'],'Notes.txt',{type:'text/plain'}),
    new File(['image'],'Fornost.png',{type:'image/png'})];
  const result=await context.importSceneImages(files,dimensions=>dimensions);
  assert.equal(result.created,2);
  assert.equal(result.failures.length,1);
  assert.equal(new Set(uploads).size,2);
  assert.deepEqual(writes.map(scene=>[scene.name,scene.width,scene.height,scene.active,scene.navigation,scene.ownership.default]),
    [['Fornost',1800,1200,false,false,0],['Fornost',1800,1200,false,false,0]]);
  assert.ok(writes.every(scene=>scene.background.src.startsWith('worlds/test-world/adventurers-tome/scene-images/')));
  assert.equal(urls.filter(value=>value==='closed').length,2);
  assert.ok(notifications.some(value=>value.startsWith('Notes.txt')));
  const picked=[];
  const input={files:[files[0]],value:'Fornost.png',click:()=>picked.push('open')};
  const button={};
  context.bindSceneImportInput({querySelector:selector=>selector==='[data-scene-image-files]'?input:button},async fileList=>picked.push(...fileList));
  button.onclick();
  input.onchange();
  assert.deepEqual(picked,['open',files[0]]);
  assert.equal(input.value,'');
  assert.equal(input.multiple,true);
  assert.match(input.accept,/image\/png/);
  game.user.isGM=false;
  assert.equal(context.sceneImportControls(),'');
  await assert.rejects(context.importSceneImages(files,dimensions=>dimensions),/Only the GM/);
});

test('scene image defaults use image size unless Tome explicitly configures the dimension',async()=>{
  const choices=new Map([['sceneDefaultsEnabled',true],['sceneDefaultWidth',1600],['sceneDefaultHeight',0]]);
  const game={settings:{get:(_scope,key)=>choices.get(key)}};
  let dimensions;
  const {context}=fixture('foundry-scene-tools',{game,importSceneImages:async(_files,applyDimensions)=>{
    const result=applyDimensions({width:2400,height:1800});
    dimensions=[result.width,result.height];
  }});
  await context.createScenesFromImages([]);
  assert.deepEqual(dimensions,[1600,1800]);
  choices.set('sceneDefaultsEnabled',false);
  await context.createScenesFromImages([]);
  assert.deepEqual(dimensions,[2400,1800]);
});

test('scene drop target lets canvas image drops reach the NPC handler and claims only its own drops',()=>{
  const handlers=new Map(),imports=[];
  const board={},target={classList:{toggle(){}},contains:element=>element===target,remove(){}};
  let shown=0;
  const {context}=fixture('scene-image-import',{
    game:{user:{isGM:true,can:()=>true}},canvas:{ready:true,app:{canvas:board}},
    document:{addEventListener:(name,fn)=>handlers.set(name,fn),body:{append:()=>shown++},createElement:()=>target},
    window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){}
  });
  context.installSceneDropTarget(async files=>imports.push(...files));
  const file=new File(['map'],'Bree.webp',{type:'image/webp'});
  const transfer={types:['Files'],items:[{kind:'file',type:'image/webp'}],files:[]};
  const over={target:board,dataTransfer:transfer,preventDefault:()=>assert.fail('Tome claimed the map')};
  handlers.get('dragover')(over);
  handlers.get('drop')({...over,dataTransfer:{files:[file]}});
  assert.equal(shown,1);
  assert.deepEqual(imports,[]);
  handlers.get('dragover')(over);
  let prevented=false,stopped=false;
  handlers.get('drop')({target,dataTransfer:{files:[file]},preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}});
  assert.equal(prevented,true);
  assert.equal(stopped,true);
  assert.deepEqual(imports,[file]);
});

test('default book pins display a ring for World locations and parchment for notes without changing the document',async()=>{
  const {hooks}=fixture('foundry-scene-tools',{
    game:{settings:{get:()=> 'standard'}},
    foundry:{canvas:{loadTexture:async path=>({path})}}
  });
  for (const [category,icon] of [['location','map-location.svg'],['lore','map-parchment.svg']]) {
    const document={texture:{src:'icons/svg/book.svg'},entry:{flags:{'adventurers-tome':{worldProfile:{category}}}}};
    const note={document,controlIcon:{bg:{visible:true},icon:{},size:40}};
    await hooks.get('drawNote')(note);
    assert.equal(note.controlIcon.bg.visible,false);
    assert.ok(note.controlIcon.icon.texture.path.endsWith(icon));
    assert.equal(document.texture.src,'icons/svg/book.svg');
  }
});

test('a hidden speaker token does not publish its portrait to a player',()=>{
  const tokenActor={id:'possibly-visible-base'};
  const token={hidden:true,actor:tokenActor,texture:{src:'tokens/speaker.webp'}};
  const game={user:{isGM:false},modules:new Map(),scenes:new Map([['map',{tokens:new Map([['speaker',token]])}]]),actors:new Map([[tokenActor.id,tokenActor]])};
  const {context}=fixture('foundry-chat-portraits',{game});
  const speaker={scene:'map',token:'speaker',actor:tokenActor.id};
  assert.equal(context.messagePortrait({speaker}),undefined);
  game.user.isGM=true;
  assert.equal(context.messagePortrait({speaker}),token.texture.src);
});

test('chat uses the Chronicler for the GM as author and preserves actor portraits and message visibility',()=>{
  const gm={isGM:true},player={isGM:false},actor={img:'actors/guide.png',testUserPermission:()=>true};
  const hidden={hidden:true,actor};
  const settings={chatSpeakerPortraits:true,chatPortraitShape:'circle',chatPortraitSize:36};
  const game={user:player,settings:{get:(_id,key)=>settings[key]},modules:new Map(),
    actors:new Map([['guide',actor]]),scenes:new Map([['map',{tokens:new Map([['hidden',hidden]])}]])};
  const document={baseURI:'http://foundry.test/game',createElement:()=>({dataset:{},addEventListener(){}})};
  const {hooks}=fixture('foundry-chat-portraits',{game,document,URL,CONST:{CHAT_MESSAGE_STYLES:{OOC:1}},
    tokenArtState:()=>({}),savedActorDisplayArtwork:()=>''});
  const render=message=>{
    let path;
    const header={querySelector:()=>null,prepend:image=>{path=image.src;}};
    hooks.get('renderChatMessageHTML')(message,{querySelector:()=>header});
    return path;
  };
  const portrait=new URL('modules/adventurers-tome/assets/gm-chronicler.png',document.baseURI).href;
  assert.equal(render({author:gm,speaker:{}}),portrait);
  assert.equal(render({author:gm,style:1,speaker:{actor:'guide'}}),portrait);
  assert.equal(render({author:gm,style:2,speaker:{actor:'guide'}}),new URL(actor.img,document.baseURI).href);
  assert.equal(render({author:gm,style:2,speaker:{actor:'guide',scene:'map',token:'hidden'}}),undefined);
  assert.equal(render({author:player,speaker:{}}),undefined);
  assert.equal(render({author:gm,speaker:{},isContentVisible:false}),undefined);
  assert.equal(render({author:gm,speaker:{},blind:true}),undefined);
  settings.chatSpeakerPortraits=false;
  assert.equal(render({author:gm,speaker:{}}),undefined);
});

test('a player gets a non-hidden speaking token portrait across canvas changes without gaining private Actor artwork',()=>{
  const actor={img:'private/portrait.png',testUserPermission:()=>false};
  const token={actor,texture:{src:'tokens/visible.webp'},object:{visible:true}};
  const scene={id:'map',tokens:new Map([['speaker',token]])};
  const canvas={scene:{id:scene.id},ready:false,tokens:{get:()=>token.object}};
  token.object.document=token;
  const message={speaker:{scene:'map',actor:'npc',token:'speaker'}};
  let rendered, frame;
  const sender={textContent:'NPC'};
  const header={querySelector:selector=>selector==='.message-sender'?sender:rendered,prepend:node=>{rendered=node;}};
  const row={dataset:{messageId:'message'},querySelector:()=>header};
  const document={baseURI:'http://foundry.test/game',querySelectorAll:()=>[row],
    createElement:tag=>({tag,dataset:{},setAttribute(){},addEventListener(){},remove(){rendered=undefined;}})};
  const game={user:{isGM:false},modules:new Map(),actors:new Map([['npc',actor]]),
    scenes:new Map([['map',scene]]),messages:new Map([['message',message]]),settings:{get:(_id,key)=>key==='chatSpeakerPortraits'}};
  const {hooks}=fixture('foundry-chat-portraits',{game,canvas,document,URL,CONST:{CHAT_MESSAGE_STYLES:{OOC:1}},
    requestAnimationFrame:fn=>{frame=fn;},tokenArtState:()=>assert.fail('Private Actor artwork was read')});

  hooks.get('renderChatMessageHTML')(message,row);
  assert.equal(rendered.src,'http://foundry.test/tokens/visible.webp');
  assert.equal(sender.textContent,'Unknown NPC');
  canvas.ready=true;
  hooks.get('canvasReady')();
  frame();
  assert.equal(rendered.src,'http://foundry.test/tokens/visible.webp');
  token.texture.src='tokens/new-token.webm';
  token.ring={enabled:true,subject:{texture:'tokens/tiny-ring-subject.webp'}};
  hooks.get('updateToken')();
  frame();
  assert.equal(rendered.src,'http://foundry.test/tokens/new-token.webm');
  assert.equal(rendered.tag,'video');
  assert.equal(rendered.muted,true);
  token.object.visible=false;
  hooks.get('sightRefresh')();
  frame();
  assert.equal(rendered.src,'http://foundry.test/tokens/new-token.webm');
  token.object.visible=true;
  token.hidden=true;
  hooks.get('updateToken')();
  frame();
  assert.equal(rendered,undefined);
});

test('actor-only and ordinary player chat show the assigned character across client scenes and fog of war',()=>{
  const actor={id:'pc',img:'private/character.webp',testUserPermission:()=>false};
  const author={isGM:false,_source:{character:actor.id}};
  const visible={visible:true,mesh:{visible:true},document:{actorId:actor.id,texture:{src:'tokens/character.webp'}}};
  const hidden={visible:true,document:{actorId:actor.id,hidden:true,texture:{src:'private/hidden.webp'}}};
  const canvas={scene:{id:'map'},ready:true,tokens:{placeables:[hidden,visible]}};
  const game={user:{isGM:false},scenes:new Map(),actors:new Map([[actor.id,actor]]),modules:new Map()};
  const {context}=fixture('foundry-chat-portraits',{game,canvas,CONST:{CHAT_MESSAGE_STYLES:{OOC:1}},
    tokenArtState:()=>({token:'tokens/prototype.webp'})});
  const plain={style:1,author};
  const actorSpeaker={style:2,author,speaker:{actor:actor.id,scene:'map'}};
  assert.equal(context.messagePortrait(plain),'tokens/prototype.webp');
  assert.equal(context.messagePortrait(actorSpeaker),'tokens/prototype.webp');
  assert.equal(context.messagePortrait({...actorSpeaker,speaker:{actor:actor.id,scene:'other'}}),'tokens/prototype.webp');
  const different={visible:true,document:{actorId:actor.id,texture:{src:'tokens/alternate.webp'}}};
  canvas.tokens.placeables.push(different);
  assert.equal(context.messagePortrait(plain),'tokens/prototype.webp');
  canvas.tokens.placeables.pop();
  visible.mesh.visible=false;
  assert.equal(context.messagePortrait(plain),'tokens/prototype.webp');
});

test('a player message shows its PC name and token even when another client lacks the Actor document',()=>{
  const actor={id:'edrik',name:'Edrik "Kråkan" Törne',documentName:'Actor',type:'character'};
  const author={id:'ort',isGM:false,character:actor};
  const game={user:author,actors:new Map([[actor.id,actor]]),scenes:new Map(),modules:new Map(),
    settings:{get:(_id,key)=>key==='chatSpeakerPortraits'}};
  const document={baseURI:'http://foundry.test/game',createElement:()=>({dataset:{},addEventListener(){}})};
  const {hooks}=fixture('foundry-chat-portraits',{game,document,URL,
    tokenArtState:()=>({token:'tokens/edrik.webp'})});
  const message={style:1,author,speaker:{alias:'Ortseam78'},updateSource(patch){
    this.flags={'adventurers-tome':{chatSpeakerV1:patch['flags.adventurers-tome.chatSpeakerV1']}};
  }};
  hooks.get('preCreateChatMessage')(message,{}, {},author.id);
  game.user={id:'guteboy',isGM:false};
  game.actors.clear();
  message.author={id:author.id,isGM:false,_source:{character:actor.id}};
  const sender={textContent:'Ortseam78'};
  let image;
  const header={querySelector:selector=>selector==='.message-sender'?sender:null,prepend:value=>{image=value;}};
  hooks.get('renderChatMessageHTML')(message,{querySelector:()=>header});
  assert.equal(sender.textContent,actor.name);
  assert.equal(image.src,'http://foundry.test/tokens/edrik.webp');
});

test('NPC chat exposes only the known name chosen by the GM and does not snapshot unrevealed names',()=>{
  const actor={id:'npc',name:'Pallando’s private name',documentName:'Actor',type:'npc',testUserPermission:()=>false};
  const gm={id:'gm',isGM:true};
  const npcToken={id:'npc-token',actorId:actor.id,texture:{src:'tokens/pallando.webp'}};
  const card={name:'Pallando',getFlag:(_id,key)=>key==='knownPersonV1'?{actorUuid:'Actor.npc'}:null};
  let known=false;
  const api={canView:entry=>entry===card&&known};
  const game={user:gm,actors:new Map([[actor.id,actor]]),scenes:new Map([['map',{tokens:new Map([[npcToken.id,npcToken]])}]]),
    journal:{contents:[card]},modules:new Map([['adventurers-tome',{api}]])};
  const {context,hooks}=fixture('foundry-chat-portraits',{game,tokenArtState:()=>({})});
  let patch;
  const message={style:2,author:gm,speaker:{alias:actor.name,scene:'map',token:npcToken.id,actor:actor.id},updateSource:value=>{patch=value;}};
  hooks.get('preCreateChatMessage')(message,{}, {},gm.id);
  const flag=patch['flags.adventurers-tome.chatSpeakerV1'];
  assert.equal(patch['speaker.alias'],'Unknown NPC');
  assert.equal(Object.hasOwn(flag,'name'),false);
  assert.equal(flag.artwork,npcToken.texture.src);
  assert.equal(context.speakerLabel(message,context.chatSpeaker(message)),actor.name);
  game.user={isGM:false};
  assert.equal(context.speakerLabel(message,context.chatSpeaker(message)),'Unknown NPC');
  known=true;
  assert.equal(context.speakerLabel(message,context.chatSpeaker(message)),card.name);
  game.scenes.clear();
  message.flags={'adventurers-tome':{chatSpeakerV1:flag}};
  assert.equal(context.messagePortrait(message),npcToken.texture.src);
});

test('all Foundry player roles can pick known chat voices while GM and Assistant GM can pick hidden characters',async()=>{
  const gm={id:'gm',name:'Gamemaster',isGM:true};
  const assistant={id:'assistant',name:'Assistant',isGM:true,role:3};
  const player={id:'player',role:2};
  const npc={id:'npc',documentName:'Actor',type:'npc',name:'Pallando',testUserPermission:()=>false};
  const pc={id:'pc',documentName:'Actor',type:'character',name:'Arantor',testUserPermission:()=>false};
  const known={id:'known',documentName:'Actor',type:'npc',name:'Private NPC name',testUserPermission:()=>false};
  const card={name:'The Ranger',getFlag:(_id,key)=>key==='knownPersonV1'?{actorUuid:'Actor.known'}:null};
  player.character=pc;
  const actors=new Map([[npc.id,npc],[pc.id,pc],[known.id,known]]);
  actors.contents=[...actors.values()];
  let revealed=true;
  const game={user:gm,world:{id:'world'},actors,scenes:new Map(),journal:{contents:[card]},
    modules:new Map([['adventurers-tome',{api:{canView:entry=>entry===card&&revealed}}]])};
  let selected={actorId:npc.id};
  const {context,hooks}=fixture('foundry-chat-portraits',{
    game,document:{querySelectorAll:()=>[]},CONST:{CHAT_MESSAGE_STYLES:{IC:2,OOC:1}},
    foundry:{applications:{api:{DialogV2:{wait:async()=>selected}}}},
    tokenArtState:actor=>({token:`tokens/${actor.id}.webp`})
  });
  let command='none';
  const chat={constructor:{parse:()=>[command]}};
  const prepare=hooks.get('chatMessage');
  const initial={speaker:{actor:npc.id,token:'auto-selected'}};
  prepare(chat,'Hello',initial);
  assert.equal(initial.speaker.actor,null);
  assert.equal(context.speakerButtonLabel(),'Gamemaster');
  await context.chooseChatSpeaker();
  const data={};
  prepare(chat,'Hello',data);
  assert.equal(data.speaker.actor,npc.id);
  assert.equal(data.speaker.alias,'Unknown NPC');
  const message={author:gm,style:1,speaker:{},flags:data.flags,updateSource(patch){Object.assign(this,patch);}};
  hooks.get('preCreateChatMessage')(message,{}, {},gm.id);
  assert.equal(message.speaker.actor,npc.id);
  assert.equal(message.style,2);
  assert.equal(message['flags.adventurers-tome.-=chatComposerSpeakerV1'],null);
  assert.equal(message['flags.adventurers-tome.chatSpeakerV1'].artwork,'tokens/npc.webp');
  command='roll';
  const roll={speaker:{actor:pc.id}};
  prepare(chat,'/roll 1d20',roll);
  assert.deepEqual(roll,{speaker:{actor:pc.id}});
  game.user=assistant;
  await context.chooseChatSpeaker();
  assert.equal(context.speakerButtonLabel(),npc.name);
  game.user=player;
  command='none';
  assert.equal(context.speakerButtonLabel(),pc.name);
  await assert.rejects(context.chooseChatSpeaker(),/no longer available/);
  selected={actorId:known.id};
  await context.chooseChatSpeaker();
  const mine={};
  prepare(chat,'Hello',mine);
  assert.equal(mine.speaker.actor,known.id);
  assert.equal(mine.speaker.token,null);
  assert.equal(context.speakerButtonLabel(),card.name);
  const rejected={author:player,flags:{'adventurers-tome':{chatComposerSpeakerV1:{actorId:npc.id,authorId:player.id}}}};
  assert.equal(hooks.get('preCreateChatMessage')(rejected,{}, {},player.id),false);
  selected={actorId:null};
  await context.chooseChatSpeaker();
  assert.equal(context.speakerButtonLabel(),pc.name);
  player.role=1;
  selected={actorId:known.id};
  await context.chooseChatSpeaker();
  const basic={};
  prepare(chat,'Hello',basic);
  assert.equal(basic.speaker.actor,known.id);
  assert.equal(context.speakerButtonLabel(),card.name);
  revealed=false;
  assert.equal(context.speakerButtonLabel(),pc.name);
  assert.throws(()=>prepare(chat,'Hello',{}),/no longer available/);
  player.role=0;
  const blocked={};
  prepare(chat,'Hello',blocked);
  assert.deepEqual(blocked,{});
});
