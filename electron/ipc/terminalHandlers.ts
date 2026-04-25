import { type BrowserWindow, ipcMain, app, type WebContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// node-pty is a native CJS module — use createRequire for ESM compatibility.
// IMPORTANT: Load eagerly at module scope so it happens BEFORE OpenTelemetry's
// require-in-the-middle hook patches Module.prototype.require in initTelemetry().
const _require = createRequire(import.meta.url)

let _pty: typeof import('node-pty') | null = null
let _ptyLoadError: unknown = null

try {
  // Monkey-patch node-pty's loadNativeModule BEFORE the first spawn().
  // On Windows, node-pty defers native module loading: WindowsPtyAgent's
  // constructor lazily calls loadNativeModule('conpty'), which uses the CJS
  // `require()` local to utils.js. OpenTelemetry's require-in-the-middle hook
  // replaces Module.prototype.require, which can cause that local `require`
  // to throw "ReferenceError: require is not defined" for native .node files.
  // Fix: replace loadNativeModule with a version that uses our own _require
  // (from createRequire) with an absolute path — immune to OTEL interference.
  const ptyUtils = _require('node-pty/lib/utils') as {
    loadNativeModule: (name: string) => { dir: string; module: unknown }
  }
  const origLoadNative = ptyUtils.loadNativeModule
  const ptyRoot = path.dirname(_require.resolve('node-pty/package.json'))

  ptyUtils.loadNativeModule = function (name: string) {
    // Try the original first — it works fine outside of OTEL interference.
    try {
      return origLoadNative(name)
    } catch {
      // Fallback: use process.dlopen() to load the native addon directly,
      // bypassing Module.prototype.require entirely. This is immune to
      // OTEL's require-in-the-middle hook interference.
      const nativePath = path.join(
        ptyRoot,
        'prebuilds',
        `${process.platform}-${process.arch}`,
        `${name}.node`
      )
      const nativeModule = { exports: {} } as { exports: Record<string, unknown> }
      process.dlopen(nativeModule, nativePath)
      return { dir: path.dirname(nativePath), module: nativeModule.exports }
    }
  }

  _pty = _require('node-pty')
} catch (err) {
  _ptyLoadError = err
}

function getPty(): typeof import('node-pty') {
  if (_pty) return _pty
  throw _ptyLoadError ?? new Error('node-pty failed to load (unknown reason)')
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
  /** Buffer for partial OSC 7 sequences split across data chunks */
  oscBuffer: string
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

/** Returns the list of clone root directories to probe (handles Windows drive letters vs Unix). */
function getCloneRoots(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || app.getPath('home')
  const driveRoot = path.parse(home).root // e.g. D:\ on Windows, / on Unix
  const roots: string[] = []

  // On Windows, probe common fixed drives for a top-level github folder
  if (process.platform === 'win32') {
    for (const letter of ['C', 'D', 'E', 'F']) {
      roots.push(path.join(`${letter}:\\`, 'github'))
    }
  } else {
    roots.push(path.join(driveRoot, 'github'))
  }

  roots.push(
    path.join(home, 'github'), // e.g. C:\Users\User\github or ~/github
    path.join(home, 'repos'),
    path.join(home, 'projects'),
    path.join(home, 'source', 'repos') // Visual Studio default
  )

  return roots
}

/** Generates organization folder name candidates from the owner string. */
function getOrgCandidates(owner: string): string[] {
  const candidates = new Set<string>()
  candidates.add(owner) // exact: relias-engineering
  const dashIdx = owner.indexOf('-')
  if (dashIdx > 0) {
    const short = owner.substring(0, dashIdx)
    candidates.add(short) // short: relias
    candidates.add(short.charAt(0).toUpperCase() + short.slice(1)) // capitalized: Relias
  }
  candidates.add(owner.charAt(0).toUpperCase() + owner.slice(1)) // capitalized full: Relias-engineering
  return [...candidates]
}

/**
 * Resolve a GitHub owner/repo to a local clone directory.
 * Probes common directory patterns under well-known clone roots.
 */
function resolveRepoPath(owner: string, repo: string): string | null {
  const cloneRoots = getCloneRoots()
  const orgCandidates = getOrgCandidates(owner)

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

/** Builds shell args. For Windows PowerShell, generates OSC 7 setup via encoded command. */
function buildShellArgs(shell: string): string[] {
  if (process.platform === 'win32' && (shell === 'pwsh.exe' || shell === 'powershell.exe')) {
    // Wrap the default prompt to emit OSC 7 (invisible escape sequence).
    // Uses -EncodedCommand to avoid quoting issues.
    // Loads the user profile first so custom prompts are preserved.
    const osc7Setup = [
      '& { . $PROFILE } 2>$null',
      '$__hsb_op=$function:prompt',
      'function global:prompt{',
      '$e=[char]0x1b',
      "[Console]::Write(\"$e]7;file:///$($PWD.Path.Replace('\\','/'))$e\\\")",
      '& $__hsb_op',
      '}',
    ].join(';')
    const encoded = Buffer.from(osc7Setup, 'utf16le').toString('base64')
    return ['-NoLogo', '-NoExit', '-EncodedCommand', encoded]
  }
  return []
}

/** Detects OSC 7 CWD sequences in PTY output and updates session.cwd. */
function processOsc7(session: TerminalSession, data: string): void {
  session.oscBuffer += data
  // Only keep last 512 chars to avoid unbounded growth
  if (session.oscBuffer.length > 512) {
    session.oscBuffer = session.oscBuffer.slice(-512)
  }
  // eslint-disable-next-line no-control-regex -- intentional terminal escape sequences (OSC 7)
  const osc7Regex = /\x1b\]7;file:\/\/[^/]*\/(.*?)(?:\x07|\x1b\\)/g
  let lastOsc7: RegExpExecArray | null = null
  let osc7Match: RegExpExecArray | null
  while ((osc7Match = osc7Regex.exec(session.oscBuffer)) !== null) {
    lastOsc7 = osc7Match
  }
  if (lastOsc7) {
    // Clear buffer up to end of last match to prevent re-processing
    session.oscBuffer = session.oscBuffer.slice(lastOsc7.index + lastOsc7[0].length)
    const decoded = decodeURIComponent(lastOsc7[1])
    const newCwd = path.resolve(decoded)
    if (newCwd !== session.cwd) {
      session.cwd = newCwd
      safeSend(session.sender, 'terminal:cwd-changed', session.id, newCwd)
    }
  }
}

function createTerminalSession(
  sessionId: string,
  ptyProcess: ReturnType<ReturnType<typeof getPty>['spawn']>,
  cwd: string,
  sender: WebContents
): TerminalSession {
  const session: TerminalSession = {
    id: sessionId,
    pty: ptyProcess,
    cwd,
    outputBuffer: '',
    outputSeq: 0,
    alive: true,
    disposables: [],
    sender,
    oscBuffer: '',
  }
  sessions.set(sessionId, session)

  const dataDisposable = ptyProcess.onData((data: string) => {
    session.outputBuffer += data
    if (session.outputBuffer.length > MAX_SCROLLBACK_BUFFER) {
      session.outputBuffer = session.outputBuffer.slice(-MAX_SCROLLBACK_BUFFER)
    }
    session.outputSeq++
    safeSend(session.sender, 'terminal:data', sessionId, data, session.outputSeq)
    processOsc7(session, data)
  })

  const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const s = sessions.get(sessionId)
    if (s) s.alive = false
    safeSend(session.sender, 'terminal:exit', sessionId, exitCode)
  })

  session.disposables.push(dataDisposable, exitDisposable)
  return session
}

function scheduleStartupCommand(sessionId: string, startupCommand: string): void {
  const session = sessions.get(sessionId)
  if (!session) return
  session.startupTimer = setTimeout(() => {
    const s = sessions.get(sessionId)
    if (!s?.alive) return
    try {
      s.pty.write(startupCommand + '\r')
    } catch {
      // PTY died between alive check and write — ignore
    }
  }, 500)
}

function resolveSpawnShell(): { shell: string; shellArgs: string[] } {
  const isWindows = process.platform === 'win32'
  const shell = isWindows ? resolveWindowsShell() : process.env.SHELL || '/bin/bash'
  return { shell, shellArgs: buildShellArgs(shell) }
}

function resolveDefaultCwd(): string {
  const isWindows = process.platform === 'win32'
  return isWindows ? process.env.USERPROFILE || 'C:\\' : process.env.HOME || app.getPath('home')
}

function buildSpawnOptions(
  opts: { cols?: number; rows?: number },
  cwd: string
): Record<string, unknown> {
  return {
    name: 'xterm-256color',
    cols: opts.cols || 120,
    rows: opts.rows || 30,
    cwd,
    env: { ...process.env },
    ...(process.platform === 'win32' ? { useConpty: true } : {}),
  }
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
      const defaultCwd = resolveDefaultCwd()
      const cwd = opts.cwd && isValidCwd(opts.cwd) ? path.resolve(opts.cwd) : defaultCwd
      const sessionId = randomUUID()

      const { shell, shellArgs } = resolveSpawnShell()
      const spawnOptions = buildSpawnOptions(opts, cwd)

      let ptyProcess
      try {
        ptyProcess = getPty().spawn(shell, shellArgs, spawnOptions)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to spawn terminal',
        }
      }

      createTerminalSession(sessionId, ptyProcess, cwd, event.sender)

      if (opts.startupCommand) {
        scheduleStartupCommand(sessionId, opts.startupCommand)
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
