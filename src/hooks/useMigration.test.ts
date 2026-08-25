import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'
import { markAccountMigrationPending, useAccountMigrationReady } from './useAccountMigrationState'

const mockBulkImportAccounts = vi.fn()
const mockInitSettings = vi.fn()
let mockExistingAccounts: Array<Record<string, unknown>> | undefined
let mockExistingSettings: Record<string, unknown> | undefined
let mockConnectionCount = 1
let mockIsWebSocketConnected = true

function refNameIncludes(ref: unknown, value: string) {
  const name = (ref as { name?: string } | undefined)?.name
  return String(name ?? '').includes(value) || String(ref).includes(value)
}

vi.mock('convex/react', () => ({
  useConvexConnectionState: () => ({
    connectionCount: mockConnectionCount,
    isWebSocketConnected: mockIsWebSocketConnected,
  }),
  useMutation: (ref: unknown) => {
    if (refNameIncludes(ref, 'bulkImport')) {
      return mockBulkImportAccounts
    }
    return mockInitSettings
  },
  useQuery: (ref: unknown) => {
    if (refNameIncludes(ref, 'list')) {
      return mockExistingAccounts
    }
    return mockExistingSettings
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

const mockInvoke = vi.fn()
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

describe('useMigrateToConvex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistingAccounts = undefined
    mockExistingSettings = undefined
    mockConnectionCount = 1
    mockIsWebSocketConnected = true
    markAccountMigrationPending()
    mockInvoke.mockResolvedValue({
      github: { accounts: [{ username: 'user1', org: 'org1' }] },
      pr: { refreshInterval: 10, autoRefresh: true },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports loading while Convex queries are undefined', () => {
    const { result } = renderHook(() => useMigrateToConvex())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isComplete).toBe(false)
  })

  it('completes migration when accounts and settings need import', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'user1', org: 'org1' }],
    })
    expect(mockInitSettings).toHaveBeenCalledWith({
      pr: { refreshInterval: 10, autoRefresh: true },
    })
  })

  it('skips account import when Convex already has accounts', async () => {
    mockExistingAccounts = [{ _id: 'abc', username: 'existing' }]
    mockExistingSettings = {}

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
  })

  it('skips settings import when Convex already has settings with _id', async () => {
    mockExistingAccounts = []
    mockExistingSettings = { _id: 'settings-1', pr: { refreshInterval: 5 } }
    mockBulkImportAccounts.mockResolvedValue([{ id: '1' }])

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockInitSettings).not.toHaveBeenCalled()
  })

  it('completes with timeout when Convex does not respond', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useMigrateToConvex())

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('migrates after a timeout when Convex later reconnects', async () => {
    vi.useFakeTimers()
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
    expect(result.current.migration.isComplete).toBe(true)
    expect(result.current.accountsReady).toBe(false)

    mockExistingAccounts = []
    mockExistingSettings = {}
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'user1', org: 'org1' }],
    })
    expect(result.current.accountsReady).toBe(true)
  })

  it('timeout no-ops after migration already completed', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([])
    mockInitSettings.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMigrateToConvex())

    // Let migration promises resolve (microtasks) without advancing the 3s timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(result.current.isComplete).toBe(true)

    // Effect re-runs with isComplete=true, creating a new 3s timeout.
    // Advancing past it exercises the !isComplete false branch.
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('keeps a failed account migration pending and retries it', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts
      .mockRejectedValueOnce(new Error('Convex unavailable'))
      .mockResolvedValueOnce([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)
    expect(result.current.accountsReady).toBe(false)
    expect(result.current.migration.isComplete).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(2)
    expect(result.current.accountsReady).toBe(true)
    expect(result.current.migration.isComplete).toBe(true)
  })

  it('marks account migration ready while settings migration continues retrying', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockRejectedValue(new Error('Invalid legacy settings'))

    const { result } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)
    expect(mockInitSettings).toHaveBeenCalledTimes(1)
    expect(result.current.accountsReady).toBe(true)
    expect(result.current.migration.isComplete).toBe(false)
  })

  it('does not run a pending retry while Convex is disconnected', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts
      .mockRejectedValueOnce(new Error('Convex unavailable'))
      .mockResolvedValueOnce([{ id: 'recovered' }])

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)

    mockIsWebSocketConnected = false
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)

    mockConnectionCount += 1
    mockIsWebSocketConnected = true
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(2)
    expect(result.current.accountsReady).toBe(true)
  })

  it('stops retrying a persistently failed migration after bounded exponential backoff', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockRejectedValue(new Error('Convex unavailable'))

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)

    for (const delay of [1_000, 2_000, 4_000, 8_000]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay)
      })
    }

    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)

    mockExistingSettings = { changed: true }
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(false)

    mockExistingAccounts = [{ _id: 'authoritative-account' }]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(true)
  })

  it('reopens an exhausted migration budget after a real Convex reconnect', async () => {
    vi.useFakeTimers()
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockRejectedValue(new Error('Convex unavailable'))

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    for (const delay of [1_000, 2_000, 4_000, 8_000]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay)
      })
    }
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(false)

    mockIsWebSocketConnected = false
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)

    mockBulkImportAccounts.mockResolvedValue([{ id: 'recovered' }])
    mockConnectionCount += 1
    mockIsWebSocketConnected = true
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(6)
    expect(result.current.accountsReady).toBe(true)
  })

  it('skips migration on re-render when already attempted', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    const callCount = mockBulkImportAccounts.mock.calls.length

    // Change a dependency so the effect re-fires with migrationAttempted.current = true
    mockExistingAccounts = [{ id: '1', username: 'user1' }]
    rerender()

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    // Should not have called bulkImport again
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(callCount)
  })

  it('waits for the in-flight migration when dependencies change', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    let resolveConfig!: (value: {
      github: { accounts: Array<{ username: string; org: string }> }
      pr: { refreshInterval: number; autoRefresh: boolean }
    }) => void
    mockInvoke.mockReturnValue(
      new Promise(resolve => {
        resolveConfig = resolve
      })
    )
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useMigrateToConvex())
    mockExistingAccounts = undefined
    rerender()

    resolveConfig({
      github: { accounts: [{ username: 'user1', org: 'org1' }] },
      pr: { refreshInterval: 10, autoRefresh: true },
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isComplete).toBe(false)

    mockExistingAccounts = []
    rerender()

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('skips import when electron-store has no accounts', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockInvoke.mockResolvedValue({ github: { accounts: [] }, pr: null })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
    expect(mockInitSettings).not.toHaveBeenCalled()
  })

  it('handles when bulkImportAccounts returns no imported accounts', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([]) // Empty array - line 62 coverage

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalled()
    // Should still complete even though no accounts were imported
    expect(result.current.isComplete).toBe(true)
  })

  it('re-render after completion does not re-run migration (line 42 coverage)', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    const callCount = mockBulkImportAccounts.mock.calls.length

    // Rerender - should not call again due to migrationAttempted.current guard
    rerender()

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    // Call count should not increase
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(callCount)
  })
})
