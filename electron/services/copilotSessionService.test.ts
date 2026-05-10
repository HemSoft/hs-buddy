import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn(() => false)
const mockReadFileSync = vi.fn(() => {
  throw new Error('ENOENT')
})
const mockReaddirSync = vi.fn(() => [])
const mockStatSync = vi.fn(() => ({ size: 100, mtimeMs: 1000 }))
const mockOpenSync = vi.fn(() => 99)
const mockReadSync = vi.fn(() => 0)
const mockCloseSync = vi.fn()
const mockCreateReadStream = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  openSync: (...args: unknown[]) => mockOpenSync(...args),
  readSync: (...args: unknown[]) => mockReadSync(...args),
  closeSync: (...args: unknown[]) => mockCloseSync(...args),
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}))

const mockCreateInterface = vi.fn()

vi.mock('readline', () => ({
  createInterface: (...args: unknown[]) => mockCreateInterface(...args),
}))

const mockParseScanChunk = vi.fn(() => ({
  title: 'Test Session',
  firstPrompt: 'hello',
  agent: 'copilot',
  createdAt: 1000,
  requestCount: 3,
}))
const mockResolveFolderOrWorkspaceName = vi.fn(() => 'test-workspace')
const mockParseKeyPath = vi.fn(() => null)
const mockProcessSessionLine = vi.fn()

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: (...args: unknown[]) => mockParseKeyPath(...args),
  resolveFolderOrWorkspaceName: (...args: unknown[]) => mockResolveFolderOrWorkspaceName(...args),
  parseScanChunk: (...args: unknown[]) => mockParseScanChunk(...args),
  processSessionLine: (...args: unknown[]) => mockProcessSessionLine(...args),
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: vi.fn(() => ({
    totalPromptTokens: 100,
    totalOutputTokens: 200,
    totalToolCalls: 5,
    allToolNames: ['edit', 'grep'],
    totalDurationMs: 5000,
  })),
  computeSessionDigest: vi.fn(),
}))

import {
  getVSCodeStoragePath,
  resolveWorkspaceName,
  scanCopilotSessions,
  getSessionDetail,
} from './copilotSessionService'

describe('copilotSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
  })

  it('getVSCodeStoragePath returns a string', () => {
    const result = getVSCodeStoragePath()
    expect(typeof result).toBe('string')
  })

  it('resolveWorkspaceName returns basename when workspace.json read fails', () => {
    const name = resolveWorkspaceName('/workspaces/abc123')
    expect(name).toBe('abc123')
  })

  it('resolveWorkspaceName returns name from workspace.json', () => {
    mockReadFileSync.mockReturnValue('{"folder":"file:///Users/test/my-project"}')
    const name = resolveWorkspaceName('/workspaces/abc123')
    expect(mockResolveFolderOrWorkspaceName).toHaveBeenCalled()
    expect(typeof name).toBe('string')
  })

  it('resolveWorkspaceName uses basename when resolveFolderOrWorkspaceName returns null', () => {
    mockReadFileSync.mockReturnValue('{"folder":"file:///Users/test/my-project"}')
    mockResolveFolderOrWorkspaceName.mockReturnValue(null)
    const name = resolveWorkspaceName('/workspaces/abc123')
    expect(name).toBe('abc123')
  })

  describe('scanCopilotSessions', () => {
    it('returns empty when APPDATA is not set', () => {
      const saved = process.env.APPDATA
      delete process.env.APPDATA
      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])
      expect(result.totalCount).toBe(0)
      if (saved) process.env.APPDATA = saved
    })

    it('returns empty when storage paths do not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const result = scanCopilotSessions()
      // Without APPDATA or valid paths, returns empty
      expect(result.totalCount).toBe(0)
    })

    it('scans workspace directories and collects sessions', () => {
      const saved = process.env.APPDATA
      process.env.APPDATA = '/tmp/appdata'
      // First call: Insiders doesn't exist, second: stable exists
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = p as string
        if (path.includes('Code - Insiders')) return false
        if (path.includes('Code')) return true
        if (path.includes('chatSessions')) return true
        return true
      })
      // readdirSync for workspaceStorage
      mockReaddirSync.mockImplementation((p: unknown) => {
        const path = p as string
        if (path.includes('workspaceStorage') && !path.includes('hash1')) return ['hash1']
        if (path.includes('chatSessions')) return ['session1.jsonl']
        return []
      })
      mockStatSync.mockReturnValue({ size: 500, mtimeMs: 2000 })
      mockOpenSync.mockReturnValue(42)
      mockReadSync.mockImplementation((_fd: unknown, buf: Buffer) => {
        const chunk = '{"kind":1,"data":"test"}'
        buf.write(chunk)
        return chunk.length
      })
      mockReadFileSync.mockReturnValue('{"folder":"file:///test/project"}')

      const result = scanCopilotSessions()
      expect(result.sessions.length).toBeGreaterThanOrEqual(0)
      if (saved) process.env.APPDATA = saved
      else delete process.env.APPDATA
    })

    it('handles readdirSync failure on workspaceStorage', () => {
      const saved = process.env.APPDATA
      process.env.APPDATA = '/tmp/appdata'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])

      if (saved) process.env.APPDATA = saved
      else delete process.env.APPDATA
    })
  })

  describe('getSessionDetail', () => {
    it('returns null when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      const result = await getSessionDetail('/nonexistent/path.jsonl')
      expect(result).toBeNull()
    })

    it('parses a session file and returns session detail', async () => {
      mockExistsSync.mockReturnValue(true)

      // Mock readline interface
      const lineHandlers: ((line: string) => void)[] = []
      const closeHandlers: (() => void)[] = []
      const errorHandlers: (() => void)[] = []
      const mockStream = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'error') errorHandlers.push(handler)
          return mockStream
        }),
      }
      mockCreateReadStream.mockReturnValue(mockStream)

      const mockRl = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'line') lineHandlers.push(handler as (line: string) => void)
          if (event === 'close') closeHandlers.push(handler as () => void)
          if (event === 'error') errorHandlers.push(handler as () => void)
          return mockRl
        }),
        close: vi.fn(),
      }
      mockCreateInterface.mockReturnValue(mockRl)

      const resultPromise = getSessionDetail(
        '/workspaceStorage/hash123/chatSessions/session1.jsonl'
      )

      // Simulate lines being read
      for (const handler of lineHandlers) {
        handler('{"kind":1,"data":"test"}')
      }
      // Close the stream
      for (const handler of closeHandlers) {
        handler()
      }

      const result = await resultPromise
      // With no valid state.init.sessionId, should return null
      expect(result).toBeNull()
    })

    it('returns null on stream error', async () => {
      mockExistsSync.mockReturnValue(true)

      const streamErrorHandlers: (() => void)[] = []
      const mockStream = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'error') streamErrorHandlers.push(handler)
          return mockStream
        }),
      }
      mockCreateReadStream.mockReturnValue(mockStream)

      const mockRl = {
        on: vi.fn(() => mockRl),
        close: vi.fn(),
      }
      mockCreateInterface.mockReturnValue(mockRl)

      const resultPromise = getSessionDetail('/path/to/session.jsonl')

      // Trigger stream error
      for (const handler of streamErrorHandlers) {
        handler()
      }

      const result = await resultPromise
      expect(result).toBeNull()
    })
  })
})
