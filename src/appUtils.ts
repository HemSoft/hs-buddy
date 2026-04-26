export const DEFAULT_PANE_SIZES = [300, 900] as const
export const DEFAULT_ASSISTANT_PANE_SIZE = 350

export function safeLength(arr: { length: number } | undefined): number {
  return arr?.length ?? 0
}

export function computeAppMetrics(
  schedules: { length: number } | undefined,
  jobs: { length: number } | undefined,
  prCounts: Record<string, number>,
  assistantOpen: boolean,
  paneSizes: number[]
) {
  const scheduleCount = safeLength(schedules)
  const jobCount = safeLength(jobs)
  const totalPRCount = Object.values(prCounts).reduce((a, b) => a + b, 0)
  const defaultSizes = assistantOpen ? paneSizes : paneSizes.slice(0, 2)
  const assistantPaneSize = paneSizes[2] || DEFAULT_ASSISTANT_PANE_SIZE
  return { scheduleCount, jobCount, totalPRCount, defaultSizes, assistantPaneSize }
}

export function isAppLoading(
  layoutLoaded: boolean,
  terminalLoaded: boolean,
  migrationLoading: boolean,
  migrationComplete: boolean
) {
  return !layoutLoaded || !terminalLoaded || (migrationLoading && !migrationComplete)
}

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
