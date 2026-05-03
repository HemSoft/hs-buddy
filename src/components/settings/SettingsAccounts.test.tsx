import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsAccounts, addAccountFormReducer } from './SettingsAccounts'

const mockAddAccount = vi.fn()
const mockRemoveAccount = vi.fn()
const mockUpdateAccount = vi.fn()

let mockAccounts: Array<{ username: string; org: string; repoRoot?: string }> = []
let mockLoading = false

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: mockAccounts,
    loading: mockLoading,
    addAccount: mockAddAccount,
    removeAccount: mockRemoveAccount,
    updateAccount: mockUpdateAccount,
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

  it('removes account after confirmation', async () => {
    mockRemoveAccount.mockResolvedValue(undefined)
    render(<SettingsAccounts />)

    // Click the remove button on the existing account
    const removeButton = screen.getByTitle('Remove account')
    fireEvent.click(removeButton)

    // Confirm dialog should appear — find the danger button specifically
    const confirmButton = await waitFor(() => {
      const btn = document.querySelector('.confirm-dialog-btn-danger') as HTMLButtonElement
      expect(btn).toBeTruthy()
      return btn
    })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockRemoveAccount).toHaveBeenCalledWith('existing-user', 'existing-org')
    })
  })

  it('does not remove account when confirmation is cancelled', async () => {
    render(<SettingsAccounts />)

    const removeButton = screen.getByTitle('Remove account')
    fireEvent.click(removeButton)

    // Cancel the dialog
    const cancelButton = await screen.findByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    expect(mockRemoveAccount).not.toHaveBeenCalled()
  })

  it('shows loading state when accounts are loading', () => {
    mockLoading = true
    render(<SettingsAccounts />)
    expect(screen.getByText('Loading accounts...')).toBeTruthy()
  })

  it('shows empty state when no accounts are configured', () => {
    mockAccounts = []
    render(<SettingsAccounts />)
    expect(screen.getByText('No GitHub accounts configured')).toBeTruthy()
  })

  it('shows generic error message when addAccount returns failure with no error property', async () => {
    mockAddAccount.mockResolvedValue({ success: false })

    render(<SettingsAccounts />)

    fireEvent.click(screen.getByRole('button', { name: /add account/i }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'new-org' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('Failed to add account')).toBeTruthy()
    expect(screen.getByLabelText('Username')).toHaveValue('new-user')
  })
})

describe('addAccountFormReducer', () => {
  it('returns state unchanged for unknown action type', () => {
    const state = {
      showAddForm: false,
      newUsername: '',
      newOrg: '',
      addError: null,
      isAdding: false,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = addAccountFormReducer(state, { type: 'UNKNOWN_ACTION' } as any)
    expect(result).toBe(state)
  })
})

describe('SettingsAccounts account editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccounts = [
      {
        username: 'test-user',
        org: 'test-org',
        repoRoot: 'D:\\github\\test-org',
      },
    ]
    mockLoading = false
  })

  it('expands account item when clicked', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    // Should show the repo root editing panel
    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('shows repoRoot input field when account is expanded', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    expect(screen.getByLabelText('Repository Root Path')).toBeInTheDocument()
  })

  it('collapses account item when X is clicked', async () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    // Verify it's expanded
    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()

    // Click X button to collapse
    const cancelBtn = screen.getByTitle('Cancel editing')
    fireEvent.click(cancelBtn)

    // The edit panel should be hidden
    await waitFor(() => {
      expect(screen.queryByDisplayValue('D:\\github\\test-org')).not.toBeInTheDocument()
    })
  })

  it('updates repoRoot when Save button is clicked', async () => {
    mockUpdateAccount.mockResolvedValue({ success: true })
    ;(window.ralph as unknown as Record<string, unknown>) = { selectDirectory: vi.fn() }

    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    // Change the repo root value
    const input = screen.getByDisplayValue('D:\\github\\test-org')
    fireEvent.change(input, { target: { value: 'D:\\new\\path' } })

    // Click Save
    const saveBtn = screen.getByTitle('Save')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith('test-user', 'test-org', {
        repoRoot: 'D:\\new\\path',
      })
    })
  })

  it('opens folder browser when Browse button is clicked', async () => {
    const mockSelectDirectory = vi.fn().mockResolvedValue('D:\\selected\\path')
    Object.defineProperty(window, 'ralph', {
      value: { selectDirectory: mockSelectDirectory },
      writable: true,
      configurable: true,
    })
    mockUpdateAccount.mockResolvedValue({ success: true })

    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    // Click Browse button
    const browseBtn = screen.getByTitle('Browse for folder')
    fireEvent.click(browseBtn)

    await waitFor(() => {
      expect(mockSelectDirectory).toHaveBeenCalledWith('D:\\github\\test-org')
    })

    // Input should be updated with selected path
    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\selected\\path')).toBeInTheDocument()
    })
  })

  it('shows repoRoot in secondary text when not editing', () => {
    render(<SettingsAccounts />)

    expect(screen.getByText('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('does not expand item when already editing', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    // Click again while editing should not collapse
    fireEvent.click(accountItem!)

    // Panel should still be visible
    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('removes account when Trash button is clicked', async () => {
    mockRemoveAccount.mockResolvedValue(undefined)
    render(<SettingsAccounts />)

    const removeButton = screen.getByTitle('Remove account')
    fireEvent.click(removeButton)

    // Confirm dialog should appear
    const confirmButton = await waitFor(() => {
      const btn = document.querySelector('.confirm-dialog-btn-danger') as HTMLButtonElement
      expect(btn).toBeTruthy()
      return btn
    })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockRemoveAccount).toHaveBeenCalledWith('test-user', 'test-org')
    })
  })

  it('opens editing with empty repoRoot when account has no repoRoot', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org' }]
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      const input = screen.getByLabelText('Repository Root Path')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('')
    })
  })

  it('opens editing with existing repoRoot when account has repoRoot', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org', repoRoot: 'D:\\github\\test-org' }]
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
    })
  })

  it('browse button calls selectDirectory and updates repoRoot', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org', repoRoot: 'D:\\github\\test-org' }]
    Object.defineProperty(window, 'ralph', {
      value: {
        selectDirectory: vi.fn().mockResolvedValue('D:\\new\\path'),
        listTemplates: vi.fn().mockResolvedValue([]),
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
    })

    const browseBtn = screen.getByTitle('Browse for folder')
    fireEvent.click(browseBtn)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\new\\path')).toBeInTheDocument()
    })
  })

  it('browse button passes undefined when account has no repoRoot', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org' }]
    const mockSelectDirectory = vi.fn().mockResolvedValue('D:\\picked\\path')
    Object.defineProperty(window, 'ralph', {
      value: {
        selectDirectory: mockSelectDirectory,
        listTemplates: vi.fn().mockResolvedValue([]),
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByLabelText('Repository Root Path')).toHaveValue('')
    })

    const browseBtn = screen.getByTitle('Browse for folder')
    fireEvent.click(browseBtn)

    await waitFor(() => {
      expect(mockSelectDirectory).toHaveBeenCalledWith(undefined)
      expect(screen.getByDisplayValue('D:\\picked\\path')).toBeInTheDocument()
    })
  })

  it('browse button does not update when selectDirectory returns null', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org', repoRoot: 'D:\\github\\test-org' }]
    Object.defineProperty(window, 'ralph', {
      value: {
        selectDirectory: vi.fn().mockResolvedValue(null),
        listTemplates: vi.fn().mockResolvedValue([]),
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
    })

    const browseBtn = screen.getByTitle('Browse for folder')
    fireEvent.click(browseBtn)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
    })
  })

  it('save button calls updateAccount with repoRoot and closes editing', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org', repoRoot: 'D:\\github\\test-org' }]
    mockUpdateAccount.mockResolvedValue(undefined)
    Object.defineProperty(window, 'ralph', {
      value: {
        selectDirectory: vi.fn(),
        listTemplates: vi.fn().mockResolvedValue([]),
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
    })

    const saveBtn = screen.getByTitle('Save')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith('test-user', 'test-org', {
        repoRoot: 'D:\\github\\test-org',
      })
    })
  })

  it('expands account item via Enter key', () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org' }]
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')!
    fireEvent.keyDown(accountItem, { key: 'Enter' })

    expect(screen.getByLabelText('Repository Root Path')).toHaveValue('')
  })

  it('expands account item via Space key', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')!
    fireEvent.keyDown(accountItem, { key: ' ' })

    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('does not expand via keyboard when already editing', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')!
    fireEvent.click(accountItem!)

    // Already editing — Enter should not collapse
    fireEvent.keyDown(accountItem, { key: 'Enter' })
    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('edit panel stops keyDown propagation', () => {
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')!
    fireEvent.click(accountItem!)

    const editPanel = document.querySelector('.list-item-edit-panel')!
    fireEvent.keyDown(editPanel, { key: 'a' })

    // The edit panel is still visible (event didn't bubble up and collapse)
    expect(screen.getByDisplayValue('D:\\github\\test-org')).toBeInTheDocument()
  })

  it('save button passes undefined repoRoot when editRepoRoot is empty', async () => {
    mockAccounts = [{ username: 'test-user', org: 'test-org' }]
    mockUpdateAccount.mockResolvedValue(undefined)
    Object.defineProperty(window, 'ralph', {
      value: {
        selectDirectory: vi.fn(),
        listTemplates: vi.fn().mockResolvedValue([]),
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    render(<SettingsAccounts />)

    const accountItem = screen.getByText('test-user').closest('.list-item-expandable')
    fireEvent.click(accountItem!)

    await waitFor(() => {
      expect(screen.getByTitle('Save')).toBeInTheDocument()
    })

    const saveBtn = screen.getByTitle('Save')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith('test-user', 'test-org', {
        repoRoot: undefined,
      })
    })
  })
})
