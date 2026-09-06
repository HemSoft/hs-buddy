import { describe, expect, it } from 'vitest'
import { baselineFor, compareBaseline, crapFailures, type CrapRow } from './crap-policy'

const commit = 'a'.repeat(40)
const row: CrapRow = {
  file: 'src/fixture.ts',
  id: 'function:0',
  name: 'fixture',
  line: 1,
  complexity: 5,
  coverage: 0,
  covered: 0,
  total: 2,
  coverageKind: 'branches',
  score: 30,
}

describe('CRAP non-regression policy', () => {
  it('fails a new uncovered function with its name and score', () => {
    expect(crapFailures([row], baselineFor([], commit))).toEqual([row])
  })
  it('permits unchanged accepted debt and rejects coverage regressions', () => {
    const baseline = baselineFor([row], commit)
    expect(crapFailures([row], baseline)).toEqual([])
    expect(crapFailures([{ ...row, score: 31 }], baseline)).toHaveLength(1)
  })
  it('cannot silently add exceptions or raise existing scores', () => {
    const previous = baselineFor([row], commit)
    expect(() => compareBaseline(previous, baselineFor([{ ...row, score: 31 }], commit))).toThrow(
      'cannot increase'
    )
    expect(() => compareBaseline(previous, baselineFor([{ ...row, id: 'new' }], commit))).toThrow(
      'cannot increase'
    )
  })
  it('requires deleted functions to lose their exceptions before restored code is checked', () => {
    const previous = baselineFor([row], commit)
    expect(() => crapFailures([], previous)).toThrow('Stale CRAP baseline exception')
    const pruned = baselineFor([], commit)
    expect(() => compareBaseline(previous, pruned)).not.toThrow()
    expect(crapFailures([], pruned)).toEqual([])
    expect(crapFailures([row], pruned)).toEqual([row])
    expect(() => compareBaseline(pruned, previous)).toThrow('cannot increase')
  })
  it('allows only a ratchet down and keeps threshold 10 fixed', () => {
    const previous = baselineFor([row], commit)
    expect(() =>
      compareBaseline(previous, baselineFor([{ ...row, score: 15 }], commit))
    ).not.toThrow()
    expect(() => compareBaseline(previous, baselineFor([], commit))).not.toThrow()
    expect(() =>
      crapFailures([], { ...previous, threshold: 30 } as unknown as typeof previous)
    ).toThrow('Invalid CRAP baseline')
  })
})
