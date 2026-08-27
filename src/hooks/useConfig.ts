import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_RECENTLY_MERGED_DAYS } from '../constants'
import type { AppConfig } from '../types/config'
import {
  useGitHubAccountsConnection,
  useGitHubAccountsConvex,
  useSettings,
  useSettingsMutations,
} from './useConvex'
import { getErrorMessage } from '../utils/errorUtils'
import { IPC_INVOKE } from '../ipc/contracts'
import { useLocalAccountConfig, useResolvedAccounts } from './useUsageProviderOverrides'
import { useGitHubAccountActions } from './useGitHubAccountActions'

function useElectronStoreFallback<T>(
  convexValue: T | undefined,
  extractor: (config: AppConfig) => T,
  defaultValue: T
): { value: T; loading: boolean } {
  const [electronStoreValue, setElectronStoreValue] = useState<T>(defaultValue)
  const [fallbackLoaded, setFallbackLoaded] = useState(true)

  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
      .then((config: AppConfig) => {
        setElectronStoreValue(extractor(config))
        setFallbackLoaded(true)
      })
      .catch(() => setFallbackLoaded(true))
  }, [extractor])

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
    window.ipcRenderer.invoke(`config:${channel}`, value) as Promise<{
      success: boolean
      error?: string
    }>
}

const configAPI = {
  setTheme: (theme: 'dark' | 'light') =>
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_THEME, theme) as Promise<{ success: boolean }>,
  setAccentColor: ipcConfigSetter('set-accent-color'),
  setBgPrimary: ipcConfigSetter('set-bg-primary'),
  setBgSecondary: ipcConfigSetter('set-bg-secondary'),
  setFontColor: ipcConfigSetter('set-font-color'),
  setFontFamily: ipcConfigSetter('set-font-family'),
  setMonoFontFamily: ipcConfigSetter('set-mono-font-family'),
  setStatusBarBg: ipcConfigSetter('set-statusbar-bg'),
  setStatusBarFg: ipcConfigSetter('set-statusbar-fg'),
  setEnterpriseSlug: ipcConfigSetter('set-enterprise-slug'),
  getSystemFonts: () => window.ipcRenderer.invoke(IPC_INVOKE.SYSTEM_GET_FONTS) as Promise<string[]>,
  getStorePath: () =>
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_STORE_PATH) as Promise<string>,
  openInEditor: () =>
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_OPEN_IN_EDITOR) as Promise<{ success: boolean }>,
  reset: () => window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_RESET) as Promise<{ success: boolean }>,
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
      const fullConfig = (await window.ipcRenderer.invoke(
        IPC_INVOKE.CONFIG_GET_CONFIG
      )) as AppConfig
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

function computeAccountsLoading(convexConnected: boolean, fallbackLoaded: boolean): boolean {
  return !convexConnected && !fallbackLoaded
}

export function resolvePRFallback(config: AppConfig) {
  if (!config.pr)
    return {
      refreshInterval: 15,
      autoRefresh: false,
      recentlyMergedDays: DEFAULT_RECENTLY_MERGED_DAYS,
    }
  return {
    refreshInterval: config.pr.refreshInterval ?? 15,
    autoRefresh: config.pr.autoRefresh ?? false,
    recentlyMergedDays: config.pr.recentlyMergedDays ?? DEFAULT_RECENTLY_MERGED_DAYS,
  }
}

function resolvePRValues(s: {
  refreshInterval?: number | null
  autoRefresh?: boolean | null
  recentlyMergedDays?: number | null
}) {
  return {
    refreshInterval: s.refreshInterval ?? 15,
    autoRefresh: s.autoRefresh ?? false,
    recentlyMergedDays: s.recentlyMergedDays ?? DEFAULT_RECENTLY_MERGED_DAYS,
  }
}

export function resolveCopilotFallback(config: AppConfig) {
  if (!config.copilot)
    return { ghAccount: '', model: 'claude-sonnet-4.5', premiumModel: 'claude-opus-4.6' }
  return {
    ghAccount: config.copilot.ghAccount ?? '',
    model: config.copilot.model ?? 'claude-sonnet-4.5',
    premiumModel: config.copilot.premiumModel ?? 'claude-opus-4.6',
  }
}

function resolveCopilotValues(s: {
  ghAccount?: string | null
  model?: string | null
  premiumModel?: string | null
}) {
  return {
    ghAccount: s.ghAccount ?? '',
    model: s.model ?? 'claude-sonnet-4.5',
    premiumModel: s.premiumModel ?? 'claude-opus-4.6',
  }
}

export function useGitHubAccounts() {
  const convexAccounts = useGitHubAccountsConvex()
  const connection = useGitHubAccountsConnection()
  const accountActions = useGitHubAccountActions(convexAccounts, connection.isWebSocketConnected)
  const {
    accounts: electronStoreAccounts,
    overrides: usageProviderOverrides,
    defaultOverrides: usageProviderDefaultOverrides,
    loaded: fallbackLoaded,
  } = useLocalAccountConfig(
    convexAccounts,
    accountActions.reconcileUsageProvider,
    connection.connectionCount,
    connection.isWebSocketConnected
  )

  // Use Convex if connected, otherwise electron-store
  const convexConnected = convexAccounts !== undefined

  const accounts = useResolvedAccounts(
    convexAccounts,
    electronStoreAccounts,
    usageProviderOverrides,
    usageProviderDefaultOverrides
  )
  const uniqueUsernames = [...new Set(accounts.map(account => account.username))]

  const loading = computeAccountsLoading(convexConnected, fallbackLoaded)

  return {
    accounts,
    uniqueUsernames,
    loading,
    canUpdateAccounts: convexConnected && connection.isWebSocketConnected,
    ...accountActions,
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
    resolvePRFallback,
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

  const { refreshInterval, autoRefresh, recentlyMergedDays } = resolvePRValues(currentSettings)
  return {
    refreshInterval,
    autoRefresh,
    recentlyMergedDays,
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
    resolveCopilotFallback,
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

  const { ghAccount, model, premiumModel } = resolveCopilotValues(currentSettings)
  return {
    ghAccount,
    model,
    premiumModel,
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
      window.ipcRenderer.invoke(
        IPC_INVOKE.CONFIG_GET_NOTIFICATION_SOUND_ENABLED
      ) as Promise<boolean>,
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_NOTIFICATION_SOUND_PATH) as Promise<string>,
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
        IPC_INVOKE.CONFIG_SET_NOTIFICATION_SOUND_ENABLED,
        value
      )) as { success?: boolean }

      if (!result?.success) return false

      setEnabledState(value)
      return true
    } catch (err: unknown) {
      console.error('Failed to update notification sound setting:', err)
      return false
    }
  }

  const setSoundPath = async (path: string) => {
    try {
      const result = (await window.ipcRenderer.invoke(
        IPC_INVOKE.CONFIG_SET_NOTIFICATION_SOUND_PATH,
        path
      )) as { success?: boolean }

      if (!result?.success) return false

      setSoundPathState(path)
      return true
    } catch (err: unknown) {
      console.error('Failed to update notification sound path:', err)
      return false
    }
  }

  const pickSoundFile = async () => {
    const result = (await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_PICK_AUDIO_FILE)) as {
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
