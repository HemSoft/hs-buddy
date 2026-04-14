import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoIssueDetailPanel } from './RepoIssueDetailPanel'

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
    fetchRepoIssueDetail: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDateFull: () => 'Jan 15, 2024',
  formatDistanceToNow: () => '3 days ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({ default: {} }))

/* ── test data ── */
const mockIssueDetail = {
  number: 42,
  title: 'Fix login bug',
  state: 'open',
  stateReason: null,
  author: 'alice',
  body: '## Bug description\nLogin fails for new users.',
  createdAt: '2024-01-10T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  closedAt: null,
  url: 'https://github.com/org/repo/issues/42',
  commentCount: 2,
  milestone: { title: 'v2.0' },
  labels: [
    { name: 'bug', color: 'ff0000' },
    { name: 'priority:high', color: 'ff8800' },
  ],
  assignees: [{ login: 'alice', name: 'Alice Smith', avatarUrl: 'https://avatar.test/alice' }],
  comments: [
    {
      id: 'c1',
      author: 'bob',
      authorAvatarUrl: 'https://avatar.test/bob',
      body: 'I can reproduce this.',
      createdAt: '2024-01-11T10:00:00Z',
      updatedAt: '2024-01-11T10:00:00Z',
      url: 'https://github.com/org/repo/issues/42#issuecomment-1',
    },
  ],
}

describe('RepoIssueDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)
    expect(screen.getByText('Loading issue…')).toBeInTheDocument()
    expect(screen.getByText('org/repo #42')).toBeInTheDocument()
  })

  it('renders issue detail after fetch', async () => {
    mockEnqueue.mockImplementation(async () => mockIssueDetail)

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText(/Fix login bug/)).toBeInTheDocument()
    })
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('displays issue body as markdown', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    const markdowns = screen.getAllByTestId('markdown')
    expect(markdowns[0]).toHaveTextContent('Bug description')
  })

  it('shows empty body message when no description', async () => {
    const issueNoBody = { ...mockIssueDetail, body: '   ' }
    mockGet.mockReturnValue({ data: issueNoBody, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('No description was provided for this issue.')).toBeInTheDocument()
  })

  it('renders labels with correct styles', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('priority:high')).toBeInTheDocument()
  })

  it('renders assignees', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('Alice Smith (alice)')).toBeInTheDocument()
  })

  it('shows no assignees message when empty', async () => {
    const issueNoAssignees = { ...mockIssueDetail, assignees: [] }
    mockGet.mockReturnValue({ data: issueNoAssignees, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('No assignees')).toBeInTheDocument()
  })

  it('shows no labels message when empty', async () => {
    const issueNoLabels = { ...mockIssueDetail, labels: [] }
    mockGet.mockReturnValue({ data: issueNoLabels, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('No labels')).toBeInTheDocument()
  })

  it('renders comments', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('I can reproduce this.')).toBeInTheDocument()
    expect(screen.getByText('1 replies')).toBeInTheDocument()
  })

  it('shows no comments message when empty', async () => {
    const issueNoComments = { ...mockIssueDetail, comments: [], commentCount: 0 }
    mockGet.mockReturnValue({ data: issueNoComments, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
  })

  it('shows closed issue state badge', async () => {
    const closedIssue = { ...mockIssueDetail, state: 'closed', closedAt: '2024-01-14T10:00:00Z' }
    mockGet.mockReturnValue({ data: closedIssue, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('shows milestone value', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    expect(screen.getByText('v2.0')).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('API rate limit'))

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issue')).toBeInTheDocument()
    })
    expect(screen.getByText('API rate limit')).toBeInTheDocument()
  })

  it('opens external link when button is clicked', async () => {
    mockGet.mockReturnValue({ data: mockIssueDetail, fetchedAt: Date.now() })
    const openExternal = vi.fn()
    window.shell = { openExternal } as never

    render(<RepoIssueDetailPanel owner="org" repo="repo" issueNumber={42} />)

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(openExternal).toHaveBeenCalledWith('https://github.com/org/repo/issues/42')
  })
})
