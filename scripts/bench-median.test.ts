import { describe, expect, it } from 'vitest'
import { buildMedianBenchmarkOutput } from './bench-median'
import type { BenchmarkOutput, BenchmarkResult } from './bench-compare'

function makeBench(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    id: 'test_0_0',
    name: 'test bench',
    rank: 1,
    hz: 100,
    mean: 0.01,
    min: 0.005,
    max: 0.02,
    p75: 0.012,
    p99: 0.018,
    p995: 0.019,
    p999: 0.02,
    rme: 2.5,
    sampleCount: 100,
    median: 0.01,
    ...overrides,
  }
}

function makeOutput(bench: BenchmarkResult, name = 'test bench'): BenchmarkOutput {
  return {
    files: [
      {
        filepath: 'src/utils/test.bench.ts',
        groups: [
          {
            fullName: 'src/utils/test.bench.ts > suite',
            benchmarks: [{ ...bench, name }],
          },
        ],
      },
    ],
  }
}

describe('buildMedianBenchmarkOutput', () => {
  it('uses median numeric values across odd-numbered compatible runs', () => {
    const result = buildMedianBenchmarkOutput([
      makeOutput(makeBench({ hz: 100, rme: 3, sampleCount: 10 })),
      makeOutput(makeBench({ hz: 130, rme: 1, sampleCount: 30 })),
      makeOutput(makeBench({ hz: 120, rme: 2, sampleCount: 20 })),
    ])

    const bench = result.files[0].groups[0].benchmarks[0]
    expect(bench.hz).toBe(120)
    expect(bench.rme).toBe(2)
    expect(bench.sampleCount).toBe(20)
  })

  it('averages the two middle values for even-numbered runs', () => {
    const result = buildMedianBenchmarkOutput([
      makeOutput(makeBench({ hz: 100 })),
      makeOutput(makeBench({ hz: 120 })),
      makeOutput(makeBench({ hz: 140 })),
      makeOutput(makeBench({ hz: 160 })),
    ])

    expect(result.files[0].groups[0].benchmarks[0].hz).toBe(130)
  })

  it('rejects incompatible benchmark sets', () => {
    expect(() =>
      buildMedianBenchmarkOutput([
        makeOutput(makeBench(), 'test bench'),
        makeOutput(makeBench(), 'different bench'),
      ])
    ).toThrow(/missing benchmark|unexpected benchmark/)
  })

  it('keeps the latest duplicate benchmark key to match bench-compare behavior', () => {
    const result = buildMedianBenchmarkOutput([
      {
        files: [
          {
            filepath: 'src/utils/test.bench.ts',
            groups: [
              {
                fullName: 'src/utils/test.bench.ts > suite',
                benchmarks: [makeBench({ hz: 100 }), makeBench({ hz: 200 })],
              },
            ],
          },
        ],
      },
    ])

    expect(result.files[0].groups[0].benchmarks[1].hz).toBe(200)
  })

  it('requires at least one run', () => {
    expect(() => buildMedianBenchmarkOutput([])).toThrow(/At least one benchmark run/)
  })
})
