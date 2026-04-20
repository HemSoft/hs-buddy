import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const {
  mockEnqueue,
  mockCacheGet,
  mockCacheSet,
  mockIsAbortError,
  mockFetchRepoCommitDetail,
  stableAccounts,
} = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  mockIsAbortError: vi.fn(() => false),
  mockFetchRepoCommitDetail: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: mockCacheSet, isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoCommitDetail: (...args: unknown[]) => mockFetchRepoCommitDetail(...args),
  })),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: mockIsAbortError,
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

  it('handles keyboard expansion via Space key', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: ' ' })
    expect(screen.getByText('-old')).toBeInTheDocument()
  })

  it('ignores non-activation keys on file header', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Tab' })
    expect(screen.queryByText('-old')).not.toBeInTheDocument()
  })

  it('collapses an expanded file on second click', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.click(header)
    expect(screen.getByText('-old')).toBeInTheDocument()

    fireEvent.click(header)
    expect(screen.queryByText('-old')).not.toBeInTheDocument()
  })

  it('renders from cache without fetching', async () => {
    const cached = makeCommitDetail()
    mockCacheGet.mockReturnValue({ data: cached })
    mockEnqueue.mockReturnValue(new Promise(() => {}))

    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.queryByText('Loading commit...')).not.toBeInTheDocument()
  })

  it('returns null when no detail, no loading, and no error', async () => {
    mockEnqueue.mockResolvedValue(null)
    const { container } = render(
      <RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading commit...')).not.toBeInTheDocument()
    })
    expect(container.querySelector('.repo-commit-detail-container')).toBeNull()
  })

  it('hides avatar when authorAvatarUrl is null', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail({ authorAvatarUrl: null }))
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('octocat')).toBeInTheDocument()
    })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('hides parents section when parents array is empty', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail({ parents: [] }))
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })
    expect(screen.queryByText('Parents')).not.toBeInTheDocument()
  })

  it('shows previousFilename when present', async () => {
    mockEnqueue.mockResolvedValue(
      makeCommitDetail({
        files: [
          {
            filename: 'src/new-name.ts',
            status: 'renamed',
            additions: 0,
            deletions: 0,
            changes: 0,
            patch: null,
            blobUrl: null,
            previousFilename: 'src/old-name.ts',
          },
        ],
      })
    )
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('from src/old-name.ts')).toBeInTheDocument()
    })
  })

  it('hides open-file button when blobUrl is null', async () => {
    mockEnqueue.mockResolvedValue(
      makeCommitDetail({
        files: [
          {
            filename: 'src/app.ts',
            status: 'modified',
            additions: 1,
            deletions: 0,
            changes: 1,
            patch: '+line',
            blobUrl: null,
            previousFilename: null,
          },
        ],
      })
    )
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Open file on GitHub')).not.toBeInTheDocument()
  })

  it('opens file blob URL and stops propagation', async () => {
    mockEnqueue.mockResolvedValue(makeCommitDetail())
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByTitle('Open file on GitHub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Open file on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/blob/abc/src/app.ts'
    )
  })

  it('shows empty diff message for file with no patch', async () => {
    mockEnqueue.mockResolvedValue(
      makeCommitDetail({
        files: [
          {
            filename: 'binary.png',
            status: 'added',
            additions: 0,
            deletions: 0,
            changes: 0,
            patch: null,
            blobUrl: null,
            previousFilename: null,
          },
        ],
      })
    )
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('binary.png')).toBeInTheDocument()
    })

    const header = screen.getByText('binary.png').closest('[role="button"]')!
    fireEvent.click(header)
    expect(screen.getByText(/GitHub did not provide a patch preview/)).toBeInTheDocument()
  })

  it('shows refreshing indicator when loading with existing detail', async () => {
    let resolveEnqueue: (value: unknown) => void
    mockEnqueue
      .mockResolvedValueOnce(makeCommitDetail())
      .mockImplementationOnce(() => new Promise(resolve => (resolveEnqueue = resolve)))

    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      expect(screen.getByText('Refreshing commit details...')).toBeInTheDocument()
    })

    resolveEnqueue!(makeCommitDetail())
  })

  it('retries fetch when Retry button is clicked in error state', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('Network error'))
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commit')).toBeInTheDocument()
    })

    mockEnqueue.mockResolvedValueOnce(makeCommitDetail())
    fireEvent.click(screen.getByText(/Retry/))

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    })
  })

  it('silently ignores abort errors', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockIsAbortError.mockReturnValue(true)
    mockEnqueue.mockRejectedValue(abortError)

    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    // Should not show error state — abort errors are silently ignored
    await waitFor(() => {
      expect(screen.queryByText('Loading commit...')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Failed to load commit')).not.toBeInTheDocument()
  })

  it('renders empty line in patch as a space', async () => {
    mockEnqueue.mockResolvedValue(
      makeCommitDetail({
        files: [
          {
            filename: 'src/app.ts',
            status: 'modified',
            additions: 1,
            deletions: 0,
            changes: 1,
            patch: '+added\n\n context',
            blobUrl: null,
            previousFilename: null,
          },
        ],
      })
    )
    render(<RepoCommitDetailPanel owner="test-org" repo="hs-buddy" sha="abc123d" />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.click(header)

    const diffContainer = document.querySelector('.repo-commit-diff')
    expect(diffContainer).toBeTruthy()
    const lines = diffContainer!.querySelectorAll('div[class*="diff-line"]')
    // The empty line between '+added' and ' context' should render as a space
    const emptyLine = Array.from(lines).find(el => el.textContent === ' ')
    expect(emptyLine).toBeTruthy()
  })
})
