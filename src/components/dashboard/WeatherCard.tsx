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
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SectionHeading, StatCard, CardHeader, CardActionBar } from './DashboardPrimitives'
import { useWeather, type ForecastDay } from '../../hooks/useWeather'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { useExpandCollapse } from '../../hooks/useExpandCollapse'
import './WeatherCard.css'

const WEATHER_THRESHOLDS: ReadonlyArray<{ max: number; Icon: typeof Sun }> = [
  { max: 0, Icon: Sun },
  { max: 3, Icon: Cloud },
  { max: 48, Icon: CloudFog },
  { max: 65, Icon: CloudRain },
  { max: 75, Icon: CloudSnow },
  { max: 82, Icon: CloudRain },
  { max: 86, Icon: CloudSnow },
]

function weatherIcon(code: number, size = 18): ReactNode {
  const Icon = WEATHER_THRESHOLDS.find(t => code <= t.max)?.Icon ?? CloudLightning
  return <Icon size={size} />
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

function WeatherCurrentSection({
  data,
}: {
  data: NonNullable<ReturnType<typeof useWeather>['data']>
}) {
  return (
    <>
      <div className="weather-current">
        <div className="weather-temp-group">
          <div className="weather-icon-large">{weatherIcon(data.weatherCode)}</div>
          <span className="weather-temp-value">{`${data.temperature}${data.temperatureUnit}`}</span>
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
  )
}

function WeatherExpandedContent({
  data,
  loading,
  error,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  autoRefresh,
  onUseMyLocation,
}: {
  data: ReturnType<typeof useWeather>['data']
  loading: boolean
  error: string | null
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSearch: () => void
  autoRefresh: ReturnType<typeof useAutoRefresh>
  onUseMyLocation: () => void
}) {
  return (
    <>
      <div className="weather-search">
        <div className="weather-search-input-group">
          <Search size={14} className="weather-search-icon" />
          <input
            type="text"
            className="weather-search-input"
            placeholder="City, state or zip code…"
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            onKeyDown={e => {
              /* v8 ignore start */
              if (e.key === 'Enter') onSearch()
              /* v8 ignore stop */
            }}
            aria-label="Search location"
          />
        </div>
        <button
          type="button"
          className="welcome-usage-btn"
          onClick={onSearch}
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

      {data && <WeatherCurrentSection data={data} />}

      <CardActionBar
        onRefresh={autoRefresh.refresh}
        loading={loading}
        refreshTitle="Refresh weather data"
        selectedInterval={autoRefresh.selectedValue}
        onIntervalChange={autoRefresh.setInterval}
        lastRefreshedLabel={autoRefresh.lastRefreshedLabel}
        nextRefreshLabel={autoRefresh.nextRefreshLabel}
      >
        <button
          type="button"
          className="welcome-usage-btn"
          onClick={onUseMyLocation}
          title="Use my current location"
        >
          <MapPin size={14} />
          <span>Use My Location</span>
        </button>
      </CardActionBar>
    </>
  )
}

export function WeatherCard() {
  const { data, loading, error, refresh, useMyLocation, setLocationBySearch, savedLocation } =
    useWeather()
  const autoRefresh = useAutoRefresh('weather', refresh, 30, loading)
  const [searchQuery, setSearchQuery] = useState('')
  const { expanded, toggle } = useExpandCollapse('weather:expanded')

  const handleSearch = () => {
    /* v8 ignore start */
    if (searchQuery.trim()) {
      /* v8 ignore stop */
      setLocationBySearch(searchQuery.trim())
      setSearchQuery('')
    }
  }

  return (
    <section className="welcome-section welcome-section-weather" aria-label="Weather overview">
      <CardHeader expanded={expanded} onToggle={toggle}>
        <SectionHeading
          kicker="Local weather"
          title="Weather"
          caption={data?.locationName ?? savedLocation}
        />
      </CardHeader>

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
        <WeatherExpandedContent
          data={data}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearch={handleSearch}
          autoRefresh={autoRefresh}
          onUseMyLocation={useMyLocation}
        />
      )}
    </section>
  )
}
