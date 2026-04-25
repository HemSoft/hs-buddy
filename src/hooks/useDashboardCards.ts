import { useState, useCallback, useEffect, useRef } from 'react'
import { useIsMounted } from './useIsMounted'
import { safeGetItem, safeGetJson, safeSetJson, safeRemoveItem } from '../utils/storage'

export interface DashboardCardDef {
  id: string
  title: string
  defaultVisible: boolean
  /** Number of grid columns to span (1 or 2). Defaults to 2 (full width). */
  span: 1 | 2
}

/** Registry of all available dashboard cards. */
export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { id: 'command-center', title: 'Command Center', defaultVisible: true, span: 2 },
  { id: 'workspace-pulse', title: 'Workspace Pulse', defaultVisible: true, span: 1 },
  { id: 'weather', title: 'Weather', defaultVisible: true, span: 1 },
  { id: 'finance', title: 'Finance', defaultVisible: true, span: 1 },
]

const CACHE_KEY = 'dashboard:cards'

type CardVisibility = Record<string, boolean>

function buildDefaults(): CardVisibility {
  const defaults: CardVisibility = {}
  for (const card of DASHBOARD_CARDS) {
    defaults[card.id] = card.defaultVisible
  }
  return defaults
}

/** Read cached visibility from localStorage — pure, no side effects (StrictMode safe). */
function readCache(): CardVisibility | null {
  const parsed = safeGetJson<unknown>(CACHE_KEY)
  if (parsed === null) return null
  return sanitize(parsed)
}

/** Write visibility to localStorage cache. */
function writeCache(vis: CardVisibility): void {
  safeSetJson(CACHE_KEY, vis)
}

function clearCache(): void {
  safeRemoveItem(CACHE_KEY)
}

function isEmptyPlainObject(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    Object.keys(raw as Record<string, unknown>).length === 0
  )
}

export function sanitize(raw: unknown): CardVisibility | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const result: CardVisibility = {}
  for (const card of DASHBOARD_CARDS) {
    const val = (raw as Record<string, unknown>)[card.id]
    if (typeof val === 'boolean') result[card.id] = val
  }
  return Object.keys(result).length > 0 ? result : null
}

function mergeWithDefaults(stored: CardVisibility | null): CardVisibility {
  const defaults = buildDefaults()
  if (!stored) return defaults
  return { ...defaults, ...stored }
}

export function useDashboardCards() {
  // Synchronous init from localStorage cache — correct from the first render
  const [visibility, setVisibility] = useState<CardVisibility>(() => mergeWithDefaults(readCache()))
  const visibilityRef = useRef(visibility)
  const mutatedRef = useRef(false)
  const toggleVersionRef = useRef(0)
  const mountedRef = useIsMounted()

  // Keep ref in sync with state for use outside updater functions
  visibilityRef.current = visibility

  // Deferred cache cleanup: clear invalid localStorage entries after mount.
  // Keeps the useState initializer side-effect free (StrictMode safe).
  useEffect(() => {
    const raw = safeGetItem(CACHE_KEY)
    if (raw === null) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (sanitize(parsed) === null) {
        console.warn('[useDashboardCards] Cleared invalid cached visibility on mount')
        clearCache()
      }
    } catch (err) {
      console.warn('[useDashboardCards] Failed to parse cached visibility:', err)
      clearCache()
    }
  }, [])

  // Async IPC load from electron-store (authoritative source)
  useEffect(() => {
    let cancelled = false
    window.ipcRenderer
      .invoke('config:get-dashboard-cards')
      .then((raw: unknown) => {
        if (cancelled || mutatedRef.current) return
        const sanitized = sanitize(raw)
        // If sanitize rejects the data, only proceed when raw was literally {}
        // (meaning "all defaults"). Otherwise treat as load failure to avoid
        // overwriting a valid cache with defaults from malformed data.
        if (sanitized === null) {
          if (!isEmptyPlainObject(raw)) {
            console.warn('[useDashboardCards] Malformed IPC data, keeping cached state')
            return
          }
        }
        const merged = mergeWithDefaults(sanitized)
        writeCache(merged)
        visibilityRef.current = merged
        setVisibility(merged)
      })
      .catch((err: unknown) => {
        console.warn('[useDashboardCards] Failed to load from config store:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isVisible = useCallback((cardId: string) => visibility[cardId] !== false, [visibility])

  const toggleCard = useCallback(
    (cardId: string) => {
      mutatedRef.current = true
      const currentVersion = ++toggleVersionRef.current
      const prev = visibilityRef.current
      const next = { ...prev, [cardId]: !prev[cardId] }

      // Update ref immediately so rapid toggles read the latest state
      visibilityRef.current = next
      setVisibility(next)
      writeCache(next)

      window.ipcRenderer.invoke('config:set-dashboard-cards', next).catch((err: unknown) => {
        console.warn('[useDashboardCards] Failed to save to config store:', err)
        // Only resync if no newer toggle has occurred since this one and component is still mounted
        if (toggleVersionRef.current !== currentVersion || !mountedRef.current) return
        // Re-read the authoritative store so the UI converges back
        window.ipcRenderer
          .invoke('config:get-dashboard-cards')
          .then((raw: unknown) => {
            if (toggleVersionRef.current !== currentVersion || !mountedRef.current) return
            const sanitized = sanitize(raw)
            if (sanitized === null) {
              if (!isEmptyPlainObject(raw)) {
                console.warn(
                  '[useDashboardCards] Malformed IPC data after save failure, reverting local state'
                )
                mutatedRef.current = false
                writeCache(prev)
                visibilityRef.current = prev
                setVisibility(prev)
                return
              }
            }
            const merged = mergeWithDefaults(sanitized)
            mutatedRef.current = false
            writeCache(merged)
            visibilityRef.current = merged
            setVisibility(merged)
          })
          .catch((reloadErr: unknown) => {
            if (toggleVersionRef.current !== currentVersion || !mountedRef.current) return
            console.warn(
              '[useDashboardCards] Failed to reload config store after save failure:',
              reloadErr
            )
            mutatedRef.current = false
            writeCache(prev)
            visibilityRef.current = prev
            setVisibility(prev)
          })
      })
    },
    [mountedRef]
  )

  const visibleCards = DASHBOARD_CARDS.filter(c => isVisible(c.id))

  return { cards: DASHBOARD_CARDS, visibleCards, isVisible, toggleCard }
}
