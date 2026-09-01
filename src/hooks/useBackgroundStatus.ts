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

import { useState, useEffect } from 'react'
import { getTaskQueue } from '../services/taskQueue'
import { dataCache } from '../services/dataCache'
import { usePRSettings } from './useConfig'
import { PR_MODES, MS_PER_MINUTE } from '../constants'
import { getFriendlyGitHubTaskLabel } from '../utils/githubTaskNames'

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

/**
 * Hook that provides real-time background sync status.
 * Polls queue and cache facts once per second, but preserves object identity
 * until one of those stable facts changes. Ticking labels belong in the leaf
 * component that renders them.
 */
function computeActiveLabel(activeTasks: number, runningTaskName: string | null): string | null {
  if (activeTasks <= 0) return null
  return getFriendlyGitHubTaskLabel(runningTaskName) ?? 'GitHub data'
}

function computeCacheTimes(modes: readonly string[]): {
  oldestRefresh: number
  latestRefresh: number
} {
  let oldestRefresh = 0
  let latestRefresh = 0
  for (const mode of modes) {
    const entry = dataCache.get(mode)
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

function buildBackgroundStatus(intervalMs: number): BackgroundStatus {
  const queue = getTaskQueue('github')
  const running = queue.runningCount
  const pending = queue.pendingCount
  const activeTasks = running + pending
  const activeLabel = computeActiveLabel(activeTasks, queue.getRunningTaskName())
  const { oldestRefresh, latestRefresh } = computeCacheTimes(PR_MODES)
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

function hasSameBackgroundFacts(current: BackgroundStatus, next: BackgroundStatus): boolean {
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
  const [status, setStatus] = useState<BackgroundStatus>({
    phase: 'idle',
    activeLabel: null,
    activeTasks: 0,
    runningTasks: 0,
    queuedTasks: 0,
    nextRefreshAt: null,
    lastRefreshedAt: null,
  })

  useEffect(() => {
    const intervalMs = refreshInterval * MS_PER_MINUTE

    const compute = () => {
      const next = buildBackgroundStatus(intervalMs)
      setStatus(current => (hasSameBackgroundFacts(current, next) ? current : next))
    }

    compute()
    const timer = setInterval(compute, 1000)
    return () => clearInterval(timer)
  }, [refreshInterval])

  return status
}
