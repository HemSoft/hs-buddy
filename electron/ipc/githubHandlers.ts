import { ipcMain } from 'electron'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { CONVEX_URL } from '../config'
import { execAsync, execFileAsync } from '../utils'
import { findBudgetAcrossPages } from '../../src/utils/budgetUtils'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import {
  parseActiveGitHubAccount,
  buildGhAuthTokenArgs,
  validateCliToken,
} from '../../src/utils/githubAuthUtils'
import {
  type BillingUsageItem,
  type ParsedBillingUsage,
  type CopilotUsageMetrics,
  type PremiumUsageItem,
  isNotFoundError,
  extractPremiumUsageItems,
  sumGrossRequests,
  sumNetCost,
  parseBillingUsage,
  extractBudgetFromResult,
  extractUsageSpend,
  computeOverageSpend,
  classifyCliTokenError,
  assembleCopilotMetrics,
} from '../../src/utils/billingParsers'

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
export const PERSONAL_BUDGETS: Record<string, number> = {}

type ExecAsyncSettledResult = PromiseSettledResult<Awaited<ReturnType<typeof execAsync>>>
type CliStdoutSettledResult = PromiseSettledResult<{ stdout: string }>

function asCliStdoutSettledResult(result: ExecAsyncSettledResult): CliStdoutSettledResult {
  return result as CliStdoutSettledResult
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
  } catch (_: unknown) {
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

/** Aggregated Copilot usage metrics for a single org, reused by the
 *  live IPC handler and the snapshot collection path. */
// (CopilotUsageMetrics is now exported from billingParsers.ts)

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
): Promise<ReturnType<typeof assembleCopilotMetrics>> {
  const execEnv = await getTokenEnv(username)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1

  // --- usage ---
  let usage: ParsedBillingUsage = {
    premiumRequests: 0,
    grossCost: 0,
    discount: 0,
    netCost: 0,
    businessSeats: 0,
  }
  let usageOk = false

  try {
    usage = await fetchBillingUsage(org, execEnv)
    usageOk = true
  } catch (error: unknown) {
    if (!isNotFoundError(error)) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  // --- budget & spend ---
  let budgetAmount: number | null = null
  let spent = 0

  const knownPersonalBudget = PERSONAL_BUDGETS[org.toLowerCase()]
  if (knownPersonalBudget !== undefined) {
    budgetAmount = knownPersonalBudget
  } else {
    try {
      const result = await fetchBudgetAndSpend(org, year, month, execEnv)
      budgetAmount = result.budgetAmount
      spent = result.spent
    } catch (_: unknown) {
      // budget/spend fetch is best-effort; usage metrics still valid
    }
  }

  return assembleCopilotMetrics({
    org,
    usageOk,
    usage,
    budgetAmount,
    spent,
    month,
    year,
    fetchedAt: Date.now(),
  })
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
  } catch (quotaError: unknown) {
    console.warn(`Quota-based spend fallback failed for '${org}':`, getErrorMessage(quotaError))
    return { spent: 0, spentError: getErrorMessage(quotaError) }
  }
}

function getSettledCommandError(
  org: string,
  label: 'Budget' | 'Usage',
  result: ExecAsyncSettledResult
): string | null {
  if (result.status === 'fulfilled') return null
  const errorMessage = getErrorMessage(result.reason)
  console.warn(`${label} fetch failed for '${org}':`, errorMessage)
  return errorMessage
}

async function resolveEnterpriseBudgetFallback(
  org: string,
  budgetAmount: number | null,
  preventFurtherUsage: boolean,
  execEnv: NodeJS.ProcessEnv
): Promise<{ budgetAmount: number | null; preventFurtherUsage: boolean }> {
  if (budgetAmount !== null) {
    return { budgetAmount, preventFurtherUsage }
  }

  try {
    const match = await findBudgetAcrossPages(async page => {
      const entResult = await execAsync(
        `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/budgets?page=${page}" -H "X-GitHub-Api-Version: 2022-11-28"`,
        { encoding: 'utf8', timeout: API_TIMEOUT_LONG_MS, env: execEnv }
      )
      return JSON.parse(entResult.stdout.trim())
    }, org)
    if (match) {
      return {
        budgetAmount: match.budget_amount,
        preventFurtherUsage: match.prevent_further_usage,
      }
    }
  } catch (entError: unknown) {
    console.warn(`Enterprise budget fallback failed:`, getErrorMessage(entError))
  }

  return { budgetAmount, preventFurtherUsage }
}

function resolveSpendState(
  org: string,
  usageResult: ExecAsyncSettledResult
): { spent: number; spentError: string | null } {
  return {
    spent: extractUsageSpend(asCliStdoutSettledResult(usageResult)),
    spentError: getSettledCommandError(org, 'Usage', usageResult),
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

  const extractedBudget = extractBudgetFromResult(asCliStdoutSettledResult(budgetResult))
  const budgetState = await resolveEnterpriseBudgetFallback(
    org,
    extractedBudget.budgetAmount,
    extractedBudget.preventFurtherUsage,
    execEnv
  )
  const spentState = resolveSpendState(org, usageResult)

  return {
    ...budgetState,
    budgetError: getSettledCommandError(org, 'Budget', budgetResult),
    ...spentState,
  }
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

interface RawCopilotSeat {
  assignee?: { login: string; name?: string | null }
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
    displayName: toNullableString(seat.assignee?.name),
    planType: toNullableString(seat.plan_type),
    lastActivityAt: toNullableString(seat.last_activity_at),
    lastActivityEditor: toNullableString(seat.last_activity_editor),
    createdAt: toNullableString(seat.created_at),
    pendingCancellation: toNullableString(seat.pending_cancellation_date),
  }
}

type BatchResult = Record<string, { requests: number; lastActiveDate: string | null }>

const BATCH_CONCURRENCY = 10

async function fetchMonthlyTotals(
  logins: string[],
  year: number,
  month: number,
  execEnv: NodeJS.ProcessEnv
): Promise<BatchResult> {
  const results: BatchResult = {}
  for (let i = 0; i < logins.length; i += BATCH_CONCURRENCY) {
    const batch = logins.slice(i, i + BATCH_CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map(async login => {
        const encoded = encodeURIComponent(login)
        const { stdout } = await execAsync(
          `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/premium_request/usage?year=${year}&month=${month}&user=${encoded}&product=Copilot" -H "X-GitHub-Api-Version: 2022-11-28"`,
          { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
        )
        const data = JSON.parse(stdout.trim()) as { usageItems?: PremiumUsageItem[] }
        return { login, requests: sumGrossRequests(data.usageItems ?? []) }
      })
    )
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results[result.value.login] = { requests: result.value.requests, lastActiveDate: null }
      }
    }
  }
  return results
}

function getRemainingActiveLogins(results: BatchResult): string[] {
  return Object.entries(results)
    .filter(([, value]) => value.requests > 0)
    .map(([login]) => login)
}

function buildUsageDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function hasRequestsForDay(
  result: PromiseSettledResult<{ login: string; dayRequests: number }>
): result is PromiseFulfilledResult<{ login: string; dayRequests: number }> {
  return result.status === 'fulfilled' && result.value.dayRequests > 0
}

function assignLastActiveDate(results: BatchResult, logins: string[], dateStr: string): void {
  for (const login of logins) {
    results[login].lastActiveDate = dateStr
  }
}

async function probeBatchDayActivity(
  batch: string[],
  year: number,
  month: number,
  day: number,
  execEnv: NodeJS.ProcessEnv
): Promise<string[]> {
  const settled = await Promise.allSettled(
    batch.map(async login => {
      const encoded = encodeURIComponent(login)
      const { stdout } = await execAsync(
        `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/premium_request/usage?year=${year}&month=${month}&day=${day}&user=${encoded}&product=Copilot" -H "X-GitHub-Api-Version: 2022-11-28"`,
        { encoding: 'utf8', timeout: API_TIMEOUT_MS, env: execEnv }
      )
      const data = JSON.parse(stdout.trim()) as { usageItems?: PremiumUsageItem[] }
      return { login, dayRequests: sumGrossRequests(data.usageItems ?? []) }
    })
  )

  return settled.flatMap(result => (hasRequestsForDay(result) ? [result.value.login] : []))
}

async function probeDateActivity(
  remaining: string[],
  year: number,
  month: number,
  day: number,
  execEnv: NodeJS.ProcessEnv
): Promise<string[]> {
  const foundThisDay: string[] = []

  for (let i = 0; i < remaining.length; i += BATCH_CONCURRENCY) {
    const batch = remaining.slice(i, i + BATCH_CONCURRENCY)
    foundThisDay.push(...(await probeBatchDayActivity(batch, year, month, day, execEnv)))
  }

  return foundThisDay
}

async function probeDayActivity(
  results: BatchResult,
  year: number,
  month: number,
  today: number,
  execEnv: NodeJS.ProcessEnv
): Promise<void> {
  let remaining = getRemainingActiveLogins(results)
  const maxLookback = Math.min(today, 14)

  for (let offset = 0; offset < maxLookback && remaining.length > 0; offset++) {
    const day = today - offset
    const dateStr = buildUsageDateString(year, month, day)
    const foundThisDay = await probeDateActivity(remaining, year, month, day, execEnv)
    assignLastActiveDate(results, foundThisDay, dateStr)
    remaining = remaining.filter(login => !foundThisDay.includes(login))
  }
}

type CopilotSeatResponse = {
  total_seats: number
  seats: RawCopilotSeat[]
}

function getSeatFallbackLogin(seat: RawCopilotSeat): string {
  return seat.assignee?.login ?? 'unknown'
}

function mapCopilotSeats(seats: RawCopilotSeat[]): ReturnType<typeof mapCopilotSeatData>[] {
  return seats.map(seat => mapCopilotSeatData(seat, getSeatFallbackLogin(seat)))
}

function hasLoadedAllCopilotSeats(
  fetchedSeatCount: number,
  totalSeats: number,
  seats: RawCopilotSeat[]
): boolean {
  return fetchedSeatCount >= totalSeats || seats.length < 100
}

async function fetchCopilotSeats(
  org: string,
  execEnv: NodeJS.ProcessEnv
): Promise<{
  totalSeats: number
  fetchedSeats: number
  seats: ReturnType<typeof mapCopilotSeatData>[]
}> {
  const seats: ReturnType<typeof mapCopilotSeatData>[] = []
  let page = 1
  const maxPages = 10
  let totalSeats = 0

  while (page <= maxPages) {
    const { stdout } = await execAsync(
      `gh api "/orgs/${org}/copilot/billing/seats?per_page=100&page=${page}" -H "X-GitHub-Api-Version: 2022-11-28"`,
      { encoding: 'utf8', timeout: API_TIMEOUT_LONG_MS, env: execEnv }
    )
    const data = JSON.parse(stdout.trim()) as CopilotSeatResponse

    totalSeats = data.total_seats
    seats.push(...mapCopilotSeats(data.seats))

    if (hasLoadedAllCopilotSeats(seats.length, totalSeats, data.seats)) break
    page++
  }

  return { totalSeats, fetchedSeats: seats.length, seats }
}

function registerGitHubAuthHandlers(): void {
  ipcMain.handle(IPC_INVOKE.GITHUB_GET_CLI_TOKEN, async (_event, username?: string) => {
    try {
      const args = buildGhAuthTokenArgs(username)
      const { stdout, stderr } = await execFileAsync('gh', args, {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      })

      return validateCliToken(stdout, stderr, username)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('Failed to get GitHub CLI token:', errorMessage)
      throw classifyCliTokenError(errorMessage, username, error)
    }
  })

  ipcMain.handle(IPC_INVOKE.GITHUB_GET_ACTIVE_ACCOUNT, async () => {
    try {
      const { stderr } = await execAsync('gh auth status', {
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      })

      return parseActiveGitHubAccount(stderr)
    } catch (_: unknown) {
      return null
    }
  })

  ipcMain.handle(IPC_INVOKE.GITHUB_SWITCH_ACCOUNT, async (_event, username: string) => {
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
}

function registerCopilotUsageHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_USAGE,
    async (_event, org: string, username?: string) => {
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
            allItems: data.usageItems.filter(item => item.product === 'copilot'),
            fetchedAt: Date.now(),
          },
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error(`Failed to get Copilot usage for org '${org}':`, errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(IPC_INVOKE.GITHUB_GET_COPILOT_QUOTA, async (_event, username: string) => {
    try {
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

  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_BUDGET,
    async (_event, org: string, username?: string) => {
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
    }
  )
}

function registerCopilotMemberHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_MEMBER_USAGE,
    async (_event, org: string, memberLogin: string, username?: string) => {
      try {
        const execEnv = await getTokenEnv(username)
        const { stdout } = await execAsync(`gh api "/orgs/${org}/members/${memberLogin}/copilot"`, {
          encoding: 'utf8',
          timeout: API_TIMEOUT_MS,
          env: execEnv,
        })
        const seat = JSON.parse(stdout.trim()) as RawCopilotSeat
        return { success: true, data: mapCopilotSeatData(seat, memberLogin) }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        if (isNotFoundError(error)) return { success: true, data: null }
        console.error(
          `Failed to get Copilot member usage for '${memberLogin}' in '${org}':`,
          errorMessage
        )
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_USER_PREMIUM_REQUESTS,
    async (_event, org: string, memberLogin: string, username?: string) => {
      try {
        return { success: true, data: await fetchUserPremiumRequests(org, memberLogin, username) }
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

  registerCopilotSeatHandlers()
}

async function fetchUserPremiumRequests(org: string, memberLogin: string, username?: string) {
  const execEnv = await getTokenEnv(username)
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const encodedLogin = encodeURIComponent(memberLogin)

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
    memberLogin,
    org,
    userMonthlyRequests,
    userTodayRequests,
    userMonthlyModels,
    orgMonthlyRequests,
    orgMonthlyNetCost,
    billingYear: year,
    billingMonth: month,
  }
}

function registerCopilotSeatHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_SEATS,
    async (_event, org: string, username?: string) => {
      try {
        const execEnv = await getTokenEnv(username)
        return {
          success: true,
          data: await fetchCopilotSeats(org, execEnv),
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        if (isNotFoundError(error)) {
          return { success: true, data: { totalSeats: 0, fetchedSeats: 0, seats: [] } }
        }
        console.error(`Failed to get Copilot seats for org '${org}':`, errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_BATCH_MONTHLY_REQUESTS,
    async (_event, logins: string[], username?: string, skipDayProbing?: boolean) => {
      try {
        const execEnv = await getTokenEnv(username)
        const now = new Date()
        const year = now.getUTCFullYear()
        const month = now.getUTCMonth() + 1
        const today = now.getUTCDate()

        const results = await fetchMonthlyTotals(logins, year, month, execEnv)

        if (skipDayProbing) {
          return { success: true, data: results }
        }

        await probeDayActivity(results, year, month, today, execEnv)
        return { success: true, data: results }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error('Failed to batch-fetch monthly requests:', errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IPC_INVOKE.GITHUB_COLLECT_COPILOT_SNAPSHOTS,
    async (_event, accounts: Array<{ username: string; org: string }>) =>
      collectCopilotSnapshots(accounts)
  )
}

async function collectCopilotSnapshots(
  accounts: Array<{ username: string; org: string }>
): Promise<{
  results: Array<
    | { success: true; data: CopilotUsageMetrics }
    | { success: false; username: string; org: string; error: string }
  >
}> {
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
          ...(result.data.budgetAmount != null ? { budgetAmount: result.data.budgetAmount } : {}),
          spent: result.data.spent,
        })
      } catch (storeErr: unknown) {
        console.error(`[Snapshot] Failed to persist for ${username}@${org}:`, storeErr)
      }
      results.push(result)
    } else {
      results.push({ success: false, username, org, error: result.error })
    }
  }

  return { results }
}

export function registerGitHubHandlers(): void {
  registerGitHubAuthHandlers()
  registerCopilotUsageHandlers()
  registerCopilotMemberHandlers()
}
