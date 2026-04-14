import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RepoDetailPanel } from './RepoDetailPanel'

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
    fetchRepoDetail: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
  usePRSettings: () => ({ refreshInterval: 0 }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

vi.mock('./repo-detail/repoDetailUtils', () => ({
  getLanguageColor: (lang: string) => (lang === 'TypeScript' ? '#3178c6' : '#8b8b8b'),
  getWorkflowStatusInfo: () => ({
    color: 'green',
    icon: () => <span data-testid="workflow-icon" />,
    label: 'Passing',
  }),
}))

vi.mock('./repo-detail/RepoStatsBar', () => ({
  RepoStatsBar: () => <div data-testid="repo-stats-bar" />,
}))

vi.mock('./repo-detail/RepoContentGrid', () => ({
  RepoContentGrid: () => <div data-testid="repo-content-grid" />,
}))

vi.mock('../constants', () => ({
  MS_PER_MINUTE: 60_000,
}))

vi.mock('./RepoDetailPanel.css', () => ({}))

/* ── test data ── */
const mockDetail = {
  name: 'my-repo',
  fullName: 'org/my-repo',
  description: 'A cool repository',
  url: 'https://github.com/org/my-repo',
  homepage: null,
  language: 'TypeScript',
  defaultBranch: 'main',
  visibility: 'public',
  isArchived: false,
  isFork: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
  pushedAt: '2024-06-01T00:00:00Z',
  sizeKB: 1024,
  stargazersCount: 42,
  forksCount: 5,
  watchersCount: 10,
  openIssuesCount: 3,
  topics: ['react', 'typescript'],
  license: 'MIT',
  languages: { TypeScript: 80, JavaScript: 20 },
  recentCommits: [],
  topContributors: [],
  openPRCount: 2,
  latestWorkflowRun: null,
}

describe('RepoDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
    window.shell = { openExternal: vi.fn() } as never
  })

  it('shows loading state with owner/repo', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('Loading repository details...')).toBeInTheDocument()
    expect(screen.getByText('org/my-repo')).toBeInTheDocument()
  })

  it('renders repo detail after fetch', async () => {
    mockEnqueue.mockImplementation(async () => mockDetail)

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    await waitFor(() => {
      expect(screen.getByText('org')).toBeInTheDocument()
    })
    expect(screen.getByText('my-repo')).toBeInTheDocument()
    expect(screen.getByText('A cool repository')).toBeInTheDocument()
    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('uses cached data when available', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('A cool repository')).toBeInTheDocument()
    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('shows error state on fetch failure with retry button', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('Network error'))

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load repository')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows topics when present', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()
  })

  it('shows visibility badge for private repo', async () => {
    const privateDetail = { ...mockDetail, visibility: 'private' }
    mockGet.mockReturnValue({ data: privateDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('private')).toBeInTheDocument()
  })

  it('opens external link to GitHub', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell?.openExternal).toHaveBeenCalledWith('https://github.com/org/my-repo')
  })

  it('shows language with color indicator', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    const dot = document.querySelector('.lang-dot') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.backgroundColor).toBe('#3178c6')
  })

  it('shows archived badge when repo is archived', () => {
    const archivedDetail = { ...mockDetail, isArchived: true }
    mockGet.mockReturnValue({ data: archivedDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('shows license badge when license is present', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByText('MIT')).toBeInTheDocument()
  })

  it('renders child components', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoDetailPanel owner="org" repo="my-repo" />)

    expect(screen.getByTestId('repo-stats-bar')).toBeInTheDocument()
    expect(screen.getByTestId('repo-content-grid')).toBeInTheDocument()
  })
})
