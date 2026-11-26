const documents = {
  sv: ['MANUAL.md', 'MANUAL-REFERENS.md'],
  en: ['MANUAL-EN.md', 'MANUAL-REFERENCE-EN.md']
};
const labels = {
  sv: { title:'Manual', language:'Språk', search:'Sök i manualen', all:'Alla', guide:'Snabbguider',
    tutorial:'Tutorials', reference:'Uppslagsverk', audience:'GM', results:'träffar', empty:'Inga guider matchar din sökning.',
    unavailable:'Manualen gick inte att öppna. Prova igen eller öppna dokumenten direkt.', handbook:'Öppna manualdokumentet', reset:'Rensa sökning' },
  en: { title:'Manual', language:'Language', search:'Search the manual', all:'All', guide:'Quick guides',
    tutorial:'Tutorials', reference:'Reference', audience:'GM', results:'results', empty:'No guides match your search.',
    unavailable:'The manual could not load. Try again or open the documents directly.', handbook:'Open the manual document', reset:'Clear search' }
};

const root = new URL('../docs/',import.meta.url);
let pendingManual;

const slug = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu,'').replaceAll(' ','-');
const normalize = value => String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[^\p{L}\p{N}<>]+/gu,' ').trim();
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function parseManual(markdown,file) {
  let category='';
  return markdown.split(/(?=^#{2,3} )/m).flatMap(block=>{
    const heading=block.match(/^## ([^\r\n]+)/);
    if(heading)category=heading[1];
    const match=block.match(/^#{2,3} ([^\r\n]+)\r?\n<!-- tome-manual ([a-z0-9-]+)\|(guide|tutorial|reference)\|(all|gm)\|([^\r\n]*?) -->\r?\n/);
    if(!match)return [];
    const [,title,id,type,role,keywords]=match;
    const body=block.slice(match[0].length)
      .replace(/^\[(?:Till innehållet|Back to contents)\]\(#(?:innehåll|contents)\)\r?\n/gm,'').trim();
    return [{id,title,type,gmOnly:role==='gm',keywords,body,file,category,anchor:slug(title)}];
  });
}

function inline(text,file,anchors) {
  const tokens=/\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let result='', end=0;
  for(const match of text.matchAll(tokens)){
    result+=escape(text.slice(end,match.index));
    const [raw,label,to,bold,code]=match;
    if(to){
      let href;
      try{href=new URL(to,new URL(file,root));}catch{href=null;}
      if(!href){result+=escape(label);end=match.index+raw.length;continue;}
      const id=anchors.get(href.href);
      result+=id?`<a href="#manual-${id}" data-at-manual-link="${id}">${escape(label)}</a>`
        : /^(https?:|file:)$/.test(href.protocol)?`<a href="${escape(href.href)}" target="_blank" rel="noopener">${escape(label)}</a>`:escape(label);
    }else if(bold)result+=`<strong>${escape(bold)}</strong>`;
    else result+=`<code>${escape(code)}</code>`;
    end=match.index+raw.length;
  }
  return result+escape(text.slice(end));
}

function manualHtml(section,anchors) {
  const line=text=>inline(text,section.file,anchors);
  return section.body.split(/\r?\n\s*\r?\n/).map(block=>{
    if(block.startsWith('```'))return `<pre>${escape(block.split(/\r?\n/).slice(1,-1).join('\n'))}</pre>`;
    const rows=block.split(/\r?\n/);
    if(rows[0].startsWith('|')&&rows[1]?.startsWith('| ---')){
      const cells=(row,tag)=>`<tr>${row.trim().slice(1,-1).split('|').map(value=>`<${tag}>${line(value.trim())}</${tag}>`).join('')}</tr>`;
      return `<div class="at-manual-table"><table><thead>${cells(rows[0],'th')}</thead><tbody>${rows.slice(2).map(row=>cells(row,'td')).join('')}</tbody></table></div>`;
    }
    if(rows.every(row=>/^(?:- |\d+\. )/.test(row))){
      const tag=rows[0].startsWith('- ')?'ul':'ol';
      return `<${tag}>${rows.map(row=>`<li>${line(row.replace(/^(?:- |\d+\. )/,''))}</li>`).join('')}</${tag}>`;
    }
    if(block.startsWith('#### '))return `<h3>${line(block.slice(5))}</h3>`;
    return `<p>${line(rows.join(' '))}</p>`;
  }).join('');
}

export function manualMatches(searchText,query) {
  return normalize(query).split(' ').every(term=>searchText.includes(term));
}

export function buildManual(catalog,language,isGM) {
  const active = catalog[language];
  const alternate = new Map(catalog[language==='sv'?'en':'sv'].map(section=>[section.id,section]));
  const available=active.filter(section=>isGM||!section.gmOnly);
  const anchors=new Map(available.map(section=>[new URL(`${section.file}#${section.anchor}`,root).href,section.id]));
  return available.map(section=>{
    const second=alternate.get(section.id);
    const searchText=normalize([section.category,section.title,section.keywords,section.body,second?.category,second?.title,second?.body].join(' '));
    return {...section,searchText,bodyHtml:manualHtml(section,anchors), typeLabel:labels[language][section.type]};
  });
}

export function manualLanguage() {
  const fallback=globalThis.game?.i18n?.lang==='sv'?'sv':'en';
  try { return globalThis.localStorage.getItem('adventurers-tome.manualLanguage') || fallback; }
  catch { return fallback; }
}

export function saveManualLanguage(language) {
  try { globalThis.localStorage.setItem('adventurers-tome.manualLanguage',language); } catch {}
}

export async function loadManual(selected,isGM) {
  const language=selected==='sv'?'sv':'en';
  const view={labels:labels[language],swedish:language==='sv',english:language==='en',href:new URL(documents[language][0],root).href};
  try{
    pendingManual ??= Promise.all(Object.entries(documents).map(async ([locale,files])=>[locale,
      (await Promise.all(files.map(async file=>{
        const response=await fetch(new URL(file,root));
        if(!response.ok)throw Error(`Manual file unavailable: ${file}`);
        return parseManual(await response.text(),file);
      }))).flat()
    ])).then(Object.fromEntries).catch(error=>{pendingManual=undefined;throw error;});
    const sections=buildManual(await pendingManual,language,isGM);
    const groups=Object.entries(Object.groupBy(sections,section=>section.category))
      .map(([title,topics])=>({title,topics}));
    return {...view,sections,groups};
  }catch{return {...view,failed:true,sections:[]};}
}
