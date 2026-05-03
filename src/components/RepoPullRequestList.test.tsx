import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RepoPullRequestList } from './RepoPullRequestList'

const { mockOpenExternal, mockViewMode, mockRefresh, mockUseGitHubData } = vi.hoisted(() => ({
  mockOpenExternal: vi.fn(),
  mockViewMode: vi.fn(),
  mockRefresh: vi.fn(),
  mockUseGitHubData: vi.fn(),
}))

vi.mock('../hooks/useGitHubData', () => ({
  useGitHubData: (...args: unknown[]) => mockUseGitHubData(...args),
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: () => mockViewMode(),
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
    mockViewMode.mockReturnValue(['card', vi.fn()])
    mockRefresh.mockImplementation(() => Promise.resolve())
    Object.defineProperty(window, 'shell', {
      value: { openExternal: mockOpenExternal },
      writable: true,
      configurable: true,
    })
  })

  function setupHook(overrides: Partial<ReturnType<typeof mockUseGitHubData>> = {}) {
    mockUseGitHubData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: mockRefresh,
      ...overrides,
    })
  }

  it('shows loading state initially', () => {
    setupHook({ data: null, loading: true })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('Loading pull requests...')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    setupHook({ data: null, loading: false, error: 'Network error' })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Failed to load pull requests')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders PR list after loading', () => {
    setupHook({ data: [makePR(), makePR({ number: 2, title: 'Fix bug' })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('shows empty state when no PRs exist', () => {
    setupHook({ data: [], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('No open pull requests')).toBeInTheDocument()
  })

  it('displays PR count in header', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('1 open')).toBeInTheDocument()
  })

  it('calls onOpenPR when a PR is clicked', () => {
    const onOpenPR = vi.fn()
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('opens external URL when no onOpenPR handler', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy/pull/1')
  })

  it('shows draft badge for draft PRs', () => {
    setupHook({ data: [makePR({ draft: true })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders labels on PR items', () => {
    setupHook({ data: [makePR({ labels: [{ name: 'bug', color: 'ff0000' }] })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('bug')).toBeInTheDocument()
  })

  it('shows branch flow information', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('feature-branch')).toBeInTheDocument()
  })

  it('shows header with owner/repo', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('test-org')).toBeInTheDocument()
    expect(screen.getByText('hs-buddy')).toBeInTheDocument()
  })

  it('shows Open Pull Requests label for open state', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="open" />)

    expect(screen.getByText('Open Pull Requests')).toBeInTheDocument()
  })

  it('shows Closed Pull Requests label for closed state', () => {
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="closed" />)

    expect(screen.getByText('Closed Pull Requests')).toBeInTheDocument()
  })

  it('shows approval count when present', () => {
    setupHook({ data: [makePR({ approvalCount: 3 })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('calls refresh on retry button click', () => {
    setupHook({ data: null, loading: false, error: 'fail' })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    fireEvent.click(screen.getByText(/Retry/))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('renders list view mode with table', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({
      data: [
        makePR(),
        makePR({ number: 2, title: 'Fix bug', state: 'merged' }),
        makePR({ number: 3, title: 'Closed PR', state: 'closed' }),
        makePR({ number: 4, title: 'Draft PR', draft: true }),
      ],
      loading: false,
    })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Author')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()
    expect(screen.getByText('Reviews')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows refreshing indicator when loading with existing PRs', () => {
    setupHook({ data: [makePR()], loading: true })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Refreshing pull requests...')).toBeInTheDocument()
  })

  it('shows approval count in list view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: 5 })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('handles PR click in list view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    const onOpenPR = vi.fn()
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    fireEvent.click(screen.getByText('Add feature').closest('tr')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('shows empty state for closed PRs', () => {
    setupHook({ data: [], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="closed" />)

    expect(screen.getByText('No closed pull requests')).toBeInTheDocument()
  })

  it('passes correct options to useGitHubData', () => {
    setupHook({ data: null, loading: true })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" prState="open" />)

    expect(mockUseGitHubData).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheKey: 'repo-prs:open:test-org/hs-buddy',
        taskName: 'repo-prs-open-test-org-hs-buddy',
      })
    )
  })

  it('renders PR without avatar image in card view when authorAvatarUrl is null', () => {
    setupHook({ data: [makePR({ authorAvatarUrl: null })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(document.querySelector('.repo-pr-avatar')).not.toBeInTheDocument()
  })

  it('renders PR without avatar image in list view when authorAvatarUrl is null', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ authorAvatarUrl: null })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(document.querySelector('.list-view-avatar')).not.toBeInTheDocument()
  })

  it('hides approval badge in card view when approvalCount is null', () => {
    setupHook({ data: [makePR({ approvalCount: null })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(document.querySelector('.repo-pr-approvals')).not.toBeInTheDocument()
  })

  it('hides approval badge in list view when approvalCount is null', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: null })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(document.querySelector('.list-view-approvals')).not.toBeInTheDocument()
  })

  it('handles PR click gracefully when window.shell is undefined', () => {
    Object.defineProperty(window, 'shell', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    setupHook({ data: [makePR()], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)

    // Should not throw when shell is undefined (optional chaining)
    fireEvent.click(screen.getByText('Add feature').closest('button')!)
  })

  it('maps PR detail ID correctly with null optional fields', () => {
    const nullFieldsPR = makePR({
      authorAvatarUrl: null,
      approvalCount: null,
      assigneeCount: null,
      iApproved: null,
      createdAt: null,
      updatedAt: null,
    })
    const onOpenPR = vi.fn()
    setupHook({ data: [nullFieldsPR], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('falls back to full URL when url segment [4] is missing', () => {
    const malformedPR = makePR({ url: 'https://github.com' })
    const onOpenPR = vi.fn()
    setupHook({ data: [malformedPR], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" onOpenPR={onOpenPR} />)

    fireEvent.click(screen.getByText('Add feature').closest('button')!)
    expect(onOpenPR).toHaveBeenCalled()
  })

  it('shows unresolved threads badge in table view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ threadsUnaddressed: 3 })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(document.querySelector('.list-view-comments-unresolved')).toBeTruthy()
  })

  it('shows clear check when zero unresolved threads in table view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ threadsUnaddressed: 0 })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(document.querySelector('.list-view-comments-clear')).toBeTruthy()
  })

  it('shows approvals with mine class when iApproved in table view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: 2, iApproved: true })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(document.querySelector('.list-view-approvals--mine')).toBeTruthy()
  })

  it('shows approvals without mine class when not iApproved in table view', () => {
    mockViewMode.mockReturnValue(['list', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: 1, iApproved: false })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    const el = document.querySelector('.list-view-approvals')
    expect(el).toBeTruthy()
    expect(el?.className).not.toContain('mine')
  })

  it('shows approvals with mine class in card view', () => {
    mockViewMode.mockReturnValue(['card', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: 2, iApproved: true })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    expect(document.querySelector('.repo-pr-approvals--mine')).toBeTruthy()
  })

  it('shows approvals without mine class in card view', () => {
    mockViewMode.mockReturnValue(['card', vi.fn()])
    setupHook({ data: [makePR({ approvalCount: 1, iApproved: false })], loading: false })
    render(<RepoPullRequestList owner="test-org" repo="hs-buddy" />)
    const el = document.querySelector('.repo-pr-approvals')
    expect(el).toBeTruthy()
    expect(el?.className).not.toContain('mine')
  })
})
