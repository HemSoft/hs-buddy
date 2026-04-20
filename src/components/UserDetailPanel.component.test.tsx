import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/* ── hoisted mocks ── */
const { mockActivity, dataCacheStore, stableAccounts } = vi.hoisted(() => {
  const accounts = [{ username: 'alice', org: 'test-org' }]
  const activity = {
    name: 'Alice Smith',
    bio: 'Engineer',
    company: 'Acme',
    location: 'NYC',
    statusMessage: 'Coding',
    statusEmoji: '💻',
    createdAt: '2020-01-01T00:00:00Z',
    orgRole: 'admin',
    teams: ['engineering', 'platform'],
    recentPRsAuthored: [
      {
        number: 42,
        title: 'Add feature',
        repo: 'test-org/repo',
        state: 'open',
        url: 'https://github.com/test-org/repo/pull/42',
        updatedAt: '2025-06-01T10:00:00Z',
      },
    ],
    recentPRsReviewed: [
      {
        number: 99,
        title: 'Fix bug',
        repo: 'test-org/repo',
        state: 'merged',
        url: 'https://github.com/test-org/repo/pull/99',
        updatedAt: '2025-06-01T10:00:00Z',
      },
    ],
    recentEvents: [
      {
        type: 'PushEvent',
        summary: 'Pushed 3 commits',
        repo: 'test-org/repo',
        createdAt: '2025-06-02T10:00:00Z',
      },
    ],
    openPRCount: 5,
    mergedPRCount: 12,
    activeRepos: ['test-org/repo', 'test-org/lib'],
    commitsToday: 3,
    totalContributions: 500,
    contributionWeeks: null,
    contributionSource: 'public',
  }
  const store: Record<string, { data: unknown; fetchedAt: number }> = {}
  return { mockActivity: activity, dataCacheStore: store, stableAccounts: accounts }
})

const mockOpenExternal = vi.fn()
const mockDispatchEvent = vi.fn()

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: stableAccounts,
    loading: false,
  }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (key: string) => dataCacheStore[key] ?? null,
    set: (key: string, data: unknown) => {
      dataCacheStore[key] = { data, fetchedAt: Date.now() }
    },
    delete: (key: string) => {
      delete dataCacheStore[key]
    },
  },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchUserActivity: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('./ContributionGraph', () => ({
  ContributionGraph: ({ totalContributions }: { totalContributions: number }) => (
    <div data-testid="contribution-graph">Contributions: {totalContributions}</div>
  ),
}))

vi.mock('./UserPremiumUsageSection', () => ({
  UserPremiumUsageSection: ({ username }: { username: string }) => (
    <div data-testid="premium-usage">Premium: {username}</div>
  ),
}))

import { UserDetailPanel } from './UserDetailPanel'

describe('UserDetailPanel (component)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Pre-populate cache so the component renders in 'ready' state immediately
    dataCacheStore['user-activity:v3:test-org/alice'] = {
      data: mockActivity,
      fetchedAt: Date.now(),
    }
    Object.defineProperty(window, 'shell', {
      value: { openExternal: mockOpenExternal },
      writable: true,
      configurable: true,
    })
    const originalDispatchEvent = window.dispatchEvent.bind(window)
    window.dispatchEvent = vi.fn(event => {
      mockDispatchEvent(event)
      return originalDispatchEvent(event)
    })
  })

  it('renders hero section with member login', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getAllByText(/alice/).length).toBeGreaterThan(0)
  })

  it('shows user name from activity data', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument()
  })

  it('shows admin role when orgRole is admin', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText(/Admin/)).toBeInTheDocument()
  })

  it('shows org name in hero section', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getAllByText(/test-org/).length).toBeGreaterThan(0)
  })

  it('shows commit count in hero', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText(/3 commits today/)).toBeInTheDocument()
  })

  it('renders metrics grid', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Commits Today')).toBeInTheDocument()
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
    expect(screen.getByText('Merged (90d)')).toBeInTheDocument()
    expect(screen.getByText('Active Repos')).toBeInTheDocument()
  })

  it('renders authored PR section with PR data', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Authored')).toBeInTheDocument()
    expect(screen.getByText('Add feature')).toBeInTheDocument()
  })

  it('renders reviewed PR section with PR data', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('renders recent activity section', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    expect(screen.getByText('Pushed 3 commits')).toBeInTheDocument()
  })

  it('renders active repos section', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Active Repositories')).toBeInTheDocument()
    const repoButtons = screen
      .getAllByRole('button')
      .filter(btn => btn.classList.contains('ud-repo-chip'))
    expect(repoButtons.length).toBe(2)
  })

  it('renders premium usage section', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByTestId('premium-usage')).toBeInTheDocument()
  })

  it('opens external profile link', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    fireEvent.click(screen.getByText('Profile'))
    expect(mockOpenExternal).toHaveBeenCalled()
  })

  it('opens PR in external browser when clicking authored PR', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    const prButton = screen.getByText('Add feature').closest('button')
    expect(prButton).not.toBeNull()
    fireEvent.click(prButton!)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/test-org/repo/pull/42')
  })

  it('shows profile metadata', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('Engineer')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('NYC')).toBeInTheDocument()
  })

  it('shows teams in profile metadata', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('engineering, platform')).toBeInTheDocument()
  })

  it('shows status emoji and message', () => {
    render(<UserDetailPanel org="test-org" memberLogin="alice" />)
    expect(screen.getByText('💻')).toBeInTheDocument()
    expect(screen.getByText(/Coding/)).toBeInTheDocument()
  })

  it('shows "No commits today" text when commitsToday is 0', () => {
    dataCacheStore['user-activity:v3:test-org/bob'] = {
      data: { ...mockActivity, commitsToday: 0 },
      fetchedAt: Date.now(),
    }
    render(<UserDetailPanel org="test-org" memberLogin="bob" />)
    expect(screen.getByText(/No commits today/)).toBeInTheDocument()
  })

  it('renders loading state when cache is empty', () => {
    delete dataCacheStore['user-activity:v3:test-org/charlie']
    render(<UserDetailPanel org="test-org" memberLogin="charlie" />)
    // In loading state, metrics show '—' placeholders
    expect(screen.queryByText('Active Repositories')).not.toBeInTheDocument()
  })
})
