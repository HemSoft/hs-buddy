import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => {
    throw new Error('ENOENT')
  }),
  createReadStream: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('readline', () => ({
  createInterface: vi.fn(),
}))

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: vi.fn(() => []),
  resolveFolderOrWorkspaceName: vi.fn(() => 'test-workspace'),
  parseScanChunk: vi.fn(() => ({
    title: '',
    firstPrompt: '',
    agent: '',
    createdAt: 0,
    requestCount: 0,
  })),
  processSessionLine: vi.fn(),
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: vi.fn(() => ({
    totalPromptTokens: 0,
    totalOutputTokens: 0,
    totalToolCalls: 0,
    totalDurationMs: 0,
    allToolNames: [],
  })),
}))

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type { SessionRequestResult } from '../../src/types/copilotSession'
import type { SessionParseState } from '../../src/utils/copilotSessionParsing'
import {
  parseKeyPath,
  resolveFolderOrWorkspaceName,
  parseScanChunk,
  processSessionLine,
} from '../../src/utils/copilotSessionParsing'
import { aggregateResults } from '../../src/utils/sessionDigest'
import {
  buildSessionFromState,
  buildSortedResults,
  collectWorkspaceSessions,
  extractScanInfo,
  getSessionDetail,
  getVSCodeStoragePath,
  parseSessionFile,
  resolveWorkspaceName,
  scanCopilotSessions,
} from './copilotSessionService'

type MockListener = (...args: unknown[]) => void

type MockEventTarget = {
  on: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
  close?: ReturnType<typeof vi.fn>
  [Symbol.asyncIterator]: () => AsyncGenerator<never, void, unknown>
}

function createMockEventTarget(withClose = false): MockEventTarget {
  const listeners = new Map<string, MockListener[]>()

  const target: MockEventTarget = {
    on: vi.fn((event: string, listener: MockListener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return target
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    },
    [Symbol.asyncIterator]: () =>
      ({
        next: async () => ({ done: true, value: undefined }),
      }) as AsyncGenerator<never, void, unknown>,
  }

  if (withClose) {
    target.close = vi.fn(() => {
      target.emit('close')
    })
  }

  return target
}

function createMockStream(): MockEventTarget {
  return createMockEventTarget(false)
}

function createMockReadline(): MockEventTarget {
  return createMockEventTarget(true)
}

describe('copilotSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.APPDATA

    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    vi.mocked(fs.createReadStream).mockImplementation(() => createMockStream() as never)
    vi.mocked(fs.openSync).mockReturnValue(10)
    vi.mocked(fs.readSync).mockImplementation(() => 0)
    vi.mocked(fs.closeSync).mockImplementation(() => undefined)
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    vi.mocked(readline.createInterface).mockImplementation(() => createMockReadline() as never)

    vi.mocked(resolveFolderOrWorkspaceName).mockReturnValue('test-workspace')
    vi.mocked(parseKeyPath).mockReturnValue([])
    vi.mocked(parseScanChunk).mockReturnValue({
      title: '',
      firstPrompt: '',
      agent: '',
      createdAt: 0,
      requestCount: 0,
    })
    vi.mocked(processSessionLine).mockImplementation(() => undefined)
    vi.mocked(aggregateResults).mockReturnValue({
      totalPromptTokens: 0,
      totalOutputTokens: 0,
      totalToolCalls: 0,
      totalDurationMs: 0,
      allToolNames: [],
    })
  })

  it('getVSCodeStoragePath returns a string', () => {
    const result = getVSCodeStoragePath()
    expect(typeof result).toBe('string')
  })

  it('resolveWorkspaceName returns basename when workspace.json read fails', () => {
    const name = resolveWorkspaceName(path.join('/workspaces', 'abc123'))
    expect(name).toBe('abc123')
  })

  it('extractScanInfo reads the first chunk and closes the file handle', () => {
    const chunk = '{"kind":0,"customTitle":"Session"}'
    const scanInfo = {
      title: 'Session',
      firstPrompt: 'First prompt',
      agent: 'copilot',
      createdAt: 123,
      requestCount: 2,
    }

    vi.mocked(fs.readSync).mockImplementation((_fd, buffer) => {
      ;(buffer as Buffer).write(chunk, 0, 'utf8')
      return chunk.length
    })
    vi.mocked(parseScanChunk).mockReturnValue(scanInfo)

    expect(extractScanInfo('C:\\sessions\\abc.jsonl')).toEqual(scanInfo)
    expect(fs.openSync).toHaveBeenCalledWith('C:\\sessions\\abc.jsonl', 'r')
    expect(parseScanChunk).toHaveBeenCalledWith(chunk)
    expect(fs.closeSync).toHaveBeenCalledWith(10)
  })

  it('extractScanInfo returns fallback data when reading fails', () => {
    vi.mocked(fs.readSync).mockImplementation(() => {
      throw new Error('EIO')
    })

    expect(extractScanInfo('C:\\sessions\\broken.jsonl')).toEqual({
      title: '',
      firstPrompt: '',
      agent: '',
      createdAt: 0,
      requestCount: 0,
    })
    expect(fs.closeSync).toHaveBeenCalledWith(10)
    expect(parseScanChunk).not.toHaveBeenCalled()
  })

  it('collectWorkspaceSessions returns parsed summaries for jsonl files only', () => {
    const wsRoot = path.join('/appdata', 'Code', 'User', 'workspaceStorage')
    const hash = 'hash-one'
    const hashRoot = path.join(wsRoot, hash)
    const chatDir = path.join(hashRoot, 'chatSessions')

    vi.mocked(fs.readFileSync).mockReturnValue('{"folder":"file:///workspace"}')
    vi.mocked(resolveFolderOrWorkspaceName).mockReturnValue('workspace-alpha')
    vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
      if (dir === chatDir) return ['beta.jsonl', 'notes.txt', 'alpha.jsonl']
      throw new Error('ENOENT')
    }) as never)
    vi.mocked(fs.statSync).mockImplementation(filePath => {
      if (filePath === path.join(chatDir, 'alpha.jsonl')) return { size: 100, mtimeMs: 200 } as never
      if (filePath === path.join(chatDir, 'beta.jsonl')) return { size: 120, mtimeMs: 300 } as never
      throw new Error('ENOENT')
    })
    vi.mocked(fs.openSync).mockImplementation(filePath =>
      filePath === path.join(chatDir, 'alpha.jsonl') ? 1 : 2
    )
    vi.mocked(fs.readSync).mockImplementation((fd, buffer) => {
      const chunk = fd === 1 ? 'alpha chunk' : 'beta chunk'
      ;(buffer as Buffer).write(chunk, 0, 'utf8')
      return chunk.length
    })
    vi.mocked(parseScanChunk).mockImplementation(chunk =>
      chunk === 'alpha chunk'
        ? {
            title: 'Alpha',
            firstPrompt: 'Prompt A',
            agent: 'agent-a',
            createdAt: 10,
            requestCount: 1,
          }
        : {
            title: 'Beta',
            firstPrompt: 'Prompt B',
            agent: 'agent-b',
            createdAt: 20,
            requestCount: 2,
          }
    )

    expect(collectWorkspaceSessions(wsRoot, hash)).toEqual([
      {
        sessionId: 'beta',
        filePath: path.join(chatDir, 'beta.jsonl'),
        workspaceHash: hash,
        workspaceName: 'workspace-alpha',
        modifiedAt: 300,
        sizeBytes: 120,
        title: 'Beta',
        firstPrompt: 'Prompt B',
        agent: 'agent-b',
        createdAt: 20,
        requestCount: 2,
      },
      {
        sessionId: 'alpha',
        filePath: path.join(chatDir, 'alpha.jsonl'),
        workspaceHash: hash,
        workspaceName: 'workspace-alpha',
        modifiedAt: 200,
        sizeBytes: 100,
        title: 'Alpha',
        firstPrompt: 'Prompt A',
        agent: 'agent-a',
        createdAt: 10,
        requestCount: 1,
      },
    ])
  })

  it('collectWorkspaceSessions returns an empty array when chatSessions cannot be read', () => {
    expect(collectWorkspaceSessions('/storage', 'missing')).toEqual([])
  })

  it('parseSessionFile builds a session summary from stat data and scan info', () => {
    const wsRoot = '/storage'
    const filePath = path.join(wsRoot, 'hash-two', 'chatSessions', 'session-1.jsonl')

    vi.mocked(fs.statSync).mockReturnValue({ size: 456, mtimeMs: 789 } as never)
    vi.mocked(fs.readSync).mockImplementation((_fd, buffer) => {
      ;(buffer as Buffer).write('summary chunk', 0, 'utf8')
      return 'summary chunk'.length
    })
    vi.mocked(parseScanChunk).mockReturnValue({
      title: 'Useful title',
      firstPrompt: 'Do the thing',
      agent: 'copilot',
      createdAt: 55,
      requestCount: 3,
    })

    expect(parseSessionFile(wsRoot, 'hash-two', 'Workspace Two', 'session-1.jsonl')).toEqual([
      {
        sessionId: 'session-1',
        filePath,
        workspaceHash: 'hash-two',
        workspaceName: 'Workspace Two',
        modifiedAt: 789,
        sizeBytes: 456,
        title: 'Useful title',
        firstPrompt: 'Do the thing',
        agent: 'copilot',
        createdAt: 55,
        requestCount: 3,
      },
    ])
  })

  it('parseSessionFile skips empty session files', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 0, mtimeMs: 123 } as never)

    expect(parseSessionFile('/storage', 'hash-three', 'Workspace Three', 'empty.jsonl')).toEqual(
      []
    )
    expect(parseScanChunk).not.toHaveBeenCalled()
  })

  it('scanCopilotSessions returns sorted results from all workspace hashes', () => {
    process.env.APPDATA = '/mock-appdata'

    const stableUserPath = path.join('/mock-appdata', 'Code', 'User')
    const wsRoot = path.join(stableUserPath, 'workspaceStorage')
    const wsOneRoot = path.join(wsRoot, 'hash-one')
    const wsTwoRoot = path.join(wsRoot, 'hash-two')
    const wsOneChat = path.join(wsOneRoot, 'chatSessions')
    const wsTwoChat = path.join(wsTwoRoot, 'chatSessions')

    vi.mocked(fs.existsSync).mockImplementation(p => p === stableUserPath)
    vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
      if (dir === wsRoot) return ['hash-one', 'hash-two']
      if (dir === wsOneChat) return ['older.jsonl']
      if (dir === wsTwoChat) return ['newer.jsonl']
      throw new Error('ENOENT')
    }) as never)
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce('{"folder":"file:///one"}')
      .mockReturnValueOnce('{"folder":"file:///two"}')
    vi.mocked(resolveFolderOrWorkspaceName)
      .mockReturnValueOnce('Workspace One')
      .mockReturnValueOnce('Workspace Two')
    vi.mocked(fs.statSync).mockImplementation(filePath => {
      if (filePath === path.join(wsOneChat, 'older.jsonl')) return { size: 10, mtimeMs: 100 } as never
      if (filePath === path.join(wsTwoChat, 'newer.jsonl')) return { size: 20, mtimeMs: 500 } as never
      throw new Error('ENOENT')
    })
    vi.mocked(fs.openSync).mockImplementation(filePath =>
      filePath === path.join(wsOneChat, 'older.jsonl') ? 1 : 2
    )
    vi.mocked(fs.readSync).mockImplementation((fd, buffer) => {
      const chunk = fd === 1 ? 'older chunk' : 'newer chunk'
      ;(buffer as Buffer).write(chunk, 0, 'utf8')
      return chunk.length
    })
    vi.mocked(parseScanChunk).mockImplementation(chunk =>
      chunk === 'older chunk'
        ? {
            title: 'Older',
            firstPrompt: 'Old prompt',
            agent: 'agent-old',
            createdAt: 1,
            requestCount: 1,
          }
        : {
            title: 'Newer',
            firstPrompt: 'New prompt',
            agent: 'agent-new',
            createdAt: 2,
            requestCount: 2,
          }
    )

    expect(scanCopilotSessions()).toEqual({
      sessions: [
        {
          sessionId: 'newer',
          filePath: path.join(wsTwoChat, 'newer.jsonl'),
          workspaceHash: 'hash-two',
          workspaceName: 'Workspace Two',
          modifiedAt: 500,
          sizeBytes: 20,
          title: 'Newer',
          firstPrompt: 'New prompt',
          agent: 'agent-new',
          createdAt: 2,
          requestCount: 2,
        },
        {
          sessionId: 'older',
          filePath: path.join(wsOneChat, 'older.jsonl'),
          workspaceHash: 'hash-one',
          workspaceName: 'Workspace One',
          modifiedAt: 100,
          sizeBytes: 10,
          title: 'Older',
          firstPrompt: 'Old prompt',
          agent: 'agent-old',
          createdAt: 1,
          requestCount: 1,
        },
      ],
      totalCount: 2,
    })
  })

  it('scanCopilotSessions returns empty results when no VS Code storage path is available', () => {
    expect(scanCopilotSessions()).toEqual({ sessions: [], totalCount: 0 })
  })

  it('getSessionDetail streams lines and builds a session from parse state', async () => {
    const filePath = path.join('/storage', 'workspaceStorage', 'hash-123', 'chatSessions', 'session-9.jsonl')
    const stream = createMockStream()
    const rl = createMockReadline()
    const resultEntry: SessionRequestResult = {
      prompt: '',
      promptTokens: 4,
      outputTokens: 6,
      firstProgressMs: 8,
      totalElapsedMs: 10,
      toolCallCount: 1,
      toolNames: ['grep_search'],
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.createReadStream).mockReturnValue(stream as never)
    vi.mocked(readline.createInterface).mockImplementation(({ input }) => {
      expect(input).toBe(stream)
      return rl as never
    })
    vi.mocked(parseKeyPath).mockImplementation(line =>
      line.includes('result') ? ['requests', '1', 'result'] : []
    )
    vi.mocked(processSessionLine).mockImplementation((kind, _keyPath, _line, state) => {
      if (kind === 0) {
        state.init = {
          sessionId: 'session-9',
          creationDate: 999,
          model: {
            id: 'gpt-5',
            name: 'GPT-5',
            family: 'gpt',
            vendor: 'openai',
            multiplier: '1x',
            multiplierNumeric: 1,
            maxInputTokens: 0,
            maxOutputTokens: 0,
          },
        }
        state.title = 'Loaded session'
        state.prompts.set(1, 'Prompt from request')
      }

      if (kind === 1) {
        state.resultsByIndex.set(1, { ...resultEntry })
      }
    })
    vi.mocked(aggregateResults).mockReturnValue({
      totalPromptTokens: 4,
      totalOutputTokens: 6,
      totalToolCalls: 1,
      totalDurationMs: 10,
      allToolNames: ['grep_search'],
    })

    const promise = getSessionDetail(filePath)
    rl.emit('line', '{"kind":0,"sessionId":"session-9"}')
    rl.emit('line', 'not a session line')
    rl.emit('line', '{"kind":1,"k":["requests","1","result"]}')
    rl.emit('close')

    await expect(promise).resolves.toEqual({
      sessionId: 'session-9',
      title: 'Loaded session',
      startTime: 999,
      model: {
        id: 'gpt-5',
        name: 'GPT-5',
        family: 'gpt',
        vendor: 'openai',
        multiplier: '1x',
        multiplierNumeric: 1,
        maxInputTokens: 0,
        maxOutputTokens: 0,
      },
      requestCount: 1,
      results: [{ ...resultEntry, prompt: 'Prompt from request' }],
      totalPromptTokens: 4,
      totalOutputTokens: 6,
      totalToolCalls: 1,
      toolsUsed: ['grep_search'],
      totalDurationMs: 10,
      workspaceHash: 'hash-123',
      filePath,
    })
    expect(parseKeyPath).toHaveBeenCalledTimes(2)
    expect(processSessionLine).toHaveBeenCalledTimes(2)
  })

  it('getSessionDetail returns null when the readline parser emits an error', async () => {
    const filePath = path.join('/storage', 'workspaceStorage', 'hash-err', 'chatSessions', 'session.jsonl')
    const rl = createMockReadline()

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.createReadStream).mockReturnValue(createMockStream() as never)
    vi.mocked(readline.createInterface).mockReturnValue(rl as never)

    const promise = getSessionDetail(filePath)
    rl.emit('error', new Error('parse failed'))

    await expect(promise).resolves.toBeNull()
  })

  it('buildSessionFromState returns null without init data', () => {
    const state: SessionParseState = {
      init: null,
      title: '',
      resultsByIndex: new Map(),
      prompts: new Map(),
    }

    expect(buildSessionFromState(state, 'hash', 'C:\\session.jsonl')).toBeNull()
  })

  it('buildSessionFromState applies the fallback title and aggregate metrics', () => {
    const state: SessionParseState = {
      init: {
        sessionId: 'abcdef123456',
        creationDate: 777,
        model: null,
      },
      title: '',
      resultsByIndex: new Map([
        [
          2,
          {
            prompt: '',
            promptTokens: 5,
            outputTokens: 7,
            firstProgressMs: 9,
            totalElapsedMs: 11,
            toolCallCount: 2,
            toolNames: ['tool-b'],
          },
        ],
      ]),
      prompts: new Map([[2, 'Merged prompt']]),
    }

    vi.mocked(aggregateResults).mockReturnValue({
      totalPromptTokens: 5,
      totalOutputTokens: 7,
      totalToolCalls: 2,
      totalDurationMs: 11,
      allToolNames: ['tool-b'],
    })

    expect(buildSessionFromState(state, 'workspace-hash', 'C:\\session.jsonl')).toEqual({
      sessionId: 'abcdef123456',
      title: 'Session abcdef12',
      startTime: 777,
      model: null,
      requestCount: 1,
      results: [
        {
          prompt: 'Merged prompt',
          promptTokens: 5,
          outputTokens: 7,
          firstProgressMs: 9,
          totalElapsedMs: 11,
          toolCallCount: 2,
          toolNames: ['tool-b'],
        },
      ],
      totalPromptTokens: 5,
      totalOutputTokens: 7,
      totalToolCalls: 2,
      toolsUsed: ['tool-b'],
      totalDurationMs: 11,
      workspaceHash: 'workspace-hash',
      filePath: 'C:\\session.jsonl',
    })
  })

  it('buildSortedResults sorts by request index and merges prompts', () => {
    const zero: SessionRequestResult = {
      prompt: 'stale',
      promptTokens: 1,
      outputTokens: 2,
      firstProgressMs: 3,
      totalElapsedMs: 4,
      toolCallCount: 0,
      toolNames: [],
    }
    const two: SessionRequestResult = {
      prompt: 'stale',
      promptTokens: 5,
      outputTokens: 6,
      firstProgressMs: 7,
      totalElapsedMs: 8,
      toolCallCount: 1,
      toolNames: ['tool-two'],
    }

    const state: SessionParseState = {
      init: null,
      title: '',
      resultsByIndex: new Map([
        [2, two],
        [0, zero],
      ]),
      prompts: new Map([[2, 'Prompt two']]),
    }

    expect(buildSortedResults(state)).toEqual([
      { ...zero, prompt: '' },
      { ...two, prompt: 'Prompt two' },
    ])
  })
})
