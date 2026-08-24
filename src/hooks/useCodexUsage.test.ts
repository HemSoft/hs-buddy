import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const accounts: Array<{
  username: string
  org: string
  usageProvider?: 'copilot' | 'codex'
}> = []

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({ accounts, loading: false }),
}))

const getUsage = vi.fn()
Object.defineProperty(window, 'codex', {
  value: { getUsage },
  writable: true,
  configurable: true,
})

import { getCodexUsageKey, useCodexUsage } from './useCodexUsage'

const usageData = {
  planType: 'plus',
  fetchedAt: 123,
  windows: [
    {
      kind: 'weekly' as const,
      label: 'Weekly allowance',
      usedPercent: 20,
      remainingPercent: 80,
      resetAt: '2030-01-05T00:00:00Z',
      durationSeconds: 604_800,
      periodStart: '2029-12-29T00:00:00Z',
      projectedPercent: 30,
    },
  ],
}

describe('useCodexUsage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    accounts.splice(0, accounts.length)
  })

  it('fetches only accounts explicitly configured for Codex', async () => {
    accounts.push(
      { username: 'copilot-user', org: 'org' },
      { username: 'codex-user', org: 'org', usageProvider: 'codex' }
    )
    getUsage.mockResolvedValue({ success: true, data: usageData })

    const { result } = renderHook(() => useCodexUsage())
    const codexKey = getCodexUsageKey(accounts[1])

    await waitFor(() => expect(result.current.states[codexKey]?.loading).toBe(false))
    expect(result.current.accounts.map(account => account.username)).toEqual(['codex-user'])
    expect(result.current.states[codexKey]?.data).toEqual(usageData)
    expect(result.current.states[getCodexUsageKey(accounts[0])]).toBeUndefined()
    expect(getUsage).toHaveBeenCalledTimes(1)
  })

  it('surfaces provider failures and thrown IPC errors', async () => {
    accounts.push({ username: 'codex-user', org: 'org', usageProvider: 'codex' })
    getUsage.mockResolvedValueOnce({ success: false, error: 'Sign in again.' })

    const { result } = renderHook(() => useCodexUsage())
    const key = getCodexUsageKey(accounts[0])
    await waitFor(() => expect(result.current.states[key]?.error).toBe('Sign in again.'))

    getUsage.mockRejectedValueOnce(new Error('IPC unavailable'))
    await act(async () => {
      await result.current.fetchUsage(accounts[0])
    })
    expect(result.current.states[key]).toMatchObject({
      data: null,
      loading: false,
      error: 'IPC unavailable',
    })
  })

  it('uses one local login and rejects additional Codex account cards', async () => {
    accounts.push(
      { username: 'one', org: 'org', usageProvider: 'codex' },
      { username: 'two', org: 'org', usageProvider: 'codex' }
    )
    getUsage.mockResolvedValue({ success: true, data: usageData })
    const { result } = renderHook(() => useCodexUsage())
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(1))
    expect(result.current.states[getCodexUsageKey(accounts[1])]).toMatchObject({
      data: null,
      loading: false,
      error: 'The local Codex login is assigned to one. Choose Copilot for this account.',
    })

    await act(async () => {
      await result.current.refreshAll()
    })
    expect(getUsage).toHaveBeenCalledTimes(2)
  })

  it('keeps the last successful allowance when a refresh fails', async () => {
    accounts.push({ username: 'codex-user', org: 'org', usageProvider: 'codex' })
    getUsage.mockResolvedValueOnce({ success: true, data: usageData })
    const { result } = renderHook(() => useCodexUsage())
    const key = getCodexUsageKey(accounts[0])
    await waitFor(() => expect(result.current.states[key]?.data).toEqual(usageData))

    getUsage.mockResolvedValueOnce({ success: false, error: 'Temporarily unavailable' })
    await act(async () => {
      await result.current.fetchUsage(accounts[0])
    })

    expect(result.current.states[key]).toEqual({
      data: usageData,
      loading: false,
      error: 'Temporarily unavailable',
    })
  })
})
