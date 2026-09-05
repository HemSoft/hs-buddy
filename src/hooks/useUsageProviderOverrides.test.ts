import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { useResolvedAccounts } from './useUsageProviderOverrides'
import type { ConvexGitHubAccount } from './useUsageProviderOverrides'
import type { GitHubAccount } from '../types/config'

const account1: ConvexGitHubAccount = {
  _id: 'acc1',
  username: 'alice',
  org: 'org1',
  repoRoot: '/path/to/repo',
  usageProvider: 'copilot',
}

const localAccount1: GitHubAccount = {
  username: 'alice',
  org: 'org1',
  repoRoot: '/path/to/repo',
  usageProvider: 'copilot',
}

describe('useResolvedAccounts source resolution', () => {
  it('returns resolved accounts from Convex when available', () => {
    const { result } = renderHook(() => useResolvedAccounts([account1], [], {}, {}))
    expect(result.current).toEqual([
      { username: 'alice', org: 'org1', repoRoot: '/path/to/repo', usageProvider: 'copilot' },
    ])
  })

  it('returns resolved accounts from local store when Convex is undefined', () => {
    const { result } = renderHook(() => useResolvedAccounts(undefined, [localAccount1], {}, {}))
    expect(result.current).toEqual([
      { username: 'alice', org: 'org1', repoRoot: '/path/to/repo', usageProvider: 'copilot' },
    ])
  })
})

describe('useResolvedAccounts reference stabilization', () => {
  it('preserves array reference identity across rerenders when content is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ convex, overrides }) => useResolvedAccounts(convex, [], overrides, {}),
      {
        initialProps: {
          convex: [{ ...account1 }],
          overrides: { 'alice:org1': 'copilot' as const },
        },
      }
    )
    const firstReference = result.current
    rerender({ convex: [{ ...account1 }], overrides: { 'alice:org1': 'copilot' as const } })
    expect(result.current).toBe(firstReference)
  })

  it('updates array reference when account content or provider changes', () => {
    const { result, rerender } = renderHook(
      ({ convex, overrides }) => useResolvedAccounts(convex, [], overrides, {}),
      { initialProps: { convex: [account1], overrides: {} as Record<string, 'copilot' | 'codex'> } }
    )
    const firstReference = result.current
    rerender({ convex: [{ ...account1, usageProvider: 'codex' as const }], overrides: {} })
    expect(result.current).not.toBe(firstReference)
    expect(result.current[0].usageProvider).toBe('codex')
  })

  it('preserves reference stability under React Strict Mode replay', () => {
    const { result, rerender, unmount } = renderHook(
      ({ convex }) => useResolvedAccounts(convex, [], {}, {}),
      { wrapper: StrictMode, initialProps: { convex: [{ ...account1 }] } }
    )
    const firstReference = result.current
    rerender({ convex: [{ ...account1 }] })
    expect(result.current).toBe(firstReference)
    unmount()
  })
})
