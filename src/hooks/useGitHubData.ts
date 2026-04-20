/**
 * Generic hook for GitHub data fetching with caching, task queue, and abort handling.
 *
 * Consolidates the repeated fetch/loading/error/cache pattern found across
 * RepoDetailPanel, RepoCommitDetailPanel, RepoIssueDetailPanel, RepoIssueList,
 * PRFilesChangedPanel, and PRChecksPanel.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGitHubAccounts } from './useConfig'
import { useLatest } from './useLatest'
import { useTaskQueue } from './useTaskQueue'
import { GitHubClient } from '../api/github'
import { dataCache } from '../services/dataCache'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'

interface UseGitHubDataOptions<T> {
  /**
   * Cache key for dataCache. When this changes, data resets and a new fetch starts.
   * Pass `null` to disable fetching entirely.
   */
  cacheKey: string | null

  /** Task queue job name (for debugging/deduplication). */
  taskName: string

  /**
   * The fetch function. Receives a pre-authenticated GitHubClient and an AbortSignal.
   * Kept in a ref internally — does not need to be memoized by the caller.
   */
  fetchFn: (client: GitHubClient, signal: AbortSignal) => Promise<T>
}

interface UseGitHubDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Force a fresh fetch, bypassing cache. Returns a promise for await in tests/timers. */
  refresh: () => Promise<void>
}

export function useGitHubData<T>({
  cacheKey,
  taskName,
  fetchFn,
}: UseGitHubDataOptions<T>): UseGitHubDataResult<T> {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useLatest(enqueue)
  const fetchFnRef = useLatest(fetchFn)
  const requestIdRef = useRef(0)

  // Seed initial state from cache
  const cachedEntry = cacheKey ? dataCache.get<T>(cacheKey) : null
  const [data, setData] = useState<T | null>(cachedEntry?.data ?? null)
  const [loading, setLoading] = useState(cacheKey !== null && !cachedEntry)
  const [error, setError] = useState<string | null>(null)

  // Reset state when the identity (cacheKey) changes — useLayoutEffect fires
  // before paint so stale data from the previous key never flashes on screen.
  const prevKeyRef = useRef(cacheKey)
  useLayoutEffect(() => {
    if (prevKeyRef.current !== cacheKey) {
      prevKeyRef.current = cacheKey
      // Invalidate any in-flight request from the previous cacheKey
      requestIdRef.current += 1
      const next = cacheKey ? dataCache.get<T>(cacheKey) : null
      setData(next?.data ?? null)
      setLoading(cacheKey !== null && !next)
      setError(null)
    }
  }, [cacheKey])

  const doFetch = useCallback(
    async (forceRefresh: boolean) => {
      if (cacheKey === null) return

      // Stale-request protection: only the latest request writes state
      const requestId = ++requestIdRef.current

      if (!forceRefresh) {
        const cached = dataCache.get<T>(cacheKey)
        if (cached !== null) {
          setData(cached.data)
          setLoading(false)
          setError(null)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await enqueueRef.current(
          /* v8 ignore start */
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await fetchFnRef.current(client, signal)
            /* v8 ignore stop */
          },
          { name: taskName }
        )

        // Guard: discard results from stale requests
        if (requestId !== requestIdRef.current) return

        setData(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        if (requestId !== requestIdRef.current) return
        setError(getErrorMessage(err))
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    },
    [accounts, cacheKey, taskName, enqueueRef, fetchFnRef]
  )

  // Initial fetch (and re-fetch when deps change)
  useEffect(() => {
    doFetch(false)
  }, [doFetch])

  const refresh = useCallback(() => doFetch(true), [doFetch])

  return { data, loading, error, refresh }
}
