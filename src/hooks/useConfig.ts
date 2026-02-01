import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, GitHubAccount, BitbucketWorkspace } from '../types/config';

/**
 * Type-safe wrapper around window.ipcRenderer for configuration
 */
const configAPI = {
  // GitHub Accounts
  getGitHubAccounts: () => window.ipcRenderer.invoke('config:get-github-accounts') as Promise<GitHubAccount[]>,
  addGitHubAccount: (account: GitHubAccount) => 
    window.ipcRenderer.invoke('config:add-github-account', account) as Promise<{ success: boolean; error?: string }>,
  removeGitHubAccount: (username: string, org: string) =>
    window.ipcRenderer.invoke('config:remove-github-account', username, org) as Promise<{ success: boolean; error?: string }>,
  updateGitHubAccount: (username: string, org: string, updates: Partial<GitHubAccount>) =>
    window.ipcRenderer.invoke('config:update-github-account', username, org, updates) as Promise<{ success: boolean; error?: string }>,

  // Bitbucket Workspaces
  getBitbucketWorkspaces: () => window.ipcRenderer.invoke('config:get-bitbucket-workspaces') as Promise<BitbucketWorkspace[]>,
  addBitbucketWorkspace: (workspace: BitbucketWorkspace) =>
    window.ipcRenderer.invoke('config:add-bitbucket-workspace', workspace) as Promise<{ success: boolean; error?: string }>,
  removeBitbucketWorkspace: (workspace: string) =>
    window.ipcRenderer.invoke('config:remove-bitbucket-workspace', workspace) as Promise<{ success: boolean; error?: string }>,

  // UI Settings
  getTheme: () => window.ipcRenderer.invoke('config:get-theme') as Promise<'dark' | 'light'>,
  setTheme: (theme: 'dark' | 'light') =>
    window.ipcRenderer.invoke('config:set-theme', theme) as Promise<{ success: boolean }>,
  getSidebarWidth: () => window.ipcRenderer.invoke('config:get-sidebar-width') as Promise<number>,
  setSidebarWidth: (width: number) =>
    window.ipcRenderer.invoke('config:set-sidebar-width', width) as Promise<{ success: boolean }>,

  // PR Settings
  getPRRefreshInterval: () => window.ipcRenderer.invoke('config:get-pr-refresh-interval') as Promise<number>,
  setPRRefreshInterval: (minutes: number) =>
    window.ipcRenderer.invoke('config:set-pr-refresh-interval', minutes) as Promise<{ success: boolean }>,
  getPRAutoRefresh: () => window.ipcRenderer.invoke('config:get-pr-auto-refresh') as Promise<boolean>,
  setPRAutoRefresh: (enabled: boolean) =>
    window.ipcRenderer.invoke('config:set-pr-auto-refresh', enabled) as Promise<{ success: boolean }>,

  // Full Config
  getConfig: () => window.ipcRenderer.invoke('config:get-config') as Promise<AppConfig>,
  getStorePath: () => window.ipcRenderer.invoke('config:get-store-path') as Promise<string>,
  openInEditor: () => window.ipcRenderer.invoke('config:open-in-editor') as Promise<{ success: boolean }>,
  reset: () => window.ipcRenderer.invoke('config:reset') as Promise<{ success: boolean }>,
};

/**
 * React hook for accessing configuration
 * Returns the full config and helper methods
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial config
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const fullConfig = await configAPI.getConfig();
      setConfig(fullConfig);
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to load config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  // Refresh config (call after updates)
  const refresh = useCallback(async () => {
    await loadConfig();
  }, []);

  return {
    config,
    loading,
    error,
    refresh,
    api: configAPI,
  };
}

/**
 * Hook specifically for GitHub accounts
 */
export function useGitHubAccounts() {
  const [accounts, setAccounts] = useState<GitHubAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await configAPI.getGitHubAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load GitHub accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async (account: GitHubAccount) => {
    const result = await configAPI.addGitHubAccount(account);
    if (result.success) {
      await loadAccounts();
    }
    return result;
  };

  const removeAccount = async (username: string, org: string) => {
    const result = await configAPI.removeGitHubAccount(username, org);
    if (result.success) {
      await loadAccounts();
    }
    return result;
  };

  const updateAccount = async (username: string, org: string, updates: Partial<GitHubAccount>) => {
    const result = await configAPI.updateGitHubAccount(username, org, updates);
    if (result.success) {
      await loadAccounts();
    }
    return result;
  };

  return {
    accounts,
    loading,
    addAccount,
    removeAccount,
    updateAccount,
    refresh: loadAccounts,
  };
}

/**
 * Hook for PR-specific settings
 */
export function usePRSettings() {
  const [settings, setSettings] = useState({
    refreshInterval: 15,
    autoRefresh: false,
    recentlyMergedDays: 30,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const config = await configAPI.getConfig();
      setSettings({
        refreshInterval: config.pr?.refreshInterval ?? 15,
        autoRefresh: config.pr?.autoRefresh ?? false,
        recentlyMergedDays: config.pr?.recentlyMergedDays ?? 7,
      });
    } catch (err) {
      console.error('Failed to load PR settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const setRefreshInterval = async (minutes: number) => {
    await configAPI.setPRRefreshInterval(minutes);
    await loadSettings();
  };

  const setAutoRefresh = async (enabled: boolean) => {
    await configAPI.setPRAutoRefresh(enabled);
    await loadSettings();
  };

  return {
    ...settings,
    loading,
    setRefreshInterval,
    setAutoRefresh,
  };
}

// Export the API directly for non-hook usage
export { configAPI };
