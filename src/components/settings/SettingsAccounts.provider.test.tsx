import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsAccounts } from './SettingsAccounts'

const updateAccount = vi.fn()

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
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
    updateAccount.mockResolvedValue(undefined)
  })

  it('defaults to Copilot and lets an account explicitly opt into Codex', async () => {
    render(<SettingsAccounts />)

    expect(screen.getByText('Copilot')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    const provider = screen.getByLabelText('Usage provider for HemSoft')
    expect(provider).toHaveValue('copilot')

    fireEvent.change(provider, { target: { value: 'codex' } })

    await waitFor(() => {
      expect(updateAccount).toHaveBeenCalledWith('HemSoft', 'HemSoft', {
        usageProvider: 'codex',
      })
    })
  })
})
