import { describe, expect, it } from 'vitest'
import {
  OVERAGE_COST_PER_REQUEST,
  formatCurrency,
  computeProjection,
  computeBudgetProjection,
  getQuotaColor,
  type QuotaSnapshot,
} from './quotaUtils'

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
      expect(result.projectedOverageCost).toBe(result.projectedOverage * OVERAGE_COST_PER_REQUEST)
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

describe('computeBudgetProjection', () => {
  // April 2026 billing period: Apr 1 – Apr 30 (30 days)
  const billingYear = 2026
  const billingMonth = 4
  const periodStartMs = Date.UTC(2026, 3, 1) // Apr 1 00:00 UTC
  const periodEndMs = Date.UTC(2026, 4, 1) // May 1 00:00 UTC

  it('returns null when spent is zero', () => {
    const midMonth = periodStartMs + 15 * 86_400_000
    expect(computeBudgetProjection(0, billingYear, billingMonth, midMonth)).toBeNull()
  })

  it('returns null when spent is negative', () => {
    const midMonth = periodStartMs + 15 * 86_400_000
    expect(computeBudgetProjection(-5, billingYear, billingMonth, midMonth)).toBeNull()
  })

  it('returns null when asOfMs is before the billing period', () => {
    const beforePeriod = periodStartMs - 86_400_000
    expect(computeBudgetProjection(100, billingYear, billingMonth, beforePeriod)).toBeNull()
  })

  it('returns null when asOfMs is after the billing period', () => {
    expect(computeBudgetProjection(100, billingYear, billingMonth, periodEndMs)).toBeNull()
    expect(
      computeBudgetProjection(100, billingYear, billingMonth, periodEndMs + 86_400_000)
    ).toBeNull()
  })

  it('returns null when less than 1 second has elapsed', () => {
    expect(computeBudgetProjection(100, billingYear, billingMonth, periodStartMs + 500)).toBeNull()
  })

  it('projects spend to month-end at midpoint', () => {
    // 15 days into a 30-day month, $300 spent → ~$600 projected
    const midMonth = periodStartMs + 15 * 86_400_000
    const result = computeBudgetProjection(300, billingYear, billingMonth, midMonth)

    expect(result).not.toBeNull()
    expect(result!.projectedSpend).toBeCloseTo(600, 0)
    expect(result!.dailySpendRate).toBeCloseTo(20, 0)
  })

  it('projects correctly at 1/3 of the month', () => {
    // 10 days into 30-day month, $200 spent → ~$600 projected
    const tenDaysIn = periodStartMs + 10 * 86_400_000
    const result = computeBudgetProjection(200, billingYear, billingMonth, tenDaysIn)

    expect(result).not.toBeNull()
    expect(result!.projectedSpend).toBeCloseTo(600, 0)
    expect(result!.dailySpendRate).toBeCloseTo(20, 0)
  })

  it('projects low spend correctly', () => {
    // 20 days in, only $10 spent → ~$15 projected
    const twentyDaysIn = periodStartMs + 20 * 86_400_000
    const result = computeBudgetProjection(10, billingYear, billingMonth, twentyDaysIn)

    expect(result).not.toBeNull()
    expect(result!.projectedSpend).toBeCloseTo(15, 0)
    expect(result!.dailySpendRate).toBeCloseTo(0.5, 1)
  })

  it('defaults asOfMs to Date.now() when omitted', () => {
    // Just verify it doesn't throw and returns something reasonable
    // for the current month (may be null if we're not in April 2026)
    const result = computeBudgetProjection(100, billingYear, billingMonth)
    // Result depends on current date — just ensure no crash
    expect(result === null || typeof result.projectedSpend === 'number').toBe(true)
  })
})
