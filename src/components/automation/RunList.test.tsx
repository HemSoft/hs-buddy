import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RunList } from './RunList'

// --- Hoisted configurable mocks ---
const { mockUseRecentRuns, mockUseRunMutations, mockUseViewMode, mockUseConfirm } = vi.hoisted(
  () => ({
    mockUseRecentRuns: vi.fn(),
    mockUseRunMutations: vi.fn(),
    mockUseViewMode: vi.fn(),
    mockUseConfirm: vi.fn(),
  })
)

const mockCancel = vi.fn()
const mockCleanup = vi.fn()
const mockConfirmFn = vi.fn()

vi.mock('../../hooks/useConvex', () => ({
  useRecentRuns: (...args: unknown[]) => mockUseRecentRuns(...args),
  useRunMutations: () => mockUseRunMutations(),
}))

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => mockUseConfirm(),
}))

vi.mock('../../hooks/useViewMode', () => ({
  useViewMode: (...args: unknown[]) => mockUseViewMode(...args),
}))

// Mock child components to avoid deep dependency chains
vi.mock('./run-list/RunCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RunCard: ({ run, onCancel }: Record<string, any>) => (
    <div data-testid={`run-card-${run._id}`}>
      {run.job?.name}
      {run.status === 'running' && (
        <button
          data-testid={`cancel-${run._id}`}
          onClick={(e: React.MouseEvent) => onCancel(run._id, e)}
        >
          Cancel
        </button>
      )}
    </div>
  ),
}))

vi.mock('./run-list/RunFilterBar', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RunFilterBar: ({ statusFilter, onFilterChange }: Record<string, any>) => (
    <select
      data-testid="filter-bar"
      value={statusFilter}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFilterChange(e.target.value)}
    >
      <option value="all">All</option>
      <option value="running">Running</option>
      <option value="failed">Failed</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
      <option value="pending">Pending</option>
    </select>
  ),
}))

vi.mock('../shared/ViewModeToggle', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ViewModeToggle: ({ mode, onChange }: Record<string, any>) => (
    <button data-testid="view-toggle" onClick={() => onChange(mode === 'card' ? 'list' : 'card')}>
      {mode}
    </button>
  ),
}))

vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../shared/statusDisplay', () => ({
  getStatusIcon: (status: string) => <span data-testid={`status-icon-${status}`} />,
  getStatusLabel: (status: string) => status,
}))

vi.mock('./job-list/jobRowUtils', () => ({
  getWorkerIcon: (_type: string, _size: number) => <span data-testid="worker-icon" />,
}))

vi.mock('../../utils/dateUtils', () => ({
  formatDistanceToNow: () => '1h ago',
  formatDuration: (ms: number) => `${ms}ms`,
}))

// --- Fixtures ---
function makeRuns() {
  return [
    {
      _id: 'run-1',
      _creationTime: Date.now() - 3600000,
      jobId: 'job-1',
      status: 'completed',
      triggeredBy: 'manual',
      startedAt: Date.now() - 3600000,
      completedAt: Date.now() - 3595000,
      duration: 5000,
      job: { _id: 'job-1', name: 'Daily Sync', workerType: 'exec' },
    },
    {
      _id: 'run-2',
      _creationTime: Date.now() - 60000,
      jobId: 'job-2',
      status: 'running',
      triggeredBy: 'schedule',
      startedAt: Date.now() - 60000,
      job: { _id: 'job-2', name: 'PR Review', workerType: 'ai' },
      schedule: { _id: 'sched-1', name: 'Every 6 hours' },
    },
    {
      _id: 'run-3',
      _creationTime: Date.now() - 7200000,
      jobId: 'job-3',
      status: 'failed',
      triggeredBy: 'manual',
      startedAt: Date.now() - 7200000,
      completedAt: Date.now() - 7198800,
      duration: 1200,
      error: 'Timeout',
      job: { _id: 'job-3', name: 'Build Check', workerType: 'exec' },
    },
  ]
}

describe('RunList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRecentRuns.mockReturnValue(makeRuns())
    mockUseRunMutations.mockReturnValue({ cancel: mockCancel, cleanup: mockCleanup })
    mockUseViewMode.mockReturnValue(['card', vi.fn()])
    mockConfirmFn.mockResolvedValue(true)
    mockUseConfirm.mockReturnValue({ confirm: mockConfirmFn, confirmDialog: null })
  })

  // --- Original tests (restructured mocks, same assertions) ---

  it('renders the Runs heading', () => {
    render(<RunList />)
    expect(screen.getByText('Runs')).toBeTruthy()
  })

  it('renders run entries with job names', () => {
    render(<RunList />)
    expect(screen.getByText('Daily Sync')).toBeTruthy()
    expect(screen.getByText('PR Review')).toBeTruthy()
    expect(screen.getByText('Build Check')).toBeTruthy()
  })

  it('shows cleanup button', () => {
    render(<RunList />)
    expect(screen.getByTitle('Cleanup old runs (7+ days)')).toBeTruthy()
  })

  // --- New coverage tests ---

  it('shows loading spinner when runs are undefined', () => {
    mockUseRecentRuns.mockReturnValue(undefined)
    render(<RunList />)
    expect(screen.getByText('Loading runs...')).toBeTruthy()
  })

  it('shows empty state when runs array is empty', () => {
    mockUseRecentRuns.mockReturnValue([])
    render(<RunList />)
    expect(screen.getByText('No Runs Yet')).toBeTruthy()
    expect(
      screen.getByText('Runs will appear here when you execute jobs manually or via schedules.')
    ).toBeTruthy()
  })

  it('filters runs by status via RunFilterBar', () => {
    render(<RunList />)
    const filterBar = screen.getByTestId('filter-bar')
    fireEvent.change(filterBar, { target: { value: 'running' } })
    // Only the running run should remain
    expect(screen.getByTestId('run-card-run-2')).toBeTruthy()
    expect(screen.queryByTestId('run-card-run-1')).toBeNull()
    expect(screen.queryByTestId('run-card-run-3')).toBeNull()
  })

  it('shows "no results" message when filter matches nothing', () => {
    render(<RunList />)
    const filterBar = screen.getByTestId('filter-bar')
    // Filter to a status with no matching runs in our fixture
    fireEvent.change(filterBar, { target: { value: 'cancelled' } })
    expect(screen.getByText(/No.*cancelled.*runs found/)).toBeTruthy()
  })

  it('calls cancel on running run via card cancel button', () => {
    mockCancel.mockResolvedValue(undefined)
    render(<RunList />)
    const cancelBtn = screen.getByTestId('cancel-run-2')
    fireEvent.click(cancelBtn)
    expect(mockCancel).toHaveBeenCalledWith({ id: 'run-2' })
  })

  it('calls cleanup with confirm dialog on cleanup button click', async () => {
    mockConfirmFn.mockResolvedValue(true)
    mockCleanup.mockResolvedValue({ deleted: 3 })
    render(<RunList />)
    const cleanupBtn = screen.getByTitle('Cleanup old runs (7+ days)')
    fireEvent.click(cleanupBtn)
    expect(mockConfirmFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Delete all completed and failed runs older than 7 days?',
        confirmLabel: 'Delete',
        variant: 'danger',
      })
    )
    // Wait for the async confirm → cleanup chain
    await vi.waitFor(() => {
      expect(mockCleanup).toHaveBeenCalledWith({ olderThanDays: 7 })
    })
  })

  it('does not call cleanup when confirm is cancelled', async () => {
    mockConfirmFn.mockResolvedValue(false)
    render(<RunList />)
    fireEvent.click(screen.getByTitle('Cleanup old runs (7+ days)'))
    // Give the async chain time to settle
    await vi.waitFor(() => {
      expect(mockConfirmFn).toHaveBeenCalled()
    })
    expect(mockCleanup).not.toHaveBeenCalled()
  })

  it('renders list view mode with table when viewMode is list', () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    render(<RunList />)
    // List mode renders a table with column headers
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByText('Duration')).toBeTruthy()
    expect(screen.getByText('Triggered')).toBeTruthy()
  })

  it('renders view mode toggle and passes current mode', () => {
    render(<RunList />)
    const toggle = screen.getByTestId('view-toggle')
    expect(toggle.textContent).toBe('card')
  })

  it('shows "Deleted Job" in list view when run has no job', () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    mockUseRecentRuns.mockReturnValue([
      {
        _id: 'run-orphan',
        _creationTime: Date.now(),
        jobId: 'job-gone',
        status: 'completed',
        triggeredBy: 'manual',
        startedAt: Date.now(),
        duration: 100,
      },
    ])
    render(<RunList />)
    expect(screen.getByText('Deleted Job')).toBeTruthy()
  })

  it('shows schedule badge in list view for schedule-triggered runs', () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    render(<RunList />)
    expect(screen.getByText(/via Every 6 hours/)).toBeTruthy()
  })

  it('shows dash for duration when run has no duration in list view', () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    mockUseRecentRuns.mockReturnValue([
      {
        _id: 'run-no-dur',
        _creationTime: Date.now(),
        jobId: 'job-1',
        status: 'running',
        triggeredBy: 'manual',
        startedAt: Date.now(),
        job: { _id: 'job-1', name: 'Running Job', workerType: 'exec' },
      },
    ])
    render(<RunList />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('toggles expanded row on list view row click', () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    render(<RunList />)
    const rows = screen.getAllByRole('row')
    // First row is header, click data row
    fireEvent.click(rows[1])
    // Re-clicking should toggle (no crash)
    fireEvent.click(rows[1])
  })
})
