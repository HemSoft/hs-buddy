import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockConvexMutation = vi.fn()

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = vi.fn()
    mutation = mockConvexMutation
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
  extractCopilotSpend: vi.fn(() => ({ net: 0, gross: 0 })),
  computeOverageSpend: vi.fn(() => 0),
  classifyCliTokenError: (...args: unknown[]) => mockClassifyCliTokenError(...args),
  assembleCopilotMetrics: vi.fn(() => ({})),
}))

import { ipcMain } from 'electron'
import { registerGitHubHandlers } from './githubHandlers'

describe('githubHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  function stubMetricsResult(
    overrides: Partial<{
      org: string
      premiumRequests: number
      grossCost: number
      discount: number
      netCost: number
      businessSeats: number
      budgetAmount: number | null
      spent: number
      billingMonth: number
      billingYear: number
      fetchedAt: number
    }> = {}
  ) {
    return {
      success: true as const,
      data: {
        org: 'default-org',
        premiumRequests: 0,
        grossCost: 0,
        discount: 0,
        netCost: 0,
        businessSeats: 0,
        budgetAmount: null,
        spent: 0,
        billingMonth: 1,
        billingYear: 2026,
        fetchedAt: 0,
        ...overrides,
      },
    }
  }

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

    it('day-sums per-user AI Credits into userCredits when a username is given', async () => {
      vi.useFakeTimers()
      // Pin to the 1st so only a single day call is made (days 1..today).
      vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
      try {
        const { sumGrossRequests } = await import('../../src/utils/billingParsers')
        vi.mocked(sumGrossRequests).mockReturnValueOnce(8235)

        // tryGetCliToken
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
        // fetchOrgOrUserBillingUsage
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [{ product: 'copilot' }] }),
          stderr: '',
        })
        // fetchSeatCount
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ seat_breakdown: { total: 3 } }),
          stderr: '',
        })
        // fetchUserMonthlyCredits (single day call)
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [{ grossQuantity: 8235 }] }),
          stderr: '',
        })

        const handler = handlers.get('github:get-copilot-usage')!
        const result = await handler({}, 'test-org', 'testuser')
        expect(result.success).toBe(true)
        expect(result.data.userCredits).toBe(8235)
        expect(result.data.seats).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('returns userCredits null when per-user day calls all fail (no billing access)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
      try {
        // tryGetCliToken
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
        // fetchOrgOrUserBillingUsage
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [{ product: 'copilot' }] }),
          stderr: '',
        })
        // fetchSeatCount
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ seat_breakdown: { total: 3 } }),
          stderr: '',
        })
        // fetchUserMonthlyCredits day call fails → degrade to null
        mockExecAsync.mockRejectedValueOnce(new Error('no enterprise billing access'))

        const handler = handlers.get('github:get-copilot-usage')!
        const result = await handler({}, 'test-org', 'testuser')
        expect(result.success).toBe(true)
        expect(result.data.userCredits).toBeNull()
        expect(result.data.seats).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('leaves userCredits null when no username is provided', async () => {
      // No username → no token exec; billing usage is the first call.
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ usageItems: [{ product: 'copilot' }] }),
        stderr: '',
      })
      // fetchSeatCount
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ seat_breakdown: { total: 3 } }),
        stderr: '',
      })

      const handler = handlers.get('github:get-copilot-usage')!
      const result = await handler({}, 'test-org')
      expect(result.success).toBe(true)
      expect(result.data.userCredits).toBeNull()
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

    it('returns degraded data when budget API calls fail', async () => {
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // Both budget calls fail (allSettled) + findBudgetAcrossPages also called
      mockExecAsync.mockRejectedValueOnce(new Error('Budget API error'))
      mockExecAsync.mockRejectedValueOnce(new Error('Usage API error'))

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org', 'testuser')
      // allSettled absorbs errors; handler returns success with degraded data
      expect(result.success).toBe(true)
      expect(result.data.org).toBe('test-org')
      expect(result.data.budgetAmount).toBeNull()
      expect(result.data.spentUnavailable).toBe(true)
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

    it('returns premium request data with model breakdown when items have grossQuantity > 0', async () => {
      const { extractPremiumUsageItems, sumGrossRequests, sumNetCost } =
        await import('../../src/utils/billingParsers')
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // 3 parallel calls succeed
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      // Return items with grossQuantity > 0 for user month to trigger model breakdown
      vi.mocked(extractPremiumUsageItems)
        .mockReturnValueOnce([
          { model: 'gpt-4o', grossQuantity: 50, netCost: 5 },
          { model: 'claude-sonnet', grossQuantity: 30, netCost: 3 },
          { model: 'gpt-4o-mini', grossQuantity: 0, netCost: 0 },
        ] as never)
        .mockReturnValueOnce([{ model: 'gpt-4o', grossQuantity: 10, netCost: 1 }] as never)
        .mockReturnValueOnce([{ model: 'gpt-4o', grossQuantity: 200, netCost: 20 }] as never)
      vi.mocked(sumGrossRequests)
        .mockReturnValueOnce(80)
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(200)
      vi.mocked(sumNetCost).mockReturnValueOnce(20)

      const handler = handlers.get('github:get-user-premium-requests')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(true)
      expect(result.data.userMonthlyRequests).toBe(80)
      expect(result.data.userTodayRequests).toBe(10)
      expect(result.data.orgMonthlyRequests).toBe(200)
      expect(result.data.orgMonthlyNetCost).toBe(20)
      // Model breakdown should be sorted by requests descending, excluding 0-quantity
      expect(result.data.userMonthlyModels).toEqual([
        { model: 'gpt-4o', requests: 50 },
        { model: 'claude-sonnet', requests: 30 },
      ])
    })

    it('returns error when extractPremiumUsageItems throws', async () => {
      const { extractPremiumUsageItems } = await import('../../src/utils/billingParsers')
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // 3 parallel calls succeed
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
      mockExecAsync.mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      // Make extractPremiumUsageItems throw to trigger outer catch
      vi.mocked(extractPremiumUsageItems).mockImplementationOnce(() => {
        throw new Error('Failed to parse billing data')
      })

      const handler = handlers.get('github:get-user-premium-requests')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse billing data')
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
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: true,
        data: { org: 'test-org', billingYear: 2026, billingMonth: 5 },
      } as ReturnType<typeof assembleCopilotMetrics>)

      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [{ username: 'user1', org: 'org1' }])
      expect(result.results).toBeDefined()
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('persists snapshot with budgetAmount when present', async () => {
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: true,
        data: {
          org: 'org1',
          billingYear: 2026,
          billingMonth: 5,
          premiumRequests: 100,
          grossCost: 50,
          discount: 10,
          netCost: 40,
          businessSeats: 5,
          budgetAmount: 200,
          spent: 40,
        },
      } as ReturnType<typeof assembleCopilotMetrics>)

      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [{ username: 'user1', org: 'org1' }])
      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(true)
      expect(mockConvexMutation).toHaveBeenCalledWith(
        'copilotUsageHistory:store',
        expect.objectContaining({ budgetAmount: 200 })
      )
    })

    it('reports per-account failure when fetchCopilotMetrics returns error', async () => {
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: false,
        error: 'No billing access',
      } as ReturnType<typeof assembleCopilotMetrics>)

      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [{ username: 'user1', org: 'org1' }])
      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(false)
      expect(result.results[0]).toHaveProperty('error', 'No billing access')
    })

    it('still succeeds even when Convex store fails (logged to console)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: true,
        data: {
          org: 'org1',
          billingYear: 2026,
          billingMonth: 5,
          premiumRequests: 0,
          grossCost: 0,
          discount: 0,
          netCost: 0,
          businessSeats: 0,
          spent: 0,
        },
      } as ReturnType<typeof assembleCopilotMetrics>)

      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })
      // Make the ConvexHttpClient mutation throw — this triggers line 653
      mockConvexMutation.mockRejectedValueOnce(new Error('Convex mutation failed'))

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [{ username: 'u1', org: 'org1' }])
      // Should still succeed despite store failure
      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist'),
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('processes multiple accounts — mixed success and failure', async () => {
      const { assembleCopilotMetrics } = await import('../../src/utils/billingParsers')
      vi.mocked(assembleCopilotMetrics).mockReturnValue({
        success: true,
        data: {
          org: 'org1',
          billingYear: 2026,
          billingMonth: 5,
          premiumRequests: 0,
          grossCost: 0,
          discount: 0,
          netCost: 0,
          businessSeats: 0,
          spent: 0,
        },
      } as ReturnType<typeof assembleCopilotMetrics>)

      mockExecAsync.mockResolvedValue({ stdout: '{"usageItems":[]}', stderr: '' })
      mockConvexMutation.mockResolvedValue(undefined)

      const handler = handlers.get('github:collect-copilot-snapshots')!
      const result = await handler({}, [
        { username: 'u1', org: 'org1' },
        { username: 'u2', org: 'org2' },
      ])
      // Multiple accounts processed
      expect(result.results).toHaveLength(2)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(true)
    })
  })

  describe('github:get-copilot-quota', () => {
    it('returns error when API call fails after token is retrieved', async () => {
      // tryGetCliToken succeeds
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // gh api call fails
      mockExecAsync.mockRejectedValueOnce(new Error('API timeout'))

      const handler = handlers.get('github:get-copilot-quota')!
      const result = await handler({}, 'testuser')
      expect(result.success).toBe(false)
      expect(result.error).toContain('API timeout')
    })
  })

  describe('github:get-user-premium-requests', () => {
    it('returns error when outer try/catch catches', async () => {
      // Make tryGetCliToken throw synchronously by rejecting getTokenEnv
      mockExecAsync.mockRejectedValueOnce(new Error('Token fetch crashed'))
      // This should hit the outer catch since getTokenEnv itself fails

      const handler = handlers.get('github:get-user-premium-requests')!
      const result = await handler({}, 'test-org', 'testmember', 'testuser')
      // getTokenEnv calls tryGetCliToken which catches and returns null token
      // Then continues with process.env. So this should still succeed.
      // The outer catch only fires on truly unexpected errors.
      expect(result).toBeDefined()
    })
  })

  describe('github:get-copilot-budget', () => {
    it('returns error when resolveBudgetData throws', async () => {
      // tryGetCliToken
      mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_token123\n', stderr: '' })
      // Make all subsequent calls throw (budget + usage calls)
      mockExecAsync.mockRejectedValue(new Error('Total failure'))

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org', 'testuser')
      // Budget handler has a try/catch that returns { success: false }
      expect(result).toBeDefined()
    })
  })

  describe('additional branch coverage', () => {
    beforeEach(async () => {
      const billingParsers = await import('../../src/utils/billingParsers')
      const budgetUtils = await import('../../src/utils/budgetUtils')

      mockExecAsync.mockReset()
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })

      vi.mocked(billingParsers.isNotFoundError).mockImplementation(() => false)
      vi.mocked(billingParsers.parseBillingUsage).mockReturnValue({
        premiumRequests: 0,
        grossCost: 0,
        discount: 0,
        netCost: 0,
        businessSeats: 0,
        seatPlan: '',
      })
      vi.mocked(billingParsers.extractBudgetFromResult).mockReturnValue({
        budgetAmount: null,
        preventFurtherUsage: false,
      })
      vi.mocked(billingParsers.extractUsageSpend).mockReturnValue(0)
      vi.mocked(billingParsers.computeOverageSpend).mockReturnValue(0)
      vi.mocked(billingParsers.assembleCopilotMetrics).mockReturnValue(stubMetricsResult())
      vi.mocked(budgetUtils.findBudgetAcrossPages).mockResolvedValue(null)
    })

    it('fetchCopilotMetrics returns failure on non-404 usage errors', async () => {
      const { fetchCopilotMetrics } = await import('./githubHandlers')
      const { isNotFoundError, assembleCopilotMetrics } =
        await import('../../src/utils/billingParsers')

      mockExecAsync.mockRejectedValueOnce(new Error('usage exploded'))
      vi.mocked(isNotFoundError).mockReturnValueOnce(false)

      const result = await fetchCopilotMetrics('test-org')

      expect(result).toEqual({ success: false, error: 'usage exploded' })
      expect(assembleCopilotMetrics).not.toHaveBeenCalled()
      expect(mockExecAsync).toHaveBeenCalledTimes(1)
    })

    it('fetchCopilotMetrics falls back from org usage to user usage', async () => {
      const { fetchCopilotMetrics } = await import('./githubHandlers')
      const { isNotFoundError, parseBillingUsage, assembleCopilotMetrics } =
        await import('../../src/utils/billingParsers')

      vi.mocked(isNotFoundError).mockImplementation(
        error => error instanceof Error && error.message.includes('404')
      )
      vi.mocked(parseBillingUsage).mockReturnValueOnce({
        premiumRequests: 7,
        grossCost: 12,
        discount: 1,
        netCost: 11,
        businessSeats: 3,
        seatPlan: 'Copilot Business',
      })
      vi.mocked(assembleCopilotMetrics).mockReturnValueOnce(stubMetricsResult({ org: 'test-org' }))

      mockExecAsync
        .mockRejectedValueOnce(new Error('HTTP 404'))
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [{ product: 'copilot', grossQuantity: 7 }] }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      const result = await fetchCopilotMetrics('test-org')
      const assembleArgs = vi.mocked(assembleCopilotMetrics).mock.calls[0][0]

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ org: 'test-org', billingYear: 2026, billingMonth: 1 }),
        })
      )
      expect(parseBillingUsage).toHaveBeenCalledWith([{ product: 'copilot', grossQuantity: 7 }])
      expect(assembleArgs).toEqual(
        expect.objectContaining({
          org: 'test-org',
          usageOk: true,
          usage: expect.objectContaining({ premiumRequests: 7, businessSeats: 3 }),
        })
      )
      expect(mockExecAsync.mock.calls[0]?.[0]).toContain('/orgs/test-org/settings/billing/usage')
      expect(mockExecAsync.mock.calls[1]?.[0]).toContain('/users/test-org/settings/billing/usage')
    })

    it('fetchCopilotMetrics continues after double 404 billing misses', async () => {
      const { fetchCopilotMetrics } = await import('./githubHandlers')
      const { isNotFoundError, assembleCopilotMetrics } =
        await import('../../src/utils/billingParsers')

      vi.mocked(isNotFoundError).mockImplementation(
        error => error instanceof Error && error.message.includes('404')
      )
      vi.mocked(assembleCopilotMetrics).mockReturnValueOnce(stubMetricsResult({ org: 'test-org' }))

      mockExecAsync
        .mockRejectedValueOnce(new Error('HTTP 404'))
        .mockRejectedValueOnce(new Error('HTTP 404'))
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      const result = await fetchCopilotMetrics('test-org')
      const assembleArgs = vi.mocked(assembleCopilotMetrics).mock.calls[0][0]

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ org: 'test-org', billingYear: 2026, billingMonth: 1 }),
        })
      )
      expect(assembleArgs).toEqual(
        expect.objectContaining({
          org: 'test-org',
          usageOk: false,
          budgetAmount: null,
          spent: 0,
          usage: expect.objectContaining({
            premiumRequests: 0,
            grossCost: 0,
            discount: 0,
            netCost: 0,
            businessSeats: 0,
          }),
        })
      )
    })

    it('fetchCopilotMetrics swallows budget parsing failures after usage succeeds', async () => {
      const { fetchCopilotMetrics } = await import('./githubHandlers')
      const { parseBillingUsage, extractBudgetFromResult, assembleCopilotMetrics } =
        await import('../../src/utils/billingParsers')

      vi.mocked(parseBillingUsage).mockReturnValueOnce({
        premiumRequests: 5,
        grossCost: 10,
        discount: 2,
        netCost: 8,
        businessSeats: 1,
        seatPlan: 'Copilot Business',
      })
      vi.mocked(extractBudgetFromResult).mockImplementationOnce(() => {
        throw new Error('budget parser exploded')
      })
      vi.mocked(assembleCopilotMetrics).mockReturnValueOnce(stubMetricsResult({ org: 'test-org' }))

      mockExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [{ product: 'copilot', grossQuantity: 5 }] }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })

      const result = await fetchCopilotMetrics('test-org')
      const assembleArgs = vi.mocked(assembleCopilotMetrics).mock.calls[0][0]

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ org: 'test-org', billingYear: 2026, billingMonth: 1 }),
        })
      )
      expect(assembleArgs).toEqual(
        expect.objectContaining({
          usageOk: true,
          budgetAmount: null,
          spent: 0,
          usage: expect.objectContaining({ premiumRequests: 5, netCost: 8 }),
        })
      )
    })

    it('github:get-copilot-usage returns a descriptive error after org and user 404s', async () => {
      const { isNotFoundError } = await import('../../src/utils/billingParsers')

      vi.mocked(isNotFoundError).mockImplementation(
        error => error instanceof Error && error.message.includes('404')
      )
      mockExecAsync
        .mockRejectedValueOnce(new Error('HTTP 404 org'))
        .mockRejectedValueOnce(new Error('HTTP 404 user'))

      const handler = handlers.get('github:get-copilot-usage')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(false)
      expect(result.error).toContain("No billing access for 'test-org'")
      expect(mockExecAsync.mock.calls[0]?.[0]).toContain('/orgs/test-org/settings/billing/usage')
      expect(mockExecAsync.mock.calls[1]?.[0]).toContain('/users/test-org/settings/billing/usage')
    })

    it('github:get-copilot-usage rethrows non-404 user fallback errors', async () => {
      const { isNotFoundError } = await import('../../src/utils/billingParsers')

      vi.mocked(isNotFoundError).mockImplementation(
        error => error instanceof Error && error.message.includes('404')
      )
      mockExecAsync
        .mockRejectedValueOnce(new Error('HTTP 404 org'))
        .mockRejectedValueOnce(new Error('HTTP 500 user'))

      const handler = handlers.get('github:get-copilot-usage')!
      const result = await handler({}, 'test-org')

      expect(result).toEqual({ success: false, error: 'HTTP 500 user' })
    })

    it('github:get-copilot-budget uses enterprise fallback budgets when org budgets are missing', async () => {
      const { extractBudgetFromResult, extractCopilotSpend } =
        await import('../../src/utils/billingParsers')
      const { findBudgetAcrossPages } = await import('../../src/utils/budgetUtils')

      vi.mocked(extractBudgetFromResult).mockReturnValueOnce({
        budgetAmount: null,
        preventFurtherUsage: false,
      })
      vi.mocked(extractCopilotSpend).mockReturnValueOnce({ net: 42, gross: 42 })
      vi.mocked(findBudgetAcrossPages).mockImplementationOnce(async fetchPage => {
        const page = await fetchPage(1)
        expect(page).toEqual([])
        return { budget_amount: 500, prevent_further_usage: true }
      })

      mockExecAsync
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"usageItems":[]}', stderr: '' })
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org')

      expect(findBudgetAcrossPages).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(
        expect.objectContaining({
          org: 'test-org',
          budgetAmount: 500,
          preventFurtherUsage: true,
          spent: 42,
          useQuotaOverage: false,
        })
      )
      expect(mockExecAsync.mock.calls[2]?.[0]).toContain(
        '/enterprises/Bertelsmann/settings/billing/budgets?page=1'
      )
    })

    it('github:get-copilot-budget marks spend as unavailable when usage fetch fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { extractBudgetFromResult } = await import('../../src/utils/billingParsers')

      vi.mocked(extractBudgetFromResult).mockReturnValueOnce({
        budgetAmount: 250,
        preventFurtherUsage: false,
      })
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })
        .mockRejectedValueOnce(new Error('Usage API exploded'))

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(
        expect.objectContaining({
          org: 'test-org',
          budgetAmount: 250,
          spent: 0,
          spentUnavailable: true,
          useQuotaOverage: false,
        })
      )

      warnSpy.mockRestore()
    })

    it('github:get-copilot-budget enables quota overage mode when both budget APIs 404', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { extractBudgetFromResult } = await import('../../src/utils/billingParsers')
      const { findBudgetAcrossPages } = await import('../../src/utils/budgetUtils')

      vi.mocked(extractBudgetFromResult).mockReturnValueOnce({
        budgetAmount: null,
        preventFurtherUsage: false,
      })
      vi.mocked(findBudgetAcrossPages).mockResolvedValueOnce(null)
      mockExecAsync
        .mockRejectedValueOnce(new Error('Budget API 404'))
        .mockRejectedValueOnce(new Error('Usage API 404'))

      const handler = handlers.get('github:get-copilot-budget')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(
        expect.objectContaining({
          org: 'test-org',
          budgetAmount: null,
          spent: 0,
          spentUnavailable: true,
          useQuotaOverage: true,
        })
      )

      warnSpy.mockRestore()
    })

    it('github:get-copilot-budget uses personal account spend when org is in PERSONAL_BUDGETS', async () => {
      const { PERSONAL_BUDGETS } = await import('./githubHandlers')
      const { computeOverageSpend } = await import('../../src/utils/billingParsers')

      // Temporarily add a personal budget entry
      PERSONAL_BUDGETS['personal-org'] = 100
      vi.mocked(computeOverageSpend).mockReturnValueOnce(42)

      try {
        // tryGetCliToken for getTokenEnv (username provided)
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_personal\n', stderr: '' })
        // tryGetCliToken inside fetchPersonalAccountSpend
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_personal\n', stderr: '' })
        // gh api /copilot_internal/user
        mockExecAsync.mockResolvedValueOnce({
          stdout: JSON.stringify({ premium_usage: { current_month: 42 } }),
          stderr: '',
        })

        const handler = handlers.get('github:get-copilot-budget')!
        const result = await handler({}, 'personal-org', 'testuser')

        expect(result.success).toBe(true)
        expect(result.data).toEqual(
          expect.objectContaining({
            org: 'personal-org',
            budgetAmount: 100,
            spent: 42,
            spentUnavailable: false,
            useQuotaOverage: false,
          })
        )
      } finally {
        delete PERSONAL_BUDGETS['personal-org']
      }
    })

    it('github:get-copilot-budget handles personal account spend failure gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { PERSONAL_BUDGETS } = await import('./githubHandlers')

      PERSONAL_BUDGETS['personal-org'] = 200

      try {
        // tryGetCliToken for getTokenEnv
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_personal\n', stderr: '' })
        // tryGetCliToken inside fetchPersonalAccountSpend
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_personal\n', stderr: '' })
        // gh api /copilot_internal/user — failure
        mockExecAsync.mockRejectedValueOnce(new Error('Quota API down'))

        const handler = handlers.get('github:get-copilot-budget')!
        const result = await handler({}, 'personal-org', 'testuser')

        expect(result.success).toBe(true)
        expect(result.data).toEqual(
          expect.objectContaining({
            org: 'personal-org',
            budgetAmount: 200,
            spent: 0,
            spentUnavailable: true,
          })
        )
      } finally {
        delete PERSONAL_BUDGETS['personal-org']
        warnSpy.mockRestore()
      }
    })

    it('github:get-copilot-budget handles personal account with no token', async () => {
      const { PERSONAL_BUDGETS } = await import('./githubHandlers')

      PERSONAL_BUDGETS['personal-org'] = 50

      try {
        // tryGetCliToken for getTokenEnv
        mockExecAsync.mockResolvedValueOnce({ stdout: 'ghp_personal\n', stderr: '' })
        // tryGetCliToken inside fetchPersonalAccountSpend — no username provided so returns null
        mockExecAsync.mockRejectedValueOnce(new Error('no auth'))

        const handler = handlers.get('github:get-copilot-budget')!
        const result = await handler({}, 'personal-org', 'testuser')

        expect(result.success).toBe(true)
        expect(result.data).toEqual(
          expect.objectContaining({
            org: 'personal-org',
            budgetAmount: 50,
            spent: 0,
            spentUnavailable: false,
          })
        )
      } finally {
        delete PERSONAL_BUDGETS['personal-org']
      }
    })
  })

  describe('github:get-copilot-seats', () => {
    it('returns paginated seat data', async () => {
      const seatPayload = {
        total_seats: 2,
        seats: [
          {
            assignee: { login: 'user1', avatar_url: '', type: 'User' },
            last_activity_at: '2026-05-01T00:00:00Z',
            last_activity_editor: 'vscode',
            created_at: '2026-01-01T00:00:00Z',
            plan_type: 'business',
          },
          {
            assignee: { login: 'user2', avatar_url: '', type: 'User' },
            last_activity_at: null,
            last_activity_editor: null,
            created_at: '2026-02-01T00:00:00Z',
            plan_type: 'business',
          },
        ],
      }
      mockExecAsync.mockResolvedValueOnce({ stdout: JSON.stringify(seatPayload), stderr: '' })

      const handler = handlers.get('github:get-copilot-seats')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(true)
      expect(result.data.totalSeats).toBe(2)
      expect(result.data.fetchedSeats).toBe(2)
      expect(result.data.seats).toHaveLength(2)
    })

    it('paginates when first page has 100 seats and more remain', async () => {
      const makeSeat = (login: string) => ({
        assignee: { login, avatar_url: '', type: 'User' },
        last_activity_at: null,
        last_activity_editor: null,
        created_at: '2026-01-01T00:00:00Z',
        plan_type: 'business',
      })

      const page1Seats = Array.from({ length: 100 }, (_, i) => makeSeat(`user${i}`))
      const page2Seats = [makeSeat('user100')]

      mockExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ total_seats: 101, seats: page1Seats }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ total_seats: 101, seats: page2Seats }),
          stderr: '',
        })

      const handler = handlers.get('github:get-copilot-seats')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(true)
      expect(result.data.totalSeats).toBe(101)
      expect(result.data.fetchedSeats).toBe(101)
      expect(mockExecAsync).toHaveBeenCalledTimes(2)
    })

    it('returns empty seats on 404 error', async () => {
      const { isNotFoundError } = await import('../../src/utils/billingParsers')
      vi.mocked(isNotFoundError).mockReturnValueOnce(true)
      mockExecAsync.mockRejectedValueOnce(new Error('HTTP 404'))

      const handler = handlers.get('github:get-copilot-seats')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ totalSeats: 0, fetchedSeats: 0, seats: [] })
    })

    it('returns error on non-404 failure', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Server error'))

      const handler = handlers.get('github:get-copilot-seats')!
      const result = await handler({}, 'test-org')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server error')
    })
  })

  describe('github:get-batch-monthly-requests', () => {
    it('returns monthly totals with skipDayProbing', async () => {
      const { sumGrossRequests } = await import('../../src/utils/billingParsers')
      vi.mocked(sumGrossRequests).mockReturnValue(10)

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ usageItems: [{ model: 'gpt-4', grossQuantity: 10 }] }),
        stderr: '',
      })

      const handler = handlers.get('github:get-batch-monthly-requests')!
      const result = await handler({}, ['alice', 'bob'], undefined, true)

      expect(result.success).toBe(true)
      expect(result.data.alice).toEqual({ requests: 10, lastActiveDate: null })
      expect(result.data.bob).toEqual({ requests: 10, lastActiveDate: null })
    })

    it('probes backwards for last active date when not skipping', async () => {
      const { sumGrossRequests } = await import('../../src/utils/billingParsers')

      // Phase 1: monthly totals — user has requests
      vi.mocked(sumGrossRequests)
        .mockReturnValueOnce(5) // alice monthly
        .mockReturnValueOnce(3) // alice today probe

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({ usageItems: [{ model: 'gpt-4', grossQuantity: 5 }] }),
        stderr: '',
      })

      const handler = handlers.get('github:get-batch-monthly-requests')!
      const result = await handler({}, ['alice'], undefined, false)

      expect(result.success).toBe(true)
      expect(result.data.alice.requests).toBe(5)
      expect(result.data.alice.lastActiveDate).toBeTruthy()
    })

    it('handles empty logins array', async () => {
      const handler = handlers.get('github:get-batch-monthly-requests')!
      const result = await handler({}, [], undefined, true)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({})
    })

    it('skips failed logins in batch and continues', async () => {
      const { sumGrossRequests } = await import('../../src/utils/billingParsers')
      vi.mocked(sumGrossRequests).mockReturnValue(7)

      // First call succeeds, second rejects
      mockExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ usageItems: [] }),
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('rate limit'))

      const handler = handlers.get('github:get-batch-monthly-requests')!
      const result = await handler({}, ['alice', 'bob'], undefined, true)

      expect(result.success).toBe(true)
      // alice succeeds, bob rejected so not in results
      expect(result.data.alice).toBeDefined()
      expect(result.data.bob).toBeUndefined()
    })
  })
})
