import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { useWeather } from './useWeather'

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
})
