import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsCopilot } from './SettingsCopilot'

const mockUseCopilotSettings = vi.fn().mockReturnValue({
  ghAccount: 'testuser',
  model: 'gpt-4o',
  loading: false,
  setGhAccount: vi.fn().mockResolvedValue(undefined),
  setModel: vi.fn().mockResolvedValue(undefined),
})

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: (...args: unknown[]) => mockUseCopilotSettings(...args),
  useGitHubAccounts: vi.fn().mockReturnValue({
    uniqueUsernames: ['testuser', 'orguser'],
    accounts: [],
  }),
}))

vi.mock('../shared/AccountPicker', () => ({
  AccountPicker: ({ value, id }: { value: string; id?: string }) => (
    <select data-testid={id ?? 'account-picker'} defaultValue={value}>
      <option value="">Default</option>
      <option value="testuser">testuser</option>
    </select>
  ),
}))

vi.mock('../shared/ModelPicker', () => ({
  ModelPicker: ({ value, id }: { value: string; id?: string }) => (
    <select data-testid={id ?? 'model-picker'} defaultValue={value}>
      <option value="gpt-4o">gpt-4o</option>
    </select>
  ),
}))

describe('SettingsCopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCopilotSettings.mockReturnValue({
      ghAccount: 'testuser',
      model: 'gpt-4o',
      loading: false,
      setGhAccount: vi.fn().mockResolvedValue(undefined),
      setModel: vi.fn().mockResolvedValue(undefined),
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
    mockUseCopilotSettings.mockReturnValue({
      ghAccount: '',
      model: '',
      loading: true,
      setGhAccount: vi.fn().mockResolvedValue(undefined),
      setModel: vi.fn().mockResolvedValue(undefined),
    })

    render(<SettingsCopilot />)
    expect(screen.getByText('Loading Copilot settings...')).toBeTruthy()
  })

  it('shows description text', () => {
    render(<SettingsCopilot />)
    expect(screen.getByText(/Configure the GitHub account and model/)).toBeTruthy()
  })
})
