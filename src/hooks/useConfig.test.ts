import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AppConfig } from '../types/config'
import {
  useConfig,
  useGitHubAccounts,
  usePRSettings,
  useCopilotSettings,
  useNotificationSettings,
  resolvePRFallback,
  resolveCopilotFallback,
} from './useConfig'
import {
  mergeUsageProviderOverrideSnapshot,
  persistUsageProviderOverride,
} from './useUsageProviderOverrides'
import { markAccountMigrationPending, markAccountMigrationReady } from './useAccountMigrationState'

// Mock Convex hooks
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockUpdatePR = vi.fn()
const mockUpdateCopilot = vi.fn()

let mockConvexAccounts:
  | Array<{
      _id: string
      username: string
      org: string
      repoRoot?: string
      usageProvider?: 'copilot' | 'codex'
    }>
  | undefined
let mockSettings: Record<string, unknown> | undefined
let mockConnectionCount = 1
let mockIsWebSocketConnected = true

vi.mock('./useConvex', () => ({
  useGitHubAccountsConvex: () => mockConvexAccounts,
  useGitHubAccountsConnection: () => ({
    connectionCount: mockConnectionCount,
    isWebSocketConnected: mockIsWebSocketConnected,
  }),
  useGitHubAccountMutations: () => ({ create: mockCreate, update: mockUpdate, remove: mockRemove }),
  useSettings: () => mockSettings,
  useSettingsMutations: () => ({ updatePR: mockUpdatePR, updateCopilot: mockUpdateCopilot }),
}))

const mockInvoke = vi.fn()
// Add ipcRenderer to happy-dom's window without replacing it
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

describe('useConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockRemove.mockReset()
    mockUpdatePR.mockReset()
    mockUpdateCopilot.mockReset()
    mockInvoke.mockReset()
    mockConvexAccounts = undefined
    mockSettings = undefined
    mockConnectionCount = 1
    mockIsWebSocketConnected = true
    markAccountMigrationReady()
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(
        channel === 'config:get-config'
          ? {
              github: { accounts: [{ username: 'user1', org: 'myorg' }] },
              pr: { refreshInterval: 10, autoRefresh: true, recentlyMergedDays: 14 },
              copilot: { ghAccount: 'user1', model: 'gpt-4' },
            }
          : { success: true }
      )
    )
  })

  describe('useConfig hook', () => {
    it('loads config from IPC', async () => {
      const { result } = renderHook(() => useConfig())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.config).toBeDefined()
      expect(result.current.error).toBeNull()
    })

    it('handles config load error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('IPC failed'))
      const { result } = renderHook(() => useConfig())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.error).toBe('IPC failed')
    })

    it('exposes api methods', () => {
      const { result } = renderHook(() => useConfig())
      expect(result.current.api).toBeDefined()
      expect(result.current.api.setTheme).toBeInstanceOf(Function)
      expect(result.current.api.getSystemFonts).toBeInstanceOf(Function)
    })

    it('api.setTheme invokes IPC with correct channel', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce({ success: true })
      await result.current.api.setTheme('dark')
      expect(mockInvoke).toHaveBeenCalledWith('config:set-theme', 'dark')
    })

    it('api.setAccentColor invokes IPC via ipcConfigSetter', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce({ success: true })
      await result.current.api.setAccentColor('#ff0000')
      expect(mockInvoke).toHaveBeenCalledWith('config:set-accent-color', '#ff0000')
    })

    it('api.getSystemFonts invokes IPC', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce(['Arial', 'Helvetica'])
      const fonts = await result.current.api.getSystemFonts()
      expect(mockInvoke).toHaveBeenCalledWith('system:get-fonts')
      expect(fonts).toEqual(['Arial', 'Helvetica'])
    })

    it('api.getStorePath invokes IPC', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce('/path/to/store')
      const path = await result.current.api.getStorePath()
      expect(mockInvoke).toHaveBeenCalledWith('config:get-store-path')
      expect(path).toBe('/path/to/store')
    })

    it('api.openInEditor invokes IPC', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce({ success: true })
      await result.current.api.openInEditor()
      expect(mockInvoke).toHaveBeenCalledWith('config:open-in-editor')
    })

    it('api.reset invokes IPC', async () => {
      const { result } = renderHook(() => useConfig())
      mockInvoke.mockResolvedValueOnce({ success: true })
      await result.current.api.reset()
      expect(mockInvoke).toHaveBeenCalledWith('config:reset')
    })

    it('refresh reloads config', async () => {
      const { result } = renderHook(() => useConfig())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.refresh()
      })
      expect(mockInvoke).toHaveBeenCalledWith('config:get-config')
    })
  })

  describe('useGitHubAccounts', () => {
    it('removes locally cleared keys from a stale override snapshot', () => {
      expect(
        mergeUsageProviderOverrideSnapshot(
          { 'hemsoft/hemsoft': 'codex' },
          {},
          new Set(['hemsoft/hemsoft'])
        )
      ).toEqual({})
    })

    it('uses Convex accounts when connected', () => {
      mockConvexAccounts = [{ _id: '1', username: 'user1', org: 'myorg' }]
      const { result } = renderHook(() => useGitHubAccounts())
      expect(result.current.accounts).toHaveLength(1)
      expect(result.current.accounts[0].username).toBe('user1')
      expect(result.current.loading).toBe(false)
      expect(result.current.canUpdateAccounts).toBe(true)
    })

    it('mirrors connected accounts for a later offline fallback', async () => {
      mockConvexAccounts = [
        { _id: '1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      const { result, rerender } = renderHook(() => useGitHubAccounts())

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [
          { username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
        ])
      )
      mockConvexAccounts = undefined
      rerender()

      await waitFor(() =>
        expect(result.current.accounts).toEqual([
          { username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
        ])
      )
      expect(result.current.canUpdateAccounts).toBe(false)
    })

    it('forgets a pending override when another client removes the account', async () => {
      mockConvexAccounts = [
        { _id: 'old-id', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate.mockRejectedValue(new Error('Convex unavailable'))
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))

      mockConvexAccounts = []
      rerender()
      await waitFor(() => expect(result.current.accounts).toEqual([]))
      const attemptsBeforeReadding = mockUpdate.mock.calls.length

      mockConvexAccounts = [{ _id: 'new-id', username: 'HemSoft', org: 'HemSoft' }]
      rerender()

      await waitFor(() => expect(result.current.accounts).toHaveLength(1))
      expect(result.current.accounts[0].usageProvider).toBeUndefined()
      expect(mockUpdate).toHaveBeenCalledTimes(attemptsBeforeReadding)
    })

    it('preserves local accounts until a pending migration populates Convex', async () => {
      let resolveConfig!: (config: AppConfig) => void
      const configRequest = new Promise<AppConfig>(resolve => {
        resolveConfig = resolve
      })
      mockConvexAccounts = []
      markAccountMigrationPending()
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'config:get-config' ? configRequest : Promise.resolve({ success: true })
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())

      resolveConfig({
        github: {
          accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
          usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
        },
      } as unknown as AppConfig)
      await act(async () => {
        await configRequest
      })
      expect(mockInvoke).not.toHaveBeenCalledWith('config:sync-github-accounts', [])
      expect(result.current.accounts).toEqual([])

      await act(async () => {
        markAccountMigrationReady()
        rerender()
      })
      expect(mockInvoke).not.toHaveBeenCalledWith('config:sync-github-accounts', [])

      mockConvexAccounts = [
        { _id: 'new-id', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      rerender()

      await waitFor(() => expect(result.current.accounts).toHaveLength(1))
      expect(result.current.accounts[0].usageProvider).toBe('codex')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('falls back to electron-store when Convex unavailable', async () => {
      mockConvexAccounts = undefined
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts).toBeDefined())
      expect(result.current.canUpdateAccounts).toBe(false)
    })

    it('applies a persisted local provider while Convex is unavailable', async () => {
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )

      const { result } = renderHook(() => useGitHubAccounts())

      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))
      expect(result.current.canUpdateAccounts).toBe(false)
    })

    it('persists an offline provider and updates every mounted account consumer', async () => {
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? { github: { accounts: [{ username: 'HemSoft', org: 'HemSoft' }] } }
            : { success: true }
        )
      )

      const { result } = renderHook(() => ({
        first: useGitHubAccounts(),
        second: useGitHubAccounts(),
      }))
      await waitFor(() => expect(result.current.first.accounts).toHaveLength(1))

      await act(async () => {
        expect(
          await result.current.first.updateUsageProvider('HemSoft', 'HemSoft', 'codex')
        ).toEqual({ success: true })
      })

      expect(mockInvoke).toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        'codex'
      )
      await waitFor(() => {
        expect(result.current.first.accounts[0].usageProvider).toBe('codex')
        expect(result.current.second.accounts[0].usageProvider).toBe('codex')
      })
    })

    it('keeps a local provider pending until Convex confirms it', async () => {
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))

      mockConvexAccounts = [
        { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate.mockResolvedValueOnce(undefined)
      rerender()

      expect(result.current.accounts[0].usageProvider).toBe('codex')
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({ id: 'id1', usageProvider: 'codex' })
      )
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        null
      )

      mockConvexAccounts = [
        { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      rerender()

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith(
          'config:set-usage-provider-override',
          'HemSoft',
          'HemSoft',
          null
        )
      )
    })

    it('does not apply a conflicting local Codex owner beside an explicit owner', async () => {
      mockConvexAccounts = [
        { _id: 'id1', username: 'Owner', org: 'HemSoft', usageProvider: 'codex' },
        { _id: 'id2', username: 'Second', org: 'HemSoft' },
      ]
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [
                    { username: 'Owner', org: 'HemSoft' },
                    { username: 'Second', org: 'HemSoft' },
                  ],
                  usageProviderOverrides: { 'hemsoft/second': 'codex' },
                },
              }
            : { success: true }
        )
      )

      const { result } = renderHook(() => useGitHubAccounts())

      await waitFor(() => expect(result.current.accounts[0].usageProvider).toBe('codex'))
      expect(result.current.accounts[1].usageProvider).toBeUndefined()
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith(
          'config:set-usage-provider-override',
          'Second',
          'HemSoft',
          null
        )
      )
    })

    it('defers transferring Codex ownership until the current owner is confirmed Copilot', async () => {
      mockConvexAccounts = [
        { _id: 'id1', username: 'Owner', org: 'HemSoft', usageProvider: 'codex' },
        { _id: 'id2', username: 'Second', org: 'HemSoft' },
      ]
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [
                    { username: 'Owner', org: 'HemSoft' },
                    { username: 'Second', org: 'HemSoft' },
                  ],
                  usageProviderOverrides: {
                    'hemsoft/owner': 'copilot',
                    'hemsoft/second': 'codex',
                  },
                },
              }
            : { success: true }
        )
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({ id: 'id1', usageProvider: 'copilot' })
      )
      expect(mockUpdate).not.toHaveBeenCalledWith({ id: 'id2', usageProvider: 'codex' })
      expect(result.current.accounts.map(account => account.usageProvider)).toEqual([
        'copilot',
        'codex',
      ])

      mockConvexAccounts = [
        { _id: 'id1', username: 'Owner', org: 'HemSoft', usageProvider: 'copilot' },
        { _id: 'id2', username: 'Second', org: 'HemSoft' },
      ]
      rerender()

      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({ id: 'id2', usageProvider: 'codex' })
      )
    })

    it('preserves an override selected while the initial config request is pending', async () => {
      let resolveConfig!: (config: AppConfig) => void
      const configRequest = new Promise<AppConfig>(resolve => {
        resolveConfig = resolve
      })
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'config:get-config' ? configRequest : Promise.resolve({ success: true })
      )
      const { result } = renderHook(() => useGitHubAccounts())

      await act(async () => {
        await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')
      })
      resolveConfig({
        github: { accounts: [{ username: 'HemSoft', org: 'HemSoft' }] },
      } as unknown as AppConfig)

      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))
    })

    it('does not restore a stale snapshot after an override clear event', async () => {
      let resolveConfig!: (config: AppConfig) => void
      const configRequest = new Promise<AppConfig>(resolve => {
        resolveConfig = resolve
      })
      mockConvexAccounts = [
        { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'config:get-config' ? configRequest : Promise.resolve({ success: true })
      )
      const { result } = renderHook(() => useGitHubAccounts())

      await act(async () => {
        await persistUsageProviderOverride({ username: 'HemSoft', org: 'HemSoft' }, null)
      })
      resolveConfig({
        github: {
          accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
          usageProviderOverrides: { 'hemsoft/hemsoft': 'copilot' },
        },
      } as unknown as AppConfig)

      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))
    })

    it('preserves a fallback while stale Convex data disagrees and retry fails', async () => {
      mockConvexAccounts = [
        { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      mockUpdate.mockRejectedValueOnce(new Error('Convex unavailable'))
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'copilot' },
                },
              }
            : { success: true }
        )
      )

      const { result } = renderHook(() => useGitHubAccounts())

      await waitFor(() => expect(result.current.accounts[0].usageProvider).toBe('copilot'))
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({ id: 'id1', usageProvider: 'copilot' })
      )
      expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [
        { username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ])
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        null
      )
    })

    it('retries a rejected provider reconciliation without waiting for account refresh', async () => {
      vi.useFakeTimers()
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate.mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue(undefined)
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                    usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                  },
                }
              : { success: true }
          )
        )

        renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(1)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('caps background retries and retries again when account data changes', async () => {
      vi.useFakeTimers()
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate.mockRejectedValue(new Error('Persistent outage'))
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                    usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                  },
                }
              : { success: true }
          )
        )

        const { rerender } = renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000]) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(delay)
          })
        }
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(6)

        mockConvexAccounts = [
          {
            _id: 'id1',
            username: 'HemSoft',
            org: 'HemSoft',
            repoRoot: 'D:\\github\\HemSoft',
            usageProvider: 'copilot',
          },
        ]
        rerender()
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(7)
      } finally {
        vi.useRealTimers()
      }
    })

    it('retries again after Convex reconnects without account data changing', async () => {
      vi.useFakeTimers()
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate.mockRejectedValue(new Error('Persistent outage'))
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                    usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                  },
                }
              : { success: true }
          )
        )

        const { rerender } = renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000]) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(delay)
          })
        }
        expect(mockUpdate).toHaveBeenCalledTimes(6)

        mockConnectionCount = 2
        rerender()
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(7)
      } finally {
        vi.useRealTimers()
      }
    })

    it('preserves one account retry budget when another override changes', async () => {
      vi.useFakeTimers()
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'First', org: 'HemSoft', usageProvider: 'codex' },
          { _id: 'id2', username: 'Second', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate.mockRejectedValue(new Error('Persistent outage'))
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [
                      { username: 'First', org: 'HemSoft' },
                      { username: 'Second', org: 'HemSoft' },
                    ],
                    usageProviderOverrides: {
                      'hemsoft/first': 'copilot',
                      'hemsoft/second': 'codex',
                    },
                  },
                }
              : { success: true }
          )
        )

        renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        const firstAttempts = () =>
          mockUpdate.mock.calls.filter(([value]) => value.id === 'id1').length
        expect(firstAttempts()).toBe(1)

        await act(async () => {
          await persistUsageProviderOverride({ username: 'Second', org: 'HemSoft' }, 'copilot')
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(firstAttempts()).toBe(1)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
        expect(firstAttempts()).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('routes a late retry to another mounted account consumer', async () => {
      vi.useFakeTimers()
      let rejectFirst!: (error: Error) => void
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate
          .mockImplementationOnce(
            () =>
              new Promise((_resolve, reject) => {
                rejectFirst = reject
              })
          )
          .mockResolvedValue(undefined)
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                    usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                  },
                }
              : { success: true }
          )
        )

        const first = renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(1)
        const second = renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        first.unmount()

        await act(async () => {
          rejectFirst(new Error('Late outage'))
          await Promise.resolve()
          await vi.advanceTimersByTimeAsync(1_000)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(2)
        second.unmount()
      } finally {
        vi.useRealTimers()
      }
    })

    it('retries conflicting override cleanup after an IPC rejection', async () => {
      vi.useFakeTimers()
      let clearAttempts = 0
      try {
        mockConvexAccounts = [
          { _id: 'id1', username: 'Owner', org: 'HemSoft', usageProvider: 'codex' },
          { _id: 'id2', username: 'Second', org: 'HemSoft' },
        ]
        mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
          if (channel === 'config:get-config') {
            return Promise.resolve({
              github: {
                accounts: [
                  { username: 'Owner', org: 'HemSoft' },
                  { username: 'Second', org: 'HemSoft' },
                ],
                usageProviderOverrides: { 'hemsoft/second': 'codex' },
              },
            })
          }
          if (channel === 'config:set-usage-provider-override' && args[2] === null) {
            clearAttempts += 1
            if (clearAttempts === 1) return Promise.reject(new Error('Temporary IPC failure'))
          }
          return Promise.resolve({ success: true })
        })

        renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(clearAttempts).toBe(1)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
        expect(clearAttempts).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('uses the local provider when connected Convex data has no explicit provider', async () => {
      mockConvexAccounts = [{ _id: 'id1', username: 'HemSoft', org: 'HemSoft' }]
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )

      const { result } = renderHook(() => useGitHubAccounts())

      await waitFor(() => expect(result.current.accounts[0]?.usageProvider).toBe('codex'))
    })

    it('handles electron-store config load error gracefully', async () => {
      mockConvexAccounts = undefined
      mockInvoke.mockRejectedValue(new Error('IPC error'))
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.accounts).toEqual([])
    })

    it('returns empty accounts when config has no github section', async () => {
      mockConvexAccounts = undefined
      mockInvoke.mockResolvedValue({}) // config with no github section
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts).toEqual([]))
    })

    it('exposes unique usernames derived from accounts', () => {
      mockConvexAccounts = [
        { _id: '1', username: 'user1', org: 'org-a' },
        { _id: '2', username: 'user1', org: 'org-b' },
        { _id: '3', username: 'user2', org: 'org-a' },
      ]

      const { result } = renderHook(() => useGitHubAccounts())

      expect(result.current.uniqueUsernames).toEqual(['user1', 'user2'])
    })

    it('addAccount calls Convex create', async () => {
      mockConvexAccounts = []
      mockCreate.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.addAccount({ username: 'new', org: 'org' })
      expect(res.success).toBe(true)
      expect(mockCreate).toHaveBeenCalledWith({ username: 'new', org: 'org' })
    })

    it('addAccount handles error', async () => {
      mockConvexAccounts = []
      mockCreate.mockRejectedValue(new Error('Create failed'))
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.addAccount({ username: 'new', org: 'org' })
      expect(res.success).toBe(false)
      expect(res.error).toBe('Create failed')
    })

    it('removeAccount calls Convex remove', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())
      let res!: { success: boolean; error?: string }
      await act(async () => {
        res = await result.current.removeAccount('user1', 'myorg')
      })
      expect(res.success).toBe(true)
      expect(mockRemove).toHaveBeenCalledWith({ id: '123' })
      expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [])
    })

    it('retries local account cleanup after a successful Convex removal', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockResolvedValue(undefined)
      let cleanupAttempts = 0
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({ github: { accounts: [] } })
        }
        if (channel === 'config:sync-github-accounts' && (args[0] as unknown[]).length === 0) {
          cleanupAttempts += 1
          return Promise.resolve(
            cleanupAttempts < 3 ? { success: false, error: 'Store busy' } : { success: true }
          )
        }
        return Promise.resolve({ success: true })
      })
      const { result } = renderHook(() => useGitHubAccounts())

      let response!: { success: boolean; error?: string }
      await act(async () => {
        response = await result.current.removeAccount('user1', 'myorg')
      })

      expect(response).toEqual({ success: true })
      expect(cleanupAttempts).toBe(3)
    })

    it('mirrors the latest account snapshot after a slow Convex removal', async () => {
      let finishRemoval!: () => void
      mockConvexAccounts = [
        { _id: 'target', username: 'remove-me', org: 'org' },
        { _id: 'other', username: 'other', org: 'org', repoRoot: 'old-root' },
      ]
      mockRemove.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishRemoval = resolve
          })
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      let removal!: Promise<{ success: boolean; error?: string }>
      act(() => {
        removal = result.current.removeAccount('remove-me', 'org')
      })
      await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ id: 'target' }))

      mockConvexAccounts = [
        { _id: 'target', username: 'remove-me', org: 'org' },
        { _id: 'other', username: 'other', org: 'org', repoRoot: 'new-root' },
        { _id: 'new', username: 'new-account', org: 'org' },
      ]
      rerender()
      await act(async () => {
        finishRemoval()
        await removal
      })

      expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [
        { username: 'other', org: 'org', repoRoot: 'new-root' },
        { username: 'new-account', org: 'org' },
      ])
    })

    it('clears a deleted override before mirroring a same-identity replacement', async () => {
      let finishRemoval!: () => void
      mockConvexAccounts = [{ _id: 'old-id', username: 'replace-me', org: 'org' }]
      mockRemove.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishRemoval = resolve
          })
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      let removal!: Promise<{ success: boolean; error?: string }>
      act(() => {
        removal = result.current.removeAccount('replace-me', 'org')
      })
      await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ id: 'old-id' }))

      mockConvexAccounts = [
        { _id: 'new-id', username: 'replace-me', org: 'org', repoRoot: 'replacement-root' },
      ]
      rerender()
      await act(async () => {
        finishRemoval()
        await removal
      })

      const clearCall = mockInvoke.mock.calls.findIndex(
        call =>
          call[0] === 'config:set-usage-provider-override' &&
          call[1] === 'replace-me' &&
          call[2] === 'org' &&
          call[3] === null
      )
      const replacementMirrorCall = mockInvoke.mock.calls.findIndex(
        (call, index) =>
          index > clearCall &&
          call[0] === 'config:sync-github-accounts' &&
          Array.isArray(call[1]) &&
          call[1][0]?.repoRoot === 'replacement-root'
      )
      expect(clearCall).toBeGreaterThanOrEqual(0)
      expect(replacementMirrorCall).toBeGreaterThan(clearCall)
    })

    it('retries override cleanup before mirroring a removed account', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockResolvedValue(undefined)
      let clearAttempts = 0
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({ github: { accounts: [] } })
        }
        if (channel === 'config:set-usage-provider-override') {
          clearAttempts += 1
          return Promise.resolve(
            clearAttempts < 3 ? { success: false, error: 'Store busy' } : { success: true }
          )
        }
        return Promise.resolve({ success: true })
      })
      const { result } = renderHook(() => useGitHubAccounts())

      const response = await result.current.removeAccount('user1', 'myorg')

      expect(response).toEqual({ success: true })
      expect(clearAttempts).toBe(3)
      expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [])
    })

    it('deduplicates case-variant identities while mirroring a removal', async () => {
      mockConvexAccounts = [
        { _id: 'target', username: 'remove-me', org: 'org' },
        { _id: 'first', username: 'User', org: 'Org', repoRoot: 'old-root' },
        { _id: 'second', username: 'user', org: 'org', repoRoot: 'new-root' },
      ]
      mockRemove.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())

      const response = await result.current.removeAccount('remove-me', 'org')

      expect(response).toEqual({ success: true })
      expect(mockInvoke).toHaveBeenCalledWith('config:sync-github-accounts', [
        { username: 'user', org: 'org', repoRoot: 'new-root' },
      ])
    })

    it('reports local cleanup failure after a successful Convex removal', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockResolvedValue(undefined)
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({ github: { accounts: [] } })
        }
        if (channel === 'config:sync-github-accounts' && (args[0] as unknown[]).length === 0) {
          return Promise.resolve({ success: false, error: 'Local store unavailable' })
        }
        return Promise.resolve({ success: true })
      })
      const { result } = renderHook(() => useGitHubAccounts())

      const response = await result.current.removeAccount('user1', 'myorg')

      expect(response).toEqual({ success: false, error: 'Local store unavailable' })
    })

    it('reports rejected local cleanup after a successful Convex removal', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockResolvedValue(undefined)
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({ github: { accounts: [] } })
        }
        if (channel === 'config:sync-github-accounts' && (args[0] as unknown[]).length === 0) {
          return Promise.reject(new Error('IPC unavailable'))
        }
        return Promise.resolve({ success: true })
      })
      const { result } = renderHook(() => useGitHubAccounts())

      const response = await result.current.removeAccount('user1', 'myorg')

      expect(response).toEqual({ success: false, error: 'IPC unavailable' })
    })

    it('removeAccount returns error when account not found', async () => {
      mockConvexAccounts = []
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.removeAccount('unknown', 'org')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Account not found')
    })

    it('updateAccount calls Convex update', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockUpdate.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.updateAccount('user1', 'myorg', { org: 'neworg' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ id: '123', org: 'neworg' })
    })

    it('updateAccount returns error when account not found', async () => {
      mockConvexAccounts = []
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.updateAccount('unknown', 'org', {})
      expect(res.success).toBe(false)
      expect(res.error).toBe('Account not found')
    })

    it('removeAccount returns error when Convex remove throws', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockRemove.mockRejectedValue(new Error('Remove failed'))
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.removeAccount('user1', 'myorg')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Remove failed')
    })

    it('updateAccount returns error when Convex update throws', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'user1', org: 'myorg' }]
      mockUpdate.mockRejectedValue(new Error('Update failed'))
      const { result } = renderHook(() => useGitHubAccounts())
      const res = await result.current.updateAccount('user1', 'myorg', { org: 'neworg' })
      expect(res.success).toBe(false)
      expect(res.error).toBe('Update failed')
    })

    it('updates a connected usage provider and clears its local override', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'HemSoft', org: 'HemSoft' }]
      mockUpdate.mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())

      const response = await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')

      expect(response).toEqual({ success: true })
      expect(mockUpdate).toHaveBeenCalledWith({ id: '123', usageProvider: 'codex' })
      expect(mockInvoke).toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        null
      )
    })

    it('persists a provider locally when cached Convex data outlives the connection', async () => {
      let resolveReconciliation!: () => void
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveReconciliation = resolve
          })
      )
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))

      mockIsWebSocketConnected = false
      rerender()

      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual({
          success: true,
        })
      })
      expect(result.current.canUpdateAccounts).toBe(false)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        'copilot'
      )

      await act(async () => {
        resolveReconciliation()
      })
    })

    it('lets an offline provider save supersede a blocked connected save', async () => {
      let resolveConnectedSave!: () => void
      let storedOverride: 'copilot' | 'codex' | null = null
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveConnectedSave = resolve
          })
      )
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({
            github: { accounts: [{ username: 'HemSoft', org: 'HemSoft' }] },
          })
        }
        if (channel === 'config:set-usage-provider-override') {
          storedOverride = args[2] as 'copilot' | 'codex' | null
        }
        return Promise.resolve({ success: true })
      })
      const { result, rerender } = renderHook(() => useGitHubAccounts())

      let connectedSave!: Promise<{ success: boolean; error?: string }>
      act(() => {
        connectedSave = result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')
      })
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
      mockIsWebSocketConnected = false
      rerender()

      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual({
          success: true,
        })
      })
      expect(storedOverride).toBe('copilot')
      expect(
        mockInvoke.mock.calls.filter(call => call[0] === 'config:set-usage-provider-override')
      ).toHaveLength(1)

      await act(async () => {
        resolveConnectedSave()
        expect(await connectedSave).toEqual({ success: true })
      })
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      expect(
        mockInvoke.mock.calls.filter(call => call[0] === 'config:set-usage-provider-override')
      ).toEqual([['config:set-usage-provider-override', 'HemSoft', 'HemSoft', 'copilot']])
      expect(storedOverride).toBe('copilot')
    })

    it('restores a disconnected provider choice after a stale reconciliation clears it', async () => {
      let resolveStaleClear!: () => void
      let storedOverride: 'copilot' | 'codex' | null = 'codex'
      let copilotWriteCount = 0
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({
            github: {
              accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
              usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
            },
          })
        }
        if (channel === 'config:set-usage-provider-override') {
          const provider = args[2] as 'copilot' | 'codex' | null
          if (provider === null) {
            return new Promise(resolve => {
              resolveStaleClear = () => {
                storedOverride = null
                resolve({ success: true })
              }
            })
          }
          if (provider === 'copilot' && ++copilotWriteCount === 2) {
            return Promise.reject(new Error('Store temporarily unavailable'))
          }
          storedOverride = provider
        }
        return Promise.resolve({ success: true })
      })
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(resolveStaleClear).toBeTypeOf('function'))

      mockIsWebSocketConnected = false
      rerender()
      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual({
          success: true,
        })
      })
      expect(storedOverride).toBe('copilot')

      await act(async () => {
        resolveStaleClear()
      })
      await waitFor(() => expect(storedOverride).toBe('copilot'), { timeout: 2_500 })
      expect(copilotWriteCount).toBe(3)
      expect(mockInvoke).toHaveBeenLastCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        'copilot'
      )
    })

    it('keeps the newest offline choice when an older recovery finishes late', async () => {
      let resolveStaleClear!: () => void
      let resolveOldRecovery!: () => void
      let storedOverride: 'copilot' | 'codex' | null = 'codex'
      let copilotWriteCount = 0
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({
            github: {
              accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
              usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
            },
          })
        }
        if (channel === 'config:set-usage-provider-override') {
          const provider = args[2] as 'copilot' | 'codex' | null
          if (provider === null) {
            return new Promise(resolve => {
              resolveStaleClear = () => {
                storedOverride = null
                resolve({ success: true })
              }
            })
          }
          if (provider === 'copilot' && ++copilotWriteCount === 2) {
            return new Promise(resolve => {
              resolveOldRecovery = () => {
                storedOverride = 'copilot'
                resolve({ success: true })
              }
            })
          }
          storedOverride = provider
        }
        return Promise.resolve({ success: true })
      })
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(resolveStaleClear).toBeTypeOf('function'))

      mockIsWebSocketConnected = false
      rerender()
      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual({
          success: true,
        })
        resolveStaleClear()
      })
      await waitFor(() => expect(resolveOldRecovery).toBeTypeOf('function'))

      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')).toEqual({
          success: true,
        })
      })
      expect(storedOverride).toBe('codex')

      await act(async () => {
        resolveOldRecovery()
      })
      await waitFor(() => expect(storedOverride).toBe('codex'))
      expect(
        mockInvoke.mock.calls.filter(
          call => call[0] === 'config:set-usage-provider-override' && call[3] === 'codex'
        )
      ).toHaveLength(2)
    })

    it('does not restore an offline choice superseded by a newer connected save', async () => {
      let resolveStaleClear!: () => void
      let storedOverride: 'copilot' | 'codex' | null = 'codex'
      let clearCount = 0
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      mockUpdate.mockResolvedValue(undefined)
      mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
        if (channel === 'config:get-config') {
          return Promise.resolve({
            github: {
              accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
              usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
            },
          })
        }
        if (channel === 'config:set-usage-provider-override') {
          const provider = args[2] as 'copilot' | 'codex' | null
          if (provider === null && clearCount++ === 0) {
            return new Promise(resolve => {
              resolveStaleClear = () => {
                storedOverride = null
                resolve({ success: true })
              }
            })
          }
          storedOverride = provider
        }
        return Promise.resolve({ success: true })
      })
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(resolveStaleClear).toBeTypeOf('function'))

      mockIsWebSocketConnected = false
      rerender()
      await act(async () => {
        expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual({
          success: true,
        })
      })
      expect(storedOverride).toBe('copilot')

      mockIsWebSocketConnected = true
      rerender()
      let connectedSave!: Promise<{ success: boolean; error?: string }>
      act(() => {
        connectedSave = result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')
      })
      await act(async () => {
        resolveStaleClear()
        expect(await connectedSave).toEqual({ success: true })
      })
      expect(storedOverride).toBeNull()
      expect(
        mockInvoke.mock.calls.filter(
          call => call[0] === 'config:set-usage-provider-override' && call[3] === 'copilot'
        )
      ).toHaveLength(1)
    })

    it('waits for an in-flight reconciliation before saving a manual provider choice', async () => {
      let resolveReconciliation!: () => void
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate
        .mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              resolveReconciliation = resolve
            })
        )
        .mockResolvedValue(undefined)
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? {
                github: {
                  accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                  usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                },
              }
            : { success: true }
        )
      )
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))

      let manualSave!: Promise<{ success: boolean; error?: string }>
      act(() => {
        manualSave = result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')
      })
      await Promise.resolve()
      expect(mockUpdate).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveReconciliation()
        await manualSave
      })
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { id: '123', usageProvider: 'copilot' })
      expect(await manualSave).toEqual({ success: true })
    })

    it('serializes overlapping provider saves and blocks reconciliation until both settle', async () => {
      let rejectFirstSave!: (error: Error) => void
      let resolveSecondSave!: () => void
      mockConvexAccounts = [
        { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
      ]
      mockUpdate
        .mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              rejectFirstSave = reject
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              resolveSecondSave = resolve
            })
        )
        .mockResolvedValue(undefined)
      const { result } = renderHook(() => useGitHubAccounts())

      let firstSave!: Promise<{ success: boolean; error?: string }>
      let secondSave!: Promise<{ success: boolean; error?: string }>
      act(() => {
        firstSave = result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')
        secondSave = result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')
      })
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))

      await act(async () => {
        rejectFirstSave(new Error('Temporary outage'))
        expect(await firstSave).toEqual({ success: true })
      })
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2))
      expect(mockUpdate).toHaveBeenNthCalledWith(1, { id: '123', usageProvider: 'codex' })
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { id: '123', usageProvider: 'copilot' })

      await act(async () => {
        await Promise.resolve()
      })
      expect(mockUpdate).toHaveBeenCalledTimes(2)

      await act(async () => {
        resolveSecondSave()
        expect(await secondSave).toEqual({ success: true })
      })
      expect(mockUpdate).toHaveBeenCalledTimes(2)
    })

    it('cancels a queued reconciliation retry before a manual provider save', async () => {
      vi.useFakeTimers()
      try {
        mockConvexAccounts = [
          { _id: '123', username: 'HemSoft', org: 'HemSoft', usageProvider: 'copilot' },
        ]
        mockUpdate.mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue(undefined)
        mockInvoke.mockImplementation((channel: string) =>
          Promise.resolve(
            channel === 'config:get-config'
              ? {
                  github: {
                    accounts: [{ username: 'HemSoft', org: 'HemSoft' }],
                    usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
                  },
                }
              : { success: true }
          )
        )
        const { result } = renderHook(() => useGitHubAccounts())
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(1)

        await act(async () => {
          expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'copilot')).toEqual(
            { success: true }
          )
        })
        expect(mockUpdate).toHaveBeenCalledTimes(2)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
        expect(mockUpdate).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('reports a failed local reconciliation after a connected provider update', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'HemSoft', org: 'HemSoft' }]
      mockUpdate.mockResolvedValue(undefined)
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? { github: { accounts: [] } }
            : { success: false, error: 'Local store unavailable' }
        )
      )
      const { result } = renderHook(() => useGitHubAccounts())

      expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')).toEqual({
        success: false,
        error: 'Local store unavailable',
      })
    })

    it('falls back to a local override when a connected provider update is rejected', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'HemSoft', org: 'HemSoft' }]
      mockUpdate.mockRejectedValue(new Error('Provider update failed'))
      const { result } = renderHook(() => useGitHubAccounts())

      expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')).toEqual({
        success: true,
      })
      expect(mockInvoke).toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        'codex'
      )
    })

    it('can persist a provider locally without retrying a cached Convex account', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'HemSoft', org: 'HemSoft' }]
      const { result } = renderHook(() => useGitHubAccounts())

      expect(
        await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex', {
          localOnly: true,
        })
      ).toEqual({ success: true })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockInvoke).toHaveBeenCalledWith(
        'config:set-usage-provider-override',
        'HemSoft',
        'HemSoft',
        'codex'
      )
    })

    it('reports an IPC rejection while persisting a local provider', async () => {
      mockConvexAccounts = []
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'config:get-config'
          ? Promise.resolve({ github: { accounts: [] } })
          : Promise.reject(new Error('IPC unavailable'))
      )
      const { result } = renderHook(() => useGitHubAccounts())

      expect(
        await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex', {
          localOnly: true,
        })
      ).toEqual({
        success: false,
        error: 'IPC unavailable',
      })
    })

    it('reports a local fallback failure after a rejected connected provider update', async () => {
      mockConvexAccounts = [{ _id: '123', username: 'HemSoft', org: 'HemSoft' }]
      mockUpdate.mockRejectedValue(new Error('Provider update failed'))
      mockInvoke.mockImplementation((channel: string) =>
        Promise.resolve(
          channel === 'config:get-config'
            ? { github: { accounts: [] } }
            : { success: false, error: 'Local store unavailable' }
        )
      )
      const { result } = renderHook(() => useGitHubAccounts())

      expect(await result.current.updateUsageProvider('HemSoft', 'HemSoft', 'codex')).toEqual({
        success: false,
        error: 'Local store unavailable',
      })
    })

    it('updates accountsRef when Convex accounts change across renders', () => {
      mockConvexAccounts = [{ _id: '1', username: 'user1', org: 'org-a' }]
      const { result, rerender } = renderHook(() => useGitHubAccounts())
      expect(result.current.accounts).toHaveLength(1)

      mockConvexAccounts = [
        { _id: '1', username: 'user1', org: 'org-a' },
        { _id: '2', username: 'user2', org: 'org-b' },
      ]
      rerender()
      expect(result.current.accounts).toHaveLength(2)
      expect(result.current.accounts[1].username).toBe('user2')
    })

    it('includes repoRoot from Convex account when present', () => {
      mockConvexAccounts = [
        { _id: 'id1', username: 'user1', org: 'myorg', repoRoot: '/custom/path' },
      ]
      const { result } = renderHook(() => useGitHubAccounts())
      const account = result.current.accounts.find(a => a.username === 'user1')
      expect(account?.repoRoot).toBe('/custom/path')
    })

    it('omits repoRoot from Convex account when not present', () => {
      mockConvexAccounts = [{ _id: 'id2', username: 'user2', org: 'org2' }]
      const { result } = renderHook(() => useGitHubAccounts())
      const account = result.current.accounts.find(a => a.username === 'user2')
      expect(account).toBeDefined()
      expect(account?.repoRoot).toBeUndefined()
    })

    it('preserves an explicit usage provider from Convex', () => {
      mockConvexAccounts = [
        { _id: 'id3', username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' },
      ]
      const { result } = renderHook(() => useGitHubAccounts())
      expect(result.current.accounts[0].usageProvider).toBe('codex')
    })

    it('falls back to electron-store accounts when contentKey changes and Convex unavailable', async () => {
      mockConvexAccounts = undefined
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts.length).toBeGreaterThan(0))
      expect(result.current.accounts[0].username).toBe('user1')
    })
  })

  describe('usePRSettings', () => {
    it('returns Convex settings when connected', () => {
      mockSettings = { pr: { refreshInterval: 10, autoRefresh: true, recentlyMergedDays: 14 } }
      const { result } = renderHook(() => usePRSettings())
      expect(result.current.refreshInterval).toBe(10)
      expect(result.current.autoRefresh).toBe(true)
      expect(result.current.recentlyMergedDays).toBe(14)
    })

    it('returns defaults initially when Convex unavailable', () => {
      mockSettings = undefined
      mockInvoke.mockResolvedValue({}) // no IPC config data
      const { result } = renderHook(() => usePRSettings())
      expect(result.current.refreshInterval).toBe(15)
      expect(result.current.autoRefresh).toBe(true) // useState default is true (fallbackLoaded starts true)
      expect(result.current.recentlyMergedDays).toBe(7)
    })

    it('uses defaults when IPC config fails and Convex unavailable', async () => {
      mockSettings = undefined
      mockInvoke.mockRejectedValue(new Error('IPC error'))
      const { result } = renderHook(() => usePRSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.refreshInterval).toBe(15)
      expect(result.current.autoRefresh).toBe(true)
      expect(result.current.recentlyMergedDays).toBe(7)
    })

    it('setRefreshInterval calls Convex updatePR', async () => {
      mockSettings = { pr: { refreshInterval: 10, autoRefresh: true, recentlyMergedDays: 7 } }
      const { result } = renderHook(() => usePRSettings())
      await result.current.setRefreshInterval(20)
      expect(mockUpdatePR).toHaveBeenCalledWith({ refreshInterval: 20 })
    })

    it('setAutoRefresh calls Convex updatePR', async () => {
      mockSettings = { pr: { refreshInterval: 10, autoRefresh: false, recentlyMergedDays: 7 } }
      const { result } = renderHook(() => usePRSettings())
      await result.current.setAutoRefresh(true)
      expect(mockUpdatePR).toHaveBeenCalledWith({ autoRefresh: true })
    })

    it('setRecentlyMergedDays calls Convex updatePR', async () => {
      mockSettings = { pr: { refreshInterval: 10, autoRefresh: true, recentlyMergedDays: 7 } }
      const { result } = renderHook(() => usePRSettings())
      await result.current.setRecentlyMergedDays(30)
      expect(mockUpdatePR).toHaveBeenCalledWith({ recentlyMergedDays: 30 })
    })

    it('returns fallback values when PR settings have null fields', () => {
      mockSettings = { pr: { refreshInterval: null, autoRefresh: null, recentlyMergedDays: null } }
      const { result } = renderHook(() => usePRSettings())
      expect(result.current.refreshInterval).toBe(15)
      expect(result.current.autoRefresh).toBe(false)
      expect(result.current.recentlyMergedDays).toBe(7)
    })

    it('electron-store fallback applies null-coalescing defaults for PR fields', async () => {
      mockSettings = undefined
      mockInvoke.mockResolvedValue({
        pr: { refreshInterval: null, autoRefresh: null, recentlyMergedDays: null },
      })
      const { result } = renderHook(() => usePRSettings())
      // Default has autoRefresh: true; after IPC resolves extractor applies ?? false
      await waitFor(() => expect(result.current.autoRefresh).toBe(false))
      expect(result.current.refreshInterval).toBe(15)
      expect(result.current.recentlyMergedDays).toBe(7)
    })
  })

  describe('useCopilotSettings', () => {
    it('returns Convex copilot settings when connected', () => {
      mockSettings = { copilot: { ghAccount: 'user1', model: 'gpt-4' } }
      const { result } = renderHook(() => useCopilotSettings())
      expect(result.current.ghAccount).toBe('user1')
      expect(result.current.model).toBe('gpt-4')
    })

    it('returns defaults when Convex unavailable', () => {
      mockSettings = undefined
      const { result } = renderHook(() => useCopilotSettings())
      expect(result.current.ghAccount).toBe('')
      expect(result.current.model).toBe('claude-sonnet-4.5')
    })

    it('uses electron-store fallback defaults when config has no copilot section', async () => {
      mockSettings = undefined
      mockInvoke.mockResolvedValue({}) // config with no copilot section
      const { result } = renderHook(() => useCopilotSettings())
      await waitFor(() => {
        expect(result.current.ghAccount).toBe('')
        expect(result.current.model).toBe('claude-sonnet-4.5')
        expect(result.current.premiumModel).toBe('claude-opus-4.6')
      })
    })

    it('setGhAccount calls Convex updateCopilot', async () => {
      mockSettings = { copilot: { ghAccount: '', model: 'gpt-4' } }
      const { result } = renderHook(() => useCopilotSettings())
      await result.current.setGhAccount('user2')
      expect(mockUpdateCopilot).toHaveBeenCalledWith({ ghAccount: 'user2' })
    })

    it('setModel calls Convex updateCopilot', async () => {
      mockSettings = { copilot: { ghAccount: '', model: 'gpt-4' } }
      const { result } = renderHook(() => useCopilotSettings())
      await result.current.setModel('claude-sonnet-4.5')
      expect(mockUpdateCopilot).toHaveBeenCalledWith({ model: 'claude-sonnet-4.5' })
    })

    it('setPremiumModel calls Convex updateCopilot', async () => {
      mockSettings = { copilot: { ghAccount: '', model: 'gpt-4', premiumModel: 'claude-opus-4.6' } }
      const { result } = renderHook(() => useCopilotSettings())
      await result.current.setPremiumModel('gpt-4o')
      expect(mockUpdateCopilot).toHaveBeenCalledWith({ premiumModel: 'gpt-4o' })
    })

    it('returns fallback values when copilot settings have null fields', () => {
      mockSettings = { copilot: { ghAccount: null, model: null, premiumModel: null } }
      const { result } = renderHook(() => useCopilotSettings())
      expect(result.current.ghAccount).toBe('')
      expect(result.current.model).toBe('claude-sonnet-4.5')
      expect(result.current.premiumModel).toBe('claude-opus-4.6')
    })

    it('electron-store fallback applies null-coalescing defaults for copilot fields', async () => {
      mockSettings = undefined
      mockInvoke.mockResolvedValue({
        copilot: { ghAccount: null, model: 'gpt-4o', premiumModel: null },
      })
      const { result } = renderHook(() => useCopilotSettings())
      await waitFor(() => expect(result.current.model).toBe('gpt-4o'))
      expect(result.current.ghAccount).toBe('')
      expect(result.current.premiumModel).toBe('claude-opus-4.6')
    })
  })

  describe('useNotificationSettings', () => {
    it('loads enabled and soundPath from IPC', async () => {
      mockInvoke
        .mockResolvedValueOnce(true) // get-notification-sound-enabled
        .mockResolvedValueOnce('/sounds/alert.wav') // get-notification-sound-path
      const { result } = renderHook(() => useNotificationSettings())
      expect(result.current.loading).toBe(true)
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.enabled).toBe(true)
      expect(result.current.soundPath).toBe('/sounds/alert.wav')
    })

    it('handles load error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValue(new Error('IPC broken'))
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.enabled).toBe(false)
      expect(result.current.soundPath).toBe('')
      consoleSpy.mockRestore()
    })

    it('setEnabled returns true and updates state on success', async () => {
      mockInvoke
        .mockResolvedValueOnce(false) // initial load: enabled
        .mockResolvedValueOnce('') // initial load: soundPath
        .mockResolvedValueOnce({ success: true }) // setEnabled call
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setEnabled(true)
      })
      expect(returnVal!).toBe(true)
      expect(result.current.enabled).toBe(true)
    })

    it('setEnabled returns false when IPC result is not success', async () => {
      mockInvoke
        .mockResolvedValueOnce(false) // initial load: enabled
        .mockResolvedValueOnce('') // initial load: soundPath
        .mockResolvedValueOnce({ success: false }) // setEnabled call
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setEnabled(true)
      })
      expect(returnVal!).toBe(false)
      expect(result.current.enabled).toBe(false) // unchanged
    })

    it('setEnabled returns false on IPC error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(new Error('IPC failed'))
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setEnabled(true)
      })
      expect(returnVal!).toBe(false)
      consoleSpy.mockRestore()
    })

    it('setSoundPath returns true and updates state on success', async () => {
      mockInvoke
        .mockResolvedValueOnce(true) // initial load: enabled
        .mockResolvedValueOnce('') // initial load: soundPath
        .mockResolvedValueOnce({ success: true }) // setSoundPath call
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setSoundPath('/new/path.wav')
      })
      expect(returnVal!).toBe(true)
      expect(result.current.soundPath).toBe('/new/path.wav')
    })

    it('setSoundPath returns false when IPC result is not success', async () => {
      mockInvoke
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('/old.wav')
        .mockResolvedValueOnce({ success: false })
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setSoundPath('/new.wav')
      })
      expect(returnVal!).toBe(false)
      expect(result.current.soundPath).toBe('/old.wav') // unchanged
    })

    it('setSoundPath returns false on IPC error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(new Error('IPC failed'))
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnVal: boolean
      await act(async () => {
        returnVal = await result.current.setSoundPath('/new.wav')
      })
      expect(returnVal!).toBe(false)
      consoleSpy.mockRestore()
    })

    it('pickSoundFile returns filePath on success', async () => {
      mockInvoke
        .mockResolvedValueOnce(true) // initial load: enabled
        .mockResolvedValueOnce('') // initial load: soundPath
        .mockResolvedValueOnce({ success: true, filePath: '/picked/sound.mp3' }) // pick dialog
        .mockResolvedValueOnce({ success: true }) // setSoundPath IPC
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let filePath: string | null
      await act(async () => {
        filePath = await result.current.pickSoundFile()
      })
      expect(filePath!).toBe('/picked/sound.mp3')
      expect(result.current.soundPath).toBe('/picked/sound.mp3')
    })

    it('pickSoundFile returns null when dialog cancelled', async () => {
      mockInvoke
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce({ success: false, canceled: true })
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let filePath: string | null
      await act(async () => {
        filePath = await result.current.pickSoundFile()
      })
      expect(filePath!).toBeNull()
    })

    it('pickSoundFile returns null when save fails', async () => {
      mockInvoke
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce({ success: true, filePath: '/picked/sound.mp3' }) // pick succeeds
        .mockResolvedValueOnce({ success: false }) // but save fails
      const { result } = renderHook(() => useNotificationSettings())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let filePath: string | null
      await act(async () => {
        filePath = await result.current.pickSoundFile()
      })
      expect(filePath!).toBeNull()
    })
  })
})

// ─── Pure resolver function tests ───────────────────────────────────────

describe('resolvePRFallback', () => {
  it('returns defaults when config.pr is undefined', () => {
    const result = resolvePRFallback({} as Parameters<typeof resolvePRFallback>[0])
    expect(result.refreshInterval).toBe(15)
    expect(result.autoRefresh).toBe(false)
    expect(result.recentlyMergedDays).toBe(7)
  })

  it('uses provided values when present', () => {
    const result = resolvePRFallback({
      pr: { refreshInterval: 30, autoRefresh: true, recentlyMergedDays: 7 },
    } as Parameters<typeof resolvePRFallback>[0])
    expect(result.refreshInterval).toBe(30)
    expect(result.autoRefresh).toBe(true)
    expect(result.recentlyMergedDays).toBe(7)
  })

  it('fills nullish fields with defaults', () => {
    const result = resolvePRFallback({
      pr: { refreshInterval: null, autoRefresh: null, recentlyMergedDays: null },
    } as unknown as Parameters<typeof resolvePRFallback>[0])
    expect(result.refreshInterval).toBe(15)
    expect(result.autoRefresh).toBe(false)
    expect(result.recentlyMergedDays).toBe(7)
  })
})

describe('resolveCopilotFallback', () => {
  it('returns defaults when config.copilot is undefined', () => {
    const result = resolveCopilotFallback({} as Parameters<typeof resolveCopilotFallback>[0])
    expect(result.ghAccount).toBe('')
    expect(result.model).toBe('claude-sonnet-4.5')
    expect(result.premiumModel).toBe('claude-opus-4.6')
  })

  it('uses provided values when present', () => {
    const result = resolveCopilotFallback({
      copilot: { ghAccount: 'user1', model: 'gpt-4', premiumModel: 'gpt-5' },
    } as Parameters<typeof resolveCopilotFallback>[0])
    expect(result.ghAccount).toBe('user1')
    expect(result.model).toBe('gpt-4')
    expect(result.premiumModel).toBe('gpt-5')
  })

  it('fills nullish fields with defaults', () => {
    const result = resolveCopilotFallback({
      copilot: { ghAccount: null, model: null, premiumModel: null },
    } as unknown as Parameters<typeof resolveCopilotFallback>[0])
    expect(result.ghAccount).toBe('')
    expect(result.model).toBe('claude-sonnet-4.5')
    expect(result.premiumModel).toBe('claude-opus-4.6')
  })
})
