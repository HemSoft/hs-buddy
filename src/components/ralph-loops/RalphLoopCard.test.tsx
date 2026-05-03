import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RalphLoopCard } from './RalphLoopCard'
import type { RalphRunInfo } from '../../types/ralph'

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'run-1',
    config: { repoPath: 'D:\\github\\test-repo', scriptType: 'ralph', model: 'gpt-4' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: Date.now() - 120_000,
    updatedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: [],
    stats: {
      checks: 0,
      agentTurns: 0,
      reviews: 0,
      copilotPRs: 0,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: null,
      totalPremium: 0,
    },
    ...overrides,
  } as RalphRunInfo
}

describe('RalphLoopCard', () => {
  it('renders repo name from backslash path', () => {
    render(<RalphLoopCard run={makeRun()} onStop={vi.fn()} />)
    expect(screen.getByText('test-repo')).toBeInTheDocument()
  })

  it('renders repo name from forward-slash path', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/home/user/my-proj', scriptType: 'ralph' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('my-proj')).toBeInTheDocument()
  })

  it('shows branch when present', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph', branch: 'feature/x' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('feature/x')).toBeInTheDocument()
  })

  it('shows model when present', () => {
    render(<RalphLoopCard run={makeRun()} onStop={vi.fn()} />)
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
  })

  it('shows status label for running', () => {
    render(<RalphLoopCard run={makeRun({ status: 'running' })} onStop={vi.fn()} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows status label for completed', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'completed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows status label for failed', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'failed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows status label for pending', () => {
    render(<RalphLoopCard run={makeRun({ status: 'pending' })} onStop={vi.fn()} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows Stop button for running runs', () => {
    render(<RalphLoopCard run={makeRun({ status: 'running' })} onStop={vi.fn()} />)
    expect(screen.getByTitle('Stop loop')).toBeInTheDocument()
  })

  it('shows Stop button for pending runs', () => {
    render(<RalphLoopCard run={makeRun({ status: 'pending' })} onStop={vi.fn()} />)
    expect(screen.getByTitle('Stop loop')).toBeInTheDocument()
  })

  it('hides Stop button for completed runs', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'completed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByTitle('Stop loop')).not.toBeInTheDocument()
  })

  it('hides Stop button for failed runs', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'failed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByTitle('Stop loop')).not.toBeInTheDocument()
  })

  it('calls onStop with runId when Stop clicked', () => {
    const onStop = vi.fn()
    render(<RalphLoopCard run={makeRun({ runId: 'r-42' })} onStop={onStop} />)
    fireEvent.click(screen.getByTitle('Stop loop'))
    expect(onStop).toHaveBeenCalledWith('r-42')
  })

  it('shows progress bar when active with totalIterations > 0', () => {
    render(
      <RalphLoopCard run={makeRun({ currentIteration: 1, totalIterations: 5 })} onStop={vi.fn()} />
    )
    expect(screen.getByText('1/5')).toBeInTheDocument()
  })

  it('shows 0/N progress bar when currentIteration is 0 (bug fix)', () => {
    render(
      <RalphLoopCard run={makeRun({ currentIteration: 0, totalIterations: 3 })} onStop={vi.fn()} />
    )
    expect(screen.getByText('0/3')).toBeInTheDocument()
  })

  it('hides progress bar when totalIterations is null', () => {
    render(<RalphLoopCard run={makeRun({ totalIterations: null })} onStop={vi.fn()} />)
    expect(screen.queryByText(/\/3/)).not.toBeInTheDocument()
  })

  it('hides progress bar for completed runs', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'completed', completedAt: Date.now(), totalIterations: 3 })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByText('1/3')).not.toBeInTheDocument()
  })

  it('shows error message when run.error is set', () => {
    render(<RalphLoopCard run={makeRun({ error: 'Something went wrong' })} onStop={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('truncates long error messages to 60 chars', () => {
    const longError = 'A'.repeat(80)
    render(<RalphLoopCard run={makeRun({ error: longError })} onStop={vi.fn()} />)
    expect(screen.getByText('A'.repeat(60))).toBeInTheDocument()
  })

  it('shows phase label', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'pr-handoff' })} onStop={vi.fn()} />)
    expect(screen.getByText('PR Handoff')).toBeInTheDocument()
  })

  it('shows script type in meta', () => {
    render(<RalphLoopCard run={makeRun()} onStop={vi.fn()} />)
    expect(screen.getByText('ralph')).toBeInTheDocument()
  })

  it('applies correct CSS class for status', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ status: 'failed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(container.querySelector('.ralph-status-failed')).toBeInTheDocument()
  })

  it('applies ralph-status-completed CSS class for completed status', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ status: 'completed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(container.querySelector('.ralph-status-completed')).toBeInTheDocument()
  })

  it('applies ralph-status-pending CSS class for pending status', () => {
    const { container } = render(
      <RalphLoopCard run={makeRun({ status: 'pending' })} onStop={vi.fn()} />
    )
    expect(container.querySelector('.ralph-status-pending')).toBeInTheDocument()
  })

  it('applies ralph-status-running CSS class for running status', () => {
    const { container } = render(
      <RalphLoopCard run={makeRun({ status: 'running' })} onStop={vi.fn()} />
    )
    expect(container.querySelector('.ralph-status-running')).toBeInTheDocument()
  })

  it('applies ralph-status-cancelled CSS class for cancelled status', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ status: 'cancelled', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(container.querySelector('.ralph-status-cancelled')).toBeInTheDocument()
  })

  it('applies ralph-status-orphaned CSS class for orphaned status', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ status: 'orphaned', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(container.querySelector('.ralph-status-orphaned')).toBeInTheDocument()
  })

  it('shows Cancelled status label', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'cancelled', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('shows Orphaned status label', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'orphaned', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('Orphaned')).toBeInTheDocument()
  })

  it('hides progress bar when totalIterations is 0', () => {
    render(
      <RalphLoopCard run={makeRun({ currentIteration: 0, totalIterations: 0 })} onStop={vi.fn()} />
    )
    expect(screen.queryByText('0/0')).not.toBeInTheDocument()
  })

  it('shows phase label for initializing', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'initializing' })} onStop={vi.fn()} />)
    expect(screen.getByText('Initializing…')).toBeInTheDocument()
  })

  it('shows phase label for scanning', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'scanning' })} onStop={vi.fn()} />)
    expect(screen.getByText('Scanning')).toBeInTheDocument()
  })

  it('shows phase label for pr-resolving', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'pr-resolving' })} onStop={vi.fn()} />)
    expect(screen.getByText('PR Review Cycle')).toBeInTheDocument()
  })

  it('shows phase label for completed', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'completed' })} onStop={vi.fn()} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows phase label for failed', () => {
    render(<RalphLoopCard run={makeRun({ phase: 'failed' })} onStop={vi.fn()} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows script type ralph', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('ralph')).toBeInTheDocument()
  })

  it('shows script type ralph-pr', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph-pr' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('ralph-pr')).toBeInTheDocument()
  })

  it('shows script type ralph-issues', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph-issues' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('ralph-issues')).toBeInTheDocument()
  })

  it('formats duration for short runs (less than 1 hour)', () => {
    const now = Date.now()
    render(
      <RalphLoopCard
        run={makeRun({ startedAt: now - 30 * 60_000, completedAt: now })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('30m')).toBeInTheDocument()
  })

  it('formats duration for longer runs (more than 1 hour)', () => {
    const now = Date.now()
    render(
      <RalphLoopCard
        run={makeRun({ startedAt: now - 90 * 60_000, completedAt: now })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('1h 30m')).toBeInTheDocument()
  })

  it('formats duration using current time if completedAt is null', () => {
    const now = Date.now()
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ startedAt: now - 5 * 60_000, completedAt: null })}
        onStop={vi.fn()}
      />
    )
    // Should show something like 5m (with a small variance due to execution time)
    expect(container.textContent).toMatch(/\d+[mh]/)
  })

  it('hides Stop button for cancelled runs', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'cancelled', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByTitle('Stop loop')).not.toBeInTheDocument()
  })

  it('hides Stop button for orphaned runs', () => {
    render(
      <RalphLoopCard
        run={makeRun({ status: 'orphaned', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByTitle('Stop loop')).not.toBeInTheDocument()
  })

  it('shows error with title attribute for long truncated errors', () => {
    const longError = 'A'.repeat(80)
    const { container } = render(
      <RalphLoopCard run={makeRun({ error: longError })} onStop={vi.fn()} />
    )
    const errorSpan = container.querySelector('.ralph-card-error')
    expect(errorSpan).toHaveAttribute('title', longError)
  })

  it('does not show error when run.error is null', () => {
    render(<RalphLoopCard run={makeRun({ error: null })} onStop={vi.fn()} />)
    expect(screen.queryByTitle(/Something|error/)).not.toBeInTheDocument()
  })

  it('progress bar with 50% progress', () => {
    render(
      <RalphLoopCard
        run={makeRun({ currentIteration: 50, totalIterations: 100 })}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('50/100')).toBeInTheDocument()
  })

  it('progress bar with 100% progress', () => {
    render(
      <RalphLoopCard run={makeRun({ currentIteration: 3, totalIterations: 3 })} onStop={vi.fn()} />
    )
    expect(screen.getByText('3/3')).toBeInTheDocument()
  })

  it('shows repoName when path is empty string', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '', scriptType: 'ralph' } })}
        onStop={vi.fn()}
      />
    )
    // Empty path should show empty string as repo name in the card-repo-name span
    const repoName = container.querySelector('.ralph-card-repo-name')
    expect(repoName?.textContent).toBe('')
  })

  it('does not show model when model is not present', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()
  })

  it('does not show branch when branch is not present', () => {
    render(
      <RalphLoopCard
        run={makeRun({ config: { repoPath: '/test', scriptType: 'ralph' } })}
        onStop={vi.fn()}
      />
    )
    expect(screen.queryByText(/feature|branch/i)).not.toBeInTheDocument()
  })

  it('spinning icon on running status', () => {
    const { container } = render(
      <RalphLoopCard run={makeRun({ status: 'running' })} onStop={vi.fn()} />
    )
    const spinner = container.querySelector('.ralph-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('no spinning icon on completed status', () => {
    const { container } = render(
      <RalphLoopCard
        run={makeRun({ status: 'completed', completedAt: Date.now() })}
        onStop={vi.fn()}
      />
    )
    const spinner = container.querySelector('.ralph-spin')
    expect(spinner).not.toBeInTheDocument()
  })

  it('shows duration 0m for very recent runs', () => {
    const now = Date.now()
    render(<RalphLoopCard run={makeRun({ startedAt: now, completedAt: now })} onStop={vi.fn()} />)
    expect(screen.getByText('0m')).toBeInTheDocument()
  })
})
