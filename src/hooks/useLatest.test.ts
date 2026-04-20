import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useLatest } from './useLatest'

describe('useLatest', () => {
  it('returns a ref holding the initial value', () => {
    const { result } = renderHook(() => useLatest(42))
    expect(result.current.current).toBe(42)
  })

  it('updates the ref when value changes across renders', () => {
    const { result, rerender } = renderHook(({ val }) => useLatest(val), {
      initialProps: { val: 'first' },
    })
    expect(result.current.current).toBe('first')

    rerender({ val: 'second' })
    expect(result.current.current).toBe('second')
  })

  it('preserves ref identity across renders', () => {
    const { result, rerender } = renderHook(({ val }) => useLatest(val), {
      initialProps: { val: 1 },
    })
    const first = result.current

    rerender({ val: 2 })
    expect(result.current).toBe(first)
  })

  it('works with function values', () => {
    const fn1 = () => 'a'
    const fn2 = () => 'b'
    const { result, rerender } = renderHook(({ fn }) => useLatest(fn), {
      initialProps: { fn: fn1 },
    })
    expect(result.current.current).toBe(fn1)

    rerender({ fn: fn2 })
    expect(result.current.current).toBe(fn2)
  })
})
