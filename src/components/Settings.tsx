import { useEffect, useState } from 'react';
import { useConfig, useGitHubAccounts } from '../hooks/useConfig';
import { Settings as SettingsIcon, FileCode, RefreshCw, CheckCircle } from 'lucide-react';
import './Settings.css';

export function Settings() {
  const { config, loading: configLoading, api } = useConfig();
  const { accounts, loading: accountsLoading } = useGitHubAccounts();
  const [storePath, setStorePath] = useState<string>('');
  const [openSuccess, setOpenSuccess] = useState(false);

  useEffect(() => {
    // Load config file location
    api.getStorePath().then(setStorePath);
  }, [api]);

  const handleOpenConfig = async () => {
    await api.openInEditor();
    setOpenSuccess(true);
    setTimeout(() => setOpenSuccess(false), 2000);
  };

  if (configLoading || accountsLoading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <SettingsIcon size={24} />
        <h2>Settings</h2>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Configuration File</h3>
          <p className="settings-description">
            hs-buddy stores its configuration in a JSON file using electron-store.
            Authentication is handled securely through GitHub CLI (gh) - no tokens stored!
          </p>
          <div className="config-path-box">
            <FileCode size={16} />
            <code className="config-path">{storePath || 'Loading...'}</code>
          </div>
          <button className="settings-button" onClick={handleOpenConfig}>
            {openSuccess ? (
              <>
                <CheckCircle size={16} />
                Opened!
              </>
            ) : (
              <>
                <FileCode size={16} />
                Open in Editor
              </>
            )}
          </button>
        </section>

        <section className="settings-section">
          <h3>GitHub Accounts</h3>
          <p className="settings-description">
            Currently configured GitHub accounts for PR tracking.
            Authentication uses GitHub CLI (gh auth) - run <code>gh auth login</code> to authenticate.
          </p>
          {accounts.length === 0 ? (
            <div className="empty-state">
              <p>No GitHub accounts configured.</p>
              <p className="hint">
                Add accounts by editing the configuration file or setting environment variables
                (VITE_GITHUB_USERNAME, VITE_GITHUB_ORG) and restarting the app.
              </p>
              <p className="hint">
                Make sure you're logged in to GitHub CLI: <code>gh auth status</code>
              </p>
            </div>
          ) : (
            <div className="accounts-list">
              {accounts.map((account, index) => (
                <div key={index} className="account-item">
                  <div className="account-info">
                    <span className="account-username">{account.username}</span>
                    <span className="account-org">@{account.org}</span>
                  </div>
                  <div className="account-auth">
                    <span className="auth-method">GitHub CLI</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settings-section">
          <h3>UI Preferences</h3>
          <div className="settings-row">
            <label>Theme</label>
            <span className="settings-value">{config?.ui.theme || 'dark'}</span>
          </div>
          <div className="settings-row">
            <label>Sidebar Width</label>
            <span className="settings-value">{config?.ui.sidebarWidth || 300}px</span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Pull Request Settings</h3>
          <div className="settings-row">
            <label>Refresh Interval</label>
            <span className="settings-value">{config?.pr.refreshInterval || 15} minutes</span>
          </div>
          <div className="settings-row">
            <label>Auto Refresh</label>
            <span className="settings-value">
              {config?.pr.autoRefresh ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Advanced</h3>
          <p className="settings-description">
            For advanced configuration, you can manually edit the config.json file.
            The file uses JSON Schema validation to ensure correctness.
          </p>
          <p className="hint">
            Authentication is handled by GitHub CLI (gh). To check your authentication status, run:
            <code>gh auth status</code>
          </p>
        </section>
      </div>
    </div>
  );
}
