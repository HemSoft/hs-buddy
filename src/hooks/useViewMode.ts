import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useSettings, useSettingsMutations } from './useConvex'
import { safeGetItem, safeSetItem } from '../utils/storage'

export type ViewMode = 'card' | 'list'

const STORAGE_PREFIX = 'viewMode:'

function isViewMode(value: string | null): value is ViewMode {
  return value === 'card' || value === 'list'
}

function readLocal(storageKey: string): ViewMode | null {
  const value = safeGetItem(storageKey)
  if (isViewMode(value)) return value
  return null
}

function syncSeededViewMode(
  key: string,
  storageKey: string,
  convexMode: ViewMode | undefined,
  updateViewMode: (args: { pageKey: string; mode: ViewMode }) => Promise<unknown>,
  setModeState: Dispatch<SetStateAction<ViewMode>>
) {
  if (!convexMode) {
    return
  }

  const local = readLocal(storageKey)
  if (local) {
    if (local !== convexMode) {
      void updateViewMode({ pageKey: key, mode: local })
    }
    return
  }

  setModeState(convexMode)
  safeSetItem(storageKey, convexMode)
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
    if (!isViewMode(convexMode ?? null)) return
    seededKeyRef.current = key
    syncSeededViewMode(key, storageKey, convexMode, updateViewMode, setModeState)
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
