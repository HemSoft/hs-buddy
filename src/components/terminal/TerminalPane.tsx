import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getSessionId, setSessionId, removeSession } from './terminalSessions'
import '@xterm/xterm/css/xterm.css'
import './TerminalPane.css'

interface TerminalPaneProps {
  /** Unique key for this terminal view (used to persist session across tab switches) */
  viewKey: string
  cwd?: string
  startupCommand?: string
  onExit?: (exitCode: number) => void
}

export function TerminalPane({ viewKey, cwd, startupCommand, onExit }: TerminalPaneProps) {
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
    if (!container) return

    const NERD_FONT_FAMILY = "'CaskaydiaCove NFM', 'CaskaydiaCove NF', 'FiraCode Nerd Font Mono'"
    const FALLBACK_FAMILY = "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace"
    const FULL_FONT_FAMILY = `${NERD_FONT_FAMILY}, ${FALLBACK_FAMILY}`

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: FULL_FONT_FAMILY,
      theme: {
        background: '#1e1e1e',
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
    term.open(container)

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

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // Ignore initial fit errors
      }
    })

    const dims = fitAddon.proposeDimensions()

    async function initSession() {
      try {
        const existingSessionId = getSessionId(viewKey)

        if (existingSessionId) {
          // Reconnect to existing session (tab was switched away and back)
          sessionIdRef.current = existingSessionId
          const result = await window.terminal.attach(existingSessionId)

          if (!active) return

          if (result.success && result.buffer) {
            term.write(result.buffer)
          }
          if (result.success && result.cursor != null) {
            attachCursorRef.current = result.cursor
          }
          if (result.success && !result.alive) {
            term.writeln('\r\n\x1b[90m[Process has exited]\x1b[0m')
          }
          if (!result.success) {
            // Session was cleaned up — spawn fresh
            removeSession(viewKey)
            if (!active) return
            await spawnNew()
          }
        } else {
          if (!active) return
          await spawnNew()
        }
      } catch (error) {
        if (!active) return
        term.writeln('\r\n\x1b[31m[Failed to initialize terminal session]\x1b[0m')
        console.error('Failed to initialize terminal session', error)
      }
    }

    async function spawnNew() {
      const result = await window.terminal.spawn({
        cwd,
        cols: dims?.cols || 120,
        rows: dims?.rows || 30,
        startupCommand,
      })

      // If deactivated while spawn was in flight, kill the orphaned PTY immediately
      if (!active) {
        if (result.success && result.sessionId) {
          void window.terminal.kill(result.sessionId)
        }
        return
      }
      if (!result.success || !result.sessionId) {
        term.writeln(
          `\r\n\x1b[31mFailed to spawn terminal: ${result.error || 'Unknown error'}\x1b[0m`
        )
        return
      }
      sessionIdRef.current = result.sessionId
      setSessionId(viewKey, result.sessionId)

      // Flush any output that arrived before sessionIdRef was set
      const attachResult = await window.terminal.attach(result.sessionId)
      if (!active) return
      if (attachResult.success && attachResult.buffer) {
        term.write(attachResult.buffer)
      }
      if (attachResult.success && attachResult.cursor != null) {
        attachCursorRef.current = attachResult.cursor
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
      if (sid === sessionIdRef.current && termRef.current) {
        termRef.current.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
        onExit?.(exitCode)
      }
    }

    // Defer data/exit listener registration until after initSession completes
    // so the attach buffer is fully replayed and attachCursorRef is set,
    // preventing duplicate output from racing IPC events.
    void (async () => {
      await initSession()
      if (!active) return
      window.ipcRenderer.on('terminal:data', onData)
      window.ipcRenderer.on('terminal:exit', onSessionExit)
    })()

    // Debounced resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const fit = fitRef.current
        const sid = sessionIdRef.current
        if (!fit || !sid) return
        try {
          fit.fit()
          const d = fit.proposeDimensions()
          if (d?.cols && d?.rows) {
            const last = lastResizeRef.current
            if (!last || last.cols !== d.cols || last.rows !== d.rows) {
              lastResizeRef.current = { cols: d.cols, rows: d.rows }
              window.terminal.resize(sid, d.cols, d.rows)
            }
          }
        } catch {
          // Ignore
        }
      }, 100)
    })
    resizeObserver.observe(container)

    return () => {
      active = false
      resizeObserver.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      inputDisposable.dispose()
      window.ipcRenderer.off('terminal:data', onData)
      window.ipcRenderer.off('terminal:exit', onSessionExit)

      // Do NOT kill PTY here — session survives tab switches.
      // PTY is killed only via killTerminalSession() on explicit tab close.
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
