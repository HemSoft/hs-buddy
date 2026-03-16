import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConfig, useGitHubAccounts, usePRSettings, useCopilotSettings } from './useConfig'

// Mock Convex hooks
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockUpdatePR = vi.fn()
const mockUpdateCopilot = vi.fn()

let mockConvexAccounts: Array<{ _id: string; username: string; org: string }> | undefined
let mockSettings: Record<string, unknown> | undefined

vi.mock('./useConvex', () => ({
  useGitHubAccountsConvex: () => mockConvexAccounts,
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
    mockConvexAccounts = undefined
    mockSettings = undefined
    mockInvoke.mockResolvedValue({
      github: { accounts: [{ username: 'user1', org: 'myorg' }] },
      pr: { refreshInterval: 10, autoRefresh: true, recentlyMergedDays: 14 },
      copilot: { ghAccount: 'user1', model: 'gpt-4' },
    })
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
    it('uses Convex accounts when connected', () => {
      mockConvexAccounts = [{ _id: '1', username: 'user1', org: 'myorg' }]
      const { result } = renderHook(() => useGitHubAccounts())
      expect(result.current.accounts).toHaveLength(1)
      expect(result.current.accounts[0].username).toBe('user1')
      expect(result.current.loading).toBe(false)
    })

    it('falls back to electron-store when Convex unavailable', async () => {
      mockConvexAccounts = undefined
      const { result } = renderHook(() => useGitHubAccounts())
      await waitFor(() => expect(result.current.accounts).toBeDefined())
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
      const res = await result.current.removeAccount('user1', 'myorg')
      expect(res.success).toBe(true)
      expect(mockRemove).toHaveBeenCalledWith({ id: '123' })
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
  })
})
