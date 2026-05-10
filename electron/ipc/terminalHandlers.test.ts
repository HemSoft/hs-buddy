import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let latestOnData: ((data: string) => void) | null = null
const mockSpawn = vi.fn(() => {
  latestOnData = null
  return {
    onData: vi.fn((cb: (data: string) => void) => {
      latestOnData = cb
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => '/home/user'), quit: vi.fn(), on: vi.fn() },
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => {
    const req = (mod: string) => {
      if (mod === 'node-pty') {
        return { spawn: mockSpawn }
      }
      if (mod.includes('node-pty/lib/utils')) {
        return { loadNativeModule: vi.fn(() => ({ dir: '', module: {} })) }
      }
      throw new Error(`Unknown module: ${mod}`)
    }
    req.resolve = vi.fn(() => '/fake/node-pty/package.json')
    return req
  }),
}))

vi.mock('../../src/utils/terminalPathUtils', () => ({
  isValidRepoSlug: vi.fn((s: unknown) => typeof s === 'string' && /^[\w.-]+$/.test(s)),
  getCloneRoots: vi.fn(() => ['/repos']),
  getOrgCandidates: vi.fn((owner: string) => [owner]),
  processOsc7Buffer: vi.fn(() => ({ cwd: null, remainingBuffer: '' })),
  buildTerminalShellArgs: vi.fn(() => []),
  buildPtySpawnOptions: vi.fn(() => ({ env: {} })),
  findRepoPath: vi.fn(() => null),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessageWithFallback: vi.fn((_err: unknown, fallback: string) => fallback),
}))

describe('terminalHandlers', () => {
  let ipcMainMock: typeof import('electron').ipcMain
  let appMock: typeof import('electron').app
  let processOsc7BufferMock: typeof import('../../src/utils/terminalPathUtils').processOsc7Buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listeners: Map<string, (...args: any[]) => any>
  let beforeQuitHandler: (() => void) | null

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    handlers = new Map()
    listeners = new Map()
    beforeQuitHandler = null
    latestOnData = null
    mockSpawn.mockReset()
    mockSpawn.mockImplementation(() => {
      latestOnData = null
      return {
        onData: vi.fn((cb: (data: string) => void) => {
          latestOnData = cb
          return { dispose: vi.fn() }
        }),
        onExit: vi.fn(() => ({ dispose: vi.fn() })),
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
      }
    })

    const { ipcMain, app } = await import('electron')
    ipcMainMock = ipcMain
    appMock = app
    ;({ processOsc7Buffer: processOsc7BufferMock } =
      await import('../../src/utils/terminalPathUtils'))

    vi.mocked(ipcMainMock.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    vi.mocked(ipcMainMock.on).mockImplementation((channel, handler) => {
      listeners.set(channel, handler)
      return ipcMainMock
    })
    vi.mocked(appMock.on).mockImplementation((event, handler) => {
      if ((event as string) === 'before-quit') beforeQuitHandler = handler as () => void
      return appMock
    })

    const { registerTerminalHandlers } = await import('./terminalHandlers')
    registerTerminalHandlers()
  })

  it('registers expected handle channels', () => {
    expect(handlers.has('terminal:resolve-repo-path')).toBe(true)
    expect(handlers.has('terminal:spawn')).toBe(true)
    expect(handlers.has('terminal:attach')).toBe(true)
    expect(handlers.has('terminal:kill')).toBe(true)
  })

  it('registers expected on channels', () => {
    expect(listeners.has('terminal:write')).toBe(true)
    expect(listeners.has('terminal:resize')).toBe(true)
  })

  it('terminal:resolve-repo-path returns null for invalid input', async () => {
    const handler = handlers.get('terminal:resolve-repo-path')!
    const result = await handler({}, null)
    expect(result).toEqual({ path: null })
  })

  it('terminal:resolve-repo-path returns null for invalid slug', async () => {
    const handler = handlers.get('terminal:resolve-repo-path')!
    const result = await handler({}, { owner: 'valid', repo: 'valid' })
    expect(result).toEqual({ path: null })
  })

  it('terminal:attach returns error for unknown session', async () => {
    const handler = handlers.get('terminal:attach')!
    const result = await handler({ sender: {} }, 'nonexistent-id')
    expect(result).toEqual({ success: false, error: 'Session not found' })
  })

  it('terminal:kill returns error for unknown session', async () => {
    const handler = handlers.get('terminal:kill')!
    const result = await handler({}, 'nonexistent-id')
    expect(result).toEqual({ success: false, error: 'Session not found' })
  })

  it('terminal:spawn creates a new terminal session', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

    const result = await handler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
    expect(result.cwd).toBeDefined()
    expect(mockSpawn).toHaveBeenCalledOnce()
  })

  it('terminal:spawn returns a failure when node-pty throws', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    mockSpawn.mockImplementationOnce(() => {
      throw new Error('spawn exploded')
    })

    const result = await handler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(result).toEqual({ success: false, error: 'Failed to spawn terminal' })
  })

  it('terminal:spawn with valid cwd uses provided cwd', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

    const result = await handler({ sender: mockSender }, { cwd: '/valid/path', cols: 80, rows: 24 })

    expect(result.success).toBe(true)
  })

  it('terminal:spawn with startupCommand schedules command', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

    const result = await handler(
      { sender: mockSender },
      { cols: 80, rows: 24, startupCommand: 'echo hello' }
    )

    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
  })

  it('terminal:attach returns session data for existing session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    const attachHandler = handlers.get('terminal:attach')!
    const result = await attachHandler({ sender: mockSender }, spawnResult.sessionId)

    expect(result.success).toBe(true)
    expect(result.buffer).toBeDefined()
    expect(typeof result.cursor).toBe('number')
    expect(result.alive).toBe(true)
  })

  it('terminal:kill cleans up an existing session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    const killHandler = handlers.get('terminal:kill')!
    const result = await killHandler({}, spawnResult.sessionId)

    expect(result).toEqual({ success: true })

    const attachResult = await handlers.get('terminal:attach')!(
      { sender: mockSender },
      spawnResult.sessionId
    )
    expect(attachResult.success).toBe(false)
  })

  it('terminal:write writes data to existing session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    const writeListener = listeners.get('terminal:write')!
    expect(() => writeListener({}, spawnResult.sessionId, 'hello')).not.toThrow()
  })

  it('terminal:write ignores writes to non-existent sessions', () => {
    const writeListener = listeners.get('terminal:write')!
    expect(() => writeListener({}, 'nonexistent', 'hello')).not.toThrow()
  })

  it('terminal:resize resizes an existing session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    const resizeListener = listeners.get('terminal:resize')!
    expect(() => resizeListener({}, spawnResult.sessionId, 120, 40)).not.toThrow()
  })

  it('terminal:resize ignores non-existent sessions', () => {
    const resizeListener = listeners.get('terminal:resize')!
    expect(() => resizeListener({}, 'nonexistent', 120, 40)).not.toThrow()
  })

  it('updates the session cwd when OSC 7 output is detected', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    vi.mocked(processOsc7BufferMock).mockReturnValueOnce({
      cwd: '/workspace/new-cwd',
      remainingBuffer: '',
    })

    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })
    latestOnData?.('prompt output')

    expect(mockSender.send).toHaveBeenLastCalledWith(
      'terminal:cwd-changed',
      spawnResult.sessionId,
      path.resolve('/workspace/new-cwd')
    )
  })

  it('cleans up active sessions before the app quits', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    beforeQuitHandler?.()

    const attachResult = await handlers.get('terminal:attach')!(
      { sender: mockSender },
      spawnResult.sessionId
    )
    expect(attachResult).toEqual({ success: false, error: 'Session not found' })
  })
})
