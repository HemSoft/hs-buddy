import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { RepoCommit } from '../api/github'

const {
  mockEnqueue,
  mockFetchRepoCommits,
  mockCacheGet,
  mockCacheSet,
  stableAccounts,
  isAbortErrorCtrl,
} = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockFetchRepoCommits: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
  isAbortErrorCtrl: { returnValue: false },
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return { fetchRepoCommits: mockFetchRepoCommits }
  }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: mockCacheSet, isFresh: vi.fn() },
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => isAbortErrorCtrl.returnValue,
  throwIfAborted: () => {},
}))

import { RepoCommitListPanel } from './RepoCommitListPanel'
import { GitHubClient } from '../api/github'

function makeCommit(overrides: Partial<RepoCommit> = {}): RepoCommit {
  return {
    sha: 'abc1234def5678901234567890abcdef12345678',
    message: 'fix: resolve login issue',
    author: 'alice',
    authorAvatarUrl: 'https://avatars.example.com/alice',
    date: '2025-01-15T10:00:00Z',
    url: 'https://github.com/acme/webapp/commit/abc1234',
    ...overrides,
  }
}

function setupEnqueue(result: RepoCommit[]) {
  mockEnqueue.mockResolvedValue(result)
}

function setupEnqueueError(error: Error) {
  mockEnqueue.mockRejectedValue(error)
}

describe('RepoCommitListPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isAbortErrorCtrl.returnValue = false
    mockCacheGet.mockReturnValue(null)
    vi.mocked(GitHubClient).mockImplementation(function () {
      return { fetchRepoCommits: mockFetchRepoCommits } as unknown as GitHubClient
    })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)
    expect(screen.getByText('Loading commits...')).toBeTruthy()
  })

  it('shows commits after fetch', async () => {
    setupEnqueue([
      makeCommit({ message: 'feat: add dashboard' }),
      makeCommit({ sha: 'bbb222', message: 'fix: patch auth' }),
    ])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('feat: add dashboard')).toBeTruthy()
    })
    expect(screen.getByText('fix: patch auth')).toBeTruthy()
  })

  it('shows error state with Retry button', async () => {
    setupEnqueueError(new Error('API rate limit exceeded'))
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commits')).toBeTruthy()
    })
    expect(screen.getByText('API rate limit exceeded')).toBeTruthy()
  })

  it('retries on Retry click', async () => {
    setupEnqueueError(new Error('Network error'))
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commits')).toBeTruthy()
    })

    setupEnqueue([makeCommit()])
    fireEvent.click(screen.getByText(/Retry/))

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })
  })

  it('calls onOpenCommit when clicking a commit', async () => {
    setupEnqueue([makeCommit()])
    const onOpenCommit = vi.fn()
    render(<RepoCommitListPanel owner="acme" repo="webapp" onOpenCommit={onOpenCommit} />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /fix: resolve login issue/i }))
    expect(onOpenCommit).toHaveBeenCalledWith('abc1234def5678901234567890abcdef12345678')
  })

  it('opens external URL when no onOpenCommit', async () => {
    setupEnqueue([makeCommit({ url: 'https://github.com/acme/webapp/commit/abc1234' })])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /fix: resolve login issue/i }))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/acme/webapp/commit/abc1234'
    )
  })

  it('shows empty state when no commits', async () => {
    setupEnqueue([])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('No commits found')).toBeTruthy()
    })
  })

  it('shows truncated SHA (7 chars)', async () => {
    setupEnqueue([makeCommit({ sha: 'deadbeefcafebabe1234567890abcdef12345678' })])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('deadbee')).toBeTruthy()
    })
  })

  it('shows owner/repo in header', async () => {
    setupEnqueue([makeCommit()])
    render(<RepoCommitListPanel owner="myorg" repo="myrepo" />)

    await waitFor(() => {
      expect(screen.getByText('myorg')).toBeTruthy()
    })
    expect(screen.getByText('myrepo')).toBeTruthy()
  })

  it('shows commit count', async () => {
    setupEnqueue([
      makeCommit({ sha: '1111111000000000000000000000000000000000' }),
      makeCommit({ sha: '2222222000000000000000000000000000000000' }),
      makeCommit({ sha: '3333333000000000000000000000000000000000' }),
    ])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('3 recent')).toBeTruthy()
    })
  })

  it('uses cached data when available', () => {
    mockCacheGet.mockReturnValue({
      data: [makeCommit({ message: 'cached commit' })],
      fetchedAt: Date.now(),
    })
    mockEnqueue.mockReturnValue(new Promise(() => {}))

    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    expect(screen.queryByText('Loading commits...')).toBeNull()
    expect(screen.getByText('cached commit')).toBeTruthy()
  })

  it('keyboard Enter triggers commit click', async () => {
    setupEnqueue([makeCommit()])
    const onOpenCommit = vi.fn()
    render(<RepoCommitListPanel owner="acme" repo="webapp" onOpenCommit={onOpenCommit} />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByRole('button', { name: /fix: resolve login issue/i }), {
      key: 'Enter',
    })
    expect(onOpenCommit).toHaveBeenCalled()
  })

  it('keyboard Space triggers commit click', async () => {
    setupEnqueue([makeCommit()])
    const onOpenCommit = vi.fn()
    render(<RepoCommitListPanel owner="acme" repo="webapp" onOpenCommit={onOpenCommit} />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByRole('button', { name: /fix: resolve login issue/i }), {
      key: ' ',
    })
    expect(onOpenCommit).toHaveBeenCalled()
  })

  it('invokes enqueue callback with throwIfAborted and GitHubClient', async () => {
    mockFetchRepoCommits.mockResolvedValue([makeCommit()])
    mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return cb(controller.signal)
    })
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(mockFetchRepoCommits).toHaveBeenCalledWith('acme', 'webapp')
    })
    expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
  })

  it('shows spin class on refresh button while loading', async () => {
    setupEnqueue([makeCommit()])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    mockEnqueue.mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      const icon = document.querySelector('.repo-commits-refresh-btn .spin')
      expect(icon).toBeTruthy()
    })
  })

  it('silently ignores abort errors', async () => {
    isAbortErrorCtrl.returnValue = true
    setupEnqueueError(new DOMException('Aborted', 'AbortError'))
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('No commits found')).toBeTruthy()
    })
    expect(screen.queryByText('Failed to load commits')).toBeNull()
  })

  it('shows loading indicator when refreshing with existing commits', async () => {
    setupEnqueue([makeCommit()])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    mockEnqueue.mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      expect(screen.getByText('Refreshing commit list...')).toBeTruthy()
    })
  })

  it('renders commit without author avatar when authorAvatarUrl is missing', async () => {
    setupEnqueue([makeCommit({ authorAvatarUrl: undefined })])
    render(<RepoCommitListPanel owner="acme" repo="webapp" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })
    expect(document.querySelector('.repo-commit-avatar')).toBeNull()
  })

  it('does not trigger commit click for non-interactive keys', async () => {
    setupEnqueue([makeCommit()])
    const onOpenCommit = vi.fn()
    render(<RepoCommitListPanel owner="acme" repo="webapp" onOpenCommit={onOpenCommit} />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByRole('button', { name: /fix: resolve login issue/i }), {
      key: 'Tab',
    })
    expect(onOpenCommit).not.toHaveBeenCalled()
  })
})
