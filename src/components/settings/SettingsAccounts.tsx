import { useState } from 'react';
import { useGitHubAccounts } from '../../hooks/useConfig';
import { Plus, Trash2, User, Building2, RefreshCw, AlertCircle } from 'lucide-react';
import type { GitHubAccount } from '../../types/config';
import './SettingsShared.css';

export function SettingsAccounts() {
  const { accounts, loading, addAccount, removeAccount, refresh } = useGitHubAccounts();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newOrg.trim()) {
      setAddError('Both username and organization are required');
      return;
    }

    // Check for duplicate
    if (accounts.some(a => a.username === newUsername.trim() && a.org === newOrg.trim())) {
      setAddError('This account already exists');
      return;
    }

    setIsAdding(true);
    setAddError(null);

    const account: GitHubAccount = {
      username: newUsername.trim(),
      org: newOrg.trim(),
    };

    const result = await addAccount(account);
    if (result.success) {
      setNewUsername('');
      setNewOrg('');
      setShowAddForm(false);
    } else {
      setAddError(result.error || 'Failed to add account');
    }
    setIsAdding(false);
  };

  const handleRemove = async (username: string, org: string) => {
    if (confirm(`Remove ${username}@${org}?`)) {
      await removeAccount(username, org);
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>GitHub Accounts</h2>
        <p className="settings-page-description">
          Manage GitHub accounts for PR tracking. Authentication uses GitHub CLI - run <code>gh auth login</code> to authenticate.
        </p>
      </div>

      <div className="settings-page-content">
        <div className="settings-section">
          <div className="section-header">
            <h3>Configured Accounts</h3>
            <button
              className="settings-btn settings-btn-primary"
              onClick={() => setShowAddForm(true)}
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
                    onChange={(e) => setNewUsername(e.target.value)}
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
                    onChange={(e) => setNewOrg(e.target.value)}
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
                  onClick={() => {
                    setShowAddForm(false);
                    setNewUsername('');
                    setNewOrg('');
                    setAddError(null);
                  }}
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
              {accounts.map((account, index) => (
                <div key={index} className="list-item">
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
            Buddy uses GitHub CLI for secure authentication. Your tokens are stored in the system keychain, not in the app.
          </p>
          <div className="info-box">
            <p><strong>To authenticate:</strong></p>
            <ol>
              <li>Install GitHub CLI: <code>winget install GitHub.cli</code></li>
              <li>Login: <code>gh auth login</code></li>
              <li>Verify: <code>gh auth status</code></li>
            </ol>
          </div>
          <button className="settings-btn settings-btn-secondary" onClick={refresh}>
            <RefreshCw size={14} />
            Refresh Accounts
          </button>
        </div>
      </div>
    </div>
  );
}
