import { describe, expect, it } from 'vitest'
import { parseBillingUsage, type BillingUsageItem } from './billingParsers'

const usageItem = (overrides: Partial<BillingUsageItem>): BillingUsageItem => ({
  date: '2026-07-01',
  product: 'copilot',
  sku: 'Copilot AI Credits',
  quantity: 1,
  unitType: 'request',
  pricePerUnit: 0.01,
  grossAmount: 0.01,
  discountAmount: 0,
  netAmount: 0.01,
  organizationName: 'test',
  repositoryName: '',
  ...overrides,
})

describe('parseBillingUsage billing-period filtering', () => {
  it('limits usage and seat totals to the requested billing month', () => {
    const items = [
      usageItem({
        date: '2026-06-30',
        quantity: 11,
        grossAmount: 0.11,
        discountAmount: 0.01,
        netAmount: 0.1,
      }),
      usageItem({
        quantity: 7,
        grossAmount: 0.07,
        discountAmount: 0.02,
        netAmount: 0.05,
      }),
      usageItem({ date: '2026-06-01', sku: 'Copilot Business', unitType: 'seat', quantity: 2 }),
      usageItem({ sku: 'Copilot Business', unitType: 'seat', quantity: 3 }),
    ]

    expect(parseBillingUsage(items, { year: 2026, month: 7 })).toEqual({
      premiumRequests: 7,
      grossCost: 0.07,
      discount: 0.02,
      netCost: 0.05,
      businessSeats: 3,
      seatPlan: 'business',
    })
  })

  it('does not mix the same month across billing years', () => {
    const items = [
      usageItem({ date: '2025-01-31', quantity: 13 }),
      usageItem({ date: '2026-01-01', quantity: 5 }),
    ]

    expect(parseBillingUsage(items, { year: 2026, month: 1 }).premiumRequests).toBe(5)
  })
})
