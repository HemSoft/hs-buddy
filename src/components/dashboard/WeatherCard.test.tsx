import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'

const mockRefresh = vi.fn()
const mockUseMyLocation = vi.fn()
const mockSetLocationBySearch = vi.fn()

let mockWeatherData: {
  data: Record<string, unknown> | null
  loading: boolean
  error: string | null
  refresh: typeof mockRefresh
  useMyLocation: typeof mockUseMyLocation
  setLocationBySearch: typeof mockSetLocationBySearch
  savedLocation: string | null
}

let mockExpanded = true

vi.mock('../../hooks/useWeather', () => ({
  useWeather: () => mockWeatherData,
}))

vi.mock('../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: (_key: string, refreshFn: () => void) => ({
    refresh: refreshFn,
    selectedValue: '30',
    setInterval: vi.fn(),
    lastRefreshedLabel: '1m ago',
    nextRefreshLabel: 'in 29m',
  }),
}))

vi.mock('../../hooks/useExpandCollapse', () => ({
  useExpandCollapse: () => ({
    expanded: mockExpanded,
    toggle: vi.fn(),
  }),
}))

vi.mock('./DashboardPrimitives', () => ({
  SectionHeading: ({ title, caption }: { title: string; caption?: string }) => (
    <div>
      <span>{title}</span>
      {caption && <span>{caption}</span>}
    </div>
  ),
  StatCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  CardHeader: ({ children, onToggle }: { children: React.ReactNode; onToggle: () => void }) => (
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={onToggle}>
      {children}
    </div>
  ),
  CardActionBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

const makeWeatherData = (overrides = {}) => ({
  temperature: 72,
  temperatureUnit: '°F',
  description: 'Clear sky',
  weatherCode: 0,
  high: 78,
  low: 62,
  humidity: 45,
  windSpeed: 8,
  locationName: 'Raleigh, NC',
  forecast: [
    { date: '2026-04-15', dayName: 'Wed', weatherCode: 0, description: 'Sunny', high: 80, low: 60 },
    {
      date: '2026-04-16',
      dayName: 'Thu',
      weatherCode: 61,
      description: 'Light rain',
      high: 70,
      low: 55,
    },
    {
      date: '2026-04-17',
      dayName: 'Fri',
      weatherCode: 3,
      description: 'Overcast',
      high: 68,
      low: 54,
    },
  ],
  ...overrides,
})

describe('WeatherCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = true
    mockWeatherData = {
      data: null,
      loading: false,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: 'Raleigh, NC',
    }
  })

  it('shows loading state when loading with no data', () => {
    mockWeatherData.loading = true
    render(<WeatherCard />)
    expect(screen.getByText('Fetching weather…')).toBeInTheDocument()
  })

  it('shows error state when error with no data', () => {
    mockWeatherData.error = 'Location not found'
    render(<WeatherCard />)
    expect(screen.getByText('Location not found')).toBeInTheDocument()
  })

  it('renders current weather data', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    expect(screen.getByText('72°F')).toBeInTheDocument()
    expect(screen.getByText('Clear sky')).toBeInTheDocument()
  })

  it('renders stat cards with high/low, humidity, wind', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    expect(screen.getByText('78° / 62°')).toBeInTheDocument()
    expect(screen.getByText('45%')).toBeInTheDocument()
    expect(screen.getByText('8 mph')).toBeInTheDocument()
  })

  it('renders 3-day forecast', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    expect(screen.getByText('3-Day Forecast')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()
    expect(screen.getByText('Light rain')).toBeInTheDocument()
  })

  it('does not render forecast section when forecast is empty', () => {
    mockWeatherData.data = makeWeatherData({ forecast: [] })
    render(<WeatherCard />)
    expect(screen.queryByText('3-Day Forecast')).not.toBeInTheDocument()
  })

  it('handles location search on button click', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    const input = screen.getByLabelText('Search location')
    fireEvent.change(input, { target: { value: 'Atlanta' } })
    fireEvent.click(screen.getByText('Go'))
    expect(mockSetLocationBySearch).toHaveBeenCalledWith('Atlanta')
  })

  it('handles location search on Enter key', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    const input = screen.getByLabelText('Search location')
    fireEvent.change(input, { target: { value: 'NYC' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockSetLocationBySearch).toHaveBeenCalledWith('NYC')
  })

  it('does not search when query is empty', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    fireEvent.click(screen.getByText('Go'))
    expect(mockSetLocationBySearch).not.toHaveBeenCalled()
  })

  it('clears search input after searching', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    const input = screen.getByLabelText('Search location') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Denver' } })
    fireEvent.click(screen.getByText('Go'))
    expect(input.value).toBe('')
  })

  it('renders Use My Location button', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    const btn = screen.getByText('Use My Location')
    fireEvent.click(btn)
    expect(mockUseMyLocation).toHaveBeenCalledOnce()
  })

  it('renders Weather heading with location caption', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    expect(screen.getByText('Weather')).toBeInTheDocument()
    expect(screen.getByText('Raleigh, NC')).toBeInTheDocument()
  })

  it('uses savedLocation as caption when no data', () => {
    render(<WeatherCard />)
    expect(screen.getByText('Raleigh, NC')).toBeInTheDocument()
  })

  it('disables Go button when search is empty or whitespace-only', () => {
    mockWeatherData.data = makeWeatherData()
    render(<WeatherCard />)
    const goBtn = screen.getByText('Go').closest('button')!
    expect(goBtn.disabled).toBe(true)
  })
})

describe('WeatherCard collapsed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = false
    mockWeatherData = {
      data: makeWeatherData(),
      loading: false,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: null,
    }
  })

  it('shows collapsed summary when not expanded', () => {
    render(<WeatherCard />)
    expect(screen.getByText('72°F')).toBeInTheDocument()
    expect(screen.getByText('Clear sky')).toBeInTheDocument()
    expect(screen.queryByText('3-Day Forecast')).not.toBeInTheDocument()
  })

  it('does not show search, stats, or forecast in collapsed mode', () => {
    render(<WeatherCard />)
    expect(screen.queryByLabelText('Search location')).not.toBeInTheDocument()
    expect(screen.queryByText('Humidity')).not.toBeInTheDocument()
    expect(screen.queryByText('Use My Location')).not.toBeInTheDocument()
  })

  it('shows high/low in collapsed summary', () => {
    render(<WeatherCard />)
    expect(screen.getByText(/H: 78°/)).toBeInTheDocument()
    expect(screen.getByText(/L: 62°/)).toBeInTheDocument()
  })
})

describe('weatherIcon coverage via forecast codes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = true
    mockWeatherData = {
      data: makeWeatherData({
        weatherCode: 95,
        forecast: [
          {
            date: '2026-04-15',
            dayName: 'Wed',
            weatherCode: 0,
            description: 'Clear',
            high: 80,
            low: 60,
          },
          {
            date: '2026-04-16',
            dayName: 'Thu',
            weatherCode: 3,
            description: 'Overcast',
            high: 75,
            low: 55,
          },
          {
            date: '2026-04-17',
            dayName: 'Fri',
            weatherCode: 48,
            description: 'Fog',
            high: 65,
            low: 50,
          },
        ],
      }),
      loading: false,
      error: null,
      refresh: mockRefresh,
      useMyLocation: mockUseMyLocation,
      setLocationBySearch: mockSetLocationBySearch,
      savedLocation: null,
    }
  })

  it('renders all weather code branches via forecast rows', () => {
    render(<WeatherCard />)
    expect(screen.getByText('Clear')).toBeInTheDocument()
    expect(screen.getByText('Overcast')).toBeInTheDocument()
    expect(screen.getByText('Fog')).toBeInTheDocument()
  })

  it('renders rain and snow forecast codes', () => {
    mockWeatherData.data = makeWeatherData({
      forecast: [
        {
          date: '2026-04-15',
          dayName: 'Wed',
          weatherCode: 61,
          description: 'Light rain',
          high: 70,
          low: 55,
        },
        {
          date: '2026-04-16',
          dayName: 'Thu',
          weatherCode: 71,
          description: 'Snow',
          high: 30,
          low: 20,
        },
        {
          date: '2026-04-17',
          dayName: 'Fri',
          weatherCode: 82,
          description: 'Heavy rain',
          high: 60,
          low: 50,
        },
      ],
    })
    render(<WeatherCard />)
    expect(screen.getByText('Light rain')).toBeInTheDocument()
    expect(screen.getByText('Snow')).toBeInTheDocument()
    expect(screen.getByText('Heavy rain')).toBeInTheDocument()
  })

  it('renders heavy snow and thunderstorm codes', () => {
    mockWeatherData.data = makeWeatherData({
      forecast: [
        {
          date: '2026-04-15',
          dayName: 'Wed',
          weatherCode: 86,
          description: 'Heavy snow',
          high: 25,
          low: 15,
        },
        {
          date: '2026-04-16',
          dayName: 'Thu',
          weatherCode: 95,
          description: 'Thunderstorm',
          high: 78,
          low: 65,
        },
      ],
    })
    render(<WeatherCard />)
    expect(screen.getByText('Heavy snow')).toBeInTheDocument()
    expect(screen.getByText('Thunderstorm')).toBeInTheDocument()
  })
})
