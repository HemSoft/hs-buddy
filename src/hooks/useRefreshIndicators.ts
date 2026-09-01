/**
 * Refresh Indicators Hook
 *
 * Subscribes to the task queue to provide per-data-source refresh state:
 *   - 'idle'    — not refreshing
 *   - 'pending' — queued, waiting for another task to finish
 *   - 'active'  — currently fetching
 *
 * Data source keys match sidebar item IDs:
 *   PR modes:  'my-prs', 'needs-review', 'recently-merged', 'need-a-nudge'
 *   Org repos: 'org-repos:{org}'
 *   Org detail: 'org-detail-overview-{org}', 'org-detail-members-{org}', etc.
 */

import type { QueueSnapshot } from '../services/taskQueue'
import { getGitHubTaskDataSourceKey } from '../utils/githubTaskNames'
import { useTaskQueueSelector } from './useTaskQueue'

type RefreshState = 'idle' | 'pending' | 'active'

export type RefreshIndicators = Record<string, RefreshState>

function buildActiveRefreshIndicators(running: readonly string[]): RefreshIndicators {
  const next: RefreshIndicators = {}

  for (const name of running) {
    const key = getGitHubTaskDataSourceKey(name)
    next[key] = 'active'
  }

  return next
}

function applyPendingRefreshIndicators(next: RefreshIndicators, pending: readonly string[]): void {
  for (const name of pending) {
    const key = getGitHubTaskDataSourceKey(name)
    if (!next[key]) {
      next[key] = 'pending'
    }
  }
}

function buildRefreshIndicators(
  running: readonly string[],
  pending: readonly string[]
): RefreshIndicators {
  if (running.length === 0 && pending.length === 0) return {}

  const next = buildActiveRefreshIndicators(running)
  applyPendingRefreshIndicators(next, pending)
  return next
}

function refreshIndicatorsEqual(left: RefreshIndicators, right: RefreshIndicators): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key])
}

/**
 * Returns a map of data-source keys to their current refresh state.
 */
export function useRefreshIndicators(): RefreshIndicators {
  return useTaskQueueSelector('github', selectRefreshIndicators, refreshIndicatorsEqual)
}

function selectRefreshIndicators(snapshot: QueueSnapshot): RefreshIndicators {
  return buildRefreshIndicators(snapshot.runningTaskNames, snapshot.pendingTaskNames)
}
