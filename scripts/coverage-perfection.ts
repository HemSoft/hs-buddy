import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    strict: { type: 'boolean', default: false },
    summary: { type: 'string', default: 'coverage/coverage-summary.json' },
    target: { type: 'string', default: '100' },
  },
})

const target = Number.parseFloat(values.target as string)
if (!Number.isFinite(target)) {
  throw new Error(`Invalid coverage target: ${values.target}`)
}

const summaryPath = resolve(process.cwd(), values.summary as string)
const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'))
const total = summary.total
if (!total) throw new Error('coverage-summary.json missing "total" key')

const metrics = ['statements', 'branches', 'functions', 'lines'] as const
const gaps = metrics
  .map(metric => ({ metric, pct: Number(total[metric]?.pct ?? 0) }))
  .filter(({ pct }) => pct < target)

if (gaps.length === 0) {
  console.log(`Coverage perfection: all metrics reached ${target}%.`)
  process.exit(0)
}

console.log(`Coverage perfection target: ${target}%`)
for (const { metric, pct } of gaps) {
  console.log(`  ${metric}: ${pct}% (${(target - pct).toFixed(2)} points short)`)
}

if (values.strict) {
  console.error('Coverage perfection check failed in strict mode.')
  process.exit(1)
}

console.log('Coverage perfection check is reporting-only; use --strict to enforce.')
