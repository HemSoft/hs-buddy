import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatUpdatedAge } from './orgRepoTreeUtils'

describe('formatUpdatedAge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "updated now" for less than a minute ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:30.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated now')
  })

  it('returns minutes ago for < 60 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:05:00.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 5m ago')
  })

  it('returns hours ago for >= 60 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T14:00:00.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 2h ago')
  })

  it('floors partial minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:03:45.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 3m ago')
  })

  it('floors partial hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T14:30:00.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 2h ago')
  })

  it('handles exactly 1 minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:01:00.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 1m ago')
  })

  it('handles exactly 1 hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T13:00:00.000Z'))
    const fetchedAt = new Date('2024-06-01T12:00:00.000Z').getTime()
    expect(formatUpdatedAge(fetchedAt)).toBe('updated 1h ago')
  })
})
