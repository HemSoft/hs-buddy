import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface ScorecardTier {
  [key: string]: unknown
  passed: number
  total: number
  points: number
  maxPoints: number
}

interface ScorecardClassification {
  [key: string]: unknown
  level: string
  numericScore: number
  maxPoints: number
  bronze: ScorecardTier
  silver: ScorecardTier
  gold: ScorecardTier
}

export interface ScorecardReport {
  repository: {
    fullName: string
  }
  classification: ScorecardClassification
  rules: unknown[]
  linting?: unknown
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Scorecard report is missing ${path}.`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Scorecard report is missing ${path}.`)
  }
  return value.trim()
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Scorecard report is missing ${path}.`)
  }
  return value
}

function tier(value: unknown, path: string): ScorecardTier {
  const data = record(value, path)
  return {
    ...data,
    passed: numberValue(data.passed, `${path}.passed`),
    total: numberValue(data.total, `${path}.total`),
    points: numberValue(data.points, `${path}.points`),
    maxPoints: numberValue(data.maxPoints, `${path}.maxPoints`),
  }
}

export function parseScorecardReport(html: string, expectedRepository: string): ScorecardReport {
  const script =
    /<script\b(?=[^>]*\btype=["']application\/json["'])(?=[^>]*\bid=["']scorecard-data["'])[^>]*>(?<json>[\s\S]*?)<\/script>/iu.exec(
      html
    )
  if (!script?.groups?.json) {
    throw new Error('Could not find scorecard-data JSON script tag.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(script.groups.json)
  } catch (error: unknown) {
    throw new Error('Could not parse scorecard-data JSON.', { cause: error })
  }

  const data = record(parsed, 'root')
  const repository = record(data.repository, 'repository')
  const reportRepository = stringValue(repository.fullName, 'repository.fullName')
  if (reportRepository.toLowerCase() !== expectedRepository.trim().toLowerCase()) {
    throw new Error(
      `Scorecard repository mismatch: report is for "${reportRepository}", current repository is "${expectedRepository}". Refusing to log or use this scorecard.`
    )
  }

  const rawClassification = record(data.classification, 'classification')
  const rules = data.rules
  if (!Array.isArray(rules)) {
    throw new Error('Scorecard report is missing rules.')
  }

  return {
    ...data,
    repository: { ...repository, fullName: reportRepository },
    classification: {
      ...rawClassification,
      level: stringValue(rawClassification.level, 'classification.level'),
      numericScore: numberValue(rawClassification.numericScore, 'classification.numericScore'),
      maxPoints: numberValue(rawClassification.maxPoints, 'classification.maxPoints'),
      bronze: tier(rawClassification.bronze, 'classification.bronze'),
      silver: tier(rawClassification.silver, 'classification.silver'),
      gold: tier(rawClassification.gold, 'classification.gold'),
    },
    rules,
  } as ScorecardReport
}

function easternTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value
  const offset = value('timeZoneName')?.replace('GMT', '')

  if (!offset) {
    throw new Error('Could not determine the US Eastern UTC offset.')
  }

  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}${offset}`
}

export function scoreHistoryLine(report: ScorecardReport, date: Date): string {
  const { classification } = report
  const summary = (name: string, value: ScorecardTier) =>
    `${name}: ${value.points}/${value.maxPoints} (${value.passed}/${value.total})`

  return [
    easternTimestamp(date),
    `${classification.numericScore}/${classification.maxPoints}`,
    classification.level,
    summary('Bronze', classification.bronze),
    summary('Silver', classification.silver),
    summary('Gold', classification.gold),
  ].join(' | ')
}

function decodeScorecard(encoded: string, expectedRepository: string): ScorecardReport {
  const html = Buffer.from(encoded.replaceAll(/\s/gu, ''), 'base64').toString('utf8')
  return parseScorecardReport(html, expectedRepository)
}

function printSummary(report: ScorecardReport): void {
  const { classification } = report
  const failing = report.rules.filter(rule => {
    const candidate = rule as { passed?: unknown }
    return candidate.passed === false
  })
  console.log(
    `${report.repository.fullName}: ${classification.numericScore}/${classification.maxPoints} ${classification.level}; ${failing.length} failing rule(s)`
  )
}

function main(): void {
  const expectedArgument = process.argv.indexOf('--expected-repository')
  const expectedRepository = process.argv[expectedArgument + 1]
  if (expectedArgument === -1 || !expectedRepository) {
    throw new Error('--expected-repository is required.')
  }

  const encoded = readFileSync(0, 'utf8')
  if (encoded.trim() === '') {
    throw new Error('Scorecard content is required on standard input.')
  }

  const report = decodeScorecard(encoded, expectedRepository)
  const historyPath = resolve('.agents/skills/scorecard/score-history.log')
  appendFileSync(historyPath, `${scoreHistoryLine(report, new Date())}\n`, 'utf8')

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report))
  } else {
    printSummary(report)
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
