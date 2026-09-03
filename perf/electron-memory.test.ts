import { describe, expect, it } from 'vitest'
import { parseArgs } from './electron-memory'
import {
  evaluateRuns,
  MEBIBYTE,
  type ProcessMemorySample,
  type ScenarioMetrics,
} from './electron-memory-model'
import { requireNewProcessKind } from './electron-memory-scenarios'

function scenario(
  totalWorkingSetMiB: number,
  processes: ProcessMemorySample[] = []
): ScenarioMetrics {
  return {
    totalWorkingSetBytes: totalWorkingSetMiB * MEBIBYTE,
    totalPrivateBytes: 300 * MEBIBYTE,
    rendererWorkingSetBytes: 200 * MEBIBYTE,
    rendererPrivateBytes: 150 * MEBIBYTE,
    v8UsedHeapBytes: 50 * MEBIBYTE,
    embedderHeapBytes: 100 * MEBIBYTE,
    domNodes: 1_000,
    documents: 10,
    eventListeners: 500,
    processes,
    capturedAt: '2026-09-02T00:00:00.000Z',
  }
}

function scenarioRun(totalWorkingSetMiB: number): Record<string, ScenarioMetrics> {
  const baseline = scenario(500)
  return {
    'dashboard-warm': scenario(totalWorkingSetMiB),
    'navigation-baseline': baseline,
    'navigation-cleanup': baseline,
    'terminal-first-cleanup': baseline,
    'terminal-baseline': baseline,
    'terminal-cleanup': baseline,
    'browser-first-cleanup': baseline,
    'browser-baseline': baseline,
    'browser-cleanup': baseline,
  }
}

function pairedNavigationRun(
  baselineWorkingSetMiB: number,
  cleanupWorkingSetMiB: number
): Record<string, ScenarioMetrics> {
  return {
    ...scenarioRun(500),
    'navigation-baseline': scenario(baselineWorkingSetMiB),
    'navigation-cleanup': scenario(cleanupWorkingSetMiB),
  }
}

function terminalWarmupGrowthRun(
  baselineWorkingSetMiB: number,
  postWarmupWorkingSetMiB: number
): Record<string, ScenarioMetrics> {
  const run = scenarioRun(500)
  const baseline = scenario(baselineWorkingSetMiB)
  const postWarmup = scenario(postWarmupWorkingSetMiB)
  return {
    ...run,
    'terminal-first-cleanup': baseline,
    'terminal-baseline': postWarmup,
    'terminal-cleanup': postWarmup,
    'browser-baseline': postWarmup,
    'browser-cleanup': postWarmup,
  }
}

function browserWarmupGrowthRun(
  baselineWorkingSetMiB: number,
  postWarmupWorkingSetMiB: number
): Record<string, ScenarioMetrics> {
  const run = scenarioRun(500)
  const baseline = scenario(baselineWorkingSetMiB)
  const postWarmup = scenario(postWarmupWorkingSetMiB)
  return {
    ...run,
    'browser-first-cleanup': baseline,
    'browser-baseline': postWarmup,
    'browser-cleanup': postWarmup,
  }
}

function processSample(pid: number, kind: ProcessMemorySample['kind']): ProcessMemorySample {
  return {
    pid,
    parentPid: 1,
    kind,
    electronType: null,
    name: null,
    serviceName: null,
    workingSetBytes: 1,
    privateBytes: 1,
    source: 'os',
  }
}

describe('Electron memory CLI', () => {
  it('uses the full packaged warmup by default', () => {
    expect(parseArgs([])).toMatchObject({
      mode: 'packaged',
      runs: 1,
      warmupMs: 300_000,
      navigationCycles: 3,
      budgetScale: 1,
    })
  })

  it('parses repeatable local validation options', () => {
    expect(
      parseArgs([
        '--mode',
        'development',
        '--runs',
        '3',
        '--warmup-ms',
        '0',
        '--settle-ms',
        '25',
        '--navigation-cycles',
        '2',
        '--skip-build',
        '--budget-scale',
        '0.5',
      ])
    ).toMatchObject({
      mode: 'development',
      runs: 3,
      warmupMs: 0,
      settleMs: 25,
      navigationCycles: 2,
      skipBuild: true,
      budgetScale: 0.5,
    })
  })

  it('returns null for help', () => {
    expect(parseArgs(['--help'])).toBeNull()
  })

  it('rejects unknown and malformed options', () => {
    expect(() => parseArgs(['--wat', '1'])).toThrow('Unknown option')
    expect(() => parseArgs(['--runs', '0'])).toThrow('positive integer')
    expect(() => parseArgs(['--mode', 'browser'])).toThrow('packaged or development')
  })
})

describe('Electron memory gating', () => {
  it('gates repeated profiles on median scenarios rather than one noisy run', () => {
    const result = evaluateRuns(
      'packaged',
      [scenarioRun(700), scenarioRun(500), scenarioRun(500)],
      1
    )

    expect(result.medians['dashboard-warm'].totalWorkingSetBytes).toBe(500 * MEBIBYTE)
    expect(result.failures).toEqual([])
  })

  it('preserves baseline and cleanup pairing when medianizing lifecycle ratios', () => {
    const result = evaluateRuns(
      'packaged',
      [pairedNavigationRun(100, 112), pairedNavigationRun(110, 124), pairedNavigationRun(120, 100)],
      1
    )

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'totalWorkingSetBytes',
        scenario: 'navigation-cleanup',
      })
    )
  })

  it('rejects lifecycle warmup growth above ten percent', () => {
    const run = terminalWarmupGrowthRun(100, 112)
    const result = evaluateRuns('packaged', [run, run, run], 1)

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'totalWorkingSetBytes',
        scenario: 'terminal-warmup-growth',
      })
    )
  })

  it('rejects browser warmup growth above ten percent', () => {
    const run = browserWarmupGrowthRun(100, 112)
    const result = evaluateRuns('packaged', [run, run, run], 1)

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'totalWorkingSetBytes',
        scenario: 'browser-warmup-growth',
      })
    )
  })
})

describe('Electron memory cumulative gating', () => {
  it('rejects cumulative process growth across warmup and cleanup phases', () => {
    const run = terminalWarmupGrowthRun(100, 105)
    run['terminal-cleanup'] = scenario(110.25)
    const result = evaluateRuns('packaged', [run, run, run], 1)

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'totalWorkingSetBytes',
        scenario: 'terminal-total-growth',
      })
    )
  })

  it('rejects cumulative renderer resource growth across warmup and cleanup phases', () => {
    const run = scenarioRun(500)
    run['terminal-first-cleanup'] = scenario(100)
    run['terminal-first-cleanup'].domNodes = 1_000
    run['terminal-baseline'] = scenario(100)
    run['terminal-baseline'].domNodes = 1_050
    run['terminal-cleanup'] = scenario(100)
    run['terminal-cleanup'].domNodes = 1_103
    const result = evaluateRuns('packaged', [run, run, run], 1)

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        metric: 'domNodes',
        scenario: 'terminal-total-growth',
      })
    )
  })

  it('gates cumulative browser listeners beyond the measured Electron teardown cost', () => {
    const measuredRun = scenarioRun(500)
    measuredRun['browser-first-cleanup'] = scenario(500)
    measuredRun['browser-first-cleanup'].eventListeners = 256
    measuredRun['browser-baseline'] = scenario(500)
    measuredRun['browser-baseline'].eventListeners = 268
    measuredRun['browser-cleanup'] = scenario(500)
    measuredRun['browser-cleanup'].eventListeners = 286

    const measuredResult = evaluateRuns('packaged', [measuredRun, measuredRun, measuredRun], 1)
    expect(
      measuredResult.failures.filter(
        failure =>
          failure.scenario === 'browser-total-growth' && failure.metric === 'eventListeners'
      )
    ).toEqual([])

    const regressedRun = structuredClone(measuredRun)
    regressedRun['browser-cleanup'].eventListeners = 287
    const regressedResult = evaluateRuns('packaged', [regressedRun, regressedRun, regressedRun], 1)
    expect(regressedResult.failures).toContainEqual(
      expect.objectContaining({
        metric: 'eventListeners',
        scenario: 'browser-total-growth',
      })
    )
  })

  it('allows stable cleanup after one-time lifecycle initialization', () => {
    const run = scenarioRun(500)
    run['navigation-cleanup'] = scenario(100)
    run['terminal-first-cleanup'] = scenario(113)
    run['terminal-baseline'] = scenario(113)
    run['terminal-cleanup'] = scenario(113)
    const result = evaluateRuns('packaged', [run, run, run], 1)

    expect(result.failures.filter(failure => failure.scenario.startsWith('terminal-'))).toEqual([])
  })
})

describe('Electron memory process evidence', () => {
  it('rejects a required process kind that already existed at baseline', () => {
    const existing = processSample(7, 'spawned-child')
    expect(() =>
      requireNewProcessKind(
        'terminal-open',
        scenario(500, [existing]),
        scenario(500, [existing]),
        'spawned-child'
      )
    ).toThrow('terminal-open did not observe a new spawned-child process')
  })

  it('accepts a newly observed process of the required kind', () => {
    const existing = processSample(7, 'spawned-child')
    const created = processSample(8, 'spawned-child')
    expect(() =>
      requireNewProcessKind(
        'terminal-open',
        scenario(500, [existing]),
        scenario(500, [existing, created]),
        'spawned-child'
      )
    ).not.toThrow()
  })

  it('rejects scenarios that never create their required process kind', () => {
    expect(() =>
      requireNewProcessKind('terminal-open', scenario(500), scenario(500), 'spawned-child')
    ).toThrow('terminal-open did not observe a new spawned-child process')
  })
})
