import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  buildPtySpawnOptions: vi.fn(() => ({ env: {} })),
  findRepoPath: vi.fn(() => null),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessageWithFallback: vi.fn((_err: unknown, fallback: string) => fallback),
}))

import { ipcMain } from 'electron'
import { registerTerminalHandlers } from './terminalHandlers'

describe('terminalHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listeners: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('terminal:spawn creates a session and returns success', async () => {
    const handler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const result = await handler({ sender }, { cwd: '/valid/path', cols: 80, rows: 24 })
    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
    expect(typeof result.sessionId).toBe('string')
  })

  it('terminal:spawn uses default cwd when invalid cwd provided', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(false) // invalid cwd
    const handler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const result = await handler({ sender }, { cwd: '/nonexistent', cols: 80, rows: 24 })
    expect(result.success).toBe(true)
  })

  it('terminal:spawn with startup command schedules the command', async () => {
    const handler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const result = await handler(
      { sender },
      { cwd: '/valid/path', cols: 80, rows: 24, startupCommand: 'echo hello' }
    )
    expect(result.success).toBe(true)
  })

  it('terminal:attach returns session buffer for known session', async () => {
    // First spawn a session
    const spawnHandler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender }, { cwd: '/valid/path' })

    // Then attach to it
    const attachHandler = handlers.get('terminal:attach')!
    const newSender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const result = await attachHandler({ sender: newSender }, spawnResult.sessionId)
    expect(result.success).toBe(true)
    expect(result.buffer).toBeDefined()
    expect(result.alive).toBe(true)
  })

  it('terminal:kill cleans up a spawned session', async () => {
    // Spawn first
    const spawnHandler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender }, { cwd: '/valid/path' })

    // Kill it
    const killHandler = handlers.get('terminal:kill')!
    const result = await killHandler({}, spawnResult.sessionId)
    expect(result).toEqual({ success: true })

    // Attach should fail now
    const attachHandler = handlers.get('terminal:attach')!
    const attachResult = await attachHandler({ sender }, spawnResult.sessionId)
    expect(attachResult).toEqual({ success: false, error: 'Session not found' })
  })

  it('terminal:write forwards data to alive session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender }, { cwd: '/valid/path' })

    const writeListener = listeners.get('terminal:write')!
    // Should not throw for a valid session
    writeListener({}, spawnResult.sessionId, 'ls\r')
  })

  it('terminal:write ignores unknown sessions', () => {
    const writeListener = listeners.get('terminal:write')!
    // Should not throw
    writeListener({}, 'no-such-session', 'data')
  })

  it('terminal:resize resizes alive session', async () => {
    const spawnHandler = handlers.get('terminal:spawn')!
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    const spawnResult = await spawnHandler({ sender }, { cwd: '/valid/path' })

    const resizeListener = listeners.get('terminal:resize')!
    // Should not throw
    resizeListener({}, spawnResult.sessionId, 120, 40)
  })

  it('terminal:resize ignores unknown sessions', () => {
    const resizeListener = listeners.get('terminal:resize')!
    // Should not throw
    resizeListener({}, 'no-such-session', 120, 40)
  })
})
