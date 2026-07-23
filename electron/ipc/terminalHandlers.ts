import { ipcMain, app, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  isValidRepoSlug,
  getCloneRoots,
  getOrgCandidates,
  processOsc7Buffer,
  buildTerminalShellArgs,
  buildTerminalStartupCommand,
  buildPtySpawnOptions,
  findRepoPath,
} from '../../src/utils/terminalPathUtils'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'
import { IPC_INVOKE, IPC_SEND, IPC_PUSH } from '../../src/ipc/contracts'

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
    } catch (_: unknown) {
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
} catch (err: unknown) {
  _ptyLoadError = err
}

function getPty(): typeof import('node-pty') {
  if (_pty) return _pty
  throw _ptyLoadError ?? new Error('node-pty failed to load (unknown reason)')
}

const MAX_SCROLLBACK_BUFFER = 100_000

const executablePathCache = new Map<string, string | null>()

function resolveExecutableOnPath(executable: string): string | null {
  const pathValue = process.env.PATH ?? ''
  const cacheKey = `${executable}\0${pathValue}`
  const cached = executablePathCache.get(cacheKey)
  if (cached !== undefined) return cached

  if (!pathValue) {
    executablePathCache.set(cacheKey, null)
    return null
  }

  for (const rawDirectory of pathValue.split(path.delimiter)) {
    const directory = rawDirectory.trim().replace(/^"(.*)"$/, '$1')
    if (!directory) continue

    const candidate = path.win32.resolve(directory, executable)
    try {
      if (!existsSync(candidate) || !statSync(candidate).isFile()) continue
      accessSync(candidate, constants.X_OK)
      executablePathCache.set(cacheKey, candidate)
      return candidate
    } catch (_: unknown) {
      // Keep searching: a PATH entry can exist but be inaccessible or not executable.
    }
  }

  executablePathCache.set(cacheKey, null)
  return null
}

/** Resolve the best available PowerShell executable on Windows.
 *  Prefers pwsh.exe (PowerShell 7+), falls back to powershell.exe (Windows PowerShell 5.x). */
function resolveWindowsShell(): string {
  return (
    resolveExecutableOnPath('pwsh.exe') ??
    resolveExecutableOnPath('powershell.exe') ??
    path.win32.join(
      process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  )
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

interface CwdAccess {
  exists: boolean
  accessible: boolean
}

function inspectCwdAccess(dir: string): CwdAccess {
  let exists = false
  try {
    const resolved = path.resolve(dir)
    exists = existsSync(resolved)
    if (!exists || !statSync(resolved).isDirectory()) {
      return { exists, accessible: false }
    }
    accessSync(resolved, constants.R_OK)
    return { exists: true, accessible: true }
  } catch (_: unknown) {
    return { exists, accessible: false }
  }
}

function isValidCwd(dir: string): boolean {
  const access = inspectCwdAccess(dir)
  return access.exists && access.accessible
}

/** Safely send IPC to the renderer — guards against destroyed webContents */
function safeSend(sender: WebContents, channel: string, ...args: unknown[]): void {
  try {
    if (!sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch (_: unknown) {
    // WebContents was torn down between check — ignore
  }
}

/** Returns the list of clone root directories to probe (handles Windows drive letters vs Unix). */
function getCloneRootsLocal(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || app.getPath('home')
  return getCloneRoots(process.platform, home)
}

/**
 * Resolve a GitHub owner/repo to a local clone directory.
 * Probes common directory patterns under well-known clone roots.
 */
function resolveRepoPath(owner: string, repo: string): string | null {
  const cloneRoots = getCloneRootsLocal()
  const orgCandidates = getOrgCandidates(owner)
  return findRepoPath(cloneRoots, orgCandidates, repo, isValidCwd)
}

/** Builds shell args. For Windows PowerShell, generates OSC 7 setup via encoded command. */
function buildShellArgs(shell: string): string[] {
  return buildTerminalShellArgs(shell, process.platform)
}

/** Detects OSC 7 CWD sequences in PTY output and updates session.cwd. */
function processOsc7(session: TerminalSession, data: string): void {
  const { cwd, remainingBuffer } = processOsc7Buffer(session.oscBuffer, data)
  session.oscBuffer = remainingBuffer

  if (cwd) {
    const newCwd = path.resolve(cwd)
    if (newCwd !== session.cwd) {
      session.cwd = newCwd
      safeSend(session.sender, IPC_PUSH.TERMINAL_CWD_CHANGED, session.id, newCwd)
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
    safeSend(session.sender, IPC_PUSH.TERMINAL_DATA, sessionId, data, session.outputSeq)
    processOsc7(session, data)
  })

  const exitDisposable = ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const s = sessions.get(sessionId)
    if (s) s.alive = false
    safeSend(session.sender, IPC_PUSH.TERMINAL_EXIT, sessionId, exitCode)
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
    } catch (_: unknown) {
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
  return buildPtySpawnOptions(
    opts,
    cwd,
    process.env as Record<string, string | undefined>,
    process.platform
  )
}

/** Idempotent cleanup: clear timer → dispose listeners → kill PTY. */
function cleanupTerminalSession(session: TerminalSession): void {
  if (session.startupTimer) clearTimeout(session.startupTimer)
  for (const d of session.disposables) {
    try {
      d.dispose()
    } catch (_: unknown) {
      /* already disposed */
    }
  }
  try {
    session.pty.kill()
  } catch (_: unknown) {
    /* already dead */
  }
}

function handleResolveRepoPath(_event: unknown, opts: unknown) {
  if (!opts || typeof opts !== 'object') return { path: null }
  const { owner, repo } = opts as { owner?: unknown; repo?: unknown }
  if (!isValidRepoSlug(owner) || !isValidRepoSlug(repo)) return { path: null }
  return { path: resolveRepoPath(owner, repo) }
}

interface ParsedSpawnOpts {
  cwd: string
  cwdAccess: CwdAccess
  cwdFallback: boolean
  cols: number | undefined
  rows: number | undefined
  startupCommand: string | undefined
}

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function parseValidCwd(
  cwdField: unknown
): Pick<ParsedSpawnOpts, 'cwd' | 'cwdAccess' | 'cwdFallback'> {
  if (typeof cwdField !== 'string') {
    const cwd = resolveDefaultCwd()
    return { cwd, cwdAccess: inspectCwdAccess(cwd), cwdFallback: false }
  }

  const cwdAccess = inspectCwdAccess(cwdField)
  return cwdAccess.exists && cwdAccess.accessible
    ? { cwd: path.resolve(cwdField), cwdAccess, cwdFallback: false }
    : { cwd: resolveDefaultCwd(), cwdAccess, cwdFallback: true }
}

function parseNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseSpawnOpts(rawOpts: unknown): ParsedSpawnOpts {
  const opts = asObject(rawOpts)
  const { cwd, cwdAccess, cwdFallback } = parseValidCwd(opts.cwd)
  const cols = typeof opts.cols === 'number' ? opts.cols : undefined
  const rows = typeof opts.rows === 'number' ? opts.rows : undefined
  const startupCommand = parseNonEmptyString(opts.startupCommand)
  return { cwd, cwdAccess, cwdFallback, cols, rows, startupCommand }
}

async function handleSpawn(event: { sender: WebContents }, rawOpts: unknown) {
  const { cwd, cwdAccess, cwdFallback, cols, rows, startupCommand } = parseSpawnOpts(rawOpts)
  const sessionId = randomUUID()

  const { shell, shellArgs } = resolveSpawnShell()
  const shellStartupCommand = buildTerminalStartupCommand(shell, process.platform)
  const spawnOptions = buildSpawnOptions({ cols, rows }, cwd)

  let ptyProcess
  let launchStage = 'native-pty-load'
  try {
    const pty = getPty()
    launchStage = 'native-pty-spawn'
    ptyProcess = pty.spawn(shell, shellArgs, spawnOptions)
  } catch (error: unknown) {
    const effectiveCwdAccess = inspectCwdAccess(cwd)
    const message = getErrorMessageWithFallback(error, 'Failed to spawn terminal')
    return {
      success: false,
      error:
        `${message} ` +
        `[stage=${launchStage}; shell=${shell}; ` +
        `cwdExists=${cwdAccess.exists}; cwdAccessible=${cwdAccess.accessible}; ` +
        `cwdFallback=${cwdFallback}; effectiveCwdExists=${effectiveCwdAccess.exists}; ` +
        `effectiveCwdAccessible=${effectiveCwdAccess.accessible}]`,
    }
  }

  createTerminalSession(sessionId, ptyProcess, cwd, event.sender)

  const startupCommands = [shellStartupCommand, startupCommand].filter(
    (command): command is string => command !== undefined
  )
  if (startupCommands.length > 0) {
    scheduleStartupCommand(sessionId, startupCommands.join(';'))
  }

  return { success: true, sessionId, cwd }
}

async function handleAttach(event: { sender: WebContents }, sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return { success: false, error: 'Session not found' }
  session.sender = event.sender
  return {
    success: true,
    buffer: session.outputBuffer,
    cursor: session.outputSeq,
    alive: session.alive,
  }
}

async function handleKill(_event: unknown, sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return { success: false, error: 'Session not found' }
  cleanupTerminalSession(session)
  sessions.delete(sessionId)
  return { success: true }
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(IPC_INVOKE.TERMINAL_RESOLVE_REPO_PATH, handleResolveRepoPath)
  ipcMain.handle(IPC_INVOKE.TERMINAL_SPAWN, handleSpawn)
  ipcMain.handle(IPC_INVOKE.TERMINAL_ATTACH, handleAttach)
  ipcMain.handle(IPC_INVOKE.TERMINAL_KILL, handleKill)

  ipcMain.on(IPC_SEND.TERMINAL_WRITE, (_event, sessionId: string, data: string) => {
    const session = sessions.get(sessionId)
    if (session?.alive) session.pty.write(data)
  })

  ipcMain.on(IPC_SEND.TERMINAL_RESIZE, (_event, sessionId: string, cols: number, rows: number) => {
    const session = sessions.get(sessionId)
    if (!session?.alive) return
    try {
      session.pty.resize(cols, rows)
    } catch (_: unknown) {
      // PTY may be dead
    }
  })

  app.on('before-quit', () => {
    for (const [id, session] of sessions) {
      cleanupTerminalSession(session)
      sessions.delete(id)
    }
  })
}
