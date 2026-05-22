import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import {
  getSessionId,
  setSessionId,
  removeSession,
  setTerminalPasteHandler,
  removeTerminalPasteHandler,
} from './terminalSessions'
import { IPC_PUSH } from '../../ipc/contracts'
import '@xterm/xterm/css/xterm.css'
import './TerminalPane.css'

interface TerminalPaneProps {
  /** Unique key for this terminal view (used to persist session across tab switches) */
  viewKey: string
  cwd?: string
  startupCommand?: string
  onExit?: (exitCode: number) => void
  onCwdChange?: (newCwd: string) => void
}

function resolveSpawnDimensions(dims: { cols?: number; rows?: number } | undefined): {
  cols: number
  rows: number
} {
  return {
    /* v8 ignore start */
    cols: dims?.cols || 120,
    rows: dims?.rows || 30,
    /* v8 ignore stop */
  }
}

function applyReattachData(
  term: Terminal,
  result: { buffer?: string; cursor?: number; alive?: boolean }
) {
  if (result.buffer) term.write(result.buffer)
  if (result.cursor != null) return result.cursor
  return 0
}

function isDimensionChanged(
  d: { cols: number; rows: number },
  last: { cols: number; rows: number } | null
): boolean {
  if (!last) return true
  return last.cols !== d.cols || last.rows !== d.rows
}

function getSpawnErrorMessage(error: string | undefined): string {
  return error || 'Unknown error'
}

function notifyCwdChange(cwd: string | undefined, cb: ((newCwd: string) => void) | undefined) {
  if (cwd) cb?.(cwd)
}

export function TerminalPane({
  viewKey,
  cwd,
  startupCommand,
  onExit,
  onCwdChange,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null)
  /** Cursor from the last attach — data events with seq ≤ this are already in the buffer */
  const attachCursorRef = useRef<number>(0)

  useEffect(() => {
    // Per-invocation flag — set to false in cleanup so stale async flows
    // from React StrictMode's double-mount don't register duplicate listeners.
    let active = true
    const container = containerRef.current
    /* v8 ignore start */
    if (!container) return
    /* v8 ignore stop */

    const NERD_FONT_FAMILY = "'CaskaydiaCove NFM', 'CaskaydiaCove NF', 'FiraCode Nerd Font Mono'"
    const FALLBACK_FAMILY = "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace"
    const FULL_FONT_FAMILY = `${NERD_FONT_FAMILY}, ${FALLBACK_FAMILY}`

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: FULL_FONT_FAMILY,
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const unicode11Addon = new Unicode11Addon()
    term.loadAddon(unicode11Addon)

    term.open(container)

    // Activate Unicode 11 width tables so character widths match ConPTY's
    // expectations — fixes TUI rendering in apps like Microsoft Edit.
    term.unicode.activeVersion = '11'

    // Cursor-line highlight: apply a subtle background to the row containing
    // the cursor, replicating the visual cue seen in Windows Terminal.
    const applyCursorRowHighlight = () => {
      const rowContainer = container.querySelector('.xterm-rows')
      if (!rowContainer) return
      const prev = rowContainer.querySelector('.xterm-cursor-row')
      if (prev) prev.classList.remove('xterm-cursor-row')
      const cursorY = term.buffer.active.cursorY
      const row = rowContainer.children[cursorY]
      if (row) row.classList.add('xterm-cursor-row')
    }
    const cursorMoveDisposable = term.onCursorMove(applyCursorRowHighlight)
    const renderDisposable = term.onRender(applyCursorRowHighlight)

    // Force xterm.js to re-measure glyphs once the Nerd Font is available.
    // Canvas-based renderers measure at open() time; if the font hasn't loaded
    // yet, powerline/icon glyphs render as boxes until a re-measure is triggered.
    void document.fonts.load(`14px ${NERD_FONT_FAMILY}`).then(() => {
      if (active && termRef.current) {
        termRef.current.options.fontFamily = FULL_FONT_FAMILY
      }
    })

    termRef.current = term
    fitRef.current = fitAddon
    setTerminalPasteHandler(viewKey, data => term.paste(data))

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch (_: unknown) {
        // Ignore initial fit errors
      }
    })

    const dims = fitAddon.proposeDimensions()

    function applyExistingSessionResult(term: Terminal, result: Awaited<ReturnType<typeof window.terminal.attach>>) {
      const cursor = applyReattachData(term, result)
      if (cursor) attachCursorRef.current = cursor
      if (!result.alive) term.writeln('\r\n\x1b[90m[Process has exited]\x1b[0m')
    }

    async function handleExistingSession(term: Terminal, existingSessionId: string) {
      sessionIdRef.current = existingSessionId
      const result = await window.terminal.attach(existingSessionId)

      /* v8 ignore start */
      if (!active) return
      /* v8 ignore stop */

      if (!result.success) {
        removeSession(viewKey)
        /* v8 ignore start */
        if (!active) return
        /* v8 ignore stop */
        await spawnNew()
        return
      }

      applyExistingSessionResult(term, result)
    }

    async function initSession() {
      try {
        const existingSessionId = getSessionId(viewKey)

        if (existingSessionId) {
          await handleExistingSession(term, existingSessionId)
        } else {
          /* v8 ignore start */
          if (!active) return
          /* v8 ignore stop */
          await spawnNew()
        }
      } catch (error: unknown) {
        if (!active) return
        term.writeln('\r\n\x1b[31m[Failed to initialize terminal session]\x1b[0m')
        console.error('Failed to initialize terminal session', error)
      }
    }

    /* v8 ignore start -- only called from v8-ignored deactivation guard */
    function killOrphanedSession(result: { success: boolean; sessionId?: string }) {
      if (result.success && result.sessionId) {
        void window.terminal.kill(result.sessionId)
      }
    }
    /* v8 ignore stop */

    async function spawnNew() {
      const result = await window.terminal.spawn({
        cwd,
        ...resolveSpawnDimensions(dims),
        startupCommand,
      })

      // If deactivated while spawn was in flight, kill the orphaned PTY immediately
      if (!active) {
        /* v8 ignore start */
        killOrphanedSession(result)
        return
        /* v8 ignore stop */
      }

      if (!result.success || !result.sessionId) {
        term.writeln(
          `\r\n\x1b[31mFailed to spawn terminal: ${getSpawnErrorMessage(result.error)}\x1b[0m`
        )
        return
      }

      sessionIdRef.current = result.sessionId
      setSessionId(viewKey, result.sessionId)
      notifyCwdChange(result.cwd, onCwdChange)

      await applyAttachBuffer(term, result.sessionId)
    }

    async function applyAttachBuffer(term: Terminal, sid: string) {
      const attachResult = await window.terminal.attach(sid)
      /* v8 ignore start */
      if (!active) return
      /* v8 ignore stop */
      if (attachResult.success) {
        const cursor = applyReattachData(term, attachResult)
        if (cursor) attachCursorRef.current = cursor
      }
    }

    // Forward keystrokes via fire-and-forget (no OTel span per keystroke)
    const inputDisposable = term.onData((data: string) => {
      const sid = sessionIdRef.current
      if (sid) {
        window.terminal.write(sid, data)
      }
    })

    // Listen for PTY output — skip events already covered by the attach buffer
    const onData = (_event: unknown, sid: string, data: string, seq?: number) => {
      if (sid === sessionIdRef.current && termRef.current) {
        if (seq != null && seq <= attachCursorRef.current) return
        termRef.current.write(data)
      }
    }

    const onSessionExit = (_event: unknown, sid: string, exitCode: number) => {
      /* v8 ignore start */
      if (sid === sessionIdRef.current && termRef.current) {
        /* v8 ignore stop */
        termRef.current.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
        onExit?.(exitCode)
      }
    }

    /* v8 ignore start */
    const onCwdChanged = (_event: unknown, sid: string, newCwd: string) => {
      if (sid === sessionIdRef.current) {
        onCwdChange?.(newCwd)
        /* v8 ignore stop */
      }
    }

    // Defer data/exit listener registration until after initSession completes
    // so the attach buffer is fully replayed and attachCursorRef is set,
    // preventing duplicate output from racing IPC events.
    void (async () => {
      await initSession()
      if (!active) return
      window.ipcRenderer.on(IPC_PUSH.TERMINAL_DATA, onData)
      window.ipcRenderer.on(IPC_PUSH.TERMINAL_EXIT, onSessionExit)
      window.ipcRenderer.on(IPC_PUSH.TERMINAL_CWD_CHANGED, onCwdChanged)
    })()

    // Debounced resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const handleResize = () => {
      const fit = fitRef.current
      const sid = sessionIdRef.current
      /* v8 ignore start */
      if (!fit || !sid) return
      /* v8 ignore stop */
      try {
        fit.fit()
        applyResizeDimensions(fit, sid)
      } catch (_: unknown) {
        // Ignore
      }
    }
    function applyResizeDimensions(fit: FitAddon, sid: string) {
      const d = fit.proposeDimensions()
      /* v8 ignore start */
      if (!d) return
      if (!d.cols || !d.rows) return
      /* v8 ignore stop */
      if (!isDimensionChanged({ cols: d.cols, rows: d.rows }, lastResizeRef.current)) return
      lastResizeRef.current = { cols: d.cols, rows: d.rows }
      window.terminal.resize(sid, d.cols, d.rows)
    }
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(handleResize, 100)
    })
    resizeObserver.observe(container)

    return () => {
      active = false
      resizeObserver.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      cursorMoveDisposable.dispose()
      renderDisposable.dispose()
      inputDisposable.dispose()
      window.ipcRenderer.off(IPC_PUSH.TERMINAL_DATA, onData)
      window.ipcRenderer.off(IPC_PUSH.TERMINAL_EXIT, onSessionExit)
      window.ipcRenderer.off(IPC_PUSH.TERMINAL_CWD_CHANGED, onCwdChanged)

      // Do NOT kill PTY here — session survives tab switches.
      // PTY is killed only via killTerminalSession() on explicit tab close.
      removeTerminalPasteHandler(viewKey)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="terminal-pane">
      <div className="terminal-pane-body" ref={containerRef} />
    </div>
  )
}
