import { useState, useRef, useCallback, useEffect } from 'react'
import { useNotificationSettings } from '../../hooks/useConfig'
import {
  createNotificationSoundBlob,
  type NotificationSoundAsset,
} from '../../utils/notificationSound'
import {
  Bell,
  FolderOpen,
  Play,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Volume2,
  X,
} from 'lucide-react'
import './SettingsShared.css'

function basename(filePath: string): string {
  return filePath.replace(/^.*[\\/]/, '')
}

export function SettingsNotifications() {
  const { enabled, soundPath, loading, setEnabled, setSoundPath, pickSoundFile } =
    useNotificationSettings()
  const [previewError, setPreviewError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const revokePreviewUrl = useCallback(() => {
    if (!previewUrlRef.current) return
    URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
  }, [])

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    revokePreviewUrl()
  }, [revokePreviewUrl])

  useEffect(() => {
    return () => {
      stopPreview()
    }
  }, [stopPreview])

  const handleToggle = async () => {
    await setEnabled(!enabled)
  }

  const handleBrowse = async () => {
    setPreviewError(null)
    await pickSoundFile()
  }

  const handleClear = async () => {
    setPreviewError(null)
    stopPreview()
    await setSoundPath('')
  }

  const handlePreview = useCallback(() => {
    /* v8 ignore start */
    if (!soundPath) return
    /* v8 ignore stop */
    setPreviewError(null)

    stopPreview()

    void (
      window.ipcRenderer.invoke(
        'config:play-notification-sound'
      ) as Promise<NotificationSoundAsset | null>
    )
      .then(sound => {
        if (!sound) {
          setPreviewError('Could not read the audio file.')
          return
        }
        const blob = createNotificationSoundBlob(sound)
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          if (audioRef.current === audio) audioRef.current = null
          if (previewUrlRef.current === url) revokePreviewUrl()
        }
        audio.onerror = () => {
          if (audioRef.current === audio) audioRef.current = null
          if (previewUrlRef.current === url) revokePreviewUrl()
          setPreviewError('Could not play this file. Make sure it is a valid audio file.')
        }
        audio.play().catch(() => {
          if (audioRef.current === audio) audioRef.current = null
          if (previewUrlRef.current === url) revokePreviewUrl()
          setPreviewError('Could not play this file. Make sure it is a valid audio file.')
        })
      })
      .catch(() => {
        setPreviewError('Could not play this file.')
      })
  }, [revokePreviewUrl, soundPath, stopPreview])

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading notification settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Notifications</h2>
        <p className="settings-page-description">
          Configure audio notifications for background events.
        </p>
      </div>

      <div className="settings-page-content">
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Bell size={16} />
              Copilot PR Review Complete
            </h3>
          </div>
          <p className="section-description">
            Play a sound when a Copilot PR review finishes. Useful when you navigate away while
            waiting for results.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="notification-sound-toggle">Enable Sound Notification</label>
              <p className="setting-hint">
                When enabled, the selected audio file will play whenever a Copilot PR review
                completes.
              </p>
            </div>
            <button
              id="notification-sound-toggle"
              className={`toggle-button ${enabled ? 'active' : ''}`}
              onClick={handleToggle}
              aria-pressed={enabled}
            >
              {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Volume2 size={16} />
              Sound File
            </h3>
          </div>
          <p className="section-description">
            Select a local audio file (MP3, WAV, OGG, FLAC, AAC, M4A) to play as the notification
            sound.
          </p>

          <div className="sound-file-row">
            {soundPath ? (
              <div className="sound-file-info">
                <code className="sound-file-name" title={soundPath}>
                  {basename(soundPath)}
                </code>
                <div className="sound-file-actions">
                  <button
                    className="settings-btn settings-btn-secondary"
                    onClick={handlePreview}
                    title="Preview sound"
                  >
                    <Play size={14} />
                    Preview
                  </button>
                  <button
                    className="settings-btn settings-btn-secondary"
                    onClick={handleClear}
                    title="Remove sound file"
                  >
                    <X size={14} />
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                No sound file selected.
              </p>
            )}
          </div>

          <div className="button-group" style={{ marginTop: '8px' }}>
            <button className="settings-btn settings-btn-primary" onClick={handleBrowse}>
              <FolderOpen size={14} />
              Browse…
            </button>
          </div>

          {previewError && (
            <p className="form-error" style={{ marginTop: '8px' }}>
              {previewError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
