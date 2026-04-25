import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCopilot, settingsReducer } from './SettingsCopilot'

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
      <option value="thirduser">thirduser</option>
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
      <option value="o1-preview">o1-preview</option>
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

    expect(mocks.mockSetGhAccount).toHaveBeenCalledWith('orguser')

    // "Saved" appears after the async save resolves
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

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

  it('clears save reset timeout on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { unmount } = render(<SettingsCopilot />)

    // Trigger a save to start the timer
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

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

  it('reverts account and hides Saved indicator on failed save', async () => {
    mocks.mockSetGhAccount.mockRejectedValueOnce(new Error('save failed'))
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })

    await waitFor(() => {
      expect(mocks.mockSetGhAccount).toHaveBeenCalledWith('orguser')
    })

    // After rejection, model summary should still show original model (no state corruption)
    await waitFor(() => {
      const codeEl = document.querySelector('.info-box code')
      expect(codeEl?.textContent).toBe('gpt-4o')
    })

    // "Saved" should never appear after a failed save
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('reverts model and hides Saved indicator on failed model save', async () => {
    mocks.mockSetModel.mockRejectedValueOnce(new Error('save failed'))
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'claude-3-5-sonnet' },
    })

    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('claude-3-5-sonnet')
    })

    // Model should revert to original
    await waitFor(() => {
      const codeEl = document.querySelector('.info-box code')
      expect(codeEl?.textContent).toBe('gpt-4o')
    })

    // "Saved" should never appear after a failed save
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('reverts custom model and hides Saved indicator on failed custom model save', async () => {
    mocks.mockSetModel.mockRejectedValueOnce(new Error('save failed'))
    const user = userEvent.setup()
    render(<SettingsCopilot />)

    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })

    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.clear(input)
    await user.type(input, 'bad-model')

    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('bad-model')
    })

    // Model should revert to original
    await waitFor(() => {
      const codeEl = document.querySelector('.info-box code')
      expect(codeEl?.textContent).toBe('gpt-4o')
    })

    // "Saved" should never appear after a failed save
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('clears previous save-reset timer when a second save succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<SettingsCopilot />)

    // First save — timer is set (fires at T+2000ms)
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    // Advance 500ms, then second save — clears first timer and sets new one (fires at T+2500ms)
    vi.advanceTimersByTime(500)
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'claude-3-5-sonnet' },
    })
    await waitFor(() => {
      expect(mocks.mockSetModel).toHaveBeenCalledWith('claude-3-5-sonnet')
    })

    // At T+2100ms: if clearTimeout didn't work, the first timer would fire and reset "Saved"
    vi.advanceTimersByTime(1600)
    expect(screen.getByText('Saved')).toBeInTheDocument()

    // At T+2600ms: second timer fires — "Saved" disappears
    vi.advanceTimersByTime(500)
    await waitFor(() => {
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    })

    vi.useRealTimers()
  })

  it('ignores stale account save failure when a newer request is in-flight', async () => {
    let rejectFirst!: (reason: Error) => void
    const firstPromise = new Promise<void>((_, reject) => {
      rejectFirst = reject
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetGhAccount.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    render(<SettingsCopilot />)

    // First change → requestId 1 (initial='testuser')
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    // Second change → requestId 2 (supersedes first, distinct from initial)
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'thirduser' },
    })

    // Flush promise callbacks and React state updates
    await act(async () => {
      rejectFirst(new Error('stale failure'))
      resolveSecond()
    })

    // Second save succeeded → "Saved" should appear
    expect(screen.getByText('Saved')).toBeInTheDocument()

    // Account should reflect the second (successful) value, not revert to initial
    const codeEl = document.querySelector('.info-box p:first-child')
    expect(codeEl?.textContent).toContain('thirduser')
  })

  it('ignores stale model save success when a newer request supersedes it', async () => {
    let resolveFirst!: () => void
    const firstPromise = new Promise<void>(resolve => {
      resolveFirst = resolve
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetModel.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    render(<SettingsCopilot />)

    // First model change → requestId 1 (initial='gpt-4o')
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'claude-3-5-sonnet' },
    })
    // Second model change → requestId 2 (distinct from initial)
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'o1-preview' },
    })

    await act(async () => {
      resolveFirst()
      resolveSecond()
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const codeEl = document.querySelector('.info-box code')
    expect(codeEl?.textContent).toBe('o1-preview')
  })

  it('ignores stale model save failure when a newer request supersedes it', async () => {
    let rejectFirst!: (reason: Error) => void
    const firstPromise = new Promise<void>((_, reject) => {
      rejectFirst = reject
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetModel.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    render(<SettingsCopilot />)

    // First model change → requestId 1 (initial='gpt-4o')
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'claude-3-5-sonnet' },
    })
    // Second model change → requestId 2 (distinct from initial)
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'o1-preview' },
    })

    await act(async () => {
      rejectFirst(new Error('stale failure'))
      resolveSecond()
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const codeEl = document.querySelector('.info-box code')
    expect(codeEl?.textContent).toBe('o1-preview')
  })

  it('ignores stale account save success when a newer request supersedes it', async () => {
    let resolveFirst!: () => void
    const firstPromise = new Promise<void>(resolve => {
      resolveFirst = resolve
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetGhAccount.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    render(<SettingsCopilot />)

    // First change → requestId 1 (initial='testuser')
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'orguser' },
    })
    // Second change → requestId 2 (distinct from initial)
    fireEvent.change(screen.getByTestId('account-picker'), {
      target: { value: 'thirduser' },
    })

    await act(async () => {
      resolveFirst()
      resolveSecond()
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const codeEl = document.querySelector('.info-box p:first-child')
    expect(codeEl?.textContent).toContain('thirduser')
  })

  it('ignores stale custom model save failure when a newer request supersedes it', async () => {
    let rejectFirst!: (reason: Error) => void
    const firstPromise = new Promise<void>((_, reject) => {
      rejectFirst = reject
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetModel.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    const user = userEvent.setup()
    render(<SettingsCopilot />)

    // Enter custom model mode and save
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })
    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.clear(input)
    await user.type(input, 'custom-one')
    fireEvent.click(screen.getByText('Apply'))

    // Now do a regular model change that supersedes the custom save (distinct from initial 'gpt-4o')
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'o1-preview' },
    })

    await act(async () => {
      rejectFirst(new Error('stale failure'))
      resolveSecond()
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const codeEl = document.querySelector('.info-box code')
    expect(codeEl?.textContent).toBe('o1-preview')
  })

  it('ignores stale custom model save success when a newer request supersedes it', async () => {
    let resolveFirst!: () => void
    const firstPromise = new Promise<void>(resolve => {
      resolveFirst = resolve
    })
    let resolveSecond!: () => void
    const secondPromise = new Promise<void>(resolve => {
      resolveSecond = resolve
    })

    mocks.mockSetModel.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    const user = userEvent.setup()
    render(<SettingsCopilot />)

    // Enter custom model mode and save
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: '__custom__' },
    })
    const input = screen.getByPlaceholderText('Enter custom model name')
    await user.clear(input)
    await user.type(input, 'custom-one')
    fireEvent.click(screen.getByText('Apply'))

    // Now do a regular model change that supersedes the custom save (distinct from initial 'gpt-4o')
    fireEvent.change(screen.getByTestId('model-picker'), {
      target: { value: 'o1-preview' },
    })

    await act(async () => {
      resolveFirst()
      resolveSecond()
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const codeEl = document.querySelector('.info-box code')
    expect(codeEl?.textContent).toBe('o1-preview')
  })
})

describe('settingsReducer', () => {
  it('returns state unchanged for unknown action type', () => {
    const state = {
      localAccount: 'alice',
      localModel: 'gpt-4',
      customModel: '',
      isCustomModel: false,
      saveStatus: 'idle' as const,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = settingsReducer(state, { type: 'unknown_action' } as any)
    expect(result).toBe(state)
  })
})
