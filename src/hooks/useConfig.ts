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
import { IPC_INVOKE } from '../ipc/contracts'

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
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_THEME, theme) as Promise<{ success: boolean }>,
  setAccentColor: ipcConfigSetter('set-accent-color'),
  setBgPrimary: ipcConfigSetter('set-bg-primary'),
  setBgSecondary: ipcConfigSetter('set-bg-secondary'),
  setFontColor: ipcConfigSetter('set-font-color'),
  setFontFamily: ipcConfigSetter('set-font-family'),
  setMonoFontFamily: ipcConfigSetter('set-mono-font-family'),
  setStatusBarBg: ipcConfigSetter('set-statusbar-bg'),
  setStatusBarFg: ipcConfigSetter('set-statusbar-fg'),
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

function resolveAccountsFromSources(
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  electronStoreAccounts: GitHubAccount[],
  convexConnected: boolean
): GitHubAccount[] {
  if (convexConnected && convexAccounts) {
    return convexAccounts.map(a => ({
      username: a.username,
      org: a.org,
      ...(a.repoRoot && { repoRoot: a.repoRoot }),
    }))
  }
  return electronStoreAccounts
}

function shouldInitializeAccounts(
  currentAccounts: GitHubAccount[],
  electronStoreAccounts: GitHubAccount[],
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined
): boolean {
  return (
    currentAccounts.length === 0 &&
    (electronStoreAccounts.length > 0 || (!!convexAccounts && convexAccounts.length > 0))
  )
}

function buildAccountsContentKey(
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  electronStoreAccounts: GitHubAccount[],
  convexConnected: boolean
): string {
  return JSON.stringify(
    resolveAccountsFromSources(convexAccounts, electronStoreAccounts, convexConnected).map(account => [
      account.username,
      account.org,
      account.repoRoot,
    ])
  )
}

function syncAccountsRef(
  prevKeyRef: { current: string },
  accountsRef: { current: GitHubAccount[] },
  contentKey: string,
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  electronStoreAccounts: GitHubAccount[],
  convexConnected: boolean
) {
  if (prevKeyRef.current !== contentKey) {
    prevKeyRef.current = contentKey
    accountsRef.current = resolveAccountsFromSources(
      convexAccounts,
      electronStoreAccounts,
      convexConnected
    )
    return
  }

  if (shouldInitializeAccounts(accountsRef.current, electronStoreAccounts, convexAccounts)) {
    accountsRef.current = resolveAccountsFromSources(
      convexAccounts,
      electronStoreAccounts,
      convexConnected
    )
  }
}

function computeAccountsLoading(convexConnected: boolean, fallbackLoaded: boolean): boolean {
  return !convexConnected && !fallbackLoaded
}

function resolvePRFallback(config: AppConfig) {
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

function resolveCopilotFallback(config: AppConfig) {
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
  const { create, update, remove } = useGitHubAccountMutations()
  const [electronStoreAccounts, setElectronStoreAccounts] = useState<GitHubAccount[]>([])
  const [fallbackLoaded, setFallbackLoaded] = useState(true) // Start true - electron-store always has defaults

  // Load electron-store accounts as fallback
  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
      .then((config: AppConfig) => {
        setElectronStoreAccounts(config.github?.accounts ?? [])
        setFallbackLoaded(true)
      })
      .catch(() => setFallbackLoaded(true))
  }, [])

  // Use Convex if connected, otherwise electron-store
  const convexConnected = convexAccounts !== undefined

  // Build content key for comparison (include repoRoot so edits trigger refresh)
  const contentKey = buildAccountsContentKey(convexAccounts, electronStoreAccounts, convexConnected)

  // Use ref to track previous key and accounts
  const prevKeyRef = useRef(contentKey)
  const accountsRef = useRef<GitHubAccount[]>([])

  // Only update accounts if content actually changed
  syncAccountsRef(
    prevKeyRef,
    accountsRef,
    contentKey,
    convexAccounts,
    electronStoreAccounts,
    convexConnected
  )

  const accounts = accountsRef.current
  const uniqueUsernames = [...new Set(accounts.map(account => account.username))]

  const loading = !convexConnected && !fallbackLoaded

  const findAccount = (username: string, org: string) => {
    if (!convexAccounts) return undefined
    return convexAccounts.find(account => account.username === username && account.org === org)
  }

  const addAccount = async (account: GitHubAccount) => {
    try {
      await create({ username: account.username, org: account.org })
      return { success: true }
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
