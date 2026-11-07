globalThis.ATTestAI.assertEnabled();
// Local, bounded document reader. No document content is executed or fetched.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MAX_FILE = 10 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
export const escapeText = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('@','&#64;');
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_:]/g,' ').replace(/\s+/g,' ').trim();
const fail = message => { throw new Error(message); };
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
function xml(source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail('This document contains unsupported XML declarations.');
  const doc = new DOMParser().parseFromString(source,'application/xml');
  if (doc.querySelector('parsererror')) fail('The Word document contains invalid XML.');
  return doc;
}
const kids = (node,name) => Array.from(node?.children || []).filter(n=>n.namespaceURI===W && n.localName===name);
const one = (node,name) => kids(node,name)[0];
const val = (node,name='val') => node?.getAttributeNS(W,name) || '';
const descendants = (node,name) => Array.from(node.getElementsByTagNameNS(W,name));
let crcTable;
function crc32(bytes) {
  crcTable ||= Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;
}
async function wordParts(bytes) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), len=bytes.length;
  let end=-1;
  for(let p=len-22;p>=Math.max(0,len-65557);p--)if(view.getUint32(p,true)===0x06054b50 && p+22+view.getUint16(p+20,true)===len){end=p;break;}
  if(end<0)fail('This is not a complete Word (.docx) file.');
  const count=view.getUint16(end+10,true), size=view.getUint32(end+12,true), start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count===65535||count>1500||start+size!==end)fail('Unsupported Word archive layout. Save the file again as .docx.');
  const wanted=new Set(['word/document.xml','word/styles.xml','word/numbering.xml']);
  const seen=new Set(), entries=[];let pos=start;
  for(let i=0;i<count;i++){
    if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)fail('Invalid Word archive directory.');
    const flags=view.getUint16(pos+8,true), method=view.getUint16(pos+10,true), crc=view.getUint32(pos+16,true), packed=view.getUint32(pos+20,true), unpacked=view.getUint32(pos+24,true);
    const n=view.getUint16(pos+28,true), extra=view.getUint16(pos+30,true), comment=view.getUint16(pos+32,true), offset=view.getUint32(pos+42,true);
    if(pos+46+n+extra+comment>end)fail('Incomplete Word archive directory.');
    const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+n));
    if(seen.has(name)||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||name.includes('\0'))fail('Invalid or repeated Word archive path.');
    seen.add(name);
    if(flags&1 || flags&64)fail('Password-protected Word files are not supported.');
    if(wanted.has(name)){
      if(![0,8].includes(method)||unpacked>MAX_XML||packed>MAX_FILE||offset+30>start||view.getUint32(offset,true)!==0x04034b50)fail('Unsupported or oversized Word XML.');
      const localName=view.getUint16(offset+26,true), localExtra=view.getUint16(offset+28,true), dataStart=offset+30+localName+localExtra;
      if(view.getUint16(offset+8,true)!==method || dataStart+packed>start || new TextDecoder().decode(bytes.subarray(offset+30,offset+30+localName))!==name)fail('Inconsistent Word archive entry.');
      entries.push({name,method,crc,unpacked,data:bytes.subarray(dataStart,dataStart+packed)});
    }
    pos+=46+n+extra+comment;
  }
  if(pos!==end || !seen.has('word/document.xml'))fail('The file is not a Word .docx document.');
  const result={};
  for(const entry of entries){
    let data=entry.data;
    if(entry.method===8){
      let stream;try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{fail('This browser cannot read compressed Word documents. Please use a current browser or save as .txt.');}
      const reader=stream.getReader(), chunks=[];let total=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_XML||total>entry.unpacked)fail('Expanded Word content exceeds the allowed size.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      data=new Uint8Array(total);let p=0;for(const chunk of chunks){data.set(chunk,p);p+=chunk.length;}
    }
    if(data.length!==entry.unpacked||crc32(data)!==entry.crc)fail('The Word archive is damaged. Please save or export it again.');
    result[entry.name]=xml(new TextDecoder('utf-8',{fatal:true}).decode(data));
  }
  return result;
}
function inline(node) {
  if(node.namespaceURI!==W)return '';
  if(node.localName==='t')return escapeText(node.textContent);
  if(['br','cr'].includes(node.localName))return '<br>';
  if(node.localName==='tab')return ' &#160; ';
  if(['del','instrText','drawing','object','pict'].includes(node.localName))return '';
  if(node.localName==='r'){
    let text=kids(node,'t').length || kids(node,'br').length || kids(node,'tab').length ? Array.from(node.children).map(inline).join('') : '';
    const props=one(node,'rPr');
    const enabled=name=>{const prop=one(props,name);return prop&&!['0','false','off'].includes(val(prop));};
    if(enabled('b'))text=`<strong>${text}</strong>`;
    if(enabled('i'))text=`<em>${text}</em>`;
    return text;
  }
  if(['pPr','rPr'].includes(node.localName))return '';
  return Array.from(node.children).map(inline).join('');
}
function plain(html){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));return doc.body.textContent.trim();}
function parseWord(parts) {
  const doc=parts['word/document.xml'];
  if(doc.documentElement.namespaceURI!==W || doc.documentElement.localName!=='document')fail('Unsupported Word document format.');
  const styles=new Map();
  if(parts['word/styles.xml'])for(const style of descendants(parts['word/styles.xml'],'style'))styles.set(val(style,'styleId'),{name:val(one(style,'name')),based:val(one(style,'basedOn')),level:val(one(one(style,'pPr'),'outlineLvl'))});
  function styleInfo(id,seen=new Set()){
    if(seen.has(id))return {};seen.add(id);const row=styles.get(id)||{};
    return {...(row.based?styleInfo(row.based,seen):{}),...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==''))};
  }
  const abstract=new Map(), numbering=new Map();
  if(parts['word/numbering.xml']){
    for(const row of descendants(parts['word/numbering.xml'],'abstractNum'))abstract.set(val(row,'abstractNumId'),new Map(kids(row,'lvl').map(lvl=>[val(lvl,'ilvl'),val(one(lvl,'numFmt'))])));
    for(const row of descendants(parts['word/numbering.xml'],'num'))numbering.set(val(row,'numId'),val(one(row,'abstractNumId')));
  }
  const blocks=[];let skippedMedia=0;
  const paragraph=node=>{
    const html=Array.from(node.children).map(inline).join(''), text=plain(html);if(!text)return null;
    const props=one(node,'pPr'), id=val(one(props,'pStyle')), style=styleInfo(id);
    const name=normalized(style.name||id), level=val(one(props,'outlineLvl'))||style.level;
    if(name==='title'||name==='titel')return {kind:'title',level:1,text,html:`<h1>${html}</h1>`};
    const match=(style.name||id).match(/(?:heading|rubrik)\s*(\d)/i);
    if(match||level!==undefined&&level!==''&&Number(level)<6){const n=Math.min(6,match?Number(match[1]):Number(level)+1);return {kind:'heading',level:n,text,html:`<h${n}>${html}</h${n}>`};}
    const num=one(props,'numPr');
    if(!num && /(?:list.*bullet|punktlista|list.*number)/i.test(style.name||id))return {kind:'list',ordered:/number/i.test(style.name||id),text,html};
    if(num){const format=abstract.get(numbering.get(val(one(num,'numId'))))?.get(val(one(num,'ilvl'))||'0');return {kind:'list',ordered:format!=='bullet',text,html};}
    if(/^[◆•●▪]\s*/.test(text)){const stripped=text.replace(/^[◆•●▪]\s*/,'');return {kind:'list',ordered:false,text:stripped,html:escapeText(stripped)};}
    return {kind:'paragraph',text,html:`<p>${html}</p>`};
  };
  for(const child of one(doc.documentElement,'body')?.children||[]){
    if(child.namespaceURI!==W)continue;
    skippedMedia+=descendants(child,'drawing').length+descendants(child,'object').length;
    if(child.localName==='p'){const row=paragraph(child);if(row)blocks.push(row);}
    if(child.localName==='tbl'){
      const rows=kids(child,'tr').map(tr=>kids(tr,'tc').map(tc=>kids(tc,'p').map(paragraph).filter(Boolean)));
      const html='<table><tbody>'+rows.map((row,i)=>'<tr>'+row.map(cell=>`<${i?'td':'th'}>${cell.map(p=>p.html).join('')}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</tbody></table>';
      blocks.push({kind:'table',text:rows.map(row=>row.map(c=>c.map(p=>p.text).join(' ')).join(' | ')).join('\n'),html});
    }
  }
  return {blocks,warnings:skippedMedia?['Embedded pictures and objects are omitted in this first version. Text and tables are retained.']:[]};
}
function parseText(bytes) {
  let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
  let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{fail('Save the text file as UTF-8 or UTF-16 and try again.');}
  if(text.includes('\0'))fail('This is not a text file. Legacy .doc files must first be saved as .docx.');
  const blocks=[];let paragraph=[];
  const flush=()=>{if(paragraph.length){const t=paragraph.join('\n');blocks.push({kind:'paragraph',text:t,html:`<p>${escapeText(t).replaceAll('\n','<br>')}</p>`});paragraph=[];}};
  const headings=/^(sammanfattning|summary|berattelse|chronicle|quest log|aktiva uppdrag|active quests|framsteg|progress|oppna tradar|open threads|sessionsslut|kallnotering|gm notes?|gm anteckningar|sl anteckningar|spelledaranteckningar|hemligheter|secrets?|nasta session|next session|paminnelser?|reminders?)(\s*[:—–-].*)?$/;
  for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
    if(!line.trim()){flush();continue;}
    const t=line.trim(), md=t.match(/^(#{1,6})\s+(.+)$/), session=!blocks.length&&!paragraph.length&&/^session\s+\d+\b/i.test(t);
    if(md||session||headings.test(normalized(t))){flush();const label=md?md[2]:t;blocks.push({kind:session?'title':'heading',level:md?md[1].length:1,text:label,html:`<h${md?md[1].length:1}>${escapeText(label)}</h${md?md[1].length:1}>`});continue;}
    const bullet=t.match(/^([-*•◆●▪]|\d+[.)])\s+(.+)$/);
    if(bullet){flush();blocks.push({kind:'list',ordered:/^\d/.test(bullet[1]),text:bullet[2],html:escapeText(bullet[2])});}else paragraph.push(line);
  }
  flush();return {blocks,warnings:[]};
}
function routeFor(text){const n=normalized(text);if(/^(?:gm|sl|spelledar)(?:\s|$)|^hemlig(?:het(?:er)?|a)?\b|^secrets?\b/.test(n))return 'private';if(/^(nasta session|next session|paminnelser?|reminders?)\b/.test(n))return 'reminder';return null;}
export function blocksHtml(blocks) {
  let html='', list='';for(const block of blocks){if(block.kind==='list'){const tag=block.ordered?'ol':'ul';if(tag!==list){if(list)html+=`</${list}>`;html+=`<${tag}>`;list=tag;}html+=`<li>${block.html}</li>`;}else{if(list)html+=`</${list}>`;list='';html+=block.html;}}if(list)html+=`</${list}>`;return html;
}
export async function readSessionFile(file) {
  if(!file||file.size<1||file.size>MAX_FILE)fail('Choose a non-empty .txt or .docx file, up to 10 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const isZip=bytes[0]===80&&bytes[1]===75;
  if(!isZip&&!/\.txt$/i.test(file.name))fail('Choose a .txt or Word .docx file. Old .doc files must be saved as .docx first.');
  const parsed=isZip?parseWord(await wordParts(bytes)):parseText(bytes);
  if(!parsed.blocks.length)fail('No readable session text was found in the document.');
  if(parsed.blocks.length>6000)fail('This document has too many sections or paragraphs. Split it into smaller sessions.');
  const titleBlock=parsed.blocks.find(b=>b.kind==='title'&&!routeFor(b.text)) || parsed.blocks.find(b=>b.kind==='heading'&&/^session\s+\d+/i.test(b.text));
  const title=titleBlock?.text||file.name.replace(/\.(docx|txt)$/i,'');
  const numberIn=value=>Number(String(value).match(/session\s+(\d+)/i)?.[1])||null;
  const fileNumber=numberIn(file.name), documentNumber=numberIn(title), number=fileNumber||documentNumber;
  if(fileNumber&&documentNumber&&fileNumber!==documentNumber)parsed.warnings.push(`The filename says Session ${fileNumber}, while the document title says Session ${documentNumber}. Confirm the number below; the imported title will use your choice.`);
  const sections=[], stack=[];let section;let questContext=false, activeQuests=false;
  for(const block of parsed.blocks){
    if(block===titleBlock)continue;
    if(block.kind==='heading'||block.kind==='title'){
      // A Word Title marks a chapter: GM NOTES may contain several Heading 1 sections.
      const hierarchyLevel=block.kind==='title'?0:block.level;
      while(stack.length&&stack.at(-1).level>=hierarchyLevel)stack.pop();
      const explicit=routeFor(block.text), inherited=stack.at(-1)?.route;
      const route=explicit||inherited||'chronicle';stack.push({level:hierarchyLevel,route});
      const n=normalized(block.text);
      if(/^quest log\b/.test(n)){questContext=true;activeQuests=false;}
      else if(/^(aktiva uppdrag|active quests)\b/.test(n)){questContext=true;activeQuests=true;}
      else if(questContext&&/^(framsteg|progress|oppna tradar|open threads)\b/.test(n))activeQuests=false;
      else if(block.level===1){questContext=false;activeQuests=false;}
      section={id:String(sections.length),title:block.text,route,blocks:[],questItems:[]};sections.push(section);
    }
    if(!section){section={id:'0',title:'Session details',route:'chronicle',blocks:[],questItems:[]};sections.push(section);}
    section.blocks.push(block);
    if(activeQuests&&section.route==='chronicle'&&block.kind==='list')section.questItems.push(block.text);
  }
  return {name:file.name,format:isZip?'docx':'txt',digest:await digest(bytes),title:(fileNumber&&!documentNumber?file.name.replace(/\.(docx|txt)$/i,''):title).replace(/^session\s+\d+\s*[-—–:]?\s*/i,''),number,warnings:parsed.warnings,sections};
}
