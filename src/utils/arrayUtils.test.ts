import { describe, expect, it } from 'vitest'
import { sumBy } from './arrayUtils'

describe('sumBy', () => {
  it('sums a numeric property', () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }]
    expect(sumBy(items, i => i.n)).toBe(6)
  })

  it('returns 0 for empty array', () => {
    expect(sumBy([], () => 1)).toBe(0)
  })

  it('works with readonly arrays', () => {
    const items = [10, 20, 30] as const
    expect(sumBy(items, n => n)).toBe(60)
  })
})
