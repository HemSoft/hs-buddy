import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommandCenterCard } from './CommandCenterCard'

vi.mock('lucide-react', () => ({
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Zap: () => <span data-testid="icon-zap" />,
  Activity: () => <span data-testid="icon-activity" />,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className} />
  ),
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
}))

vi.mock('../copilot-usage/quotaUtils', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
}))

const defaultProps = {
  accountCount: 3,
  hasCopilotAccounts: true,
  anyLoading: false,
  onRefresh: vi.fn(),
  onOpenUsage: vi.fn(),
  totalUsed: 1500,
  totalOverage: 45.99,
  projectedTotal: 2000,
  projectedOverageCost: 75.5,
}

describe('CommandCenterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders section heading', () => {
    render(<CommandCenterCard {...defaultProps} />)
    expect(screen.getByText('Command Center')).toBeInTheDocument()
    expect(screen.getByText('Copilot usage')).toBeInTheDocument()
  })

  it('shows plural account count when > 1', () => {
    render(<CommandCenterCard {...defaultProps} />)
    expect(screen.getByText('3 connected accounts')).toBeInTheDocument()
  })

  it('shows singular account count when exactly 1', () => {
    render(<CommandCenterCard {...defaultProps} accountCount={1} />)
    expect(screen.getByText('1 connected account')).toBeInTheDocument()
  })

  it('shows "No accounts configured" when hasCopilotAccounts is false', () => {
    render(<CommandCenterCard {...defaultProps} hasCopilotAccounts={false} />)
    expect(screen.getByText('No accounts configured')).toBeInTheDocument()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<CommandCenterCard {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Refresh Copilot usage data'))
    expect(defaultProps.onRefresh).toHaveBeenCalledOnce()
  })

  it('disables refresh button when loading', () => {
    render(<CommandCenterCard {...defaultProps} anyLoading={true} />)
    expect(screen.getByTitle('Refresh Copilot usage data')).toBeDisabled()
  })

  it('disables refresh button when no accounts configured', () => {
    render(<CommandCenterCard {...defaultProps} hasCopilotAccounts={false} />)
    expect(screen.getByTitle('Refresh Copilot usage data')).toBeDisabled()
  })

  it('adds spin class when loading', () => {
    render(<CommandCenterCard {...defaultProps} anyLoading={true} />)
    expect(screen.getByTestId('icon-refresh').className).toContain('spin')
  })

  it('calls onOpenUsage when Open Usage button is clicked', () => {
    render(<CommandCenterCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Open Usage'))
    expect(defaultProps.onOpenUsage).toHaveBeenCalledOnce()
  })

  it('shows "Configure Accounts" when no copilot accounts', () => {
    render(<CommandCenterCard {...defaultProps} hasCopilotAccounts={false} />)
    expect(screen.getByText('Configure Accounts')).toBeInTheDocument()
  })

  it('renders stat cards with formatted values', () => {
    render(<CommandCenterCard {...defaultProps} />)
    const statCards = screen.getAllByTestId('stat-card')
    expect(statCards).toHaveLength(4)
    expect(screen.getByText('1,500')).toBeInTheDocument()
    expect(screen.getByText('$45.99')).toBeInTheDocument()
    expect(screen.getByText('2,000')).toBeInTheDocument()
    expect(screen.getByText('$75.50')).toBeInTheDocument()
  })

  it('shows "..." when projectedTotal is null', () => {
    render(<CommandCenterCard {...defaultProps} projectedTotal={null} />)
    expect(screen.getByText('...')).toBeInTheDocument()
  })

  it('shows "$0.00" when projectedOverageCost is null', () => {
    render(<CommandCenterCard {...defaultProps} projectedOverageCost={null} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('shows "$0.00" when projectedOverageCost is 0', () => {
    render(<CommandCenterCard {...defaultProps} projectedOverageCost={0} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('has correct aria-label on section', () => {
    render(<CommandCenterCard {...defaultProps} />)
    expect(screen.getByLabelText('Copilot usage overview')).toBeInTheDocument()
  })
})
