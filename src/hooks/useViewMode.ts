import { useState, useCallback, useEffect, useRef } from 'react'
import { useSettings, useSettingsMutations } from './useConvex'
import { safeGetItem, safeSetItem } from '../utils/storage'

export type ViewMode = 'card' | 'list'

const STORAGE_PREFIX = 'viewMode:'

function readLocal(storageKey: string): ViewMode | null {
  const v = safeGetItem(storageKey)
  if (v === 'card' || v === 'list') return v
  return null
}

/**
 * Persists a card/list view preference per page key.
 *
 * localStorage is the authoritative local source (survives app close
 * even when an async Convex mutation hasn't committed yet).
 * Convex is a secondary store: we write to it on every toggle, and
 * seed from it only when localStorage has no value (e.g. fresh install).
 */
export function useViewMode(key: string, defaultMode: ViewMode = 'card') {
  const storageKey = `${STORAGE_PREFIX}${key}`
  const settings = useSettings()
  const { updateViewMode } = useSettingsMutations()

  // Read initial value from localStorage (instant, no round-trip)
  const [mode, setModeState] = useState<ViewMode>(() => readLocal(storageKey) ?? defaultMode)

  // Seed from Convex only when localStorage has no value (one-time fallback per key)
  const convexMode = settings?.viewModes?.[key]
  const seededKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (seededKeyRef.current === key) return
    if (convexMode !== 'card' && convexMode !== 'list') return
    seededKeyRef.current = key

    const local = readLocal(storageKey)
    if (local) {
      // localStorage already has a value — push to Convex if stale
      if (local !== convexMode) {
        updateViewMode({ pageKey: key, mode: local })
      }
      return
    }

    // No localStorage value — accept Convex value as seed
    setModeState(convexMode)
    safeSetItem(storageKey, convexMode)
  }, [convexMode, storageKey, key, updateViewMode])

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next)
      safeSetItem(storageKey, next)
      // Persist to Convex (async, fire-and-forget)
      updateViewMode({ pageKey: key, mode: next })
    },
    [storageKey, key, updateViewMode]
  )

  return [mode, setMode] as const
}
