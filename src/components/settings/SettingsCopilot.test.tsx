import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCopilot } from './SettingsCopilot'

const mockSetGhAccount = vi.fn().mockResolvedValue(undefined)
const mockSetModel = vi.fn().mockResolvedValue(undefined)
const mockUseCopilotSettings = vi.fn().mockReturnValue({
  ghAccount: 'testuser',
  model: 'gpt-4o',
  loading: false,
  setGhAccount: mockSetGhAccount,
  setModel: mockSetModel,
})

const mockUseGitHubAccounts = vi.fn().mockReturnValue({
  uniqueUsernames: ['testuser', 'orguser'],
  accounts: [],
})

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: (...args: unknown[]) => mockUseCopilotSettings(...args),
  useGitHubAccounts: (...args: unknown[]) => mockUseGitHubAccounts(...args),
}))

const mockAccountOnChange = vi.fn()
const mockModelOnChange = vi.fn()

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
      onChange={e => {
        mockAccountOnChange(e.target.value)
        onChange?.(e.target.value)
      }}
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
      onChange={e => {
        mockModelOnChange(e.target.value)
        onChange?.(e.target.value)
      }}
    >
      <option value="gpt-4o">gpt-4o</option>
      <option value="claude-3">claude-3</option>
      <option value="__custom__">Custom...</option>
    </select>
  ),
}))

describe('SettingsCopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSetGhAccount.mockResolvedValue(undefined)
    mockSetModel.mockResolvedValue(undefined)
    mockUseCopilotSettings.mockReturnValue({
      ghAccount: 'testuser',
      model: 'gpt-4o',
      loading: false,
      setGhAccount: mockSetGhAccount,
      setModel: mockSetModel,
    })
    mockUseGitHubAccounts.mockReturnValue({
      uniqueUsernames: ['testuser', 'orguser'],
      accounts: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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
    mockUseCopilotSettings.mockReturnValue({
      ghAccount: '',
      model: '',
      loading: true,
      setGhAccount: mockSetGhAccount,
      setModel: mockSetModel,
    })

    render(<SettingsCopilot />)
    expect(screen.getByText('Loading Copilot settings...')).toBeTruthy()
  })

  it('shows description text', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText(/Configure the GitHub account and model/)).toBeTruthy()
  })

  it('shows current configuration summary', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText('Current Configuration')).toBeTruthy()
    const codeElements = screen.getAllByText('gpt-4o')
    expect(codeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('calls setGhAccount when account changes', async () => {
    vi.useRealTimers()
    render(<SettingsCopilot />)
    const picker = screen.getByTestId('account-picker')
    fireEvent.change(picker, { target: { value: 'orguser' } })
    await waitFor(() => {
      expect(mockSetGhAccount).toHaveBeenCalledWith('orguser')
    })
  })

  it('calls setModel when model changes', async () => {
    vi.useRealTimers()
    render(<SettingsCopilot />)
    const picker = screen.getByTestId('model-picker')
    fireEvent.change(picker, { target: { value: 'claude-3' } })
    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith('claude-3')
    })
  })

  it('shows custom model input when __custom__ is selected', async () => {
    vi.useRealTimers()
    render(<SettingsCopilot />)
    const picker = screen.getByTestId('model-picker')
    fireEvent.change(picker, { target: { value: '__custom__' } })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter custom model name')).toBeTruthy()
    })
  })

  it('saves custom model on Apply button click', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<SettingsCopilot />)
    // Trigger custom model mode
    fireEvent.change(screen.getByTestId('model-picker'), { target: { value: '__custom__' } })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter custom model name')).toBeTruthy()
    })
    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.type(input, 'my-custom-model')
    const applyBtn = screen.getByText('Apply')
    await user.click(applyBtn)
    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith('my-custom-model')
    })
  })

  it('saves custom model on Enter key', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<SettingsCopilot />)
    fireEvent.change(screen.getByTestId('model-picker'), { target: { value: '__custom__' } })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter custom model name')).toBeTruthy()
    })
    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.type(input, 'custom-v2{Enter}')
    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith('custom-v2')
    })
  })

  it('shows error when no accounts are configured', () => {
    mockUseGitHubAccounts.mockReturnValue({
      uniqueUsernames: [],
      accounts: [],
    })
    render(<SettingsCopilot />)
    expect(screen.getByText(/No GitHub accounts configured/)).toBeTruthy()
  })

  it('shows "Saved" indicator after account change', async () => {
    vi.useRealTimers()
    render(<SettingsCopilot />)
    fireEvent.change(screen.getByTestId('account-picker'), { target: { value: 'orguser' } })
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeTruthy()
    })
  })
})
