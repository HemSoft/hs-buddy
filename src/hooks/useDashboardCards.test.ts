import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDashboardCards, DASHBOARD_CARDS } from './useDashboardCards'

const mockInvoke = vi.fn()

describe('useDashboardCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({})
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: mockInvoke },
    })
  })

  it('returns all cards with defaults', () => {
    const { result } = renderHook(() => useDashboardCards())
    expect(result.current.cards).toEqual(DASHBOARD_CARDS)
    expect(result.current.visibleCards.length).toBe(DASHBOARD_CARDS.length)
  })

  it('all cards are visible by default', () => {
    const { result } = renderHook(() => useDashboardCards())
    for (const card of DASHBOARD_CARDS) {
      expect(result.current.isVisible(card.id)).toBe(true)
    }
  })

  it('toggles card visibility', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })

    expect(result.current.isVisible('weather')).toBe(false)
    expect(result.current.visibleCards.find(c => c.id === 'weather')).toBeUndefined()
  })

  it('persists visibility via IPC on toggle', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'config:set-dashboard-cards',
      expect.objectContaining({ weather: false })
    )
  })

  it('loads stored prefs from IPC on mount', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve({ 'command-center': false })
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    await waitFor(() => {
      expect(result.current.isVisible('command-center')).toBe(false)
    })
    // Other cards should use their defaults
    expect(result.current.isVisible('workspace-pulse')).toBe(true)
    expect(result.current.isVisible('weather')).toBe(true)
  })

  it('handles corrupt IPC data gracefully', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve('not-an-object')
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Wait for useEffect to run, then verify defaults are still in place
    await waitFor(() => {
      expect(result.current.visibleCards.length).toBe(DASHBOARD_CARDS.length)
    })
  })

  it('ignores late IPC load after user toggles a card', async () => {
    let resolveLoad: (value: unknown) => void
    const loadPromise = new Promise(resolve => {
      resolveLoad = resolve
    })

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') return loadPromise
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // User toggles before IPC load resolves
    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(false)

    // Late IPC load resolves with weather: true
    await act(async () => {
      resolveLoad!({ weather: true })
    })

    // User's toggle should NOT be overwritten
    expect(result.current.isVisible('weather')).toBe(false)
  })

  it('toggling card back on restores visibility', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(false)

    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(true)
  })
})
