import { findCopilotBudget, type BudgetItem } from './budgetUtils'
import { getErrorMessage } from './errorUtils'
import { OVERAGE_COST_PER_REQUEST } from '../components/copilot-usage/quotaUtils'
import { sumBy } from './arrayUtils'

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

export { sumBy } from './arrayUtils'

export function isNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return message.includes('404') || message.includes('Not Found')
}

/** Parse JSON from a fulfilled settled result, returning null on failure. */
function parseFulfilledStdout<T>(result: PromiseSettledResult<{ stdout: string }>): T | null {
  if (result.status !== 'fulfilled') return null

  const stdout = result.value.stdout.trim()
  if (!stdout) return null

  try {
    return JSON.parse(stdout) as T
  } catch {
    return null
  }
}

/** Extract premium usage items from a settled API result, returning [] on failure. */
export function extractPremiumUsageItems(
  result: PromiseSettledResult<{ stdout: string }>
): PremiumUsageItem[] {
  const data = parseFulfilledStdout<{ usageItems?: PremiumUsageItem[] }>(result)
  return data?.usageItems ?? []
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
  const data = parseFulfilledStdout<{ budgets?: BudgetItem[] }>(result)
  if (!data) return noBudget
  const match = findCopilotBudget(data.budgets ?? [])
  if (!match) return noBudget
  return {
    budgetAmount: match.budget_amount,
    preventFurtherUsage: match.prevent_further_usage,
  }
}

/** Parse premium-request spend from a settled API result. */
export function extractUsageSpend(result: PromiseSettledResult<{ stdout: string }>): number {
  const data = parseFulfilledStdout<{ usageItems?: Array<{ netAmount: number }> }>(result)
  const items = data?.usageItems ?? []
  return roundCents(sumBy(items, item => item.netAmount))
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

const CLI_TOKEN_ERROR_PATTERNS: ReadonlyArray<{
  patterns: string[]
  message: (username: string | undefined) => string
}> = [
  {
    patterns: ['not found', 'ENOENT'],
    message: () => 'GitHub CLI (gh) is not installed. Install from: https://cli.github.com/',
  },
  {
    patterns: ['not logged in'],
    message: u =>
      `Not logged in to GitHub CLI${u ? ` for account '${u}'` : ''}. Run: gh auth login`,
  },
  {
    patterns: ['no account found'],
    message: u => `GitHub account '${u}' not found in GitHub CLI. Run: gh auth login -h github.com`,
  },
]

export function classifyCliTokenError(
  errorMessage: string,
  username: string | undefined,
  cause: unknown
): Error {
  const match = CLI_TOKEN_ERROR_PATTERNS.find(({ patterns }) =>
    patterns.some(p => errorMessage.includes(p))
  )
  return new Error(match ? match.message(username) : errorMessage, { cause })
}

/** Aggregated Copilot usage metrics for a single org. */
export interface CopilotUsageMetrics {
  org: string
  premiumRequests: number
  grossCost: number
  discount: number
  netCost: number
  businessSeats: number
  budgetAmount: number | null
  spent: number
  billingMonth: number
  billingYear: number
  fetchedAt: number
}

/**
 * Assemble the final Copilot metrics result from fetched usage and budget data.
 *
 * Encapsulates the success/failure decision policy: if both usage and budget
 * fetch failed, returns an error; otherwise returns whatever data succeeded.
 */
export function assembleCopilotMetrics(params: {
  org: string
  usageOk: boolean
  usage: ParsedBillingUsage
  budgetAmount: number | null
  spent: number
  month: number
  year: number
  fetchedAt: number
}): { success: true; data: CopilotUsageMetrics } | { success: false; error: string } {
  const { org, usageOk, usage, budgetAmount, spent, month, year, fetchedAt } = params

  if (!usageOk && budgetAmount === null) {
    return { success: false, error: `No billing data available for '${org}'` }
  }

  return {
    success: true,
    data: {
      org,
      premiumRequests: usage.premiumRequests,
      grossCost: usage.grossCost,
      discount: usage.discount,
      netCost: usage.netCost,
      businessSeats: usage.businessSeats,
      budgetAmount,
      spent,
      billingMonth: month,
      billingYear: year,
      fetchedAt,
    },
  }
}

/**
 * Build the output summary for a snapshot collection run.
 * Returns the stdout message and an exit code (0 = all succeeded, 1 = any failures).
 */
export function buildSnapshotCollectionOutput(
  succeeded: number,
  failed: number
): { stdout: string; exitCode: number } {
  return {
    stdout: `Snapshot collection: ${succeeded} succeeded, ${failed} failed`,
    exitCode: failed > 0 ? 1 : 0,
  }
}
