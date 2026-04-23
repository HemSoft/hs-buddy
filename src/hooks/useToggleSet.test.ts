import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useToggleSet } from './useToggleSet'

describe('useToggleSet', () => {
  it('initializes empty by default', () => {
    const { result } = renderHook(() => useToggleSet())
    expect(result.current.set.size).toBe(0)
  })

  it('initializes with provided keys', () => {
    const { result } = renderHook(() => useToggleSet(['a', 'b']))
    expect(result.current.has('a')).toBe(true)
    expect(result.current.has('b')).toBe(true)
    expect(result.current.has('c')).toBe(false)
  })

  it('toggles a key on', () => {
    const { result } = renderHook(() => useToggleSet())
    act(() => result.current.toggle('x'))
    expect(result.current.has('x')).toBe(true)
  })

  it('toggles a key off', () => {
    const { result } = renderHook(() => useToggleSet(['x']))
    act(() => result.current.toggle('x'))
    expect(result.current.has('x')).toBe(false)
  })

  it('toggle returns true when key was present (removed)', () => {
    const { result } = renderHook(() => useToggleSet(['a']))
    let wasPresent: boolean | undefined
    act(() => {
      wasPresent = result.current.toggle('a')
    })
    expect(wasPresent).toBe(true)
  })

  it('toggle returns false when key was absent (added)', () => {
    const { result } = renderHook(() => useToggleSet())
    let wasPresent: boolean | undefined
    act(() => {
      wasPresent = result.current.toggle('a')
    })
    expect(wasPresent).toBe(false)
  })

  it('rapid toggles report correct previous membership via ref', () => {
    const { result } = renderHook(() => useToggleSet())
    const returns: boolean[] = []
    act(() => {
      returns.push(result.current.toggle('k'))
      returns.push(result.current.toggle('k'))
      returns.push(result.current.toggle('k'))
    })
    // false (absent→added), true (present→removed), false (absent→added)
    expect(returns).toEqual([false, true, false])
  })

  it('add is idempotent', () => {
    const { result } = renderHook(() => useToggleSet(['a']))
    const prevSet = result.current.set
    act(() => result.current.add('a'))
    expect(result.current.set).toBe(prevSet) // same reference — no re-render
  })

  it('add inserts a new key', () => {
    const { result } = renderHook(() => useToggleSet())
    act(() => result.current.add('z'))
    expect(result.current.has('z')).toBe(true)
  })

  it('remove is idempotent', () => {
    const { result } = renderHook(() => useToggleSet())
    const prevSet = result.current.set
    act(() => result.current.remove('missing'))
    expect(result.current.set).toBe(prevSet)
  })

  it('remove deletes an existing key', () => {
    const { result } = renderHook(() => useToggleSet(['a', 'b']))
    act(() => result.current.remove('a'))
    expect(result.current.has('a')).toBe(false)
    expect(result.current.has('b')).toBe(true)
  })

  it('reset replaces the set contents', () => {
    const { result } = renderHook(() => useToggleSet(['a', 'b']))
    act(() => result.current.reset(['c']))
    expect(result.current.has('a')).toBe(false)
    expect(result.current.has('c')).toBe(true)
  })

  it('reset with no args clears the set', () => {
    const { result } = renderHook(() => useToggleSet(['a']))
    act(() => result.current.reset())
    expect(result.current.set.size).toBe(0)
  })

  it('add then toggle in same tick sees up-to-date membership', () => {
    const { result } = renderHook(() => useToggleSet())
    let wasPresent: boolean | undefined
    act(() => {
      result.current.add('x')
      wasPresent = result.current.toggle('x')
    })
    // add('x') made it present, so toggle should see it and return true (removed)
    expect(wasPresent).toBe(true)
    expect(result.current.has('x')).toBe(false)
  })

  it('remove then toggle in same tick sees up-to-date membership', () => {
    const { result } = renderHook(() => useToggleSet(['x']))
    let wasPresent: boolean | undefined
    act(() => {
      result.current.remove('x')
      wasPresent = result.current.toggle('x')
    })
    // remove('x') made it absent, so toggle should return false (added)
    expect(wasPresent).toBe(false)
    expect(result.current.has('x')).toBe(true)
  })

  it('reset then toggle in same tick sees reset state', () => {
    const { result } = renderHook(() => useToggleSet(['a', 'b']))
    let wasPresent: boolean | undefined
    act(() => {
      result.current.reset(['c'])
      wasPresent = result.current.toggle('a')
    })
    // reset cleared 'a', so toggle should return false (added)
    expect(wasPresent).toBe(false)
    expect(result.current.has('a')).toBe(true)
    expect(result.current.has('c')).toBe(true)
  })
})
