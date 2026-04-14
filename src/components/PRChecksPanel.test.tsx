import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockEnqueue = vi.fn()
const mockAccounts = [{ username: 'alice', org: 'acme' }]
const mockFetchPRChecks = vi.fn()

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchPRChecks: (...args: unknown[]) => mockFetchPRChecks(...args),
    }
  }),
}))

import { PRChecksPanel } from './PRChecksPanel'
import type { PRDetailInfo } from '../utils/prDetailView'

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'repo',
  id: 1,
  title: 'Fix',
  author: 'alice',
  url: 'https://github.com/acme/repo/pull/1',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2026-01-01',
  date: '2026-01-01',
  org: 'acme',
  ...overrides,
})

describe('PRChecksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return fn(controller.signal)
    })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders loading state initially', () => {
    mockEnqueue.mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    render(<PRChecksPanel pr={makePR()} />)
    expect(screen.getByText('Loading checks…')).toBeInTheDocument()
  })

  it('renders error state with retry button', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('API error'))

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load checks')).toBeInTheDocument()
    })
    expect(screen.getByText('API error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('renders checks data with summary grid', async () => {
    const checksData = {
      overallState: 'passing',
      totalCount: 5,
      successfulCount: 4,
      failedCount: 1,
      pendingCount: 0,
      headSha: 'abc123def456789',
      checkRuns: [
        {
          id: 'cr1',
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          appName: 'GitHub Actions',
          detailsUrl: 'https://example.com/build',
          startedAt: '2026-01-01T10:00:00Z',
          completedAt: '2026-01-01T10:05:00Z',
        },
        {
          id: 'cr2',
          name: 'Tests',
          status: 'completed',
          conclusion: 'failure',
          appName: 'GitHub Actions',
          detailsUrl: null,
          startedAt: '2026-01-01T10:00:00Z',
          completedAt: '2026-01-01T10:03:00Z',
        },
      ],
      statusContexts: [
        {
          id: 'sc1',
          context: 'ci/circleci',
          state: 'success',
          description: 'All clear',
          targetUrl: 'https://circleci.com/build/1',
          createdAt: '2026-01-01T10:00:00Z',
          updatedAt: '2026-01-01T10:05:00Z',
        },
      ],
    }

    mockFetchPRChecks.mockResolvedValue(checksData)

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getAllByText('Passing')).toHaveLength(2)
    })

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
    expect(screen.getAllByText('Passed')).toHaveLength(2)
    expect(screen.getByText('Tests')).toBeInTheDocument()
    expect(screen.getByText('failure')).toBeInTheDocument()
    expect(screen.getByText('ci/circleci')).toBeInTheDocument()
  })

  it('renders empty check runs and status contexts', async () => {
    const checksData = {
      overallState: 'neutral',
      totalCount: 0,
      successfulCount: 0,
      failedCount: 0,
      pendingCount: 0,
      headSha: 'abc123',
      checkRuns: [],
      statusContexts: [],
    }

    mockFetchPRChecks.mockResolvedValue(checksData)

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(
        screen.getByText('No checks or commit statuses were reported for this pull request.')
      ).toBeInTheDocument()
    })
    expect(screen.getByText('No GitHub check runs')).toBeInTheDocument()
    expect(screen.getByText('No legacy commit status contexts')).toBeInTheDocument()
  })

  it('displays in-progress check run status', async () => {
    const checksData = {
      overallState: 'pending',
      totalCount: 1,
      successfulCount: 0,
      failedCount: 0,
      pendingCount: 1,
      headSha: 'abc123',
      checkRuns: [
        {
          id: 'cr1',
          name: 'Deploy',
          status: 'in_progress',
          conclusion: null,
          appName: 'Actions',
          detailsUrl: null,
          startedAt: '2026-01-01T10:00:00Z',
          completedAt: null,
        },
      ],
      statusContexts: [],
    }

    mockFetchPRChecks.mockResolvedValue(checksData)

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument()
    })
  })

  it('opens external link on Details click', async () => {
    const checksData = {
      overallState: 'passing',
      totalCount: 1,
      successfulCount: 1,
      failedCount: 0,
      pendingCount: 0,
      headSha: 'abc123',
      checkRuns: [
        {
          id: 'cr1',
          name: 'Build',
          status: 'completed',
          conclusion: 'success',
          appName: 'Actions',
          detailsUrl: 'https://example.com/build',
          startedAt: '2026-01-01T10:00:00Z',
          completedAt: '2026-01-01T10:05:00Z',
        },
      ],
      statusContexts: [],
    }

    mockFetchPRChecks.mockResolvedValue(checksData)

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Build')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Details'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://example.com/build')
  })

  it('retries fetch on Retry button click', async () => {
    let callCount = 0
    mockFetchPRChecks.mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('First failure')
      return {
        overallState: 'passing',
        totalCount: 0,
        successfulCount: 0,
        failedCount: 0,
        pendingCount: 0,
        headSha: 'abc',
        checkRuns: [],
        statusContexts: [],
      }
    })

    render(<PRChecksPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load checks')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.queryByText('Failed to load checks')).not.toBeInTheDocument()
    })
  })
})
