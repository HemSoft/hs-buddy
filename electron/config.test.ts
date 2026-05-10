import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {}
    path = '/mock/config.json'
    store = {}

    constructor() {
      this.data = {}
      this.store = this.data
    }

    get(key: string, defaultValue?: unknown): unknown {
      return this.data[key] ?? defaultValue
    }

    set(key: string, value: unknown): void {
      this.data[key] = value
    }

    has(key: string): boolean {
      return key in this.data
    }

    delete(key: string): void {
      delete this.data[key]
    }

    clear(): void {
      this.data = {}
      this.store = this.data
    }
  },
}))

vi.mock('../src/types/config', () => ({
  configSchema: {},
  defaultConfig: {
    ui: { theme: 'dark', accentColor: '#0078d4', zoomLevel: 1.0 },
    github: { accounts: [] },
    schedule: { forecastDays: 3 },
    finance: { watchlist: ['AAPL'] },
  },
}))

import { configManager, CONVEX_URL } from './config'

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configManager.reset()
  })

  it('exports CONVEX_URL as a string', () => {
    expect(typeof CONVEX_URL).toBe('string')
    expect(CONVEX_URL.length).toBeGreaterThan(0)
  })

  it('configManager is defined', () => {
    expect(configManager).toBeDefined()
  })

  it('configManager has expected methods', () => {
    expect(typeof configManager.getGitHubAccounts).toBe('function')
    expect(typeof configManager.addGitHubAccount).toBe('function')
    expect(typeof configManager.removeGitHubAccount).toBe('function')
    expect(typeof configManager.getScheduleForecastDays).toBe('function')
    expect(typeof configManager.setScheduleForecastDays).toBe('function')
  })

  it('getGitHubAccounts returns an array', () => {
    const accounts = configManager.getGitHubAccounts()
    expect(Array.isArray(accounts)).toBe(true)
  })

  describe('addGitHubAccount', () => {
    it('adds a new account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([{ username: 'user1', org: 'org1' }])
    })

    it('throws when adding duplicate account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      expect(() => configManager.addGitHubAccount({ username: 'user1', org: 'org1' })).toThrow(
        'already exists'
      )
    })
  })

  describe('removeGitHubAccount', () => {
    it('removes an existing account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      configManager.removeGitHubAccount('user1', 'org1')
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([])
    })
  })

  describe('updateGitHubAccount', () => {
    it('updates an existing account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      configManager.updateGitHubAccount('user1', 'org1', { username: 'user1-updated' })
      const accounts = configManager.getGitHubAccounts()
      expect(accounts[0].username).toBe('user1-updated')
    })

    it('throws when account not found', () => {
      expect(() => configManager.updateGitHubAccount('nouser', 'noorg', {})).toThrow('not found')
    })
  })

  describe('UI values', () => {
    it('getUiValue returns default when not set', () => {
      const value = configManager.getUiValue('theme')
      expect(value).toBeDefined()
    })

    it('setUiValue and getUiValue roundtrip', () => {
      configManager.setUiValue('theme', 'light')
      expect(configManager.getUiValue('theme')).toBe('light')
    })
  })

  describe('Copilot PR Review Prompt Template', () => {
    it('gets and sets template', () => {
      configManager.setCopilotPRReviewPromptTemplate('my template')
      expect(configManager.getCopilotPRReviewPromptTemplate()).toBe('my template')
    })
  })

  describe('Schedule Forecast Days', () => {
    it('getScheduleForecastDays returns a number', () => {
      const days = configManager.getScheduleForecastDays()
      expect(typeof days).toBe('number')
    })

    it('setScheduleForecastDays clamps to min 1', () => {
      configManager.setScheduleForecastDays(0)
      expect(configManager.getScheduleForecastDays()).toBe(1)
    })

    it('setScheduleForecastDays clamps to max 30', () => {
      configManager.setScheduleForecastDays(100)
      expect(configManager.getScheduleForecastDays()).toBe(30)
    })
  })

  describe('Notification Settings', () => {
    it('gets and sets notification sound enabled', () => {
      configManager.setNotificationSoundEnabled(true)
      expect(configManager.getNotificationSoundEnabled()).toBe(true)
    })

    it('gets and sets notification sound path', () => {
      configManager.setNotificationSoundPath('/path/to/sound.mp3')
      expect(configManager.getNotificationSoundPath()).toBe('/path/to/sound.mp3')
    })
  })

  describe('Finance Watchlist', () => {
    it('gets default watchlist', () => {
      const watchlist = configManager.getFinanceWatchlist()
      expect(Array.isArray(watchlist)).toBe(true)
    })

    it('setFinanceWatchlist deduplicates and uppercases', () => {
      configManager.setFinanceWatchlist(['aapl', 'AAPL', 'goog'])
      expect(configManager.getFinanceWatchlist()).toEqual(['AAPL', 'GOOG'])
    })

    it('setFinanceWatchlist handles non-array gracefully', () => {
      // @ts-expect-error testing defensive behavior
      configManager.setFinanceWatchlist(null)
      expect(configManager.getFinanceWatchlist()).toEqual([])
    })

    it('setFinanceWatchlist filters empty strings', () => {
      configManager.setFinanceWatchlist(['AAPL', '', '  ', 'GOOG'])
      expect(configManager.getFinanceWatchlist()).toEqual(['AAPL', 'GOOG'])
    })
  })

  describe('Full config access', () => {
    it('getConfig returns an object', () => {
      const config = configManager.getConfig()
      expect(config).toBeDefined()
    })
  })

  describe('migrateFromEnv', () => {
    it('skips migration when accounts already exist', () => {
      configManager.addGitHubAccount({ username: 'existing', org: 'org' })
      // Should not throw
      configManager.migrateFromEnv()
    })

    it('migrates from env when no accounts exist and env vars are set', () => {
      vi.stubEnv('VITE_GITHUB_USERNAME', 'envuser')
      vi.stubEnv('VITE_GITHUB_ORG', 'envorg')
      configManager.migrateFromEnv()
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([{ username: 'envuser', org: 'envorg' }])
      vi.unstubAllEnvs()
    })

    it('handles missing env vars gracefully', () => {
      vi.stubEnv('VITE_GITHUB_USERNAME', '')
      vi.stubEnv('VITE_GITHUB_ORG', '')
      configManager.migrateFromEnv()
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([])
      vi.unstubAllEnvs()
    })
  })

  describe('Utility methods', () => {
    it('getStorePath returns a string', () => {
      const storePath = configManager.getStorePath()
      expect(typeof storePath).toBe('string')
    })

    it('reset clears the store', () => {
      configManager.addGitHubAccount({ username: 'user', org: 'org' })
      configManager.reset()
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([])
    })
  })
})
