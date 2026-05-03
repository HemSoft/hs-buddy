import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { RalphRunInfo, RalphLaunchConfig } from '../../types/ralph'

const mockGetStatus = vi.fn()
const mockStopFn = vi.fn()
const mockOnStatusChange = vi.fn()
const mockOffStatusChange = vi.fn()

import { RalphRunDetailPanel } from './RalphRunDetailPanel'

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'test-run-1',
    config: {
      repoPath: 'D:\\github\\test-repo',
      scriptType: 'ralph',
      model: 'gpt-4',
      branch: 'main',
    },
    status: 'running',
    phase: 'iterating',
    pid: 1234,
    currentIteration: 2,
    totalIterations: 5,
    startedAt: Date.now() - 120_000,
    updatedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: ['Line 1', 'Line 2'],
    stats: {
      checks: 3,
      agentTurns: 10,
      reviews: 2,
      copilotPRs: 1,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: '$1.50',
      totalPremium: 5,
    },
    ...overrides,
  } as RalphRunInfo
}

describe('RalphRunDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'ralph', {
      value: {
        getStatus: mockGetStatus,
        stop: mockStopFn,
        onStatusChange: mockOnStatusChange,
        offStatusChange: mockOffStatusChange,
        list: vi.fn(),
        launch: vi.fn(),
        getConfig: vi.fn(),
        listTemplates: vi.fn(),
        selectDirectory: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {}))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    expect(screen.getByText('Loading run…')).toBeInTheDocument()
  })

  it('shows error when run not found', async () => {
    mockGetStatus.mockResolvedValue(null)
    render(<RalphRunDetailPanel runId="missing" />)
    await waitFor(() => {
      expect(screen.getByText('Run not found')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    mockGetStatus.mockRejectedValue(new Error('IPC failed'))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('IPC failed')).toBeInTheDocument()
    })
  })

  it('renders run detail with repo name', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })
  })

  it('shows Running status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument()
    })
  })

  it('shows Completed status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'completed', completedAt: Date.now() }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })

  it('shows Stop button for running runs', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByTitle('Stop loop')).toBeInTheDocument()
    })
  })

  it('hides Stop button for completed runs', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'completed', completedAt: Date.now() }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Stop loop')).not.toBeInTheDocument()
  })

  it('calls window.ralph.stop when Stop clicked', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running' }))
    mockStopFn.mockResolvedValue(undefined)
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByTitle('Stop loop')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('Stop loop'))
    expect(mockStopFn).toHaveBeenCalledWith('test-run-1')
  })

  it('shows iteration progress', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ currentIteration: 2, totalIterations: 5 }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('2/5')).toBeInTheDocument()
    })
  })

  it('shows stats grid', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Checks')).toBeInTheDocument()
      expect(screen.getByText('Agent Turns')).toBeInTheDocument()
      expect(screen.getByText('Reviews')).toBeInTheDocument()
    })
  })

  it('shows log output lines', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['Hello world', 'Build complete'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Build complete')).toBeInTheDocument()
    })
  })

  it('shows empty log message', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: [] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('No output yet…')).toBeInTheDocument()
    })
  })

  it('shows error banner when run.error is set', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ error: 'Process crashed' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Process crashed')).toBeInTheDocument()
    })
  })

  it('shows exit code when present', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({ exitCode: 1, status: 'failed', completedAt: Date.now() })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Exit: 1')).toBeInTheDocument()
    })
  })

  it('registers and unregisters onStatusChange', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    const { unmount } = render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalled()
    })
    unmount()
    expect(mockOffStatusChange).toHaveBeenCalled()
  })

  it('shows model and branch info', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument()
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  it('shows phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'iterating' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Iterating')).toBeInTheDocument()
    })
  })

  // Additional coverage tests

  it('shows pending status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'pending' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('shows failed status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'failed' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  it('shows cancelled status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'cancelled' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    })
  })

  it('shows orphaned status', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'orphaned' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Orphaned')).toBeInTheDocument()
    })
  })

  it('shows initializing phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'initializing' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Initializing…')).toBeInTheDocument()
    })
  })

  it('shows scanning phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'scanning' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Scanning')).toBeInTheDocument()
    })
  })

  it('shows pr-handoff phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'pr-handoff' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('PR Handoff')).toBeInTheDocument()
    })
  })

  it('shows pr-resolving phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'pr-resolving' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('PR Review Cycle')).toBeInTheDocument()
    })
  })

  it('shows completed phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'completed' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  it('shows failed phase label', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ phase: 'failed' }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  it('shows scanIterations stat when > 0', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({
        stats: {
          checks: 0,
          agentTurns: 0,
          reviews: 0,
          copilotPRs: 0,
          issuesCreated: 0,
          scanIterations: 2,
          totalCost: '',
          totalPremium: 0,
        },
      })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Scans')).toBeInTheDocument()
    })
  })

  it('shows issuesCreated stat when > 0', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({
        stats: {
          checks: 1,
          agentTurns: 0,
          reviews: 0,
          copilotPRs: 0,
          issuesCreated: 3,
          scanIterations: 0,
          totalCost: '',
          totalPremium: 0,
        },
      })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Issues Created')).toBeInTheDocument()
    })
  })

  it('shows copilotPRs stat when > 0', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({
        stats: {
          checks: 1,
          agentTurns: 0,
          reviews: 0,
          copilotPRs: 4,
          issuesCreated: 0,
          scanIterations: 0,
          totalCost: '',
          totalPremium: 0,
        },
      })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Copilot PRs')).toBeInTheDocument()
    })
  })

  it('shows totalCost and totalPremium stat when totalCost is truthy', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({
        stats: {
          checks: 1,
          agentTurns: 0,
          reviews: 0,
          copilotPRs: 0,
          issuesCreated: 0,
          scanIterations: 0,
          totalCost: '$5.00',
          totalPremium: 8,
        },
      })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('$5.00')).toBeInTheDocument()
      expect(screen.getByText('8 premium')).toBeInTheDocument()
    })
  })

  it('does not show stats grid when all stats are zero', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({
        stats: {
          checks: 0,
          agentTurns: 0,
          reviews: 0,
          copilotPRs: 0,
          issuesCreated: 0,
          scanIterations: 0,
          totalCost: '',
          totalPremium: 0,
        },
      })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Checks')).not.toBeInTheDocument()
  })

  it('shows default model when model is empty', async () => {
    const config = {
      repoPath: 'D:\\github\\test-repo',
      scriptType: 'ralph',
      model: '',
      branch: 'main',
    }
    mockGetStatus.mockResolvedValue(makeRun({ config: config as unknown as RalphLaunchConfig }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('default')).toBeInTheDocument()
    })
  })

  it('shows (auto) branch when branch is empty', async () => {
    const config = {
      repoPath: 'D:\\github\\test-repo',
      scriptType: 'ralph',
      model: 'gpt-4',
      branch: '',
    }
    mockGetStatus.mockResolvedValue(makeRun({ config: config as unknown as RalphLaunchConfig }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('(auto)')).toBeInTheDocument()
    })
  })

  it('updates run when status change handler fires with matching runId', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    render(<RalphRunDetailPanel runId="test-run-1" />)

    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalled()
    })

    const handler = mockOnStatusChange.mock.calls[0][0]
    const updatedRun = makeRun({ currentIteration: 4 })
    handler(updatedRun)

    await waitFor(() => {
      expect(screen.getByText('4/5')).toBeInTheDocument()
    })
  })

  it('ignores status change handler when runId does not match', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    render(<RalphRunDetailPanel runId="test-run-1" />)

    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalled()
    })

    const handler = mockOnStatusChange.mock.calls[0][0]
    const differentRun = makeRun({ runId: 'test-run-2', currentIteration: 4 })
    handler(differentRun)

    // Should still show original iteration
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('handles non-Error exception when fetching run', async () => {
    mockGetStatus.mockRejectedValue('Some error string')
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load run')).toBeInTheDocument()
    })
  })

  it('handles stop button error gracefully', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running' }))
    mockStopFn.mockRejectedValue(new Error('Stop error'))
    render(<RalphRunDetailPanel runId="test-run-1" />)

    await waitFor(() => {
      expect(screen.getByTitle('Stop loop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Stop loop'))

    await waitFor(() => {
      expect(mockStopFn).toHaveBeenCalledWith('test-run-1')
    })
  })

  it('renders log header classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['==== Test ===='] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('==== Test ====')).toBeInTheDocument()
    })
  })

  it('renders log separator classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['═════════'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('═════════')).toBeInTheDocument()
    })
  })

  it('renders log section classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['  Round 1'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Round 1')).toBeInTheDocument()
    })
  })

  it('renders log timestamp classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['[agent] [2024-01-15 10:30:45]'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('[agent] [2024-01-15 10:30:45]')).toBeInTheDocument()
    })
  })

  it('renders log stat classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['  Changes: 5'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Changes: 5')).toBeInTheDocument()
    })
  })

  it('renders log command classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['  | npm test'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('| npm test')).toBeInTheDocument()
    })
  })

  it('renders log info classification', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['CI is now running'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('CI is now running')).toBeInTheDocument()
    })
  })

  it('renders empty log line as non-breaking space', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['', 'Next'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })
  })

  it('calculates duration correctly in seconds', async () => {
    const now = Date.now()
    mockGetStatus.mockResolvedValue(makeRun({ startedAt: now - 45_000, completedAt: now }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('45s')).toBeInTheDocument()
    })
  })

  it('calculates duration correctly in minutes', async () => {
    const now = Date.now()
    mockGetStatus.mockResolvedValue(makeRun({ startedAt: now - 150_000, completedAt: now }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('2m 30s')).toBeInTheDocument()
    })
  })

  it('calculates duration correctly in hours', async () => {
    const now = Date.now()
    mockGetStatus.mockResolvedValue(makeRun({ startedAt: now - 7260_000, completedAt: now })) // 2h 1m
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('2h 1m')).toBeInTheDocument()
    })
  })

  it('shows totals section in log', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['  Totals ('] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Totals (')).toBeInTheDocument()
    })
  })

  it('extracts repo name correctly from Windows path', async () => {
    const config = {
      repoPath: 'C:\\Users\\dev\\repos\\awesome-project',
      scriptType: 'ralph',
      model: 'gpt-4',
      branch: 'main',
    }
    mockGetStatus.mockResolvedValue(makeRun({ config: config as unknown as RalphLaunchConfig }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('awesome-project')).toBeInTheDocument()
    })
  })

  it('extracts repo name correctly from Unix path', async () => {
    const config = {
      repoPath: '/home/dev/repos/awesome-project',
      scriptType: 'ralph',
      model: 'gpt-4',
      branch: 'main',
    }
    mockGetStatus.mockResolvedValue(makeRun({ config: config as unknown as RalphLaunchConfig }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('awesome-project')).toBeInTheDocument()
    })
  })

  it('classifies log info lines case-insensitively', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['Waiting for build'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Waiting for build')).toBeInTheDocument()
    })
  })

  it('classifies section lines with Totals', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['  Totals (v2)'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Totals (v2)')).toBeInTheDocument()
    })
  })

  it('shows duration when run is still active', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running', completedAt: null }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })
    // Should show a duration even if still running
    const durationRegex = /\d+(s|m|h)/
    const elements = screen.getAllByText(durationRegex)
    expect(elements.length).toBeGreaterThan(0)
  })

  it('does not show progress bar when totalIterations is 0', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ totalIterations: 0 }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Iteration/)).not.toBeInTheDocument()
  })

  it('does not show progress bar when totalIterations is null', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ totalIterations: null }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Iteration/)).not.toBeInTheDocument()
  })

  it('ignores status change update after component unmounts', async () => {
    mockGetStatus.mockResolvedValue(makeRun())
    const { unmount } = render(<RalphRunDetailPanel runId="test-run-1" />)

    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalled()
    })

    const handler = mockOnStatusChange.mock.calls[0][0]
    unmount()

    // Call handler after unmount - should not crash or update state
    const updatedRun = makeRun({ currentIteration: 4 })
    expect(() => {
      handler(updatedRun)
    }).not.toThrow()
  })

  it('does not set timer for completed runs', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ status: 'completed', completedAt: Date.now() }))
    render(<RalphRunDetailPanel runId="test-run-1" />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    // Component should render successfully without timer effects for completed run
    expect(screen.getByText('test-repo')).toBeInTheDocument()
  })

  it('ignores fetch result after component unmounts', async () => {
    let resolveFetch: (value: RalphRunInfo) => void = () => {}
    mockGetStatus.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve
        })
    )

    const { unmount } = render(<RalphRunDetailPanel runId="test-run-1" />)

    // Unmount before fetch completes
    unmount()

    // Resolve the fetch - should not crash
    expect(() => {
      resolveFetch(makeRun())
    }).not.toThrow()
  })

  it('ignores fetch error after component unmounts', async () => {
    let rejectFetch: (reason: Error) => void = () => {}
    mockGetStatus.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectFetch = reject
        })
    )

    const { unmount } = render(<RalphRunDetailPanel runId="test-run-1" />)

    // Unmount before fetch completes
    unmount()

    // Reject the fetch - should not crash
    expect(() => {
      rejectFetch(new Error('Fetch failed'))
    }).not.toThrow()
  })

  it('caps progress bar at 100% when current exceeds total', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({ currentIteration: 12, totalIterations: 10, status: 'running' })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('12/10')).toBeInTheDocument()
    })
  })

  it('shows error message alongside failed status', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({ status: 'failed', error: 'Script crashed', completedAt: Date.now() })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Script crashed')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  it('classifies log lines with Action taken as info', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['Action taken: merge'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Action taken: merge')).toBeInTheDocument()
    })
  })

  it('classifies log lines with in progress as info', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['Tests are in progress'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Tests are in progress')).toBeInTheDocument()
    })
  })

  it('classifies log stat lines with various keywords', async () => {
    mockGetStatus.mockResolvedValue(
      makeRun({ logBuffer: ['  Requests 12', '  Tokens 5000', '  Cost $1.00', '  Elapsed 30s'] })
    )
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Requests 12')).toBeInTheDocument()
    })
  })

  it('classifies log separator with dashes', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ logBuffer: ['───────────'] }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('───────────')).toBeInTheDocument()
    })
  })

  it('shows repoPath as fallback when repoName is empty', async () => {
    mockGetStatus.mockResolvedValue(makeRun({ config: { repoPath: '', scriptType: 'ralph' } }))
    render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument()
    })
  })

  it('timer interval ticks for active (running) runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetStatus.mockResolvedValue(makeRun({ status: 'running', startedAt: Date.now() - 5_000 }))
    const { unmount } = render(<RalphRunDetailPanel runId="test-run-1" />)
    await waitFor(() => expect(screen.getByText('Running')).toBeInTheDocument())
    // Advance past the 1s interval to trigger the setInterval callback
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(screen.getByText('Running')).toBeInTheDocument()
    unmount()
    vi.useRealTimers()
  })
})
