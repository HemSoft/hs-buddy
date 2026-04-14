import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RunList } from './RunList'

const mockCancel = vi.fn().mockResolvedValue(undefined)
const mockCleanup = vi.fn().mockResolvedValue({ deleted: 3 })
const mockConfirm = vi.fn()

const mockUseRecentRuns = vi.fn()
const mockUseViewMode = vi.fn()

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({
    confirm: mockConfirm,
    confirmDialog: null,
  }),
}))

vi.mock('../../hooks/useViewMode', () => ({
  useViewMode: (...args: unknown[]) => mockUseViewMode(...args),
}))

const mockRuns = [
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

vi.mock('../../hooks/useConvex', () => ({
  useRecentRuns: (...args: unknown[]) => mockUseRecentRuns(...args),
  useRunMutations: () => ({
    cancel: mockCancel,
    cleanup: mockCleanup,
  }),
}))

describe('RunList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRecentRuns.mockReturnValue(mockRuns)
    mockUseViewMode.mockReturnValue(['card' as const, vi.fn()])
  })

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

  it('shows loading state when runs is undefined', () => {
    mockUseRecentRuns.mockReturnValue(undefined)
    render(<RunList />)
    expect(screen.getByText('Loading runs...')).toBeTruthy()
  })

  it('shows empty state when runs array is empty', () => {
    mockUseRecentRuns.mockReturnValue([])
    render(<RunList />)
    expect(screen.getByText('No Runs Yet')).toBeTruthy()
  })

  it('renders in list (table) view mode', () => {
    mockUseViewMode.mockReturnValue(['list' as const, vi.fn()])
    const { container } = render(<RunList />)
    expect(container.querySelector('table')).toBeTruthy()
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByText('Duration')).toBeTruthy()
  })

  it('shows schedule badge for scheduled runs in table view', () => {
    mockUseViewMode.mockReturnValue(['list' as const, vi.fn()])
    render(<RunList />)
    expect(screen.getByText('via Every 6 hours')).toBeTruthy()
  })

  it('calls cleanup on button click when confirmed', async () => {
    mockConfirm.mockResolvedValue(true)
    render(<RunList />)
    fireEvent.click(screen.getByTitle('Cleanup old runs (7+ days)'))
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
    })
    await waitFor(() => {
      expect(mockCleanup).toHaveBeenCalledWith({ olderThanDays: 7 })
    })
  })

  it('does not call cleanup when not confirmed', async () => {
    mockConfirm.mockResolvedValue(false)
    render(<RunList />)
    fireEvent.click(screen.getByTitle('Cleanup old runs (7+ days)'))
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled()
    })
    expect(mockCleanup).not.toHaveBeenCalled()
  })

  it('shows "Deleted Job" when run has no job', () => {
    mockUseViewMode.mockReturnValue(['list' as const, vi.fn()])
    mockUseRecentRuns.mockReturnValue([{ ...mockRuns[0], job: null }])
    render(<RunList />)
    expect(screen.getByText('Deleted Job')).toBeTruthy()
  })
})
