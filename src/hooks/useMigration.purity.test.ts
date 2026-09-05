import { StrictMode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'
import { markAccountMigrationPending, useAccountMigrationReady } from './useAccountMigrationState'

const mockBulkImportAccounts = vi.fn()
const mockInitSettings = vi.fn()
let mockExistingAccounts: Array<Record<string, unknown>> | undefined
let mockExistingSettings: Record<string, unknown> | undefined

function refNameIncludes(ref: unknown, value: string) {
  const name = (ref as { name?: string } | undefined)?.name
  return String(name ?? '').includes(value) || String(ref).includes(value)
}

vi.mock('convex/react', () => ({
  useConvexConnectionState: () => ({ connectionCount: 1, isWebSocketConnected: true }),
  useMutation: (ref: unknown) =>
    refNameIncludes(ref, 'bulkImport') ? mockBulkImportAccounts : mockInitSettings,
  useQuery: (ref: unknown) =>
    refNameIncludes(ref, 'list') ? mockExistingAccounts : mockExistingSettings,
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    githubAccounts: { bulkImport: { name: 'bulkImport' }, list: { name: 'list' } },
    settings: { initFromMigration: { name: 'initFromMigration' }, get: { name: 'get' } },
  },
}))

const mockInvoke = vi.fn()
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

describe('useMigrateToConvex render purity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistingAccounts = undefined
    mockExistingSettings = undefined
    markAccountMigrationPending()
    mockInvoke.mockResolvedValue({
      github: { accounts: [{ username: 'user1', org: 'org1' }] },
      pr: { refreshInterval: 10, autoRefresh: true },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs safely under React Strict Mode replay and unmounts cleanly', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, unmount } = renderHook(() => useMigrateToConvex(), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)
    expect(mockInitSettings).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('evaluates accountPlanIsReady against latest committed accounts during migration', async () => {
    mockExistingAccounts = []
    mockExistingSettings = {}
    let resolveImport!: (value: Array<{ id: string; username: string }>) => void
    mockBulkImportAccounts.mockReturnValue(
      new Promise(resolve => {
        resolveImport = resolve
      })
    )
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      () => ({ ...useMigrateToConvex(), accountsReady: useAccountMigrationReady() }),
      { wrapper: StrictMode }
    )

    mockExistingAccounts = [{ _id: '1', username: 'user1', org: 'org1' }]
    rerender()

    await act(async () => {
      resolveImport([{ id: '1', username: 'user1' }])
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(result.current.accountsReady).toBe(true)
  })
})
