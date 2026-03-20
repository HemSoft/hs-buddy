import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UsageHeader } from './UsageHeader'

const baseProps = {
  totalUsed: 1500,
  totalOverageCost: 25.5,
  projectedTotal: null,
  projectedOverageCost: null,
  anyLoading: false,
  onRefreshAll: vi.fn(),
}

describe('UsageHeader', () => {
  it('renders the heading and subtitle', () => {
    render(<UsageHeader {...baseProps} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Copilot Usage' })).toBeInTheDocument()
    expect(screen.getByText('Copilot premium request quota per account')).toBeInTheDocument()
  })

  it('renders summary values with formatting', () => {
    render(<UsageHeader {...baseProps} totalUsed={12345} totalOverageCost={99.99} />)

    expect(screen.getByText('12,345')).toBeInTheDocument()
    expect(screen.getByText('$99.99')).toBeInTheDocument()
    expect(screen.getByText('Total Used')).toBeInTheDocument()
    expect(screen.getByText('Total Overage')).toBeInTheDocument()
  })

  it('shows projected totals when provided', () => {
    const { container } = render(
      <UsageHeader {...baseProps} projectedTotal={5000} projectedOverageCost={42} />,
    )

    expect(screen.getByText('5,000')).toBeInTheDocument()
    expect(screen.getByText('Projected')).toBeInTheDocument()
    expect(screen.getByText('$42.00')).toBeInTheDocument()
    expect(screen.getByText('Est. Overage')).toBeInTheDocument()
    expect(container.querySelector('.usage-header-projected svg')).toBeInTheDocument()
  })

  it('hides projected sections when projected values are absent or zero', () => {
    render(<UsageHeader {...baseProps} projectedTotal={null} projectedOverageCost={0} />)

    expect(screen.queryByText('Projected')).not.toBeInTheDocument()
    expect(screen.queryByText('Est. Overage')).not.toBeInTheDocument()
  })

  it('calls onRefreshAll when the refresh button is clicked', () => {
    const onRefreshAll = vi.fn()

    render(<UsageHeader {...baseProps} onRefreshAll={onRefreshAll} />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefreshAll).toHaveBeenCalledOnce()
  })

  it('disables the refresh button and spins the icon while loading', () => {
    const { container } = render(<UsageHeader {...baseProps} anyLoading />)

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(container.querySelector('.spin')).toBeInTheDocument()
  })

  it('renders zero totals correctly', () => {
    render(<UsageHeader {...baseProps} totalUsed={0} totalOverageCost={0} />)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})
