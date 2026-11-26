import {compactPath,pathLength,sliceTravelPath} from './travel-geometry.mjs';

const TRAVEL_MODULE = "adventurers-tome";
const TRAVEL_SETTING = "partyTravelV1";
const TRAVEL_SCENE_FLAG = "partyLinkedScene";
const MARKER_SCENES_FLAG = "partyLinkedScenes";
const MAP_ART = "modules/adventurers-tome/assets/";
const travelApi = () => globalThis.ATTestAI.modules.get(TRAVEL_MODULE)?.api;
const travelEsc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
let travelOverlay, travelFlags, travelOverlayStamp;
const travelAnimations = [];
let travelSaving = false;

function travelState() {
  const data = game.settings.get(TRAVEL_MODULE, TRAVEL_SETTING);
  return {stops: Array.isArray(data?.stops) ? data.stops : [], waypoints:Array.isArray(data?.waypoints) ? data.waypoints : [], destination: data?.destination || null,
    basicFlag:data?.basicFlag||null,basicTrail:Array.isArray(data?.basicTrail)?data.basicTrail:[],basicWaypointReached:Boolean(data?.basicWaypointReached)};
}

const samePin = (first, second) => Boolean(first && second && first.sceneId === second.sceneId && first.noteId === second.noteId);
const nextPin = state => state.waypoints[0] || state.destination;

function travelCanOpenScene(scene, user = game.user) {
  return Boolean(scene && (user?.isGM || scene.active || scene.isView || (scene.navigation && scene.visible)));
}

function travelIsLocation(entry) {
  return Boolean(entry && travelApi()?.getWorldProfile?.(entry)?.category === "location");
}

function travelIsWaypoint(note) {
  const flags=note?.flags?.[TRAVEL_MODULE];
  const legacyTomeNote=flags?.notePinStyle==="borderless" && note.texture?.src===MAP_ART+"map-parchment.svg";
  return Boolean(note?.entry && (travelIsLocation(note.entry) || flags?.mapWaypoint || legacyTomeNote ||
    typeof note.flags?.['realm-guard']?.mapMarkerVisible==='boolean'));
}

function travelResolveStop(stop, user = game.user) {
  const scene = game.scenes.get(stop?.sceneId);
  const note = scene?.notes.get(stop?.noteId);
  const entry = note?.entry;
  if (!entry || !user || !travelCanOpenScene(scene, user) || !travelApi()?.canView?.(entry, user)) return null;
  if (!user.isGM && (note.flags?.[TRAVEL_MODULE]?.mapMarkerVisible === false || note.flags?.["realm-guard"]?.mapMarkerVisible === false ||
      (note.page && !note.page.testUserPermission(user, "OBSERVER")))) return null;
  return {scene, note, entry};
}

function basicRouteView(state=travelState()) {
  if (!state.basicFlag && !state.basicTrail.length) {
    return {stops:state.stops,ahead:[...state.waypoints,state.destination],final:state.destination,moving:true};
  }
  const last=travelResolveStop(state.stops.at(-1));
  const flag=state.basicFlag||(last&&{x:last.note.x,y:last.note.y,sceneId:last.scene.id});
  return {mode:'free',stops:state.stops,ahead:game.user.isGM?state.waypoints:[],final:state.destination,flag,trail:state.basicTrail};
}

function basicFlagHandle(state=travelState()) {
  if (!game.user?.isGM) return null;
  const last=travelResolveStop(state.stops.at(-1));
  const flag=state.basicFlag||(last&&{x:last.note.x,y:last.note.y,sceneId:last.scene.id});
  return flag?.sceneId===globalThis.canvas?.scene?.id ? {groupId:'basic-party',label:'Party',flag,basic:true,canMove:true,
    original:JSON.stringify(state)} : null;
}

async function moveBasicFlag(handle,points) {
  const scene=globalThis.canvas?.scene;
  const current=basicFlagHandle();
  if (!current || travelSaving || travelApi()?.travelPlanner?.controlled() || current.original!==handle.original || scene?.id!==handle.flag.sceneId) {
    throw Error('The party flag changed. Drag it again.');
  }
  if (!travelApi()?.travelPlanner?.canShareScene(scene.id)) throw Error('Share this map with players or use Travel Planner to move the flag on a private map.');
  if (!Array.isArray(points)||!points.length||points.length>512||points.some(point=>
    ![point?.x,point?.y].every(Number.isFinite)||!canvas.dimensions.rect.contains(point.x,point.y))) throw Error('Draw the route inside this map.');
  const path=compactPath([{x:current.flag.x,y:current.flag.y},...points.map(({x,y})=>({x,y}))],0.5);
  if(pathLength(path)<0.5)return;
  const shared=game.settings.get(TRAVEL_MODULE,TRAVEL_SETTING), sceneId=scene.id, state=travelState();
  const segment={id:foundry.utils.randomID(),sceneId,points:path};
  const past=state.basicWaypointReached?state.basicTrail.map(row=>({...row,completed:true})):state.basicTrail;
  const next={...state,basicFlag:{...path.at(-1),sceneId},basicTrail:[...past,segment],basicWaypointReached:false};
  const previousArrival={result:JSON.stringify(next),state,sceneId,kind:'movement'};
  travelSaving=true;
  try {await game.settings.set(TRAVEL_MODULE,TRAVEL_SETTING,{...shared,...next,previousArrival});}
  finally {travelSaving=false;}
  const markerAt=travelApi()?.travelPlanner?.markerAt;
  const arrival=markerAt?.(scene,path.at(-1),game.user);
  if(arrival&&arrival.id!==markerAt(scene,current.flag,game.user)?.id)offerMarkerScenes({sceneId,noteId:arrival.id});
}

function basicUndoLabel(sceneId, original) {
  const undo=game.settings.get(TRAVEL_MODULE,TRAVEL_SETTING)?.previousArrival;
  if (!matchesBasicUndo(undo,original) || (sceneId && (undo.sceneId||travelState().stops.at(-1)?.sceneId)!==sceneId)) return;
  return undo.kind==='route'?'Undo route change':undo.kind==='movement'?'Undo flag movement':'Undo last stop';
}

function matchesBasicUndo(undo,original) {
  if (!undo?.result) return false;
  if (undo.result===original) return true;
  const {basicWaypointReached,...legacyState}=JSON.parse(original);
  return !basicWaypointReached && undo.result===JSON.stringify(legacyState);
}

function basicUndoAction(sceneId) {
  if (!game.user?.isGM || travelApi()?.travelPlanner?.controlled()) return;
  const owner=game.user.id, worldId=game.world.id, original=JSON.stringify(travelState());
  const label=basicUndoLabel(sceneId,original);
  if (label) return {label,run:()=>travelWrite({undo:true,requireSnapshot:true},owner,worldId,original)};
}

function travelPartyPosition() {
  const routes = travelApi()?.travelPlanner?.routes();
  const route = !game.user.isGM && routes?.find(item=>item.driverId===game.user.id) || routes?.[0] || basicRouteView();
  const stops = routes ? route?.stops || [] : travelState().stops;
  const current = travelResolveStop(stops.at(-1));
  if (route?.mode==='free') {
    const flag=route.flag, scene=game.scenes.get(flag?.sceneId);
    const name=current?.entry.name||'', next=travelResolveStop(route.ahead?.[0]||route.final);
    const atPin=current&&flag&&scene===current.scene&&Math.hypot(flag.x-current.note.x,flag.y-current.note.y)<=0.5;
    const description=atPin?name:name&&next&&next.entry.name!==name?`Between ${name} and ${next.entry.name}`:name?`On the road from ${name}`:'On the road';
    const canFocus=Boolean(flag&&travelCanOpenScene(scene)&&[flag.x,flag.y].every(Number.isFinite));
    return {configured:Boolean(flag||stops.length),name,id:current?.entry.id||'',description:canFocus?description:name,canFocus,scene,point:flag&&{x:flag.x,y:flag.y},free:true};
  }
  const cursor = route?.cursor;
  const between = current && cursor?.sceneId===current.scene.id && [cursor.x,cursor.y].every(Number.isFinite) &&
    Math.hypot(cursor.x-current.note.x,cursor.y-current.note.y)>0.5;
  const next = between ? travelResolveStop(route.ahead?.[0]) : null;
  const name = current?.entry.name || "";
  const description = between ? (next && next.scene.id===current.scene.id && next.entry.name!==name ?
    `Between ${name} and ${next.entry.name}` : `On the road from ${name}`) : name;
  const point = between ? {x:cursor.x,y:cursor.y} : current && {x:current.note.x,y:current.note.y};
  const canFocus = Boolean(point && [point.x,point.y].every(Number.isFinite));
  return {configured: Boolean(stops.length),name,id:current?.entry.id || "",description,canFocus,scene:current?.scene,point};
}

function travelLocationInfo() {
  const {configured,name,id,description,canFocus}=travelPartyPosition();
  return {configured,name,id,description,canFocus};
}

async function focusPartyLocation() {
  const position=travelPartyPosition();
  if (!position?.canFocus) throw Error('The party position is unavailable.');
  if (globalThis.canvas?.scene?.id!==position.scene.id || !canvas.ready) await position.scene.view();
  const latest=travelPartyPosition();
  if (!latest.canFocus || !globalThis.canvas?.ready || canvas.scene?.id!==latest.scene.id) throw Error('The party map could not be opened.');
  if (!latest.free && !game.user.isGM && canvas.scene.tokenVision && !canvas.visibility?.testVisibility(latest.point,{tolerance:0})) {
    throw Error('The party position is outside your map vision.');
  }
  const app=travelApi()?.app?.();
  if (app?.rendered) await app.minimize?.();
  await canvas.animatePan(latest.point);
}

function travelClearOverlay() {
  for (const {ticker,tick} of travelAnimations.splice(0)) ticker.remove(tick);
  if (travelOverlay && !travelOverlay.destroyed) travelOverlay.destroy({children:true});
  if (travelFlags && !travelFlags.destroyed) travelFlags.destroy();
  travelOverlay = null;
  travelFlags = null;
  travelOverlayStamp = null;
}

function visibleMapPin(stop) {
  if (stop?.sceneId !== canvas.scene.id) return null;
  const note = travelResolveStop(stop)?.note;
  if (!Number.isFinite(note?.x) || !Number.isFinite(note?.y)) return null;
  if (!game.user.isGM && canvas.scene.tokenVision &&
      !canvas.visibility?.testVisibility({x:note.x, y:note.y}, {tolerance:0})) return null;
  return note;
}

function strokePath(graphic,points) {
  if (!points.length) return;
  graphic.moveTo(points[0].x,points[0].y);
  for (const point of points.slice(1)) graphic.lineTo(point.x,point.y);
}

function drawDashes(graphic,points,width,color,opacity) {
  const total = pathLength(points);
  graphic.lineStyle(width,color,opacity);
  for (let start=0;start<total;start+=21) strokePath(graphic,sliceTravelPath(points,start,Math.min(start+13,total)));
}

function animateDash(graphic,points) {
  const total=pathLength(points);
  if (total<1) return;
  const pulse=graphic.addChild(new PIXI.Graphics());
  const count=Math.ceil(total/21);
  const paint=index=>{
    pulse.clear();
    pulse.lineStyle(5,0x86e78e,1);
    strokePath(pulse,sliceTravelPath(points,index*21,Math.min(index*21+13,total)));
  };
  let index=0,elapsed=0;
  paint(index);
  const ticker = canvas.app?.ticker;
  if (!ticker || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const interval=Math.max(55,Math.min(175,7200/count));
  const tick=()=>{
    elapsed+=ticker.deltaMS;
    const next=Math.floor(elapsed/interval)%count;
    if(next!==index){index=next;paint(index);}
  };
  travelAnimations.push({ticker,tick});
  ticker.add(tick);
}

function pulseGoal(graphic, point, radius) {
  graphic.lineStyle(2,0x969b98,0.82).drawCircle(point.x,point.y,radius);
  const green=graphic.addChild(new PIXI.Graphics()), red=graphic.addChild(new PIXI.Graphics());
  green.lineStyle(5,0x68bb7d,0.55).drawCircle(point.x,point.y,radius+2);
  red.lineStyle(3,0xb6736f,0.50).drawCircle(point.x,point.y,Math.max(2,radius-2));
  const paint=phase=>{green.alpha=0.16+0.7*phase;red.alpha=0.14+0.36*(1-phase);};
  paint(0.55);
  const ticker=canvas.app?.ticker;
  if (!ticker||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let elapsed=0;
  const tick=()=>{elapsed=(elapsed+ticker.deltaMS)%4800;paint((1+Math.sin(elapsed/4800*2*Math.PI))/2);};
  travelAnimations.push({ticker,tick});
  ticker.add(tick);
}

function drawFlag(graphic, point, color=0x21734b, overlap=0) {
  const {x,y} = point;
  const lean = overlap===0 ? 0 : (overlap%2 ? 1 : -1) * Math.ceil(overlap/2) * 10;
  const pole = x+lean, top = y-36, fly = overlap%2 ? -1 : 1;
  graphic.lineStyle(5,0x212522,1).moveTo(x,y).lineTo(pole,top);
  graphic.lineStyle(2,0xf1dbad,1).moveTo(x,y).lineTo(pole,top);
  graphic.lineStyle(3,0x212522,1).beginFill(color,1).moveTo(pole,top+2)
    .lineTo(pole+fly*9,top+3).lineTo(pole+fly*18,top+6).lineTo(pole+fly*29,top+3)
    .lineTo(pole+fly*22,top+12).lineTo(pole+fly*29,top+21).lineTo(pole+fly*18,top+19)
    .lineTo(pole+fly*9,top+17).lineTo(pole,top+19).closePath();
  graphic.endFill();
  graphic.lineStyle(1.5,0xe9ba61,1);
  strokePath(graphic,[{x:pole,y:top+3},{x:pole+fly*9,y:top+4},{x:pole+fly*18,y:top+7},{x:pole+fly*27,y:top+5},
    {x:pole+fly*21,y:top+12},{x:pole+fly*27,y:top+20},{x:pole+fly*18,y:top+18},{x:pole+fly*9,y:top+16},{x:pole,y:top+18}]);
}

function flagForeground() {
  // A stage child keeps the flag in map coordinates while drawing above Foundry's rendered canvas groups.
  return canvas.stage?.sortableChildren ? canvas.stage : canvas.interface;
}

function createFlagGraphic({preview=false}={}) {
  const graphic = new PIXI.Graphics();
  graphic.eventMode = 'none';
  graphic.zIndex = Number.MAX_SAFE_INTEGER - (preview ? 0 : 1);
  return flagForeground().addChild(graphic);
}

function travelDraw() {
  if (!travelApi()?.canView || !globalThis.canvas?.ready || !canvas.scene || !canvas.interface || !globalThis.PIXI?.Graphics) return;
  const basic = travelState();
  const planner = travelApi().travelPlanner;
  const groups = planner?.routes() ?? [basicRouteView(basic)];
  const markColors=planner?.routeMarkColors?.()||{};
  const paths = groups.map(group=>({points:group.stops.map(visibleMapPin),ahead:group.ahead.map(visibleMapPin),
    final:group.mode==='free'?(group.final?.sceneId===canvas.scene.id?travelResolveStop(group.final)?.note:null)||
      (group.goalPoint?.sceneId===canvas.scene.id?group.goalPoint:null):visibleMapPin(group.final),
    flag:group.flag?.sceneId===canvas.scene.id?group.flag:null,goalArea:group.goalArea?.sceneId===canvas.scene.id?group.goalArea:null,mode:group.mode,
    cursor:group.cursor?.sceneId===canvas.scene.id?group.cursor:null,leg:group.leg?.sceneId===canvas.scene.id?group.leg:null,
    trail:(group.trail||[]).filter(row=>row.sceneId===canvas.scene.id&&(group.mode==='free'||visibleMapPin(row.from)&&(!row.to||visibleMapPin(row.to))))
      .map(row=>({...row,markColor:(group.completed||row.completed)?markColors[`leg:${row.id}`]:undefined})),
    completed:group.completed,moving:group.moving,breaks:group.breaks||[],markColor:markColors[group.markKey]}));
  const showPath = game.user.isGM || !canvas.scene.tokenVision;
  const pinStamp = note => note && [note.id,note.x,note.y,note.iconSize];
  const stamp = JSON.stringify([canvas.scene.id,showPath,paths.map(({points,ahead,final,cursor,leg,trail,completed,moving,breaks,mode,flag,goalArea,markColor})=>
    [points.map(pinStamp),ahead.map(pinStamp),pinStamp(final),cursor,leg,trail.map(row=>[row.id,row.completed,row.markColor]),completed,moving,breaks,mode,flag,goalArea,markColor])]);
  if (stamp===travelOverlayStamp && travelOverlay?.parent===canvas.interface && !travelOverlay.destroyed &&
      (!travelFlags || (travelFlags.parent===flagForeground() && !travelFlags.destroyed))) return;
  travelClearOverlay();
  travelOverlayStamp = stamp;
  if (!paths.some(({points,ahead,trail,flag,goalArea,final})=>points.some(Boolean)||ahead.some(Boolean)||trail.length||flag||goalArea||final)) return;

  const graphic = new PIXI.Graphics();
  graphic.eventMode = "none";
  travelOverlay = canvas.interface.addChild(graphic);
  const colors = [0x21734b,0x565991,0x9f543e,0x34748d];
  const drawOrder = [...paths.keys()].sort((a,b)=>Number(Boolean(paths[b].completed))-Number(Boolean(paths[a].completed)));
  for (const index of drawOrder) {
    const {points,ahead,final,cursor,leg,trail,completed,moving,breaks,mode,flag,goalArea,markColor} = paths[index];
    const color = colors[index % colors.length];
    const last = points.at(-1), current=mode==='free'?flag:!showPath&&!canvas.visibility?.testVisibility(cursor||last||{x:0,y:0},{tolerance:0}) ? null : cursor||last;
    const confirmedColor=markColor??(completed?0x9b9b9b:0x67d57c), confirmedOpacity=markColor?0.75:completed?0.46:0.95;
    if(mode==='free') {
      for (const segment of trail) {
        const past=completed||segment.completed;
        const highlight=markColor??segment.markColor;
        drawDashes(graphic,segment.points,3,highlight??(past?0x9b9b9b:0x67d57c),highlight?0.75:past?0.36:0.65);
      }
      if (game.user.isGM) {
        if (leg) drawDashes(graphic,leg.points,2,0xb8b8ad,0.74);
        const guide=[leg?.points.at(-1)||current,...(leg?ahead.slice(1):ahead),final];
        for (let i=1;i<guide.length;i++) {
          if (guide[i-1]&&guide[i]) drawDashes(graphic,[guide[i-1],guide[i]],2,0xb8b8ad,0.74);
        }
        for (const waypoint of ahead) {
          if (waypoint) graphic.lineStyle(2,0xb8b8ad,0.85).drawCircle(waypoint.x,waypoint.y,(waypoint.iconSize||40)/2+5);
        }
      }
      if (goalArea && Number.isFinite(goalArea.radius)) pulseGoal(graphic,goalArea,goalArea.radius);
      if (final) pulseGoal(graphic,final,(final.iconSize||40)/2+9);
    } else if(showPath){
      for(const [row,to] of points.slice(1).entries()){
        const from=points[row];
        if(from&&to&&!breaks.includes(row+1)&&!trail.some(leg=>leg.from?.noteId===from.id&&leg.to?.noteId===to.id)) drawDashes(graphic,[from,to],4,confirmedColor,confirmedOpacity);
      }
      for(const segment of trail) drawDashes(graphic,segment.points,4,markColor??segment.markColor??confirmedColor,segment.markColor?0.75:confirmedOpacity);
      const first=ahead[0];
      let known=current&&first ? leg ? sliceTravelPath(leg.points,leg.distance||0,pathLength(leg.points)) : [current,first] : [];
      if(known.length){
        const gap=ahead.indexOf(null);
        known.push(...ahead.slice(1,gap<0?ahead.length:gap));
        drawDashes(graphic,known,3,0xadadad,0.9);
        if(moving) animateDash(graphic,known);
      }
      for(let i=1;i<ahead.length;i++){
        if(ahead[i-1]&&ahead[i]&&(!known.length||ahead.slice(0,i).includes(null))) drawDashes(graphic,[ahead[i-1],ahead[i]],3,0xadadad,0.9);
      }
    }
    if (completed) for (const point of points) {
      if (point) graphic.lineStyle(2,0x9b9b9b,0.5).drawCircle(point.x,point.y,(point.iconSize||40)/2+3);
    }
    if (final && mode!=='free') graphic.lineStyle(2,0xbdbdbd,0.9).drawCircle(final.x,final.y,(final.iconSize||40)/2+6);
    if (current && !completed) {
      const overlap = paths.slice(0,index).filter(path=>{
        const point=path.flag||path.cursor||path.points.at(-1);
        return !path.completed&&point?.x===current.x&&point?.y===current.y;
      }).length;
      travelFlags ??= createFlagGraphic();
      drawFlag(travelFlags,current,color,overlap);
    }
  }
}

async function travelWrite(result, owner, worldId, original) {
  if (!game.user?.isGM || game.user.id !== owner || game.world.id !== worldId) return;
  const state = travelState();
  if (travelSaving || JSON.stringify(state) !== original) throw Error("Party travel changed while this dialog was open. Open it again.");
  const planner = travelApi()?.travelPlanner;
  if (planner?.controlled()) {
    if (result.requireSnapshot) throw Error("The travel plan changed. Open the map menu again.");
    return planner.handleBasic(result);
  }
  if (result.archive) {
    if (!planner?.archiveBasic) throw Error("Travel history is unavailable.");
    return planner.archiveBasic(state);
  }
  const next = {...state};
  const last = state.stops.at(-1);
  const shared = game.settings.get(TRAVEL_MODULE, TRAVEL_SETTING);
  let previousArrival = null;
  if (result.undo) {
    if (matchesBasicUndo(shared.previousArrival,original)) Object.assign(next,{basicWaypointReached:false},shared.previousArrival.state);
    else if (result.requireSnapshot) throw Error("There is no travel change to undo.");
    else next.stops = state.stops.slice(0, -1);
  }
  else if (result.cancelDestination) next.destination = null;
  else {
    const pin = result.arrive ? nextPin(state) : {sceneId:result.sceneId, noteId:result.noteId};
    const target=travelResolveStop(pin);
    if (!travelIsWaypoint(target?.note)) throw Error("That location pin is no longer available.");
    if (result.setDestination) {
      if (samePin(last, pin)) throw Error("The party is already at that location pin.");
      next.destination = pin;
      next.waypoints = state.waypoints.filter(waypoint=>!samePin(waypoint,pin));
    } else if (result.addWaypoint) {
      if (!samePin(last,pin) && !samePin(state.destination,pin) && !state.waypoints.some(waypoint=>samePin(waypoint,pin))) {
        next.waypoints = [...state.waypoints,pin];
      }
    } else {
      if (!samePin(last, pin)) next.stops = [...state.stops, pin];
      next.basicFlag = planner?.canShareScene?.(target.scene.id) ? {x:target.note.x,y:target.note.y,sceneId:target.scene.id} : null;
      if (state.basicWaypointReached && !samePin(last,pin)) {
        next.basicTrail=state.basicTrail.map(row=>({...row,completed:true}));
        next.basicWaypointReached=false;
      }
      if (samePin(state.waypoints[0],pin)) {
        next.waypoints = state.waypoints.slice(1);
        next.basicWaypointReached=true;
      }
      else if (!state.waypoints.length && samePin(state.destination,pin)) next.destination = null;
    }
  }
  if (JSON.stringify(next) === original) return;
  if (!result.undo) {
    const route=result.setDestination||result.addWaypoint||result.cancelDestination;
    previousArrival={result:JSON.stringify(next),state,kind:route?'route':'stop',
      sceneId:result.sceneId||(result.cancelDestination?state.destination:next.stops.at(-1))?.sceneId};
  }
  travelSaving = true;
  try { await game.settings.set(TRAVEL_MODULE, TRAVEL_SETTING, {...shared,...next,previousArrival}); }
  finally { travelSaving = false; }
  if(previousArrival?.kind==='stop')offerMarkerScenes(next.stops.at(-1));
}

async function travelOpen(entryId, {positionOnly=false}={}) {
  if(positionOnly&&!game.user?.isGM)throw Error("Only a GM can change the party position.");
  const owner = game.user.id, worldId = game.world.id;
  const state = travelState();
  const {stops, destination, waypoints} = state, last = stops.at(-1);
  const history = stops.map(stop => travelResolveStop(stop)).filter(Boolean);
  const current = travelResolveStop(last);
  const planner = travelApi()?.travelPlanner;
  const route = planner?.controlled() ? planner.routes()?.[0] : null;
  const target = travelResolveStop(route ? route.ahead[0] : nextPin(state));
  const final = travelResolveStop(route ? route.final : destination);
  const canEdit = game.user.isGM;
  const places = canEdit ? game.scenes.contents.flatMap(scene => scene.notes.contents
    .filter(note => (!entryId || note.entryId === entryId) && travelIsWaypoint(note))
    .map(note => ({sceneId:scene.id, noteId:note.id, label:`${note.entry.name} · ${scene.name} (${note.x}, ${note.y})`}))
  ).sort((a,b) => a.label.localeCompare(b.label)) : [];

  const options = places.map(({sceneId, noteId, label}, index) => {
    const selected = last?.sceneId === sceneId && last?.noteId === noteId;
    return `<option value="${index}" ${selected ? "selected" : ""}>${travelEsc(label)}</option>`;
  }).join("");
  const locationPicker=places.length
    ? `<label>Location pin<select name="partyTravelPin">${options}</select></label>`
    : canEdit ? "<p>Place a location pin on a scene before changing the party position.</p>" : "";
  const moveButton={action:"move", label:"Set party position", callback:(_event,_button,dialog)=>{
    const place=places[Number(dialog.element.querySelector('[name="partyTravelPin"]').value)];
    return place ? {sceneId:place.sceneId,noteId:place.noteId} : null;
  }};
  const closeButton={action:"close",label:"Close",callback:()=>null};
  if(positionOnly){
    const result=await foundry.applications.api.DialogV2.wait({
      window:{title:"Change party location"},position:{width:550},rejectClose:false,
      buttons:places.length?[closeButton,moveButton]:[closeButton],
      content:locationPicker
    });
    if(result)await travelWrite(result,owner,worldId,JSON.stringify(state));
    return;
  }
  const historyList = history.length ? `<ol>${history.map(({scene,entry}) => `<li>${travelEsc(entry.name)} · ${travelEsc(scene.name)}</li>`).join("")}</ol>` : "<p>No visible stops yet.</p>";
  const buttons = [closeButton];
  if (canEdit && travelApi()?.travelPlanner) buttons.push({action:"planner",label:"Travel Planner…",callback:()=>({planner:true})});
  if (planner?.history().length) buttons.push({action:"history",label:"Journey history…",callback:()=>({history:true})});
  if (current) buttons.push({action:"view", label:"Open map for me", callback:()=>({view:true})});
  const undo=canEdit&&(planner?.routeUndoAction?.()||basicUndoAction());
  if (undo) buttons.push({action:"undo",label:undo.label,callback:()=>({undo:true})});
  if (canEdit && target) buttons.push({action:"arrive", label:"Mark as arrived", callback:()=>({arrive:true})});
  if (canEdit && final) buttons.push({action:"cancel-destination", label:"Clear final destination", callback:()=>({cancelDestination:true})});
  if (canEdit && !planner?.controlled() && !waypoints.length && !destination && (stops.length>1||state.basicTrail.length)) buttons.push({action:"archive",label:"Finish journey",callback:()=>({archive:true})});
  if (places.length) buttons.push(moveButton);
  const result = await foundry.applications.api.DialogV2.wait({
    window:{title:"Party Travel", resizable:true}, position:{width:570}, rejectClose:false, buttons,
    content:`<p>Current Location · <strong>${travelEsc(current?.entry.name || "Unmarked")}</strong></p>${locationPicker}
      ${target ? `<p>Next waypoint · <strong>${travelEsc(target.entry.name)}</strong></p>` : ""}
      ${final ? `<p>Final destination · <strong>${travelEsc(final.entry.name)}</strong></p>` : ""}
      <h3>Travelled route</h3>${historyList}`
  });
  if (result?.planner) return travelApi().travelPlanner.open();
  if (result?.history) return planner.openHistory();
  if (result?.undo) return undo?.run();
  if (result?.view && current && travelCanOpenScene(game.scenes.get(current.scene.id))) return current.scene.view();
  if (result) await travelWrite(result, owner, worldId, JSON.stringify(state));
}

function markerScene(point, owner) {
  if (!game.user?.isGM || game.user.id !== owner) throw Error("Only a GM can place map markers.");
  const scene = canvas?.scene;
  if (!canvas?.ready || scene?.id !== point.sceneId || !canvas.dimensions?.rect?.contains(point.x, point.y)) {
    throw Error("Choose a point inside the current scene.");
  }
  return scene;
}

async function placeMapMarker(point, action) {
  const owner = game.user.id;
  const scene = markerScene(point, owner);
  const original = JSON.stringify(travelState());
  const worldId = game.world.id;
  const locations = game.journal.contents.filter(travelIsLocation).sort((a, b) => a.name.localeCompare(b.name));
  const result = await foundry.applications.api.DialogV2.prompt({
    window: {title: action==='setDestination' ? "Set final destination" : action==='addWaypoint' ? "Add waypoint" : "Place map marker"}, rejectClose: false,
    content: `<label>Place<select name="entryId"><option value="">New place</option>${locations.map(entry =>
      `<option value="${travelEsc(entry.id)}">${travelEsc(entry.name)}</option>`).join("")}</select></label>
      <div data-new-place><label>New place name<input name="placeName" maxlength="100" required></label>
      <label><input type="checkbox" name="sharePlace"> Show new place to players</label></div>
      <label>Map pin appearance<select name="pinStyle"><option value="borderless">Borderless</option><option value="standard">Foundry background</option><option value="inherit">World default</option></select></label>`,
    render: (_event, dialog) => {
      const entry = dialog.element.querySelector('[name="entryId"]');
      const name = dialog.element.querySelector('[name="placeName"]');
      const newPlace = dialog.element.querySelector('[data-new-place]');
      entry.addEventListener("change", () => {
        newPlace.hidden = name.disabled = Boolean(entry.value);
      });
    },
    ok: {label: action==='setDestination' ? "Set final destination" : action==='addWaypoint' ? "Add waypoint" : "Place marker here", callback: (_event, button) => {
      const fields = button.form.elements;
      return {entryId: fields.entryId.value, name: fields.placeName.value.trim(), pinStyle: fields.pinStyle.value, sharePlace: fields.sharePlace.checked};
    }}
  });
  if (!result) return;
  markerScene(point, owner);
  let entry = game.journal.get(result.entryId);
  if (result.entryId && !travelIsLocation(entry)) throw Error("That World location is no longer available.");
  let createdEntry;
  let note;
  try {
    if (!entry) {
      if (!result.name) throw Error("Enter a name for the new place.");
      const {NONE, OBSERVER} = CONST.DOCUMENT_OWNERSHIP_LEVELS;
      createdEntry = entry = await JournalEntry.create({name: result.name, ownership: {default: result.sharePlace ? OBSERVER : NONE},
        flags: {[TRAVEL_MODULE]: {type: "world", worldProfile: {category: "location"}}}});
    }
    markerScene(point, owner);
    [note] = await scene.createEmbeddedDocuments("Note", [{entryId: entry.id, x: Math.round(point.x), y: Math.round(point.y), texture:{src:MAP_ART+"map-location.svg"},
      flags: {[TRAVEL_MODULE]: {notePinStyle: result.pinStyle,mapWaypoint:true}}}]);
    if (!note) throw Error("Foundry did not create the map marker.");
  } catch (error) {
    if (createdEntry) await createdEntry.delete();
    throw error;
  }
  if (canvas.scene?.id === scene.id) canvas.notes?.activate?.();
  if (action) {
    try { await travelWrite({sceneId: scene.id, noteId: note.id, [action]:true}, owner, worldId, original); }
    catch (error) { throw Error(`Marker placed. Route was not updated. ${error.message}`); }
  }
}

async function placeMapNote(point) {
  const owner = game.user.id;
  const scene = markerScene(point, owner);
  const result = await foundry.applications.api.DialogV2.prompt({
    window: {title:"Place note"}, rejectClose: false,
    content: `<label>Title<input name="noteTitle" maxlength="100" required></label>
      <label>GM note<textarea name="noteText" rows="6"></textarea></label>`,
    ok: {label:"Place note here", callback: (_event, button) => {
      const fields = button.form.elements;
      return {name:fields.noteTitle.value.trim(), text:fields.noteText.value};
    }}
  });
  if (!result) return;
  if (!result.name) throw Error("Enter a title for the note.");
  markerScene(point, owner);
  const ownership = {default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
  const content = `<p>${travelEsc(result.text).replace(/\r?\n/g, "<br>")}</p>`;
  const page = {name:result.name, type:"text", ownership, text:{format:1, content}};
  const journal = await JournalEntry.create({name:result.name, ownership, pages:[page]});
  try {
    markerScene(point, owner);
    const [note] = await scene.createEmbeddedDocuments("Note", [{entryId:journal.id, x:Math.round(point.x), y:Math.round(point.y),
      texture:{src:MAP_ART+"map-parchment.svg"}, flags:{[TRAVEL_MODULE]:{notePinStyle:"borderless",mapWaypoint:true}}}]);
    if (!note) throw Error("Foundry did not create the map note.");
  } catch (error) {
    await journal.delete();
    throw error;
  }
  if (canvas.scene?.id === scene.id) canvas.notes?.activate?.();
}

function mapActions(point, noteId) {
  if (!game.user?.isGM) return [];
  const tools = travelApi()?.mapPointTools;
  const editor = travelApi()?.travelMapEditor;
  const planner = travelApi()?.travelPlanner;
  const draw = editor && planner?.routeHandles().length ? [{label:'Draw route from flag…',run:editor.armDraw}] : [];
  const undo=planner?.routeUndoAction?.(point.sceneId)||basicUndoAction(point.sceneId);
  const records=planner?.routeRecordsAction?.(point.sceneId);
  if (!noteId) return [
    {label:"Place Note…", run:() => placeMapNote(point)},
    {label:"Place Marker…", run:() => placeMapMarker(point)},
    {label:"Add Waypoint…", run:() => placeMapMarker(point, "addWaypoint")},
    {label:"Set Final Destination…", run:() => placeMapMarker(point, "setDestination")},
    ...(tools?.actions(point) || []),...draw,...[undo,records].filter(Boolean)
  ];
  const scene = markerScene(point, game.user.id);
  const note = scene.notes.get(noteId);
  if (!note) return [];
  const markerActions = tools?.actions(point,note) || [];
  if (!travelIsWaypoint(note)) return [...markerActions,...mapSceneActions(point,note)];
  const pin = {sceneId:scene.id, noteId};
  const state = travelState();
  const owner = game.user.id, worldId = game.world.id, original = JSON.stringify(state);
  const write = result => {
    markerScene(point, owner);
    return travelWrite(result, owner, worldId, original);
  };
  const actions = [{label:"Attach Note…", run:async () => {
    markerScene(point, owner);
    if (scene.notes.get(noteId) !== note) throw Error("That location pin changed. Right-click it again.");
    await travelApi().privateVaultUI.open(note.entry, {write:true});
  }},...markerActions,...mapSceneActions(point,note),...draw,...[undo,records].filter(Boolean)];
  if (planner?.history(pin).length) actions.push({label:"Travel history…",run:()=>planner.openHistory(pin)});
  if (planner?.active()) return [...planner.mapActions(pin),...actions];
  if (samePin(pin,nextPin(state))) actions.unshift({label:"Mark as arrived",run:()=>write({arrive:true})});
  if (samePin(pin,state.destination)) actions.push({label:"Clear final destination",run:()=>write({cancelDestination:true})});
  else if (!samePin(pin,state.stops.at(-1))) actions.unshift(
    {label:"Set final destination",run:()=>write({...pin,setDestination:true})},
    {label:"Add waypoint",run:()=>write({...pin,addWaypoint:true})});
  if (!samePin(pin,state.stops.at(-1))) actions.unshift({label:"Set party position",run:()=>write(pin)});
  return actions;
}

function markerSceneIds(note) {
  const saved=note?.getFlag?.(TRAVEL_MODULE,MARKER_SCENES_FLAG);
  const legacy=note?.getFlag?.(TRAVEL_MODULE,TRAVEL_SCENE_FLAG);
  return [...new Set((Array.isArray(saved)?saved:[legacy]).filter(id=>typeof id==='string'&&id))];
}

function mapLinkedScenes(pin) {
  if(!game.user?.isGM||!pin)return [];
  const note=game.scenes.get(pin.sceneId)?.notes.get(pin.noteId);
  return markerSceneIds(note).map(id=>game.scenes.get(id)).filter(Boolean);
}

async function manageMarkerScenes(pin) {
  if(!game.user.isGM)return;
  const note=game.scenes.get(pin.sceneId)?.notes.get(pin.noteId);
  if(!note)return;
  const owner=game.user.id,world=game.world.id,original=markerSceneIds(note);
  const scenes=[...game.scenes.contents].sort((a,b)=>a.name.localeCompare(b.name));
  const result=await foundry.applications.api.DialogV2.prompt({
    window:{title:`Link scenes · ${note.label||note.entry?.name||'Map marker'}`,resizable:true},position:{width:510},
    classes:['at-marker-scene-picker'],rejectClose:false,
    content:`<label>Find a scene<input type="search" data-marker-scene-search placeholder="Scene name…"></label>
      <div data-marker-scene-list>${scenes.map(scene=>`<label><input type="checkbox" data-marker-scene value="${travelEsc(scene.id)}"
      ${original.includes(scene.id)?'checked':''}> <span>${travelEsc(scene.name)}</span></label>`).join('')}</div>`,
    render:(_event,app)=>{
      const search=app.element.querySelector('[data-marker-scene-search]');
      const rows=[...app.element.querySelectorAll('[data-marker-scene-list] label')];
      search.oninput=()=>{const query=search.value.trim().toLocaleLowerCase();for(const row of rows)row.hidden=!row.textContent.toLocaleLowerCase().includes(query);};
      search.focus();
    },
    ok:{label:'Save scene links',callback:(_event,button)=>[...button.form.querySelectorAll('[data-marker-scene]:checked')].map(input=>input.value)}
  });
  if(!Array.isArray(result))return;
  if(!game.user.isGM||game.user.id!==owner||game.world.id!==world||game.scenes.get(pin.sceneId)?.notes.get(pin.noteId)!==note||
    JSON.stringify(markerSceneIds(note))!==JSON.stringify(original))throw Error('The marker or its scene links changed. Open it again.');
  const ids=[...new Set(result)];
  if(ids.some(id=>!game.scenes.get(id)))throw Error('A selected scene is no longer available.');
  if(JSON.stringify(ids)!==JSON.stringify(original))await note.setFlag(TRAVEL_MODULE,MARKER_SCENES_FLAG,ids);
}

const markerSceneDialogs=new Set();
async function openMarkerScenes(pin){
  const scenes=mapLinkedScenes(pin);
  if(!scenes.length)return;
  const key=pin.sceneId+':'+pin.noteId;
  if(markerSceneDialogs.has(key))return;
  const owner=game.user.id,world=game.world.id;
  const note=game.scenes.get(pin.sceneId)?.notes.get(pin.noteId);
  const stillLinked=scene=>game.user.isGM&&game.user.id===owner&&game.world.id===world&&
    game.scenes.get(pin.sceneId)?.notes.get(pin.noteId)===note&&mapLinkedScenes(pin).includes(scene);
  let selected=scenes[0].id;
  markerSceneDialogs.add(key);
  try{
    while(stillLinked(scenes.find(scene=>scene.id===selected))){
      const choose=action=>(_event,button)=>({action,id:button.form.elements.scene.value});
      const result=await foundry.applications.api.DialogV2.wait({window:{title:`Linked scenes · ${note.label||note.entry?.name||'Map marker'}`},
        rejectClose:false,
        content:`<label>Scene<select name="scene">${scenes.map(scene=>`<option value="${travelEsc(scene.id)}" ${scene.id===selected?'selected':''}>${travelEsc(scene.name)}</option>`).join('')}</select></label>`,
        buttons:[{action:'preview',label:'Preview for me',callback:choose('preview')},
          {action:'activate',label:'Activate for players…',callback:choose('activate')},{action:'close',label:'Close',callback:()=>null}]});
      if(!result)return;
      selected=result.id;
      const target=scenes.find(scene=>scene.id===selected);
      if(!target||!stillLinked(target))throw Error('The linked scene is no longer available.');
      if(result.action==='activate')return await confirmTravelSceneActivation(target,()=>stillLinked(target));
      await target.view();
    }
  }finally{markerSceneDialogs.delete(key);}
}

function offerMarkerScenes(pin){
  if(mapLinkedScenes(pin).length)void openMarkerScenes(pin).catch(error=>ui.notifications.warn(error.message));
}

function mapSceneActions(point,note) {
  const pin={sceneId:point.sceneId,noteId:note.id};
  const actions=[{label:markerSceneIds(note).length?'Manage scene links…':'Link scenes…',run:()=>manageMarkerScenes(pin)}];
  if(mapLinkedScenes(pin).length)actions.unshift({label:'Open linked scenes…',run:()=>openMarkerScenes(pin)});
  return actions;
}

function travelLinkedScene(ref) {
  const entry = travelApi()?.resolveEntry(ref);
  const scene = game.scenes.get(entry?.getFlag(TRAVEL_MODULE, TRAVEL_SCENE_FLAG));
  return travelCanOpenScene(scene) ? scene : null;
}

async function chooseTravelScene(previous) {
  const scenes = game.scenes.contents.map(scene => `<option value="${travelEsc(scene.id)}" ${scene.id === previous ? "selected" : ""}>${travelEsc(scene.name)}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window:{title:"Link Foundry scene"}, rejectClose:false,
    content:`<label>Scene<select name="partyScene"><option value="">No scene</option>${scenes}</select></label>`,
    ok:{label:"Save scene link",callback:(_event,_button,dialog)=>dialog.element.querySelector('[name="partyScene"]').value}
  });
  if (result && !game.scenes.get(result)) throw Error("That scene is no longer available.");
  return result;
}

async function travelEditScene(ref) {
  if (!game.user?.isGM) return;
  const entry = travelApi()?.resolveEntry(ref);
  if (!entry) return;
  const previous = entry.getFlag(TRAVEL_MODULE, TRAVEL_SCENE_FLAG) || "";
  const owner = game.user.id, worldId = game.world.id;
  const result = await chooseTravelScene(previous);
  if (typeof result !== "string" || !game.user.isGM || game.user.id !== owner || game.world.id !== worldId) return;
  if (entry !== travelApi()?.resolveEntry(ref) || (entry.getFlag(TRAVEL_MODULE, TRAVEL_SCENE_FLAG) || "") !== previous) throw Error("Scene link changed. Open it again.");
  if (result !== previous) await entry.setFlag(TRAVEL_MODULE, TRAVEL_SCENE_FLAG, result);
}

function travelUpdateSceneButtons(_app, root = document.querySelector("#adventurers-tome-app")) {
  for (const button of root?.querySelectorAll("[data-party-view-scene], [data-party-activate-scene]") || []) {
    const scene = travelLinkedScene(button.dataset.partyViewScene || button.dataset.partyActivateScene);
    button.hidden = !scene || Boolean(button.dataset.partyActivateScene && scene.active);
  }
}

async function travelActivateScene(ref) {
  const scene = travelLinkedScene(ref);
  return confirmTravelSceneActivation(scene,()=>travelLinkedScene(ref)===scene);
}

async function confirmTravelSceneActivation(scene,stillLinked) {
  if (!game.user.isGM || !scene || scene.active) return;
  const owner=game.user.id,worldId=game.world.id;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window:{title:"Activate scene for players?"}, rejectClose:false,
    content:`<p>Switch the active Foundry scene to <strong>${travelEsc(scene.name)}</strong>?</p>`
  });
  if (confirmed && game.user.isGM && game.user.id === owner && game.world.id===worldId && stillLinked()) await scene.activate();
}

Hooks.once("init", () => game.settings.register(TRAVEL_MODULE, TRAVEL_SETTING, {
  scope:"world", config:false, type:Object, default:{stops:[]},
  onChange:() => { travelDraw(); Hooks.callAll("adventurersTomePartyTravelChanged"); }
}));
function attachPartyTravel() {
  const api = travelApi();
  if (!api?.canView || api.partyTravel) return;
  api.partyTravel = Object.freeze({location:travelLocationInfo, mapActions, state:travelState, resolve:travelResolveStop, isLocation:travelIsLocation, isWaypoint:travelIsWaypoint, drawFlag,createFlagGraphic,
    basicRouteView,basicFlagHandle,moveBasicFlag,basicUndoAction,mapLinkedScenes,openMarkerScenes,offerMarkerScenes,
    mapLinkedScene:pin=>mapLinkedScenes(pin)[0]||null,
    refresh:()=>{travelDraw();Hooks.callAll("adventurersTomePartyTravelChanged");}});
  document.addEventListener("click", event => {
    const button = event.target.closest?.("#adventurers-tome-app :is([data-party-location], [data-party-change-location], [data-party-travel], [data-party-edit-scene], [data-party-view-scene], [data-party-activate-scene])");
    if (!button) return;
    const {partyTravel, partyEditScene, partyActivateScene, partyViewScene} = button.dataset;
    let result;
    if (button.hasAttribute('data-party-location')) result=focusPartyLocation();
    else if (button.hasAttribute('data-party-change-location')) result=travelOpen(undefined,{positionOnly:true});
    else if (partyTravel !== undefined) result = travelOpen(partyTravel);
    else if (partyEditScene) result = travelEditScene(partyEditScene);
    else if (partyActivateScene) result = travelActivateScene(partyActivateScene);
    else result = travelLinkedScene(partyViewScene)?.view();
    Promise.resolve(result).catch(error=>ui.notifications.error(error.message));
  });
  api.partyTravel.refresh();
}
Hooks.once("ready", attachPartyTravel);
Hooks.once("adventurersTomeCoreApiReady", attachPartyTravel);
Hooks.on("adventurersTomeViewPrepared", travelUpdateSceneButtons);
Hooks.on("canvasReady", travelDraw);
Hooks.on("canvasTearDown", travelClearOverlay);
Hooks.on("sightRefresh", () => { if (!game.user.isGM && canvas.scene?.tokenVision) travelDraw(); });
for (const hook of ["createNote", "updateNote", "deleteNote", "updateJournalEntry", "deleteJournalEntry", "updateJournalEntryPage", "updateScene"]) {
  Hooks.on(hook, () => {
    travelDraw();
    travelUpdateSceneButtons();
    if (["updateNote", "deleteNote", "updateJournalEntry", "deleteJournalEntry", "updateJournalEntryPage", "updateScene"].includes(hook)) Hooks.callAll("adventurersTomePartyTravelChanged");
  });
}
