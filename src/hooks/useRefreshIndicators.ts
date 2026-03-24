/**
 * Refresh Indicators Hook
 *
 * Polls the task queue to provide per-data-source refresh state:
 *   - 'idle'    — not refreshing
 *   - 'pending' — queued, waiting for another task to finish
 *   - 'active'  — currently fetching
 *
 * Data source keys match sidebar item IDs:
 *   PR modes:  'my-prs', 'needs-review', 'recently-merged', 'need-a-nudge'
 *   Org repos: 'org-repos:{org}'
 *   Org detail: 'org-detail-overview-{org}', 'org-detail-members-{org}', etc.
 */

import { useState, useEffect } from 'react'
import { getTaskQueue } from '../services/taskQueue'

export type RefreshState = 'idle' | 'pending' | 'active'

export type RefreshIndicators = Record<string, RefreshState>

/**
 * Extracts the data source key from a task name.
 * Task names follow the pattern: "{label}-{key}" where label is "prefetch"
 * or "autorefresh" (from usePrefetch's label.toLowerCase()).
 *
 * Examples:
 *   "prefetch-my-prs"                  → "my-prs"
 *   "autorefresh-needs-review"         → "needs-review"
 *   "prefetch-org-repos:relias-engineering" → "org-repos:relias-engineering"
 *   "autorefresh-org-repos:hemsoft"    → "org-repos:hemsoft"
 */
function extractDataSourceKey(taskName: string): string {
  // Strip known prefixes (usePrefetch uses 'Prefetch' and 'AutoRefresh' labels,
  // which become 'prefetch-' and 'autorefresh-' via .toLowerCase())
  for (const prefix of ['prefetch-', 'autorefresh-']) {
    if (taskName.startsWith(prefix)) {
      return taskName.slice(prefix.length)
    }
  }
  return taskName
}

/**
 * Returns a map of data-source keys to their current refresh state.
 * Polls every 200ms while mounted.
 */
export function useRefreshIndicators(): RefreshIndicators {
  const [indicators, setIndicators] = useState<RefreshIndicators>({})

  useEffect(() => {
    const compute = () => {
      const queue = getTaskQueue('github')
      const running = queue.getRunningTaskNames()
      const pending = queue.getPendingTaskNames()

      if (running.length === 0 && pending.length === 0) {
        setIndicators(prev => (Object.keys(prev).length === 0 ? prev : {}))
        return
      }

      const next: RefreshIndicators = {}

      for (const name of running) {
        const key = extractDataSourceKey(name)
        next[key] = 'active'
      }

      for (const name of pending) {
        const key = extractDataSourceKey(name)
        if (!next[key]) {
          next[key] = 'pending'
        }
      }

      setIndicators(next)
    }

    compute()
    const timer = setInterval(compute, 200)
    return () => clearInterval(timer)
  }, [])

  return indicators
}
