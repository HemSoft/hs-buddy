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
import { formatDistanceToNow, formatSecondsCountdown } from '../utils/dateUtils'

type SyncPhase = 'idle' | 'syncing' | 'error'

export interface BackgroundStatus {
  /** Current phase: idle, syncing, or error */
  phase: SyncPhase
  /** Human-readable label of what's being synced, e.g. "My PRs" */
  activeLabel: string | null
  /** Number of queued + running tasks in the github queue */
  activeTasks: number
  /** Seconds until the next auto-refresh fires (based on oldest cache entry) */
  nextRefreshSecs: number | null
  /** Human-readable countdown string, e.g. "12m 30s" */
  nextRefreshLabel: string | null
  /** Timestamp of the most recent successful cache update */
  lastRefreshedAt: number | null
  /** Human-readable "Updated Xm ago" */
  lastRefreshedLabel: string | null
}

/** Friendly labels for task names */
const TASK_LABELS: Record<string, string> = {
  'my-prs': 'My PRs',
  'needs-review': 'Needs Review',
  'recently-merged': 'Recently Merged',
  'need-a-nudge': 'Needs a nudge',
}

export function getFriendlyTaskLabel(taskName: string | null): string | null {
  if (!taskName) return null
  if (TASK_LABELS[taskName]) return TASK_LABELS[taskName]
  if (taskName.startsWith('org-detail-overview-')) return 'Org Overview'
  if (taskName.startsWith('org-detail-members-')) return 'Org Members'
  if (taskName.startsWith('org-detail-copilot-')) return 'Org Copilot'
  if (taskName.startsWith('refresh-org-')) return 'Organizations'
  return taskName
}

/**
 * Hook that provides real-time background sync status.
 * Updates every second for smooth countdown display.
 * Tracks batch progress for "Processing X of N" display.
 */
function computeActiveLabel(activeTasks: number, runningTaskName: string | null): string | null {
  if (activeTasks <= 0) return null
  return getFriendlyTaskLabel(runningTaskName) ?? 'GitHub data'
}

function computeCacheAges(modes: readonly string[]): { oldestAge: number; latestRefresh: number } {
  let oldestAge = 0
  let latestRefresh = 0
  for (const mode of modes) {
    const entry = dataCache.get(mode)
    if (entry) {
      const age = Date.now() - entry.fetchedAt
      if (age > oldestAge) oldestAge = age
      if (entry.fetchedAt > latestRefresh) latestRefresh = entry.fetchedAt
    }
  }
  return { oldestAge, latestRefresh }
}

export function useBackgroundStatus(): BackgroundStatus {
  const { refreshInterval } = usePRSettings()
  const [status, setStatus] = useState<BackgroundStatus>({
    phase: 'idle',
    activeLabel: null,
    activeTasks: 0,
    nextRefreshSecs: null,
    nextRefreshLabel: null,
    lastRefreshedAt: null,
    lastRefreshedLabel: null,
  })

  useEffect(() => {
    const intervalMs = refreshInterval * MS_PER_MINUTE

    const compute = () => {
      const queue = getTaskQueue('github')
      const running = queue.runningCount
      const pending = queue.pendingCount
      const activeTasks = running + pending

      const activeLabel = computeActiveLabel(activeTasks, queue.getRunningTaskName())
      const { oldestAge, latestRefresh } = computeCacheAges(PR_MODES)

      const remaining = Math.max(0, intervalMs - oldestAge)
      const remainingSecs = Math.ceil(remaining / 1000)

      const phase: SyncPhase = activeTasks > 0 ? 'syncing' : 'idle'

      setStatus({
        phase,
        activeLabel,
        activeTasks,
        nextRefreshSecs: phase === 'syncing' ? null : remainingSecs,
        nextRefreshLabel: phase === 'syncing' ? null : formatSecondsCountdown(remainingSecs),
        lastRefreshedAt: latestRefresh || null,
        lastRefreshedLabel: latestRefresh ? formatDistanceToNow(latestRefresh) : null,
      })
    }

    compute()
    // Update every second for smooth countdown
    const timer = setInterval(compute, 1000)
    return () => clearInterval(timer)
  }, [refreshInterval])

  return status
}
