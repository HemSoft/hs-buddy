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

  async function mockRequireResolution(resolvePath?: string): Promise<void> {
    const { createRequire } = await import('node:module')
    vi.mocked(createRequire).mockImplementation(() => {
      const req = Object.assign(
        () => {
          throw new Error('not found')
        },
        {
          resolve: () => {
            if (!resolvePath) throw new Error('not found')
            return resolvePath
          },
        }
      )
      return req as never
    })
  }

  function overridePlatform(platform: NodeJS.Platform): () => void {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: platform })
    return () => {
      if (original) Object.defineProperty(process, 'platform', original)
    }
  }

  describe('resolveCopilotCliPath', () => {
    it('uses the require-resolved native cli path when available', async () => {
      const path = await import('node:path')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const platformPkg = `copilot-${process.platform}-${process.arch}`
      const binaryName = process.platform === 'win32' ? 'copilot.exe' : 'copilot'
      const pkgJsonPath = path.join('/resolved', 'node_modules', '@github', platformPkg, 'package.json')
      const cliPath = path.join(path.dirname(pkgJsonPath), binaryName)

      mockStart.mockResolvedValue(undefined)
      await mockRequireResolution(pkgJsonPath)
      mockExistSync.mockImplementation((candidate?: string) => candidate === cliPath)

      try {
        const { ensureClientStarted } = await import('./copilotClient')
        await ensureClientStarted()

        expect(consoleSpy).toHaveBeenCalledWith(
          `[CopilotClient] Using native CLI (require.resolve): ${cliPath}`
        )
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('uses the filesystem cli path when require resolution fails', async () => {
      const path = await import('node:path')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const platformPkg = `copilot-${process.platform}-${process.arch}`
      const binaryName = process.platform === 'win32' ? 'copilot.exe' : 'copilot'
      const cliPath = path.join('/app.unpacked', 'node_modules', '@github', platformPkg, binaryName)

      mockStart.mockResolvedValue(undefined)
      await mockRequireResolution()
      mockExistSync.mockImplementation((candidate?: string) => candidate === cliPath)

      try {
        const { ensureClientStarted } = await import('./copilotClient')
        await ensureClientStarted()

        expect(consoleSpy).toHaveBeenCalledWith(
          `[CopilotClient] Using native CLI (filesystem): ${cliPath}`
        )
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('falls back to copilot on non-win32 platforms', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const restorePlatform = overridePlatform('linux')

      mockStart.mockResolvedValue(undefined)
      await mockRequireResolution()
      mockExistSync.mockImplementation(() => false)

      try {
        const { ensureClientStarted } = await import('./copilotClient')
        await ensureClientStarted()

        expect(consoleSpy).toHaveBeenCalledWith(
          '[CopilotClient] Native binary not found, falling back to PATH: copilot'
        )
      } finally {
        restorePlatform()
        consoleSpy.mockRestore()
      }
    })
  })

  describe('additional ensureClientStarted coverage', () => {
    it('throws when starting the shared client times out', async () => {
      vi.useFakeTimers()
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockImplementation(() => new Promise(() => {}))
      await mockRequireResolution()
      mockExistSync.mockImplementation(() => false)

      try {
        const { ensureClientStarted } = await import('./copilotClient')
        const startPromise = ensureClientStarted()
        const rejection = expect(startPromise).rejects.toThrow('Timeout starting Copilot client')

        await vi.advanceTimersByTimeAsync(30_000)

        await rejection
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('additional stopSharedClient coverage', () => {
    it('does nothing when no shared client exists', async () => {
      mockStop.mockResolvedValue(undefined)
      const { stopSharedClient } = await import('./copilotClient')

      await expect(stopSharedClient()).resolves.toBeUndefined()
      expect(mockStop).not.toHaveBeenCalled()
    })
  })

  describe('additional sendPrompt coverage', () => {
    it('creates, starts, and stops a temporary client when cwd is provided', async () => {
      mockStart.mockResolvedValue(undefined)
      mockStop.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      const mockDestroy = vi.fn().mockResolvedValue(undefined)
      const mockSendAndWait = vi.fn().mockResolvedValue('Scoped response')
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        destroy: mockDestroy,
      })

      const { sendPrompt } = await import('./copilotClient')
      const result = await sendPrompt({ prompt: 'test prompt', cwd: '/some/dir' })

      expect(result).toBe('Scoped response')
      expect(mockGetState).not.toHaveBeenCalled()
      expect(mockStart).toHaveBeenCalledOnce()
      expect(mockCreateSession).toHaveBeenCalledOnce()
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'test prompt' }, 120_000)
      expect(mockDestroy).toHaveBeenCalledOnce()
      expect(mockStop).toHaveBeenCalledOnce()
    })

    it('rejects when a temporary client start times out', async () => {
      vi.useFakeTimers()
      mockStart.mockImplementation(() => new Promise(() => {}))
      mockStop.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      try {
        const { sendPrompt } = await import('./copilotClient')
        const sendPromise = sendPrompt({ prompt: 'test prompt', cwd: '/some/dir' })
        const rejection = expect(sendPromise).rejects.toThrow('Timeout starting Copilot client')

        await vi.advanceTimersByTimeAsync(30_000)

        await rejection
        expect(mockCreateSession).not.toHaveBeenCalled()
        expect(mockStop).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    })

    it('throws if the signal is aborted after session creation', async () => {
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      const controller = new AbortController()
      const mockDestroy = vi.fn().mockResolvedValue(undefined)
      const mockSendAndWait = vi.fn().mockResolvedValue('Should not be returned')
      mockCreateSession.mockImplementation(async () => {
        controller.abort()
        return {
          sendAndWait: mockSendAndWait,
          destroy: mockDestroy,
        }
      })

      const { sendPrompt } = await import('./copilotClient')

      await expect(sendPrompt({ prompt: 'test prompt', signal: controller.signal })).rejects.toThrow(
        'Cancelled after session creation'
      )
      expect(mockSendAndWait).not.toHaveBeenCalled()
      expect(mockDestroy).toHaveBeenCalledOnce()
    })

    it('swallows session destruction errors', async () => {
      mockGetState.mockReturnValue('disconnected')
      mockStart.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      const mockDestroy = vi.fn().mockRejectedValue(new Error('destroy failed'))
      const mockSendAndWait = vi.fn().mockResolvedValue('Hello despite cleanup failure')
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        destroy: mockDestroy,
      })

      const { sendPrompt } = await import('./copilotClient')

      await expect(sendPrompt({ prompt: 'test prompt' })).resolves.toBe(
        'Hello despite cleanup failure'
      )
      expect(mockDestroy).toHaveBeenCalledOnce()
    })
  })

  describe('additional sendChatMessage coverage', () => {
    it('aborts the previous chat request when called again', async () => {
      mockGetState.mockReturnValue('connected')
      mockStart.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      const firstDestroy = vi.fn().mockResolvedValue(undefined)
      const firstSendAndWait = vi.fn().mockResolvedValue('first response')
      const secondDestroy = vi.fn().mockResolvedValue(undefined)
      const secondSendAndWait = vi.fn().mockResolvedValue('second response')
      let resolveFirstSession: (session: {
        sendAndWait: typeof firstSendAndWait
        destroy: typeof firstDestroy
      }) => void

      mockCreateSession
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              resolveFirstSession = resolve
            })
        )
        .mockResolvedValueOnce({
          sendAndWait: secondSendAndWait,
          destroy: secondDestroy,
        })

      const { sendChatMessage } = await import('./copilotClient')
      const firstPromise = sendChatMessage({
        message: 'First question',
        context: 'Context',
        conversationHistory: [{ role: 'user', content: 'Earlier message' }],
      })

      await Promise.resolve()
      await Promise.resolve()

      const secondPromise = sendChatMessage({
        message: 'Second question',
        context: 'Context',
        conversationHistory: [],
      })

      resolveFirstSession!({
        sendAndWait: firstSendAndWait,
        destroy: firstDestroy,
      })

      await expect(firstPromise).rejects.toThrow('Cancelled after session creation')
      await expect(secondPromise).resolves.toBe('second response')
      expect(firstSendAndWait).not.toHaveBeenCalled()
      expect(firstDestroy).toHaveBeenCalledOnce()
      expect(secondSendAndWait).toHaveBeenCalledOnce()
    })

    it('omits conversation history text when history is empty', async () => {
      mockGetState.mockReturnValue('connected')
      mockStart.mockResolvedValue(undefined)
      mockExistSync.mockImplementation(() => false)
      await mockRequireResolution()

      const mockDestroy = vi.fn().mockResolvedValue(undefined)
      const mockSendAndWait = vi.fn().mockResolvedValue('Chat response')
      mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        destroy: mockDestroy,
      })

      const { sendChatMessage } = await import('./copilotClient')
      await sendChatMessage({
        message: 'Hello',
        context: 'Context',
        conversationHistory: [],
      })

      const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt
      expect(sentPrompt).not.toContain('Previous conversation:')
      expect(sentPrompt).toContain('User: Hello')
    })
  })
})
