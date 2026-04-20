import { useState, useEffect, useCallback, useRef } from 'react'

export interface ForecastDay {
  date: string
  dayName: string
  weatherCode: number
  description: string
  high: number
  low: number
}

interface WeatherData {
  temperature: number
  temperatureUnit: string
  weatherCode: number
  description: string
  humidity: number
  windSpeed: number
  high: number
  low: number
  locationName: string
  forecast: ForecastDay[]
}

interface WeatherState {
  data: WeatherData | null
  loading: boolean
  error: string | null
}

interface GeoLocation {
  latitude: number
  longitude: number
  name: string
}

const DEFAULT_LOCATION: GeoLocation = {
  latitude: 35.8235,
  longitude: -78.8256,
  name: 'Morrisville, NC',
}

const CACHE_KEY = 'weather:cache'
const CACHE_VERSION = 2 // bump when WeatherData shape changes
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const LOCATION_KEY = 'weather:location'

/** WMO Weather interpretation codes → human-readable labels */
export function weatherCodeToDescription(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with heavy hail',
  }
  return map[code] ?? 'Unknown'
}

function readCache(): { data: WeatherData; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { data: WeatherData; timestamp: number; version?: number }
      if ((parsed.version ?? 0) < CACHE_VERSION) return null // stale schema
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) return parsed
    }
  } catch {
    // corrupt or unavailable
  }
  return null
}

function writeCache(data: WeatherData) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now(), version: CACHE_VERSION })
    )
  } catch {
    // localStorage unavailable
  }
}

function readSavedLocation(): GeoLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (raw) return JSON.parse(raw) as GeoLocation
  } catch {
    // corrupt or unavailable
  }
  return null
}

function writeSavedLocation(loc: GeoLocation) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc))
  } catch {
    // localStorage unavailable
  }
}

async function fetchWeather(loc: GeoLocation, signal: AbortSignal): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}` +
    `&longitude=${loc.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=3`

  const resp = await fetch(url, { signal })
  if (!resp.ok) throw new Error(`Weather API error: ${resp.status}`)

  const json = (await resp.json()) as {
    current: {
      temperature_2m: number
      relative_humidity_2m: number
      weather_code: number
      wind_speed_10m: number
    }
    daily: {
      time: string[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      weather_code: number[]
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const forecast: ForecastDay[] = json.daily.time.map((date, i) => {
    const d = new Date(date + 'T12:00:00')
    return {
      date,
      dayName: i === 0 ? 'Today' : dayNames[d.getDay()],
      weatherCode: json.daily.weather_code[i],
      description: weatherCodeToDescription(json.daily.weather_code[i]),
      high: Math.round(json.daily.temperature_2m_max[i]),
      low: Math.round(json.daily.temperature_2m_min[i]),
    }
  })

  return {
    temperature: Math.round(json.current.temperature_2m),
    temperatureUnit: '°F',
    weatherCode: json.current.weather_code,
    description: weatherCodeToDescription(json.current.weather_code),
    humidity: Math.round(json.current.relative_humidity_2m),
    windSpeed: Math.round(json.current.wind_speed_10m),
    high: Math.round(json.daily.temperature_2m_max[0]),
    low: Math.round(json.daily.temperature_2m_min[0]),
    locationName: loc.name,
    forecast,
  }
}

export function useWeather() {
  const [state, setState] = useState<WeatherState>(() => {
    const cached = readCache()
    return cached
      ? { data: cached.data, loading: false, error: null }
      : { data: null, loading: true, error: null }
  })

  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState(prev => ({ ...prev, loading: true, error: null }))

    const loc = readSavedLocation() ?? DEFAULT_LOCATION

    return fetchWeather(loc, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          writeCache(data)
          setState({ data, loading: false, error: null })
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setState(prev => ({
            data: prev.data, // keep stale data visible
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to fetch weather',
          }))
        }
        throw err
      })
  }, [])

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocation not available' }))
      return
    }

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const loc: GeoLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          name: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
        }

        // Try to get a city name via reverse geocoding
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${loc.latitude}&lon=${loc.longitude}&format=json`,
            { headers: { 'User-Agent': 'hs-buddy/1.0' } }
          )
          if (resp.ok) {
            const json = (await resp.json()) as {
              address?: { city?: string; town?: string; village?: string; state?: string }
            }
            /* v8 ignore start */
            const city = json.address?.city ?? json.address?.town ?? json.address?.village ?? ''
            /* v8 ignore stop */
            const st = json.address?.state ?? ''
            /* v8 ignore start */
            if (city) loc.name = st ? `${city}, ${st}` : city
            /* v8 ignore stop */
          }
        } catch {
          // Use coordinate-based name as fallback
        }

        writeSavedLocation(loc)
        // Clear cache so next refresh uses new location
        try {
          localStorage.removeItem(CACHE_KEY)
        } catch {
          // localStorage unavailable
        }
        // Now re-fetch
        /* v8 ignore start */
        refresh().catch(() => {
          /* v8 ignore stop */
          /* error already handled in state */
        })
      },
      () => {
        setState(prev => ({ ...prev, error: 'Location permission denied' }))
      },
      { timeout: 10000, maximumAge: 300000 }
    )
  }, [refresh])

  const setLocationBySearch = useCallback(
    async (query: string) => {
      if (!query.trim()) return

      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const encoded = encodeURIComponent(query.trim())
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`,
          { headers: { 'User-Agent': 'hs-buddy/1.0' } }
        )
        if (!resp.ok) throw new Error(`Geocoding error: ${resp.status}`)

        const results = (await resp.json()) as Array<{
          lat: string
          lon: string
          address?: {
            city?: string
            town?: string
            village?: string
            state?: string
            country?: string
          }
          display_name?: string
        }>

        if (results.length === 0) {
          setState(prev => ({ ...prev, loading: false, error: `No results for "${query}"` }))
          return
        }

        const r = results[0]
        const city = r.address?.city ?? r.address?.town ?? r.address?.village ?? ''
        const st = r.address?.state ?? ''
        const name = city && st ? `${city}, ${st}` : city || r.display_name?.split(',')[0] || query

        const loc: GeoLocation = {
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
          name,
        }

        writeSavedLocation(loc)
        try {
          localStorage.removeItem(CACHE_KEY)
        } catch {
          // localStorage unavailable
        }
        /* v8 ignore start */
        refresh().catch(() => {
          /* v8 ignore stop */
          /* error already handled in state */
        })
      } catch (err) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Location search failed',
        }))
      }
    },
    [refresh]
  )

  const savedLocation = readSavedLocation()?.name ?? DEFAULT_LOCATION.name

  // Fetch on mount if no cached data
  useEffect(() => {
    if (!readCache()) {
      refresh().catch(() => {
        /* error already handled in state */
      })
    }

    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, refresh, useMyLocation, setLocationBySearch, savedLocation }
}
