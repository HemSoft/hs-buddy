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

function hasConvexConnection<T>(value: T | undefined): boolean {
  return value !== undefined
}

function createAccountsContentKey(
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  electronStoreAccounts: GitHubAccount[],
  convexConnected: boolean
): string {
  const resolvedAccounts = resolveAccountsFromSources(
    convexAccounts,
    electronStoreAccounts,
    convexConnected
  )
  return JSON.stringify(resolvedAccounts.map(a => [a.username, a.org, a.repoRoot]))
}

function syncAccountsRef(
  prevKeyRef: { current: string },
  accountsRef: { current: GitHubAccount[] },
  contentKey: string,
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  electronStoreAccounts: GitHubAccount[],
  convexConnected: boolean
) {
  const resolvedAccounts = resolveAccountsFromSources(
    convexAccounts,
    electronStoreAccounts,
    convexConnected
  )

  if (prevKeyRef.current !== contentKey) {
    prevKeyRef.current = contentKey
    accountsRef.current = resolvedAccounts
    return
  }

  if (shouldInitializeAccounts(accountsRef.current, electronStoreAccounts, convexAccounts)) {
    accountsRef.current = resolvedAccounts
  }
}

function findStoredAccount(
  convexAccounts: Array<{ username: string; org: string; repoRoot?: string }> | undefined,
  username: string,
  org: string
) {
  if (!convexAccounts) return undefined
  return convexAccounts.find(account => account.username === username && account.org === org)
}

function resolveFallbackLoading(convexConnected: boolean, fallbackLoaded: boolean): boolean {
  return !convexConnected && !fallbackLoaded
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

  const convexConnected = hasConvexConnection(convexAccounts)
  const contentKey = createAccountsContentKey(
    convexAccounts,
    electronStoreAccounts,
    convexConnected
  )

  // Use ref to track previous key and accounts
  const prevKeyRef = useRef(contentKey)
  const accountsRef = useRef<GitHubAccount[]>([])

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
  const loading = resolveFallbackLoading(convexConnected, fallbackLoaded)

  const findAccount = (username: string, org: string) =>
    findStoredAccount(convexAccounts, username, org)

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

function buildPRFallback(config: AppConfig) {
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

interface CopilotSettingsValue {
  ghAccount?: string
  model?: string
  premiumModel?: string
}

function getDefaultCopilotSettings(): Required<CopilotSettingsValue> {
  return { ghAccount: '', model: 'claude-sonnet-4.5', premiumModel: 'claude-opus-4.6' }
}

function resolveCopilotSource(
  settings: ReturnType<typeof useSettings>
): CopilotSettingsValue | undefined {
  if (!settings) return undefined
  return settings.copilot
}

function resolveCopilotValues(
  currentSettings: CopilotSettingsValue
): Required<CopilotSettingsValue> {
  const defaults = getDefaultCopilotSettings()
  return {
    ghAccount: currentSettings.ghAccount ?? defaults.ghAccount,
    model: currentSettings.model ?? defaults.model,
    premiumModel: currentSettings.premiumModel ?? defaults.premiumModel,
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
    buildPRFallback,
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

function buildCopilotFallback(config: AppConfig) {
  const defaults = getDefaultCopilotSettings()
  if (!config.copilot) return defaults
  return {
    ghAccount: config.copilot.ghAccount ?? defaults.ghAccount,
    model: config.copilot.model ?? defaults.model,
    premiumModel: config.copilot.premiumModel ?? defaults.premiumModel,
  }
}

/**
 * Hook for Copilot-specific settings
 * Uses Convex as primary source, falls back to electron-store if Convex unavailable
 */
export function useCopilotSettings() {
  const settings = useSettings()
  const { updateCopilot } = useSettingsMutations()
  const copilotSource = resolveCopilotSource(settings)
  const { value: currentSettings, loading } = useElectronStoreFallback(
    copilotSource,
    buildCopilotFallback,
    getDefaultCopilotSettings()
  )
  const copilotValues = resolveCopilotValues(currentSettings)

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
    ...copilotValues,
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
