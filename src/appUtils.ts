export const DEFAULT_PANE_SIZES = [300, 900] as const
export const DEFAULT_ASSISTANT_PANE_SIZE = 350

export function normalizePaneSizes(sizes: number[] | null | undefined): number[] {
  if (
    !Array.isArray(sizes) ||
    sizes.length < 2 ||
    !sizes.every(size => typeof size === 'number' && size > 0)
  ) {
    return [...DEFAULT_PANE_SIZES]
  }

  if (sizes.length === 2) {
    return [sizes[0], sizes[1], DEFAULT_ASSISTANT_PANE_SIZE]
  }

  return sizes
}
