import { useEffect, useReducer, useRef } from 'react'
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig'
import { RefreshCw, User, Sparkles, Cpu, AlertCircle, CheckCircle } from 'lucide-react'
import { AccountPicker } from '../shared/AccountPicker'
import { ModelPicker } from '../shared/ModelPicker'
import './SettingsShared.css'

interface SettingsState {
  localAccount: string
  localModel: string
  customModel: string
  isCustomModel: boolean
  saveStatus: 'idle' | 'saving' | 'saved'
}

type SettingsAction =
  | { type: 'initialize'; account: string; model: string }
  | { type: 'set_account'; value: string }
  | { type: 'set_model'; value: string }
  | { type: 'set_custom_model'; value: string }
  | { type: 'toggle_custom_model'; enabled: boolean }
  | { type: 'saving' }
  | { type: 'saved' }
  | { type: 'reset_save' }

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'initialize':
      return {
        ...state,
        localAccount: action.account,
        localModel: action.model,
      }
    case 'set_account':
      return { ...state, localAccount: action.value }
    case 'set_model':
      return { ...state, localModel: action.value }
    case 'set_custom_model':
      return { ...state, customModel: action.value }
    case 'toggle_custom_model':
      return { ...state, isCustomModel: action.enabled }
    case 'saving':
      return { ...state, saveStatus: 'saving' }
    case 'saved':
      return { ...state, saveStatus: 'saved' }
    case 'reset_save':
      return { ...state, saveStatus: 'idle' }
  }
}

export function SettingsCopilot() {
  const { ghAccount, model, loading, setGhAccount, setModel } = useCopilotSettings()

  const { uniqueUsernames: uniqueAccounts } = useGitHubAccounts()
  const [state, dispatch] = useReducer(settingsReducer, {
    localAccount: ghAccount,
    localModel: model,
    customModel: '',
    isCustomModel: false,
    saveStatus: 'idle',
  })
  const { localAccount, localModel, customModel, isCustomModel, saveStatus } = state

  // Sync local state from Convex once it loads (one-time initialization)
  const initializedRef = useRef(false)
  const saveResetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true
      dispatch({ type: 'initialize', account: ghAccount, model })
    }
  }, [loading, ghAccount, model])

  useEffect(() => {
    return () => {
      if (saveResetTimerRef.current != null) {
        window.clearTimeout(saveResetTimerRef.current)
      }
    }
  }, [])

  const scheduleSaveStatusReset = () => {
    if (saveResetTimerRef.current != null) {
      window.clearTimeout(saveResetTimerRef.current)
    }
    saveResetTimerRef.current = window.setTimeout(() => {
      dispatch({ type: 'reset_save' })
      saveResetTimerRef.current = null
    }, 2000)
  }

  const handleAccountChange = async (value: string) => {
    dispatch({ type: 'set_account', value })
    dispatch({ type: 'saving' })
    setGhAccount(value).catch(() => {})
    dispatch({ type: 'saved' })
    scheduleSaveStatusReset()
  }

  const handleModelChange = async (value: string) => {
    if (value === '__custom__') {
      dispatch({ type: 'toggle_custom_model', enabled: true })
      return
    }

    dispatch({ type: 'toggle_custom_model', enabled: false })
    dispatch({ type: 'set_model', value })
    dispatch({ type: 'saving' })
    await setModel(value)
    dispatch({ type: 'saved' })
    scheduleSaveStatusReset()
  }

  const handleCustomModelSave = async () => {
    const trimmed = customModel.trim()
    if (!trimmed) return

    dispatch({ type: 'set_model', value: trimmed })
    dispatch({ type: 'saving' })
    await setModel(trimmed)
    dispatch({ type: 'saved' })
    scheduleSaveStatusReset()
  }

  const handleCustomModelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleCustomModelSave()
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading Copilot settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Copilot SDK</h2>
        <p className="settings-page-description">
          Configure the GitHub account and model used for Copilot SDK interactions.
        </p>
        {saveStatus === 'saved' && (
          <span
            style={{
              color: 'var(--text-success, #4ec9b0)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
          >
            <CheckCircle size={14} /> Saved
          </span>
        )}
      </div>

      <div className="settings-page-content">
        {/* GitHub Account Section */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <User size={16} />
              GitHub Account
            </h3>
          </div>
          <p className="section-description">
            Choose which GitHub CLI account to use when running Copilot SDK prompts. The selected
            account determines billing and available models.
          </p>

          <AccountPicker value={localAccount} onChange={handleAccountChange} variant="select" />

          <p className="hint">
            When set to a specific account, Buddy will switch the active <code>gh</code> CLI account
            before executing Copilot prompts. Leave empty to use whichever account is currently
            active.
          </p>

          {uniqueAccounts.length === 0 && (
            <div className="form-error" style={{ marginTop: '8px' }}>
              <AlertCircle size={14} />
              No GitHub accounts configured. Add accounts in the Accounts settings page.
            </div>
          )}
        </div>

        {/* Model Section */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Cpu size={16} />
              Model
            </h3>
          </div>
          <p className="section-description">
            Select the LLM model for Copilot SDK prompts. Models are fetched live from the Copilot
            SDK. Different models vary in speed, quality, and cost.
          </p>

          <ModelPicker
            value={isCustomModel ? '' : localModel}
            onChange={handleModelChange}
            ghAccount={localAccount}
            variant="select"
            showRefresh
          />

          {isCustomModel && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={customModel}
                onChange={e => dispatch({ type: 'set_custom_model', value: e.target.value })}
                onKeyDown={handleCustomModelKeyDown}
                placeholder="Enter custom model name"
                className="settings-input"
                style={{ flex: 1 }}
              />
              <button
                className="settings-btn settings-btn-primary"
                onClick={() => void handleCustomModelSave()}
                disabled={!customModel.trim()}
              >
                Apply
              </button>
            </div>
          )}

          <p className="hint">
            The model is passed to the Copilot SDK&apos;s <code>createSession()</code> call.
            Available models depend on your GitHub Copilot subscription tier.
          </p>
        </div>

        {/* Current Configuration Summary */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Sparkles size={16} />
              Current Configuration
            </h3>
          </div>
          <div className="info-box">
            <p>
              <strong>Account:</strong> {localAccount || 'Active CLI account'}
            </p>
            <p>
              <strong>Model:</strong> <code>{localModel}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
