/** True when no two items share the value the selector reads. */
export function hasUniqueValues<Item>(items: Item[], valueOf: (item: Item) => unknown): boolean {
  return new Set(items.map(valueOf)).size === items.length;
}
