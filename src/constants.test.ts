import { describe, expect, it } from 'vitest'
import { MS_PER_MINUTE, PR_MODES } from './constants'

describe('MS_PER_MINUTE', () => {
  it('equals 60000', () => {
    expect(MS_PER_MINUTE).toBe(60_000)
  })
})

describe('PR_MODES', () => {
  it('contains exactly 4 modes', () => {
    expect(PR_MODES).toHaveLength(4)
  })

  it('contains expected mode values', () => {
    expect(PR_MODES).toContain('my-prs')
    expect(PR_MODES).toContain('needs-review')
    expect(PR_MODES).toContain('recently-merged')
    expect(PR_MODES).toContain('need-a-nudge')
  })

  it('is a readonly tuple', () => {
    // TypeScript enforces this at compile time, but we can verify the values match
    const expected = ['my-prs', 'needs-review', 'recently-merged', 'need-a-nudge']
    expect([...PR_MODES]).toEqual(expected)
  })
})
