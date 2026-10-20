/* Text-Based Actors 3.1/3.2 -> Realm Guard. Non-equivalent rules remain reference text. */
(() => {
  const clone=value=>JSON.parse(JSON.stringify(value));
  const description=(item,batch)=>[readable(item.system?.description),batch?`TAF inventory reference\n\nWeight: ${readable(item.system?.weight)} · Equipped: ${readable(item.system?.equipped)} · Group: ${readable(item.system?.group)}`:''].filter(Boolean).join('\n\n');
  const labels={health:'health',hälsa:'health',will:'will',vilja:'will',nature:'nature',natur:'nature',resources:'resources',resurser:'resources',circles:'circles',kontakter:'circles'};
  const normalize=value=>String(value||'').toLowerCase().replace(/[\s:：_-]+/g,'');
  const counterFields={fate:'fate',persona:'persona',checks:'checks',check:'checks',spentfate:'spentFate',fatespent:'spentFate',spentpersona:'spentPersona',personaspent:'spentPersona'};
  const counter=item=>['attribute','generic'].includes(item.type)&&(!item.system?.group||item.type==='attribute'||/^(hero points|xp|points|resources|checks|advancement)$/i.test(item.system.group))?(counterFields[normalize(item.name)]||counterFields[normalize(item.system?.key)]):null;
  const condition=item=>item.type==='generic'&&/^(conditions?|tillstånd)$/i.test(item.system?.group||'');
  // Pure text extraction: never render source HTML to discover its meaning.
  const plain=value=>String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/h[1-6]\s*>/gi,'\n').replace(/<\/(?:td|th)\s*>/gi,' | ').replace(/<(?:br\b[^>]*|\/p|\/div|\/tr|\/li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|mdash|ndash);/gi,(_,entity)=>{const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',mdash:'—',ndash:'–'};if(entity[0]!=='#')return names[entity.toLowerCase()];const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'�';}).replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim();
  // Target biography/notes are plain textareas. Keep structure without exposing HTML.
  const readable=value=>plain(String(value??'')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi,(_whole,attrs,body)=>{const label=plain(body),uuid=attrs.match(/\bdata-uuid\s*=\s*["']([^"']+)["']/i)?.[1],href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];return uuid?`@UUID[${uuid}]{${label}}`:href&&/^https?:\/\//i.test(href)&&href!==label?`${label} (${href})`:label;})
    .replace(/<img\b[^>]*>/gi,tag=>{const src=tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1],alt=tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];return src?`\nImage: ${alt?alt+' — ':''}${src}\n`:'';})
    .replace(/<h[1-6]\b[^>]*>/gi,'\n\n').replace(/<\/h[1-6]\s*>/gi,'\n')
    .replace(/<hr\b[^>]*>/gi,'\n\n').replace(/<(?:p|div|blockquote)\b[^>]*>/gi,'\n')
    .replace(/<li\b[^>]*>/gi,'\n• ').replace(/<tr\b[^>]*>/gi,'\n'))
    .replace(/\s*\|[ \t]*(?=\n|$)/g,'').replace(/\n{3,}/g,'\n\n').trim();
  const textFields={belief:'belief',övertygelse:'belief',goal:'goal',mål:'goal',instinct:'instinct',instinkt:'instinct',concept:'concept',koncept:'concept',rank:'rank',rang:'rank',homeland:'homeland',hemland:'homeland',age:'age',ålder:'age',ancestry:'ancestry',härkomst:'ancestry',lineage:'lineage',insignia:'insignia',seniorartisan:'seniorArtisan',friend:'friend',vän:'friend',mentor:'mentor',enemy:'enemy',fiende:'enemy',parents:'parents',föräldrar:'parents',cloak:'cloak',weapon:'weapon',vapen:'weapon'};
  Object.assign(textFields,{station:'rank','rank/station':'rank','station/rank':'rank',rankstation:'rank',stationrank:'rank',characterconcept:'concept',nature:'natureDescriptors',natur:'natureDescriptors',naturedescriptors:'natureDescriptors',creed:'creed'});
  Object.setPrototypeOf(textFields,null);
  const fieldFor=label=>textFields[normalize(label)];
  const relationFields=new Set(['friend','enemy','mentor','seniorArtisan','parents']);
  function biography(html) {
    const clean=String(html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
    const headings=[...clean.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)],candidates=new Map(),warnings=[],items=[],sections=[];
    const offer=(field,value)=>{if(!field||!value||(field==='natureDescriptors'&&!/\p{L}/u.test(value))||(relationFields.has(field)&&/@UUID\[/.test(value)))return;const values=candidates.get(field)||new Set();values.add(value);candidates.set(field,values);};
    for(let i=0;i<headings.length;i++){
      const heading=headings[i],key=normalize(plain(heading[2])),field=fieldFor(key);
      sections.push({key,html:clean.slice(heading.index+heading[0].length,headings[i+1]?.index??clean.length).split(/<table\b|<hr\b/i)[0]});
      if(field){const lines=plain(sections.at(-1).html).split('\n'),boundary=lines.findIndex(line=>{const hit=line.match(/^([^:]{1,40}):\s*\S/);return hit&&textFields[normalize(hit[1])];});offer(field,(boundary<0?lines:lines.slice(0,boundary)).join('\n').trim());}
    }
    for(const line of plain(clean).split('\n')){const hit=line.match(/^([^:]{1,40}):\s*(\S.*)$/);if(hit){const field=textFields[normalize(hit[1])];if(field)offer(field,hit[2].trim());}}
    for(const block of clean.matchAll(/<(?:p|li)\b[^>]*>\s*<(?:strong|b)\b[^>]*>([^<]{1,40})<\/(?:strong|b)>\s*[:：\-–—]?\s*([\s\S]*?)<\/(?:p|li)>/gi))offer(fieldFor(plain(block[1])),plain(block[2]));
    for(const section of sections){
      const text=plain(section.html);
      if(['traits','egenskaper'].includes(section.key))for(const part of text.replace(/([^,;\n()]+),\s*(?:lv\.?|level)\s*([0-6])\b/gi,'$1 ($2)').split(/[,;\n]/)){
        const hit=part.trim().match(/^([^()]{1,100}?)\s*\(([0-6])\)(?:\s*\([^)]*\))*$/);if(hit)items.push({name:hit[1].trim(),type:'trait',system:{rating:Number(hit[2]),description:text},effects:[]});
      }
      if(['wises','wise'].includes(section.key))for(const part of text.split(';')[0].replace(/\s*\([^)]*(?:\)|$)/g,'').split(/[,\n]/)){
        const name=part.trim();if(name.length<=100&&/^(?:wise[-–][\p{L}\p{N} '\u2019-]+|[\p{L}\p{N} '\u2019-]+[-–]wise)$/iu.test(name))items.push({name,type:'wise',system:{rating:0,description:text},effects:[]});
      }
      if(['talents','talanger'].includes(section.key)){
        let pending=null;const save=()=>{if(pending?.body.trim())items.push({name:pending.name,type:'talent',system:{description:pending.body.trim(),effectMode:'manual',diceBonus:0,frequency:'passive',linkType:'specific',sourceKey:'',minLevel:2},effects:[]});};
        for(const line of text.split('\n').filter(Boolean)){const hit=line.match(/^([^:]{1,100}):\s*(.*)$/);if(hit){save();pending={name:hit[1].trim(),body:hit[2]};}else if(pending)pending.body+='\n'+line;}
        save();
      }
    }
    // Explicit relationship roles in source tables, not guesses from names or prose.
    const parents=new Set(),contacts=[],selfRows=[];
    for(const section of sections.filter(section=>['contacts','relationships','kontakter','relationer'].includes(section.key))){
      const text=plain(section.html),roles=[...text.matchAll(/\b(Senior Artisan|Mentor|Mother|Father|Friend|Enemy|Contact|Mor|Far|Vän|Fiende)\s*:\s*/giu)];
      for(let i=0;i<roles.length;i++){
        const role=roles[i][1],value=text.slice(roles[i].index+roles[i][0].length,roles[i+1]?.index??text.length).trim();
        const link=value.match(/@UUID\[([^\]#]+)(?:#[^\]]*)?\](?:\{([^}]+)\})?/);if(!link)continue;
        const field=fieldFor(role),parentRole=/^(mother|mor)$/i.test(role)?'mother':/^(father|far)$/i.test(role)?'father':'';
        contacts.push({name:link[2]||link[1],sourceUuid:link[1],role,details:`${role}${value.replace(link[0],'').trim()?': '+value.replace(link[0],'').trim():''}`,field:field||null,parentRole});
      }
    }
    for(const table of clean.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)){
      const header=table[1].match(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/i);
      if(!header||!/^(person|name|namn|contact|kontakt)$/i.test(plain(header[1])))continue;
      for(const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)){
        const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)];if(cells.length!==2)continue;
        const name=plain(cells[0][1]),details=plain(cells[1][1]);if(!name||!details||/^(din|ditt|your)\s/i.test(details))continue;
        const sourceUuid=cells[0][1].match(/@UUID\[([^\]#]+)|data-uuid=["']([^"']+)["']/)?.slice(1).find(Boolean)||'';
        contacts.push({name,details,sourceUuid,parentRole:/(?:^|\s)(?:father|far)\s*[:;,.—–]/i.test(details)?'father':/(?:^|\s)(?:mother|mor)\s*[:;,.—–]/i.test(details)?'mother':''});
      }
    }
    for(const row of clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)){
      const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(cell=>plain(cell[1]));
      if(cells.length!==2||!cells[0]||!cells[1])continue;
      offer(fieldFor(cells[0]),cells[1]);
      if(/^(din|your)\s/i.test(cells[1]))selfRows.push({name:cells[0],text:cells[1]});
      const role=cells[1].match(/^(?:[\p{L}\p{N}][\p{L}\p{N} ’'-]{0,99}s\s+)?(Senior Artisan|Mentor|Friend|Enemy|Vän|Fiende)\s*[:;,.—–]/iu);
      if(role)offer(textFields[role[1].toLowerCase().replace(/\s/g,'')],cells[0]);
      if(/(?:^|\s)(?:father|mother|far|mor)\s*[:;,.—–]/i.test(cells[1]))parents.add(cells[0]);
    }
    if(parents.size)offer('parents',[...parents].join('; '));
    const fields={};for(const [field,values] of candidates){if(values.size===1)fields[field]=[...values][0];else warnings.push(`Conflicting ${field} sections remain in Biography; no value was chosen.`);}
    const unique=[];for(const item of items){const same=items.filter(other=>other.type===item.type&&other.name.toLowerCase()===item.name.toLowerCase());if(same.some(other=>JSON.stringify(other.system)!==JSON.stringify(item.system))){warnings.push(`Conflicting ${item.type} ${item.name} remains in Biography.`);continue;}if(!unique.some(other=>other.type===item.type&&other.name.toLowerCase()===item.name.toLowerCase()))unique.push(item);}
    return {fields,warnings,items:unique,contacts,selfRows,readable:plain(clean)};
  }
  globalThis.AdventurersTomeTafBiography=Object.freeze({parse:biography,plain,toText:readable});
  AdventurersTomeMigrationAdapters.register('taf->realm-guard', {
    map(entry, source, target, choice) {
      if(!['3.1.0','3.2.0'].includes(source.systemVersion))return {status:'unsupported',data:null,notes:['This adapter supports taf 3.1.0 and 3.2.0 only.']};
      const raw=clone(entry.sourceData),batch=choice.tafTransfer===true;
      if(entry.documentType==='Actor') {
        if(raw.type!=='player'||!raw.system||typeof raw.system.content!=='string'||!Array.isArray(raw.items||[]))return {status:'unsupported',data:null,notes:['Unknown taf Actor schema.']};
        if(!['character','npc'].includes(choice.type))return {status:'unmapped',data:null,notes:['Choose Character or NPC. Names never determine Actor type.']};
        const data={...raw,type:choice.type,system:{biography:readable(raw.system?.content),notes:''},items:[],effects:[]};
        const story=batch?biography(raw.system.content):null;
        if(story){
          const extra=new Map();
          const offer=(label,value)=>{const field=fieldFor(label);if(!field||value==null)return;const text=plain(typeof value==='object'?'':String(value));if(!text||(field==='natureDescriptors'&&!/\p{L}/u.test(text)))return;const values=extra.get(field)||new Set();values.add(text);extra.set(field,values);};
          for(const [name,value] of Object.entries(raw.system.attr||{}))offer(name,value?.value??value);
          for(const field of raw.items||[])if(field.type==='attribute'){offer(field.name,field.system?.value);offer(field.system?.key,field.system?.value);}
          for(const [field,values] of extra){if(story.fields[field])values.add(story.fields[field]);if(values.size===1)story.fields[field]=[...values][0];else {delete story.fields[field];story.warnings.push(`Conflicting ${field} source fields remain in the source reference; no value was chosen.`);}}
          const self=story.selfRows.filter(row=>normalize(row.name)===normalize(raw.name||entry.name));
          if(self.length===1){
            const stations=[...self[0].text.matchAll(/\b(recruit|scout|veteran|captain|lord)\b/gi)].map(hit=>hit[1].toLowerCase());
            if(!story.fields.rank&&!story.warnings.some(note=>note.startsWith('Conflicting rank '))&&new Set(stations).size===1)story.fields.rank=stations[0];
            const home=self[0].text.match(/\b(?:från|from)\s+([^.!?]+)[.!?]?$/iu);if(!story.fields.homeland&&!story.warnings.some(note=>note.startsWith('Conflicting homeland '))&&home)story.fields.homeland=home[1].trim();
          }
          if(story.fields.rank){const station=story.fields.rank.match(/^(recruit|scout|veteran|captain|lord)(?:\s+ranger)?$/i);if(station)story.fields.rank=station[1].toLowerCase();}
          story.missingHeaderFields=choice.type==='character'?['concept','rank','homeland','age'].filter(field=>!story.fields[field]):[];
        }
        if(story)Object.assign(data.system,story.fields);
        const counters=new Map();
        if(batch)for(const item of raw.items||[]){const field=counter(item);if(!field)continue;const value=item.type==='generic'?item.system?.quantity:item.system?.value,values=counters.get(field)||[];values.push(value);counters.set(field,values);}
        for(const [field,values] of counters){
          const numbers=values.map(value=>typeof value==='string'&&/^\d+$/.test(value)?Number(value):value);
          if(numbers.every(value=>Number.isSafeInteger(value)&&value>=0)&&new Set(numbers).size===1){if(field.startsWith('spent')){data.system.progression??={};data.system.progression[field]=numbers[0];}else{data.system.resources??={};data.system.resources[field]={value:numbers[0]};}}
          else story.warnings.push(`Conflicting or invalid ${field} counters kept as reference; no counter was guessed.`);
        }
        if(batch&&data.prototypeToken){for(const bar of ['bar1','bar2'])if(data.prototypeToken[bar])data.prototypeToken[bar].attribute=null;delete data.prototypeToken.delta;}
        else delete data.prototypeToken;
        data.items=(raw.items||[]).filter(item=>item.type==='generic'&&(!batch||(!counter(item)&&!condition(item)))).map(item=>({...item,type:'gear',system:{description:description(item,batch),quantity:Math.max(0,Number.isInteger(item.system?.quantity)?item.system.quantity:1)},effects:[]}));
        const storyItems=(story?.items||[]).filter(item=>target.types?.Item?.includes(item.type));
        data.items.push(...storyItems);
        const skillGroups=new Map();
        if(batch&&target.types?.Item?.includes('role'))for(const item of raw.items||[]){
          if(item.type!=='attribute'||! /^(?:(?:will|health)\s+)?skills$/i.test(String(item.system?.group||'').trim()))continue;
          const name=String(item.name||item.system?.key||'').trim();if(!name)continue;const id=normalize(name),group=skillGroups.get(id)||[];group.push(item);skillGroups.set(id,group);
        }
        const mappedSkills=[];
        for(const group of skillGroups.values()){
          const values=group.map(item=>typeof item.system?.value==='string'&&/^\d+$/.test(item.system.value.trim())?Number(item.system.value):item.system?.value),item=group[0];
          if(!values.every(value=>Number.isInteger(value)&&value>=0&&value<=12)||new Set(values).size!==1){story.warnings.push(`Invalid or conflicting skill rating kept as reference: ${item.name}.`);continue;}
          const skill={...item,name:String(item.name||item.system.key).trim(),type:'role',system:{rating:values[0],description:`TAF skill — ${item.system.group}. Original rating preserved.`,notes:'',beginnerAbility:'',versus:false},effects:[]};
          data.items.push(skill);mappedSkills.push({name:skill.name,type:'role',rating:values[0]});
        }
        const suggestions=(raw.items||[]).filter(item=>item.type==='attribute').map(item=>({id:item._id,label:item.name||item.system?.key,key:item.system?.key,value:item.system?.value,max:item.system?.max,target:labels[String(item.system?.key||item.name).trim().toLowerCase()]||null}));
        const retained=[];
        for(const suggestion of suggestions) {
          const explicit=Object.hasOwn(choice.attributes||{},suggestion.id),field=explicit?choice.attributes[suggestion.id]:(batch?suggestion.target:null);
          if(!['health','will','nature','resources','circles'].includes(field))continue;
          const valid=Number.isInteger(suggestion.value)&&suggestion.value>=0&&suggestion.value<=(field==='nature'?7:100);
          const validMax=suggestion.max==null||(Number.isInteger(suggestion.max)&&suggestion.max>=(field==='nature'?0:1)&&suggestion.max<=(field==='nature'?7:100));
          data.system.attributes??={};
          if(batch&&!explicit&&(!valid||!validMax||data.system.attributes[field])){retained.push(suggestion.label);continue;}
          if(!valid)throw Error(`Invalid attribute value: ${suggestion.label}`);
          if(data.system.attributes[field])throw Error(`Two attributes map to ${field}. Choose one.`);
          data.system.attributes[field]={value:suggestion.value};
          suggestion.applied=field;
          if(Number.isInteger(suggestion.max)&&suggestion.max>=(field==='nature'?0:1)&&suggestion.max<=(field==='nature'?7:100))data.system.attributes[field][field==='nature'?'maximum':'max']=suggestion.max;
        }
        const sourceText=value=>readable(typeof value==='object'&&value!==null?JSON.stringify(value,null,2):String(value??''));
        if(batch)data.system.notes=`TAF source reference\n\nOriginal values, not additional Realm Guard mechanics. Macro triggers and effects remain archived.\n\nCarry capacity: ${sourceText(raw.system.carryCapacity)||'Not stated'}\n\n${(raw.items||[]).filter(item=>item.type!=='generic').map(item=>`${sourceText(item.name||item.system?.key)}\nGroup: ${sourceText(item.system?.group)||'Not stated'} · Value: ${sourceText(item.system?.value)||'Not stated'} · Maximum: ${sourceText(item.system?.max)||'Not stated'}`).join('\n\n')}`;
        if(batch){
          if(counters.size)data.system.notes+=`\n\nOriginal TAF counters\n\n${[...counters].map(([field,values])=>`${field}: ${values.map(sourceText).join(', ')}`).join('\n')}`;
          const annotations=Object.values(raw.flags?.ffs?.inventory||{}).filter(field=>typeof field?.text==='string'&&field.text.trim());
          if(annotations.length)data.system.notes+=`\n\nOriginal sheet annotations\n\n${annotations.map(field=>readable(field.text)).join('\n\n')}`;
          if(raw.system.attr&&Object.keys(raw.system.attr).length)data.system.notes+=`\n\nAdditional source fields\n\n${Object.entries(raw.system.attr).map(([key,value])=>`${sourceText(key)}: ${sourceText(value)}`).join('\n')}`;
        }
        const notes=[batch?'Confirmed group conversion. Compatible core attributes copied; Biography and remaining TAF fields and Freeform Sheet annotations are readable text. Original HTML, rules, effects and Macro triggers remain in the private source archive.':'Biography converted to readable text. Original HTML, free-text rules, attributes, inventory and effects are preserved in the private source archive; mechanics are not inferred.'];
        if(retained.length)notes.push(`Incompatible or duplicate core fields kept as reference only: ${retained.join(', ')}.`);
        if(story){notes.push(...story.warnings);if(Object.keys(story.fields).length)notes.push(`Biography headings mapped to sheet fields: ${Object.keys(story.fields).join(', ')}. Full Biography retained, including Nature descriptors, Traits, Talents, Wises, Learning and relationship context; no rules are invented.`);}
        if(storyItems.length)notes.push('Explicit Traits and named Wises copied to their sheet lists. Wises without a stated rating stay unrated. Named Talents keep their written effect in manual mode with zero automatic dice; source eligibility is not inferred.');
        if(mappedSkills.length)notes.push(`${mappedSkills.length} TAF skills copied: ${mappedSkills.filter(skill=>skill.rating>0).length} trained, ${mappedSkills.filter(skill=>skill.rating===0).length} untrained. Source Macros are not activated; target rules determine Beginner's Luck abilities.`);
        return {status:batch?'ready':'mapped',data,notes,suggestions,storyPreview:story?{fields:Object.entries(story.fields).map(([field,value])=>({field,value})),missingHeaderFields:story.missingHeaderFields,items:[...storyItems.map(item=>({name:item.name,type:item.type})),...mappedSkills],contacts:story.contacts,text:story.readable}:null};
      }
      if(entry.documentType==='Item'&&raw.type==='generic') {
        if(batch&&(condition(raw)||counter(raw)))return {status:'unsupported',intentionalExclusion:true,data:null,notes:['TAF condition/counter definition retained in the source package only. Conditions already belong to the target system; Actor counters are restored to their sheet fields, not as equipment.']};
        return {status:batch?'ready':'mapped',data:{...raw,type:'gear',system:{description:description(raw,batch),quantity:Math.max(0,Number.isInteger(raw.system?.quantity)?raw.system.quantity:1)},effects:[]},notes:['Description and quantity copied. Weight, equipped state and groups retained as reference; Macro triggers stay in the source archive. No Macro is executed.']};
      }
      if(batch&&entry.documentType==='Item'&&['attribute','base'].includes(raw.type))return {status:'ready',data:{...raw,type:'gear',system:{quantity:0,description:`TAF reference — not active equipment or mechanics\n\n${Object.entries(raw.system||{}).filter(([key])=>key!=='trigger').map(([key,value])=>`${readable(key)}: ${readable(typeof value==='object'?JSON.stringify(value):String(value??''))}`).join('\n')}`},effects:[]},notes:['TAF field/template kept as a zero-quantity reference Item. No mechanical conversion or Macro execution.']};
      return {status:'unsupported',data:null,notes:['taf attributes require mechanical review and remain in the source archive.']};
    }
  });
})();
