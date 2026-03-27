import { useReducer } from 'react'
import { useGitHubAccounts } from '../../hooks/useConfig'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import { Plus, Trash2, User, Building2, RefreshCw, AlertCircle } from 'lucide-react'
import type { GitHubAccount } from '../../types/config'
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

function addAccountFormReducer(
  state: AddAccountFormState,
  action: AddAccountFormAction
): AddAccountFormState {
  switch (action.type) {
    case 'OPEN_FORM':
      return { ...INITIAL_FORM_STATE, showAddForm: true }
    case 'CLOSE_FORM':
      return INITIAL_FORM_STATE
    case 'SET_USERNAME':
      return { ...state, newUsername: action.value }
    case 'SET_ORG':
      return { ...state, newOrg: action.value }
    case 'SET_ERROR':
      return { ...state, addError: action.value }
    case 'START_ADD':
      return { ...state, isAdding: true, addError: null }
    case 'FINISH_ADD':
      return action.error ? { ...state, isAdding: false, addError: action.error } : INITIAL_FORM_STATE
  }
}

export function SettingsAccounts() {
  const { accounts, loading, addAccount, removeAccount } = useGitHubAccounts()
  const [formState, dispatch] = useReducer(addAccountFormReducer, INITIAL_FORM_STATE)
  const { showAddForm, newUsername, newOrg, addError, isAdding } = formState

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const username = newUsername.trim()
    const org = newOrg.trim()

    if (!username || !org) {
      dispatch({ type: 'SET_ERROR', value: 'Both username and organization are required' })
      return
    }

    if (accounts.some(a => a.username === username && a.org === org)) {
      dispatch({ type: 'SET_ERROR', value: 'This account already exists' })
      return
    }

    dispatch({ type: 'START_ADD' })

    const account: GitHubAccount = {
      username,
      org,
    }

    try {
      const result = await addAccount(account)
      if (result.success) {
        dispatch({ type: 'FINISH_ADD', error: null })
      } else {
        dispatch({ type: 'FINISH_ADD', error: result.error || 'Failed to add account' })
      }
    } catch (error) {
      dispatch({
        type: 'FINISH_ADD',
        error: error instanceof Error ? error.message : 'Failed to add account',
      })
    }
  }

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

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading accounts...</p>
        </div>
      </div>
    )
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
        <div className="settings-section">
          <div className="section-header">
            <h3>Configured Accounts</h3>
            <button
              className="settings-btn settings-btn-primary"
              onClick={() => dispatch({ type: 'OPEN_FORM' })}
              disabled={showAddForm}
            >
              <Plus size={14} />
              Add Account
            </button>
          </div>

          {showAddForm && (
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
                <button
                  type="submit"
                  className="settings-btn settings-btn-primary"
                  disabled={isAdding}
                >
                  {isAdding ? <RefreshCw className="spin" size={14} /> : <Plus size={14} />}
                  Add
                </button>
              </div>
            </form>
          )}

          {accounts.length === 0 ? (
            <div className="empty-state">
              <User size={32} />
              <p>No GitHub accounts configured</p>
              <p className="hint">
                Click "Add Account" to configure your first GitHub account for PR tracking.
              </p>
            </div>
          ) : (
            <div className="items-list">
              {accounts.map(account => (
                <div key={`${account.username}-${account.org}`} className="list-item">
                  <div className="list-item-content">
                    <div className="list-item-primary">
                      <User size={16} />
                      <span className="item-name">{account.username}</span>
                    </div>
                    <div className="list-item-secondary">
                      <Building2 size={14} />
                      <span>{account.org}</span>
                    </div>
                  </div>
                  <div className="list-item-actions">
                    <span className="auth-badge">GitHub CLI</span>
                    <button
                      className="settings-btn settings-btn-icon settings-btn-danger"
                      onClick={() => handleRemove(account.username, account.org)}
                      title="Remove account"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
      </div>
    </div>
    {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
