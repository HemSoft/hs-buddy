import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PullRequestList } from './PullRequestList'

const { mockHandleManualRefresh, mockUsePRListData, mockSetViewMode } = vi.hoisted(() => ({
  mockHandleManualRefresh: vi.fn(),
  mockUsePRListData: vi.fn(),
  mockSetViewMode: vi.fn(),
}))

vi.mock('./pull-request-list/usePRListData', () => ({
  usePRListData: mockUsePRListData,
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => ['card' as const, mockSetViewMode],
}))

vi.mock('./pull-request-list/PRItem', () => ({
  PRItem: ({ pr }: { pr: { title: string } }) => <div data-testid="pr-item">{pr.title}</div>,
}))

vi.mock('./pull-request-list/PRContextMenu', () => ({
  PRContextMenu: () => <div data-testid="context-menu" />,
}))

vi.mock('./shared/ViewModeToggle', () => ({
  ViewModeToggle: () => <div data-testid="view-mode-toggle" />,
}))

const defaultData = {
  prs: [],
  loading: false,
  refreshing: false,
  error: null,
  progress: null,
  totalPrsFound: 0,
  updateTimes: null,
  contextMenu: null,
  approving: new Set(),
  accounts: [{ username: 'testuser' }],
  bookmarkedRepoKeys: new Set(),
  getProgressColor: () => '#4ec9b0',
  handleManualRefresh: mockHandleManualRefresh,
  handleContextMenu: vi.fn(),
  handleBookmarkRepo: vi.fn(),
  handleAIReview: vi.fn(),
  handleCopyLink: vi.fn(),
  handleApprove: vi.fn(),
  handleApproveFromMenu: vi.fn(),
  closeContextMenu: vi.fn(),
  getTitle: () => 'My Pull Requests',
}

describe('PullRequestList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRListData.mockReturnValue(defaultData)
  })

  it('shows empty state when no PRs', () => {
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('No pull requests found')).toBeTruthy()
  })

  it('shows title from getTitle', () => {
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('My Pull Requests')).toBeTruthy()
  })

  it('shows refresh button', () => {
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByTitle('Refresh')).toBeTruthy()
  })

  it('calls handleManualRefresh on click', () => {
    render(<PullRequestList mode="my-prs" />)
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockHandleManualRefresh).toHaveBeenCalled()
  })

  it('shows loading state with progress', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      progress: {
        currentAccount: 1,
        totalAccounts: 3,
        status: 'fetching',
        currentUsername: 'testuser',
        accountName: 'testuser',
        org: 'myorg',
      },
    })

    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Fetching PRs...')).toBeTruthy()
  })

  it('shows error state', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      error: 'Network timeout',
    })

    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText(/Network timeout/)).toBeTruthy()
  })

  it('renders PR items', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [
        { source: 'gh', id: 1, repository: 'test/repo', title: 'Fix login bug' },
        { source: 'gh', id: 2, repository: 'test/repo', title: 'Add feature' },
      ],
      totalPrsFound: 2,
    })

    render(<PullRequestList mode="my-prs" />)
    const items = screen.getAllByTestId('pr-item')
    expect(items).toHaveLength(2)
    expect(screen.getByText('2 PRs')).toBeTruthy()
  })

  it('shows singular PR count for 1 item', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [{ source: 'gh', id: 1, repository: 'test/repo', title: 'Solo PR' }],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('1 PR')).toBeTruthy()
  })

  it('shows loading without progress', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      progress: null,
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Loading pull requests...')).toBeTruthy()
  })

  it('shows loading with authenticating status', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      progress: {
        currentAccount: 1,
        totalAccounts: 2,
        status: 'authenticating',
        accountName: 'alice',
        org: 'acme',
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Authenticating...')).toBeTruthy()
  })

  it('shows loading with done status and prs found', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      progress: {
        currentAccount: 2,
        totalAccounts: 2,
        status: 'done',
        prsFound: 5,
        accountName: 'alice',
        org: 'acme',
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Found 5 PRs')).toBeTruthy()
  })

  it('shows loading with error status', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      progress: {
        currentAccount: 1,
        totalAccounts: 2,
        status: 'error',
        error: 'Token expired',
        accountName: 'alice',
        org: 'acme',
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Error: Token expired')).toBeTruthy()
  })

  it('shows total PRs found during loading', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      loading: true,
      totalPrsFound: 7,
      progress: {
        currentAccount: 1,
        totalAccounts: 3,
        status: 'fetching',
        accountName: 'bob',
        org: 'myorg',
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('7 PRs found so far')).toBeTruthy()
  })

  it('shows error with no accounts hint', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      error: 'No accounts configured',
      accounts: [],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText(/configure at least one GitHub account/)).toBeTruthy()
  })

  it('shows error with auth hint when accounts exist', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      error: 'Request failed',
      accounts: [{ username: 'testuser' }],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText(/authenticated with GitHub CLI/)).toBeTruthy()
  })

  it('shows empty state with update times', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [],
      updateTimes: {
        lastUpdated: '2 min ago',
        nextUpdate: 'in 3 min',
        progress: 40,
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('2 min ago')).toBeTruthy()
    expect(screen.getByText('in 3 min')).toBeTruthy()
  })

  it('shows refreshing state in empty view', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [],
      refreshing: true,
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByTitle('Refresh')).toBeDisabled()
  })

  it('shows update times and refreshing badge in PR list', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [{ source: 'gh', id: 1, repository: 'test/repo', title: 'PR 1' }],
      refreshing: true,
      updateTimes: {
        lastUpdated: '1 min ago',
        nextUpdate: 'in 4 min',
        progress: 20,
      },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Refreshing...')).toBeTruthy()
    expect(screen.getByText('1 min ago')).toBeTruthy()
  })

  it('renders context menu when contextMenu is set', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [{ source: 'gh', id: 1, repository: 'test/repo', title: 'PR 1' }],
      contextMenu: { x: 100, y: 200, pr: { id: 1, title: 'PR 1' } },
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByTestId('context-menu')).toBeTruthy()
  })

  it('shows ViewModeToggle when PRs exist', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [{ source: 'gh', id: 1, repository: 'test/repo', title: 'PR 1' }],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByTestId('view-mode-toggle')).toBeTruthy()
  })
})
