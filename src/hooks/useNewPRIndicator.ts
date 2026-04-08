import { useCallback, useEffect, useRef, useState } from 'react'
import { dataCache } from '../services/dataCache'
import type { PullRequest } from '../types/pullRequest'

/** Cache key prefix for storing the set of PR URLs the user has already seen. */
const SEEN_PREFIX = 'seen-prs:'

/** PR modes that support "new" tracking. */
const TRACKED_MODES = ['my-prs', 'needs-review'] as const
type TrackedMode = (typeof TRACKED_MODES)[number]

/** Derives the sidebar view ID from a PR mode using the shared `pr-` prefix convention. */
function viewIdForMode(mode: TrackedMode): string {
  return `pr-${mode}`
}

function prUrlsFromCache(mode: TrackedMode): Set<string> {
  const entry = dataCache.get<PullRequest[]>(mode)
  if (!entry?.data) return new Set()
  return new Set(entry.data.map(pr => pr.url))
}

function seenUrlsFromCache(mode: TrackedMode): Set<string> {
  const entry = dataCache.get<string[]>(`${SEEN_PREFIX}${mode}`)
  if (!entry?.data) return new Set()
  return new Set(entry.data)
}

function computeNewState(): { counts: Record<string, number>; urls: Set<string> } {
  const counts: Record<string, number> = {}
  const urls = new Set<string>()
  for (const mode of TRACKED_MODES) {
    // If we've never stored a seen set, treat everything as seen (first-launch UX)
    if (!dataCache.get(`${SEEN_PREFIX}${mode}`)) {
      counts[viewIdForMode(mode)] = 0
    } else {
      const current = prUrlsFromCache(mode)
      const seen = seenUrlsFromCache(mode)
      let newCount = 0
      for (const url of current) {
        if (!seen.has(url)) {
          newCount++
          urls.add(url)
        }
      }
      counts[viewIdForMode(mode)] = newCount
    }
  }
  return { counts, urls }
}

/**
 * Tracks which PRs in "My PRs" and "Needs Review" are new (unseen).
 *
 * On first launch (no seen data), all current PRs are treated as seen.
 * After that, any PR whose URL wasn't in the last-seen snapshot is "new."
 * Calling `markAsSeen(viewId)` stores the current PR URLs as the seen set.
 */
export function useNewPRIndicator() {
  const initialStateRef = useRef<{ counts: Record<string, number>; urls: Set<string> } | null>(null)
  if (initialStateRef.current === null) {
    initialStateRef.current = computeNewState()
  }

  const [newCounts, setNewCounts] = useState<Record<string, number>>(initialStateRef.current.counts)
  const [newUrls, setNewUrls] = useState<Set<string>>(initialStateRef.current.urls)
  const pendingMarkRef = useRef(new Set<TrackedMode>())

  // Seed the seen sets on first mount if they don't exist
  useEffect(() => {
    for (const mode of TRACKED_MODES) {
      if (!dataCache.get(`${SEEN_PREFIX}${mode}`)) {
        // Only seed when the mode's cache entry exists (data has loaded).
        // A null entry means the fetch hasn't completed yet.
        if (dataCache.get(mode) !== null) {
          dataCache.set(`${SEEN_PREFIX}${mode}`, [...prUrlsFromCache(mode)])
        }
      }
    }
  }, [])

  // Subscribe to dataCache updates for the PR modes
  useEffect(() => {
    const unsubscribe = dataCache.subscribe(key => {
      const isTracked = TRACKED_MODES.some(m => m === key)
      if (isTracked) {
        // Seed the seen set on first data arrival if not yet seeded.
        // The mount-time seed (above) only catches modes whose data is
        // already in the cache. Modes fetched later (e.g. needs-review)
        // would never get seeded without this, causing the first-launch
        // guard in computeNewState to permanently return 0.
        const mode = key as TrackedMode
        const hasLoadedData = dataCache.get(mode) !== null
        const hasSeenSet = !!dataCache.get(`${SEEN_PREFIX}${mode}`)
        const hasPendingMark = pendingMarkRef.current.has(mode)

        if (hasLoadedData) {
          if (hasPendingMark) {
            // A pending explicit markAsSeen takes precedence over initial
            // seeding so we only write the seen set once on first load.
            pendingMarkRef.current.delete(mode)
            dataCache.set(`${SEEN_PREFIX}${mode}`, [...prUrlsFromCache(mode)])
          } else if (!hasSeenSet) {
            // Seed on first data arrival — the cache entry now exists (even if
            // data is []), so we can distinguish "loaded empty" from "not loaded".
            dataCache.set(`${SEEN_PREFIX}${mode}`, [...prUrlsFromCache(mode)])
          }
        }
        const state = computeNewState()
        setNewCounts(state.counts)
        setNewUrls(state.urls)
      }
    })
    return unsubscribe
  }, [])

  const markAsSeen = useCallback((viewId: string) => {
    for (const mode of TRACKED_MODES) {
      if (viewIdForMode(mode) === viewId) {
        if (dataCache.get(mode) !== null) {
          dataCache.set(`${SEEN_PREFIX}${mode}`, [...prUrlsFromCache(mode)])
          const state = computeNewState()
          setNewCounts(state.counts)
          setNewUrls(state.urls)
        } else {
          // Data hasn't loaded yet — record the intent so it's applied
          // when the subscribe callback sees the first data arrival.
          pendingMarkRef.current.add(mode)
        }
        break
      }
    }
  }, [])

  /** Total unseen PRs across all tracked modes. */
  const totalNewCount = Object.values(newCounts).reduce((a, b) => a + b, 0)

  return { newCounts, newUrls, totalNewCount, markAsSeen }
}
