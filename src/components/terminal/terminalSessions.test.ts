import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Reset module state between tests by re-importing
let getSessionId: typeof import('./terminalSessions').getSessionId
let setSessionId: typeof import('./terminalSessions').setSessionId
let removeSession: typeof import('./terminalSessions').removeSession
let killTerminalSession: typeof import('./terminalSessions').killTerminalSession

const mockInvoke = vi.fn()
const mockKill = vi.fn()

describe('terminalSessions', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockInvoke.mockClear()
    mockKill.mockClear()
    mockInvoke.mockResolvedValue(undefined)
    mockKill.mockResolvedValue(undefined)
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: mockInvoke },
    })
    Object.defineProperty(window, 'terminal', {
      configurable: true,
      value: { kill: mockKill },
    })
    const mod = await import('./terminalSessions')
    getSessionId = mod.getSessionId
    setSessionId = mod.setSessionId
    removeSession = mod.removeSession
    killTerminalSession = mod.killTerminalSession
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns undefined for unknown viewKey', () => {
    expect(getSessionId('unknown-key')).toBeUndefined()
  })

  it('stores and retrieves a session ID', () => {
    setSessionId('view-1', 'session-abc')
    expect(getSessionId('view-1')).toBe('session-abc')
  })

  it('overwrites an existing session ID', () => {
    setSessionId('view-1', 'session-abc')
    setSessionId('view-1', 'session-def')
    expect(getSessionId('view-1')).toBe('session-def')
  })

  it('removes a session by viewKey', () => {
    setSessionId('view-1', 'session-abc')
    removeSession('view-1')
    expect(getSessionId('view-1')).toBeUndefined()
  })

  it('removeSession is no-op for unknown viewKey', () => {
    expect(() => removeSession('nonexistent')).not.toThrow()
  })

  it('killTerminalSession invokes terminal:kill and removes the entry', async () => {
    setSessionId('view-1', 'session-abc')
    killTerminalSession('view-1')

    expect(mockKill).toHaveBeenCalledWith('session-abc')
    // Mapping is removed synchronously before the IPC call
    expect(getSessionId('view-1')).toBeUndefined()
  })

  it('killTerminalSession is no-op for unknown viewKey', () => {
    killTerminalSession('nonexistent')
    expect(mockKill).not.toHaveBeenCalled()
  })

  it('killTerminalSession logs error and retains mapping on invoke rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockKill.mockRejectedValueOnce(new Error('IPC gone'))
    setSessionId('view-1', 'session-abc')

    // Should not throw
    expect(() => killTerminalSession('view-1')).not.toThrow()
    // Mapping is restored because the kill failed — PTY may still be running
    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    expect(getSessionId('view-1')).toBe('session-abc')
    consoleSpy.mockRestore()
  })

  it('manages multiple sessions independently', () => {
    setSessionId('view-a', 'sess-1')
    setSessionId('view-b', 'sess-2')
    setSessionId('view-c', 'sess-3')

    expect(getSessionId('view-a')).toBe('sess-1')
    expect(getSessionId('view-b')).toBe('sess-2')
    expect(getSessionId('view-c')).toBe('sess-3')

    removeSession('view-b')
    expect(getSessionId('view-a')).toBe('sess-1')
    expect(getSessionId('view-b')).toBeUndefined()
    expect(getSessionId('view-c')).toBe('sess-3')
  })
})
