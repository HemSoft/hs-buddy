import { useState, useCallback, useMemo, useRef } from 'react'

/**
 * Manages a Set<string> of toggled keys (e.g. expanded sections, selected items).
 *
 * `toggle` returns `true` if the key was present before toggling (i.e. it was
 * removed). An internal ref tracks pending state so rapid calls never read
 * stale membership — safe for driving side effects without functional-setState.
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
  const currentRef = useRef(set)
  currentRef.current = set

  const toggle = useCallback((key: string): boolean => {
    const wasPresent = currentRef.current.has(key)
    const next = new Set(currentRef.current)
    if (wasPresent) next.delete(key)
    else next.add(key)
    currentRef.current = next
    setSet(next)
    return wasPresent
  }, [])

  const has = useCallback((key: string) => set.has(key), [set])

  const add = useCallback((key: string) => {
    if (currentRef.current.has(key)) return
    const next = new Set(currentRef.current)
    next.add(key)
    currentRef.current = next
    setSet(next)
  }, [])

  const remove = useCallback((key: string) => {
    if (!currentRef.current.has(key)) return
    const next = new Set(currentRef.current)
    next.delete(key)
    currentRef.current = next
    setSet(next)
  }, [])

  const reset = useCallback((keys: Iterable<string> = []) => {
    const next = new Set(keys)
    currentRef.current = next
    setSet(next)
  }, [])

  return useMemo(
    () => ({ set: set as ReadonlySet<string>, has, toggle, add, remove, reset }),
    [set, has, toggle, add, remove, reset]
  )
}
