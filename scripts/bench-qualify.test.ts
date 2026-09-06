import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CI_REGRESSION_THRESHOLD, CI_SAMPLE_COUNT, qualifyBenchmarks } from './bench-qualify'
import type { BenchmarkOutput, BenchmarkResult } from './bench-compare'

function samples(rates: number[], rme = 1): BenchmarkOutput[] {
  return rates.map(hz => ({
    files: [
      {
        filepath: 'src/example.bench.ts',
        groups: [
          {
            fullName: 'src/example.bench.ts > suite',
            benchmarks: [
              {
                id: '0',
                name: 'operation',
                hz,
                rme,
                rank: 1,
                mean: 1 / hz,
                min: 1 / hz,
                max: 1 / hz,
                p75: 1 / hz,
                p99: 1 / hz,
                p995: 1 / hz,
                p999: 1 / hz,
                sampleCount: 1000,
                median: 1 / hz,
              } satisfies BenchmarkResult,
            ],
          },
        ],
      },
    ],
  }))
}

describe('pre-merge benchmark qualification', () => {
  it.each([
    ['enforce', 100, ['Runtime changed'], 0],
    ['enforce', 50, ['Runtime changed'], 1],
    ['advisory', 50, ['Benchmark definition changed'], 0],
    ['advisory', 50, [], 1],
  ])('CLI policy %s with throughput %s exits correctly', (mode, hz, reasons, expected) => {
    const directory = mkdtempSync(join(tmpdir(), 'bench-gate-test-'))
    try {
      for (const [prefix, runs] of [
        ['bench-baseline', samples([100, 100, 100])],
        ['bench-results', samples([hz, hz, hz])],
      ] as const) {
        runs.forEach((run, index) =>
          writeFileSync(join(directory, `${prefix}-run-${index + 1}.json`), JSON.stringify(run))
        )
      }
      writeFileSync(join(directory, 'bench-policy.json'), JSON.stringify({ mode, reasons }))
      const summaryPath = join(directory, 'step-summary.md')
      const result = spawnSync('bun', [resolve('scripts/bench-qualify.ts')], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
      })
      expect(result.status, result.stderr).toBe(expected)
      expect(readFileSync(summaryPath, 'utf8')).toBe(
        readFileSync(join(directory, 'bench-summary.md'), 'utf8')
      )
    } finally {
      rmSync(directory, { recursive: true })
    }
  })
  it('keeps three-run medians and the maintained 20 percent threshold', () => {
    expect(CI_SAMPLE_COUNT).toBe(3)
    expect(CI_REGRESSION_THRESHOLD).toBe(20)
    const { result } = qualifyBenchmarks(samples([100, 100, 1000]), samples([99, 99, 1]))
    expect(result.passed).toBe(true)
    expect(result.entries[0].changePercent).toBe(-1)
  })
  it('rejects a controlled slowdown before merge', () => {
    expect(qualifyBenchmarks(samples([100, 101, 99]), samples([50, 51, 49])).result.passed).toBe(
      false
    )
  })
  it('requires both a threshold crossing and nonoverlapping uncertainty bounds', () => {
    expect(qualifyBenchmarks(samples([100, 100, 100]), samples([80, 80, 80])).result.passed).toBe(
      true
    )
    expect(qualifyBenchmarks(samples([100, 100, 100]), samples([79, 79, 79])).result.passed).toBe(
      false
    )
    expect(
      qualifyBenchmarks(samples([100, 100, 100], 30), samples([79, 79, 79], 30)).result.passed
    ).toBe(true)
  })
  it.each([0, 1, 2, 4])('rejects %s samples', count => {
    expect(() =>
      qualifyBenchmarks(samples(Array.from({ length: count }, () => 100)), samples([100, 100, 100]))
    ).toThrow('Expected 3')
  })
  it.each([0, -1, NaN, Infinity])('rejects invalid throughput %s', hz => {
    expect(() => qualifyBenchmarks(samples([100, 100, 100]), samples([hz, hz, hz]))).toThrow(
      'invalid'
    )
  })
  it('rejects empty, mismatched, and malformed evidence', () => {
    expect(() =>
      qualifyBenchmarks([{ files: [] }, { files: [] }, { files: [] }], samples([100, 100, 100]))
    ).toThrow('Missing')
    const runs = samples([100, 100, 100])
    runs[1].files[0].groups[0].benchmarks[0].name = 'different'
    expect(() => qualifyBenchmarks(runs, samples([100, 100, 100]))).toThrow(/missing|unexpected/)
    expect(() =>
      qualifyBenchmarks(samples([100, 100, 100]), samples([100, 100, 100], NaN))
    ).toThrow('invalid')
  })
})
