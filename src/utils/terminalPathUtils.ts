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

function trimOsc7Buffer(buffer: string): string {
  return buffer.length > MAX_OSC_BUFFER ? buffer.slice(-MAX_OSC_BUFFER) : buffer
}

function findLastOsc7Match(buffer: string): RegExpExecArray | null {
  // eslint-disable-next-line no-control-regex -- intentional terminal escape sequences (OSC 7)
  const osc7Regex = /\x1b\]7;file:\/\/[^/]*(\/.*?)(?:\x07|\x1b\\)/g
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = osc7Regex.exec(buffer)) !== null) {
    lastMatch = match
  }
  return lastMatch
}

function normalizeOsc7Path(rawPath: string): string {
  return /^\/[A-Za-z]:/.test(rawPath) ? rawPath.slice(1) : rawPath
}

function decodeOsc7Path(rawPath: string): string | null {
  try {
    return decodeURIComponent(normalizeOsc7Path(rawPath))
  } catch (_: unknown) {
    return null
  }
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
  const buffer = trimOsc7Buffer(prevBuffer + chunk)
  const lastMatch = findLastOsc7Match(buffer)

  if (!lastMatch) {
    return { cwd: null, remainingBuffer: buffer }
  }

  const remainingBuffer = buffer.slice(lastMatch.index + lastMatch[0].length)
  return { cwd: decodeOsc7Path(lastMatch[1]), remainingBuffer }
}

function resolveTerminalNumericOption(value: number | undefined, fallback: number): number {
  return value || fallback
}

function resolveTerminalEnvValue(value: string | undefined, fallback: string): string {
  return value || fallback
}

function buildTerminalEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...env,
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'hs-buddy',
    COLORFGBG: '15;0',
    WT_SESSION: resolveTerminalEnvValue(env.WT_SESSION, 'b916bc1b-75a7-4c9a-8a38-6e8d06032505'),
    WT_PROFILE_ID: resolveTerminalEnvValue(env.WT_PROFILE_ID, '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}'),
  }
}

function getPlatformPtyOptions(platform: string): Record<string, unknown> {
  return platform === 'win32' ? { useConpty: true } : {}
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
    cols: resolveTerminalNumericOption(opts.cols, 120),
    rows: resolveTerminalNumericOption(opts.rows, 30),
    cwd,
    env: buildTerminalEnv(env),
    ...getPlatformPtyOptions(platform),
  }
}

function findDirectRepoPath(
  root: string,
  repo: string,
  isValidDir: (dir: string) => boolean
): string | null {
  const directCandidate = path.join(root, repo)
  return isValidDir(directCandidate) ? directCandidate : null
}

function findRepoPathInRoot(
  root: string,
  orgCandidates: string[],
  repo: string,
  isValidDir: (dir: string) => boolean
): string | null {
  if (!isValidDir(root)) return null

  for (const org of orgCandidates) {
    const candidate = path.join(root, org, repo)
    if (isValidDir(candidate)) return candidate
  }

  return findDirectRepoPath(root, repo, isValidDir)
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
    const repoPath = findRepoPathInRoot(root, orgCandidates, repo, isValidDir)
    if (repoPath) return repoPath
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

/**
 * Build shell args for the terminal. For Windows PowerShell, generates
 * an encoded command that injects OSC 7 CWD reporting into the prompt.
 */
export function buildTerminalShellArgs(shell: string, platform: string): string[] {
  if (platform === 'win32' && (shell === 'pwsh.exe' || shell === 'powershell.exe')) {
    const osc7Setup = buildPowerShellOsc7Setup()
    const encoded = Buffer.from(osc7Setup, 'utf16le').toString('base64')
    return ['-NoLogo', '-NoExit', '-EncodedCommand', encoded]
  }
  return []
}
