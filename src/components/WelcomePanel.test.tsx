import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomePanel } from './WelcomePanel'

vi.mock('../hooks/useConvex', () => ({
  useBuddyStats: () => ({
    prsViewed: 10,
    prsReviewed: 5,
    prsMergedWatched: 2,
    reposBrowsed: 8,
    runsTriggered: 15,
    runsCompleted: 12,
    runsFailed: 3,
    firstLaunchDate: Date.now() - 86400000 * 30,
    appLaunches: 42,
    totalUptimeMs: 3600000,
    lastSessionStart: Date.now() - 60000,
  }),
  useRepoBookmarks: () => [
    { _id: 'bm1', org: 'acme', repo: 'web' },
    { _id: 'bm2', org: 'acme', repo: 'api' },
  ],
}))

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    accounts: [{ username: 'testuser', org: 'testorg' }],
    quotas: {},
    orgBudgets: {},
    uniqueOrgs: ['testorg'],
    refreshAll: vi.fn(),
    anyLoading: false,
    aggregateTotals: { totalUsed: 250, totalOverageCost: 5.0 },
    aggregateProjections: { projectedTotal: 500, projectedOverageCost: 10.0 },
    orgOverageFromQuotas: {},
  }),
}))

vi.mock('../hooks/useWeather', () => ({
  useWeather: () => ({
    data: {
      temperature: 72,
      temperatureUnit: '°F',
      weatherCode: 1,
      description: 'Mainly clear',
      humidity: 45,
      windSpeed: 8,
      high: 78,
      low: 62,
      locationName: 'Morrisville, NC',
      forecast: [
        {
          date: '2026-04-13',
          dayName: 'Today',
          weatherCode: 1,
          description: 'Mainly clear',
          high: 78,
          low: 62,
        },
        {
          date: '2026-04-14',
          dayName: 'Tue',
          weatherCode: 3,
          description: 'Overcast',
          high: 74,
          low: 58,
        },
        {
          date: '2026-04-15',
          dayName: 'Wed',
          weatherCode: 61,
          description: 'Slight rain',
          high: 68,
          low: 55,
        },
      ],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
    useMyLocation: vi.fn(),
    setLocationBySearch: vi.fn(),
    savedLocation: 'Morrisville, NC',
  }),
}))

vi.mock('../hooks/useFinance', () => ({
  useFinance: () => ({
    quotes: [
      {
        symbol: '^GSPC',
        name: 'S&P 500',
        price: 5200.5,
        change: 25.3,
        changePercent: 0.49,
        previousClose: 5175.2,
      },
      {
        symbol: '^IXIC',
        name: 'NASDAQ',
        price: 16300.0,
        change: -45.2,
        changePercent: -0.28,
        previousClose: 16345.2,
      },
      {
        symbol: '^DJI',
        name: 'DOW',
        price: 39800.0,
        change: 120.5,
        changePercent: 0.3,
        previousClose: 39679.5,
      },
      {
        symbol: 'BTC-USD',
        name: 'Bitcoin',
        price: 63500.0,
        change: 1200.0,
        changePercent: 1.93,
        previousClose: 62300.0,
      },
    ],
    loading: false,
    error: null,
    watchlist: ['^GSPC', '^IXIC', '^DJI', 'BTC-USD'],
    refresh: vi.fn(),
    addSymbol: vi.fn(),
    removeSymbol: vi.fn(),
  }),
}))

describe('WelcomePanel', () => {
  const onNavigate = vi.fn()
  const onSectionChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: vi.fn().mockResolvedValue({}) },
    })
  })

  it('renders app name', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Buddy')).toBeTruthy()
  })

  it('renders tagline', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Your Universal Productivity Companion')).toBeTruthy()
  })

  it('renders copilot usage section', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Command Center')).toBeTruthy()
  })

  it('renders activity overview section', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Workspace Pulse')).toBeTruthy()
  })

  it('renders weather card with forecast', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Weather')).toBeTruthy()
    expect(screen.getByText('Morrisville, NC')).toBeTruthy()
    expect(screen.getByText('3-Day Forecast')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Tue')).toBeTruthy()
    expect(screen.getByText('Wed')).toBeTruthy()
  })

  it('collapses weather card and shows summary', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)

    // Find collapse button within the weather card section
    const weatherSection = screen.getByLabelText('Weather overview')
    const collapseBtn = weatherSection.querySelector('[title="Collapse"]') as HTMLElement
    fireEvent.click(collapseBtn)

    // Forecast should be hidden, summary visible
    expect(screen.queryByText('3-Day Forecast')).toBeNull()
    // Collapsed summary shows temp
    expect(screen.getByText('72°F')).toBeTruthy()
  })

  it('renders customize button for dashboard config', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Customize')).toBeTruthy()
  })

  it('renders quick action buttons', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('My PRs')).toBeTruthy()
    expect(screen.getByText('Organizations')).toBeTruthy()
    expect(screen.getByText('Jobs')).toBeTruthy()
  })

  it('navigates to My PRs on click', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('My PRs'))
    expect(onSectionChange).toHaveBeenCalledWith('github')
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
  })

  it('navigates to Settings on click', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Settings'))
    expect(onSectionChange).toHaveBeenCalledWith('settings')
    expect(onNavigate).toHaveBeenCalledWith('settings-accounts')
  })

  it('renders footer', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('by HemSoft Developments')).toBeTruthy()
  })

  it('shows stat cards with computed values', () => {
    render(
      <WelcomePanel
        prCounts={{ open: 5, review: 3 }}
        onNavigate={onNavigate}
        onSectionChange={onSectionChange}
      />
    )
    expect(screen.getByText('17')).toBeTruthy() // PRs Viewed: 10+5+2
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1) // Active PRs: 5+3
  })

  it('shows bookmarks count', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('2')).toBeTruthy() // 2 bookmarks
  })

  it('renders copilot usage stats', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('250')).toBeTruthy() // Total Used
    expect(screen.getByText('$5.00')).toBeTruthy() // Total Overage
  })

  it('navigates to copilot usage when Open Usage clicked', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Open Usage'))
    expect(onSectionChange).toHaveBeenCalledWith('copilot')
    expect(onNavigate).toHaveBeenCalledWith('copilot-usage')
  })

  it('toggles card visibility via dashboard config', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)

    // Open the config dropdown
    fireEvent.click(screen.getByText('Customize'))

    // Weather should be visible, toggle it off
    const weatherToggle = screen.getByRole('menuitemcheckbox', { name: 'Weather' })
    expect(weatherToggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(weatherToggle)

    // Weather card should now be hidden
    expect(screen.queryByText('Morrisville, NC')).toBeNull()
  })

  it('renders finance card with market data', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Finance')).toBeTruthy()
    expect(screen.getByText('S&P 500')).toBeTruthy()
    expect(screen.getByText('NASDAQ')).toBeTruthy()
    expect(screen.getByText('DOW')).toBeTruthy()
    expect(screen.getByText('Bitcoin')).toBeTruthy()
  })
})
