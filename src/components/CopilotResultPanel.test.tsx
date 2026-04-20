import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  useCopilotResult: vi.fn(),
  remove: vi.fn(),
  useGitHubAccounts: vi.fn((): { accounts: Array<{ username: string; org: string }> } => ({
    accounts: [],
  })),
  addPRComment: vi.fn(),
}))

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown-preview">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({ default: () => {} }))

vi.mock('../hooks/useConvex', () => ({
  useCopilotResult: (...args: unknown[]) => mocks.useCopilotResult(...args),
  useCopilotResultMutations: () => ({ remove: mocks.remove }),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => mocks.useGitHubAccounts(),
}))

vi.mock('../api/github', () => ({
  GitHubClient: function () {
    return { addPRComment: (...args: unknown[]) => mocks.addPRComment(...args) }
  },
}))

vi.mock('../hooks/useExternalMarkdownLinks', () => ({
  useExternalMarkdownLinks: () => {},
}))

let mockResult: Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockResult = {
    _id: 'result-1',
    prompt: 'Summarize this code',
    result: '# Summary\nThis is the result.',
    status: 'completed',
    category: 'general',
    model: 'gpt-4',
    createdAt: '2025-01-15T10:30:00Z',
    duration: 2500,
    metadata: null,
    error: null,
  }
  mocks.useCopilotResult.mockImplementation(() => mockResult)

  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'copilot', {
    value: { execute: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

// Lazy import so mocks are registered first
const { CopilotResultPanel } = await import('./CopilotResultPanel')

describe('CopilotResultPanel', () => {
  it('shows loading state when result is undefined', () => {
    mocks.useCopilotResult.mockReturnValue(undefined)
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Loading result...')).toBeInTheDocument()
  })

  it('shows "Result not found" when result is null', () => {
    mocks.useCopilotResult.mockReturnValue(null)
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Result not found')).toBeInTheDocument()
  })

  it('shows completed result with markdown preview', () => {
    render(<CopilotResultPanel resultId="r1" />)
    const preview = screen.getByTestId('markdown-preview')
    expect(preview).toBeInTheDocument()
    expect(preview).toHaveTextContent('# Summary')
    expect(preview).toHaveTextContent('This is the result.')
  })

  it('shows pending status with "Waiting to start..."', () => {
    mockResult.status = 'pending'
    mockResult.result = null
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Waiting to start...')).toBeInTheDocument()
  })

  it('shows running status with "Copilot is working..."', () => {
    mockResult.status = 'running'
    mockResult.result = null
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Copilot is working...')).toBeInTheDocument()
  })

  it('shows failed status with error detail and retry button', () => {
    mockResult.status = 'failed'
    mockResult.result = null
    mockResult.error = 'Rate limit exceeded'
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Prompt execution failed')).toBeInTheDocument()
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows PR Review title when category is pr-review with prTitle', () => {
    mockResult.category = 'pr-review'
    mockResult.metadata = { prTitle: 'Fix login bug', org: 'acme', repo: 'web', prNumber: 42 }
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('PR Review: Fix login bug')).toBeInTheDocument()
  })

  it('shows generic "Copilot Result" title for non-PR results', () => {
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.getByText('Copilot Result')).toBeInTheDocument()
  })

  it('copy button copies result text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    render(<CopilotResultPanel resultId="r1" />)
    const copyBtn = screen.getByTitle('Copy markdown')
    fireEvent.click(copyBtn)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('# Summary\nThis is the result.')
    })
  })

  it('retry button calls window.copilot.execute', async () => {
    const user = userEvent.setup()
    render(<CopilotResultPanel resultId="r1" />)
    const retryBtn = screen.getByTitle('Re-run this prompt')
    await user.click(retryBtn)
    expect(window.copilot.execute).toHaveBeenCalledWith({
      prompt: 'Summarize this code',
      category: 'general',
      metadata: undefined,
    })
  })

  it('delete button calls remove mutation', async () => {
    const user = userEvent.setup()
    render(<CopilotResultPanel resultId="r1" />)
    const deleteBtn = screen.getByTitle('Delete result')
    await user.click(deleteBtn)
    expect(mocks.remove).toHaveBeenCalledWith({ id: 'result-1' })
  })

  it('open PR on GitHub button calls window.shell.openExternal', async () => {
    const user = userEvent.setup()
    mockResult.category = 'pr-review'
    mockResult.metadata = {
      prTitle: 'Fix login bug',
      prUrl: 'https://github.com/acme/web/pull/42',
      org: 'acme',
      repo: 'web',
      prNumber: 42,
    }
    render(<CopilotResultPanel resultId="r1" />)
    const openBtn = screen.getByTitle('Open PR on GitHub')
    await user.click(openBtn)
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/acme/web/pull/42')
  })

  it('logs error when retry fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(window.copilot.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('SDK failure')
    )
    const user = userEvent.setup()
    render(<CopilotResultPanel resultId="r1" />)
    const retryBtn = screen.getByTitle('Re-run this prompt')
    await user.click(retryBtn)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to retry prompt:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('publishes review as PR comment', async () => {
    mocks.addPRComment.mockResolvedValue(undefined)
    mocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'acme' }],
    })
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Looks good!'
    mockResult.model = 'gpt-4'
    mockResult.metadata = { org: 'acme', repo: 'web', prNumber: 42, prTitle: 'Fix bug' }

    render(<CopilotResultPanel resultId="r1" />)

    const publishBtn = screen.getByTitle('Publish review as PR comment')
    expect(publishBtn).not.toBeDisabled()
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(mocks.addPRComment).toHaveBeenCalledWith(
        'acme',
        'web',
        42,
        expect.stringContaining('Looks good!')
      )
    })
    // Should show success state
    await waitFor(() => {
      expect(screen.getByTitle('Published to PR')).toBeInTheDocument()
    })
  })

  it('logs error when publish to PR fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.addPRComment.mockRejectedValueOnce(new Error('API error'))
    mocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'acme' }],
    })
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Review text'
    mockResult.metadata = { org: 'acme', repo: 'web', prNumber: 42, prTitle: 'Fix' }

    const user = userEvent.setup()
    render(<CopilotResultPanel resultId="r1" />)

    const publishBtn = screen.getByTitle('Publish review as PR comment')
    await user.click(publishBtn)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to publish review to PR:', expect.any(Error))
    })
    consoleSpy.mockRestore()
  })

  it('does not show publish button when metadata is missing', () => {
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Review text'
    mockResult.metadata = { org: 'acme' } // missing repo and prNumber
    render(<CopilotResultPanel resultId="r1" />)
    expect(screen.queryByTitle('Publish review as PR comment')).not.toBeInTheDocument()
  })

  it('shows copied state and resets after timeout', async () => {
    vi.useFakeTimers()
    render(<CopilotResultPanel resultId="r1" />)
    const copyBtn = screen.getByTitle('Copy markdown')

    await act(async () => {
      fireEvent.click(copyBtn)
      await Promise.resolve()
    })

    expect(screen.getByTitle('Copied!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByTitle('Copy markdown')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('handlePublishToPR returns early when metadata is null', async () => {
    mocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'acme' }],
    })
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Review text'
    mockResult.metadata = null
    render(<CopilotResultPanel resultId="r1" />)
    // Publish button should not be present when metadata is null
    expect(screen.queryByTitle('Publish review as PR comment')).not.toBeInTheDocument()
  })

  it('copy button does nothing when result.result is empty', async () => {
    mockResult.result = ''
    mockResult.status = 'completed'
    render(<CopilotResultPanel resultId="r1" />)
    // When result is empty, the copy button should not be rendered
    expect(screen.queryByTitle('Copy markdown')).not.toBeInTheDocument()
  })

  it('handlePublishToPR returns early when result becomes empty', async () => {
    mocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'acme' }],
    })
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Review text'
    mockResult.metadata = { org: 'acme', repo: 'web', prNumber: 42, prTitle: 'Fix' }

    render(<CopilotResultPanel resultId="r1" />)
    const publishBtn = screen.getByTitle('Publish review as PR comment')

    // Mutate the shared result object so handler sees empty result
    mockResult.result = ''
    fireEvent.click(publishBtn)

    expect(mocks.addPRComment).not.toHaveBeenCalled()
  })

  it('handlePublishToPR returns early when metadata loses org/repo/prNumber', async () => {
    mocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'acme' }],
    })
    mockResult.category = 'pr-review'
    mockResult.status = 'completed'
    mockResult.result = 'Review text'
    mockResult.metadata = { org: 'acme', repo: 'web', prNumber: 42, prTitle: 'Fix' }

    render(<CopilotResultPanel resultId="r1" />)
    const publishBtn = screen.getByTitle('Publish review as PR comment')

    // Mutate metadata to remove required fields
    ;(mockResult.metadata as Record<string, unknown>).org = undefined
    fireEvent.click(publishBtn)

    expect(mocks.addPRComment).not.toHaveBeenCalled()
  })

  it('retry button with undefined category and metadata calls execute with undefined values', async () => {
    mockResult.category = undefined
    mockResult.metadata = undefined
    const user = userEvent.setup()
    render(<CopilotResultPanel resultId="r1" />)
    const retryBtn = screen.getByTitle('Re-run this prompt')
    await user.click(retryBtn)
    expect(window.copilot.execute).toHaveBeenCalledWith({
      prompt: 'Summarize this code',
      category: undefined,
      metadata: undefined,
    })
  })
})
