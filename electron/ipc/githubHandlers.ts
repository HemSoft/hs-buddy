import { ipcMain } from 'electron'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { CONVEX_URL } from '../config'
import { execAsync } from '../utils'
import {
  findCopilotBudget,
  findBudgetAcrossPages,
  type BudgetItem,
} from '../../src/utils/budgetUtils'
import { OVERAGE_COST_PER_REQUEST } from '../../src/components/copilot-usage/quotaUtils'

/** Timeout for local CLI commands (auth token, auth status, account switch). */
const CLI_TIMEOUT_MS = 5000

/** Timeout for single GitHub API calls. */
const API_TIMEOUT_MS = 15000

/** Timeout for paginated / enterprise-wide API calls. */
const API_TIMEOUT_LONG_MS = 20000

/** Enterprise slug for billing API calls.
 *  TODO: make configurable instead of hardcoding (see original TODO at the call sites). */
const ENTERPRISE_SLUG = 'Bertelsmann'

/** Personal GitHub accounts that lack org-level billing API access.
 *  Maps org name (lowercase) to a known monthly budget limit.
 *  Billing API calls are skipped entirely for these orgs. */
const PERSONAL_BUDGETS: Record<string, number> = {
  hemsoft: 50,
}

function isNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return message.includes('404') || message.includes('Not Found')
}

async function tryGetCliToken(username?: string): Promise<string | null> {
  if (!username) {
    return null
  }

  try {
    const { stdout } = await execAsync(`gh auth token --user ${username}`, {
      encoding: 'utf8',
      timeout: CLI_TIMEOUT_MS,
    })
    const token = stdout.trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

/** Build an exec env with an optional per-account GH_TOKEN. */
async function getTokenEnv(username?: string): Promise<NodeJS.ProcessEnv> {
  const token = await tryGetCliToken(username)
  return {
    ...process.env,
    ...(token ? { GH_TOKEN: token } : {}),
  }
}

/** Shape returned by /orgs/{org}/settings/billing/usage */
interface BillingUsageItem {
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

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

interface ParsedBillingUsage {
  premiumRequests: number
  grossCost: number
  discount: number
  netCost: number
  businessSeats: number
}

function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + fn(item), 0)
}

/** Shape returned by enterprise/org premium request usage APIs. */
interface PremiumUsageItem {
  grossQuantity: number
  netQuantity: number
  netAmount: number
  model?: string
}

/** Extract premium usage items from a settled API result, returning [] on failure. */
function extractPremiumUsageItems(
  result: PromiseSettledResult<{ stdout: string }>
): PremiumUsageItem[] {
  if (result.status !== 'fulfilled') return []
  const data = JSON.parse(result.value.stdout.trim()) as { usageItems?: PremiumUsageItem[] }
  return data.usageItems ?? []
}

function sumGrossRequests(items: PremiumUsageItem[]): number {
  return Math.round(sumBy(items, i => i.grossQuantity))
}

function sumNetCost(items: PremiumUsageItem[]): number {
  return roundCents(sumBy(items, i => i.netAmount))
}

function parseBillingUsage(items: BillingUsageItem[]): ParsedBillingUsage {
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

/** Aggregated Copilot usage metrics for a single org, reused by the
 *  live IPC handler and the snapshot collection path. */
interface CopilotUsageMetrics {
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

/** Try the org billing endpoint, then fall back to user.
 *  Returns ParsedBillingUsage. Throws on non-404 errors. */
async function fetchBillingUsage(
  org: string,
  execEnv: NodeJS.ProcessEnv
): Promise<ParsedBillingUsage> {
  let stdout: string
  try {
    const result = await execAsync(`gh api /orgs/${org}/settings/billing/usage`, {
      encoding: 'utf8',
      timeout: API_TIMEOUT_MS,
      env: execEnv,
    })
    stdout = result.stdout
  } catch (orgError: unknown) {
    if (!isNotFoundError(orgError)) throw orgError
    const result = await execAsync(`gh api /users/${org}/settings/billing/usage`, {
      encoding: 'utf8',
      timeout: API_TIMEOUT_MS,
      env: execEnv,
    })
    stdout = result.stdout
  }

  const data = JSON.parse(stdout.trim()) as { usageItems: BillingUsageItem[] }
  return parseBillingUsage(data.usageItems)
}

/** Parse a Copilot budget from a settled API result. */
function extractBudgetFromResult(result: PromiseSettledResult<{ stdout: string }>): {
  budgetAmount: number | null
  preventFurtherUsage: boolean
} {
  if (result.status !== 'fulfilled') {
    return { budgetAmount: null, preventFurtherUsage: false }
  }
  const data = JSON.parse(result.value.stdout.trim()) as { budgets?: BudgetItem[] }
  const match = findCopilotBudget(data.budgets ?? [])
  return {
    budgetAmount: match?.budget_amount ?? null,
    preventFurtherUsage: match?.prevent_further_usage ?? false,
  }
}

/** Parse premium-request spend from a settled API result. */
function extractUsageSpend(result: PromiseSettledResult<{ stdout: string }>): number {
  if (result.status !== 'fulfilled') return 0
  const data = JSON.parse(result.value.stdout.trim()) as {
    usageItems?: Array<{ netAmount: number }>
  }
  return roundCents(data.usageItems?.reduce((sum, item) => sum + item.netAmount, 0) ?? 0)
}

/** Fetch budget + premium request spend for a non-personal org. */
async function fetchBudgetAndSpend(
  org: string,
  year: number,
  month: number,
  execEnv: NodeJS.ProcessEnv
): Promise<{ budgetAmount: number | null; spent: number }> {
  const [budgetResult, spendResult] = await Promise.allSettled([
    execAsync(
      `gh api /organizations/${org}/settings/billing/budgets -H "X-GitHub-Api-Version: 2022-11-28"`,
      { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
    ),
    execAsync(
      `gh api "/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}" -H "X-GitHub-Api-Version: 2022-11-28"`,
      { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
    ),
  ])

  return {
    budgetAmount: extractBudgetFromResult(budgetResult).budgetAmount,
    spent: extractUsageSpend(spendResult),
  }
}

/** Fetch Copilot usage + budget metrics for an org.
 *  Extracted so both the live IPC handler and the snapshot collector
 *  call the same upstream path. */
export async function fetchCopilotMetrics(
  org: string,
  username?: string
): Promise<{ success: true; data: CopilotUsageMetrics } | { success: false; error: string }> {
  const execEnv = await getTokenEnv(username)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1

  // --- usage ---
  let premiumRequests = 0
  let grossCost = 0
  let discount = 0
  let netCost = 0
  let businessSeats = 0
  let usageOk = false

  try {
    const parsed = await fetchBillingUsage(org, execEnv)
    premiumRequests = parsed.premiumRequests
    grossCost = parsed.grossCost
    discount = parsed.discount
    netCost = parsed.netCost
    businessSeats = parsed.businessSeats
    usageOk = true
  } catch (error: unknown) {
    const msg = getErrorMessage(error)
    if (!isNotFoundError(error)) {
      return { success: false, error: msg }
    }
  }

  // --- budget & spend ---
  let budgetAmount: number | null = null
  let spent = 0

  const knownPersonalBudget = PERSONAL_BUDGETS[org.toLowerCase()]
  if (knownPersonalBudget !== undefined) {
    // Personal accounts don't expose org-level billing APIs — skip to avoid 404 noise
    budgetAmount = knownPersonalBudget
  } else {
    try {
      const result = await fetchBudgetAndSpend(org, year, month, execEnv)
      budgetAmount = result.budgetAmount
      spent = result.spent
    } catch {
      // budget/spend fetch is best-effort; usage metrics still valid
    }
  }

  if (!usageOk && budgetAmount === null) {
    return { success: false, error: `No billing data available for '${org}'` }
  }

  return {
    success: true,
    data: {
      org,
      premiumRequests,
      grossCost,
      discount,
      netCost,
      businessSeats,
      budgetAmount,
      spent,
      billingMonth: month,
      billingYear: year,
      fetchedAt: Date.now(),
    },
  }
}

/** Try org billing endpoint, fall back to user. Throws descriptive error on double-404. */
async function fetchOrgOrUserBillingUsage(
  org: string,
  execEnv: NodeJS.ProcessEnv
): Promise<string> {
  try {
    const result = await execAsync(`gh api /orgs/${org}/settings/billing/usage`, {
      encoding: 'utf8',
      timeout: API_TIMEOUT_MS,
      env: execEnv,
    })
    return result.stdout
  } catch (orgError: unknown) {
    if (!isNotFoundError(orgError)) throw orgError

    try {
      const result = await execAsync(`gh api /users/${org}/settings/billing/usage`, {
        encoding: 'utf8',
        timeout: API_TIMEOUT_MS,
        env: execEnv,
      })
      return result.stdout
    } catch (userError: unknown) {
      if (isNotFoundError(userError)) {
        throw new Error(
          `No billing access for '${org}'. This may be a user account — billing data requires the 'user' token scope, or '${org}' may not be a valid org.`,
          { cause: userError }
        )
      }
      throw userError
    }
  }
}

function computeOverageSpend(quotaData: Record<string, unknown>): number {
  const premium = (quotaData?.quota_snapshots as Record<string, unknown>)?.premium_interactions as
    | Record<string, unknown>
    | undefined
  if (!premium) return 0
  const overageByCount = Math.max(0, (premium.overage_count as number) ?? 0)
  const overageByRemaining = Math.max(0, -((premium.remaining as number) ?? 0))
  return roundCents(Math.max(overageByCount, overageByRemaining) * OVERAGE_COST_PER_REQUEST)
}

/** Compute spend for a personal account using the internal quota endpoint. */
async function fetchPersonalAccountSpend(
  org: string,
  username?: string
): Promise<{ spent: number; spentError: string | null }> {
  const quotaToken = await tryGetCliToken(username)
  if (!quotaToken) return { spent: 0, spentError: null }

  try {
    const quotaResult = await execAsync('gh api /copilot_internal/user', {
      encoding: 'utf8',
      timeout: API_TIMEOUT_MS,
      env: { ...process.env, GH_TOKEN: quotaToken },
    })
    const quotaData = JSON.parse(quotaResult.stdout.trim())
    return { spent: computeOverageSpend(quotaData), spentError: null }
  } catch (quotaError) {
    console.warn(`Quota-based spend fallback failed for '${org}':`, getErrorMessage(quotaError))
    return { spent: 0, spentError: getErrorMessage(quotaError) }
  }
}

/** Fetch budget + spend for an org via billing APIs, with enterprise budget fallback. */
async function fetchOrgBudgetAndSpend(
  org: string,
  year: number,
  month: number,
  execEnv: NodeJS.ProcessEnv
): Promise<{
  budgetAmount: number | null
  preventFurtherUsage: boolean
  budgetError: string | null
  spent: number
  spentError: string | null
}> {
  const [budgetResult, usageResult] = await Promise.allSettled([
    execAsync(
      `gh api /organizations/${org}/settings/billing/budgets -H "X-GitHub-Api-Version: 2022-11-28"`,
      { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
    ),
    execAsync(
      `gh api "/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}" -H "X-GitHub-Api-Version: 2022-11-28"`,
      { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
    ),
  ])

  let { budgetAmount, preventFurtherUsage } = extractBudgetFromResult(budgetResult)
  let budgetError: string | null = null

  if (budgetResult.status !== 'fulfilled') {
    budgetError = getErrorMessage(budgetResult.reason)
    console.warn(`Budget fetch failed for '${org}':`, budgetError)
  }

  // Fall back to enterprise-level budget if still no copilot budget found
  if (budgetAmount === null) {
    try {
      const match = await findBudgetAcrossPages(async page => {
        const entResult = await execAsync(
          `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/budgets?page=${page}" -H "X-GitHub-Api-Version: 2022-11-28"`,
          { encoding: 'utf8', timeout: API_TIMEOUT_LONG_MS, env: execEnv }
        )
        return JSON.parse(entResult.stdout.trim())
      }, org)
      if (match) {
        budgetAmount = match.budget_amount
        preventFurtherUsage = match.prevent_further_usage
      }
    } catch (entError) {
      console.warn(`Enterprise budget fallback failed:`, getErrorMessage(entError))
    }
  }

  const spent = extractUsageSpend(usageResult)
  let spentError: string | null = null

  if (usageResult.status !== 'fulfilled') {
    spentError = getErrorMessage(usageResult.reason)
    console.warn(`Usage fetch failed for '${org}':`, spentError)
  }

  return { budgetAmount, preventFurtherUsage, budgetError, spent, spentError }
}

async function resolveBudgetData(
  org: string,
  year: number,
  month: number,
  execEnv: NodeJS.ProcessEnv,
  username?: string
): Promise<{
  budgetAmount: number | null
  preventFurtherUsage: boolean
  spent: number
  spentUnavailable: boolean
  useQuotaOverage: boolean
}> {
  const isPersonalAccount = PERSONAL_BUDGETS[org.toLowerCase()] !== undefined

  if (isPersonalAccount) {
    const budgetAmount = PERSONAL_BUDGETS[org.toLowerCase()]
    const personalResult = await fetchPersonalAccountSpend(org, username)
    return {
      budgetAmount,
      preventFurtherUsage: false,
      spent: personalResult.spent,
      spentUnavailable: !!personalResult.spentError,
      useQuotaOverage: false,
    }
  }

  const orgResult = await fetchOrgBudgetAndSpend(org, year, month, execEnv)

  if (orgResult.budgetError && orgResult.spentError) {
    const is404 = orgResult.budgetError.includes('404') || orgResult.spentError.includes('404')
    return {
      budgetAmount: null,
      preventFurtherUsage: false,
      spent: 0,
      spentUnavailable: true,
      useQuotaOverage: is404,
    }
  }

  return {
    budgetAmount: orgResult.budgetAmount,
    preventFurtherUsage: orgResult.preventFurtherUsage,
    spent: orgResult.spent,
    spentUnavailable: !!orgResult.spentError,
    useQuotaOverage: false,
  }
}

function classifyCliTokenError(
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

interface RawCopilotSeat {
  assignee?: { login: string }
  plan_type?: string
  last_activity_at?: string | null
  last_activity_editor?: string | null
  created_at?: string
  pending_cancellation_date?: string | null
}

function toNullableString(val: string | null | undefined): string | null {
  return val ?? null
}

function mapCopilotSeatData(seat: RawCopilotSeat, fallbackLogin: string) {
  return {
    login: seat.assignee?.login ?? fallbackLogin,
    planType: toNullableString(seat.plan_type),
    lastActivityAt: toNullableString(seat.last_activity_at),
    lastActivityEditor: toNullableString(seat.last_activity_editor),
    createdAt: toNullableString(seat.created_at),
    pendingCancellation: toNullableString(seat.pending_cancellation_date),
  }
}

export function registerGitHubHandlers(): void {
  // Get a GitHub CLI auth token for a specific account
  ipcMain.handle('github:get-cli-token', async (_event, username?: string) => {
    try {
      const command = username ? `gh auth token --user ${username}` : 'gh auth token'
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      })

      if (stderr && !stderr.includes('Logging in to')) {
        console.warn('gh auth token stderr:', stderr)
      }

      const token = stdout.trim()
      if (!token) {
        const suffix = username ? ` for account '${username}'` : ''
        throw new Error(`GitHub CLI returned empty token${suffix}`)
      }

      return token
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('Failed to get GitHub CLI token:', errorMessage)
      throw classifyCliTokenError(errorMessage, username, error)
    }
  })

  // Get the currently-active GitHub CLI account (used for Copilot CLI, git ops, etc.)
  ipcMain.handle('github:get-active-account', async () => {
    try {
      // `gh auth status` outputs account info to stderr; parse for "Active account: true"
      const { stderr } = await execAsync('gh auth status', {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      })

      // Parse lines: look for "Logged in to ... account <name>" followed by "Active account: true"
      const lines = stderr.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const accountMatch = lines[i].match(/Logged in to .+ account (\S+)/)
        if (accountMatch) {
          // Check the next few lines for "Active account: true"
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (lines[j].includes('Active account: true')) {
              return accountMatch[1]
            }
          }
        }
      }

      return null
    } catch {
      return null
    }
  })

  // Get Copilot premium request usage for an org via gh api
  ipcMain.handle('github:get-copilot-usage', async (_event, org: string, username?: string) => {
    try {
      const execEnv = await getTokenEnv(username)
      const stdout = await fetchOrgOrUserBillingUsage(org, execEnv)

      const data = JSON.parse(stdout.trim()) as { usageItems: BillingUsageItem[] }
      const parsed = parseBillingUsage(data.usageItems)

      return {
        success: true,
        data: {
          org,
          ...parsed,
          // Include raw items for detailed view
          allItems: data.usageItems.filter(item => item.product === 'copilot'),
          fetchedAt: Date.now(),
        },
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Failed to get Copilot usage for org '${org}':`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Get per-account Copilot quota via the internal endpoint
  ipcMain.handle('github:get-copilot-quota', async (_event, username: string) => {
    try {
      // Get a per-account token
      const token = await tryGetCliToken(username)
      if (!token) {
        return { success: false, error: `No token for account '${username}'` }
      }

      const { stdout } = await execAsync('gh api /copilot_internal/user', {
        encoding: 'utf8',
        timeout: API_TIMEOUT_MS,
        env: { ...process.env, GH_TOKEN: token },
      })

      const data = JSON.parse(stdout.trim())
      return { success: true, data }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Failed to get Copilot quota for '${username}':`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Get Copilot budget and current-month spend for an org
  ipcMain.handle('github:get-copilot-budget', async (_event, org: string, username?: string) => {
    try {
      const execEnv = await getTokenEnv(username)

      const now = new Date()
      const year = now.getUTCFullYear()
      const month = now.getUTCMonth() + 1

      const result = await resolveBudgetData(org, year, month, execEnv, username)

      return {
        success: true,
        data: {
          org,
          ...result,
          billingMonth: month,
          billingYear: year,
          fetchedAt: Date.now(),
        },
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Failed to get Copilot budget for org '${org}':`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Get Copilot seat/usage data for a specific org member
  ipcMain.handle(
    'github:get-copilot-member-usage',
    async (_event, org: string, memberLogin: string, username?: string) => {
      try {
        const execEnv = await getTokenEnv(username)
        const { stdout } = await execAsync(`gh api "/orgs/${org}/members/${memberLogin}/copilot"`, {
          encoding: 'utf8',
          timeout: API_TIMEOUT_MS,
          env: execEnv,
        })
        const seat = JSON.parse(stdout.trim()) as RawCopilotSeat
        return {
          success: true,
          data: mapCopilotSeatData(seat, memberLogin),
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        // 404 means user doesn't have a Copilot seat
        if (isNotFoundError(error)) {
          return { success: true, data: null }
        }
        console.error(
          `Failed to get Copilot member usage for '${memberLogin}' in '${org}':`,
          errorMessage
        )
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get per-user premium request usage from enterprise billing API (this month + today)
  // Also returns org-level totals for context.
  ipcMain.handle(
    'github:get-user-premium-requests',
    async (_event, org: string, memberLogin: string, username?: string) => {
      try {
        const execEnv = await getTokenEnv(username)
        const now = new Date()
        const year = now.getUTCFullYear()
        const month = now.getUTCMonth() + 1
        const day = now.getUTCDate()
        const encodedLogin = encodeURIComponent(memberLogin)

        // Fetch per-user month + per-user today + org month in parallel
        const [userMonthResult, userTodayResult, orgMonthResult] = await Promise.allSettled([
          execAsync(
            `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/premium_request/usage?year=${year}&month=${month}&user=${encodedLogin}&product=Copilot" -H "X-GitHub-Api-Version: 2022-11-28"`,
            { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
          ),
          execAsync(
            `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/premium_request/usage?year=${year}&month=${month}&day=${day}&user=${encodedLogin}&product=Copilot" -H "X-GitHub-Api-Version: 2022-11-28"`,
            { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
          ),
          execAsync(
            `gh api "/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}" -H "X-GitHub-Api-Version: 2022-11-28"`,
            { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
          ),
        ])

        const userMonthItems = extractPremiumUsageItems(userMonthResult)
        const userMonthlyRequests = sumGrossRequests(userMonthItems)
        const userMonthlyModels = userMonthItems
          .filter(i => i.grossQuantity > 0)
          .map(i => ({ model: i.model ?? 'unknown', requests: Math.round(i.grossQuantity) }))
          .sort((a, b) => b.requests - a.requests)

        const userTodayRequests = sumGrossRequests(extractPremiumUsageItems(userTodayResult))

        const orgMonthItems = extractPremiumUsageItems(orgMonthResult)
        const orgMonthlyRequests = sumGrossRequests(orgMonthItems)
        const orgMonthlyNetCost = sumNetCost(orgMonthItems)

        return {
          success: true,
          data: {
            memberLogin,
            org,
            userMonthlyRequests,
            userTodayRequests,
            userMonthlyModels,
            orgMonthlyRequests,
            orgMonthlyNetCost,
            billingYear: year,
            billingMonth: month,
          },
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error(
          `Failed to get user premium requests for '${memberLogin}' in '${org}':`,
          errorMessage
        )
        return { success: false, error: errorMessage }
      }
    }
  )

  // Switch the active GitHub CLI account
  ipcMain.handle('github:switch-account', async (_event, username: string) => {
    try {
      await execAsync(`gh auth switch --user ${username}`, {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      })
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error(`Failed to switch to account '${username}':`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })

  // Collect Copilot usage snapshots for a list of accounts.
  // Returns an array of per-account results; failures are reported per-account
  // without corrupting previously stored history.
  ipcMain.handle(
    'github:collect-copilot-snapshots',
    async (
      _event,
      accounts: Array<{ username: string; org: string }>
    ): Promise<{
      results: Array<
        | { success: true; data: CopilotUsageMetrics }
        | { success: false; username: string; org: string; error: string }
      >
    }> => {
      const results: Array<
        | { success: true; data: CopilotUsageMetrics }
        | { success: false; username: string; org: string; error: string }
      > = []

      const client = new ConvexHttpClient(CONVEX_URL)

      for (const { username, org } of accounts) {
        const result = await fetchCopilotMetrics(org, username)
        if (result.success) {
          try {
            await client.mutation(api.copilotUsageHistory.store, {
              accountUsername: username,
              org: result.data.org,
              billingYear: result.data.billingYear,
              billingMonth: result.data.billingMonth,
              premiumRequests: result.data.premiumRequests,
              grossCost: result.data.grossCost,
              discount: result.data.discount,
              netCost: result.data.netCost,
              businessSeats: result.data.businessSeats,
              ...(result.data.budgetAmount != null
                ? { budgetAmount: result.data.budgetAmount }
                : {}),
              spent: result.data.spent,
            })
          } catch (storeErr) {
            console.error(`[Snapshot] Failed to persist for ${username}@${org}:`, storeErr)
          }
          results.push(result)
        } else {
          results.push({ success: false, username, org, error: result.error })
        }
      }

      return { results }
    }
  )
}
