import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  useCopilotResult: vi.fn(),
  remove: vi.fn(),
  useGitHubAccounts: vi.fn(() => ({ accounts: [] })),
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
})
