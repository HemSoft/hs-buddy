import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopilotPromptBox } from './CopilotPromptBox'

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: () => [
    {
      _id: 'r1',
      prompt: 'Review this PR',
      status: 'completed',
      _creationTime: Date.now() - 60000,
    },
  ],
  useCopilotActiveCount: () => 0,
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

describe('CopilotPromptBox', () => {
  const onOpenResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
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
})
