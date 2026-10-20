/* Optional system adapters. Source data is never modified. */
(() => {
  const adapters = new Map();
  const copy = value => JSON.parse(JSON.stringify(value));
  function register(id, adapter) {
    if(adapters.has(id))throw Error(`Duplicate migration adapter: ${id}`);
    adapters.set(id, Object.freeze(adapter));
  }
  function map(entry, source, target, choice = {}) {
    const raw = copy(entry.sourceData);
    if(!['Actor', 'Item'].includes(entry.documentType))return {status:'ready', data:raw, notes:[]};
    if(source.systemId === target.id) {
      const types=target.types?.[entry.documentType] || [];
      if(!types.includes(raw.type))return {status:'unsupported', data:null, notes:['The target system does not support this document type.']};
      return {status:'ready', data:raw, notes:['Same-system direct copy. Source document type and rules data are retained.']};
    }
    const adapter=adapters.get(`${source.systemId}->${target.id}`);
    if(!adapter)return {status:'unsupported', data:null, notes:['No system adapter. Original data remains in the package.']};
    return adapter.map(entry, source, target, choice);
  }
  globalThis.AdventurersTomeMigrationAdapters=Object.freeze({register,map});
})();
