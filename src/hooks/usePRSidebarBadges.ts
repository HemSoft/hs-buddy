import { useCallback, useEffect, useState } from 'react'
import { usePRSettings } from './useConfig'
import { dataCache } from '../services/dataCache'
import type { PullRequest } from '../types/pullRequest'
import { MS_PER_MINUTE, PR_MODES } from '../constants'
import { getProgressColor } from '../utils/progressColors'

type BadgeProgress = { progress: number; color: string; tooltip: string }

const PR_MODE_ENTRIES = PR_MODES.map(key => ({
  key,
  id: `pr-${key}`,
}))

function getInitialCounts(): Record<string, number> {
  const initial: Record<string, number> = {}
  for (const { key, id } of PR_MODE_ENTRIES) {
    const cached = dataCache.get<PullRequest[]>(key)
    if (cached?.data) {
      initial[id] = cached.data.length
    }
  }
  return initial
}

export function usePRSidebarBadges() {
  const { refreshInterval } = usePRSettings()
  const [prCounts, setPrCounts] = useState<Record<string, number>>(getInitialCounts)
  const [badgeProgress, setBadgeProgress] = useState<Record<string, BadgeProgress>>({})

  useEffect(() => {
    const modeToId = PR_MODE_ENTRIES.reduce<Record<string, string>>((acc, mode) => {
      acc[mode.key] = mode.id
      return acc
    }, {})

    const unsubscribe = dataCache.subscribe(key => {
      const viewId = modeToId[key]
      if (!viewId) {
        return
      }

      const entry = dataCache.get<PullRequest[]>(key)
      if (entry?.data) {
        setPrCounts(prev => ({ ...prev, [viewId]: entry.data.length }))
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const computeProgress = () => {
      const intervalMs = refreshInterval * MS_PER_MINUTE
      const now = Date.now()
      const next: Record<string, BadgeProgress> = {}

      for (const { key, id } of PR_MODE_ENTRIES) {
        const cached = dataCache.get(key)
        if (!cached) {
          continue
        }

        const elapsed = now - cached.fetchedAt
        const remaining = Math.max(0, intervalMs - elapsed)
        const progress = Math.min(100, Math.max(0, (elapsed / intervalMs) * 100))
        const elapsedMin = Math.floor(elapsed / 60000)
        const remainingMin = Math.ceil(remaining / 60000)
        const tooltip =
          elapsedMin < 1
            ? `Updated just now · Next in ${remainingMin}m`
            : `Updated ${elapsedMin}m ago · Next in ${remainingMin}m`

        next[id] = { progress, color: getProgressColor(progress), tooltip }
      }

      setBadgeProgress(next)
    }

    computeProgress()
    const timer = setInterval(computeProgress, 5000)
    return () => clearInterval(timer)
  }, [refreshInterval])

  const setPRCount = useCallback((viewId: string, count: number) => {
    setPrCounts(prev => ({ ...prev, [viewId]: count }))
  }, [])

  return { prCounts, badgeProgress, setPRCount }
}
