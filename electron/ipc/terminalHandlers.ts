import { type BrowserWindow, ipcMain, app, type WebContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// node-pty is a native CJS module — use createRequire for ESM compatibility.
// Load lazily to provide a clear error if the native module can't be found.
const _require = createRequire(import.meta.url)
let _pty: typeof import('node-pty') | null = null

function getPty(): typeof import('node-pty') {
  if (_pty) return _pty

  try {
    _pty = _require('node-pty')
  } catch (primaryError) {
    // Fallback: try requiring from the app root (handles cases where
    // import.meta.url points to a bundled file in dist-electron/).
    try {
      const appRequire = createRequire(path.join(app.getAppPath(), 'package.json'))
      _pty = appRequire('node-pty')
    } catch {
      throw primaryError
    }
  }

  return _pty!
}

const MAX_SCROLLBACK_BUFFER = 100_000

/** Resolve the best available PowerShell executable on Windows.
 *  Prefers pwsh.exe (PowerShell 7+), falls back to powershell.exe (Windows PowerShell 5.x). */
function resolveWindowsShell(): string {
  try {
    execFileSync('where.exe', ['pwsh.exe'], { stdio: 'ignore' })
    return 'pwsh.exe'
  } catch {
    return 'powershell.exe'
  }
}

interface PtyDisposable {
  dispose(): void
}

interface TerminalSession {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pty: any
  cwd: string
  /** Buffered output so tab switches don't lose history */
  outputBuffer: string
  /** Monotonic cursor — increments with each data chunk so attach can de-dupe */
  outputSeq: number
  alive: boolean
  /** Disposables for onData/onExit listeners — disposed on kill/quit */
  disposables: PtyDisposable[]
  /** WebContents that spawned this session — output is routed here, not to a captured window */
  sender: WebContents
  /** Timer for delayed startup command — cleared on kill to prevent writing to a dead PTY */
  startupTimer?: ReturnType<typeof setTimeout>
}

const sessions = new Map<string, TerminalSession>()

function isValidCwd(dir: string): boolean {
  try {
    const resolved = path.resolve(dir)
    return existsSync(resolved) && statSync(resolved).isDirectory()
  } catch {
    return false
  }
}

/** Safely send IPC to the renderer — guards against destroyed webContents */
function safeSend(sender: WebContents, channel: string, ...args: unknown[]): void {
  try {
    if (!sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch {
    // WebContents was torn down between check — ignore
  }
}

/**
 * Resolve a GitHub owner/repo to a local clone directory.
 * Probes common directory patterns under well-known clone roots.
 */
function resolveRepoPath(owner: string, repo: string): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || app.getPath('home')
  const driveRoot = path.parse(home).root // e.g. D:\ on Windows, / on Unix
  const cloneRoots: string[] = []

  // On Windows, probe common fixed drives for a top-level github folder
  if (process.platform === 'win32') {
    for (const letter of ['C', 'D', 'E', 'F']) {
      cloneRoots.push(path.join(`${letter}:\\`, 'github'))
    }
  } else {
    cloneRoots.push(path.join(driveRoot, 'github'))
  }

  cloneRoots.push(
    path.join(home, 'github'), // e.g. C:\Users\User\github or ~/github
    path.join(home, 'repos'),
    path.join(home, 'projects'),
    path.join(home, 'source', 'repos') // Visual Studio default
  )

  // Generate org-folder candidates from the GitHub owner name
  const orgCandidates = new Set<string>()
  orgCandidates.add(owner) // exact: relias-engineering
  const dashIdx = owner.indexOf('-')
  if (dashIdx > 0) {
    const short = owner.substring(0, dashIdx)
    orgCandidates.add(short) // short: relias
    orgCandidates.add(short.charAt(0).toUpperCase() + short.slice(1)) // capitalized: Relias
  }
  orgCandidates.add(owner.charAt(0).toUpperCase() + owner.slice(1)) // capitalized full: Relias-engineering

  for (const root of cloneRoots) {
    if (!existsSync(root)) continue

    for (const org of orgCandidates) {
      const candidate = path.join(root, org, repo)
      if (isValidCwd(candidate)) return candidate
    }

    // Also check root/repo directly (no org subfolder)
    const directCandidate = path.join(root, repo)
    if (isValidCwd(directCandidate)) return directCandidate
  }

  return null
}

function isValidRepoSlug(value: unknown): value is string {
  // Require alphanumeric first char (matches GitHub naming rules) which
  // naturally rejects ".", "..", and names starting with "-" or "_".
  return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)
}

export function registerTerminalHandlers(_win: BrowserWindow): void {
  // Resolve owner/repo to a local directory path
  ipcMain.handle('terminal:resolve-repo-path', async (_event, opts: unknown) => {
    if (!opts || typeof opts !== 'object') return { path: null }
    const { owner, repo } = opts as { owner?: unknown; repo?: unknown }
    if (!isValidRepoSlug(owner) || !isValidRepoSlug(repo)) return { path: null }
    const resolved = resolveRepoPath(owner, repo)
    return { path: resolved }
  })

  ipcMain.handle(
    'terminal:spawn',
    async (
      event,
      opts: { cwd?: string; cols?: number; rows?: number; startupCommand?: string }
    ) => {
      const isWindows = process.platform === 'win32'
      const defaultCwd = isWindows
        ? process.env.USERPROFILE || 'C:\\'
        : process.env.HOME || app.getPath('home')
      const cwd = opts.cwd && isValidCwd(opts.cwd) ? path.resolve(opts.cwd) : defaultCwd
      const sessionId = randomUUID()

      const shell = isWindows ? resolveWindowsShell() : process.env.SHELL || '/bin/bash'
      const spawnOptions = {
        name: 'xterm-256color',
        cols: opts.cols || 120,
        rows: opts.rows || 30,
        cwd,
        env: { ...process.env },
        ...(isWindows ? { useConpty: true } : {}),
      }

      let ptyProcess
      try {
        ptyProcess = getPty().spawn(shell, [], spawnOptions)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to spawn terminal',
        }
      }

      const session: TerminalSession = {
        id: sessionId,
        pty: ptyProcess,
        cwd,
        outputBuffer: '',
        outputSeq: 0,
        alive: true,
        disposables: [],
        sender: event.sender,
      }
      sessions.set(sessionId, session)

      // Forward PTY output to the renderer and buffer it
      const dataDisposable = ptyProcess.onData((data: string) => {
        session.outputBuffer += data
        // Cap buffer size to prevent memory bloat
        if (session.outputBuffer.length > MAX_SCROLLBACK_BUFFER) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_SCROLLBACK_BUFFER)
        }
        session.outputSeq++
        safeSend(session.sender, 'terminal:data', sessionId, data, session.outputSeq)
      })

      const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        const s = sessions.get(sessionId)
        if (s) s.alive = false
        safeSend(session.sender, 'terminal:exit', sessionId, exitCode)
      })

      session.disposables.push(dataDisposable, exitDisposable)

      // Send startup command after a brief delay for shell initialization
      if (opts.startupCommand) {
        session.startupTimer = setTimeout(() => {
          const s = sessions.get(sessionId)
          if (!s?.alive) return
          try {
            s.pty.write(opts.startupCommand + '\r')
          } catch {
            // PTY died between alive check and write — ignore
          }
        }, 500)
      }

      return { success: true, sessionId, cwd }
    }
  )

  // Reconnect to an existing session (e.g. after tab switch re-mount)
  ipcMain.handle('terminal:attach', async (event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }
    // Update sender so live PTY output routes to the current renderer
    // (handles renderer reload / WebContents replacement)
    session.sender = event.sender
    return {
      success: true,
      buffer: session.outputBuffer,
      cursor: session.outputSeq,
      alive: session.alive,
    }
  })

  // Fire-and-forget: high-frequency keystroke forwarding (no OTel span noise)
  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    const session = sessions.get(sessionId)
    if (session?.alive) session.pty.write(data)
  })

  // Fire-and-forget: resize
  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    const session = sessions.get(sessionId)
    if (!session?.alive) return
    try {
      session.pty.resize(cols, rows)
    } catch {
      // PTY may be dead
    }
  })

  ipcMain.handle('terminal:kill', async (_event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }
    if (session.startupTimer) clearTimeout(session.startupTimer)
    for (const d of session.disposables) {
      try {
        d.dispose()
      } catch {
        // Already disposed
      }
    }
    try {
      session.pty.kill()
    } catch {
      // Already dead
    }
    sessions.delete(sessionId)
    return { success: true }
  })

  // Clean up all PTY sessions on app quit
  app.on('before-quit', () => {
    for (const [id, session] of sessions) {
      if (session.startupTimer) clearTimeout(session.startupTimer)
      for (const d of session.disposables) {
        try {
          d.dispose()
        } catch {
          // Already disposed
        }
      }
      try {
        session.pty.kill()
      } catch {
        // PTY may already be dead
      }
      sessions.delete(id)
    }
  })
}
