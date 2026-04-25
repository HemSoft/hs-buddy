import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

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
    fetchRepoIssueDetail: vi.fn(),
  })),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
  formatDateFull: () => 'Jun 1, 2025',
}))

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({
  default: () => {},
}))

import { RepoIssueDetailPanel } from './RepoIssueDetailPanel'

function makeIssueDetail(overrides = {}) {
  return {
    number: 42,
    title: 'Login fails intermittently',
    body: 'When users try to login, it sometimes fails.',
    author: 'octocat',
    state: 'open',
    stateReason: null,
    url: 'https://github.com/test-org/hs-buddy/issues/42',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-02T10:00:00Z',
    closedAt: null,
    commentCount: 2,
    labels: [],
    assignees: [],
    milestone: null,
    comments: [],
    ...overrides,
  }
}

describe('RepoIssueDetailPanel', () => {
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
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)
    expect(screen.getByText('Loading issue…')).toBeInTheDocument()
    expect(screen.getByText('test-org/hs-buddy #42')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Not found'))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issue')).toBeInTheDocument()
    })
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('renders issue detail after loading', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail())
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('#42 Login fails intermittently')).toBeInTheDocument()
    })
  })

  it('shows open state badge', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ state: 'open' }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
    })
  })

  it('shows closed state badge', async () => {
    mockEnqueue.mockResolvedValue(
      makeIssueDetail({ state: 'closed', closedAt: '2025-06-03T10:00:00Z' })
    )
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Closed')).toBeInTheDocument()
    })
  })

  it('renders markdown body', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail())
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByTestId('markdown')).toHaveTextContent(
        'When users try to login, it sometimes fails.'
      )
    })
  })

  it('shows empty body message when no description', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ body: '  ' }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('No description was provided for this issue.')).toBeInTheDocument()
    })
  })

  it('renders labels', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ labels: [{ name: 'bug', color: 'ff0000' }] }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('bug')).toBeInTheDocument()
    })
  })

  it('shows no labels message', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ labels: [] }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('No labels')).toBeInTheDocument()
    })
  })

  it('renders assignees', async () => {
    mockEnqueue.mockResolvedValue(
      makeIssueDetail({
        assignees: [{ login: 'alice', name: 'Alice', avatarUrl: 'https://example.com/a.png' }],
      })
    )
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Alice (alice)')).toBeInTheDocument()
    })
  })

  it('shows no assignees message', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ assignees: [] }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('No assignees')).toBeInTheDocument()
    })
  })

  it('shows milestone when present', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ milestone: { title: 'v1.0' } }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('v1.0')).toBeInTheDocument()
    })
  })

  it('shows None for missing milestone', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ milestone: null }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('None')).toBeInTheDocument()
    })
  })

  it('renders comments', async () => {
    const comments = [
      {
        id: 'c1',
        body: 'I can reproduce this',
        author: 'bob',
        authorAvatarUrl: 'https://example.com/bob.png',
        createdAt: '2025-06-02T12:00:00Z',
        updatedAt: '2025-06-05T15:00:00Z',
        url: 'https://github.com/test-org/hs-buddy/issues/42#issuecomment-1',
      },
    ]
    mockEnqueue.mockResolvedValue(makeIssueDetail({ comments }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument()
    })
  })

  it('shows no comments message', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail({ comments: [] }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('No comments yet.')).toBeInTheDocument()
    })
  })

  it('shows comment count in replies header', async () => {
    const comments = [
      {
        id: 'c1',
        body: 'Comment 1',
        author: 'bob',
        authorAvatarUrl: null,
        createdAt: '2025-06-02T12:00:00Z',
        updatedAt: '2025-06-02T12:00:00Z',
        url: 'https://github.com/issues/42#c1',
      },
      {
        id: 'c2',
        body: 'Comment 2',
        author: 'alice',
        authorAvatarUrl: null,
        createdAt: '2025-06-03T12:00:00Z',
        updatedAt: '2025-06-03T12:00:00Z',
        url: 'https://github.com/issues/42#c2',
      },
    ]
    mockEnqueue.mockResolvedValue(makeIssueDetail({ comments }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('2 replies')).toBeInTheDocument()
    })
  })

  it('uses cached data when available and does not call enqueue', async () => {
    const cachedDetail = makeIssueDetail()
    mockCacheGet.mockReturnValue({ data: cachedDetail })
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    // Should render from cache immediately without loading state
    expect(screen.getByText('#42 Login fails intermittently')).toBeInTheDocument()
    expect(screen.queryByText('Loading issue…')).not.toBeInTheDocument()
    // enqueue should not be called since cache was available
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('clicks refresh button to force-refetch data', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail())
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('#42 Login fails intermittently')).toBeInTheDocument()
    })

    mockEnqueue.mockClear()
    mockEnqueue.mockResolvedValue(makeIssueDetail({ title: 'Updated Title' }))

    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
  })

  it('opens issue on GitHub when button clicked', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail())
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/42'
    )
  })

  it('opens comment link on GitHub', async () => {
    const comments = [
      {
        id: 'c1',
        body: 'Some comment',
        author: 'bob',
        authorAvatarUrl: 'https://example.com/bob.png',
        createdAt: '2025-06-02T12:00:00Z',
        updatedAt: '2025-06-02T12:00:00Z',
        url: 'https://github.com/test-org/hs-buddy/issues/42#issuecomment-1',
      },
    ]
    mockEnqueue.mockResolvedValue(makeIssueDetail({ comments }))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument()
    })

    const linkBtn = document.querySelector('.repo-issue-detail-link-btn') as HTMLElement
    fireEvent.click(linkBtn)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/42#issuecomment-1'
    )
  })

  it('retries on error via retry button', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('Not found'))
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issue')).toBeInTheDocument()
    })

    mockEnqueue.mockResolvedValueOnce(makeIssueDetail())
    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('#42 Login fails intermittently')).toBeInTheDocument()
    })
  })

  it('disables refresh button while loading', async () => {
    mockEnqueue.mockResolvedValue(makeIssueDetail())
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })

    // Simulate a pending refresh
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(screen.getByText('Refresh').closest('button')).toBeDisabled()
    })
  })

  it('shows assignee login only when name is null', async () => {
    mockEnqueue.mockResolvedValue(
      makeIssueDetail({
        assignees: [{ login: 'charlie', name: null, avatarUrl: 'https://example.com/c.png' }],
      })
    )
    render(<RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('charlie')).toBeInTheDocument()
      expect(screen.queryByText(/\(/)).not.toBeInTheDocument()
    })
  })

  it('renders nothing when enqueue resolves with null', async () => {
    mockEnqueue.mockResolvedValue(null)
    const { container } = render(
      <RepoIssueDetailPanel owner="test-org" repo="hs-buddy" issueNumber={42} />
    )
    await waitFor(() => {
      expect(screen.queryByText('Loading issue…')).not.toBeInTheDocument()
    })
    expect(container.innerHTML).toBe('')
  })
})
