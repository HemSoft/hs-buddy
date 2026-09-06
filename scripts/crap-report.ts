import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { measureFunctions, type FileCoverage } from './crap-metric'
import {
  baselineFor,
  compareBaseline,
  crapFailures,
  CRAP_THRESHOLD,
  type CrapBaseline,
  type CrapRow,
} from './crap-policy'
import {
  CRAP_SUITES,
  isMeasuredFile,
  ownedFiles,
  sourceFingerprint,
  type CrapSuite,
} from './crap-scope'

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function measureSuite(suite: CrapSuite): CrapRow[] {
  const directory = `reports/crap/coverage-${suite}`
  const manifest = readJson(`${directory}/source.json`) as { suite: string; fingerprint: string }
  if (manifest.suite !== suite || manifest.fingerprint !== sourceFingerprint(suite))
    throw new Error(`Stale or mismatched coverage: ${suite}`)
  const coverage = readJson(`${directory}/coverage-final.json`) as Record<string, FileCoverage>
  if (!coverage || !Object.keys(coverage).length) throw new Error(`Empty coverage: ${suite}`)
  return ownedFiles(suite)
    .filter(isMeasuredFile)
    .flatMap(file => {
      const matches = Object.entries(coverage).filter(([path]) =>
        path.replaceAll('\\', '/').endsWith(`/${file}`)
      )
      if (matches.length > 1) throw new Error(`Ambiguous file coverage: ${file}`)
      return measureFunctions(readFileSync(file, 'utf8'), matches[0]?.[1], file).map(row => ({
        file,
        ...row,
      }))
    })
}

function checkBasePolicy(current: CrapBaseline): void {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return
  const event = readJson(eventPath) as {
    pull_request?: { base: { sha: string } }
    before?: string
    merge_group?: { base_sha: string }
  }
  const revision = event.pull_request?.base.sha ?? event.merge_group?.base_sha ?? event.before
  if (!revision || /^0+$/.test(revision)) return
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid baseline comparison revision')
  const files = execFileSync(
    'git',
    ['ls-tree', '--name-only', revision, '--', 'crap-baseline.json'],
    { encoding: 'utf8' }
  )
  if (files.trim()) {
    const previous = JSON.parse(
      execFileSync('git', ['show', `${revision}:crap-baseline.json`], { encoding: 'utf8' })
    ) as CrapBaseline
    compareBaseline(previous, current)
  }
}

try {
  if (process.env.COVERAGE_RESULT && process.env.COVERAGE_RESULT !== 'success') {
    throw new Error(`Coverage collection did not succeed: ${process.env.COVERAGE_RESULT}`)
  }
  const rows = CRAP_SUITES.flatMap(measureSuite).sort(
    (a, b) =>
      a.file.localeCompare(b.file, 'en') || a.line - b.line || a.id.localeCompare(b.id, 'en')
  )
  if (!rows.length) throw new Error('No functions measured')
  const args = process.argv.slice(2)
  if (
    args.some(arg => !['--initialize-baseline', '--update-baseline'].includes(arg)) ||
    args.length > 1
  )
    throw new Error('Unknown CRAP report arguments')
  const baselinePath = 'crap-baseline.json'
  if (args.length) {
    const proposed = baselineFor(
      rows,
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    )
    if (args[0] === '--update-baseline')
      compareBaseline(readJson(baselinePath) as CrapBaseline, proposed)
    writeFileSync(baselinePath, JSON.stringify(proposed, null, 2) + '\n', {
      flag: args[0] === '--initialize-baseline' ? 'wx' : 'w',
    })
  }
  const baseline = readJson(baselinePath) as CrapBaseline
  checkBasePolicy(baseline)
  const failures = crapFailures(rows, baseline)
  const report = {
    schemaVersion: 1,
    threshold: CRAP_THRESHOLD,
    baselineCommit: baseline.sourceCommit,
    functions: rows.length,
    worstScore: Math.max(...rows.map(row => row.score)),
    highRiskFunctions: rows.filter(row => row.score > CRAP_THRESHOLD).length,
    failures,
    rows,
  }
  mkdirSync('reports/crap', { recursive: true })
  writeFileSync('reports/crap/report.json', JSON.stringify(report, null, 2) + '\n')
  console.log(
    `CRAP: ${rows.length} functions; worst ${report.worstScore.toFixed(4)}; ${report.highRiskFunctions} above ${CRAP_THRESHOLD}; ${failures.length} regressions.`
  )
  for (const row of failures)
    console.error(`${row.file}:${row.line} ${row.name}: CRAP ${row.score.toFixed(4)}`)
  if (failures.length) process.exitCode = 1
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  mkdirSync('reports/crap', { recursive: true })
  writeFileSync(
    'reports/crap/report.json',
    JSON.stringify({ schemaVersion: 1, error: message }, null, 2) + '\n'
  )
  console.error(`CRAP qualification failed: ${message}`)
  process.exitCode = 1
}
