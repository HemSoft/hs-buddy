import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsMounted } from './useIsMounted'

describe('useIsMounted', () => {
  it('returns true after mount', () => {
    const { result } = renderHook(() => useIsMounted())
    expect(result.current.current).toBe(true)
  })

  it('returns false after unmount', () => {
    const { result, unmount } = renderHook(() => useIsMounted())
    unmount()
    expect(result.current.current).toBe(false)
  })
})
