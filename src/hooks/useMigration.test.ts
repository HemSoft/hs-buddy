import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'

const mockBulkImportAccounts = vi.fn()
const mockInitSettings = vi.fn()
let mockExistingAccounts: Array<Record<string, unknown>> | undefined
let mockExistingSettings: Record<string, unknown> | undefined

function refNameIncludes(ref: unknown, value: string) {
  const name = (ref as { name?: string } | undefined)?.name
  return String(name ?? '').includes(value) || String(ref).includes(value)
}

vi.mock('convex/react', () => ({
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

  it('handles migration error gracefully', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockInvoke.mockRejectedValue(new Error('IPC failed'))

    const { result } = renderHook(() => useMigrateToConvex())

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })

    expect(mockBulkImportAccounts).not.toHaveBeenCalled()
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
