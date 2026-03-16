import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RunFilterBar, type StatusFilter } from './RunFilterBar'

const defaultStatusCounts: Record<string, number> = {
  pending: 2,
  running: 1,
  completed: 5,
  failed: 1,
  cancelled: 0,
}

function renderFilterBar(
  overrides: Partial<{
    statusFilter: StatusFilter
    totalCount: number
    statusCounts: Record<string, number>
    onFilterChange: (filter: StatusFilter) => void
  }> = {}
) {
  const onFilterChange = overrides.onFilterChange ?? vi.fn()

  const result = render(
    <RunFilterBar
      statusFilter={overrides.statusFilter ?? 'all'}
      totalCount={overrides.totalCount ?? 9}
      statusCounts={overrides.statusCounts ?? defaultStatusCounts}
      onFilterChange={onFilterChange}
    />
  )

  return { ...result, onFilterChange }
}

function getFilterButton(label: string) {
  const button = screen.getByText(label).closest('button')

  if (!button) {
    throw new Error(`Missing filter button for ${label}`)
  }

  return button
}

describe('RunFilterBar', () => {
  it('renders the filter icon and all filter buttons', () => {
    const { container } = renderFilterBar()

    expect(container.querySelector('.filter-icon')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('shows total and per-status count badges when counts are greater than zero', () => {
    renderFilterBar({ totalCount: 15 })

    expect(getFilterButton('All').querySelector('.filter-count')).toHaveTextContent('15')
    expect(getFilterButton('Pending').querySelector('.filter-count')).toHaveTextContent('2')
    expect(getFilterButton('Completed').querySelector('.filter-count')).toHaveTextContent('5')
  })

  it('hides badges when counts are zero or missing', () => {
    renderFilterBar({
      totalCount: 0,
      statusCounts: {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
    })

    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelector('.filter-count')).toBeNull()
    }
  })

  it('handles an empty statusCounts object without showing status badges', () => {
    renderFilterBar({
      totalCount: 3,
      statusCounts: {},
    })

    expect(getFilterButton('All').querySelector('.filter-count')).toHaveTextContent('3')
    expect(getFilterButton('Pending').querySelector('.filter-count')).toBeNull()
    expect(getFilterButton('Cancelled').querySelector('.filter-count')).toBeNull()
  })

  it('marks only the selected filter button as active', () => {
    renderFilterBar({ statusFilter: 'failed' })

    expect(getFilterButton('Failed')).toHaveClass('active')
    expect(getFilterButton('All')).not.toHaveClass('active')
    expect(getFilterButton('Pending')).not.toHaveClass('active')
  })

  it('marks the all button as active when all is selected', () => {
    renderFilterBar({ statusFilter: 'all' })

    expect(getFilterButton('All')).toHaveClass('active')
    expect(getFilterButton('Completed')).not.toHaveClass('active')
  })

  it('applies status-specific classes only to non-all buttons', () => {
    renderFilterBar()

    expect(getFilterButton('Pending')).toHaveClass('filter-pending')
    expect(getFilterButton('Failed')).toHaveClass('filter-failed')
    expect(getFilterButton('All').className).not.toContain('filter-all')
  })

  it('calls onFilterChange with the clicked status filter', async () => {
    const user = userEvent.setup()
    const { onFilterChange } = renderFilterBar()

    await user.click(getFilterButton('Failed'))

    expect(onFilterChange).toHaveBeenCalledWith('failed')
    expect(onFilterChange).toHaveBeenCalledTimes(1)
  })

  it('calls onFilterChange with all when the all filter is clicked', async () => {
    const user = userEvent.setup()
    const { onFilterChange } = renderFilterBar({ statusFilter: 'pending' })

    await user.click(getFilterButton('All'))

    expect(onFilterChange).toHaveBeenCalledWith('all')
    expect(onFilterChange).toHaveBeenCalledTimes(1)
  })
})
