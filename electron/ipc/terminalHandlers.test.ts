import { describe, it, expect, vi, beforeEach } from 'vitest'

const ptyState = vi.hoisted(() => {
  const state = {
    callbacks: {} as {
      data?: (data: string) => void
      exit?: (info: { exitCode: number }) => void
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    spawn: vi.fn(),
  }

  state.spawn.mockImplementation(() => {
    state.callbacks = {}
    state.write = vi.fn()
    state.resize = vi.fn()
    state.kill = vi.fn()

    return {
      onData: vi.fn((cb: (data: string) => void) => {
        state.callbacks.data = cb
        return { dispose: vi.fn() }
      }),
      onExit: vi.fn((cb: (info: { exitCode: number }) => void) => {
        state.callbacks.exit = cb
        return { dispose: vi.fn() }
      }),
      write: state.write,
      resize: state.resize,
      kill: state.kill,
    }
  })

  return state
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
        return {
          spawn: ptyState.spawn,
        }
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

import { ipcMain } from 'electron'
import { IPC_PUSH } from '../../src/ipc/contracts'
import { registerTerminalHandlers } from './terminalHandlers'

describe('terminalHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listeners: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    ptyState.callbacks = {}
    ptyState.write = vi.fn()
    ptyState.resize = vi.fn()
    ptyState.kill = vi.fn()
    ptyState.spawn.mockClear()
    handlers = new Map()
    listeners = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    vi.mocked(ipcMain.on).mockImplementation((channel, handler) => {
      listeners.set(channel, handler)
      return ipcMain
    })
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
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const result = await handler({ sender: mockSender }, { cols: 80, rows: 24 })
    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
    expect(result.cwd).toBeDefined()
  })

  it('terminal:spawn with valid cwd uses provided cwd', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const result = await handler({ sender: mockSender }, { cwd: '/valid/path', cols: 80, rows: 24 })
    expect(result.success).toBe(true)
  })

  it('terminal:spawn with startupCommand schedules command', async () => {
    const handler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const result = await handler(
      { sender: mockSender },
      { cols: 80, rows: 24, startupCommand: 'echo hello' }
    )
    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
  })

  it('terminal:attach returns session data for existing session', async () => {
    // First spawn a session
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    // Then attach to it
    const attachHandler = handlers.get('terminal:attach')!
    const result = await attachHandler({ sender: mockSender }, spawnResult.sessionId)
    expect(result.success).toBe(true)
    expect(result.buffer).toBeDefined()
    expect(typeof result.cursor).toBe('number')
    expect(result.alive).toBe(true)
  })

  it('terminal:kill cleans up an existing session', async () => {
    // First spawn a session
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    // Then kill it
    const killHandler = handlers.get('terminal:kill')!
    const result = await killHandler({}, spawnResult.sessionId)
    expect(result).toEqual({ success: true })
    expect(ptyState.kill).toHaveBeenCalled()

    // Verify it's gone
    const attachResult = await handlers.get('terminal:attach')!(
      { sender: mockSender },
      spawnResult.sessionId
    )
    expect(attachResult.success).toBe(false)
  })

  it('terminal:write writes data to existing session', async () => {
    // First spawn a session
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    // Then write to it (fire-and-forget, no error expected)
    const writeListener = listeners.get('terminal:write')!
    expect(() => writeListener({}, spawnResult.sessionId, 'hello')).not.toThrow()
    expect(ptyState.write).toHaveBeenCalledWith('hello')
  })

  it('terminal:write ignores writes to non-existent sessions', () => {
    const writeListener = listeners.get('terminal:write')!
    expect(() => writeListener({}, 'nonexistent', 'hello')).not.toThrow()
  })

  it('terminal:resize resizes an existing session', async () => {
    // First spawn a session
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    // Then resize
    const resizeListener = listeners.get('terminal:resize')!
    expect(() => resizeListener({}, spawnResult.sessionId, 120, 40)).not.toThrow()
    expect(ptyState.resize).toHaveBeenCalledWith(120, 40)
  })

  it('terminal:resize ignores non-existent sessions', () => {
    const resizeListener = listeners.get('terminal:resize')!
    expect(() => resizeListener({}, 'nonexistent', 120, 40)).not.toThrow()
  })

  it('processOsc7 updates cwd and notifies renderer when OSC 7 data is received', async () => {
    const { processOsc7Buffer } = await import('../../src/utils/terminalPathUtils')
    vi.mocked(processOsc7Buffer).mockReturnValueOnce({
      cwd: 'C:\\workspace\\repo',
      remainingBuffer: '',
    })

    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(ptyState.callbacks.data).toBeTypeOf('function')
    ptyState.callbacks.data!('\u001b]7;file:///C:/workspace/repo\u0007')

    expect(mockSender.send).toHaveBeenCalledWith(
      IPC_PUSH.TERMINAL_CWD_CHANGED,
      spawnResult.sessionId,
      'C:\\workspace\\repo'
    )
  })

  it('createTerminalSession forwards PTY data to the renderer', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(ptyState.callbacks.data).toBeTypeOf('function')
    ptyState.callbacks.data!('hello from pty')

    expect(mockSender.send).toHaveBeenCalledWith(
      IPC_PUSH.TERMINAL_DATA,
      spawnResult.sessionId,
      'hello from pty',
      1
    )
  })

  it('createTerminalSession forwards PTY exit to the renderer', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(ptyState.callbacks.exit).toBeTypeOf('function')
    ptyState.callbacks.exit!({ exitCode: 23 })

    expect(mockSender.send).toHaveBeenCalledWith(IPC_PUSH.TERMINAL_EXIT, spawnResult.sessionId, 23)
  })

  it('scheduleStartupCommand writes the startup command after 500ms', async () => {
    vi.useFakeTimers()
    try {
      const spawnHandler = handlers.get('terminal:spawn')!
      const mockSender = {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      }

      const spawnResult = await spawnHandler(
        { sender: mockSender },
        { cols: 80, rows: 24, startupCommand: 'echo hello' }
      )

      expect(spawnResult.success).toBe(true)
      expect(ptyState.write).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(499)
      expect(ptyState.write).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(ptyState.write).toHaveBeenCalledWith('echo hello\r')
    } finally {
      vi.useRealTimers()
    }
  })

  it('terminal:spawn returns an error when PTY spawn fails', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    ptyState.spawn.mockImplementationOnce(() => {
      throw new Error('spawn failed')
    })

    const result = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    expect(result).toEqual({ success: false, error: 'Failed to spawn terminal' })
  })
})
