import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture(name,globals={}) {
  const hooks=new Map();
  const source=readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const context=vm.createContext({...globals,Hooks:{on:(key,fn)=>hooks.set(key,fn),once:(key,fn)=>hooks.set(key,fn)}});
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
  const choices=new Map([['sceneDefaultsEnabled',true],['sceneDefaultTokenVision',false],['sceneDefaultGlobalLight',true],['sceneDefaultGridType',2],['sceneDefaultGridSize',90],['mapPinStyle','borderless']]);
  const {hooks}=fixture('foundry-scene-tools',{game:{user:{isGM:true},settings:{get:(_id,key)=>choices.get(key)}}});
  const writes=[];
  const document={updateSource:patch=>writes.push({...patch})};
  const create=hooks.get('preCreateScene');
  create(document,{tokenVision:true,grid:{type:0}},{});
  create(document,{_id:'imported'},{});
  create(document,{}, {fromCompendium:true});
  assert.deepEqual(writes,[{'environment.globalLight.enabled':true,'grid.size':90}]);
  const note={document:{flags:{}},controlIcon:{bg:{visible:true},border:{visible:true}}};
  hooks.get('refreshNote')(note);
  assert.equal(note.controlIcon.bg.visible,false);
  assert.equal(note.controlIcon.border.visible,true);
  note.document.flags['adventurers-tome']={notePinStyle:'standard'};
  hooks.get('refreshNote')(note);
  assert.equal(note.controlIcon.bg.visible,true);
});

test('scene access preserves existing owner permissions without widening them on save',async()=>{
  const scene={id:'aa',name:'Test',ownership:{default:0,player:3},update:async patch=>writes.push({...patch})};
  const game={user:{id:'gm',isGM:true},world:{id:'qa'},scenes:new Map([[scene.id,scene]]),users:{contents:[{id:'player'},{id:'second'}]}};
  const writes=[];
  const {context}=fixture('foundry-scene-tools',{game,CONST:{DOCUMENT_OWNERSHIP_LEVELS:{LIMITED:1,NONE:0}},foundry:{utils:{escapeHTML:String},applications:{api:{DialogV2:{prompt:async()=>[['default','hide'],['player','show'],['second','show']]}}}}});
  await context.editSceneAccess(scene);
  assert.deepEqual(writes,[{'ownership.second':1}]);
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
  const token={hidden:true,actor:tokenActor};
  const game={user:{isGM:false},scenes:new Map([['map',{tokens:new Map([['speaker',token]])}]]),actors:new Map([[tokenActor.id,tokenActor]])};
  const {context}=fixture('foundry-chat-portraits',{game});
  const speaker={scene:'map',token:'speaker',actor:tokenActor.id};
  assert.equal(context.speakerActor(speaker),null);
  game.user.isGM=true;
  assert.equal(context.speakerActor(speaker),tokenActor);
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
  const portrait='modules/adventurers-tome/assets/gm-chronicler.png';
  assert.equal(render({author:gm,speaker:{}}),portrait);
  assert.equal(render({author:gm,style:1,speaker:{actor:'guide'}}),portrait);
  assert.equal(render({author:gm,style:2,speaker:{actor:'guide'}}),actor.img);
  assert.equal(render({author:gm,style:2,speaker:{actor:'guide',scene:'map',token:'hidden'}}),undefined);
  assert.equal(render({author:player,speaker:{}}),undefined);
  assert.equal(render({author:gm,speaker:{},isContentVisible:false}),undefined);
  assert.equal(render({author:gm,speaker:{},blind:true}),undefined);
  settings.chatSpeakerPortraits=false;
  assert.equal(render({author:gm,speaker:{}}),undefined);
});
