import type { CrapFunction } from './crap-metric'

export const CRAP_THRESHOLD = 10
export interface CrapBaseline {
  schemaVersion: 1
  threshold: 10
  sourceCommit: string
  exceptions: Record<string, number>
}
export type CrapRow = CrapFunction & { file: string }

export function validateBaseline(baseline: CrapBaseline): void {
  if (
    baseline.schemaVersion !== 1 ||
    baseline.threshold !== CRAP_THRESHOLD ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit)
  ) {
    throw new Error('Invalid CRAP baseline metadata')
  }
  if (
    !baseline.exceptions ||
    Object.values(baseline.exceptions).some(
      score => !Number.isFinite(score) || score <= CRAP_THRESHOLD
    )
  ) {
    throw new Error('Invalid CRAP baseline exceptions')
  }
}

export function compareBaseline(previous: CrapBaseline, next: CrapBaseline): void {
  validateBaseline(previous)
  validateBaseline(next)
  for (const [id, score] of Object.entries(next.exceptions)) {
    if (!(id in previous.exceptions) || score > previous.exceptions[id]) {
      throw new Error(`CRAP baseline cannot increase: ${id}`)
    }
  }
}

export function crapFailures(rows: CrapRow[], baseline: CrapBaseline): CrapRow[] {
  validateBaseline(baseline)
  return rows.filter(
    row => row.score > (baseline.exceptions[`${row.file}:${row.id}`] ?? CRAP_THRESHOLD) + 1e-10
  )
}

export function baselineFor(rows: CrapRow[], sourceCommit: string): CrapBaseline {
  return {
    schemaVersion: 1,
    threshold: CRAP_THRESHOLD,
    sourceCommit,
    exceptions: Object.fromEntries(
      rows
        .filter(row => row.score > CRAP_THRESHOLD)
        .map(row => [`${row.file}:${row.id}`, row.score])
    ),
  }
}
