export function reminderDue(row,{now=Date.now(),sceneId=''}={}) {
  if(row.doneAt)return false;
  if(Number(row.snoozedUntil)>now)return false;
  if(row.firedAt)return true;
  if(row.snoozedUntil)return Number(row.snoozedUntil)<=now;
  return row.trigger==='scene'?Boolean(sceneId&&row.sceneId===sceneId):Number.isFinite(row.at)&&row.at<=now;
}
export function validateReminder(input,{sceneIds=[],now=Date.now()}={}) {
  const title=String(input.title||'').trim();
  if(!title||title.length>300)throw Error('Enter a reminder, up to 300 characters.');
  const trigger=input.trigger==='scene'?'scene':input.trigger==='time'?'time':null;
  if(!trigger)throw Error('Choose a time or Scene trigger.');
  if(trigger==='scene'&&!sceneIds.includes(input.sceneId))throw Error('Choose an available Scene.');
  const at=Number(input.at);
  if(trigger==='time'&&(!Number.isFinite(at)||at<=0))throw Error('Choose a valid reminder date and time.');
  return {title,trigger,at:trigger==='time'?at:null,sceneId:trigger==='scene'?input.sceneId:'',createdAt:now};
}
export function idleSessionReminderDue(state,now) {
  const p=state.preferences?.newSession;
  return Boolean(p?.enabled&&Number.isFinite(p.hours)&&p.hours>=1&&p.hours<=720&&state.lastActivityAt&&now-state.lastActivityAt>=p.hours*3600000&&!state.rows.some(r=>r.action==='newSession'&&!r.doneAt));
}
