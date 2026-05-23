/**
 * Memory Leak Detection Utility — Node-level Process Memory Monitoring
 *
 * Detects memory leaks by running a callback repeatedly and checking
 * whether heap usage grows linearly (indicating unreleased allocations).
 *
 * Scope: Node.js main process memory only. Does NOT monitor renderer/Chromium memory.
 *
 * Usage:
 *   import { detectMemoryLeak } from '../perf/memory-monitor'
 *
 *   const result = await detectMemoryLeak({
 *     operation: async () => { ... },
 *     cycles: 100,
 *     warmupCycles: 10,
 *     leakThresholdBytes: 1024 * 1024, // 1MB growth = leak
 *   })
 *
 *   if (result.leaked) {
 *     console.error('Memory leak detected:', result)
 *   }
 */

export interface MemorySnapshot {
  cycle: number
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
}

export interface MemoryLeakOptions {
  /** The async operation to repeat. */
  operation: () => Promise<void> | void
  /** Number of cycles to run (default: 50). */
  cycles?: number
  /** Warmup cycles before measurement starts (default: 5). */
  warmupCycles?: number
  /** Heap growth in bytes that constitutes a leak (default: 5MB). */
  leakThresholdBytes?: number
  /** Force GC between cycles if available (default: true). */
  forceGC?: boolean
}

export interface MemoryLeakResult {
  /** Whether a leak was detected. */
  leaked: boolean
  /** Total heap growth from first measurement to last (bytes). */
  heapGrowthBytes: number
  /** Average heap growth per cycle (bytes). */
  avgGrowthPerCycle: number
  /** Linear regression slope of heapUsed over cycles (bytes/cycle). */
  slope: number
  /** R² of the linear fit (>0.7 with positive slope suggests a leak). */
  rSquared: number
  /** Raw snapshots for analysis. */
  snapshots: MemorySnapshot[]
  /** Human-readable summary. */
  summary: string
  /** Whether GC was requested but unavailable (results may be noisier). */
  gcUnavailable: boolean
}

function computeRSquared(
  points: Array<{ x: number; y: number }>,
  slope: number,
  intercept: number,
  meanY: number
): number {
  let ssRes = 0
  let ssTot = 0
  for (const { x, y } of points) {
    const predicted = slope * x + intercept
    ssRes += (y - predicted) ** 2
    ssTot += (y - meanY) ** 2
  }
  return ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot
}

/**
 * Calculate linear regression (least squares) for the heap growth trend.
 */
export function linearRegression(points: Array<{ x: number; y: number }>): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (const { x, y } of points) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const rSquared = computeRSquared(points, slope, intercept, sumY / n)

  return { slope, intercept, rSquared }
}

function humanBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${bytes} B`
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function validateOptions(cycles: number, warmupCycles: number): void {
  if (cycles < 1) {
    throw new Error(`cycles must be >= 1, got ${cycles}`)
  }
  if (warmupCycles < 0) {
    throw new Error(`warmupCycles must be >= 0, got ${warmupCycles}`)
  }
}

function buildSummary(
  leaked: boolean,
  heapGrowthBytes: number,
  avgGrowthPerCycle: number,
  slope: number,
  rSquared: number,
  cycles: number,
  leakThresholdBytes: number,
  gcUnavailable: boolean
): string {
  const status = leaked ? '❌ LEAK DETECTED' : '✅ No leak detected'
  const lines = [
    status,
    `  Heap growth: ${humanBytes(heapGrowthBytes)} over ${cycles} cycles`,
    `  Avg growth/cycle: ${humanBytes(avgGrowthPerCycle)}`,
    `  Trend slope: ${humanBytes(slope)}/cycle (R²=${rSquared.toFixed(3)})`,
    `  Threshold: ${humanBytes(leakThresholdBytes)}`,
  ]
  if (gcUnavailable) {
    lines.push('  ⚠️  GC was not forced (--expose-gc not set) — results may be noisier')
  }
  return lines.join('\n')
}

function setupGC(forceGC: boolean): { doGC: () => void; gcUnavailable: boolean } {
  const canGC = typeof globalThis.gc === 'function'
  const gcUnavailable = forceGC && !canGC

  if (gcUnavailable) {
    console.warn(
      '⚠️  forceGC requested but globalThis.gc is unavailable. ' +
        'Run with --expose-gc for accurate results. Proceeding without forced GC.'
    )
  }

  const doGC = () => {
    if (forceGC && canGC) globalThis.gc!()
  }

  return { doGC, gcUnavailable }
}

const DEFAULT_CYCLES = 50
const DEFAULT_WARMUP_CYCLES = 5
const DEFAULT_LEAK_THRESHOLD_BYTES = 5 * 1024 * 1024 // 5MB

function resolveLeakOptions(options: MemoryLeakOptions) {
  return {
    operation: options.operation,
    cycles: options.cycles ?? DEFAULT_CYCLES,
    warmupCycles: options.warmupCycles ?? DEFAULT_WARMUP_CYCLES,
    leakThresholdBytes: options.leakThresholdBytes ?? DEFAULT_LEAK_THRESHOLD_BYTES,
    forceGC: options.forceGC ?? true,
  }
}

/**
 * Run the operation repeatedly and detect memory leaks via heap growth analysis.
 */
export async function detectMemoryLeak(options: MemoryLeakOptions): Promise<MemoryLeakResult> {
  const { operation, cycles, warmupCycles, leakThresholdBytes, forceGC } =
    resolveLeakOptions(options)

  validateOptions(cycles, warmupCycles)

  const { doGC, gcUnavailable } = setupGC(forceGC)

  // Warmup phase: let V8 JIT settle
  for (let i = 0; i < warmupCycles; i++) {
    await operation()
  }
  doGC()

  // Measurement phase
  const snapshots: MemorySnapshot[] = []

  for (let cycle = 0; cycle < cycles; cycle++) {
    await operation()
    doGC()

    const mem = process.memoryUsage()
    snapshots.push({
      cycle,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    })
  }

  // Analyze trend
  const points = snapshots.map(s => ({ x: s.cycle, y: s.heapUsed }))
  const { slope, rSquared } = linearRegression(points)

  const heapGrowthBytes = snapshots[snapshots.length - 1].heapUsed - snapshots[0].heapUsed
  const intervals = Math.max(1, cycles - 1)
  const avgGrowthPerCycle = heapGrowthBytes / intervals

  const leaked = heapGrowthBytes > leakThresholdBytes && slope > 0 && rSquared > 0.7

  return {
    leaked,
    heapGrowthBytes,
    avgGrowthPerCycle,
    slope,
    rSquared,
    snapshots,
    summary: buildSummary(
      leaked,
      heapGrowthBytes,
      avgGrowthPerCycle,
      slope,
      rSquared,
      cycles,
      leakThresholdBytes,
      gcUnavailable
    ),
    gcUnavailable,
  }
}

// --- CLI Entrypoint ---

function requireNumericArg(args: string[], index: number, flag: string, min: number): number {
  const raw = args[index]
  if (raw === undefined) {
    console.error(`❌ ${flag} requires a value`)
    process.exit(1)
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min) {
    const constraint = min === 0 ? 'a non-negative number' : `a number >= ${min}`
    console.error(`❌ ${flag} must be ${constraint}, got "${raw}"`)
    process.exit(1)
  }
  return value
}

const HELP_TEXT = [
  'Usage: bun perf/memory-monitor.ts [options]',
  '',
  'Options:',
  '  --cycles <n>     Number of measurement cycles (default: 50)',
  '  --warmup <n>     Warmup cycles before measurement (default: 5)',
  '  --threshold <MB> Heap growth threshold in MB (default: 5)',
  '  --help           Show this help message',
].join('\n')

function parseCliArgs(): { cycles: number; warmupCycles: number; thresholdMB: number } | null {
  const args = process.argv.slice(2)
  const result = { cycles: 50, warmupCycles: 5, thresholdMB: 5 }

  const handlers: Record<string, (i: number) => number | null> = {
    '--cycles': i => {
      result.cycles = requireNumericArg(args, i + 1, '--cycles', 1)
      return i + 1
    },
    '--warmup': i => {
      result.warmupCycles = requireNumericArg(args, i + 1, '--warmup', 0)
      return i + 1
    },
    '--threshold': i => {
      result.thresholdMB = requireNumericArg(args, i + 1, '--threshold', 0)
      return i + 1
    },
    '--help': () => {
      console.log(HELP_TEXT)
      return null
    },
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const handler = handlers[arg]
    if (handler) {
      const next = handler(i)
      if (next === null) return null
      i = next
    } else {
      console.error(`❌ Unknown option: ${arg}`)
      console.log(HELP_TEXT)
      process.exit(1)
    }
  }

  return result
}

async function main(): Promise<void> {
  const opts = parseCliArgs()
  if (!opts) return
  const { cycles, warmupCycles, thresholdMB } = opts

  console.log('🔍 Running memory leak detection on idle process...')
  console.log(`   Cycles: ${cycles}, Warmup: ${warmupCycles}, Threshold: ${thresholdMB}MB\n`)

  const result = await detectMemoryLeak({
    operation: async () => {
      // Default: measure idle process memory to detect baseline leaks
      await new Promise(resolve => setTimeout(resolve, 10))
    },
    cycles,
    warmupCycles,
    leakThresholdBytes: thresholdMB * 1024 * 1024,
  })

  console.log(result.summary)
  process.exit(result.leaked ? 1 : 0)
}

// Run CLI only when executed directly (not when imported by tests)
if (import.meta.main) {
  main().catch(err => {
    console.error('❌ Memory monitor failed:', err)
    process.exit(1)
  })
}
