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
})
