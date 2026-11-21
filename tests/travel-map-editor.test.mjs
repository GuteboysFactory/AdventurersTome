import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {nearestOnPath,pathLength,sliceTravelPath} from '../scripts/travel-geometry.mjs';

const source = name=>readFileSync(new URL(`../scripts/${name}.js`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');

test('map marker creation uses the system Item, linked Journal and selected pin, and rolls back on failure',async()=>{
  const created=[],deleted=[];
  let failPin=false;
  const scene={id:'scene',async createEmbeddedDocuments(type,[data]){
    if(failPin) throw Error('Marker refused');
    created.push([type,data]);return [{id:'note'}];
  }};
  const result={kind:'item',itemType:'gear',name:'Supplies',size:54,icon:'icons/svg/chest.svg',visible:true,description:'<Supplies>'};
  const game={user:{id:'gm',isGM:true},system:{id:'other'},documentTypes:{Item:['gear']}};
  const ctx=vm.createContext({game,canvas:{ready:true,scene,dimensions:{rect:{contains:()=>true}}},Hooks:{once(){},on(){}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2,NONE:0}},
    foundry:{utils:{escapeHTML:value=>String(value).replaceAll('<','&lt;')},applications:{api:{DialogV2:{prompt:async()=>result}}}},
    Item:{create:async data=>{created.push(['Item',data]);return {id:'item',uuid:'Item.item',delete:async()=>deleted.push('item')};}},
    JournalEntry:{create:async data=>{created.push(['JournalEntry',data]);return {id:'journal',delete:async()=>deleted.push('journal')};}}
  });
  vm.runInContext(source('map-points'),ctx);
  const point={x:42.4,y:68.9,sceneId:scene.id};
  await ctx.create(point);
  assert.deepEqual(created.map(([type])=>type),['Item','JournalEntry','Note']);
  assert.equal(created[0][1].ownership.default,2);
  assert.equal(created[1][1].flags['adventurers-tome'].worldProfile.itemId,'item');
  assert.match(created[1][1].pages[0].text.content,/&lt;Supplies>.*@UUID\[Item.item\]/);
  const note=created[2][1];
  assert.deepEqual([note.entryId,note.x,note.y,note.iconSize],['journal',42,69,54]);
  assert.equal(note.flags['adventurers-tome'].mapWaypoint,true);
  const placeable={document:note,visible:false,controlIcon:{refresh(){}}};
  game.user.isGM=false;
  ctx.applyVisibility(placeable);
  assert.equal(placeable.visible,true);
  note.flags['adventurers-tome'].mapMarkerVisible=false;
  ctx.applyVisibility(placeable);
  assert.equal(placeable.visible,false);
  game.user.isGM=true;
  failPin=true;
  await assert.rejects(ctx.create(point),/Marker refused/);
  assert.deepEqual(deleted.sort(),['item','journal']);
  game.user.isGM=false;
  await assert.rejects(ctx.create(point),/as GM/);
});

test('board gestures save only on release, snap the flag to the route and accept a waypoint drop',async()=>{
  const handle={leg:{sceneId:'map',distance:0,points:[{x:100,y:100},{x:220,y:100},{x:220,y:220}]}};
  const changes=[],messages=[];
  const receive=async (_handle,change)=>changes.push(change);
  const note={id:'bridge',entry:{name:'Bridge'}};
  const api={partyTravel:{drawFlag(){},isWaypoint:()=>true},travelPlanner:{routeHandles:()=>[handle],groupStart:()=>handle.leg.points[0],editOnMap:receive}};
  const board={setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
  const event=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:1,target:board,preventDefault(){},stopImmediatePropagation(){}});
  class Graphics { clear(){} lineStyle(){return this;} moveTo(){return this;} lineTo(){return this;} destroy(){this.destroyed=true;} }
  const game={user:{isGM:true}},canvas={ready:true,scene:{id:'map'},dimensions:{rect:{contains:()=>true}},
    stage:{scale:{x:1}},interface:{addChild:child=>child},canvasCoordinatesFromClient:point=>point,
    notes:{placeables:[{isVisible:true,document:note,bounds:{contains:(x,y)=>x===145&&y===145}}]}};
  const ctx=vm.createContext({game,canvas,nearestOnPath,pathLength,sliceTravelPath,PIXI:{Graphics},document:{getElementById:()=>board},
    ATTestAI:{modules:{get:()=>({api})}},Hooks:{once(){},on(){}},ui:{notifications:{info:text=>messages.push(text),warn:text=>messages.push(text)}}});
  vm.runInContext(source('travel-map-editor'),ctx);

  ctx.pointerDown(event(105,80));
  ctx.pointerMove(event(222,145));
  assert.equal(changes.length,0);
  ctx.pointerUp(event(225,150));
  assert.equal(changes[0].kind,'travel');
  assert.equal(changes[0].distance,170);

  ctx.pointerDown(event(160,100));
  ctx.pointerMove(event(145,145));
  ctx.pointerUp(event(145,145));
  assert.equal(changes[1].kind,'via');
  assert.equal(changes[1].note,note);

  await ctx.armDraw();
  ctx.pointerDown(event(100,100));
  ctx.pointerMove(event(140,160));
  ctx.pointerUp(event(220,220));
  assert.equal(changes[2].kind,'draw');
  assert.equal(changes[2].points[1].y,160);

  game.user.isGM=false;
  ctx.pointerDown(event(105,80));
  ctx.pointerMove(event(220,180));
  ctx.pointerUp(event(220,180));
  assert.equal(changes.length,3);
  assert.equal(messages.length,1);

  api.travelPlanner.freeHandles=()=>[{groupId:'party',label:'Party',flag:{x:100,y:100},canMove:true}];
  api.travelPlanner.moveFlag=async (_handle,points)=>changes.push({kind:'free',points});
  ctx.pointerDown(event(110,80));
  ctx.pointerMove(event(150,118));
  ctx.pointerUp(event(220,166));
  assert.equal(changes[3].kind,'free');
  assert.deepEqual(JSON.parse(JSON.stringify(changes[3].points)),[{x:140,y:138},{x:210,y:186}]);

  canvas.stage.scale.x=0.2;
  canvas.controls={ruler:{active:true}};
  board.setPointerCapture=()=>{throw Error('Pointer already captured by the browser');};
  const start={...event(142,84),target:{},composedPath:()=>[board]};
  ctx.pointerDown(start);
  ctx.pointerMove(event(170,124));
  ctx.pointerUp(event(230,152));
  assert.deepEqual(JSON.parse(JSON.stringify(changes[4].points)),[{x:128,y:140},{x:188,y:168}]);
});
