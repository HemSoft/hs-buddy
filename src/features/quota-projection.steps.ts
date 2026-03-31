import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { expect } from 'vitest'
import {
  computeProjection,
  getQuotaColor,
  OVERAGE_COST_PER_REQUEST,
  type QuotaSnapshot,
} from '../components/copilot-usage/quotaUtils'

const feature = await loadFeature('src/features/quota-projection.feature')

function makeSnapshot(entitlement: number, remaining: number): QuotaSnapshot {
  return {
    entitlement,
    overage_count: 0,
    overage_permitted: true,
    percent_remaining: (remaining / entitlement) * 100,
    quota_id: 'test-quota',
    quota_remaining: remaining,
    remaining,
    unlimited: false,
    timestamp_utc: new Date().toISOString(),
  }
}

function resetDateFromNow(daysFromNow: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  return d.toISOString()
}

describeFeature(feature, ({ Scenario, Background }) => {
  let snapshot: QuotaSnapshot
  let resetDate: string
  let result: ReturnType<typeof computeProjection>
  let quotaPercent: number | null
  let color: string

  Background(({ Given }) => {
    Given('the overage cost is $0.04 per request', () => {
      expect(OVERAGE_COST_PER_REQUEST).toBe(0.04)
    })
  })

  Scenario('Zero usage returns zero projection', ({ Given, When, Then, And }) => {
    Given('an entitlement of 300 with 300 remaining', () => {
      snapshot = makeSnapshot(300, 300)
    })
    And('the billing period resets in 15 days', () => {
      resetDate = resetDateFromNow(15)
    })
    When('the projection is computed', () => {
      result = computeProjection(snapshot, resetDate)
    })
    Then('the projected total should be 0', () => {
      expect(result).not.toBeNull()
      expect(result!.projectedTotal).toBe(0)
    })
    And('the projected overage should be 0', () => {
      expect(result!.projectedOverage).toBe(0)
    })
    And('the overage cost should be $0.00', () => {
      expect(result!.projectedOverageCost).toBe(0)
    })
  })

  Scenario('Mid-cycle usage projects overage', ({ Given, When, Then, And }) => {
    Given('an entitlement of 300 with 100 remaining', () => {
      snapshot = makeSnapshot(300, 100)
    })
    And('the billing period is 50% elapsed', () => {
      // Reset date 15 days from now means we're ~15 days in (half of 30)
      resetDate = resetDateFromNow(15)
    })
    When('the projection is computed', () => {
      result = computeProjection(snapshot, resetDate)
    })
    Then('the projected total should exceed the entitlement', () => {
      expect(result).not.toBeNull()
      expect(result!.projectedTotal).toBeGreaterThan(300)
    })
    And('the projected overage should be greater than 0', () => {
      expect(result!.projectedOverage).toBeGreaterThan(0)
    })
    And('the overage cost should be greater than $0.00', () => {
      expect(result!.projectedOverageCost).toBeGreaterThan(0)
    })
  })

  Scenario('Null returned when insufficient time elapsed', ({ Given, When, Then, And }) => {
    Given('an entitlement of 300 with 300 remaining', () => {
      snapshot = makeSnapshot(300, 300)
    })
    And('the billing period just started', () => {
      // periodStart = resetDate - 1 month. For periodStart to be in the future
      // (making elapsedSeconds < 1), resetDate must be >1 month from now.
      const farFuture = new Date()
      farFuture.setUTCMonth(farFuture.getUTCMonth() + 2)
      resetDate = farFuture.toISOString()
    })
    When('the projection is computed', () => {
      result = computeProjection(snapshot, resetDate)
    })
    Then('the result should be null', () => {
      expect(result).toBeNull()
    })
  })

  Scenario('Color is green when usage is below 50%', ({ Given, When, Then }) => {
    Given('the quota usage percent is 30', () => {
      quotaPercent = 30
    })
    When('the quota color is determined', () => {
      color = getQuotaColor(quotaPercent)
    })
    Then('the color should be "#4ec9b0"', () => {
      expect(color).toBe('#4ec9b0')
    })
  })

  Scenario('Color is yellow when usage is between 50% and 75%', ({ Given, When, Then }) => {
    Given('the quota usage percent is 60', () => {
      quotaPercent = 60
    })
    When('the quota color is determined', () => {
      color = getQuotaColor(quotaPercent)
    })
    Then('the color should be "#dcd34a"', () => {
      expect(color).toBe('#dcd34a')
    })
  })

  Scenario('Color is orange when usage is between 75% and 90%', ({ Given, When, Then }) => {
    Given('the quota usage percent is 80', () => {
      quotaPercent = 80
    })
    When('the quota color is determined', () => {
      color = getQuotaColor(quotaPercent)
    })
    Then('the color should be "#e89b3c"', () => {
      expect(color).toBe('#e89b3c')
    })
  })

  Scenario('Color is red when usage exceeds 90%', ({ Given, When, Then }) => {
    Given('the quota usage percent is 95', () => {
      quotaPercent = 95
    })
    When('the quota color is determined', () => {
      color = getQuotaColor(quotaPercent)
    })
    Then('the color should be "#e85d5d"', () => {
      expect(color).toBe('#e85d5d')
    })
  })

  Scenario('Color is green when percent is null', ({ Given, When, Then }) => {
    Given('the quota usage percent is null', () => {
      quotaPercent = null
    })
    When('the quota color is determined', () => {
      color = getQuotaColor(quotaPercent)
    })
    Then('the color should be "#4ec9b0"', () => {
      expect(color).toBe('#4ec9b0')
    })
  })
})
