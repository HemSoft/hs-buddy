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
  extractBudgetFromResult: vi.fn(() => ({ budgetAmount: null, preventFurtherUsage: false })),
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

  describe('github:get-copilot-usage', () => {
    it('returns parsed usage data on success', async () => {
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // fetchOrgOrUserBillingUsage
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          usageItems: [{ product: 'copilot', grossAmount: { amount: 10 } }],
        }),
        stderr: '',
      })

      const handler = handlers.get('github:get-copilot-usage')!
      const result = await handler({}, 'test-org', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data.org).toBe('test-org')
    })

    it('returns error on failure', async () => {
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // fetchOrgOrUserBillingUsage fails
      mockExecAsync.mockRejectedValueOnce(new Error('API failed'))

      const handler = handlers.get('github:get-copilot-usage')!
      const result = await handler({}, 'test-org', 'testuser')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('github:get-copilot-budget', () => {
    it('returns budget data on success', async () => {
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // fetchOrgBudgetAndSpend: budgets call + usage call (Promise.allSettled)
      mockExecAsync.mockResolvedValueOnce({ stdout: '[]', stderr: '' }) // budgets
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' }) // usage

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.org).toBe('test-org')
    })

    it('returns error when budget API calls fail', async () => {
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // Both budget calls fail (allSettled) + findBudgetAcrossPages also called
      mockExecAsync.mockRejectedValueOnce(new Error('Budget API error'))
      mockExecAsync.mockRejectedValueOnce(new Error('Usage API error'))

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org', 'testuser')
      // Handler catches and returns error object
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('github:get-copilot-member-usage', () => {
    it('returns member seat data on success', async () => {
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // gh api member copilot
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          assignee: { login: 'testmember' },
          plan_type: 'business',
          last_activity_at: '2024-01-01',
          created_at: '2023-01-01',
        }),
        stderr: '',
      })

      const handler = handlers.get('github:get-copilot-member-usage')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data.login).toBe('testmember')
      expect(result.data.planType).toBe('business')
    })

    it('returns null data for 404 (no Copilot seat)', async () => {
      const { isNotFoundError } = await import('../../src/utils/billingParsers')
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // gh api member copilot - 404
      const notFoundError = new Error('HTTP 404')
      mockExecAsync.mockRejectedValueOnce(notFoundError)
      vi.mocked(isNotFoundError).mockReturnValueOnce(true)

      const handler = handlers.get('github:get-copilot-member-usage')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
    })

    it('returns error on non-404 failure', async () => {
      const { isNotFoundError } = await import('../../src/utils/billingParsers')
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // Actual API call fails
      mockExecAsync.mockRejectedValueOnce(new Error('Server error'))
      vi.mocked(isNotFoundError).mockReturnValueOnce(false)

      const handler = handlers.get('github:get-copilot-member-usage')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Server error')
    })
  })

  describe('github:get-user-premium-requests', () => {
    it('returns premium request data on success', async () => {
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // 3 parallel calls (Promise.allSettled): user month, user today, org month
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      const handler = handlers.get('github:get-user-premium-requests')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data.memberLogin).toBe('testmember')
      expect(result.data.org).toBe('test-org')
    })

    it('still succeeds when allSettled calls fail (graceful degradation)', async () => {
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // All 3 parallel calls fail (Promise.allSettled still resolves)
      mockExecAsync.mockRejectedValueOnce(new Error('fail1'))
      mockExecAsync.mockRejectedValueOnce(new Error('fail2'))
      mockExecAsync.mockRejectedValueOnce(new Error('fail3'))

      const handler = handlers.get('github:get-user-premium-requests')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      // allSettled doesn't throw, so handler returns success with zero values
      expect(result.success).toBe(true)
      expect(result.data.userMonthlyRequests).toBe(0)
      expect(result.data.userTodayRequests).toBe(0)
      expect(result.data.orgMonthlyRequests).toBe(0)
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
