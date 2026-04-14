import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  formatStatNumber,
  SectionHeading,
  StatCard,
  CardHeader,
  CardActionBar,
} from './DashboardPrimitives'

vi.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className} />
  ),
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
}))

vi.mock('../../hooks/useAutoRefresh', () => ({
  INTERVAL_OPTIONS: [
    { value: 0, label: 'Off' },
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
  ],
}))

describe('formatStatNumber', () => {
  it('formats small numbers as-is', () => {
    expect(formatStatNumber(42)).toBe('42')
  })

  it('formats large numbers with locale separators', () => {
    const result = formatStatNumber(1234567)
    expect(result).toContain('1')
    expect(result).toContain('234')
    expect(result).toContain('567')
  })

  it('formats zero', () => {
    expect(formatStatNumber(0)).toBe('0')
  })
})

describe('SectionHeading', () => {
  it('renders kicker, title, and caption', () => {
    render(<SectionHeading kicker="Test Kicker" title="Test Title" caption="Test Caption" />)
    expect(screen.getByText('Test Kicker')).toBeInTheDocument()
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Caption')).toBeInTheDocument()
  })
})

describe('StatCard', () => {
  it('renders icon, value, and label', () => {
    render(<StatCard icon={<span data-testid="test-icon" />} value="42" label="Total" />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<StatCard icon={<span />} value="10" label="Items" subtitle="5 active" />)
    expect(screen.getByText('5 active')).toBeInTheDocument()
  })

  it('omits subtitle when not provided', () => {
    render(<StatCard icon={<span />} value="10" label="Items" />)
    expect(screen.queryByText('welcome-stat-subtitle')).not.toBeInTheDocument()
  })

  it('applies custom cardClassName', () => {
    const { container } = render(
      <StatCard icon={<span />} value="1" label="L" cardClassName="custom-card" />
    )
    const card = container.querySelector('.welcome-stat-card.custom-card')
    expect(card).toBeTruthy()
  })

  it('applies custom iconClassName', () => {
    const { container } = render(
      <StatCard icon={<span />} value="1" label="L" iconClassName="custom-icon" />
    )
    const iconDiv = container.querySelector('.welcome-stat-icon.custom-icon')
    expect(iconDiv).toBeTruthy()
  })
})

describe('CardHeader', () => {
  let onToggle: () => void

  beforeEach(() => {
    onToggle = vi.fn<() => void>()
  })

  it('renders children', () => {
    render(
      <CardHeader expanded={true} onToggle={onToggle}>
        <span>Header Content</span>
      </CardHeader>
    )
    expect(screen.getByText('Header Content')).toBeInTheDocument()
  })

  it('shows collapse button when expanded', () => {
    render(
      <CardHeader expanded={true} onToggle={onToggle}>
        <span>Title</span>
      </CardHeader>
    )
    const button = screen.getByRole('button', { name: 'Collapse section' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('title', 'Collapse')
    expect(screen.getByTestId('icon-chevron-up')).toBeInTheDocument()
  })

  it('shows expand button when collapsed', () => {
    render(
      <CardHeader expanded={false} onToggle={onToggle}>
        <span>Title</span>
      </CardHeader>
    )
    const button = screen.getByRole('button', { name: 'Expand section' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('title', 'Expand')
    expect(screen.getByTestId('icon-chevron-down')).toBeInTheDocument()
  })

  it('calls onToggle when button is clicked', () => {
    render(
      <CardHeader expanded={true} onToggle={onToggle}>
        <span>Title</span>
      </CardHeader>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})

describe('CardActionBar', () => {
  const defaultProps = {
    onRefresh: vi.fn(),
    loading: false,
    selectedInterval: 5,
    onIntervalChange: vi.fn(),
    lastRefreshedLabel: null as string | null,
    nextRefreshLabel: null as string | null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders refresh button and interval select', () => {
    render(<CardActionBar {...defaultProps} />)
    expect(screen.getByTitle('Refresh')).toBeInTheDocument()
    expect(screen.getByLabelText('Auto-refresh interval')).toBeInTheDocument()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<CardActionBar {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalledOnce()
  })

  it('disables refresh button when loading', () => {
    render(<CardActionBar {...defaultProps} loading={true} />)
    expect(screen.getByTitle('Refresh')).toBeDisabled()
  })

  it('adds spin class to icon when loading', () => {
    render(<CardActionBar {...defaultProps} loading={true} />)
    expect(screen.getByTestId('icon-refresh').className).toContain('spin')
  })

  it('does not add spin class when not loading', () => {
    render(<CardActionBar {...defaultProps} loading={false} />)
    expect(screen.getByTestId('icon-refresh').className).not.toContain('spin')
  })

  it('uses custom refreshTitle', () => {
    render(<CardActionBar {...defaultProps} refreshTitle="Reload Data" />)
    expect(screen.getByTitle('Reload Data')).toBeInTheDocument()
  })

  it('renders interval options from INTERVAL_OPTIONS', () => {
    render(<CardActionBar {...defaultProps} />)
    const select = screen.getByLabelText('Auto-refresh interval') as HTMLSelectElement
    const options = Array.from(select.options)
    expect(options).toHaveLength(3)
    expect(options[0].textContent).toBe('Off')
    expect(options[1].textContent).toBe('5 min')
    expect(options[2].textContent).toBe('15 min')
  })

  it('calls onIntervalChange when interval is changed', () => {
    render(<CardActionBar {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Auto-refresh interval'), {
      target: { value: '15' },
    })
    expect(defaultProps.onIntervalChange).toHaveBeenCalledWith(15)
  })

  it('renders children in the actions bar', () => {
    render(
      <CardActionBar {...defaultProps}>
        <button>Extra Action</button>
      </CardActionBar>
    )
    expect(screen.getByText('Extra Action')).toBeInTheDocument()
  })

  it('shows last refreshed label when provided', () => {
    render(<CardActionBar {...defaultProps} lastRefreshedLabel="2 minutes ago" />)
    expect(screen.getByText('Updated 2 minutes ago')).toBeInTheDocument()
  })

  it('hides refresh status when lastRefreshedLabel is null', () => {
    render(<CardActionBar {...defaultProps} lastRefreshedLabel={null} />)
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  it('shows next refresh label when both labels are provided', () => {
    render(
      <CardActionBar
        {...defaultProps}
        lastRefreshedLabel="2 minutes ago"
        nextRefreshLabel="3 min"
      />
    )
    expect(screen.getByText(/Next in 3 min/)).toBeInTheDocument()
  })

  it('hides next refresh label when only lastRefreshedLabel is set', () => {
    render(
      <CardActionBar {...defaultProps} lastRefreshedLabel="just now" nextRefreshLabel={null} />
    )
    expect(screen.queryByText(/Next in/)).not.toBeInTheDocument()
  })
})
