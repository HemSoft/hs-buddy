import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TempoDaySummary, TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { TempoDashboard } from './TempoDashboard'

const dashboardMocks = vi.hoisted(() => {
  const editWorklog: TempoWorklog = {
    id: 1,
    issueKey: 'PE-101',
    issueSummary: 'Initial worklog',
    hours: 1.5,
    date: '2026-03-18',
    startTime: '09:00',
    description: 'Original description',
    accountKey: 'OPS',
    accountName: 'Operations',
  }

  const todayWorklog: TempoWorklog = {
    id: 2,
    issueKey: 'PE-102',
    issueSummary: 'Today worklog',
    hours: 2,
    date: '2026-03-20',
    startTime: '08:00',
    description: 'Already logged',
    accountKey: 'DEV',
    accountName: 'Development',
  }

  const copySourceWorklogs: TempoWorklog[] = [
    {
      id: 3,
      issueKey: 'PE-201',
      issueSummary: 'Copy source one',
      hours: 1,
      date: '2026-03-19',
      startTime: '08:00',
      description: 'Copied once',
      accountKey: 'OPS',
      accountName: 'Operations',
    },
    {
      id: 4,
      issueKey: 'PE-202',
      issueSummary: 'Copy source two',
      hours: 0.5,
      date: '2026-03-19',
      startTime: '09:00',
      description: 'Copied twice',
      accountKey: 'DEV',
      accountName: 'Development',
    },
  ]

  return {
    editWorklog,
    todayWorklog,
    copySourceWorklogs,
    summaryPropsSpy: vi.fn(),
    useTempoMonth: vi.fn(),
    useTempoToday: vi.fn(),
    useTempoActions: vi.fn(),
    useCapexMap: vi.fn(),
    useUserSchedule: vi.fn(),
    getMonthRange: vi.fn(),
  }
})

vi.mock('../../hooks/useTempo', () => ({
  useTempoMonth: dashboardMocks.useTempoMonth,
  useTempoToday: dashboardMocks.useTempoToday,
  useTempoActions: dashboardMocks.useTempoActions,
  useCapexMap: dashboardMocks.useCapexMap,
  useUserSchedule: dashboardMocks.useUserSchedule,
  getMonthRange: dashboardMocks.getMonthRange,
}))

vi.mock('./TempoSummaryCards', () => ({
  TempoSummaryCards: (props: unknown) => {
    dashboardMocks.summaryPropsSpy(props)
    return <div data-testid="tempo-summary-cards" />
  },
}))

vi.mock('./TempoTimesheetGrid', () => ({
  TempoTimesheetGrid: ({
    onCellClick,
    onWorklogEdit,
    onWorklogDelete,
    onCopyToToday,
  }: {
    onCellClick: (date: string) => void
    onWorklogEdit: (worklog: TempoWorklog) => void
    onWorklogDelete: (worklog: TempoWorklog) => Promise<void>
    onCopyToToday: (worklogs: TempoWorklog[]) => Promise<void>
  }) => (
    <div data-testid="tempo-timesheet-grid">
      <button onClick={() => onCellClick('2026-03-20')}>grid create</button>
      <button onClick={() => onWorklogEdit(dashboardMocks.editWorklog)}>grid edit</button>
      <button onClick={() => void onWorklogDelete(dashboardMocks.editWorklog)}>grid delete</button>
      <button onClick={() => void onCopyToToday(dashboardMocks.copySourceWorklogs)}>
        grid copy
      </button>
    </div>
  ),
}))

vi.mock('./TempoWorklogEditor', () => ({
  TempoWorklogEditor: ({
    worklog,
    defaultDate,
    onSave,
    onCancel,
  }: {
    worklog: TempoWorklog | null
    defaultDate: string
    onSave: (payload: {
      issueKey: string
      hours: number
      date: string
      startTime: string
      description: string
      accountKey: string
    }) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="tempo-worklog-editor">
      <span>{worklog ? `editing:${worklog.id}` : `creating:${defaultDate}`}</span>
      <button
        onClick={() =>
          void onSave({
            issueKey: 'PE-500',
            hours: 1.5,
            date: defaultDate,
            startTime: '08:00',
            description: 'Saved through editor',
            accountKey: 'OPS',
          })
        }
      >
        save editor
      </button>
      <button onClick={onCancel}>cancel editor</button>
    </div>
  ),
}))

const issueSummaries: TempoIssueSummary[] = [
  {
    issueKey: 'PE-101',
    issueSummary: 'Initial worklog',
    totalHours: 3.5,
    hoursByDate: {
      '2026-03-18': 1.5,
      '2026-03-20': 2,
    },
  },
]

const todaySummary: TempoDaySummary = {
  date: formatDateKey(new Date()),
  totalHours: 2,
  worklogs: [{ ...dashboardMocks.todayWorklog, date: formatDateKey(new Date()) }],
}

function configureDashboard({
  worklogs = [dashboardMocks.editWorklog, dashboardMocks.todayWorklog],
  monthError = null,
  removeResult = { success: true },
}: {
  worklogs?: TempoWorklog[]
  monthError?: string | null
  removeResult?: { success: boolean; error?: string }
} = {}) {
  const todayKey = formatDateKey(new Date())
  const effectiveWorklogs = worklogs.map(currentWorklog =>
    currentWorklog.id === dashboardMocks.todayWorklog.id
      ? { ...currentWorklog, date: todayKey }
      : currentWorklog
  )
  const monthRefresh = vi.fn()
  const todayRefresh = vi.fn()
  const create = vi.fn().mockResolvedValue({ success: true })
  const update = vi.fn().mockResolvedValue({ success: true })
  const remove = vi.fn().mockResolvedValue(removeResult)

  dashboardMocks.getMonthRange.mockReturnValue({
    from: '2026-03-01',
    to: '2026-03-31',
  })
  dashboardMocks.useTempoMonth.mockReturnValue({
    worklogs: effectiveWorklogs,
    issueSummaries,
    totalHours: 3.5,
    loading: false,
    error: monthError,
    refresh: monthRefresh,
  })
  dashboardMocks.useTempoToday.mockReturnValue({
    data: todaySummary,
    loading: false,
    error: null,
    refresh: todayRefresh,
  })
  dashboardMocks.useUserSchedule.mockReturnValue({
    schedule: [
      {
        date: '2026-03-20',
        requiredSeconds: 28800,
        type: 'WORKING_DAY',
      },
      {
        date: '2026-03-21',
        requiredSeconds: 0,
        type: 'NON_WORKING_DAY',
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })
  dashboardMocks.useTempoActions.mockReturnValue({
    create,
    update,
    remove,
    pending: false,
  })
  dashboardMocks.useCapexMap.mockReturnValue({
    'PE-101': true,
  })

  return { monthRefresh, todayRefresh, create, update, remove }
}

describe('TempoDashboard', () => {
  beforeEach(() => {
    dashboardMocks.summaryPropsSpy.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens the create editor and saves a new worklog', async () => {
    const { create } = configureDashboard()
    const todayKey = formatDateKey(new Date())

    render(<TempoDashboard />)

    expect(dashboardMocks.summaryPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        todayHours: 2,
        monthHours: 3.5,
      })
    )

    fireEvent.click(screen.getByRole('button', { name: /Log Time/i }))
    expect(screen.getByText(`creating:${todayKey}`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        issueKey: 'PE-500',
        hours: 1.5,
        date: todayKey,
        startTime: '08:00',
        description: 'Saved through editor',
        accountKey: 'OPS',
      })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('tempo-worklog-editor')).not.toBeInTheDocument()
    })
  })

  it('retries failed month loads and refreshes both today and month data', () => {
    const { monthRefresh, todayRefresh } = configureDashboard({
      monthError: 'Month load failed',
    })

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByTitle('Refresh'))

    expect(monthRefresh).toHaveBeenCalledTimes(2)
    expect(todayRefresh).toHaveBeenCalledTimes(2)
  })

  it('supports timeline edits and dismisses delete errors', async () => {
    const { update, remove } = configureDashboard({
      removeResult: { success: false, error: 'Delete blocked' },
    })

    render(<TempoDashboard />)

    fireEvent.click(screen.getByTitle('List view'))
    fireEvent.click(screen.getAllByTitle('Delete')[0])

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(1)
      expect(screen.getByText('⚠ Delete blocked')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(screen.queryByText('⚠ Delete blocked')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByTitle('Edit')[0])
    expect(screen.getByText('editing:1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(1, {
        hours: 1.5,
        date: formatDateKey(new Date()),
        startTime: '08:00',
        description: 'Saved through editor',
        accountKey: 'OPS',
      })
    })
  })

  it('copies a prior day to today using sequential start times', async () => {
    const { create } = configureDashboard()
    const todayKey = formatDateKey(new Date())

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid copy' }))

    await waitFor(() => {
      expect(create).toHaveBeenNthCalledWith(1, {
        issueKey: 'PE-201',
        hours: 1,
        date: todayKey,
        startTime: '10:00',
        description: 'Copied once',
        accountKey: 'OPS',
      })
      expect(create).toHaveBeenNthCalledWith(2, {
        issueKey: 'PE-202',
        hours: 0.5,
        date: todayKey,
        startTime: '11:00',
        description: 'Copied twice',
        accountKey: 'DEV',
      })
    })
  })
})
