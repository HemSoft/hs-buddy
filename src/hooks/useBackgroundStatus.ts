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

import { useState, useEffect, useRef } from 'react'
import { getTaskQueue } from '../services/taskQueue'
import { dataCache } from '../services/dataCache'
import { usePRSettings } from './useConfig'

const PR_MODES = ['my-prs', 'needs-review', 'recently-merged', 'need-a-nudge'] as const

export type SyncPhase = 'idle' | 'syncing' | 'error'

export interface BackgroundStatus {
  /** Current phase: idle, syncing, or error */
  phase: SyncPhase
  /** Human-readable label of what's being synced, e.g. "My PRs" */
  activeLabel: string | null
  /** Number of queued + running tasks in the github queue */
  activeTasks: number
  /** Current task position in the batch (1-based) */
  currentIndex: number | null
  /** Total tasks in the current batch */
  batchTotal: number | null
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
 * Tracks batch progress for "Processing X of N" display.
 */
export function useBackgroundStatus(): BackgroundStatus {
  const { refreshInterval } = usePRSettings()
  const [status, setStatus] = useState<BackgroundStatus>({
    phase: 'idle',
    activeLabel: null,
    activeTasks: 0,
    currentIndex: null,
    batchTotal: null,
    nextRefreshSecs: null,
    nextRefreshLabel: null,
    lastRefreshedAt: null,
    lastRefreshedLabel: null,
  })

  // Track batch progress across ticks
  const batchRef = useRef<{ completedInBatch: number; prevActiveTasks: number }>({
    completedInBatch: 0,
    prevActiveTasks: 0,
  })

  useEffect(() => {
    const intervalMs = refreshInterval * 60 * 1000

    const compute = () => {
      const queue = getTaskQueue('github')
      const running = queue.runningCount
      const pending = queue.pendingCount
      const activeTasks = running + pending

      const batch = batchRef.current

      // Detect batch transitions
      if (activeTasks > 0 && batch.prevActiveTasks === 0) {
        // Entering a new sync batch — reset counter
        batch.completedInBatch = 0
      } else if (activeTasks < batch.prevActiveTasks && batch.prevActiveTasks > 0) {
        // A task completed — increment completed count
        batch.completedInBatch += batch.prevActiveTasks - activeTasks
      }
      batch.prevActiveTasks = activeTasks

      // Compute queue position
      let activeLabel: string | null = null
      let currentIndex: number | null = null
      let batchTotal: number | null = null

      if (activeTasks > 0) {
        // Get actual running task name from the queue
        activeLabel = TASK_LABELS[queue.getRunningTaskName() ?? ''] ?? queue.getRunningTaskName() ?? 'GitHub data'
        currentIndex = batch.completedInBatch + 1
        batchTotal = batch.completedInBatch + activeTasks
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
        currentIndex,
        batchTotal,
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
