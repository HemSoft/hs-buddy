import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FinanceCard } from './FinanceCard'

const financeMocks = vi.hoisted(() => ({
  useFinance: vi.fn(),
  useAutoRefresh: vi.fn(),
  useExpandCollapse: vi.fn(),
}))

vi.mock('../../hooks/useFinance', () => ({
  useFinance: financeMocks.useFinance,
}))

vi.mock('../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: financeMocks.useAutoRefresh,
}))

vi.mock('../../hooks/useExpandCollapse', () => ({
  useExpandCollapse: financeMocks.useExpandCollapse,
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
  Plus: () => <span data-testid="icon-plus" />,
  X: () => <span data-testid="icon-x" />,
  DollarSign: () => <span data-testid="icon-dollar" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
}))

const makeQuote = (overrides = {}) => ({
  symbol: 'AAPL',
  name: 'Apple Inc.',
  price: 195.5,
  change: 2.35,
  changePercent: 1.22,
  previousClose: 193.15,
  marketOpen: true,
  ...overrides,
})

const defaultAutoRefresh = {
  refresh: vi.fn(),
  selectedValue: '15',
  setInterval: vi.fn(),
  lastRefreshedLabel: '2 min ago',
  nextRefreshLabel: 'in 13 min',
}

describe('FinanceCard', () => {
  const mockRefresh = vi.fn()
  const mockAddSymbol = vi.fn()
  const mockRemoveSymbol = vi.fn()

  const defaultQuotes = [
    makeQuote(),
    makeQuote({
      symbol: 'GOOGL',
      name: 'Alphabet',
      price: 175.2,
      change: -1.5,
      changePercent: -0.85,
      marketOpen: false,
    }),
    makeQuote({
      symbol: 'MSFT',
      name: 'Microsoft',
      price: 420.0,
      change: 5.0,
      changePercent: 1.2,
      marketOpen: true,
    }),
    makeQuote({
      symbol: 'AMZN',
      name: 'Amazon',
      price: 185.0,
      change: 0.5,
      changePercent: 0.27,
      marketOpen: true,
    }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    financeMocks.useFinance.mockReturnValue({
      quotes: defaultQuotes,
      loading: false,
      error: null,
      watchlist: ['AAPL', 'GOOGL', 'MSFT', 'AMZN'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    })
    financeMocks.useAutoRefresh.mockReturnValue(defaultAutoRefresh)
    financeMocks.useExpandCollapse.mockReturnValue({ expanded: true, toggle: vi.fn() })
  })

  it('renders finance card header with title "Finance"', () => {
    render(<FinanceCard />)
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Markets')).toBeInTheDocument()
  })

  it('shows collapsed summary with top 3 quotes', () => {
    financeMocks.useExpandCollapse.mockReturnValue({ expanded: false, toggle: vi.fn() })
    render(<FinanceCard />)
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    expect(screen.getByText('Alphabet')).toBeInTheDocument()
    expect(screen.getByText('Microsoft')).toBeInTheDocument()
    expect(screen.queryByText('Amazon')).not.toBeInTheDocument()
  })

  it('shows up arrow for positive price changes', () => {
    render(<FinanceCard />)
    const appleRow = screen.getByText('Apple Inc.').closest('.finance-quote-row')!
    expect(appleRow.className).toContain('finance-quote-row--up')
  })

  it('shows down arrow for negative price changes', () => {
    render(<FinanceCard />)
    const googleRow = screen.getByText('Alphabet').closest('.finance-quote-row')!
    expect(googleRow.className).toContain('finance-quote-row--down')
  })

  it('shows market Open/Closed pill', () => {
    render(<FinanceCard />)
    const pills = screen.getAllByText('Open')
    expect(pills.length).toBeGreaterThan(0)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('shows loading state when loading and no quotes', () => {
    financeMocks.useFinance.mockReturnValue({
      quotes: [],
      loading: true,
      error: null,
      watchlist: ['AAPL'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: null,
    })
    render(<FinanceCard />)
    expect(screen.getByText('Fetching market data…')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    financeMocks.useFinance.mockReturnValue({
      quotes: [],
      loading: false,
      error: 'API rate limit exceeded',
      watchlist: ['AAPL'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: null,
    })
    render(<FinanceCard />)
    expect(screen.getByText('API rate limit exceeded')).toBeInTheDocument()
  })

  it('shows empty state when no quotes, no loading, no error', () => {
    financeMocks.useFinance.mockReturnValue({
      quotes: [],
      loading: false,
      error: null,
      watchlist: [],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: null,
    })
    render(<FinanceCard />)
    expect(screen.getByText('No market data available. Try refreshing.')).toBeInTheDocument()
  })

  it('adds symbol on Enter key press', () => {
    render(<FinanceCard />)
    const input = screen.getByLabelText('Add ticker symbol')
    fireEvent.change(input, { target: { value: 'TSLA' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockAddSymbol).toHaveBeenCalledWith('TSLA')
  })

  it('adds symbol on Add button click', () => {
    render(<FinanceCard />)
    const input = screen.getByLabelText('Add ticker symbol')
    fireEvent.change(input, { target: { value: 'NVDA' } })
    fireEvent.click(screen.getByTitle('Add symbol'))
    expect(mockAddSymbol).toHaveBeenCalledWith('NVDA')
  })

  it('disables Add button when input is empty', () => {
    render(<FinanceCard />)
    expect(screen.getByTitle('Add symbol')).toBeDisabled()
  })

  it('removes symbol when remove button clicked', () => {
    render(<FinanceCard />)
    fireEvent.click(screen.getByTitle('Remove AAPL'))
    expect(mockRemoveSymbol).toHaveBeenCalledWith('AAPL')
  })

  it('shows quote price and change values', () => {
    render(<FinanceCard />)
    expect(screen.getByText('+2.35 (+1.22%)')).toBeInTheDocument()
    expect(screen.getByText('-1.50 (-0.85%)')).toBeInTheDocument()
  })

  it('shows plural "symbols" for multiple tracked items', () => {
    render(<FinanceCard />)
    expect(screen.getByText('4 symbols tracked')).toBeInTheDocument()
  })
})
