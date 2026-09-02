import { describe, expect, it } from 'vitest'
import {
  aggregateProcessMemory,
  buildMedianScenario,
  evaluateAbsoluteBudgets,
  evaluateCleanupBudget,
  identifyNewRendererProcessesAsWebviews,
  median,
  MEBIBYTE,
  type ProcessMemorySample,
  type ScenarioMetrics,
} from './electron-memory-model'

function sample(overrides: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    totalWorkingSetBytes: 400 * MEBIBYTE,
    totalPrivateBytes: 300 * MEBIBYTE,
    rendererWorkingSetBytes: 200 * MEBIBYTE,
    rendererPrivateBytes: 200 * MEBIBYTE,
    v8UsedHeapBytes: 50 * MEBIBYTE,
    embedderHeapBytes: 100 * MEBIBYTE,
    domNodes: 1_000,
    documents: 10,
    eventListeners: 500,
    processes: [],
    capturedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('median', () => {
  it('returns the middle value for odd input', () => {
    expect(median([9, 1, 5])).toBe(5)
  })

  it('averages the two middle values for even input', () => {
    expect(median([4, 2, 8, 6])).toBe(5)
  })

  it('rejects empty input', () => {
    expect(() => median([])).toThrow('at least one value')
  })
})

describe('aggregateProcessMemory', () => {
  it('sums the process tree and isolates renderer and webview totals', () => {
    const processes: ProcessMemorySample[] = [
      {
        pid: 1,
        parentPid: null,
        kind: 'main',
        electronType: 'Browser',
        name: 'Buddy.exe',
        serviceName: null,
        workingSetBytes: 100,
        privateBytes: 80,
        source: 'electron',
      },
      {
        pid: 2,
        parentPid: 1,
        kind: 'renderer',
        electronType: 'Tab',
        name: null,
        serviceName: null,
        workingSetBytes: 200,
        privateBytes: 150,
        source: 'electron',
      },
      {
        pid: 3,
        parentPid: 1,
        kind: 'webview',
        electronType: 'Tab',
        name: null,
        serviceName: null,
        workingSetBytes: 50,
        privateBytes: null,
        source: 'electron',
      },
    ]

    expect(aggregateProcessMemory(processes)).toEqual({
      totalWorkingSetBytes: 350,
      totalPrivateBytes: 230,
      rendererWorkingSetBytes: 250,
      rendererPrivateBytes: 150,
    })
  })
})

describe('identifyNewRendererProcessesAsWebviews', () => {
  it('marks only renderer processes created after the browser baseline', () => {
    const existingRenderer: ProcessMemorySample = {
      pid: 1,
      parentPid: 10,
      kind: 'renderer',
      electronType: 'renderer',
      name: 'Buddy.exe',
      serviceName: null,
      workingSetBytes: 100,
      privateBytes: 80,
      source: 'os',
    }
    const guestRenderer = { ...existingRenderer, pid: 2 }
    const gpu: ProcessMemorySample = { ...existingRenderer, pid: 3, kind: 'gpu' }

    expect(
      identifyNewRendererProcessesAsWebviews(
        [existingRenderer],
        [existingRenderer, guestRenderer, gpu]
      ).map(process => [process.pid, process.kind])
    ).toEqual([
      [1, 'renderer'],
      [2, 'webview'],
      [3, 'gpu'],
    ])
  })
})

describe('memory budgets', () => {
  it('enforces the packaged absolute caps', () => {
    expect(evaluateAbsoluteBudgets(sample())).toEqual([])
    expect(
      evaluateAbsoluteBudgets(
        sample({ totalWorkingSetBytes: 606 * MEBIBYTE, rendererWorkingSetBytes: 231 * MEBIBYTE })
      ).map(failure => failure.metric)
    ).toEqual(['totalWorkingSetBytes', 'rendererWorkingSetBytes'])
  })

  it('allows cleanup metrics up to ten percent above warm baseline', () => {
    const baseline = sample()
    expect(
      evaluateCleanupBudget(
        'navigation-cleanup',
        baseline,
        sample({ totalWorkingSetBytes: baseline.totalWorkingSetBytes * 1.1 })
      )
    ).toEqual([])
    expect(
      evaluateCleanupBudget(
        'navigation-cleanup',
        baseline,
        sample({ totalWorkingSetBytes: baseline.totalWorkingSetBytes * 1.101 })
      )[0]
    ).toMatchObject({ metric: 'totalWorkingSetBytes', scenario: 'navigation-cleanup' })
  })

  it('requires a zero baseline to return to zero', () => {
    expect(
      evaluateCleanupBudget(
        'browser-cleanup',
        sample({ documents: 0 }),
        sample({ documents: 1 })
      )[0]
    ).toMatchObject({ metric: 'documents', limit: 0 })
  })
})

describe('buildMedianScenario', () => {
  it('builds per-metric medians across fresh-profile runs', () => {
    const result = buildMedianScenario([
      sample({ domNodes: 100, totalWorkingSetBytes: 300 }),
      sample({ domNodes: 300, totalWorkingSetBytes: 500 }),
      sample({ domNodes: 200, totalWorkingSetBytes: 400 }),
    ])
    expect(result.domNodes).toBe(200)
    expect(result.totalWorkingSetBytes).toBe(400)
    expect(result.runs).toBe(3)
  })
})
