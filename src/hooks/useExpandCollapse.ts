import { useState, useCallback, useEffect, useRef } from 'react'
import { safeGetItem, safeSetItem } from '../utils/storage'

/**
 * Manages localStorage-backed expand/collapse state for dashboard cards.
 *
 * @param storageKey  localStorage key (e.g. 'finance:expanded')
 * @param defaultExpanded  initial state when no value is persisted (default: true)
 */
export function useExpandCollapse(storageKey: string, defaultExpanded = true) {
  const [expanded, setExpanded] = useState(() => {
    const stored = safeGetItem(storageKey)
    if (stored !== null) return stored !== 'false'
    return defaultExpanded
  })

  // Persist after state changes (skip initial render to avoid overwriting on mount)
  const isInitialRef = useRef(true)
  useEffect(() => {
    if (isInitialRef.current) {
      isInitialRef.current = false
      return
    }
    safeSetItem(storageKey, String(expanded))
  }, [storageKey, expanded])

  const toggle = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  return { expanded, toggle }
}
