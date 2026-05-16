import { useState, useEffect } from 'react'
import { RefreshCw, Key, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'
import { IPC_INVOKE } from '../../ipc/contracts'
import './SettingsShared.css'

export function SettingsWeather() {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_POLLEN_API_KEY)
      .then((key: string) => {
        setApiKey(key || '')
        setSavedKey(key || '')
      })
      .catch(() => {
        /* IPC unavailable */
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_POLLEN_API_KEY, apiKey.trim())
      setSavedKey(apiKey.trim())
    } catch (_: unknown) {
      /* IPC error */
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_POLLEN_API_KEY, '')
      setApiKey('')
      setSavedKey('')
    } catch (_: unknown) {
      /* IPC error */
    } finally {
      setSaving(false)
    }
  }

  const isDirty = apiKey.trim() !== savedKey
  const isConfigured = savedKey.length > 0

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading weather settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Weather</h2>
        <p className="settings-page-description">Configure pollen data and weather preferences.</p>
      </div>

      <div className="settings-page-content">
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Key size={16} />
              Pollen API Key
            </h3>
          </div>
          <p className="section-description">
            Pollen data is provided by Tomorrow.io. Sign up for a free API key (no credit card
            required, 500 calls/day) to see tree, grass, and weed pollen levels in your weather
            card.
          </p>

          <div className="settings-field-group">
            <label htmlFor="pollen-api-key" className="settings-label">
              Tomorrow.io API Key
            </label>
            <div className="settings-input-row">
              <input
                id="pollen-api-key"
                type={showKey ? 'text' : 'password'}
                className="settings-input"
                placeholder="Enter your Tomorrow.io API key…"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="button-group">
            <button
              className="settings-btn settings-btn-primary"
              onClick={handleSave}
              disabled={saving || !isDirty || !apiKey.trim()}
            >
              {saving ? (
                <>
                  <RefreshCw className="spin" size={14} />
                  Saving…
                </>
              ) : (
                'Save Key'
              )}
            </button>
            {isConfigured && (
              <button
                className="settings-btn settings-btn-secondary"
                onClick={handleClear}
                disabled={saving}
              >
                Clear Key
              </button>
            )}
          </div>

          <div className="settings-status-row">
            {isConfigured ? (
              <>
                <CheckCircle size={14} className="settings-status-icon-ok" />
                <span className="settings-status-text">
                  Configured — pollen data will appear in your weather card.
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="settings-status-icon-muted" />
                <span className="settings-status-text settings-status-muted">
                  Not configured — add an API key to see pollen data.
                </span>
              </>
            )}
          </div>

          <div className="info-box">
            <p>
              <strong>Get a free API key:</strong>
            </p>
            <p>
              <a
                href="https://app.tomorrow.io/signup"
                className="settings-link"
                onClick={e => {
                  e.preventDefault()
                  window.ipcRenderer.invoke('shell:open-external', 'https://app.tomorrow.io/signup')
                }}
              >
                <ExternalLink size={12} />
                Sign up at Tomorrow.io
              </a>{' '}
              — create a free account and copy your API key from the dashboard.
            </p>
            <p className="mt-2">
              <strong>Privacy:</strong> Your API key is stored locally in the app configuration
              file. It is never sent to any server other than Tomorrow.io.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
