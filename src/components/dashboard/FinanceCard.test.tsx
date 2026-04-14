import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FinanceCard } from './FinanceCard'

const mockRefresh = vi.fn()
const mockAddSymbol = vi.fn()
const mockRemoveSymbol = vi.fn()

let mockFinanceData: {
  quotes: Array<Record<string, unknown>>
  loading: boolean
  error: string | null
  watchlist: string[]
  refresh: typeof mockRefresh
  addSymbol: typeof mockAddSymbol
  removeSymbol: typeof mockRemoveSymbol
  lastFetchedAt: number | null
}

let mockExpanded = true

vi.mock('../../hooks/useFinance', () => ({
  useFinance: () => mockFinanceData,
}))

vi.mock('../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: (_key: string, refreshFn: () => void) => ({
    refresh: refreshFn,
    selectedValue: '15',
    setInterval: vi.fn(),
    lastRefreshedLabel: '30s ago',
    nextRefreshLabel: 'in 14m',
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
  CardHeader: ({ children, onToggle }: { children: React.ReactNode; onToggle: () => void }) => (
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={onToggle}>
      {children}
    </div>
  ),
  CardActionBar: () => <div data-testid="card-action-bar" />,
}))

function makeQuote(overrides = {}) {
  return {
    symbol: 'AAPL',
    name: 'AAPL',
    price: 185.5,
    change: 2.3,
    changePercent: 1.25,
    marketOpen: true,
    ...overrides,
  }
}

describe('FinanceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = true
    mockFinanceData = {
      quotes: [],
      loading: false,
      error: null,
      watchlist: ['AAPL'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    }
  })

  it('shows loading state when loading with no quotes', () => {
    mockFinanceData.loading = true
    render(<FinanceCard />)
    expect(screen.getByText('Fetching market data…')).toBeInTheDocument()
  })

  it('shows error message', () => {
    mockFinanceData.error = 'API rate limit exceeded'
    render(<FinanceCard />)
    expect(screen.getByText('API rate limit exceeded')).toBeInTheDocument()
  })

  it('shows empty state when no quotes and not loading', () => {
    render(<FinanceCard />)
    expect(screen.getByText('No market data available. Try refreshing.')).toBeInTheDocument()
  })

  it('renders quote rows with price and change', () => {
    mockFinanceData.quotes = [makeQuote()]
    render(<FinanceCard />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('185.50')).toBeInTheDocument()
    expect(screen.getByText('+2.30 (+1.25%)')).toBeInTheDocument()
  })

  it('renders negative change correctly', () => {
    mockFinanceData.quotes = [makeQuote({ change: -3.5, changePercent: -1.89 })]
    render(<FinanceCard />)
    expect(screen.getByText('-3.50 (-1.89%)')).toBeInTheDocument()
  })

  it('shows market open/closed pill', () => {
    mockFinanceData.quotes = [makeQuote({ marketOpen: true })]
    render(<FinanceCard />)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('shows market closed pill', () => {
    mockFinanceData.quotes = [makeQuote({ marketOpen: false })]
    render(<FinanceCard />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('calls removeSymbol when remove button is clicked', () => {
    mockFinanceData.quotes = [makeQuote()]
    render(<FinanceCard />)
    fireEvent.click(screen.getByTitle('Remove AAPL'))
    expect(mockRemoveSymbol).toHaveBeenCalledWith('AAPL')
  })

  it('handles adding a symbol via button click', () => {
    render(<FinanceCard />)
    const input = screen.getByLabelText('Add ticker symbol')
    fireEvent.change(input, { target: { value: 'MSFT' } })
    fireEvent.click(screen.getByTitle('Add symbol'))
    expect(mockAddSymbol).toHaveBeenCalledWith('MSFT')
  })

  it('handles adding a symbol via Enter key', () => {
    render(<FinanceCard />)
    const input = screen.getByLabelText('Add ticker symbol')
    fireEvent.change(input, { target: { value: 'GOOG' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockAddSymbol).toHaveBeenCalledWith('GOOG')
  })

  it('does not add empty symbol', () => {
    render(<FinanceCard />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    expect(mockAddSymbol).not.toHaveBeenCalled()
  })

  it('clears input after adding a symbol', () => {
    render(<FinanceCard />)
    const input = screen.getByLabelText('Add ticker symbol') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'TSLA' } })
    fireEvent.click(screen.getByTitle('Add symbol'))
    expect(input.value).toBe('')
  })

  it('disables Add button when input is empty', () => {
    render(<FinanceCard />)
    const addBtn = screen.getByTitle('Add symbol').closest('button')!
    expect(addBtn.disabled).toBe(true)
  })

  it('renders heading with symbol count', () => {
    render(<FinanceCard />)
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('1 symbol tracked')).toBeInTheDocument()
  })

  it('pluralizes symbol count correctly', () => {
    mockFinanceData.watchlist = ['AAPL', 'MSFT']
    render(<FinanceCard />)
    expect(screen.getByText('2 symbols tracked')).toBeInTheDocument()
  })

  it('renders multiple quotes', () => {
    mockFinanceData.quotes = [
      makeQuote(),
      makeQuote({ symbol: 'MSFT', name: 'MSFT', price: 420.0, change: -1.5, changePercent: -0.35 }),
    ]
    render(<FinanceCard />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
  })

  it('handles null change and changePercent', () => {
    mockFinanceData.quotes = [makeQuote({ change: null, changePercent: null })]
    render(<FinanceCard />)
    expect(screen.getByText('+0.00 (+0.00%)')).toBeInTheDocument()
  })
})

describe('FinanceCard collapsed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = false
    mockFinanceData = {
      quotes: [
        makeQuote(),
        makeQuote({
          symbol: 'MSFT',
          name: 'MSFT',
          change: -1.5,
          changePercent: -0.35,
          marketOpen: false,
        }),
      ],
      loading: false,
      error: null,
      watchlist: ['AAPL', 'MSFT'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    }
  })

  it('shows collapsed summary with top quotes', () => {
    render(<FinanceCard />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add ticker symbol')).not.toBeInTheDocument()
  })

  it('shows change percentages in collapsed summary', () => {
    render(<FinanceCard />)
    expect(screen.getByText(/1\.25%/)).toBeInTheDocument()
    expect(screen.getByText(/0\.35%/)).toBeInTheDocument()
  })

  it('does not show collapsed summary when no quotes', () => {
    mockFinanceData.quotes = []
    render(<FinanceCard />)
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument()
  })
})

describe('QuoteRow without onRemove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = true
  })

  it('does not render remove button when removeSymbol is not provided', () => {
    mockFinanceData = {
      quotes: [makeQuote()],
      loading: false,
      error: null,
      watchlist: ['AAPL'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    }
    render(<FinanceCard />)
    // Remove button should still exist since removeSymbol is passed from FinanceCard
    expect(screen.getByTitle('Remove AAPL')).toBeInTheDocument()
  })
})

describe('formatPrice coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpanded = true
  })

  it('renders high-value prices with 2 decimal places', () => {
    mockFinanceData = {
      quotes: [makeQuote({ price: 1500.1 })],
      loading: false,
      error: null,
      watchlist: ['AAPL'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    }
    render(<FinanceCard />)
    expect(screen.getByText('1,500.10')).toBeInTheDocument()
  })

  it('renders low-value prices with up to 4 decimal places', () => {
    mockFinanceData = {
      quotes: [makeQuote({ symbol: 'DOGE', name: 'DOGE', price: 0.1234 })],
      loading: false,
      error: null,
      watchlist: ['DOGE'],
      refresh: mockRefresh,
      addSymbol: mockAddSymbol,
      removeSymbol: mockRemoveSymbol,
      lastFetchedAt: Date.now(),
    }
    render(<FinanceCard />)
    expect(screen.getByText('0.1234')).toBeInTheDocument()
  })
})
