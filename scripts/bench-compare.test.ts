import { describe, it, expect } from 'vitest'
import {
  compareBenchmarks,
  parseBenchOutput,
  buildBenchmarkKey,
  normalizeFilepath,
  isValidBenchOutput,
  formatResults,
  type BenchmarkOutput,
  type BenchmarkGroup,
  type BenchmarkResult,
} from './bench-compare'

function makeBench(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    id: 'test_0_0',
    name: 'test bench',
    rank: 1,
    hz: 1_000_000,
    mean: 0.001,
    min: 0.0005,
    max: 0.002,
    p75: 0.0012,
    p99: 0.0018,
    p995: 0.0019,
    p999: 0.002,
    rme: 2.5,
    sampleCount: 100_000,
    median: 0.001,
    ...overrides,
  }
}

function makeOutput(
  groups: Array<{ fullName: string; benchmarks: BenchmarkResult[] }>
): BenchmarkOutput {
  return {
    files: [
      {
        filepath: 'src/utils/test.bench.ts',
        groups: groups.map(g => ({ fullName: g.fullName, benchmarks: g.benchmarks })),
      },
    ],
  }
}

describe('normalizeFilepath', () => {
  it('extracts relative path from absolute Windows path', () => {
    expect(normalizeFilepath('D:/github/project/src/utils/test.bench.ts')).toBe(
      'src/utils/test.bench.ts'
    )
  })

  it('extracts relative path from absolute Unix path', () => {
    expect(normalizeFilepath('/home/user/project/src/services/api.bench.ts')).toBe(
      'src/services/api.bench.ts'
    )
  })

  it('handles electron paths', () => {
    expect(normalizeFilepath('D:/project/electron/ipc/handler.bench.ts')).toBe(
      'electron/ipc/handler.bench.ts'
    )
  })

  it('returns relative path as-is', () => {
    expect(normalizeFilepath('src/utils/test.bench.ts')).toBe('src/utils/test.bench.ts')
  })

  it('handles backslashes', () => {
    expect(normalizeFilepath('D:\\project\\src\\utils\\test.bench.ts')).toBe(
      'src/utils/test.bench.ts'
    )
  })

  it('handles perf/ paths', () => {
    expect(normalizeFilepath('D:/github/project/perf/ipc-throughput.bench.ts')).toBe(
      'perf/ipc-throughput.bench.ts'
    )
  })

  it('handles scripts/ paths', () => {
    expect(normalizeFilepath('/home/user/project/scripts/bench-compare.ts')).toBe(
      'scripts/bench-compare.ts'
    )
  })
})

describe('buildBenchmarkKey', () => {
  it('creates composite key from group fullName and bench name', () => {
    const group: BenchmarkGroup = {
      fullName: 'src/utils/test.bench.ts > mySuite',
      benchmarks: [],
    }
    const bench = makeBench({ name: 'fast operation' })
    expect(buildBenchmarkKey(group, bench)).toBe(
      'src/utils/test.bench.ts > mySuite > fast operation'
    )
  })
})

describe('parseBenchOutput', () => {
  it('builds map with composite keys', () => {
    const output = makeOutput([
      {
        fullName: 'src/utils/test.bench.ts > suite1',
        benchmarks: [makeBench({ name: 'bench A', hz: 500_000 })],
      },
      {
        fullName: 'src/utils/test.bench.ts > suite2',
        benchmarks: [makeBench({ name: 'bench A', hz: 800_000 })],
      },
    ])

    const map = parseBenchOutput(output)
    expect(map.size).toBe(2)
    expect(map.get('src/utils/test.bench.ts > suite1 > bench A')?.hz).toBe(500_000)
    expect(map.get('src/utils/test.bench.ts > suite2 > bench A')?.hz).toBe(800_000)
  })

  it('handles multiple files', () => {
    const output: BenchmarkOutput = {
      files: [
        {
          filepath: 'src/a.bench.ts',
          groups: [
            {
              fullName: 'src/a.bench.ts > suiteA',
              benchmarks: [makeBench({ name: 'x' })],
            },
          ],
        },
        {
          filepath: 'src/b.bench.ts',
          groups: [
            {
              fullName: 'src/b.bench.ts > suiteB',
              benchmarks: [makeBench({ name: 'x' })],
            },
          ],
        },
      ],
    }

    const map = parseBenchOutput(output)
    expect(map.size).toBe(2)
  })
})

describe('compareBenchmarks', () => {
  it('passes when no regression exceeds threshold', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 950_000 })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].changePercent).toBeCloseTo(-5, 0)
  })

  it('fails when regression exceeds threshold', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 700_000 })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(false)
    expect(result.entries[0].passed).toBe(false)
    expect(result.entries[0].changePercent).toBeCloseTo(-30, 0)
  })

  it('passes when performance improves', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 2_000_000 })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.entries[0].changePercent).toBeCloseTo(100, 0)
  })

  it('identifies new benchmarks (in current but not baseline)', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'existing' })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'existing' }), makeBench({ name: 'new one' })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.newBenchmarks).toHaveLength(1)
    expect(result.newBenchmarks[0]).toContain('new one')
  })

  it('identifies removed benchmarks (in baseline but not current)', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'kept' }), makeBench({ name: 'removed' })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'kept' })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.removedBenchmarks).toHaveLength(1)
    expect(result.removedBenchmarks[0]).toContain('removed')
  })

  it('handles zero baseline hz gracefully', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 0 })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1000 })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.entries[0].changePercent).toBe(0)
  })

  it('uses custom threshold', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
      },
    ])
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 880_000 })],
      },
    ])

    // 12% regression, 10% threshold → fail
    expect(compareBenchmarks(baseline, current, 10).passed).toBe(false)
    // 12% regression, 15% threshold → pass
    expect(compareBenchmarks(baseline, current, 15).passed).toBe(true)
  })

  it('handles empty files array', () => {
    const baseline: BenchmarkOutput = { files: [] }
    const current: BenchmarkOutput = { files: [] }

    const result = compareBenchmarks(baseline, current, 15)
    expect(result.passed).toBe(true)
    expect(result.entries).toHaveLength(0)
  })

  it('regression exactly at threshold boundary passes', () => {
    const baseline = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
      },
    ])
    // Exactly 15% regression: 1_000_000 * 0.85 = 850_000
    const current = makeOutput([
      {
        fullName: 'file > suite',
        benchmarks: [makeBench({ name: 'op', hz: 850_000 })],
      },
    ])

    const result = compareBenchmarks(baseline, current, 15)
    // -15% change, threshold is -15%, so >= -15 is true
    expect(result.passed).toBe(true)
  })
})

describe('isValidBenchOutput', () => {
  it('accepts valid output', () => {
    const valid = makeOutput([{ fullName: 'file > suite', benchmarks: [makeBench()] }])
    expect(isValidBenchOutput(valid)).toBe(true)
  })

  it('rejects null', () => {
    expect(isValidBenchOutput(null)).toBe(false)
  })

  it('rejects missing files array', () => {
    expect(isValidBenchOutput({})).toBe(false)
  })

  it('rejects file without filepath', () => {
    expect(isValidBenchOutput({ files: [{ groups: [] }] })).toBe(false)
  })

  it('rejects group without fullName', () => {
    expect(isValidBenchOutput({ files: [{ filepath: 'x', groups: [{ benchmarks: [] }] }] })).toBe(
      false
    )
  })

  it('rejects benchmark without name', () => {
    expect(
      isValidBenchOutput({
        files: [{ filepath: 'x', groups: [{ fullName: 'y', benchmarks: [{ hz: 1 }] }] }],
      })
    ).toBe(false)
  })

  it('rejects benchmark without hz', () => {
    expect(
      isValidBenchOutput({
        files: [{ filepath: 'x', groups: [{ fullName: 'y', benchmarks: [{ name: 'z' }] }] }],
      })
    ).toBe(false)
  })

  it('rejects benchmark without rme', () => {
    expect(
      isValidBenchOutput({
        files: [
          { filepath: 'x', groups: [{ fullName: 'y', benchmarks: [{ name: 'z', hz: 100 }] }] },
        ],
      })
    ).toBe(false)
  })
})

describe('formatResults', () => {
  it('produces readable markdown output', () => {
    const result = compareBenchmarks(
      makeOutput([
        {
          fullName: 'file > suite',
          benchmarks: [
            makeBench({ name: 'fast op', hz: 5_000_000, rme: 1.5 }),
            makeBench({ name: 'slow op', hz: 100_000, rme: 3.2 }),
          ],
        },
      ]),
      makeOutput([
        {
          fullName: 'file > suite',
          benchmarks: [
            makeBench({ name: 'fast op', hz: 4_800_000, rme: 1.8 }),
            makeBench({ name: 'slow op', hz: 60_000, rme: 4.1 }),
          ],
        },
      ]),
      15
    )

    const formatted = formatResults(result)
    expect(formatted).toContain('Benchmark Comparison')
    expect(formatted).toContain('fast op')
    expect(formatted).toContain('slow op')
    expect(formatted).toContain('❌')
    expect(formatted).toContain('FAILED')
  })

  it('shows PASSED when all benchmarks pass', () => {
    const result = compareBenchmarks(
      makeOutput([
        {
          fullName: 'file > suite',
          benchmarks: [makeBench({ name: 'op', hz: 1_000_000 })],
        },
      ]),
      makeOutput([
        {
          fullName: 'file > suite',
          benchmarks: [makeBench({ name: 'op', hz: 990_000 })],
        },
      ]),
      15
    )

    const formatted = formatResults(result)
    expect(formatted).toContain('PASSED')
    expect(formatted).not.toContain('FAILED')
  })
})
