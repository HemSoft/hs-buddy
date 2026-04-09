import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { TempoTimesheetGrid } from './TempoTimesheetGrid'

const worklog: TempoWorklog = {
  id: 1,
  issueKey: 'PE-101',
  issueSummary: 'Tempo grid test',
  hours: 2,
  date: '2026-03-05',
  startTime: '08:00',
  description: 'Build tests',
  accountKey: 'DEV',
  accountName: 'Development',
}

const issueSummaries: TempoIssueSummary[] = [
  {
    issueKey: 'PE-101',
    issueSummary: 'Tempo grid test',
    totalHours: 2,
    hoursByDate: {
      '2026-03-05': 2,
    },
  },
]

describe('TempoTimesheetGrid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a loading skeleton while the first month load is in progress', () => {
    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={[]}
        worklogs={[]}
        totalHours={0}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={vi.fn()}
      />
    )

    expect(container.querySelectorAll('.tempo-grid-skeleton')).toHaveLength(3)
  })

  it('renders the empty state when there are no issue summaries', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={[]}
        worklogs={[]}
        totalHours={0}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={vi.fn()}
      />
    )

    expect(
      screen.getByText('No worklogs this month. Click a cell or use Quick Log to get started.')
    ).toBeInTheDocument()
  })

  it('handles cell editing, creation, deletion, and copy interactions', () => {
    const onCellClick = vi.fn()
    const onWorklogEdit = vi.fn()
    const onWorklogDelete = vi.fn()
    const onCopyToToday = vi.fn()

    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
        monthDate={new Date(2026, 2, 1)}
        holidays={{ '2026-03-17': 'Team Holiday' }}
        loading={false}
        capexMap={{ 'PE-101': true }}
        onCellClick={onCellClick}
        onWorklogEdit={onWorklogEdit}
        onWorklogDelete={onWorklogDelete}
        onCopyToToday={onCopyToToday}
      />
    )

    fireEvent.click(screen.getByTitle('Click to log time on 2026-03-06'))
    expect(onCellClick).toHaveBeenCalledWith('2026-03-06')

    const filledCell = screen.getByTitle(
      title => title.includes('PE-101') && title.includes('2026-03-05')
    )
    fireEvent.click(filledCell)
    expect(onWorklogEdit).toHaveBeenCalledWith(worklog)

    fireEvent.click(filledCell, { ctrlKey: true })
    expect(onCopyToToday).toHaveBeenCalledWith([worklog])

    fireEvent.contextMenu(filledCell)
    expect(onWorklogDelete).toHaveBeenCalledWith(worklog)

    fireEvent.click(
      screen.getByTitle(title => title.includes('2h') && title.includes('copy to next empty day')),
      {
        ctrlKey: true,
      }
    )
    expect(onCopyToToday).toHaveBeenLastCalledWith([worklog])

    expect(screen.getByTitle('Team Holiday')).toBeInTheDocument()
  })
})
