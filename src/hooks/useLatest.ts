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
 * Assigning during render intentionally keeps the ref current for effects and
 * event handlers without making consumers depend on the value. This is the
 * established latest-ref escape hatch, not an externally visible side effect.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  // react-doctor-disable-next-line react-doctor/no-ref-current-in-render -- latest-ref helper; the write is isolated and not externally observable during render
  ref.current = value
  return ref
}
