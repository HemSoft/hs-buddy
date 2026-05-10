import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsMounted } from './useIsMounted'

describe('useIsMounted', () => {
  it('returns true after mounting', () => {
    const { result } = renderHook(() => useIsMounted())
    expect(result.current.current).toBe(true)
  })

  it('returns false after unmounting', () => {
    const { result, unmount } = renderHook(() => useIsMounted())
    expect(result.current.current).toBe(true)

    const ref = result.current
    unmount()
    expect(ref.current).toBe(false)
  })
})
