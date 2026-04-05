import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunList } from './RunList'

// Track cancel/cleanup calls
const mockCancel = vi.fn()
const mockCleanup = vi.fn()

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({
    confirm: vi.fn(),
    confirmDialog: null,
  }),
}))

vi.mock('../../hooks/useViewMode', () => ({
  useViewMode: () => ['card' as const, vi.fn()],
}))

vi.mock('../../hooks/useConvex', () => ({
  useRecentRuns: () => [
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
  ],
  useRunMutations: () => ({
    cancel: mockCancel,
    cleanup: mockCleanup,
  }),
}))

describe('RunList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
