const ID='adventurers-tome';
export const STORAGE_FLAG='inventoryStorage';
export const STORAGE_KINDS=Object.freeze({
  pack:['Pack animal','icons/svg/pawprint.svg'],
  base:['Home or base','icons/svg/house.svg'],
  chest:['Chest','icons/svg/chest.svg'],
  crate:['Crate','icons/svg/chest.svg'],
  barrel:['Barrel','icons/svg/barrel.svg'],
  other:['Other container','icons/svg/item-bag.svg']
});

export function storageKind(actor){
  const kind=actor?.flags?.[ID]?.[STORAGE_FLAG];
  return Object.hasOwn(STORAGE_KINDS,kind)?kind:null;
}

export function isInventoryItem(item,systemId){
  return item?.documentName==='Item'&&item.parent?.documentName==='Actor'&&
    (systemId!=='realm-guard'||['gear','tokenOfPower'].includes(item.type));
}

export function ownsInventory(actor,user){
  return actor?.documentName==='Actor'&&!actor.pack&&actor.canUserModify?.(user,'update')===true;
}

const transfers=new WeakSet();

export async function transferInventoryItem(item,destination,{user,systemId}){
  const source=item?.parent;
  const check=()=>{
    if(!isInventoryItem(item,systemId)||!ownsInventory(source,user)||!ownsInventory(destination,user)||
      !item.canUserModify?.(user,'delete'))throw Error('You need permission to move this item between both inventories.');
    if(source.uuid===destination.uuid)return false;
    if(!storageKind(source)&&!storageKind(destination))return false;
    if(source.items.get(item.id)!==item)throw Error('This item has already moved.');
    return true;
  };
  if(!check())return null;
  if(transfers.has(item))throw Error('This item is already being moved.');
  if(systemId==='realm-guard'&&source.items.contents.some(child=>child.system?.inventory?.containerId===item.id)){
    throw Error('Move the contents out of this container before moving the container itself.');
  }
  const data=item.toObject(),original=JSON.stringify(data);
  delete data._id;
  if(systemId==='realm-guard'&&data.system?.inventory){
    Object.assign(data.system.inventory,{mode:'unassigned',location:'',containerId:''});
  }

  transfers.add(item);
  try{
    const [copy]=await destination.createEmbeddedDocuments('Item',[data]);
    if(!copy)throw Error('Foundry did not add the item to the destination.');
    let deleting=false;
    try{
      if(!check()||JSON.stringify(item.toObject())!==original)throw Error('The item changed before it could be moved.');
      deleting=true;
      const removed=await source.deleteEmbeddedDocuments('Item',[item.id]);
      deleting=false;
      if(!removed.some(document=>document.id===item.id))throw Error('The item was already moved elsewhere.');
    }catch(error){
      if(deleting&&!source.items.has(item.id))throw Error('Foundry could not confirm the move. The destination copy was kept. Check both inventories.');
      try{
        await destination.deleteEmbeddedDocuments('Item',[copy.id]);
        if(destination.items.has(copy.id))throw Error('The copy is still in the destination.');
      }
      catch{throw Error('The move could not be rolled back. Check both inventories before trying again.');}
      throw error;
    }
    return copy;
  }finally{
    transfers.delete(item);
  }
}
