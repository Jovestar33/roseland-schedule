/** Saved hub order first; newly discovered hubs follow in stable alphabetical order. */
export function orderProductions<T>(items: T[], key: (item: T) => string, order: readonly string[] = []): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (positions.get(key(a)) ?? Infinity) - (positions.get(key(b)) ?? Infinity) || key(a).localeCompare(key(b)));
}
export function moveProduction(order: readonly string[], key: string, direction: -1 | 1): string[] {
  const next = [...order], index = next.indexOf(key), target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
