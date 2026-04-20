import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCopilot } from './SettingsCopilot'

const mocks = vi.hoisted(() => {
  const mockSetGhAccount = vi.fn().mockResolvedValue(undefined)
  const mockSetModel = vi.fn().mockResolvedValue(undefined)

  return {
    mockSetGhAccount,
    mockSetModel,
    useCopilotSettings: vi.fn().mockReturnValue({
      ghAccount: 'testuser',
      model: 'gpt-4o',
      loading: false,
      setGhAccount: mockSetGhAccount,
      setModel: mockSetModel,
    }),
    useGitHubAccounts: vi.fn().mockReturnValue({
      uniqueUsernames: ['testuser', 'orguser'],
      accounts: [],
    }),
  }
})

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: (...args: unknown[]) => mocks.useCopilotSettings(...args),
  useGitHubAccounts: (...args: unknown[]) => mocks.useGitHubAccounts(...args),
}))

vi.mock('../shared/AccountPicker', () => ({
  AccountPicker: ({
    value,
    id,
    onChange,
  }: {
    value: string
    id?: string
    onChange?: (v: string) => void
  }) => (
    <select
      data-testid={id ?? 'account-picker'}
      defaultValue={value}
      onChange={e => onChange?.(e.target.value)}
    >
      <option value="">Default</option>
      <option value="testuser">testuser</option>
      <option value="orguser">orguser</option>
    </select>
  ),
}))

vi.mock('../shared/ModelPicker', () => ({
  ModelPicker: ({
    value,
    id,
    onChange,
  }: {
    value: string
    id?: string
    onChange?: (v: string) => void
  }) => (
    <select
      data-testid={id ?? 'model-picker'}
      defaultValue={value}
      onChange={e => onChange?.(e.target.value)}
    >
      <option value="gpt-4o">gpt-4o</option>
      <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
      <option value="__custom__">Custom...</option>
    </select>
  ),
}))

describe('SettingsCopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSetGhAccount.mockResolvedValue(undefined)
    mocks.mockSetModel.mockResolvedValue(undefined)
    mocks.useCopilotSettings.mockReturnValue({
      ghAccount: 'testuser',
      model: 'gpt-4o',
      loading: false,
      setGhAccount: mocks.mockSetGhAccount,
      setModel: mocks.mockSetModel,
    })
    mocks.useGitHubAccounts.mockReturnValue({
      uniqueUsernames: ['testuser', 'orguser'],
      accounts: [],
    })
  })

  it('renders page header', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText('Copilot SDK')).toBeTruthy()
  })

  it('renders account picker', () => {
    render(<SettingsCopilot />)
    expect(screen.getByTestId('account-picker')).toBeTruthy()
  })

  it('renders model picker', () => {
    render(<SettingsCopilot />)
    expect(screen.getByTestId('model-picker')).toBeTruthy()
  })

  it('shows loading state', () => {
    mocks.useCopilotSettings.mockReturnValue({
      ghAccount: '',
      model: '',
      loading: true,
      setGhAccount: mocks.mockSetGhAccount,
      setModel: mocks.mockSetModel,
    })

    render(<SettingsCopilot />)
    expect(screen.getByText('Loading Copilot settings...')).toBeTruthy()
  })

  it('shows description text', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText(/Configure the GitHub account and model/)).toBeTruthy()
  })

  it('shows current configuration summary with model in code tag', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText('Current Configuration')).toBeTruthy()
    const codeEl = document.querySelector('.info-box code')
    expect(codeEl?.textContent).toBe('gpt-4o')
  })

  it('dispatches account change and shows "Saved" indicator', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })

    // handleAccountChange is effectively synchronous (fire-and-forget promise)
    expect(mocks.mockSetGhAccount).toHaveBeenCalledWith('orguser')
    expect(screen.getByText('Saved')).toBeInTheDocument()

    // Auto-resets after 2 seconds
    vi.advanceTimersByTime(2100)
    await waitFor(() => {
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('dispatches model change and persists', async () => {
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'claude-3-5-sonnet' },
    })

    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('claude-3-5-sonnet')
    })
  })

  it('shows custom model input when __custom__ is selected', () => {
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })

    expect(screen.getByPlaceholderText('Enter custom model name')).toBeInTheDocument()
    expect(screen.getByText('Apply')).toBeInTheDocument()
  })

  it('saves custom model on Apply click', async () => {
    const user = userEvent.setup()
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })

    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.clear(input)
    await user.type(input, 'my-custom-model')

    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('my-custom-model')
    })
  })

  it('does not save empty custom model', () => {
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })

    // Apply button should be disabled when custom model is empty
    expect(screen.getByText('Apply')).toBeDisabled()
  })

  it('shows "Active CLI account" when no account is set', () => {
    mocks.useCopilotSettings.mockReturnValue({
      ghAccount: '',
      model: 'gpt-4o',
      loading: false,
      setGhAccount: mocks.mockSetGhAccount,
      setModel: mocks.mockSetModel,
    })

    render(<SettingsCopilot />)
    expect(screen.getByText('Active CLI account')).toBeTruthy()
  })

  it('clears save reset timeout on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = render(<SettingsCopilot />)

    // Trigger a save to start the timer
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()

    // Unmount before the timer fires — cleanup should clear the timeout
    unmount()

    // Advance time past the reset window — should not throw
    vi.advanceTimersByTime(3000)
    vi.useRealTimers()
  })

  it('saves custom model on Enter key', async () => {
    const user = userEvent.setup()
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })

    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.clear(input)
    await user.type(input, 'my-enter-model')

    // Press Enter on the input
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('my-enter-model')
    })
  })

  it('shows error when no GitHub accounts are configured', () => {
    mocks.useGitHubAccounts.mockReturnValue({
      uniqueUsernames: [],
      accounts: [],
    })

    render(<SettingsCopilot />)
    expect(
      screen.getByText('No GitHub accounts configured. Add accounts in the Accounts settings page.')
    ).toBeTruthy()
  })

  it('clears previous timeout when scheduling a new one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<SettingsCopilot />)

    // Trigger first account change
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    expect(mocks.mockSetGhAccount).toHaveBeenCalledWith('orguser')

    // Trigger second account change before timer fires
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'testuser' },
    })
    expect(mocks.mockSetGhAccount).toHaveBeenLastCalledWith('testuser')

    vi.useRealTimers()
  })
})
