import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsAccounts } from './SettingsAccounts'
import type { GitHubAccount } from '../../types/config'

const updateAccount = vi.fn()
const updateUsageProvider = vi.fn()
const accounts: GitHubAccount[] = [{ username: 'HemSoft', org: 'HemSoft' }]
let canUpdateAccounts = true

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts,
    loading: false,
    canUpdateAccounts,
    addAccount: vi.fn(),
    removeAccount: vi.fn(),
    updateAccount,
    updateUsageProvider,
  }),
  useConfig: () => ({
    config: { ui: { enterpriseSlug: '' } },
    loading: false,
    refresh: vi.fn(),
    api: { setEnterpriseSlug: vi.fn() },
  }),
}))

describe('SettingsAccounts usage provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accounts.splice(0, accounts.length, { username: 'HemSoft', org: 'HemSoft' })
    canUpdateAccounts = true
    updateAccount.mockResolvedValue({ success: true })
    updateUsageProvider.mockResolvedValue({ success: true })
  })

  it('stages provider changes until Save and discards them on Cancel', async () => {
    render(<SettingsAccounts />)

    expect(screen.getByText('Copilot')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    const provider = screen.getByLabelText('Usage provider for HemSoft')
    expect(provider).toHaveValue('copilot')

    fireEvent.change(provider, { target: { value: 'codex' } })
    expect(updateAccount).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))
    expect(updateAccount).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.change(screen.getByLabelText('Usage provider for HemSoft'), {
      target: { value: 'codex' },
    })
    fireEvent.click(screen.getByTitle('Save'))

    await waitFor(() => {
      expect(updateUsageProvider).toHaveBeenCalledWith('HemSoft', 'HemSoft', 'codex')
    })
    expect(updateAccount).not.toHaveBeenCalled()
  })

  it('allows only one account to own the local Codex login', () => {
    accounts.splice(
      0,
      accounts.length,
      { username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      { username: 'Second', org: 'HemSoft' }
    )
    render(<SettingsAccounts />)

    fireEvent.click(screen.getByText('Second').closest('button')!)
    expect(screen.getByLabelText('Usage provider for Second')).toHaveValue('copilot')
    expect(screen.getByRole('option', { name: 'ChatGPT / Codex' })).toBeDisabled()
    expect(screen.getByText(/already assigned to HemSoft/i)).toBeInTheDocument()
  })

  it('saves provider changes locally while account data is read-only', async () => {
    canUpdateAccounts = false
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    const provider = screen.getByLabelText('Usage provider for HemSoft')

    expect(provider).toBeEnabled()
    expect(screen.getByText(/saved locally on this device/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Repository root path')).toBeDisabled()
    fireEvent.change(provider, { target: { value: 'codex' } })
    fireEvent.click(screen.getByTitle('Save'))

    await waitFor(() =>
      expect(updateUsageProvider).toHaveBeenCalledWith('HemSoft', 'HemSoft', 'codex')
    )
    expect(updateAccount).not.toHaveBeenCalled()
  })

  it('keeps a staged repository root visible when connectivity drops before Save', async () => {
    accounts[0].repoRoot = 'D:\\github\\HemSoft'
    const { rerender } = render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.change(screen.getByLabelText('Repository root path'), {
      target: { value: 'D:\\github\\Elsewhere' },
    })
    fireEvent.change(screen.getByLabelText('Usage provider for HemSoft'), {
      target: { value: 'codex' },
    })
    canUpdateAccounts = false
    rerender(<SettingsAccounts />)
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usage provider saved, but the repository root still requires Convex.'
    )
    expect(screen.getByLabelText('Repository root path')).toHaveValue('D:\\github\\Elsewhere')
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
    expect(updateAccount).not.toHaveBeenCalled()
  })

  it('keeps the editor open and reports an update failure', async () => {
    updateUsageProvider.mockResolvedValue({ success: false, error: 'Convex is unavailable' })
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Convex is unavailable')
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
  })

  it('reports a rejected account update without closing the editor', async () => {
    updateUsageProvider.mockRejectedValue(new Error('Network request failed'))
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network request failed')
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
  })
})
