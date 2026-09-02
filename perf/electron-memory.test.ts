import { describe, expect, it } from 'vitest'
import { parseArgs } from './electron-memory'
import { evaluateRuns, MEBIBYTE, type ScenarioMetrics } from './electron-memory-model'

function scenario(totalWorkingSetMiB: number): ScenarioMetrics {
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
    processes: [],
    capturedAt: '2026-09-02T00:00:00.000Z',
  }
}

function scenarioRun(totalWorkingSetMiB: number): Record<string, ScenarioMetrics> {
  const baseline = scenario(500)
  return {
    'dashboard-warm': scenario(totalWorkingSetMiB),
    'navigation-baseline': baseline,
    'navigation-cleanup': baseline,
    'terminal-baseline': baseline,
    'terminal-cleanup': baseline,
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
})
