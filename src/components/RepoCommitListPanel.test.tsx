import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoCommitListPanel } from './RepoCommitListPanel'

/* ── mocks ── */
const mockEnqueue = vi.fn()
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockAccounts = [{ username: 'user', token: 'tok', org: 'org' }]

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
  },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoCommits: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '2 days ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

/* ── test data ── */
const mockCommits = [
  {
    sha: 'abc1234567890',
    message: 'fix: resolve login issue',
    author: 'alice',
    authorAvatarUrl: 'https://avatar.test/alice',
    date: '2024-01-15T10:00:00Z',
    url: 'https://github.com/org/repo/commit/abc1234567890',
  },
  {
    sha: 'def9876543210',
    message: 'feat: add new dashboard',
    author: 'bob',
    authorAvatarUrl: null,
    date: '2024-01-14T09:00:00Z',
    url: 'https://github.com/org/repo/commit/def9876543210',
  },
]

describe('RepoCommitListPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('shows loading state when no cached data', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {})) // never resolves
    render(<RepoCommitListPanel owner="org" repo="repo" />)
    expect(screen.getByText('Loading commits...')).toBeInTheDocument()
    expect(screen.getByText('org/repo')).toBeInTheDocument()
  })

  it('renders commits after successful fetch', async () => {
    mockEnqueue.mockImplementation(async () => mockCommits)

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeInTheDocument()
    })
    expect(screen.getByText('feat: add new dashboard')).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('2 recent')).toBeInTheDocument()
  })

  it('uses cached data when available', () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    expect(screen.getByText('fix: resolve login issue')).toBeInTheDocument()
    expect(screen.getByText('2 recent')).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('Network error'))

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commits')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('calls onOpenCommit callback when commit is clicked', async () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })
    const onOpenCommit = vi.fn()

    render(<RepoCommitListPanel owner="org" repo="repo" onOpenCommit={onOpenCommit} />)

    fireEvent.click(screen.getByText('fix: resolve login issue'))
    expect(onOpenCommit).toHaveBeenCalledWith('abc1234567890')
  })

  it('opens external link when no onOpenCommit callback', async () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })
    const openExternal = vi.fn()
    window.shell = { openExternal } as never

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    fireEvent.click(screen.getByText('fix: resolve login issue'))
    expect(openExternal).toHaveBeenCalledWith('https://github.com/org/repo/commit/abc1234567890')
  })

  it('supports keyboard navigation with Enter', async () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })
    const onOpenCommit = vi.fn()

    render(<RepoCommitListPanel owner="org" repo="repo" onOpenCommit={onOpenCommit} />)

    const commitItem = screen.getByText('fix: resolve login issue').closest('[role="button"]')!
    fireEvent.keyDown(commitItem, { key: 'Enter' })
    expect(onOpenCommit).toHaveBeenCalledWith('abc1234567890')
  })

  it('supports keyboard navigation with Space', async () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })
    const onOpenCommit = vi.fn()

    render(<RepoCommitListPanel owner="org" repo="repo" onOpenCommit={onOpenCommit} />)

    const commitItem = screen.getByText('fix: resolve login issue').closest('[role="button"]')!
    fireEvent.keyDown(commitItem, { key: ' ' })
    expect(onOpenCommit).toHaveBeenCalledWith('abc1234567890')
  })

  it('shows empty state when no commits', async () => {
    mockGet.mockReturnValue({ data: [], fetchedAt: Date.now() })

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    expect(screen.getByText('No commits found')).toBeInTheDocument()
  })

  it('renders author avatar when available', async () => {
    mockGet.mockReturnValue({ data: mockCommits, fetchedAt: Date.now() })

    render(<RepoCommitListPanel owner="org" repo="repo" />)

    const avatar = screen.getByAltText('alice')
    expect(avatar).toHaveAttribute('src', 'https://avatar.test/alice')
  })
})
