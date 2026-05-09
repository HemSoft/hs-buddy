import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatUpdatedAge } from './orgRepoTreeUtils'

describe('formatUpdatedAge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns "updated now" when less than one minute has elapsed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(30_000)
    expect(formatUpdatedAge(0)).toBe('updated now')
  })

  it('returns "updated now" when exactly zero ms elapsed', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    expect(formatUpdatedAge(1000)).toBe('updated now')
  })

  it('returns minutes when elapsed is between 1 and 59 minutes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5 * 60_000)
    expect(formatUpdatedAge(0)).toBe('updated 5m ago')
  })

  it('returns "updated 1m ago" at exactly one minute', () => {
    vi.spyOn(Date, 'now').mockReturnValue(60_000)
    expect(formatUpdatedAge(0)).toBe('updated 1m ago')
  })

  it('returns "updated 59m ago" at 59 minutes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(59 * 60_000)
    expect(formatUpdatedAge(0)).toBe('updated 59m ago')
  })

  it('returns hours when elapsed is 60 minutes or more', () => {
    vi.spyOn(Date, 'now').mockReturnValue(60 * 60_000)
    expect(formatUpdatedAge(0)).toBe('updated 1h ago')
  })

  it('returns multiple hours', () => {
    vi.spyOn(Date, 'now').mockReturnValue(3 * 60 * 60_000)
    expect(formatUpdatedAge(0)).toBe('updated 3h ago')
  })

  it('floors partial hours', () => {
    // 90 minutes = 1.5 hours → floors to 1h
    vi.spyOn(Date, 'now').mockReturnValue(90 * 60_000)
    expect(formatUpdatedAge(0)).toBe('updated 1h ago')
  })
})
