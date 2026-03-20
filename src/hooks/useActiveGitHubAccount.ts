import { useEffect, useState } from 'react'
import { GitHubClient } from '../api/github'

const CLI_ACCOUNT_POLL_MS = 30_000

export function useActiveGitHubAccount(): string | null {
  const [activeGitHubAccount, setActiveGitHubAccount] = useState<string | null>(null)

  useEffect(() => {
    GitHubClient.getActiveCliAccount()
      .then(setActiveGitHubAccount)
      .catch(() => {})

    const timer = setInterval(() => {
      GitHubClient.getActiveCliAccount()
        .then(setActiveGitHubAccount)
        .catch(() => {})
    }, CLI_ACCOUNT_POLL_MS)

    return () => clearInterval(timer)
  }, [])

  return activeGitHubAccount
}
