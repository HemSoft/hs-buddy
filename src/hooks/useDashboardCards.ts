import { useState, useCallback } from 'react'

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

const STORAGE_KEY = 'dashboard:cards'

type CardVisibility = Record<string, boolean>

function readStored(): CardVisibility | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as CardVisibility
  } catch {
    // corrupt or unavailable
  }
  return null
}

function writeStored(vis: CardVisibility) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vis))
  } catch {
    // localStorage unavailable
  }
}

function buildDefaults(): CardVisibility {
  const defaults: CardVisibility = {}
  for (const card of DASHBOARD_CARDS) {
    defaults[card.id] = card.defaultVisible
  }
  return defaults
}

function mergeWithDefaults(stored: CardVisibility | null): CardVisibility {
  const defaults = buildDefaults()
  if (!stored) return defaults
  const merged: CardVisibility = { ...defaults }
  for (const card of DASHBOARD_CARDS) {
    if (typeof stored[card.id] === 'boolean') {
      merged[card.id] = stored[card.id]
    }
  }
  return merged
}

export function useDashboardCards() {
  const [visibility, setVisibility] = useState<CardVisibility>(() =>
    mergeWithDefaults(readStored())
  )

  const isVisible = useCallback((cardId: string) => visibility[cardId] !== false, [visibility])

  const toggleCard = useCallback((cardId: string) => {
    setVisibility(prev => {
      const next = { ...prev, [cardId]: !prev[cardId] }
      writeStored(next)
      return next
    })
  }, [])

  const visibleCards = DASHBOARD_CARDS.filter(c => isVisible(c.id))

  return { cards: DASHBOARD_CARDS, visibleCards, isVisible, toggleCard }
}
