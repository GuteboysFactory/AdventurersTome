import {archiveRouteKey, changeTravelPlan, newTravelPlan, pinKey, publicTravelPlan, removeTravelRecords, trailMarkKey} from './travel-plan.mjs';
import {compactPath,pathLength,segmentLength,sliceTravelPath} from './travel-geometry.mjs';

const ID = 'adventurers-tome';
const PRIVATE = 'privateTravelPlanV1';
const SHARED = 'partyTravelV1';
const MARKS = 'personalTravelMarksV1';
const routeColors = {amber:['Amber',0xe7ab50],blue:['Blue',0x71b9fb],violet:['Violet',0xc092e9],rose:['Rose',0xe784a1]};
const MOVE_QUERY='adventurersTome.movePartyFlag';
const querySenders=new WeakMap();
const eventDialogs=new Set();
const api = () => globalThis.ATTestAI.modules.get(ID)?.api;
const dialog = () => foundry.applications.api.DialogV2;
const esc = value => foundry.utils.escapeHTML(String(value ?? ''));
const randomId = () => foundry.utils.randomID();
const readShared = () => game.settings.get(ID, SHARED);
function readPlan() {
  if (!game.user?.isGM) return null;
  const plan = game.settings.get(ID, PRIVATE);
  if (!plan?.id || plan.mode) return plan;
  const upgrade = groups => groups.map(group=>({...group,queue:group.queue.map((stop,index)=>
    !plan.history&&index===group.queue.length-1 ? {...stop,final:true} : stop)}));
  const events={};
  for (const group of plan.groups) for (const waypoint of group.queue) {
    if (waypoint.event) events[pinKey(waypoint.pin)]={...waypoint.event,id:`legacy:${pinKey(waypoint.pin)}`};
  }
  return {...plan,mode:'free',events,history:plan.history||[],logStart:plan.logStart||0,groups:upgrade(plan.groups),undo:null};
}
const active = () => readPlan()?.enabled === true && (!readShared()?.plannerOwner || readShared().plannerOwner === game.user.id);
const session = id => api().resolveEntry(`session:${id}`);
const pinName = pin => api().partyTravel.resolve(pin)?.entry.name || 'Unavailable waypoint';
const groupActors = () => api().getGroup().flatMap(row => game.actors.get(row.id) || []);
const groupNames = ids => ids.map(id => game.actors.get(id)?.name).filter(Boolean).join(', ');
let saving = false, panelOpen = false;
let flagMoves=Promise.resolve();

function mapLeg(group) {
  const target = group?.queue[0]?.pin;
  if (!target || group.pending) return null;
  const next = api().partyTravel.resolve(target)?.note;
  const current = group.cursor || api().partyTravel.resolve(group.stops.at(-1))?.note;
  const originScene = group.cursor?.sceneId || group.stops.at(-1)?.sceneId;
  if (!next || !current || originScene!==target.sceneId || ![next.x,next.y,current.x,current.y].every(Number.isFinite)) return null;
  const end={x:next.x,y:next.y};
  if (group.leg?.target===pinKey(target) && segmentLength(group.leg.points.at(-1),end)<0.01) return group.leg;
  return {target:pinKey(target),sceneId:target.sceneId,points:[{x:current.x,y:current.y},end],distance:0};
}

function allPlayersCanRead(entry) {
  if ((entry?.ownership?.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return false;
  const access = api().getAccess?.(entry);
  return access?.visibility !== 'gm' && access?.discovered !== false &&
    game.users.contents.every(user => user.isGM || api().canView(entry, user));
}

function canSharePin(pin) {
  const resolved = api().partyTravel.resolve(pin);
  if (!resolved) return false;
  const {scene, note, entry} = resolved;
  return Boolean(canShareScene(scene.id) &&
    note.flags?.[ID]?.mapMarkerVisible !== false && note.flags?.['realm-guard']?.mapMarkerVisible !== false && allPlayersCanRead(entry) &&
    (!note.page || allPlayersCanRead(note.page) || (note.page.ownership?.default === CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT &&
      game.users.contents.every(user => user.isGM || note.page.testUserPermission(user, 'OBSERVER')))));
}

function canShareScene(sceneId) {
  const scene=game.scenes.get(sceneId);
  return Boolean(scene&&(scene.active||(scene.navigation&&scene.ownership?.default>=CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED&&
    game.users.contents.every(user=>user.isGM||scene.testUserPermission(user,'LIMITED')))));
}

function pinPosition(pin) {
  const note=api().partyTravel.resolve(pin)?.note;
  return note&&[note.x,note.y].every(Number.isFinite)?{sceneId:pin.sceneId,x:note.x,y:note.y}:null;
}

const groupPosition=group=>group?.cursor||pinPosition(group?.stops.at(-1));
const projectionOptions={resolvePosition:pinPosition,canShareScene};

function initialize() {
  const shared = api().partyTravel.state();
  const plan=newTravelPlan(randomId(),{...shared,stops:shared.stops.filter(Boolean)},groupActors().map(actor=>actor.id));
  if (shared.basicFlag) plan.groups[0].cursor=shared.basicFlag;
  if (shared.basicTrail?.length) plan.groups[0].trail=shared.basicTrail;
  if (shared.basicWaypointReached) plan.groups[0].reachedWaypoint=true;
  return {...plan,mode:'free',events:{}};
}

async function commit(command, original) {
  const owner = game.user.id, world = game.world.id;
  const persisted = readPlan(), shared = readShared();
  if (!game.user.isGM || saving || (shared.plannerOwner && shared.plannerOwner !== owner)) throw Error('The travel plan is being controlled by another GM.');
  if (JSON.stringify(persisted) !== original) throw Error('The travel plan changed. Open the decision again.');
  if (command.pin && !api().partyTravel.isWaypoint(api().partyTravel.resolve(command.pin)?.note)) throw Error('That map waypoint is no longer available.');
  if (persisted?.enabled && persisted.mode!=='free' && ['arrive','position'].includes(command.type)) {
    const group=persisted.groups.find(group=>group.id===command.groupId)||persisted.groups[0];
    if (command.type==='arrive'||pinKey(command.pin)===pinKey(group.queue[0]?.pin)) command={...command,leg:mapLeg(group)};
  }
  const next = changeTravelPlan(persisted?.id ? persisted : initialize(), {...command,id:randomId(),finishedAt:Date.now()});
  if (persisted?.id && !persisted.enabled && next.enabled && shared.basicFlag) {
    const group=next.groups[0], saved=new Map((group.trail||[]).map(row=>[row.id,row]));
    for (const segment of shared.basicTrail||[]) {
      const originalSegment=saved.get(segment.id);
      if (!originalSegment) saved.set(segment.id,segment);
      else if (segment.completed) saved.set(segment.id,{...originalSegment,completed:true});
    }
    group.cursor=shared.basicFlag;
    group.trail=[...saved.values()];
    group.reachedWaypoint=shared.basicWaypointReached;
    group.leg=null;
  }
  next.dragVersion=randomId();
  for (const group of next.groups) {
    const previous=persisted?.groups?.find(row=>row.id===group.id);
    group.moveVersion=previous&&JSON.stringify(previous)===JSON.stringify(group)?(previous.moveVersion??persisted.dragVersion??''):randomId();
  }
  const projection = publicTravelPlan(next, canSharePin, id=>allPlayersCanRead(session(id)),projectionOptions);
  const sessionLog = [...(shared.sessionLog || []).filter(log=>log.author!==owner), ...projection.logs.map(log=>({...log,author:owner}))];
  const travelHistory = [...(shared.travelHistory || []).filter(journey=>journey.author!==owner), ...projection.history.map(journey=>({...journey,author:owner}))];
  const stops = projection.routes[0]?.stops || [];
  const publish = next.enabled || persisted?.enabled || shared.plannerOwner === owner;
  saving = true;
  try {
    await game.settings.set(ID, PRIVATE, next);
    if (publish) {
      if (game.user.id !== owner || game.world.id !== world || !game.user.isGM) throw Error('Your GM session changed. Open the plan to synchronize it.');
      const previous = readShared();
      if (JSON.stringify(previous) !== JSON.stringify(shared)) throw Error('The displayed route changed. Open the plan and choose Sync display.');
      await game.settings.set(ID, SHARED, {...shared, stops, waypoints:[], previousArrival:null, destination:next.enabled ? projection.routes[0]?.final || null : null,
        plannerOwner:next.enabled ? owner : null, routes:next.enabled ? projection.routes : [], sessionLog, travelHistory,
        basicFlag:next.enabled?null:projection.routes[0]?.flag||null,basicTrail:next.enabled?[]:projection.routes[0]?.trail||[],
        basicWaypointReached:!next.enabled&&Boolean(next.groups[0].reachedWaypoint),
        currentJourney:projection.currentJourney});
    }
  } finally {
    saving = false;
    api().partyTravel.refresh();
  }
}

async function archiveBasic(state) {
  if (!game.user.isGM || saving || state.waypoints.length || state.destination || (state.stops.length<2&&!state.basicTrail?.length)) throw Error('Finish the planned route before archiving it.');
  const owner = game.user.id, world = game.world.id;
  const shared = readShared(), persisted = readPlan(), current = state.stops.at(-1);
  if (shared.plannerOwner) throw Error('Use the Travel Planner to finish this journey.');
  const plan = persisted?.id ? persisted : newTravelPlan(randomId(),{stops:current?[current]:[],destination:null},groupActors().map(actor=>actor.id));
  const id = randomId(), baseRevision = shared.lastBasicArchiveId || '';
  const last = plan.history.at(-1);
  const retry = last?.baseRevision===baseRevision && JSON.stringify(last.routes[0]?.stops)===JSON.stringify(state.stops);
  const journey = retry ? last : {id,baseRevision,finishedAt:Date.now(),sessionId:'',logIds:[],routes:[{id,label:'Party',stops:state.stops,
    mode:state.basicTrail?.length?'free':undefined,trail:state.basicTrail||[]}]};
  const next = retry ? plan : {...plan,history:[...plan.history,journey]};
  const projection = publicTravelPlan(next,canSharePin,sessionId=>allPlayersCanRead(session(sessionId)),projectionOptions);
  const travelHistory = [...(shared.travelHistory || []).filter(row=>row.author!==owner),...projection.history.map(row=>({...row,author:owner}))];
  saving = true;
  try {
    if (!retry) await game.settings.set(ID,PRIVATE,next);
    if (!game.user.isGM || game.user.id!==owner || game.world.id!==world || JSON.stringify(readShared())!==JSON.stringify(shared)) throw Error('The route changed while being archived.');
    await game.settings.set(ID,SHARED,{...shared,stops:current?[current]:[],basicTrail:[],basicWaypointReached:false,previousArrival:null,travelHistory,lastBasicArchiveId:journey.id});
  } finally { saving=false; api().partyTravel.refresh(); }
}

function pins() {
  return game.scenes.contents.flatMap(scene => scene.notes.contents.filter(api().partyTravel.isWaypoint)
    .map(note=>({pin:{sceneId:scene.id,noteId:note.id},label:`${note.entry.name} · ${scene.name}`})))
    .sort((a,b)=>a.label.localeCompare(b.label));
}

function pinOptions(rows, selected) {
  return rows.map(({pin,label})=>`<option value="${esc(pinKey(pin))}" ${pinKey(pin)===pinKey(selected)?'selected':''}>${esc(label)}</option>`).join('');
}

function input(name, label, placeholder, value = '') {
  return `<label>${label}<input name="${name}" maxlength="160" placeholder="${placeholder}" value="${esc(value)}"></label>`;
}

async function editEvent(group, pin, index, original, markerEvent=false) {
  const event = (markerEvent ? readPlan()?.events?.[pinKey(pin)] : group.queue[index]?.event) || {};
  const rows = pins();
  const branches = (name, label) => `<label>${label}<select name="${name}"><option value="">Follow planned route</option>${pinOptions(rows,event[name])}</select></label>`;
  const sceneOptions = game.scenes.contents.map(scene=>`<option value="${esc(scene.id)}" ${event.sceneId===scene.id?'selected':''}>${esc(scene.name)}</option>`).join('');
  const result = await dialog().wait({window:{title:`${markerEvent?'Marker':'Waypoint'} event · ${pinName(pin)}`}, rejectClose:false, content:
    `<label>Type<select name="kind">${['Encounter','Check','Event'].map(kind=>`<option ${event.kind===kind?'selected':''}>${kind}</option>`).join('')}</select></label>
    ${input('title','Title','Scout check at the bridge',event.title)}
    <label>GM instructions<textarea name="details" rows="4">${esc(event.details)}</textarea></label>
    <label>Linked scene<select name="scene"><option value="">Use marker’s scene if linked</option>${sceneOptions}</select></label>
    ${branches('success','On success')}${branches('failure','On failure')}
    ${markerEvent?'':`<label><input type="checkbox" name="hidePin" ${event.hidePin?'checked':''}> Hide this waypoint until arrival</label>`}`, buttons:[
    {action:'save',label:'Save event',callback:(_e,button)=>{
      const f = button.form.elements;
      return {title:f.title.value.trim(),kind:f.kind.value,details:f.details.value,sceneId:f.scene.value,
        success:rows.find(row=>pinKey(row.pin)===f.success.value)?.pin, failure:rows.find(row=>pinKey(row.pin)===f.failure.value)?.pin,
        hidePin:f.hidePin?.checked};
    }}, ...(event.title?[{action:'remove',label:'Remove event',callback:()=>({remove:true})}]:[]), {action:'close',label:'Cancel',callback:()=>false}
  ]});
  if (!result) return;
  if (!result.remove && !result.title) throw Error('Enter a title for the event.');
  await commit({type:markerEvent?'markerEvent':'event',groupId:group?.id,pin,index,event:result.remove?null:result},original);
}

async function resolveEvent(group) {
  const {event} = group.pending;
  const currentPlan=()=>{
    const plan=readPlan();
    const current=plan?.groups?.find(row=>row.id===group.id);
    if (!active()||!current?.pending||JSON.stringify(current.pending)!==JSON.stringify(group.pending)) throw Error('This marker event changed. Open it again.');
    return plan;
  };
  const linkedScene=()=>event.sceneId?game.scenes.get(event.sceneId):api().partyTravel.mapLinkedScene?.(group.pending.pin);
  const linked=linkedScene();
  const outcome = value => (_e,button)=>({outcome:value,publicText:button.form.elements.publicText.value.trim()});
  const buttons = (event.kind==='Check' || event.success || event.failure ? [
    {action:'success',label:'Success',callback:outcome('success')},{action:'failure',label:'Failure',callback:outcome('failure')}
  ] : [{action:'continue',label:'Continue on map',callback:outcome('continue')}]);
  buttons.push({action:'skip',label:'Skip event',callback:outcome('skip')});
  if (linked) buttons.push({action:'preview',label:'Preview scene',type:'button',callback:()=>({preview:true})},
    {action:'activate',label:'Activate for players…',type:'button',callback:(_e,button)=>({activate:true,publicText:button.form.elements.publicText.value.trim()})});
  buttons.push({action:'close',label:'Back',callback:()=>false});
  const result = await dialog().wait({window:{title:`${group.label} · ${event.title}`},rejectClose:false,buttons,content:
    `<p>${esc(event.details).replace(/\r?\n/g,'<br>')}</p>${input('publicText','Player session log · optional','What the group discovered')}`});
  if (!result) return;
  if (result.preview) {
    currentPlan();
    if (linkedScene()!==linked) throw Error('The linked scene changed. Open the event again.');
    await linked.view();
    currentPlan();
    return resolveEvent(group);
  }
  if (result.activate) {
    if (await dialog().confirm({window:{title:'Activate scene for players?'},content:`<p>${esc(linked.name)}</p>`,rejectClose:false}) && game.user.isGM &&
      linkedScene() === linked) {
      currentPlan();
      await linked.activate();
      await commit({type:'resolve',groupId:group.id,outcome:'continue',publicText:result.publicText},JSON.stringify(currentPlan()));
    }
    return;
  }
  await commit({type:'resolve',groupId:group.id,...result},JSON.stringify(currentPlan()));
}

async function presentArrival(groupId,{notify=true}={}) {
  const plan = readPlan();
  const group = plan?.groups?.find(group=>group.id===groupId);
  if (!group?.pending||eventDialogs.has(groupId)) return;
  eventDialogs.add(groupId);
  try {
    if (notify) ui.notifications.info(`${group.label} arrived at ${pinName(group.pending.pin)}.`);
    await resolveEvent(group);
  } finally {eventDialogs.delete(groupId);}
}

function driverCharacter(user) {
  return typeof user?.character==='string'?game.actors.get(user.character):user?.character;
}

function canDrive(user, group) {
  const actor=driverCharacter(user);
  return Boolean(user?.active && !user.isGM && group.driverId===user.id && actor && group.memberIds.includes(actor.id) &&
    actor.testUserPermission(user,'OWNER') && (user.hasPermission?.('QUERY_USER')??user.can?.('QUERY_USER')));
}

function freeHandles() {
  const sceneId=globalThis.canvas?.scene?.id;
  if (!sceneId) return [];
  if (active()) {
    const plan=readPlan();
    if (plan.mode!=='free') return [];
    return plan.groups.flatMap(group=>{
      const flag=groupPosition(group);
      return flag?.sceneId===sceneId?[{groupId:group.id,label:group.label,flag,dragVersion:group.moveVersion??plan.dragVersion??'',canMove:!group.pending}]:[];
    });
  }
  const shared=readShared();
  if (!shared?.plannerOwner) {
    const basic=api().partyTravel.basicFlagHandle?.();
    return basic?[basic]:[];
  }
  return (shared.routes||[]).filter(route=>route.mode==='free' && route.flag?.sceneId===sceneId).map(route=>({
    groupId:route.id,label:route.label,flag:route.flag,dragVersion:route.dragVersion||'',canMove:route.driverId===game.user.id&&
      Boolean(driverCharacter(game.user)?.testUserPermission(game.user,'OWNER'))}));
}

function dropMarker(scene, point, user) {
  return scene.notes.contents.filter(note=>{
    if (!api().partyTravel.isWaypoint(note)) return false;
    const edge=(note.iconSize||40)/2;
    if (Math.abs(note.x-point.x)>edge || Math.abs(note.y-point.y)>edge) return false;
    const pin={sceneId:scene.id,noteId:note.id};
    if (user.isGM) return true;
    const visible=note.flags?.[ID]?.mapMarkerVisible??note.flags?.['realm-guard']?.mapMarkerVisible;
    return visible===true || (visible!==false&&Boolean(api().partyTravel.resolve(pin,user)));
  }).sort((a,b)=>segmentLength(a,point)-segmentLength(b,point)||Number(b.sort||0)-Number(a.sort||0))[0];
}

async function saveFlagMove(data, user) {
  const plan=readPlan(), group=plan?.groups?.find(group=>group.id===data?.groupId);
  if (!active() || plan.mode!=='free' || !group || !(user?.isGM && user.id===game.user.id || canDrive(user,group))) throw Error('You cannot move this party flag.');
  if (data.dragVersion!==(group.moveVersion??plan.dragVersion??'')) throw Error('The flag changed. Drag it again.');
  if (group.pending) throw Error('Wait for the GM to resolve the current stop.');
  const start=groupPosition(group), scene=game.scenes.get(data.sceneId);
  if (!start || start.sceneId!==scene?.id || (user.isGM ? globalThis.canvas?.scene?.id!==scene.id :
    !canShareScene(scene.id)||(user.viewedScene&&user.viewedScene!==scene.id))) throw Error('Open the party flag’s map before moving it.');
  const bounds=(scene.getDimensions?.()||scene.dimensions)?.rect;
  if (!Array.isArray(data.points)||!data.points.length||data.points.length>512||!bounds ||
    data.points.some(point=>!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||!bounds.contains(point.x,point.y))) throw Error('Draw the route inside this map.');
  const points=data.points.map(({x,y})=>({x,y}));
  const note=dropMarker(scene,points.at(-1),user);
  if (note) points[points.length-1]={x:note.x,y:note.y};
  const path=compactPath([{x:start.x,y:start.y},...points],0.5);
  if (pathLength(path)<0.5) return true;
  await commit({type:'freeTravel',groupId:group.id,sceneId:scene.id,points:path,marker:note?{sceneId:scene.id,noteId:note.id}:null},JSON.stringify(plan));
  if (readPlan()?.groups?.find(row=>row.id===group.id)?.pending) void presentArrival(group.id).catch(error=>ui.notifications.warn(error.message));
  return true;
}

function queueFlagMove(data,user) {
  const result=flagMoves.then(()=>saveFlagMove(data,user));
  flagMoves=result.catch(()=>{});
  return result;
}

function rememberFlagMover(senderId,_queryId,name,data) {
  if (name===MOVE_QUERY && data && typeof data==='object') querySenders.set(data,senderId);
}

async function handleFlagMove(data) {
  await Promise.resolve();
  const senderId=querySenders.get(data);
  querySenders.delete(data);
  const sender=senderId&&game.users.get(senderId);
  if (!game.user.isGM || readShared()?.plannerOwner!==game.user.id || !sender || sender.isGM) throw Error('The travel planner could not verify the flag driver.');
  return queueFlagMove(data,sender);
}

async function moveFlag(handle, points) {
  const stride=Math.max(1,Math.ceil(points.length/500));
  const data={groupId:handle.groupId,sceneId:handle.flag.sceneId,dragVersion:handle.dragVersion,
    points:points.filter((_point,index)=>index%stride===0||index===points.length-1)};
  if (handle.basic) return api().partyTravel.moveBasicFlag(handle,data.points);
  if (game.user.isGM) return queueFlagMove(data,game.user);
  const gm=game.users.get(readShared()?.plannerOwner);
  if (!gm?.active || typeof gm.query!=='function') throw Error('The GM controlling this journey needs to be connected.');
  return gm.query(MOVE_QUERY,data,{timeout:15000});
}

function routeHandles() {
  if (!active() || !canvas?.ready || !canvas.scene) return [];
  const plan=readPlan(), original=JSON.stringify(plan);
  return plan.groups.flatMap(group=>{
    const leg=mapLeg(group);
    return leg?.sceneId===canvas.scene.id&&pathLength(leg.points)>0.5 ? [{groupId:group.id,label:group.label,leg,original,pin:group.queue[0].pin}] : [];
  });
}

async function editOnMap(handle, change) {
  if (!active()||canvas.scene?.id!==handle.leg.sceneId) throw Error('Open the active route on its original map.');
  const {groupId,original,pin,leg}=handle;
  if (change.kind==='travel') {
    await commit({type:'travel',groupId,pin,leg,distance:change.distance},original);
    return presentArrival(groupId);
  }
  const start=groupStart(handle), total=pathLength(leg.points);
  const create=(target,points)=>({target:pinKey(target),sceneId:leg.sceneId,points:compactPath(points),distance:0});
  if (change.kind==='draw') {
    const stride=Math.max(1,Math.ceil(change.points.length/480));
    const points=change.points.filter((_point,index)=>index%stride===0||index===change.points.length-1);
    if (points.some(p=>!canvas.dimensions.rect.contains(p.x,p.y))) throw Error('Draw the route inside the scene.');
    return commit({type:'draw',groupId,pin,leg:create(pin,[start,...points,leg.points.at(-1)])},original);
  }
  const through={x:change.note.x,y:change.note.y}, via={sceneId:leg.sceneId,noteId:change.note.id};
  if (pinKey(via)===pinKey(pin)) throw Error('Drop the route on an intermediate waypoint.');
  const cut=Math.max(leg.distance||0,change.distance);
  const first=sliceTravelPath(leg.points,leg.distance||0,cut), rest=sliceTravelPath(leg.points,cut,total);
  return commit({type:'via',groupId,pin:via,leg:create(via,[...first,through]),nextLeg:create(pin,[through,...rest])},original);
}

function groupStart(handle) {
  return sliceTravelPath(handle.leg.points,handle.leg.distance||0,handle.leg.distance||0)[0];
}

async function splitGroup(group, original) {
  const rows = pins();
  const actors = group.memberIds.flatMap(id=>game.actors.get(id) || []);
  const free=readPlan()?.mode==='free';
  if (actors.length < 2) throw Error('At least two characters are needed to split the group.');
  const result = await dialog().prompt({window:{title:'Split party'},rejectClose:false,render:free?(_event,dialog)=>{
    const members=[...dialog.element.querySelectorAll('[name="members"]')];
    const first=dialog.element.querySelector('[name="remainingDriverId"]'),second=dialog.element.querySelector('[name="driverId"]');
    const update=()=>{
      const moved=new Set(members.filter(row=>row.checked).map(row=>row.value));
      for (const [list,newGroup] of [[first,false],[second,true]]) {
        for (const option of list.options) option.disabled=Boolean(option.dataset.actor)&&moved.has(option.dataset.actor)!==newGroup;
        if (list.selectedOptions[0]?.disabled) list.value='';
      }
    };
    for (const row of members) row.addEventListener('change',update);
    update();
  }:undefined,content:
    `<fieldset><legend>Characters for the new group</legend>${actors.map(actor=>`<label><input name="members" type="checkbox" value="${esc(actor.id)}"> ${esc(actor.name)}</label>`).join('')}</fieldset>
    ${free?`${driverField('remainingDriverId','First group driver',group,group.driverId)}${driverField('driverId','New group driver',group)}`:
      `<label>New group’s next waypoint<select name="pin">${pinOptions(rows)}</select></label>`}`,ok:{label:'Split party',callback:(_e,button)=>{
      const form = button.form;
      const memberIds = new FormData(form).getAll('members');
      return {memberIds,memberNames:actors.filter(actor=>memberIds.includes(actor.id)).map(actor=>actor.name),
        pin:rows.find(row=>pinKey(row.pin)===form.elements.pin?.value)?.pin,
        driverId:form.elements.driverId?.value,remainingDriverId:form.elements.remainingDriverId?.value};
    }}});
  if (!result) return;
  if (free && (!validDriver(result.driverId,result.memberIds) ||
    !validDriver(result.remainingDriverId,group.memberIds.filter(id=>!result.memberIds.includes(id))))) {
    throw Error('Choose a driver whose character is in that group.');
  }
  await commit({type:'split',groupId:group.id,...result},original);
}

function validDriver(userId, memberIds) {
  if (!userId) return true;
  const user=game.users.get(userId),actor=driverCharacter(user);
  return Boolean(user&&!user.isGM&&actor&&memberIds.includes(actor.id)&&actor.testUserPermission(user,'OWNER')&&
    (user.hasPermission?.('QUERY_USER')??user.can?.('QUERY_USER')));
}

function driverField(name,label,group,selected) {
  const options=game.users.contents.filter(user=>validDriver(user.id,group.memberIds)).map(user=>{
    const actor=driverCharacter(user);
    return `<option value="${esc(user.id)}" data-actor="${esc(actor.id)}" ${user.id===selected?'selected':''}>${esc(user.name)} · ${esc(actor.name)}</option>`;
  }).join('');
  return `<label>${label}<select name="${name}"><option value="">GM only</option>${options}</select></label>`;
}

async function chooseDriver(group,original) {
  const driverId=await dialog().prompt({window:{title:`Flag driver · ${group.label}`},rejectClose:false,
    content:driverField('driverId','Who can move this flag?',group,group.driverId),ok:{label:'Save driver',callback:(_e,b)=>b.form.elements.driverId.value}});
  if (typeof driverId!=='string') return;
  if (!validDriver(driverId,group.memberIds)) throw Error('Choose a driver whose character is in this group.');
  await commit({type:'driver',groupId:group.id,driverId},original);
}

function canRejoin(group,other) {
  const first=groupPosition(group),second=groupPosition(other);
  return Boolean(other.id!==group.id && first && second && first.sceneId===second.sceneId && segmentLength(first,second)<=28);
}

function undoLabel(plan) {
  if (plan.undo.kind==='route') return 'Undo route change';
  return plan.mode==='free'?'Undo flag movement':'Undo arrival';
}

function routeUndoAction(sceneId,groupId) {
  if (!active()) return;
  const plan=readPlan();
  const undo=plan.undo;
  if (!undo || (groupId && undo.groupId && groupId!==undo.groupId)) return;
  if (sceneId) {
    const matchesScene = group => (!undo.groupId||group.id===undo.groupId) &&
      (groupPosition(group)?.sceneId===sceneId || group.goalArea?.sceneId===sceneId ||
       group.queue.some(stop=>stop.pin.sceneId===sceneId));
    if (![...plan.groups,...undo.groups].some(matchesScene)) return;
  }
  const original=JSON.stringify(plan);
  return {label:undoLabel(plan),run:()=>commit({type:'undo'},original)};
}

function flagActions(groupId) {
  if (groupId==='basic-party' && game.user.isGM) {
    const undo=api().partyTravel.basicUndoAction?.(canvas.scene?.id);
    return [undo,routeRecordsAction(canvas.scene?.id),{label:'Open Travel Planner…',run:()=>openPlanner()}].filter(Boolean);
  }
  const plan=readPlan(),group=plan?.groups?.find(row=>row.id===groupId);
  if (!active()||plan.mode!=='free'||!group) return [];
  const original=JSON.stringify(plan);
  const actions=[{label:'Assign flag driver…',run:()=>chooseDriver(group,original)},
    {label:'Draw approximate goal area…',run:()=>api().travelMapEditor.armGoalArea(groupId,plan.dragVersion||'')},
    {label:'Hide goal from players',run:()=>commit({type:'goalVisibility',groupId,visibility:'hidden'},original)}];
  if (group.queue.at(-1)?.final) actions.push({label:'Share exact goal',run:()=>commit({type:'goalVisibility',groupId,visibility:'exact'},original)});
  if (group.memberIds.length>=2) actions.push({label:'Split party…',run:()=>splitGroup(group,original)});
  for (const other of plan.groups.filter(other=>canRejoin(group,other))) {
    actions.push({label:`Rejoin ${other.label}`,run:()=>commit({type:'rejoin',groupId,otherId:other.id,together:true},original)});
  }
  const undo=routeUndoAction(canvas.scene?.id,groupId);
  if (undo) actions.unshift(undo);
  const records=routeRecordsAction(canvas.scene?.id);
  if (records) actions.push(records);
  if (group.pending) actions.unshift({label:'Resolve event…',run:()=>presentArrival(groupId,{notify:false})});
  return actions;
}

async function setGoalArea(groupId,version,area) {
  const plan=readPlan();
  if (!active()||plan.mode!=='free'||(plan.dragVersion||'')!==version||canvas.scene?.id!==area.sceneId||
    !plan.groups.some(group=>group.id===groupId)||!canvas.dimensions.rect.contains(area.x,area.y)||!Number.isFinite(area.radius)||area.radius<12) throw Error('Open the flag again and draw the area on its map.');
  await commit({type:'goalArea',groupId,area},JSON.stringify(plan));
}

function logRows(sessionId, playersOnly = false) {
  const entry = session(sessionId);
  if (!entry || (playersOnly && !allPlayersCanRead(entry))) return [];
  const privateRows = !playersOnly && readPlan()?.logs;
  const publicRows = readShared().sessionLog || [];
  const logs = new Map(publicRows.map(log=>[log.id,log]));
  for (const log of privateRows || []) logs.set(log.id,log);
  const labels = {arrival:'Arrived at',movement:'Travelled onward from',detour:'Detour via',reroute:'Rerouted via',event:'Event',split:'Party split',rejoin:'Party reunited'};
  return [...logs.values()].filter(log=>log.sessionId===sessionId).flatMap(log=>{
    const place = (!playersOnly || canSharePin(log.pin)) ? api().partyTravel.resolve(log.pin)?.entry.name : '';
    if ((!game.user.isGM || playersOnly) && !place && !log.publicText && !log.trailId) return [];
    const text = log.publicText || (place ? `${labels[log.approach || log.kind]} ${place}` : 'Travelled on the map');
    return [{group:log.group,text,detail:privateRows ? log.detail : ''}];
  });
}

async function openPlanner(sessionId = '') {
  if (!game.user.isGM || panelOpen) return;
  panelOpen = true;
  let groupId = '';
  try {
    while (game.user.isGM) {
      const persisted = readPlan(), original = JSON.stringify(persisted), plan = persisted?.id ? persisted : initialize();
      const group = plan.groups.find(candidate=>candidate.id===groupId) || plan.groups[0];
      const free=plan.mode==='free';
      const rows = pins();
      const selectedSession = sessionId || plan.sessionId;
      const sessions = game.journal.contents.filter(entry=>session(entry.id)).map(entry=>`<option value="${esc(entry.id)}" ${entry.id===selectedSession?'selected':''}>${esc(entry.name)}</option>`).join('');
      const choices = plan.groups.map(candidate=>`<option value="${esc(candidate.id)}" ${candidate.id===group.id?'selected':''}>${esc(candidate.label)}</option>`).join('');
      const queue = group.queue.map((stop,index)=>free&&stop.final?'':`<option value="${index}">${index+1}. ${esc(pinName(stop.pin))}${stop.final?' · Final destination':''}${stop.event?' · GM event':''}</option>`).join('');
      const final = group.queue.at(-1)?.final ? group.queue.at(-1).pin : null;
      const rallyGroup = plan.groups.find(candidate=>free?canRejoin(group,candidate):
        candidate.id!==group.id && pinKey(candidate.stops.at(-1)) && pinKey(candidate.stops.at(-1))===pinKey(group.stops.at(-1)));
      const button = (action,label,callback) => ({action,label,callback:(_e,b)=>callback(b.form.elements)});
      const route = (type,f)=>({type,pin:rows.find(row=>pinKey(row.pin)===f.pin.value)?.pin});
      const buttons = [button('configure','Save travel settings',f=>({type:'configure',enabled:f.enabled.checked,visibility:f.visibility?.value||plan.visibility,sessionId:f.sessionId.value}))];
      if (plan.enabled) {
        if (plan.groups.length>1) buttons.push(button('group','Switch group',f=>({type:'group',id:f.group.value})));
        if (group.pending) buttons.push(button('decision','Resolve event',()=>({type:'decision'})));
        else if (!free && group.queue.length) buttons.push(button('arrive','Mark as arrived',()=>({type:'arrive'})));
        if (rows.length) buttons.push(button('destination',free?'Set private final goal':'Set final destination',f=>({...route('destination',f),visibility:free?'hidden':undefined})));
        if (free && rows.length) buttons.push(button('position','Set party position',f=>route('position',f)),button('share-goal','Set and share exact goal',f=>({...route('destination',f),visibility:'exact'})));
        if (rows.length) buttons.push(button('append','Add waypoint',f=>route('append',f)));
        if (!free && rows.length) buttons.push(button('detour','Detour',f=>route('detour',f)),button('reroute','Reroute next leg',f=>route('reroute',f)));
        if (final || group.goalArea) buttons.push(button('clear-destination','Clear goal',()=>({type:'clearDestination'})));
        if (!free && group.queue.length) buttons.push(button('event','Edit waypoint event',f=>({type:'event',index:Number(f.queue.value)})),button('remove','Remove waypoint',f=>({type:'remove',index:Number(f.queue.value)})));
        if (free && queue) buttons.push(button('remove','Remove waypoint',f=>({type:'remove',index:Number(f.queue.value)})));
        if (free) buttons.push(button('driver','Assign flag driver…',()=>({type:'assignDriver'})));
        if (group.memberIds.length>1) buttons.push(button('split','Split party…',()=>({type:'split'})));
        if (rallyGroup) buttons.push(button('rejoin','Rejoin party',()=>({type:'rejoin',otherId:rallyGroup.id,together:free})));
        if (plan.undo) buttons.push(button('undo',undoLabel(plan),()=>({type:'undo'})));
        if (plan.groups.every(row=>!row.pending&&(free?!row.queue.some(stop=>stop.final):!row.queue.length)) && plan.groups.some(row=>row.stops.length>1||row.trail?.length)) buttons.push(button('finish','Finish journey',()=>({type:'finish'})));
        if (selectedSession) buttons.push(button('preview','Preview player log',()=>({type:'preview',sessionId:selectedSession})));
      }
      if (plan.enabled || readShared().plannerOwner===game.user.id) buttons.push(button('sync','Sync display',()=>({type:'refresh'})));
      if (persisted?.id) buttons.push(button('new','New journey…',()=>({type:'new'})));
      if (history().length) buttons.push(button('history','Journey history…',()=>({type:'history'})));
      buttons.push(button('close','Close',()=>false));
      const result = await dialog().wait({window:{title:'Travel Planner',resizable:true},position:{width:670},classes:['at-travel-planner'],rejectClose:false,buttons,content:
        `<label><input type="checkbox" name="enabled" ${plan.enabled?'checked':''}> Enable travel planner for this journey</label>
        ${free?'':`<label>Player map<select name="visibility"><option value="public">Show planned route</option><option value="travelled" ${plan.visibility==='travelled'?'selected':''}>Hide route ahead</option></select></label>`}
        <label>Session log<select name="sessionId"><option value="">No linked session</option>${sessions}</select></label>
        ${plan.enabled ? `<hr><label>Group<select name="group">${choices}</select></label><p>${esc(groupNames(group.memberIds))}</p>
        <p>Current location · <b>${esc(group.stops.length?pinName(group.stops.at(-1)):'Unmarked')}</b></p>
        ${group.pending ? `<p>Waiting for GM · <b>${esc(group.pending.event.title)}</b></p>`:
          group.queue[0] && (!free || !group.queue[0].final) ? `<p>Next waypoint · <b>${esc(pinName(group.queue[0].pin))}</b></p>` : ''}
        ${final ? `<p>Final destination · <b>${esc(pinName(final))}</b></p>`:''}
        ${free?'<p>Right-click a flag to share an approximate goal area or manage its group. Right-click a marker to attach an event.</p>':''}
        ${queue?`<label>Planned waypoints<select name="queue">${queue}</select></label>`:''}
        ${rows.length?`<label>World location pin<select name="pin">${pinOptions(rows)}</select></label>`:''}`:''}`});
      if (!result) break;
      sessionId = '';
      if (result.type==='group') { groupId = result.id; continue; }
      try {
        if (result.type==='decision') await presentArrival(group.id,{notify:false});
        else if (result.type==='assignDriver') await chooseDriver(group,original);
        else if (result.type==='split') await splitGroup(group,original);
        else if (result.type==='event') await editEvent(group,group.queue[result.index].pin,result.index,original);
        else if (result.type==='preview') {
          const logs = logRows(result.sessionId,true);
          await dialog().prompt({window:{title:'Player travel log'},rejectClose:false,content:logs.length?
            `<ol>${logs.map(row=>`<li>${esc(row.group)} · ${esc(row.text)}</li>`).join('')}</ol>`:'<p>No shared travel entries yet.</p>',ok:{label:'Back'}});
        } else if (result.type==='history') await openHistory();
        else if (result.type==='new' || result.type==='finish') {
          if (result.type==='finish' || await dialog().confirm({window:{title:'Start a new journey?'},content:'<p>Archive the travelled route and clear the remaining waypoints.</p>',rejectClose:false})) {
            await commit({type:result.type,memberIds:groupActors().map(actor=>actor.id)},original);
            groupId = '';
          }
        } else {
          await commit({...result,groupId:group.id,pin:result.pin || (result.type==='remove'?group.queue[result.index]?.pin:undefined)},original);
          if (result.type==='arrive') await presentArrival(group.id);
        }
      } catch (error) { ui.notifications.warn(error.message); }
    }
  } finally { panelOpen = false; }
}

async function chooseGroup(plan) {
  if (plan.groups.length===1) return plan.groups[0];
  const id = await dialog().prompt({window:{title:'Choose travel group'},rejectClose:false,content:
    `<label>Group<select name="group">${plan.groups.map(group=>`<option value="${esc(group.id)}">${esc(group.label)}</option>`).join('')}</select></label>`,
    ok:{label:'Continue',callback:(_e,b)=>b.form.elements.group.value}});
  return plan.groups.find(group=>group.id===id);
}

function mapActions(pin) {
  const plan = readPlan(), original = JSON.stringify(plan);
  const command = (type,label,visibility) => ({label,run:async()=>{
    const group = await chooseGroup(plan);
    if (!group) return;
    if (type==='event') return editEvent(group,pin,group.queue.findIndex(stop=>pinKey(stop.pin)===pinKey(pin)),original);
    await commit({type,groupId:group.id,pin,visibility},original);
    if (type==='arrive' || type==='position') await presentArrival(group.id);
  }});
  if (plan.mode==='free') return [
    command('position','Set party position'),command('append','Add waypoint'),command('destination','Set final destination','hidden'),
    command('destination','Set and share exact goal','exact'),{label:'Add / edit marker event…',run:()=>editEvent(null,pin,-1,original,true)}
  ];
  const actions = [command('destination','Set final destination'),command('append','Add waypoint'),command('event','Add / Edit Event…'),
    command('detour','Add detour'),command('reroute','Reroute next leg'),command('position','Set party position')];
  if (plan.groups.some(group=>pinKey(group.queue[0]?.pin)===pinKey(pin))) actions.unshift(command('arrive','Mark as arrived'));
  return actions;
}

async function handleBasic(result) {
  if (!active()) throw Error('Another GM is controlling this travel plan.');
  const plan = readPlan(), original = JSON.stringify(plan);
  const group = await chooseGroup(plan);
  if (!group) return;
  const pin = result.sceneId ? {sceneId:result.sceneId,noteId:result.noteId} : undefined;
  const type = result.undo ? 'undo' : result.setDestination ? 'destination' : result.addWaypoint ? 'append' : result.arrive ? 'arrive' :
    result.cancelDestination ? 'clearDestination' : 'position';
  await commit({type,groupId:group.id,pin},original);
  if (type==='arrive' || type==='position') await presentArrival(group.id);
}

function routes() {
  const past = history().flatMap(journey=>journey.routes.map(route=>({...route,ahead:[],completed:true,markKey:archiveRouteKey(journey,route)})));
  if (active()) {
    const plan = readPlan();
    return [...plan.groups.map(group=>({id:group.id,label:group.label,mode:plan.mode,stops:group.stops,ahead:group.queue.filter(stop=>plan.mode!=='free'||!stop.final).map(stop=>stop.pin),
      final:group.queue.at(-1)?.final ? group.queue.at(-1).pin : null,leg:plan.mode==='free'?(group.leg?.target===pinKey(group.queue[0]?.pin)?group.leg:null):mapLeg(group),cursor:group.cursor,
      flag:plan.mode==='free'?groupPosition(group):null,goalArea:group.goalArea,trail:group.trail,breaks:group.breaks,moving:!group.pending})),
      ...(plan.pastRoutes || []).map(route=>({...route,ahead:[],completed:true})),...past];
  }
  const shared = readShared();
  if (shared.plannerOwner) return [...(shared.routes || []),...past];
  if (!past.length) return null;
  return [api().partyTravel.basicRouteView(),...past];
}

function routeMarkColors() {
  const marks=game.settings.get(ID,MARKS)||{};
  return Object.fromEntries(Object.entries(marks).filter(([,color])=>Object.hasOwn(routeColors,color))
    .map(([key,color])=>[key,routeColors[color][1]]));
}

function routeRecords(sceneId,plan=readPlan(),shared=readShared()) {
  const gm=game.user.isGM;
  const controlsPlan=gm&&plan?.id&&(!shared.plannerOwner||shared.plannerOwner===game.user.id);
  const canCleanBasic=gm&&!shared.plannerOwner&&!plan?.enabled;
  const logs=new Map((plan?.logs||[]).map(log=>[log.id,log]));
  const linkedTrail=new Set((plan?.logs||[]).filter(log=>log.sessionId).map(log=>log.trailId));
  for (const route of [...(plan?.groups||[]),...(plan?.pastRoutes||[])]) {
    for (const segment of route.trail||[]) if (segment.sessionId) linkedTrail.add(segment.id);
  }
  const rows=new Map();
  const add=row=>{if (!rows.has(row.key)) rows.set(row.key,row);};
  const addTrail=(route,{past=false,basic=false,editable=false}={})=>{
    for (const [index,segment] of (route.trail||[]).entries()) {
      if (sceneId&&sceneId!==segment.sceneId || !accessibleTrailScene(segment.sceneId)) continue;
      const protectedStop=segment.to&&(pinKey(route.pending?.pin)===pinKey(segment.to)||
        (plan?.logs||[]).some(log=>log.kind==='event'&&log.group===route.label&&pinKey(log.pin)===pinKey(segment.to)));
      const remove=editable&&!segment.sessionId&&!linkedTrail.has(segment.id)&&!protectedStop;
      const mark=past||Boolean(segment.completed);
      if (!remove&&!mark) continue;
      const from=segment.from&&api().partyTravel.resolve(segment.from)?.entry.name;
      const to=segment.to&&api().partyTravel.resolve(segment.to)?.entry.name;
      const map=game.scenes.get(segment.sceneId);
      const label=[route.label,map.name,`Leg ${index+1}`,[from,to].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
      add({key:trailMarkKey(segment),label,segment,basic,remove,mark});
    }
  };
  if (controlsPlan) {
    for (const group of plan.groups) addTrail(group,{editable:plan.mode==='free'&&!plan.sessionId});
    for (const route of plan.pastRoutes||[]) addTrail(route,{past:true,editable:route.mode==='free'&&!plan.sessionId});
  } else {
    for (const route of shared.routes||[]) addTrail(route,{past:Boolean(route.completed)});
  }
  if (!shared.plannerOwner) addTrail({label:'Party',trail:shared.basicTrail},{basic:true,editable:canCleanBasic});
  for (const journey of history()) {
    const own=gm&&Boolean(plan?.history?.some(row=>row.id===journey.id));
    const linked=journey.sessionId||journey.logIds.some(id=>!logs.has(id)||logs.get(id).sessionId||
      !['arrival','movement'].includes(logs.get(id).kind));
    for (const route of journey.routes) {
      const trail=(route.trail||[]).find(row=>(!sceneId||row.sceneId===sceneId)&&accessibleTrailScene(row.sceneId));
      const pin=route.stops.find(pin=>(!sceneId||pin?.sceneId===sceneId)&&api().partyTravel.resolve(pin));
      if (!trail&&!pin) continue;
      const remove=own&&!linked&&!(route.trail||[]).some(row=>row.sessionId||linkedTrail.has(row.id));
      add({key:archiveRouteKey(journey,route),label:`${journeyTitle(journey)} · ${route.label}`,segment:trail,pin,archive:true,journey,route,remove,mark:true});
    }
  }
  return [...rows.values()];
}

async function deleteRouteSelection(keys,sceneId,original) {
  const owner=game.user.id,world=game.world.id;
  const plan=readPlan(),shared=readShared();
  if (!game.user.isGM||saving||JSON.stringify([owner,world,plan,shared])!==original) throw Error('Travel history changed. Open the route list again.');
  const rows=routeRecords(sceneId,plan,shared).filter(row=>keys.includes(row.key)&&row.remove);
  if (!rows.length||rows.length!==keys.length) throw Error('Select only routes that are available to delete.');
  const next=removeTravelRecords(plan,shared,rows,owner);
  saving=true;
  try {
    if (next.plan!==plan) await game.settings.set(ID,PRIVATE,next.plan);
    try {
      if (!game.user.isGM||game.user.id!==owner||game.world.id!==world||JSON.stringify(readShared())!==JSON.stringify(shared)) throw Error('Travel history changed. Open the route list again.');
      await game.settings.set(ID,SHARED,next.shared);
    } catch (error) {
      if (next.plan!==plan&&game.user.id===owner&&game.world.id===world&&JSON.stringify(readPlan())===JSON.stringify(next.plan)) {
        await game.settings.set(ID,PRIVATE,plan);
      }
      throw error;
    }
  } finally {saving=false;api().partyTravel.refresh();}
}

async function openRouteRecords(sceneId) {
  const owner=game.user.id,world=game.world.id,plan=readPlan(),shared=readShared();
  const original=JSON.stringify([owner,world,plan,shared]);
  const rows=routeRecords(sceneId,plan,shared);
  if (!rows.length) {ui.notifications.info('There are no routes to manage here yet.');return;}
  const marks=game.settings.get(ID,MARKS)||{};
  const choices=rows.map((row,index)=>{
    const color=Object.hasOwn(routeColors,marks[row.key])?routeColors[marks[row.key]][0]:'';
    return `<div class="at-travel-record"><label><input type="checkbox" name="routes" value="${index}" data-mark="${row.mark}" data-remove="${row.remove}"> ${esc(row.label)}${color?` · ${esc(color)}`:''}</label>
      <button type="button" data-preview-route="${index}" title="Show on map" aria-label="Show ${esc(row.label)} on map"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></button></div>`;
  }).join('');
  const selection=(form,action)=>({action,color:form.elements.color.value,keys:[...new FormData(form).getAll('routes')].map(index=>rows[index].key)});
  const buttons=[{action:'mark',label:'Set my map color',callback:(_e,b)=>selection(b.form,'mark')}];
  if (rows.some(row=>row.remove)) buttons.push({action:'delete',label:'Delete selected',callback:(_e,b)=>selection(b.form,'delete')});
  buttons.push({action:'close',label:'Close',callback:()=>null});
  const result=await dialog().wait({window:{title:'Manage travel routes',resizable:true},classes:['at-travel-planner'],position:{width:620},rejectClose:false,buttons,
    content:`<p>Choose routes to change their color on your map.${game.user.isGM?' You can delete unlinked routes.':''}</p>${choices}
    <label>My map color<select name="color"><option value="">Default</option>${Object.entries(routeColors).map(([id,[label]])=>`<option value="${id}">${label}</option>`).join('')}</select></label>`,
    render:(_event,app)=>{
      const root=app.element;
      const update=()=>{
        const checked=[...root.querySelectorAll('[name="routes"]:checked')];
        for (const [action,property] of [['mark','mark'],['delete','remove']]) {
          const button=root.querySelector(`[data-action="${action}"]`);
          if (button) button.disabled=!checked.length||!checked.every(input=>input.dataset[property]==='true');
        }
      };
      root.addEventListener('change',update);
      update();
      for (const button of root.querySelectorAll('[data-preview-route]')) button.addEventListener('click',()=>{
        const row=rows[Number(button.dataset.previewRoute)];
        const target=api().partyTravel.resolve(row.pin);
        const trail=row.segment;
        const scene=trail?accessibleTrailScene(trail.sceneId):target?.scene;
        const point=trail?.points[Math.floor(trail.points.length/2)]||target?.note;
        if (scene&&point) void scene.view().then(()=>canvas.scene?.id===scene.id&&canvas.animatePan({x:point.x,y:point.y})).catch(error=>ui.notifications.warn(error.message));
      });
    }});
  if (!result||game.user.id!==owner||game.world.id!==world) return;
  if (result.action==='delete') return deleteRouteSelection(result.keys,sceneId,original);
  const available=new Set(routeRecords(sceneId).filter(row=>row.mark).map(row=>row.key));
  if (!result.keys.length||result.keys.some(key=>!available.has(key))) throw Error('Select older routes to mark on your map.');
  const nextMarks={...game.settings.get(ID,MARKS)};
  for (const key of result.keys) {
    if (Object.hasOwn(routeColors,result.color)) nextMarks[key]=result.color;
    else delete nextMarks[key];
  }
  await game.settings.set(ID,MARKS,nextMarks);
}

function routeRecordsAction(sceneId) {
  if (routeRecords(sceneId).length) return {label:'Manage travel routes…',run:()=>openRouteRecords(sceneId)};
}

function history(pin,{includeActive=false,sessionId='',personal=false}={}) {
  const privateHistory = readPlan()?.history || [];
  const shared=readShared(), plan=readPlan();
  const entries = new Map((shared.travelHistory || []).map(row=>[row.id,row]));
  for (const row of privateHistory) entries.set(row.id,row);
  if (includeActive) {
    const current=plan?.id?{id:plan.id,sessionId:plan.sessionId,routes:[...plan.groups,...(plan.pastRoutes||[])],
      logIds:plan.logs.slice(plan.logStart||0).map(log=>log.id)}:shared.currentJourney;
    if (current && (current.logIds.length || current.routes.some(route=>route.stops.filter(Boolean).length>1||route.trail?.length))) entries.set(current.id,current);
  }
  const logs=historyLogs();
  const actor=personal&&!game.user.isGM ? game.user.character : null;
  const matches=ids=>!actor || !ids?.length || ids.includes(actor.id);
  return [...entries.values()].flatMap(journey=>{
    if (sessionId && journey.sessionId!==sessionId&&!journey.logIds.some(id=>logs.get(id)?.sessionId===sessionId)) return [];
    if (pin&&!journey.routes.some(route=>route.stops.some(stop=>pinKey(stop)===pinKey(pin)))) return [];
    if (!actor) return [journey];
    const logIds=journey.logIds.filter(id=>matches(logs.get(id)?.actors));
    const routes=journey.routes.flatMap(route=>{
      const trail=(route.trail||[]).filter(row=>matches(row.actors));
      if (route.trail?.length && !trail.length) return [];
      const stops=route.trail?.length ? trail.flatMap(row=>[row.from,row.to].filter(Boolean)) : route.stops;
      return [{...route,trail,stops}];
    });
    return routes.length||logIds.length?[{...journey,routes,logIds}]:[];
  })
    .sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0));
}

function historyLogs() {
  const stored=new Map((readShared().sessionLog||[]).map(log=>[log.id,log]));
  for (const log of readPlan()?.logs||[]) stored.set(log.id,log);
  return stored;
}

function journeyTitle(journey) {
  const points = journey.routes[0]?.stops.flatMap(stop=>api().partyTravel.resolve(stop)?.entry.name || []) || [];
  const title = points.length>1 ? `${points[0]} → ${points.at(-1)}` : points[0] || session(journey.sessionId)?.name || 'Travel record';
  return journey.finishedAt ? `${title} · ${new Date(journey.finishedAt).toLocaleDateString()}` : title;
}

async function openHistory(pin,options={}) {
  const scope={includeActive:true,...options};
  const entries = history(pin,scope);
  if (!entries.length) {
    if (routeRecords().length) return openRouteRecords();
    ui.notifications.info('There are no travelled routes to show yet.');return;
  }
  const id = await dialog().prompt({window:{title:'Journey history'},rejectClose:false,
    content:`<label>Journey<select name="journey">${entries.map(journey=>`<option value="${esc(journey.id)}">${esc(journeyTitle(journey))}</option>`).join('')}</select></label>`,
    ok:{label:'Open journey',callback:(_e,b)=>b.form.elements.journey.value}});
  const journey = history(pin,scope).find(row=>row.id===id);
  if (!journey) return;
  const stops = journey.routes.flatMap(route=>route.stops.flatMap(stop=>{
    const resolved = api().partyTravel.resolve(stop);
    return resolved ? [{...resolved,pin:stop,label:`${route.label} · ${resolved.entry.name} · ${resolved.scene.name}`}] : [];
  }));
  const trails=journey.routes.flatMap(route=>(route.trail||[]).flatMap((row,index)=>{
    if (scope.sessionId && row.sessionId!==scope.sessionId) return [];
    const location=api().partyTravel.resolve(row.from);
    const scene=route.mode==='free'?accessibleTrailScene(row.sceneId):(location&&(!row.to||api().partyTravel.resolve(row.to))?location.scene:null);
    if (!scene) return [];
    return [{trail:row,free:route.mode==='free',scene,label:`${route.label} · ${scene.name} · Travelled leg ${index+1}`}];
  }));
  const locations=[...trails,...stops];
  const stored = historyLogs();
  const logs = journey.logIds.flatMap(id=>{
    const log = stored.get(id);
    if (!log || (log.sessionId && !session(log.sessionId)) || (scope.sessionId&&log.sessionId!==scope.sessionId)) return [];
    const text = log.publicText || (game.user.isGM ? log.detail : '');
    return text ? [`<li>${esc(log.group)} · ${esc(text)}</li>`] : [];
  });
  const linked = session(scope.sessionId||journey.sessionId);
  const buttons = [{action:'close',label:'Close',callback:()=>false}];
  if (routeRecords().length) buttons.push({action:'manage-routes',label:'Manage travel routes…',callback:()=>({manage:true})});
  if (locations.length) buttons.push({action:'show-pin',label:'Open on map',callback:(_e,b)=>({location:locations[Number(b.form.elements.stop.value)]})});
  if (linked) buttons.push({action:'session',label:'Open session',callback:()=>({session:linked.id})});
  const result = await dialog().wait({window:{title:journeyTitle(journey)},rejectClose:false,buttons,
    content:`${locations.length?`<label>Travelled legs and stops<select name="stop">${locations.map((stop,index)=>`<option value="${index}" ${pin&&pinKey(stop.pin)===pinKey(pin)?'selected':''}>${esc(stop.label)}</option>`).join('')}</select></label>`:''}${logs.length?`<ol>${logs.join('')}</ol>`:''}`});
  if (result?.manage) return openRouteRecords();
  if (result?.session && session(result.session)) await api().openRef(`session:${result.session}`);
  if (result?.location) {
    const {pin,trail,free}=result.location;
    const target = api().partyTravel.resolve(pin||trail?.from);
    const scene=free&&trail?accessibleTrailScene(trail.sceneId):(target&&(!trail?.to||api().partyTravel.resolve(trail.to))?target.scene:null);
    if (!scene) return;
    await scene.view();
    if (canvas.scene?.id!==scene.id) return;
    if (trail) {
      const point=trail.points[Math.floor(trail.points.length/2)];
      if (point) await canvas.animatePan({x:point.x,y:point.y});
    } else if (target.note.object) await canvas.notes.panToNote(target.note.object);
  }
}

function accessibleTrailScene(id) {
  const scene=game.scenes.get(id);
  return scene&&(game.user.isGM||scene.active||scene.isView||(scene.navigation&&scene.visible))?scene:null;
}

Hooks.once('init',()=>{
  game.settings.register(ID,PRIVATE,{scope:'user',config:false,type:Object,default:{}});
  game.settings.register(ID,MARKS,{scope:'user',config:false,type:Object,default:{},onChange:()=>api()?.partyTravel?.refresh()});
  if (globalThis.CONFIG?.queries) CONFIG.queries[MOVE_QUERY]=handleFlagMove;
});
function attachTravelPlanner() {
  const tome = api();
  if (!tome?.partyTravel || tome.travelPlanner) return;
  tome.travelPlanner = Object.freeze({active,routes,routeHandles,editOnMap,groupStart,history,openHistory,archiveBasic,mapActions,open:openPlanner,logRows,handleBasic,
    freeHandles,moveFlag,flagActions,routeUndoAction,routeRecordsAction,routeMarkColors,setGoalArea,canShareScene,
    sync:()=>active()?commit({type:'refresh'},JSON.stringify(readPlan())):undefined,
    controlled:()=>Boolean(active()||readShared()?.plannerOwner)});
  document.addEventListener('click',event=>{
    const button = event.target.closest?.('[data-travel-planner]');
    if (button && game.user.isGM) void openPlanner(button.dataset.travelPlanner).catch(error=>ui.notifications.warn(error.message));
    const travel=event.target.closest?.('[data-travel-history]');
    if (travel) void openHistory(undefined,{sessionId:travel.dataset.travelHistory,personal:travel.hasAttribute('data-travel-personal')}).catch(error=>ui.notifications.warn(error.message));
  });
  game.socket?.on?.('userQuery',rememberFlagMover);
  // Foundry may already have drawn the scene while Tome was loading its GM data.
  tome.partyTravel.refresh();
  if (game.user.isGM && active() && !game.settings.get(ID,PRIVATE)?.mode) {
    void tome.travelPlanner.sync().catch(error=>ui.notifications.warn(error.message));
  }
}
Hooks.once('ready',attachTravelPlanner);
Hooks.once('adventurersTomeCoreApiReady',attachTravelPlanner);
