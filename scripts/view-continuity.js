// Client-only DOM state. Never stored in campaign documents or shared with players.
const atVcElements = root => [root, ...root.querySelectorAll('*')];
const atVcSettling = new WeakMap();
const atVcIdentityAttributes = new Set(['data-action','data-tab','data-section','data-journal-id','data-page-id','data-actor-id','data-world-id','data-quest-id','data-ref','data-uuid','data-at-review-key','data-at-notebook-pad','data-at-cw-drop-folder']);
function atVcKeys(root) {
  const counts = new Map(), result = new Map();
  for (const node of atVcElements(root)) {
    // Enhancers append classes/data guards after the template has rendered.
    // Those runtime attributes are state, not the identity of a scroll/details node.
    const baseClass=(node.getAttribute('class')||'').split(/\s+/u).find(value=>value && !/^(?:is-|active$|selected$)/u.test(value)) || '';
    const identity=[...node.attributes].filter(a=>atVcIdentityAttributes.has(a.name)).map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b));
    const signature = JSON.stringify([node.closest('[data-at-review-key]')?.dataset.atReviewKey, node.tagName, node.id, node.getAttribute('name'),
      node.id ? '' : baseClass, identity]);
    const occurrence = counts.get(signature) || 0;
    counts.set(signature, occurrence + 1);
    result.set(node, `${signature}:${occurrence}`);
  }
  return result;
}
function atVcCapture(root, completedKey = '', completedLabel = '') {
  if (!root?.querySelectorAll) return null;
  const pending=atVcSettling.get(root);
  if(pending) {pending.cancel();return pending.state;}
  const keys = atVcKeys(root), focus = root.ownerDocument.activeElement;
  const rows = [...keys].map(([node,key]) => ({key,
    top: node.scrollTop, left: node.scrollLeft,
    open: node.tagName === 'DETAILS' ? node.open : undefined,
    // Carry unsaved typing, but let updates to saved document fields render normally.
    draft: node.matches?.('input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea') && node.value !== node.defaultValue ? node.value : undefined,
    checked: node.matches?.('input[type="checkbox"], input[type="radio"]') && node.checked !== node.defaultChecked ? node.checked : undefined,
    selection: node.tagName === 'SELECT' && [...node.options].some(option => option.selected !== option.defaultSelected) ? [...node.options].filter(option => option.selected).map(option => option.value) : undefined,
    focused: node === focus, start: node === focus ? node.selectionStart : null, end: node === focus ? node.selectionEnd : null
  })).filter(row => row.top || row.left || row.open !== undefined || row.draft !== undefined || row.checked !== undefined || row.selection !== undefined || row.focused);
  for (const [node,key] of keys) {
    if (!node.scrollTop) continue;
    const row = rows.find(row => row.key === key), viewport = node.getBoundingClientRect();
    row.anchors = [...keys].filter(([child]) => child !== node && node.contains?.(child)
      && child.matches?.('article, li, tr, h2, h3, h4, [data-action]'))
      .map(([child,key]) => ({key, offset:child.getBoundingClientRect().top - viewport.top}))
      .filter(anchor => anchor.offset >= 0 && anchor.offset < viewport.height).slice(0,8);
  }
  return {rows};
}
function atVcRestore(root, state) {
  if (!root?.querySelectorAll || !state) return;
  const nodes = new Map([...atVcKeys(root)].map(([node,key]) => [key,node]));
  for (const row of state.rows) {
    const node = nodes.get(row.key); if (!node) continue;
    if (row.open !== undefined) node.open = row.open;
    if (row.draft !== undefined) node.value = row.draft;
    if (row.checked !== undefined) node.checked = row.checked;
    if (row.selection !== undefined) for (const option of node.options) option.selected = row.selection.includes(option.value);
    if (row.focused) {
      node.focus?.({preventScroll:true});
      if (row.start !== null) { try {node.setSelectionRange(row.start,row.end);} catch {} }
    }
  }
  // Restore scroll last: focusing and expanding details must not override it.
  for (const row of state.rows) {const node=nodes.get(row.key);if(node){node.scrollTop=row.top;node.scrollLeft=row.left;}}
  // If content above the viewport changed height, keep the same visible landmark.
  for (const row of state.rows) {
    const node = nodes.get(row.key), anchor = row.anchors?.find(anchor => nodes.has(anchor.key));
    if (!node || !anchor) continue;
    const child = nodes.get(anchor.key);
    if (node.contains(child)) node.scrollTop += child.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
  }
}
function atVcCancel(root) {if(root)atVcSettling.get(root)?.cancel();}
function atVcRestoreSettled(root,state) {
  atVcCancel(root);
  atVcRestore(root,state);
  const env=root?.ownerDocument?.defaultView || globalThis;
  if(!state || !root?.addEventListener || typeof env.MutationObserver!=='function')return;
  let frame=null,timer=null,observer;
  const events=['pointerdown','wheel','touchstart','keydown','input'];
  const cancel=()=>{
    observer?.disconnect();if(frame!==null)env.cancelAnimationFrame(frame);if(timer!==null)env.clearTimeout(timer);
    for(const event of events)root.removeEventListener(event,cancel,true);
    if(atVcSettling.get(root)?.cancel===cancel)atVcSettling.delete(root);
  };
  const retry=()=>{
    if(frame!==null)return;
    frame=env.requestAnimationFrame(()=>{frame=null;if(atVcSettling.get(root)?.cancel===cancel)atVcRestore(root,state);});
  };
  observer=new env.MutationObserver(retry);
  atVcSettling.set(root,{state,cancel});
  for(const event of events)root.addEventListener(event,cancel,{capture:true,passive:true});
  // Explorer and authoring surfaces mount after Foundry's render hooks. Keep
  // missing-node state briefly, including across another background render.
  // Any user interaction wins immediately; this is not a permanent scroll lock.
  observer.observe(root,{childList:true,subtree:true});
  retry();timer=env.setTimeout(cancel,600);
}
globalThis.AdventurersTomeViewContinuity = Object.freeze({capture:atVcCapture,restore:atVcRestore,restoreSettled:atVcRestoreSettled,cancel:atVcCancel});
