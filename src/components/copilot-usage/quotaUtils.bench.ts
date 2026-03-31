import { bench, describe } from 'vitest'
import { computeProjection, type QuotaSnapshot } from './quotaUtils'

function makeSnapshot(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    entitlement: 300,
    overage_count: 0,
    overage_permitted: true,
    percent_remaining: 60,
    quota_id: 'premium_interactions',
    quota_remaining: 180,
    remaining: 180,
    unlimited: false,
    timestamp_utc: '2026-03-30T12:00:00Z',
    ...overrides,
  }
}

const RESET_DATE = '2026-04-15T00:00:00Z'

describe('computeProjection', () => {
  bench('mid-cycle with overage', () => {
    computeProjection(makeSnapshot({ remaining: 50 }), RESET_DATE)
  })

  bench('early cycle low usage', () => {
    computeProjection(makeSnapshot({ remaining: 290 }), RESET_DATE)
  })

  bench('near-reset heavy usage', () => {
    computeProjection(makeSnapshot({ remaining: 10 }), '2026-03-31T00:00:00Z')
  })

  bench('zero remaining', () => {
    computeProjection(makeSnapshot({ remaining: 0, entitlement: 300 }), RESET_DATE)
  })
})
