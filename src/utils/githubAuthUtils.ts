/**
 * Pure helpers for parsing GitHub CLI auth output.
 *
 * Extracted from electron/ipc/githubHandlers.ts so the string
 * parsing and policy logic is testable without exec calls.
 */

/**
 * Parse `gh auth status` stderr to find the active GitHub account.
 * Returns the account name or null if none is active.
 */
export function parseActiveGitHubAccount(stderr: string): string | null {
  const lines = stderr.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const accountMatch = lines[i].match(/Logged in to .+ account (\S+)/)
    if (accountMatch) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].includes('Active account: true')) {
          return accountMatch[1]
        }
      }
    }
  }
  return null
}

/**
 * Build a `gh auth token` argv array.
 * Using an array avoids shell-injection risks from username interpolation.
 */
export function buildGhAuthTokenArgs(username?: string): string[] {
  const args = ['auth', 'token']
  if (username) args.push('--user', username)
  return args
}

/** Returns true if `gh auth token` stderr is informational (not an error). */
export function isNonFatalGhStderr(stderr: string): boolean {
  return stderr.includes('Logging in to')
}

/**
 * Validate CLI token output — warn on meaningful stderr, throw on empty token.
 * Returns the trimmed token string on success.
 */
export function validateCliToken(stdout: string, stderr: string, username?: string): string {
  if (stderr && !isNonFatalGhStderr(stderr)) {
    console.warn('gh auth token stderr:', stderr)
  }
  const token = stdout.trim()
  if (!token) {
    const suffix = username ? ` for account '${username}'` : ''
    throw new Error(`GitHub CLI returned empty token${suffix}`)
  }
  return token
}
