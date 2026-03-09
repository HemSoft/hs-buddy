import { ipcMain } from 'electron'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { execAsync, getErrorMessage } from '../utils'
import { CONVEX_URL } from '../config'

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
      timeout: 5000,
    })
    const token = stdout.trim()
    return token.length > 0 ? token : null
  } catch {
    return null
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

/** Aggregated Copilot usage metrics for a single org, reused by the
 *  live IPC handler and the snapshot collection path. */
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

/** Fetch Copilot usage + budget metrics for an org.
 *  Extracted so both the live IPC handler and the snapshot collector
 *  call the same upstream path. */
export async function fetchCopilotMetrics(
  org: string,
  username?: string,
): Promise<{ success: true; data: CopilotUsageMetrics } | { success: false; error: string }> {
  const token = await tryGetCliToken(username)
  const execEnv = {
    ...process.env,
    ...(token ? { GH_TOKEN: token } : {}),
  }

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
    let stdout: string
    try {
      const result = await execAsync(
        `gh api /orgs/${org}/settings/billing/usage`,
        { encoding: 'utf8', timeout: 15000, env: execEnv },
      )
      stdout = result.stdout
    } catch (orgError: unknown) {
      if (!isNotFoundError(orgError)) throw orgError
      const result = await execAsync(
        `gh api /users/${org}/settings/billing/usage`,
        { encoding: 'utf8', timeout: 15000, env: execEnv },
      )
      stdout = result.stdout
    }

    const data = JSON.parse(stdout.trim()) as { usageItems: BillingUsageItem[] }
    const copilotItems = data.usageItems.filter(
      (item) => item.product === 'copilot' && item.sku === 'Copilot Premium Request',
    )
    premiumRequests = Math.round(copilotItems.reduce((s, i) => s + i.quantity, 0))
    grossCost = Math.round(copilotItems.reduce((s, i) => s + i.grossAmount, 0) * 100) / 100
    discount = Math.round(copilotItems.reduce((s, i) => s + i.discountAmount, 0) * 100) / 100
    netCost = Math.round(copilotItems.reduce((s, i) => s + i.netAmount, 0) * 100) / 100
    const seatItems = data.usageItems.filter(
      (item) => item.product === 'copilot' && item.sku === 'Copilot Business',
    )
    businessSeats = Math.round(seatItems.reduce((s, i) => s + i.quantity, 0) * 100) / 100
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

  try {
    const [budgetResult, spendResult] = await Promise.allSettled([
      execAsync(
        `gh api /organizations/${org}/settings/billing/budgets -H "X-GitHub-Api-Version: 2022-11-28"`,
        { encoding: 'utf8', timeout: 15000, env: execEnv },
      ),
      execAsync(
        `gh api "/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}" -H "X-GitHub-Api-Version: 2022-11-28"`,
        { encoding: 'utf8', timeout: 15000, env: execEnv },
      ),
    ])

    if (budgetResult.status === 'fulfilled') {
      interface BudgetItem { budget_product_sku: string; budget_amount: number }
      const parsed = JSON.parse(budgetResult.value.stdout.trim()) as { budgets?: BudgetItem[] }
      const match = (parsed.budgets ?? []).find(
        (b) => b.budget_product_sku?.toLowerCase().includes('premium')
          || b.budget_product_sku?.toLowerCase().includes('copilot'),
      )
      if (match) budgetAmount = match.budget_amount
    }

    if (spendResult.status === 'fulfilled') {
      const parsed = JSON.parse(spendResult.value.stdout.trim()) as {
        usageItems?: Array<{ netAmount: number }>
      }
      spent = Math.round(
        (parsed.usageItems?.reduce((s, i) => s + i.netAmount, 0) ?? 0) * 100,
      ) / 100
    }
  } catch {
    // budget/spend fetch is best-effort; usage metrics still valid
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

export function registerGitHubHandlers(): void {
  // Get a GitHub CLI auth token for a specific account
  ipcMain.handle('github:get-cli-token', async (_event, username?: string) => {
    try {
      // Use --user flag to get account-specific token if username provided
      const command = username ? `gh auth token --user ${username}` : 'gh auth token'
      const { stdout, stderr } = await execAsync(command, {
        encoding: 'utf8',
        timeout: 5000,
      })

      if (stderr && !stderr.includes('Logging in to')) {
        console.warn('gh auth token stderr:', stderr)
      }

      const token = stdout.trim()
      if (!token || token.length === 0) {
        throw new Error(
          `GitHub CLI returned empty token${username ? ` for account '${username}'` : ''}`
        )
      }

      return token
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('Failed to get GitHub CLI token:', errorMessage)

      // Provide helpful error message
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        throw new Error('GitHub CLI (gh) is not installed. Install from: https://cli.github.com/')
      } else if (errorMessage.includes('not logged in')) {
        throw new Error(
          `Not logged in to GitHub CLI${username ? ` for account '${username}'` : ''}. Run: gh auth login`
        )
      } else if (errorMessage.includes('no account found')) {
        throw new Error(
          `GitHub account '${username}' not found in GitHub CLI. Run: gh auth login -h github.com`
        )
      }

      throw error
    }
  })

  // Get the currently-active GitHub CLI account (used for Copilot CLI, git ops, etc.)
  ipcMain.handle('github:get-active-account', async () => {
    try {
      // `gh auth status` outputs account info to stderr; parse for "Active account: true"
      const { stderr } = await execAsync('gh auth status', {
        encoding: 'utf8',
        timeout: 5000,
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
  ipcMain.handle(
    'github:get-copilot-usage',
    async (_event, org: string, username?: string) => {
      try {
        // Get a per-account token so we don't have to switch the global active account
        const token = await tryGetCliToken(username)

        const execEnv = {
          ...process.env,
          ...(token ? { GH_TOKEN: token } : {}),
        }

        // Try org endpoint first, then fall back to user endpoint
        let stdout: string
        try {
          const result = await execAsync(
            `gh api /orgs/${org}/settings/billing/usage`,
            { encoding: 'utf8', timeout: 15000, env: execEnv }
          )
          stdout = result.stdout
        } catch (orgError: unknown) {
          if (!isNotFoundError(orgError)) {
            throw orgError // re-throw non-404 errors
          }

          // Org endpoint failed with 404 — namespace might be a user account
          try {
            const result = await execAsync(
              `gh api /users/${org}/settings/billing/usage`,
              { encoding: 'utf8', timeout: 15000, env: execEnv }
            )
            stdout = result.stdout
          } catch (userError: unknown) {
            if (isNotFoundError(userError)) {
              return {
                success: false,
                error: `No billing access for '${org}'. This may be a user account — billing data requires the 'user' token scope, or '${org}' may not be a valid org.`,
              }
            }
            throw userError
          }
        }

        const data = JSON.parse(stdout.trim()) as { usageItems: BillingUsageItem[] }

        // Filter for Copilot Premium Request items
        const copilotItems = data.usageItems.filter(
          item => item.product === 'copilot' && item.sku === 'Copilot Premium Request'
        )

        // Sum up quantity across all billing entries
        const totalPremiumRequests = copilotItems.reduce((sum, item) => sum + item.quantity, 0)
        const totalCost = copilotItems.reduce((sum, item) => sum + item.grossAmount, 0)
        const totalDiscount = copilotItems.reduce((sum, item) => sum + item.discountAmount, 0)
        const totalNet = copilotItems.reduce((sum, item) => sum + item.netAmount, 0)

        // Also extract Copilot Business seat info
        const seatItems = data.usageItems.filter(
          item => item.product === 'copilot' && item.sku === 'Copilot Business'
        )
        const seatCount = seatItems.reduce((sum, item) => sum + item.quantity, 0)

        return {
          success: true,
          data: {
            org,
            premiumRequests: Math.round(totalPremiumRequests),
            grossCost: Math.round(totalCost * 100) / 100,
            discount: Math.round(totalDiscount * 100) / 100,
            netCost: Math.round(totalNet * 100) / 100,
            businessSeats: Math.round(seatCount * 100) / 100,
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
    }
  )

  // Get per-account Copilot quota via the internal endpoint
  ipcMain.handle(
    'github:get-copilot-quota',
    async (_event, username: string) => {
      try {
        // Get a per-account token
        const token = await tryGetCliToken(username)
        if (!token) {
          return { success: false, error: `No token for account '${username}'` }
        }

        const { stdout } = await execAsync(
          'gh api /copilot_internal/user',
          {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, GH_TOKEN: token },
          }
        )

        const data = JSON.parse(stdout.trim())
        return { success: true, data }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error(`Failed to get Copilot quota for '${username}':`, errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get Copilot budget and current-month spend for an org
  ipcMain.handle(
    'github:get-copilot-budget',
    async (_event, org: string, username?: string) => {
      try {
        const token = await tryGetCliToken(username)
        const execEnv = {
          ...process.env,
          ...(token ? { GH_TOKEN: token } : {}),
        }

        const now = new Date()
        const year = now.getUTCFullYear()
        const month = now.getUTCMonth() + 1

        // Fetch budget limit and spend in parallel
        const [budgetResult, usageResult] = await Promise.allSettled([
          execAsync(
            `gh api /organizations/${org}/settings/billing/budgets -H "X-GitHub-Api-Version: 2022-11-28"`,
            { encoding: 'utf8', timeout: 15000, env: execEnv }
          ),
          execAsync(
            `gh api "/organizations/${org}/settings/billing/premium_request/usage?year=${year}&month=${month}" -H "X-GitHub-Api-Version: 2022-11-28"`,
            { encoding: 'utf8', timeout: 15000, env: execEnv }
          ),
        ])

        // Parse budget — try org-level first, then fall back to enterprise-level
        interface BudgetItem {
          budget_product_sku: string
          budget_amount: number
          prevent_further_usage: boolean
          budget_entity_name?: string
        }
        let budgetAmount: number | null = null
        let preventFurtherUsage = false
        let budgetError: string | null = null

        const findCopilotBudget = (budgets: BudgetItem[], entityFilter?: string) => {
          const candidates = entityFilter
            ? budgets.filter(b => {
                const entity = b.budget_entity_name?.toLowerCase() ?? ''
                const orgLower = entityFilter.toLowerCase()
                return entity === orgLower || orgLower.includes(entity) || entity.includes(orgLower)
              })
            : budgets
          const sku = (b: BudgetItem) => b.budget_product_sku?.toLowerCase() ?? ''
          return (
            candidates.find(b => sku(b).includes('premium')) ??
            candidates.find(b => sku(b).includes('copilot'))
          )
        }

        if (budgetResult.status === 'fulfilled') {
          const budgetData = JSON.parse(budgetResult.value.stdout.trim()) as { budgets?: BudgetItem[] }
          const copilotBudget = findCopilotBudget(budgetData.budgets ?? [])
          if (copilotBudget) {
            budgetAmount = copilotBudget.budget_amount
            preventFurtherUsage = copilotBudget.prevent_further_usage
          }
        } else {
          budgetError = getErrorMessage(budgetResult.reason)
          console.warn(`Budget fetch failed for '${org}':`, budgetError)
        }

        // Fall back to known spending limits for personal accounts (billing API not available)
        // Personal GitHub accounts don't expose budgets via API; configure limits here.
        const PERSONAL_BUDGETS: Record<string, number> = {
          hemsoft: 50,
        }
        if (budgetAmount === null && budgetError) {
          const knownBudget = PERSONAL_BUDGETS[org.toLowerCase()]
          if (knownBudget !== undefined) {
            budgetAmount = knownBudget
            budgetError = null
          }
        }

        // Fall back to enterprise-level budget if still no copilot budget found
        // TODO: make enterprise slug configurable instead of hardcoding
        if (budgetAmount === null) {
          const ENTERPRISE_SLUG = 'Bertelsmann'
          try {
            const entResult = await execAsync(
              `gh api "/enterprises/${ENTERPRISE_SLUG}/settings/billing/budgets" -H "X-GitHub-Api-Version: 2022-11-28" --paginate`,
              { encoding: 'utf8', timeout: 20000, env: execEnv }
            )
            const entData = JSON.parse(entResult.stdout.trim()) as { budgets?: BudgetItem[] }
            const match = findCopilotBudget(entData.budgets ?? [], org)
            if (match) {
              budgetAmount = match.budget_amount
              preventFurtherUsage = match.prevent_further_usage
            }
          } catch (entError) {
            console.warn(`Enterprise budget fallback failed:`, getErrorMessage(entError))
          }
        }

        // Parse spend — use netAmount (cost after included-quota discount, matches billing UI)
        let spent = 0
        let spentError: string | null = null
        if (usageResult.status === 'fulfilled') {
          const usageData = JSON.parse(usageResult.value.stdout.trim()) as {
            usageItems?: Array<{ netAmount: number }>
          }
          spent = usageData.usageItems?.reduce((sum, item) => sum + item.netAmount, 0) ?? 0
          spent = Math.round(spent * 100) / 100
        } else {
          spentError = getErrorMessage(usageResult.reason)
          console.warn(`Usage fetch failed for '${org}':`, spentError)

          // Fall back to quota-based spend for personal accounts
          // Compute overage cost from Copilot internal quota data
          if (PERSONAL_BUDGETS[org.toLowerCase()] !== undefined) {
            const quotaToken = await tryGetCliToken(username)
            if (quotaToken) {
              try {
                const quotaResult = await execAsync(
                  'gh api /copilot_internal/user',
                  { encoding: 'utf8', timeout: 15000, env: { ...process.env, GH_TOKEN: quotaToken } }
                )
                const quotaData = JSON.parse(quotaResult.stdout.trim())
                const premium = quotaData?.quota_snapshots?.premium_interactions
                if (premium) {
                  const overageByCount = Math.max(0, premium.overage_count ?? 0)
                  const overageByRemaining = Math.max(0, -(premium.remaining ?? 0))
                  const overageRequests = Math.max(overageByCount, overageByRemaining)
                  spent = Math.round(overageRequests * 0.04 * 100) / 100
                  spentError = null
                }
              } catch (quotaError) {
                console.warn(`Quota-based spend fallback failed for '${org}':`, getErrorMessage(quotaError))
              }
            }
          }
        }

        // If both APIs failed, determine the reason
        if (budgetError && spentError) {
          const is404 = budgetError.includes('404') || spentError.includes('404')
          return {
            success: true,
            data: {
              org,
              budgetAmount: null,
              preventFurtherUsage: false,
              spent: 0,
              spentUnavailable: true,
              useQuotaOverage: is404,
              billingMonth: month,
              billingYear: year,
              fetchedAt: Date.now(),
            },
          }
        }

        return {
          success: true,
          data: { org, budgetAmount, preventFurtherUsage, spent, spentUnavailable: !!spentError, useQuotaOverage: false, billingMonth: month, billingYear: year, fetchedAt: Date.now() },
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error(`Failed to get Copilot budget for org '${org}':`, errorMessage)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Switch the active GitHub CLI account
  ipcMain.handle('github:switch-account', async (_event, username: string) => {
    try {
      await execAsync(`gh auth switch --user ${username}`, {
        encoding: 'utf8',
        timeout: 5000,
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
      accounts: Array<{ username: string; org: string }>,
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
    },
  )
}
