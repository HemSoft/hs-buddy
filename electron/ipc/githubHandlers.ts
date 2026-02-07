import { ipcMain } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export function registerGitHubHandlers(): void {
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
        throw new Error(`GitHub CLI returned empty token${username ? ` for account '${username}'` : ''}`)
      }

      return token
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Failed to get GitHub CLI token:', errorMessage)

      // Provide helpful error message
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        throw new Error('GitHub CLI (gh) is not installed. Install from: https://cli.github.com/')
      } else if (errorMessage.includes('not logged in')) {
        throw new Error(`Not logged in to GitHub CLI${username ? ` for account '${username}'` : ''}. Run: gh auth login`)
      } else if (errorMessage.includes('no account found')) {
        throw new Error(`GitHub account '${username}' not found in GitHub CLI. Run: gh auth login -h github.com`)
      }

      throw error
    }
  })
}
