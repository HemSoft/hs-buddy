import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {}
    path = '/mock/config.json'

    constructor() {
      this.data = {}
    }

    get store(): Record<string, unknown> {
      return { ...this.data }
    }

    set store(value: Record<string, unknown>) {
      this.data = { ...(value ?? {}) }
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
    }
  },
}))

vi.mock('../src/types/config', () => ({
  configSchema: {},
  defaultConfig: {
    ui: { theme: 'dark', 'accent-color': '#0078d4', 'zoom-level': 1.0 },
    github: { accounts: [] },
    schedule: { forecastDays: 3 },
    finance: { watchlist: ['AAPL', 'MSFT'] },
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

  it('getScheduleForecastDays returns a number', () => {
    const days = configManager.getScheduleForecastDays()
    expect(typeof days).toBe('number')
  })

  describe('GitHub account management', () => {
    it('addGitHubAccount adds an account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([{ username: 'user1', org: 'org1' }])
    })

    it('addGitHubAccount throws on duplicate', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      expect(() => configManager.addGitHubAccount({ username: 'user1', org: 'org1' })).toThrow(
        'already exists'
      )
    })

    it('removeGitHubAccount removes the account', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      configManager.removeGitHubAccount('user1', 'org1')
      const accounts = configManager.getGitHubAccounts()
      expect(accounts).toEqual([])
    })

    it('updateGitHubAccount updates account fields', () => {
      configManager.addGitHubAccount({ username: 'user1', org: 'org1' })
      configManager.updateGitHubAccount('user1', 'org1', { username: 'user1-updated' })
      const accounts = configManager.getGitHubAccounts()
      expect(accounts[0].username).toBe('user1-updated')
    })

    it('updateGitHubAccount throws when account not found', () => {
      expect(() => configManager.updateGitHubAccount('nobody', 'nowhere', {})).toThrow('not found')
    })
  })

  describe('UI values', () => {
    it('getUiValue returns default when not set', () => {
      const theme = configManager.getUiValue('theme')
      expect(theme).toBe('dark')
    })

    it('setUiValue and getUiValue round-trip', () => {
      configManager.setUiValue('theme', 'light')
      const theme = configManager.getUiValue('theme')
      expect(theme).toBe('light')
    })
  })

  describe('Copilot settings', () => {
    it('getCopilotPRReviewPromptTemplate returns empty string by default', () => {
      expect(configManager.getCopilotPRReviewPromptTemplate()).toBe('')
    })

    it('setCopilotPRReviewPromptTemplate stores template', () => {
      configManager.setCopilotPRReviewPromptTemplate('Review this PR')
      expect(configManager.getCopilotPRReviewPromptTemplate()).toBe('Review this PR')
    })
  })

  describe('Automation settings', () => {
    it('setScheduleForecastDays clamps to min 1', () => {
      configManager.setScheduleForecastDays(0)
      expect(configManager.getScheduleForecastDays()).toBe(1)
    })

    it('setScheduleForecastDays clamps to max 30', () => {
      configManager.setScheduleForecastDays(100)
      expect(configManager.getScheduleForecastDays()).toBe(30)
    })

    it('setScheduleForecastDays stores valid value', () => {
      configManager.setScheduleForecastDays(10)
      expect(configManager.getScheduleForecastDays()).toBe(10)
    })
  })

  describe('Notification settings', () => {
    it('getNotificationSoundEnabled defaults to false', () => {
      expect(configManager.getNotificationSoundEnabled()).toBe(false)
    })

    it('setNotificationSoundEnabled stores value', () => {
      configManager.setNotificationSoundEnabled(true)
      expect(configManager.getNotificationSoundEnabled()).toBe(true)
    })

    it('getNotificationSoundPath defaults to empty string', () => {
      expect(configManager.getNotificationSoundPath()).toBe('')
    })

    it('setNotificationSoundPath stores path', () => {
      configManager.setNotificationSoundPath('/sounds/ding.wav')
      expect(configManager.getNotificationSoundPath()).toBe('/sounds/ding.wav')
    })
  })

  describe('Finance settings', () => {
    it('getFinanceWatchlist returns default', () => {
      const watchlist = configManager.getFinanceWatchlist()
      expect(watchlist).toEqual(['AAPL', 'MSFT'])
    })

    it('setFinanceWatchlist deduplicates and uppercases', () => {
      configManager.setFinanceWatchlist(['aapl', 'AAPL', 'goog'])
      expect(configManager.getFinanceWatchlist()).toEqual(['AAPL', 'GOOG'])
    })

    it('setFinanceWatchlist filters empty and non-string values', () => {
      configManager.setFinanceWatchlist([' ', '', 'TSLA', 42 as unknown as string])
      expect(configManager.getFinanceWatchlist()).toEqual(['TSLA'])
    })

    it('setFinanceWatchlist handles non-array gracefully', () => {
      configManager.setFinanceWatchlist('not-an-array' as unknown as string[])
      expect(configManager.getFinanceWatchlist()).toEqual([])
    })
  })

  describe('Full config and utility', () => {
    it('getConfig returns store contents', () => {
      const config = configManager.getConfig()
      expect(config).toBeDefined()
    })

    it('getStorePath returns path string', () => {
      expect(configManager.getStorePath()).toBe('/mock/config.json')
    })

    it('reset clears config', () => {
      configManager.setScheduleForecastDays(15)
      configManager.reset()
      // After reset, getScheduleForecastDays should return default (from mock store)
      expect(configManager.getScheduleForecastDays()).toBe(3)
    })
  })

  describe('migrateFromEnv', () => {
    it('skips migration when accounts already exist', () => {
      configManager.addGitHubAccount({ username: 'existing', org: 'org' })
      configManager.migrateFromEnv()
      // Should still have only the original account
      expect(configManager.getGitHubAccounts()).toHaveLength(1)
    })

    it('migrates from env vars when no accounts exist', () => {
      const origUser = process.env.VITE_GITHUB_USERNAME
      const origOrg = process.env.VITE_GITHUB_ORG
      process.env.VITE_GITHUB_USERNAME = 'envUser'
      process.env.VITE_GITHUB_ORG = 'envOrg'
      try {
        configManager.migrateFromEnv()
        expect(configManager.getGitHubAccounts()).toEqual([{ username: 'envUser', org: 'envOrg' }])
      } finally {
        if (origUser === undefined) delete process.env.VITE_GITHUB_USERNAME
        else process.env.VITE_GITHUB_USERNAME = origUser
        if (origOrg === undefined) delete process.env.VITE_GITHUB_ORG
        else process.env.VITE_GITHUB_ORG = origOrg
      }
    })

    it('logs message when no env vars found', () => {
      const origUser = process.env.VITE_GITHUB_USERNAME
      const origOrg = process.env.VITE_GITHUB_ORG
      delete process.env.VITE_GITHUB_USERNAME
      delete process.env.VITE_GITHUB_ORG
      try {
        configManager.migrateFromEnv()
        expect(configManager.getGitHubAccounts()).toEqual([])
      } finally {
        if (origUser !== undefined) process.env.VITE_GITHUB_USERNAME = origUser
        if (origOrg !== undefined) process.env.VITE_GITHUB_ORG = origOrg
      }
    })
  })
})
