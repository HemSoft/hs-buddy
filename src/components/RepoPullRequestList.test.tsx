import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoPullRequestList } from './RepoPullRequestList'

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
    fetchRepoPRs: vi.fn().mockResolvedValue([]),
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
  formatDistanceToNow: () => '2 days ago',
}))

vi.mock('../utils/prDetailView', () => ({
  createPRDetailViewId: (opts: Record<string, unknown>) => `pr-view-${opts.id}`,
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
const mockPRs = [
  {
    number: 10,
    title: 'Add new feature',
    state: 'open',
    draft: false,
    author: 'alice',
    authorAvatarUrl: 'https://avatar.test/alice',
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    url: 'https://github.com/org/repo/pull/10',
    headBranch: 'feature/new',
    baseBranch: 'main',
    labels: [{ name: 'enhancement', color: '00ff00' }],
    approvalCount: 2,
    assigneeCount: 1,
    iApproved: false,
  },
  {
    number: 11,
    title: 'WIP: refactor module',
    state: 'open',
    draft: true,
    author: 'bob',
    authorAvatarUrl: null,
    createdAt: '2024-01-12T10:00:00Z',
    updatedAt: '2024-01-14T10:00:00Z',
    url: 'https://github.com/org/repo/pull/11',
    headBranch: 'refactor/module',
    baseBranch: 'develop',
    labels: [],
    approvalCount: 0,
    assigneeCount: 0,
    iApproved: false,
  },
  {
    number: 12,
    title: 'Merged PR',
    state: 'merged',
    draft: false,
    author: 'charlie',
    authorAvatarUrl: null,
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-13T10:00:00Z',
    url: 'https://github.com/org/repo/pull/12',
    headBranch: 'fix/bug',
    baseBranch: 'main',
    labels: [],
    approvalCount: 1,
    assigneeCount: 0,
    iApproved: true,
  },
]

describe('RepoPullRequestList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoPullRequestList owner="org" repo="repo" />)
    expect(screen.getByText('Loading pull requests...')).toBeInTheDocument()
  })

  it('renders PRs in grid mode', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    expect(screen.getByText('Add new feature')).toBeInTheDocument()
    expect(screen.getByText('WIP: refactor module')).toBeInTheDocument()
    expect(screen.getByText('3 open')).toBeInTheDocument()
  })

  it('shows draft badge for draft PRs', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    const draftBadges = screen.getAllByText('Draft')
    expect(draftBadges.length).toBeGreaterThan(0)
  })

  it('shows branch flow info', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('feature/new')).toBeInTheDocument()
  })

  it('shows approval count when non-zero', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onOpenPR callback when PR is clicked', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })
    const onOpenPR = vi.fn()

    render(<RepoPullRequestList owner="org" repo="repo" onOpenPR={onOpenPR} />)

    fireEvent.click(screen.getByText('Add new feature'))
    expect(onOpenPR).toHaveBeenCalledWith(expect.stringContaining('pr-view-'))
  })

  it('opens external link when no callback', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })
    const openExternal = vi.fn()
    window.shell = { openExternal } as never

    render(<RepoPullRequestList owner="org" repo="repo" />)

    fireEvent.click(screen.getByText('Add new feature'))
    expect(openExternal).toHaveBeenCalledWith('https://github.com/org/repo/pull/10')
  })

  it('shows empty state when no PRs', async () => {
    mockGet.mockReturnValue({ data: [], fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    await waitFor(() => {
      expect(screen.getByText('No open pull requests')).toBeInTheDocument()
    })
  })

  it('shows error state on failure', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('Rate limited'))

    render(<RepoPullRequestList owner="org" repo="repo" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load pull requests')).toBeInTheDocument()
    })
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
  })

  it('shows labels', async () => {
    mockGet.mockReturnValue({ data: mockPRs, fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" />)

    expect(screen.getByText('enhancement')).toBeInTheDocument()
  })

  it('uses closed state label', async () => {
    mockGet.mockReturnValue({ data: [], fetchedAt: Date.now() })

    render(<RepoPullRequestList owner="org" repo="repo" prState="closed" />)

    await waitFor(() => {
      expect(screen.getByText('No closed pull requests')).toBeInTheDocument()
    })
  })
})
