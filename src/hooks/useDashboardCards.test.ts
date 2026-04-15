import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDashboardCards, DASHBOARD_CARDS, sanitize } from './useDashboardCards'

const mockInvoke = vi.fn()

describe('useDashboardCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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

  it('malformed IPC data preserves existing cache instead of overwriting with defaults', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Cache says workspace-pulse is hidden
    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({
        'command-center': true,
        'workspace-pulse': false,
        weather: true,
        finance: true,
      })
    )

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve('not-an-object')
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Cached state: workspace-pulse hidden
    expect(result.current.isVisible('workspace-pulse')).toBe(false)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[useDashboardCards] Malformed IPC data, keeping cached state'
      )
    })

    // Cache not overwritten — workspace-pulse still hidden
    expect(result.current.isVisible('workspace-pulse')).toBe(false)
    const cached = JSON.parse(localStorage.getItem('dashboard:cards')!)
    expect(cached['workspace-pulse']).toBe(false)

    warnSpy.mockRestore()
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

  // --- localStorage cache tests ---

  it('initializes from localStorage cache synchronously', () => {
    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({
        'command-center': true,
        'workspace-pulse': false,
        weather: true,
        finance: true,
      })
    )

    const { result } = renderHook(() => useDashboardCards())

    // Synchronous: workspace-pulse hidden from first render
    expect(result.current.isVisible('workspace-pulse')).toBe(false)
    expect(result.current.isVisible('command-center')).toBe(true)
  })

  it('readCache discards invalid localStorage values and clears cache', async () => {
    // Non-boolean values in cache should be rejected by sanitize validation
    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({ 'command-center': 'yes', weather: 42 })
    )

    const { result } = renderHook(() => useDashboardCards())

    // All defaults since cache was invalid
    for (const card of DASHBOARD_CARDS) {
      expect(result.current.isVisible(card.id)).toBe(card.defaultVisible)
    }
    // Invalid cache cleared asynchronously via deferred useEffect
    await waitFor(() => {
      expect(localStorage.getItem('dashboard:cards')).toBeNull()
    })
  })

  it('readCache handles unparseable JSON in localStorage', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    localStorage.setItem('dashboard:cards', '{not valid json')

    const { result } = renderHook(() => useDashboardCards())

    // Falls back to defaults
    for (const card of DASHBOARD_CARDS) {
      expect(result.current.isVisible(card.id)).toBe(card.defaultVisible)
    }
    // Corrupt cache cleared asynchronously via deferred useEffect
    await waitFor(() => {
      expect(localStorage.getItem('dashboard:cards')).toBeNull()
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[useDashboardCards] Failed to parse cached visibility:',
      expect.any(SyntaxError)
    )

    warnSpy.mockRestore()
  })

  it('IPC load updates localStorage cache', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve({ finance: false })
      }
      return Promise.resolve({})
    })

    renderHook(() => useDashboardCards())

    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem('dashboard:cards')!)
      expect(cached.finance).toBe(false)
    })
  })

  it('toggle writes to localStorage cache', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })

    const cached = JSON.parse(localStorage.getItem('dashboard:cards')!)
    expect(cached.weather).toBe(false)
  })

  it('authoritative empty object clears stale cache overrides', async () => {
    // Stale cache says workspace-pulse is hidden
    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({
        'command-center': true,
        'workspace-pulse': false,
        weather: true,
        finance: true,
      })
    )

    // Authoritative store returns {} (all defaults)
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve({})
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Initially hidden from cache
    expect(result.current.isVisible('workspace-pulse')).toBe(false)

    // After IPC load, authoritative {} resets to all-visible defaults
    await waitFor(() => {
      expect(result.current.isVisible('workspace-pulse')).toBe(true)
    })

    // Cache updated to reflect authoritative state
    const cached = JSON.parse(localStorage.getItem('dashboard:cards')!)
    expect(cached['workspace-pulse']).toBe(true)
  })

  it('IPC get failure logs warning and preserves cached state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({
        'command-center': true,
        'workspace-pulse': false,
        weather: true,
        finance: true,
      })
    )

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-dashboard-cards') {
        return Promise.reject(new Error('IPC failure'))
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Cached state preserved
    expect(result.current.isVisible('workspace-pulse')).toBe(false)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[useDashboardCards] Failed to load from config store:',
        expect.any(Error)
      )
    })

    // Still hidden — cache not cleared on read failure
    expect(result.current.isVisible('workspace-pulse')).toBe(false)

    warnSpy.mockRestore()
  })

  it('IPC set failure resyncs from authoritative store and reverts UI', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-dashboard-cards') {
        return Promise.reject(new Error('IPC set failure'))
      }
      // get-dashboard-cards returns the authoritative state (weather visible)
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve({
          weather: true,
          'command-center': true,
          'workspace-pulse': true,
          finance: true,
        })
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Weather starts visible
    expect(result.current.isVisible('weather')).toBe(true)

    act(() => {
      result.current.toggleCard('weather')
    })

    // Optimistically hidden
    expect(result.current.isVisible('weather')).toBe(false)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[useDashboardCards] Failed to save to config store:',
        expect.any(Error)
      )
    })

    // UI resynced from authoritative store — weather visible again
    await waitFor(() => {
      expect(result.current.isVisible('weather')).toBe(true)
    })

    // Cache updated with authoritative state
    const cached = JSON.parse(localStorage.getItem('dashboard:cards')!)
    expect(cached.weather).toBe(true)

    warnSpy.mockRestore()
  })

  it('IPC set failure with malformed resync data reverts to prev state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-dashboard-cards') {
        return Promise.reject(new Error('IPC set failure'))
      }
      // Resync returns malformed data (non-object string)
      if (channel === 'config:get-dashboard-cards') {
        return Promise.resolve('not-an-object')
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    expect(result.current.isVisible('weather')).toBe(true)

    act(() => {
      result.current.toggleCard('weather')
    })

    // Optimistically hidden
    expect(result.current.isVisible('weather')).toBe(false)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[useDashboardCards] Malformed IPC data after save failure, reverting local state'
      )
    })

    // Reverted to pre-toggle state
    expect(result.current.isVisible('weather')).toBe(true)

    warnSpy.mockRestore()
  })

  it('IPC set failure with reload failure falls back to prev state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-dashboard-cards') {
        return Promise.reject(new Error('IPC set failure'))
      }
      if (channel === 'config:get-dashboard-cards') {
        return Promise.reject(new Error('IPC reload failure'))
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    expect(result.current.isVisible('weather')).toBe(true)

    act(() => {
      result.current.toggleCard('weather')
    })

    expect(result.current.isVisible('weather')).toBe(false)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[useDashboardCards] Failed to reload config store after save failure:',
        expect.any(Error)
      )
    })

    // Reverted to pre-toggle state
    expect(result.current.isVisible('weather')).toBe(true)

    warnSpy.mockRestore()
  })

  it('save failure resets mutatedRef so subsequent IPC load applies', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let resolveGet: (value: unknown) => void
    const deferredGet = new Promise(resolve => {
      resolveGet = resolve
    })
    let getCallCount = 0

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-dashboard-cards') {
        return Promise.reject(new Error('save fail'))
      }
      if (channel === 'config:get-dashboard-cards') {
        getCallCount++
        // First call is the initial mount load — return empty (defaults)
        if (getCallCount === 1) return Promise.resolve({})
        // Second call is the resync after save failure
        return deferredGet
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Wait for initial IPC load
    await waitFor(() => {
      expect(getCallCount).toBe(1)
    })

    // Toggle weather off (save will fail)
    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(false)

    // Wait for save failure to trigger resync
    await waitFor(() => {
      expect(getCallCount).toBe(2)
    })

    // Resync returns authoritative state with weather visible
    await act(async () => {
      resolveGet!({ weather: true, 'command-center': true, 'workspace-pulse': true, finance: true })
    })

    // mutatedRef reset — authoritative state applied
    expect(result.current.isVisible('weather')).toBe(true)

    warnSpy.mockRestore()
  })

  it('rapid toggle failure does not revert newer successful toggles', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let rejectFirst: (err: Error) => void
    const firstSave = new Promise<void>((_, reject) => {
      rejectFirst = reject
    })

    let callCount = 0
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-dashboard-cards') {
        callCount++
        if (callCount === 1) return firstSave
        return Promise.resolve({})
      }
      return Promise.resolve({})
    })

    const { result } = renderHook(() => useDashboardCards())

    // Toggle weather off
    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(false)

    // Rapidly toggle finance off before first save fails
    act(() => {
      result.current.toggleCard('finance')
    })
    expect(result.current.isVisible('finance')).toBe(false)

    // First save fails
    await act(async () => {
      rejectFirst!(new Error('IPC fail'))
    })

    // Finance should still be off — not reverted by stale handler
    expect(result.current.isVisible('finance')).toBe(false)
    // Weather also stays off since the second toggle's save included its state
    expect(result.current.isVisible('weather')).toBe(false)

    warnSpy.mockRestore()
  })

  // --- sanitize export tests ---

  it('sanitize returns null for empty object', () => {
    expect(sanitize({})).toBeNull()
  })

  it('sanitize returns null for non-object', () => {
    expect(sanitize('string')).toBeNull()
    expect(sanitize(null)).toBeNull()
    expect(sanitize(42)).toBeNull()
    expect(sanitize([])).toBeNull()
  })

  it('sanitize extracts boolean values for known card ids', () => {
    const result = sanitize({ 'command-center': false, 'unknown-card': true })
    expect(result).toEqual({ 'command-center': false })
  })
})
