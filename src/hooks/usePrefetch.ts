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
import { GitHubClient } from '../api/github'
import { dataCache } from '../services/dataCache'
import type { PullRequest } from '../types/pullRequest'
import { MS_PER_MINUTE } from '../constants'
import type { OrgRepoResult } from '../api/github'
import { PR_MODES } from '../constants'
import { isAbortError } from '../utils/errorUtils'

/**
 * Hook that prefetches all PR data in the background on app startup
 * and auto-refreshes on the configured interval.
 *
 * - Runs immediately on startup for initial data population
 * - Auto-refreshes every `refreshInterval` minutes (checks every 30s for stale data)
 * - Uses low priority (-1) so user-initiated fetches always go first
 * - Re-checks freshness before executing (avoids double-fetch with PullRequestList)
 * - Silently catches errors — background failures don't affect the user
 */
export function usePrefetch(): void {
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const { refreshInterval, recentlyMergedDays, loading: settingsLoading } = usePRSettings()
  const { enqueue } = useTaskQueue('github')
  const prefetchedRef = useRef(false)

  // Stable refs to avoid re-triggering effects
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  // Shared function to queue fetches for stale PR data
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
        if (dataCache.isFresh(cacheKey, intervalMs)) {
          return
        }

        if (queue.hasTaskWithName(taskName)) {
          return
        }

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

              if (signal.aborted) {
                throw new DOMException('Fetch cancelled', 'AbortError')
              }

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

      for (const mode of PR_MODES) {
        const taskName = `${label.toLowerCase()}-${mode}`
        enqueueIfStale(mode, taskName, async (_signal, client) => {
          let prs: PullRequest[]
          switch (mode) {
            case 'needs-review':
              prs = await client.fetchNeedsReview()
              break
            case 'recently-merged':
              prs = await client.fetchRecentlyMerged()
              break
            case 'need-a-nudge':
              prs = await client.fetchNeedANudge()
              break
            case 'my-prs':
            default:
              prs = await client.fetchMyPRs()
              break
          }

          if (mode !== 'recently-merged') {
            prs.sort((a, b) => {
              if (a.repository !== b.repository) {
                return a.repository.localeCompare(b.repository)
              }
              return a.id - b.id
            })
          }

          dataCache.set(mode, prs)
          console.log(`[${label}] ${mode}: fetched ${prs.length} PRs`)
        })
      }

      const uniqueOrgs = Array.from(new Set(accounts.map(a => a.org))).sort()
      for (const org of uniqueOrgs) {
        const cacheKey = `org-repos:${org}`
        enqueueIfStale(cacheKey, `${label.toLowerCase()}-${cacheKey}`, async (_signal, client) => {
          const result: OrgRepoResult = await client.fetchOrgRepos(org)
          dataCache.set(cacheKey, result)
          console.log(`[${label}] ${cacheKey}: fetched ${result.repos.length} repos`)
        })
      }
    },
    [accounts, recentlyMergedDays]
  )

  // --- Initial prefetch (runs once on startup) ---
  useEffect(() => {
    if (accountsLoading || settingsLoading || accounts.length === 0) return
    /* v8 ignore start */
    if (prefetchedRef.current) return
    /* v8 ignore stop */
    prefetchedRef.current = true

    const intervalMs = refreshInterval * MS_PER_MINUTE

    console.log('[Prefetch] Starting initial prefetch...', {
      accounts: accounts.length,
      refreshInterval: `${refreshInterval}m`,
      cacheStats: dataCache.getStats(),
    })

    refreshStaleData(intervalMs, 'Prefetch')
  }, [accounts, accountsLoading, settingsLoading, refreshInterval, refreshStaleData])

  // --- Auto-refresh timer (checks every 30s for stale data) ---
  useEffect(() => {
    if (accountsLoading || settingsLoading || accounts.length === 0) return

    const intervalMs = refreshInterval * MS_PER_MINUTE

    // Check every 30 seconds if any data has gone stale
    const timer = setInterval(() => {
      // Quick check: is any PR data stale?
      const anyStale = PR_MODES.some(mode => !dataCache.isFresh(mode, intervalMs))
      if (anyStale) {
        console.log(`[AutoRefresh] Stale data detected, refreshing (interval: ${refreshInterval}m)`)
        refreshStaleData(intervalMs, 'AutoRefresh')
      }
    }, 30_000) // Poll every 30 seconds

    return () => clearInterval(timer)
  }, [accounts, accountsLoading, settingsLoading, refreshInterval, refreshStaleData])
}
