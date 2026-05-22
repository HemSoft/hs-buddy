import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  usePollen,
  getPollenLabel,
  getPollenColor,
  clearPollenCache,
  POLLEN_LABELS,
  type PollenData,
  type PollenSpecies,
} from './usePollen'

const MOCK_LOCATION = { latitude: 35.8235, longitude: -78.8256 }
const MOCK_POLLEN: PollenData = {
  tree: 3,
  grass: 2,
  weed: 1,
  species: [],
  healthRecommendations: [],
}

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  clearPollenCache()
  window.ipcRenderer = { invoke: mockInvoke } as never
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (window as unknown as Record<string, unknown>).ipcRenderer
})

describe('getPollenLabel', () => {
  it('returns correct labels for all index values', () => {
    expect(getPollenLabel(0)).toBe('None')
    expect(getPollenLabel(1)).toBe('Very Low')
    expect(getPollenLabel(2)).toBe('Low')
    expect(getPollenLabel(3)).toBe('Medium')
    expect(getPollenLabel(4)).toBe('High')
    expect(getPollenLabel(5)).toBe('Very High')
  })

  it('clamps out-of-range values', () => {
    expect(getPollenLabel(-1)).toBe('None')
    expect(getPollenLabel(6)).toBe('Very High')
    expect(getPollenLabel(99)).toBe('Very High')
  })

  it('rounds fractional values', () => {
    expect(getPollenLabel(2.4)).toBe('Low')
    expect(getPollenLabel(2.6)).toBe('Medium')
  })
})

describe('getPollenColor', () => {
  it('returns muted color for 0', () => {
    expect(getPollenColor(0)).toBe('var(--text-muted)')
  })

  it('returns green for low values', () => {
    expect(getPollenColor(1)).toBe('#4caf50')
  })

  it('returns light green for index 2', () => {
    expect(getPollenColor(2)).toBe('#8bc34a')
  })

  it('returns amber for index 3', () => {
    expect(getPollenColor(3)).toBe('#ffc107')
  })

  it('returns orange for index 4', () => {
    expect(getPollenColor(4)).toBe('#ff9800')
  })

  it('returns red for high values', () => {
    expect(getPollenColor(5)).toBe('#f44336')
  })
})

describe('POLLEN_LABELS', () => {
  it('has 6 entries', () => {
    expect(POLLEN_LABELS).toHaveLength(6)
  })
})

describe('usePollen', () => {
  it('returns null data when location is null', () => {
    const { result } = renderHook(() => usePollen(null))
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetches pollen data via IPC on mount', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: MOCK_POLLEN })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_POLLEN)
    })

    expect(mockInvoke).toHaveBeenCalledWith('pollen:fetch-current', {
      latitude: MOCK_LOCATION.latitude,
      longitude: MOCK_LOCATION.longitude,
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns null data (no error) when API key is missing', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'no-api-key' })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('shows error when API call fails', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Google Pollen API: HTTP 429' })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.error).toBe('Google Pollen API: HTTP 429')
    })
  })

  it('uses cached data on second render', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: MOCK_POLLEN })

    const { result, unmount } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_POLLEN)
    })

    unmount()
    mockInvoke.mockClear()

    // Second render should use cache, not call IPC
    const { result: result2 } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result2.current.data).toEqual(MOCK_POLLEN)
    })

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('ignores cache with outdated version', async () => {
    // Pre-seed cache with version 0 (older than POLLEN_CACHE_VERSION=1)
    localStorage.setItem(
      'pollen:cache',
      JSON.stringify({
        data: MOCK_POLLEN,
        timestamp: Date.now(),
        version: 0,
        location: MOCK_LOCATION,
      })
    )

    const freshData: PollenData = {
      tree: 5,
      grass: 5,
      weed: 5,
      species: [],
      healthRecommendations: [],
    }
    mockInvoke.mockResolvedValueOnce({ success: true, data: freshData })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(freshData)
    })
    expect(mockInvoke).toHaveBeenCalled()
  })

  it('ignores cache with missing version field', async () => {
    // Pre-seed cache with no version field → (cached.version ?? 0) < 1
    localStorage.setItem(
      'pollen:cache',
      JSON.stringify({
        data: MOCK_POLLEN,
        timestamp: Date.now(),
        location: MOCK_LOCATION,
      })
    )

    const freshData: PollenData = {
      tree: 1,
      grass: 1,
      weed: 1,
      species: [],
      healthRecommendations: [],
    }
    mockInvoke.mockResolvedValueOnce({ success: true, data: freshData })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(freshData)
    })
    expect(mockInvoke).toHaveBeenCalled()
  })

  it('ignores expired cache', async () => {
    // Pre-seed cache with timestamp older than 2 hours
    localStorage.setItem(
      'pollen:cache',
      JSON.stringify({
        data: MOCK_POLLEN,
        timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
        version: 1,
        location: MOCK_LOCATION,
      })
    )

    const freshData: PollenData = {
      tree: 4,
      grass: 4,
      weed: 4,
      species: [],
      healthRecommendations: [],
    }
    mockInvoke.mockResolvedValueOnce({ success: true, data: freshData })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(freshData)
    })
    expect(mockInvoke).toHaveBeenCalled()
  })

  it('invalidates cache when location changes', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: MOCK_POLLEN })

    const { result, unmount } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_POLLEN)
    })

    unmount()

    const newLocation = { latitude: 40.7128, longitude: -74.006 }
    const newPollen: PollenData = {
      tree: 4,
      grass: 3,
      weed: 2,
      species: [],
      healthRecommendations: [],
    }
    mockInvoke.mockResolvedValueOnce({ success: true, data: newPollen })

    const { result: result2 } = renderHook(() => usePollen(newLocation))

    await waitFor(() => {
      expect(result2.current.data).toEqual(newPollen)
    })
  })

  it('handles IPC unavailable gracefully (test environment)', async () => {
    delete (window as unknown as Record<string, unknown>).ipcRenderer

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('refresh bypasses cache and re-fetches', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: MOCK_POLLEN })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(MOCK_POLLEN)
    })

    // Clear cache and call refresh
    clearPollenCache()
    const updatedPollen: PollenData = {
      tree: 5,
      grass: 4,
      weed: 3,
      species: [],
      healthRecommendations: [],
    }
    mockInvoke.mockResolvedValueOnce({ success: true, data: updatedPollen })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.data).toEqual(updatedPollen)
  })

  it('preserves species data from IPC response', async () => {
    const speciesData: PollenSpecies[] = [
      { code: 'OAK', displayName: 'Oak', index: 4, category: 'High', inSeason: true, type: 'TREE' },
      {
        code: 'RAGWEED',
        displayName: 'Ragweed',
        index: 0,
        category: 'None',
        inSeason: false,
        type: 'WEED',
      },
    ]
    const pollenWithSpecies: PollenData = {
      tree: 3,
      grass: 2,
      weed: 0,
      species: speciesData,
      healthRecommendations: ['Reduce outdoor activities when levels are high.'],
    }

    mockInvoke.mockResolvedValueOnce({ success: true, data: pollenWithSpecies })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.data).toEqual(pollenWithSpecies)
    })

    expect(result.current.data?.species).toHaveLength(2)
    expect(result.current.data?.species[0].displayName).toBe('Oak')
    expect(result.current.data?.healthRecommendations).toHaveLength(1)
  })

  it('refresh is a no-op when location is null', async () => {
    const { result } = renderHook(() => usePollen(null))

    mockInvoke.mockClear()
    await act(async () => {
      await result.current.refresh()
    })

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('does not update state if unmounted before IPC resolves', async () => {
    let resolveIpc!: (v: unknown) => void
    mockInvoke.mockReturnValue(
      new Promise(r => {
        resolveIpc = r
      })
    )

    const { result, unmount } = renderHook(() => usePollen(MOCK_LOCATION))

    // Wait for loading state
    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })

    // Unmount before IPC resolves
    unmount()

    // Now resolve — should be a no-op
    await act(async () => {
      resolveIpc({ success: true, data: MOCK_POLLEN })
    })

    // No error thrown, state unchanged
  })

  it('uses fallback error message when result.error is undefined', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false })

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.error).toBe('Pollen fetch failed')
    })
  })

  it('handles IPC throw when component is still mounted', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('IPC channel closed'))

    const { result } = renderHook(() => usePollen(MOCK_LOCATION))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('catch block is silent when component unmounted during IPC rejection', async () => {
    let rejectIpc!: (e: Error) => void
    mockInvoke.mockReturnValue(
      new Promise((_, rej) => {
        rejectIpc = rej
      })
    )

    const { unmount } = renderHook(() => usePollen(MOCK_LOCATION))

    // Unmount before IPC rejects
    unmount()

    // Reject after unmount — should be a no-op (no state update)
    await act(async () => {
      rejectIpc(new Error('Network error'))
    })
  })
})
