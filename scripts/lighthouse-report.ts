import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  if (report.runtimeError) throw new Error('Lighthouse runtime error')
  const scores = categories.map(category => {
    const score = report.categories?.[category]?.score
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new Error(`missing or invalid ${category} score`)
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function availableReports(directory: string): { reports: LighthouseScores[]; errors: string[] } {
  const reports: LighthouseScores[] = []
  const errors: string[] = []
  try {
    // The manifest selects this upload only, excluding raw collector and stale report files.
    for (const file of currentReportFiles(directory)) {
      try {
        reports.push(readScores(directory, file))
      } catch (error: unknown) {
        errors.push(`${file}: ${errorMessage(error)}`)
      }
    }
  } catch (error: unknown) {
    errors.push(errorMessage(error))
  }
  return { reports, errors }
}

function medianScores(reports: LighthouseScores[]): number[] {
  return categories.map((_, index) => {
    const scores = reports.map(report => report.scores[index]).sort((a, b) => a - b)
    return scores[1]
  })
}

export function lighthouseReport(directory: string): { summary: string; errors: string[] } {
  const { reports, errors } = availableReports(directory)
  if (reports.length !== 3) errors.push(`Expected 3 Lighthouse reports, found ${reports.length}`)
  const row = (label: string, scores: number[]) =>
    `| ${label} | ${scores.map(score => (score * 100).toFixed(1)).join(' | ')} |`
  const summary = [
    '## Lighthouse CI results',
    '',
    '| Report | Performance | Accessibility | Best practices |',
    '| --- | ---: | ---: | ---: |',
    ...reports.map(report => row(report.file, report.scores)),
    ...(errors.length === 0 ? [row('Median', medianScores(reports))] : []),
    '',
    ...(errors.length > 0
      ? [
          'Median unavailable because the report set is incomplete.',
          '',
          ...errors.map(error => `- ${error}`),
          '',
        ]
      : []),
  ].join('\n')
  return { summary, errors }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = '.lighthouseci'
  const { summary, errors } = lighthouseReport(directory)
  console.log(summary)
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'scores.md'), summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  if (errors.length > 0) process.exitCode = 1
}
