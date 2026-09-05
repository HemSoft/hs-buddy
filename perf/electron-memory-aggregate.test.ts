import { describe, expect, it } from 'vitest'
import baseline from './electron-memory-baseline.json'
import { parseArgs, type HarnessResult } from './electron-memory'
import { aggregateSamples } from './electron-memory-aggregate'
import { evaluateRuns, MEBIBYTE } from './electron-memory-model'

function samples(): HarnessResult[] {
  return ['1', '2', '3'].map(sampleId => ({
    schema: 1,
    capturedAt: baseline.capturedAt,
    platform: 'win32',
    architecture: 'x64',
    sourceRevision: 'reviewed-revision',
    sampleId,
    runnerImage: 'windows-image-1',
    options: parseArgs(['--collect-only'])!,
    budgets: {
      ...baseline.budgets,
      absoluteScenario: 'dashboard-warm',
      cleanupMetrics: [
        'totalWorkingSetBytes',
        'rendererWorkingSetBytes',
        'domNodes',
        'documents',
        'eventListeners',
      ],
    },
    runs: [
      {
        run: 1,
        mode: 'packaged',
        electronVersion: '44.0.0',
        appVersion: '1.0.0',
        profilePath: `isolated-${sampleId}`,
        observedProcessKinds: [],
        scenarios: Object.fromEntries(
          Object.entries(baseline.medians).map(([name, metrics]) => [
            name,
            { ...metrics, processes: [], capturedAt: baseline.capturedAt },
          ])
        ),
      },
    ],
    medians: {},
    failures: [],
    status: 'pass',
  }))
}

describe('parallel Electron memory qualification', () => {
  it('preserves the serial median and paired cleanup evaluation despite one noisy runner', () => {
    const input = samples()
    input[0].runs[0].scenarios['dashboard-warm'].totalWorkingSetBytes = 900 * MEBIBYTE
    input[0].status = 'fail'
    const parallel = aggregateSamples(input, 'reviewed-revision')
    expect(parallel).toMatchObject(
      evaluateRuns(
        'packaged',
        input.map(sample => sample.runs[0].scenarios),
        1
      )
    )
    expect(parallel.status).toBe('pass')
  })
  it('rejects a real median memory regression', () => {
    const input = samples()
    for (const sample of input.slice(0, 2)) {
      sample.runs[0].scenarios['dashboard-warm'].totalWorkingSetBytes = 900 * MEBIBYTE
    }
    expect(aggregateSamples(input, 'reviewed-revision').status).toBe('fail')
  })
  it('rejects a repeated lifecycle growth regression', () => {
    const input = samples()
    for (const sample of input) sample.runs[0].scenarios['browser-cleanup'].eventListeners = 10000
    expect(aggregateSamples(input, 'reviewed-revision').failures).toContainEqual(
      expect.objectContaining({ scenario: 'browser-cleanup', metric: 'eventListeners' })
    )
  })
  it('rejects missing, duplicate, extra, and stale samples', () => {
    const input = samples()
    expect(() => aggregateSamples(input.slice(0, 2), 'reviewed-revision')).toThrow('Exactly three')
    expect(() => aggregateSamples([...input, input[0]], 'reviewed-revision')).toThrow(
      'Exactly three'
    )
    expect(() => aggregateSamples([input[0], input[0], input[2]], 'reviewed-revision')).toThrow(
      'distinct'
    )
    expect(() => aggregateSamples(input, 'new-revision')).toThrow('current revision')
    expect(() => aggregateSamples(input, '')).toThrow('current revision')
  })
  it.each([
    (sample: HarnessResult) => {
      sample.options.warmupMs = 0
    },
    (sample: HarnessResult) => {
      sample.options.settleMs = 0
    },
    (sample: HarnessResult) => {
      sample.options.navigationCycles = 1
    },
    (sample: HarnessResult) => {
      sample.options.budgetScale = 2
    },
    (sample: HarnessResult) => {
      sample.platform = 'linux'
    },
    (sample: HarnessResult) => {
      sample.runs[0].mode = 'development'
    },
    (sample: HarnessResult) => {
      sample.runs[0].electronVersion = '45.0.0'
    },
    (sample: HarnessResult) => {
      sample.runnerImage = 'other-image'
    },
    (sample: HarnessResult) => {
      delete sample.runs[0].scenarios['dashboard-warm']
    },
    (sample: HarnessResult) => {
      sample.runs[0].scenarios['browser-cleanup'].domNodes = Number.NaN
    },
    (sample: HarnessResult) => {
      sample.runs[0].scenarios['browser-cleanup'].eventListeners = -1
    },
  ])('rejects altered protocol, environments, and invalid evidence', mutate => {
    const input = samples()
    mutate(input[0])
    expect(() => aggregateSamples(input, 'reviewed-revision')).toThrow()
  })
})
