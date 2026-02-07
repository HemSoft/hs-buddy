import { ipcMain } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

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
