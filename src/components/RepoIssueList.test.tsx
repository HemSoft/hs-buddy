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

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => ['grid', vi.fn()],
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoIssues: vi.fn(),
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

vi.mock('./shared/ViewModeToggle', () => ({
  ViewModeToggle: () => <div data-testid="view-mode-toggle" />,
}))

import { RepoIssueList } from './RepoIssueList'

function makeIssue(overrides = {}) {
  return {
    number: 1,
    title: 'Bug report',
    author: 'octocat',
    authorAvatarUrl: 'https://example.com/avatar.png',
    url: 'https://github.com/test-org/hs-buddy/issues/1',
    state: 'open',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-02T10:00:00Z',
    labels: [],
    commentCount: 0,
    assignees: [],
    ...overrides,
  }
}

describe('RepoIssueList', () => {
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
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('Loading issues...')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Network error'))
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issues')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders issue list after loading', async () => {
    const issues = [makeIssue(), makeIssue({ number: 2, title: 'Feature request' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })
    expect(screen.getByText('Feature request')).toBeInTheDocument()
  })

  it('shows empty state when no issues exist', async () => {
    mockEnqueue.mockResolvedValue([])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('No open issues')).toBeInTheDocument()
    })
  })

  it('displays issue count in header', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('1 open')).toBeInTheDocument()
    })
  })

  it('calls onOpenIssue when an issue is clicked', async () => {
    const onOpenIssue = vi.fn()
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Bug report').closest('button')!)
    expect(onOpenIssue).toHaveBeenCalledWith(1)
  })

  it('opens external URL when no onOpenIssue handler', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Bug report').closest('button')!)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/1'
    )
  })

  it('renders labels on issue items', async () => {
    mockEnqueue.mockResolvedValue([makeIssue({ labels: [{ name: 'bug', color: 'ff0000' }] })])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('bug')).toBeInTheDocument()
    })
  })

  it('shows comment count when present', async () => {
    mockEnqueue.mockResolvedValue([makeIssue({ commentCount: 5 })])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('shows assignee avatars', async () => {
    const assignees = [
      { login: 'alice', name: 'Alice', avatarUrl: 'https://example.com/alice.png' },
    ]
    mockEnqueue.mockResolvedValue([makeIssue({ assignees })])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByAltText('alice')).toBeInTheDocument()
    })
  })

  it('shows +N when more than 3 assignees', async () => {
    const assignees = [
      { login: 'a1', name: null, avatarUrl: 'https://example.com/a1.png' },
      { login: 'a2', name: null, avatarUrl: 'https://example.com/a2.png' },
      { login: 'a3', name: null, avatarUrl: 'https://example.com/a3.png' },
      { login: 'a4', name: null, avatarUrl: 'https://example.com/a4.png' },
    ]
    mockEnqueue.mockResolvedValue([makeIssue({ assignees })])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('+1')).toBeInTheDocument()
    })
  })

  it('shows Open Issues label for open state', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" issueState="open" />)

    await waitFor(() => {
      expect(screen.getByText('Open Issues')).toBeInTheDocument()
    })
  })

  it('shows Closed Issues label for closed state', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" issueState="closed" />)

    await waitFor(() => {
      expect(screen.getByText('Closed Issues')).toBeInTheDocument()
    })
  })

  it('shows header with owner/repo', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
      expect(screen.getByText('hs-buddy')).toBeInTheDocument()
    })
  })

  it('opens external link via dedicated button', async () => {
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })

    const externalBtn = screen.getByTitle('Open issue on GitHub')
    fireEvent.click(externalBtn)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/1'
    )
  })
})
