import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import {
  compareBenchmarks,
  formatResults,
  isValidBenchOutput,
  parseBenchOutput,
  type BenchmarkOutput,
} from './bench-compare'
import { buildMedianBenchmarkOutput } from './bench-median'

export const CI_SAMPLE_COUNT = 3
export const CI_REGRESSION_THRESHOLD = 20

function validateSamples(runs: BenchmarkOutput[]) {
  if (runs.length !== CI_SAMPLE_COUNT)
    throw new Error(`Expected ${CI_SAMPLE_COUNT} benchmark samples per revision`)
  for (const run of runs) {
    if (!isValidBenchOutput(run)) throw new Error('Invalid benchmark output')
    const values = [...parseBenchOutput(run).values()]
    if (
      !values.length ||
      values.some(
        value =>
          !Number.isFinite(value.hz) ||
          value.hz <= 0 ||
          !Number.isFinite(value.rme) ||
          value.rme < 0 ||
          value.rme >= 100
      )
    )
      throw new Error('Missing or invalid benchmark measurements')
  }
}

export function qualifyBenchmarks(baseRuns: BenchmarkOutput[], candidateRuns: BenchmarkOutput[]) {
  validateSamples(baseRuns)
  validateSamples(candidateRuns)
  const baseline = buildMedianBenchmarkOutput(baseRuns)
  const candidate = buildMedianBenchmarkOutput(candidateRuns)
  const result = compareBenchmarks(baseline, candidate, CI_REGRESSION_THRESHOLD)
  // Reject only drops beyond the maintained floor and both reported uncertainty bounds.
  const base = parseBenchOutput(baseline)
  for (const entry of result.entries) {
    const baselineLower = entry.baselineHz / (1 + base.get(entry.key)!.rme / 100)
    const candidateUpper = entry.currentHz / (1 - entry.rme / 100)
    entry.passed ||= candidateUpper >= baselineLower
  }
  result.passed = result.entries.every(entry => entry.passed)
  return { baseline, candidate, result }
}

if (import.meta.main) {
  try {
    const load = (prefix: string) =>
      Array.from(
        { length: CI_SAMPLE_COUNT },
        (_, index) =>
          JSON.parse(readFileSync(`${prefix}-run-${index + 1}.json`, 'utf8')) as BenchmarkOutput
      )
    const { baseline, candidate, result } = qualifyBenchmarks(
      load('bench-baseline'),
      load('bench-results')
    )
    writeFileSync('bench-baseline.json', JSON.stringify(baseline, null, 2) + '\n')
    writeFileSync('bench-results.json', JSON.stringify(candidate, null, 2) + '\n')
    const policy = JSON.parse(readFileSync('bench-policy.json', 'utf8')) as {
      mode: string
      reasons: string[]
    }
    if (!['enforce', 'advisory'].includes(policy.mode)) throw new Error('Invalid comparison policy')
    if (
      !Array.isArray(policy.reasons) ||
      !policy.reasons.length ||
      policy.reasons.some(reason => typeof reason !== 'string' || !reason.trim())
    )
      throw new Error('Missing comparison policy reason')
    if (
      policy.mode === 'enforce' &&
      (result.newBenchmarks.length || result.removedBenchmarks.length)
    )
      throw new Error('Benchmark set changed without an advisory harness policy')
    const comparison = result.entries.length
      ? formatResults(result)
      : `## Benchmark comparison unavailable\n\nNo matching benchmark identities; ${result.newBenchmarks.length} new and ${result.removedBenchmarks.length} removed. Both measured revisions are retained for this advisory run.`
    const summary = `${comparison}\n\nDecision uses ${CI_SAMPLE_COUNT}-run medians, a >${CI_REGRESSION_THRESHOLD}% throughput drop, and nonoverlapping reported uncertainty bounds.\n\nGate: ${policy.mode}. ${policy.reasons.join('; ')}\n`
    console.log(summary)
    writeFileSync('bench-summary.md', summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    if (!result.passed && policy.mode === 'enforce') process.exitCode = 1
  } catch (error: unknown) {
    const summary = `Benchmark qualification failed: ${error instanceof Error ? error.message : String(error)}\n`
    console.error(summary)
    writeFileSync('bench-summary.md', summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    process.exitCode = 1
  }
}
