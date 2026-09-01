/**
 * Background Status Hook
 *
 * Centralizes the state of background data fetching so the UI can show
 * what's happening (syncing, idle, countdown to next refresh).
 *
 * Uses the task queue's stats and dataCache staleness to derive:
 * - Whether a sync is actively running
 * - What is being synced (PR mode names)
 * - Time until the next refresh fires
 * - When data was last refreshed
 */

import { useEffect, useMemo, useState } from 'react'
import type { QueueSnapshot } from '../services/taskQueue'
import { dataCache } from '../services/dataCache'
import { useGitHubAccounts, usePRSettings } from './useConfig'
import { PR_MODES, MS_PER_MINUTE } from '../constants'
import { getFriendlyGitHubTaskLabel } from '../utils/githubTaskNames'
import { useTaskQueueSelector } from './useTaskQueue'
import { getPRCacheKey } from '../utils/prCacheKey'

type SyncPhase = 'idle' | 'syncing' | 'error'

export interface BackgroundStatus {
  /** Current phase: idle, syncing, or error */
  phase: SyncPhase
  /** Human-readable label of what's being synced, e.g. "My PRs" */
  activeLabel: string | null
  /** Total number of running + queued tasks in the GitHub queue */
  activeTasks: number
  /** Number of tasks currently running */
  runningTasks: number
  /** Number of tasks waiting in the queue */
  queuedTasks: number
  /** Absolute timestamp when the next auto-refresh fires */
  nextRefreshAt: number | null
  /** Timestamp of the most recent successful cache update */
  lastRefreshedAt: number | null
}

interface BackgroundQueueFacts {
  runningTasks: number
  queuedTasks: number
  runningTaskName: string | null
}

/**
 * Hook that provides real-time background sync status. Queue and cache changes
 * drive updates; ticking labels belong in the leaf component that renders them.
 */
function computeActiveLabel(activeTasks: number, runningTaskName: string | null): string | null {
  if (activeTasks <= 0) return null
  return getFriendlyGitHubTaskLabel(runningTaskName) ?? 'GitHub data'
}

function computeCacheTimes(cacheKeys: readonly string[]): {
  oldestRefresh: number
  latestRefresh: number
} {
  let oldestRefresh = 0
  let latestRefresh = 0
  for (const cacheKey of cacheKeys) {
    const entry = dataCache.get(cacheKey)
    if (entry) {
      if (!oldestRefresh || entry.fetchedAt < oldestRefresh) oldestRefresh = entry.fetchedAt
      if (entry.fetchedAt > latestRefresh) latestRefresh = entry.fetchedAt
    }
  }
  return { oldestRefresh, latestRefresh }
}

function resolveNextRefreshAt(
  phase: SyncPhase,
  intervalMs: number,
  oldestRefresh: number
): number | null {
  if (phase === 'syncing' || !oldestRefresh) return null
  return oldestRefresh + intervalMs
}

function buildBackgroundStatus(
  intervalMs: number,
  queueFacts: BackgroundQueueFacts,
  cacheKeys: readonly string[]
): BackgroundStatus {
  const running = queueFacts.runningTasks
  const pending = queueFacts.queuedTasks
  const activeTasks = running + pending
  const activeLabel = computeActiveLabel(activeTasks, queueFacts.runningTaskName)
  const { oldestRefresh, latestRefresh } = computeCacheTimes(cacheKeys)
  const phase: SyncPhase = activeTasks > 0 ? 'syncing' : 'idle'

  return {
    phase,
    activeLabel,
    activeTasks,
    runningTasks: running,
    queuedTasks: pending,
    nextRefreshAt: resolveNextRefreshAt(phase, intervalMs, oldestRefresh),
    lastRefreshedAt: latestRefresh || null,
  }
}

function selectBackgroundQueueFacts(snapshot: QueueSnapshot): BackgroundQueueFacts {
  return {
    runningTasks: snapshot.runningCount,
    queuedTasks: snapshot.pendingCount,
    runningTaskName: snapshot.runningTaskName,
  }
}

function hasSameBackgroundQueueFacts(
  current: BackgroundQueueFacts,
  next: BackgroundQueueFacts
): boolean {
  return (
    current.runningTasks === next.runningTasks &&
    current.queuedTasks === next.queuedTasks &&
    current.runningTaskName === next.runningTaskName
  )
}

function hasSameBackgroundStatus(current: BackgroundStatus, next: BackgroundStatus): boolean {
  return (
    current.phase === next.phase &&
    current.activeLabel === next.activeLabel &&
    current.activeTasks === next.activeTasks &&
    current.runningTasks === next.runningTasks &&
    current.queuedTasks === next.queuedTasks &&
    current.nextRefreshAt === next.nextRefreshAt &&
    current.lastRefreshedAt === next.lastRefreshedAt
  )
}

export function useBackgroundStatus(): BackgroundStatus {
  const { refreshInterval } = usePRSettings()
  const { accounts } = useGitHubAccounts()
  const cacheKeys = useMemo(
    () => [...PR_MODES, ...PR_MODES.map(mode => getPRCacheKey(mode, accounts))],
    [accounts]
  )
  const queueFacts = useTaskQueueSelector(
    'github',
    selectBackgroundQueueFacts,
    hasSameBackgroundQueueFacts
  )
  const [cacheRevision, setCacheRevision] = useState(0)
  const statusCache = useMemo(() => ({ current: null as BackgroundStatus | null }), [])

  useEffect(() => {
    const cacheKeySet = new Set(cacheKeys)
    return dataCache.subscribe(key => {
      if (cacheKeySet.has(key)) {
        setCacheRevision(revision => revision + 1)
      }
    })
  }, [cacheKeys])

  return useMemo(() => {
    void cacheRevision
    const next = buildBackgroundStatus(refreshInterval * MS_PER_MINUTE, queueFacts, cacheKeys)
    if (statusCache.current && hasSameBackgroundStatus(statusCache.current, next)) {
      return statusCache.current
    }
    statusCache.current = next
    return next
  }, [cacheKeys, cacheRevision, queueFacts, refreshInterval, statusCache])
}
