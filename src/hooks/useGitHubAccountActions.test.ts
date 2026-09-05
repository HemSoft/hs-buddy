import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { useGitHubAccountActions } from './useGitHubAccountActions'
import type { GitHubAccount } from '../types/config'
import type { Id } from '../../convex/_generated/dataModel'

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
  value: {
    invoke: mockInvoke,
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
  },
  writable: true,
  configurable: true,
})

describe('useGitHubAccountActions', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ success: true })
    mockUpdate.mockResolvedValue({ success: true })
    mockRemove.mockResolvedValue({ success: true })
    mockInvoke.mockResolvedValue({ success: true })
  })

  it('adds an account using create mutation', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))

    const newAccount: GitHubAccount = {
      username: 'newuser',
      org: 'neworg',
      usageProvider: 'codex',
    }

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

    const res = await result.current.updateAccount('user1', 'org1', {
      repoRoot: '/new/path',
    })
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'acc1',
      repoRoot: '/new/path',
    })
  })

  it('reconciles usage provider for existing account', async () => {
    const { result } = renderHook(() => useGitHubAccountActions([account1], true))

    const res = await result.current.reconcileUsageProvider('user1', 'org1', 'codex')
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'acc1',
      usageProvider: 'codex',
    })
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
      {
        initialProps: { accounts: [account1, account2] },
      }
    )

    // Start removal of account1
    let removePromise!: Promise<{ success: boolean; error?: string }>
    act(() => {
      removePromise = result.current.removeAccount('user1', 'org1')
    })

    // While removal is in progress, updateUsageProvider for user1 should be blocked by tombstone
    const blockedResult = await result.current.updateUsageProvider('user1', 'org1', 'codex')
    expect(blockedResult.success).toBe(false)
    expect(blockedResult.error).toBe('Account removal in progress')

    // Finish remove mutation
    await act(async () => {
      resolveRemove({ success: true })
      await removePromise
    })

    // Now convexAccounts updates (dropping account1)
    rerender({ accounts: [account2] })

    // After commit effect runs, tombstone is cleaned up. An updateUsageProvider is no longer blocked by tombstone
    const afterResult = await result.current.updateUsageProvider('user1', 'org1', 'codex')
    expect(afterResult.error).not.toBe('Account removal in progress')
    expect(afterResult.success).toBe(true)
  })

  it('renders and rerenders safely under React Strict Mode', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      {
        wrapper: StrictMode,
        initialProps: { accounts: [account1] },
      }
    )

    expect(result.current.addAccount).toBeTypeOf('function')

    rerender({ accounts: [account1, account2] })
    expect(result.current.removeAccount).toBeTypeOf('function')

    unmount()
  })

  it('ensures latest committed accounts are available in asynchronous callbacks', async () => {
    const { result, rerender } = renderHook(
      ({ accounts }: { accounts: ConvexAccounts }) => useGitHubAccountActions(accounts, true),
      {
        initialProps: { accounts: [account1] },
      }
    )

    // Rerender with account2 added
    rerender({ accounts: [account1, account2] })

    // Async callback removeAccount on newly added account2 accesses accountsRef.current
    const res = await result.current.removeAccount('user2', 'org2')
    expect(res.success).toBe(true)
    expect(mockRemove).toHaveBeenCalledWith({ id: 'acc2' })
  })
})
