import '../test/useMigrationHarness'
import { StrictMode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMigrateToConvex } from './useMigration'
import { markAccountMigrationPending, useAccountMigrationReady } from './useAccountMigrationState'
import {
  mockBulkImportAccounts,
  mockInitSettings,
  mockInvoke,
  migrationState,
} from '../test/useMigrationHarness'

describe('useMigrateToConvex render purity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    migrationState.existingAccounts = undefined
    migrationState.existingSettings = undefined
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
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, unmount } = renderHook(() => useMigrateToConvex(), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(mockBulkImportAccounts).toHaveBeenCalledTimes(1)
    expect(mockInitSettings).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('evaluates accountPlanIsReady against latest committed accounts during migration', async () => {
    migrationState.existingAccounts = []
    migrationState.existingSettings = {}
    let resolveInvoke!: (value: unknown) => void
    mockInvoke.mockReturnValue(
      new Promise(resolve => {
        resolveInvoke = resolve
      })
    )
    mockBulkImportAccounts.mockResolvedValue([{ id: '1', username: 'user1' }])
    mockInitSettings.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      () => ({ ...useMigrateToConvex(), accountsReady: useAccountMigrationReady() }),
      { wrapper: StrictMode }
    )

    migrationState.existingAccounts = [{ _id: '1', username: 'user1', org: 'org1' }]
    rerender()

    expect(result.current.accountsReady).toBe(false)

    await act(async () => {
      resolveInvoke({
        github: { accounts: [{ username: 'user1', org: 'org1' }] },
        pr: { refreshInterval: 10, autoRefresh: true },
      })
    })

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(result.current.accountsReady).toBe(true)
  })
})
