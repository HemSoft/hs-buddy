import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockExistsSync = vi.fn((_p: string) => false)
const mockReadFileSync = vi.fn((_p: string, _enc?: string): string => {
  throw new Error('ENOENT')
})
const mockReaddirSync = vi.fn((_p: string): string[] => [])
const mockStatSync = vi.fn((_p: string) => ({ size: 1024, mtimeMs: Date.now() }))
const mockOpenSync = vi.fn((_p: string, _flags?: string) => 42)
const mockReadSync = vi.fn(
  (_fd: number, _buf: Buffer, _off: number, _len: number, _pos: number | null) => 0
)
const mockCloseSync = vi.fn((_fd: number): void => {})

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...(args as [string])),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...(args as [string, string])),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...(args as [string])),
  statSync: (...args: unknown[]) => mockStatSync(...(args as [string])),
  openSync: (...args: unknown[]) => mockOpenSync(...(args as [string, string])),
  readSync: (...args: unknown[]) =>
    mockReadSync(...(args as [number, Buffer, number, number, number])),
  closeSync: (...args: unknown[]) => mockCloseSync(...(args as [number])),
  createReadStream: vi.fn(),
}))

const mockCreateInterface = vi.fn()
vi.mock('readline', () => ({
  createInterface: (...args: unknown[]) => mockCreateInterface(...args),
}))

const mockParseScanChunk = vi.fn((..._args: unknown[]) => ({
  title: 'Test Session',
  firstPrompt: 'Hello',
  agent: 'copilot',
  createdAt: 1000,
  requestCount: 5,
}))
const mockResolveFolderOrWorkspaceName = vi.fn(
  (..._args: unknown[]): string | null => 'test-workspace'
)
const mockParseKeyPath = vi.fn((..._args: unknown[]) => null)
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
    totalOutputTokens: 50,
    totalToolCalls: 3,
    allToolNames: ['read_file', 'edit_file'],
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
import * as fs from 'fs'

describe('copilotSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getVSCodeStoragePath', () => {
    it('returns empty string when APPDATA is not set', () => {
      const origAppData = process.env.APPDATA
      delete process.env.APPDATA
      const result = getVSCodeStoragePath()
      expect(result).toBe('')
      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('returns Insiders path when it exists', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('Code - Insiders')
      )
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code - Insiders')
      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('returns stable path when Insiders does not exist', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('Code') && !p.includes('Insiders')
      )
      const result = getVSCodeStoragePath()
      expect(result).toContain('Code')
      expect(result).not.toContain('Insiders')
      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('returns empty string when no VS Code installation found', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'
      mockExistsSync.mockReturnValue(false)
      const result = getVSCodeStoragePath()
      expect(result).toBe('')
      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })
  })

  describe('resolveWorkspaceName', () => {
    it('returns basename when workspace.json read fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('abc123')
    })

    it('returns resolved name from workspace.json when available', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///home/user/my-project' }))
      mockResolveFolderOrWorkspaceName.mockReturnValue('my-project')
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('my-project')
    })

    it('returns basename when resolveFolderOrWorkspaceName returns null', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ folder: 'file:///home/user/my-project' }))
      mockResolveFolderOrWorkspaceName.mockReturnValue(null)
      const name = resolveWorkspaceName('/workspaces/abc123')
      expect(name).toBe('abc123')
    })
  })

  describe('scanCopilotSessions', () => {
    it('returns empty when no VS Code storage path', () => {
      mockExistsSync.mockReturnValue(false)
      const origAppData = process.env.APPDATA
      delete process.env.APPDATA
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('returns empty when workspaceStorage directory cannot be read', () => {
      // Return a storage path
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('Code') && !p.includes('Insiders')
      )
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('scans workspace directories and returns sorted sessions', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'

      // getVSCodeStoragePath: return stable Code path
      mockExistsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('Code') && !p.includes('Insiders')) return true
        return true // for chatSessions dir checks
      })

      // workspaceStorage lists one workspace hash
      let readdirCall = 0
      mockReaddirSync.mockImplementation(() => {
        readdirCall++
        if (readdirCall === 1) return ['ws-hash-1']
        if (readdirCall === 2) return ['session1.jsonl', 'session2.jsonl']
        return []
      })

      // Return distinct mtimeMs per file so the sort is exercised
      mockStatSync.mockImplementation((p: string) => ({
        size: 500,
        mtimeMs: typeof p === 'string' && p.includes('session1') ? 1000 : 2000,
      }))

      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      // extractScanInfo: mock file reads
      mockOpenSync.mockReturnValue(42)
      mockReadSync.mockImplementation((_fd, buf: Buffer) => {
        const data = '{"kind":0}'
        buf.write(data)
        return data.length
      })

      const result = scanCopilotSessions()
      expect(result.sessions.length).toBe(2)
      expect(result.totalCount).toBe(2)
      // Sessions should be sorted by modifiedAt descending
      expect(result.sessions[0].sessionId).toBe('session2')
      expect(result.sessions[1].sessionId).toBe('session1')
      expect(result.sessions[0].modifiedAt).toBeGreaterThan(result.sessions[1].modifiedAt)

      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('returns empty for workspace hashes with no chat session files', () => {
      mockExistsSync.mockImplementation(
        (p: string) => typeof p === 'string' && p.includes('Code') && !p.includes('Insiders')
      )

      mockReaddirSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('chatSessions')) {
          throw new Error('ENOENT')
        }
        return ['ws-hash-1']
      })

      const result = scanCopilotSessions()
      expect(result).toEqual({ sessions: [], totalCount: 0 })
    })

    it('handles stat errors for individual session files gracefully', () => {
      mockExistsSync.mockReturnValue(true)

      let readdirCall = 0
      mockReaddirSync.mockImplementation(() => {
        readdirCall++
        if (readdirCall === 1) return ['ws-hash-1']
        return ['session1.jsonl']
      })

      mockStatSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = scanCopilotSessions()
      // parseSessionFile catches the stat error and returns []
      expect(result.sessions).toEqual([])
      expect(result.totalCount).toBe(0)
    })

    it('skips empty session files', () => {
      mockExistsSync.mockReturnValue(true)

      let readdirCall = 0
      mockReaddirSync.mockImplementation(() => {
        readdirCall++
        if (readdirCall === 1) return ['ws-hash-1']
        return ['session1.jsonl']
      })

      mockStatSync.mockReturnValue({ size: 0, mtimeMs: 1000 })
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = scanCopilotSessions()
      expect(result.sessions).toEqual([])
    })

    it('handles extractScanInfo returning fallback for zero bytes read', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'

      mockExistsSync.mockReturnValue(true)

      let readdirCall = 0
      mockReaddirSync.mockImplementation(() => {
        readdirCall++
        if (readdirCall === 1) return ['ws-hash-1']
        return ['session1.jsonl']
      })

      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 1000 })
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      mockOpenSync.mockReturnValue(42)
      mockReadSync.mockReturnValue(0) // zero bytes read

      const result = scanCopilotSessions()
      expect(result.sessions.length).toBe(1)
      expect(result.sessions[0].title).toBe('')

      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
    })

    it('handles extractScanInfo openSync error gracefully', () => {
      const origAppData = process.env.APPDATA
      process.env.APPDATA = '/fake/appdata'

      mockExistsSync.mockReturnValue(true)

      let readdirCall = 0
      mockReaddirSync.mockImplementation(() => {
        readdirCall++
        if (readdirCall === 1) return ['ws-hash-1']
        return ['session1.jsonl']
      })

      mockStatSync.mockReturnValue({ size: 100, mtimeMs: 1000 })
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      mockOpenSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const result = scanCopilotSessions()
      expect(result.sessions.length).toBe(1)
      expect(result.sessions[0].title).toBe('')

      if (origAppData !== undefined) process.env.APPDATA = origAppData
      else delete process.env.APPDATA
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

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')

      // Simulate stream error
      stream.emit('error', new Error('read error'))

      const result = await promise
      expect(result).toBeNull()
    })

    it('returns null on readline error', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')

      // Simulate readline error
      rl.emit('error', new Error('readline error'))

      const result = await promise
      expect(result).toBeNull()
    })

    it('returns null when no init data in session', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')

      // Close without any lines — state.init remains null
      rl.emit('close')

      const result = await promise
      expect(result).toBeNull()
    })

    it('parses lines and builds session when init data present', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      // processSessionLine will set state.init and title
      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          state.init = {
            sessionId: 'sess-123',
            creationDate: '2024-01-01T00:00:00Z',
            model: 'gpt-4',
          }
          state.title = 'My Session'
        }
      )

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')

      // Simulate a line with a valid kind
      rl.emit('line', '{"kind":0,"data":"init"}')
      // Close to trigger build
      rl.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.sessionId).toBe('sess-123')
      expect(result!.title).toBe('My Session')
      expect(result!.model).toBe('gpt-4')
      expect(result!.workspaceHash).toBe('ws-hash')
    })

    it('skips lines without a kind match', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')

      // Lines that don't match the kind pattern
      rl.emit('line', 'not json')
      rl.emit('line', '{"noKind": true}')
      rl.emit('close')

      const result = await promise
      // No init data was set, so result is null
      expect(result).toBeNull()
      expect(mockProcessSessionLine).not.toHaveBeenCalled()
    })

    it('uses fallback title when state.title is empty', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          state.init = {
            sessionId: 'abcdef12-3456-7890-abcd-ef1234567890',
            creationDate: '2024-01-01T00:00:00Z',
            model: 'gpt-4',
          }
          // title left empty
        }
      )

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')
      rl.emit('line', '{"kind":0}')
      rl.emit('close')

      const result = await promise
      expect(result!.title).toBe('Session abcdef12')
    })

    it('builds sorted results from resultsByIndex', async () => {
      mockExistsSync.mockReturnValue(true)

      const stream = new EventEmitter()
      vi.mocked(fs.createReadStream).mockReturnValue(stream as never)

      const rl = new EventEmitter()
      Object.assign(rl, { close: vi.fn() })
      mockCreateInterface.mockReturnValue(rl)

      mockProcessSessionLine.mockImplementation(
        (_kind: number, _keyPath: unknown, _line: string, state: Record<string, unknown>) => {
          state.init = {
            sessionId: 'sess-456',
            creationDate: '2024-06-15T12:00:00Z',
            model: 'claude-3.5',
          }
          state.title = 'Results Test'
          const results = state.resultsByIndex as Map<number, Record<string, unknown>>
          results.set(2, { prompt: '', duration: 200 })
          results.set(0, { prompt: '', duration: 100 })
          results.set(1, { prompt: '', duration: 150 })
          const prompts = state.prompts as Map<number, string>
          prompts.set(0, 'First prompt')
          prompts.set(1, 'Second prompt')
        }
      )

      const promise = getSessionDetail('/workspace/ws-hash/chatSessions/session.jsonl')
      rl.emit('line', '{"kind":0}')
      rl.emit('close')

      const result = await promise
      expect(result).not.toBeNull()
      expect(result!.results).toHaveLength(3)
      // Results should be sorted by index (0, 1, 2)
      expect(result!.results[0].prompt).toBe('First prompt')
      expect(result!.results[1].prompt).toBe('Second prompt')
      expect(result!.results[2].prompt).toBe('') // no prompt for index 2
    })
  })
})
