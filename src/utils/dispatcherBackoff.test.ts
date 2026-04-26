import { describe, it, expect } from 'vitest'
import {
  calculateBackoffMs,
  isInBackoffWindow,
  shouldLogDispatcherError,
} from './dispatcherBackoff'

describe('calculateBackoffMs', () => {
  const BASE = 10_000
  const MAX = 120_000

  it('returns base interval for first error', () => {
    expect(calculateBackoffMs(1, BASE, MAX)).toBe(10_000)
  })

  it('doubles on each consecutive error', () => {
    expect(calculateBackoffMs(2, BASE, MAX)).toBe(20_000)
    expect(calculateBackoffMs(3, BASE, MAX)).toBe(40_000)
    expect(calculateBackoffMs(4, BASE, MAX)).toBe(80_000)
  })

  it('caps at maxBackoff', () => {
    expect(calculateBackoffMs(5, BASE, MAX)).toBe(120_000)
    expect(calculateBackoffMs(10, BASE, MAX)).toBe(120_000)
  })

  it('handles custom base and max values', () => {
    expect(calculateBackoffMs(1, 1000, 5000)).toBe(1000)
    expect(calculateBackoffMs(3, 1000, 5000)).toBe(4000)
    expect(calculateBackoffMs(4, 1000, 5000)).toBe(5000)
  })

  it('returns 0 for zero consecutive errors', () => {
    expect(calculateBackoffMs(0, BASE, MAX)).toBe(0)
  })

  it('returns 0 for negative consecutive errors', () => {
    expect(calculateBackoffMs(-1, BASE, MAX)).toBe(0)
    expect(calculateBackoffMs(-5, BASE, MAX)).toBe(0)
  })
})

describe('isInBackoffWindow', () => {
  const BASE = 10_000
  const MAX = 120_000

  it('returns false when no errors', () => {
    expect(isInBackoffWindow(0, 0, BASE, MAX, Date.now())).toBe(false)
  })

  it('returns true when within backoff window', () => {
    const lastError = 1000
    const now = 1500 // 500ms after error, but backoff = 10_000ms
    expect(isInBackoffWindow(1, lastError, BASE, MAX, now)).toBe(true)
  })

  it('returns false when past backoff window', () => {
    const lastError = 1000
    const now = 12_000 // 11s after error, backoff = 10s
    expect(isInBackoffWindow(1, lastError, BASE, MAX, now)).toBe(false)
  })

  it('returns false at exact boundary', () => {
    const lastError = 0
    const now = 10_000 // exactly at backoff = 10s
    expect(isInBackoffWindow(1, lastError, BASE, MAX, now)).toBe(false)
  })

  it('accounts for exponential growth', () => {
    const lastError = 0
    // 3 errors → backoff = 40_000ms
    expect(isInBackoffWindow(3, lastError, BASE, MAX, 39_999)).toBe(true)
    expect(isInBackoffWindow(3, lastError, BASE, MAX, 40_000)).toBe(false)
  })
})

describe('shouldLogDispatcherError', () => {
  it('logs the first error', () => {
    expect(shouldLogDispatcherError(1)).toBe(true)
  })

  it('does not log errors 2-5', () => {
    expect(shouldLogDispatcherError(2)).toBe(false)
    expect(shouldLogDispatcherError(3)).toBe(false)
    expect(shouldLogDispatcherError(4)).toBe(false)
    expect(shouldLogDispatcherError(5)).toBe(false)
  })

  it('logs every 6th error', () => {
    expect(shouldLogDispatcherError(6)).toBe(true)
    expect(shouldLogDispatcherError(12)).toBe(true)
    expect(shouldLogDispatcherError(18)).toBe(true)
  })

  it('does not log non-6th errors after the first', () => {
    expect(shouldLogDispatcherError(7)).toBe(false)
    expect(shouldLogDispatcherError(11)).toBe(false)
  })
})
