import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsAccounts } from './SettingsAccounts'

const mockAddAccount = vi.fn()
const mockRemoveAccount = vi.fn()

let mockAccounts: Array<{ username: string; org: string }> = []
let mockLoading = false

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: mockAccounts,
    loading: mockLoading,
    addAccount: mockAddAccount,
    removeAccount: mockRemoveAccount,
  }),
}))

describe('SettingsAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccounts = [{ username: 'existing-user', org: 'existing-org' }]
    mockLoading = false
  })

  it('shows a validation error when required fields are missing', async () => {
    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('Both username and organization are required')).toBeTruthy()
    expect(mockAddAccount).not.toHaveBeenCalled()
  })

  it('prevents duplicate accounts from being submitted', async () => {
    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'existing-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'existing-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('This account already exists')).toBeTruthy()
    expect(mockAddAccount).not.toHaveBeenCalled()
  })

  it('resets and closes the form after a successful add', async () => {
    mockAddAccount.mockResolvedValue({ success: true })

    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'new-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(mockAddAccount).toHaveBeenCalledWith({ username: 'new-user', org: 'new-org' })
    )

    await waitFor(() => {
      expect(screen.queryByLabelText('Username')).toBeNull()
    })
  })

  it('shows the add error and keeps the form open when adding fails', async () => {
    mockAddAccount.mockResolvedValue({ success: false, error: 'Could not add account' })

    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'new-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('Could not add account')).toBeTruthy()
    expect(screen.getByLabelText('Username')).toHaveValue('new-user')
    expect(screen.getByLabelText('Organization')).toHaveValue('new-org')
  })

  it('recovers from a rejected addAccount call', async () => {
    mockAddAccount.mockRejectedValue(new Error('Network unavailable'))

    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'new-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('Network unavailable')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^add$/i })).not.toBeDisabled()
    })
  })

  it('clears entered values and closes the form when cancelled', () => {
    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'draft-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'draft-org' } })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText('Username')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))

    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByLabelText('Organization')).toHaveValue('')
  })

  it('clears validation errors when a new add attempt starts', async () => {
    mockAddAccount.mockResolvedValue({ success: false, error: 'Could not add account' })

    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('Both username and organization are required')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'new-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => {
      expect(screen.queryByText('Both username and organization are required')).toBeNull()
    })
  })
})
