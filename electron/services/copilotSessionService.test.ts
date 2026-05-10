import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockExistsSync = vi.fn((_p: string): boolean => false)
const mockReadFileSync = vi.fn((_p: string): string => {
  throw new Error('ENOENT')
})
const mockOpenSync = vi.fn((_p: string): number => 3)
const mockReadSync = vi.fn(
  (_fd: number, _buf: Buffer, _off: number, _len: number, _pos: number | null): number => 0
)
const mockCloseSync = vi.fn((_fd: number): void => {})
const mockReaddirSync = vi.fn((_dir: string): string[] => [])
const mockStatSync = vi.fn((_p: string) => ({ size: 100, mtimeMs: Date.now() }))

vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
  readFileSync: (p: string) => mockReadFileSync(p),
  openSync: (p: string) => mockOpenSync(p),
  readSync: (fd: number, buf: Buffer, off: number, len: number, pos: number | null) =>
    mockReadSync(fd, buf, off, len, pos),
  closeSync: (fd: number) => mockCloseSync(fd),
  readdirSync: (dir: string) => mockReaddirSync(dir),
  statSync: (p: string) => mockStatSync(p),
  createReadStream: vi.fn(() => {
    const emitter = new EventEmitter()
    setTimeout(() => emitter.emit('end'), 0)
    return emitter
  }),
}))

const mockCreateInterface = vi.fn()
vi.mock('readline', () => ({
  createInterface: (...args: unknown[]) => mockCreateInterface(...args),
}))

const mockParseScanChunk = vi.fn(
  (
    _chunk: Buffer,
    _size: number
  ): {
    title: string
    firstPrompt: string
    agent: string
    createdAt: number
    requestCount: number
  } => ({
    title: 'Test Title',
    firstPrompt: 'What is X?',
    agent: 'copilot',
    createdAt: 1000,
    requestCount: 2,
  })
)
const mockResolveFolderOrWorkspaceName = vi.fn((_p: string): string | null => 'test-workspace')
const mockParseKeyPath = vi.fn((_p: string): string[] => [])
const mockProcessSessionLine = vi.fn(
  (_kind: number, _keyPath: string[], _line: string, _state: Record<string, unknown>): void => {}
)

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: (p: string) => mockParseKeyPath(p),
  resolveFolderOrWorkspaceName: (p: string) => mockResolveFolderOrWorkspaceName(p),
  parseScanChunk: (chunk: Buffer, size: number) => mockParseScanChunk(chunk, size),
  processSessionLine: (
    kind: number,
    keyPath: string[],
    line: string,
    state: Record<string, unknown>
  ) => mockProcessSessionLine(kind, keyPath, line, state),
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: vi.fn(() => ({
    totalPromptTokens: 100,
    totalOutputTokens: 200,
    totalToolCalls: 5,
    allToolNames: ['read_file'],
    totalDurationMs: 3000,
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
    vi.resetAllMocks()
    mockExistsSync.mockReturnValue(false)
  })

  describe('getVSCodeStoragePath', () => {
    it('returns empty string when APPDATA is not set', () => {
      const original = process.env.APPDATA
      delete process.env.APPDATA
      const result = getVSCodeStoragePath()
      expect(result).toBe('')
      process.env.APPDATA = original
    })

    it('returns Insiders path when it exists', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('Code - Insiders'))
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code - Insiders')
    })

    it('returns stable path when Insiders does not exist', () => {
      mockExistsSync.mockImplementation(
        (p: string) => p.includes('Code') && !p.includes('Insiders')
      )
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code')
      expect(result).not.toContain('Insiders')
    })

    it('returns empty string when no VS Code path exists', () => {
      mockExistsSync.mockReturnValue(false)
      const result = getVSCodeStoragePath()
      expect(typeof result).toBe('string')
    })
  })

  describe('resolveWorkspaceName', () => {
    it('returns basename when workspace.json read fails', () => {
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('abc123')
    })

    it('returns resolved name when workspace.json is valid', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///my-project' }))
      mockResolveFolderOrWorkspaceName.mockReturnValue('my-project')
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('my-project')
    })

    it('returns basename when resolveFolderOrWorkspaceName returns null', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('abc123')
    })
  })

  describe('scanCopilotSessions', () => {
    it('returns empty when storage path is empty', () => {
      const original = process.env.APPDATA
      delete process.env.APPDATA
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
      process.env.APPDATA = original
    })

    it('returns empty when workspaceStorage dir cannot be read', () => {
      // Make getVSCodeStoragePath return a path
      mockExistsSync.mockReturnValue(true)
      // But readdirSync for workspaceStorage throws
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('returns sessions from workspace directories', () => {
      mockExistsSync.mockReturnValue(true)
      // readdirSync for workspaceStorage returns workspace hashes
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['session1.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///project' }))
      mockResolveFolderOrWorkspaceName.mockReturnValue('project')
      // For extractScanInfo
      mockOpenSync.mockReturnValue(3)
      mockReadSync.mockReturnValue(10)
      mockStatSync.mockReturnValue({ size: 500, mtimeMs: 1000 })

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(1)
      expect(result.sessions[0].sessionId).toBe('session1')
      expect(result.sessions[0].workspaceName).toBe('project')
    })

    it('skips workspace when chatSessions dir does not exist', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        throw new Error('ENOENT')
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)

      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])
    })

    it('skips empty session files', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['empty.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      mockStatSync.mockReturnValue({ size: 0, mtimeMs: 1000 })

      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])
    })

    it('handles stat error gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['bad.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      mockStatSync.mockImplementation(() => {
        throw new Error('EPERM')
      })

      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])
    })

    it('sorts sessions by modifiedAt descending', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['old.jsonl', 'new.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      mockOpenSync.mockReturnValue(3)
      mockReadSync.mockReturnValue(10)

      let callCount = 0
      mockStatSync.mockImplementation(() => {
        callCount++
        return { size: 100, mtimeMs: callCount === 1 ? 1000 : 2000 }
      })

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(2)
      expect(result.sessions[0].modifiedAt).toBeGreaterThan(result.sessions[1].modifiedAt)
    })
  })

  describe('extractScanInfo (via scanCopilotSessions)', () => {
    it('handles file open error gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['test.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 1000 })
      mockOpenSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const result = scanCopilotSessions()
      // Should still return session with fallback scan info
      expect(result.totalCount).toBe(1)
      expect(result.sessions[0].title).toBe('')
    })

    it('handles zero bytes read', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir.includes('workspaceStorage') && !dir.includes('chatSessions')) return ['hash1']
        if (dir.includes('chatSessions')) return ['test.jsonl']
        return []
      })
      mockReadFileSync.mockReturnValue(JSON.stringify({}))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 1000 })
      mockOpenSync.mockReturnValue(3)
      mockReadSync.mockReturnValue(0)

      const result = scanCopilotSessions()
      expect(result.totalCount).toBe(1)
      expect(result.sessions[0].title).toBe('')
    })
  })

  describe('getSessionDetail', () => {
    it('returns null when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      const result = await getSessionDetail('/nonexistent/file.jsonl')
      expect(result).toBeNull()
    })

    it('returns null on stream error', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = Object.assign(new EventEmitter(), { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rlEmitter)

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')

      // Emit stream error
      streamEmitter.emit('error', new Error('read error'))

      const result = await promise
      expect(result).toBeNull()
    })

    it('returns null on readline error', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')

      // Emit readline error
      rlEmitter.emit('error', new Error('parse error'))

      const result = await promise
      expect(result).toBeNull()
    })

    it('returns null when state has no init sessionId', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')

      // Close without any lines — state.init will be null
      rlEmitter.emit('close')

      const result = await promise
      expect(result).toBeNull()
    })

    it('parses JSONL lines and builds session', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      // Make processSessionLine populate state
      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          if (!state.init) {
            state.init = {
              sessionId: 'sess-123',
              creationDate: 1000,
              model: 'gpt-4',
            }
            state.title = 'Test Session'
          }
        }
      )

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')

      // Emit lines
      rlEmitter.emit('line', '{"kind":1,"data":"init"}')
      rlEmitter.emit('line', 'invalid line without kind')
      rlEmitter.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.sessionId).toBe('sess-123')
      expect(result!.title).toBe('Test Session')
      expect(result!.workspaceHash).toBe('hash1')
      expect(mockParseKeyPath).toHaveBeenCalled()
      expect(mockProcessSessionLine).toHaveBeenCalled()
    })

    it('uses fallback title when state.title is empty', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          if (!state.init) {
            state.init = {
              sessionId: 'abcd1234-rest',
              creationDate: 1000,
              model: 'gpt-4',
            }
            state.title = ''
          }
        }
      )

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')
      rlEmitter.emit('line', '{"kind":1}')
      rlEmitter.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Session abcd1234')
    })

    it('sorts results by index', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          if (!state.init) {
            state.init = { sessionId: 'sess-1', creationDate: 1000, model: 'gpt-4' }
            state.title = 'Multi-request'
            const resultsByIndex = state.resultsByIndex as Map<number, { prompt: string }>
            resultsByIndex.set(2, { prompt: '' })
            resultsByIndex.set(0, { prompt: '' })
            resultsByIndex.set(1, { prompt: '' })
            const prompts = state.prompts as Map<number, string>
            prompts.set(0, 'first')
            prompts.set(1, 'second')
            prompts.set(2, 'third')
          }
        }
      )

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test.jsonl')
      rlEmitter.emit('line', '{"kind":1}')
      rlEmitter.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.requestCount).toBe(3)
      expect(result!.results[0].prompt).toBe('first')
      expect(result!.results[1].prompt).toBe('second')
      expect(result!.results[2].prompt).toBe('third')
    })

    it('uses empty string when prompt map has no entry for a result index', async () => {
      mockExistsSync.mockReturnValue(true)
      const { createReadStream } = await import('fs')
      const streamEmitter = new EventEmitter()
      vi.mocked(createReadStream).mockReturnValue(streamEmitter as never)
      const rlEmitter = new EventEmitter()
      mockCreateInterface.mockReturnValue(rlEmitter)

      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          if (!state.init) {
            state.init = { sessionId: 'sess-2', creationDate: 2000, model: 'gpt-4' }
            state.title = 'Missing prompt'
            const resultsByIndex = state.resultsByIndex as Map<number, { prompt: string }>
            resultsByIndex.set(0, { prompt: '' })
            resultsByIndex.set(1, { prompt: '' })
            // Only set prompt for index 0, leave index 1 without a prompt
            const prompts = state.prompts as Map<number, string>
            prompts.set(0, 'has prompt')
            // index 1 has no prompt entry → should fall back to ''
          }
        }
      )

      const promise = getSessionDetail('/workspace/hash1/chatSessions/test2.jsonl')
      rlEmitter.emit('line', '{"kind":1}')
      rlEmitter.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.results[0].prompt).toBe('has prompt')
      expect(result!.results[1].prompt).toBe('')
    })
  })
})
