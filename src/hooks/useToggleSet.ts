import { useState, useCallback } from 'react'

/**
 * Manages a Set<string> of toggled keys (e.g. expanded sections, selected items).
 *
 * Replaces the repeated pattern:
 * ```ts
 * const [expanded, setExpanded] = useState<Set<string>>(new Set())
 * const toggle = (key: string) => {
 *   setExpanded(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
 * }
 * ```
 */
export function useToggleSet(initial: Iterable<string> = []) {
  const [set, setSet] = useState(() => new Set(initial))

  const toggle = useCallback((key: string) => {
    setSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const has = useCallback((key: string) => set.has(key), [set])

  const add = useCallback((key: string) => {
    setSet(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const remove = useCallback((key: string) => {
    setSet(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  const reset = useCallback((keys: Iterable<string> = []) => {
    setSet(new Set(keys))
  }, [])

  return { set: set as ReadonlySet<string>, has, toggle, add, remove, reset }
}
