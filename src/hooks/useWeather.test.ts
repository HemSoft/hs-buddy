import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useWeather, weatherCodeToDescription } from './useWeather'

function makeApiResponse() {
  return {
    ok: true,
    json: async () => ({
      current: { temperature_2m: 72, relative_humidity_2m: 45, weather_code: 1, wind_speed_10m: 8 },
      daily: {
        time: ['2026-04-13', '2026-04-14', '2026-04-15'],
        temperature_2m_max: [75, 78, 80],
        temperature_2m_min: [55, 58, 60],
        weather_code: [1, 2, 61],
      },
    }),
  }
}

describe('useWeather', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue(makeApiResponse())
  })

  it('starts in loading state without cache', () => {
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('initializes from valid cache', () => {
    const weatherData = {
      temperature: 72,
      temperatureUnit: '°F',
      weatherCode: 1,
      description: 'Mainly clear',
      humidity: 45,
      windSpeed: 8,
      high: 75,
      low: 55,
      locationName: 'Morrisville, NC',
      forecast: [],
    }
    localStorage.setItem(
      'weather:cache',
      JSON.stringify({ data: weatherData, timestamp: Date.now(), version: 2 })
    )
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(false)
    expect(result.current.data?.temperature).toBe(72)
  })

  it('ignores expired cache', () => {
    localStorage.setItem(
      'weather:cache',
      JSON.stringify({
        data: { temperature: 72 },
        timestamp: Date.now() - 31 * 60 * 1000,
        version: 2,
      })
    )
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(true)
  })

  it('ignores old cache version', () => {
    localStorage.setItem(
      'weather:cache',
      JSON.stringify({ data: { temperature: 72 }, timestamp: Date.now(), version: 1 })
    )
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(true)
  })

  it('fetches weather data on mount', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.temperature).toBe(72)
    expect(result.current.data?.description).toBe('Mainly clear')
    expect(result.current.data?.forecast).toHaveLength(3)
    expect(result.current.data?.forecast[0].dayName).toBe('Today')
  })

  it('maps forecast weather codes to descriptions', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.forecast[2].description).toBe('Slight rain')
  })

  it('handles API error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('500')
  })

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network failure')
  })

  it('handles non-Error rejection', async () => {
    mockFetch.mockRejectedValue('string error')
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to fetch weather')
  })

  it('writes cache after successful fetch', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cached = JSON.parse(localStorage.getItem('weather:cache')!)
    expect(cached.data.temperature).toBe(72)
    expect(cached.version).toBe(2)
  })

  it('keeps stale data on error', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).not.toBeNull()

    mockFetch.mockRejectedValue(new Error('Oops'))
    await act(async () => {
      result.current.refresh().catch(() => {
        /* expected rejection */
      })
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).not.toBeNull()
    expect(result.current.error).toBe('Oops')
  })

  it('uses saved location from localStorage', async () => {
    localStorage.setItem(
      'weather:location',
      JSON.stringify({ latitude: 40.71, longitude: -74.01, name: 'New York, NY' })
    )
    const { result } = renderHook(() => useWeather())
    expect(result.current.savedLocation).toBe('New York, NY')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect((mockFetch as Mock).mock.calls[0][0]).toContain('latitude=40.71')
  })

  it('defaults location to Morrisville, NC', () => {
    const { result } = renderHook(() => useWeather())
    expect(result.current.savedLocation).toBe('Morrisville, NC')
  })

  it('handles corrupt location data', () => {
    localStorage.setItem('weather:location', '{invalid')
    const { result } = renderHook(() => useWeather())
    expect(result.current.savedLocation).toBe('Morrisville, NC')
  })

  it('setLocationBySearch skips empty query', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const calls = mockFetch.mock.calls.length
    await act(async () => {
      await result.current.setLocationBySearch('  ')
    })
    expect(mockFetch.mock.calls.length).toBe(calls)
  })

  it('setLocationBySearch geocodes and refreshes', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { lat: '34.05', lon: '-118.24', address: { city: 'Los Angeles', state: 'California' } },
        ],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('Los Angeles')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Los Angeles, California')
  })

  it('setLocationBySearch handles no results', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await act(async () => {
      await result.current.setLocationBySearch('zzznonexistent')
    })
    expect(result.current.error).toContain('No results')
  })

  it('setLocationBySearch handles geocoding error', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await act(async () => {
      await result.current.setLocationBySearch('test')
    })
    expect(result.current.error).toContain('503')
  })

  it('useMyLocation shows error when geolocation unavailable', async () => {
    const origGeo = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.useMyLocation()
    })
    expect(result.current.error).toBe('Geolocation not available')
    Object.defineProperty(navigator, 'geolocation', { value: origGeo, configurable: true })
  })

  it('aborts on unmount', () => {
    const { unmount } = renderHook(() => useWeather())
    unmount()
  })

  it('handles corrupt cache gracefully', () => {
    localStorage.setItem('weather:cache', 'not json')
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(true)
  })

  it('setLocationBySearch falls back to display_name when no city', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { lat: '34.05', lon: '-118.24', display_name: 'Some Place, Earth', address: {} },
        ],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('Some Place')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Some Place')
  })

  it('setLocationBySearch uses query as fallback name', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '34.05', lon: '-118.24', address: {} }],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('Custom Query')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Custom Query')
  })

  it('setLocationBySearch handles fetch exception', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch.mockRejectedValueOnce(new Error('Network down'))

    await act(async () => {
      await result.current.setLocationBySearch('test')
    })
    expect(result.current.error).toBe('Network down')
  })

  it('setLocationBySearch handles non-Error exception', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch.mockRejectedValueOnce('string failure')

    await act(async () => {
      await result.current.setLocationBySearch('test')
    })
    expect(result.current.error).toBe('Location search failed')
  })

  it('setLocationBySearch uses town when city is missing', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            lat: '34.05',
            lon: '-118.24',
            address: { town: 'SmallTown', state: 'TX' },
          },
        ],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('SmallTown')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('SmallTown, TX')
  })

  it('useMyLocation success with city name from reverse geocoding', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.71, longitude: -74.01 },
      } as GeolocationPosition)
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    // First fetch: initial weather (on mount), then reverse geocoding, then weather refresh
    mockFetch
      .mockResolvedValueOnce(makeApiResponse()) // initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: { city: 'New York', state: 'New York' } }),
      })
      .mockResolvedValue(makeApiResponse())

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.useMyLocation()
    })

    // Wait for the geolocation success callback to complete
    await waitFor(() => {
      const saved = localStorage.getItem('weather:location')
      expect(saved).not.toBeNull()
    })

    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.latitude).toBe(40.71)
    expect(saved.longitude).toBe(-74.01)
  })

  it('useMyLocation falls back to coordinates when reverse geocoding fails', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 51.5, longitude: -0.12 },
      } as GeolocationPosition)
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    mockFetch
      .mockResolvedValueOnce(makeApiResponse()) // initial fetch
      .mockRejectedValueOnce(new Error('Network error')) // reverse geocoding fails
      .mockResolvedValue(makeApiResponse()) // weather refresh

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.useMyLocation()
    })

    await waitFor(() => {
      const saved = localStorage.getItem('weather:location')
      expect(saved).not.toBeNull()
    })

    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toContain('51.50')
  })

  it('useMyLocation reports permission denied error', async () => {
    const mockGetCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'User denied' } as GeolocationPositionError)
      }
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.useMyLocation()
    })

    expect(result.current.error).toBe('Location permission denied')
  })

  it('setLocationBySearch uses village when city and town are missing', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            lat: '34.05',
            lon: '-118.24',
            address: { village: 'Hamlet', state: 'NC' },
          },
        ],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('Hamlet')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Hamlet, NC')
  })

  it('ignores cache with no version field', () => {
    localStorage.setItem(
      'weather:cache',
      JSON.stringify({ data: { temperature: 72 }, timestamp: Date.now() })
    )
    const { result } = renderHook(() => useWeather())
    expect(result.current.loading).toBe(true)
  })

  it('fetch error does not update state when signal is aborted', async () => {
    let rejectFetch!: (err: Error) => void
    mockFetch.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFetch = reject
      })
    )

    const { unmount } = renderHook(() => useWeather())

    // Unmount aborts the signal
    unmount()

    // Reject after unmount — catch block should skip state update
    await act(async () => {
      rejectFetch(new Error('Network gone'))
      // Give the microtask queue time to process the rejection
      await new Promise(r => setTimeout(r, 0))
    })
  })

  it('useMyLocation reverse geocoding resp.ok false falls back to coordinates', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 51.5, longitude: -0.12 },
      } as GeolocationPosition)
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    mockFetch
      .mockResolvedValueOnce(makeApiResponse()) // initial fetch
      .mockResolvedValueOnce({ ok: false, status: 500 }) // reverse geocoding resp not ok
      .mockResolvedValue(makeApiResponse()) // weather refresh

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.useMyLocation()
    })

    await waitFor(() => {
      const saved = localStorage.getItem('weather:location')
      expect(saved).not.toBeNull()
    })

    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    // Falls back to coordinate-based name since reverse geocoding response was not ok
    expect(saved.name).toContain('51.50')
  })

  it('useMyLocation reverse geocoding with town and no city', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.71, longitude: -74.01 },
      } as GeolocationPosition)
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    mockFetch
      .mockResolvedValueOnce(makeApiResponse()) // initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: { town: 'SmallTown', state: 'NY' } }),
      })
      .mockResolvedValue(makeApiResponse())

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.useMyLocation()
    })

    await waitFor(() => {
      const saved = localStorage.getItem('weather:location')
      expect(saved).not.toBeNull()
    })

    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('SmallTown, NY')
  })

  it('useMyLocation reverse geocoding with village only', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.71, longitude: -74.01 },
      } as GeolocationPosition)
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    mockFetch
      .mockResolvedValueOnce(makeApiResponse()) // initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: { village: 'Hamlet' } }),
      })
      .mockResolvedValue(makeApiResponse())

    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.useMyLocation()
    })

    await waitFor(() => {
      const saved = localStorage.getItem('weather:location')
      expect(saved).not.toBeNull()
    })

    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Hamlet')
  })

  it('setLocationBySearch uses city without state', async () => {
    const { result } = renderHook(() => useWeather())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            lat: '48.86',
            lon: '2.35',
            address: { city: 'Paris' },
          },
        ],
      })
      .mockResolvedValue(makeApiResponse())

    await act(async () => {
      await result.current.setLocationBySearch('Paris')
    })
    const saved = JSON.parse(localStorage.getItem('weather:location')!)
    expect(saved.name).toBe('Paris')
  })
})

describe('weatherCodeToDescription', () => {
  it('maps code 0 to Clear sky', () => {
    expect(weatherCodeToDescription(0)).toBe('Clear sky')
  })

  it('maps code 1 to Mainly clear', () => {
    expect(weatherCodeToDescription(1)).toBe('Mainly clear')
  })

  it('maps code 2 to Partly cloudy', () => {
    expect(weatherCodeToDescription(2)).toBe('Partly cloudy')
  })

  it('maps code 3 to Overcast', () => {
    expect(weatherCodeToDescription(3)).toBe('Overcast')
  })

  it('maps code 45 to Foggy', () => {
    expect(weatherCodeToDescription(45)).toBe('Foggy')
  })

  it('maps code 48 to Depositing rime fog', () => {
    expect(weatherCodeToDescription(48)).toBe('Depositing rime fog')
  })

  it('maps drizzle codes correctly', () => {
    expect(weatherCodeToDescription(51)).toBe('Light drizzle')
    expect(weatherCodeToDescription(53)).toBe('Moderate drizzle')
    expect(weatherCodeToDescription(55)).toBe('Dense drizzle')
  })

  it('maps rain codes correctly', () => {
    expect(weatherCodeToDescription(61)).toBe('Slight rain')
    expect(weatherCodeToDescription(63)).toBe('Moderate rain')
    expect(weatherCodeToDescription(65)).toBe('Heavy rain')
  })

  it('maps snow codes correctly', () => {
    expect(weatherCodeToDescription(71)).toBe('Slight snow')
    expect(weatherCodeToDescription(73)).toBe('Moderate snow')
    expect(weatherCodeToDescription(75)).toBe('Heavy snow')
  })

  it('maps shower codes correctly', () => {
    expect(weatherCodeToDescription(80)).toBe('Slight rain showers')
    expect(weatherCodeToDescription(81)).toBe('Moderate rain showers')
    expect(weatherCodeToDescription(82)).toBe('Violent rain showers')
    expect(weatherCodeToDescription(85)).toBe('Slight snow showers')
    expect(weatherCodeToDescription(86)).toBe('Heavy snow showers')
  })

  it('maps thunderstorm codes correctly', () => {
    expect(weatherCodeToDescription(95)).toBe('Thunderstorm')
    expect(weatherCodeToDescription(96)).toBe('Thunderstorm with hail')
    expect(weatherCodeToDescription(99)).toBe('Thunderstorm with heavy hail')
  })

  it('returns Unknown for unmapped codes', () => {
    expect(weatherCodeToDescription(999)).toBe('Unknown')
    expect(weatherCodeToDescription(-1)).toBe('Unknown')
    expect(weatherCodeToDescription(10)).toBe('Unknown')
  })
})
