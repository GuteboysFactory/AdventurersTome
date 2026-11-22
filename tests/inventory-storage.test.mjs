import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {STORAGE_FLAG,STORAGE_KINDS,isInventoryItem,ownsInventory,storageKind,transferInventoryItem} from '../scripts/inventory-transfer.mjs';

const owner={id:'player'};
const options={user:owner,systemId:'realm-guard'};

function actor(id,kind,allowedUser=owner){
  const items=new Map();
  Object.defineProperty(items,'contents',{get:()=>[...items.values()]});
  let serial=0;
  const model={id,uuid:`Actor.${id}`,name:id,documentName:'Actor',items,
    flags:{'adventurers-tome':{[STORAGE_FLAG]:kind}},
    canUserModify:(user,action)=>user===allowedUser&&action==='update',
    testUserPermission:user=>user===allowedUser,
    async createEmbeddedDocuments(type,rows){
      assert.equal(type,'Item');
      return rows.map(data=>item(model,`created-${++serial}`,data));
    },
    async deleteEmbeddedDocuments(type,ids){
      assert.equal(type,'Item');
      return ids.flatMap(id=>{
        const document=items.get(id);
        if(!document)return [];
        items.delete(id);
        return document;
      });
    }};
  return model;
}

function item(parent,id,data={}){
  const source={_id:id,name:'Rations',type:'gear',img:'gear.png',system:{quantity:4,inventory:{mode:'worn',location:'torso',containerId:'old-pack'}},
    flags:{system:{custom:'preserved'}},...data};
  const document={id,uuid:`${parent.uuid}.Item.${id}`,parent,documentName:'Item',
    canUserModify:(user,action)=>action==='delete'&&parent.canUserModify(user,'update'),
    ...source,toObject:()=>structuredClone(source)};
  parent.items.set(id,document);
  return document;
}

test('the same two-way move preserves the stack and its data for every storage type',async()=>{
  for(const kind of Object.keys(STORAGE_KINDS)){
    const character=actor('pc'),storage=actor(kind,kind);
    const gear=item(character,'original');
    const stored=await transferInventoryItem(gear,storage,options);
    assert.equal(character.items.size,0);
    assert.equal(storage.items.size,1);
    assert.equal(stored.system.quantity,4);
    assert.equal(stored.img,'gear.png');
    assert.deepEqual(stored.flags,gear.flags);
    assert.deepEqual(stored.system.inventory,{mode:'unassigned',location:'',containerId:''});
    const returned=await transferInventoryItem(stored,character,options);
    assert.equal(storage.items.size,0);
    assert.equal(returned.system.quantity,4);
  }
});

test('a failed source deletion removes the destination copy, and a second drag is rejected while a move runs',async()=>{
  const character=actor('pc'),storage=actor('chest','chest');
  const gear=item(character,'original');
  character.deleteEmbeddedDocuments=async()=>{throw Error('Foundry refused deletion');};
  const transfer=transferInventoryItem(gear,storage,options);
  await assert.rejects(transferInventoryItem(gear,storage,options),/already being moved/);
  await assert.rejects(transfer,/refused deletion/);
  assert.equal(character.items.get(gear.id),gear);
  assert.equal(storage.items.size,0);
});

test('ownership is required on both sides and a changed item or a filled portable container stays in place',async()=>{
  const character=actor('pc'),hidden=actor('hidden','chest',{id:'gm'}),storage=actor('chest','chest');
  const gear=item(character,'original');
  await assert.rejects(transferInventoryItem(gear,hidden,options),/permission/);
  const bag=item(character,'bag');
  item(character,'contents',{system:{inventory:{containerId:bag.id}}});
  await assert.rejects(transferInventoryItem(bag,storage,options),/contents out/);
  const create=storage.createEmbeddedDocuments;
  storage.createEmbeddedDocuments=async(...args)=>{
    const created=await create(...args);
    character.items.delete(gear.id);
    return created;
  };
  await assert.rejects(transferInventoryItem(gear,storage,options),/already moved/);
  assert.equal(storage.items.size,0);
  assert.equal(hidden.items.size,0);
});

test('the registered drop handlers move native character gear to storage and back while leaving native slot sorting alone',async()=>{
  const character=actor('pc'),storage=actor('chest','chest');
  const gear=item(character,'original');
  const actors=new Map([[character.id,character],[storage.id,storage]]);
  actors.contents=[character,storage];
  const listeners={},hooks={},notices=[];
  const context=vm.createContext({
    STORAGE_FLAG,STORAGE_KINDS,isInventoryItem,ownsInventory,storageKind,transferInventoryItem,
    game:{user:owner,system:{id:'realm-guard'},actors,modules:new Map()},
    document:{addEventListener:(event,callback)=>{listeners[event]=callback;}},
    Hooks:{once:(event,callback)=>{hooks[event]=callback;},on(){}},
    ui:{notifications:{info:message=>notices.push(message),warn:message=>assert.fail(message)}},
    fromUuid:async uuid=>[...character.items.contents,...storage.items.contents].find(document=>document.uuid===uuid)
  });
  const source=readFileSync(new URL('../scripts/inventory-storage.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
  vm.runInContext(source,context);
  hooks.ready();
  const root={};
  Object.assign(context,{root,character,storage});
  vm.runInContext('selectedId=storage.id; sheets.set(root,character);',context);
  const gearRow={dataset:{rgGearId:gear.id},closest:()=>root};
  const charTarget={closest:selector=>selector==='[data-at-storage-drop]'?null:root};
  const storeTarget={closest:()=>root};
  const payload=()=>{
    const data=new Map();
    return {setData:(type,value)=>data.set(type,value),getData:type=>data.get(type)||''};
  };
  const fromCharacter=payload();
  listeners.dragstart({target:{closest:()=>gearRow},dataTransfer:fromCharacter});
  let consumed=false;
  const drop=(target,dataTransfer)=>listeners.drop({target,dataTransfer,preventDefault(){consumed=true;},stopImmediatePropagation(){}});
  drop(charTarget,fromCharacter);
  assert.equal(consumed,false);
  drop(storeTarget,fromCharacter);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storage.items.size,1);
  const fromStorage=payload();
  listeners.dragstart({target:{closest:()=>({dataset:{storageItem:storage.items.contents[0].id}})},dataTransfer:fromStorage});
  drop(charTarget,fromStorage);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(character.items.contents[0].system.quantity,4);
  assert.equal(storage.items.size,0);
  assert.equal(notices.length,2);
});
