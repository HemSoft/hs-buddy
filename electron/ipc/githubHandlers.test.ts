import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = vi.fn()
    mutation = vi.fn()
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    copilotUsageHistory: { store: 'copilotUsageHistory:store' },
    github: { listAccounts: 'github:listAccounts' },
  },
}))

vi.mock('../config', () => ({
  CONVEX_URL: 'https://mock.convex.cloud',
}))

const mockExecAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
const mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

vi.mock('../utils', () => ({
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
  execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}))

vi.mock('../../src/utils/budgetUtils', () => ({
  findBudgetAcrossPages: vi.fn().mockResolvedValue(null),
}))

const mockParseActiveGitHubAccount = vi.fn().mockReturnValue(null)
const mockBuildGhAuthTokenArgs = vi.fn().mockReturnValue(['auth', 'token'])
const mockValidateCliToken = vi.fn().mockReturnValue({ valid: true, token: 'ghp_test' })

vi.mock('../../src/utils/githubAuthUtils', () => ({
  parseActiveGitHubAccount: (...args: unknown[]) => mockParseActiveGitHubAccount(...args),
  buildGhAuthTokenArgs: (...args: unknown[]) => mockBuildGhAuthTokenArgs(...args),
  validateCliToken: (...args: unknown[]) => mockValidateCliToken(...args),
}))

const mockClassifyCliTokenError = vi.fn().mockReturnValue('unknown')

vi.mock('../../src/utils/billingParsers', () => ({
  isNotFoundError: vi.fn(() => false),
  extractPremiumUsageItems: vi.fn(() => []),
  sumGrossRequests: vi.fn(() => 0),
  sumNetCost: vi.fn(() => 0),
  parseBillingUsage: vi.fn(() => ({ items: [] })),
  extractBudgetFromResult: vi.fn(() => null),
  extractUsageSpend: vi.fn(() => 0),
  computeOverageSpend: vi.fn(() => 0),
  classifyCliTokenError: (...args: unknown[]) => mockClassifyCliTokenError(...args),
  assembleCopilotMetrics: vi.fn(() => ({})),
}))

import { ipcMain } from 'electron'
import { registerGitHubHandlers } from './githubHandlers'

describe('githubHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerGitHubHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('github:get-cli-token')).toBe(true)
    expect(handlers.has('github:get-active-account')).toBe(true)
    expect(handlers.has('github:get-copilot-usage')).toBe(true)
    expect(handlers.has('github:get-copilot-quota')).toBe(true)
    expect(handlers.has('github:get-copilot-budget')).toBe(true)
    expect(handlers.has('github:switch-account')).toBe(true)
    expect(handlers.has('github:get-copilot-member-usage')).toBe(true)
    expect(handlers.has('github:get-user-premium-requests')).toBe(true)
    expect(handlers.has('github:collect-copilot-snapshots')).toBe(true)
  })

  describe('github:get-cli-token', () => {
    it('returns validated token on success', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: 'ghp_abc123\n', stderr: '' })
      mockValidateCliToken.mockReturnValueOnce({ valid: true, token: 'ghp_abc123' })

      const handler = handlers.get('github:get-cli-token')!
      const result = await handler({}, 'testuser')

      expect(mockBuildGhAuthTokenArgs).toHaveBeenCalledWith('testuser')
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'gh',
        ['auth', 'token'],
        expect.objectContaining({ encoding: 'utf8', timeout: 5000 })
      )
      expect(result).toEqual({ valid: true, token: 'ghp_abc123' })
    })

    it('throws classified error on exec failure', async () => {
      const error = new Error('gh not found')
      mockExecFileAsync.mockRejectedValueOnce(error)
      mockClassifyCliTokenError.mockReturnValueOnce('cli-not-installed')

      const handler = handlers.get('github:get-cli-token')!
      await expect(handler({}, 'testuser')).rejects.toBe('cli-not-installed')
    })
  })

  describe('github:get-active-account', () => {
    it('returns parsed account from gh auth status stderr', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Active account: true\nuser: testuser',
      })
      mockParseActiveGitHubAccount.mockReturnValueOnce({
        username: 'testuser',
        active: true,
      })

      const handler = handlers.get('github:get-active-account')!
      const result = await handler({})

      expect(mockParseActiveGitHubAccount).toHaveBeenCalledWith(
        'Active account: true\nuser: testuser'
      )
      expect(result).toEqual({ username: 'testuser', active: true })
    })

    it('returns null when gh auth status fails', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('not logged in'))

      const handler = handlers.get('github:get-active-account')!
      const result = await handler({})
      expect(result).toBeNull()
    })
  })

  describe('github:switch-account', () => {
    it('returns success on successful switch', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' })

      const handler = handlers.get('github:switch-account')!
      const result = await handler({}, 'otheruser')

      expect(mockExecAsync).toHaveBeenCalledWith(
        'gh auth switch --user otheruser',
        expect.objectContaining({ encoding: 'utf8', timeout: 5000 })
      )
      expect(result).toEqual({ success: true })
    })

    it('returns failure with error message on switch error', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('account not found'))

      const handler = handlers.get('github:switch-account')!
      const result = await handler({}, 'baduser')
      expect(result).toEqual({ success: false, error: 'account not found' })
    })
  })

  describe('github:get-copilot-quota', () => {
    it('returns error when no token available', async () => {
      // tryGetCliToken returns null when execAsync fails
      mockExecAsync.mockRejectedValueOnce(new Error('no token'))

      const handler = handlers.get('github:get-copilot-quota')!
      const result = await handler({}, 'nouser')
      expect(result).toEqual({ success: false, error: expect.stringContaining('No token') })
    })

    it('returns quota data on success', async () => {
      // First call: tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // Second call: gh api /copilot_internal/user
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ chat_enabled: true }),
        stderr: '',
      })

      const handler = handlers.get('github:get-copilot-quota')!
      const result = await handler({}, 'testuser')
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ chat_enabled: true })
    })
  })

  describe('github:collect-copilot-snapshots', () => {
    it('processes multiple accounts and returns per-account results', async () => {
      // For each account, tryGetCliToken + fetchBillingUsage need mocking
      // assembleCopilotMetrics is already mocked to return {}
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: true,
        data: { org: 'test-org', billingYear: 2026, billingMonth: 5 },
      } as ReturnType<typeof assembleCopilotMetrics>)

      // Mock the exec calls for token + billing
      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [{ username: 'user1', org: 'org1' }])
      expect(result.results).toBeDefined()
      expect(Array.isArray(result.results)).toBe(true)
    })
  })
})
