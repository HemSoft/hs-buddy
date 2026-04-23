import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { JobDetailPanel } from './JobDetailPanel'

const mockCreateRun = vi.fn()
const mockRemove = vi.fn()
const mockConfirm = vi.fn()
const mockFormatDistanceToNow = vi.fn()

let mockJob: unknown
let mockRuns: unknown
let mockConfirmDialog: Record<string, unknown> | null

vi.mock('../../hooks/useConvex', () => ({
  useJob: () => mockJob,
  useJobRuns: () => mockRuns,
  useJobMutations: () => ({ remove: mockRemove }),
  useRunMutations: () => ({ create: mockCreateRun }),
}))

vi.mock('../../utils/dateUtils', async () => {
  const actual =
    await vi.importActual<typeof import('../../utils/dateUtils')>('../../utils/dateUtils')
  return {
    ...actual,
    formatDistanceToNow: (value: number) => mockFormatDistanceToNow(value),
  }
})

vi.mock('./job-list/jobRowUtils', () => ({
  getWorkerIcon: (workerType: string) => <span data-testid={`worker-icon-${workerType}`} />,
}))

vi.mock('./JobEditor', () => ({
  JobEditor: ({ jobId, duplicateFrom }: { jobId?: string; duplicateFrom?: { name: string } }) => (
    <div data-testid="job-editor">
      {jobId ? `editing:${jobId}` : `duplicating:${duplicateFrom?.name ?? 'none'}`}
    </div>
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

function createExecJob() {
  return {
    _id: 'job-1',
    name: 'Nightly Backup',
    description: 'Backs up everything',
    workerType: 'exec',
    createdAt: 1,
    updatedAt: 2,
    config: {
      command: 'backup.sh',
      shell: 'bash',
      cwd: '/srv/app',
      timeout: 15000,
    },
  }
}

describe('JobDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatDistanceToNow.mockReturnValue('2 hours ago')
    mockConfirm.mockResolvedValue(true)
    mockConfirmDialog = {
      message: 'Confirm deletion',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }
    mockRuns = [
      {
        _id: 'run-1',
        status: 'completed',
        triggeredBy: 'manual',
        startedAt: 3,
        duration: 500,
      },
      {
        _id: 'run-2',
        status: 'failed',
        triggeredBy: 'schedule',
        startedAt: 4,
        duration: 2500,
      },
    ]
    mockJob = createExecJob()
  })

  it('renders loading and not-found states', () => {
    mockJob = undefined
    const { rerender } = render(<JobDetailPanel jobId="job-1" />)
    expect(screen.getByText('Loading job...')).toBeInTheDocument()

    mockJob = null
    rerender(<JobDetailPanel jobId="job-1" />)
    expect(screen.getByText('Job not found.')).toBeInTheDocument()
  })

  it('renders exec job details, recent runs, and action handlers', async () => {
    render(<JobDetailPanel jobId="job-1" />)

    expect(screen.getByRole('heading', { name: 'Nightly Backup' })).toBeInTheDocument()
    expect(screen.getByTestId('worker-icon-exec')).toBeInTheDocument()
    expect(screen.getByText('Shell Command')).toBeInTheDocument()
    expect(screen.getByText('Backs up everything')).toBeInTheDocument()
    expect(screen.getByText('backup.sh')).toBeInTheDocument()
    expect(screen.getByText('bash')).toBeInTheDocument()
    expect(screen.getByText('/srv/app')).toBeInTheDocument()
    expect(screen.getByText('15s')).toBeInTheDocument()
    expect(screen.getByText('500ms')).toBeInTheDocument()
    expect(screen.getByText('2.5s')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Confirm deletion')

    fireEvent.click(screen.getByTitle('Run Now'))
    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByTitle('Delete'))

    expect(screen.getByTestId('job-editor')).toHaveTextContent('editing:job-1')

    await waitFor(() => {
      expect(mockCreateRun).toHaveBeenCalledWith({ jobId: 'job-1', triggeredBy: 'manual' })
      expect(mockConfirm).toHaveBeenCalledWith({
        message: 'Delete job "Nightly Backup"?',
        description: 'This will also delete all associated schedules.',
        confirmLabel: 'Delete',
        variant: 'danger',
      })
      expect(mockRemove).toHaveBeenCalledWith({ id: 'job-1' })
    })
  })

  it('renders AI and skill-specific configuration details', () => {
    mockJob = {
      _id: 'job-ai',
      name: 'Copilot Review',
      workerType: 'ai',
      createdAt: 1,
      updatedAt: 2,
      config: {
        prompt: 'Review code',
        model: 'gpt-5',
        repoOwner: 'relias-engineering',
        repoName: 'hs-buddy',
      },
    }
    mockRuns = []

    const { rerender } = render(<JobDetailPanel jobId="job-ai" />)
    expect(screen.getByText('AI Prompt')).toBeInTheDocument()
    expect(screen.getByText('Review code')).toBeInTheDocument()
    expect(screen.getByText('gpt-5')).toBeInTheDocument()
    expect(screen.getByText('relias-engineering/hs-buddy')).toBeInTheDocument()
    expect(screen.getByText('No runs yet. Click "Run" to execute this job.')).toBeInTheDocument()

    mockJob = {
      _id: 'job-skill',
      name: 'Skill Sync',
      workerType: 'skill',
      createdAt: 1,
      updatedAt: 2,
      config: {
        skillName: 'github',
        action: 'sync',
        params: { repo: 'hs-buddy' },
      },
    }

    rerender(<JobDetailPanel jobId="job-skill" />)
    expect(screen.getByText('Claude Skill')).toBeInTheDocument()
    expect(screen.getByText('github')).toBeInTheDocument()
    expect(screen.getByText('sync')).toBeInTheDocument()
    expect(screen.getByText(/"repo": "hs-buddy"/)).toBeInTheDocument()
  })

  it('opens the duplicate editor with the current job as the source', () => {
    render(<JobDetailPanel jobId="job-1" />)

    fireEvent.click(screen.getByTitle('Duplicate'))

    expect(screen.getByTestId('job-editor')).toHaveTextContent('duplicating:Nightly Backup')
  })
})
