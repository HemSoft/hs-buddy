import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockMutation = vi.fn()

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app'), getPath: vi.fn(() => '/home/user') },
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = mockQuery
    mutation = mockMutation
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    copilotResults: {
      create: 'copilotResults:create',
      markRunning: 'copilotResults:markRunning',
      complete: 'copilotResults:complete',
      fail: 'copilotResults:fail',
    },
    copilotUsageHistory: { store: 'copilotUsageHistory:store' },
    githubAccounts: { list: 'githubAccounts:list' },
    prReviewRuns: {
      create: 'prReviewRuns:create',
      markRunningByResult: 'prReviewRuns:markRunningByResult',
      completeByResult: 'prReviewRuns:completeByResult',
      failByResult: 'prReviewRuns:failByResult',
    },
  },
}))

vi.mock('../config', () => ({
  CONVEX_URL: 'https://mock.convex.cloud',
}))

const mockSendPrompt = vi.fn()
const mockEnsureClientStarted = vi.fn()
const mockRestartSharedClient = vi.fn()

vi.mock('./copilotClient', () => ({
  ensureClientStarted: (...args: unknown[]) => mockEnsureClientStarted(...args),
  sendPrompt: (...args: unknown[]) => mockSendPrompt(...args),
  restartSharedClient: (...args: unknown[]) => mockRestartSharedClient(...args),
  DEFAULT_MODEL: 'claude-sonnet-4.5',
}))

vi.mock('../utils', () => ({
  execAsync: vi.fn().mockResolvedValue({ stdout: 'user\n' }),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}))

vi.mock('../../src/utils/copilotPromptUtils', () => ({
  hasPRReviewMetadata: vi.fn(() => false),
  mapModelInfo: vi.fn((m: { id: string }) => ({
    id: m.id,
    name: m.id,
    isDisabled: false,
    billingMultiplier: 1,
  })),
  findAccountForOrgs: vi.fn(() => null),
}))

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class MockCopilotClient {
    start = vi.fn()
    stop = vi.fn()
    createSession = vi.fn()
    listModels = vi.fn().mockResolvedValue([{ id: 'model-1' }])
    getState = vi.fn(() => 'connected')
  },
  approveAll: vi.fn(() => () => {}),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => {
    const req = () => {
      throw new Error('not found')
    }
    req.resolve = () => {
      throw new Error('not found')
    }
    return req
  }),
}))

vi.mock('../../src/utils/copilotResponseUtils', () => ({
  extractAssistantContent: vi.fn((text: string) => text),
}))

import { getCopilotService } from './copilotService'

describe('copilotService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutation.mockResolvedValue('result-id-123')
    mockSendPrompt.mockResolvedValue('AI response text')
    mockEnsureClientStarted.mockResolvedValue({
      listModels: vi.fn().mockResolvedValue([{ id: 'model-1' }]),
      getState: () => 'connected',
    })
    mockRestartSharedClient.mockResolvedValue(undefined)
  })

  it('getCopilotService returns a service instance', () => {
    const service = getCopilotService()
    expect(service).toBeDefined()
  })

  it('getCopilotService returns same singleton on multiple calls', () => {
    const a = getCopilotService()
    const b = getCopilotService()
    expect(a).toBe(b)
  })

  describe('executePrompt', () => {
    it('creates a Convex record and dispatches prompt execution', async () => {
      const service = getCopilotService()
      const result = await service.executePrompt({
        prompt: 'Hello world',
        category: 'general',
      })

      expect(result.success).toBe(true)
      expect(result.resultId).toBe('result-id-123')
      expect(mockMutation).toHaveBeenCalledWith('copilotResults:create', {
        prompt: 'Hello world',
        category: 'general',
        metadata: undefined,
      })
    })

    it('tracks active request count during execution', async () => {
      const service = getCopilotService()

      // Make sendPrompt hang indefinitely so the request stays active
      mockSendPrompt.mockImplementation(
        () => new Promise(() => {}) // never resolves
      )

      // Before execution, active count is 0
      expect(service.getActiveCount()).toBe(0)

      // executePrompt returns immediately (fires runPrompt async internally)
      const { resultId } = await service.executePrompt({ prompt: 'test', category: 'general' })

      // While the prompt is in-flight, active count should be exactly 1
      expect(service.getActiveCount()).toBe(1)
      expect(resultId).toBeDefined()

      // Cancel the in-flight prompt
      service.cancelPrompt(resultId)

      // After cancellation, active count returns to 0
      expect(service.getActiveCount()).toBe(0)
    })
  })

  describe('cancelPrompt', () => {
    it('returns false for non-existent request', () => {
      const service = getCopilotService()
      const result = service.cancelPrompt('nonexistent-id')
      expect(result).toBe(false)
    })

    it('returns true and aborts an active request', async () => {
      const service = getCopilotService()
      // Make sendPrompt hang indefinitely
      mockSendPrompt.mockImplementation(
        () => new Promise(() => {}) // never resolves
      )

      const { resultId } = await service.executePrompt({
        prompt: 'long task',
        category: 'general',
      })

      const cancelled = service.cancelPrompt(resultId)
      expect(cancelled).toBe(true)
    })
  })

  describe('getActiveCount', () => {
    it('returns 0 when no prompts are running', () => {
      const service = getCopilotService()
      expect(service.getActiveCount()).toBe(0)
    })
  })

  describe('listModels', () => {
    it('calls ensureClientStarted and returns mapped models', async () => {
      const service = getCopilotService()
      const models = await service.listModels()

      expect(mockEnsureClientStarted).toHaveBeenCalled()
      expect(models).toEqual([
        { id: 'model-1', name: 'model-1', isDisabled: false, billingMultiplier: 1 },
      ])
    })

    it('retries on "not connected" error', async () => {
      const service = getCopilotService()
      mockEnsureClientStarted
        .mockRejectedValueOnce(new Error('not connected'))
        .mockResolvedValueOnce({
          listModels: vi.fn().mockResolvedValue([{ id: 'model-2' }]),
          getState: () => 'connected',
        })

      const models = await service.listModels()

      expect(mockRestartSharedClient).toHaveBeenCalled()
      expect(models).toEqual([
        { id: 'model-2', name: 'model-2', isDisabled: false, billingMultiplier: 1 },
      ])
    })

    it('throws after exhausting retries', async () => {
      const service = getCopilotService()
      mockEnsureClientStarted.mockRejectedValue(new Error('not connected'))

      await expect(service.listModels()).rejects.toThrow('not connected')
    })

    it('switches account before listing if ghAccount provided', async () => {
      const service = getCopilotService()
      await service.listModels('other-user')

      // execAsync called with gh auth switch
      const { execAsync } = await import('../utils')
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('gh auth switch --user other-user'),
        expect.anything()
      )
    })
  })
})
