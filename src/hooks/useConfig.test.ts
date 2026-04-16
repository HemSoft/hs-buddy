import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useConfig,
  useGitHubAccounts,
  usePRSettings,
  useCopilotSettings,
  useNotificationSettings,
} from './useConfig'

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
