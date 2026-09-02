export const MEBIBYTE = 1024 * 1024

export const CLEANUP_METRICS = [
  'totalWorkingSetBytes',
  'rendererWorkingSetBytes',
  'domNodes',
  'documents',
  'eventListeners',
] as const

export const PACKAGED_MEMORY_BUDGETS = {
  absoluteScenario: 'dashboard-warm',
  totalWorkingSetBytes: 605 * MEBIBYTE,
  rendererWorkingSetBytes: 230 * MEBIBYTE,
  cleanupRatio: 1.1,
  cleanupMetrics: CLEANUP_METRICS,
} as const

export type CleanupMetric = (typeof CLEANUP_METRICS)[number]

export type BudgetScenarioMetrics = Pick<ScenarioMetrics, CleanupMetric>

export type ProcessKind =
  'main' | 'renderer' | 'gpu' | 'utility' | 'webview' | 'spawned-child' | 'other'

export interface ProcessMemorySample {
  pid: number
  parentPid: number | null
  kind: ProcessKind
  electronType: string | null
  name: string | null
  serviceName: string | null
  workingSetBytes: number
  privateBytes: number | null
  source: 'electron' | 'os'
}

export interface RendererMemorySample {
  v8UsedHeapBytes: number
  embedderHeapBytes: number
  domNodes: number
  documents: number
  eventListeners: number
}

export interface ScenarioMetrics extends RendererMemorySample {
  totalWorkingSetBytes: number
  totalPrivateBytes: number
  rendererWorkingSetBytes: number
  rendererPrivateBytes: number
  processes: ProcessMemorySample[]
  capturedAt: string
}

export interface BudgetFailure {
  metric: CleanupMetric
  actual: number
  limit: number
  scenario: string
}

export interface MedianScenarioMetrics extends Omit<ScenarioMetrics, 'processes' | 'capturedAt'> {
  runs: number
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median requires at least one value')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function aggregateProcessMemory(
  processes: ProcessMemorySample[]
): Pick<
  ScenarioMetrics,
  'totalWorkingSetBytes' | 'totalPrivateBytes' | 'rendererWorkingSetBytes' | 'rendererPrivateBytes'
> {
  return processes.reduce(
    (totals, process) => {
      totals.totalWorkingSetBytes += process.workingSetBytes
      totals.totalPrivateBytes += process.privateBytes ?? 0
      if (process.kind === 'renderer' || process.kind === 'webview') {
        totals.rendererWorkingSetBytes += process.workingSetBytes
        totals.rendererPrivateBytes += process.privateBytes ?? 0
      }
      return totals
    },
    {
      totalWorkingSetBytes: 0,
      totalPrivateBytes: 0,
      rendererWorkingSetBytes: 0,
      rendererPrivateBytes: 0,
    }
  )
}

export function identifyNewRendererProcessesAsWebviews(
  baseline: ProcessMemorySample[],
  current: ProcessMemorySample[]
): ProcessMemorySample[] {
  const baselineRendererPids = new Set(
    baseline.filter(process => process.kind === 'renderer').map(process => process.pid)
  )
  return current.map(process =>
    process.kind === 'renderer' && !baselineRendererPids.has(process.pid)
      ? { ...process, kind: 'webview' }
      : process
  )
}

export function evaluateAbsoluteBudgets(
  scenario: BudgetScenarioMetrics,
  budgets = PACKAGED_MEMORY_BUDGETS
): BudgetFailure[] {
  const failures: BudgetFailure[] = []
  if (scenario.totalWorkingSetBytes > budgets.totalWorkingSetBytes) {
    failures.push({
      metric: 'totalWorkingSetBytes',
      actual: scenario.totalWorkingSetBytes,
      limit: budgets.totalWorkingSetBytes,
      scenario: 'dashboard-warm',
    })
  }
  if (scenario.rendererWorkingSetBytes > budgets.rendererWorkingSetBytes) {
    failures.push({
      metric: 'rendererWorkingSetBytes',
      actual: scenario.rendererWorkingSetBytes,
      limit: budgets.rendererWorkingSetBytes,
      scenario: 'dashboard-warm',
    })
  }
  return failures
}

function ratioLimit(baseline: number, ratio: number): number {
  return baseline === 0 ? 0 : baseline * ratio
}

export function evaluateCleanupBudget(
  scenarioName: string,
  baseline: BudgetScenarioMetrics,
  afterCleanup: BudgetScenarioMetrics,
  ratio = PACKAGED_MEMORY_BUDGETS.cleanupRatio
): BudgetFailure[] {
  return CLEANUP_METRICS.flatMap(metric => {
    const limit = ratioLimit(baseline[metric], ratio)
    return afterCleanup[metric] <= limit
      ? []
      : [{ metric, actual: afterCleanup[metric], limit, scenario: scenarioName }]
  })
}

export function buildMedianScenario(samples: ScenarioMetrics[]): MedianScenarioMetrics {
  if (samples.length === 0) throw new Error('buildMedianScenario requires at least one sample')
  return {
    totalWorkingSetBytes: median(samples.map(sample => sample.totalWorkingSetBytes)),
    totalPrivateBytes: median(samples.map(sample => sample.totalPrivateBytes)),
    rendererWorkingSetBytes: median(samples.map(sample => sample.rendererWorkingSetBytes)),
    rendererPrivateBytes: median(samples.map(sample => sample.rendererPrivateBytes)),
    v8UsedHeapBytes: median(samples.map(sample => sample.v8UsedHeapBytes)),
    embedderHeapBytes: median(samples.map(sample => sample.embedderHeapBytes)),
    domNodes: median(samples.map(sample => sample.domNodes)),
    documents: median(samples.map(sample => sample.documents)),
    eventListeners: median(samples.map(sample => sample.eventListeners)),
    runs: samples.length,
  }
}

export function formatBytes(bytes: number): string {
  return `${(bytes / MEBIBYTE).toFixed(1)} MiB`
}
