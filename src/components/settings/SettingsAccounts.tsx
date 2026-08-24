import { useEffect, useReducer, useState } from 'react'
import { useConfig, useGitHubAccounts } from '../../hooks/useConfig'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import {
  Plus,
  Trash2,
  User,
  Building2,
  RefreshCw,
  AlertCircle,
  FolderOpen,
  Check,
  X,
  Sparkles,
} from 'lucide-react'
import type { GitHubAccount, UsageProvider } from '../../types/config'
import { getUserFacingErrorMessage } from '../../utils/errorUtils'
import { assertValidGitHubAccountSlug } from '../../utils/githubAuthUtils'
import './SettingsShared.css'

interface AddAccountFormState {
  showAddForm: boolean
  newUsername: string
  newOrg: string
  addError: string | null
  isAdding: boolean
}

type AddAccountFormAction =
  | { type: 'OPEN_FORM' }
  | { type: 'CLOSE_FORM' }
  | { type: 'SET_USERNAME'; value: string }
  | { type: 'SET_ORG'; value: string }
  | { type: 'SET_ERROR'; value: string | null }
  | { type: 'START_ADD' }
  | { type: 'FINISH_ADD'; error: string | null }

const INITIAL_FORM_STATE: AddAccountFormState = {
  showAddForm: false,
  newUsername: '',
  newOrg: '',
  addError: null,
  isAdding: false,
}

type AccountFormHandler = (
  state: AddAccountFormState,
  action: AddAccountFormAction
) => AddAccountFormState

const accountFormHandlers: Record<AddAccountFormAction['type'], AccountFormHandler> = {
  OPEN_FORM: () => ({ ...INITIAL_FORM_STATE, showAddForm: true }),
  CLOSE_FORM: () => INITIAL_FORM_STATE,
  SET_USERNAME: (s, a) => ({
    ...s,
    newUsername: (a as Extract<AddAccountFormAction, { type: 'SET_USERNAME' }>).value,
  }),
  SET_ORG: (s, a) => ({
    ...s,
    newOrg: (a as Extract<AddAccountFormAction, { type: 'SET_ORG' }>).value,
  }),
  SET_ERROR: (s, a) => ({
    ...s,
    addError: (a as Extract<AddAccountFormAction, { type: 'SET_ERROR' }>).value,
  }),
  START_ADD: s => ({ ...s, isAdding: true, addError: null }),
  FINISH_ADD: (s, a) => {
    const error = (a as Extract<AddAccountFormAction, { type: 'FINISH_ADD' }>).error
    return error ? { ...s, isAdding: false, addError: error } : INITIAL_FORM_STATE
  },
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for testing
export function addAccountFormReducer(
  state: AddAccountFormState,
  action: AddAccountFormAction
): AddAccountFormState {
  const handler = accountFormHandlers[action.type]
  if (!handler) return state
  return handler(state, action)
}

function trimAccountInput(newUsername: string, newOrg: string) {
  return {
    username: newUsername.trim(),
    org: newOrg.trim(),
  }
}

function validateNewAccount(username: string, org: string, accounts: GitHubAccount[]) {
  if (!username || !org) {
    return 'Both username and organization are required'
  }

  if (accounts.some(a => a.username === username && a.org === org)) {
    return 'This account already exists'
  }

  return null
}

function resolveAddAccountError(result: { success: boolean; error?: string | null }) {
  if (result.success) return null
  return result.error || 'Failed to add account'
}

function resolveAccountKey(account: GitHubAccount) {
  return `${account.username}-${account.org}`
}

function resolveAccountRepoRoot(account: GitHubAccount) {
  return account.repoRoot ?? ''
}

function resolveRepoRootUpdate(editRepoRoot: string) {
  return editRepoRoot || undefined
}

function resolveVisibleRepoRoot(repoRoot: string | undefined, isEditing: boolean) {
  if (isEditing) return undefined
  return repoRoot
}

function resolveAccountItemClassName(isEditing: boolean) {
  return `list-item list-item-expandable${isEditing ? ' list-item-editing' : ''}`
}

function resolveAccountItemCursor(isEditing: boolean) {
  return isEditing ? 'default' : 'pointer'
}

function openAccountEditor(
  account: GitHubAccount,
  isEditing: boolean,
  setEditingKey: React.Dispatch<React.SetStateAction<string | null>>,
  setEditRepoRoot: React.Dispatch<React.SetStateAction<string>>
) {
  if (isEditing) return
  setEditingKey(resolveAccountKey(account))
  setEditRepoRoot(resolveAccountRepoRoot(account))
}

function handleAccountItemKeyDown(
  e: React.KeyboardEvent,
  isEditing: boolean,
  onActivate: () => void
) {
  if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
    e.preventDefault()
    onActivate()
  }
}

function AddAccountFormSection({
  showAddForm,
  handleAdd,
  dispatch,
  newUsername,
  newOrg,
  addError,
  isAdding,
}: {
  showAddForm: boolean
  handleAdd: (e: React.FormEvent) => void
  dispatch: React.Dispatch<AddAccountFormAction>
  newUsername: string
  newOrg: string
  addError: string | null
  isAdding: boolean
}) {
  if (!showAddForm) return null

  return (
    <form className="add-form" onSubmit={handleAdd}>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="username">
            <User size={14} />
            Username
          </label>
          <input
            id="username"
            type="text"
            value={newUsername}
            onChange={e => dispatch({ type: 'SET_USERNAME', value: e.target.value })}
            placeholder="your-github-username"
            disabled={isAdding}
          />
        </div>
        <div className="form-field">
          <label htmlFor="org">
            <Building2 size={14} />
            Organization
          </label>
          <input
            id="org"
            type="text"
            value={newOrg}
            onChange={e => dispatch({ type: 'SET_ORG', value: e.target.value })}
            placeholder="organization-name"
            disabled={isAdding}
          />
        </div>
      </div>
      {addError && (
        <div className="form-error">
          <AlertCircle size={14} />
          {addError}
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="settings-btn settings-btn-secondary"
          onClick={() => dispatch({ type: 'CLOSE_FORM' })}
          disabled={isAdding}
        >
          Cancel
        </button>
        <button type="submit" className="settings-btn settings-btn-primary" disabled={isAdding}>
          {isAdding ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
          Add
        </button>
      </div>
    </form>
  )
}

function AccountsEmptyState() {
  return (
    <div className="empty-state">
      <User size={32} />
      <p>No GitHub accounts configured</p>
      <p className="hint">
        Click &quot;Add Account&quot; to configure your first GitHub account for PR tracking.
      </p>
    </div>
  )
}

function AccountRepoRootBadge({ repoRoot }: { repoRoot?: string }) {
  if (!repoRoot) return null

  return (
    <>
      <span className="list-item-dot">·</span>
      <FolderOpen size={12} />
      <span className="list-item-path">{repoRoot}</span>
    </>
  )
}

function CancelEditButton({
  isEditing,
  onClick,
}: {
  isEditing: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  if (!isEditing) return null
  return (
    <button
      aria-label="Cancel editing"
      type="button"
      className="settings-btn settings-btn-icon"
      onClick={onClick}
      title="Cancel editing"
    >
      <X size={14} />
    </button>
  )
}

function AccountItemActions({
  isEditing,
  onCancel,
  onRemove,
}: {
  isEditing: boolean
  onCancel: (e: React.MouseEvent<HTMLButtonElement>) => void
  onRemove: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className="list-item-actions">
      <span className="auth-badge">GitHub CLI</span>
      <CancelEditButton isEditing={isEditing} onClick={onCancel} />
      <button
        aria-label="Remove account"
        type="button"
        className="settings-btn settings-btn-icon settings-btn-danger"
        onClick={onRemove}
        title="Remove account"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function AccountUsageProviderField({
  account,
  value,
  onChange,
  codexOwner,
  canUpdateAccounts,
}: {
  account: GitHubAccount
  value: UsageProvider
  onChange: (value: UsageProvider) => void
  codexOwner: GitHubAccount | null
  canUpdateAccounts: boolean
}) {
  return (
    <div className="form-field">
      <label htmlFor={`usage-provider-${resolveAccountKey(account)}`}>
        <Sparkles size={14} />
        Usage provider
      </label>
      <select
        aria-label={`Usage provider for ${account.username}`}
        id={`usage-provider-${resolveAccountKey(account)}`}
        value={value}
        onChange={event => onChange(event.target.value as UsageProvider)}
      >
        <option value="copilot">GitHub Copilot</option>
        <option value="codex" disabled={codexOwner !== null}>
          ChatGPT / Codex
        </option>
      </select>
      <span className="form-hint">
        {codexOwner
          ? `The local Codex login is already assigned to ${codexOwner.username}.`
          : canUpdateAccounts
            ? 'This selection syncs through Convex.'
            : 'This selection is saved locally on this device.'}
      </span>
    </div>
  )
}

function AccountEditError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={14} />
      {error}
    </div>
  )
}

function AccountRepoRootField({
  account,
  value,
  onChange,
  canUpdateAccounts,
}: {
  account: GitHubAccount
  value: string
  onChange: (value: string) => void
  canUpdateAccounts: boolean
}) {
  const selectDirectory = async () => {
    try {
      const selected = await window.ralph.selectDirectory(resolveRepoRootUpdate(value))
      if (selected) onChange(selected)
    } catch (_: unknown) {
      // Keep the current value when the picker fails or its sender detaches.
    }
  }

  return (
    <div className="form-field">
      <label htmlFor={`repo-root-${resolveAccountKey(account)}`}>
        <FolderOpen size={14} />
        Repository Root Path
      </label>
      <div className="ralph-input-row">
        <input
          aria-label="Repository root path"
          id={`repo-root-${resolveAccountKey(account)}`}
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={`D:\\github\\${account.org}`}
          disabled={!canUpdateAccounts}
        />
        <button
          aria-label="Browse for folder"
          type="button"
          className="settings-btn settings-btn-icon"
          title="Browse for folder"
          disabled={!canUpdateAccounts}
          onClick={selectDirectory}
        >
          <FolderOpen size={14} />
        </button>
        <button
          aria-label="Save"
          type="submit"
          className="settings-btn settings-btn-primary settings-btn-icon"
          title="Save"
          form="account-edit-form"
        >
          <Check size={14} />
        </button>
      </div>
      <span className="form-hint">
        {canUpdateAccounts
          ? `Local folder containing repos for this org (e.g. D:\\github\\${account.org})`
          : 'Connect to Convex to change the repository root.'}
      </span>
    </div>
  )
}

type AccountEditPanelProps = {
  isEditing: boolean
  account: GitHubAccount
  editRepoRoot: string
  setEditRepoRoot: React.Dispatch<React.SetStateAction<string>>
  editUsageProvider: UsageProvider
  setEditUsageProvider: React.Dispatch<React.SetStateAction<UsageProvider>>
  codexOwner: GitHubAccount | null
  canUpdateAccounts: boolean
  editError: string | null
  onSave: () => Promise<void>
}

function AccountEditPanel({
  isEditing,
  account,
  editRepoRoot,
  setEditRepoRoot,
  editUsageProvider,
  setEditUsageProvider,
  codexOwner,
  canUpdateAccounts,
  editError,
  onSave,
}: AccountEditPanelProps) {
  if (!isEditing) return null

  return (
    <form
      id="account-edit-form"
      className="list-item-edit-panel"
      onSubmit={event => {
        event.preventDefault()
        void onSave()
      }}
    >
      <AccountUsageProviderField
        account={account}
        value={editUsageProvider}
        onChange={setEditUsageProvider}
        codexOwner={codexOwner}
        canUpdateAccounts={canUpdateAccounts}
      />
      <AccountEditError error={editError} />
      <AccountRepoRootField
        account={account}
        value={editRepoRoot}
        onChange={setEditRepoRoot}
        canUpdateAccounts={canUpdateAccounts}
      />
    </form>
  )
}

type AccountListItemProps = {
  account: GitHubAccount
  editingKey: string | null
  editRepoRoot: string
  setEditingKey: React.Dispatch<React.SetStateAction<string | null>>
  setEditRepoRoot: React.Dispatch<React.SetStateAction<string>>
  updateAccount: ReturnType<typeof useGitHubAccounts>['updateAccount']
  updateUsageProvider: ReturnType<typeof useGitHubAccounts>['updateUsageProvider']
  handleRemove: (username: string, org: string) => Promise<void>
  codexOwner: GitHubAccount | null
  canUpdateAccounts: boolean
}

function AccountIdentity({ account, repoRoot }: { account: GitHubAccount; repoRoot?: string }) {
  return (
    <span className="list-item-content">
      <span className="list-item-primary">
        <User size={16} />
        <span className="item-name">{account.username}</span>
      </span>
      <span className="list-item-secondary">
        <Building2 size={14} />
        <span>{account.org}</span>
        <span className="account-badge">
          {account.usageProvider === 'codex' ? 'Codex' : 'Copilot'}
        </span>
        <AccountRepoRootBadge repoRoot={repoRoot} />
      </span>
    </span>
  )
}

function persistAccountEdit(
  account: GitHubAccount,
  repoRoot: string,
  usageProvider: UsageProvider,
  canUpdateAccounts: boolean,
  updateAccount: ReturnType<typeof useGitHubAccounts>['updateAccount'],
  updateUsageProvider: ReturnType<typeof useGitHubAccounts>['updateUsageProvider']
) {
  if (!canUpdateAccounts) {
    return updateUsageProvider(account.username, account.org, usageProvider)
  }
  return updateAccount(account.username, account.org, {
    repoRoot: resolveRepoRootUpdate(repoRoot),
    usageProvider,
  })
}

function useAccountEditor(props: AccountListItemProps, isEditing: boolean) {
  const {
    account,
    editRepoRoot,
    setEditingKey,
    setEditRepoRoot,
    updateAccount,
    updateUsageProvider,
    canUpdateAccounts,
  } = props
  const [usageProvider, setUsageProvider] = useState<UsageProvider>(
    account.usageProvider ?? 'copilot'
  )
  const [error, setError] = useState<string | null>(null)
  const activate = () => {
    setError(null)
    setUsageProvider(account.usageProvider ?? 'copilot')
    openAccountEditor(account, isEditing, setEditingKey, setEditRepoRoot)
  }
  const save = async () => {
    try {
      const result = await persistAccountEdit(
        account,
        editRepoRoot,
        usageProvider,
        canUpdateAccounts,
        updateAccount,
        updateUsageProvider
      )
      if (!result.success) {
        setError(result.error || 'Failed to update account')
        return
      }
      setError(null)
      setEditingKey(null)
    } catch (caught: unknown) {
      setError(getUserFacingErrorMessage(caught, 'Failed to update account'))
    }
  }
  return { usageProvider, setUsageProvider, error, setError, activate, save }
}

function AccountListItem(props: AccountListItemProps) {
  const {
    account,
    editingKey,
    editRepoRoot,
    setEditingKey,
    setEditRepoRoot,
    handleRemove,
    codexOwner,
    canUpdateAccounts,
  } = props
  const key = resolveAccountKey(account)
  const isEditing = editingKey === key
  const editor = useAccountEditor(props, isEditing)
  const visibleRepoRoot = resolveVisibleRepoRoot(account.repoRoot, isEditing)

  return (
    <div key={key} className={resolveAccountItemClassName(isEditing)}>
      <div className="list-item-row">
        <button
          type="button"
          className="list-item-main-button"
          onClick={editor.activate}
          onKeyDown={e => handleAccountItemKeyDown(e, isEditing, editor.activate)}
          style={{ cursor: resolveAccountItemCursor(isEditing) }}
        >
          <AccountIdentity account={account} repoRoot={visibleRepoRoot} />
        </button>
        <AccountItemActions
          isEditing={isEditing}
          onCancel={e => {
            e.stopPropagation()
            editor.setError(null)
            setEditingKey(null)
          }}
          onRemove={e => {
            e.stopPropagation()
            void handleRemove(account.username, account.org)
          }}
        />
      </div>
      <AccountEditPanel
        isEditing={isEditing}
        account={account}
        editRepoRoot={editRepoRoot}
        setEditRepoRoot={setEditRepoRoot}
        editUsageProvider={editor.usageProvider}
        setEditUsageProvider={editor.setUsageProvider}
        codexOwner={codexOwner}
        canUpdateAccounts={canUpdateAccounts}
        editError={editor.error}
        onSave={editor.save}
      />
    </div>
  )
}

function AccountsListSection({
  accounts,
  editingKey,
  editRepoRoot,
  setEditingKey,
  setEditRepoRoot,
  updateAccount,
  updateUsageProvider,
  handleRemove,
  canUpdateAccounts,
}: {
  accounts: GitHubAccount[]
  editingKey: string | null
  editRepoRoot: string
  setEditingKey: React.Dispatch<React.SetStateAction<string | null>>
  setEditRepoRoot: React.Dispatch<React.SetStateAction<string>>
  updateAccount: ReturnType<typeof useGitHubAccounts>['updateAccount']
  updateUsageProvider: ReturnType<typeof useGitHubAccounts>['updateUsageProvider']
  handleRemove: (username: string, org: string) => Promise<void>
  canUpdateAccounts: boolean
}) {
  if (accounts.length === 0) {
    return <AccountsEmptyState />
  }
  const codexOwner = accounts.find(account => account.usageProvider === 'codex') ?? null

  return (
    <div className="items-list">
      {accounts.map(account => (
        <AccountListItem
          key={resolveAccountKey(account)}
          account={account}
          editingKey={editingKey}
          editRepoRoot={editRepoRoot}
          setEditingKey={setEditingKey}
          setEditRepoRoot={setEditRepoRoot}
          updateAccount={updateAccount}
          updateUsageProvider={updateUsageProvider}
          handleRemove={handleRemove}
          codexOwner={codexOwner === account ? null : codexOwner}
          canUpdateAccounts={canUpdateAccounts}
        />
      ))}
    </div>
  )
}

function ConfiguredAccountsSection({
  showAddForm,
  dispatch,
  handleAdd,
  newUsername,
  newOrg,
  addError,
  isAdding,
  accounts,
  editingKey,
  editRepoRoot,
  setEditingKey,
  setEditRepoRoot,
  updateAccount,
  updateUsageProvider,
  handleRemove,
  canUpdateAccounts,
}: {
  showAddForm: boolean
  dispatch: React.Dispatch<AddAccountFormAction>
  handleAdd: (e: React.FormEvent) => void
  newUsername: string
  newOrg: string
  addError: string | null
  isAdding: boolean
  accounts: GitHubAccount[]
  editingKey: string | null
  editRepoRoot: string
  setEditingKey: React.Dispatch<React.SetStateAction<string | null>>
  setEditRepoRoot: React.Dispatch<React.SetStateAction<string>>
  updateAccount: ReturnType<typeof useGitHubAccounts>['updateAccount']
  updateUsageProvider: ReturnType<typeof useGitHubAccounts>['updateUsageProvider']
  handleRemove: (username: string, org: string) => Promise<void>
  canUpdateAccounts: boolean
}) {
  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>Configured Accounts</h3>
        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={() => dispatch({ type: 'OPEN_FORM' })}
          disabled={showAddForm}
        >
          <Plus size={14} />
          Add Account
        </button>
      </div>

      <AddAccountFormSection
        showAddForm={showAddForm}
        handleAdd={handleAdd}
        dispatch={dispatch}
        newUsername={newUsername}
        newOrg={newOrg}
        addError={addError}
        isAdding={isAdding}
      />

      <AccountsListSection
        accounts={accounts}
        editingKey={editingKey}
        editRepoRoot={editRepoRoot}
        setEditingKey={setEditingKey}
        setEditRepoRoot={setEditRepoRoot}
        updateAccount={updateAccount}
        updateUsageProvider={updateUsageProvider}
        handleRemove={handleRemove}
        canUpdateAccounts={canUpdateAccounts}
      />
    </div>
  )
}

function AuthenticationSection() {
  return (
    <div className="settings-section">
      <h3>Authentication</h3>
      <p className="section-description">
        Buddy uses GitHub CLI for secure authentication. Your tokens are stored in the system
        keychain, not in the app.
      </p>
      <div className="info-box">
        <p>
          <strong>To authenticate:</strong>
        </p>
        <ol>
          <li>
            Install GitHub CLI: <code>winget install GitHub.cli</code>
          </li>
          <li>
            Login: <code>gh auth login</code>
          </li>
          <li>
            Verify: <code>gh auth status</code>
          </li>
        </ol>
      </div>
    </div>
  )
}

function EnterpriseBillingSection({
  enterpriseSlug,
  setEnterpriseSlug,
  saveStatus,
  saveError,
  onSave,
}: {
  enterpriseSlug: string
  setEnterpriseSlug: (value: string) => void
  saveStatus: 'idle' | 'saving' | 'saved'
  saveError: string | null
  onSave: () => Promise<void>
}) {
  return (
    <div className="settings-section">
      <h3>Enterprise Billing</h3>
      <p className="section-description">
        Configure the GitHub Enterprise slug used for enterprise-scoped Copilot billing data. Leave
        it blank to disable those requests.
      </p>
      <div className="add-form">
        <div className="form-field">
          <label htmlFor="enterprise-slug">
            <Building2 size={14} />
            GitHub Enterprise Slug
          </label>
          <input
            id="enterprise-slug"
            type="text"
            value={enterpriseSlug}
            onChange={event => {
              setEnterpriseSlug(event.target.value)
            }}
            placeholder="your-enterprise"
            disabled={saveStatus === 'saving'}
          />
          <span className="form-hint">
            Enterprise billing features show a not-configured state until this value is set.
          </span>
        </div>
        {saveError && (
          <div className="form-error">
            <AlertCircle size={14} />
            {saveError}
          </div>
        )}
        <div className="form-actions">
          {saveStatus === 'saved' && <span className="form-hint">Saved</span>}
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            onClick={() => void onSave()}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <RefreshCw className="spin" size={14} />
            ) : (
              <Check size={14} />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function useAddAccountForm(
  accounts: GitHubAccount[],
  addAccount: ReturnType<typeof useGitHubAccounts>['addAccount']
) {
  const [formState, dispatch] = useReducer(addAccountFormReducer, INITIAL_FORM_STATE)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const { username, org } = trimAccountInput(formState.newUsername, formState.newOrg)
    const validationError = validateNewAccount(username, org, accounts)
    if (validationError) {
      dispatch({ type: 'SET_ERROR', value: validationError })
      return
    }
    dispatch({ type: 'START_ADD' })
    try {
      const result = await addAccount({ username, org })
      dispatch({ type: 'FINISH_ADD', error: resolveAddAccountError(result) })
    } catch (error: unknown) {
      dispatch({
        type: 'FINISH_ADD',
        error: getUserFacingErrorMessage(error, 'Failed to add account'),
      })
    }
  }

  return { ...formState, dispatch, handleAdd }
}

function useEnterpriseBilling() {
  const {
    config,
    loading,
    refresh,
    api: { setEnterpriseSlug: persistEnterpriseSlug },
  } = useConfig()
  const [enterpriseSlug, setEnterpriseSlug] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setEnterpriseSlug(config?.ui.enterpriseSlug ?? '')
  }, [config?.ui.enterpriseSlug])

  const handleChange = (value: string) => {
    setEnterpriseSlug(value)
    setSaveStatus('idle')
    setSaveError(null)
  }

  const handleSave = async () => {
    const normalizedSlug = enterpriseSlug.trim()
    try {
      if (normalizedSlug) assertValidGitHubAccountSlug(normalizedSlug)
      setSaveStatus('saving')
      setSaveError(null)
      const result = await persistEnterpriseSlug(normalizedSlug)
      if (!result.success) throw new Error(result.error ?? 'Failed to save enterprise slug')
      setEnterpriseSlug(normalizedSlug)
      await refresh()
      setSaveStatus('saved')
    } catch (error: unknown) {
      setSaveStatus('idle')
      setSaveError(getUserFacingErrorMessage(error, 'Failed to save enterprise slug'))
    }
  }

  return { enterpriseSlug, saveStatus, saveError, loading, handleChange, handleSave }
}

function AccountsLoadingState() {
  return (
    <div className="settings-page">
      <div className="settings-loading">
        <RefreshCw className="spin" size={24} />
        <p>Loading accounts…</p>
      </div>
    </div>
  )
}

export function SettingsAccounts() {
  const {
    accounts,
    loading,
    canUpdateAccounts = true,
    addAccount,
    removeAccount,
    updateAccount,
    updateUsageProvider,
  } = useGitHubAccounts()
  const { showAddForm, newUsername, newOrg, addError, isAdding, dispatch, handleAdd } =
    useAddAccountForm(accounts, addAccount)
  const {
    enterpriseSlug,
    saveStatus: enterpriseSaveStatus,
    saveError: enterpriseSaveError,
    loading: configLoading,
    handleChange: handleEnterpriseSlugChange,
    handleSave: handleEnterpriseSlugSave,
  } = useEnterpriseBilling()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editRepoRoot, setEditRepoRoot] = useState('')

  const { confirm, confirmDialog } = useConfirm()

  const handleRemove = async (username: string, org: string) => {
    const confirmed = await confirm({
      message: `Remove ${username}@${org}?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (confirmed) {
      await removeAccount(username, org)
    }
  }

  if (loading || configLoading) {
    return <AccountsLoadingState />
  }

  return (
    <>
      <div className="settings-page">
        <div className="settings-page-header">
          <h2>GitHub Accounts</h2>
          <p className="settings-page-description">
            Manage GitHub accounts for PR tracking. Authentication uses GitHub CLI - run{' '}
            <code>gh auth login</code> to authenticate.
          </p>
        </div>

        <div className="settings-page-content">
          <ConfiguredAccountsSection
            showAddForm={showAddForm}
            dispatch={dispatch}
            handleAdd={handleAdd}
            newUsername={newUsername}
            newOrg={newOrg}
            addError={addError}
            isAdding={isAdding}
            accounts={accounts}
            editingKey={editingKey}
            editRepoRoot={editRepoRoot}
            setEditingKey={setEditingKey}
            setEditRepoRoot={setEditRepoRoot}
            updateAccount={updateAccount}
            updateUsageProvider={updateUsageProvider}
            handleRemove={handleRemove}
            canUpdateAccounts={canUpdateAccounts}
          />
          <EnterpriseBillingSection
            enterpriseSlug={enterpriseSlug}
            setEnterpriseSlug={handleEnterpriseSlugChange}
            saveStatus={enterpriseSaveStatus}
            saveError={enterpriseSaveError}
            onSave={handleEnterpriseSlugSave}
          />
          <AuthenticationSection />
        </div>
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
