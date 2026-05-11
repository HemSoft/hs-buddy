import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ipcRenderer: { invoke: mockInvoke },
})

// Must import after mock setup
const { getTokenForOwner, withFirstAvailableAccount } = await import('./shared')

// Each test needs unique usernames to avoid the module-level token cache
let testId = 0
function uid(base: string) {
  return `${base}-${++testId}`
}

function makeConfig(accounts: Array<{ username: string; org: string }>) {
  return { accounts } as { accounts: Array<{ username: string; org: string }> }
}

describe('getTokenForOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first available token for a matching account', async () => {
    const u = uid('gto')
    mockInvoke.mockResolvedValueOnce('ghp_token123')
    const config = makeConfig([{ username: u, org: 'myorg' }])
    const token = await getTokenForOwner(config, 'myorg')
    expect(token).toBe('ghp_token123')
  })

  it('skips accounts with no token and tries the next', async () => {
    const u1 = uid('gto')
    const u2 = uid('gto')
    mockInvoke.mockResolvedValueOnce(null).mockResolvedValueOnce('ghp_fallback')
    const config = makeConfig([
      { username: u1, org: 'myorg' },
      { username: u2, org: 'other' },
    ])
    const token = await getTokenForOwner(config, 'myorg')
    expect(token).toBe('ghp_fallback')
  })

  it('throws when no account has a valid token', async () => {
    const u = uid('gto')
    mockInvoke.mockResolvedValue(null)
    const config = makeConfig([{ username: u, org: 'myorg' }])
    await expect(getTokenForOwner(config, 'myorg')).rejects.toThrow(
      'No authenticated GitHub account available'
    )
  })
})

describe('withFirstAvailableAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls operation with the first available octokit', async () => {
    const u = uid('wfaa')
    mockInvoke.mockResolvedValueOnce('ghp_token')
    const config = makeConfig([{ username: u, org: 'myorg' }])
    const operation = vi.fn().mockResolvedValue('result')
    const result = await withFirstAvailableAccount(config, 'myorg', operation, 'test op')
    expect(result).toBe('result')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('tries the next account when the first operation fails', async () => {
    const u1 = uid('wfaa')
    const u2 = uid('wfaa')
    mockInvoke.mockResolvedValueOnce('token1').mockResolvedValueOnce('token2')
    const config = makeConfig([
      { username: u1, org: 'myorg' },
      { username: u2, org: 'other' },
    ])
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce('success')
    const result = await withFirstAvailableAccount(config, 'myorg', operation, 'test op')
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('returns noAccountFallback when all accounts fail', async () => {
    const u = uid('wfaa')
    mockInvoke.mockResolvedValueOnce('token1')
    const config = makeConfig([{ username: u, org: 'myorg' }])
    const operation = vi.fn().mockRejectedValue(new Error('fail'))
    const result = await withFirstAvailableAccount(
      config,
      'myorg',
      operation,
      'test op',
      'fallback'
    )
    expect(result).toBe('fallback')
  })

  it('throws when all accounts fail and no fallback', async () => {
    const u = uid('wfaa')
    mockInvoke.mockResolvedValueOnce('token1')
    const config = makeConfig([{ username: u, org: 'myorg' }])
    const operation = vi.fn().mockRejectedValue(new Error('API error'))
    await expect(
      withFirstAvailableAccount(config, 'myorg', operation, 'fetch data')
    ).rejects.toThrow('Could not fetch data - all 1 account(s) failed')
  })

  it('throws with no-accounts message when no octokit is available', async () => {
    const u = uid('wfaa')
    mockInvoke.mockResolvedValue(null)
    const config = makeConfig([{ username: u, org: 'myorg' }])
    const operation = vi.fn()
    await expect(
      withFirstAvailableAccount(config, 'myorg', operation, 'fetch data')
    ).rejects.toThrow('Could not fetch data - no authenticated account available')
    expect(operation).not.toHaveBeenCalled()
  })

  it('skips accounts with no octokit and tries the next', async () => {
    const u1 = uid('wfaa')
    const u2 = uid('wfaa')
    mockInvoke.mockResolvedValueOnce(null).mockResolvedValueOnce('token2')
    const config = makeConfig([
      { username: u1, org: 'myorg' },
      { username: u2, org: 'other' },
    ])
    const operation = vi.fn().mockResolvedValue('ok')
    const result = await withFirstAvailableAccount(config, 'myorg', operation, 'test')
    expect(result).toBe('ok')
  })
})
