import { describe, expect, it } from 'vitest'
import { formatUpdatedAge } from './orgRepoTreeUtils'

describe('formatUpdatedAge', () => {
  it('returns "updated now" for recent timestamps', () => {
    const now = Date.now()
    expect(formatUpdatedAge(now - 30_000)).toBe('updated now')
    expect(formatUpdatedAge(now)).toBe('updated now')
  })

  it('returns minutes for 1-59 minutes', () => {
    const now = Date.now()
    expect(formatUpdatedAge(now - 60_000)).toBe('updated 1m ago')
    expect(formatUpdatedAge(now - 5 * 60_000)).toBe('updated 5m ago')
    expect(formatUpdatedAge(now - 59 * 60_000)).toBe('updated 59m ago')
  })

  it('returns hours for 60+ minutes', () => {
    const now = Date.now()
    expect(formatUpdatedAge(now - 60 * 60_000)).toBe('updated 1h ago')
    expect(formatUpdatedAge(now - 90 * 60_000)).toBe('updated 1h ago')
    expect(formatUpdatedAge(now - 120 * 60_000)).toBe('updated 2h ago')
  })
})
