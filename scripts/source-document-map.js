// Experimental, read-only document contract. The source HTML is never edited.
import {WORD_ROLES} from '../data/language/common-word-roles.js';
import {annotateSourceRoles} from './source-document-roles.js';
export const MAP_REVISION='document-map-1';
export const roleKey=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const fieldGroups={campaign:['campaign','kampanj'],date:['date','datum'],duration:['duration','speltid','play time'],participants:['participants','players','deltagare','characters'],gm:['gm','dm','sl','game master','spelledare'],status:['status','state','lage','tillstand'],person:['person','npc','character','karaktar'],location:['location','place','plats','lokation']};
const fields=new Map(Object.entries(fieldGroups).flatMap(([role,labels])=>labels.map(label=>[label,role])));
const sectionGroups={narrative:['summary','sammanfattning','story','berattelse','chronicle','kronika'],quest:['quest log','quest journal','quests','uppdrag','uppdragslogg','active quests','aktiva uppdrag','completed','completed quests','avslutade uppdrag','main quest','side quests','new leads','ledtradar'],followup:['unresolved threads','open threads','oppna tradar','end of session','sessionsslut','framsteg','progress'],editorial:['source notes','transcript notes','kallnotering','kallnoteringar','redaktionella kommentarer']};
const sections=new Map(Object.entries(sectionGroups).flatMap(([role,labels])=>labels.map(label=>[label,role])));
const statusWords=new Set('active unresolved completed progressed sufficiently significant progress companion lead pending failed ongoing finished klar pagaende avslutad aktiv misslyckad'.split(' '));
const action=/^(?:[◆•●▪*-]\s*)?(radda|hjalpa|forsta|na|hitta|soka|fortsatta|fortsatt|overleva|overlev|undersoka|hamta|stoppa|varna|skydda|atervanda|atervand|save|rescue|help|understand|reach|find|seek|continue|survive|investigate|retrieve|stop|warn|protect|return)\s+/u;
function flat(node){
 const copy=node.cloneNode(true);for(const child of copy.querySelectorAll('br'))child.replaceWith(' ');
 for(const child of copy.querySelectorAll('p,div,li')){child.before(' ');child.after(' ');}
 return String(copy.textContent||'').replace(/\s+/gu,' ').trim();
}
function field(label){const key=roleKey(label).replace(/\s+$/u,'');return fields.get(key)||null;}
export function documentMap(html,{sourceUuid='',sourceName='',DOMParser:Parser=globalThis.DOMParser}={}){
 if(!Parser)throw Error('Document mapping needs the browser HTML parser.');
 const doc=new Parser().parseFromString(String(html),'text/html');doc.querySelectorAll('script,style,template').forEach(node=>node.remove());
 const elements=[...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,li,td,th,dt,dd')].filter(node=>{
  if(node.parentElement?.closest('td,th,li'))return false;
  if(node.matches('div')&&node.querySelector('h1,h2,h3,h4,h5,h6,p,li,td,th,div'))return false;
  return true;
 });
 if(!elements.length&&flat(doc.body))elements.push(doc.body);
 const tables=[...doc.body.querySelectorAll('table')],nodes=[];let text='',section='unknown',preamble=true;
 for(const element of elements){
  const value=flat(element);if(!value)continue;const key=roleKey(value),heading=/^H[1-6]$/u.test(element.tagName),boldOnly=element.children.length===1&&element.firstElementChild.matches('b,strong')&&flat(element.firstElementChild)===value;
  const recognised=sections.get(key),shortLabel=value.length<100&&!/[.!?]$/u.test(value);
  if((heading||boldOnly||shortLabel)&&recognised){section=recognised;preamble=false;}
  const table=element.closest('table'),row=element.closest('tr'),cells=row?[...row.children].filter(n=>n.matches('td,th')):[],column=cells.indexOf(element);
  const labelledCell=cells.length===2?cells.findIndex(cell=>field(flat(cell))):-1,rowField=labelledCell>=0&&column!==labelledCell?field(flat(cells[labelledCell])):null;
  const headerRow=table?.querySelector('tr'),headers=headerRow?[...headerRow.children].map(flat):[],columnField=headerRow!==row?field(headers[column]||''):null;
  const ownField=field(value),labelled=value.match(/^([^:：]{1,45})[:：]\s*(.*)$/u),prefixField=preamble&&shortLabel?[...fields].find(([label])=>key.startsWith(label+' ')):null,inlineField=(labelled?field(labelled[1]):null)||prefixField?.[1];
  const definitionField=element.tagName==='DD'&&element.previousElementSibling?.tagName==='DT'?field(flat(element.previousElementSibling)):null;
  let role='narrative',reason='prose-block',confidence=0.7,valueRole=rowField||columnField||inlineField||definitionField;
  if(heading||boldOnly||recognised&&shortLabel){role='section-label';reason='structural-heading';confidence=1;}
  if(element.tagName==='TH'||ownField&&(table||element.tagName==='DT')){role='field-label';reason='table-or-definition-label';confidence=1;}
  else if(valueRole){role=valueRole==='participants'?'participants':valueRole==='gm'||valueRole==='campaign'||valueRole==='date'||valueRole==='duration'?'campaign-metadata':valueRole==='status'?'status-value':'entity-field';reason='label-value-association';confidence=1;}
  else if(role==='narrative'&&section==='editorial'){role='editorial';reason='editorial-section';confidence=1;}
  else if(role==='narrative'&&section==='quest'){role='quest-instruction';reason='quest-section';confidence=0.95;}
  else if(role==='narrative'&&section==='followup'){role='followup';reason='followup-section';confidence=0.85;}
  if(section==='quest'&&!recognised&&action.test(key)){role='quest-instruction';reason='imperative-quest-title';confidence=0.95;}
  if((section==='quest'||section==='followup')&&shortLabel&&key.split(' ').every(w=>statusWords.has(w))){role='status-value';reason='state-vocabulary-in-quest-context';confidence=0.95;}
  if(preamble&&shortLabel&&role==='narrative'){role='unknown';reason='unclassified-preamble';confidence=0.3;}
  // Headerless story is valid: a sentence is evidence of narrative, not metadata.
  if(role==='narrative'&&/[.!?]/u.test(value))preamble=false;
  if(text)text+=' ';const start=text.length;text+=value;
  nodes.push({id:'block-'+nodes.length,path:table?`table/${tables.indexOf(table)}/row/${[...table.querySelectorAll('tr')].indexOf(row)}/cell/${column}`:`block/${nodes.length}`,start,end:text.length,text:value,tag:element.tagName.toLowerCase(),level:heading?Number(element.tagName[1]):null,section,role,confidence,valueRole,table:table?tables.indexOf(table):null,row:row&&table?[...table.querySelectorAll('tr')].indexOf(row):null,column,proof:[{kind:'document-structure',reason}]});
 }
 // A labelled header table establishes the preamble boundary without knowing
 // the campaign name. Both header orders and arbitrary campaign titles work.
 const headerEnd=nodes.findLastIndex((node,i)=>i<12&&node.role==='campaign-metadata');
 if(headerEnd>=0)for(const node of nodes.slice(0,headerEnd+1))if(node.role==='unknown'){node.role='campaign-metadata';node.confidence=0.95;node.proof.push({kind:'header-region',reason:'precedes-labelled-report-fields'});}
 const spans=[],facts=[],quests=[];
 const add=(node,start,end,role,reason)=>{if(end>start)spans.push({start,end,kind:role==='participants'?'participants':role==='task-prefix'?'ordinary':'metadata',role,reason,nodeId:node.id});};
 for(const node of nodes){
  if(['section-label','field-label','campaign-metadata','editorial','status-value'].includes(node.role))add(node,node.start,node.end,node.role,node.proof[0].reason);
  if(node.role==='participants'){
   // All labelled participant names are data, but a bracketed GM role identifies
   // the real-world facilitator rather than a campaign person.
   for(const m of node.text.matchAll(/(?:^|[,·|]\s*)([^,·|()]+?)\s*\((?:GM|DM|SL)\)/gu))add(node,node.start+m.index,node.start+m.index+m[0].length,'campaign-metadata','gamemaster-in-participant-list');
  }
  if(node.role==='quest-instruction'){
   const prefix=action.exec(roleKey(node.text));if(prefix){const original=node.text.match(/^(?:[◆•●▪*-]\s*)?([\p{L}\p{M}]+)/u);add(node,node.start,node.start+original[0].length,'task-prefix','imperative-task-action');quests.push({nodeId:node.id,title:node.text,action:prefix[1],targetText:node.text.slice(original[0].length).trim()});}
  }
  // A status value occupies a field, not an identity slot, in any section.
  const status=/\b(?:Status|State|Tillstånd|Läge)\s*[:：]\s*([^.!?]+)/giu;
  for(const m of node.text.matchAll(status)){add(node,node.start+m.index,node.start+m.index+m[0].length,'status-value','explicit-status-field');facts.push({kind:'state',value:m[1].trim(),nodeId:node.id,assertedAsCampaignFact:false});}
  // Predicative adjective/state slots are not person slots. The ordinary-word
  // evidence is contextual; a scout explicitly named Injured stays a person.
  for(const m of node.text.matchAll(/\b(?:blir|blev|becomes|became|is marked)\s+([\p{Lu}][\p{L}\p{M}-]+)/gu)){
   const key=roleKey(m[1]),mask=(WORD_ROLES.en[key]||0)|(WORD_ROLES.sv[key]||0);
   if(mask&5){const at=node.start+m.index+m[0].lastIndexOf(m[1]);add(node,at,at+m[1].length,'status-value','predicative-state-with-lexical-support');}
  }
  for(const m of node.text.matchAll(/\b(?:[Uu]nder|[Dd]uring)\s+((?:[\p{Lu}][\p{L}\p{M}'’]*\s+){1,4}(?:Turn|Phase|Round|Fas|Runda))/gu)){const at=node.start+m.index+m[0].lastIndexOf(m[1]);add(node,at,at+m[1].length,'status-value','explicit-game-phase-role');}
  for(const m of node.text.matchAll(/\b(?:[Vv]id|[Aa]t|[Uu]nder|[Dd]uring)\s+((?:[\p{L}\p{M}'’]+\s+){1,5}(?:Session|Turn|Phase|Round|Fas|Runda))\s+(?:konstateras|noteras|framgår|it is noted|we note|it is recorded)/gu)){const at=node.start+m.index+m[0].indexOf(m[1]);add(node,at,at+m[1].length,'section-reference','document-lifecycle-reference');}
 }
 for(const heading of nodes.filter(n=>n.role==='section-label')){
  const escaped=heading.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const node of nodes.filter(n=>n.role!=='section-label'))for(const m of node.text.matchAll(new RegExp('(?:\\b(?:see|under|during|at|vid|under|enligt|se)\\s+)('+escaped+')(?![\\p{L}\\p{M}])','giu'))){const at=node.start+m.index+m[0].lastIndexOf(m[1]);add(node,at,at+m[1].length,'section-reference','attested-document-section-reference');}
 }
 return {revision:MAP_REVISION,sourceUuid,sourceName,text,nodes,spans,facts,quests,readOnly:true};
}
export function structureFromMap(map){return annotateSourceRoles({text:map.text,referenceText:map.nodes.map(n=>n.text).join('\n'),spans:map.spans,blocks:map.nodes.map(n=>({...n,kind:n.role==='section-label'?'heading':'narrative',semanticHeading:n.role==='section-label',section:n.section,sectionRole:n.section})),policyRevision:MAP_REVISION});}
