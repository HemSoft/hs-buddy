import '../test/useMigrationHarness'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'
import { markAccountMigrationPending, useAccountMigrationReady } from './useAccountMigrationState'
import {
  mockBulkImportAccounts,
  mockInitSettings,
  mockInvoke,
  migrationState,
  setLocalAccounts,
} from '../test/useMigrationHarness'

describe('useMigrateToConvex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    migrationState.existingAccounts = undefined
    migrationState.existingSettings = undefined
    migrationState.connectionCount = 1
    migrationState.isWebSocketConnected = true
    markAccountMigrationPending()
    setLocalAccounts([{ username: 'user1', org: 'org1' }])
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
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'user1', org: 'org1' }],
    })
    expect(mockInitSettings).toHaveBeenCalledWith({
      pr: { refreshInterval: 10, autoRefresh: true },
    })
  })

  it('imports local accounts missing from a nonempty Convex snapshot', async () => {
    migrationState.existingAccounts = [{ _id: 'abc', username: 'existing', org: 'org1' }]
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await waitFor(() => expect(result.current.migration.isComplete).toBe(true))

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'user1', org: 'org1' }],
    })
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = [
      { _id: 'abc', username: 'existing', org: 'org1' },
      { _id: 'imported', username: 'user1', org: 'org1' },
    ]
    rerender()

    await waitFor(() => expect(result.current.accountsReady).toBe(true))
  })

  it('waits for the full imported snapshot when an empty query updates partially', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: 'user1' }, { id: 'user2' }])
    mockInitSettings.mockResolvedValue(undefined)
    setLocalAccounts([
      { username: 'user1', org: 'org1' },
      { username: 'user2', org: 'org1' },
    ])

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))
    await waitFor(() => expect(result.current.migration.isComplete).toBe(true))
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = [{ _id: 'user1', username: 'user1', org: 'org1' }]
    rerender()
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = [
      { _id: 'user1', username: 'user1', org: 'org1' },
      { _id: 'user2', username: 'user2', org: 'org1' },
    ]
    rerender()
    await waitFor(() => expect(result.current.accountsReady).toBe(true))
  })

  it('skips local account identities already present in Convex', async () => {
    migrationState.existingAccounts = [{ _id: 'abc', username: 'USER1', org: 'ORG1' }]
    migrationState.existingSettings = {}

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
  })

  it('fills missing metadata on an existing identity before publishing readiness', async () => {
    migrationState.existingAccounts = [
      { _id: 'owner', username: 'owner', org: 'o', usageProvider: 'codex' },
      { _id: 'abc', username: 'u', org: 'o' },
    ]
    migrationState.existingSettings = {}
    setLocalAccounts([{ username: 'u', org: 'o', repoRoot: 'r', usageProvider: 'codex' }])
    mockBulkImportAccounts.mockResolvedValue([])

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))
    await waitFor(() => expect(result.current.migration.isComplete).toBe(true))

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'u', org: 'o', repoRoot: 'r' }],
    })
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = [
      migrationState.existingAccounts[0],
      { _id: 'abc', username: 'u', org: 'o', repoRoot: 'r' },
    ]
    rerender()
    await waitFor(() => expect(result.current.accountsReady).toBe(true))
  })

  it('keeps only the last local Codex owner in the migration snapshot', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    setLocalAccounts([
      { username: 'first', org: 'o', usageProvider: 'codex' },
      { username: 'second', org: 'o', usageProvider: 'codex' },
    ])
    mockBulkImportAccounts.mockResolvedValue([])

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))
    await waitFor(() => expect(result.current.migration.isComplete).toBe(true))
    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [
        { username: 'first', org: 'o' },
        { username: 'second', org: 'o', usageProvider: 'codex' },
      ],
    })

    migrationState.existingAccounts = [
      { _id: 'first', username: 'first', org: 'o' },
      { _id: 'second', username: 'second', org: 'o', usageProvider: 'codex' },
    ]
    rerender()
    await waitFor(() => expect(result.current.accountsReady).toBe(true))
  })

  it('uses the first canonical Convex row when legacy identities still collide', async () => {
    migrationState.existingAccounts = [
      { _id: 'duplicate', username: 'user', org: 'org', createdAt: 2 },
      { _id: 'canonical', username: 'USER', org: 'ORG', repoRoot: 'root', createdAt: 1 },
    ]
    migrationState.existingSettings = {}
    setLocalAccounts([{ username: 'user', org: 'org', repoRoot: 'local' }])

    const { result } = renderHook(() => useMigrateToConvex())
    await waitFor(() => expect(result.current.isComplete).toBe(true))

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
  })

  it('skips settings import when Convex already has settings with _id', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = { _id: 'settings-1', pr: { refreshInterval: 5 } }
    mockBulkImportAccounts.mockResolvedValue([{ id: '1' }])

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

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

    await act(() => vi.advanceTimersByTimeAsync(3_100))
    expect(result.current.migration.isComplete).toBe(true)
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    rerender()
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(mockBulkImportAccounts).toHaveBeenCalledWith({
      accounts: [{ username: 'user1', org: 'org1' }],
    })
    migrationState.existingAccounts = [{ _id: 'imported', username: 'user1', org: 'org1' }]
    rerender()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.accountsReady).toBe(true)
  })

  it('timeout no-ops after migration already completed', async () => {
    vi.useFakeTimers()
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([])
    mockInitSettings.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMigrateToConvex())

    // Let migration promises resolve (microtasks) without advancing the 3s timeout
    await act(() => vi.advanceTimersByTimeAsync(10))

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
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts
      .mockRejectedValueOnce(new Error('Convex unavailable'))
      .mockResolvedValueOnce([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => ({
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
    migrationState.existingAccounts = [{ _id: 'imported', username: 'user1', org: 'org1' }]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(2)
    expect(result.current.accountsReady).toBe(true)
    expect(result.current.migration.isComplete).toBe(true)
  })

  it('marks account migration ready while settings migration continues retrying', async () => {
    vi.useFakeTimers()
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings
      .mockRejectedValueOnce(new Error('Invalid legacy settings'))
      .mockRejectedValueOnce(new Error('Invalid legacy settings'))

    const { result, rerender } = renderHook(() => ({
      migration: useMigrateToConvex(),
      accountsReady: useAccountMigrationReady(),
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    migrationState.existingAccounts = [{ _id: 'imported', username: 'user1', org: 'org1' }]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)
    expect(mockInitSettings).toHaveBeenCalledTimes(2)
    expect(result.current.accountsReady).toBe(true)
    expect(result.current.migration.isComplete).toBe(false)
  })

  it('does not run a pending retry while Convex is disconnected', async () => {
    vi.useFakeTimers()
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
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

    migrationState.isWebSocketConnected = false
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)

    migrationState.connectionCount += 1
    migrationState.isWebSocketConnected = true
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    migrationState.existingAccounts = [{ _id: 'recovered', username: 'user1', org: 'org1' }]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(2)
    expect(result.current.accountsReady).toBe(true)
  })

  it('stops retrying a persistently failed migration after bounded exponential backoff', async () => {
    vi.useFakeTimers()
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
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

    migrationState.existingSettings = { changed: true }
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(false)

    migrationState.existingAccounts = [
      { _id: 'authoritative-account', username: 'user1', org: 'org1' },
    ]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)
    expect(result.current.accountsReady).toBe(true)
  })

  it('reopens an exhausted migration budget after a real Convex reconnect', async () => {
    vi.useFakeTimers()
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
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

    migrationState.isWebSocketConnected = false
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(5)

    mockBulkImportAccounts.mockResolvedValue([{ id: 'recovered' }])
    migrationState.connectionCount += 1
    migrationState.isWebSocketConnected = true
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    migrationState.existingAccounts = [{ _id: 'recovered', username: 'user1', org: 'org1' }]
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(6)
    expect(result.current.accountsReady).toBe(true)
  })

  it('skips migration on re-render when already attempted', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    const callCount = mockBulkImportAccounts.mock.calls.length

    // Change a dependency so the effect re-fires with migrationAttempted.current = true
    migrationState.existingAccounts = [{ id: '1', username: 'user1', org: 'org1' }]
    rerender()

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    // Should not have called bulkImport again
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(callCount)
  })

  it('waits for the in-flight migration when dependencies change', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
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
    migrationState.existingAccounts = undefined
    rerender()

    resolveConfig({
      github: { accounts: [{ username: 'user1', org: 'org1' }] },
      pr: { refreshInterval: 10, autoRefresh: true },
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isComplete).toBe(false)

    migrationState.existingAccounts = []
    rerender()

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('skips import when electron-store has no accounts', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockInvoke.mockResolvedValue({ github: { accounts: [] }, pr: null })

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
    expect(mockInitSettings).not.toHaveBeenCalled()
  })

  it('handles when bulkImportAccounts returns no imported accounts', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([]) // Empty array - line 62 coverage

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    expect(mockBulkImportAccounts).toHaveBeenCalled()
    // Should still complete even though no accounts were imported
    expect(result.current.isComplete).toBe(true)
  })

  it('re-render after completion does not re-run migration (line 42 coverage)', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useMigrateToConvex())

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    const callCount = mockBulkImportAccounts.mock.calls.length

    // Rerender - should not call again due to migrationAttempted.current guard
    rerender()

    await waitFor(() => expect(result.current.isComplete).toBe(true))

    // Call count should not increase
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(callCount)
  })
})
