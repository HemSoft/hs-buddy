import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {}
    path = '/mock/config.json'

    constructor() {
      this.data = {}
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
  },
}))

import { configManager, CONVEX_URL } from './config'

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
