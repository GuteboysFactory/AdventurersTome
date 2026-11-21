import {pathLength,pointAlong,sliceTravelPath} from './travel-geometry.mjs';

export const pinKey = pin => pin ? `${pin.sceneId}:${pin.noteId}` : '';
const samePin = (a, b) => Boolean(a && b && pinKey(a) === pinKey(b));

export function newTravelPlan(id, {stops, destination, waypoints = []}, memberIds) {
  const queue = waypoints.map(pin=>({pin}));
  if (destination) queue.push({pin:destination,final:true});
  const group = {id, label:'Party', memberIds, stops:[...stops], queue, pending:null};
  return {id, enabled:false, visibility:'public', sessionId:'', groups:[group], pastRoutes:[], history:[], logStart:0, logs:[], undo:null};
}

const addWaypoint = (group, waypoint) => group.queue.splice(group.queue.at(-1)?.final ? group.queue.length-1 : group.queue.length,0,waypoint);
function reachFreeWaypoint(group,pin) {
  const index=group.queue.findIndex(stop=>samePin(stop.pin,pin));
  if (index<0) return;
  const [waypoint]=group.queue.splice(index,1);
  if (waypoint.final) {group.queue=[];group.goalArea=null;}
  return waypoint;
}

function leaveFreeWaypoint(group) {
  if (!group.reachedWaypoint) return;
  delete group.reachedWaypoint;
  for (const segment of group.trail||[]) segment.completed=true;
}
const routeEdits = new Set(['draw','via','append','destination','reroute','detour','clearDestination','remove','goalArea','goalVisibility']);

export function changeTravelPlan(plan, command) {
  if (command.type === 'new' || command.type === 'finish') {
    if (command.type === 'finish' && plan.groups.some(group=>(plan.mode==='free'?group.queue.some(stop=>stop.final):group.queue.length) || group.pending)) throw Error('Resolve the remaining travel before finishing the journey.');
    const current = plan.groups[0].stops.at(-1);
    const next = newTravelPlan(command.id,{stops:current?[current]:[],destination:null},command.memberIds);
    if (command.type==='finish') {
      next.groups[0].cursor=plan.groups[0].cursor||null;
      next.groups[0].driverId=plan.groups[0].driverId||null;
    }
    const routes = [...plan.groups,...(plan.pastRoutes || [])].filter(group=>group.stops.length>1||group.trail?.length)
      .map(({id,label,stops,trail,breaks})=>({id,label,mode:plan.mode,stops,trail:trail||[],breaks:breaks||[]}));
    const history = [...(plan.history || [])];
    const logIds = plan.logs.slice(plan.logStart || 0).map(log=>log.id);
    if (routes.length || logIds.length) history.push({id:plan.id,finishedAt:command.finishedAt,sessionId:plan.sessionId,routes,logIds});
    return {...next, history, logs:plan.logs, logStart:plan.logs.length,
      events:plan.events, mode:plan.mode, enabled:command.type==='finish' && plan.enabled, visibility:plan.visibility, sessionId:plan.sessionId};
  }
  const next = structuredClone(plan);
  const group = next.groups.find(group => group.id === command.groupId) ?? next.groups[0];
  const current = group.stops.at(-1);
  const log = (kind, fields = {}) => next.logs.push({id:`${command.id}:${next.logs.length}`, sessionId:next.sessionId,
    group:group.label, kind, pin:current, ...fields});
  const track = (leg, distance, arrival) => {
    const points = sliceTravelPath(leg.points,leg.distance||0,distance);
    const id = `${command.id}:travel`;
    if (points.length>1) (group.trail ??= []).push({id,sceneId:leg.sceneId,points,from:current,to:arrival||null,actors:[...group.memberIds],sessionId:next.sessionId});
    if (!arrival && points.length>1) log('movement',{share:true,trailId:id,actors:[...group.memberIds]});
    group.cursor = {...pointAlong(leg.points,distance),sceneId:leg.sceneId};
    group.leg = {...leg,distance};
    return points.length>1?id:undefined;
  };
  if (command.type === 'refresh') return next;
  if (command.type === 'configure') {
    if (next.enabled!==command.enabled) next.undo=null;
    next.enabled = command.enabled;
    next.visibility = command.visibility === 'travelled' ? 'travelled' : 'public';
    next.sessionId = command.sessionId;
    return next;
  }
  if (!next.enabled) throw Error('Enable the travel planner before changing the journey.');
  if (command.type==='markerEvent') {
    next.events ??= {};
    const key=pinKey(command.pin);
    if (command.event) next.events[key]={...command.event,id:command.id};
    else {
      delete next.events[key];
      for (const groups of [next.groups,next.undo?.groups||[]]) {
        for (const group of groups) for (const waypoint of group.queue) if (samePin(waypoint.pin,command.pin)) delete waypoint.event;
      }
    }
    return next;
  }
  if (command.type === 'undo') {
    if (!next.undo) throw Error('There is no travel change to undo.');
    next.groups = next.undo.groups;
    next.logs.length = next.undo.logCount;
    next.undo = null;
    return next;
  }
  next.undo = null;
  const rememberUndo = (kind) => {
    next.undo = {groups:structuredClone(plan.groups),logCount:plan.logs.length,groupId:group.id,kind};
  };
  switch (command.type) {
    case 'driver':
      group.driverId=command.driverId||null;
      break;
    case 'goalArea':
      group.goalArea=command.area;
      group.goalVisibility=command.area?'area':'hidden';
      break;
    case 'goalVisibility':
      group.goalVisibility=command.visibility;
      break;
    case 'freeTravel': {
      if (group.pending) throw Error('Wait for the GM to resolve the current event.');
      const {points,sceneId,marker}=command;
      if (points.length<2 || pathLength(points)<0.5) return structuredClone(plan);
      rememberUndo('movement');
      leaveFreeWaypoint(group);
      group.revision=(group.revision||0)+1;
      group.cursor={...points.at(-1),sceneId};
      group.leg=group.nextLeg=null;
      const trailId=`${command.id}:travel`;
      (group.trail??=[]).push({id:trailId,sceneId,points,from:current||null,to:marker||null,actors:[...group.memberIds],sessionId:next.sessionId});
      if (marker) {
        const markerKey=pinKey(marker);
        const arrived=group.lastDroppedMarker!==markerKey;
        group.lastDroppedMarker=markerKey;
        if (!samePin(current,marker)) {
          if (current) (group.breaks??=[]).push(group.stops.length);
          group.stops.push(marker);
        }
        const waypoint=reachFreeWaypoint(group,marker);
        if (waypoint && !waypoint.final) group.reachedWaypoint=true;
        const event=next.events?.[markerKey]||waypoint?.event;
        if (event && arrived) group.pending={pin:marker,event};
        log('arrival',{pin:marker,share:true,actors:[...group.memberIds],trailId});
      } else {
        group.lastDroppedMarker=null;
        log('movement',{share:true,actors:[...group.memberIds],trailId});
      }
      break;
    }
    case 'draw':
      if (group.pending || !samePin(group.queue[0]?.pin,command.pin)) throw Error('The next waypoint changed. Open the route again.');
      group.leg = command.leg;
      break;
    case 'via': {
      if (group.pending || samePin(current,command.pin) || samePin(group.queue.at(-1)?.final ? group.queue.at(-1).pin : null,command.pin)) throw Error('Choose an intermediate waypoint ahead of the flag.');
      const index = group.queue.findIndex(stop=>samePin(stop.pin,command.pin));
      group.queue.unshift(index<0?{pin:command.pin}:group.queue.splice(index,1)[0]);
      group.leg = command.leg;
      group.nextLeg = command.nextLeg;
      break;
    }
    case 'append':
      if (!samePin(current,command.pin) && !group.queue.some(stop=>samePin(stop.pin,command.pin))) addWaypoint(group,{pin:command.pin});
      break;
    case 'destination': {
      if (samePin(current,command.pin)) throw Error('Choose a final destination ahead of the group.');
      const previous = group.queue.at(-1);
      if (command.visibility) group.goalVisibility=command.visibility;
      if (previous?.final && samePin(previous.pin,command.pin)) break;
      if (previous?.final) {
        if (previous.event) delete previous.final;
        else group.queue.pop();
      }
      const index = group.queue.findIndex(stop=>samePin(stop.pin,command.pin));
      const waypoint = index<0 ? {pin:command.pin} : group.queue.splice(index,1)[0];
      group.queue.push({...waypoint,final:true});
      break;
    }
    case 'reroute':
    case 'detour': {
      if (samePin(current, command.pin)) throw Error('Choose a point ahead of the group.');
      const existing = group.queue.findIndex(stop => samePin(stop.pin, command.pin));
      if (group.queue[existing]?.final) throw Error('The final destination must stay at the end of the route.');
      if (command.type === 'reroute' && existing === 0) break;
      const waypoint = existing < 0 ? {pin:command.pin} : group.queue.splice(existing, 1)[0];
      waypoint.approach = command.type;
      if (command.type === 'reroute') group.queue.splice(0, group.queue[0]?.final ? 0 : 1, waypoint);
      else group.queue.unshift(waypoint);
      break;
    }
    case 'event': {
      if (command.index === -1 && command.event) {
        if (samePin(current, command.pin)) throw Error('Choose a waypoint the group has yet to reach.');
        addWaypoint(group,{pin:command.pin,event:command.event});
        break;
      }
      const stop = group.queue[command.index];
      if (!samePin(stop?.pin, command.pin)) throw Error('This waypoint changed. Open the plan again.');
      if (command.event) stop.event = command.event;
      else delete stop.event;
      break;
    }
    case 'clearDestination': {
      const destination = group.queue.at(-1);
      if (destination?.final) {
        if (destination.event) delete destination.final;
        else group.queue.pop();
      }
      group.goalArea=null;
      break;
    }
    case 'remove':
      if (!samePin(group.queue[command.index]?.pin, command.pin)) throw Error('This waypoint changed. Open the plan again.');
      if (group.queue[command.index]?.final) throw Error('Use Clear final destination to remove the finish.');
      group.queue.splice(command.index, 1);
      break;
    case 'arrive':
    case 'travel':
    case 'position': {
      if (group.pending) throw Error('Resolve or skip the current event first.');
      const scheduled = command.type !== 'position' || (next.mode!=='free' && samePin(group.queue[0]?.pin,command.pin));
      const freePosition = next.mode==='free' && command.type==='position';
      const waypoint = scheduled ? group.queue[0] : {pin:command.pin};
      if (!waypoint || (command.pin && !samePin(waypoint.pin, command.pin))) throw Error('Set this waypoint as the next destination first.');
      if (samePin(current, waypoint.pin)) throw Error('The group is already at this waypoint.');
      rememberUndo('movement');
      const leg = command.leg;
      let trailId;
      if (leg?.target===pinKey(waypoint.pin)) {
        const total = pathLength(leg.points);
        const distance = command.type==='travel' ? Math.max(0,Math.min(total,command.distance)) : total;
        const reached = total-distance<0.5;
        if (Math.abs(distance-(leg.distance||0))<0.5 && !reached) return structuredClone(plan);
        trailId=track(leg,reached?total:distance,reached?waypoint.pin:null);
        if (!reached) break;
      } else if (command.type==='travel') throw Error('The route changed. Drag the flag again.');
      if (scheduled) group.queue.shift();
      const reached = freePosition ? reachFreeWaypoint(group,waypoint.pin) : null;
      if (next.mode==='free') {
        leaveFreeWaypoint(group);
        if (reached&&!reached.final || scheduled&&!waypoint.final) group.reachedWaypoint=true;
      }
      if (!scheduled && current) (group.breaks ??= []).push(group.stops.length);
      group.stops.push(waypoint.pin);
      if (next.mode==='free') group.lastDroppedMarker=pinKey(waypoint.pin);
      group.cursor = null;
      group.leg = group.nextLeg?.target===pinKey(group.queue[0]?.pin) && scheduled ? group.nextLeg : null;
      group.nextLeg = null;
      const event=reached?.event||waypoint.event;
      if (event) group.pending = {pin:waypoint.pin,event};
      log('arrival', {pin:waypoint.pin, approach:waypoint.approach, share:true,actors:[...group.memberIds],trailId});
      break;
    }
    case 'resolve': {
      if (!group.pending) throw Error('There is no event awaiting a decision.');
      const {event, pin} = group.pending;
      const outcome = command.outcome;
      const branch = outcome === 'success' ? event.success : outcome === 'failure' ? event.failure : null;
      if (branch && !samePin(current, branch) && !samePin(group.queue[0]?.pin, branch) &&
        !(group.queue.at(-1)?.final && samePin(group.queue.at(-1).pin,branch))) {
        const index = group.queue.findIndex(stop => samePin(stop.pin, branch));
        group.queue.unshift(index < 0 ? {pin:branch} : group.queue.splice(index, 1)[0]);
      }
      if (outcome!=='skip') log('event',{pin,detail:`${event.title} · ${outcome}`,publicText:command.publicText,actors:[...group.memberIds]});
      group.pending = null;
      break;
    }
    case 'split': {
      const members = group.memberIds.filter(id => command.memberIds.includes(id));
      if (!members.length || members.length === group.memberIds.length) throw Error('Choose some of the characters for the new group.');
      if (!current && !group.cursor) throw Error('Set the party position before splitting the group.');
      if (next.mode!=='free' && (!command.pin || samePin(current, command.pin))) throw Error('Choose a destination for the new group.');
      if (group.pending) throw Error('Resolve the current event before splitting up.');
      group.memberIds = group.memberIds.filter(id => !members.includes(id));
      if (group.label === 'Party') group.label = 'Group 1';
      const label = `Group ${Math.max(1, ...next.groups.map(group => Number(group.label.split(' ').at(-1)) || 0)) + 1}`;
      if (next.mode==='free') group.driverId=command.remainingDriverId||null;
      next.groups.push({id:command.id,label,memberIds:members,stops:current?[current]:[],queue:command.pin?[{pin:command.pin,final:true}]:[],pending:null,
        cursor:group.cursor,driverId:command.driverId||null});
      log('split', {detail:`${label} · ${command.memberNames.join(', ')}`, share:true});
      break;
    }
    case 'rejoin': {
      const other = next.groups.find(candidate => candidate.id === command.otherId && candidate.id !== group.id);
      if (!other || (next.mode==='free' ? !command.together : (!current || group.cursor || other.cursor || !samePin(current,other.stops.at(-1))))) {
        throw Error(next.mode==='free'?'Bring both flags together on the map to rejoin.':'Both groups must reach the same waypoint to rejoin.');
      }
      if (group.pending || other.pending) throw Error('Resolve each group’s current event before rejoining.');
      group.memberIds.push(...other.memberIds);
      (next.pastRoutes ??= []).push({id:other.id,label:other.label,mode:next.mode,stops:other.stops,trail:other.trail||[],breaks:other.breaks||[]});
      next.groups = next.groups.filter(candidate => candidate.id !== other.id);
      log('rejoin', {detail:other.label, share:true});
      if (next.groups.length === 1) group.label = 'Party';
      break;
    }
    default: throw Error('Unknown travel decision.');
  }
  if (routeEdits.has(command.type)) {
    if (JSON.stringify(next.groups)===JSON.stringify(plan.groups)) return structuredClone(plan);
    rememberUndo('route');
  }
  return next;
}

export function publicTravelPlan(plan, canSharePin, canShareSession, {resolvePosition=()=>null,canShareScene=()=>false}={}) {
  const pin = value => value && canSharePin(value) ? {sceneId:value.sceneId,noteId:value.noteId} : null;
  const free=plan.mode==='free';
  const trail = group => (group.trail||[]).filter(row=>group.mode==='free'||free?canShareScene(row.sceneId):pin(row.from)&&(!row.to||pin(row.to)))
    .map(row=>({...row,from:pin(row.from),to:pin(row.to),sessionId:row.sessionId&&canShareSession(row.sessionId)?row.sessionId:''}));
  const routes = plan.groups.map(group => {
    const current=group.cursor||resolvePosition(group.stops.at(-1));
    const finish=group.queue.at(-1);
    const visibility=group.goalVisibility||(plan.visibility==='public'?'exact':'hidden');
    const knownGoal=plan.enabled&&visibility==='exact'&&finish?.final;
    const goalPoint=knownGoal&&(group.goalVisibility==='exact'||pin(finish.pin))?resolvePosition(finish.pin):null;
    if (free) return {id:group.id,label:group.label,stops:group.stops.map(pin),ahead:[],mode:'free',
      final:knownGoal ? pin(finish.pin) : null,goalPoint:goalPoint&&canShareScene(goalPoint.sceneId)?goalPoint:null,
      goalArea:plan.enabled&&visibility==='area'&&canShareScene(group.goalArea?.sceneId)?group.goalArea:null,
      flag:current&&canShareScene(current.sceneId)?current:null,driverId:group.driverId||null,dragVersion:group.moveVersion??plan.dragVersion??'',
      trail:trail(group),breaks:group.breaks||[]};
    return {id:group.id,label:group.label,stops:group.stops.map(pin),
    ahead:plan.enabled && plan.visibility === 'public' ? group.queue.filter(stop=>!stop.event?.hidePin).map(stop => pin(stop.pin)) : [],
    final:plan.enabled && plan.visibility === 'public' && group.queue.at(-1)?.final && !group.queue.at(-1)?.event?.hidePin ? pin(group.queue.at(-1).pin) : null,
    leg:plan.enabled&&plan.visibility==='public'&&!group.queue[0]?.event?.hidePin&&group.leg?.target===pinKey(group.queue[0]?.pin)&&pin(group.stops.at(-1))&&pin(group.queue[0]?.pin) ? group.leg : null,
      cursor:group.cursor&&pin(group.stops.at(-1)) ? group.cursor : null,trail:trail(group),breaks:group.breaks||[],moving:!group.pending};
  });
  for (const route of plan.pastRoutes ?? []) routes.push({id:route.id,label:route.label,mode:route.mode,stops:route.stops.map(pin),trail:trail(route),breaks:route.breaks||[],ahead:[],completed:true});
  const sharedTravel=new Set(routes.flatMap(route=>(route.trail||[]).map(row=>row.id)));
  for (const journey of plan.history||[]) for (const route of journey.routes) for (const row of trail(route)) sharedTravel.add(row.id);
  const logs = plan.logs.filter(log => log.sessionId && canShareSession(log.sessionId) && (log.publicText || (log.share && (pin(log.pin)||sharedTravel.has(log.trailId)))))
    .map(log => ({id:log.id, sessionId:log.sessionId, group:log.group, kind:log.approach || log.kind, pin:pin(log.pin), publicText:log.publicText || '',
      trailId:log.trailId,actors:log.actors}));
  const logIds = new Set(logs.map(log=>log.id));
  const history = (plan.history || []).map(journey=>({id:journey.id,finishedAt:journey.finishedAt,
    sessionId:journey.sessionId && canShareSession(journey.sessionId) ? journey.sessionId : '',
    logIds:journey.logIds.filter(id=>logIds.has(id)),routes:journey.routes.map(route=>({...route,stops:route.stops.map(pin),trail:trail(route)})).filter(route=>route.stops.some(Boolean)||route.trail.length)
  })).filter(journey=>journey.routes.length || journey.logIds.length);
  const summaryRoutes=routes.map(({id,label,mode,stops,trail,breaks})=>({id,label,mode,stops,trail,breaks}));
  const summaryLogs=plan.logs.slice(plan.logStart||0).map(log=>log.id).filter(id=>logIds.has(id));
  const currentJourney = summaryLogs.length || summaryRoutes.some(route=>route.trail?.length||route.stops.filter(Boolean).length>1) ?
    {id:plan.id,sessionId:plan.sessionId&&canShareSession(plan.sessionId)?plan.sessionId:'',routes:summaryRoutes,logIds:summaryLogs} : null;
  return {routes, logs, history,currentJourney};
}

export const archiveRouteKey = (journey,route) => `route:${journey.id}:${route.id}`;
export const trailMarkKey = segment => `leg:${segment.id}`;

export function removeTravelRecords(plan,shared,rows,owner) {
  const archiveKeys=new Set(rows.filter(row=>row.archive).map(row=>row.key));
  const segmentIds=new Set(rows.filter(row=>!row.archive).map(row=>row.segment.id));
  const trimTrail=route=>route.trail?.some(segment=>segmentIds.has(segment.id))?
    {...route,trail:route.trail.filter(segment=>!segmentIds.has(segment.id))}:route;
  const trimArchive=journey=>({...journey,routes:journey.routes.filter(route=>!archiveKeys.has(archiveRouteKey(journey,route)))});
  const basicTrail=shared.basicTrail?.filter(segment=>!segmentIds.has(segment.id));
  const summary=shared.currentJourney;
  const summaryRoutes=summary?.routes.map(trimTrail);
  const hasTravel=route=>route.stops.filter(Boolean).length>1||route.trail?.length;
  const nextShared={...shared,
    ...(basicTrail?.length!==shared.basicTrail?.length?{basicTrail,previousArrival:null}:{}),
    ...(shared.plannerOwner===owner?{routes:shared.routes?.map(trimTrail),
      currentJourney:summary&&(summary.logIds.length||summaryRoutes.some(hasTravel))?{...summary,routes:summaryRoutes}:null}:{}),
    travelHistory:(shared.travelHistory||[]).map(journey=>journey.author===owner?trimArchive(journey):journey)
      .filter(journey=>journey.author!==owner||journey.routes.length||journey.logIds.length)};
  if (!plan?.id || rows.every(row=>row.basic) && ![...plan.groups,...(plan.pastRoutes||[])].some(route=>trimTrail(route)!==route)) {
    return {plan,shared:nextShared};
  }

  const removedArchives=rows.filter(row=>row.archive);
  const removedLogs=new Set(removedArchives.flatMap(({route,journey})=>journey.logIds.filter(id=>
    plan.logs.some(log=>log.id===id&&log.group===route.label))));
  for (const log of plan.logs) if (!log.sessionId && segmentIds.has(log.trailId)) removedLogs.add(log.id);
  const keepLog=id=>!removedLogs.has(id);
  const history=plan.history.map(journey=>({...trimArchive(journey),logIds:journey.logIds.filter(keepLog)}))
    .filter(journey=>journey.routes.length||journey.logIds.length);
  return {plan:{...plan,groups:plan.groups.map(trimTrail),pastRoutes:(plan.pastRoutes||[]).map(trimTrail),history,
    logs:plan.logs.filter(log=>keepLog(log.id)),logStart:plan.logs.slice(0,plan.logStart||0).filter(log=>keepLog(log.id)).length,
    undo:segmentIds.size?null:plan.undo},shared:nextShared};
}
