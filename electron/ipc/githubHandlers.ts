import { ipcMain } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

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
      const errorMessage = error instanceof Error ? error.message : String(error)
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
        let token: string | null = null
        if (username) {
          try {
            const { stdout: tokenOut } = await execAsync(
              `gh auth token --user ${username}`,
              { encoding: 'utf8', timeout: 5000 }
            )
            token = tokenOut.trim()
          } catch {
            // Fall back to default account token
          }
        }

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
          const orgMsg = orgError instanceof Error ? orgError.message : String(orgError)
          if (!orgMsg.includes('404') && !orgMsg.includes('Not Found')) {
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
            const userMsg = userError instanceof Error ? userError.message : String(userError)
            if (userMsg.includes('404') || userMsg.includes('Not Found')) {
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
        const errorMessage = error instanceof Error ? error.message : String(error)
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
        const { stdout: tokenOut } = await execAsync(
          `gh auth token --user ${username}`,
          { encoding: 'utf8', timeout: 5000 }
        )
        const token = tokenOut.trim()
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
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Failed to get Copilot quota for '${username}':`, errorMessage)
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Failed to switch to account '${username}':`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })
}
