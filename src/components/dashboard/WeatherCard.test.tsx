import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'

const weatherMocks = vi.hoisted(() => ({
  useWeather: vi.fn(),
  useAutoRefresh: vi.fn(),
  useExpandCollapse: vi.fn(),
}))

vi.mock('../../hooks/useWeather', () => ({
  useWeather: weatherMocks.useWeather,
}))

vi.mock('../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: weatherMocks.useAutoRefresh,
}))

vi.mock('../../hooks/useExpandCollapse', () => ({
  useExpandCollapse: weatherMocks.useExpandCollapse,
}))

vi.mock('./DashboardPrimitives', () => ({
  SectionHeading: ({
    kicker,
    title,
    caption,
  }: {
    kicker?: string
    title?: string
    caption?: string
  }) => (
    <div data-testid="section-heading">
      <span>{kicker}</span>
      <span>{title}</span>
      {caption && <span>{caption}</span>}
    </div>
  ),
  StatCard: ({ value, label }: { value?: string; label?: string }) => (
    <div data-testid="stat-card">
      <span>{value}</span>
      <span>{label}</span>
    </div>
  ),
  CardHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardActionBar: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-action-bar">{children}</div>
  ),
}))

vi.mock('lucide-react', () => ({
  Cloud: () => <span data-testid="icon-cloud" />,
  Droplets: () => <span data-testid="icon-droplets" />,
  Wind: () => <span data-testid="icon-wind" />,
  Thermometer: () => <span data-testid="icon-thermometer" />,
  Sun: () => <span data-testid="icon-sun" />,
  CloudRain: () => <span data-testid="icon-cloud-rain" />,
  CloudSnow: () => <span data-testid="icon-cloud-snow" />,
  CloudLightning: () => <span data-testid="icon-cloud-lightning" />,
  CloudFog: () => <span data-testid="icon-cloud-fog" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
  MapPin: () => <span data-testid="icon-map-pin" />,
  Search: () => <span data-testid="icon-search" />,
}))

const makeWeatherData = (overrides = {}) => ({
  temperature: 72,
  temperatureUnit: '°F',
  weatherCode: 0,
  description: 'Clear sky',
  humidity: 45,
  windSpeed: 10,
  high: 78,
  low: 62,
  locationName: 'Raleigh, NC',
  forecast: [
    { date: '2025-01-01', dayName: 'Wed', weatherCode: 0, description: 'Sunny', high: 80, low: 60 },
    {
      date: '2025-01-02',
      dayName: 'Thu',
      weatherCode: 3,
      description: 'Cloudy',
      high: 75,
      low: 58,
    },
    {
      date: '2025-01-03',
      dayName: 'Fri',
      weatherCode: 61,
      description: 'Rainy',
      high: 68,
      low: 55,
    },
  ],
  ...overrides,
})

const defaultAutoRefresh = {
  refresh: vi.fn(),
  selectedValue: '30',
  setInterval: vi.fn(),
  lastRefreshedLabel: '1 min ago',
  nextRefreshLabel: 'in 29 min',
}

describe('WeatherCard', () => {
  const mockRefresh = vi.fn()
  const mockUseMyLocation = vi.fn()
  const mockSetLocationBySearch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    weatherMocks.useWeather.mockReturnValue({
      data: makeWeatherData(),
      loading: false,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: 'Saved City',
    })
    weatherMocks.useAutoRefresh.mockReturnValue(defaultAutoRefresh)
    weatherMocks.useExpandCollapse.mockReturnValue({ expanded: true, toggle: vi.fn() })
  })

  it('renders weather card header with title "Weather"', () => {
    render(<WeatherCard />)
    expect(screen.getByText('Weather')).toBeInTheDocument()
    expect(screen.getByText('Local weather')).toBeInTheDocument()
  })

  it('shows collapsed summary when not expanded', () => {
    weatherMocks.useExpandCollapse.mockReturnValue({ expanded: false, toggle: vi.fn() })
    render(<WeatherCard />)
    expect(screen.getByText('72°F')).toBeInTheDocument()
    expect(screen.getByText('Clear sky')).toBeInTheDocument()
    expect(screen.getByText(/H: 78°/)).toBeInTheDocument()
    expect(screen.getByText(/L: 62°/)).toBeInTheDocument()
  })

  it('shows loading state when loading and no data', () => {
    weatherMocks.useWeather.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: 'Saved City',
    })
    render(<WeatherCard />)
    expect(screen.getByText('Fetching weather…')).toBeInTheDocument()
  })

  it('shows error message when error exists and no data', () => {
    weatherMocks.useWeather.mockReturnValue({
      data: null,
      loading: false,
      error: 'Location not found',
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: 'Saved City',
    })
    render(<WeatherCard />)
    expect(screen.getByText('Location not found')).toBeInTheDocument()
  })

  it('shows expanded weather data with current temp and stats', () => {
    render(<WeatherCard />)
    expect(screen.getByText('72°F')).toBeInTheDocument()
    expect(screen.getByText('Clear sky')).toBeInTheDocument()
    expect(screen.getByText('78° / 62°')).toBeInTheDocument()
    expect(screen.getByText('High / Low')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
    expect(screen.getByText('Humidity')).toBeInTheDocument()
    expect(screen.getByText('10 mph')).toBeInTheDocument()
    expect(screen.getByText('Wind')).toBeInTheDocument()
  })

  it('shows 3-day forecast when data has forecast array', () => {
    render(<WeatherCard />)
    expect(screen.getByText('3-Day Forecast')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
    expect(screen.getByText('Cloudy')).toBeInTheDocument()
    expect(screen.getByText('Rainy')).toBeInTheDocument()
  })

  it('searches location on Enter key press', () => {
    render(<WeatherCard />)
    const input = screen.getByLabelText('Search location')
    fireEvent.change(input, { target: { value: 'New York' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockSetLocationBySearch).toHaveBeenCalledWith('New York')
  })

  it('searches location on Go button click', () => {
    render(<WeatherCard />)
    const input = screen.getByLabelText('Search location')
    fireEvent.change(input, { target: { value: 'Chicago' } })
    fireEvent.click(screen.getByTitle('Search location'))
    expect(mockSetLocationBySearch).toHaveBeenCalledWith('Chicago')
  })

  it('disables Go button when loading or empty query', () => {
    render(<WeatherCard />)
    const goBtn = screen.getByTitle('Search location')
    expect(goBtn).toBeDisabled()
  })

  it('calls useMyLocation on "Use My Location" button click', () => {
    render(<WeatherCard />)
    fireEvent.click(screen.getByTitle('Use my current location'))
    expect(mockUseMyLocation).toHaveBeenCalledTimes(1)
  })

  it('shows savedLocation as caption when data is null', () => {
    weatherMocks.useWeather.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: 'Saved City',
    })
    render(<WeatherCard />)
    expect(screen.getByText('Saved City')).toBeInTheDocument()
  })

  it('shows data.locationName as caption when data exists', () => {
    render(<WeatherCard />)
    expect(screen.getByText('Raleigh, NC')).toBeInTheDocument()
  })
})
