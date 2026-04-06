import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RunCard, type RunWithJob } from './RunCard'
import { formatOutput } from './runCardUtils'

const NOW = Date.UTC(2026, 3, 6, 12, 0, 0)

function makeRun(overrides: Partial<RunWithJob> = {}): RunWithJob {
  return {
    _id: 'run-1',
    _creationTime: NOW - 60_000,
    jobId: 'job-1',
    status: 'completed',
    triggeredBy: 'manual',
    startedAt: NOW - 60_000,
    duration: 1_500,
    job: { _id: 'job-1', name: 'Test Job', workerType: 'exec' },
    ...overrides,
  }
}

describe('formatOutput', () => {
  it('returns an empty string for nullish values', () => {
    expect(formatOutput(null)).toBe('')
    expect(formatOutput(undefined)).toBe('')
  })

  it('returns strings unchanged', () => {
    expect(formatOutput('hello world')).toBe('hello world')
    expect(formatOutput('')).toBe('')
  })

  it('pretty prints JSON-serializable values', () => {
    expect(formatOutput({ key: 'value', count: 42 })).toBe('{\n  "key": "value",\n  "count": 42\n}')
    expect(formatOutput([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]')
    expect(formatOutput(42)).toBe('42')
  })

  it('falls back to String(output) when JSON serialization fails', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(formatOutput(circular)).toBe('[object Object]')
  })
})

describe('RunCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the job name, trigger metadata, duration, and schedule badge', () => {
    render(
      <RunCard
        run={makeRun({
          triggeredBy: 'schedule',
          schedule: { _id: 'schedule-1', name: 'Nightly' },
        })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Test Job')).toBeInTheDocument()
    expect(screen.getByText('via Nightly')).toBeInTheDocument()
    expect(screen.getByText('1 minute ago')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders Deleted Job when the linked job is missing', () => {
    render(
      <RunCard
        run={makeRun({ job: undefined })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Deleted Job')).toBeInTheDocument()
  })

  it('calls onToggle when the main row is clicked and details are available', () => {
    const onToggle = vi.fn()

    render(
      <RunCard
        run={makeRun({ output: 'Task completed successfully' })}
        isExpanded={false}
        onToggle={onToggle}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /test job/i }))

    expect(onToggle).toHaveBeenCalledWith('run-1')
  })

  it('disables the main row button when no details are available', () => {
    render(
      <RunCard
        run={makeRun({
          duration: undefined,
          output: undefined,
          error: undefined,
          input: undefined,
        })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /test job/i })).toBeDisabled()
  })

  it('shows running state and lets pending or running jobs be cancelled', () => {
    const onCancel = vi.fn()

    render(
      <RunCard
        run={makeRun({
          status: 'running',
          triggeredBy: 'api',
          output: 'Still working',
        })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Running...')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Cancel Run'))

    expect(onCancel).toHaveBeenCalledWith('run-1', expect.any(Object))
  })

  it('omits the cancel button for finished runs', () => {
    render(
      <RunCard
        run={makeRun({ status: 'failed', error: 'Something went wrong' })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByTitle('Cancel Run')).not.toBeInTheDocument()
  })

  it('renders expanded error, output, input, and completion details', () => {
    render(
      <RunCard
        run={makeRun({
          status: 'failed',
          error: 'Something went wrong',
          output: { ok: false },
          input: { branch: 'main' },
          completedAt: NOW,
        })}
        isExpanded
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === formatOutput({ ok: false }))
    ).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === formatOutput({ branch: 'main' }))
    ).toBeInTheDocument()
    expect(screen.getByText(/Started:/)).toBeInTheDocument()
    expect(screen.getByText(/Completed:/)).toBeInTheDocument()
  })

  it('keeps details hidden while collapsed even if detail content exists', () => {
    render(
      <RunCard
        run={makeRun({
          error: 'Something went wrong',
          output: 'Task completed successfully',
          input: { branch: 'main' },
        })}
        isExpanded={false}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByText('Error')).not.toBeInTheDocument()
    expect(screen.queryByText('Output')).not.toBeInTheDocument()
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })
})
