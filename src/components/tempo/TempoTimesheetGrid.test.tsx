import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { TempoTimesheetGrid } from './TempoTimesheetGrid'
import { getHoursClasses } from '../../utils/tempoUtils'

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
    expect(onCellClick).toHaveBeenCalledWith('2026-03-06', 'PE-101')

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

  it('renders footer totals with full-day check, partial total, and zero', () => {
    const fullDayWorklog: TempoWorklog = {
      ...worklog,
      hours: 8,
      date: '2026-03-10',
    }
    const partialWorklog: TempoWorklog = {
      ...worklog,
      hours: 3,
      date: '2026-03-11',
    }
    const summaries: TempoIssueSummary[] = [
      {
        issueKey: 'PE-101',
        issueSummary: 'Tempo grid test',
        totalHours: 11,
        hoursByDate: {
          '2026-03-10': 8,
          '2026-03-11': 3,
        },
      },
    ]
    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={summaries}
        worklogs={[fullDayWorklog, partialWorklog]}
        totalHours={11}
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

    // Full day (8h) shows a check icon
    const fullCells = container.querySelectorAll('.tempo-grid-total-cell.full')
    expect(fullCells.length).toBeGreaterThanOrEqual(1)
    expect(fullCells[0].querySelector('.tempo-day-check')).toBeInTheDocument()

    // Partial day (3h) shows numeric total
    const partialCells = container.querySelectorAll('.tempo-grid-total-cell.partial')
    expect(partialCells.length).toBeGreaterThanOrEqual(1)
    expect(partialCells[0].textContent).toBe('3')
  })

  it('shows tooltip on mouse enter and hides on mouse leave', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    const emptyCell = screen.getByTitle('Click to log time on 2026-03-06')
    fireEvent.mouseEnter(emptyCell)
    // Tooltip portal renders in document.body
    expect(document.querySelector('.tempo-cell-tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(emptyCell)
    expect(document.querySelector('.tempo-cell-tooltip')).not.toBeInTheDocument()
  })

  it('does not call onWorklogEdit when cell has multiple worklogs', () => {
    const secondWorklog: TempoWorklog = {
      ...worklog,
      id: 2,
      description: 'Another entry',
    }
    const summaries: TempoIssueSummary[] = [
      {
        issueKey: 'PE-101',
        issueSummary: 'Tempo grid test',
        totalHours: 4,
        hoursByDate: { '2026-03-05': 4 },
      },
    ]
    const onWorklogEdit = vi.fn()
    const onCellClick = vi.fn()
    render(
      <TempoTimesheetGrid
        issueSummaries={summaries}
        worklogs={[worklog, secondWorklog]}
        totalHours={4}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={onCellClick}
        onWorklogEdit={onWorklogEdit}
        onWorklogDelete={vi.fn()}
        onCopyToToday={vi.fn()}
      />
    )

    const filledCell = screen.getByTitle(
      title => title.includes('PE-101') && title.includes('2026-03-05')
    )
    fireEvent.click(filledCell)
    // Multiple worklogs → neither edit nor cell click should fire
    expect(onWorklogEdit).not.toHaveBeenCalled()
    expect(onCellClick).not.toHaveBeenCalled()
  })

  it('does not fire onWorklogDelete on right-click when cell has multiple worklogs', () => {
    const secondWorklog: TempoWorklog = {
      ...worklog,
      id: 2,
      description: 'Another entry',
    }
    const summaries: TempoIssueSummary[] = [
      {
        issueKey: 'PE-101',
        issueSummary: 'Tempo grid test',
        totalHours: 4,
        hoursByDate: { '2026-03-05': 4 },
      },
    ]
    const onWorklogDelete = vi.fn()
    render(
      <TempoTimesheetGrid
        issueSummaries={summaries}
        worklogs={[worklog, secondWorklog]}
        totalHours={4}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={onWorklogDelete}
        onCopyToToday={vi.fn()}
      />
    )

    const filledCell = screen.getByTitle(
      title => title.includes('PE-101') && title.includes('2026-03-05')
    )
    fireEvent.contextMenu(filledCell)
    expect(onWorklogDelete).not.toHaveBeenCalled()
  })

  it('renders correct day columns for a 28-day month', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[{ ...worklog, date: '2026-02-05' }]}
        totalHours={2}
        monthDate={new Date(2026, 1, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={vi.fn()}
      />
    )

    const dayHeaders = screen.getAllByText(/^\d{2}$/)
    // February 2026 has 28 days
    expect(dayHeaders.length).toBe(28)
  })

  it('shows footer total row with overall total hours', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={42}
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

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows tooltip on filled cell with single worklog including delete hint', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    const filledCell = screen.getByTitle(
      title => title.includes('PE-101') && title.includes('2026-03-05')
    )
    fireEvent.mouseEnter(filledCell)

    const tooltip = document.querySelector('.tempo-cell-tooltip')
    expect(tooltip).toBeInTheDocument()
    // Single worklog tooltip includes the delete hint line
    expect(tooltip!.textContent).toContain('Right-click')
    expect(tooltip!.textContent).toContain('Ctrl+click')

    fireEvent.mouseLeave(filledCell)
    expect(document.querySelector('.tempo-cell-tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on filled cell with multiple worklogs without delete hint', () => {
    const secondWorklog: TempoWorklog = { ...worklog, id: 2, description: 'Second' }
    const summaries: TempoIssueSummary[] = [
      {
        issueKey: 'PE-101',
        issueSummary: 'Tempo grid test',
        totalHours: 4,
        hoursByDate: { '2026-03-05': 4 },
      },
    ]

    render(
      <TempoTimesheetGrid
        issueSummaries={summaries}
        worklogs={[worklog, secondWorklog]}
        totalHours={4}
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

    const filledCell = screen.getByTitle(
      title => title.includes('PE-101') && title.includes('2026-03-05')
    )
    fireEvent.mouseEnter(filledCell)

    const tooltip = document.querySelector('.tempo-cell-tooltip')
    expect(tooltip).toBeInTheDocument()
    // Multi-worklog tooltip does NOT include "Right-click — delete"
    expect(tooltip!.textContent).not.toContain('Right-click')
    expect(tooltip!.textContent).toContain('Ctrl+click')
  })

  it('shows tooltip on footer total cell and hides on mouseLeave', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    // The footer cell for 2026-03-05 has dayTotal > 0 and cursor:copy style
    const footerCells = container.querySelectorAll('.tempo-grid-total-cell')
    const dayFiveFooter = Array.from(footerCells).find(
      cell => (cell as HTMLElement).style.cursor === 'copy'
    ) as HTMLElement

    expect(dayFiveFooter).toBeDefined()
    fireEvent.mouseEnter(dayFiveFooter)
    expect(document.querySelector('.tempo-cell-tooltip')).toBeInTheDocument()
    expect(document.querySelector('.tempo-cell-tooltip')!.textContent).toContain('total')

    fireEvent.mouseLeave(dayFiveFooter)
    expect(document.querySelector('.tempo-cell-tooltip')).not.toBeInTheDocument()
  })

  it('fires onCopyToToday when ctrl+clicking footer cell with hours', () => {
    const onCopyToToday = vi.fn()

    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={onCopyToToday}
      />
    )

    // Footer cell for a day with hours (cursor: copy means dayTotal > 0)
    const footerCells = container.querySelectorAll('.tempo-grid-total-cell')
    const filledFooterCell = Array.from(footerCells).find(
      cell => (cell as HTMLElement).style.cursor === 'copy'
    ) as HTMLElement

    expect(filledFooterCell).toBeDefined()
    fireEvent.click(filledFooterCell, { ctrlKey: true })
    expect(onCopyToToday).toHaveBeenCalledWith([worklog])
  })

  it('fires onCopyToToday when ctrl+clicking footer cell with hours', () => {
    const onCopyToToday = vi.fn()

    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={onCopyToToday}
      />
    )

    const footerCells = container.querySelectorAll('.tempo-grid-total-cell')
    const filledFooterCell = Array.from(footerCells).find(
      cell => (cell as HTMLElement).style.cursor === 'copy'
    ) as HTMLElement

    expect(filledFooterCell).toBeDefined()
    fireEvent.click(filledFooterCell, { ctrlKey: true })
    expect(onCopyToToday).toHaveBeenCalledWith([worklog])
  })

  it('does not fire onCopyToToday when ctrl+clicking footer cell with zero hours', () => {
    const onCopyToToday = vi.fn()

    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
        monthDate={new Date(2026, 2, 1)}
        holidays={{}}
        loading={false}
        capexMap={{}}
        onCellClick={vi.fn()}
        onWorklogEdit={vi.fn()}
        onWorklogDelete={vi.fn()}
        onCopyToToday={onCopyToToday}
      />
    )

    // Footer cell for a day with no worklogs (e.g., 2026-03-01)
    const footerCells = container.querySelectorAll('.tempo-grid-total-cell')
    const emptyFooterCell = Array.from(footerCells).find(
      cell => !(cell as HTMLElement).style.cursor
    ) as HTMLElement

    expect(emptyFooterCell).toBeDefined()
    fireEvent.click(emptyFooterCell, { ctrlKey: true })
    expect(onCopyToToday).not.toHaveBeenCalled()
  })

  it('does not show footer tooltip on hover when dayTotal is zero', () => {
    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    const footerCells = container.querySelectorAll('.tempo-grid-total-cell')
    const emptyFooterCell = Array.from(footerCells).find(
      cell => !(cell as HTMLElement).style.cursor
    ) as HTMLElement

    fireEvent.mouseEnter(emptyFooterCell)
    expect(document.querySelector('.tempo-cell-tooltip')).not.toBeInTheDocument()
  })

  it('hides tooltip when the grid scrolls', () => {
    render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    // Show a tooltip first
    const emptyCell = screen.getByTitle('Click to log time on 2026-03-06')
    fireEvent.mouseEnter(emptyCell)
    expect(document.querySelector('.tempo-cell-tooltip')).toBeInTheDocument()

    // Scroll the grid container to dismiss the tooltip
    const scrollContainer = document.querySelector('.tempo-grid-scroll')
    expect(scrollContainer).toBeInTheDocument()
    fireEvent.scroll(scrollContainer!)

    expect(document.querySelector('.tempo-cell-tooltip')).not.toBeInTheDocument()
  })

  it('renders non-capex rows without the capex class', () => {
    const { container } = render(
      <TempoTimesheetGrid
        issueSummaries={issueSummaries}
        worklogs={[worklog]}
        totalHours={2}
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

    const rows = container.querySelectorAll('.tempo-grid-row')
    expect(rows.length).toBe(1)
    expect(rows[0].classList.contains('capex')).toBe(false)
  })
})

describe('getHoursClasses', () => {
  it('returns empty array when hours <= 0', () => {
    expect(getHoursClasses(0, false)).toEqual([])
    expect(getHoursClasses(0, true)).toEqual([])
    expect(getHoursClasses(-1, true)).toEqual([])
  })

  it('returns has-hours when hours > 0 and not capex', () => {
    expect(getHoursClasses(2, false)).toEqual(['has-hours'])
  })

  it('returns has-hours and capex when hours > 0 and capex', () => {
    expect(getHoursClasses(2, true)).toEqual(['has-hours', 'capex'])
  })
})
