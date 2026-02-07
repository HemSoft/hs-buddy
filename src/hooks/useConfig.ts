import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig, GitHubAccount } from '../types/config';
import { useGitHubAccountsConvex, useGitHubAccountMutations, useSettings, useSettingsMutations } from './useConvex';

/**
 * Type-safe wrapper around window.ipcRenderer for UI settings only
 * 
 * Architecture (Option A - Hybrid):
 * - UI settings (theme, colors, fonts, zoom) → electron-store (device-specific, instant startup)
 * - Business data (accounts, PR settings) → Convex (reactive, synced)
 */
const configAPI = {
  // UI Settings (kept in electron-store for instant startup)
  getTheme: () => window.ipcRenderer.invoke('config:get-theme') as Promise<'dark' | 'light'>,
  setTheme: (theme: 'dark' | 'light') =>
    window.ipcRenderer.invoke('config:set-theme', theme) as Promise<{ success: boolean }>,
  getAccentColor: () => window.ipcRenderer.invoke('config:get-accent-color') as Promise<string>,
  setAccentColor: (color: string) =>
    window.ipcRenderer.invoke('config:set-accent-color', color) as Promise<{ success: boolean }>,
  getBgPrimary: () => window.ipcRenderer.invoke('config:get-bg-primary') as Promise<string>,
  setBgPrimary: (color: string) =>
    window.ipcRenderer.invoke('config:set-bg-primary', color) as Promise<{ success: boolean }>,
  getBgSecondary: () => window.ipcRenderer.invoke('config:get-bg-secondary') as Promise<string>,
  setBgSecondary: (color: string) =>
    window.ipcRenderer.invoke('config:set-bg-secondary', color) as Promise<{ success: boolean }>,
  getFontColor: () => window.ipcRenderer.invoke('config:get-font-color') as Promise<string>,
  setFontColor: (color: string) =>
    window.ipcRenderer.invoke('config:set-font-color', color) as Promise<{ success: boolean }>,
  getFontFamily: () => window.ipcRenderer.invoke('config:get-font-family') as Promise<string>,
  setFontFamily: (font: string) =>
    window.ipcRenderer.invoke('config:set-font-family', font) as Promise<{ success: boolean }>,
  getMonoFontFamily: () => window.ipcRenderer.invoke('config:get-mono-font-family') as Promise<string>,
  setMonoFontFamily: (font: string) =>
    window.ipcRenderer.invoke('config:set-mono-font-family', font) as Promise<{ success: boolean }>,
  getZoomLevel: () => window.ipcRenderer.invoke('config:get-zoom-level') as Promise<number>,
  setZoomLevel: (level: number) =>
    window.ipcRenderer.invoke('config:set-zoom-level', level) as Promise<{ success: boolean }>,
  getSidebarWidth: () => window.ipcRenderer.invoke('config:get-sidebar-width') as Promise<number>,
  setSidebarWidth: (width: number) =>
    window.ipcRenderer.invoke('config:set-sidebar-width', width) as Promise<{ success: boolean }>,
  getPaneSizes: () => window.ipcRenderer.invoke('config:get-pane-sizes') as Promise<number[]>,
  setPaneSizes: (sizes: number[]) =>
    window.ipcRenderer.invoke('config:set-pane-sizes', sizes) as Promise<{ success: boolean }>,

  // System Fonts
  getSystemFonts: () => window.ipcRenderer.invoke('system:get-fonts') as Promise<string[]>,

  // Full Config (for legacy/UI settings)
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
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function useGitHubAccounts() {
  const convexAccounts = useGitHubAccountsConvex();
  const { create, update, remove } = useGitHubAccountMutations();
  const [electronStoreAccounts, setElectronStoreAccounts] = useState<GitHubAccount[]>([]);
  const [fallbackLoaded, setFallbackLoaded] = useState(true); // Start true - electron-store always has defaults

  // Load electron-store accounts as fallback
  useEffect(() => {
    window.ipcRenderer.invoke('config:get-config').then((config: AppConfig) => {
      setElectronStoreAccounts(config.github?.accounts ?? []);
      setFallbackLoaded(true);
    }).catch(() => setFallbackLoaded(true));
  }, []);

  // Use Convex if connected, otherwise electron-store
  const convexConnected = convexAccounts !== undefined;
  
  // Build content key for comparison
  const contentKey = convexConnected && convexAccounts
    ? JSON.stringify(convexAccounts.map(a => [a.username, a.org]))
    : JSON.stringify(electronStoreAccounts.map(a => [a.username, a.org]));
  
  // Use ref to track previous key and accounts
  const prevKeyRef = useRef(contentKey);
  const accountsRef = useRef<GitHubAccount[]>([]);
  
  // Only update accounts if content actually changed
  if (prevKeyRef.current !== contentKey) {
    prevKeyRef.current = contentKey;
    if (convexConnected && convexAccounts) {
      accountsRef.current = convexAccounts.map(a => ({ username: a.username, org: a.org }));
    } else {
      accountsRef.current = electronStoreAccounts;
    }
  } else if (accountsRef.current.length === 0 && (electronStoreAccounts.length > 0 || (convexAccounts && convexAccounts.length > 0))) {
    // Initialize on first valid data
    if (convexConnected && convexAccounts) {
      accountsRef.current = convexAccounts.map(a => ({ username: a.username, org: a.org }));
    } else {
      accountsRef.current = electronStoreAccounts;
    }
  }
  
  const accounts = accountsRef.current;

  const loading = !convexConnected && !fallbackLoaded;

  const addAccount = async (account: GitHubAccount) => {
    try {
      await create({ username: account.username, org: account.org });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const removeAccount = async (username: string, org: string) => {
    try {
      const account = convexAccounts?.find(a => a.username === username && a.org === org);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      await remove({ id: account._id });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const updateAccount = async (username: string, org: string, updates: Partial<GitHubAccount>) => {
    try {
      const account = convexAccounts?.find(a => a.username === username && a.org === org);
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      await update({ id: account._id, ...updates });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    accounts,
    loading,
    addAccount,
    removeAccount,
    updateAccount,
    refresh: () => {}, // Convex auto-refreshes via reactivity
  };
}

/**
 * Hook for PR-specific settings
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function usePRSettings() {
  const settings = useSettings();
  const { updatePR } = useSettingsMutations();
  const [electronStoreSettings, setElectronStoreSettings] = useState({
    refreshInterval: 15,
    autoRefresh: false,
    recentlyMergedDays: 7,
  });
  const [fallbackLoaded, setFallbackLoaded] = useState(true); // Start true - we have defaults

  // Load electron-store settings as fallback
  useEffect(() => {
    window.ipcRenderer.invoke('config:get-config').then((config: AppConfig) => {
      setElectronStoreSettings({
        refreshInterval: config.pr?.refreshInterval ?? 15,
        autoRefresh: config.pr?.autoRefresh ?? false,
        recentlyMergedDays: config.pr?.recentlyMergedDays ?? 7,
      });
      setFallbackLoaded(true);
    }).catch(() => setFallbackLoaded(true));
  }, []);

  // Use Convex if connected, otherwise electron-store
  const convexConnected = settings !== undefined;
  const currentSettings = convexConnected ? settings.pr : electronStoreSettings;
  const loading = !convexConnected && !fallbackLoaded;

  const setRefreshInterval = async (minutes: number) => {
    await updatePR({ refreshInterval: minutes });
  };

  const setAutoRefresh = async (enabled: boolean) => {
    await updatePR({ autoRefresh: enabled });
  };

  const setRecentlyMergedDays = async (days: number) => {
    await updatePR({ recentlyMergedDays: days });
  };

  return {
    refreshInterval: currentSettings.refreshInterval ?? 15,
    autoRefresh: currentSettings.autoRefresh ?? false,
    recentlyMergedDays: currentSettings.recentlyMergedDays ?? 7,
    loading,
    setRefreshInterval,
    setAutoRefresh,
    setRecentlyMergedDays,
  };
}

// Export the API directly for non-hook usage
export { configAPI };
