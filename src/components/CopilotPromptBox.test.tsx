import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CopilotPromptBox } from './CopilotPromptBox'

const { mockUseCopilotActiveCount, mockUseCopilotResultsRecent } = vi.hoisted(() => ({
  mockUseCopilotActiveCount: vi.fn(),
  mockUseCopilotResultsRecent: vi.fn(),
}))

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: mockUseCopilotResultsRecent,
  useCopilotActiveCount: mockUseCopilotActiveCount,
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
  AccountPicker: () => <div data-testid="account-picker">Account</div>,
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
})
