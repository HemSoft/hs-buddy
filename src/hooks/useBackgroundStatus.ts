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

const PR_MODES = ['my-prs', 'needs-review', 'recently-merged'] as const

export type SyncPhase = 'idle' | 'syncing' | 'error'

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
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return 'now'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatAge(ms: number): string {
  if (ms < 60_000) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m ago`
}

/**
 * Hook that provides real-time background sync status.
 * Updates every second for smooth countdown display.
 */
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
    const intervalMs = refreshInterval * 60 * 1000

    const compute = () => {
      const queue = getTaskQueue('github')
      const running = queue.runningCount
      const pending = queue.pendingCount
      const activeTasks = running + pending

      // Determine what's actively being synced from running task names
      let activeLabel: string | null = null
      if (activeTasks > 0) {
        // The queue doesn't expose task names publicly, but we can infer
        // from cache staleness which modes are being refreshed
        const staleLabels = PR_MODES
          .filter(mode => !dataCache.isFresh(mode, intervalMs))
          .map(mode => TASK_LABELS[mode] || mode)
        activeLabel = staleLabels.length > 0
          ? staleLabels.join(', ')
          : 'GitHub data'
      }

      // Find the oldest cache entry to compute countdown
      let oldestAge = 0
      let latestRefresh = 0
      for (const mode of PR_MODES) {
        const entry = dataCache.get(mode)
        if (entry) {
          const age = Date.now() - entry.fetchedAt
          if (age > oldestAge) oldestAge = age
          if (entry.fetchedAt > latestRefresh) latestRefresh = entry.fetchedAt
        }
      }

      const remaining = Math.max(0, intervalMs - oldestAge)
      const remainingSecs = Math.ceil(remaining / 1000)

      const phase: SyncPhase = activeTasks > 0 ? 'syncing' : 'idle'

      setStatus({
        phase,
        activeLabel,
        activeTasks,
        nextRefreshSecs: phase === 'syncing' ? null : remainingSecs,
        nextRefreshLabel: phase === 'syncing' ? null : formatCountdown(remainingSecs),
        lastRefreshedAt: latestRefresh || null,
        lastRefreshedLabel: latestRefresh ? formatAge(Date.now() - latestRefresh) : null,
      })
    }

    compute()
    // Update every second for smooth countdown
    const timer = setInterval(compute, 1000)
    return () => clearInterval(timer)
  }, [refreshInterval])

  return status
}
