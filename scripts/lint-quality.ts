/**
 * Quality Gate Lint
 *
 * Runs ESLint with quality gate rules enabled (max-lines, max-lines-per-function,
 * sonarjs/cognitive-complexity). These rules are behind the ESLINT_QUALITY env var
 * so they don't break the strict `bun run lint` (--max-warnings 0) pipeline.
 *
 * Compares warnings against a checked-in baseline so existing quality debt remains
 * visible while new warnings fail the gate.
 *
 * Run: bun scripts/lint-quality.ts
 * Update baseline intentionally: bun scripts/lint-quality.ts --update-baseline
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

type LintMessage = {
  ruleId: string | null
  severity: number
}

type LintResult = {
  filePath: string
  messages: LintMessage[]
}

type Baseline = {
  version: 1
  totalWarnings: number
  entries: Record<string, number>
}

const BASELINE_PATH = resolve(process.cwd(), 'scripts/lint-quality-baseline.json')
const isUpdate = process.argv.includes('--update-baseline')

const result = spawnSync('bunx', ['eslint', '--format', 'json', '.'], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ESLINT_QUALITY: '1' },
  cwd: process.cwd(),
})

if (result.error || result.status === null) {
  console.error('Failed to run eslint:', result.error?.message ?? 'unknown error')
  process.exit(1)
}

if (result.stderr.trim().length > 0) {
  process.stderr.write(result.stderr)
}

let results: LintResult[]
try {
  results = JSON.parse(result.stdout) as LintResult[]
} catch (error: unknown) {
  console.error('Failed to parse ESLint JSON output.')
  if (result.stdout.trim().length > 0) {
    console.error(result.stdout)
  }
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const current = buildBaseline(results)
const errorCount = results.reduce(
  (sum, lintResult) => sum + lintResult.messages.filter(message => message.severity === 2).length,
  0
)

if (errorCount > 0) {
  console.error(`lint:quality failed with ${errorCount} ESLint error(s).`)
  process.exit(1)
}

let baseline: Baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
} catch (error: unknown) {
  console.error(`Failed to read lint quality baseline at ${BASELINE_PATH}.`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const regressions = Object.entries(current.entries)
  .map(([key, count]) => ({ key, count, baselineCount: baseline.entries[key] ?? 0 }))
  .filter(entry => entry.count > entry.baselineCount)

if (isUpdate) {
  if (current.totalWarnings > baseline.totalWarnings || regressions.length > 0) {
    console.error(
      `Refusing to increase lint quality baseline: current=${current.totalWarnings}, baseline=${baseline.totalWarnings}.`
    )
    for (const regression of regressions.slice(0, 20)) {
      console.error(
        `+ ${regression.key}: ${regression.count} warning(s), baseline ${regression.baselineCount}`
      )
    }
    if (regressions.length > 20) {
      console.error(`...and ${regressions.length - 20} more increased file/rule bucket(s).`)
    }
    process.exit(1)
  }

  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`)
  console.log(
    `Updated lint quality baseline: ${current.totalWarnings} warning(s), ${
      Object.keys(current.entries).length
    } file/rule bucket(s).`
  )
  process.exit(0)
}

if (current.totalWarnings > baseline.totalWarnings || regressions.length > 0) {
  console.error(
    `lint:quality warning baseline exceeded: current=${current.totalWarnings}, baseline=${baseline.totalWarnings}.`
  )
  for (const regression of regressions.slice(0, 20)) {
    console.error(
      `+ ${regression.key}: ${regression.count} warning(s), baseline ${regression.baselineCount}`
    )
  }
  if (regressions.length > 20) {
    console.error(`...and ${regressions.length - 20} more increased file/rule bucket(s).`)
  }
  console.error(
    'Fix the new warnings first. Run `bun scripts/lint-quality.ts --update-baseline` only after a cleanup PR reduces the warning baseline.'
  )
  process.exit(1)
}

const reducedWarnings = baseline.totalWarnings - current.totalWarnings
const reducedBuckets = Object.keys(baseline.entries).length - Object.keys(current.entries).length
console.log(
  `lint:quality passed with ${current.totalWarnings}/${baseline.totalWarnings} warning(s) and ${
    Object.keys(current.entries).length
  }/${Object.keys(baseline.entries).length} file/rule bucket(s).`
)
if (reducedWarnings > 0 || reducedBuckets > 0) {
  console.log(
    `Quality debt improved by ${Math.max(reducedWarnings, 0)} warning(s) and ${Math.max(
      reducedBuckets,
      0
    )} bucket(s). Run --update-baseline in a dedicated cleanup PR to ratchet lower.`
  )
}

process.exit(0)

function buildBaseline(results: LintResult[]): Baseline {
  const entries: Record<string, number> = {}
  let totalWarnings = 0

  for (const lintResult of results) {
    const file = normalizePath(relative(process.cwd(), lintResult.filePath))
    for (const message of lintResult.messages) {
      if (message.severity !== 1) {
        continue
      }

      totalWarnings += 1
      const rule = message.ruleId ?? 'unknown'
      const key = `${file}::${rule}`
      entries[key] = (entries[key] ?? 0) + 1
    }
  }

  return {
    version: 1,
    totalWarnings,
    entries: Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))
    ),
  }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}
