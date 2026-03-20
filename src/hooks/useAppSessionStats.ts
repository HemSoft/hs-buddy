import { useCallback, useEffect, useRef } from 'react'
import { useBuddyStatsMutations } from './useConvex'

const UPTIME_CHECKPOINT_MS = 5 * 60 * 1000

export function useAppSessionStats() {
  const {
    increment: incrementStat,
    recordSessionStart,
    recordSessionEnd,
    checkpointUptime,
  } = useBuddyStatsMutations()
  const incrementStatRef = useRef(incrementStat)

  useEffect(() => {
    incrementStatRef.current = incrementStat
  }, [incrementStat])

  useEffect(() => {
    recordSessionStart().catch(() => {})

    const checkpointTimer = setInterval(() => {
      checkpointUptime().catch(() => {})
    }, UPTIME_CHECKPOINT_MS)

    const handleBeforeUnload = () => {
      recordSessionEnd().catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(checkpointTimer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
    // React Strict Mode remount behavior makes this intentionally mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trackViewOpen = useCallback((viewId: string) => {
    incrementStatRef.current({ field: 'tabsOpened' }).catch(() => {})

    const prStatMap: Record<string, string> = {
      'pr-my-prs': 'prsViewed',
      'pr-needs-review': 'prsReviewed',
      'pr-recently-merged': 'prsMergedWatched',
    }
    const statField = prStatMap[viewId]

    if (statField) {
      incrementStatRef.current({ field: statField }).catch(() => {})
    }
  }, [])

  return { trackViewOpen }
}
