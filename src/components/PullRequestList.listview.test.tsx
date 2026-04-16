import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PullRequestList } from './PullRequestList'

const { mockHandleManualRefresh, mockHandleContextMenu, mockUsePRListData, mockSetViewMode } =
  vi.hoisted(() => ({
    mockHandleManualRefresh: vi.fn(),
    mockHandleContextMenu: vi.fn(),
    mockUsePRListData: vi.fn(),
    mockSetViewMode: vi.fn(),
  }))

vi.mock('./pull-request-list/usePRListData', () => ({
  usePRListData: mockUsePRListData,
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => ['list' as const, mockSetViewMode],
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

const makePr = (overrides = {}) => ({
  source: 'gh',
  id: 1,
  repository: 'test/repo',
  title: 'Fix login bug',
  author: 'octocat',
  authorAvatarUrl: 'https://avatar.example.com',
  url: 'https://github.com/test/repo/pull/1',
  state: 'open',
  updatedAt: '2025-06-01T10:00:00Z',
  threadsUnaddressed: null,
  approvalCount: 0,
  ...overrides,
})

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
  handleContextMenu: mockHandleContextMenu,
  handleBookmarkRepo: vi.fn(),
  handleAIReview: vi.fn(),
  handleRequestCopilotReview: vi.fn(),
  handleAddressComments: vi.fn(),
  handleCopyLink: vi.fn(),
  handleApprove: vi.fn(),
  handleApproveFromMenu: vi.fn(),
  closeContextMenu: vi.fn(),
  getTitle: () => 'My Pull Requests',
}

describe('PullRequestList — list view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders a table with column headers', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr()],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Author')).toBeTruthy()
    expect(screen.getByText('Repo')).toBeTruthy()
    expect(screen.getByText('Updated')).toBeTruthy()
    expect(screen.getByText('Reviews')).toBeTruthy()
  })

  it('renders PR title and number in table row', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ id: 42, title: 'Improve performance' })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('#42')).toBeTruthy()
    expect(screen.getByText(/Improve performance/)).toBeTruthy()
  })

  it('shows merged icon for merged PRs', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ state: 'merged' })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(document.querySelector('.list-view-status-merged')).toBeTruthy()
  })

  it('shows closed icon for closed PRs', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ state: 'closed' })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(document.querySelector('.list-view-status-closed')).toBeTruthy()
  })

  it('shows open icon for open PRs', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ state: 'open' })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(document.querySelector('.list-view-status-open')).toBeTruthy()
  })

  it('shows author with avatar', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ author: 'alice', authorAvatarUrl: 'https://example.com/alice.png' })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('alice')).toBeTruthy()
    const img = document.querySelector('img.list-view-avatar') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toContain('alice.png')
  })

  it('renders author without avatar when authorAvatarUrl is missing', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ author: 'bob', authorAvatarUrl: null })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('bob')).toBeTruthy()
    expect(document.querySelector('img.list-view-avatar')).toBeNull()
  })

  it('shows dash when updatedAt is missing', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ updatedAt: null })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows unaddressed threads count', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ threadsUnaddressed: 3 })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(document.querySelector('.list-view-comments-unresolved')).toBeTruthy()
  })

  it('shows check icon when threads are all addressed', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ threadsUnaddressed: 0 })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(document.querySelector('.list-view-comments-clear')).toBeTruthy()
  })

  it('shows approval count', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ approvalCount: 2 })],
    })
    render(<PullRequestList mode="my-prs" />)
    expect(screen.getByText('2')).toBeTruthy()
    expect(document.querySelector('.list-view-approvals')).toBeTruthy()
  })

  it('calls onOpenPR on row click when provided', () => {
    const onOpenPR = vi.fn()
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ id: 99, source: 'gh', repository: 'org/repo' })],
    })
    render(<PullRequestList mode="my-prs" onOpenPR={onOpenPR} />)
    fireEvent.click(screen.getByText(/Fix login bug/).closest('tr')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('opens external URL on row click when onOpenPR not provided', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr({ url: 'https://github.com/test/repo/pull/1' })],
    })
    render(<PullRequestList mode="my-prs" />)
    fireEvent.click(screen.getByText(/Fix login bug/).closest('tr')!)
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/repo/pull/1')
  })

  it('triggers context menu on right-click', () => {
    mockUsePRListData.mockReturnValue({
      ...defaultData,
      prs: [makePr()],
    })
    render(<PullRequestList mode="my-prs" />)
    fireEvent.contextMenu(screen.getByText(/Fix login bug/).closest('tr')!)
    expect(mockHandleContextMenu).toHaveBeenCalled()
  })
})
