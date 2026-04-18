import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock terminalSessions before importing the component
vi.mock('./terminalSessions', () => ({
  getSessionId: vi.fn(),
  setSessionId: vi.fn(),
  removeSession: vi.fn(),
}))

// Mock xterm.js
const mockWrite = vi.fn()
const mockWriteln = vi.fn()
const mockOpen = vi.fn()
const mockDispose = vi.fn()
const mockLoadAddon = vi.fn()
const mockOnData = vi.fn(() => ({ dispose: vi.fn() }))

vi.mock('@xterm/xterm', () => {
  const TerminalClass = vi.fn(function (this: Record<string, unknown>) {
    this.write = mockWrite
    this.writeln = mockWriteln
    this.open = mockOpen
    this.dispose = mockDispose
    this.loadAddon = mockLoadAddon
    this.onData = mockOnData
    this.options = {}
  })
  return { Terminal: TerminalClass }
})

const mockFit = vi.fn()
const mockProposeDimensions = vi.fn(() => ({ cols: 120, rows: 30 }))

vi.mock('@xterm/addon-fit', () => {
  const FitAddonClass = vi.fn(function (this: Record<string, unknown>) {
    this.fit = mockFit
    this.proposeDimensions = mockProposeDimensions
  })
  return { FitAddon: FitAddonClass }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('./TerminalPane.css', () => ({}))

const mockInvoke = vi.fn()
const mockSend = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

const mockSpawn = vi.fn()
const mockAttach = vi.fn()
const mockTerminalWrite = vi.fn()
const mockTerminalResize = vi.fn()

let mockResizeObserverCallback: (() => void) | null = null
const mockResizeObserverDisconnect = vi.fn()

// Mock ResizeObserver globally with a proper constructor
vi.stubGlobal('ResizeObserver', function MockResizeObserver(this: unknown, callback: () => void) {
  mockResizeObserverCallback = callback
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: mockResizeObserverDisconnect,
  }
})

// Mock document.fonts (not available in happy-dom)
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', {
    value: { load: vi.fn().mockResolvedValue([]) },
    configurable: true,
  })
}

import { getSessionId, setSessionId, removeSession } from './terminalSessions'
import { TerminalPane } from './TerminalPane'

describe('TerminalPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockResizeObserverCallback = null
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: mockInvoke,
        send: mockSend,
        on: mockOn,
        off: mockOff,
      },
    })
    Object.defineProperty(window, 'terminal', {
      configurable: true,
      value: {
        spawn: mockSpawn,
        attach: mockAttach,
        write: mockTerminalWrite,
        resize: mockTerminalResize,
      },
    })

    // Default: no existing session, successful spawn
    vi.mocked(getSessionId).mockReturnValue(undefined)
    mockSpawn.mockResolvedValue({ success: true, sessionId: 'new-sess-123' })
    mockAttach.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders the terminal pane container', () => {
    const { container } = render(<TerminalPane viewKey="test-key" />)
    expect(container.querySelector('.terminal-pane')).toBeInTheDocument()
  })

  it('spawns a new PTY session when no existing session', async () => {
    render(<TerminalPane viewKey="test-key" cwd="/test/path" />)

    // Wait for the async initSession to complete
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/test/path',
        })
      )
    })

    expect(setSessionId).toHaveBeenCalledWith('test-key', 'new-sess-123')
  })

  it('passes startupCommand to spawn', async () => {
    render(<TerminalPane viewKey="test-key" cwd="/test" startupCommand="gh copilot" />)

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          startupCommand: 'gh copilot',
        })
      )
    })
  })

  it('reconnects to existing session via terminal:attach', async () => {
    vi.mocked(getSessionId).mockReturnValue('existing-sess')
    mockAttach.mockResolvedValue({ success: true, buffer: 'buffered output', alive: true })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockAttach).toHaveBeenCalledWith('existing-sess')
    })

    expect(mockWrite).toHaveBeenCalledWith('buffered output')
  })

  it('shows exit message when reconnecting to dead session', async () => {
    vi.mocked(getSessionId).mockReturnValue('dead-sess')
    mockAttach.mockResolvedValue({ success: true, buffer: '', alive: false })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockAttach).toHaveBeenCalledWith('dead-sess')
    })

    expect(mockWriteln).toHaveBeenCalledWith('\r\n\x1b[90m[Process has exited]\x1b[0m')
  })

  it('spawns fresh session when attach fails', async () => {
    vi.mocked(getSessionId).mockReturnValue('stale-sess')
    mockAttach.mockResolvedValueOnce({ success: false, error: 'gone' })
    mockSpawn.mockResolvedValueOnce({ success: true, sessionId: 'fresh-sess' })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(removeSession).toHaveBeenCalledWith('test-key')
    })

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(expect.any(Object))
    })
  })

  it('shows error when spawn fails', async () => {
    mockSpawn.mockResolvedValue({ success: false, error: 'No PTY available' })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockWriteln).toHaveBeenCalledWith(
        expect.stringContaining('Failed to spawn terminal: No PTY available')
      )
    })
  })

  it('shows generic error when spawn fails without message', async () => {
    mockSpawn.mockResolvedValue({ success: false })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('Unknown error'))
    })
  })

  it('registers IPC listeners for terminal:data and terminal:exit after init', async () => {
    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:data', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('terminal:exit', expect.any(Function))
    })
  })

  it('removes IPC listeners on unmount', async () => {
    const { unmount } = render(<TerminalPane viewKey="test-key" />)

    // Wait for deferred listener registration before unmounting
    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    })
    unmount()

    expect(mockOff).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    expect(mockOff).toHaveBeenCalledWith('terminal:exit', expect.any(Function))
  })

  it('disposes terminal on unmount', () => {
    const { unmount } = render(<TerminalPane viewKey="test-key" />)
    unmount()
    expect(mockDispose).toHaveBeenCalled()
  })

  it('forwards keystroke data via fire-and-forget send', async () => {
    render(<TerminalPane viewKey="test-key" />)

    // Wait for session to be established
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(expect.any(Object))
    })

    // Simulate the onData callback being fired with user input
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDataCallback = (mockOnData.mock.calls as any)[0][0] as (data: string) => void
    expect(onDataCallback).toBeDefined()
    onDataCallback('hello')

    expect(mockTerminalWrite).toHaveBeenCalledWith('new-sess-123', 'hello')
  })

  it('does not forward keystrokes when no session is active', () => {
    // Make spawn return no session
    mockSpawn.mockResolvedValue({ success: false })

    render(<TerminalPane viewKey="test-key" />)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDataCallback = (mockOnData.mock.calls as any)[0][0] as (data: string) => void
    expect(onDataCallback).toBeDefined()
    onDataCallback('test')

    // write should not be called (no session ID)
    expect(mockTerminalWrite).not.toHaveBeenCalled()
  })

  it('sends resize events when dimensions change', async () => {
    render(<TerminalPane viewKey="test-key" />)

    // Wait for session to be established
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(expect.any(Object))
    })

    // Trigger the ResizeObserver callback
    const resizeCallback = mockResizeObserverCallback
    expect(resizeCallback).toBeDefined()

    // Fire the resize callback
    resizeCallback!()

    // Advance timers to trigger the debounced resize
    await vi.advanceTimersByTimeAsync(150)

    expect(mockFit).toHaveBeenCalled()
    expect(mockTerminalResize).toHaveBeenCalledWith('new-sess-123', 120, 30)
  })

  it('deduplicates resize events when dimensions do not change', async () => {
    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(expect.any(Object))
    })

    const resizeCallback = mockResizeObserverCallback!

    // First resize
    resizeCallback()
    await vi.advanceTimersByTimeAsync(150)
    expect(mockTerminalResize).toHaveBeenCalledWith('new-sess-123', 120, 30)

    mockTerminalResize.mockClear()

    // Second resize with same dimensions — should not send
    resizeCallback()
    await vi.advanceTimersByTimeAsync(150)
    expect(mockTerminalResize).not.toHaveBeenCalled()
  })

  it('calls onExit callback when session exits', async () => {
    const onExit = vi.fn()
    render(<TerminalPane viewKey="test-key" onExit={onExit} />)

    // Wait for session + deferred listener registration
    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:exit', expect.any(Function))
    })

    // Simulate terminal:exit IPC event
    const exitHandler = mockOn.mock.calls.find(c => c[0] === 'terminal:exit')?.[1]
    expect(exitHandler).toBeDefined()

    // Trigger with matching session ID
    exitHandler(null, 'new-sess-123', 0)

    expect(mockWriteln).toHaveBeenCalledWith(
      expect.stringContaining('[Process exited with code 0]')
    )
    expect(onExit).toHaveBeenCalledWith(0)
  })

  it('writes PTY data to terminal when session IDs match', async () => {
    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    })

    const dataHandler = mockOn.mock.calls.find(c => c[0] === 'terminal:data')?.[1]
    expect(dataHandler).toBeDefined()

    dataHandler(null, 'new-sess-123', 'hello world')
    expect(mockWrite).toHaveBeenCalledWith('hello world')
  })

  it('ignores PTY data for non-matching session IDs', async () => {
    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    })

    mockWrite.mockClear()
    const dataHandler = mockOn.mock.calls.find(c => c[0] === 'terminal:data')?.[1]
    dataHandler(null, 'different-session', 'should not appear')
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('writes error to terminal when initSession throws', async () => {
    mockSpawn.mockRejectedValue(new Error('IPC channel destroyed'))

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockWriteln).toHaveBeenCalledWith(
        expect.stringContaining('[Failed to initialize terminal session]')
      )
    })
  })

  it('replays buffered output from post-spawn attach', async () => {
    mockSpawn.mockResolvedValueOnce({ success: true, sessionId: 'sess-1', cwd: '/resolved/path' })
    mockAttach.mockResolvedValueOnce({ success: true, buffer: 'initial output', cursor: 7 })

    render(<TerminalPane viewKey="test-key" cwd="/test" />)

    await vi.waitFor(() => {
      expect(mockAttach).toHaveBeenCalledWith('sess-1')
    })

    expect(mockWrite).toHaveBeenCalledWith('initial output')
  })

  it('skips data events with seq <= attach cursor to prevent duplicates', async () => {
    vi.mocked(getSessionId).mockReturnValue('existing-sess')
    mockAttach.mockResolvedValue({
      success: true,
      buffer: 'buffered output',
      cursor: 5,
      alive: true,
    })

    render(<TerminalPane viewKey="test-key" />)

    await vi.waitFor(() => {
      expect(mockOn).toHaveBeenCalledWith('terminal:data', expect.any(Function))
    })

    mockWrite.mockClear()
    const dataHandler = mockOn.mock.calls.find(c => c[0] === 'terminal:data')?.[1]
    expect(dataHandler).toBeDefined()

    // Events with seq <= 5 (the attach cursor) should be skipped
    dataHandler(null, 'existing-sess', 'old data 1', 3)
    dataHandler(null, 'existing-sess', 'old data 2', 5)
    expect(mockWrite).not.toHaveBeenCalled()

    // Events with seq > 5 should pass through
    dataHandler(null, 'existing-sess', 'new data', 6)
    expect(mockWrite).toHaveBeenCalledWith('new data')
  })
})
