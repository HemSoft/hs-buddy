import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRefreshIndicators } from './useRefreshIndicators'

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: () => ({
    getRunningTaskNames: vi.fn().mockReturnValue([]),
    getPendingTaskNames: vi.fn().mockReturnValue([]),
  }),
}))

describe('useRefreshIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('starts with empty indicators', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current).toEqual({})
  })

  it('returns object type', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(typeof result.current).toBe('object')
  })
})
