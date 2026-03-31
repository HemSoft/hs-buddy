import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TempoWorklog } from '../../types/tempo'
import { TempoSummaryCards } from './TempoSummaryCards'

function createWorklog(issueKey: string, hours: number): TempoWorklog {
  return {
    id: hours,
    issueKey,
    issueSummary: `${issueKey} summary`,
    hours,
    date: '2026-03-20',
    startTime: '08:00',
    description: '',
    accountKey: 'DEV',
    accountName: 'Development',
  }
}

describe('TempoSummaryCards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders today, month, remaining, and capex cards for the current month', () => {
    render(
      <TempoSummaryCards
        todayHours={6}
        monthHours={16}
        monthTarget={32}
        isCurrentMonth
        viewMonth={new Date('2026-03-01T00:00:00Z')}
        worklogs={[createWorklog('PE-1', 4), createWorklog('PE-2', 12)]}
        capexMap={{ 'PE-1': true }}
      />
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Month (50%)')).toBeInTheDocument()
    expect(screen.getByText('16h')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText(/4/)).toBeInTheDocument()
    expect(screen.getByText(/12h non-capex/)).toBeInTheDocument()
  })

  it('shows a missing label for an incomplete past month', () => {
    render(
      <TempoSummaryCards
        todayHours={0}
        monthHours={6}
        monthTarget={12}
        isCurrentMonth={false}
        viewMonth={new Date('2026-02-01T00:00:00Z')}
        worklogs={[]}
        capexMap={{}}
      />
    )

    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.getByText('Month (50%)')).toBeInTheDocument()
    expect(screen.getByText('Missing')).toBeInTheDocument()
    expect(screen.getByText('6h')).toBeInTheDocument()
  })

  it('shows the completion state when the month target is met', () => {
    render(
      <TempoSummaryCards
        todayHours={8}
        monthHours={40}
        monthTarget={40}
        isCurrentMonth
        viewMonth={new Date('2026-03-01T00:00:00Z')}
        worklogs={[createWorklog('PE-9', 40)]}
        capexMap={{}}
      />
    )

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('All hours logged')).toBeInTheDocument()
    expect(screen.getByText('40h non-capex')).toBeInTheDocument()
  })
})
