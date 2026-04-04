import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewMode } from './useViewMode'

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to card mode', () => {
    const { result } = renderHook(() => useViewMode('test-page'))
    expect(result.current[0]).toBe('card')
  })

  it('accepts a custom default', () => {
    const { result } = renderHook(() => useViewMode('test-page', 'list'))
    expect(result.current[0]).toBe('list')
  })

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useViewMode('test-page'))

    act(() => {
      result.current[1]('list')
    })

    expect(result.current[0]).toBe('list')
    expect(localStorage.getItem('viewMode:test-page')).toBe('list')
  })

  it('reads persisted mode on mount', () => {
    localStorage.setItem('viewMode:test-page', 'list')
    const { result } = renderHook(() => useViewMode('test-page'))
    expect(result.current[0]).toBe('list')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('viewMode:test-page', 'invalid')
    const { result } = renderHook(() => useViewMode('test-page'))
    expect(result.current[0]).toBe('card')
  })
})
