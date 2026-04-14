import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoIssueList } from './RepoIssueList'

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
    fetchRepoIssues: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => ['grid', vi.fn()],
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '1 day ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

vi.mock('./shared/ViewModeToggle', () => ({
  ViewModeToggle: ({ mode, onChange }: { mode: string; onChange: (m: string) => void }) => (
    <button data-testid="view-toggle" onClick={() => onChange(mode === 'grid' ? 'list' : 'grid')}>
      {mode}
    </button>
  ),
}))

/* ── test data ── */
const mockIssues = [
  {
    number: 1,
    title: 'Fix auth flow',
    state: 'open',
    author: 'alice',
    authorAvatarUrl: 'https://avatar.test/alice',
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    url: 'https://github.com/org/repo/issues/1',
    commentCount: 3,
    labels: [{ name: 'bug', color: 'ff0000' }],
    assignees: [{ login: 'alice', name: 'Alice', avatarUrl: 'https://avatar.test/alice' }],
  },
  {
    number: 2,
    title: 'Add dashboard widget',
    state: 'open',
    author: 'bob',
    authorAvatarUrl: null,
    createdAt: '2024-01-12T10:00:00Z',
    updatedAt: '2024-01-14T10:00:00Z',
    url: 'https://github.com/org/repo/issues/2',
    commentCount: 0,
    labels: [],
    assignees: [],
  },
]

describe('RepoIssueList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoIssueList owner="org" repo="repo" />)
    expect(screen.getByText('Loading issues...')).toBeInTheDocument()
  })

  it('renders issues in grid mode', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" />)

    expect(screen.getByText('Fix auth flow')).toBeInTheDocument()
    expect(screen.getByText('Add dashboard widget')).toBeInTheDocument()
    expect(screen.getByText('2 open')).toBeInTheDocument()
  })

  it('shows labels with styling', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" />)

    const labels = screen.getAllByText('bug')
    expect(labels.length).toBeGreaterThan(0)
  })

  it('calls onOpenIssue when issue is clicked', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })
    const onOpenIssue = vi.fn()

    render(<RepoIssueList owner="org" repo="repo" onOpenIssue={onOpenIssue} />)

    fireEvent.click(screen.getByText('Fix auth flow'))
    expect(onOpenIssue).toHaveBeenCalledWith(1)
  })

  it('opens external link when no callback', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })
    const openExternal = vi.fn()
    window.shell = { openExternal } as never

    render(<RepoIssueList owner="org" repo="repo" />)

    fireEvent.click(screen.getByText('Fix auth flow'))
    expect(openExternal).toHaveBeenCalledWith('https://github.com/org/repo/issues/1')
  })

  it('shows empty state when no issues', async () => {
    mockGet.mockReturnValue({ data: [], fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" />)

    expect(screen.getByText('No open issues')).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('API limit'))

    render(<RepoIssueList owner="org" repo="repo" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issues')).toBeInTheDocument()
    })
    expect(screen.getByText('API limit')).toBeInTheDocument()
  })

  it('uses closed state label', async () => {
    mockGet.mockReturnValue({ data: [], fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" issueState="closed" />)

    expect(screen.getByText('No closed issues')).toBeInTheDocument()
  })

  it('shows comment count when non-zero', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" />)

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders assignee avatars', async () => {
    mockGet.mockReturnValue({ data: mockIssues, fetchedAt: Date.now() })

    render(<RepoIssueList owner="org" repo="repo" />)

    const avatar = screen.getByTitle('Alice (alice)')
    expect(avatar).toBeInTheDocument()
  })
})
