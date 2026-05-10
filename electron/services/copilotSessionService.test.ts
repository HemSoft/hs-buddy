import { EventEmitter } from 'events'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockExistsSync,
  mockOpenSync,
  mockReadSync,
  mockCloseSync,
  mockReaddirSync,
  mockStatSync,
  mockReadFileSync,
  mockCreateReadStream,
  mockCreateInterface,
  mockParseKeyPath,
  mockResolveFolderOrWorkspaceName,
  mockParseScanChunk,
  mockProcessSessionLine,
  mockAggregateResults,
  mockComputeSessionDigest,
  holders,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockOpenSync: vi.fn(),
  mockReadSync: vi.fn(),
  mockCloseSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockCreateInterface: vi.fn(),
  mockParseKeyPath: vi.fn(),
  mockResolveFolderOrWorkspaceName: vi.fn(),
  mockParseScanChunk: vi.fn(),
  mockProcessSessionLine: vi.fn(),
  mockAggregateResults: vi.fn(),
  mockComputeSessionDigest: vi.fn(),
  holders: {
    stream: null as EventEmitter | null,
    rl: null as (EventEmitter & { close: ReturnType<typeof vi.fn> }) | null,
  },
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  openSync: mockOpenSync,
  readSync: mockReadSync,
  closeSync: mockCloseSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
  createReadStream: mockCreateReadStream,
}))

vi.mock('readline', () => ({
  createInterface: mockCreateInterface,
}))

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: mockParseKeyPath,
  resolveFolderOrWorkspaceName: mockResolveFolderOrWorkspaceName,
  parseScanChunk: mockParseScanChunk,
  processSessionLine: mockProcessSessionLine,
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: mockAggregateResults,
  computeSessionDigest: mockComputeSessionDigest,
}))

import {
  getSessionDetail,
  getVSCodeStoragePath,
  resolveWorkspaceName,
  scanCopilotSessions,
} from './copilotSessionService'

const originalAppData = process.env.APPDATA
const defaultScanInfo = {
  title: 'Test',
  firstPrompt: 'Hello',
  agent: 'copilot',
  createdAt: 12345,
  requestCount: 1,
}
const defaultAggregate = {
  totalPromptTokens: 100,
  totalOutputTokens: 50,
  totalToolCalls: 2,
  allToolNames: ['tool1'],
  totalDurationMs: 5000,
}

function resetEventEmitters(): void {
  holders.stream = new EventEmitter()
  holders.rl = Object.assign(new EventEmitter(), { close: vi.fn() })
}

beforeEach(() => {
  resetEventEmitters()

  mockExistsSync.mockReset()
  mockOpenSync.mockReset()
  mockReadSync.mockReset()
  mockCloseSync.mockReset()
  mockReaddirSync.mockReset()
  mockStatSync.mockReset()
  mockReadFileSync.mockReset()
  mockCreateReadStream.mockReset()
  mockCreateInterface.mockReset()
  mockParseKeyPath.mockReset()
  mockResolveFolderOrWorkspaceName.mockReset()
  mockParseScanChunk.mockReset()
  mockProcessSessionLine.mockReset()
  mockAggregateResults.mockReset()
  mockComputeSessionDigest.mockReset()

  mockExistsSync.mockReturnValue(false)
  mockOpenSync.mockReturnValue(11)
  mockReadSync.mockImplementation((_fd, buffer: Buffer) => {
    buffer.write('{"kind":0,"v":{}}')
    return '{"kind":0,"v":{}}'.length
  })
  mockCloseSync.mockReturnValue(undefined)
  mockReaddirSync.mockReturnValue([])
  mockStatSync.mockReturnValue({ size: 0, mtimeMs: 0 })
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT')
  })
  mockCreateReadStream.mockImplementation(() => holders.stream)
  mockCreateInterface.mockImplementation(() => holders.rl)
  mockParseKeyPath.mockReturnValue([])
  mockResolveFolderOrWorkspaceName.mockReturnValue('resolved-workspace')
  mockParseScanChunk.mockReturnValue(defaultScanInfo)
  mockProcessSessionLine.mockImplementation(() => undefined)
  mockAggregateResults.mockReturnValue(defaultAggregate)

  delete process.env.APPDATA
})

afterEach(() => {
  if (originalAppData === undefined) {
    delete process.env.APPDATA
  } else {
    process.env.APPDATA = originalAppData
  }
})

describe('getVSCodeStoragePath', () => {
  it('returns an empty string when APPDATA is not set', () => {
    delete process.env.APPDATA

    expect(getVSCodeStoragePath()).toBe('')
    expect(mockExistsSync).not.toHaveBeenCalled()
  })

  it('returns the insiders path when it exists', () => {
    const appData = 'C:\\Users\\Test\\AppData\\Roaming'
    const insiders = path.join(appData, 'Code - Insiders', 'User')
    const stable = path.join(appData, 'Code', 'User')

    process.env.APPDATA = appData
    mockExistsSync.mockImplementation(target => target === insiders)

    expect(getVSCodeStoragePath()).toBe(insiders)
    expect(mockExistsSync).toHaveBeenCalledWith(insiders)
    expect(mockExistsSync).not.toHaveBeenCalledWith(stable)
  })

  it('returns the stable path when insiders is missing but stable exists', () => {
    const appData = 'C:\\Users\\Test\\AppData\\Roaming'
    const insiders = path.join(appData, 'Code - Insiders', 'User')
    const stable = path.join(appData, 'Code', 'User')

    process.env.APPDATA = appData
    mockExistsSync.mockImplementation(target => target === stable)

    expect(getVSCodeStoragePath()).toBe(stable)
    expect(mockExistsSync).toHaveBeenCalledWith(insiders)
    expect(mockExistsSync).toHaveBeenCalledWith(stable)
  })

  it('returns an empty string when neither VS Code path exists', () => {
    process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming'
    mockExistsSync.mockReturnValue(false)

    expect(getVSCodeStoragePath()).toBe('')
  })
})

describe('resolveWorkspaceName', () => {
  it('returns basename when workspace.json read fails', () => {
    const wsDir = path.join('C:\\workspaces', 'abc123')

    expect(resolveWorkspaceName(wsDir)).toBe('abc123')
  })

  it('returns the resolved workspace name when workspace.json is valid', () => {
    const wsDir = path.join('C:\\workspaces', 'named-workspace')
    mockReadFileSync.mockReturnValue('{"folder":"file:///C%3A/Projects/demo"}')
    mockResolveFolderOrWorkspaceName.mockReturnValue('Demo Workspace')

    expect(resolveWorkspaceName(wsDir)).toBe('Demo Workspace')
    expect(mockResolveFolderOrWorkspaceName).toHaveBeenCalledWith({
      folder: 'file:///C%3A/Projects/demo',
    })
  })

  it('returns basename when resolveFolderOrWorkspaceName returns null', () => {
    const wsDir = path.join('C:\\workspaces', 'fallback-name')
    mockReadFileSync.mockReturnValue('{"workspace":"file:///C%3A/Projects/demo.code-workspace"}')
    mockResolveFolderOrWorkspaceName.mockReturnValue(null)

    expect(resolveWorkspaceName(wsDir)).toBe('fallback-name')
  })
})

describe('scanCopilotSessions', () => {
  it('returns an empty result when the VS Code storage path is empty', () => {
    delete process.env.APPDATA

    expect(scanCopilotSessions()).toEqual({ sessions: [], totalCount: 0 })
  })

  it('returns an empty result when workspaceStorage cannot be read', () => {
    const appData = 'C:\\Users\\Test\\AppData\\Roaming'
    const stable = path.join(appData, 'Code', 'User')
    const wsRoot = path.join(stable, 'workspaceStorage')

    process.env.APPDATA = appData
    mockExistsSync.mockImplementation(target => target === stable)
    mockReaddirSync.mockImplementation(target => {
      if (target === wsRoot) throw new Error('ENOENT')
      return []
    })

    expect(scanCopilotSessions()).toEqual({ sessions: [], totalCount: 0 })
  })

  it('returns sessions sorted by modifiedAt when workspace sessions exist', () => {
    const appData = 'C:\\Users\\Test\\AppData\\Roaming'
    const stable = path.join(appData, 'Code', 'User')
    const wsRoot = path.join(stable, 'workspaceStorage')
    const olderHash = 'workspace-older'
    const newerHash = 'workspace-newer'
    const olderDir = path.join(wsRoot, olderHash)
    const newerDir = path.join(wsRoot, newerHash)
    const olderChatDir = path.join(olderDir, 'chatSessions')
    const newerChatDir = path.join(newerDir, 'chatSessions')
    const olderFile = path.join(olderChatDir, 'older-session.jsonl')
    const newerFile = path.join(newerChatDir, 'newer-session.jsonl')

    process.env.APPDATA = appData
    mockExistsSync.mockImplementation(target => target === stable)
    mockReaddirSync.mockImplementation(target => {
      if (target === wsRoot) return [olderHash, newerHash]
      if (target === olderChatDir) return ['older-session.jsonl', 'notes.txt']
      if (target === newerChatDir) return ['newer-session.jsonl']
      return []
    })
    mockReadFileSync.mockImplementation(target => {
      if (target === path.join(olderDir, 'workspace.json')) return '{"folder":"older"}'
      if (target === path.join(newerDir, 'workspace.json')) return '{"folder":"newer"}'
      throw new Error('ENOENT')
    })
    mockResolveFolderOrWorkspaceName.mockImplementation(parsed => {
      if (parsed.folder === 'older') return 'Older Workspace'
      if (parsed.folder === 'newer') return 'Newer Workspace'
      return null
    })
    mockStatSync.mockImplementation(target => {
      if (target === olderFile) return { size: 111, mtimeMs: 1000 }
      if (target === newerFile) return { size: 222, mtimeMs: 3000 }
      return { size: 0, mtimeMs: 0 }
    })
    mockReadSync.mockImplementation((_fd, buffer: Buffer) => {
      const chunk = '{"kind":0,"v":{"customTitle":"Test"}}'
      buffer.write(chunk)
      return chunk.length
    })

    const result = scanCopilotSessions()

    expect(result).toEqual({
      sessions: [
        {
          sessionId: 'newer-session',
          filePath: newerFile,
          workspaceHash: newerHash,
          workspaceName: 'Newer Workspace',
          modifiedAt: 3000,
          sizeBytes: 222,
          ...defaultScanInfo,
        },
        {
          sessionId: 'older-session',
          filePath: olderFile,
          workspaceHash: olderHash,
          workspaceName: 'Older Workspace',
          modifiedAt: 1000,
          sizeBytes: 111,
          ...defaultScanInfo,
        },
      ],
      totalCount: 2,
    })
    expect(mockParseScanChunk).toHaveBeenCalledTimes(2)
  })
})

describe('getSessionDetail', () => {
  it('returns null when the file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    await expect(getSessionDetail('C:\\sessions\\missing.jsonl')).resolves.toBeNull()
  })

  it('returns null when the stream errors', async () => {
    const filePath = path.join(
      'C:\\Users\\Test',
      'workspaceStorage',
      'hash-stream',
      'chatSessions',
      'session.jsonl'
    )
    mockExistsSync.mockImplementation(target => target === filePath)

    const detailPromise = getSessionDetail(filePath)
    holders.stream!.emit('error', new Error('boom'))

    await expect(detailPromise).resolves.toBeNull()
    expect(holders.rl!.close).toHaveBeenCalled()
  })

  it('returns null when no session init is parsed', async () => {
    const filePath = path.join(
      'C:\\Users\\Test',
      'workspaceStorage',
      'hash-empty',
      'chatSessions',
      'session.jsonl'
    )
    mockExistsSync.mockImplementation(target => target === filePath)
    mockParseKeyPath.mockReturnValue(['root'])

    const detailPromise = getSessionDetail(filePath)
    holders.rl!.emit('line', '{"kind":0,"v":{}}')
    holders.rl!.emit('close')

    await expect(detailPromise).resolves.toBeNull()
    expect(mockProcessSessionLine).toHaveBeenCalledWith(
      0,
      ['root'],
      '{"kind":0,"v":{}}',
      expect.any(Object)
    )
  })

  it('returns session detail when lines are parsed into state', async () => {
    const filePath = path.join(
      'C:\\Users\\Test',
      'workspaceStorage',
      'hash-detail',
      'chatSessions',
      'session.jsonl'
    )
    const model = {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      family: 'gpt-4',
      vendor: 'openai',
      multiplier: '1x',
      multiplierNumeric: 1,
      maxInputTokens: 128000,
      maxOutputTokens: 16384,
    }

    mockExistsSync.mockImplementation(target => target === filePath)
    mockParseKeyPath.mockImplementation(line => (line.includes('kind":0') ? ['init'] : ['result']))
    mockProcessSessionLine.mockImplementation((kind, _keyPath, _line, state) => {
      if (kind === 0) {
        state.init = { sessionId: 'session-12345678', creationDate: 1700000000000, model }
        state.title = 'Helpful Session'
        return
      }

      state.resultsByIndex.set(1, {
        prompt: '',
        promptTokens: 20,
        outputTokens: 10,
        firstProgressMs: 200,
        totalElapsedMs: 400,
        toolCallCount: 1,
        toolNames: ['tool2'],
      })
      state.resultsByIndex.set(0, {
        prompt: '',
        promptTokens: 40,
        outputTokens: 25,
        firstProgressMs: 100,
        totalElapsedMs: 300,
        toolCallCount: 2,
        toolNames: ['tool1'],
      })
      state.prompts.set(1, 'Second prompt')
      state.prompts.set(0, 'First prompt')
    })

    const detailPromise = getSessionDetail(filePath)
    holders.rl!.emit('line', '{"kind":0,"v":{}}')
    holders.rl!.emit('line', '{"kind":1,"v":{}}')
    holders.rl!.emit('close')

    const result = await detailPromise

    expect(mockAggregateResults).toHaveBeenCalledWith([
      {
        prompt: 'First prompt',
        promptTokens: 40,
        outputTokens: 25,
        firstProgressMs: 100,
        totalElapsedMs: 300,
        toolCallCount: 2,
        toolNames: ['tool1'],
      },
      {
        prompt: 'Second prompt',
        promptTokens: 20,
        outputTokens: 10,
        firstProgressMs: 200,
        totalElapsedMs: 400,
        toolCallCount: 1,
        toolNames: ['tool2'],
      },
    ])
    expect(result).toEqual({
      sessionId: 'session-12345678',
      title: 'Helpful Session',
      startTime: 1700000000000,
      model,
      requestCount: 2,
      results: [
        {
          prompt: 'First prompt',
          promptTokens: 40,
          outputTokens: 25,
          firstProgressMs: 100,
          totalElapsedMs: 300,
          toolCallCount: 2,
          toolNames: ['tool1'],
        },
        {
          prompt: 'Second prompt',
          promptTokens: 20,
          outputTokens: 10,
          firstProgressMs: 200,
          totalElapsedMs: 400,
          toolCallCount: 1,
          toolNames: ['tool2'],
        },
      ],
      totalPromptTokens: 100,
      totalOutputTokens: 50,
      totalToolCalls: 2,
      toolsUsed: ['tool1'],
      totalDurationMs: 5000,
      workspaceHash: 'hash-detail',
      filePath,
    })
  })
})
