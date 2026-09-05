import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const categories = ['performance', 'accessibility', 'best-practices'] as const

interface LighthouseScores {
  file: string
  scores: number[]
}

function readScores(directory: string, file: string): LighthouseScores {
  const report = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as {
    runtimeError?: unknown
    categories?: Record<string, { score?: unknown }>
  }
  if (report.runtimeError) throw new Error(`${file}: Lighthouse runtime error`)
  const scores = categories.map(category => {
    const score = report.categories?.[category]?.score
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new Error(`${file}: missing or invalid ${category} score`)
    }
    return score
  })
  return { file, scores }
}

function currentReportFiles(directory: string): string[] {
  const manifest: unknown = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('No Lighthouse filesystem reports found in manifest')
  }
  const files = manifest.map((entry: { jsonPath?: unknown }) => {
    if (!entry || typeof entry.jsonPath !== 'string') throw new Error('Invalid Lighthouse manifest')
    // Use the basename so downloaded artifacts work across Windows and Ubuntu.
    const file = posix.basename(entry.jsonPath.replaceAll('\\', '/'))
    if (!file.endsWith('.report.json')) throw new Error('Invalid Lighthouse report filename')
    return file
  })
  if (new Set(files).size !== files.length) throw new Error('Duplicate Lighthouse report filenames')
  return files.sort()
}

export function lighthouseSummary(directory: string): string {
  // The manifest selects this upload only, excluding raw collector and stale report files.
  const reports = currentReportFiles(directory).map(file => readScores(directory, file))
  const medians = categories.map((_, index) => {
    const scores = reports.map(report => report.scores[index]).sort((a, b) => a - b)
    const middle = Math.floor(scores.length / 2)
    return scores.length % 2 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2
  })
  const row = (label: string, scores: number[]) =>
    `| ${label} | ${scores.map(score => (score * 100).toFixed(1)).join(' | ')} |`
  return [
    '## Lighthouse CI results',
    '',
    '| Report | Performance | Accessibility | Best practices |',
    '| --- | ---: | ---: | ---: |',
    ...reports.map(report => row(report.file, report.scores)),
    row('Median', medians),
    '',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = '.lighthouseci'
  const summary = lighthouseSummary(directory)
  console.log(summary)
  writeFileSync(resolve(directory, 'scores.md'), summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
}
