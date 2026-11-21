import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {changeTravelPlan, newTravelPlan, pinKey, publicTravelPlan} from '../scripts/travel-plan.mjs';
import {compactPath,pathLength,segmentLength,sliceTravelPath,nearestOnPath} from '../scripts/travel-geometry.mjs';

const pin = noteId => ({sceneId:'map',noteId});
const [bree, bridge, fornost, ford] = ['bree','bridge','fornost','ford'].map(pin);
const check = {kind:'Check',title:'Hidden ambush',details:'GM surprise',failure:ford,hidePin:true};

function fixture() {
  let plan = newTravelPlan('journey',{stops:[bree],destination:null},['edrik','arantor']);
  let serial = 0;
  const change = (type,options={}) => (plan = changeTravelPlan(plan,{id:`change-${++serial}`,type,...options}));
  change('configure',{enabled:true,visibility:'public',sessionId:'session'});
  return {change, plan:()=>plan, group:()=>plan.groups[0], project:()=>publicTravelPlan(plan,()=>true,()=>true)};
}

test('public route data contains no hidden waypoint, event, branch, or GM text before arrival',()=>{
  const f = fixture();
  f.change('append',{pin:bridge});
  f.change('append',{pin:fornost});
  f.change('event',{index:0,pin:bridge,event:check});
  assert.deepEqual(f.project().routes[0].ahead,[fornost]);
  assert.doesNotMatch(JSON.stringify(f.project()),/bridge|ford|ambush|surprise/);
  f.change('configure',{enabled:true,visibility:'travelled',sessionId:'session'});
  assert.deepEqual(f.project().routes[0].ahead,[]);
  assert.deepEqual(f.project().routes[0].stops,[bree]);
  assert.doesNotMatch(JSON.stringify(f.project()),/fornost/);
});

test('arrival pauses for the check, handles its outcome and only publishes the GM-approved session text',()=>{
  const f = fixture();
  f.change('event',{index:-1,pin:bridge,event:check});
  f.change('append',{pin:fornost});
  f.change('arrive',{pin:bridge});
  assert.equal(f.group().pending.event.title,check.title);
  assert.equal(f.project().routes[0].moving,false);
  assert.throws(()=>f.change('arrive'),/Resolve or skip/);
  f.change('resolve',{outcome:'failure',publicText:'The bridge was blocked.'});
  assert.deepEqual(f.group().queue.map(stop=>stop.pin),[ford,fornost]);
  assert.equal(f.project().routes[0].moving,true);
  assert.equal(f.project().logs.at(-1).publicText,'The bridge was blocked.');
  assert.doesNotMatch(JSON.stringify(f.project()),/Hidden ambush|GM surprise|failure/);
  assert.deepEqual(publicTravelPlan(f.plan(),()=>true,()=>false).logs,[]);
});

test('undo restores the party dot, pending event queue, and session log together',()=>{
  const f = fixture();
  f.change('event',{pin:bridge,index:-1,event:check});
  f.change('arrive');
  assert.equal(f.project().logs.length,1);
  f.change('undo');
  assert.deepEqual(f.group().stops,[bree]);
  assert.deepEqual(f.group().queue,[{pin:bridge,event:check}]);
  assert.equal(f.group().pending,null);
  assert.equal(f.project().logs.length,0);
});

test('undo restores the previous route line and waypoints while retaining the travelled path',()=>{
  const f=fixture();
  f.change('append',{pin:bridge});
  f.change('arrive');
  f.change('destination',{pin:fornost});
  const leg={target:pinKey(fornost),sceneId:'map',points:[{x:0,y:0},{x:25,y:20},{x:70,y:0}],distance:0};
  f.change('draw',{pin:fornost,leg});
  f.change('via',{pin:ford,leg:{...leg,target:pinKey(ford)}});
  f.change('append',{pin:ford});
  assert.equal(f.plan().undo.kind,'route');
  f.change('undo');
  assert.deepEqual(f.group().leg,leg);
  assert.deepEqual(f.group().queue,[{pin:fornost,final:true}]);
  assert.deepEqual(f.group().stops,[bree,bridge]);
  assert.equal(f.project().logs.length,1);
});

test('setting the free-travel flag at a waypoint removes only that waypoint and can be undone',()=>{
  let plan={...newTravelPlan('party',{stops:[bree],waypoints:[bridge,ford],destination:fornost},[]),mode:'free',enabled:true};
  plan=changeTravelPlan(plan,{type:'position',pin:bridge,id:'move'});
  assert.deepEqual(plan.groups[0].queue,[{pin:ford},{pin:fornost,final:true}]);
  assert.deepEqual(plan.groups[0].stops,[bree,bridge]);
  plan=changeTravelPlan(plan,{type:'undo'});
  assert.deepEqual(plan.groups[0].queue,[{pin:bridge},{pin:ford},{pin:fornost,final:true}]);
  assert.deepEqual(plan.groups[0].stops,[bree]);
});

test('arriving at a waypoint keeps the route green until the group leaves it',()=>{
  let plan={...newTravelPlan('party',{stops:[bree],waypoints:[bridge],destination:fornost},[]),mode:'free',enabled:true};
  const travel=(id,from,to,marker)=>changeTravelPlan(plan,{type:'freeTravel',id,sceneId:'map',points:[{x:from,y:80},{x:to,y:80}],marker});
  plan=travel('approach',20,45);
  plan=travel('arrive',45,70,bridge);
  assert.deepEqual(plan.groups[0].trail.map(segment=>Boolean(segment.completed)),[false,false]);
  plan=travel('leave',70,95);
  const projection=publicTravelPlan(plan,()=>true,()=>true,{canShareScene:()=>true});
  assert.deepEqual(projection.routes[0].trail.map(segment=>Boolean(segment.completed)),[true,true,false]);
  assert.deepEqual(plan.groups[0].queue,[{pin:fornost,final:true}]);
  plan=changeTravelPlan(plan,{type:'undo'});
  assert.deepEqual(plan.groups[0].trail.map(segment=>Boolean(segment.completed)),[false,false]);
});

test('detours retain the next stop, splits track their own routes and reunions require a shared waypoint',()=>{
  const f = fixture();
  f.change('append',{pin:fornost});
  f.change('detour',{pin:bridge});
  assert.deepEqual(f.group().queue.map(stop=>stop.pin),[bridge,fornost]);
  f.change('split',{pin:ford,memberIds:['edrik'],memberNames:['Edrik']});
  const other = f.plan().groups[1].id;
  f.change('arrive',{groupId:other});
  assert.throws(()=>f.change('rejoin',{otherId:other}),/same waypoint/);
  f.change('detour',{pin:ford});
  f.change('arrive');
  f.change('rejoin',{otherId:other});
  assert.deepEqual(f.group().memberIds.sort(),['arantor','edrik']);
  assert.deepEqual(f.group().queue.map(stop=>stop.pin),[bridge,fornost]);
  assert.equal(f.project().routes[1].completed,true);
  assert.deepEqual(f.project().routes[1].stops,[bree,ford]);
});

test('the Foundry adapter stores the full plan only in account settings and republishes undo safely',async()=>{
  const src = readFileSync(new URL('../scripts/travel-planner.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const settings = new Map([['partyTravelV1',{stops:[bree],destination:null}],['privateTravelPlanV1',{}]]);
  const scopes = new Map();
  const journeys = new Map([bree,bridge,fornost,ford].map(pin=>[pin.noteId,{name:pin.noteId,ownership:{default:2}}]));
  const scene={id:'map',active:true};
  const session = {id:'session',name:'Session 7',ownership:{default:2}};
  const api = {resolveEntry:()=>session,getGroup:()=>[],canView:()=>true,partyTravel:{state:()=>({stops:[bree],waypoints:[],destination:null}),isWaypoint:note=>Boolean(note),refresh(){},resolve:pin=>{
    const entry = journeys.get(pin?.noteId);
    if (entry) return {entry,note:{},scene};
  }}};
  const game = {user:{id:'gm',isGM:true},world:{id:'world'},scenes:new Map([[scene.id,scene]]),users:{contents:[]},settings:{get:(_id,key)=>settings.get(key),
    register:(_id,key,config)=>scopes.set(key,config.scope),set:async (_id,key,value)=>settings.set(key,value)}};
  let serial = 0;
  const ctx = vm.createContext({game,structuredClone,changeTravelPlan,newTravelPlan,pinKey,publicTravelPlan,compactPath,pathLength,segmentLength,sliceTravelPath,ATTestAI:{modules:{get:()=>({api})}},
    Hooks:{once:(name,run)=>{if(name==='init')run();}},foundry:{utils:{randomID:()=>`id-${++serial}`}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2,LIMITED:1,INHERIT:-1}}});
  vm.runInContext(src,ctx);
  const act = type => ctx.commit(type,JSON.stringify(settings.get('privateTravelPlanV1')));
  await act({type:'configure',enabled:true,visibility:'travelled',sessionId:'session'});
  await act({type:'event',pin:bridge,index:-1,event:check});
  assert.equal(scopes.get('privateTravelPlanV1'),'user');
  assert.match(JSON.stringify(settings.get('privateTravelPlanV1')),/Hidden ambush/);
  assert.doesNotMatch(JSON.stringify(settings.get('partyTravelV1')),/bridge|Hidden ambush/);
  await act({type:'arrive'});
  assert.equal(settings.get('partyTravelV1').sessionLog.length,1);
  await act({type:'undo'});
  assert.equal(settings.get('partyTravelV1').sessionLog.length,0);
  await act({type:'destination',pin:fornost,visibility:'exact'});
  const undoRoute=ctx.routeUndoAction('map');
  assert.equal(undoRoute.label,'Undo route change');
  await undoRoute.run();
  assert.equal(settings.get('partyTravelV1').routes[0].final,null);
  await act({type:'configure',enabled:false,visibility:'travelled',sessionId:'session'});
  assert.equal(settings.get('partyTravelV1').plannerOwner,null);
  assert.match(JSON.stringify(settings.get('privateTravelPlanV1')),/Hidden ambush/);
  settings.set('partyTravelV1',{...settings.get('partyTravelV1'),stops:[bree,fornost]});
  const state = {stops:[bree,fornost],waypoints:[],destination:null};
  await ctx.archiveBasic(state);
  assert.deepEqual(JSON.parse(JSON.stringify(settings.get('partyTravelV1').stops)),[fornost]);
  assert.equal(settings.get('partyTravelV1').travelHistory.length,1);
  assert.doesNotMatch(JSON.stringify(settings.get('partyTravelV1')),/Hidden ambush/);
});

test('dragging the flag commits the traversed bends and redraws only the route ahead',()=>{
  const f=fixture();
  f.change('destination',{pin:fornost});
  const leg={target:pinKey(fornost),sceneId:'map',distance:0,points:[{x:0,y:0},{x:20,y:0},{x:20,y:30}]};
  f.change('draw',{pin:fornost,leg});
  assert.equal(f.group().trail,undefined);
  const nearest=nearestOnPath(leg.points,{x:27,y:15});
  f.change('travel',{pin:fornost,leg,distance:nearest.distance});
  assert.deepEqual(f.group().cursor,{x:20,y:15,sceneId:'map'});
  assert.deepEqual(f.group().trail[0].points,[{x:0,y:0},{x:20,y:0},{x:20,y:15}]);
  f.change('configure',{enabled:true,visibility:'travelled',sessionId:'session'});
  const visible=f.project();
  assert.equal(visible.routes[0].leg,null);
  assert.doesNotMatch(JSON.stringify(visible),/fornost/);
  assert.deepEqual(visible.routes[0].cursor,{x:20,y:15,sceneId:'map'});
  const redrawn={...leg,points:[{x:20,y:15},{x:32,y:18},{x:20,y:30}]};
  f.change('draw',{pin:fornost,leg:redrawn});
  assert.deepEqual(f.group().trail[0].points,[{x:0,y:0},{x:20,y:0},{x:20,y:15}]);
  f.change('travel',{pin:fornost,leg:redrawn,distance:pathLength(redrawn.points)});
  assert.equal(f.group().cursor,null);
  assert.equal(f.group().stops.at(-1).noteId,'fornost');
  assert.deepEqual(f.group().trail.at(-1).points,redrawn.points);
});

test('turning back records only the section the flag travels again, in reverse order',()=>{
  const f=fixture();
  f.change('destination',{pin:fornost});
  const leg={target:pinKey(fornost),sceneId:'map',distance:0,points:[{x:0,y:0},{x:30,y:0},{x:30,y:40}]};
  f.change('travel',{pin:fornost,leg,distance:60});
  f.change('travel',{pin:fornost,leg:f.group().leg,distance:20});
  assert.deepEqual(f.group().trail[1].points,[{x:30,y:30},{x:30,y:0},{x:20,y:0}]);
  assert.deepEqual(f.group().cursor,{x:20,y:0,sceneId:'map'});
  assert.equal(f.group().queue[0].pin.noteId,'fornost');
});

test('a fixed finish survives new waypoints, private events, a reroute and arrival at intermediate stops',()=>{
  const f = fixture();
  f.change('destination',{pin:fornost});
  f.change('append',{pin:bridge});
  f.change('event',{index:-1,pin:ford,event:{kind:'Event',title:'Crossing'}});
  assert.deepEqual(f.group().queue.map(stop=>stop.pin),[bridge,ford,fornost]);
  f.change('reroute',{pin:ford});
  assert.deepEqual(f.group().queue.map(stop=>stop.pin),[ford,fornost]);
  f.change('arrive');
  assert.equal(f.project().routes[0].moving,false);
  assert.deepEqual(f.project().routes[0].final,fornost);
  f.change('resolve',{outcome:'continue'});
  assert.deepEqual(f.group().queue,[{pin:fornost,final:true}]);
});

test('finishing archives travelled pins and session log IDs, and filters the archive for players',()=>{
  const f = fixture();
  f.change('destination',{pin:fornost});
  f.change('append',{pin:bridge});
  assert.throws(()=>f.change('finish',{memberIds:[]}),/remaining travel/);
  f.change('arrive');
  f.change('arrive');
  f.change('finish',{finishedAt:100,memberIds:[]});
  assert.deepEqual(f.group().stops,[fornost]);
  assert.deepEqual(f.plan().history[0].routes[0].stops,[bree,bridge,fornost]);
  assert.equal(f.plan().history[0].logIds.length,2);
  const visible = publicTravelPlan(f.plan(),pin=>pin.noteId!=='bridge',()=>false);
  assert.deepEqual(visible.history[0].routes[0].stops,[bree,null,fornost]);
  assert.equal(visible.history[0].sessionId,'');
  assert.deepEqual(visible.history[0].logIds,[]);
});

test('the public free-travel view always shares the flag on the map, with either the area or explicitly known goal',()=>{
  const coordinates=new Map([['bree',{sceneId:'map',x:10,y:20}],['fornost',{sceneId:'map',x:721,y:416}]]);
  let plan={...newTravelPlan('party',{stops:[bree],destination:fornost},['edrik']),mode:'free',enabled:true,events:{'map:bridge':check}};
  const project=()=>publicTravelPlan(plan,()=>false,()=>false,{resolvePosition:pin=>coordinates.get(pin?.noteId),canShareScene:id=>id==='map'});
  const area={sceneId:'map',x:640,y:390,radius:115};
  plan=changeTravelPlan(plan,{type:'goalArea',area});
  assert.deepEqual(project().routes[0].flag,coordinates.get('bree'));
  assert.deepEqual(project().routes[0].goalArea,area);
  assert.deepEqual(project().routes[0].ahead,[]);
  assert.doesNotMatch(JSON.stringify(project()),/fornost|721|Hidden ambush/);
  plan=changeTravelPlan(plan,{type:'goalVisibility',visibility:'exact'});
  assert.equal(project().routes[0].goalArea,null);
  assert.deepEqual(project().routes[0].goalPoint,coordinates.get('fornost'));
  assert.doesNotMatch(JSON.stringify(project()),/fornost|Hidden ambush/);
});

test('only the authenticated driver can move the flag, and only a marker drop triggers its private event',async()=>{
  const src=readFileSync(new URL('../scripts/travel-planner.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const gm={id:'gm',isGM:true},character={id:'edrik',testUserPermission:()=>true};
  const player={id:'player',active:true,isGM:false,character,viewedScene:'map',can:()=>true};
  const other={...player,id:'other',character:{...character,id:'arantor'}};
  const note=(id,x,y)=>({id,x,y,iconSize:32,entry:{name:id,ownership:{default:2}}});
  const first=note('bree',35,80),mark=note('bridge',100,80),finish=note('fornost',490,80);
  const scene={id:'map',active:true,notes:{contents:[first,mark,finish]},dimensions:{rect:{contains:(x,y)=>x>=0&&x<1000&&y>=0&&y<1000}}};
  const plan={...newTravelPlan('party',{stops:[bree],destination:fornost},['edrik','arantor']),mode:'free',enabled:true,dragVersion:'initial',sessionId:'session',
    events:{'map:bridge':{...check,id:'bridge-event',sceneId:'secret-scene'}}};
  plan.groups[0].driverId=player.id;
  const settings=new Map([['partyTravelV1',{plannerOwner:gm.id}],['privateTravelPlanV1',plan]]);
  const api={canView:()=>true,resolveEntry:()=>({ownership:{default:2}}),partyTravel:{isWaypoint:value=>Boolean(value),refresh(){},
    resolve:pin=>{const hit=scene.notes.contents.find(note=>note.id===pin?.noteId);return hit&&{note:hit,entry:hit.entry,scene};}}};
  const users=[gm,player,other];
  const game={user:gm,world:{id:'world'},users:{contents:users,get:id=>users.find(row=>row.id===id)},scenes:new Map([[scene.id,scene]]),
    settings:{get:(_id,key)=>settings.get(key),set:async (_id,key,value)=>settings.set(key,value)}};
  let n=0;
  const alerts=[];
  const ctx=vm.createContext({game,structuredClone,changeTravelPlan,newTravelPlan,pinKey,publicTravelPlan,compactPath,pathLength,segmentLength,sliceTravelPath,
    ATTestAI:{modules:{get:()=>({api})}},Hooks:{once(){}},ui:{notifications:{info:msg=>alerts.push(msg),warn:msg=>alerts.push(msg)}},
    foundry:{utils:{randomID:()=>`id-${++n}`,escapeHTML:String},applications:{api:{DialogV2:{wait:async()=>false}}}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2,LIMITED:1,INHERIT:-1}}});
  vm.runInContext(src,ctx);
  const addWaypoint=ctx.mapActions(bridge).find(action=>action.label==='Add waypoint');
  assert.ok(addWaypoint);
  await addWaypoint.run();
  const privateRoute=()=>settings.get('privateTravelPlanV1').groups[0].queue;
  assert.deepEqual(privateRoute(),[{pin:bridge},{pin:fornost,final:true}]);
  assert.deepEqual(ctx.routes()[0].ahead,[bridge]);
  assert.deepEqual(settings.get('partyTravelV1').routes[0].ahead,[]);
  const move=async (sender,points,groupId='party')=>{
    const current=settings.get('privateTravelPlanV1');
    const group=current.groups.find(row=>row.id===groupId);
    const data={groupId,sceneId:'map',dragVersion:group.moveVersion??current.dragVersion,points,userId:'player'};
    ctx.rememberFlagMover(sender,'query','adventurersTome.movePartyFlag',data);
    return ctx.handleFlagMove(data);
  };
  await assert.rejects(move('other',[{x:100,y:80}]),/cannot move/);
  await assert.rejects(move('player',[{x:-2,y:80}]),/inside this map/);
  await move('player',[{x:100,y:80},{x:220,y:150}]);
  assert.equal(settings.get('privateTravelPlanV1').groups[0].pending,null);
  assert.equal(privateRoute().length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(settings.get('partyTravelV1').routes[0].flag)),{sceneId:'map',x:220,y:150});
  await move('player',[{x:100,y:80}]);
  assert.equal(settings.get('privateTravelPlanV1').groups[0].pending.event.sceneId,'secret-scene');
  assert.deepEqual(privateRoute(),[{pin:fornost,final:true}]);
  assert.match(alerts[0],/Party arrived at bridge/);
  assert.doesNotMatch(JSON.stringify(settings.get('partyTravelV1')),/secret-scene|Hidden ambush/);

  const commit=command=>ctx.commit(command,JSON.stringify(settings.get('privateTravelPlanV1')));
  await commit({type:'resolve',groupId:'party',outcome:'skip'});
  await commit({type:'split',groupId:'party',memberIds:['arantor'],memberNames:['Arantor'],remainingDriverId:'player',driverId:'other'});
  const [,second]=settings.get('privateTravelPlanV1').groups;
  await Promise.all([move('player',[{x:190,y:150}]),move('other',[{x:170,y:230}],second.id)]);
  assert.deepEqual(settings.get('privateTravelPlanV1').groups.map(group=>group.cursor.y),[150,230]);
  await Promise.all([move('player',[{x:190,y:205}]),move('other',[{x:190,y:213}],second.id)]);
  assert.equal(ctx.canRejoin(...settings.get('privateTravelPlanV1').groups),true);
  await commit({type:'rejoin',groupId:'party',otherId:second.id,together:true});
  assert.equal(settings.get('privateTravelPlanV1').groups.length,1);
  assert.equal(settings.get('privateTravelPlanV1').pastRoutes[0].trail.length,2);
});
