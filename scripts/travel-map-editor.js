import {nearestOnPath,pathLength,sliceTravelPath} from './travel-geometry.mjs';

const ID='adventurers-tome';
const api=()=>globalThis.ATTestAI.modules.get(ID)?.api;
const board=()=>document.getElementById('board')||globalThis.canvas?.app?.renderer?.view||globalThis.canvas?.app?.canvas;
const onBoard=event=>{
  const surface=board();
  return Boolean(surface&&(event.target===surface||event.composedPath?.().includes(surface)));
};
let drawHandle=null,goalMode=null,gesture=null,preview=null,previewFlag=null,flagTooltip=null;

function clear() {
  const ended=gesture;
  gesture=drawHandle=goalMode=null;
  if (ended?.board.hasPointerCapture?.(ended.id)) ended.board.releasePointerCapture(ended.id);
  if (preview && !preview.destroyed) preview.destroy();
  preview=null;
  if (previewFlag && !previewFlag.destroyed) previewFlag.destroy();
  previewFlag=null;
  if (flagTooltip) {flagTooltip.board.title=flagTooltip.previous;flagTooltip=null;}
}

function flagAt(point) {
  const zoom=globalThis.canvas?.stage?.scale.x||1;
  const padding=Math.min(80,7/zoom);
  return (api()?.travelPlanner?.freeHandles?.()||[]).flatMap((handle,index,handles)=>{
    const {flag}=handle;
    const overlap=handles.slice(0,index).filter(row=>row.flag.x===flag.x&&row.flag.y===flag.y).length;
    const lean=overlap===0?0:(overlap%2?1:-1)*Math.ceil(overlap/2)*10;
    const fly=overlap%2?-1:1;
    const x=point.x-flag.x-lean,y=point.y-flag.y;
    const left=Math.min(-8,fly*32), right=Math.max(8,fly*32);
    return y>=-42-padding&&y<=7+padding&&x>=left-padding&&x<=right+padding?
      [{handle,gap:Math.abs(x-fly*13)+Math.abs(y+25)}]:[];
  }).sort((a,b)=>a.gap-b.gap)[0]?.handle;
}

function armGoalArea(groupId,version) {
  if (!game.user.isGM||!canvas?.ready) return;
  clear();
  goalMode={groupId,version,sceneId:canvas.scene.id};
  ui.notifications.info('Drag from the centre of the goal area to set its size. Escape cancels.');
}

function coords(event) {
  return canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
}

function consume(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function startGesture(event,data) {
  gesture={...data,id:event.pointerId,board:board()};
  consume(event);
  try {gesture.board.setPointerCapture?.(gesture.id);} catch { /* Document listeners still handle the gesture. */ }
}

function show(points, flag) {
  preview ??= canvas.interface.addChild(new PIXI.Graphics());
  preview.eventMode='none';
  preview.clear();
  if (points.length) {
    preview.lineStyle(4,0xe9ba61,0.95).moveTo(points[0].x,points[0].y);
    for (const point of points.slice(1)) preview.lineTo(point.x,point.y);
  }
  if (flag) {
    const travel=api().partyTravel;
    previewFlag ??= travel.createFlagGraphic({preview:true});
    previewFlag.clear();
    travel.drawFlag(previewFlag,flag);
  }
}

async function armDraw() {
  const handles=api().travelPlanner.routeHandles();
  if (!handles.length) throw Error('Set the party position and the next waypoint on this map first.');
  clear();
  let handle = handles[0];
  if (handles.length>1) {
    const id = await foundry.applications.api.DialogV2.prompt({window:{title:'Draw route for which group?'},rejectClose:false,
      content:`<label>Group<select name="travelGroup">${handles.map(row=>`<option value="${foundry.utils.escapeHTML(row.groupId)}">${foundry.utils.escapeHTML(row.label)}</option>`).join('')}</select></label>`,
      ok:{label:'Draw route',callback:(_e,button)=>button.form.elements.travelGroup.value}});
    handle=handles.find(row=>row.groupId===id);
  }
  if (!handle || canvas.scene?.id!==handle.leg.sceneId) return;
  drawHandle=handle;
  ui.notifications.info('Draw from the party flag towards the next waypoint. Release to save, or press Escape to cancel.');
}

function pointerDown(event) {
  if (event.button!==0 || event.shiftKey || gesture || !game.user || !canvas?.ready || !onBoard(event)) return;
  const editor=api()?.travelPlanner;
  if (!editor) return;
  const point=coords(event);
  if (!canvas.dimensions.rect.contains(point.x,point.y)) return;
  if (goalMode && game.user.isGM) {
    startGesture(event,{kind:'goalArea',center:point,mode:goalMode,last:point});
    return;
  }
  const free=flagAt(point);
  if (free?.canMove && !drawHandle) {
    startGesture(event,{kind:'free',handle:free,points:[],last:point,offset:{x:point.x-free.flag.x,y:point.y-free.flag.y}});
    return;
  }
  if (!game.user.isGM || free || canvas.controls?.ruler?.active) return;
  const scale=canvas.stage?.scale.x||1;
  let handle=drawHandle, kind='draw', projected;
  if (!handle) {
    const candidates=editor.routeHandles().map(handle=>{
      const flag=editor.groupStart(handle);
      const offset={x:point.x-flag.x,y:point.y-flag.y};
      const onFlag=offset.x>=-7&&offset.x<=34&&offset.y>=-42&&offset.y<=7;
      return {handle,onFlag,gap:Math.abs(offset.x)+Math.abs(offset.y+18)};
    });
    handle=candidates.filter(row=>row.onFlag).sort((a,b)=>a.gap-b.gap)[0]?.handle;
    kind='travel';
    if (!handle && !canvas.tokens?.hover && !canvas.notes?.hover && !canvas.activeLayer?.hover) {
      const nearby=candidates.flatMap(({handle})=>{
        const start=handle.leg.distance||0;
        const points=sliceTravelPath(handle.leg.points,start,pathLength(handle.leg.points));
        const nearest=nearestOnPath(points,point);
        return nearest && nearest.gap<=6/scale ? [{handle,distance:start+nearest.distance,gap:nearest.gap}] : [];
      }).sort((a,b)=>a.gap-b.gap)[0];
      if (nearby) {handle=nearby.handle;projected=nearby.distance;kind='via';}
    }
  }
  if (!handle) return;
  startGesture(event,{kind,handle,points:[point],last:point,distance:projected,moved:false});
}

function pointerMove(event) {
  if (!gesture) {
    const onMap=onBoard(event) && canvas?.ready;
    const flag=onMap?flagAt(coords(event)):null;
    if (flag) {
      if (!flagTooltip) flagTooltip={board:board(),previous:board().title};
      flagTooltip.board.title=flag.canMove?`${flag.label} · Drag to move`:(flag.label||'Party');
    } else if (flagTooltip) {flagTooltip.board.title=flagTooltip.previous;flagTooltip=null;}
    return;
  }
  if (gesture.id!==event.pointerId) return;
  consume(event);
  const point=coords(event), {handle,kind}=gesture;
  if (!canvas.dimensions.rect.contains(point.x,point.y)) return;
  if (Math.hypot(point.x-gesture.last.x,point.y-gesture.last.y)<3) return;
  gesture.last=point;
  gesture.moved=true;
  if (kind==='goalArea') {
    const {center}=gesture;
    preview??=canvas.interface.addChild(new PIXI.Graphics());
    preview.eventMode='none';
    preview.clear();
    preview.lineStyle(3,0xababab,0.9).drawCircle(center.x,center.y,Math.hypot(center.x-point.x,center.y-point.y));
  } else if (kind==='free') {
    const flag={x:point.x-gesture.offset.x,y:point.y-gesture.offset.y};
    if (canvas.dimensions.rect.contains(flag.x,flag.y)) {
      gesture.points.push(flag);
      show([handle.flag,...gesture.points],flag);
    }
  } else if (kind==='travel') {
    const nearest=nearestOnPath(handle.leg.points,point);
    if (nearest) {gesture.distance=nearest.distance;show([],nearest.point);}
  } else if (kind==='via') {
    const start=handle.leg.distance||0;
    show([...sliceTravelPath(handle.leg.points,start,gesture.distance),point,...sliceTravelPath(handle.leg.points,gesture.distance,pathLength(handle.leg.points)).slice(1)]);
  } else {
    gesture.points.push(point);
    show([api().travelPlanner.groupStart(handle),...gesture.points,handle.leg.points.at(-1)]);
  }
}

function pointerUp(event) {
  if (!gesture || gesture.id!==event.pointerId) return;
  consume(event);
  const {handle,kind,points,distance,moved,offset,center,mode}=gesture;
  const point=coords(event);
  clear();
  if (!moved || !canvas.dimensions.rect.contains(point.x,point.y)) return;
  if (kind==='goalArea') {
    const radius=Math.hypot(point.x-center.x,point.y-center.y);
    void api().travelPlanner.setGoalArea(mode.groupId,mode.version,{...center,radius,sceneId:mode.sceneId}).catch(error=>ui.notifications.warn(error.message));
    return;
  }
  if (kind==='free') {
    const end={x:point.x-offset.x,y:point.y-offset.y};
    if (!canvas.dimensions.rect.contains(end.x,end.y)) return;
    void api().travelPlanner.moveFlag(handle,[...points,end]).catch(error=>ui.notifications.warn(error.message));
    return;
  }
  const change={kind,distance,points};
  if (kind==='travel') {
    const nearest=nearestOnPath(handle.leg.points,point);
    if (!nearest) return;
    const end=handle.leg.points.at(-1), threshold=14/(canvas.stage?.scale.x||1);
    change.distance=Math.hypot(end.x-point.x,end.y-point.y)<=threshold ? pathLength(handle.leg.points) : nearest.distance;
  } else if (kind==='via') {
    const travel=api().partyTravel;
    const note=canvas.notes?.placeables.find(object=>object.isVisible!==false && object.bounds?.contains(point.x,point.y) && travel.isWaypoint(object.document));
    if (!note) {ui.notifications.info('Drop the route on a place marker to add a waypoint.');return;}
    change.note=note.document;
  } else change.points=[...points,point];
  void api().travelPlanner.editOnMap(handle,change).catch(error=>ui.notifications.warn(error.message));
}

function attachTravelMapEditor() {
  const tome=api();
  if (!tome || tome.travelMapEditor) return;
  tome.travelMapEditor=Object.freeze({armDraw,armGoalArea,flagAt});
  document.addEventListener('pointerdown',pointerDown,true);
  document.addEventListener('pointermove',pointerMove,true);
  document.addEventListener('pointerup',pointerUp,true);
  document.addEventListener('pointercancel',event=>{if(event.pointerId===gesture?.id)clear();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(drawHandle||goalMode||gesture)){consume(event);clear();}},true);
}
Hooks.once('ready',attachTravelMapEditor);
Hooks.once('adventurersTomeCoreApiReady',attachTravelMapEditor);
Hooks.on('canvasTearDown',clear);
