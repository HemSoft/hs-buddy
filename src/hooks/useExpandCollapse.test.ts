import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExpandCollapse } from './useExpandCollapse'

describe('useExpandCollapse', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to expanded when no persisted value', () => {
    const { result } = renderHook(() => useExpandCollapse('test:expanded'))
    expect(result.current.expanded).toBe(true)
  })

  it('respects defaultExpanded = false', () => {
    const { result } = renderHook(() => useExpandCollapse('test:expanded', false))
    expect(result.current.expanded).toBe(false)
  })

  it('reads persisted "false" from localStorage', () => {
    localStorage.setItem('test:expanded', 'false')
    const { result } = renderHook(() => useExpandCollapse('test:expanded'))
    expect(result.current.expanded).toBe(false)
  })

  it('reads persisted "true" from localStorage', () => {
    localStorage.setItem('test:expanded', 'true')
    const { result } = renderHook(() => useExpandCollapse('test:expanded'))
    expect(result.current.expanded).toBe(true)
  })

  it('toggles and persists to localStorage', () => {
    const { result } = renderHook(() => useExpandCollapse('test:expanded'))
    expect(result.current.expanded).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.expanded).toBe(false)
    expect(localStorage.getItem('test:expanded')).toBe('false')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.expanded).toBe(true)
    expect(localStorage.getItem('test:expanded')).toBe('true')
  })
})
