import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockEnqueue, mockCacheGet, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoCommitDetail: vi.fn(),
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

import { RepoCommitDetailPanel } from './RepoCommitDetailPanel'

function makeCommitDetail(overrides = {}) {
  return {
    sha: 'abc123def456789012345678901234567890abcd',
    message: 'Fix login bug\n\nDetailed description of the fix.',
    messageHeadline: 'Fix login bug',
    author: 'octocat',
    authorAvatarUrl: 'https://example.com/avatar.png',
    authoredDate: '2025-06-01T10:00:00Z',
    committedDate: '2025-06-01T10:30:00Z',
    url: 'https://github.com/test-org/hs-buddy/commit/abc123',
    stats: { additions: 10, deletions: 5, total: 15 },
    parents: [{ sha: 'parent123', url: 'https://github.com/test-org/hs-buddy/commit/parent123' }],
    files: [
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 8,
        deletions: 3,
        changes: 11,
        patch: '@@ -1,3 +1,4 @@\n-old\n+new\n context',
        blobUrl: 'https://github.com/test-org/hs-buddy/blob/abc/src/app.ts',
        previousFilename: null,
      },
    ],
    ...overrides,
  }
}

describe('RepoCommitDetailPanel', () => {
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
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)
    expect(screen.getByText('Loading commit...')).toBeInTheDocument()
    expect(screen.getByText(/test-org\/hs-buddy@abc123d/)).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Not found'))
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commit')).toBeInTheDocument()
    })
    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders commit detail after loading', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })
  })

  it('shows author info and avatar', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('octocat')).toBeInTheDocument()
      expect(screen.getByAltText('octocat')).toBeInTheDocument()
    })
  })

  it('shows full SHA', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('abc123def456789012345678901234567890abcd')).toBeInTheDocument()
    })
  })

  it('shows change summary stats', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('+10')).toBeInTheDocument()
      expect(screen.getByText('-5')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()
    })
  })

  it('shows parent commit links', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('parent1')).toBeInTheDocument()
    })
  })

  it('opens parent commit on GitHub', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('parent1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('parent1'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/commit/parent123'
    )
  })

  it('renders file cards', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })
  })

  it('toggles file expansion on click', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('src/app.ts').closest('[role="button"]')!)
    expect(screen.getByText('-old')).toBeInTheDocument()
  })

  it('opens commit on GitHub', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/commit/abc123'
    )
  })

  it('shows message body when different from headline', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      const pre = document.querySelector('.repo-commit-message-body')
      expect(pre).toBeTruthy()
      expect(pre!.textContent).toContain('Detailed description of the fix.')
    })
  })

  it('hides message body when same as headline', async () => {
    mockEnqueue.mockResolvedValue(
      makeCommitDetail({ message: 'Fix login bug', messageHeadline: 'Fix login bug' })
    )
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      const headlines = screen.getAllByText('Fix login bug')
      // Only heading, no pre block
      expect(headlines).toHaveLength(1)
    })
  })

  it('handles keyboard expansion via Enter key', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.getByText('-old')).toBeInTheDocument()
  })
})
