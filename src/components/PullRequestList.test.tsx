import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PullRequestList } from './PullRequestList'

const { mockHandleManualRefresh, mockUsePRListData } = vi.hoisted(() => ({
  mockHandleManualRefresh: vi.fn(),
  mockUsePRListData: vi.fn(),
}))

vi.mock('./pull-request-list/usePRListData', () => ({
  usePRListData: mockUsePRListData,
}))

vi.mock('./pull-request-list/PRItem', () => ({
  PRItem: ({ pr }: { pr: { title: string } }) => <div data-testid="pr-item">{pr.title}</div>,
}))

vi.mock('./pull-request-list/PRContextMenu', () => ({
  PRContextMenu: () => <div data-testid="context-menu" />,
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
})
