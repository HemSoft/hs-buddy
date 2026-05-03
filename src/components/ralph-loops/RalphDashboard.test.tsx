import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { RalphRunInfo } from '../../types/ralph'

const mockLaunch = vi.fn()
const mockStop = vi.fn()
const mockRefresh = vi.fn()
const mockListTemplates = vi.fn()

vi.mock('../../hooks/useRalphLoops', () => ({
  useRalphLoops: vi.fn(),
}))

vi.mock('./RalphLoopCard', () => ({
  RalphLoopCard: ({ run, onStop }: { run: RalphRunInfo; onStop: (id: string) => void }) => (
    <div data-testid={`loop-card-${run.runId}`}>
      <span>{run.runId}</span>
      <button onClick={() => onStop(run.runId)}>Stop</button>
    </div>
  ),
}))

vi.mock('./RalphLaunchForm', () => ({
  RalphLaunchForm: ({
    onLaunch,
  }: {
    onLaunch: (config: unknown) => Promise<{ success: boolean; runId?: string }>
  }) => (
    <div data-testid="launch-form">
      <button onClick={() => onLaunch({ repoPath: '/test', scriptType: 'ralph' })}>Launch</button>
    </div>
  ),
}))

import { useRalphLoops } from '../../hooks/useRalphLoops'
import { RalphDashboard } from './RalphDashboard'

const mockedUseRalphLoops = vi.mocked(useRalphLoops)

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'run-1',
    config: { repoPath: '/test', scriptType: 'ralph' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: Date.now() - 60_000,
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

function setupHook(overrides: Partial<ReturnType<typeof useRalphLoops>> = {}) {
  mockedUseRalphLoops.mockReturnValue({
    runs: [],
    loading: false,
    error: null,
    launch: mockLaunch,
    stop: mockStop,
    refresh: mockRefresh,
    ...overrides,
  })
}

describe('RalphDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListTemplates.mockResolvedValue([])
    Object.defineProperty(window, 'ralph', {
      value: {
        listTemplates: mockListTemplates,
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        selectDirectory: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    setupHook()
  })

  it('shows loading state', () => {
    setupHook({ loading: true })
    render(<RalphDashboard />)
    expect(screen.getByText('Loading loops…')).toBeInTheDocument()
  })

  it('renders Ralph Loops header', () => {
    render(<RalphDashboard />)
    expect(screen.getByText('Ralph Loops')).toBeInTheDocument()
  })

  it('renders script cards', () => {
    render(<RalphDashboard />)
    expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    expect(screen.getByText('Ralph PR')).toBeInTheDocument()
    expect(screen.getByText('Ralph Issues')).toBeInTheDocument()
  })

  it('renders active runs in Active section', () => {
    setupHook({ runs: [makeRun({ runId: 'active-1', status: 'running' })] })
    render(<RalphDashboard />)
    expect(screen.getByText('Active (1)')).toBeInTheDocument()
    expect(screen.getByTestId('loop-card-active-1')).toBeInTheDocument()
  })

  it('renders recent runs in Recent section', () => {
    setupHook({
      runs: [makeRun({ runId: 'done-1', status: 'completed', completedAt: Date.now() })],
    })
    render(<RalphDashboard />)
    expect(screen.getByText('Recent (1)')).toBeInTheDocument()
    expect(screen.getByTestId('loop-card-done-1')).toBeInTheDocument()
  })

  it('partitions failed runs as recent', () => {
    setupHook({ runs: [makeRun({ runId: 'fail-1', status: 'failed', completedAt: Date.now() })] })
    render(<RalphDashboard />)
    expect(screen.getByText('Recent (1)')).toBeInTheDocument()
  })

  it('New Loop button toggles launch form', () => {
    render(<RalphDashboard />)
    expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('New Loop'))
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()

    fireEvent.click(screen.getByText('New Loop'))
    expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument()
  })

  it('shows hook error', () => {
    setupHook({ error: 'IPC failed' })
    render(<RalphDashboard />)
    expect(screen.getByText('IPC failed')).toBeInTheDocument()
  })

  it('dismisses error banner', () => {
    setupHook({ error: 'IPC failed' })
    render(<RalphDashboard />)
    fireEvent.click(screen.getByText('×'))
    // The hook error re-appears since it's from the hook, but state error is cleared
    // The displayError is state.error ?? hookError, so clearing state.error still shows hookError
    expect(screen.getByText('IPC failed')).toBeInTheDocument()
  })

  it('handles stop failure by showing error', async () => {
    mockStop.mockResolvedValue({ success: false, error: 'Stop failed' })
    setupHook({ runs: [makeRun({ runId: 'r1', status: 'running' })] })
    render(<RalphDashboard />)

    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => {
      expect(screen.getByText('Stop failed')).toBeInTheDocument()
    })
  })

  it('handles successful launch', async () => {
    mockLaunch.mockResolvedValue({ success: true, runId: 'new-run' })
    const onOpenTab = vi.fn()
    render(<RalphDashboard onOpenTab={onOpenTab} />)

    fireEvent.click(screen.getByText('New Loop'))
    fireEvent.click(screen.getByText('Launch'))

    await waitFor(() => {
      expect(onOpenTab).toHaveBeenCalledWith('ralph-run:new-run')
    })
  })

  it('refresh button calls refresh', () => {
    render(<RalphDashboard />)
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('renders template script cards', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    render(<RalphDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })
  })

  it('script card click opens launch form', () => {
    render(<RalphDashboard />)
    fireEvent.click(screen.getByText('Ralph Loop').closest('[role="button"]')!)
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()
  })

  it('Ralph Issues script card click opens launch form', () => {
    render(<RalphDashboard />)
    fireEvent.click(screen.getByText('Ralph Issues').closest('[role="button"]')!)
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()
  })

  it('script card keyboard Enter key opens launch form', () => {
    render(<RalphDashboard />)
    const card = screen.getByText('Ralph Loop').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()
  })

  it('script card keyboard Space key opens launch form', () => {
    render(<RalphDashboard />)
    const card = screen.getByText('Ralph PR').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: ' ' })
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()
  })

  it('script card keyboard does not trigger on other keys', () => {
    render(<RalphDashboard />)
    const card = screen.getByText('Ralph Issues').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument()
  })

  it('ralph:select-script event listener opens launch form with script', async () => {
    render(<RalphDashboard />)
    const event = new CustomEvent('ralph:select-script', { detail: 'custom-script' })
    window.dispatchEvent(event)
    await waitFor(() => {
      expect(screen.getByTestId('launch-form')).toBeInTheDocument()
    })
  })

  it('ralph:launch-pr-review event listener opens launch form with PR data', async () => {
    render(<RalphDashboard />)
    const prData = {
      prNumber: 42,
      repository: 'test-repo',
      org: 'test-org',
      repoPath: '/test/path',
    }
    const event = new CustomEvent('ralph:launch-pr-review', { detail: prData })
    window.dispatchEvent(event)
    await waitFor(() => {
      expect(screen.getByTestId('launch-form')).toBeInTheDocument()
    })
  })

  it('ralph:launch-from-issue event listener opens launch form with issue data', async () => {
    render(<RalphDashboard />)
    const issueData = {
      issueNumber: 99,
      issueTitle: 'Test Issue',
      issueBody: 'Test body',
      repository: 'test-repo',
      org: 'test-org',
      repoPath: '/test/path',
    }
    const event = new CustomEvent('ralph:launch-from-issue', { detail: issueData })
    window.dispatchEvent(event)
    await waitFor(() => {
      expect(screen.getByTestId('launch-form')).toBeInTheDocument()
    })
  })

  it('handleLaunched closes form and does not call onOpenTab if no runId', async () => {
    const onOpenTab = vi.fn()
    mockLaunch.mockResolvedValue({ success: true })
    render(<RalphDashboard onOpenTab={onOpenTab} />)

    fireEvent.click(screen.getByText('New Loop'))
    fireEvent.click(screen.getByText('Launch'))

    await waitFor(() => {
      expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument()
    })
    expect(onOpenTab).not.toHaveBeenCalled()
  })

  it('handleLaunched without onOpenTab prop does not crash', async () => {
    mockLaunch.mockResolvedValue({ success: true, runId: 'new-run' })
    render(<RalphDashboard />)

    fireEvent.click(screen.getByText('New Loop'))
    fireEvent.click(screen.getByText('Launch'))

    await waitFor(() => {
      expect(screen.queryByTestId('launch-form')).not.toBeInTheDocument()
    })
  })

  it('template cards are rendered when listTemplates succeeds', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
      { name: 'Quality', filename: 'ralph-improve-quality.ps1' },
    ])
    render(<RalphDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
  })

  it('template card click opens launch form with template script', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    render(<RalphDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Coverage').closest('[role="button"]')!)
    expect(screen.getByTestId('launch-form')).toBeInTheDocument()
  })

  it('shows ralph-pr launch form when selected script is ralph-pr', async () => {
    const prData = {
      prNumber: 42,
      repository: 'test-repo',
      org: 'test-org',
      repoPath: '/test/path',
    }
    const event = new CustomEvent('ralph:launch-pr-review', { detail: prData })
    render(<RalphDashboard />)
    window.dispatchEvent(event)
    await waitFor(() => {
      expect(screen.getByTestId('launch-form')).toBeInTheDocument()
    })
  })

  it('error state clears when error banner X clicked', async () => {
    mockStop.mockResolvedValue({ success: false, error: 'Stop failed' })
    setupHook({ error: 'Hook error', runs: [makeRun({ runId: 'r1', status: 'running' })] })
    render(<RalphDashboard />)

    fireEvent.click(screen.getByText('Stop'))

    await waitFor(() => {
      expect(screen.getByText('Stop failed')).toBeInTheDocument()
    })

    // Find and click the close button
    const closeButton = screen.getByRole('button', { name: /×/ })
    fireEvent.click(closeButton)

    // After dismissing state error, hook error still shows (state.error ?? hookError)
    expect(screen.getByText('Hook error')).toBeInTheDocument()
  })

  it('partitions runs correctly: running as active, completed as recent', () => {
    setupHook({
      runs: [
        makeRun({ runId: 'active-1', status: 'running' }),
        makeRun({ runId: 'completed-1', status: 'completed', completedAt: Date.now() }),
      ],
    })
    render(<RalphDashboard />)
    expect(screen.getByText('Active (1)')).toBeInTheDocument()
    expect(screen.getByText('Recent (1)')).toBeInTheDocument()
  })

  it('shows default "Stop failed" when stop result has no error message', async () => {
    mockStop.mockResolvedValue({ success: false })
    setupHook({ runs: [makeRun({ runId: 'r1', status: 'running' })] })
    render(<RalphDashboard />)

    fireEvent.click(screen.getByText('Stop'))

    await waitFor(() => {
      expect(screen.getByText('Stop failed')).toBeInTheDocument()
    })
  })

  it('handles listTemplates rejection gracefully', async () => {
    mockListTemplates.mockRejectedValue(new Error('Templates unavailable'))
    setupHook()
    render(<RalphDashboard />)

    // Should not crash — dashboard still renders
    await waitFor(() => {
      expect(screen.getByText('Ralph Loops')).toBeInTheDocument()
    })
  })

  it('uses fallback description for unknown template filename', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Unknown Script', filename: 'totally-unknown-script.ps1', description: '' },
    ])
    render(<RalphDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Unknown Script')).toBeInTheDocument()
    })

    expect(screen.getByText('Template improvement loop')).toBeInTheDocument()
  })

  /* ── Branch coverage: false/else branches ──────────────────── */

  it('handles non-array listTemplates result gracefully (L89 false)', async () => {
    mockListTemplates.mockResolvedValueOnce(null)
    render(<RalphDashboard />)
    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalled()
    })
    // No template cards should appear
    expect(screen.queryByText('Coverage')).not.toBeInTheDocument()
  })

  it('does not set error when stop succeeds (L127 false)', async () => {
    mockStop.mockResolvedValue({ success: true })
    setupHook({ runs: [makeRun({ runId: 'r1', status: 'running' })] })
    render(<RalphDashboard />)
    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => {
      expect(mockStop).toHaveBeenCalledWith('r1')
    })
    expect(screen.queryByText('Stop failed')).not.toBeInTheDocument()
  })

  it('does not call handleLaunched when launch fails (L192 false)', async () => {
    const onOpenTab = vi.fn()
    mockLaunch.mockResolvedValue({ success: false, error: 'bad config' })
    render(<RalphDashboard onOpenTab={onOpenTab} />)
    fireEvent.click(screen.getByText('New Loop'))
    fireEvent.click(screen.getByText('Launch'))
    await waitFor(() => {
      expect(mockLaunch).toHaveBeenCalled()
    })
    expect(onOpenTab).not.toHaveBeenCalled()
  })
})
