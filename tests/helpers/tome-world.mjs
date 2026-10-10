import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const fixture = fs.readFileSync(path.join(root,'tests/fixtures/shadows-at-blackbridge.txt'),'utf8');

function world(text = fixture, known = true) {
  const handlers = new Map();
  const storage = new Map();
  const docs = new Map();
  const links = new Set();
  const module = { api:{} };
  let serial = 0;
  const collection = () => ({ contents:[], get(id) { return this.contents.find(doc=>doc.id===id); } });
  const game = { user:{id:'gm',isGM:true}, users:{activeGM:{id:'gm'}}, modules:new Map([['adventurers-tome',module]]),
    journal:collection(), actors:collection(), items:collection(), folders:collection(), i18n:{lang:'en'},
    settings:{ get:(_module,key)=>storage.get(key), set:async(_module,key,value)=>{storage.set(key,value);},
      register:(_module,key,options)=>{if(!storage.has(key))storage.set(key,options.default);} } };
  function add(name, kind, flags = {}) {
    const doc = {id:`d${++serial}`,name,documentName:kind,flags,sort:0,
      getFlag:(_module,key)=>flags[key], update:async changes=>{
        for(const [key,value] of Object.entries(changes)) {
          const prefix='flags.adventurers-tome.';
          if(key.startsWith(prefix)) flags[key.slice(prefix.length)]=structuredClone(value);
        }
      }, testUserPermission:()=>true};
    doc.uuid=`${kind}.${doc.id}`;
    docs.set(doc.uuid,doc);
    (kind==='Actor'?game.actors:kind==='Item'?game.items:game.journal).contents.push(doc);
    return doc;
  }
  const session = add('Session 2 — Shadows at Blackbridge','JournalEntry',{type:'session'});
  const page = {id:'page',uuid:`${session.uuid}.JournalEntryPage.page`,name:'Notes',sort:0,text:{content:text},parent:session};
  session.pages = {contents:[page],get:id=>id===page.id?page:null};
  docs.set(page.uuid,page);
  if(known) {
    for(const name of ['Arne','Baran','Citronimus','Gunther']) add(name,'Actor');
    for(const [name,category] of [['Pale Wardens','faction'],['Ravenmoor Valley','location'],['Ember Seal','item']]) add(name,'JournalEntry',{worldProfile:{category}});
  }
  const context = vm.createContext({game,MODULE_ID:'adventurers-tome',foundry:{utils:{deepClone:structuredClone},applications:{api:{DialogV2:{wait:async()=>{throw Error('Unexpected dialog');}}}}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}},
    window:{clearTimeout(){},setTimeout(){return 1;}},
    console:{info(){},warn(){},error(){}},
    ui:{notifications:{warn(){},info(){},error(){}}},
    fromUuid:async uuid=>docs.get(uuid)||null,
    JournalEntry:{create:async input=>{const entry=add(input.name,'JournalEntry',input.flags?.['adventurers-tome']);entry.ownership=input.ownership;return entry;}},
    document:{createElement:()=>({innerHTML:'',get textContent(){return this.innerHTML.replace(/<[^>]+>/g,'');},querySelectorAll:()=>[]})},
    Hooks:{once:(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},
      on:(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},
      callAll:(name,...args)=>{for(const callback of handlers.get(name)||[])callback(...args);}}
  });
  function load(file) {
    vm.runInContext(`{\n${fs.readFileSync(path.join(root,'scripts',file),'utf8')}\n}`,context,{filename:file});
  }
  context.self=context;
  vm.runInContext(fs.readFileSync(path.join(root,'vendor/compromise-14.17.0.js'),'utf8'),context,{filename:'compromise-14.17.0.js'});
  for(const file of ['language-packs/en.js','language-packs/sv.js','campaign-language-foundation.js','nlp-provider.js','campaign-link-semantic-mentions.js','campaign-identity-reconciliation.js','campaign-source-scoped-identity.js','campaign-deterministic-auto-link.js',
    'campaign-review-learning.js','campaign-new-entity-discovery.js','campaign-confirmed-entity-creation.js','campaign-mention-evidence.js','campaign-relationship-evidence.js','campaign-entity-intelligence.js']) load(file);
  for(const callback of handlers.get('init')||[])callback();
  for(const callback of handlers.get('ready')||[])callback();
  const entities = () => [...game.actors.contents,...game.items.contents,...game.journal.contents.filter(doc=>doc.getFlag('','worldProfile'))]
    .map(doc=>({name:doc.name,canonicalUuid:doc.uuid,kind:doc.getFlag('','worldProfile')?.category||'character'}));
  module.api.discovery={snapshot:()=>({entities:entities()}),scan:async()=>({entities:entities()})};
  module.api.campaignMentionDiscovery={snapshot:()=>({mentions:[]}),scan:async()=>({mentions:[]})};
  module.api.campaignEntityLinks={hasCanonicalLink:({sourceUuid,targetUuid})=>links.has(`${sourceUuid}|${targetUuid}`),
    linkCanonical:async({sourceUuid,targetUuid})=>{links.add(`${sourceUuid}|${targetUuid}`);},
    unlinkCanonical:async({sourceUuid,targetUuid})=>{links.delete(`${sourceUuid}|${targetUuid}`);} };
  // Exercise the real generic authoring path, with only folder bootstrap mocked.
  let genericCreate;
  vm.runInContext(`{\n${fs.readFileSync(path.join(root,'scripts/universal-folder-quick-create.js'),'utf8')}\n globalThis.genericCreate=atFqEditGenericEntry; }`,context);
  genericCreate=context.genericCreate;
  module.api.folderQuickCreate={bootstrap:async()=>({folders:Object.fromEntries(['contact','location','faction','item','lore','npc'].map(type=>[type,{id:type,type:'JournalEntry',name:type}]))}),
    quickCreate:async(folder,options)=>genericCreate(folder.id,{label:folder.name,profileCategory:folder.id},{id:'blank',facts:[]},folder,options)};
  return {api:module.api,game,storage,docs,links,session,page,add,context,
    reload:file=>{load(file);handlers.get('ready').at(-1)();},
    scan:()=>module.api.campaignNewEntityDiscovery.scan(),
    resolve:async()=>module.api.campaignEntityCreation.resolveCandidates((await module.api.campaignNewEntityDiscovery.scan()).candidates)};
}

export { world };
