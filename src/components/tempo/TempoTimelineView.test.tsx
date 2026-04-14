import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TempoTimelineView } from './TempoTimelineView'
import type { TempoWorklog } from '../../types/tempo'

const makeWorklog = (overrides: Partial<TempoWorklog> = {}): TempoWorklog => ({
  id: 1,
  issueKey: 'PROJ-100',
  issueSummary: 'Fix login bug',
  hours: 2.5,
  date: '2026-04-14',
  startTime: '09:00',
  description: 'Worked on login fix',
  accountKey: 'DEV',
  accountName: 'Development',
  ...overrides,
})

const defaultProps = {
  worklogs: [makeWorklog()],
  loading: false,
  monthLabel: 'April 2026',
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('TempoTimelineView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no worklogs and not loading', () => {
    render(<TempoTimelineView {...defaultProps} worklogs={[]} />)
    expect(screen.getByText('No worklogs for April 2026')).toBeInTheDocument()
  })

  it('does not render empty state when loading with no worklogs', () => {
    render(<TempoTimelineView {...defaultProps} worklogs={[]} loading={true} />)
    expect(screen.queryByText(/No worklogs/)).not.toBeInTheDocument()
  })

  it('renders table headers', () => {
    render(<TempoTimelineView {...defaultProps} />)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('Issue')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
  })

  it('renders worklog row with all fields', () => {
    render(<TempoTimelineView {...defaultProps} />)
    expect(screen.getByText('2026-04-14')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('2.5')).toBeInTheDocument()
    expect(screen.getByText('PROJ-100')).toBeInTheDocument()
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('DEV')).toBeInTheDocument()
  })

  it('renders multiple worklogs', () => {
    const worklogs = [
      makeWorklog({ id: 1, issueKey: 'PROJ-1' }),
      makeWorklog({ id: 2, issueKey: 'PROJ-2' }),
      makeWorklog({ id: 3, issueKey: 'PROJ-3' }),
    ]
    render(<TempoTimelineView {...defaultProps} worklogs={worklogs} />)
    expect(screen.getByText('PROJ-1')).toBeInTheDocument()
    expect(screen.getByText('PROJ-2')).toBeInTheDocument()
    expect(screen.getByText('PROJ-3')).toBeInTheDocument()
  })

  it('calls onEdit with worklog when edit button is clicked', () => {
    const worklog = makeWorklog()
    render(<TempoTimelineView {...defaultProps} worklogs={[worklog]} />)
    fireEvent.click(screen.getByLabelText('Edit worklog for PROJ-100 on 2026-04-14'))
    expect(defaultProps.onEdit).toHaveBeenCalledWith(worklog)
  })

  it('calls onDelete with worklog when delete button is clicked', () => {
    const worklog = makeWorklog()
    render(<TempoTimelineView {...defaultProps} worklogs={[worklog]} />)
    fireEvent.click(screen.getByLabelText('Delete worklog for PROJ-100 on 2026-04-14'))
    expect(defaultProps.onDelete).toHaveBeenCalledWith(worklog)
  })

  it('renders issue key in a pill', () => {
    const { container } = render(<TempoTimelineView {...defaultProps} />)
    const pill = container.querySelector('.tempo-issue-pill')
    expect(pill?.textContent).toBe('PROJ-100')
  })

  it('renders account key in a badge', () => {
    const { container } = render(<TempoTimelineView {...defaultProps} />)
    const badge = container.querySelector('.tempo-account-badge')
    expect(badge?.textContent).toBe('DEV')
  })
})
