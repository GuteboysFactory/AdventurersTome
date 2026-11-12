const ID='adventurers-tome';
export function unreadPlayerEntries(documents, seen, canView) {
  const result={quests:[],sessions:[]};
  for(const doc of documents){
    if(doc.pack||!canView(doc))continue;
    const type=String(doc.getFlag?.(ID,'type')||'').toLowerCase();
    const section=['quest','quests'].includes(type)?'quests':['session','sessions'].includes(type)?'sessions':null;
    if(!section)continue;
    if(section==='quests'&&['completed','failed'].includes(doc.getFlag?.(ID,'quest')?.status))continue;
    if(!(seen?.[section]||[]).includes(doc.uuid))result[section].push(doc);
  }
  return result;
}
