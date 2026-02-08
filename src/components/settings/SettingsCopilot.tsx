import { useState, useEffect, useRef } from 'react';
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig';
import { RefreshCw, User, Sparkles, Cpu, AlertCircle, CheckCircle } from 'lucide-react';
import { AccountPicker } from '../shared/AccountPicker';
import { ModelPicker } from '../shared/ModelPicker';
import './SettingsShared.css';

export function SettingsCopilot() {
  const {
    ghAccount,
    model,
    loading,
    setGhAccount,
    setModel,
  } = useCopilotSettings();

  const { accounts: githubAccounts } = useGitHubAccounts();

  const [localAccount, setLocalAccount] = useState(ghAccount);
  const [localModel, setLocalModel] = useState(model);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Sync local state from Convex once it loads (one-time initialization)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setLocalAccount(ghAccount);
      setLocalModel(model);
    }
  }, [loading, ghAccount, model]);

  const handleAccountChange = async (value: string) => {
    setLocalAccount(value);
    setSaveStatus('saving');
    setGhAccount(value).catch(() => {});
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleModelChange = async (value: string) => {
    if (value === '__custom__') {
      setIsCustomModel(true);
      return;
    }
    setIsCustomModel(false);
    setLocalModel(value);
    setSaveStatus('saving');
    await setModel(value);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleCustomModelSave = async () => {
    const trimmed = customModel.trim();
    if (!trimmed) return;
    setLocalModel(trimmed);
    setSaveStatus('saving');
    await setModel(trimmed);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleCustomModelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomModelSave();
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading Copilot settings...</p>
        </div>
      </div>
    );
  }

  const uniqueAccounts = [...new Set(githubAccounts.map(a => a.username))];

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Copilot SDK</h2>
        <p className="settings-page-description">
          Configure the GitHub account and model used for Copilot SDK interactions.
        </p>
        {saveStatus === 'saved' && (
          <span style={{ color: 'var(--text-success, #4ec9b0)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
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
            Choose which GitHub CLI account to use when running Copilot SDK prompts.
            The selected account determines billing and available models.
          </p>

          <AccountPicker
            value={localAccount}
            onChange={handleAccountChange}
            variant="select"
          />

          <p className="hint">
            When set to a specific account, Buddy will switch the active <code>gh</code> CLI account before
            executing Copilot prompts. Leave empty to use whichever account is currently active.
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
            Select the LLM model for Copilot SDK prompts. Models are fetched live from the Copilot SDK.
            Different models vary in speed, quality, and cost.
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
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={handleCustomModelKeyDown}
                placeholder="Enter custom model name"
                className="settings-input"
                style={{ flex: 1 }}
              />
              <button
                className="settings-btn settings-btn-primary"
                onClick={handleCustomModelSave}
                disabled={!customModel.trim()}
              >
                Apply
              </button>
            </div>
          )}

          <p className="hint">
            The model is passed to the Copilot SDK's <code>createSession()</code> call.
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
              <strong>Account:</strong>{' '}
              {localAccount || 'Active CLI account'}
            </p>
            <p>
              <strong>Model:</strong> <code>{localModel}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
