/**
 * Benchmark Comparison Script
 *
 * Compares vitest bench JSON output against a committed baseline.
 * Fails if any benchmark regresses more than the allowed threshold.
 *
 * Usage:
 *   bun scripts/bench-compare.ts                          # compare latest vs baseline
 *   bun scripts/bench-compare.ts --baseline <file>        # custom baseline path
 *   bun scripts/bench-compare.ts --current <file>         # custom current results path
 *   bun scripts/bench-compare.ts --update                 # update baseline to current results
 *   bun scripts/bench-compare.ts --threshold 20           # custom threshold (default: 15%)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// --- Types ---

export interface BenchmarkResult {
  id: string
  name: string
  rank: number
  hz: number
  mean: number
  min: number
  max: number
  p75: number
  p99: number
  p995: number
  p999: number
  rme: number
  sampleCount: number
  median: number
}

export interface BenchmarkGroup {
  fullName: string
  benchmarks: BenchmarkResult[]
}

export interface BenchmarkFile {
  filepath: string
  groups: BenchmarkGroup[]
}

export interface BenchmarkOutput {
  files: BenchmarkFile[]
}

export interface ComparisonEntry {
  key: string
  name: string
  baselineHz: number
  currentHz: number
  changePercent: number
  rme: number
  passed: boolean
}

export interface ComparisonResult {
  entries: ComparisonEntry[]
  newBenchmarks: string[]
  removedBenchmarks: string[]
  passed: boolean
  threshold: number
}

// --- Constants ---

const DEFAULT_THRESHOLD = 15
const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_BASELINE_PATH = resolve(ROOT, 'bench-baseline.json')
const DEFAULT_CURRENT_PATH = resolve(ROOT, 'bench-results.json')

// --- Core Logic (exported for testing) ---

/**
 * Normalize a filepath from vitest bench output to a relative project path.
 * Handles both absolute and relative paths.
 */
export function normalizeFilepath(filepath: string): string {
  // Convert backslashes to forward slashes for consistency
  const normalized = filepath.replaceAll('\\', '/')
  // Extract the relative path from known project directories
  const srcMatch = normalized.match(/(src\/.+|electron\/.+|convex\/.+|perf\/.+|scripts\/.+)/)
  if (srcMatch) return srcMatch[1]
  // If already relative, return as-is
  if (!normalized.startsWith('/') && !normalized.match(/^[A-Z]:/i)) return normalized
  // Last resort: just the filename
  return normalized.split('/').pop() ?? normalized
}

/**
 * Build a unique key for a benchmark: "normalizedPath > suite > benchmark name"
 * When normalizedFilepath is provided, replaces the filepath portion of fullName
 * with the normalized version for stability across environments.
 */
export function buildBenchmarkKey(
  group: BenchmarkGroup,
  bench: BenchmarkResult,
  normalizedFilepath?: string
): string {
  if (normalizedFilepath) {
    const parts = group.fullName.split(' > ')
    const suiteParts = parts.length > 1 ? parts.slice(1) : parts
    return `${normalizedFilepath} > ${suiteParts.join(' > ')} > ${bench.name}`
  }
  return `${group.fullName} > ${bench.name}`
}

/**
 * Parse vitest bench JSON output into a map of benchmark keys to results.
 * Uses normalizeFilepath on file.filepath for stable keys across environments.
 */
export function parseBenchOutput(data: BenchmarkOutput): Map<string, BenchmarkResult> {
  const map = new Map<string, BenchmarkResult>()

  for (const file of data.files) {
    const normalizedPath = normalizeFilepath(file.filepath)
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        const key = buildBenchmarkKey(group, bench, normalizedPath)
        if (map.has(key)) {
          console.warn(`⚠️  Duplicate benchmark key: "${key}" — using latest occurrence`)
        }
        map.set(key, bench)
      }
    }
  }

  return map
}

/**
 * Compare current benchmark results against a baseline.
 * Returns regression analysis with pass/fail per benchmark.
 */
export function compareBenchmarks(
  baseline: BenchmarkOutput,
  current: BenchmarkOutput,
  threshold: number = DEFAULT_THRESHOLD
): ComparisonResult {
  const baselineMap = parseBenchOutput(baseline)
  const currentMap = parseBenchOutput(current)

  const entries: ComparisonEntry[] = []
  const newBenchmarks: string[] = []
  const removedBenchmarks: string[] = []

  // Check each current benchmark against baseline
  for (const [key, currentBench] of currentMap) {
    const baselineBench = baselineMap.get(key)
    if (!baselineBench) {
      newBenchmarks.push(key)
      continue
    }

    // hz = ops/sec, higher is better. Regression = current < baseline.
    const changePercent =
      baselineBench.hz === 0 ? 0 : ((currentBench.hz - baselineBench.hz) / baselineBench.hz) * 100

    // A regression exceeds threshold when performance drops
    const passed = changePercent >= -threshold

    entries.push({
      key,
      name: currentBench.name,
      baselineHz: baselineBench.hz,
      currentHz: currentBench.hz,
      changePercent,
      rme: currentBench.rme,
      passed,
    })
  }

  // Check for benchmarks that existed in baseline but not in current
  for (const key of baselineMap.keys()) {
    if (!currentMap.has(key)) {
      removedBenchmarks.push(key)
    }
  }

  const passed = entries.every(e => e.passed)

  return { entries, newBenchmarks, removedBenchmarks, passed, threshold }
}

// --- Formatting ---

function formatHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M ops/s`
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(2)}K ops/s`
  return `${hz.toFixed(2)} ops/s`
}

function formatChange(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}

function formatRme(rme: number): string {
  return typeof rme === 'number' && Number.isFinite(rme) ? `±${rme.toFixed(1)}%` : 'n/a'
}

function formatEntryRow(entry: ComparisonEntry): string {
  const status = entry.passed ? '✅' : '❌'
  // Use key (file/suite/name) for disambiguation when it differs from name
  const label = entry.key !== entry.name ? entry.key : entry.name
  return `| ${status} | ${label} | ${formatHz(entry.baselineHz)} | ${formatHz(entry.currentHz)} | ${formatChange(entry.changePercent)} | ${formatRme(entry.rme)} |`
}

export function formatResults(result: ComparisonResult): string {
  const lines: string[] = []

  lines.push('## Benchmark Comparison')
  lines.push('')
  lines.push(`Threshold: ${result.threshold}% regression`)
  lines.push('')

  if (result.entries.length > 0) {
    lines.push('| Status | Benchmark | Baseline | Current | Change | RME |')
    lines.push('|--------|-----------|----------|---------|--------|-----|')

    for (const entry of result.entries) {
      lines.push(formatEntryRow(entry))
    }
    lines.push('')
  }

  if (result.newBenchmarks.length > 0) {
    lines.push(`**New benchmarks** (no baseline): ${result.newBenchmarks.length}`)
    for (const key of result.newBenchmarks) {
      lines.push(`  - ${key}`)
    }
    lines.push('')
  }

  if (result.removedBenchmarks.length > 0) {
    lines.push(`**Removed benchmarks**: ${result.removedBenchmarks.length}`)
    for (const key of result.removedBenchmarks) {
      lines.push(`  - ${key}`)
    }
    lines.push('')
  }

  const regressions = result.entries.filter(e => !e.passed)
  if (regressions.length > 0) {
    lines.push(
      `❌ **FAILED**: ${regressions.length} benchmark(s) regressed more than ${result.threshold}%`
    )
  } else {
    lines.push('✅ **PASSED**: No significant regressions detected')
  }

  return lines.join('\n')
}

// --- Validation ---

function isValidBenchmark(bench: unknown): boolean {
  if (typeof bench !== 'object' || bench === null) return false
  const b = bench as Record<string, unknown>
  return typeof b.name === 'string' && typeof b.hz === 'number' && typeof b.rme === 'number'
}

function isValidGroup(group: unknown): boolean {
  if (typeof group !== 'object' || group === null) return false
  const g = group as Record<string, unknown>
  if (typeof g.fullName !== 'string') return false
  if (!Array.isArray(g.benchmarks)) return false
  return g.benchmarks.every(isValidBenchmark)
}

function isValidFile(file: unknown): boolean {
  if (typeof file !== 'object' || file === null) return false
  const f = file as Record<string, unknown>
  if (typeof f.filepath !== 'string') return false
  if (!Array.isArray(f.groups)) return false
  return f.groups.every(isValidGroup)
}

export function isValidBenchOutput(data: unknown): data is BenchmarkOutput {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.files)) return false
  return obj.files.every(isValidFile)
}

// --- CLI ---

function requireArgValue(args: string[], index: number, flag: string): string {
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    console.error(`❌ ${flag} requires an argument`)
    process.exit(1)
  }
  return args[index + 1]
}

function parseArgs(): {
  baselinePath: string
  currentPath: string
  threshold: number
  update: boolean
} {
  const args = process.argv.slice(2)
  let baselinePath = DEFAULT_BASELINE_PATH
  let currentPath = DEFAULT_CURRENT_PATH
  let threshold = DEFAULT_THRESHOLD
  let update = false

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline': {
        const val = requireArgValue(args, i, '--baseline')
        baselinePath = resolve(ROOT, val)
        i++
        break
      }
      case '--current': {
        const val = requireArgValue(args, i, '--current')
        currentPath = resolve(ROOT, val)
        i++
        break
      }
      case '--threshold': {
        const raw = requireArgValue(args, i, '--threshold')
        i++
        const parsed = Number(raw)
        if (!Number.isFinite(parsed) || parsed < 0) {
          console.error(`❌ --threshold must be a non-negative number, got "${raw}"`)
          process.exit(1)
        }
        threshold = parsed
        break
      }
      case '--update':
        update = true
        break
    }
  }

  return { baselinePath, currentPath, threshold, update }
}

function main(): void {
  const { baselinePath, currentPath, threshold, update } = parseArgs()

  // Update mode: copy current results to baseline
  if (update) {
    if (!existsSync(currentPath)) {
      console.error(`❌ Current results file not found: ${currentPath}`)
      console.error('Run `bun run bench:json` first to generate benchmark results.')
      process.exit(1)
    }
    const data = readFileSync(currentPath, 'utf-8')
    const parsed: unknown = JSON.parse(data)
    if (!isValidBenchOutput(parsed)) {
      console.error('❌ Current results file is not valid vitest bench JSON output')
      process.exit(1)
    }
    writeFileSync(baselinePath, JSON.stringify(parsed, null, 2) + '\n')
    const benchCount = parsed.files.reduce(
      (sum, f) => sum + f.groups.reduce((gs, g) => gs + g.benchmarks.length, 0),
      0
    )
    console.log(`✅ Updated baseline (${benchCount} benchmarks) → ${baselinePath}`)
    return
  }

  // Comparison mode
  if (!existsSync(baselinePath)) {
    console.log('ℹ️  No baseline file found. Run `bun run bench:update` to create one.')
    console.log('   Skipping comparison (this is expected on first run).')
    return
  }

  if (!existsSync(currentPath)) {
    console.error(`❌ Current results file not found: ${currentPath}`)
    console.error('Run `bun run bench:json` first to generate benchmark results.')
    process.exit(1)
  }

  const baselineRaw: unknown = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  const currentRaw: unknown = JSON.parse(readFileSync(currentPath, 'utf-8'))

  if (!isValidBenchOutput(baselineRaw)) {
    console.error('❌ Baseline file is not valid vitest bench JSON output')
    process.exit(1)
  }

  if (!isValidBenchOutput(currentRaw)) {
    console.error('❌ Current results file is not valid vitest bench JSON output')
    process.exit(1)
  }

  const result = compareBenchmarks(baselineRaw, currentRaw, threshold)
  console.log(formatResults(result))

  if (!result.passed) {
    process.exit(1)
  }
}

// Run CLI only when executed directly (not when imported by tests)
if (import.meta.main) {
  main()
}
