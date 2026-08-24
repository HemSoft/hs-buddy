import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsAccounts } from './SettingsAccounts'
import type { GitHubAccount } from '../../types/config'

const updateAccount = vi.fn()
const accounts: GitHubAccount[] = [{ username: 'HemSoft', org: 'HemSoft' }]

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts,
    loading: false,
    addAccount: vi.fn(),
    removeAccount: vi.fn(),
    updateAccount,
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
    updateAccount.mockResolvedValue({ success: true })
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
      expect(updateAccount).toHaveBeenCalledWith('HemSoft', 'HemSoft', {
        repoRoot: undefined,
        usageProvider: 'codex',
      })
    })
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

  it('keeps the editor open and reports an update failure', async () => {
    updateAccount.mockResolvedValue({ success: false, error: 'Convex is unavailable' })
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Convex is unavailable')
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
  })

  it('reports a rejected account update without closing the editor', async () => {
    updateAccount.mockRejectedValue(new Error('Network request failed'))
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network request failed')
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
  })
})
