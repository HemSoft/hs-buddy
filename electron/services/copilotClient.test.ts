import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistSync = vi.fn((_path?: string) => false)
vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/app'), getPath: vi.fn(() => '/home/user') },
}))

const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn().mockResolvedValue(undefined)
const mockCreateSession = vi.fn()
const mockListModels = vi.fn()
const mockGetState = vi.fn(() => 'disconnected')

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class MockCopilotClient {
    start = mockStart
    stop = mockStop
    createSession = mockCreateSession
    listModels = mockListModels
    getState = mockGetState
    constructor(_opts?: unknown) {}
  },
  approveAll: vi.fn(() => () => {}),
}))

vi.mock('node:fs', () => ({
  existsSync: (path: string) => mockExistSync(path),
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

describe('copilotClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockGetState.mockReturnValue('disconnected')
  })

  it('exports DEFAULT_MODEL as a non-empty string', async () => {
    const { DEFAULT_MODEL } = await import('./copilotClient')
    expect(typeof DEFAULT_MODEL).toBe('string')
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0)
  })

  describe('ensureClientStarted', () => {
    it('starts the client when disconnected', async () => {
      const { ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)

      await ensureClientStarted()

      expect(mockStart).toHaveBeenCalledOnce()
    })

    it('returns immediately if already connected', async () => {
      const { ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('connected')

      await ensureClientStarted()

      expect(mockStart).not.toHaveBeenCalled()
    })

    it('serializes concurrent callers to single start', async () => {
      const { ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      let resolveStart: () => void
      mockStart.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveStart = resolve
          })
      )

      const p1 = ensureClientStarted()
      const p2 = ensureClientStarted()

      resolveStart!()
      await Promise.all([p1, p2])

      expect(mockStart).toHaveBeenCalledOnce()
    })
  })

  describe('stopSharedClient', () => {
    it('stops the shared client and cleans up', async () => {
      const { ensureClientStarted, stopSharedClient } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)

      await ensureClientStarted()
      await stopSharedClient()

      expect(mockStop).toHaveBeenCalled()
    })
  })

  describe('restartSharedClient', () => {
    it('stops and recreates the client', async () => {
      const { ensureClientStarted, restartSharedClient } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)

      await ensureClientStarted()
      await restartSharedClient()

      expect(mockStop).toHaveBeenCalled()
    })
  })

  describe('sendPrompt', () => {
    it('creates a session, sends prompt, and destroys session', async () => {
      const { sendPrompt, ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)

      const mockDestroy = vi.fn().mockResolvedValue(undefined)
      const mockSendAndWait = vi.fn().mockResolvedValue('Hello from AI')
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        destroy: mockDestroy,
      })

      await ensureClientStarted()
      mockGetState.mockReturnValue('connected')

      const result = await sendPrompt({ prompt: 'test prompt' })

      expect(mockCreateSession).toHaveBeenCalled()
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'test prompt' }, 120_000)
      expect(mockDestroy).toHaveBeenCalled()
      expect(result).toBe('Hello from AI')
    })

    it('throws if abort signal is already aborted', async () => {
      const { sendPrompt, ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)
      await ensureClientStarted()
      mockGetState.mockReturnValue('connected')

      const controller = new AbortController()
      controller.abort()

      await expect(sendPrompt({ prompt: 'test', signal: controller.signal })).rejects.toThrow(
        'Cancelled'
      )
    })
  })

  describe('sendChatMessage', () => {
    it('builds prompt with context and history', async () => {
      const { sendChatMessage, ensureClientStarted } = await import('./copilotClient')
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)

      const mockDestroy = vi.fn().mockResolvedValue(undefined)
      const mockSendAndWait = vi.fn().mockResolvedValue('Chat response')
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        destroy: mockDestroy,
      })

      await ensureClientStarted()
      mockGetState.mockReturnValue('connected')

      const result = await sendChatMessage({
        message: 'How are you?',
        context: 'You are a helpful assistant.',
        conversationHistory: [{ role: 'user', content: 'Hi' }],
      })

      expect(result).toBe('Chat response')
      const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt
      expect(sentPrompt).toContain('You are a helpful assistant.')
      expect(sentPrompt).toContain('User: Hi')
      expect(sentPrompt).toContain('User: How are you?')
    })
  })

  describe('abortChat', () => {
    it('aborts in-flight chat without error', async () => {
      const { abortChat } = await import('./copilotClient')
      // Should not throw even when nothing is in-flight
      expect(() => abortChat()).not.toThrow()
    })
  })
})
