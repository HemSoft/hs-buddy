import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CopilotPromptBox } from './CopilotPromptBox'

const {
  mockUseCopilotActiveCount,
  mockUseCopilotResultsRecent,
  mockUseCopilotSettings,
  mockUseGitHubAccounts,
} = vi.hoisted(() => ({
  mockUseCopilotActiveCount: vi.fn(),
  mockUseCopilotResultsRecent: vi.fn(),
  mockUseCopilotSettings: vi.fn(),
  mockUseGitHubAccounts: vi.fn(),
}))

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: mockUseCopilotResultsRecent,
  useCopilotActiveCount: mockUseCopilotActiveCount,
}))

vi.mock('../hooks/useConfig', () => ({
  useCopilotSettings: mockUseCopilotSettings,
  useGitHubAccounts: mockUseGitHubAccounts,
}))

vi.mock('./shared/AccountPicker', () => ({
  AccountPicker: ({
    onChange,
    value,
    disabled,
  }: {
    onChange?: (v: string) => void
    value?: string
    disabled?: boolean
  }) => (
    <div data-testid="account-picker">
      <span data-testid="account-value">{value}</span>
      <button
        data-testid="pick-account"
        onClick={() => onChange?.('manualuser')}
        disabled={disabled}
      >
        Pick
      </button>
    </div>
  ),
}))

vi.mock('./shared/ModelPicker', () => ({
  ModelPicker: ({
    onChange,
    value,
    disabled,
  }: {
    onChange?: (v: string) => void
    value?: string
    disabled?: boolean
  }) => (
    <div data-testid="model-picker">
      <span data-testid="model-value">{value}</span>
      <button data-testid="pick-model" onClick={() => onChange?.('gpt-3.5')} disabled={disabled}>
        Pick
      </button>
    </div>
  ),
}))

vi.mock('./shared/PremiumUsageBadge', () => ({
  PremiumUsageBadge: () => null,
}))

vi.mock('./InlineDropdown', () => ({
  InlineDropdown: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select data-testid="category-dropdown" value={value} onChange={e => onChange(e.target.value)}>
      <option value="general">General</option>
      <option value="pr-review">PR Review</option>
    </select>
  ),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '1m ago',
}))

vi.mock('./shared/statusDisplay', () => ({
  getStatusEmoji: (status: string) => (status === 'completed' ? '✅' : '⏳'),
}))

const defaultResults = [
  {
    _id: 'r1',
    prompt: 'Review this PR',
    status: 'completed',
    createdAt: Date.now() - 60000,
  },
]

describe('CopilotPromptBox', () => {
  const onOpenResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCopilotSettings.mockReturnValue({
      model: 'gpt-4',
      ghAccount: 'testuser',
      loading: false,
      setModel: vi.fn(),
      setGhAccount: vi.fn(),
    })
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [
        { username: 'testuser', org: 'acme' },
        { username: 'otheruser', org: 'bigcorp' },
      ],
      uniqueUsernames: ['testuser', 'otheruser'],
      loading: false,
    })
    mockUseCopilotActiveCount.mockReturnValue(0)
    mockUseCopilotResultsRecent.mockReturnValue(defaultResults)
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue({ success: true }),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'copilot', {
      value: {
        execute: vi.fn().mockResolvedValue({ success: true, resultId: 'new-result' }),
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

  it('submits prompt successfully and clears textarea', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Explain this code' } })
    })

    const submitButton = screen.getByTitle(/send prompt/i)
    await act(async () => {
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Explain this code' })
      )
    })

    await waitFor(() => {
      expect(onOpenResult).toHaveBeenCalledWith('new-result')
    })

    await waitFor(() => {
      expect(textarea).toHaveValue('')
    })
  })

  it('shows error when submit returns failure', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockResolvedValueOnce({
      success: false,
      error: 'Bad request',
    })

    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'bad prompt' } })
    })

    const submitButton = screen.getByTitle(/send prompt/i)
    await act(async () => {
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Bad request')).toBeTruthy()
    })
  })

  it('shows error when submit throws an exception', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockRejectedValueOnce(new Error('Network failure'))

    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'will fail' } })
    })

    const submitButton = screen.getByTitle(/send prompt/i)
    await act(async () => {
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeTruthy()
    })
  })

  it('submits via Ctrl+Enter', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'keyboard submit' } })
    })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    })

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'keyboard submit' })
      )
    })
  })

  it('shows active count badge when tasks are active', () => {
    mockUseCopilotActiveCount.mockReturnValue({ pending: 2, running: 1 })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('3 active')).toBeTruthy()
  })

  it('disables submit button when textarea is empty', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const submitButton = screen.getByTitle(/send prompt/i)
    expect(submitButton).toBeDisabled()
  })

  it('opens result tab on recent result click', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR')
    fireEvent.click(resultItem.closest('[role="button"]')!)
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('opens result tab on Enter keydown on recent result', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: 'Enter' })
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('hides recent section when no results exist', () => {
    mockUseCopilotResultsRecent.mockReturnValue([])
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('hides recent section when results are null', () => {
    mockUseCopilotResultsRecent.mockReturnValue(null)
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('does not show active badge when no tasks active', () => {
    mockUseCopilotActiveCount.mockReturnValue({ pending: 0, running: 0 })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText(/active/)).toBeNull()
  })

  it('does not show active badge when activeCount is null', () => {
    mockUseCopilotActiveCount.mockReturnValue(null)
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.queryByText(/active/)).toBeNull()
  })

  it('does not submit when prompt is whitespace only', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '   ' } })
    })
    const submitButton = screen.getByTitle(/send prompt/i)
    expect(submitButton).toBeDisabled()
  })

  it('handles submit result with no error field', async () => {
    const executeMock = window.copilot.execute as ReturnType<typeof vi.fn>
    executeMock.mockResolvedValueOnce({ success: false })

    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test prompt' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeTruthy()
    })
  })

  it('renders Copilot SDK header', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('Copilot SDK')).toBeTruthy()
  })

  it('opens result via Space key on recent result', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: ' ' })
    expect(onOpenResult).toHaveBeenCalledWith('r1')
  })

  it('does not open result on unrelated key', () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: 'Tab' })
    expect(onOpenResult).not.toHaveBeenCalled()
  })

  it('does not submit on Enter without Ctrl', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'should not submit' } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' })
    })
    expect(window.copilot.execute).not.toHaveBeenCalled()
  })

  it('auto-detects GitHub account from URL in prompt', async () => {
    vi.useFakeTimers()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    // Type a prompt with a bigcorp GitHub URL
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Review https://github.com/bigcorp/my-repo/pull/42' },
      })
    })

    // Advance past the 300ms debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // Submit to verify the auto-detected account is used
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(window.copilot.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ghAccount: 'otheruser' }),
      })
    )

    vi.useRealTimers()
  })

  it('reverts to default account when URL is removed from prompt', async () => {
    vi.useFakeTimers()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    // Type URL to trigger auto-detection
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Review https://github.com/bigcorp/repo/pull/1' },
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // Clear the URL
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'just a plain prompt' } })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // Submit to verify we reverted to default account
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(window.copilot.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ghAccount: 'testuser' }),
      })
    )

    vi.useRealTimers()
  })

  it('truncates long recent result prompts', () => {
    const longPrompt = 'A'.repeat(100)
    mockUseCopilotResultsRecent.mockReturnValue([
      { _id: 'r-long', prompt: longPrompt, status: 'completed', createdAt: Date.now() },
    ])
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    // Should show truncated text (80 chars + '...')
    expect(screen.getByText('A'.repeat(80) + '...')).toBeTruthy()
  })

  it('renders without onOpenResult and handles submit gracefully', async () => {
    render(<CopilotPromptBox />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'no callback test' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalled()
    })
  })

  it('renders without onOpenResult and handles recent item click', () => {
    render(<CopilotPromptBox />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.click(resultItem)
    // Should not throw — optional chaining handles undefined onOpenResult
  })

  it('renders without onOpenResult and handles recent item keydown', () => {
    render(<CopilotPromptBox />)
    const resultItem = screen.getByText('Review this PR').closest('[role="button"]')!
    fireEvent.keyDown(resultItem, { key: 'Enter' })
    // Should not throw — optional chaining handles undefined onOpenResult
  })

  it('sends undefined metadata when localAccount is empty', async () => {
    mockUseCopilotSettings.mockReturnValue({
      model: 'gpt-4',
      ghAccount: '',
      loading: false,
      setModel: vi.fn(),
      setGhAccount: vi.fn(),
    })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test empty account' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: undefined })
      )
    })
  })

  it('does not auto-detect when URL org matches no configured account', async () => {
    vi.useFakeTimers()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Check https://github.com/unknownorg/repo/pull/1' },
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // Submit — should still use default account since org didn't match
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(window.copilot.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ghAccount: 'testuser' }),
      })
    )
    vi.useRealTimers()
  })

  it('does not re-detect when URL org matches current account', async () => {
    vi.useFakeTimers()
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)

    // 'acme' org maps to 'testuser' which is already the current account
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Check https://github.com/acme/repo/pull/1' },
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(window.copilot.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ghAccount: 'testuser' }),
      })
    )
    vi.useRealTimers()
  })

  it('submits via Meta+Enter', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'meta submit' } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    })
    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'meta submit' })
      )
    })
  })

  it('AccountPicker onChange updates local account', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('pick-account'))
    })

    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test account change' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ ghAccount: 'manualuser' }),
        })
      )
    })
  })

  it('ModelPicker onChange updates local model', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('pick-model'))
    })

    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test model change' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-3.5' })
      )
    })
  })

  it('InlineDropdown onChange updates category', async () => {
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)

    const categoryDropdown = screen.getByTestId('category-dropdown')
    await act(async () => {
      fireEvent.change(categoryDropdown, { target: { value: 'pr-review' } })
    })

    const textarea = screen.getByPlaceholderText(/ask copilot/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test category' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle(/send prompt/i))
    })

    await waitFor(() => {
      expect(window.copilot.execute).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'pr-review' })
      )
    })
  })

  it('skips initialization when configuredModel is falsy', () => {
    mockUseCopilotSettings.mockReturnValue({
      model: '',
      ghAccount: 'testuser',
      loading: true,
      setModel: vi.fn(),
      setGhAccount: vi.fn(),
    })
    render(<CopilotPromptBox onOpenResult={onOpenResult} />)
    expect(screen.getByText('Copilot SDK')).toBeTruthy()
  })
})
