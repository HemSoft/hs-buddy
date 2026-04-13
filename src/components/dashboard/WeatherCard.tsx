import {
  Cloud,
  Droplets,
  Wind,
  Thermometer,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  RefreshCw,
  MapPin,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SectionHeading, StatCard } from './DashboardPrimitives'
import { useWeather } from '../../hooks/useWeather'
import type { ForecastDay } from '../../hooks/useWeather'
import './WeatherCard.css'

function weatherIcon(code: number, size = 18): ReactNode {
  if (code === 0) return <Sun size={size} />
  if (code <= 3) return <Cloud size={size} />
  if (code <= 48) return <CloudFog size={size} />
  if (code <= 65) return <CloudRain size={size} />
  if (code <= 75) return <CloudSnow size={size} />
  if (code <= 82) return <CloudRain size={size} />
  if (code <= 86) return <CloudSnow size={size} />
  return <CloudLightning size={size} />
}

const EXPANDED_KEY = 'weather:expanded'

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) !== 'false'
  } catch {
    return true
  }
}

function ForecastRow({ day }: { day: ForecastDay }) {
  return (
    <div className="weather-forecast-row">
      <span className="weather-forecast-day">{day.dayName}</span>
      <div className="weather-forecast-icon">{weatherIcon(day.weatherCode, 14)}</div>
      <span className="weather-forecast-desc">{day.description}</span>
      <span className="weather-forecast-temps">
        <span className="weather-forecast-high">{day.high}°</span>
        <span className="weather-forecast-low">{day.low}°</span>
      </span>
    </div>
  )
}

export function WeatherCard() {
  const { data, loading, error, refresh, useMyLocation, setLocationBySearch, savedLocation } =
    useWeather()
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState(readExpanded)

  const toggleExpanded = () => {
    setExpanded(prev => {
      const next = !prev
      try {
        localStorage.setItem(EXPANDED_KEY, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setLocationBySearch(searchQuery.trim())
      setSearchQuery('')
    }
  }

  return (
    <section className="welcome-section welcome-section-weather" aria-label="Weather overview">
      <div className="weather-header-row">
        <SectionHeading
          kicker="Local weather"
          title="Weather"
          caption={data?.locationName ?? savedLocation}
        />
        <button
          type="button"
          className="weather-collapse-btn"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Collapsed summary — always visible */}
      {!expanded && data && (
        <div className="weather-collapsed-summary">
          <div className="weather-collapsed-left">
            <div className="weather-icon-small">{weatherIcon(data.weatherCode, 16)}</div>
            <span className="weather-collapsed-temp">
              {`${data.temperature}${data.temperatureUnit}`}
            </span>
            <span className="weather-collapsed-desc">{data.description}</span>
          </div>
          <span className="weather-collapsed-hilo">
            H: {data.high}° &nbsp; L: {data.low}°
          </span>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <>
          <div className="weather-search">
            <div className="weather-search-input-group">
              <Search size={14} className="weather-search-icon" />
              <input
                type="text"
                className="weather-search-input"
                placeholder="City, state or zip code…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSearch()
                }}
                aria-label="Search location"
              />
            </div>
            <button
              type="button"
              className="welcome-usage-btn"
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              title="Search location"
            >
              <span>Go</span>
            </button>
          </div>

          {loading && !data && (
            <div className="weather-loading">
              <RefreshCw size={16} className="spin" />
              <span>Fetching weather…</span>
            </div>
          )}

          {error && !data && (
            <div className="weather-error">
              <span>{error}</span>
            </div>
          )}

          {data && (
            <>
              <div className="weather-current">
                <div className="weather-temp-group">
                  <div className="weather-icon-large">{weatherIcon(data.weatherCode)}</div>
                  <span className="weather-temp-value">
                    {`${data.temperature}${data.temperatureUnit}`}
                  </span>
                </div>
                <span className="weather-description">{data.description}</span>
              </div>

              <div className="weather-stats-grid">
                <StatCard
                  icon={<Thermometer size={18} />}
                  value={`${data.high}° / ${data.low}°`}
                  label="High / Low"
                  cardClassName="weather-stat-card"
                  iconClassName="welcome-stat-icon-weather"
                />
                <StatCard
                  icon={<Droplets size={18} />}
                  value={`${data.humidity}%`}
                  label="Humidity"
                  cardClassName="weather-stat-card"
                  iconClassName="welcome-stat-icon-weather"
                />
                <StatCard
                  icon={<Wind size={18} />}
                  value={`${data.windSpeed} mph`}
                  label="Wind"
                  cardClassName="weather-stat-card"
                  iconClassName="welcome-stat-icon-weather"
                />
              </div>

              {data.forecast && data.forecast.length > 0 && (
                <div className="weather-forecast">
                  <span className="weather-forecast-label">3-Day Forecast</span>
                  <div className="weather-forecast-list">
                    {data.forecast.map(day => (
                      <ForecastRow key={day.date} day={day} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="weather-actions">
            <button
              type="button"
              className="welcome-usage-btn"
              onClick={refresh}
              disabled={loading}
              title="Refresh weather data"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="welcome-usage-btn"
              onClick={useMyLocation}
              title="Use my current location"
            >
              <MapPin size={14} />
              <span>Use My Location</span>
            </button>
          </div>
        </>
      )}
    </section>
  )
}
