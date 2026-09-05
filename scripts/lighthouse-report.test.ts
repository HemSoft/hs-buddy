import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { lighthouseReport } from './lighthouse-report'

const directories: string[] = []
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lighthouse-report-test-'))
  directories.push(directory)
  writeFileSync(join(directory, 'manifest.json'), '[]')
  return directory
}
function report(performance: number | null, accessibility = 0.94, bestPractices = 1) {
  return {
    categories: {
      performance: { score: performance },
      accessibility: { score: accessibility },
      'best-practices': { score: bestPractices },
    },
  }
}
function writeReport(directory: string, file: string, value: unknown) {
  writeFileSync(join(directory, file), JSON.stringify(value))
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Array<{
    jsonPath: string
  }>
  manifest.push({ jsonPath: `C:/downloaded/.lighthouseci/${file}` })
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})

describe('Lighthouse report evidence', () => {
  it('reports every filesystem upload and the per-category median', () => {
    const directory = fixture()
    for (const [index, score] of [0.68, 0.63, 0.9].entries()) {
      writeReport(directory, `localhost--2026_09_05_${index}.report.json`, report(score))
    }
    // Raw collector files and manifests must not double-count filesystem reports.
    writeFileSync(join(directory, 'lhr-123.json'), JSON.stringify(report(0.01)))
    writeFileSync(join(directory, 'stale.report.json'), JSON.stringify(report(0.01)))
    const { summary, errors } = lighthouseReport(directory)
    expect(errors).toEqual([])
    expect(summary).toContain('| Median | 68.0 | 94.0 | 100.0 |')
    expect(summary.match(/\.report\.json/g)).toHaveLength(3)
    expect(summary).not.toContain('lhr-123')
  })
  it('averages the middle pair when comparing an even number of samples', () => {
    const directory = fixture()
    for (const [index, score] of [0.6, 0.8].entries()) {
      writeReport(directory, `${index}.report.json`, report(score))
    }
    expect(lighthouseReport(directory).summary).toContain('| Median | 70.0 | 94.0 | 100.0 |')
  })
  it.each([null, -1, 2])('rejects an invalid score: %s', score => {
    const directory = fixture()
    writeReport(directory, 'bad.report.json', report(score))
    expect(lighthouseReport(directory).errors.join(' ')).toContain('invalid performance')
  })
  it('rejects missing files, malformed reports, and Lighthouse runtime errors', () => {
    const directory = fixture()
    expect(lighthouseReport(directory).errors.join(' ')).toContain(
      'No Lighthouse filesystem reports'
    )
    writeReport(directory, 'bad.report.json', {})
    const file = join(directory, 'bad.report.json')
    writeFileSync(file, '{')
    expect(lighthouseReport(directory).errors.length).toBeGreaterThan(0)
    writeFileSync(file, JSON.stringify({ runtimeError: { code: 'NO_FCP' } }))
    expect(lighthouseReport(directory).errors.join(' ')).toContain('runtime error')
    writeFileSync(file, '{}')
    expect(lighthouseReport(directory).errors.join(' ')).toContain('invalid performance')
  })
  it('preserves valid scores without a misleading median when another report is broken', () => {
    const directory = fixture()
    writeReport(directory, 'good.report.json', report(0.97))
    writeReport(directory, 'broken.report.json', report(null))
    const { summary, errors } = lighthouseReport(directory)
    expect(summary).toContain('| good.report.json | 97.0 | 94.0 | 100.0 |')
    expect(summary).not.toContain('| Median |')
    expect(summary).toContain('Median unavailable')
    expect(summary).toContain('broken.report.json')
    expect(errors).toHaveLength(1)
  })
})

describe('blocking Lighthouse workflow', () => {
  it.each([
    {},
    [null],
    [{ jsonPath: 12 }],
    [{ jsonPath: 'wrong.json' }],
    [{ jsonPath: 'same.report.json' }, { jsonPath: 'same.report.json' }],
  ])('rejects an invalid upload manifest: %j', manifest => {
    const directory = fixture()
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
    expect(lighthouseReport(directory).errors.length).toBeGreaterThan(0)
  })
  it('uses error-level median assertions at the maintained thresholds', () => {
    const config = createRequire(import.meta.url)('../lighthouserc.cjs')
    expect(config.ci.collect.numberOfRuns).toBe(3)
    expect(config.ci.assert.assertions).toEqual({
      'categories:performance': ['error', { minScore: 0.6, aggregationMethod: 'median' }],
      'categories:accessibility': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
      'categories:best-practices': ['error', { minScore: 0.8, aggregationMethod: 'median' }],
    })
  })
  it('requires the job and preserves hidden reports even after assertion failure', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
    const job = workflow.split('  lighthouse:')[1].split('  ci-feedback:')[0]
    expect(job).not.toContain('continue-on-error')
    expect(job).toContain('run: bun scripts/lighthouse-report.ts')
    expect(job).toContain('include-hidden-files: true')
    expect(job).toContain('if-no-files-found: error')
    expect(job.match(/if: always\(\)/g)).toHaveLength(2)
    const dependencies = workflow
      .split('  ci-complete:')[1]
      .match(/needs: \[([^\]]+)\]/)?.[1]
      .split(',')
      .map(value => value.trim())
    expect(dependencies).toContain('lighthouse')
  })
})
