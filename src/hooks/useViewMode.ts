import { useState, useCallback } from 'react'

export type ViewMode = 'card' | 'list'

const STORAGE_PREFIX = 'viewMode:'

/**
 * Persists a card/list view preference per page key in localStorage.
 */
export function useViewMode(key: string, defaultMode: ViewMode = 'card') {
  const storageKey = `${STORAGE_PREFIX}${key}`

  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === 'card' || stored === 'list') return stored
    } catch {
      // localStorage unavailable
    }
    return defaultMode
  })

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // localStorage unavailable
      }
    },
    [storageKey]
  )

  return [mode, setMode] as const
}
