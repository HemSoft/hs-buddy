import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CopilotResultPanel } from './CopilotResultPanel'

/* ── mocks ── */
const mockRemove = vi.fn()
const mockUseCopilotResult = vi.fn()

vi.mock('../hooks/useConvex', () => ({
  useCopilotResult: (...args: unknown[]) => mockUseCopilotResult(...args),
  useCopilotResultMutations: () => ({ remove: mockRemove }),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: [{ username: 'user', token: 'tok', org: 'org' }] }),
}))

vi.mock('../hooks/useExternalMarkdownLinks', () => ({
  useExternalMarkdownLinks: vi.fn(),
}))

const mockAddPRComment = vi.fn().mockResolvedValue(undefined)
vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return { addPRComment: mockAddPRComment }
  }),
}))

vi.mock('./shared/statusDisplay', () => ({
  getStatusIcon: () => <span data-testid="status-icon">●</span>,
  getStatusLabel: (_status: string, _short?: boolean) => 'Completed',
}))

vi.mock('../utils/dateUtils', () => ({
  formatDateFull: () => 'Jan 15, 2024',
  formatDuration: () => '1m 30s',
}))

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({ default: {} }))

describe('CopilotResultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddPRComment.mockResolvedValue(undefined)
    Object.defineProperty(window, 'copilot', {
      value: { execute: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state when result is undefined', () => {
    mockUseCopilotResult.mockReturnValue(undefined)

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Loading result...')).toBeInTheDocument()
  })

  it('shows error state when result is null', () => {
    mockUseCopilotResult.mockReturnValue(null)

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Result not found')).toBeInTheDocument()
  })

  it('renders completed result with markdown', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review this PR',
      result: '# Great PR\nLooks good.',
      status: 'completed',
      category: 'general',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 90000,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Copilot Result')).toBeInTheDocument()
    expect(screen.getByText('Review this PR')).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toHaveTextContent('Great PR')
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
    expect(screen.getByText('1m 30s')).toBeInTheDocument()
  })

  it('shows pending status with waiting message', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Analyze code',
      result: null,
      status: 'pending',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Waiting to start...')).toBeInTheDocument()
  })

  it('shows running status with working message', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Analyze code',
      result: null,
      status: 'running',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Copilot is working...')).toBeInTheDocument()
  })

  it('shows failed status with error message', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Analyze code',
      result: null,
      status: 'failed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: 'Model overloaded',
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('Prompt execution failed')).toBeInTheDocument()
    expect(screen.getByText('Model overloaded')).toBeInTheDocument()
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0)
  })

  it('shows PR review title when category is pr-review', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review',
      result: 'Looks good',
      status: 'completed',
      category: 'pr-review',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 5000,
      metadata: {
        prTitle: 'Add auth flow',
        org: 'org',
        repo: 'repo',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
      },
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByText('PR Review: Add auth flow')).toBeInTheDocument()
  })

  it('calls copy handler', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: 'Some result text',
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const copyBtn = screen.getByTitle('Copy markdown')
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Some result text')
    })
  })

  it('calls delete handler', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: 'text',
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const deleteBtn = screen.getByTitle('Delete result')
    fireEvent.click(deleteBtn)
    expect(mockRemove).toHaveBeenCalledWith({ id: 'r1' })
  })

  it('shows publish button for PR reviews with complete metadata', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review',
      result: 'Good PR',
      status: 'completed',
      category: 'pr-review',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 5000,
      metadata: {
        prTitle: 'PR',
        org: 'org',
        repo: 'repo',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
      },
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.getByTitle('Publish review as PR comment')).toBeInTheDocument()
  })

  it('does not show publish button for non-PR-review results', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: 'text',
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.queryByTitle('Publish review as PR comment')).not.toBeInTheDocument()
  })

  it('retries prompt on re-run button click', async () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review this PR',
      result: 'Great PR',
      status: 'completed',
      category: 'pr-review',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 5000,
      metadata: { org: 'org', repo: 'repo', prNumber: 42 },
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const retryBtn = screen.getByTitle('Re-run this prompt')
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith({
        prompt: 'Review this PR',
        category: 'pr-review',
        metadata: { org: 'org', repo: 'repo', prNumber: 42 },
      })
    })
  })

  it('publishes review to PR on publish button click', async () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review',
      result: 'Good PR',
      status: 'completed',
      category: 'pr-review',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 5000,
      metadata: {
        prTitle: 'PR',
        org: 'org',
        repo: 'repo',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
      },
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const publishBtn = screen.getByTitle('Publish review as PR comment')
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(mockAddPRComment).toHaveBeenCalledWith(
        'org',
        'repo',
        42,
        expect.stringContaining('Good PR')
      )
    })

    await waitFor(() => {
      expect(screen.getByTitle('Published to PR')).toBeInTheDocument()
    })
  })

  it('opens PR on GitHub when clicking external link', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Review',
      result: 'Good PR',
      status: 'completed',
      category: 'pr-review',
      model: 'gpt-4o',
      createdAt: 1705312800000,
      duration: 5000,
      metadata: {
        prTitle: 'PR',
        org: 'org',
        repo: 'repo',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
      },
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const openBtn = screen.getByTitle('Open PR on GitHub')
    fireEvent.click(openBtn)

    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/org/repo/pull/42')
  })

  it('does not render markdown when completed but result is null', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: null,
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument()
  })

  it('clears copied state after 2 seconds', async () => {
    vi.useFakeTimers()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: 'Some text',
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    const copyBtn = screen.getByTitle('Copy markdown')

    await act(async () => {
      fireEvent.click(copyBtn)
    })

    expect(screen.getByTitle('Copied!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByTitle('Copy markdown')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('does not show open-PR button for non-PR-review results', () => {
    mockUseCopilotResult.mockReturnValue({
      _id: 'r1',
      prompt: 'Test',
      result: 'text',
      status: 'completed',
      category: 'general',
      model: null,
      createdAt: 1705312800000,
      duration: null,
      metadata: null,
      error: null,
    })

    render(<CopilotResultPanel resultId="r1" />)

    expect(screen.queryByTitle('Open PR on GitHub')).not.toBeInTheDocument()
  })
})
