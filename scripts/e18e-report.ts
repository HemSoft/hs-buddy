interface E18eMessage {
  message: string
  severity: 'error' | 'warning' | 'suggestion'
  score: number
}

interface E18eReport {
  messages: E18eMessage[]
  duplicateCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateStats(value: unknown, expected: { name: string; version: string }): number {
  if (!isRecord(value) || value.name !== expected.name || value.version !== expected.version) {
    throw new Error('e18e report package identity does not match this checkout')
  }
  const counts = value.dependencyCount
  if (!isRecord(counts) || !isCount(counts.production) || !isCount(counts.development)) {
    throw new Error('e18e report is missing valid dependency counts')
  }
  return validateDuplicateCount(value.extraStats)
}

function validateDuplicateCount(value: unknown): number {
  if (!Array.isArray(value)) throw new Error('e18e report is missing analysis statistics')
  const duplicates = value.filter(
    stat => isRecord(stat) && stat.name === 'duplicateDependencyCount'
  )
  if (duplicates.length !== 1 || !isRecord(duplicates[0]) || !isCount(duplicates[0].value)) {
    throw new Error('e18e report is missing a unique valid duplicate dependency count')
  }
  return duplicates[0].value
}

function validateMessage(value: unknown): E18eMessage {
  if (!isRecord(value) || typeof value.message !== 'string' || value.message.trim() === '') {
    throw new Error('e18e report contains an invalid message')
  }
  const severity = value.severity
  if (severity !== 'error' && severity !== 'warning' && severity !== 'suggestion') {
    throw new Error('e18e report contains an unknown message severity')
  }
  if (typeof value.score !== 'number' || !Number.isFinite(value.score)) {
    throw new Error('e18e report contains an invalid message score')
  }
  return { message: value.message, severity, score: value.score }
}

export function parseE18eReport(
  output: string,
  expected: { name: string; version: string }
): E18eReport {
  let report: unknown
  try {
    report = JSON.parse(output)
  } catch (error: unknown) {
    throw new Error('e18e analyzer did not produce valid JSON', { cause: error })
  }
  if (!isRecord(report) || !Array.isArray(report.messages)) {
    throw new Error('e18e report is missing its messages array')
  }
  return {
    duplicateCount: validateStats(report.stats, expected),
    messages: report.messages.map(validateMessage),
  }
}

export function requireSuccessfulAnalyzer(result: {
  status: number | null
  signal: string | null
  error?: Error
}): void {
  if (result.error) {
    throw new Error(`Could not run e18e analyzer: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0 || result.signal) {
    throw new Error(`e18e analyzer failed: exit=${result.status}, signal=${result.signal}`)
  }
}
