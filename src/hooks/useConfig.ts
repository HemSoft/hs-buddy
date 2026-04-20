import { useState, useEffect, useCallback, useRef } from 'react'
import { DEFAULT_RECENTLY_MERGED_DAYS } from '../constants'
import type { AppConfig, GitHubAccount } from '../types/config'
import {
  useGitHubAccountsConvex,
  useGitHubAccountMutations,
  useSettings,
  useSettingsMutations,
} from './useConvex'
import { getErrorMessage } from '../utils/errorUtils'

function useElectronStoreFallback<T>(
  convexValue: T | undefined,
  extractor: (config: AppConfig) => T,
  defaultValue: T
): { value: T; loading: boolean } {
  const [electronStoreValue, setElectronStoreValue] = useState<T>(defaultValue)
  const [fallbackLoaded, setFallbackLoaded] = useState(true)

  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-config')
      .then((config: AppConfig) => {
        setElectronStoreValue(extractor(config))
        setFallbackLoaded(true)
      })
      /* v8 ignore start */
      .catch(() => setFallbackLoaded(true))
    /* v8 ignore stop */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const convexConnected = convexValue !== undefined
  const value = convexConnected ? convexValue : electronStoreValue
  const loading = !convexConnected && !fallbackLoaded

  return { value, loading }
}

/**
 * Type-safe wrapper around window.ipcRenderer for UI settings only
 *
 * Architecture (Option A - Hybrid):
 * - UI settings (theme, colors, fonts, zoom) → electron-store (device-specific, instant startup)
 * - Business data (accounts, PR settings) → Convex (reactive, synced)
 */
function ipcConfigSetter(channel: string) {
  return (value: string) =>
    window.ipcRenderer.invoke(`config:${channel}`, value) as Promise<{ success: boolean }>
}

const configAPI = {
  setTheme: (theme: 'dark' | 'light') =>
    window.ipcRenderer.invoke('config:set-theme', theme) as Promise<{ success: boolean }>,
  setAccentColor: ipcConfigSetter('set-accent-color'),
  setBgPrimary: ipcConfigSetter('set-bg-primary'),
  setBgSecondary: ipcConfigSetter('set-bg-secondary'),
  setFontColor: ipcConfigSetter('set-font-color'),
  setFontFamily: ipcConfigSetter('set-font-family'),
  setMonoFontFamily: ipcConfigSetter('set-mono-font-family'),
  setStatusBarBg: ipcConfigSetter('set-statusbar-bg'),
  setStatusBarFg: ipcConfigSetter('set-statusbar-fg'),
  getSystemFonts: () => window.ipcRenderer.invoke('system:get-fonts') as Promise<string[]>,
  getStorePath: () => window.ipcRenderer.invoke('config:get-store-path') as Promise<string>,
  openInEditor: () =>
    window.ipcRenderer.invoke('config:open-in-editor') as Promise<{ success: boolean }>,
  reset: () => window.ipcRenderer.invoke('config:reset') as Promise<{ success: boolean }>,
}

/**
 * React hook for accessing configuration
 * Returns the full config and helper methods
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load initial config
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const fullConfig = (await window.ipcRenderer.invoke('config:get-config')) as AppConfig
      setConfig(fullConfig)
      setError(null)
    } catch (err: unknown) {
      console.error('Failed to load config:', err)
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Refresh config (call after updates)
  const refresh = useCallback(async () => {
    await loadConfig()
  }, [])

  return {
    config,
    loading,
    error,
    refresh,
    api: configAPI,
  }
}

/**
 * Hook specifically for GitHub accounts
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function useGitHubAccounts() {
  const convexAccounts = useGitHubAccountsConvex()
  const { create, update, remove } = useGitHubAccountMutations()
  const [electronStoreAccounts, setElectronStoreAccounts] = useState<GitHubAccount[]>([])
  const [fallbackLoaded, setFallbackLoaded] = useState(true) // Start true - electron-store always has defaults

  // Load electron-store accounts as fallback
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-config')
      .then((config: AppConfig) => {
        /* v8 ignore start */
        setElectronStoreAccounts(config.github?.accounts ?? [])
        /* v8 ignore stop */
        setFallbackLoaded(true)
      })
      /* v8 ignore start */
      .catch(() => setFallbackLoaded(true))
    /* v8 ignore stop */
  }, [])

  // Use Convex if connected, otherwise electron-store
  const convexConnected = convexAccounts !== undefined

  // Build content key for comparison
  const contentKey =
    convexConnected && convexAccounts
      ? JSON.stringify(convexAccounts.map(a => [a.username, a.org]))
      : JSON.stringify(electronStoreAccounts.map(a => [a.username, a.org]))

  // Use ref to track previous key and accounts
  const prevKeyRef = useRef(contentKey)
  const accountsRef = useRef<GitHubAccount[]>([])

  // Only update accounts if content actually changed
  if (prevKeyRef.current !== contentKey) {
    prevKeyRef.current = contentKey
    if (convexConnected && convexAccounts) {
      accountsRef.current = convexAccounts.map(a => ({ username: a.username, org: a.org }))
    } else {
      accountsRef.current = electronStoreAccounts
    }
  } else if (
    accountsRef.current.length === 0 &&
    (electronStoreAccounts.length > 0 || (convexAccounts && convexAccounts.length > 0))
  ) {
    // Initialize on first valid data
    /* v8 ignore start */
    if (convexConnected && convexAccounts) {
      /* v8 ignore stop */
      accountsRef.current = convexAccounts.map(a => ({ username: a.username, org: a.org }))
    } else {
      /* v8 ignore start */
      accountsRef.current = electronStoreAccounts
      /* v8 ignore stop */
    }
  }

  const accounts = accountsRef.current
  const uniqueUsernames = [...new Set(accounts.map(account => account.username))]

  const loading = !convexConnected && !fallbackLoaded

  const findAccount = (username: string, org: string) =>
    convexAccounts?.find(account => account.username === username && account.org === org)

  const addAccount = async (account: GitHubAccount) => {
    try {
      await create({ username: account.username, org: account.org })
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  const removeAccount = async (username: string, org: string) => {
    try {
      const account = findAccount(username, org)
      if (!account) {
        return { success: false, error: 'Account not found' }
      }
      await remove({ id: account._id })
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  const updateAccount = async (username: string, org: string, updates: Partial<GitHubAccount>) => {
    try {
      const account = findAccount(username, org)
      if (!account) {
        return { success: false, error: 'Account not found' }
      }
      await update({ id: account._id, ...updates })
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  return {
    accounts,
    uniqueUsernames,
    loading,
    addAccount,
    removeAccount,
    updateAccount,
  }
}

/**
 * Hook for PR-specific settings
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function usePRSettings() {
  const settings = useSettings()
  const { updatePR } = useSettingsMutations()
  const { value: currentSettings, loading } = useElectronStoreFallback(
    settings?.pr,
    config => ({
      refreshInterval: config.pr?.refreshInterval ?? 15,
      autoRefresh: config.pr?.autoRefresh ?? false,
      recentlyMergedDays: config.pr?.recentlyMergedDays ?? DEFAULT_RECENTLY_MERGED_DAYS,
    }),
    {
      refreshInterval: 15,
      autoRefresh: true,
      recentlyMergedDays: DEFAULT_RECENTLY_MERGED_DAYS,
    }
  )

  const setRefreshInterval = async (minutes: number) => {
    await updatePR({ refreshInterval: minutes })
  }

  const setAutoRefresh = async (enabled: boolean) => {
    await updatePR({ autoRefresh: enabled })
  }

  const setRecentlyMergedDays = async (days: number) => {
    await updatePR({ recentlyMergedDays: days })
  }

  return {
    refreshInterval: currentSettings.refreshInterval ?? 15,
    autoRefresh: currentSettings.autoRefresh ?? false,
    recentlyMergedDays: currentSettings.recentlyMergedDays ?? DEFAULT_RECENTLY_MERGED_DAYS,
    loading,
    setRefreshInterval,
    setAutoRefresh,
    setRecentlyMergedDays,
  }
}

/**
 * Hook for Copilot-specific settings
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function useCopilotSettings() {
  const settings = useSettings()
  const { updateCopilot } = useSettingsMutations()
  const { value: currentSettings, loading } = useElectronStoreFallback(
    settings?.copilot ?? undefined,
    config => ({
      /* v8 ignore start */
      ghAccount: config.copilot?.ghAccount ?? '',
      /* v8 ignore stop */
      /* v8 ignore start */
      model: config.copilot?.model ?? 'claude-sonnet-4.5',
      /* v8 ignore stop */
      premiumModel: config.copilot?.premiumModel ?? 'claude-opus-4.6',
    }),
    { ghAccount: '', model: 'claude-sonnet-4.5', premiumModel: 'claude-opus-4.6' }
  )

  const setGhAccount = async (account: string) => {
    await updateCopilot({ ghAccount: account })
  }

  const setModel = async (model: string) => {
    await updateCopilot({ model })
  }

  const setPremiumModel = async (premiumModel: string) => {
    await updateCopilot({ premiumModel })
  }

  return {
    ghAccount: currentSettings.ghAccount ?? '',
    model: currentSettings.model ?? 'claude-sonnet-4.5',
    premiumModel: currentSettings.premiumModel ?? 'claude-opus-4.6',
    loading,
    setGhAccount,
    setModel,
    setPremiumModel,
  }
}

/**
 * Hook for notification settings
 * Stored in electron-store only (device-specific, not synced via Convex)
 */
export function useNotificationSettings() {
  const [enabled, setEnabledState] = useState(false)
  const [soundPath, setSoundPathState] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-notification-sound-enabled') as Promise<boolean>,
      window.ipcRenderer.invoke('config:get-notification-sound-path') as Promise<string>,
    ])
      .then(([e, p]) => {
        setEnabledState(e)
        setSoundPathState(p)
      })
      .catch(err => {
        console.error('Failed to load notification settings:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const setEnabled = async (value: boolean) => {
    try {
      const result = (await window.ipcRenderer.invoke(
        'config:set-notification-sound-enabled',
        value
      )) as { success?: boolean }

      if (!result?.success) return false

      setEnabledState(value)
      return true
    } catch (err) {
      console.error('Failed to update notification sound setting:', err)
      return false
    }
  }

  const setSoundPath = async (path: string) => {
    try {
      const result = (await window.ipcRenderer.invoke(
        'config:set-notification-sound-path',
        path
      )) as { success?: boolean }

      if (!result?.success) return false

      setSoundPathState(path)
      return true
    } catch (err) {
      console.error('Failed to update notification sound path:', err)
      return false
    }
  }

  const pickSoundFile = async () => {
    const result = (await window.ipcRenderer.invoke('config:pick-audio-file')) as {
      success: boolean
      canceled?: boolean
      filePath?: string
    }
    if (result.success && result.filePath) {
      const saved = await setSoundPath(result.filePath)
      return saved ? result.filePath : null
    }
    return null
  }

  return { enabled, soundPath, loading, setEnabled, setSoundPath, pickSoundFile }
}
