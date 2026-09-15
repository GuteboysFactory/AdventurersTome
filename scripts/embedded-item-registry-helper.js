export function getActorEmbeddedItems() {
  const items = [];
  for (const actor of game.actors?.contents ?? []) {
    for (const item of actor.items?.contents ?? []) items.push(item);
  }
  return items;
}
