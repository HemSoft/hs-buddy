import { useState, useCallback, useEffect, useRef } from 'react'

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

type CardVisibility = Record<string, boolean>

function buildDefaults(): CardVisibility {
  const defaults: CardVisibility = {}
  for (const card of DASHBOARD_CARDS) {
    defaults[card.id] = card.defaultVisible
  }
  return defaults
}

function sanitize(raw: unknown): CardVisibility | null {
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
  const [visibility, setVisibility] = useState<CardVisibility>(buildDefaults)
  const mutatedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.ipcRenderer
      .invoke('config:get-dashboard-cards')
      .then((raw: unknown) => {
        if (cancelled || mutatedRef.current) return
        const sanitized = sanitize(raw)
        if (sanitized) {
          setVisibility(mergeWithDefaults(sanitized))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const isVisible = useCallback((cardId: string) => visibility[cardId] !== false, [visibility])

  const toggleCard = useCallback((cardId: string) => {
    mutatedRef.current = true
    setVisibility(prev => {
      const next = { ...prev, [cardId]: !prev[cardId] }
      window.ipcRenderer.invoke('config:set-dashboard-cards', next).catch(() => {})
      return next
    })
  }, [])

  const visibleCards = DASHBOARD_CARDS.filter(c => isVisible(c.id))

  return { cards: DASHBOARD_CARDS, visibleCards, isVisible, toggleCard }
}
