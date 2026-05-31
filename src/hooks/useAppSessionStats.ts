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
  const recordSessionStartRef = useRef(recordSessionStart)
  const recordSessionEndRef = useRef(recordSessionEnd)
  const checkpointUptimeRef = useRef(checkpointUptime)

  useEffect(() => {
    incrementStatRef.current = incrementStat
    recordSessionStartRef.current = recordSessionStart
    recordSessionEndRef.current = recordSessionEnd
    checkpointUptimeRef.current = checkpointUptime
  }, [incrementStat, recordSessionStart, recordSessionEnd, checkpointUptime])

  useEffect(() => {
    recordSessionStartRef.current().catch(() => {})

    const checkpointTimer = setInterval(() => {
      checkpointUptimeRef.current().catch(() => {})
    }, UPTIME_CHECKPOINT_MS)

    const handleBeforeUnload = () => {
      recordSessionEndRef.current().catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(checkpointTimer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
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
