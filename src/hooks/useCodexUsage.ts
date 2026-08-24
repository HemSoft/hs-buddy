import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGitHubAccounts } from './useConfig'
import type { GitHubAccount } from '../types/config'
import type { CodexUsageData } from '../types/codexUsage'
import { getErrorMessage } from '../utils/errorUtils'

export interface CodexUsageState {
  data: CodexUsageData | null
  loading: boolean
  error: string | null
}

export function getCodexUsageKey(account: Pick<GitHubAccount, 'username' | 'org'>): string {
  return JSON.stringify([account.username, account.org])
}

export function useCodexUsage() {
  const { accounts } = useGitHubAccounts()
  const codexAccounts = useMemo(
    () => accounts.filter(account => account.usageProvider === 'codex'),
    [accounts]
  )
  const activeAccount = codexAccounts.at(0)
  const [states, setStates] = useState<Partial<Record<string, CodexUsageState>>>({})

  const fetchUsage = useCallback(async (account: GitHubAccount) => {
    const key = getCodexUsageKey(account)
    setStates(previous => ({
      ...previous,
      [key]: {
        data: previous[key]?.data ?? null,
        loading: true,
        error: null,
      },
    }))

    try {
      const result = await window.codex.getUsage()
      setStates(previous => ({
        ...previous,
        [key]: result.success
          ? { data: result.data, loading: false, error: null }
          : { data: previous[key]?.data ?? null, loading: false, error: result.error },
      }))
    } catch (error: unknown) {
      setStates(previous => ({
        ...previous,
        [key]: {
          data: previous[key]?.data ?? null,
          loading: false,
          error: getErrorMessage(error),
        },
      }))
    }
  }, [])

  const accountsKey = useMemo(
    () => codexAccounts.map(account => `${account.username}:${account.org}`).join(','),
    [codexAccounts]
  )

  useEffect(() => {
    if (!activeAccount) return
    void fetchUsage(activeAccount)

    setStates(previous => {
      const next = { ...previous }
      for (const account of codexAccounts.slice(1)) {
        next[getCodexUsageKey(account)] = {
          data: null,
          loading: false,
          error: `The local Codex login is assigned to ${activeAccount.username}. Choose Copilot for this account.`,
        }
      }
      return next
    })
  }, [accountsKey, activeAccount, codexAccounts, fetchUsage])

  const refreshAll = useCallback(
    () => Promise.allSettled(activeAccount ? [fetchUsage(activeAccount)] : []),
    [activeAccount, fetchUsage]
  )

  const anyLoading = useMemo(
    () => Object.values(states).some(state => state?.loading === true),
    [states]
  )

  return { accounts: codexAccounts, states, fetchUsage, refreshAll, anyLoading }
}
