import { useRef } from 'react'

/**
 * Returns a ref that always holds the latest value.
 *
 * Replaces the pervasive pattern:
 * ```ts
 * const fnRef = useRef(fn)
 * useEffect(() => { fnRef.current = fn }, [fn])
 * ```
 *
 * Assigning in the render body (not an effect) avoids the one-frame
 * stale window that the useEffect version introduces.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}
