import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ScheduleEditor } from './ScheduleEditor'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockIncrement = vi.fn()

let mockJobs:
  | Array<{ _id: string; name: string; workerType: string; description?: string }>
  | undefined
let mockSchedule:
  | {
      _id: string
      name: string
      description?: string
      jobId: string
      cron: string
      enabled: boolean
      missedPolicy?: string
    }
  | null
  | undefined

vi.mock('../../hooks/useConvex', () => ({
  useJobs: () => mockJobs,
  useSchedule: () => mockSchedule,
  useScheduleMutations: () => ({ create: mockCreate, update: mockUpdate }),
  useBuddyStatsMutations: () => ({ increment: mockIncrement }),
}))

vi.mock('./CronBuilder', () => ({
  CronBuilder: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <div>
      <label htmlFor="mock-cron">Cron Value</label>
      <input id="mock-cron" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  ),
}))

describe('ScheduleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockIncrement.mockResolvedValue(undefined)
    mockJobs = [
      {
        _id: 'job-1',
        name: 'Review Queue',
        workerType: 'ai',
        description: 'Checks pull requests',
      },
      {
        _id: 'job-2',
        name: 'Shell Cleanup',
        workerType: 'exec',
      },
    ]
    mockSchedule = null
  })

  it('renders create mode and validates required fields', async () => {
    render(<ScheduleEditor onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Create Schedule' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('0 9 * * *')).toBeInTheDocument()
    expect(screen.getByLabelText('Job')).toHaveValue('job-1')
    expect(screen.getByText('Checks pull requests')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }))

    expect(await screen.findByText('Schedule name is required')).toBeInTheDocument()
  })

  it('shows loading and empty job states before save', () => {
    mockJobs = undefined
    const { rerender } = render(<ScheduleEditor onClose={vi.fn()} />)
    expect(screen.getByText('Loading jobs...')).toBeInTheDocument()

    mockJobs = []
    rerender(<ScheduleEditor onClose={vi.fn()} />)
    expect(screen.getByText('No jobs available. Create a job first.')).toBeInTheDocument()
  })

  it('creates a new schedule and records the buddy stat', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<ScheduleEditor onClose={onClose} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Morning Review ' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '  Checks the queue  ' },
    })
    fireEvent.change(screen.getByLabelText('Cron Value'), { target: { value: '15 10 * * *' } })
    fireEvent.change(screen.getByLabelText('When Missed'), { target: { value: 'last' } })
    fireEvent.click(screen.getByLabelText('Enabled'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Morning Review',
        description: 'Checks the queue',
        jobId: 'job-1',
        cron: '15 10 * * *',
        enabled: false,
        missedPolicy: 'last',
      })
      expect(mockIncrement).toHaveBeenCalledWith({ field: 'schedulesCreated' })
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders editing mode, waits for the existing schedule, and updates it', async () => {
    const onClose = vi.fn()
    mockSchedule = undefined

    const { rerender } = render(<ScheduleEditor scheduleId="sched-1" onClose={onClose} />)
    expect(screen.getByText('Loading schedule...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update Schedule' })).toBeDisabled()

    mockSchedule = {
      _id: 'sched-1',
      name: 'Existing Schedule',
      description: 'Original description',
      jobId: 'job-2',
      cron: '0 6 * * *',
      enabled: true,
      missedPolicy: 'unexpected',
    }

    rerender(<ScheduleEditor scheduleId="sched-1" onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Edit Schedule' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing Schedule')).toBeInTheDocument()
    expect(screen.getByLabelText('Job')).toHaveValue('job-2')
    expect(screen.getByLabelText('Job')).toBeDisabled()
    expect(screen.getByLabelText('When Missed')).toHaveValue('skip')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Schedule' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Schedule' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 'sched-1',
        name: 'Updated Schedule',
        description: 'Original description',
        cron: '0 6 * * *',
        enabled: true,
        missedPolicy: 'skip',
      })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('closes when clicking the overlay background', () => {
    const onClose = vi.fn()
    render(<ScheduleEditor onClose={onClose} />)

    fireEvent.click(screen.getByRole('presentation'))

    expect(onClose).toHaveBeenCalled()
  })

  it('shows validation error when no job is selected', async () => {
    mockJobs = []
    render(<ScheduleEditor onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Schedule' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }))

    expect(await screen.findByText('Please select a job')).toBeInTheDocument()
  })

  it('shows error when save operation fails', async () => {
    mockCreate.mockRejectedValue(new Error('Database unavailable'))
    render(<ScheduleEditor onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Schedule' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }))

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument()
  })

  it('changes the selected job via dropdown', () => {
    render(<ScheduleEditor onClose={vi.fn()} />)

    const jobSelect = screen.getByLabelText('Job')
    fireEvent.change(jobSelect, { target: { value: 'job-2' } })
    expect(jobSelect).toHaveValue('job-2')
  })
})
