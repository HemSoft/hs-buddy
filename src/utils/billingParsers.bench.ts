import { bench, describe } from 'vitest'
import {
  assembleCopilotMetrics,
  computeOverageSpend,
  extractBudgetFromResult,
  extractCopilotSpend,
  parseBillingUsage,
  type BillingUsageItem,
} from './billingParsers'

function makeBillingItem(
  index: number,
  overrides: Partial<BillingUsageItem> = {}
): BillingUsageItem {
  return {
    date: '2026-06-01',
    product: 'copilot',
    sku: 'Copilot AI Credits',
    quantity: 10 + (index % 7),
    unitType: 'credit',
    pricePerUnit: 0.01,
    grossAmount: 0.1 + index * 0.001,
    discountAmount: index % 3 === 0 ? 0.01 : 0,
    netAmount: 0.09 + index * 0.001,
    organizationName: `org-${index % 5}`,
    repositoryName: `repo-${index}`,
    ...overrides,
  }
}

function makeBillingItems(count: number): BillingUsageItem[] {
  return Array.from({ length: count }, (_, index) => {
    if (index % 20 === 0) {
      return makeBillingItem(index, {
        sku: index % 40 === 0 ? 'Copilot Enterprise' : 'Copilot Business',
        quantity: 5,
        unitType: 'seat',
      })
    }
    if (index % 11 === 0) return makeBillingItem(index, { product: 'actions' })
    return makeBillingItem(index)
  })
}

function stdoutResult(json: unknown): PromiseSettledResult<{ stdout: string }> {
  return { status: 'fulfilled', value: { stdout: JSON.stringify(json) } }
}

const smallUsage = makeBillingItems(25)
const mediumUsage = makeBillingItems(250)
const largeUsage = makeBillingItems(1000)
const mediumUsageResult = stdoutResult({ usageItems: mediumUsage })
const budgetResult = stdoutResult({
  budgets: [
    { budget_product_sku: 'actions_minutes', budget_amount: 100, prevent_further_usage: false },
    {
      budget_product_sku: 'copilot_premium_requests',
      budget_amount: 500,
      prevent_further_usage: true,
    },
  ],
})
const quotaOverage = {
  quota_snapshots: {
    premium_interactions: {
      overage_count: 125,
      remaining: -200,
    },
  },
}
const usage = parseBillingUsage(mediumUsage)

describe('parseBillingUsage', () => {
  bench('25 billing items', () => {
    parseBillingUsage(smallUsage)
  })

  bench('250 billing items', () => {
    parseBillingUsage(mediumUsage)
  })

  bench('1000 billing items', () => {
    parseBillingUsage(largeUsage)
  })
})

describe('billing API settled-result parsing', () => {
  bench('extractCopilotSpend — 250 items JSON stdout', () => {
    extractCopilotSpend(mediumUsageResult)
  })

  bench('extractBudgetFromResult — two budgets', () => {
    extractBudgetFromResult(budgetResult)
  })
})

describe('billing derived metrics', () => {
  bench('computeOverageSpend — premium snapshot', () => {
    computeOverageSpend(quotaOverage)
  })

  bench('assembleCopilotMetrics — success payload', () => {
    assembleCopilotMetrics({
      org: 'HemSoft',
      usageOk: true,
      usage,
      budgetAmount: 500,
      spent: 42.25,
      month: 6,
      year: 2026,
      fetchedAt: 1_782_432_000_000,
    })
  })
})
