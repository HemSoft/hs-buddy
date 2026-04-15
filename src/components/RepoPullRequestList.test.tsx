import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoPullRequestList } from './RepoPullRequestList'

const mockEnqueue = vi.fn()
const mockOpenExternal = vi.fn()

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
  useViewMode: () => ['grid', vi.fn()],
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
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
})
