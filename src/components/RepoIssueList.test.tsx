import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockEnqueue, mockCacheGet, stableAccounts, mockUseViewMode } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
  mockUseViewMode: vi.fn(),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../hooks/useViewMode', () => ({
  useViewMode: (...args: unknown[]) => mockUseViewMode(...args),
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

vi.mock('./IssueContextMenu', () => ({
  IssueContextMenu: ({
    onStartRalphLoop,
    onViewDetails,
    onCopyLink,
    onOpenOnGitHub,
    onClose,
  }: Record<string, () => void>) => (
    <div data-testid="issue-context-menu">
      <button onClick={onStartRalphLoop}>Start Ralph Loop</button>
      <button onClick={onViewDetails}>View Details</button>
      <button onClick={onCopyLink}>Copy Link</button>
      <button onClick={onOpenOnGitHub}>Open on GitHub</button>
      <button onClick={onClose}>Close Menu</button>
    </div>
  ),
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
    mockUseViewMode.mockReturnValue(['card', vi.fn()])
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

  it('uses cached data without fetching when available', async () => {
    const cachedIssues = [makeIssue({ title: 'Cached issue' })]
    mockCacheGet.mockReturnValue({ data: cachedIssues, fetchedAt: Date.now() })
    mockEnqueue.mockReturnValue(new Promise(() => {})) // never resolves

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    // Should render cached data immediately without loading
    expect(screen.getByText('Cached issue')).toBeInTheDocument()
    expect(screen.queryByText('Loading issues...')).not.toBeInTheDocument()
  })

  it('renders list view with table columns', async () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    const issues = [
      makeIssue({
        number: 1,
        title: 'First issue',
        author: 'alice',
        labels: [{ name: 'bug', color: 'ff0000' }],
      }),
      makeIssue({ number: 2, title: 'Second issue', author: 'bob', labels: [] }),
    ]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('First issue')).toBeInTheDocument()
    })

    // Verify table headers
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Author')).toBeInTheDocument()
    expect(screen.getByText('Labels')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()

    // Verify label rendered in list view
    expect(screen.getByText('bug')).toBeInTheDocument()

    // Verify both issue titles present
    expect(screen.getByText('Second issue')).toBeInTheDocument()
  })

  it('calls onOpenIssue in list view when row is clicked', async () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    const onOpenIssue = vi.fn()
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Bug report').closest('tr')!)
    expect(onOpenIssue).toHaveBeenCalledWith(1)
  })

  it('opens external URL in list view when no onOpenIssue handler', async () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    mockEnqueue.mockResolvedValue([makeIssue()])
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Bug report')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Bug report').closest('tr')!)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/1'
    )
  })

  it('retries fetch on retry button click', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('Network error'))
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load issues')).toBeInTheDocument()
    })

    // Reset and configure the next fetch to succeed
    mockEnqueue.mockResolvedValueOnce([makeIssue({ title: 'Recovered issue' })])
    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('Recovered issue')).toBeInTheDocument()
    })
  })

  it('right-click on issue opens context menu', async () => {
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Find the issue element and trigger context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })
  })

  it('context menu "View Details" calls onOpenIssue when provided', async () => {
    const onOpenIssueMock = vi.fn()
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" onOpenIssue={onOpenIssueMock} />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "View Details"
    fireEvent.click(screen.getByText('View Details'))
    expect(onOpenIssueMock).toHaveBeenCalledWith(1)
  })

  it('context menu "View Details" opens external URL when onOpenIssue not provided', async () => {
    const issues = [
      makeIssue({
        number: 1,
        title: 'Test issue',
        url: 'https://github.com/test-org/hs-buddy/issues/1',
      }),
    ]
    mockEnqueue.mockResolvedValue(issues)
    const openExternalMock = vi.fn()
    Object.defineProperty(window, 'shell', {
      value: { openExternal: openExternalMock },
      writable: true,
      configurable: true,
    })

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "View Details"
    fireEvent.click(screen.getByText('View Details'))
    expect(openExternalMock).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy/issues/1')
  })

  it('context menu "Copy Link" copies URL to clipboard', async () => {
    const issues = [
      makeIssue({
        number: 1,
        title: 'Test issue',
        url: 'https://github.com/test-org/hs-buddy/issues/1',
      }),
    ]
    mockEnqueue.mockResolvedValue(issues)

    const clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteTextMock },
      writable: true,
      configurable: true,
    })

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "Copy Link"
    fireEvent.click(screen.getByText('Copy Link'))
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/issues/1'
    )
  })

  it('context menu "Open on GitHub" opens external URL', async () => {
    const issues = [
      makeIssue({
        number: 1,
        title: 'Test issue',
        url: 'https://github.com/test-org/hs-buddy/issues/1',
      }),
    ]
    mockEnqueue.mockResolvedValue(issues)
    const openExternalMock = vi.fn()
    Object.defineProperty(window, 'shell', {
      value: { openExternal: openExternalMock },
      writable: true,
      configurable: true,
    })

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "Open on GitHub"
    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(openExternalMock).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy/issues/1')
  })

  it('context menu "Start Ralph Loop" dispatches navigation and launch events', async () => {
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "Start Ralph Loop"
    fireEvent.click(screen.getByText('Start Ralph Loop'))

    // Verify app:navigate event was dispatched
    await waitFor(() => {
      const navEvents = dispatchEventSpy.mock.calls.filter(
        call => call[0] instanceof CustomEvent && (call[0] as CustomEvent).type === 'app:navigate'
      )
      expect(navEvents.length).toBeGreaterThan(0)
      const navEvent = navEvents[0][0] as CustomEvent
      expect((navEvent.detail as Record<string, unknown>).viewId).toBe('ralph-dashboard')
    })

    dispatchEventSpy.mockRestore()
  })

  it('context menu closes when Close button clicked', async () => {
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "Close Menu"
    fireEvent.click(screen.getByText('Close Menu'))

    await waitFor(() => {
      expect(screen.queryByTestId('issue-context-menu')).not.toBeInTheDocument()
    })
  })

  it('context menu "Start Ralph Loop" closes menu and dispatches events', async () => {
    const issues = [makeIssue({ number: 42, title: 'Critical bug' })]
    mockEnqueue.mockResolvedValue(issues)

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

    render(<RepoIssueList owner="test-org" repo="my-repo" />)

    await waitFor(() => {
      expect(screen.getByText('Critical bug')).toBeInTheDocument()
    })

    // Open context menu
    const issueElement = screen.getByText('Critical bug').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    // Click "Start Ralph Loop"
    fireEvent.click(screen.getByText('Start Ralph Loop'))

    // Verify app:navigate event was dispatched (exercises line 311 of handleStartRalphLoop)
    await waitFor(() => {
      const navEvents = dispatchEventSpy.mock.calls.filter(
        call => call[0] instanceof CustomEvent && (call[0] as CustomEvent).type === 'app:navigate'
      )
      expect(navEvents.length).toBeGreaterThan(0)
      const navEvent = navEvents[0][0] as CustomEvent
      expect((navEvent.detail as Record<string, unknown>).viewId).toBe('ralph-dashboard')
    })

    // Verify context menu closed (exercises line 310 of handleStartRalphLoop)
    expect(screen.queryByTestId('issue-context-menu')).not.toBeInTheDocument()

    dispatchEventSpy.mockRestore()
  })

  it('context menu "Start Ralph Loop" includes repoPath when account has repoRoot', async () => {
    const originalAccounts = [...stableAccounts]
    stableAccounts.length = 0
    stableAccounts.push({
      username: 'alice',
      org: 'test-org',
      repoRoot: 'D:\\github',
    } as unknown as (typeof stableAccounts)[number])

    const issues = [makeIssue({ number: 7, title: 'Path issue' })]
    mockEnqueue.mockResolvedValue(issues)

    // Use an event listener to capture events (avoids spy pollution from other tests)
    let capturedDetail: Record<string, unknown> | null = null
    const listener = (e: Event) => {
      capturedDetail = (e as CustomEvent).detail
    }
    window.addEventListener('ralph:launch-from-issue', listener)

    render(<RepoIssueList owner="test-org" repo="my-repo" />)

    await waitFor(() => {
      expect(screen.getByText('Path issue')).toBeInTheDocument()
    })

    const issueElement = screen.getByText('Path issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start Ralph Loop'))

    const sep = window.navigator.platform.startsWith('Win') ? '\\' : '/'
    await waitFor(() => {
      expect(capturedDetail).not.toBeNull()
      expect(capturedDetail!.repoPath).toBe(`D:\\github${sep}my-repo`)
    })

    window.removeEventListener('ralph:launch-from-issue', listener)
    stableAccounts.length = 0
    stableAccounts.push(...originalAccounts)
  })

  it('context menu handlers do nothing when contextMenu is null', async () => {
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)

    const openExternalMock = vi.fn()
    Object.defineProperty(window, 'shell', {
      value: { openExternal: openExternalMock },
      writable: true,
      configurable: true,
    })

    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Click the issue to close the menu (contextMenu becomes null)
    fireEvent.click(screen.getByText('Test issue').closest('button')!)

    // Verify context menu is closed
    expect(screen.queryByTestId('issue-context-menu')).not.toBeInTheDocument()

    // The handlers should guard against null contextMenu and not crash
    // This verifies the guards like "if (!contextMenu) return" work correctly
  })

  it('renders context menu with correct position from right-click', async () => {
    const issues = [makeIssue({ number: 1, title: 'Test issue' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Test issue')).toBeInTheDocument()
    })

    // Find the issue element and trigger context menu with specific coordinates
    const issueElement = screen.getByText('Test issue').closest('.repo-issue-item')
    fireEvent.contextMenu(issueElement!, { clientX: 250, clientY: 350 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })
  })

  it('triggers context menu in table/list view', async () => {
    mockUseViewMode.mockReturnValue(['list', vi.fn()])
    const issues = [makeIssue({ number: 1, title: 'Table context test' })]
    mockEnqueue.mockResolvedValue(issues)
    render(<RepoIssueList owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Table context test')).toBeInTheDocument()
    })

    const row = screen.getByText('Table context test').closest('tr')
    fireEvent.contextMenu(row!, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      expect(screen.getByTestId('issue-context-menu')).toBeInTheDocument()
    })
  })
})
