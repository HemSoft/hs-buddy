import Store from 'electron-store'
import {
  configSchema,
  defaultConfig,
  type AppConfig,
  type GitHubAccount,
  type UsageProvider,
} from '../src/types/config'
import {
  getUsageProviderOverrideKey,
  type UsageProviderOverrides,
} from '../src/utils/usageProviderOverrides'

/** Shared Convex URL — single source of truth for the main process. */
export const CONVEX_URL =
  import.meta.env.VITE_CONVEX_URL || 'https://balanced-trout-451.convex.cloud'

/**
 * Configuration manager using electron-store for persistent storage
 * Stores in userData/config.json (OS-specific location)
 *
 * SECURITY NOTE: Uses GitHub CLI (gh) for authentication.
 * No tokens are stored in config or environment variables!
 * Authentication is handled securely by GitHub CLI in system keychain.
 */
class ConfigManager {
  private store: Store<AppConfig>

  constructor() {
    this.store = new Store<AppConfig>({
      schema: configSchema,
      defaults: defaultConfig,
      name: 'config', // Creates config.json in userData
      clearInvalidConfig: false, // Preserve config even if validation fails
      watch: true, // Watch for external changes
    })

    this.store.onDidChange('github.accounts', () => {
      this.pruneUsageProviderOverrides()
    })
    this.pruneUsageProviderOverrides()

    console.log('[ConfigManager] Store location:', this.store.path)
  }

  private pruneUsageProviderOverrides(): UsageProviderOverrides {
    const overrides = this.store.get('github.usageProviderOverrides', {})
    const accountKeys = new Set(this.getGitHubAccounts().map(getUsageProviderOverrideKey))
    const pruned = Object.fromEntries(
      Object.entries(overrides).filter(([key]) => accountKeys.has(key))
    )
    if (Object.keys(pruned).length !== Object.keys(overrides).length) {
      this.store.set('github.usageProviderOverrides', pruned)
    }
    return pruned
  }

  // GitHub Account Management
  getGitHubAccounts(): GitHubAccount[] {
    return this.store.get('github.accounts', [])
  }

  hasGitHubAccount(username: string, org: string): boolean {
    const key = getUsageProviderOverrideKey({ username, org })
    return this.getGitHubAccounts().some(account => getUsageProviderOverrideKey(account) === key)
  }

  addGitHubAccount(account: GitHubAccount): void {
    const accounts = this.getGitHubAccounts()
    // Check for duplicates
    const exists = accounts.some(a => a.username === account.username && a.org === account.org)
    if (exists) {
      throw new Error(`GitHub account ${account.username}@${account.org} already exists`)
    }
    accounts.push(account)
    this.store.set('github.accounts', accounts)
  }

  removeGitHubAccount(username: string, org: string): void {
    const accounts = this.getGitHubAccounts()
    const filtered = accounts.filter(a => !(a.username === username && a.org === org))
    this.store.set('github.accounts', filtered)
    this.setUsageProviderOverride(username, org, null)
  }

  updateGitHubAccount(username: string, org: string, updates: Partial<GitHubAccount>): void {
    const accounts = this.getGitHubAccounts()
    const index = accounts.findIndex(a => a.username === username && a.org === org)
    if (index === -1) {
      throw new Error(`GitHub account ${username}@${org} not found`)
    }
    const previousKey = getUsageProviderOverrideKey(accounts[index])
    accounts[index] = { ...accounts[index], ...updates }
    this.store.set('github.accounts', accounts)
    if (getUsageProviderOverrideKey(accounts[index]) !== previousKey) {
      this.setUsageProviderOverride(username, org, null)
    }
  }

  replaceGitHubAccounts(accounts: GitHubAccount[]): void {
    const accountKeys = new Set<string>()
    for (const account of accounts) {
      const key = getUsageProviderOverrideKey(account)
      if (accountKeys.has(key)) {
        throw new Error(`Duplicate GitHub account ${account.username}@${account.org}`)
      }
      accountKeys.add(key)
    }

    this.store.set('github.accounts', accounts)
    const overrides = Object.fromEntries(
      Object.entries(this.getUsageProviderOverrides()).filter(([key]) => accountKeys.has(key))
    )
    this.store.set('github.usageProviderOverrides', overrides)
  }

  getUsageProviderOverrides(): UsageProviderOverrides {
    return this.pruneUsageProviderOverrides()
  }

  setUsageProviderOverride(username: string, org: string, provider: UsageProvider | null): void {
    const overrides = { ...this.getUsageProviderOverrides() }
    const key = getUsageProviderOverrideKey({ username, org })
    if (provider === null) {
      delete overrides[key]
    } else {
      overrides[key] = provider
    }
    this.store.set('github.usageProviderOverrides', overrides)
  }

  getUiValue<K extends keyof AppConfig['ui']>(key: K): AppConfig['ui'][K] {
    return this.store.get(
      `ui.${key}` as keyof AppConfig,
      defaultConfig.ui[key] as unknown as AppConfig[keyof AppConfig]
    ) as unknown as AppConfig['ui'][K]
  }

  setUiValue<K extends keyof AppConfig['ui']>(key: K, value: AppConfig['ui'][K]): void {
    this.store.set(`ui.${key}`, value)
  }

  // Copilot Settings (PR Review Prompt Template — still used via IPC)
  getCopilotPRReviewPromptTemplate(): string {
    return this.store.get('copilot.prReviewPromptTemplate', '')
  }

  setCopilotPRReviewPromptTemplate(template: string): void {
    this.store.set('copilot.prReviewPromptTemplate', template)
  }

  // Automation Settings
  getScheduleForecastDays(): number {
    return this.store.get('automation.scheduleForecastDays', 3)
  }

  setScheduleForecastDays(days: number): void {
    this.store.set('automation.scheduleForecastDays', Math.max(1, Math.min(30, days)))
  }

  // Notification Settings
  getNotificationSoundEnabled(): boolean {
    return this.store.get('notifications.playSoundOnReviewComplete', false)
  }

  setNotificationSoundEnabled(enabled: boolean): void {
    this.store.set('notifications.playSoundOnReviewComplete', enabled)
  }

  getNotificationSoundPath(): string {
    return this.store.get('notifications.reviewCompleteSoundPath', '')
  }

  setNotificationSoundPath(filePath: string): void {
    this.store.set('notifications.reviewCompleteSoundPath', filePath)
  }

  // Finance Settings
  getFinanceWatchlist(): string[] {
    return this.store.get('finance.watchlist', defaultConfig.finance.watchlist)
  }

  setFinanceWatchlist(symbols: string[]): void {
    // Defensive: ensure array of strings, dedupe, uppercase
    const cleaned = Array.from(
      new Set(
        (Array.isArray(symbols) ? symbols : []).flatMap(s => {
          if (typeof s !== 'string') return []
          const symbol = s.toUpperCase().trim()
          return symbol.length > 0 ? [symbol] : []
        })
      )
    )
    this.store.set('finance.watchlist', cleaned)
  }

  // Full config access
  getConfig(): AppConfig {
    return this.store.store
  }

  // Migration helper from environment variables
  migrateFromEnv(): void {
    // Check if we already have accounts - don't overwrite
    if (this.getGitHubAccounts().length > 0) {
      console.log('[ConfigManager] GitHub accounts already configured, skipping migration')
      return
    }

    // Try to read the .env file pattern (legacy support)
    const username = process.env.VITE_GITHUB_USERNAME
    const org = process.env.VITE_GITHUB_ORG

    if (username && org) {
      console.log('[ConfigManager] Migrating from environment variables...')
      this.addGitHubAccount({
        username,
        org,
      })
      console.log('[ConfigManager] Migration complete - now using GitHub CLI authentication')
      console.log(
        '[ConfigManager] You can remove VITE_GITHUB_USERNAME and VITE_GITHUB_ORG from .env (no longer needed)'
      )
    } else {
      console.log('[ConfigManager] No environment variables found for migration')
      console.log('[ConfigManager] Add accounts manually through Settings or edit config.json')
    }
  }

  // Utility methods
  getStorePath(): string {
    return this.store.path
  }

  reset(): void {
    this.store.clear()
    console.log('[ConfigManager] Configuration reset to defaults')
  }
}

// Singleton instance
export const configManager = new ConfigManager()
