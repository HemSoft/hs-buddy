/**
 * Coverage Ratchet
 *
 * Reads the current coverage from vitest's json-summary output and updates
 * vitest config thresholds to match the current floor. Thresholds can
 * only go UP, never DOWN.
 *
 * Uses json-summary (coverage-summary.json) instead of LCOV to get the exact
 * same percentages vitest uses for threshold checking — avoids mismatches
 * between LCOV line counts and V8 statement coverage.
 *
 * Supports both the main (src/) and electron test suites via CLI args:
 *   bun scripts/coverage-ratchet.ts
 *   bun scripts/coverage-ratchet.ts --config vitest.electron.config.ts --summary coverage-electron/coverage-summary.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: 'vitest.config.ts' },
    summary: { type: 'string', default: 'coverage/coverage-summary.json' },
  },
  strict: false,
})

const root = resolve(import.meta.dirname, '..')
const configPath = resolve(root, values.config as string)
const summaryPath = resolve(root, values.summary as string)

type MetricKey = 'statements' | 'branches' | 'functions' | 'lines'
const METRICS: MetricKey[] = ['statements', 'branches', 'functions', 'lines']

// Parse coverage-summary.json (vitest json-summary reporter output)
function parseSummary(path: string): Record<MetricKey, number> {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const total = raw.total
  if (!total) throw new Error('coverage-summary.json missing "total" key')

  const result = {} as Record<MetricKey, number>
  for (const key of METRICS) {
    const pct = total[key]?.pct
    if (pct == null) throw new Error(`coverage-summary.json missing total.${key}.pct`)
    // Floor to integer — vitest checks with decimal precision,
    // so an integer floor is always safe as a threshold
    result[key] = Math.floor(pct)
  }
  return result
}

// Extract current thresholds from vitest config
function parseThresholds(config: string): Record<MetricKey, number> {
  const match = config.match(/thresholds:\s*\{([^}]+)\}/)
  if (!match) throw new Error(`Could not find thresholds in ${values.config}`)
  const block = match[1]
  const get = (key: string) => {
    const m = block.match(new RegExp(`${key}\\s*:\\s*(\\d+)`))
    return m ? Number.parseInt(m[1], 10) : 0
  }
  const result = {
    statements: get('statements'),
    branches: get('branches'),
    functions: get('functions'),
    lines: get('lines'),
  }
  if (Object.values(result).every(v => v === 0)) {
    throw new Error(
      `Could not parse any thresholds from ${values.config} — format may have changed`
    )
  }
  return result
}

try {
  const current = parseSummary(summaryPath)
  const config = readFileSync(configPath, 'utf-8')
  const existing = parseThresholds(config)

  // Ratchet: only go UP
  const next = {} as Record<MetricKey, number>
  for (const key of METRICS) {
    next[key] = Math.max(existing[key], current[key])
  }

  const changed = METRICS.some(k => next[k] !== existing[k])
  if (!changed) {
    console.log('Coverage ratchet: no threshold increase needed.')
    console.log(
      `  Current: S=${existing.statements}% B=${existing.branches}% F=${existing.functions}% L=${existing.lines}%`
    )
    process.exit(0)
  }

  // Update config
  const updated = config.replace(
    /thresholds:\s*\{[^}]+\}/,
    `thresholds: {\n        statements: ${next.statements},\n        branches: ${next.branches},\n        functions: ${next.functions},\n        lines: ${next.lines},\n      }`
  )
  if (updated === config)
    throw new Error(`Threshold replacement failed—${values.config} format may have changed`)
  writeFileSync(configPath, updated)

  console.log('Coverage ratchet: thresholds updated!')
  console.log(
    `  Before: S=${existing.statements}% B=${existing.branches}% F=${existing.functions}% L=${existing.lines}%`
  )
  console.log(
    `  After:  S=${next.statements}% B=${next.branches}% F=${next.functions}% L=${next.lines}%`
  )
} catch (err: unknown) {
  console.error('Coverage ratchet failed:', (err as Error).message)
  console.error(
    `Make sure to run the appropriate test:coverage command first to generate ${values.summary}`
  )
  process.exit(1)
}
