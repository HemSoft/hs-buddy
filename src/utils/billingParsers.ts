import { findCopilotBudget, type BudgetItem } from './budgetUtils'
import { OVERAGE_COST_PER_CREDIT } from '../components/copilot-usage/quotaUtils'
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
  /** Dominant Copilot seat plan inferred from seat SKUs: 'enterprise' | 'business' | ''. */
  seatPlan: string
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

export { isNotFoundError } from './errorUtils'

/** Parse JSON from a fulfilled settled result, returning null on failure. */
function parseFulfilledStdout<T>(result: PromiseSettledResult<{ stdout: string }>): T | null {
  if (result.status !== 'fulfilled') return null

  const stdout = result.value.stdout.trim()
  if (!stdout) return null

  try {
    return JSON.parse(stdout) as T
  } catch (_: unknown) {
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

/**
 * Copilot usage SKUs counted as billable requests/credits.
 * "Copilot AI Credits" is the June 2026+ usage-based billing SKU;
 * "Copilot Premium Request" is retained for pre-June historical data.
 */
const COPILOT_USAGE_SKUS = new Set(['Copilot AI Credits', 'Copilot Premium Request'])

/**
 * Per-seat Copilot subscription SKUs. Their billed `quantity` equals the org's
 * seat count, used as a fallback denominator for the AI Credit allotment.
 * 'Copilot Enterprise' was previously omitted, zeroing seat counts for enterprise orgs.
 */
const COPILOT_SEAT_SKUS = new Set(['Copilot Business', 'Copilot Enterprise'])

const SEAT_SKU_TO_PLAN: ReadonlyArray<{ sku: string; plan: string }> = [
  { sku: 'Copilot Enterprise', plan: 'enterprise' },
  { sku: 'Copilot Business', plan: 'business' },
]

/** Infer the dominant seat plan from the seat SKUs that carry quantity. */
function inferSeatPlan(items: BillingUsageItem[]): string {
  for (const { sku, plan } of SEAT_SKU_TO_PLAN) {
    const qty = sumBy(
      items.filter(item => item.product === 'copilot' && item.sku === sku),
      item => item.quantity
    )
    if (qty > 0) return plan
  }
  return ''
}

export function parseBillingUsage(items: BillingUsageItem[]): ParsedBillingUsage {
  const premiumItems = items.filter(
    item => item.product === 'copilot' && COPILOT_USAGE_SKUS.has(item.sku)
  )
  const seatItems = items.filter(
    item => item.product === 'copilot' && COPILOT_SEAT_SKUS.has(item.sku)
  )

  return {
    premiumRequests: Math.round(sumBy(premiumItems, item => item.quantity)),
    grossCost: roundCents(sumBy(premiumItems, item => item.grossAmount)),
    discount: roundCents(sumBy(premiumItems, item => item.discountAmount)),
    netCost: roundCents(sumBy(premiumItems, item => item.netAmount)),
    businessSeats: roundCents(sumBy(seatItems, item => item.quantity)),
    seatPlan: inferSeatPlan(items),
  }
}

/**
 * Extract Copilot usage spend (net) and gross consumption from a settled
 * `/orgs/{org}/settings/billing/usage` result. Filters to Copilot *usage* SKUs
 * so per-seat subscription cost is excluded from "spend".
 */
export function extractCopilotSpend(result: PromiseSettledResult<{ stdout: string }>): {
  net: number
  gross: number
} {
  const data = parseFulfilledStdout<{ usageItems?: BillingUsageItem[] }>(result)
  const parsed = parseBillingUsage(data?.usageItems ?? [])
  return { net: parsed.netCost, gross: parsed.grossCost }
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
    Math.max(Math.max(0, overage_count), Math.max(0, -remaining)) * OVERAGE_COST_PER_CREDIT
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
