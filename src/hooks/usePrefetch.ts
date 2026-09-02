/**
 * Prefetch & Auto-Refresh Hook
 *
 * Runs on app startup to proactively fetch data for pages that take time
 * to load (e.g., PR pages), then continues to auto-refresh on the configured
 * interval. Uses the existing task queue for concurrency control and respects
 * the configured refresh interval — only fetches stale data.
 *
 * This makes navigating to PR pages feel near-instant because the data is
 * already in the dataCache by the time the user gets there, and ensures
 * data stays fresh without manual intervention.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGitHubAccounts, usePRSettings } from './useConfig'
import { useTaskQueue } from './useTaskQueue'
import { getTaskQueue } from '../services/taskQueue'
import { GitHubClient } from '../api/github/client'
import type { OrgRepoResult } from '../api/github'
import { dataCache } from '../services/dataCache'
import type { PullRequest } from '../types/pullRequest'
import { MS_PER_MINUTE, PR_MODES } from '../constants'
import { isAbortError, throwIfAborted } from '../utils/errorUtils'
import { getAccountSetFingerprint, getPRCacheKey, getPRTaskName } from '../utils/prCacheKey'

async function fetchPrefetchPRs(client: GitHubClient, mode: string): Promise<PullRequest[]> {
  switch (mode) {
    case 'needs-review':
      return client.fetchNeedsReview()
    case 'recently-merged':
      return client.fetchRecentlyMerged()
    case 'need-a-nudge':
      return client.fetchNeedANudge()
    case 'my-prs':
    default:
      return client.fetchMyPRs()
  }
}

function sortPrefetchPRs(mode: string, prs: PullRequest[]): void {
  if (mode === 'recently-merged') {
    return
  }

  prs.sort((a, b) => {
    if (a.repository !== b.repository) {
      return a.repository.localeCompare(b.repository)
    }
    return a.id - b.id
  })
}

type EnqueueIfStaleFn = (
  cacheKey: string,
  taskName: string,
  fetchFn: (signal: AbortSignal, client: GitHubClient) => Promise<void>
) => void

function enqueuePRModes(
  enqueueIfStale: EnqueueIfStaleFn,
  label: string,
  accounts: { username: string; org: string }[],
  isCurrentCacheKey: (cacheKey: string) => boolean
): void {
  for (const mode of PR_MODES) {
    const cacheKey = getPRCacheKey(mode, accounts)
    const taskName = getPRTaskName(label, mode, accounts)
    enqueueIfStale(cacheKey, taskName, async (signal, client) => {
      const prs = await fetchPrefetchPRs(client, mode)
      throwIfAborted(signal)
      if (!isCurrentCacheKey(cacheKey)) return
      sortPrefetchPRs(mode, prs)
      dataCache.set(cacheKey, prs)
      console.log(`[${label}] ${cacheKey}: fetched ${prs.length} PRs`)
    })
  }
}

function enqueueOrgRepos(
  enqueueIfStale: EnqueueIfStaleFn,
  label: string,
  accounts: { org: string }[]
): void {
  const uniqueOrgs = Array.from(new Set(accounts.map(a => a.org))).sort()
  for (const org of uniqueOrgs) {
    const cacheKey = `org-repos:${org}`
    enqueueIfStale(cacheKey, `${label.toLowerCase()}-${cacheKey}`, async (_signal, client) => {
      const result: OrgRepoResult = await client.fetchOrgRepos(org)
      dataCache.set(cacheKey, result)
      console.log(`[${label}] ${cacheKey}: fetched ${result.repos.length} repos`)
    })
  }
}

function useInitialPrefetch({
  accounts,
  accountsLoading,
  settingsLoading,
  refreshInterval,
  refreshStaleData,
}: {
  accounts: { username: string; org: string }[]
  accountsLoading: boolean
  settingsLoading: boolean
  refreshInterval: number
  refreshStaleData: (intervalMs: number, label: string) => void
}): void {
  const prefetchedAccountSetRef = useRef<string | null>(null)
  useEffect(() => {
    if (accountsLoading || settingsLoading || accounts.length === 0) return
    const accountSetFingerprint = getAccountSetFingerprint(accounts)
    /* v8 ignore start */
    if (prefetchedAccountSetRef.current === accountSetFingerprint) return
    /* v8 ignore stop */
    prefetchedAccountSetRef.current = accountSetFingerprint
    const intervalMs = refreshInterval * MS_PER_MINUTE
    console.log('[Prefetch] Starting initial prefetch…', {
      accounts: accounts.length,
      refreshInterval: `${refreshInterval}m`,
      cacheStats: dataCache.getStats(),
    })
    refreshStaleData(intervalMs, 'Prefetch')
  }, [accounts, accountsLoading, settingsLoading, refreshInterval, refreshStaleData])
}

/**
 * Hook that prefetches all PR data in the background on app startup
 * and auto-refreshes on the configured interval.
 */
export function usePrefetch(): void {
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const {
    refreshInterval,
    autoRefresh,
    recentlyMergedDays,
    loading: settingsLoading,
  } = usePRSettings()
  const { enqueue } = useTaskQueue('github')
  const activePRCacheKeysRef = useRef(new Set(PR_MODES.map(mode => getPRCacheKey(mode, accounts))))
  activePRCacheKeysRef.current = new Set(PR_MODES.map(mode => getPRCacheKey(mode, accounts)))

  // Stable refs to avoid re-triggering effects
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const refreshStaleData = useCallback(
    (intervalMs: number, label: string) => {
      /* v8 ignore start */
      if (accounts.length === 0) return
      /* v8 ignore stop */

      const queue = getTaskQueue('github')
      const config = { accounts }

      const enqueueIfStale = (
        cacheKey: string,
        taskName: string,
        fetchFn: (signal: AbortSignal, client: GitHubClient) => Promise<void>
      ) => {
        if (dataCache.isFresh(cacheKey, intervalMs) || queue.hasTaskWithName(taskName)) return
        const cachedEntry = dataCache.get(cacheKey)
        console.log(
          `[${label}] ${cacheKey}: ${cachedEntry ? 'stale' : 'no cached data'}, queueing background fetch`
        )
        enqueueRef
          .current(
            async signal => {
              if (dataCache.isFresh(cacheKey, intervalMs)) {
                console.log(`[${label}] ${cacheKey}: became fresh while queued, skipping`)
                return
              }
              if (signal.aborted) throw new DOMException('Fetch cancelled', 'AbortError')
              const client = new GitHubClient(config, recentlyMergedDays)
              await fetchFn(signal, client)
            },
            { name: taskName, priority: -1 }
          )
          .catch(err => {
            /* v8 ignore start */
            if (isAbortError(err)) return
            /* v8 ignore stop */
            console.warn(`[${label}] ${cacheKey} failed:`, err)
          })
      }

      enqueuePRModes(enqueueIfStale, label, accounts, cacheKey =>
        activePRCacheKeysRef.current.has(cacheKey)
      )
      enqueueOrgRepos(enqueueIfStale, label, accounts)
    },
    [accounts, recentlyMergedDays]
  )

  useInitialPrefetch({
    accounts,
    accountsLoading,
    settingsLoading,
    refreshInterval,
    refreshStaleData,
  })

  // --- Auto-refresh timer (checks every 30s for stale data) ---
  useEffect(() => {
    if (!autoRefresh || accountsLoading || settingsLoading || accounts.length === 0) return

    const intervalMs = refreshInterval * MS_PER_MINUTE

    // Check every 30 seconds if any data has gone stale
    const timer = setInterval(() => {
      // Quick check: is any PR data stale?
      const anyStale = PR_MODES.some(
        mode => !dataCache.isFresh(getPRCacheKey(mode, accounts), intervalMs)
      )
      if (anyStale) {
        console.log(`[AutoRefresh] Stale data detected, refreshing (interval: ${refreshInterval}m)`)
        refreshStaleData(intervalMs, 'AutoRefresh')
      }
    }, 30_000) // Poll every 30 seconds

    return () => clearInterval(timer)
  }, [accounts, accountsLoading, settingsLoading, autoRefresh, refreshInterval, refreshStaleData])
}
