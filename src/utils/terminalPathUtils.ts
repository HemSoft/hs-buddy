/**
 * Terminal path and parsing helpers — pure functions extracted from
 * electron/ipc/terminalHandlers.ts for testability.
 */

import path from 'node:path'

/** Validates a GitHub-style slug (owner or repo name). */
export function isValidRepoSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)
}

/** Generates organization folder name candidates from the owner string. */
export function getOrgCandidates(owner: string): string[] {
  const candidates = new Set<string>()
  candidates.add(owner)
  const dashIdx = owner.indexOf('-')
  if (dashIdx > 0) {
    const short = owner.substring(0, dashIdx)
    candidates.add(short)
    candidates.add(short.charAt(0).toUpperCase() + short.slice(1))
  }
  candidates.add(owner.charAt(0).toUpperCase() + owner.slice(1))
  return [...candidates]
}

/**
 * Returns clone root directories for a given platform and home directory.
 * On Windows, probes common drive letters; on Unix, probes the drive root.
 */
export function getCloneRoots(platform: string, home: string): string[] {
  const driveRoot = path.parse(home).root
  const roots: string[] = []

  if (platform === 'win32') {
    for (const letter of ['C', 'D', 'E', 'F']) {
      roots.push(path.join(`${letter}:\\`, 'github'))
    }
  } else {
    roots.push(path.join(driveRoot, 'github'))
  }

  roots.push(
    path.join(home, 'github'),
    path.join(home, 'repos'),
    path.join(home, 'projects'),
    path.join(home, 'source', 'repos')
  )

  return roots
}

const MAX_OSC_BUFFER = 512

// eslint-disable-next-line no-control-regex -- intentional terminal escape sequences (OSC 7)
const OSC7_REGEX_PATTERN = /\x1b\]7;file:\/\/[^/]*(\/.*?)(?:\x07|\x1b\\)/g

/** Normalize an OSC 7 file path for the current OS (strips leading / on Windows drive paths). */
function normalizeOsc7Path(rawPath: string): string {
  return /^\/[A-Za-z]:/.test(rawPath) ? rawPath.slice(1) : rawPath
}

/** Find the last OSC 7 match in a buffer. */
function findLastOsc7Match(buffer: string): RegExpExecArray | null {
  const regex = new RegExp(OSC7_REGEX_PATTERN.source, OSC7_REGEX_PATTERN.flags)
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = regex.exec(buffer)) !== null) {
    lastMatch = match
  }
  return lastMatch
}

/**
 * Process OSC 7 CWD sequences from a terminal output buffer.
 *
 * Appends `chunk` to `prevBuffer`, caps at 512 chars, extracts the
 * last OSC 7 CWD path, and returns the remaining buffer for the next
 * call. This is the full buffer state machine extracted from
 * electron/ipc/terminalHandlers.ts `processOsc7()`.
 */
export function processOsc7Buffer(
  prevBuffer: string,
  chunk: string
): { cwd: string | null; remainingBuffer: string } {
  let buffer = prevBuffer + chunk

  if (buffer.length > MAX_OSC_BUFFER) {
    buffer = buffer.slice(-MAX_OSC_BUFFER)
  }

  const lastMatch = findLastOsc7Match(buffer)
  if (!lastMatch) {
    return { cwd: null, remainingBuffer: buffer }
  }

  const remainingBuffer = buffer.slice(lastMatch.index + lastMatch[0].length)

  try {
    const cwd = decodeURIComponent(normalizeOsc7Path(lastMatch[1]))
    return { cwd, remainingBuffer }
  } catch (_: unknown) {
    return { cwd: null, remainingBuffer }
  }
}

/** Build the terminal environment variables with defaults. */
function buildTerminalEnv(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  return {
    ...env,
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'hs-buddy',
    COLORFGBG: '15;0',
    WT_SESSION: env.WT_SESSION || 'b916bc1b-75a7-4c9a-8a38-6e8d06032505',
    WT_PROFILE_ID: env.WT_PROFILE_ID || '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
  }
}

/**
 * Build PTY spawn options from the given config.
 * Accepts platform as a parameter for testability.
 */
export function buildPtySpawnOptions(
  opts: { cols?: number; rows?: number },
  cwd: string,
  env: Record<string, string | undefined>,
  platform: string
): Record<string, unknown> {
  return {
    name: 'xterm-256color',
    cols: opts.cols || 120,
    rows: opts.rows || 30,
    cwd,
    env: buildTerminalEnv(env),
    ...(platform === 'win32' ? { useConpty: true } : {}),
  }
}

/**
 * Search within a single clone root for the repo directory.
 */
function findInRoot(
  root: string,
  orgCandidates: string[],
  repo: string,
  isValidDir: (dir: string) => boolean
): string | null {
  for (const org of orgCandidates) {
    const candidate = path.join(root, org, repo)
    if (isValidDir(candidate)) return candidate
  }
  const directCandidate = path.join(root, repo)
  return isValidDir(directCandidate) ? directCandidate : null
}

/**
 * Probe clone roots and org candidates to find a local repo directory.
 * Accepts a predicate for filesystem checks to keep this function pure.
 */
export function findRepoPath(
  cloneRoots: string[],
  orgCandidates: string[],
  repo: string,
  isValidDir: (dir: string) => boolean
): string | null {
  for (const root of cloneRoots) {
    if (!isValidDir(root)) continue
    const found = findInRoot(root, orgCandidates, repo, isValidDir)
    if (found) return found
  }
  return null
}

/** Build the PowerShell OSC 7 prompt-injection script. */
function buildPowerShellOsc7Setup(): string {
  return [
    '& { . $PROFILE } 2>$null',
    '$__hsb_op=$function:prompt',
    'function global:prompt{',
    '$e=[char]0x1b',
    "[Console]::Write(\"$e]7;file:///$($PWD.Path.Replace('\\','/'))$e\\\")",
    '& $__hsb_op',
    '}',
  ].join(';')
}

function isWindowsPowerShell(shell: string, platform: string): boolean {
  if (platform !== 'win32') return false
  const shellExecutable = path.win32.basename(shell).toLowerCase()
  return shellExecutable === 'pwsh.exe' || shellExecutable === 'powershell.exe'
}

/**
 * Build shell args for the terminal.
 *
 * PowerShell startup customization is intentionally not passed on the process
 * command line because Windows application-control policies can reject the
 * encoded command with error code 5. It is sent after spawn instead.
 */
export function buildTerminalShellArgs(shell: string, platform: string): string[] {
  if (isWindowsPowerShell(shell, platform)) return ['-NoLogo', '-NoExit']
  return []
}

/** Build the PowerShell prompt customization that is sent after the PTY launches. */
export function buildTerminalStartupCommand(shell: string, platform: string): string | undefined {
  return isWindowsPowerShell(shell, platform) ? buildPowerShellOsc7Setup() : undefined
}
