/** Sum a numeric property across all items in an array. */
export function sumBy<T>(items: readonly T[], fn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + fn(item), 0)
}
