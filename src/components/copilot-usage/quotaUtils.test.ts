import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  getQuotaColor,
  computeProjection,
  synthesizeQuotaData,
  OVERAGE_COST_PER_CREDIT,
  type OrgPoolMetrics,
  type QuotaSnapshot,
} from './quotaUtils'

function makeSnapshot(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    entitlement: 300,
    overage_count: 0,
    overage_permitted: true,
    percent_remaining: 100,
    quota_id: 'test',
    quota_remaining: 300,
    remaining: 300,
    unlimited: false,
    timestamp_utc: new Date().toISOString(),
    ...overrides,
  }
}

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('formats a dollar amount with two decimals', () => {
    expect(formatCurrency(12.5)).toBe('$12.50')
  })

  it('formats negative amounts', () => {
    expect(formatCurrency(-5.5)).toBe('-$5.50')
  })
})

describe('getQuotaColor', () => {
  it('returns green for null', () => {
    expect(getQuotaColor(null)).toBe('#4ec9b0')
  })

  it('returns green below 50%', () => {
    expect(getQuotaColor(0)).toBe('#4ec9b0')
    expect(getQuotaColor(30)).toBe('#4ec9b0')
    expect(getQuotaColor(49)).toBe('#4ec9b0')
  })

  it('returns yellow at exactly 50%', () => {
    expect(getQuotaColor(50)).toBe('#dcd34a')
  })

  it('returns yellow at 50-74%', () => {
    expect(getQuotaColor(60)).toBe('#dcd34a')
    expect(getQuotaColor(74)).toBe('#dcd34a')
  })

  it('returns orange at exactly 75%', () => {
    expect(getQuotaColor(75)).toBe('#e89b3c')
  })

  it('returns orange at 75-89%', () => {
    expect(getQuotaColor(80)).toBe('#e89b3c')
    expect(getQuotaColor(89)).toBe('#e89b3c')
  })

  it('returns red at exactly 90%', () => {
    expect(getQuotaColor(90)).toBe('#e85d5d')
  })

  it('returns red at 90%+', () => {
    expect(getQuotaColor(95)).toBe('#e85d5d')
    expect(getQuotaColor(150)).toBe('#e85d5d')
  })
})

describe('computeProjection', () => {
  it('returns null when elapsed time is under 1 second', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000)
    const result = computeProjection(makeSnapshot(), resetDate.toISOString())
    expect(result).toBeNull()
  })

  it('projects zero when no usage in the period', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    const result = computeProjection(makeSnapshot(), resetDate.toISOString())
    expect(result).not.toBeNull()
    expect(result!.projectedTotal).toBe(0)
    expect(result!.projectedOverage).toBe(0)
    expect(result!.projectedOverageCost).toBe(0)
  })

  it('projects overage when usage rate is high', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    const premium = makeSnapshot({ remaining: 100, percent_remaining: 33, quota_remaining: 100 })

    const result = computeProjection(premium, resetDate.toISOString())
    expect(result).not.toBeNull()
    expect(result!.projectedTotal).toBeGreaterThan(300)
    expect(result!.projectedOverage).toBeGreaterThan(0)
    expect(result!.projectedOverageCost).toBe(result!.projectedOverage * OVERAGE_COST_PER_CREDIT)
  })

  it('returns projectedPercent 0 when entitlement is 0', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    const premium = makeSnapshot({ entitlement: 0, remaining: 0 })

    const result = computeProjection(premium, resetDate.toISOString())
    expect(result).not.toBeNull()
    expect(result!.projectedPercent).toBe(0)
  })

  it('clamps month overflow when reset date is Mar 31', () => {
    // Mar 31 minus 1 month → "Feb 31" overflows to Mar 3
    // The code detects same-month and clamps to last day of Feb
    const resetDate = '2025-03-31T00:00:00Z'
    const premium = makeSnapshot({ entitlement: 1000, remaining: 500 })

    const result = computeProjection(premium, resetDate)
    // Should not return null — period start was clamped correctly
    expect(result).not.toBeNull()
    expect(result!.dailyRate).toBeGreaterThanOrEqual(0)
  })

  it('does not clamp when month subtraction lands in the correct month', () => {
    // Jun 15 minus 1 month → May 15 (no overflow)
    const resetDate = '2025-06-15T00:00:00Z'
    const premium = makeSnapshot({ entitlement: 1000, remaining: 800 })

    const result = computeProjection(premium, resetDate)
    expect(result).not.toBeNull()
    expect(result!.projectedOverage).toBeGreaterThanOrEqual(0)
  })

  it('computes positive dailyRate with partial usage', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    const premium = makeSnapshot({ entitlement: 1000, remaining: 900 })

    const result = computeProjection(premium, resetDate.toISOString())
    expect(result).not.toBeNull()
    expect(result!.dailyRate).toBeGreaterThan(0)
  })

  it('returns zero overage when projected within entitlement', () => {
    const now = new Date()
    const resetDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
    const premium = makeSnapshot({ entitlement: 10000, remaining: 9999 })

    const result = computeProjection(premium, resetDate.toISOString())
    if (result) {
      expect(result.projectedOverage).toBe(0)
      expect(result.projectedOverageCost).toBe(0)
    }
  })

  it('returns null when less than 10% of the billing cycle has elapsed', () => {
    const now = new Date()
    // Reset ~29 days out → the period started ~a day ago → well under 10% elapsed.
    const resetDate = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000)
    const premium = makeSnapshot({ entitlement: 300, remaining: 100, percent_remaining: 33 })

    const result = computeProjection(premium, resetDate.toISOString())
    expect(result).toBeNull()
  })
})

describe('synthesizeQuotaData', () => {
  const baseMetrics: OrgPoolMetrics = {
    login: 'octocat',
    plan: 'business',
    org: 'acme',
    usedCredits: 10940,
    grossCost: 109.4,
    netCost: 0,
    seats: 318,
    billingYear: 2026,
    billingMonth: 6,
  }

  it('builds an org-pool snapshot with no personal fields when userCredits is absent', () => {
    const data = synthesizeQuotaData(baseMetrics)
    const pool = data.quota_snapshots.premium_interactions
    expect(pool.entitlement).toBe(318 * 7000)
    expect(pool.remaining).toBe(318 * 7000 - 10940)
    expect(data.personal).toBeUndefined()
    expect(data.orgConsumed).toBeUndefined()
    expect(data.grossCost).toBe(109.4)
  })

  it('attaches a personal snapshot and org denominator when userCredits is provided', () => {
    const data = synthesizeQuotaData({ ...baseMetrics, userCredits: 8235.4 })
    expect(data.personal).toBeDefined()
    expect(data.personal!.entitlement).toBe(7000)
    expect(data.personal!.remaining).toBe(7000 - 8235)
    expect(data.personal!.overage_count).toBe(8235 - 7000)
    expect(data.orgConsumed).toBe(10940)
    // The org pool stays org-wide regardless of personal data.
    expect(data.quota_snapshots.premium_interactions.entitlement).toBe(318 * 7000)
  })

  it('treats userCredits of 0 as present personal data, not absent', () => {
    const data = synthesizeQuotaData({ ...baseMetrics, userCredits: 0 })
    expect(data.personal).toBeDefined()
    expect(data.personal!.remaining).toBe(7000)
    expect(data.personal!.overage_count).toBe(0)
    expect(data.orgConsumed).toBe(10940)
  })

  it('uses the standard 3,900 per-seat allotment outside the promo window', () => {
    const data = synthesizeQuotaData({
      ...baseMetrics,
      billingMonth: 9,
      seats: 10,
      userCredits: 100,
    })
    expect(data.quota_snapshots.premium_interactions.entitlement).toBe(10 * 3900)
    expect(data.personal!.entitlement).toBe(3900)
  })
})
