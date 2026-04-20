import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ScheduleDetailPanel } from './ScheduleDetailPanel'

const mockToggle = vi.fn()
const mockRemove = vi.fn()
const mockConfirm = vi.fn()
const mockFormatDistanceToNow = vi.fn()
const mockFormat = vi.fn()

let mockSchedule: unknown
let mockRuns: unknown
let mockConfirmDialog: Record<string, unknown> | null

vi.mock('../../hooks/useConvex', () => ({
  useSchedule: () => mockSchedule,
  useScheduleRuns: () => mockRuns,
  useScheduleMutations: () => ({ toggle: mockToggle, remove: mockRemove }),
}))

vi.mock('../../utils/dateUtils', () => ({
  formatDistanceToNow: (value: number) => mockFormatDistanceToNow(value),
  format: (value: number, fmt: string) => mockFormat(value, fmt),
  WEEKDAY_SHORT: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}))

vi.mock('./ScheduleEditor', () => ({
  ScheduleEditor: ({ scheduleId }: { scheduleId: string }) => (
    <div data-testid="schedule-editor">editing:{scheduleId}</div>
  ),
}))

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({
    confirm: mockConfirm,
    confirmDialog: mockConfirmDialog,
  }),
}))

vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: ({ message }: { message: string }) => (
    <div data-testid="confirm-dialog">{message}</div>
  ),
}))

vi.mock('../shared/statusDisplay', () => ({
  getStatusClass: (status: string) => `status-${status}`,
  getStatusIcon: (status: string) => <span>{`icon-${status}`}</span>,
}))

function createSchedule(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'sched-1',
    name: 'Weekday Review',
    description: 'Keeps PRs moving',
    cron: '30 9 * * 1-5',
    enabled: true,
    timezone: 'America/New_York',
    missedPolicy: 'catchup',
    createdAt: 1,
    updatedAt: 2,
    job: {
      name: 'Review Queue',
      workerType: 'ai',
    },
    lastRunAt: 3,
    lastRunStatus: 'completed',
    nextRunAt: 4,
    ...overrides,
  }
}

describe('ScheduleDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatDistanceToNow.mockReturnValue('2 hours ago')
    mockFormat.mockReturnValue('Apr 2, 9:30 am')
    mockConfirm.mockResolvedValue(true)
    mockConfirmDialog = {
      message: 'Confirm schedule deletion',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }
    mockRuns = [
      {
        _id: 'run-1',
        status: 'completed',
        triggeredBy: 'schedule',
        startedAt: 5,
        duration: 750,
      },
      {
        _id: 'run-2',
        status: 'failed',
        triggeredBy: 'manual',
        startedAt: 6,
        duration: 2500,
      },
    ]
    mockSchedule = createSchedule()
  })

  it('renders loading and not-found states', () => {
    mockSchedule = undefined
    const { rerender } = render(<ScheduleDetailPanel scheduleId="sched-1" />)
    expect(screen.getByText('Loading schedule...')).toBeInTheDocument()

    mockSchedule = null
    rerender(<ScheduleDetailPanel scheduleId="sched-1" />)
    expect(screen.getByText('Schedule not found.')).toBeInTheDocument()
  })

  it('renders schedule details and action handlers for an enabled schedule', async () => {
    render(<ScheduleDetailPanel scheduleId="sched-1" />)

    expect(screen.getByRole('heading', { name: 'Weekday Review' })).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Keeps PRs moving')).toBeInTheDocument()
    expect(screen.getByText('30 9 * * 1-5')).toBeInTheDocument()
    expect(screen.getByText('Weekdays at 09:30')).toBeInTheDocument()
    expect(screen.getByText('America/New_York')).toBeInTheDocument()
    expect(screen.getByText('catchup')).toBeInTheDocument()
    expect(screen.getByText('Review Queue')).toBeInTheDocument()
    expect(screen.getByText('ai')).toBeInTheDocument()
    expect(screen.getByText('icon-completed')).toBeInTheDocument()
    expect(screen.getByText('Apr 2, 9:30 am')).toBeInTheDocument()
    expect(screen.getByText('750ms')).toBeInTheDocument()
    expect(screen.getByText('2.5s')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Confirm schedule deletion')

    fireEvent.click(screen.getByTitle('Disable'))
    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByTitle('Delete'))

    expect(screen.getByTestId('schedule-editor')).toHaveTextContent('editing:sched-1')

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith({ id: 'sched-1' })
      expect(mockConfirm).toHaveBeenCalledWith({
        message: 'Delete schedule "Weekday Review"?',
        confirmLabel: 'Delete',
        variant: 'danger',
      })
      expect(mockRemove).toHaveBeenCalledWith({ id: 'sched-1' })
    })
  })

  it.each([
    ['* * * * *', 'Every minute'],
    ['5 * * * *', 'Every hour at :05'],
    ['15 8 * * *', 'Daily at 08:15'],
    ['45 6 * * 1,3', 'Mon, Wed at 06:45'],
    ['invalid cron', 'invalid cron'],
  ])('formats %s as %s', (cron, label) => {
    mockSchedule = createSchedule({
      cron,
      job: null,
      nextRunAt: undefined,
      enabled: false,
      lastRunAt: null,
    })
    mockRuns = []

    render(<ScheduleDetailPanel scheduleId="sched-1" />)

    if (cron === 'invalid cron') {
      expect(screen.getAllByText(label)).toHaveLength(2)
    } else {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText('Job not found (may have been deleted)')).toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()
    expect(screen.queryByText('Next Run')).not.toBeInTheDocument()
    expect(screen.getByText('No runs yet for this schedule.')).toBeInTheDocument()
  })

  it('shows a loading message while run history is still loading', () => {
    mockRuns = undefined

    render(<ScheduleDetailPanel scheduleId="sched-1" />)

    expect(screen.getByText('Loading runs...')).toBeInTheDocument()
  })

  it('renders createdAt and updatedAt tooltips, missedPolicy, and job workerType', () => {
    render(<ScheduleDetailPanel scheduleId="sched-1" />)

    const metaSpans = document.querySelectorAll('.schedule-detail-meta span')
    expect(metaSpans.length).toBe(2)
    expect(metaSpans[0].getAttribute('title')).toBe(new Date(1).toLocaleString())
    expect(metaSpans[1].getAttribute('title')).toBe(new Date(2).toLocaleString())

    expect(screen.getByText('Missed Policy')).toBeInTheDocument()
    expect(screen.getByText('catchup')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('ai')).toBeInTheDocument()
  })
})
