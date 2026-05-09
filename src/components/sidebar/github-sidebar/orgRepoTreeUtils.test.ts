import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatUpdatedAge } from './orgRepoTreeUtils'

describe('formatUpdatedAge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "updated now" for less than a minute ago', () => {
    vi.setSystemTime(new Date('2026-06-01T12:00:30Z'))
    expect(formatUpdatedAge(new Date('2026-06-01T12:00:00Z').getTime())).toBe('updated now')
  })

  it('returns minutes for less than an hour ago', () => {
    vi.setSystemTime(new Date('2026-06-01T12:05:00Z'))
    expect(formatUpdatedAge(new Date('2026-06-01T12:00:00Z').getTime())).toBe('updated 5m ago')
  })

  it('returns hours for more than an hour ago', () => {
    vi.setSystemTime(new Date('2026-06-01T14:00:00Z'))
    expect(formatUpdatedAge(new Date('2026-06-01T12:00:00Z').getTime())).toBe('updated 2h ago')
  })

  it('returns 59m for just under an hour', () => {
    vi.setSystemTime(new Date('2026-06-01T12:59:59Z'))
    expect(formatUpdatedAge(new Date('2026-06-01T12:00:00Z').getTime())).toBe('updated 59m ago')
  })

  it('returns 1h for exactly 60 minutes', () => {
    vi.setSystemTime(new Date('2026-06-01T13:00:00Z'))
    expect(formatUpdatedAge(new Date('2026-06-01T12:00:00Z').getTime())).toBe('updated 1h ago')
  })
})
