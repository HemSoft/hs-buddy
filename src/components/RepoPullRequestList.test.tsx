import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoPullRequestList } from './RepoPullRequestList'

const { mockEnqueue, mockOpenExternal, mockViewMode, mockIsAbortError, mockCacheGet } = vi.hoisted(
  () => ({
    mockEnqueue: vi.fn(),
    mockOpenExternal: vi.fn(),
    mockViewMode: vi.fn(),
    mockIsAbortError: vi.fn(),
    mockCacheGet: vi.fn(),
  })
)

vi.mock('../hooks/useConfig', () => {
  const accounts = [{ username: 'alice', org: 'test-org' }]
  return {
    useGitHubAccounts: () => ({ accounts, loading: false }),
  }
})

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => mockViewMode(),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockCacheGet(...args),
    set: vi.fn(),
  },
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: (...args: unknown[]) => mockIsAbortError(...args),
  throwIfAborted: () => {},
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoPRs: vi.fn(),
  })),
}))

vi.mock('./shared/ViewModeToggle', () => ({
  ViewModeToggle: () => <div data-testid="view-mode-toggle" />,
}))

function makePR(overrides = {}) {
  return {
    number: 1,
    title: 'Add feature',
    author: 'octocat',
    authorAvatarUrl: 'https://example.com/avatar.png',
    url: 'https://github.com/test-org/hs-buddy/pull/1',
    state: 'open',
    draft: false,
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-02T10:00:00Z',
    headBranch: 'feature-branch',
    baseBranch: 'main',
    labels: [],
    approvalCount: 0,
    assigneeCount: 0,
    iApproved: false,
    ...overrides,
  }
}

describe('RepoPullRequestList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAbortError.mockReturnValue(false)
    mockCacheGet.mockReturnValue(null)
    mockViewMode.mockReturnValue(['card', vi.fn()])
    Object.defineProperty(window, 'shell', {
      value: { openExternal: mockOpenExternal },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('Loading pull requests...')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Network error'))
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load pull requests')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders PR list after loading', async () => {
    const prs = [makePR(), makePR({ number: 2, title: 'Fix bug' })]
    mockEnqueue.mockResolvedValue(prs)
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('shows empty state when no PRs exist', async () => {
    mockEnqueue.mockResolvedValue([])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('No open pull requests')).toBeInTheDocument()
    })
  })

  it('displays PR count in header', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('1 open')).toBeInTheDocument()
    })
  })

  it('calls onOpenPR when a PR is clicked', async () => {
    const onOpenPR = vi.fn()
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('opens external URL when no onOpenPR handler', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy/pull/1')
  })

  it('shows draft badge for draft PRs', async () => {
    mockEnqueue.mockResolvedValue([makePR({ draft: true })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
  })

  it('renders labels on PR items', async () => {
    mockEnqueue.mockResolvedValue([makePR({ labels: [{ name: 'bug', color: 'ff0000' }] })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('bug')).toBeInTheDocument()
    })
  })

  it('shows branch flow information', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
      expect(screen.getByText('feature-branch')).toBeInTheDocument()
    })
  })

  it('shows header with owner/repo', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
      expect(screen.getByText('hs-buddy')).toBeInTheDocument()
    })
  })

  it('shows Open Pull Requests label for open state', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="open" />)

    await waitFor(() => {
      expect(screen.getByText('Open Pull Requests')).toBeInTheDocument()
    })
  })

  it('shows Closed Pull Requests label for closed state', async () => {
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="closed" />)

    await waitFor(() => {
      expect(screen.getByText('Closed Pull Requests')).toBeInTheDocument()
    })
  })

  it('shows approval count when present', async () => {
    mockEnqueue.mockResolvedValue([makePR({ approvalCount: 3 })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('retries fetch on retry button click', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('fail'))
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText(/Retry/)).toBeInTheDocument()
    })

    mockEnqueue.mockResolvedValue([makePR()])
    fireEvent.click(screen.getByText(/Retry/))

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
  })

  it('renders list view mode with table', async () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    mockEnqueue.mockResolvedValue([
      makePR(),
      makePR({ number: 2, title: 'Fix bug', state: 'merged' }),
      makePR({ number: 3, title: 'Closed PR', state: 'closed' }),
      makePR({ number: 4, title: 'Draft PR', draft: true }),
    ])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    // Table headers should be visible
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Author')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()
    expect(screen.getByText('Reviews')).toBeInTheDocument()
    // Draft badge in list view
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows refreshing indicator when loading with existing PRs', async () => {
    let resolveSecond: (value: unknown) => void
    mockEnqueue.mockResolvedValueOnce([makePR()]).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSecond = resolve
        })
    )

    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })

    // Trigger refresh
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(screen.getByText('Refreshing pull requests...')).toBeInTheDocument()
    })

    resolveSecond!([makePR()])
  })

  it('shows approval count in list view', async () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    mockEnqueue.mockResolvedValue([makePR({ approvalCount: 5 })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('handles PR click in list view', async () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    const onOpenPR = vi.fn()
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })

    // In list view, click the table row
    fireEvent.click(screen.getByText('Add feature').closest('tr')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('shows empty state for closed PRs', async () => {
    mockEnqueue.mockResolvedValue([])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="closed" />)

    await waitFor(() => {
      expect(screen.getByText('No closed pull requests')).toBeInTheDocument()
    })
  })

  it('silently ignores abort errors', async () => {
    mockIsAbortError.mockReturnValue(true)
    mockEnqueue.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
    expect(screen.queryByText('Failed to load pull requests')).not.toBeInTheDocument()
  })

  it('uses cached data without calling enqueue', async () => {
    const cachedPRs = [makePR()]
    mockCacheGet.mockReturnValue({ data: cachedPRs })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('renders PR without avatar image in card view when authorAvatarUrl is null', async () => {
    mockEnqueue.mockResolvedValue([makePR({ authorAvatarUrl: null })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-pr-avatar')).not.toBeInTheDocument()
  })

  it('renders PR without avatar image in list view when authorAvatarUrl is null', async () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    mockEnqueue.mockResolvedValue([makePR({ authorAvatarUrl: null })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(document.querySelector('.list-view-avatar')).not.toBeInTheDocument()
  })

  it('hides approval badge in card view when approvalCount is null', async () => {
    mockEnqueue.mockResolvedValue([makePR({ approvalCount: null })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-pr-approvals')).not.toBeInTheDocument()
  })

  it('hides approval badge in list view when approvalCount is null', async () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    mockEnqueue.mockResolvedValue([makePR({ approvalCount: null })])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    expect(document.querySelector('.list-view-approvals')).not.toBeInTheDocument()
  })

  it('handles PR click gracefully when window.shell is undefined', async () => {
    Object.defineProperty(window, 'shell', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    mockEnqueue.mockResolvedValue([makePR()])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })
    // Should not throw when shell is undefined (optional chaining)
    fireEvent.click(screen.getByText('Add feature').closest('button')!)
  })

  it('maps PR detail ID correctly with null optional fields', async () => {
    const nullFieldsPR = makePR({
      authorAvatarUrl: null,
      approvalCount: null,
      assigneeCount: null,
      iApproved: null,
      createdAt: null,
      updatedAt: null,
    })
    const onOpenPR = vi.fn()
    mockEnqueue.mockResolvedValue([nullFieldsPR])
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(onOpenPR).toHaveBeenCalled()
  })
})
