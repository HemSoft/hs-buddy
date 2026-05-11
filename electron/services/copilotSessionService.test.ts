import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock state ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rlEvents: Record<string, (...args: any[]) => void>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let streamEvents: Record<string, (...args: any[]) => void>

const mockExistsSync = vi.fn((_path: string) => false)
const mockReadFileSync = vi.fn((_path: string, _enc?: string): string => {
  throw new Error('ENOENT')
})
const mockOpenSync = vi.fn((_path: string, _flags: string) => 42)
const mockReadSync = vi.fn(
  (_fd: number, _buf: Buffer, _offset: number, _length: number, _position: number | null) => 0
)
const mockCloseSync = vi.fn((_fd: number): void => {})
const mockReaddirSync = vi.fn((_path: string): string[] => [])
const mockStatSync = vi.fn((_path: string) => ({
  size: 100,
  mtimeMs: 2000000,
  isFile: () => true as const,
}))

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...(args as [string])),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...(args as [string, string])),
  openSync: (...args: unknown[]) => mockOpenSync(...(args as [string, string])),
  readSync: (...args: unknown[]) =>
    mockReadSync(...(args as [number, Buffer, number, number, number | null])),
  closeSync: (...args: unknown[]) => mockCloseSync(...(args as [number])),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...(args as [string])),
  statSync: (...args: unknown[]) => mockStatSync(...(args as [string])),
  createReadStream: vi.fn(() => {
    streamEvents = {}
    return {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        streamEvents[event] = cb
      }),
    }
  }),
}))

vi.mock('readline', () => ({
  createInterface: vi.fn(() => {
    rlEvents = {}
    return {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        rlEvents[event] = cb
      }),
      close: vi.fn(),
    }
  }),
}))

const mockParseScanChunk = vi.fn((_chunk: string) => ({
  title: 'Test Session',
  firstPrompt: 'Hello world',
  agent: 'copilot',
  createdAt: 1000000,
  requestCount: 5,
}))
const mockResolveFolderOrWorkspaceName = vi.fn(
  (_parsed: Record<string, unknown>): string | null => 'test-workspace'
)
const mockProcessSessionLine = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_kind: number, _kp: unknown, _line: string, _state: any): void => {}
)
const mockParseKeyPath = vi.fn((_line: string): string[] | null => null)

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: (...args: unknown[]) => mockParseKeyPath(...(args as [string])),
  resolveFolderOrWorkspaceName: (...args: unknown[]) =>
    mockResolveFolderOrWorkspaceName(...(args as [Record<string, unknown>])),
  parseScanChunk: (...args: unknown[]) => mockParseScanChunk(...(args as [string])),
  processSessionLine: (...args: unknown[]) =>
    mockProcessSessionLine(...(args as [number, unknown, string, unknown])),
}))

const mockAggregateResults = vi.fn((_results: unknown[]) => ({
  totalPromptTokens: 100,
  totalOutputTokens: 200,
  totalToolCalls: 5,
  allToolNames: ['readFile', 'writeFile'],
  totalDurationMs: 30000,
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: (...args: unknown[]) => mockAggregateResults(...(args as [unknown[]])),
  computeSessionDigest: vi.fn(() => ({ totalTokens: 300 })),
}))

import {
  getVSCodeStoragePath,
  resolveWorkspaceName,
  scanCopilotSessions,
  getSessionDetail,
} from './copilotSessionService'

describe('copilotSessionService', () => {
  const originalAppData = process.env.APPDATA

  beforeEach(() => {
    if (originalAppData === undefined) {
      delete process.env.APPDATA
    } else {
      process.env.APPDATA = originalAppData
    }
    vi.resetAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockImplementation((): string => {
      throw new Error('ENOENT')
    })
    mockOpenSync.mockReturnValue(42)
    mockReadSync.mockReturnValue(0)
    mockCloseSync.mockImplementation((): void => {})
    mockReaddirSync.mockReturnValue([])
    mockStatSync.mockReturnValue({ size: 100, mtimeMs: 2000000, isFile: () => true as const })
    mockParseKeyPath.mockReturnValue(null)
    mockResolveFolderOrWorkspaceName.mockReturnValue('test-workspace')
    mockParseScanChunk.mockReturnValue({
      title: 'Test Session',
      firstPrompt: 'Hello world',
      agent: 'copilot',
      createdAt: 1000000,
      requestCount: 5,
    })
    mockProcessSessionLine.mockImplementation((): void => {})
    mockAggregateResults.mockReturnValue({
      totalPromptTokens: 100,
      totalOutputTokens: 200,
      totalToolCalls: 5,
      allToolNames: ['readFile', 'writeFile'],
      totalDurationMs: 30000,
    })
  })

  afterEach(() => {
    if (originalAppData === undefined) {
      delete process.env.APPDATA
    } else {
      process.env.APPDATA = originalAppData
    }
  })

  // ── getVSCodeStoragePath ──────────────────────────────────

  describe('getVSCodeStoragePath', () => {
    it('returns empty string when APPDATA is not set', () => {
      delete process.env.APPDATA
      expect(getVSCodeStoragePath()).toBe('')
    })

    it('returns Insiders path when it exists', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockImplementation((p: string) => p.includes('Code - Insiders'))
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code - Insiders')
      expect(result).toContain('User')
    })

    it('returns stable Code path when Insiders does not exist', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockImplementation(
        (p: string) => p.includes('Code') && !p.includes('Insiders')
      )
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code')
      expect(result).not.toContain('Insiders')
    })

    it('returns empty string when neither Code path exists', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(false)
      expect(getVSCodeStoragePath()).toBe('')
    })
  })

  // ── resolveWorkspaceName ──────────────────────────────────

  describe('resolveWorkspaceName', () => {
    it('returns basename when workspace.json read fails', () => {
      expect(resolveWorkspaceName('/workspaces/abc123')).toBe('abc123')
    })

    it('returns resolved name from workspace.json', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///home/user/my-project' }))
      expect(resolveWorkspaceName('/workspaces/abc123')).toBe('test-workspace')
    })

    it('returns basename when resolveFolderOrWorkspaceName returns null', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///home/user/proj' }))
      mockResolveFolderOrWorkspaceName.mockReturnValueOnce(null)
      expect(resolveWorkspaceName('/workspaces/xyz789')).toBe('xyz789')
    })
  })

  // ── scanCopilotSessions ───────────────────────────────────

  describe('scanCopilotSessions', () => {
    it('returns empty result when storage path is empty', () => {
      delete process.env.APPDATA
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('returns empty result when workspaceStorage dir cannot be read', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('returns empty sessions when chatSessions dir is missing', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      // First readdirSync: workspace hashes
      mockReaddirSync.mockReturnValueOnce(['hash1'])
      // Second readdirSync: chatSessions — throws (not found)
      mockReaddirSync.mockImplementationOnce(() => {
        throw new Error('ENOENT')
      })

      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('skips empty session files (size 0)', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValueOnce(['hash1']).mockReturnValueOnce(['empty.jsonl'])
      mockStatSync.mockReturnValue({ size: 0, mtimeMs: 1000, isFile: () => true as const })
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///proj' }))

      const result = scanCopilotSessions()
      expect(result.sessions).toHaveLength(0)
    })

    it('skips files that fail statSync', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValueOnce(['hash1']).mockReturnValueOnce(['bad.jsonl'])
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///proj' }))

      const result = scanCopilotSessions()
      expect(result.sessions).toHaveLength(0)
    })

    it('scans workspace dirs and returns sorted sessions', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync
        .mockReturnValueOnce(['hash1', 'hash2'])
        .mockReturnValueOnce(['s1.jsonl', 's2.jsonl'])
        .mockReturnValueOnce(['s3.jsonl'])
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///proj' }))

      let callCount = 0
      mockStatSync.mockImplementation(() => {
        callCount++
        return { size: 500, mtimeMs: callCount * 1000, isFile: () => true as const }
      })

      mockOpenSync.mockReturnValue(42)
      mockReadSync.mockImplementation((_fd: number, buf: Buffer) => {
        const data = '{"kind":1}'
        buf.write(data)
        return data.length
      })

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(3)
      expect(result.sessions).toHaveLength(3)
      // Sorted descending by modifiedAt
      expect(result.sessions[0].modifiedAt).toBeGreaterThanOrEqual(result.sessions[1].modifiedAt)
    })

    it('handles extractScanInfo file open failure gracefully', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValueOnce(['hash1']).mockReturnValueOnce(['sess.jsonl'])
      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 5000, isFile: () => true as const })
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///proj' }))
      mockOpenSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(1)
      // Should use fallback scan info
      expect(result.sessions[0].title).toBe('')
    })

    it('handles extractScanInfo zero-byte read', () => {
      process.env.APPDATA = '/Users/test/AppData'
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValueOnce(['hash1']).mockReturnValueOnce(['sess.jsonl'])
      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 5000, isFile: () => true as const })
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///proj' }))
      mockOpenSync.mockReturnValue(10)
      mockReadSync.mockReturnValue(0)

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(1)
      expect(result.sessions[0].title).toBe('')
    })
  })

  // ── getSessionDetail ──────────────────────────────────────

  describe('getSessionDetail', () => {
    it('returns null when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      const result = await getSessionDetail('/nonexistent/session.jsonl')
      expect(result).toBeNull()
    })

    it('returns null when readline emits error', async () => {
      mockExistsSync.mockReturnValue(true)
      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      rlEvents['error']()
      expect(await resultPromise).toBeNull()
    })

    it('returns null when stream emits error', async () => {
      mockExistsSync.mockReturnValue(true)
      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      streamEvents['error']()
      expect(await resultPromise).toBeNull()
    })

    it('returns null when session has no init data after close', async () => {
      mockExistsSync.mockReturnValue(true)
      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      // Feed a non-matching line
      rlEvents['line']('not json at all')
      rlEvents['close']()
      expect(await resultPromise).toBeNull()
    })

    it('skips lines that do not match {"kind":N} pattern', async () => {
      mockExistsSync.mockReturnValue(true)
      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      rlEvents['line']('some random text')
      rlEvents['line']('')
      rlEvents['close']()
      expect(await resultPromise).toBeNull()
      expect(mockProcessSessionLine).not.toHaveBeenCalled()
    })

    it('parses valid kind lines and calls processSessionLine', async () => {
      mockExistsSync.mockReturnValue(true)
      // Make processSessionLine populate init on first call
      mockProcessSessionLine.mockImplementation(
        (_kind: number, _kp: unknown, _line: string, state: { init: unknown }) => {
          if (!state.init) {
            state.init = { sessionId: 'sess-abc', creationDate: '2025-01-01', model: 'gpt-4' }
          }
        }
      )
      mockParseKeyPath.mockReturnValue(['test.key'])

      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      rlEvents['line']('{"kind":1, "data": "test"}')
      rlEvents['close']()

      const result = await resultPromise
      expect(result).not.toBeNull()
      expect(result!.sessionId).toBe('sess-abc')
      expect(result!.model).toBe('gpt-4')
      expect(result!.workspaceHash).toBe('hash')
      expect(mockProcessSessionLine).toHaveBeenCalledWith(
        1,
        ['test.key'],
        expect.any(String),
        expect.any(Object)
      )
    })

    it('builds sorted results with prompts from state', async () => {
      mockExistsSync.mockReturnValue(true)
      let callCount = 0
      mockProcessSessionLine.mockImplementation(
        (
          _kind: number,
          _kp: unknown,
          _line: string,
          state: {
            init: unknown
            resultsByIndex: Map<number, { prompt: string }>
            prompts: Map<number, string>
          }
        ) => {
          callCount++
          if (callCount === 1) {
            state.init = { sessionId: 'sess-xyz', creationDate: '2025-02-01', model: 'claude' }
            state.resultsByIndex.set(0, { prompt: '' } as { prompt: string })
            state.prompts.set(0, 'First prompt')
          }
          if (callCount === 2) {
            state.resultsByIndex.set(1, { prompt: '' } as { prompt: string })
            state.prompts.set(1, 'Second prompt')
          }
        }
      )
      mockParseKeyPath.mockReturnValue(['key'])

      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      rlEvents['line']('{"kind":1}')
      rlEvents['line']('{"kind":2}')
      rlEvents['close']()

      const result = await resultPromise
      expect(result).not.toBeNull()
      expect(result!.results).toHaveLength(2)
      expect(result!.results[0].prompt).toBe('First prompt')
      expect(result!.results[1].prompt).toBe('Second prompt')
      expect(result!.totalPromptTokens).toBe(100)
      expect(result!.totalOutputTokens).toBe(200)
    })

    it('uses sessionId prefix as title when state.title is empty', async () => {
      mockExistsSync.mockReturnValue(true)
      mockProcessSessionLine.mockImplementation(
        (_kind: number, _kp: unknown, _line: string, state: { init: unknown; title: string }) => {
          state.init = { sessionId: 'abcdefgh-1234', creationDate: '2025-01-01', model: 'gpt-4' }
          state.title = ''
        }
      )
      mockParseKeyPath.mockReturnValue(['key'])

      const resultPromise = getSessionDetail('/ws/hash/chatSessions/session.jsonl')
      rlEvents['line']('{"kind":1}')
      rlEvents['close']()

      const result = await resultPromise
      expect(result!.title).toBe('Session abcdefgh')
    })
  })
})
