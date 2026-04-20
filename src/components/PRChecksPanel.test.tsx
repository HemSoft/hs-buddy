import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { PRChecksSummary } from '../api/github'
import type { PRDetailInfo } from '../utils/prDetailView'

const { mockEnqueue, mockFetchPRChecks, stableAccounts, mockParseOwnerRepo, mockIsAbortError } =
  vi.hoisted(() => ({
    mockEnqueue: vi.fn(),
    mockFetchPRChecks: vi.fn(),
    stableAccounts: [{ username: 'testuser', token: 'tok' }],
    mockParseOwnerRepo: vi.fn(),
    mockIsAbortError: vi.fn(),
  }))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: vi.fn(() => null), set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: class {
    fetchPRChecks(...args: unknown[]) {
      return mockFetchPRChecks(...args)
    }
  },
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '2 hours ago',
  formatDateFull: () => 'Jan 1, 2025 12:00 PM',
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (...args: unknown[]) => mockParseOwnerRepo(...args),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: (...args: unknown[]) => mockIsAbortError(...args),
  throwIfAborted: (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  },
}))

import { PRChecksPanel } from './PRChecksPanel'

const basePR: PRDetailInfo = {
  source: 'GitHub',
  repository: 'acme/webapp',
  id: 42,
  title: 'Fix the thing',
  author: 'alice',
  url: 'https://github.com/acme/webapp/pull/42',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2025-01-01T00:00:00Z',
  date: '2025-01-01T00:00:00Z',
}

function makeChecks(overrides: Partial<PRChecksSummary> = {}): PRChecksSummary {
  return {
    headSha: 'abc123def456789012345678',
    overallState: 'passing',
    totalCount: 3,
    successfulCount: 2,
    failedCount: 1,
    pendingCount: 0,
    neutralCount: 0,
    checkRuns: [
      {
        id: 1,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        detailsUrl: 'https://github.com/acme/webapp/runs/1',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:05:00Z',
        appName: 'GitHub Actions',
      },
      {
        id: 2,
        name: 'lint',
        status: 'completed',
        conclusion: 'failure',
        detailsUrl: 'https://github.com/acme/webapp/runs/2',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:03:00Z',
        appName: 'GitHub Actions',
      },
    ],
    statusContexts: [
      {
        id: 10,
        context: 'ci/deploy',
        state: 'success',
        description: 'Deploy succeeded',
        targetUrl: 'https://deploy.example.com/10',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:10:00Z',
      },
    ],
    ...overrides,
  }
}

function setupEnqueue(result: PRChecksSummary) {
  mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<PRChecksSummary>) => {
    const controller = new AbortController()
    return cb(controller.signal)
  })
  mockFetchPRChecks.mockResolvedValue(result)
}

function setupEnqueueError(error: Error) {
  mockEnqueue.mockImplementation(async () => {
    throw error
  })
}

describe('PRChecksPanel', () => {
  beforeEach(() => {
    mockEnqueue.mockReset()
    mockFetchPRChecks.mockReset()
    mockParseOwnerRepo.mockReturnValue({ owner: 'acme', repo: 'webapp' })
    mockIsAbortError.mockReturnValue(false)
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<PRChecksPanel pr={basePR} />)
    expect(screen.getByText(/Loading checks/)).toBeTruthy()
  })

  it('shows error state when fetch fails with retry button', async () => {
    setupEnqueueError(new Error('Network timeout'))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load checks')).toBeTruthy()
    })
    expect(screen.getByText('Network timeout')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('retries on Retry click', async () => {
    setupEnqueueError(new Error('Network timeout'))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy()
    })

    setupEnqueue(makeChecks())
    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getAllByText('Passing').length).toBeGreaterThan(0)
    })
  })

  it('shows checks summary grid with counts', async () => {
    setupEnqueue(
      makeChecks({
        overallState: 'failing',
        totalCount: 5,
        successfulCount: 3,
        failedCount: 1,
        pendingCount: 1,
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getAllByText('Failing').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Overall')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows check runs with correct status labels', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 2,
            name: 'test',
            status: 'in_progress',
            conclusion: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 3,
            name: 'deploy',
            status: 'queued',
            conclusion: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 4,
            name: 'sec',
            status: 'completed',
            conclusion: 'failure',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 5,
            name: 'skip',
            status: 'completed',
            conclusion: 'skipped',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 6,
            name: 'timeout',
            status: 'completed',
            conclusion: 'timed_out',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
        ],
        statusContexts: [],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getAllByText('Passed').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('In progress')).toBeTruthy()
    expect(screen.getByText('Queued')).toBeTruthy()
    expect(screen.getByText('failure')).toBeTruthy()
    expect(screen.getByText('skipped')).toBeTruthy()
    expect(screen.getByText('timed out')).toBeTruthy()
  })

  it('shows status contexts with correct state labels', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [],
        statusContexts: [
          {
            id: 10,
            context: 'ci/pass',
            state: 'success',
            description: 'OK',
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
          {
            id: 11,
            context: 'ci/fail',
            state: 'failure',
            description: 'Broken',
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
          {
            id: 12,
            context: 'ci/err',
            state: 'error',
            description: 'Errored',
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
          {
            id: 13,
            context: 'ci/wait',
            state: 'pending',
            description: 'Waiting',
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getAllByText('Passed').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
  })

  it('shows empty state when totalCount is 0', async () => {
    setupEnqueue(makeChecks({ totalCount: 0, checkRuns: [], statusContexts: [] }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(
        screen.getByText('No checks or commit statuses were reported for this pull request.')
      ).toBeTruthy()
    })
  })

  it('shows "No GitHub check runs" when checkRuns array is empty', async () => {
    setupEnqueue(makeChecks({ checkRuns: [] }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('No GitHub check runs')).toBeTruthy()
    })
  })

  it('shows "No legacy commit status contexts" when statusContexts is empty', async () => {
    setupEnqueue(makeChecks({ statusContexts: [] }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('No legacy commit status contexts')).toBeTruthy()
    })
  })

  it('opens external link when "Open on GitHub" button is clicked', async () => {
    setupEnqueue(makeChecks())
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/acme/webapp/pull/42/checks'
    )
  })

  it('opens details URL when check run Details button is clicked', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://example.com/run/1',
            startedAt: null,
            completedAt: null,
            appName: null,
          },
        ],
        statusContexts: [],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Details'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://example.com/run/1')
  })

  it('renders head SHA truncated to 12 chars', async () => {
    setupEnqueue(makeChecks({ headSha: 'abc123def456789012345678' }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('abc123def456')).toBeTruthy()
    })
  })

  it('shows GitHub App fallback when appName is null', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 1,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: null,
            startedAt: '2025-01-01',
            completedAt: null,
            appName: null,
          },
        ],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('GitHub App')).toBeTruthy()
    })
  })

  it('shows "No description provided" when status context has no description', async () => {
    setupEnqueue(
      makeChecks({
        statusContexts: [
          {
            id: 10,
            context: 'ci/check',
            state: 'success',
            description: null,
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('No description provided')).toBeTruthy()
    })
  })

  it('shows "Neutral" overall state label', async () => {
    setupEnqueue(makeChecks({ overallState: 'neutral' }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Neutral')).toBeTruthy()
    })
  })

  it('shows "Pending" overall state label', async () => {
    setupEnqueue(makeChecks({ overallState: 'pending' }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    })
  })

  it('shows "No checks" for unknown overall state', async () => {
    setupEnqueue(makeChecks({ overallState: 'unknown' as PRChecksSummary['overallState'] }))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('No checks')).toBeTruthy()
    })
  })

  it('shows all failure conclusion variants', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 10,
            name: 'startup-check',
            status: 'completed',
            conclusion: 'startup_failure',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 11,
            name: 'action-check',
            status: 'completed',
            conclusion: 'action_required',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 12,
            name: 'cancel-check',
            status: 'completed',
            conclusion: 'cancelled',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
          {
            id: 13,
            name: 'stale-check',
            status: 'completed',
            conclusion: 'stale',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
        ],
        statusContexts: [],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('startup failure')).toBeTruthy()
    })
    expect(screen.getByText('action required')).toBeTruthy()
    expect(screen.getByText('cancelled')).toBeTruthy()
    expect(screen.getByText('stale')).toBeTruthy()
  })

  it('shows neutral conclusion label', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 20,
            name: 'neutral-check',
            status: 'completed',
            conclusion: 'neutral',
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
        ],
        statusContexts: [],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('neutral')).toBeTruthy()
    })
  })

  it('shows fallback label for unknown conclusion', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [
          {
            id: 30,
            name: 'unknown-check',
            status: 'completed',
            conclusion: null,
            detailsUrl: null,
            startedAt: null,
            completedAt: null,
            appName: null,
          },
        ],
        statusContexts: [],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeTruthy()
    })
  })

  it('shows status context fallback label for unknown state', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [],
        statusContexts: [
          {
            id: 40,
            context: 'ci/unknown',
            state: 'some_unknown_state',
            description: 'Unknown state',
            targetUrl: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('some_unknown_state')).toBeTruthy()
    })
  })

  it('opens status context targetUrl when Details button clicked', async () => {
    setupEnqueue(
      makeChecks({
        checkRuns: [],
        statusContexts: [
          {
            id: 50,
            context: 'ci/deploy',
            state: 'success',
            description: 'Deployed',
            targetUrl: 'https://deploy.example.com/50',
            createdAt: null,
            updatedAt: null,
          },
        ],
      })
    )
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Details'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://deploy.example.com/50')
  })

  it('shows error when parseOwnerRepoFromUrl returns null without retry button', async () => {
    mockParseOwnerRepo.mockReturnValue(null)
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(screen.getByText('Could not parse owner/repo from PR URL')).toBeInTheDocument()
    })
    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
  })

  it('silences abort errors without showing error state', async () => {
    mockIsAbortError.mockReturnValue(true)
    setupEnqueueError(new DOMException('Cancelled', 'AbortError'))
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
    expect(screen.queryByText('Failed to load checks')).toBeNull()
  })

  it('covers the signal.aborted early-throw in the enqueue callback', async () => {
    mockEnqueue.mockImplementation(
      async (cb: (signal: AbortSignal) => Promise<PRChecksSummary>) => {
        const controller = new AbortController()
        controller.abort()
        return cb(controller.signal)
      }
    )
    mockIsAbortError.mockReturnValue(true)
    render(<PRChecksPanel pr={basePR} />)

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
    expect(screen.queryByText('Failed to load checks')).toBeNull()
  })

  it('discards stale success responses', async () => {
    let resolveFirst!: (val: PRChecksSummary) => void
    mockEnqueue
      .mockImplementationOnce(
        () =>
          new Promise<PRChecksSummary>(resolve => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce(makeChecks({ overallState: 'passing' }))

    const { rerender } = render(<PRChecksPanel pr={basePR} />)

    await act(async () => {
      rerender(<PRChecksPanel pr={{ ...basePR, id: 99 }} />)
    })

    // "Passing" appears as both the static label and the overall state value
    expect(screen.queryAllByText('Passing')).toHaveLength(2)
    // "Failing" appears once as the static label only
    expect(screen.queryAllByText('Failing')).toHaveLength(1)

    await act(async () => {
      resolveFirst(makeChecks({ overallState: 'failing' }))
    })

    // "Failing" should still appear only once (static label), not twice
    expect(screen.queryAllByText('Failing')).toHaveLength(1)
  })

  it('discards stale error responses', async () => {
    let rejectFirst!: (err: Error) => void
    mockEnqueue
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) => {
            rejectFirst = reject
          })
      )
      .mockResolvedValueOnce(makeChecks({ overallState: 'passing' }))

    const { rerender } = render(<PRChecksPanel pr={basePR} />)

    await act(async () => {
      rerender(<PRChecksPanel pr={{ ...basePR, id: 99 }} />)
    })

    expect(screen.getAllByText('Passing').length).toBeGreaterThan(0)

    await act(async () => {
      rejectFirst(new Error('Old error'))
    })

    expect(screen.queryByText('Old error')).toBeNull()
  })
})
