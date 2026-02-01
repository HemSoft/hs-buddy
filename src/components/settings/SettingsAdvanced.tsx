import { useState, useEffect } from 'react';
import { useConfig } from '../../hooks/useConfig';
import { FileCode, RotateCcw, RefreshCw, CheckCircle, AlertTriangle, FolderOpen } from 'lucide-react';
import './SettingsShared.css';

export function SettingsAdvanced() {
  const { api, refresh, loading } = useConfig();
  const [storePath, setStorePath] = useState<string>('');
  const [openSuccess, setOpenSuccess] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    api.getStorePath().then(setStorePath);
  }, [api]);

  const handleOpenConfig = async () => {
    await api.openInEditor();
    setOpenSuccess(true);
    setTimeout(() => setOpenSuccess(false), 2000);
  };

  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }

    setIsResetting(true);
    await api.reset();
    await refresh();
    setIsResetting(false);
    setResetConfirm(false);
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading advanced settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Advanced</h2>
        <p className="settings-page-description">
          Access raw configuration and advanced options.
        </p>
      </div>

      <div className="settings-page-content">
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <FileCode size={16} />
              Configuration File
            </h3>
          </div>
          <p className="section-description">
            Buddy stores its configuration in a JSON file using electron-store.
          </p>
          <div className="config-path-box">
            <FolderOpen size={16} />
            <code className="config-path">{storePath || 'Loading...'}</code>
          </div>
          <div className="button-group">
            <button
              className="settings-btn settings-btn-primary"
              onClick={handleOpenConfig}
            >
              {openSuccess ? (
                <>
                  <CheckCircle size={14} />
                  Opened!
                </>
              ) : (
                <>
                  <FileCode size={14} />
                  Open in Editor
                </>
              )}
            </button>
          </div>
          <p className="hint">
            The configuration file uses JSON Schema validation to ensure correctness.
          </p>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h3>
              <RotateCcw size={16} />
              Reset Configuration
            </h3>
          </div>
          <p className="section-description">
            Reset all settings to their default values.
          </p>
          <div className="danger-zone">
            <div className="danger-warning">
              <AlertTriangle size={16} />
              <span>
                This will remove all configured accounts and reset all preferences.
              </span>
            </div>
            <button
              className={`settings-btn ${resetConfirm ? 'settings-btn-danger' : 'settings-btn-secondary'}`}
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <RefreshCw className="spin" size={14} />
                  Resetting...
                </>
              ) : resetConfirm ? (
                <>
                  <AlertTriangle size={14} />
                  Click Again to Confirm
                </>
              ) : (
                <>
                  <RotateCcw size={14} />
                  Reset to Defaults
                </>
              )}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>About Storage</h3>
          <div className="info-box">
            <p><strong>Security Note:</strong></p>
            <p>
              Authentication is handled by GitHub CLI (gh). Your tokens are stored 
              securely in the system keychain, not in this configuration file.
            </p>
            <p className="mt-2">
              <strong>Location varies by OS:</strong>
            </p>
            <ul>
              <li><strong>Windows:</strong> <code>%APPDATA%\hs-buddy\config.json</code></li>
              <li><strong>macOS:</strong> <code>~/Library/Application Support/hs-buddy/config.json</code></li>
              <li><strong>Linux:</strong> <code>~/.config/hs-buddy/config.json</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
