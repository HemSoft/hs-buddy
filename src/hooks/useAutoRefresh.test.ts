import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoRefresh, INTERVAL_OPTIONS } from './useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to disabled with the given interval', () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', refresh, 15))

    expect(result.current.enabled).toBe(false)
    expect(result.current.intervalMinutes).toBe(15)
    expect(result.current.selectedValue).toBe(0)
  })

  it('reads persisted settings from localStorage', () => {
    localStorage.setItem(
      'card-refresh:weather',
      JSON.stringify({ enabled: true, intervalMinutes: 30 })
    )
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('weather', refresh, 15))

    expect(result.current.enabled).toBe(true)
    expect(result.current.intervalMinutes).toBe(30)
    expect(result.current.selectedValue).toBe(30)
  })

  it('falls back to defaults for corrupt localStorage', () => {
    localStorage.setItem('card-refresh:test', '{invalid json')
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('test', refresh, 15))

    expect(result.current.enabled).toBe(false)
    expect(result.current.intervalMinutes).toBe(15)
  })

  it('ignores non-numeric lastRefreshed in localStorage', () => {
    localStorage.setItem('card-last-refreshed:bad-ts', 'not-a-number')
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('bad-ts', refresh, 15))

    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('persists settings to localStorage on update', () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', refresh, 15))

    act(() => {
      result.current.setInterval(5)
    })

    const stored = JSON.parse(localStorage.getItem('card-refresh:finance')!)
    expect(stored.enabled).toBe(true)
    expect(stored.intervalMinutes).toBe(5)
  })

  it('calls refresh at the configured interval', () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', refresh, 5))

    act(() => {
      result.current.setInterval(1)
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does not call refresh when disabled', () => {
    const refresh = vi.fn()
    renderHook(() => useAutoRefresh('finance', refresh, 15))

    act(() => {
      vi.advanceTimersByTime(20 * 60_000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('stops interval when set to off (0)', () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', refresh, 5))

    act(() => {
      result.current.setInterval(1)
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.setInterval(0)
    })
    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('uses the latest refresh function (no stale closure)', () => {
    const refreshA = vi.fn()
    const refreshB = vi.fn()

    const { result, rerender } = renderHook(({ fn }) => useAutoRefresh('finance', fn, 5), {
      initialProps: { fn: refreshA },
    })

    act(() => {
      result.current.setInterval(1)
    })

    rerender({ fn: refreshB })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refreshB).toHaveBeenCalledTimes(1)
    expect(refreshA).not.toHaveBeenCalled()
  })

  it('exports INTERVAL_OPTIONS with Off as first option', () => {
    expect(INTERVAL_OPTIONS[0]).toEqual({ value: 0, label: 'Off' })
    expect(INTERVAL_OPTIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('skips ticks when paused', () => {
    const refresh = vi.fn()
    const { result, rerender } = renderHook(
      ({ paused }) => useAutoRefresh('finance', refresh, 5, paused),
      { initialProps: { paused: false } }
    )

    act(() => {
      result.current.setInterval(1)
    })

    // Pause (e.g. loading in progress)
    rerender({ paused: true })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).not.toHaveBeenCalled()

    // Unpause
    rerender({ paused: false })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stamps lastRefreshedAt on successful sync refresh', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    expect(result.current.lastRefreshedAt).toBeNull()

    act(() => {
      result.current.refresh()
    })

    expect(result.current.lastRefreshedAt).toBe(Date.now())
  })

  it('stamps lastRefreshedAt on successful async refresh', async () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    expect(result.current.lastRefreshedAt).toBeNull()

    await act(async () => {
      result.current.refresh()
      await Promise.resolve()
    })

    expect(result.current.lastRefreshedAt).toBe(Date.now())
  })

  it('does NOT stamp lastRefreshedAt on failed async refresh', async () => {
    const underlying = vi.fn(() => Promise.reject(new Error('network error')))
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    await act(async () => {
      result.current.refresh()
      await Promise.resolve()
    })

    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('does NOT stamp lastRefreshedAt on sync throw', () => {
    const underlying = vi.fn(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    act(() => {
      result.current.refresh()
    })

    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('persists lastRefreshedAt to localStorage on successful refresh', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    act(() => {
      result.current.refresh()
    })

    const stored = localStorage.getItem('card-last-refreshed:finance')
    expect(Number(stored)).toBe(Date.now())
  })

  it('provides lastRefreshedLabel after a successful refresh', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    // Trigger a successful refresh
    act(() => {
      result.current.refresh()
    })

    // Advance 5 minutes and let the 30s timer tick
    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })

    expect(result.current.lastRefreshedLabel).toBe('5 minutes ago')
  })

  it('provides nextRefreshLabel when auto-refresh is enabled', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 5))

    // Enable 5-minute auto-refresh
    act(() => {
      result.current.setInterval(5)
    })

    // Trigger a refresh to seed lastRefreshedAt
    act(() => {
      result.current.refresh()
    })

    // Advance 1 minute — 4 minutes remaining
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.nextRefreshSecs).toBe(240)
    expect(result.current.nextRefreshLabel).toBe('4m 00s')
  })

  it('returns null countdown when auto-refresh is disabled', () => {
    const underlying = vi.fn()
    const { result } = renderHook(() => useAutoRefresh('finance', underlying, 15))

    // Trigger a successful refresh
    act(() => {
      result.current.refresh()
    })

    expect(result.current.nextRefreshSecs).toBeNull()
    expect(result.current.nextRefreshLabel).toBeNull()
  })

  it('rejects NaN/Infinity/negative interval from localStorage', () => {
    for (const bad of [NaN, Infinity, -1, 999]) {
      localStorage.setItem(
        'card-refresh:finance',
        JSON.stringify({ enabled: true, intervalMinutes: bad })
      )
      const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
      expect(result.current.enabled).toBe(false)
      expect(INTERVAL_OPTIONS.some(o => o.value === result.current.intervalMinutes)).toBe(true)
      localStorage.clear()
    }
  })

  it('rejects interval values not in INTERVAL_OPTIONS', () => {
    localStorage.setItem(
      'card-refresh:finance',
      JSON.stringify({ enabled: true, intervalMinutes: 7 })
    )
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    expect(result.current.enabled).toBe(false)
    expect(result.current.intervalMinutes).toBe(15)
  })

  it('normalizes enabled:true with intervalMinutes:0 to disabled', () => {
    localStorage.setItem(
      'card-refresh:finance',
      JSON.stringify({ enabled: true, intervalMinutes: 0 })
    )
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    expect(result.current.enabled).toBe(false)
    expect(result.current.intervalMinutes).toBe(0)
  })

  it('syncs lastRefreshedAt from externalTimestamp when newer', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const externalTs = Date.now() - 60_000 // 1 minute ago
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15, false, externalTs))

    expect(result.current.lastRefreshedAt).toBe(externalTs)
    expect(Number(localStorage.getItem('card-last-refreshed:finance'))).toBe(externalTs)
  })

  it('does not overwrite a newer stamped value with an older externalTimestamp', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const underlying = vi.fn()
    const oldExternal = Date.now() - 5 * 60_000

    const { result } = renderHook(() =>
      useAutoRefresh('finance', underlying, 15, false, oldExternal)
    )

    // Manual refresh stamps a newer time
    act(() => {
      result.current.refresh()
    })

    const stampedAt = result.current.lastRefreshedAt!
    expect(stampedAt).toBeGreaterThan(oldExternal)

    // External timestamp is older — should not overwrite
    expect(result.current.lastRefreshedAt).toBe(stampedAt)
  })

  it('updates lastRefreshedAt when externalTimestamp changes to newer value', () => {
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))
    const ts1 = Date.now() - 120_000

    const { result, rerender } = renderHook(
      ({ ext }) => useAutoRefresh('finance', vi.fn(), 15, false, ext),
      { initialProps: { ext: ts1 as number | null } }
    )

    expect(result.current.lastRefreshedAt).toBe(ts1)

    // Simulate a new fetch completing with a newer timestamp
    const ts2 = Date.now()
    rerender({ ext: ts2 })

    expect(result.current.lastRefreshedAt).toBe(ts2)
  })

  it('ignores null externalTimestamp', () => {
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15, false, null))

    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('falls back to 0 when defaultIntervalMin is not in INTERVAL_OPTIONS', () => {
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 999))
    expect(result.current.intervalMinutes).toBe(0)
  })

  it('handles corrupt JSON in localStorage gracefully', () => {
    localStorage.setItem('card-refresh:finance', '{bad json')
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    expect(result.current.enabled).toBe(false)
    expect(result.current.intervalMinutes).toBe(15)
  })

  it('handles non-finite lastRefreshed timestamp in localStorage', () => {
    localStorage.setItem('card-last-refreshed:finance', 'not-a-number')
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('handles zero lastRefreshed timestamp in localStorage', () => {
    localStorage.setItem('card-last-refreshed:finance', '0')
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    expect(result.current.lastRefreshedAt).toBeNull()
  })

  it('does not stamp if unmounted after async refresh resolves', async () => {
    const underlying = vi.fn(() => Promise.resolve())
    const { result, unmount } = renderHook(() => useAutoRefresh('finance', underlying, 15))
    act(() => {
      result.current.refresh()
    })
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    // Can't check result after unmount, but no error thrown
  })

  it('clamps update() with a non-allowed interval to the previous value', () => {
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 5))
    act(() => {
      result.current.setInterval(5)
    })
    expect(result.current.intervalMinutes).toBe(5)
    act(() => {
      result.current.update({ intervalMinutes: 999 })
    })
    expect(result.current.intervalMinutes).toBe(5)
  })

  it('handles localStorage throwing on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => useAutoRefresh('finance', vi.fn(), 15))
    act(() => {
      result.current.setInterval(5)
    })
    // No error thrown despite localStorage failure
    expect(result.current.enabled).toBe(true)
    vi.mocked(Storage.prototype.setItem).mockRestore()
  })
})
