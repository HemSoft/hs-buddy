import { useState, useCallback, useEffect, useRef } from 'react'
import { useSettings, useSettingsMutations } from './useConvex'

export type ViewMode = 'card' | 'list'

const STORAGE_PREFIX = 'viewMode:'

/**
 * Persists a card/list view preference per page key in Convex,
 * with localStorage as the initial value before Convex loads.
 */
export function useViewMode(key: string, defaultMode: ViewMode = 'card') {
  const storageKey = `${STORAGE_PREFIX}${key}`
  const settings = useSettings()
  const { updateViewMode } = useSettingsMutations()

  // Track in-flight mutations to avoid stale Convex values overwriting local state
  const pendingRef = useRef<ViewMode | null>(null)

  // Read initial value from localStorage (instant, no round-trip)
  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === 'card' || stored === 'list') return stored
    } catch {
      // localStorage unavailable
    }
    return defaultMode
  })

  // Once Convex loads, adopt the server value (source of truth)
  const convexMode = settings?.viewModes?.[key]
  useEffect(() => {
    if (convexMode === 'card' || convexMode === 'list') {
      // Skip stale values while a mutation is in-flight
      if (pendingRef.current !== null && convexMode !== pendingRef.current) return
      pendingRef.current = null
      setModeState(convexMode)
      try {
        localStorage.setItem(storageKey, convexMode)
      } catch {
        // localStorage unavailable
      }
    }
  }, [convexMode, storageKey])

  const setMode = useCallback(
    (next: ViewMode) => {
      pendingRef.current = next
      setModeState(next)
      // Write to localStorage for instant reads on next mount
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // localStorage unavailable
      }
      // Persist to Convex (async, fire-and-forget)
      updateViewMode({ pageKey: key, mode: next })
    },
    [storageKey, key, updateViewMode]
  )

  return [mode, setMode] as const
}
