import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { useTaskQueue } from './useTaskQueue'
import { GitHubClient } from '../api/github'
import { dataCache } from '../services/dataCache'
import { getTaskQueue } from '../services/taskQueue'
import type { GitHubAccount } from '../types/config'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
import type { LoadPhase } from '../components/orgDetailReducer'

/** Read a cached value from dataCache, returning null if absent. */
function tryGetCached<T>(key: string): T | null {
  return dataCache.get<T>(key)?.data ?? null
}

/** Handle a fetch error: ignore abort errors, otherwise report. */
function handleOrgFetchError(
  error: unknown,
  setPhase: (phase: LoadPhase) => void,
  setError: (error: string | null) => void
) {
  if (isAbortError(error)) return
  setPhase('error')
  setError(getErrorMessage(error))
}

/** Resolve cached data, returning null when forceRefresh is requested. */
function resolveCachedData<T>(
  cacheKey: string,
  normalize: (d: T | null) => T | null,
  forceRefresh: boolean
): T | null {
  if (forceRefresh) return null
  return normalize(tryGetCached<T>(cacheKey))
}

/** Pick the appropriate loading phase based on whether data already exists. */
function resolveLoadPhase(hasData: boolean): LoadPhase {
  return hasData ? 'refreshing' : 'loading'
}

function applyResolvedOrgCache<T>(
  cached: T | null,
  setData: (data: T | null) => void,
  setError: (error: string | null) => void,
  setPhase: (phase: LoadPhase) => void
): boolean {
  if (cached == null) {
    return false
  }

  setData(cached)
  setError(null)
  setPhase('ready')
  return true
}

function isStaleOrgFetch(activeCacheKey: string, cacheKeyRef: { current: string }): boolean {
  return cacheKeyRef.current !== activeCacheKey
}

function applyOrgFetchResult<T>(
  activeCacheKey: string,
  cacheKeyRef: { current: string },
  normalize: (data: T | null) => T | null,
  result: T,
  setData: (data: T | null) => void,
  setPhase: (phase: LoadPhase) => void
) {
  if (isStaleOrgFetch(activeCacheKey, cacheKeyRef)) return

  const normalized = normalize(result)
  startTransition(() => {
    setData(normalized)
    setPhase('ready')
  })
  dataCache.set(activeCacheKey, normalized)
}

function handleOrgFetchErrorIfCurrent(
  error: unknown,
  activeCacheKey: string,
  cacheKeyRef: { current: string },
  setPhase: (phase: LoadPhase) => void,
  setError: (error: string | null) => void
) {
  if (isStaleOrgFetch(activeCacheKey, cacheKeyRef)) return
  handleOrgFetchError(error, setPhase, setError)
}

// ---------------------------------------------------------------------------
// Generic cached-fetch hook — shared by useOrgOverviewData & useOrgMembersData
// ---------------------------------------------------------------------------

interface UseOrgCachedFetchOptions<T> {
  accounts: GitHubAccount[]
  org: string
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  cacheKey: string
  taskName: string
  initialData?: T | null
  normalize?: (data: T | null) => T | null
  fetchFn: (client: GitHubClient, org: string) => Promise<T>
}

interface UseOrgCachedFetchResult<T> {
  data: T | null
  phase: LoadPhase
  error: string | null
  hasCached: boolean
  fetch: (forceRefresh?: boolean) => Promise<void>
}

export function useOrgCachedFetch<T>({
  accounts,
  org,
  enqueue,
  cacheKey,
  taskName,
  initialData = null,
  normalize,
  fetchFn,
}: UseOrgCachedFetchOptions<T>): UseOrgCachedFetchResult<T> {
  const enqueueRef = useRef(enqueue)
  const fetchFnRef = useRef(fetchFn)
  const cacheKeyRef = useRef(cacheKey)
  const identityNormalize = useCallback((d: T | null) => d, [])
  const normalizeFn = normalize ?? identityNormalize
  const normalizeRef = useRef(normalizeFn)
  const cachedSeed = normalizeFn(tryGetCached<T>(cacheKey))
  const hasCached = cachedSeed != null
  const seedData = initialData != null ? initialData : cachedSeed
  const [data, setData] = useState<T | null>(() => seedData)
  const [phase, setPhase] = useState<LoadPhase>(() => (seedData != null ? 'ready' : 'loading'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(seedData != null)
  const seedDataRef = useRef(seedData)
  seedDataRef.current = seedData

  // Reset state when cacheKey changes (e.g., navigating between orgs).
  // useLayoutEffect prevents a flash of stale data before paint.
  useLayoutEffect(() => {
    cacheKeyRef.current = cacheKey
    const seed = seedDataRef.current
    setData(seed)
    setPhase(seed != null ? 'ready' : 'loading')
    setError(null)
    hasDataRef.current = seed != null
  }, [cacheKey])

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    fetchFnRef.current = fetchFn
  }, [fetchFn])

  useEffect(() => {
    normalizeRef.current = normalizeFn
  }, [normalizeFn])

  useEffect(() => {
    hasDataRef.current = data != null
  }, [data])

  const accountsRef = useRef(accounts)
  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  const doFetch = useCallback(
    async (forceRefresh = false) => {
      const activeCacheKey = cacheKeyRef.current
      const queue = getTaskQueue('github')
      const cached = resolveCachedData<T>(activeCacheKey, normalizeRef.current, forceRefresh)
      /* v8 ignore start */
      if (applyResolvedOrgCache(cached, setData, setError, setPhase)) {
        return
        /* v8 ignore stop */
      }

      if (queue.hasTaskWithName(taskName)) {
        return
      }

      setError(null)
      setPhase(resolveLoadPhase(hasDataRef.current))

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts: accountsRef.current }, 7)
            return await fetchFnRef.current(client, org)
          },
          { name: taskName, priority: -1 }
        )

        applyOrgFetchResult(
          activeCacheKey,
          cacheKeyRef,
          normalizeRef.current,
          result,
          setData,
          setPhase
        )
      } catch (fetchError: unknown) {
        handleOrgFetchErrorIfCurrent(fetchError, activeCacheKey, cacheKeyRef, setPhase, setError)
      }
    },
    [taskName, org]
  )

  return { data, phase, error, hasCached, fetch: doFetch }
}
