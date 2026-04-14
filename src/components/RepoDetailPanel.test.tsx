import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockEnqueue, mockCacheGet, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
  usePRSettings: () => ({ refreshInterval: 0 }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoDetail: vi.fn(),
  })),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
}))

vi.mock('./repo-detail/RepoStatsBar', () => ({
  RepoStatsBar: () => <div data-testid="repo-stats-bar" />,
}))

vi.mock('./repo-detail/RepoContentGrid', () => ({
  RepoContentGrid: () => <div data-testid="repo-content-grid" />,
}))

import { RepoDetailPanel } from './RepoDetailPanel'

function makeRepoDetail(overrides = {}) {
  return {
    name: 'hs-buddy',
    description: 'A productivity companion',
    url: 'https://github.com/test-org/hs-buddy',
    homepage: 'https://hs-buddy.dev',
    visibility: 'public',
    isArchived: false,
    isFork: false,
    language: 'TypeScript',
    license: 'MIT',
    topics: ['electron', 'typescript'],
    latestWorkflowRun: null,
    ...overrides,
  }
}

describe('RepoDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheGet.mockReturnValue(null)
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('Loading repository details...')).toBeInTheDocument()
    expect(screen.getByText('test-org/hs-buddy')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Not found'))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load repository')).toBeInTheDocument()
    })
    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders repo detail after loading', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('A productivity companion')).toBeInTheDocument()
    })
  })

  it('displays visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'public' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument()
    })
  })

  it('displays private visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'private' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('private')).toBeInTheDocument()
    })
  })

  it('displays internal visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'internal' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('internal')).toBeInTheDocument()
    })
  })

  it('shows archived badge when repo is archived', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ isArchived: true }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument()
    })
  })

  it('shows fork badge when repo is a fork', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ isFork: true }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Fork')).toBeInTheDocument()
    })
  })

  it('shows language badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ language: 'TypeScript' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('TypeScript')).toBeInTheDocument()
    })
  })

  it('shows license badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ license: 'MIT' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('MIT')).toBeInTheDocument()
    })
  })

  it('renders topics', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('electron')).toBeInTheDocument()
      expect(screen.getByText('typescript')).toBeInTheDocument()
    })
  })

  it('opens GitHub URL on button click', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy')
  })

  it('shows homepage button when present', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Homepage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Homepage'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://hs-buddy.dev')
  })

  it('does not show homepage button when absent', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ homepage: null }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })
    expect(screen.queryByText('Homepage')).not.toBeInTheDocument()
  })

  it('renders RepoStatsBar and RepoContentGrid', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByTestId('repo-stats-bar')).toBeInTheDocument()
      expect(screen.getByTestId('repo-content-grid')).toBeInTheDocument()
    })
  })
})
