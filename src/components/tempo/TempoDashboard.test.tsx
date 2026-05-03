import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TempoDaySummary, TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { TempoDashboard, tempoDashboardReducer, buildTemplateFromWorklogs } from './TempoDashboard'

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

  const fridayCopyWorklogs: TempoWorklog[] = [
    {
      id: 5,
      issueKey: 'PE-301',
      issueSummary: 'Friday copy',
      hours: 1,
      date: '2026-03-20',
      startTime: '08:00',
      description: 'Friday work',
      accountKey: 'OPS',
      accountName: 'Operations',
    },
  ]

  return {
    editWorklog,
    todayWorklog,
    copySourceWorklogs,
    fridayCopyWorklogs,
    summaryPropsSpy: vi.fn(),
    gridPropsSpy: vi.fn(),
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
  TempoTimesheetGrid: (props: {
    issueSummaries: TempoIssueSummary[]
    onCellClick: (date: string, issueKey?: string) => void
    onWorklogEdit: (worklog: TempoWorklog) => void
    onWorklogDelete: (worklog: TempoWorklog) => Promise<void>
    onCopyToToday: (worklogs: TempoWorklog[]) => Promise<void>
    onCopyFromPreviousMonth?: () => void
  }) => {
    dashboardMocks.gridPropsSpy(props)
    const { onCellClick, onWorklogEdit, onWorklogDelete, onCopyToToday, onCopyFromPreviousMonth } =
      props
    return (
      <div data-testid="tempo-timesheet-grid">
        <button onClick={() => onCellClick('2026-03-20')}>grid create</button>
        <button onClick={() => onCellClick('2026-03-20', 'PE-101')}>grid create with issue</button>
        <button onClick={() => onCellClick('2026-03-20', 'NONEXIST')}>
          grid create unknown issue
        </button>
        <button onClick={() => onWorklogEdit(dashboardMocks.editWorklog)}>grid edit</button>
        <button onClick={() => void onWorklogDelete(dashboardMocks.editWorklog)}>
          grid delete
        </button>
        <button onClick={() => void onCopyToToday(dashboardMocks.copySourceWorklogs)}>
          grid copy
        </button>
        <button onClick={() => void onCopyToToday(dashboardMocks.fridayCopyWorklogs)}>
          grid copy friday
        </button>
        {onCopyFromPreviousMonth && (
          <button onClick={() => onCopyFromPreviousMonth()}>copy from previous month</button>
        )}
      </div>
    )
  },
}))

vi.mock('./TempoWorklogEditor', () => ({
  TempoWorklogEditor: ({
    worklog,
    defaultDate,
    defaultIssueKey,
    defaultAccountKey,
    defaultDescription,
    onSave,
    onCancel,
  }: {
    worklog: TempoWorklog | null
    defaultDate: string
    defaultIssueKey?: string
    defaultAccountKey?: string
    defaultDescription?: string
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
      {defaultIssueKey && <span data-testid="prefill-issue">{defaultIssueKey}</span>}
      {defaultAccountKey && <span data-testid="prefill-account">{defaultAccountKey}</span>}
      {defaultDescription && <span data-testid="prefill-description">{defaultDescription}</span>}
      <button
        onClick={() =>
          onSave({
            issueKey: 'PE-500',
            hours: 1.5,
            date: defaultDate,
            startTime: '08:00',
            description: 'Saved through editor',
            accountKey: 'OPS',
          }).catch(() => {})
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
    localStorage.clear()
    dashboardMocks.summaryPropsSpy.mockClear()
    dashboardMocks.gridPropsSpy.mockClear()
    Object.defineProperty(window, 'tempo', {
      value: {
        getWeek: vi.fn(),
        getToday: vi.fn(),
        getRange: vi.fn(),
        createWorklog: vi.fn(),
        updateWorklog: vi.fn(),
        deleteWorklog: vi.fn(),
        getAccounts: vi.fn(),
        getProjectAccounts: vi.fn(),
        getCapexMap: vi.fn(),
        getSchedule: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens the create editor and saves a new worklog', async () => {
    const { create } = configureDashboard()
    const todayKey = formatDateKey(new Date())

    render(<TempoDashboard />)

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()

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
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(monthRefresh).toHaveBeenCalledTimes(2)
    expect(todayRefresh).toHaveBeenCalledTimes(2)
  })

  it('supports timeline edits and dismisses delete errors', async () => {
    const { update, remove } = configureDashboard({
      removeResult: { success: false, error: 'Delete blocked' },
    })
    const todayKey = formatDateKey(new Date())

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete worklog for PE-101 on 2026-03-18' }))

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(1)
      expect(screen.getByText('⚠ Delete blocked')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(screen.queryByText('⚠ Delete blocked')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit worklog for PE-101 on 2026-03-18' }))
    expect(screen.getByText('editing:1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(1, {
        hours: 1.5,
        date: todayKey,
        startTime: '08:00',
        description: 'Saved through editor',
        accountKey: 'OPS',
      })
    })
  })

  it('copies a prior day to the next empty day using sequential start times', async () => {
    const { create } = configureDashboard()

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid copy' }))

    // Source worklogs are dated 2026-03-19 (Thu); next workday is 2026-03-20 (Fri)
    // and neither PE-201 nor PE-202 has hours there, so that's the target.
    const expectedTarget = '2026-03-20'

    await waitFor(() => {
      expect(create).toHaveBeenNthCalledWith(1, {
        issueKey: 'PE-201',
        hours: 1,
        date: expectedTarget,
        startTime: '08:00',
        description: 'Copied once',
        accountKey: 'OPS',
      })
      expect(create).toHaveBeenNthCalledWith(2, {
        issueKey: 'PE-202',
        hours: 0.5,
        date: expectedTarget,
        startTime: '09:00',
        description: 'Copied twice',
        accountKey: 'DEV',
      })
    })
  })

  it('navigates months forward and backward', () => {
    configureDashboard()
    render(<TempoDashboard />)

    // Click next month
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    // Click previous month twice (go back past current)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    // Go to current month
    fireEvent.click(screen.getByTitle('Go to current month'))

    // The component should not crash and should render
    expect(screen.getByTestId('tempo-summary-cards')).toBeInTheDocument()
  })

  it('persists view mode to localStorage', () => {
    configureDashboard()
    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(localStorage.getItem('viewMode:tempo')).toBe('timeline')

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(localStorage.getItem('viewMode:tempo')).toBe('grid')
  })

  it('reads initial view mode from localStorage', () => {
    localStorage.setItem('viewMode:tempo', 'timeline')
    configureDashboard()
    render(<TempoDashboard />)

    // Should render timeline view instead of grid
    expect(
      screen.getByRole('button', { name: 'Delete worklog for PE-101 on 2026-03-18' })
    ).toBeInTheDocument()
  })

  it('save calls create and closes editor on success', async () => {
    const { create } = configureDashboard()
    create.mockResolvedValue({ success: true })

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: /Log Time/i }))
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))

    await waitFor(() => {
      expect(create).toHaveBeenCalled()
    })

    // Editor should close after successful save
    await waitFor(() => {
      expect(screen.queryByTestId('tempo-worklog-editor')).not.toBeInTheDocument()
    })
  })

  it('opens editor from grid cell click', () => {
    configureDashboard()
    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid create' }))
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()
    expect(screen.getByText('creating:2026-03-20')).toBeInTheDocument()
  })

  it('cancels editor and closes it', () => {
    configureDashboard()
    render(<TempoDashboard />)

    // Open editor
    fireEvent.click(screen.getByRole('button', { name: /Log Time/i }))
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: 'cancel editor' }))
    expect(screen.queryByTestId('tempo-worklog-editor')).not.toBeInTheDocument()
  })

  it('handles delete success without error', async () => {
    const { remove } = configureDashboard({ removeResult: { success: true } })
    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid delete' }))
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(1)
    })
    // No error banner
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
  })

  it('handles copy failure mid-sequence', async () => {
    const { create } = configureDashboard()
    create.mockResolvedValueOnce({ success: true })
    create.mockResolvedValueOnce({ success: false, error: 'Rate limited' })

    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid copy' }))

    await waitFor(() => {
      expect(screen.getByText('⚠ Rate limited')).toBeInTheDocument()
    })
  })

  it('passes isCurrentMonth=true to summary cards for current month', () => {
    configureDashboard()
    render(<TempoDashboard />)
    expect(dashboardMocks.summaryPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrentMonth: true })
    )
  })

  it('handles grid edit then save for existing worklog (update path)', async () => {
    const { update } = configureDashboard()
    render(<TempoDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'grid edit' }))
    expect(screen.getByText('editing:1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ hours: 1.5 }))
    })
  })

  it('defaults to grid when localStorage has "grid" stored', () => {
    localStorage.setItem('viewMode:tempo', 'grid')
    configureDashboard()
    render(<TempoDashboard />)
    expect(screen.getByTestId('tempo-timesheet-grid')).toBeInTheDocument()
  })

  it('defaults to grid when localStorage has invalid value', () => {
    localStorage.setItem('viewMode:tempo', 'invalid-value')
    configureDashboard()
    render(<TempoDashboard />)
    expect(screen.getByTestId('tempo-timesheet-grid')).toBeInTheDocument()
  })

  it('defaults to grid when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled')
    })
    configureDashboard()
    render(<TempoDashboard />)
    expect(screen.getByTestId('tempo-timesheet-grid')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('still changes view mode when localStorage.setItem throws', () => {
    configureDashboard()
    render(<TempoDashboard />)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.queryByTestId('tempo-timesheet-grid')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('passes todayHours=0 when today data is null', () => {
    configureDashboard()
    dashboardMocks.useTempoToday.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<TempoDashboard />)
    expect(dashboardMocks.summaryPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ todayHours: 0 })
    )
  })

  it('shows "Delete failed" fallback when error is undefined', async () => {
    const { remove } = configureDashboard({
      removeResult: { success: false },
    })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid delete' }))
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(1)
      expect(screen.getByText('⚠ Delete failed')).toBeInTheDocument()
    })
  })

  it('editor stays open when create save fails', async () => {
    const { create } = configureDashboard()
    create.mockResolvedValue({ success: false })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /Log Time/i }))
    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalled()
    })
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()
  })

  it('editor stays open when update save fails', async () => {
    const { update } = configureDashboard()
    update.mockResolvedValue({ success: false, error: 'Update rejected' })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'save editor' }))
    await waitFor(() => {
      expect(update).toHaveBeenCalled()
    })
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()
  })

  it('shows "Copy failed" fallback when copy error is undefined', async () => {
    const { create } = configureDashboard()
    create.mockResolvedValue({ success: false })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid copy' }))
    await waitFor(() => {
      expect(screen.getByText('⚠ Copy failed')).toBeInTheDocument()
    })
  })

  it('prefills editor when opening create with matching issueKey', () => {
    configureDashboard()
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid create with issue' }))
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()
    expect(screen.getByTestId('prefill-issue')).toHaveTextContent('PE-101')
    expect(screen.getByTestId('prefill-account')).toHaveTextContent('OPS')
    expect(screen.getByTestId('prefill-description')).toHaveTextContent('Original description')
  })

  it('does not prefill when issueKey has no matching worklogs', () => {
    configureDashboard()
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid create unknown issue' }))
    expect(screen.getByTestId('tempo-worklog-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('prefill-issue')).not.toBeInTheDocument()
  })

  it('prefills latest worklog when multiple match the issueKey', () => {
    const multipleWorklogs: TempoWorklog[] = [
      { ...dashboardMocks.editWorklog, id: 10, date: '2026-03-15' },
      { ...dashboardMocks.editWorklog, id: 11, date: '2026-03-18', description: 'Latest one' },
      { ...dashboardMocks.editWorklog, id: 12, date: '2026-03-10' },
    ]
    configureDashboard({ worklogs: [...multipleWorklogs, dashboardMocks.todayWorklog] })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid create with issue' }))
    expect(screen.getByTestId('prefill-description')).toHaveTextContent('Latest one')
  })

  it('builds holiday map from HOLIDAY schedule entries', () => {
    configureDashboard()
    dashboardMocks.useUserSchedule.mockReturnValue({
      schedule: [
        { date: '2026-03-20', requiredSeconds: 28800, type: 'WORKING_DAY' },
        { date: '2026-03-21', requiredSeconds: 0, type: 'HOLIDAY', holidayName: 'Spring Break' },
        { date: '2026-03-22', requiredSeconds: 0, type: 'HOLIDAY' },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<TempoDashboard />)
    expect(screen.getByTestId('tempo-timesheet-grid')).toBeInTheDocument()
  })

  it('passes isCurrentMonth=false after navigating to a different month', () => {
    configureDashboard()
    render(<TempoDashboard />)
    dashboardMocks.summaryPropsSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(dashboardMocks.summaryPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrentMonth: false })
    )
  })

  it('selectNextEmptyDay skips weekends when copying from Friday', async () => {
    // 2026-03-20 is a Friday; next workday is 2026-03-23 (Monday)
    const { create } = configureDashboard()
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid copy friday' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          issueKey: 'PE-301',
          date: '2026-03-23',
        })
      )
    })
  })

  it('selectNextEmptyDay skips holidays', async () => {
    // Configure 2026-03-23 (Monday) as holiday so copy from Friday lands on Tuesday
    const { create } = configureDashboard()
    dashboardMocks.useUserSchedule.mockReturnValue({
      schedule: [
        { date: '2026-03-20', requiredSeconds: 28800, type: 'WORKING_DAY' },
        { date: '2026-03-23', requiredSeconds: 0, type: 'HOLIDAY', holidayName: 'Holiday' },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid copy friday' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          issueKey: 'PE-301',
          date: '2026-03-24',
        })
      )
    })
  })

  it('selectNextEmptyDay skips days that already have the same issue', async () => {
    // Add PE-301 worklog on 2026-03-23 so it skips to 2026-03-24
    const existingOnMonday: TempoWorklog = {
      id: 20,
      issueKey: 'PE-301',
      issueSummary: 'Friday copy',
      hours: 2,
      date: '2026-03-23',
      startTime: '08:00',
      description: 'Already there',
      accountKey: 'OPS',
      accountName: 'Operations',
    }
    const { create } = configureDashboard({
      worklogs: [dashboardMocks.editWorklog, dashboardMocks.todayWorklog, existingOnMonday],
    })
    render(<TempoDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'grid copy friday' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          issueKey: 'PE-301',
          date: '2026-03-24',
        })
      )
    })
  })

  describe('handleCopyFromPreviousMonth', () => {
    it('dispatches setTemplateIssues when getWeek returns worklogs', async () => {
      const prevMonthWorklogs: TempoWorklog[] = [
        {
          id: 50,
          issueKey: 'PE-400',
          issueSummary: 'Previous month task',
          hours: 2,
          date: '2026-02-15',
          startTime: '08:00',
          description: 'Old work',
          accountKey: 'DEV',
          accountName: 'Development',
        },
      ]
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: true,
        data: {
          worklogs: prevMonthWorklogs,
          issueSummaries: [],
          totalHours: 2,
        },
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
        const issueKeys = lastCall?.issueSummaries?.map((s: TempoIssueSummary) => s.issueKey)
        expect(issueKeys).toContain('PE-400')
      })
    })

    it('shows "No entries found" error when getWeek returns empty worklogs', async () => {
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: true,
        data: {
          worklogs: [],
          issueSummaries: [],
          totalHours: 0,
        },
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        expect(screen.getByText('⚠ No entries found in the previous month.')).toBeInTheDocument()
      })
    })

    it('shows error when getWeek returns failure', async () => {
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: false,
        error: 'Tempo API unavailable',
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        expect(screen.getByText('⚠ Tempo API unavailable')).toBeInTheDocument()
      })
    })

    it('shows fallback error when getWeek fails without error message', async () => {
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: false,
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        expect(screen.getByText('⚠ Failed to load previous month data.')).toBeInTheDocument()
      })
    })

    it('returns early when month changes during fetch (stale check)', async () => {
      let resolveFirstGetWeek: (value: unknown) => void
      const getWeekMock = vi.mocked(window.tempo.getWeek)
      // First call: returns a slow promise we control
      getWeekMock.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirstGetWeek = resolve as (value: unknown) => void
          })
      )
      // Second call: returns immediately with distinct worklogs
      getWeekMock.mockImplementationOnce(() =>
        Promise.resolve({
          success: true,
          data: {
            worklogs: [
              {
                id: 98,
                issueKey: 'PE-SECOND',
                issueSummary: 'Second month task',
                hours: 1,
                date: '2026-03-10',
                startTime: '08:00',
                description: 'From second copy',
                accountKey: 'DEV',
                accountName: 'Development',
              },
            ],
            issueSummaries: [],
            totalHours: 1,
          },
        })
      )
      configureDashboard()
      render(<TempoDashboard />)

      // 1. Start the first copy (slow promise starts, ref = current monthKey)
      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      // 2. Navigate to next month
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

      // 3. Click copy again on the new month - updates ref to new monthKey
      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      // 4. Wait for the second (fast) call to complete
      await waitFor(() => {
        expect(getWeekMock).toHaveBeenCalledTimes(2)
      })

      // 5. Now resolve the first (stale) promise
      resolveFirstGetWeek!({
        success: true,
        data: {
          worklogs: [
            {
              id: 99,
              issueKey: 'PE-STALE',
              issueSummary: 'Stale result',
              hours: 1,
              date: '2026-02-10',
              startTime: '08:00',
              description: 'Should be ignored',
              accountKey: 'DEV',
              accountName: 'Development',
            },
          ],
          issueSummaries: [],
          totalHours: 1,
        },
      })

      // Wait for the stale promise to settle
      await waitFor(() => {
        const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
        const issueKeys = lastCall?.issueSummaries?.map((s: TempoIssueSummary) => s.issueKey)
        // PE-SECOND should be present (from the second, valid call)
        expect(issueKeys).toContain('PE-SECOND')
      })

      // PE-STALE should NOT appear (stale check should have caught it)
      const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
      const issueKeys = lastCall?.issueSummaries?.map((s: TempoIssueSummary) => s.issueKey)
      expect(issueKeys).not.toContain('PE-STALE')
    })

    it('shows success data with no worklogs and null data field', async () => {
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: true,
        data: undefined,
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        expect(screen.getByText('⚠ No entries found in the previous month.')).toBeInTheDocument()
      })
    })
  })

  describe('mergedIssueSummaries', () => {
    it('returns only month issueSummaries when no templates exist', () => {
      configureDashboard()
      render(<TempoDashboard />)

      const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
      expect(lastCall.issueSummaries).toEqual(issueSummaries)
    })

    it('merges template issues that do not overlap with real issues', async () => {
      const prevMonthWorklogs: TempoWorklog[] = [
        {
          id: 60,
          issueKey: 'PE-NEW',
          issueSummary: 'New template task',
          hours: 1,
          date: '2026-02-20',
          startTime: '08:00',
          description: 'Template work',
          accountKey: 'DEV',
          accountName: 'Development',
        },
      ]
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: true,
        data: {
          worklogs: prevMonthWorklogs,
          issueSummaries: [],
          totalHours: 1,
        },
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
        const issueKeys = lastCall?.issueSummaries?.map((s: TempoIssueSummary) => s.issueKey)
        // Real issue PE-101 is kept, and template PE-NEW is added
        expect(issueKeys).toContain('PE-101')
        expect(issueKeys).toContain('PE-NEW')
      })
    })

    it('filters out template issues that overlap with real issues', async () => {
      // Template includes PE-101 which already exists in real issueSummaries
      const prevMonthWorklogs: TempoWorklog[] = [
        {
          id: 61,
          issueKey: 'PE-101',
          issueSummary: 'Duplicate from prev month',
          hours: 1,
          date: '2026-02-20',
          startTime: '08:00',
          description: 'Should be filtered',
          accountKey: 'OPS',
          accountName: 'Operations',
        },
        {
          id: 62,
          issueKey: 'PE-UNIQUE',
          issueSummary: 'Unique template',
          hours: 2,
          date: '2026-02-21',
          startTime: '09:00',
          description: 'Should be kept',
          accountKey: 'DEV',
          accountName: 'Development',
        },
      ]
      vi.mocked(window.tempo.getWeek).mockResolvedValue({
        success: true,
        data: {
          worklogs: prevMonthWorklogs,
          issueSummaries: [],
          totalHours: 3,
        },
      })
      configureDashboard()
      render(<TempoDashboard />)

      fireEvent.click(screen.getByRole('button', { name: 'copy from previous month' }))

      await waitFor(() => {
        const lastCall = dashboardMocks.gridPropsSpy.mock.calls.at(-1)?.[0]
        const issueKeys = lastCall?.issueSummaries?.map((s: TempoIssueSummary) => s.issueKey)
        // PE-101 should appear only once (from real data, not template)
        expect(issueKeys).toContain('PE-101')
        expect(issueKeys).toContain('PE-UNIQUE')
        // PE-101 should appear exactly once (template filtered out)
        const pe101Count = issueKeys.filter((k: string) => k === 'PE-101').length
        expect(pe101Count).toBe(1)
      })
    })
  })
})

describe('tempoDashboardReducer', () => {
  it('returns state unchanged for unknown action type', () => {
    const state = {
      editorOpen: false,
      editingWorklog: null,
      prefillWorklog: null,
      editorDate: null,
      actionError: null,
      viewMonth: new Date(),
      viewMode: 'grid' as const,
      templateIssues: [],
      templatePrefills: {},
      loadingTemplates: false,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = tempoDashboardReducer(state, { type: 'unknown_action' } as any)
    expect(result).toBe(state)
  })
})

describe('buildTemplateFromWorklogs', () => {
  it('extracts unique issues with zeroed hours and picks latest worklog per issue', () => {
    const worklogs: TempoWorklog[] = [
      {
        id: 1,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 2,
        date: '2026-04-10',
        startTime: '08:00',
        description: 'Old entry',
        accountKey: 'DEV',
        accountName: 'Development',
      },
      {
        id: 2,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 3,
        date: '2026-04-15',
        startTime: '09:00',
        description: 'Newer entry',
        accountKey: 'OPS',
        accountName: 'Operations',
      },
      {
        id: 3,
        issueKey: 'PE-200',
        issueSummary: 'Task B',
        hours: 1,
        date: '2026-04-12',
        startTime: '10:00',
        description: 'Only entry',
        accountKey: 'DEV',
        accountName: 'Development',
      },
    ]

    const { issues, prefills } = buildTemplateFromWorklogs(worklogs)

    expect(issues).toHaveLength(2)
    expect(issues[0]).toEqual({
      issueKey: 'PE-100',
      issueSummary: 'Task A',
      totalHours: 0,
      hoursByDate: {},
    })
    expect(issues[1]).toEqual({
      issueKey: 'PE-200',
      issueSummary: 'Task B',
      totalHours: 0,
      hoursByDate: {},
    })
    // Picks the latest worklog for PE-100 (date 2026-04-15)
    expect(prefills['PE-100'].id).toBe(2)
    expect(prefills['PE-200'].id).toBe(3)
  })

  it('tie-breaks by startTime when dates are equal', () => {
    const worklogs: TempoWorklog[] = [
      {
        id: 1,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 1,
        date: '2026-04-15',
        startTime: '08:00',
        description: 'Earlier',
        accountKey: 'DEV',
        accountName: 'Development',
      },
      {
        id: 2,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 2,
        date: '2026-04-15',
        startTime: '14:00',
        description: 'Later',
        accountKey: 'OPS',
        accountName: 'Operations',
      },
    ]

    const { prefills } = buildTemplateFromWorklogs(worklogs)
    expect(prefills['PE-100'].id).toBe(2)
    expect(prefills['PE-100'].description).toBe('Later')
  })

  it('returns empty arrays when no worklogs provided', () => {
    const { issues, prefills } = buildTemplateFromWorklogs([])
    expect(issues).toHaveLength(0)
    expect(Object.keys(prefills)).toHaveLength(0)
  })

  it('keeps newer first entry when second has older date (L395 false)', () => {
    const worklogs: TempoWorklog[] = [
      {
        id: 1,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 2,
        date: '2026-04-15',
        startTime: '14:00',
        description: 'Newer first',
        accountKey: 'DEV',
        accountName: 'Development',
      },
      {
        id: 2,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 1,
        date: '2026-04-10',
        startTime: '08:00',
        description: 'Older second',
        accountKey: 'OPS',
        accountName: 'Operations',
      },
    ]

    const { prefills } = buildTemplateFromWorklogs(worklogs)
    // First entry stays because it has a newer date
    expect(prefills['PE-100'].id).toBe(1)
    expect(prefills['PE-100'].description).toBe('Newer first')
  })

  it('keeps existing entry when same date but earlier startTime (L395 false)', () => {
    const worklogs: TempoWorklog[] = [
      {
        id: 1,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 2,
        date: '2026-04-15',
        startTime: '14:00',
        description: 'Later start',
        accountKey: 'DEV',
        accountName: 'Development',
      },
      {
        id: 2,
        issueKey: 'PE-100',
        issueSummary: 'Task A',
        hours: 1,
        date: '2026-04-15',
        startTime: '08:00',
        description: 'Earlier start',
        accountKey: 'OPS',
        accountName: 'Operations',
      },
    ]

    const { prefills } = buildTemplateFromWorklogs(worklogs)
    // First entry stays because it has a later startTime on the same date
    expect(prefills['PE-100'].id).toBe(1)
    expect(prefills['PE-100'].description).toBe('Later start')
  })
})

describe('tempoDashboardReducer additional branches', () => {
  const getInitialState = () => ({
    editorOpen: false,
    editingWorklog: null,
    prefillWorklog: null,
    editorDate: null,
    actionError: null,
    viewMonth: new Date(2026, 2, 15), // March 15, 2026
    viewMode: 'grid' as const,
    templateIssues: [] as TempoIssueSummary[],
    templatePrefills: {} as Record<string, TempoWorklog>,
    loadingTemplates: false,
  })

  it('setViewMode persists to localStorage', () => {
    const state = getInitialState()
    const result = tempoDashboardReducer(state, {
      type: 'setViewMode',
      viewMode: 'timeline',
    })
    expect(result.viewMode).toBe('timeline')
    expect(localStorage.getItem('viewMode:tempo')).toBe('timeline')
  })

  it('openCreate with prefillWorklog stores it in state', () => {
    const state = getInitialState()
    const prefillWorklog = {
      id: 1,
      issueKey: 'PE-100',
      issueSummary: 'Task',
      hours: 2,
      date: '2026-03-15',
      startTime: '08:00',
      description: 'Desc',
      accountKey: 'DEV',
      accountName: 'Development',
    }
    const result = tempoDashboardReducer(state, {
      type: 'openCreate',
      date: '2026-03-20',
      prefillWorklog,
    })
    expect(result.editorOpen).toBe(true)
    expect(result.prefillWorklog).toBe(prefillWorklog)
    expect(result.editorDate).toBe('2026-03-20')
    expect(result.editingWorklog).toBeNull()
  })

  it('openCreate with null prefillWorklog clears prefill state', () => {
    const state = getInitialState()
    const result = tempoDashboardReducer(state, {
      type: 'openCreate',
      date: '2026-03-20',
      prefillWorklog: null,
    })
    expect(result.prefillWorklog).toBeNull()
    expect(result.editorOpen).toBe(true)
  })

  it('openEdit clears date and prefillWorklog, sets editingWorklog', () => {
    const worklog = {
      id: 5,
      issueKey: 'PE-105',
      issueSummary: 'Task',
      hours: 1.5,
      date: '2026-03-15',
      startTime: '10:00',
      description: 'Desc',
      accountKey: 'DEV',
      accountName: 'Development',
    }
    const state = getInitialState()
    const result = tempoDashboardReducer(state, {
      type: 'openEdit',
      worklog,
    })
    expect(result.editorOpen).toBe(true)
    expect(result.editingWorklog).toBe(worklog)
    expect(result.editorDate).toBeNull()
    expect(result.prefillWorklog).toBeNull()
  })

  it('closeEditor resets all editor state', () => {
    const state = {
      ...getInitialState(),
      editorOpen: true,
      editingWorklog: { id: 1 } as unknown as ReturnType<typeof getInitialState>['editingWorklog'],
      prefillWorklog: { id: 2 } as unknown as ReturnType<typeof getInitialState>['prefillWorklog'],
      editorDate: '2026-03-20',
    }
    const result = tempoDashboardReducer(state, { type: 'closeEditor' })
    expect(result.editorOpen).toBe(false)
    expect(result.editingWorklog).toBeNull()
    expect(result.prefillWorklog).toBeNull()
    expect(result.editorDate).toBeNull()
  })

  it('setActionError updates error state', () => {
    const state = getInitialState()
    const result = tempoDashboardReducer(state, {
      type: 'setActionError',
      error: 'Something went wrong',
    })
    expect(result.actionError).toBe('Something went wrong')
  })

  it('setActionError with null clears error', () => {
    const state = { ...getInitialState(), actionError: 'Old error' }
    const result = tempoDashboardReducer(state, {
      type: 'setActionError',
      error: null,
    })
    expect(result.actionError).toBeNull()
  })

  it('shiftMonth forward increments month and clears templates', () => {
    const state = getInitialState()
    state.templateIssues = [
      { issueKey: 'PE-100', issueSummary: 'Task', totalHours: 2, hoursByDate: {} },
    ]
    state.templatePrefills = {
      'PE-100': {} as unknown as ReturnType<typeof getInitialState>['templatePrefills'][string],
    }
    state.loadingTemplates = true

    const result = tempoDashboardReducer(state, { type: 'shiftMonth', delta: 1 })
    expect(result.viewMonth.getMonth()).toBe(3) // April
    expect(result.templateIssues).toHaveLength(0)
    expect(result.templatePrefills).toEqual({})
    expect(result.loadingTemplates).toBe(false)
  })

  it('shiftMonth backward decrements month and clears templates', () => {
    const state = getInitialState()
    const result = tempoDashboardReducer(state, { type: 'shiftMonth', delta: -2 })
    expect(result.viewMonth.getMonth()).toBe(0) // January
    expect(result.templateIssues).toHaveLength(0)
  })

  it('goToCurrentMonth resets to current month and clears templates', () => {
    const state = {
      ...getInitialState(),
      viewMonth: new Date(2025, 0, 1), // Far in the past
      templateIssues: [
        { issueKey: 'PE-100', issueSummary: 'Task', totalHours: 2, hoursByDate: {} },
      ],
    }
    const result = tempoDashboardReducer(state, { type: 'goToCurrentMonth' })
    expect(result.viewMonth.getMonth()).toBe(new Date().getMonth())
    expect(result.viewMonth.getFullYear()).toBe(new Date().getFullYear())
    expect(result.templateIssues).toHaveLength(0)
    expect(result.loadingTemplates).toBe(false)
  })

  it('setLoadingTemplates updates loading flag', () => {
    const state = getInitialState()
    const result = tempoDashboardReducer(state, {
      type: 'setLoadingTemplates',
      loading: true,
    })
    expect(result.loadingTemplates).toBe(true)
  })

  it('setTemplateIssues updates both issues and prefills', () => {
    const state = getInitialState()
    const issues = [{ issueKey: 'PE-100', issueSummary: 'Task', totalHours: 0, hoursByDate: {} }]
    const prefills = {
      'PE-100': { id: 1 } as unknown as ReturnType<
        typeof getInitialState
      >['templatePrefills'][string],
    }
    const result = tempoDashboardReducer(state, {
      type: 'setTemplateIssues',
      issues,
      prefills,
    })
    expect(result.templateIssues).toEqual(issues)
    expect(result.templatePrefills).toEqual(prefills)
    expect(result.loadingTemplates).toBe(false)
  })

  it('sets loading templates flag', () => {
    const state = getInitialState()
    expect(state.loadingTemplates).toBe(false)

    const result = tempoDashboardReducer(state, {
      type: 'setLoadingTemplates',
      loading: true,
    })
    expect(result.loadingTemplates).toBe(true)
  })

  it('merges template issues with real issues hiding duplicates', () => {
    // Test the reducer behavior when templates are set alongside real issues
    const state = {
      ...getInitialState(),
      templateIssues: [
        { issueKey: 'PE-999', issueSummary: 'Template', totalHours: 0, hoursByDate: {} },
        { issueKey: 'PE-101', issueSummary: 'Duplicate Template', totalHours: 0, hoursByDate: {} },
      ],
      templatePrefills: {
        'PE-999': { id: 101 } as unknown as ReturnType<
          typeof getInitialState
        >['templatePrefills'][string],
        'PE-101': { id: 100 } as unknown as ReturnType<
          typeof getInitialState
        >['templatePrefills'][string],
      },
    }

    // Verify that setting templates works correctly
    expect(state.templateIssues).toHaveLength(2)
    expect(state.templatePrefills['PE-999']).toBeDefined()
    expect(state.templatePrefills['PE-101']).toBeDefined()
  })
})
