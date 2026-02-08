import { useState, useEffect, useCallback, useRef } from 'react';
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig';
import { RefreshCw, User, Sparkles, Cpu, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import './SettingsShared.css';

/** Model info returned from the Copilot SDK */
interface SdkModel {
  id: string;
  name: string;
  isDisabled: boolean;
  billingMultiplier: number;
}

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
  const [activeCliAccount, setActiveCliAccount] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Dynamic model list from SDK
  const [sdkModels, setSdkModels] = useState<SdkModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Fetch models from the Copilot SDK, optionally for a specific account.
  // The main process will atomically switch `gh auth` and then list models.
  const fetchModels = useCallback(async (forAccount?: string) => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await window.copilot.listModels(forAccount || undefined);
      if (result && 'error' in result) {
        setModelsError(result.error as string);
        setSdkModels([]);
      } else if (Array.isArray(result)) {
        console.log(`[SettingsCopilot] Fetched ${result.length} models`, result.map(m => m.id));
        setSdkModels(result);
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
      setSdkModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Fetch models immediately on mount (don't wait for Convex)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchModels(); // fetch for currently active CLI account right away
    }
  }, [fetchModels]);

  // Detect current active gh CLI account
  useEffect(() => {
    window.ipcRenderer.invoke('github:get-active-account')
      .then((account: string | null) => setActiveCliAccount(account))
      .catch(() => {});
  }, []);

  // Sync local state from Convex once it loads (one-time initialization)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setLocalAccount(ghAccount);
      setLocalModel(model);
      // If a specific account is configured, re-fetch models for that account
      if (ghAccount) {
        fetchModels(ghAccount);
      }
    }
  }, [loading, ghAccount, model, fetchModels]);

  // When models refresh, validate the selected model is still available.
  // If not, auto-select the first enabled model.
  useEffect(() => {
    if (sdkModels.length > 0) {
      const isKnown = sdkModels.some(m => m.id === localModel);
      if (!isKnown && localModel !== '') {
        // Current model not in the fetched list — pick the first enabled model
        const firstEnabled = sdkModels.find(m => !m.isDisabled);
        if (firstEnabled) {
          console.log(`[SettingsCopilot] Model "${localModel}" not found in list, auto-selecting "${firstEnabled.id}"`);
          setLocalModel(firstEnabled.id);
          setModel(firstEnabled.id);
          setIsCustomModel(false);
        } else {
          setIsCustomModel(true);
          setCustomModel(localModel);
        }
      } else {
        setIsCustomModel(false);
      }
    }
  }, [sdkModels, localModel, setModel]);

  const handleAccountChange = async (value: string) => {
    // 1. Update local state immediately so the dropdown doesn't revert
    setLocalAccount(value);

    // 2. Persist to Convex (fire and forget — local state is authoritative)
    setSaveStatus('saving');
    setGhAccount(value).catch(() => {});
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);

    // 3. Fetch models for the new account.
    //    The main process atomically does `gh auth switch` then `listModels()`.
    setActiveCliAccount(value || null);
    await fetchModels(value || undefined);

    // 4. Re-detect active CLI account to show the correct label
    if (!value) {
      window.ipcRenderer.invoke('github:get-active-account')
        .then((account: string | null) => setActiveCliAccount(account))
        .catch(() => {});
    }
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

  // Build account options from configured GitHub accounts
  const accountOptions = githubAccounts.map(a => a.username);
  // Deduplicate
  const uniqueAccounts = [...new Set(accountOptions)];

  // Separate enabled vs disabled models
  const enabledModels = sdkModels.filter(m => !m.isDisabled);
  const disabledModels = sdkModels.filter(m => m.isDisabled);

  /** Format billing multiplier as a human-readable label */
  const billingLabel = (multiplier: number) => {
    if (multiplier <= 1) return '';
    return ` · ${multiplier}x`;
  };

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

          {activeCliAccount && (
            <div className="info-box" style={{ marginBottom: '12px' }}>
              <p>
                <strong>Currently active CLI account:</strong>{' '}
                <code>{activeCliAccount}</code>
              </p>
            </div>
          )}

          <div className="select-control">
            <select
              value={localAccount}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="settings-select"
            >
              <option value="">
                Use active CLI account{activeCliAccount ? ` (${activeCliAccount})` : ''}
              </option>
              {uniqueAccounts.map((username) => (
                <option key={username} value={username}>
                  {username}
                </option>
              ))}
            </select>
          </div>

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
            <button
              className="settings-btn settings-btn-secondary"
              onClick={() => fetchModels(localAccount || undefined)}
              disabled={modelsLoading}
              title="Refresh models from Copilot SDK"
            >
              {modelsLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
          <p className="section-description">
            Select the LLM model for Copilot SDK prompts. Models are fetched live from the Copilot SDK.
            Different models vary in speed, quality, and cost.
          </p>

          {modelsError && (
            <div className="form-error" style={{ marginBottom: '8px' }}>
              <AlertCircle size={14} />
              Failed to fetch models: {modelsError}
            </div>
          )}

          {modelsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <Loader2 size={16} className="spin" />
              Fetching available models from Copilot SDK...
            </div>
          ) : sdkModels.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
              <AlertCircle size={16} />
              No models loaded. Click Refresh to fetch models.
            </div>
          ) : (
            <>
              <div className="select-control">
                <select
                  value={isCustomModel ? '__custom__' : localModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="settings-select"
                >
                  {enabledModels.length > 0 && (
                    <optgroup label="Available Models">
                      {enabledModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{billingLabel(m.billingMultiplier)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {disabledModels.length > 0 && (
                    <optgroup label="Disabled by Policy">
                      {disabledModels.map((m) => (
                        <option key={m.id} value={m.id} disabled>
                          {m.name} (disabled)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="__custom__">Custom model...</option>
                </select>
              </div>

              {sdkModels.length > 0 && (
                <p className="hint" style={{ marginTop: '4px' }}>
                  {enabledModels.length} model{enabledModels.length !== 1 ? 's' : ''} available
                  {disabledModels.length > 0 && `, ${disabledModels.length} disabled by policy`}
                </p>
              )}
            </>
          )}

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
              {localAccount || `Active CLI account${activeCliAccount ? ` (${activeCliAccount})` : ''}`}
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
