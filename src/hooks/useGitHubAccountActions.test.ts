import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useGitHubAccountActions } from './useGitHubAccountActions'
import type { GitHubAccount } from '../types/config'
import type { Id } from '../../convex/_generated/dataModel'
import { IPC_INVOKE } from '../ipc/contracts'

type ConvexAccounts = Parameters<typeof useGitHubAccountActions>[0]
type ConvexAccount = NonNullable<ConvexAccounts>[number]

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('./useConvex', () => ({
  useGitHubAccountMutations: () => ({
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
  useGitHubAccountsConvex: vi.fn(),
}))

const mockInvoke = vi.fn()
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke, on: vi.fn(), off: vi.fn(), send: vi.fn() },
  writable: true,
  configurable: true,
})

const account1: ConvexAccount = {
  _id: 'acc1' as Id<'githubAccounts'>,
  _creationTime: 100,
  username: 'user1',
  org: 'org1',
  usageProvider: 'copilot',
  createdAt: 100,
  updatedAt: 100,
}

const account2: ConvexAccount = {
  _id: 'acc2' as Id<'githubAccounts'>,
  _creationTime: 200,
  username: 'user2',
  org: 'org2',
  usageProvider: 'codex',
  createdAt: 200,
  updatedAt: 200,
}

describe('useGitHubAccountActions mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ success: true })
    mockUpdate.mockResolvedValue({ success: true })
    mockRemove.mockResolvedValue({ success: true })
    mockInvoke.mockResolvedValue({ success: true })
  })

  it('adds an account using create mutation', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    const newAccount: GitHubAccount = { username: 'newuser', org: 'neworg', usageProvider: 'codex' }
    const res = await result.current.addAccount(newAccount)
    expect(res.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledWith({
      username: 'newuser',
      org: 'neworg',
      usageProvider: 'codex',
    })
  })

  it('updates an account using update mutation', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    const res = await result.current.updateAccount('user1', 'org1', { repoRoot: '/new/path' })
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'acc1', repoRoot: '/new/path' })
  })

  it('reconciles usage provider for existing account', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    const res = await result.current.reconcileUsageProvider('user1', 'org1', 'codex')
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'acc1', usageProvider: 'codex' })
  })
})

let persistedProvider: GitHubAccount['usageProvider'] | null
let mirroredAccounts: GitHubAccount[]

function resetProviderPersistence() {
  vi.resetAllMocks()
  persistedProvider = 'codex'
  mirroredAccounts = []
  mockUpdate.mockResolvedValue({ success: true })
  mockRemove.mockResolvedValue({ success: true })
  mockInvoke.mockImplementation(async (channel, ...args: unknown[]) => {
    if (channel === IPC_INVOKE.CONFIG_SYNC_GITHUB_ACCOUNTS) {
      mirroredAccounts = args[0] as GitHubAccount[]
    } else if (channel === IPC_INVOKE.CONFIG_SET_USAGE_PROVIDER_OVERRIDE) {
      persistedProvider = args[2] as typeof persistedProvider
    } else {
      throw new Error(`Unexpected IPC channel: ${String(channel)}`)
    }
    return { success: true }
  })
}

describe('useGitHubAccountActions provider persistence', () => {
  beforeEach(resetProviderPersistence)

  it('mirrors a matching connected provider before clearing its local override', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    expect(await result.current.reconcileUsageProvider('user1', 'org1', 'copilot')).toEqual({
      success: true,
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mirroredAccounts).toEqual([{ username: 'user1', org: 'org1', usageProvider: 'copilot' }])
    expect(persistedProvider).toBeNull()
    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual([
      IPC_INVOKE.CONFIG_SYNC_GITHUB_ACCOUNTS,
      IPC_INVOKE.CONFIG_SET_USAGE_PROVIDER_OVERRIDE,
    ])
  })

  it.each([
    ['disk full', 'disk full'],
    [undefined, 'Failed to mirror connected provider'],
  ])(
    'retains the override when matching-provider mirroring fails with %s',
    async (error, expected) => {
      mockInvoke.mockResolvedValueOnce({ success: false, error })
      const { result } = renderHook(() => useGitHubAccountActions([account1], true))
      expect(await result.current.reconcileUsageProvider('user1', 'org1', 'copilot')).toEqual({
        success: false,
        error: expected,
      })
      expect(persistedProvider).toBe('codex')
      expect(mirroredAccounts).toEqual([])
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockUpdate).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['override locked', 'override locked'],
    [undefined, 'Failed to reconcile local provider'],
  ])('reports a failed override clear with %s after mirroring', async (error, expected) => {
    const invoke = mockInvoke.getMockImplementation()!
    mockInvoke.mockImplementation((channel, ...args: unknown[]) =>
      channel === IPC_INVOKE.CONFIG_SET_USAGE_PROVIDER_OVERRIDE
        ? Promise.resolve({ success: false, error })
        : invoke(channel, ...args)
    )
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    expect(await result.current.reconcileUsageProvider('user1', 'org1', 'copilot')).toEqual({
      success: false,
      error: expected,
    })
    expect(mirroredAccounts).toEqual([{ username: 'user1', org: 'org1', usageProvider: 'copilot' }])
    expect(persistedProvider).toBe('codex')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns a thrown reconciliation error without clearing the existing override', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('IPC disconnected'))
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    expect(await result.current.reconcileUsageProvider('user1', 'org1', 'copilot')).toEqual({
      success: false,
      error: 'IPC disconnected',
    })
    expect(persistedProvider).toBe('codex')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('reports the connected-save fallback error when local persistence supplies no error text', async () => {
    persistedProvider = 'copilot'
    const invoke = mockInvoke.getMockImplementation()!
    mockInvoke.mockImplementation((channel, ...args: unknown[]) =>
      channel === IPC_INVOKE.CONFIG_SET_USAGE_PROVIDER_OVERRIDE
        ? Promise.resolve({ success: false })
        : invoke(channel, ...args)
    )
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))
    expect(await result.current.updateUsageProvider('user1', 'org1', 'codex')).toEqual({
      success: false,
      error: 'Failed to preserve local provider',
    })
    expect(mockUpdate).toHaveBeenCalledExactlyOnceWith({ id: 'acc1', usageProvider: 'codex' })
    expect(persistedProvider).toBe('copilot')
    expect(mirroredAccounts).toHaveLength(1)
  })
})

describe('useGitHubAccountActions pending provider writes', () => {
  beforeEach(resetProviderPersistence)

  it('uses the captured connected snapshot if the query becomes unavailable during a write', async () => {
    let resolveUpdate!: () => void
    mockUpdate.mockReturnValueOnce(
      new Promise<void>(resolve => {
        resolveUpdate = resolve
      })
    )
    const { result, rerender } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      { initialProps: { accounts: [account1] as ConvexAccounts } }
    )
    const pending = result.current.updateUsageProvider('user1', 'org1', 'codex')
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    rerender({ accounts: undefined })
    resolveUpdate()
    expect(await pending).toEqual({ success: true })
    expect(mirroredAccounts).toEqual([{ username: 'user1', org: 'org1', usageProvider: 'copilot' }])
    expect(persistedProvider).toBe('codex')
  })

  it.each(['removed', 'replaced'] as const)(
    'does not preserve a pending provider after the account is %s',
    async change => {
      let resolveUpdate!: () => void
      mockUpdate.mockReturnValueOnce(
        new Promise<void>(resolve => {
          resolveUpdate = resolve
        })
      )
      const { result, rerender } = renderHook(
        ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
        { initialProps: { accounts: [account1] } }
      )
      const pending = result.current.updateUsageProvider('user1', 'org1', 'codex')
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
      rerender({
        accounts:
          change === 'removed' ? [] : [{ ...account1, _id: 'replacement' as Id<'githubAccounts'> }],
      })
      resolveUpdate()
      expect(await pending).toEqual({
        success: false,
        error: change === 'removed' ? 'Account no longer exists' : 'Account was replaced',
      })
      expect(persistedProvider).toBe(change === 'removed' ? null : 'codex')
      expect(mirroredAccounts).toEqual([])
      expect(mockInvoke).toHaveBeenCalledTimes(change === 'removed' ? 1 : 0)
    }
  )

  it.each(['resolve', 'reject'] as const)(
    'keeps a newer local selection when an older connected write will %s',
    async outcome => {
      persistedProvider = 'copilot'
      let resolveUpdate!: () => void
      let rejectUpdate!: (error: Error) => void
      mockUpdate.mockReturnValueOnce(
        new Promise<void>((resolve, reject) => {
          resolveUpdate = resolve
          rejectUpdate = reject
        })
      )
      const { result } = renderHook(() => useGitHubAccountActions([account1], true))
      const older = result.current.updateUsageProvider('user1', 'org1', 'codex')
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
      expect(
        await result.current.updateUsageProvider('user1', 'org1', 'copilot', { localOnly: true })
      ).toEqual({ success: true })
      expect(persistedProvider).toBe('copilot')
      mockInvoke.mockClear()
      if (outcome === 'resolve') resolveUpdate()
      else rejectUpdate(new Error('remote rejected'))
      expect(await older).toEqual({ success: true })
      expect(persistedProvider).toBe('copilot')
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    }
  )
})

describe('useGitHubAccountActions tombstone and async lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ success: true })
    mockUpdate.mockResolvedValue({ success: true })
    mockRemove.mockResolvedValue({ success: true })
    mockInvoke.mockResolvedValue({ success: true })
  })

  it('cleans up removal tombstones in effect after commit when convexAccounts updates', async () => {
    let resolveRemove!: (val: unknown) => void
    mockRemove.mockReturnValue(
      new Promise(resolve => {
        resolveRemove = resolve
      })
    )

    const { result, rerender } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      { initialProps: { accounts: [account1, account2] } }
    )

    let removePromise!: Promise<{ success: boolean; error?: string }>
    act(() => {
      removePromise = result.current.removeAccount('user1', 'org1')
    })

    const blockedResult = await result.current.updateUsageProvider('user1', 'org1', 'codex')
    expect(blockedResult.success).toBe(false)
    expect(blockedResult.error).toBe('Account removal in progress')

    await act(async () => {
      resolveRemove({ success: true })
      await removePromise
    })

    rerender({ accounts: [account2] })

    const afterResult = await result.current.updateUsageProvider('user1', 'org1', 'codex')
    expect(afterResult.error).not.toBe('Account removal in progress')
    expect(afterResult.success).toBe(true)
  })

  it('renders and rerenders safely under React Strict Mode', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      { wrapper: StrictMode, initialProps: { accounts: [account1] } }
    )
    expect(result.current.addAccount).toBeTypeOf('function')
    rerender({ accounts: [account1, account2] })
    expect(result.current.removeAccount).toBeTypeOf('function')
    unmount()
  })

  it('ensures latest committed accounts are available in asynchronous callbacks', async () => {
    const { result, rerender } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      { initialProps: { accounts: [account1] } }
    )
    rerender({ accounts: [account1, account2] })
    const res = await result.current.removeAccount('user2', 'org2')
    expect(res.success).toBe(true)
    expect(mockRemove).toHaveBeenCalledWith({ id: 'acc2' })
  })
})
