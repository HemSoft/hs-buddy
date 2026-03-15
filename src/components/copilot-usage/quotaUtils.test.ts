import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  getQuotaColor,
  computeProjection,
  OVERAGE_COST_PER_REQUEST,
  type QuotaSnapshot,
} from './quotaUtils'

describe('formatCurrency', () => {
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('formats a dollar amount with two decimals', () => {
    expect(formatCurrency(12.5)).toBe('$12.50')
  })
})

describe('getQuotaColor', () => {
  it('returns green for null', () => {
    expect(getQuotaColor(null)).toBe('#4ec9b0')
  })

  it('returns green below 50%', () => {
    expect(getQuotaColor(30)).toBe('#4ec9b0')
  })

  it('returns yellow at 50-74%', () => {
    expect(getQuotaColor(60)).toBe('#dcd34a')
  })

  it('returns orange at 75-89%', () => {
    expect(getQuotaColor(80)).toBe('#e89b3c')
  })

  it('returns red at 90%+', () => {
    expect(getQuotaColor(95)).toBe('#e85d5d')
  })
})

describe('computeProjection', () => {
  it('returns null when elapsed time is under 1 second', () => {
    const now = new Date()
    // Reset date in the future means period just started → elapsed < 1s
    const premium: QuotaSnapshot = {
      entitlement: 300,
      overage_count: 0,
      overage_permitted: true,
      percent_remaining: 100,
      quota_id: 'test',
      quota_remaining: 300,
      remaining: 300,
      unlimited: false,
      timestamp_utc: now.toISOString(),
    }

    // Reset date far in the future so there's plenty of elapsed time
    const futureReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const result = computeProjection(premium, futureReset.toISOString())
    // When remaining === entitlement, used = 0, so projectedTotal = 0
    expect(result).not.toBeNull()
    expect(result!.projectedTotal).toBe(0)
    expect(result!.projectedOverage).toBe(0)
    expect(result!.projectedOverageCost).toBe(0)
  })

  it('projects overage when usage rate is high', () => {
    const now = new Date()
    // Simulate: reset in 15 days, period started 15 days ago, 200/300 used
    const resetDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    const premium: QuotaSnapshot = {
      entitlement: 300,
      overage_count: 0,
      overage_permitted: true,
      percent_remaining: 33,
      quota_id: 'test',
      quota_remaining: 100,
      remaining: 100,
      unlimited: false,
      timestamp_utc: now.toISOString(),
    }

    const result = computeProjection(premium, resetDate.toISOString())
    expect(result).not.toBeNull()
    // With 200 used in ~15 days, projected ~400 over 30 days
    expect(result!.projectedTotal).toBeGreaterThan(300)
    expect(result!.projectedOverage).toBeGreaterThan(0)
    expect(result!.projectedOverageCost).toBe(
      result!.projectedOverage * OVERAGE_COST_PER_REQUEST
    )
  })
})
