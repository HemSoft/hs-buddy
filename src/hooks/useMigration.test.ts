import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'

const mockBulkImport = vi.fn()
const mockInitSettings = vi.fn()
let queryResults: Record<string, unknown> = {}

vi.mock('convex/react', () => ({
  useMutation: (apiRef: { name?: string }) => {
    if (apiRef?.name?.includes?.('bulkImport') || String(apiRef).includes('bulkImport')) {
      return mockBulkImport
    }
    return mockInitSettings
  },
  useQuery: (apiRef: { name?: string }) => {
    if (apiRef?.name?.includes?.('list') || String(apiRef).includes('list')) {
      return queryResults.accounts
    }
    return queryResults.settings
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    githubAccounts: {
      bulkImport: { name: 'bulkImport' },
      list: { name: 'list' },
    },
    settings: {
      initFromMigration: { name: 'initFromMigration' },
      get: { name: 'get' },
    },
  },
}))

describe('useMigrateToConvex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryResults = {}

    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue({ github: { accounts: [] } }),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('reports loading while Convex queries are undefined', () => {
    queryResults = { accounts: undefined, settings: undefined }

    const { result } = renderHook(() => useMigrateToConvex())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isComplete).toBe(false)
  })

  it('completes when Convex already has accounts', async () => {
    queryResults = {
      accounts: [{ name: 'existing' }],
      settings: { _id: 'settings-1', pr: {} },
    }

    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: [{ name: 'test' }] },
    })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it('skips account migration when electron-store has no accounts', async () => {
    queryResults = {
      accounts: [],
      settings: { _id: 'settings-1', pr: {} },
    }

    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: [] },
    })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it('imports accounts when electron-store has them and Convex is empty', async () => {
    queryResults = {
      accounts: [],
      settings: { _id: 'settings-1', pr: {} },
    }

    const storeAccounts = [{ name: 'account1' }, { name: 'account2' }]
    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: storeAccounts },
    })
    mockBulkImport.mockResolvedValue(storeAccounts)

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImport).toHaveBeenCalledWith({ accounts: storeAccounts })
  })

  it('migrates PR settings when they exist in electron-store but not in Convex', async () => {
    queryResults = {
      accounts: [],
      settings: {}, // No _id means default object, not a real Convex document
    }

    const prConfig = { refreshInterval: 5 }
    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: [] },
      pr: prConfig,
    })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockInitSettings).toHaveBeenCalledWith({ pr: prConfig })
  })

  it('skips settings migration when Convex already has settings with _id', async () => {
    queryResults = {
      accounts: [],
      settings: { _id: 'real-settings', pr: { refreshInterval: 10 } },
    }

    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: [] },
      pr: { refreshInterval: 5 },
    })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockInitSettings).not.toHaveBeenCalled()
  })

  it('times out after 3 seconds and completes', async () => {
    vi.useFakeTimers()

    // Keep queries undefined so isLoading stays true
    queryResults = { accounts: undefined, settings: undefined }

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useMigrateToConvex())

    expect(result.current.isComplete).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.isComplete).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Convex connection timeout'))

    consoleSpy.mockRestore()
    vi.useRealTimers()
  })

  it('handles migration error gracefully', async () => {
    queryResults = {
      accounts: [],
      settings: {},
    }

    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('IPC error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to migrate'),
      expect.any(Error)
    )

    consoleSpy.mockRestore()
  })

  it('does not re-run migration on rerender after completion', async () => {
    queryResults = {
      accounts: [],
      settings: {},
    }

    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue({
      github: { accounts: [] },
    })

    const { result, rerender } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    const callCount = vi.mocked(window.ipcRenderer.invoke).mock.calls.length

    rerender()

    // Should not have called invoke again
    expect(vi.mocked(window.ipcRenderer.invoke).mock.calls.length).toBe(callCount)
  })
})
