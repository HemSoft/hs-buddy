import { describe, expect, it } from 'vitest'
import { parseArgs } from './electron-memory'

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
