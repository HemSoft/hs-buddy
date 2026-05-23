import { useState, useEffect } from 'react'
import { RefreshCw, Key, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'
import { IPC_INVOKE } from '../../ipc/contracts'
import './SettingsShared.css'

function ApiKeyStatus({ isConfigured }: { isConfigured: boolean }) {
  return (
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
  )
}

function SaveButton({ saving }: { saving: boolean }) {
  if (saving) {
    return (
      <>
        <RefreshCw className="spin" size={14} />
        Saving…
      </>
    )
  }
  return <>Save Key</>
}

function SettingsWeatherActions({
  saving,
  isDirty,
  apiKey,
  isConfigured,
  onSave,
  onClear,
}: {
  saving: boolean
  isDirty: boolean
  apiKey: string
  isConfigured: boolean
  onSave: () => void
  onClear: () => void
}) {
  return (
    <>
      <div className="button-group">
        <button
          className="settings-btn settings-btn-primary"
          onClick={onSave}
          disabled={saving || !isDirty || !apiKey.trim()}
        >
          <SaveButton saving={saving} />
        </button>
        {isConfigured && (
          <button
            className="settings-btn settings-btn-secondary"
            onClick={onClear}
            disabled={saving}
          >
            Clear Key
          </button>
        )}
      </div>
      <ApiKeyStatus isConfigured={isConfigured} />
    </>
  )
}

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
            Pollen data is provided by the Google Pollen API. Create a free Google Cloud API key (no
            credit card required, 10,000 calls/month) to see tree, grass, and weed pollen levels in
            your weather card.
          </p>

          <div className="settings-field-group">
            <label htmlFor="pollen-api-key" className="settings-label">
              Google Cloud API Key
            </label>
            <div className="settings-input-row">
              <input
                id="pollen-api-key"
                type={showKey ? 'text' : 'password'}
                className="settings-input"
                placeholder="Enter your Google Cloud API key…"
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

          <SettingsWeatherActions
            saving={saving}
            isDirty={isDirty}
            apiKey={apiKey}
            isConfigured={isConfigured}
            onSave={handleSave}
            onClear={handleClear}
          />

          <div className="info-box">
            <p>
              <strong>Get a free API key:</strong>
            </p>
            <p>
              <a
                href="https://console.cloud.google.com/apis/library/pollen.googleapis.com"
                className="settings-link"
                onClick={e => {
                  e.preventDefault()
                  window.ipcRenderer.invoke(
                    'shell:open-external',
                    'https://console.cloud.google.com/apis/library/pollen.googleapis.com'
                  )
                }}
              >
                <ExternalLink size={12} />
                Enable the Google Pollen API
              </a>{' '}
              — enable the API in your Google Cloud project, then create an API key under
              Credentials.
            </p>
            <p className="mt-2">
              <strong>Privacy:</strong> Your API key is stored locally in the app configuration
              file. It is never sent to any server other than Google.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
