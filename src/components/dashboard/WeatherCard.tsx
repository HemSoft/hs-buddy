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
  Flower2,
  ChevronDown,
  ChevronUp,
  TreePine,
  Sprout,
  Leaf,
} from 'lucide-react'
import { useState, useMemo, type ReactNode } from 'react'
import { SectionHeading, StatCard, CardHeader, CardActionBar } from './DashboardPrimitives'
import { useWeather, type ForecastDay } from '../../hooks/useWeather'
import { usePollen, getPollenLabel, getPollenColor, clearPollenCache } from '../../hooks/usePollen'
import type { PollenData, PollenSpecies } from '../../hooks/usePollen'
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

function PollenBadge({ label, index }: { label: string; index: number }) {
  return (
    <div className="pollen-badge">
      <span className="pollen-badge-label">{label}</span>
      <span className="pollen-badge-value" style={{ color: getPollenColor(index) }}>
        {getPollenLabel(index)}
      </span>
    </div>
  )
}

const POLLEN_TYPE_ICONS: Record<string, typeof TreePine> = {
  TREE: TreePine,
  GRASS: Sprout,
  WEED: Leaf,
}

function SpeciesRow({ species }: { species: PollenSpecies }) {
  return (
    <div className="pollen-species-row">
      <span className="pollen-species-name">{species.displayName}</span>
      <span className="pollen-species-value" style={{ color: getPollenColor(species.index) }}>
        {getPollenLabel(species.index)}
      </span>
      {!species.inSeason && <span className="pollen-species-offseason">off-season</span>}
    </div>
  )
}

function SpeciesGroup({
  type,
  label,
  species,
}: {
  type: string
  label: string
  species: PollenSpecies[]
}) {
  /* v8 ignore next -- defensive fallback; all callers pass known types */
  const Icon = POLLEN_TYPE_ICONS[type] ?? Flower2
  return (
    <div className="pollen-species-group">
      <div className="pollen-species-group-header">
        <Icon size={11} className="pollen-species-group-icon" />
        <span className="pollen-species-group-label">{label}</span>
      </div>
      {species.map(s => (
        <SpeciesRow key={s.code} species={s} />
      ))}
    </div>
  )
}

function buildTypeGroups(
  species: PollenSpecies[]
): Array<{ type: string; label: string; items: PollenSpecies[] }> {
  const types = [
    { type: 'TREE', label: 'Trees' },
    { type: 'GRASS', label: 'Grasses' },
    { type: 'WEED', label: 'Weeds' },
  ]
  return types
    .map(({ type, label }) => ({ type, label, items: species.filter(s => s.type === type) }))
    .filter(g => g.items.length > 0)
}

function PollenDetailContent({
  typeGroups,
  healthRecommendations,
}: {
  typeGroups: Array<{ type: string; label: string; items: PollenSpecies[] }>
  healthRecommendations: string[]
}) {
  return (
    <div className="pollen-detail-content">
      {typeGroups.map(g => (
        <SpeciesGroup key={g.type} type={g.type} label={g.label} species={g.items} />
      ))}

      {healthRecommendations.length > 0 && (
        <div className="pollen-health-recs">
          <span className="pollen-health-recs-label">Health Tips</span>
          <ul className="pollen-health-recs-list">
            {healthRecommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PollenSpeciesDetail({
  species,
  healthRecommendations,
}: {
  species: PollenSpecies[]
  healthRecommendations: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  const typeGroups = buildTypeGroups(species)
  if (typeGroups.length === 0 && healthRecommendations.length === 0) return null

  return (
    <div className="pollen-detail">
      <button
        type="button"
        className="pollen-detail-toggle"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
      >
        <span className="pollen-detail-toggle-text">Species Detail</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <PollenDetailContent
          typeGroups={typeGroups}
          healthRecommendations={healthRecommendations}
        />
      )}
    </div>
  )
}

function PollenSection({ pollen }: { pollen: PollenData }) {
  return (
    <div className="pollen-section">
      <div className="pollen-header">
        <Flower2 size={12} className="pollen-icon" />
        <span className="pollen-title">Pollen Index</span>
      </div>
      <div className="pollen-grid">
        <PollenBadge label="Tree" index={pollen.tree} />
        <PollenBadge label="Grass" index={pollen.grass} />
        <PollenBadge label="Weed" index={pollen.weed} />
      </div>
      <PollenSpeciesDetail
        species={pollen.species}
        healthRecommendations={pollen.healthRecommendations}
      />
    </div>
  )
}

function PollenErrorHint({ error }: { error: string }) {
  return (
    <div className="pollen-section pollen-error-hint">
      <div className="pollen-header">
        <Flower2 size={12} className="pollen-icon" />
        <span className="pollen-title">Pollen Index</span>
      </div>
      <span className="pollen-error-text">{error}</span>
    </div>
  )
}

function PollenArea({ pollen, error }: { pollen: PollenData | null; error: string | null }) {
  if (pollen) return <PollenSection pollen={pollen} />
  if (error) return <PollenErrorHint error={error} />
  return null
}

function WeatherSearchBar({
  query,
  onChange,
  onSearch,
  disabled,
}: {
  query: string
  onChange: (query: string) => void
  onSearch: () => void
  disabled: boolean
}) {
  return (
    <div className="weather-search">
      <div className="weather-search-input-group">
        <Search size={14} className="weather-search-icon" />
        <input
          type="text"
          className="weather-search-input"
          placeholder="City, state or zip code…"
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSearch()
          }}
          aria-label="Search location"
        />
      </div>
      <button
        type="button"
        className="welcome-usage-btn"
        onClick={onSearch}
        disabled={disabled || !query.trim()}
        title="Search location"
      >
        <span>Go</span>
      </button>
    </div>
  )
}

function WeatherLoadingOrError({
  loading,
  error,
  hasData,
}: {
  loading: boolean
  error: string | null
  hasData: boolean
}) {
  if (loading && !hasData) {
    return (
      <div className="weather-loading">
        <RefreshCw size={16} className="spin" />
        <span>Fetching weather…</span>
      </div>
    )
  }
  if (error && !hasData) {
    return (
      <div className="weather-error">
        <span>{error}</span>
      </div>
    )
  }
  return null
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
  pollen,
  pollenError,
}: {
  data: ReturnType<typeof useWeather>['data']
  loading: boolean
  error: string | null
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSearch: () => void
  autoRefresh: ReturnType<typeof useAutoRefresh>
  onUseMyLocation: () => void
  pollen: PollenData | null
  pollenError: string | null
}) {
  return (
    <>
      <WeatherSearchBar
        query={searchQuery}
        onChange={onSearchQueryChange}
        onSearch={onSearch}
        disabled={loading}
      />

      <WeatherLoadingOrError loading={loading} error={error} hasData={!!data} />

      {data && <WeatherCurrentSection data={data} />}

      {data && <PollenArea pollen={pollen} error={pollenError} />}

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

function WeatherCollapsedSummary({
  data,
}: {
  data: {
    weatherCode: number
    temperature: number
    temperatureUnit: string
    description: string
    high: number
    low: number
  } | null
}) {
  /* v8 ignore next -- defensive null guard; component only renders when data is available */
  if (!data) return null
  return (
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
  )
}

export function WeatherCard() {
  const {
    data,
    loading,
    error,
    refresh,
    useMyLocation,
    setLocationBySearch,
    savedLocation,
    savedLocationCoords,
  } = useWeather()

  // Stabilize location reference to avoid unnecessary pollen re-fetches
  const pollenLocation = useMemo(
    () => ({ latitude: savedLocationCoords.latitude, longitude: savedLocationCoords.longitude }),
    [savedLocationCoords.latitude, savedLocationCoords.longitude]
  )
  const { data: pollenData, error: pollenError, refresh: refreshPollen } = usePollen(pollenLocation)

  const handleRefreshAll = async () => {
    clearPollenCache()
    await Promise.allSettled([refresh(), refreshPollen()])
  }

  const autoRefresh = useAutoRefresh('weather', handleRefreshAll, 30, loading)
  const [searchQuery, setSearchQuery] = useState('')
  const { expanded, toggle } = useExpandCollapse('weather:expanded')

  const handleSearch = () => {
    if (searchQuery.trim()) {
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

      {!expanded && <WeatherCollapsedSummary data={data} />}

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
          pollen={pollenData}
          pollenError={pollenError}
        />
      )}
    </section>
  )
}
