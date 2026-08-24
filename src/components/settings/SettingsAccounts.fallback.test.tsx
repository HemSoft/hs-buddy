import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsAccounts } from './SettingsAccounts'
import type { GitHubAccount } from '../../types/config'

const updateAccount = vi.fn()
const updateUsageProvider = vi.fn()
const accounts: GitHubAccount[] = [{ username: 'HemSoft', org: 'HemSoft' }]

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts,
    loading: false,
    canUpdateAccounts: true,
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

function selectCodexAndSave() {
  fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
  fireEvent.change(screen.getByLabelText('Usage provider for HemSoft'), {
    target: { value: 'codex' },
  })
  fireEvent.click(screen.getByTitle('Save'))
}

describe('SettingsAccounts connected fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accounts.splice(0, accounts.length, { username: 'HemSoft', org: 'HemSoft' })
    updateAccount.mockResolvedValue({ success: false, error: 'Convex is unavailable' })
    updateUsageProvider.mockResolvedValue({ success: true })
  })

  it('falls back locally when cached Convex account data becomes unwritable', async () => {
    render(<SettingsAccounts />)
    selectCodexAndSave()

    await waitFor(() =>
      expect(updateUsageProvider).toHaveBeenCalledWith('HemSoft', 'HemSoft', 'codex')
    )
    expect(screen.queryByLabelText('Usage provider for HemSoft')).not.toBeInTheDocument()
  })

  it('reports a partial save when only the provider can fall back locally', async () => {
    accounts[0].repoRoot = 'D:\\github\\HemSoft'
    render(<SettingsAccounts />)

    fireEvent.click(screen.getAllByText('HemSoft')[0].closest('button')!)
    fireEvent.change(screen.getByLabelText('Usage provider for HemSoft'), {
      target: { value: 'codex' },
    })
    fireEvent.change(screen.getByLabelText('Repository root path'), {
      target: { value: 'D:\\github\\Elsewhere' },
    })
    fireEvent.click(screen.getByTitle('Save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usage provider saved, but the repository root still requires Convex.'
    )
    expect(screen.getByLabelText('Usage provider for HemSoft')).toBeInTheDocument()
  })
})
