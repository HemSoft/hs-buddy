import { useState, useCallback } from 'react'

/**
 * Manages localStorage-backed expand/collapse state for dashboard cards.
 *
 * @param storageKey  localStorage key (e.g. 'finance:expanded')
 * @param defaultExpanded  initial state when no value is persisted (default: true)
 */
export function useExpandCollapse(storageKey: string, defaultExpanded = true) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) return stored !== 'false'
    } catch {
      // localStorage unavailable
    }
    return defaultExpanded
  })

  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [storageKey])

  return { expanded, toggle }
}
