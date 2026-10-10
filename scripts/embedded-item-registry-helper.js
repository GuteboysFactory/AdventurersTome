export function getActorEmbeddedItems() {
  const token=globalThis.AdventurersTomeStartup?.begin("embedded-items-pass");
  try {
  const items = [];
  for (const actor of game.actors?.contents ?? []) {
    globalThis.AdventurersTomeStartup?.count("embedded-items-pass","actorsScanned");
    for (const item of actor.items?.contents ?? []) items.push(item);
  }
  return items;
  } finally {globalThis.AdventurersTomeStartup?.end(token);}
}
