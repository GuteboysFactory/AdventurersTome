import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {compactPath,pathLength,sliceTravelPath} from '../scripts/travel-geometry.mjs';
import {archiveRouteKey,changeTravelPlan,newTravelPlan,pinKey,publicTravelPlan,removeTravelRecords,trailMarkKey} from '../scripts/travel-plan.mjs';

const source = readFileSync(new URL('../scripts/party-travel.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm,'');

function fixture() {
  const gm = {id:'gm', isGM:true}, player = {id:'player', isGM:false};
  const privatePins = new Set(), rendered = [], flags = [];
  const hooks=new Map(), ready=[], coreReady=[];
  const scene = {id:'map', name:'Campaign map', active:true, notes:new Map()};
  function addPin(id, name, x) {
    const entry = {id:`place-${id}`, name};
    const note = {id, entry, x, y:80, get flags() { return privatePins.has(id) ? {'realm-guard':{mapMarkerVisible:false}} : {}; }};
    scene.notes.set(id, note);
    return {sceneId:scene.id, noteId:id};
  }
  class Graphics {
    operations = [];
    styles = [];
    children = [];
    position = {set:(x,y)=>{this.x=x;this.y=y;}};
    addChild(child) { this.children.push(child); return child; }
    lineStyle(width,color) { this.styles.push([width,color]); return this; }
    clear() { this.operations.length=0; }
    drawCircle(x,y) { this.operations.push(['circle',x,y]); return this; }
    moveTo(x,y) { this.operations.push(['move',x,y]); return this; }
    lineTo(x,y) { this.operations.push(['line',x,y]); return this; }
    beginFill() { return this; }
    endFill() { return this; }
    closePath() { return this; }
    destroy() { this.destroyed = true; }
  }
  const ticks = new Set();
  const ticker = {add:tick=>ticks.add(tick), remove:tick=>ticks.delete(tick), deltaMS:200};
  let saved = {stops:[]};
  let privatePlan = {};
  let marks = {};
  const privateNotes = [];
  const api = {canView:()=>true, getWorldProfile:entry=>entry?.flags?.['adventurers-tome']?.worldProfile || {category:'location'},
    privateVaultUI:{open:async (entry,options)=>privateNotes.push([entry,options.write])}};
  const game = {
    user:gm, users:{contents:[gm,player]}, world:{id:'qa'}, scenes:new Map([[scene.id,scene]]),
    settings:{get:(_module,key)=>key==='privateTravelPlanV1'?privatePlan:key==='personalTravelMarksV1'?marks:saved, set:async (_module,key,data)=>{
      if (key==='privateTravelPlanV1') privatePlan=data;
      else if (key==='personalTravelMarksV1') marks=data;
      else saved=data;
    }}
  };
  Object.defineProperty(game.scenes,'contents',{get:()=>[...game.scenes.values()]});
  const entries = new Map();
  let nextMarker, promptOptions;
  game.journal = {get:id=>entries.get(id), get contents(){return [...entries.values()];}};
  scene.createEmbeddedDocuments = async (type, [data]) => {
    assert.equal(type, 'Note');
    const note = {...data, id:`pin-${scene.notes.size + 1}`, entry:entries.get(data.entryId)};
    scene.notes.set(note.id,note);
    return [note];
  };
  const context = vm.createContext({
    game, compactPath,pathLength,sliceTravelPath,pinKey,archiveRouteKey,changeTravelPlan,newTravelPlan,publicTravelPlan,removeTravelRecords,trailMarkKey, Hooks:{once:(name,fn)=>{
      if(name==='ready')ready.push(fn);
      if(name==='adventurersTomeCoreApiReady')coreReady.push(fn);
    },on:(name,fn)=>hooks.set(name,fn),callAll(){}},
    ATTestAI:{modules:{get:()=>({api})}}, PIXI:{Graphics},document:{addEventListener(){}},ui:{notifications:{info(){}}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2}},
    JournalEntry:{create:async data=>{
      const entry = {...data, id:`place-${entries.size + 1}`, delete:async()=>entries.delete(entry.id)};
      entries.set(entry.id, entry);
      return entry;
    }},
    foundry:{utils:{randomID:()=>`flag-${saved.basicTrail?.length||0}`,escapeHTML:value=>String(value).replaceAll('<','&lt;')},
      applications:{api:{DialogV2:{prompt:async options=>{promptOptions=options;return nextMarker;}}}}},
    canvas:{ready:true, scene, app:{ticker}, dimensions:{rect:{contains:(x,y)=>Number.isFinite(x)&&Number.isFinite(y)}},
      stage:{sortableChildren:true,addChild(graphic){graphic.parent=this;flags.push(graphic);return graphic;}},
      interface:{addChild(graphic){ graphic.parent=this;rendered.push(graphic); return graphic; }}}
  });
  scene.getDimensions=()=>context.canvas.dimensions;
  vm.runInContext(source, context);
  const point = {sceneId:scene.id,x:124,y:380};
  const mapActions = context.mapActions;
  return {game, api, canvas:context.canvas, player, scene, addPin, entries, privateNotes, privatePins, rendered, flags, ticks, saved:()=>saved.stops, destination:()=>saved.destination,
    loadShared:state=>{saved=state;}, shared:()=>saved, fire:hook=>hooks.get(hook)?.(),
    loadPrivate:state=>{privatePlan=state;}, publishCore:()=>coreReady.splice(0).forEach(start=>start(api)),
    privatePlan:()=>privatePlan, marks:()=>marks,
    mockRoutes:result=>{context.foundry.applications.api.DialogV2.wait=typeof result==='function'?result:async()=>result;},
    readyWithPlanner(){const script=readFileSync(new URL('../scripts/travel-planner.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(script,context);ready.forEach(start=>start());},
    waypoints:()=>saved.waypoints,
    mockDialog:result=>{nextMarker=result;}, promptOptions:()=>promptOptions, actions:noteId=>mapActions(point,noteId),
    mockConfirm:confirm=>{context.foundry.applications.api.DialogV2.confirm=confirm;},
    write:(stop, previous=JSON.stringify(context.travelState()))=>context.travelWrite(stop,'gm','qa',previous),
    current:context.travelLocationInfo, focus:context.focusPartyLocation, draw:context.travelDraw, clear:context.travelClearOverlay};
}

test('moving and undoing set current location from the same ordered pins used on the map', async () => {
  const qa=fixture(), first=qa.addPin('a','Bree',20), second=qa.addPin('b','Fornost',60);
  await qa.write(first);
  await qa.write(first);
  await qa.write(second);
  assert.equal(qa.saved().length,2);
  assert.equal(qa.current().name,'Fornost');
  qa.draw();
  assert.deepEqual(qa.rendered[0].operations.slice(0,4), [['move',20,80],['line',33,80],['move',41,80],['line',54,80]]);
  assert.deepEqual(qa.rendered[0].styles[0],[4,0x67d57c]);
  await qa.write({undo:true});
  assert.equal(qa.current().name,'Bree');
  qa.draw();
  assert.equal(qa.rendered[0].destroyed,true);
});

test('the planner restores a saved flag when Foundry draws the canvas before ready', () => {
  const qa=fixture();
  qa.game.user=qa.player;
  const flag={sceneId:qa.scene.id,x:290,y:420};
  qa.loadShared({plannerOwner:'gm',stops:[],routes:[{id:'party',label:'Party',mode:'free',stops:[],ahead:[],flag}]});
  qa.fire('canvasReady');
  assert.equal(qa.rendered.length,0);
  qa.readyWithPlanner();
  const latest=qa.flags.at(-1);
  assert.ok(latest.operations.some(([op,x,y])=>op==='line'&&x===290&&y===384));
  assert.equal(qa.current().canFocus,true);
  assert.equal(qa.shared().routes[0].flag,flag);
});

test('a GM login restores the flag, travelled trail and private route when Tome core finishes after Foundry ready', () => {
  const qa=fixture();
  const start=qa.addPin('bree','Bree',80), waypoint=qa.addPin('camp','Camp',220), destination=qa.addPin('ruins','Ruins',380);
  const cursor={sceneId:qa.scene.id,x:120,y:130};
  const trail=[{id:'walk',sceneId:qa.scene.id,points:[{x:30,y:130},cursor]}];
  qa.loadShared({plannerOwner:'gm',stops:[start],routes:[]});
  qa.loadPrivate({id:'journey',mode:'free',enabled:true,logs:[],groups:[
    {id:'party',label:'Party',stops:[start],queue:[{pin:waypoint},{pin:destination,final:true}],cursor,trail}
  ]});
  const {canView,getWorldProfile}=qa.api;
  delete qa.api.canView;
  delete qa.api.getWorldProfile;
  qa.fire('canvasReady');
  qa.readyWithPlanner();
  assert.equal(qa.rendered.length,0);
  assert.equal(qa.api.travelPlanner,undefined);

  Object.assign(qa.api,{canView,getWorldProfile});
  qa.publishCore();
  const map=qa.rendered.at(-1);
  assert.ok(qa.flags.at(-1).operations.some(([op,x,y])=>op==='line'&&x===120&&y===94));
  assert.ok(map.operations.some(([op,x,y])=>op==='move'&&x===30&&y===130));
  assert.ok(map.operations.some(([op,x,y])=>op==='circle'&&x===220&&y===80));
  assert.ok(map.operations.some(([op,x,y])=>op==='circle'&&x===380&&y===80));
  assert.equal(qa.api.travelPlanner.freeHandles()[0].canMove,true);
  assert.equal(qa.shared().routes.length,0);
});

test('a GM can grab the basic flag while the planner is off and the moved flag survives a fresh login', async () => {
  const qa=fixture();
  qa.readyWithPlanner();
  await qa.write(qa.addPin('a','Bree',20));
  const [handle]=qa.api.travelPlanner.freeHandles();
  assert.equal(handle.canMove,true);
  assert.equal(handle.basic,true);
  await qa.api.travelPlanner.moveFlag(handle,[{x:45,y:72},{x:90,y:100}]);
  assert.equal(qa.shared().plannerOwner,undefined);
  const fresh=fixture();
  fresh.game.user=fresh.player;
  fresh.loadShared(qa.shared());
  fresh.addPin('a','Bree',20);
  fresh.readyWithPlanner();
  const latest=fresh.flags.at(-1);
  assert.ok(latest.operations.some(([op,x,y])=>op==='line'&&x===90&&y===64));
  assert.equal(fresh.api.travelPlanner.freeHandles().length,0);
  assert.equal(fresh.actions().some(action=>action.label.startsWith('Undo')),false);
  const undo=qa.api.travelPlanner.flagActions(handle.groupId).find(action=>action.label==='Undo flag movement');
  assert.ok(undo);
  await undo.run();
  assert.equal(qa.shared().basicFlag.x,20);
  assert.equal(qa.shared().basicTrail.length,0);
  assert.equal(qa.api.travelPlanner.flagActions(handle.groupId).some(action=>action.label.startsWith('Undo')),false);
});

test('hidden pins break the player route and a hidden current stop has no visible name', async () => {
  const qa=fixture();
  await qa.write(qa.addPin('a','Bree',20));
  await qa.write(qa.addPin('b','Hidden camp',40));
  await qa.write(qa.addPin('c','Fornost',60));
  qa.privatePins.add('b');
  qa.game.user=qa.player;
  qa.draw();
  assert.ok(qa.rendered[0].operations.every(([,x]) => x>=50));
  qa.privatePins.add('c');
  assert.equal(qa.current().configured,true);
  assert.equal(qa.current().name,'');
  await qa.write({undo:true});
  assert.equal(qa.saved().length,3);
});

test('GM can hand over the basic flag directly without losing its place or route',async()=>{
  const qa=fixture(),gm=qa.game.user;
  const origin=qa.addPin('a','Bree',20),finish=qa.addPin('b','Fornost',120);
  const character={id:'pc',name:'Ranger',testUserPermission:(user,level)=>user===qa.player&&level==='OWNER'};
  Object.assign(qa.player,{name:'Player',character,can:permission=>permission==='QUERY_USER'});
  qa.game.actors=new Map([[character.id,character]]);
  qa.game.users={contents:[gm,qa.player],get:id=>[gm,qa.player].find(user=>user.id===id)};
  qa.api.getGroup=()=>[{id:character.id}];
  qa.readyWithPlanner();
  await qa.write(origin);
  await qa.write({...finish,setDestination:true});
  const [handle]=qa.api.travelPlanner.freeHandles();
  await qa.api.travelPlanner.moveFlag(handle,[{x:60,y:90}]);

  const choose=qa.api.travelPlanner.flagActions('basic-party').find(action=>action.label==='Who can move this flag?');
  assert.ok(choose);
  qa.mockDialog('');
  await choose.run();
  assert.equal(qa.shared().plannerOwner,undefined);
  qa.mockDialog(qa.player.id);
  await choose.run();
  assert.equal(qa.promptOptions().window.title,'Who can move this flag?');
  assert.match(qa.promptOptions().content,/Player · Ranger/);
  assert.equal(qa.privatePlan().enabled,true);
  assert.equal(qa.privatePlan().groups[0].queue.at(-1).pin.noteId,finish.noteId);
  assert.equal(qa.shared().routes[0].flag.x,60);
  assert.equal(qa.shared().routes[0].trail.length,1);
  assert.equal(qa.shared().routes[0].driverId,qa.player.id);
});

test('a stale dialog or a deleted pin cannot overwrite the route', async () => {
  const qa=fixture(), a=qa.addPin('a','Bree',20), b=qa.addPin('b','Fornost',60);
  await qa.write(a);
  await assert.rejects(qa.write(b,'[]'), /changed while this dialog/);
  qa.scene.notes.delete('b');
  await assert.rejects(qa.write(b), /no longer available/);
  assert.equal(qa.current().name,'Bree');
});

test('the map menu places notes, markers and waypoints at the click and reuses existing places', async () => {
  const qa=fixture();
  const run = (label,noteId) => qa.actions(noteId).find(action=>action.label===label).run();
  qa.mockDialog({entryId:'',name:'Bree',pinStyle:'borderless'});
  await run('Place Marker…');
  const first=qa.scene.notes.get('pin-1');
  assert.equal(first.entry.name,'Bree');
  assert.equal(first.entry.ownership.default,0);
  assert.equal(first.flags['adventurers-tome'].notePinStyle,'borderless');
  assert.match(first.texture.src,/map-location\.svg$/);
  assert.deepEqual([first.x,first.y],[124,380]);
  assert.equal(qa.saved().length,0);
  qa.mockDialog({entryId:first.entry.id,pinStyle:'inherit'});
  await run('Add Waypoint…');
  assert.equal(qa.entries.size,1);
  assert.equal(qa.waypoints()[0].noteId,'pin-2');
  assert.equal(qa.destination(),null);
  assert.equal(qa.current().name,'');
  await run('Mark as arrived','pin-2');
  assert.equal(qa.current().name,'Bree');
  assert.equal(qa.saved().at(-1).noteId,'pin-2');
  assert.equal(qa.destination(),null);
  await run('Attach Note…','pin-2');
  assert.deepEqual(qa.privateNotes,[[first.entry,true]]);
  assert.equal(first.entry.pages,undefined);
  assert.equal(qa.scene.notes.size,2);
  qa.mockDialog({name:'GM note',text:'<Hidden'});
  await run('Place Note…');
  const page = qa.scene.notes.get('pin-3').entry.pages[0];
  assert.match(qa.scene.notes.get('pin-3').texture.src,/map-parchment\.svg$/);
  assert.equal(page.name,'GM note');
  assert.equal(page.ownership.default,0);
  assert.equal(page.text.content,'<p>&lt;Hidden</p>');
  qa.game.user=qa.player;
  assert.equal(qa.actions().length,0);
});

test('a green dash moves while the flag stays put and hides private destinations from players', async () => {
  const qa=fixture(), start=qa.addPin('a','Bree',20), target=qa.addPin('b','Fornost',120);
  await qa.write(start);
  await qa.write({...target,setDestination:true});
  assert.equal(qa.current().name,'Bree');
  assert.equal(qa.saved().length,1);
  qa.draw();
  const graphic = qa.rendered.at(-1), pulse = graphic.children[0];
  assert.deepEqual(graphic.operations.filter(([type])=>type==='circle'),[['circle',120,80]]);
  assert.ok(qa.flags.at(-1).operations.some(([type,x,y])=>type==='line' && x===20 && y===44));
  assert.ok(graphic.styles.some(([width,color])=>width===3 && color===0xadadad));
  const previousX = pulse.operations[0][1];
  for (const tick of qa.ticks) tick();
  assert.notEqual(pulse.operations[0][1],previousX);

  qa.privatePins.add('b');
  qa.game.user=qa.player;
  qa.draw();
  assert.equal(qa.rendered.at(-1).children.length,0);
  assert.equal(qa.ticks.size,0);
  assert.equal(qa.rendered.at(-1).operations.some(([,x])=>x===120),false);
  qa.game.user={id:'gm',isGM:true};
  await qa.write({arrive:true});
  assert.equal(qa.current().name,'Fornost');
  assert.equal(qa.saved().length,2);
  assert.equal(qa.destination(),null);
  qa.clear();
});

test('split parties sharing a starting pin have separate flags and independently animated trails', () => {
  const qa = fixture();
  const start = qa.addPin('a','Bree',20), north = qa.addPin('b','Fornost',120), west = qa.addPin('c','Ford',-100);
  qa.api.travelPlanner = {routes:()=>[
    {stops:[start],ahead:[north],moving:true},
    {stops:[start],ahead:[west],moving:true}
  ]};
  qa.draw();
  const graphic = qa.rendered.at(-1);
  assert.equal(qa.ticks.size,2);
  assert.equal(graphic.children.length,2);
  const flags=qa.flags.at(-1);
  assert.ok(flags.operations.some(([type,x,y])=>type==='line' && x===20 && y===44));
  assert.ok(flags.operations.some(([type,x,y])=>type==='line' && x===30 && y===44));
  assert.ok(graphic.children[0].operations[1][1]>20 && graphic.children[1].operations[1][1]<20);
  qa.clear();
  assert.equal(qa.ticks.size,0);
});

test('a basic route keeps its final destination when a waypoint is added, reached or undone', async () => {
  const qa = fixture(), start = qa.addPin('a','Bree',20), bridge = qa.addPin('b','Bridge',70), finish = qa.addPin('c','Fornost',120);
  await qa.write(start);
  await qa.write({...finish,setDestination:true});
  await qa.write({...bridge,addWaypoint:true});
  await qa.write({arrive:true});
  assert.equal(qa.current().name,'Bridge');
  assert.equal(qa.destination().noteId,finish.noteId);
  await qa.write({undo:true});
  assert.equal(qa.current().name,'Bree');
  assert.equal(qa.waypoints()[0].noteId,bridge.noteId);
  assert.equal(qa.destination().noteId,finish.noteId);
});

test('the map menu can undo a planned waypoint without removing travelled stops or the final destination', async () => {
  const qa=fixture(), start=qa.addPin('a','Bree',20), waypoint=qa.addPin('b','Bridge',70), finish=qa.addPin('c','Fornost',120);
  await qa.write(start);
  await qa.write({...finish,setDestination:true});
  await qa.write({...waypoint,addWaypoint:true});
  const undo=qa.actions().find(action=>action.label==='Undo route change');
  assert.ok(undo);
  await undo.run();
  assert.equal(qa.waypoints().length,0);
  assert.equal(qa.saved().at(-1).noteId,start.noteId);
  assert.equal(qa.destination().noteId,finish.noteId);
});

test('a parchment marker keeps legacy scene links and lets the GM select several scenes independently of its journal',async()=>{
  const qa=fixture();
  const first=qa.addPin('first','Bree',20), pin=qa.addPin('note','Old bridge note',90);
  const note=qa.scene.notes.get(pin.noteId), flags={notePinStyle:'borderless'};
  note.entry.flags={'adventurers-tome':{worldProfile:{category:'lore'}}};
  note.texture={src:'modules/adventurers-tome/assets/map-parchment.svg'};
  Object.defineProperty(note,'flags',{value:{'adventurers-tome':flags}});
  note.getFlag=(_namespace,key)=>flags[key];
  note.setFlag=async (_namespace,key,value)=>{flags[key]=value;};
  note.unsetFlag=async (_namespace,key)=>{delete flags[key];};
  qa.readyWithPlanner();
  const calls=[];
  const target={id:'encounter',name:'Bridge encounter',view:async()=>calls.push('preview bridge'),activate:async()=>calls.push('activate bridge')};
  const inn={id:'inn',name:'The Prancing Pony',view:async()=>calls.push('preview inn'),activate:async()=>calls.push('activate inn')};
  qa.game.scenes.set(target.id,target);
  qa.game.scenes.set(inn.id,inn);
  const action=label=>qa.actions(pin.noteId).find(row=>row.label===label);
  await qa.write(first);
  assert.ok(action('Add waypoint'));
  await action('Add waypoint').run();
  assert.equal(qa.waypoints()[0].noteId,pin.noteId);
  await action('Set final destination').run();
  assert.equal(qa.destination().noteId,pin.noteId);
  await action('Set party position').run();
  assert.equal(qa.saved().at(-1).noteId,pin.noteId);
  assert.ok(action('Link scenes…'));
  flags.partyLinkedScene=target.id;
  assert.equal(qa.api.partyTravel.mapLinkedScene(pin),target);
  qa.mockDialog([target.id,inn.id]);
  await action('Manage scene links…').run();
  assert.match(qa.promptOptions().content,/data-marker-scene-search/);
  assert.deepEqual(Array.from(qa.api.partyTravel.mapLinkedScenes(pin)),[target,inn]);
  assert.equal(note.entry.flags['adventurers-tome'].partyLinkedScene,undefined);
  let shown=0;
  qa.mockRoutes(async options=>{
    assert.match(options.content,/Bridge encounter/);
    assert.match(options.content,/The Prancing Pony/);
    if(shown++)return null;
    return options.buttons.find(row=>row.action==='preview').callback(null,{form:{elements:{scene:{value:inn.id}}}});
  });
  await action('Open linked scenes…').run();
  qa.mockConfirm(async()=>false);
  qa.mockRoutes({action:'activate',id:target.id});
  await action('Open linked scenes…').run();
  assert.deepEqual(calls,['preview inn']);
  qa.mockConfirm(async()=>true);
  await action('Open linked scenes…').run();
  assert.deepEqual(calls,['preview inn','activate bridge']);
  qa.mockDialog([inn.id]);
  await action('Manage scene links…').run();
  assert.deepEqual(Array.from(qa.api.partyTravel.mapLinkedScenes(pin)),[inn]);
  qa.game.user=qa.player;
  assert.equal(qa.actions(pin.noteId).length,0);
  assert.equal(qa.api.partyTravel.mapLinkedScenes(pin).length,0);
  qa.game.user={id:'gm',isGM:true};
  qa.mockDialog([]);
  await action('Manage scene links…').run();
  assert.equal(qa.api.partyTravel.mapLinkedScene(pin),null);
});

test('arrival opens the GM scene chooser with the planner off or on and the flag menu can reopen it',async()=>{
  for(const enabled of [false,true]){
    const qa=fixture(), start=qa.addPin('start','Road',20), stop=qa.addPin('bree','Bree',120);
    qa.scene.notes.get(stop.noteId).getFlag=(_module,key)=>key==='partyLinkedScenes'?['pony','shop']:undefined;
    qa.game.scenes.set('pony',{id:'pony',name:'The Prancing Pony'});
    qa.game.scenes.set('shop',{id:'shop',name:'Bree shop'});
    if(enabled){
      qa.loadShared({plannerOwner:'gm',stops:[start],routes:[]});
      qa.loadPrivate({id:'journey',mode:'free',enabled:true,logs:[],groups:[
        {id:'party',label:'Party',stops:[start],queue:[],memberIds:[]}
      ]});
    }
    qa.readyWithPlanner();
    if(!enabled)await qa.write(start);
    let opened=0;
    qa.mockRoutes(async options=>{
      assert.match(options.content,/The Prancing Pony/);
      assert.match(options.content,/Bree shop/);
      opened++;
      return null;
    });
    await qa.api.travelPlanner.moveFlag(qa.api.travelPlanner.freeHandles()[0],[{x:120,y:80}]);
    assert.equal(opened,1);
    const flagMenu=qa.api.travelPlanner.flagActions(enabled?'party':'basic-party');
    await flagMenu.find(action=>action.label==='Open linked scenes…').run();
    assert.equal(opened,2);
  }
});

test('a marker event offers its planned scene and additional marker scenes in one GM dialog',async()=>{
  const qa=fixture(), start=qa.addPin('road','Road',20), stop=qa.addPin('bree','Bree',120);
  qa.scene.notes.get(stop.noteId).getFlag=(_module,key)=>key==='partyLinkedScenes'?['pony']:undefined;
  const calls=[];
  qa.game.scenes.set('pony',{id:'pony',name:'The Prancing Pony',view:async()=>calls.push('inn')});
  qa.game.scenes.set('gate',{id:'gate',name:'Bree gate',view:async()=>calls.push('gate')});
  qa.loadShared({plannerOwner:'gm',stops:[start],routes:[]});
  qa.loadPrivate({id:'journey',mode:'free',enabled:true,logs:[],groups:[
    {id:'party',label:'Party',stops:[start],queue:[],memberIds:[]}
  ],events:{[pinKey(stop)]:{title:'At the gate',sceneId:'gate'}}});
  qa.readyWithPlanner();
  let finish;
  const shownAgain=new Promise(resolve=>{finish=resolve;});
  let shown=0;
  qa.mockRoutes(async options=>{
    assert.match(options.window.title,/At the gate/);
    assert.match(options.content,/Bree gate.*The Prancing Pony/s);
    if(shown++){
      assert.match(options.content,/value="pony" selected/);
      assert.match(options.content,/value="Met the watch"/);
      finish();
      return null;
    }
    const elements={eventScene:{value:'pony'},publicText:{value:'Met the watch'}};
    return options.buttons.find(button=>button.action==='preview').callback(null,{form:{elements}});
  });
  await qa.api.travelPlanner.moveFlag(qa.api.travelPlanner.freeHandles()[0],[{x:120,y:80}]);
  await shownAgain;
  assert.deepEqual(calls,['inn']);
  assert.equal(qa.privatePlan().groups[0].pending.event.sceneId,'gate');
});

test('the GM can delete several unlinked legs and archived routes but keeps the flag and linked records',async()=>{
  const qa=fixture(),start=qa.addPin('a','Bree',20),finish=qa.addPin('b','Fornost',120);
  const leg=(id,extra={})=>({id,sceneId:qa.scene.id,points:[{x:20,y:80},{x:80,y:100}],...extra});
  const archived={id:'old',label:'Party',mode:'free',stops:[start,finish],trail:[leg('old-leg')]};
  const journey={id:'previous',routes:[archived],logIds:[],sessionId:''};
  const current={id:'party',label:'Party',stops:[start],queue:[{pin:finish,final:true}],cursor:{sceneId:qa.scene.id,x:125,y:92},
    trail:[leg('one'),leg('two'),leg('linked',{sessionId:'session'})]};
  qa.loadPrivate({id:'journey',mode:'free',enabled:true,groups:[current],history:[journey],logs:[],undo:{groups:[current],logCount:0}});
  qa.loadShared({plannerOwner:'gm',stops:[start],routes:[{...current,mode:'free',ahead:[]}],travelHistory:[{...journey,author:'gm'}]});
  qa.readyWithPlanner();
  const manage=qa.api.travelPlanner.routeRecordsAction('map');
  const selected=['leg:one','leg:two','route:previous:old'];
  qa.mockRoutes({action:'delete',keys:[...selected,'leg:linked']});
  await assert.rejects(manage.run(),/available to delete/);
  qa.mockRoutes({action:'delete',keys:selected});
  await manage.run();
  assert.equal(qa.privatePlan().groups[0].trail.map(segment=>segment.id).join(','),'linked');
  assert.equal(qa.shared().routes[0].trail.map(segment=>segment.id).join(','),'linked');
  assert.equal(qa.privatePlan().history.length,0);
  assert.equal(qa.shared().travelHistory.length,0);
  assert.equal(qa.privatePlan().undo,null);
  assert.equal(qa.privatePlan().groups[0].cursor.x,125);
  assert.equal(qa.privatePlan().groups[0].queue[0].pin.noteId,finish.noteId);
});

test('the player can recolor a completed leg on their own map and cannot delete it',async()=>{
  const qa=fixture();
  qa.game.user=qa.player;
  qa.loadShared({stops:[],plannerOwner:'gm',routes:[{mode:'free',stops:[],ahead:[],trail:[
    {id:'past',sceneId:qa.scene.id,points:[{x:25,y:80},{x:90,y:80}],completed:true},
    {id:'recent',sceneId:qa.scene.id,points:[{x:90,y:80},{x:140,y:80}]}
  ]}]});
  qa.readyWithPlanner();
  assert.ok(qa.rendered.at(-1).styles.some(([,color])=>color===0x9b9b9b));
  const manage=qa.api.travelPlanner.routeRecordsAction('map');
  qa.mockRoutes({action:'delete',keys:['leg:past']});
  await assert.rejects(manage.run(),/changed/);
  qa.mockRoutes({action:'mark',color:'amber',keys:['leg:recent']});
  await assert.rejects(manage.run(),/older routes/);
  qa.mockRoutes({action:'mark',color:'amber',keys:['leg:past']});
  await manage.run();
  assert.equal(qa.marks()['leg:past'],'amber');
  assert.equal(qa.shared().routes[0].trail[0].color,undefined);
  qa.draw();
  const drawn=qa.rendered.at(-1);
  assert.ok(drawn.styles.some(([,color])=>color===0xe7ab50));
  assert.ok(drawn.styles.some(([,color])=>color===0x67d57c));
});

test('Home shows the two places between waypoints and opens the map at the flag without activating the scene', async () => {
  const qa=fixture(), start=qa.addPin('a','Bree',20), target=qa.addPin('b','Fornost',120);
  const cursor={sceneId:qa.scene.id,x:53,y:112};
  qa.api.travelPlanner={routes:()=>[{stops:[start],ahead:[target],cursor}]};
  const actions=[];
  qa.api.app=()=>({rendered:true,minimize:async()=>actions.push('minimize')});
  qa.scene.view=async()=>{actions.push('view');qa.canvas.scene=qa.scene;};
  qa.canvas.animatePan=async point=>actions.push([point.x,point.y]);
  assert.equal(qa.current().description,'Between Bree and Fornost');
  qa.canvas.scene={id:'another-map'};
  await qa.focus();
  assert.deepEqual(actions,['view','minimize',[53,112]]);
  qa.game.user=qa.player;
  qa.privatePins.add('b');
  assert.equal(qa.current().description,'On the road from Bree');
  qa.privatePins.add('a');
  assert.equal(qa.current().description,'');
  await assert.rejects(qa.focus(), /unavailable/);
});

test('the shared flag is drawn through fog and the GM guide runs through the waypoint to the exact goal', () => {
  const qa=fixture(), target=qa.addPin('a','Fornost',550), waypoint=qa.addPin('b','Bridge',280);
  qa.game.user=qa.player;
  qa.scene.tokenVision=true;
  qa.canvas.visibility={testVisibility:()=>false};
  const route={mode:'free',stops:[],ahead:[],flag:{sceneId:qa.scene.id,x:84,y:136},final:target,
    goalArea:{sceneId:qa.scene.id,x:310,y:260,radius:60},trail:[{id:'leg',sceneId:qa.scene.id,points:[{x:15,y:90},{x:84,y:136}]}]};
  qa.api.travelPlanner={routes:()=>[route]};
  qa.draw();
  const player=qa.rendered.at(-1);
  assert.ok(qa.flags.at(-1).operations.some(([type,x,y])=>type==='line'&&x===84&&y===100));
  assert.ok(player.operations.some(([type,x,y])=>type==='circle'&&x===310&&y===260));
  assert.ok(player.operations.some(([type,x,y])=>type==='circle'&&x===550&&y===80));
  assert.equal(player.operations.some(([type,x,y])=>type==='line'&&x===550&&y===80),false);
  assert.equal(player.operations.some(([,x,y])=>x===280&&y===80),false);
  qa.game.user={id:'gm',isGM:true};
  route.ahead=[waypoint];
  qa.draw();
  const gm=qa.rendered.at(-1);
  assert.ok(gm.operations.some(([type,x,y])=>type==='circle'&&x===280&&y===80));
  assert.ok(gm.operations.some(([type,x,y])=>type==='move'&&x===280&&y===80));
  assert.ok(gm.operations.some(([type,x,y])=>type==='line'&&x>500&&y===80));
  assert.equal(qa.ticks.size,2);
  qa.clear();
});

test('party flags and drag previews sort above the map and clean up separately from the route',()=>{
  const qa=fixture();
  qa.readyWithPlanner();
  const flag={sceneId:qa.scene.id,x:84,y:136};
  qa.loadShared({plannerOwner:'gm',stops:[],routes:[{id:'party',mode:'free',stops:[],ahead:[],flag}]});
  qa.game.user=qa.player;
  qa.draw();
  const placedFlag=qa.flags.at(-1);
  const route=qa.rendered.at(-1);
  const preview=qa.api.partyTravel.createFlagGraphic({preview:true});
  const laterControl=qa.canvas.stage.addChild({zIndex:4000});
  assert.equal(placedFlag.parent,qa.canvas.stage);
  assert.equal(route.parent,qa.canvas.interface);
  assert.ok(preview.zIndex>placedFlag.zIndex&&placedFlag.zIndex>laterControl.zIndex);
  assert.equal(placedFlag.eventMode,'none');
  assert.equal(preview.eventMode,'none');
  qa.fire('canvasTearDown');
  assert.equal(placedFlag.destroyed,true);
  assert.equal(route.destroyed,true);
});
