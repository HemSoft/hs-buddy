import { findCopilotBudget, type BudgetItem } from './budgetUtils'
import { getErrorMessage } from './errorUtils'
import { OVERAGE_COST_PER_REQUEST } from '../components/copilot-usage/quotaUtils'

/** Shape returned by /orgs/{org}/settings/billing/usage */
export interface BillingUsageItem {
  date: string
  product: string
  sku: string
  quantity: number
  unitType: string
  pricePerUnit: number
  grossAmount: number
  discountAmount: number
  netAmount: number
  organizationName: string
  repositoryName: string
}

export interface ParsedBillingUsage {
  premiumRequests: number
  grossCost: number
  discount: number
  netCost: number
  businessSeats: number
}

/** Shape returned by enterprise/org premium request usage APIs. */
export interface PremiumUsageItem {
  grossQuantity: number
  netQuantity: number
  netAmount: number
  model?: string
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

export function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + fn(item), 0)
}

export function isNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return message.includes('404') || message.includes('Not Found')
}

/** Extract premium usage items from a settled API result, returning [] on failure. */
export function extractPremiumUsageItems(
  result: PromiseSettledResult<{ stdout: string }>
): PremiumUsageItem[] {
  if (result.status !== 'fulfilled') return []
  const data = JSON.parse(result.value.stdout.trim()) as { usageItems?: PremiumUsageItem[] }
  return data.usageItems ?? []
}

export function sumGrossRequests(items: PremiumUsageItem[]): number {
  return Math.round(sumBy(items, i => i.grossQuantity))
}

export function sumNetCost(items: PremiumUsageItem[]): number {
  return roundCents(sumBy(items, i => i.netAmount))
}

export function parseBillingUsage(items: BillingUsageItem[]): ParsedBillingUsage {
  const premiumItems = items.filter(
    item => item.product === 'copilot' && item.sku === 'Copilot Premium Request'
  )
  const seatItems = items.filter(
    item => item.product === 'copilot' && item.sku === 'Copilot Business'
  )

  return {
    premiumRequests: Math.round(sumBy(premiumItems, item => item.quantity)),
    grossCost: roundCents(sumBy(premiumItems, item => item.grossAmount)),
    discount: roundCents(sumBy(premiumItems, item => item.discountAmount)),
    netCost: roundCents(sumBy(premiumItems, item => item.netAmount)),
    businessSeats: roundCents(sumBy(seatItems, item => item.quantity)),
  }
}

/** Parse a Copilot budget from a settled API result. */
export function extractBudgetFromResult(result: PromiseSettledResult<{ stdout: string }>): {
  budgetAmount: number | null
  preventFurtherUsage: boolean
} {
  const noBudget = { budgetAmount: null, preventFurtherUsage: false } as const
  if (result.status !== 'fulfilled') return noBudget
  const data = JSON.parse(result.value.stdout.trim()) as { budgets?: BudgetItem[] }
  const match = findCopilotBudget(data.budgets ?? [])
  if (!match) return noBudget
  return {
    budgetAmount: match.budget_amount,
    preventFurtherUsage: match.prevent_further_usage,
  }
}

/** Parse premium-request spend from a settled API result. */
export function extractUsageSpend(result: PromiseSettledResult<{ stdout: string }>): number {
  if (result.status !== 'fulfilled') return 0
  const data = JSON.parse(result.value.stdout.trim()) as {
    usageItems?: Array<{ netAmount: number }>
  }
  const items = data.usageItems ?? []
  return roundCents(items.reduce((sum, item) => sum + item.netAmount, 0))
}

export function computeOverageSpend(quotaData: Record<string, unknown>): number {
  const snapshots = quotaData.quota_snapshots as Record<string, unknown> | undefined
  const premium = snapshots?.premium_interactions as Record<string, unknown> | undefined
  if (!premium) return 0
  const defaults = { overage_count: 0, remaining: 0 }
  const { overage_count, remaining } = { ...defaults, ...premium } as {
    overage_count: number
    remaining: number
  }
  return roundCents(
    Math.max(Math.max(0, overage_count), Math.max(0, -remaining)) * OVERAGE_COST_PER_REQUEST
  )
}

export function classifyCliTokenError(
  errorMessage: string,
  username: string | undefined,
  cause: unknown
): Error {
  if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
    return new Error('GitHub CLI (gh) is not installed. Install from: https://cli.github.com/', {
      cause,
    })
  }
  if (errorMessage.includes('not logged in')) {
    return new Error(
      `Not logged in to GitHub CLI${username ? ` for account '${username}'` : ''}. Run: gh auth login`,
      { cause }
    )
  }
  if (errorMessage.includes('no account found')) {
    return new Error(
      `GitHub account '${username}' not found in GitHub CLI. Run: gh auth login -h github.com`,
      { cause }
    )
  }
  return new Error(errorMessage, { cause })
}
