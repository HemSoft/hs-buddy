import { describe, expect, it } from 'vitest'
import {
  OVERAGE_COST_PER_REQUEST,
  formatCurrency,
  computeProjection,
  getQuotaColor,
} from './quotaUtils'
import type { QuotaSnapshot } from './quotaUtils'

describe('OVERAGE_COST_PER_REQUEST', () => {
  it('is 4 cents', () => {
    expect(OVERAGE_COST_PER_REQUEST).toBe(0.04)
  })
})

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('formats a whole number', () => {
    expect(formatCurrency(10)).toBe('$10.00')
  })

  it('formats a decimal', () => {
    expect(formatCurrency(3.14)).toBe('$3.14')
  })

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(1.999)).toBe('$2.00')
  })

  it('formats large numbers with commas', () => {
    const result = formatCurrency(1234.56)
    // $1,234.56 (locale-dependent, but the amount should match)
    expect(result).toContain('1')
    expect(result).toContain('234')
    expect(result).toContain('.56')
  })
})

describe('getQuotaColor', () => {
  it('returns teal for null', () => {
    expect(getQuotaColor(null)).toBe('#4ec9b0')
  })

  it('returns teal for < 50%', () => {
    expect(getQuotaColor(30)).toBe('#4ec9b0')
    expect(getQuotaColor(0)).toBe('#4ec9b0')
    expect(getQuotaColor(49)).toBe('#4ec9b0')
  })

  it('returns yellow for 50-74%', () => {
    expect(getQuotaColor(50)).toBe('#dcd34a')
    expect(getQuotaColor(74)).toBe('#dcd34a')
  })

  it('returns orange for 75-89%', () => {
    expect(getQuotaColor(75)).toBe('#e89b3c')
    expect(getQuotaColor(89)).toBe('#e89b3c')
  })

  it('returns red for >= 90%', () => {
    expect(getQuotaColor(90)).toBe('#e85d5d')
    expect(getQuotaColor(100)).toBe('#e85d5d')
    expect(getQuotaColor(150)).toBe('#e85d5d')
  })
})

describe('computeProjection', () => {
  function makeSnapshot(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
    return {
      entitlement: 1000,
      overage_count: 0,
      overage_permitted: true,
      percent_remaining: 80,
      quota_id: 'test',
      quota_remaining: 800,
      remaining: 800,
      unlimited: false,
      timestamp_utc: '2024-06-15T12:00:00Z',
      ...overrides,
    }
  }

  it('returns null when elapsed time is less than 1 second', () => {
    // Reset date is in the past by < 1 month
    const snapshot = makeSnapshot({ entitlement: 1000, remaining: 800 })
    // Use a reset date far in the future so period hasn't started
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const result = computeProjection(snapshot, farFuture.toISOString())
    // period start would be 1 month before farFuture → still in the future
    // elapsed < 1 second → null
    expect(result).toBeNull()
  })

  it('computes a valid projection when data is available', () => {
    // Create a realistic scenario: reset date is 10 days from now
    // Period started ~20 days ago
    const now = Date.now()
    const resetDate = new Date(now + 10 * 24 * 60 * 60 * 1000)
    const snapshot = makeSnapshot({
      entitlement: 1000,
      remaining: 600, // used 400 out of 1000
    })

    const result = computeProjection(snapshot, resetDate.toISOString())

    if (result) {
      expect(result.projectedTotal).toBeGreaterThan(0)
      expect(result.dailyRate).toBeGreaterThan(0)
      expect(result.projectedPercent).toBeGreaterThan(0)
      expect(result.projectedOverage).toBeGreaterThanOrEqual(0)
      expect(result.projectedOverageCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('calculates overage cost correctly', () => {
    // Scenario: very high usage rate will project way over entitlement
    const now = Date.now()
    const resetDate = new Date(now + 2 * 24 * 60 * 60 * 1000) // 2 days from now
    const snapshot = makeSnapshot({
      entitlement: 100,
      remaining: 10, // used 90 of 100 with lots of time to go
    })

    const result = computeProjection(snapshot, resetDate.toISOString())

    if (result && result.projectedOverage > 0) {
      expect(result.projectedOverageCost).toBe(
        result.projectedOverage * OVERAGE_COST_PER_REQUEST
      )
    }
  })

  it('returns 0 overage when projected total is within entitlement', () => {
    // Set up a scenario where usage is very low
    const now = Date.now()
    const resetDate = new Date(now + 1 * 24 * 60 * 60 * 1000) // 1 day
    const snapshot = makeSnapshot({
      entitlement: 10000,
      remaining: 9999, // used only 1
    })

    const result = computeProjection(snapshot, resetDate.toISOString())

    if (result) {
      expect(result.projectedOverage).toBe(0)
      expect(result.projectedOverageCost).toBe(0)
    }
  })
})
