import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopilotPromptBox } from './CopilotPromptBox'

const mockUseCopilotActiveCount = vi.fn()

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: () => [
    {
      _id: 'r1',
      prompt: 'Review this PR',
      status: 'completed',
      createdAt: Date.now() - 60000,
    },
    {
      _id: 'r2',
      prompt:
        'A very long prompt that should be truncated because it exceeds the eighty character limit for display',
      status: 'running',
      createdAt: Date.now() - 120000,
    },
  ],
  useCopilotActiveCount: () => mockUseCopilotActiveCount(),
}))

vi.mock('../hooks/useConfig', () => ({
  useCopilotSettings: () => ({
    model: 'gpt-4',
    ghAccount: 'testuser',
    loading: false,
    setModel: vi.fn(),
    setGhAccount: vi.fn(),
  }),
  useGitHubAccounts: () => ({
    accounts: [{ username: 'testuser', org: 'acme' }],
    uniqueUsernames: ['testuser'],
    loading: false,
  }),
}))

vi.mock('./shared/AccountPicker', () => ({
  AccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="account-picker" data-value={value}>
      Account
      <button data-testid="change-account" onClick={() => onChange('other-user')}>
        switch
      </button>
    </div>
  ),
}))

vi.mock('./shared/ModelPicker', () => ({
  ModelPicker: () => <div data-testid="model-picker">Model</div>,
}))

vi.mock('./shared/PremiumUsageBadge', () => ({
  PremiumUsageBadge: () => null,
}))

vi.mock('./InlineDropdown', () => ({
  InlineDropdown: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select data-testid="category-dropdown" value={value} onChange={e => onChange(e.target.value)}>
      <option value="general">General</option>
      <option value="pr-review">PR Review</option>
      <option value="code-analysis">Code Analysis</option>
      <option value="documentation">Documentation</option>
    </select>
  ),
}))

describe('CopilotPromptBox', () => {
  const onOpenResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCopilotActiveCount.mockReturnValue(null)
    Object.defineProperty(window, 'copilot', {
      value: {
        execute: vi.fn().mockResolvedValue({ success: true, resultId: 'new-result-1' }),
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders the prompt textarea', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(
      /ask copilot|type your prompt|what would you like/i
    )
    expect(textarea).toBeTruthy()
  })

  it('renders account picker', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByTestId('account-picker')).toBeTruthy()
  })

  it('renders model picker', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByTestId('model-picker')).toBeTruthy()
  })

  it('renders recent results', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('Review this PR')).toBeTruthy()
  })

  it('truncates long prompts in recent results', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const truncated = screen.getByText(/A very long prompt.*\.\.\./)
    expect(truncated).toBeTruthy()
  })

  it('shows active count badge when there are active tasks', () => {
    mockUseCopilotActiveCount.mockReturnValue({ pending: 1, running: 2 })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('3 active')).toBeTruthy()
  })

  it('does not show active count badge when no active tasks', () => {
    mockUseCopilotActiveCount.mockReturnValue({ pending: 0, running: 0 })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText(/active/)).toBeNull()
  })

  it('submit button is disabled when prompt is empty', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const submitBtn = screen.getByTitle('Send prompt (Ctrl+Enter)')
    expect(submitBtn).toBeDisabled()
  })

  it('submits prompt on button click', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    const submitBtn = screen.getByTitle('Send prompt (Ctrl+Enter)')
    await user.click(submitBtn)
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Test prompt' })
      )
    })
    await waitFor(() => {
      expect(onOpenResult).toHaveBeenCalledWith('new-result-1')
    })
  })

  it('submits prompt on Ctrl+Enter', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalled()
    })
  })

  it('shows error when submit fails', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockResolvedValue({
      success: false,
      error: 'Rate limited',
    })
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(screen.getByText('Rate limited')).toBeTruthy()
    })
  })

  it('shows error when submit throws an exception', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeTruthy()
    })
  })

  it('calls onOpenResult when clicking a recent result', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    await user.click(resultItem)
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('calls onOpenResult when pressing Enter on a recent result', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: 'Enter' })
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('renders header with Copilot SDK title', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('Copilot SDK')).toBeTruthy()
  })

  it('renders Recent header', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('Recent')).toBeTruthy()
  })

  it('calls onOpenResult when pressing Space on a recent result', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: ' ' })
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('does not submit when prompt is only whitespace', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, '   ')
    const submitBtn = screen.getByTitle('Send prompt (Ctrl+Enter)')
    expect(submitBtn).toBeDisabled()
  })

  it('clears prompt after successful submission', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(textarea).toHaveValue('')
    })
  })

  it('does not show active badge when count is null', () => {
    mockUseCopilotActiveCount.mockReturnValue(null)
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText(/active/)).toBeNull()
  })

  it('sends selected category with submission', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const categoryDropdown = screen.getByTestId('category-dropdown')
    fireEvent.change(categoryDropdown, { target: { value: 'pr-review' } })
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Review PR #42')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'pr-review' })
      )
    })
  })

  it('auto-detects account from GitHub URL in prompt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Review https://github.com/acme/repo/pull/1')
    // Wait for debounce
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await waitFor(() => {
      const picker = screen.getByTestId('account-picker')
      expect(picker.getAttribute('data-value')).toBe('testuser')
    })
    vi.useRealTimers()
  })

  it('reverts to default account when URL is removed from prompt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    vi.mocked(window.copilot.execute).mockResolvedValue({ success: true, resultId: 'r' })

    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    // Type a URL to trigger auto-detection
    await user.type(textarea, 'https://github.com/acme/repo/pull/1')
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    // Clear the prompt
    await user.clear(textarea)
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    // Account should revert to default
    await waitFor(() => {
      const picker = screen.getByTestId('account-picker')
      expect(picker.getAttribute('data-value')).toBe('testuser')
    })
    vi.useRealTimers()
  })

  it('syncs local model from config on initialization', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByTestId('model-picker')).toBeTruthy()
  })

  it('sends account metadata with submission', async () => {
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { ghAccount: 'testuser' },
        })
      )
    })
  })

  it('shows "Unknown error" when API returns failure without error message', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockResolvedValue({ success: false })
    const user = userEvent.setup()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await user.type(textarea, 'Test prompt')
    await user.click(screen.getByTitle('Send prompt (Ctrl+Enter)'))
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeTruthy()
    })
  })
})
