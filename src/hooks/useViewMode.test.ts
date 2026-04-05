import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewMode } from './useViewMode'

const mockUpdateViewMode = vi.fn()

vi.mock('./useConvex', () => ({
  useSettings: () => undefined,
  useSettingsMutations: () => ({ updateViewMode: mockUpdateViewMode }),
}))

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear()
    mockUpdateViewMode.mockClear()
  })

  it('defaults to card mode', () => {
    const { result } = renderHook(() => useViewMode('test-page'))
    expect(result.current[0]).toBe('card')
  })

  it('accepts a custom default', () => {
    const { result } = renderHook(() => useViewMode('test-page', 'list'))
    expect(result.current[0]).toBe('list')
  })

  it('persists mode to localStorage and Convex', () => {
    const { result } = renderHook(() => useViewMode('test-page'))

    act(() => {
      result.current[1]('list')
    })

    expect(result.current[0]).toBe('list')
    expect(localStorage.getItem('viewMode:test-page')).toBe('list')
    expect(mockUpdateViewMode).toHaveBeenCalledWith({ pageKey: 'test-page', mode: 'list' })
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
