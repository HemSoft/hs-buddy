import { describe, expect, it } from 'vitest'
import {
  roundCents,
  sumBy,
  isNotFoundError,
  extractPremiumUsageItems,
  sumGrossRequests,
  sumNetCost,
  parseBillingUsage,
  extractBudgetFromResult,
  extractUsageSpend,
  computeOverageSpend,
  classifyCliTokenError,
  type BillingUsageItem,
  type PremiumUsageItem,
} from './billingParsers'

// --- helpers ---

function fulfilled<T>(value: T): PromiseSettledResult<T> {
  return { status: 'fulfilled', value }
}
function rejected(reason: unknown): PromiseSettledResult<never> {
  return { status: 'rejected', reason }
}
function stdoutResult(json: unknown): PromiseSettledResult<{ stdout: string }> {
  return fulfilled({ stdout: JSON.stringify(json) })
}

// --- roundCents ---

describe('roundCents', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundCents(1.006)).toBe(1.01)
    expect(roundCents(1.004)).toBe(1)
    expect(roundCents(123.456)).toBe(123.46)
  })

  it('returns integers unchanged', () => {
    expect(roundCents(5)).toBe(5)
    expect(roundCents(0)).toBe(0)
  })

  it('handles negative values', () => {
    expect(roundCents(-1.005)).toBe(-1)
    expect(roundCents(-1.006)).toBe(-1.01)
  })
})

// --- sumBy ---

describe('sumBy', () => {
  it('sums values using accessor', () => {
    const items = [{ v: 1 }, { v: 2 }, { v: 3 }]
    expect(sumBy(items, i => i.v)).toBe(6)
  })

  it('returns 0 for empty array', () => {
    expect(sumBy([], () => 1)).toBe(0)
  })
})

// --- isNotFoundError ---

describe('isNotFoundError', () => {
  it('detects 404 in error message', () => {
    expect(isNotFoundError(new Error('HTTP 404'))).toBe(true)
  })

  it('detects Not Found in error message', () => {
    expect(isNotFoundError(new Error('Not Found'))).toBe(true)
  })

  it('returns false for other errors', () => {
    expect(isNotFoundError(new Error('Internal Server Error'))).toBe(false)
  })

  it('handles non-Error values', () => {
    expect(isNotFoundError('404 page')).toBe(true)
    expect(isNotFoundError(42)).toBe(false)
  })
})

// --- extractPremiumUsageItems ---

describe('extractPremiumUsageItems', () => {
  it('extracts items from fulfilled result', () => {
    const items: PremiumUsageItem[] = [{ grossQuantity: 10, netQuantity: 8, netAmount: 0.32 }]
    const result = stdoutResult({ usageItems: items })
    expect(extractPremiumUsageItems(result)).toEqual(items)
  })

  it('returns [] for rejected result', () => {
    expect(extractPremiumUsageItems(rejected('err'))).toEqual([])
  })

  it('returns [] when usageItems is missing', () => {
    const result = stdoutResult({})
    expect(extractPremiumUsageItems(result)).toEqual([])
  })

  it('returns [] when stdout is invalid JSON', () => {
    const result = fulfilled({ stdout: 'not json' })
    expect(extractPremiumUsageItems(result)).toEqual([])
  })

  it('returns [] when stdout is empty', () => {
    const result = fulfilled({ stdout: '' })
    expect(extractPremiumUsageItems(result)).toEqual([])
  })
})

// --- sumGrossRequests ---

describe('sumGrossRequests', () => {
  it('sums and rounds gross quantities', () => {
    const items: PremiumUsageItem[] = [
      { grossQuantity: 1.4, netQuantity: 1, netAmount: 0.04 },
      { grossQuantity: 2.6, netQuantity: 2, netAmount: 0.08 },
    ]
    expect(sumGrossRequests(items)).toBe(4)
  })

  it('returns 0 for empty array', () => {
    expect(sumGrossRequests([])).toBe(0)
  })
})

// --- sumNetCost ---

describe('sumNetCost', () => {
  it('sums and rounds net amounts', () => {
    const items: PremiumUsageItem[] = [
      { grossQuantity: 1, netQuantity: 1, netAmount: 0.005 },
      { grossQuantity: 1, netQuantity: 1, netAmount: 0.005 },
    ]
    expect(sumNetCost(items)).toBe(0.01)
  })

  it('returns 0 for empty array', () => {
    expect(sumNetCost([])).toBe(0)
  })
})

// --- parseBillingUsage ---

describe('parseBillingUsage', () => {
  const makePremiumItem = (overrides: Partial<BillingUsageItem> = {}): BillingUsageItem => ({
    date: '2024-01-01',
    product: 'copilot',
    sku: 'Copilot Premium Request',
    quantity: 10,
    unitType: 'request',
    pricePerUnit: 0.04,
    grossAmount: 0.4,
    discountAmount: 0.1,
    netAmount: 0.3,
    organizationName: 'test',
    repositoryName: '',
    ...overrides,
  })

  const makeSeatItem = (overrides: Partial<BillingUsageItem> = {}): BillingUsageItem => ({
    date: '2024-01-01',
    product: 'copilot',
    sku: 'Copilot Business',
    quantity: 5,
    unitType: 'seat',
    pricePerUnit: 19,
    grossAmount: 95,
    discountAmount: 0,
    netAmount: 95,
    organizationName: 'test',
    repositoryName: '',
    ...overrides,
  })

  it('parses premium and seat items', () => {
    const result = parseBillingUsage([makePremiumItem(), makeSeatItem()])
    expect(result.premiumRequests).toBe(10)
    expect(result.grossCost).toBe(0.4)
    expect(result.discount).toBe(0.1)
    expect(result.netCost).toBe(0.3)
    expect(result.businessSeats).toBe(5)
  })

  it('returns zeros for empty array', () => {
    const result = parseBillingUsage([])
    expect(result.premiumRequests).toBe(0)
    expect(result.grossCost).toBe(0)
    expect(result.discount).toBe(0)
    expect(result.netCost).toBe(0)
    expect(result.businessSeats).toBe(0)
  })

  it('ignores non-copilot items', () => {
    const nonCopilot = makePremiumItem({ product: 'actions' })
    const result = parseBillingUsage([nonCopilot])
    expect(result.premiumRequests).toBe(0)
  })

  it('sums multiple premium items', () => {
    const items = [
      makePremiumItem({ quantity: 5, grossAmount: 0.2, discountAmount: 0.05, netAmount: 0.15 }),
      makePremiumItem({ quantity: 3, grossAmount: 0.12, discountAmount: 0.02, netAmount: 0.1 }),
    ]
    const result = parseBillingUsage(items)
    expect(result.premiumRequests).toBe(8)
    expect(result.grossCost).toBe(0.32)
    expect(result.discount).toBe(0.07)
    expect(result.netCost).toBe(0.25)
  })
})

// --- extractBudgetFromResult ---

describe('extractBudgetFromResult', () => {
  it('returns null budget for rejected result', () => {
    expect(extractBudgetFromResult(rejected('fail'))).toEqual({
      budgetAmount: null,
      preventFurtherUsage: false,
    })
  })

  it('returns null budget when no copilot budget found', () => {
    const result = stdoutResult({ budgets: [] })
    expect(extractBudgetFromResult(result)).toEqual({
      budgetAmount: null,
      preventFurtherUsage: false,
    })
  })

  it('extracts copilot budget amount', () => {
    const result = stdoutResult({
      budgets: [
        {
          budget_product_sku: 'copilot_premium_requests',
          budget_amount: 500,
          prevent_further_usage: true,
        },
      ],
    })
    const parsed = extractBudgetFromResult(result)
    expect(parsed.budgetAmount).toBe(500)
    expect(parsed.preventFurtherUsage).toBe(true)
  })

  it('handles missing budgets field', () => {
    const result = stdoutResult({})
    expect(extractBudgetFromResult(result)).toEqual({
      budgetAmount: null,
      preventFurtherUsage: false,
    })
  })

  it('returns null budget when stdout is invalid JSON', () => {
    const result = fulfilled({ stdout: '{broken' })
    expect(extractBudgetFromResult(result)).toEqual({
      budgetAmount: null,
      preventFurtherUsage: false,
    })
  })
})

// --- extractUsageSpend ---

describe('extractUsageSpend', () => {
  it('returns 0 for rejected result', () => {
    expect(extractUsageSpend(rejected('err'))).toBe(0)
  })

  it('sums net amounts from usage items', () => {
    const result = stdoutResult({
      usageItems: [{ netAmount: 0.12 }, { netAmount: 0.08 }],
    })
    expect(extractUsageSpend(result)).toBe(0.2)
  })

  it('returns 0 when usageItems is missing', () => {
    const result = stdoutResult({})
    expect(extractUsageSpend(result)).toBe(0)
  })

  it('handles empty usageItems', () => {
    const result = stdoutResult({ usageItems: [] })
    expect(extractUsageSpend(result)).toBe(0)
  })

  it('returns 0 when stdout is invalid JSON', () => {
    const result = fulfilled({ stdout: 'oops' })
    expect(extractUsageSpend(result)).toBe(0)
  })
})

// --- computeOverageSpend ---

describe('computeOverageSpend', () => {
  it('returns 0 when no quota_snapshots', () => {
    expect(computeOverageSpend({})).toBe(0)
  })

  it('returns 0 when no premium_interactions', () => {
    expect(computeOverageSpend({ quota_snapshots: {} })).toBe(0)
  })

  it('computes overage from overage_count', () => {
    const data = {
      quota_snapshots: {
        premium_interactions: {
          overage_count: 100,
          remaining: 0,
        },
      },
    }
    expect(computeOverageSpend(data)).toBe(4) // 100 * 0.04
  })

  it('computes overage from negative remaining', () => {
    const data = {
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          remaining: -50,
        },
      },
    }
    expect(computeOverageSpend(data)).toBe(2) // 50 * 0.04
  })

  it('uses the larger of overage_count vs remaining-derived overage', () => {
    const data = {
      quota_snapshots: {
        premium_interactions: {
          overage_count: 30,
          remaining: -50,
        },
      },
    }
    expect(computeOverageSpend(data)).toBe(2) // max(30, 50) * 0.04
  })

  it('returns 0 when remaining is positive and overage_count is 0', () => {
    const data = {
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          remaining: 100,
        },
      },
    }
    expect(computeOverageSpend(data)).toBe(0)
  })

  it('handles missing overage_count and remaining', () => {
    const data = {
      quota_snapshots: {
        premium_interactions: {},
      },
    }
    expect(computeOverageSpend(data)).toBe(0)
  })
})

// --- classifyCliTokenError ---

describe('classifyCliTokenError', () => {
  it('classifies ENOENT as not installed', () => {
    const err = classifyCliTokenError('ENOENT', undefined, null)
    expect(err.message).toContain('not installed')
  })

  it('classifies not found as not installed', () => {
    const err = classifyCliTokenError('gh: not found', undefined, null)
    expect(err.message).toContain('not installed')
  })

  it('classifies not logged in with username', () => {
    const err = classifyCliTokenError('not logged in', 'alice', null)
    expect(err.message).toContain("account 'alice'")
    expect(err.message).toContain('gh auth login')
  })

  it('classifies not logged in without username', () => {
    const err = classifyCliTokenError('not logged in', undefined, null)
    expect(err.message).not.toContain('account')
    expect(err.message).toContain('gh auth login')
  })

  it('classifies no account found', () => {
    const err = classifyCliTokenError('no account found', 'bob', null)
    expect(err.message).toContain("'bob'")
    expect(err.message).toContain('gh auth login -h github.com')
  })

  it('passes through unknown errors', () => {
    const err = classifyCliTokenError('timeout after 5s', 'alice', null)
    expect(err.message).toBe('timeout after 5s')
  })

  it('preserves cause', () => {
    const cause = new Error('original')
    const err = classifyCliTokenError('ENOENT', undefined, cause)
    expect(err.cause).toBe(cause)
  })
})
