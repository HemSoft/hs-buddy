import { useState, useCallback, useEffect, useRef } from 'react'
import { useIsMounted } from './useIsMounted'
import { safeGetItem, safeGetJson, safeSetJson, safeRemoveItem } from '../utils/storage'
import { IPC_INVOKE } from '../ipc/contracts'

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

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function isEmptyPlainObject(raw: unknown): boolean {
  return isPlainObject(raw) && Object.keys(raw).length === 0
}

export function sanitize(raw: unknown): CardVisibility | null {
  if (!isPlainObject(raw)) return null
  const result: CardVisibility = {}
  for (const card of DASHBOARD_CARDS) {
    const val = raw[card.id]
    if (typeof val === 'boolean') result[card.id] = val
  }
  return Object.keys(result).length > 0 ? result : null
}

function mergeWithDefaults(stored: CardVisibility | null): CardVisibility {
  const defaults = buildDefaults()
  if (!stored) return defaults
  return { ...defaults, ...stored }
}

function resyncFromStore(
  currentVersion: number,
  toggleVersionRef: { current: number },
  mountedRef: { readonly current: boolean },
  prev: CardVisibility,
  visibilityRef: { current: CardVisibility },
  setVisibility: (v: CardVisibility) => void,
  mutatedRef: { current: boolean }
): void {
  window.ipcRenderer
    .invoke(IPC_INVOKE.CONFIG_GET_DASHBOARD_CARDS)
    .then((raw: unknown) => {
      if (toggleVersionRef.current !== currentVersion || !mountedRef.current) return
      const sanitized = sanitize(raw)
      if (sanitized === null && !isEmptyPlainObject(raw)) {
        console.warn(
          '[useDashboardCards] Malformed IPC data after save failure, reverting local state'
        )
        mutatedRef.current = false
        writeCache(prev)
        visibilityRef.current = prev
        setVisibility(prev)
        return
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
}

export function useDashboardCards() {
  const [visibility, setVisibility] = useState<CardVisibility>(() => mergeWithDefaults(readCache()))
  const visibilityRef = useRef(visibility)
  const mutatedRef = useRef(false)
  const toggleVersionRef = useRef(0)
  const mountedRef = useIsMounted()

  useEffect(() => {
    visibilityRef.current = visibility
  }, [visibility])

  useEffect(() => {
    const raw = safeGetItem(CACHE_KEY)
    if (raw === null) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (sanitize(parsed) === null) {
        console.warn('[useDashboardCards] Cleared invalid cached visibility on mount')
        clearCache()
      }
    } catch (err: unknown) {
      console.warn('[useDashboardCards] Failed to parse cached visibility:', err)
      clearCache()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_DASHBOARD_CARDS)
      .then((raw: unknown) => {
        if (cancelled || mutatedRef.current) return
        const sanitized = sanitize(raw)
        if (sanitized === null && !isEmptyPlainObject(raw)) {
          console.warn('[useDashboardCards] Malformed IPC data, keeping cached state')
          return
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

      visibilityRef.current = next
      setVisibility(next)
      writeCache(next)

      window.ipcRenderer
        .invoke(IPC_INVOKE.CONFIG_SET_DASHBOARD_CARDS, next)
        .catch((err: unknown) => {
          console.warn('[useDashboardCards] Failed to save to config store:', err)
          if (toggleVersionRef.current !== currentVersion || !mountedRef.current) return
          resyncFromStore(
            currentVersion,
            toggleVersionRef,
            mountedRef,
            prev,
            visibilityRef,
            setVisibility,
            mutatedRef
          )
        })
    },
    [mountedRef]
  )

  const visibleCards = DASHBOARD_CARDS.filter(c => isVisible(c.id))

  return { cards: DASHBOARD_CARDS, visibleCards, isVisible, toggleCard }
}
