import path from 'path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => '/home/user'), quit: vi.fn(), on: vi.fn() },
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs', () => ({
  accessSync: vi.fn(),
  existsSync: vi.fn(() => true),
  constants: { R_OK: 4, X_OK: 1 },
  statSync: vi.fn((candidate: string) => ({
    isDirectory: () => !String(candidate).toLowerCase().endsWith('.exe'),
    isFile: () => String(candidate).toLowerCase().endsWith('.exe'),
  })),
}))

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => {
    const req = (mod: string) => {
      if (mod === 'node-pty') {
        return {
          spawn: vi.fn(() => ({
            onData: vi.fn(() => ({ dispose: vi.fn() })),
            onExit: vi.fn(() => ({ dispose: vi.fn() })),
            write: vi.fn(),
            resize: vi.fn(),
            kill: vi.fn(),
          })),
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
  buildTerminalStartupCommand: vi.fn(() => undefined),
  buildPtySpawnOptions: vi.fn(() => ({ env: {} })),
  findRepoPath: vi.fn(() => null),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessageWithFallback: vi.fn((err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback
  ),
}))

import { ipcMain } from 'electron'
import { accessSync, existsSync, statSync } from 'node:fs'
import { registerTerminalHandlers } from './terminalHandlers'

describe('terminalHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listeners: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(accessSync).mockImplementation(() => undefined)
    vi.mocked(existsSync).mockImplementation(() => true)
    vi.mocked(statSync).mockImplementation(
      candidate =>
        ({
          isDirectory: () => !String(candidate).toLowerCase().endsWith('.exe'),
          isFile: () => String(candidate).toLowerCase().endsWith('.exe'),
        }) as ReturnType<typeof statSync>
    )
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
  })

  it('terminal:resize ignores non-existent sessions', () => {
    const resizeListener = listeners.get('terminal:resize')!
    expect(() => resizeListener({}, 'nonexistent', 120, 40)).not.toThrow()
  })

  it('terminal:kill kills and cleans up session', async () => {
    // Spawn a session first
    const spawnHandler = handlers.get('terminal:spawn')!
    const mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    }
    const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

    // Then kill it
    const killHandler = handlers.get('terminal:kill')!
    await expect(killHandler({}, spawnResult.sessionId)).resolves.not.toThrow()

    // Writing to killed session should be silently ignored
    const writeListener = listeners.get('terminal:write')!
    expect(() => writeListener({}, spawnResult.sessionId, 'hello')).not.toThrow()
  })

  it('terminal:kill ignores non-existent sessions', async () => {
    const killHandler = handlers.get('terminal:kill')!
    await expect(killHandler({}, 'nonexistent-id')).resolves.not.toThrow()
  })

  it('registers before-quit handler via app.on', async () => {
    const { app } = await import('electron')
    expect(app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
  })

  function createTrackedPtyHarness() {
    type MockPty = {
      onData: ReturnType<typeof vi.fn>
      onExit: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
      resize: ReturnType<typeof vi.fn>
      kill: ReturnType<typeof vi.fn>
      emitData: (data: string) => void
      emitExit: (exitCode: number) => void
    }
    const ptyProcesses: MockPty[] = []
    const spawn = vi.fn(() => {
      let onData: ((data: string) => void) | undefined
      let onExit: ((event: { exitCode: number }) => void) | undefined

      const ptyProcess = {
        onData: vi.fn((callback: (data: string) => void) => {
          onData = callback
          return { dispose: vi.fn() }
        }),
        onExit: vi.fn((callback: (event: { exitCode: number }) => void) => {
          onExit = callback
          return { dispose: vi.fn() }
        }),
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        emitData: (data: string) => onData?.(data),
        emitExit: (exitCode: number) => onExit?.({ exitCode }),
      }

      ptyProcesses.push(ptyProcess)
      return ptyProcess
    })

    const createRequireImpl = () => {
      const req = (mod: string) => {
        if (mod === 'node-pty') {
          return { spawn }
        }
        if (mod.includes('node-pty/lib/utils')) {
          return { loadNativeModule: vi.fn(() => ({ dir: '', module: {} })) }
        }
        throw new Error(`Unknown module: ${mod}`)
      }
      req.resolve = vi.fn(() => '/fake/node-pty/package.json')
      return req
    }

    return { ptyProcesses, spawn, createRequireImpl }
  }

  async function registerFreshTerminalHandlers(
    createRequireImpl?: ReturnType<typeof createTrackedPtyHarness>['createRequireImpl'],
    processOsc7Impl?: (
      buffer: string,
      data: string
    ) => {
      cwd: string | null
      remainingBuffer: string
    }
  ) {
    vi.resetModules()

    const { ipcMain } = await import('electron')
    const { createRequire } = await import('node:module')
    const terminalPathUtils = await import('../../src/utils/terminalPathUtils')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshHandlers = new Map<string, (...args: any[]) => any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshListeners = new Map<string, (...args: any[]) => any>()

    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      freshHandlers.set(channel, handler)
    })
    vi.mocked(ipcMain.on).mockImplementation((channel, handler) => {
      freshListeners.set(channel, handler)
      return ipcMain
    })

    const mockCreateRequire = vi.mocked(createRequire)
    const originalCreateRequireImpl = mockCreateRequire.getMockImplementation()
    const mockProcessOsc7Buffer = vi.mocked(terminalPathUtils.processOsc7Buffer)
    const originalProcessOsc7Impl = mockProcessOsc7Buffer.getMockImplementation()

    if (createRequireImpl) {
      mockCreateRequire.mockImplementation(
        createRequireImpl as unknown as (path: string | URL) => NodeRequire
      )
    }
    mockProcessOsc7Buffer.mockImplementation(
      processOsc7Impl ?? (() => ({ cwd: null, remainingBuffer: '' }))
    )

    const { registerTerminalHandlers: freshRegister } = await import('./terminalHandlers')
    freshRegister()

    return {
      freshHandlers,
      freshListeners,
      restore: () => {
        if (originalCreateRequireImpl) {
          mockCreateRequire.mockImplementation(originalCreateRequireImpl)
        }
        mockProcessOsc7Buffer.mockReset()
        if (originalProcessOsc7Impl) {
          mockProcessOsc7Buffer.mockImplementation(originalProcessOsc7Impl)
        } else {
          mockProcessOsc7Buffer.mockReturnValue({ cwd: null, remainingBuffer: '' })
        }
      },
    }
  }

  it('terminal:spawn reports safe launch context when Windows denies process creation', async () => {
    const ptyHarness = createTrackedPtyHarness()
    ptyHarness.spawn.mockImplementation(() => {
      throw new Error('Cannot create process, error code: 5')
    })

    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    const originalPlatform = process.platform
    const originalPath = process.env.PATH
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      process.env.PATH = 'C:\\Program Files\\PowerShell\\7'

      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cwd: 'C:\\repos\\SFL', cols: 80, rows: 24 }
      )

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Cannot create process, error code: 5'),
      })
      expect(result.error).toContain('stage=native-pty-spawn')
      expect(result.error).toContain('shell=C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      expect(result.error).toContain('cwdExists=true')
      expect(result.error).toContain('cwdAccessible=true')
      expect(result.error).not.toContain('PATH=')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      process.env.PATH = originalPath
      restore()
    }
  })

  it('terminal:spawn distinguishes an existing but inaccessible cwd in diagnostics', async () => {
    const ptyHarness = createTrackedPtyHarness()
    ptyHarness.spawn.mockImplementation(() => {
      throw new Error('Cannot create process, error code: 5')
    })

    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    const originalPlatform = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      vi.mocked(accessSync).mockImplementation(candidate => {
        if (String(candidate).includes('restricted')) {
          throw Object.assign(new Error('access denied'), { code: 'EACCES' })
        }
      })

      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cwd: 'C:\\repos\\restricted', cols: 80, rows: 24 }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('cwdExists=true')
      expect(result.error).toContain('cwdAccessible=false')
      expect(result.error).toContain('cwdFallback=true')
      expect(result.error).toContain('effectiveCwdExists=true')
      expect(result.error).toContain('effectiveCwdAccessible=true')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      restore()
    }
  })

  it('terminal:spawn resolves pwsh.exe to an accessible file instead of a PATH directory', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    const originalPath = process.env.PATH
    const originalPlatform = process.platform
    try {
      process.env.PATH = 'C:\\blocked;C:\\Program Files\\PowerShell\\7'
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

      const { statSync } = await import('node:fs')
      vi.mocked(statSync).mockImplementation(
        candidate =>
          ({
            isDirectory: () => String(candidate) === 'C:\\blocked\\pwsh.exe',
            isFile: () => String(candidate) !== 'C:\\blocked\\pwsh.exe',
          }) as ReturnType<typeof statSync>
      )

      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cols: 80, rows: 24 }
      )

      expect(result.success).toBe(true)
      expect(ptyHarness.spawn).toHaveBeenCalledWith(
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        expect.any(Array),
        expect.any(Object)
      )
    } finally {
      process.env.PATH = originalPath
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      restore()
    }
  })

  it('terminal:spawn resolves powershell.exe when pwsh.exe is unavailable', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    const originalPath = process.env.PATH
    const originalPlatform = process.platform
    try {
      process.env.PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0'
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

      const { existsSync } = await import('node:fs')
      vi.mocked(existsSync).mockImplementation(candidate => !String(candidate).endsWith('pwsh.exe'))

      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cols: 80, rows: 24 }
      )

      expect(result.success).toBe(true)
      expect(ptyHarness.spawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        expect.any(Array),
        expect.any(Object)
      )
    } finally {
      process.env.PATH = originalPath
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      restore()
    }
  })

  it('terminal:spawn falls back to the default cwd when cwd validation throws', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

    const originalUserProfile = process.env.USERPROFILE
    process.env.USERPROFILE = 'C:\\default-home'

    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const { statSync } = await import('node:fs')
      vi.mocked(statSync).mockImplementationOnce(() => {
        throw new Error('stat failed')
      })

      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cwd: 'C:\\broken-path', cols: 80, rows: 24 }
      )

      expect(result.cwd).toBe('C:\\default-home')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
      restore()
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE
      } else {
        process.env.USERPROFILE = originalUserProfile
      }
    }
  })

  it('terminal:spawn returns an error when node-pty fails to load at module scope', async () => {
    const createRequireImpl = () => {
      const req = (mod: string) => {
        if (mod === 'node-pty') {
          throw new Error('node-pty unavailable')
        }
        if (mod.includes('node-pty/lib/utils')) {
          return { loadNativeModule: vi.fn(() => ({ dir: '', module: {} })) }
        }
        throw new Error(`Unknown module: ${mod}`)
      }
      req.resolve = vi.fn(() => '/fake/node-pty/package.json')
      return req
    }

    const { freshHandlers, restore } = await registerFreshTerminalHandlers(createRequireImpl)

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const result = await spawnHandler(
        { sender: { isDestroyed: vi.fn(() => false), send: vi.fn() } },
        { cols: 80, rows: 24 }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('node-pty unavailable')
      expect(result.error).toContain('stage=native-pty-load')
    } finally {
      restore()
    }
  })

  it('terminal:write forwards data to alive sessions', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, freshListeners, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

      freshListeners.get('terminal:write')!({}, spawnResult.sessionId, 'hello from test')

      expect(ptyHarness.ptyProcesses[0].write).toHaveBeenCalledWith('hello from test')
    } finally {
      restore()
    }
  })

  it('terminal:attach returns truncated scrollback when the buffer exceeds the limit', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const attachHandler = freshHandlers.get('terminal:attach')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })
      const oversizedChunk = 'x'.repeat(100_001)

      ptyHarness.ptyProcesses[0].emitData(oversizedChunk)

      const attachResult = await attachHandler({ sender: mockSender }, spawnResult.sessionId)
      expect(attachResult.buffer).toHaveLength(100_000)
      expect(attachResult.buffer).toBe(oversizedChunk.slice(-100_000))
    } finally {
      restore()
    }
  })

  it('terminal:spawn schedules startupCommand writes for alive sessions', async () => {
    vi.useFakeTimers()
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      await spawnHandler(
        { sender: mockSender },
        { cols: 80, rows: 24, startupCommand: 'echo hello' }
      )

      expect(ptyHarness.ptyProcesses[0].write).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      expect(ptyHarness.ptyProcesses[0].write).toHaveBeenCalledWith('echo hello\r')
    } finally {
      restore()
      vi.useRealTimers()
    }
  })

  it('terminal:spawn sends PowerShell setup after launch instead of in process args', async () => {
    vi.useFakeTimers()
    const terminalPathUtils = await import('../../src/utils/terminalPathUtils')
    vi.mocked(terminalPathUtils.buildTerminalStartupCommand).mockReturnValueOnce('setup-prompt')
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      await spawnHandler(
        { sender: mockSender },
        { cols: 80, rows: 24, startupCommand: 'echo hello' }
      )

      vi.advanceTimersByTime(500)

      expect(ptyHarness.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.arrayContaining(['-EncodedCommand']),
        expect.any(Object)
      )
      expect(ptyHarness.ptyProcesses[0].write).toHaveBeenCalledWith('setup-prompt;echo hello\r')
    } finally {
      restore()
      vi.useRealTimers()
    }
  })

  it('terminal PTY callbacks skip IPC sends for destroyed renderers', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const attachHandler = freshHandlers.get('terminal:attach')!
      const destroyedSender = { isDestroyed: vi.fn(() => true), send: vi.fn() }
      const spawnResult = await spawnHandler({ sender: destroyedSender }, { cols: 80, rows: 24 })

      ptyHarness.ptyProcesses[0].emitData('hello')
      ptyHarness.ptyProcesses[0].emitExit(23)

      expect(destroyedSender.send).not.toHaveBeenCalled()

      const attachResult = await attachHandler({ sender: destroyedSender }, spawnResult.sessionId)
      expect(attachResult.alive).toBe(false)
    } finally {
      restore()
    }
  })

  it('terminal PTY data pushes cwd changes from OSC 7 sequences', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const newCwd = 'C:\\repos\\updated'
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl,
      () => ({ cwd: newCwd, remainingBuffer: '' })
    )

    try {
      const { IPC_PUSH } = await import('../../src/ipc/contracts')
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      const spawnResult = await spawnHandler(
        { sender: mockSender },
        { cwd: 'C:\\repos\\initial', cols: 80, rows: 24 }
      )
      const osc7Data = '\u001b]7;file:///C:/repos/updated\u0007'

      ptyHarness.ptyProcesses[0].emitData(osc7Data)

      expect(mockSender.send).toHaveBeenNthCalledWith(
        1,
        IPC_PUSH.TERMINAL_DATA,
        spawnResult.sessionId,
        osc7Data,
        1
      )
      expect(mockSender.send).toHaveBeenNthCalledWith(
        2,
        IPC_PUSH.TERMINAL_CWD_CHANGED,
        spawnResult.sessionId,
        path.resolve(newCwd)
      )
    } finally {
      restore()
    }
  })

  it('terminal:resize swallows PTY resize errors', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, freshListeners, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      const spawnResult = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })

      ptyHarness.ptyProcesses[0].resize.mockImplementationOnce(() => {
        throw new Error('resize failed')
      })

      expect(() => {
        freshListeners.get('terminal:resize')!({}, spawnResult.sessionId, 120, 40)
      }).not.toThrow()
      expect(ptyHarness.ptyProcesses[0].resize).toHaveBeenCalledWith(120, 40)
    } finally {
      restore()
    }
  })

  it('before-quit handler cleans up active sessions', async () => {
    const ptyHarness = createTrackedPtyHarness()
    const { freshHandlers, restore } = await registerFreshTerminalHandlers(
      ptyHarness.createRequireImpl
    )

    try {
      const { app } = await import('electron')
      const spawnHandler = freshHandlers.get('terminal:spawn')!
      const attachHandler = freshHandlers.get('terminal:attach')!
      const mockSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
      const firstSession = await spawnHandler({ sender: mockSender }, { cols: 80, rows: 24 })
      const secondSession = await spawnHandler({ sender: mockSender }, { cols: 100, rows: 30 })
      const beforeQuit = (vi.mocked(app.on).mock.calls as [string, () => void][])
        .filter(([eventName]) => eventName === 'before-quit')
        .at(-1)?.[1]

      expect(beforeQuit).toBeDefined()

      beforeQuit!()

      expect(ptyHarness.ptyProcesses[0].kill).toHaveBeenCalled()
      expect(ptyHarness.ptyProcesses[1].kill).toHaveBeenCalled()
      await expect(attachHandler({ sender: mockSender }, firstSession.sessionId)).resolves.toEqual({
        success: false,
        error: 'Session not found',
      })
      await expect(attachHandler({ sender: mockSender }, secondSession.sessionId)).resolves.toEqual(
        {
          success: false,
          error: 'Session not found',
        }
      )
    } finally {
      restore()
    }
  })

  it('patches node-pty loadNativeModule to fall back to process.dlopen', async () => {
    const originalDlopen = process.dlopen
    const dlopenSpy = vi.fn(
      (nativeModule: { exports: Record<string, unknown> }, nativePath: string) => {
        nativeModule.exports.loadedFrom = nativePath
      }
    )
    const ptyUtils = {
      loadNativeModule: vi.fn((_name: string): { dir: string; module: Record<string, unknown> } => {
        throw new Error('require is not defined')
      }),
    }
    const createRequireImpl = () => {
      const req = (mod: string) => {
        if (mod === 'node-pty') {
          return { spawn: vi.fn() }
        }
        if (mod.includes('node-pty/lib/utils')) {
          return ptyUtils
        }
        throw new Error(`Unknown module: ${mod}`)
      }
      req.resolve = vi.fn(() => 'C:\\fake\\node-pty\\package.json')
      return req
    }

    ;(process as { dlopen: typeof process.dlopen }).dlopen = dlopenSpy as typeof process.dlopen
    const { restore } = await registerFreshTerminalHandlers(
      createRequireImpl as unknown as Parameters<typeof registerFreshTerminalHandlers>[0]
    )

    try {
      const result = ptyUtils.loadNativeModule('conpty')

      expect(dlopenSpy).toHaveBeenCalledTimes(1)
      expect(dlopenSpy.mock.calls[0]?.[1]).toContain('prebuilds')
      expect(dlopenSpy.mock.calls[0]?.[1]).toMatch(/conpty\.node$/)
      expect(result.dir).toContain('prebuilds')
      expect(result.module).toEqual({ loadedFrom: dlopenSpy.mock.calls[0]?.[1] })
    } finally {
      restore()
      ;(process as { dlopen: typeof process.dlopen }).dlopen = originalDlopen
    }
  })
})
