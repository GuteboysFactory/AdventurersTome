const ID = 'adventurers-tome';
const flag = (doc, key) => doc?.getFlag?.(ID, key) ?? doc?.flags?.[ID]?.[key];

// Only the public access fields change; private overlays and document content
// are never copied into a presentation update.
export function playerPresentationUpdate(document, users, {audience = null} = {}) {
  if (!document || document.pack || document.parent || document.isEmbedded ||
      !['Actor', 'Item', 'JournalEntry'].includes(document.documentName) ||
      flag(document, 'chronicleV1') || flag(document, 'vaultInboxV1')) {
    throw Error('This document cannot be presented to players.');
  }
  const players = users.filter(user => !user.isGM);
  const selected = audience === null ? null : new Set(audience);
  if (selected && (!selected.size || [...selected].some(id => !players.some(user => user.id === id)))) {
    throw Error('Choose a current player for this personal Quest.');
  }
  const ownership = document.ownership || {};
  const patch = {
    'ownership.default': selected ? 0 : Math.max(2, Number(ownership.default) || 0),
    [`flags.${ID}.access.visibility`]: 'inherit',
    [`flags.${ID}.access.discovered`]: true
  };
  for (const user of players) {
    const level = Number(ownership[user.id]);
    if (selected?.has(user.id)) patch['ownership.' + user.id] = Math.max(2, level || 0);
    else if (selected && Object.hasOwn(ownership, user.id)) patch['ownership.-=' + user.id] = null;
    else if (!selected && Object.hasOwn(ownership, user.id) && level >= 0 && level < 2) patch['ownership.' + user.id] = 2;
  }
  if (flag(document, 'semanticProjection')?.kind === 'contact') {
    patch[`flags.${ID}.semanticProjection.permissionOverride`] = true;
    patch[`flags.${ID}.semanticProjection.ownershipManaged`] = false;
  }
  if (flag(document, 'knownPersonV1')) patch[`flags.${ID}.knownPersonV1.permissionOverride`] = true;
  if (flag(document, 'questAudienceV1')) patch[`flags.${ID}.questAudienceV1`] = {mode: selected ? 'personal' : 'all', userIds: selected ? [...selected] : []};
  return patch;
}

// A Contact's sourceUuid identifies the relationship owner, not the person
// being presented. Never broaden that owner's permissions as a side effect.
export function presentationAuthorityUuid(document) {
  const semantic = flag(document, 'semanticProjection');
  if (semantic?.kind === 'contact') return String(semantic.linkedUuid || '');
  const profile = flag(document, 'worldProfile') || {};
  return String(flag(document, 'backendProjectionV1')?.sourceUuid || profile.sourceUuid ||
    (profile.actorId ? 'Actor.' + profile.actorId : profile.itemId ? 'Item.' + profile.itemId : ''));
}
